import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleLlm, type LlmDeps } from './llm';
import type { AuditInput } from '../src/shared/domain/privacy';

// Regression coverage for the B0 authorization bypass: a forged `Authorization: Bearer
// <anything>` used to reach the paid `ping` action. The fix verifies the Supabase token
// before action dispatch. These tests prove that every invalid-token shape returns 401 and
// that the OpenRouter fetch is NEVER called on rejection.

// --- Minimal VercelRequest/VercelResponse doubles -------------------------------------------

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  chunks: string[];
  ended: boolean;
  setHeader(key: string, value: string): void;
  status(code: number): MockRes;
  json(payload: unknown): MockRes;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders(): void;
}

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    headers: {},
    body: undefined,
    chunks: [],
    ended: false,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    write(chunk) {
      this.chunks.push(String(chunk));
      return true;
    },
    end() {
      this.ended = true;
    },
    flushHeaders() {},
  };
  return res;
}

function mockReq(authHeader: string | undefined, body: unknown, headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: {
      ...headers,
      ...(authHeader === undefined ? {} : { authorization: authHeader }),
    },
    body,
  } as never;
}

// A fetch spy that records calls. Never returns a real network response; if these tests ever
// see it invoked on a rejected token, the auth boundary has regressed.
function spyFetch() {
  let calls = 0;
  const impl = (async () => {
    calls += 1;
    return new Response('should-not-be-called', { status: 200 });
  }) as unknown as typeof fetch;
  return {
    impl,
    get calls() {
      return calls;
    },
  };
}

const VALID_USER = 'user-uuid-123';

function deps(over: Partial<LlmDeps>): LlmDeps {
  return {
    verifyToken: async () => null,
    fetchImpl: spyFetch().impl,
    writeAudit: async () => ({ ok: true, error: null, id: 'audit-1' }),
    updateAuditCost: async () => {},
    ...over,
  };
}

// Each named rejection case maps to verifyToken returning null (the auth server rejected the
// token) or no usable token at all. We exercise the PAID `ping` action so a bypass would be
// observable as a provider fetch.
const REJECTION_CASES: Array<{ name: string; auth: string | undefined; verifyReturns: string | null }> = [
  { name: 'missing token (no Authorization header)', auth: undefined, verifyReturns: null },
  { name: 'malformed header (no bearer scheme)', auth: 'definitely-not-a-session', verifyReturns: null },
  { name: 'malformed header (bearer prefix, empty token)', auth: 'Bearer   ', verifyReturns: null },
  { name: 'forged token', auth: 'Bearer definitely-not-a-session', verifyReturns: null },
  { name: 'expired token', auth: 'Bearer eyJexpired.token.value', verifyReturns: null },
  { name: 'wrong-project token', auth: 'Bearer eyJwrong.project.token', verifyReturns: null },
];

for (const c of REJECTION_CASES) {
  test(`ping rejected (401, no provider fetch): ${c.name}`, async () => {
    const fetchSpy = spyFetch();
    let verifyCalled = 0;
    const res = mockRes();
    await handleLlm(
      mockReq(c.auth, { action: 'ping' }),
      res as never,
      deps({
        verifyToken: async () => {
          verifyCalled += 1;
          return c.verifyReturns;
        },
        fetchImpl: fetchSpy.impl,
      }),
    );

    assert.equal(res.statusCode, 401, '401 expected for an invalid token');
    assert.equal(fetchSpy.calls, 0, 'OpenRouter fetch must never run on a rejected token');
    // No SSE stream should have started — the body is a JSON error, not event-stream frames.
    assert.equal(res.headers['content-type'], undefined, 'no SSE headers before auth passes');
    assert.equal(res.chunks.length, 0, 'no tokens streamed on rejection');
    assert.ok(res.body && typeof (res.body as { error: unknown }).error === 'string');
  });
}

