import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  OPENROUTER_URL,
  buildOpenRouterBody,
  extractBearerToken,
  isDone,
  parseOpenRouterDelta,
  parseOpenRouterUsage,
  sseTokenFrame,
  sseErrorFrame,
  SSE_DONE,
  type ChatMessage,
} from '../src/shared/domain/llm.js'; // .js ext required: Vercel runs api/ as Node ESM, no bundler rewrite
import {
  buildManifest,
  buildPrivacyLogRow,
  payloadHash,
  PRIVACY_CATEGORIES,
  type AuditInput,
  type PrivacyCategory,
} from '../src/shared/domain/privacy.js';
import { isTailorAction, TAILOR_PRIVACY_ACTION } from '../src/shared/domain/tailor.js';
import { isParseResumeAction, PARSE_RESUME_PRIVACY_ACTION } from '../src/shared/domain/resumeParse.js';

// The single Wave-B server surface: an action-routed, streaming LLM endpoint. It holds the
// OpenRouter secret and streams tokens back as SSE (`data: {"token":"..."}`), so generation
// beats the Vercel function timeout. B0 stands up the skeleton with two actions:
//   - echo : a free, no-egress stream that proves the transport end-to-end.
//   - ping : a tiny real OpenRouter call (proves the key + no-log routing) — costs a few
//            tokens, so it stays minimal until B3 wires real tailoring.
// Real tailor/cover/prep actions (with the B1 pre-flight gate + audit write) land in B3.

const ECHO_DEFAULT =
  'Streaming is live — tokens arrive progressively, so a long generation finishes without hitting the function timeout.';

const PARSE_RESUME_BODY_KEYS = new Set([
  'action',
  'included_categories',
  'messages',
  'model',
  'no_log',
]);
const PDF_PAYLOAD_SIGNATURE = /(?:%PDF-|data:application\/pdf|JVBERi0)/i;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Dependencies the handler needs from the outside world. Injected so the auth boundary and
// the action paths are unit-testable without a live Supabase project or a real OpenRouter
// call (see api/llm.test.ts).
export interface LlmDeps {
  /** Resolve a Supabase access token to its user id, or null for any invalid token. */
  verifyToken: (token: string) => Promise<string | null>;
  /** The fetch used to reach OpenRouter. Tests assert it is never called on a rejected token. */
  fetchImpl: typeof fetch;
  /** Persist one owner-scoped row before paid egress; failure must prevent the provider call. */
  writeAudit: (
    token: string,
    input: AuditInput,
  ) => Promise<{ ok: boolean; error: string | null; id: string | null }>;
  /** Backfill the audit row's cost after the stream completes (best-effort; row already exists). */
  updateAuditCost: (token: string, id: string, costUsd: number) => Promise<void>;
}