test('echo rejected too (401, never streams) on a forged token', async () => {
  const fetchSpy = spyFetch();
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer forged', { action: 'echo' }),
    res as never,
    deps({ verifyToken: async () => null, fetchImpl: fetchSpy.impl }),
  );
  assert.equal(res.statusCode, 401);
  assert.equal(res.chunks.length, 0, 'no echo frames before auth passes');
});

test('valid token: echo streams progressively without any provider fetch', async () => {
  const fetchSpy = spyFetch();
  let auditCalls = 0;
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', { action: 'echo', message: 'one two three' }),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl: fetchSpy.impl,
      writeAudit: async () => {
        auditCalls += 1;
        return { ok: true, error: null, id: 'audit-1' };
      },
    }),
  );
  assert.equal(res.statusCode, 200, 'no error status set for a valid stream');
  assert.equal(fetchSpy.calls, 0, 'echo never reaches OpenRouter');
  assert.equal(auditCalls, 0, 'local echo is intentionally not audited as external egress');
  assert.match(res.headers['content-type'] ?? '', /text\/event-stream/);
  const joined = res.chunks.join('');
  assert.match(joined, /"token":"one /);
  assert.match(joined, /data: \[DONE\]/);
  assert.ok(res.ended);
});

test('valid token: ping reaches the provider exactly once and streams pong', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  let calls = 0;
  const order: string[] = [];
  const audits: AuditInput[] = [];
  const fetchImpl = (async () => {
    calls += 1;
    order.push('provider');
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"pong"}}]}\n'));
        controller.enqueue(enc.encode('data: [DONE]\n'));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;

  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', { action: 'ping', model: 'anthropic/claude-haiku-4-5' }),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl,
      writeAudit: async (_token, input) => {
        order.push('audit');
        audits.push(input);
        return { ok: true, error: null, id: 'audit-1' };
      },
    }),
  );

  assert.equal(calls, 1, 'ping calls OpenRouter exactly once for a valid token');
  assert.deepEqual(order, ['audit', 'provider'], 'audit must land before provider egress');
  assert.equal(audits.length, 1, 'one ping writes exactly one audit row');
  assert.equal(audits[0]?.userId, VALID_USER);
  assert.equal(audits[0]?.action, 'ping');
  assert.match(audits[0]?.payloadSha256 ?? '', /^[0-9a-f]{64}$/);
  const joined = res.chunks.join('');
  assert.match(joined, /"token":"pong"/);
  assert.match(joined, /data: \[DONE\]/);
});

test('repeat same-session pings each write one audit row (identical payloads are not deduped)', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  let providerCalls = 0;
  let auditCalls = 0;
  const fetchImpl = (async () => {
    providerCalls += 1;
    const enc = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"pong"}}]}\n'));
        controller.enqueue(enc.encode('data: [DONE]\n'));
        controller.close();
      },
    }), { status: 200 });
  }) as unknown as typeof fetch;
  const sharedDeps = deps({
    verifyToken: async () => VALID_USER,
    fetchImpl,
    writeAudit: async () => {
      auditCalls += 1;
      return { ok: true, error: null, id: 'audit-1' };
    },
  });

  await handleLlm(mockReq('Bearer good-token', { action: 'ping', model: 'same-model' }), mockRes() as never, sharedDeps);
  await handleLlm(mockReq('Bearer good-token', { action: 'ping', model: 'same-model' }), mockRes() as never, sharedDeps);

  assert.equal(providerCalls, 2);
  assert.equal(auditCalls, 2, 'every request is audited independently, even with the same hash');
});

test('audit failure fails closed before SSE and before any provider egress', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const fetchSpy = spyFetch();
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', { action: 'ping' }),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl: fetchSpy.impl,
      writeAudit: async () => ({ ok: false, error: 'database unavailable', id: null }),
    }),
  );

  assert.equal(res.statusCode, 503);
  assert.equal(fetchSpy.calls, 0, 'OpenRouter must never run when the audit row cannot be written');
  assert.equal(res.headers['content-type'], undefined, 'SSE does not begin on audit failure');
  assert.match(String((res.body as { error?: string }).error), /No provider call was made/);
});

test('unknown action is rejected with 400 only after auth passes', async () => {
  const fetchSpy = spyFetch();
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', { action: 'launch-missiles' }),
    res as never,
    deps({ verifyToken: async () => VALID_USER, fetchImpl: fetchSpy.impl }),
  );
  assert.equal(res.statusCode, 400);
  assert.equal(fetchSpy.calls, 0);
});

// --- B3: tailor / cover / prep actions ------------------------------------------------------

// A provider stream that emits one content delta, a usage frame with a real cost, then [DONE].
function tailorProviderFetch(onCall: () => void) {
  return (async () => {
    onCall();
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"# Résumé"}}]}\n'));
          controller.enqueue(enc.encode('data: {"usage":{"cost":0.0123}}\n'));
          controller.enqueue(enc.encode('data: [DONE]\n'));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

const TAILOR_BODY = {
  action: 'tailor',
  model: 'anthropic/claude-sonnet-4-6',
  application_id: 'app-1',
  included_categories: [
    'job-description', 'profile-summary', 'work-history', 'skills', 'education', 'resume',
  ],
  messages: [
    { role: 'system', content: 'no fabrication' },
    { role: 'user', content: 'JD + profile' },
  ],
};

test('tailor: audit lands before egress with the right slug/manifest, streams once, backfills cost', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  let providerCalls = 0;
  const order: string[] = [];
  const audits: AuditInput[] = [];
  const costUpdates: Array<{ id: string; cost: number }> = [];

  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', TAILOR_BODY),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl: tailorProviderFetch(() => {
        providerCalls += 1;
        order.push('provider');
      }),
      writeAudit: async (_token, input) => {
        order.push('audit');
        audits.push(input);
        return { ok: true, error: null, id: 'audit-9' };
      },
      updateAuditCost: async (_token, id, cost) => {
        order.push('cost');
        costUpdates.push({ id, cost });
      },
    }),
  );

  assert.equal(providerCalls, 1, 'tailor reaches OpenRouter exactly once');
  assert.deepEqual(order, ['audit', 'provider', 'cost'], 'audit before egress; cost backfilled after');
  assert.equal(audits[0]?.action, 'tailor-resume', 'privacy-log slug for the tailor action');
  assert.equal(audits[0]?.applicationId, 'app-1');
  assert.deepEqual(
    audits[0]?.manifest.sent,
    ['job-description', 'profile-summary', 'work-history', 'skills', 'education', 'resume'],
  );
  assert.match(audits[0]?.payloadSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(audits[0]?.costUsd ?? null, null, 'cost is null at pre-egress write time');
  assert.deepEqual(costUpdates, [{ id: 'audit-9', cost: 0.0123 }], 'real cost backfilled onto the row');
  const joined = res.chunks.join('');
  assert.match(joined, /"token":"# Résumé"/);
  assert.match(joined, /data: \[DONE\]/);
});

test('tailor: the single holistic call gets a complete-plan token budget (no repair call)', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  let providerBody: Record<string, unknown> | null = null;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    providerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const enc = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"{}"}}]}\n'));
        controller.enqueue(enc.encode('data: [DONE]\n'));
        controller.close();
      },
    }), { status: 200 });
  }) as unknown as typeof fetch;

  await handleLlm(
    mockReq('Bearer good-token', TAILOR_BODY),
    mockRes() as never,
    deps({ verifyToken: async () => VALID_USER, fetchImpl }),
  );

  const sentBody = providerBody as Record<string, unknown> | null;
  assert.equal(sentBody?.max_tokens, 6000);
});

test('tailor: audit failure fails closed — 503, no provider egress', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const fetchSpy = spyFetch();
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', TAILOR_BODY),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl: fetchSpy.impl,
      writeAudit: async () => ({ ok: false, error: 'db down', id: null }),
    }),
  );
  assert.equal(res.statusCode, 503);
  assert.equal(fetchSpy.calls, 0, 'no tailor egress when the audit cannot be written');
  assert.equal(res.headers['content-type'], undefined, 'SSE does not begin on audit failure');
  assert.match(String((res.body as { error?: string }).error), /No provider call was made/);
});