// Verify a Supabase access token by asking the project's auth server who it belongs to. This
// validates the JWT signature, expiry, and issuing project server-side — so forged, expired,
// malformed, and wrong-project tokens all resolve to null. Fails closed (returns null) when
// the server env is missing or the auth call throws, so a misconfigured deploy never leaks a
// paid action. Header presence alone is NOT authentication.
async function verifySupabaseToken(token: string): Promise<string | null> {
  // Reuse whichever Supabase env the deploy has. getUser(jwt) only needs the project URL + an
  // apikey (the public anon key is sufficient and is already configured for the browser), so
  // fall back to the VITE_-prefixed vars — Vercel injects all project env into the function at
  // runtime. Without this the owner's own valid token would be rejected wherever the dedicated
  // server vars aren't set.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Co-locate audit persistence with egress. The verified caller JWT is attached to this client so
// the existing profile-owner RLS boundary also protects privacy_log inserts.
function auditClient(token: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function writeSupabaseAudit(
  token: string,
  input: AuditInput,
): Promise<{ ok: boolean; error: string | null; id: string | null }> {
  const supabase = auditClient(token);
  if (!supabase) return { ok: false, error: 'Supabase audit environment is not configured.', id: null };

  try {
    // Return the inserted id so the cost can be backfilled once the stream's usage is known.
    const { data, error } = await supabase
      .from('privacy_log')
      .insert(buildPrivacyLogRow(input))
      .select('id')
      .single();
    return { ok: !error, error: error?.message ?? null, id: (data?.id as string | undefined) ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Privacy audit failed.', id: null };
  }
}

// Backfill cost_usd on an existing audit row. Best-effort: the logging guarantee is already met by
// the pre-egress insert, so a failure here is swallowed (the row simply keeps cost_usd = null).
async function updateSupabaseAuditCost(token: string, id: string, costUsd: number): Promise<void> {
  const supabase = auditClient(token);
  if (!supabase) return;
  try {
    await supabase.from('privacy_log').update({ cost_usd: costUsd }).eq('id', id);
  } catch {
    /* swallow — cost backfill is best-effort */
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const raw: unknown = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleLlm(req, res, {
    verifyToken: verifySupabaseToken,
    fetchImpl: fetch,
    writeAudit: writeSupabaseAudit,
    updateAuditCost: updateSupabaseAuditCost,
  });
}

// Testable core. The auth boundary runs BEFORE action dispatch and BEFORE any SSE headers are
// written, so an unauthenticated caller gets a clean 401 JSON body and never reaches a paid
// action. This is the fix for the B0 bypass: a forged `Authorization: Bearer <anything>` is
// no longer accepted — the token must verify against Supabase.
export async function handleLlm(req: VercelRequest, res: VercelResponse, deps: LlmDeps) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // This function holds the OpenRouter secret and can spend money, so it requires the caller
  // to present a VALID Supabase session token. Presence of a bearer prefix is not enough —
  // the token is verified against the project's auth server before anything is dispatched.
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  const userId = await deps.verifyToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const body = parseBody(req);
  const action = body.action;
  const tailorAction = isTailorAction(action) ? action : null;
  const parseResume = isParseResumeAction(action);
  if (action !== 'echo' && action !== 'ping' && !tailorAction && !parseResume) {
    res.status(400).json({
      error: "Unknown action. Use 'echo', 'ping', 'tailor', 'cover', 'prep', or 'parse-resume'.",
    });
    return;
  }

  if (parseResume) {
    const transport = validateParseResumeTransport(req, body);
    if ('error' in transport) {
      res.status(transport.status).json({ error: transport.error });
      return;
    }
    // Privacy-safe, payload-free proof for the live DevTools check. These headers describe only
    // transport and shape; no résumé text, URL, hash, or other personal content is logged/echoed.
    res.setHeader('X-JT-Parse-Transport', 'application/json; text-messages-only');
    res.setHeader('X-JT-Parse-Body-Keys', transport.bodyKeys.join(','));
    res.setHeader('X-JT-Parse-Message-Chars', String(transport.messageChars));
    res.setHeader('X-JT-Parse-PDF-Bytes', 'absent');
  }

  // The exact OpenRouter request body for a paid streaming action, assembled before egress so its
  // hash can be audited. Null for the free echo action. `auditId` lets the cost be backfilled later.
  let openRouterBody: Record<string, unknown> | null = null;
  let auditId: string | null = null;

  // ping: a tiny fixed real call (proves key + routing). Fail closed before SSE and before egress.
  if (action === 'ping') {
    if (!process.env.OPENROUTER_API_KEY) {
      res.status(503).json({ error: 'OPENROUTER_API_KEY is not set on the server.' });
      return;
    }
    const model = asString(body.model) ?? 'anthropic/claude-sonnet-4-6';
    openRouterBody = buildOpenRouterBody({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }],
      maxTokens: 16,
      noLog: body.no_log !== false,
    });
    const audit = await deps.writeAudit(token, {
      userId,
      target: 'openrouter',
      action: 'ping',
      model,
      manifest: buildManifest([]),
      payloadSha256: await payloadHash(openRouterBody),
      costUsd: null,
    });
    if (!audit.ok) {
      res.status(503).json({
        error: `Privacy audit unavailable. No provider call was made. ${audit.error ?? ''}`.trim(),
      });
      return;
    }
    auditId = audit.id;
  }

  // tailor / cover / prep / parse-resume: real generation from a client-assembled payload. The
  // messages + manifest come from the browser (tailor.ts / resumeParse.ts); the hash is computed
  // HERE over the exact body sent, and the audit row is written BEFORE egress — fail closed (503,
  // zero provider calls) if it can't land. parse-resume is the one-time onboarding extraction: it
  // returns a full StructuredResume JSON, so it gets a larger token budget than a tailor reword.
  if (tailorAction || parseResume) {
    if (!process.env.OPENROUTER_API_KEY) {
      res.status(503).json({ error: 'OPENROUTER_API_KEY is not set on the server.' });
      return;
    }
    const parsed = parseTailorRequest(body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    openRouterBody = buildOpenRouterBody({
      model: parsed.model,
      messages: parsed.messages,
      maxTokens: parseResume ? 4000 : 1500,
      noLog: parsed.noLog,
      usage: true,
    });
    const audit = await deps.writeAudit(token, {
      userId,
      applicationId: parsed.applicationId,
      target: 'openrouter',
      action: tailorAction ? TAILOR_PRIVACY_ACTION[tailorAction] : PARSE_RESUME_PRIVACY_ACTION,
      model: parsed.model,
      manifest: buildManifest(parsed.categories),
      payloadSha256: await payloadHash(openRouterBody),
      costUsd: null,
    });
    if (!audit.ok) {
      res.status(503).json({
        error: `Privacy audit unavailable. No provider call was made. ${audit.error ?? ''}`.trim(),
      });
      return;
    }
    auditId = audit.id;
  }

  // Streaming headers — disable proxy/CDN buffering so tokens flush live.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    if (action === 'echo') {
      await streamEcho(res, asString(body.message) ?? ECHO_DEFAULT);
    } else {
      // ping + tailor actions share the provider-streaming path; openRouterBody was assembled above.
      const cost = await streamOpenRouter(res, openRouterBody as Record<string, unknown>, deps.fetchImpl);
      // Backfill the real per-call cost onto the already-written audit row (best-effort).
      if (cost !== null && auditId) await deps.updateAuditCost(token, auditId, cost);
    }
    res.write(SSE_DONE);
  } catch (error) {
    res.write(sseErrorFrame(error instanceof Error ? error.message : 'Streaming failed'));
  } finally {
    res.end();
  }
}

interface ParseResumeTransportProof {
  bodyKeys: string[];
  messageChars: number;
}

function requestHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(',') : value ?? '';
}

function validateParseResumeTransport(
  req: VercelRequest,
  body: Record<string, unknown>,
): ParseResumeTransportProof | { error: string; status: 400 | 415 } {
  const contentType = requestHeader(req.headers['content-type']).toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return { error: 'parse-resume accepts application/json extracted text only.', status: 415 };
  }

  const bodyKeys = Object.keys(body).sort();
  const unexpected = bodyKeys.filter((key) => !PARSE_RESUME_BODY_KEYS.has(key));
  if (unexpected.length > 0) {
    return { error: `parse-resume contains unsupported fields: ${unexpected.join(', ')}.`, status: 400 };
  }

  const messages = parseMessages(body.messages);
  if (!messages || messages.length === 0) {
    return { error: 'parse-resume requires non-empty text messages.', status: 400 };
  }
  if (messages.some((message) => PDF_PAYLOAD_SIGNATURE.test(message.content))) {
    return { error: 'parse-resume rejected PDF/base64 data; send extracted text only.', status: 400 };
  }

  return {
    bodyKeys,
    messageChars: messages.reduce((total, message) => total + message.content.length, 0),
  };
}

interface ParsedTailor {
  model: string;
  noLog: boolean;
  messages: ChatMessage[];
  categories: PrivacyCategory[];
  applicationId: string | null;
}

// Validate the client-assembled tailor request. Returns an error string for any malformed input so
// the handler can 400 BEFORE writing an audit row or touching OpenRouter.
function parseTailorRequest(body: Record<string, unknown>): ParsedTailor | { error: string } {
  const model = asString(body.model);
  if (!model) return { error: 'A model is required.' };
  const messages = parseMessages(body.messages);
  if (!messages || messages.length === 0) return { error: 'A non-empty messages array is required.' };
  return {
    model,
    noLog: body.no_log !== false, // default ON (locked privacy posture)
    messages,
    categories: parseCategories(body.included_categories),
    applicationId: asString(body.application_id) ?? null,
  };
}

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const out: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'system' && role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return null;
    }
    out.push({ role, content });
  }
  return out;
}

// Keep only categories from the canonical vocabulary — a client can never widen the manifest to an
// unknown label, and the "withheld" list stays complete + comparable.
function parseCategories(value: unknown): PrivacyCategory[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(PRIVACY_CATEGORIES);
  return value.filter((c): c is PrivacyCategory => typeof c === 'string' && known.has(c));
}

// Free, no-egress proof of the streaming transport: emit the message token-by-token.
async function streamEcho(res: VercelResponse, message: string) {
  const tokens = message.match(/\S+\s*/g) ?? [message];
  for (const token of tokens) {
    res.write(sseTokenFrame(token));
    await delay(45);
  }
}

// Real OpenRouter streaming call for a pre-assembled body (ping or tailor/cover/prep). Returns the
// per-call cost parsed from the trailing usage frame, or null if the provider sent none.
async function streamOpenRouter(
  res: VercelResponse,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set on the server.');

  const upstream = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://job-tracker-sage-two.vercel.app',
      'X-Title': 'Job Tracker',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    throw new Error(`OpenRouter error ${upstream.status}: ${detail.slice(0, 300)}`);
  }

  return pipeOpenRouterSse(upstream.body, res);
}

// Read OpenRouter's SSE stream line-by-line, re-emit content deltas in our wire format, and capture
// the per-call cost from the trailing usage frame (when `usage: { include: true }` was requested).
async function pipeOpenRouterSse(
  body: ReadableStream<Uint8Array>,
  res: VercelResponse,
): Promise<number | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let cost: number | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (isDone(data)) return cost;
      const token = parseOpenRouterDelta(data);
      if (token) res.write(sseTokenFrame(token));
      const frameCost = parseOpenRouterUsage(data);
      if (frameCost !== null) cost = frameCost;
    }
  }
  return cost;
}