test('tailor: malformed payload (no messages) is 400 — before any audit or egress', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const fetchSpy = spyFetch();
  let auditCalls = 0;
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', { action: 'tailor', model: 'anthropic/claude-sonnet-4-6' }),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl: fetchSpy.impl,
      writeAudit: async () => {
        auditCalls += 1;
        return { ok: true, error: null, id: 'audit-1' };
      },
    }),
  );
  assert.equal(res.statusCode, 400);
  assert.equal(auditCalls, 0, 'no audit row for a malformed request');
  assert.equal(fetchSpy.calls, 0, 'no egress for a malformed request');
});

// --- B6.3 live finding: parse-resume transport proof ---------------------------------------

const PARSE_BODY = {
  action: 'parse-resume',
  model: 'anthropic/claude-sonnet-4-6',
  no_log: true,
  included_categories: ['resume', 'contact-info', 'profile-summary', 'work-history', 'skills', 'education'],
  messages: [
    { role: 'system', content: 'Extract only confirmed résumé facts into JSON.' },
    { role: 'user', content: 'Karan Mahajan\nLinkedIn\nhttps://www.linkedin.com/in/karan-example' },
  ],
};

test('parse-resume: valid JSON text gets payload-free proof headers and one audited egress', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  let providerCalls = 0;
  let auditCalls = 0;
  const res = mockRes();
  await handleLlm(
    mockReq('Bearer good-token', PARSE_BODY, { 'content-type': 'application/json' }),
    res as never,
    deps({
      verifyToken: async () => VALID_USER,
      fetchImpl: tailorProviderFetch(() => { providerCalls += 1; }),
      writeAudit: async () => {
        auditCalls += 1;
        return { ok: true, error: null, id: 'audit-parse' };
      },
    }),
  );

  assert.equal(providerCalls, 1);
  assert.equal(auditCalls, 1);
  assert.equal(res.headers['x-jt-parse-transport'], 'application/json; text-messages-only');
  assert.equal(res.headers['x-jt-parse-pdf-bytes'], 'absent');
  assert.equal(
    res.headers['x-jt-parse-body-keys'],
    'action,included_categories,messages,model,no_log',
  );
  assert.equal(
    res.headers['x-jt-parse-message-chars'],
    String(PARSE_BODY.messages.reduce((sum, message) => sum + message.content.length, 0)),
  );
});

for (const rejected of [
  {
    name: 'multipart content type',
    body: PARSE_BODY,
    contentType: 'multipart/form-data; boundary=pdf-upload',
    status: 415,
  },
  {
    name: 'raw PDF field',
    body: { ...PARSE_BODY, pdf: '%PDF-1.7' },
    contentType: 'application/json',
    status: 400,
  },
  {
    name: 'base64 PDF signature inside a message',
    body: { ...PARSE_BODY, messages: [{ role: 'user', content: 'JVBERi0xLjQKJ...' }] },
    contentType: 'application/json',
    status: 400,
  },
] as const) {
  test(`parse-resume: rejects ${rejected.name} before audit or provider egress`, async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const fetchSpy = spyFetch();
    let auditCalls = 0;
    const res = mockRes();
    await handleLlm(
      mockReq('Bearer good-token', rejected.body, { 'content-type': rejected.contentType }),
      res as never,
      deps({
        verifyToken: async () => VALID_USER,
        fetchImpl: fetchSpy.impl,
        writeAudit: async () => {
          auditCalls += 1;
          return { ok: true, error: null, id: 'must-not-exist' };
        },
      }),
    );

    assert.equal(res.statusCode, rejected.status);
    assert.equal(auditCalls, 0, 'rejected transport must not write an audit row');
    assert.equal(fetchSpy.calls, 0, 'rejected transport must not reach OpenRouter');
  });
}
