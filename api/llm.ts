import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  OPENROUTER_URL,
  buildOpenRouterBody,
  isDone,
  parseOpenRouterDelta,
  sseTokenFrame,
  sseErrorFrame,
  SSE_DONE,
} from '../src/shared/domain/llm.js'; // .js ext required: Vercel runs api/ as Node ESM, no bundler rewrite

// The single Wave-B server surface: an action-routed, streaming LLM endpoint. It holds the
// OpenRouter secret and streams tokens back as SSE (`data: {"token":"..."}`), so generation
// beats the Vercel function timeout. B0 stands up the skeleton with two actions:
//   - echo : a free, no-egress stream that proves the transport end-to-end.
//   - ping : a tiny real OpenRouter call (proves the key + no-log routing) — costs a few
//            tokens, so it stays minimal until B3 wires real tailoring.
// Real tailor/cover/prep actions (with the B1 pre-flight gate + audit write) land in B3.

const ECHO_DEFAULT =
  'Streaming is live — tokens arrive progressively, so a long generation finishes without hitting the function timeout.';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // This function holds the OpenRouter secret and can spend money, so it requires the caller
  // to present their Supabase session token. (Full JWT signature verification is wired in B3
  // when real per-user egress + cost lands; for now a bearer token must be present.)
  const auth = req.headers.authorization ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const body = parseBody(req);
  const action = body.action;
  if (action !== 'echo' && action !== 'ping') {
    res.status(400).json({ error: "Unknown action. Use 'echo' or 'ping'." });
    return;
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
      await streamPing(res, body);
    }
    res.write(SSE_DONE);
  } catch (error) {
    res.write(sseErrorFrame(error instanceof Error ? error.message : 'Streaming failed'));
  } finally {
    res.end();
  }
}

// Free, no-egress proof of the streaming transport: emit the message token-by-token.
async function streamEcho(res: VercelResponse, message: string) {
  const tokens = message.match(/\S+\s*/g) ?? [message];
  for (const token of tokens) {
    res.write(sseTokenFrame(token));
    await delay(45);
  }
}

// Minimal real OpenRouter streaming call — proves the key + no-log routing work. Kept tiny
// (one short prompt, 16 max tokens) to respect the small budget.
async function streamPing(res: VercelResponse, body: Record<string, unknown>) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set on the server.');

  const model = asString(body.model) ?? 'anthropic/claude-sonnet-4-6';
  const noLog = body.no_log !== false; // default ON (locked privacy posture)

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://job-tracker-sage-two.vercel.app',
      'X-Title': 'Job Tracker',
    },
    body: JSON.stringify(
      buildOpenRouterBody({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }],
        maxTokens: 16,
        noLog,
      }),
    ),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    throw new Error(`OpenRouter error ${upstream.status}: ${detail.slice(0, 300)}`);
  }

  await pipeOpenRouterSse(upstream.body, res);
}

// Read OpenRouter's SSE stream line-by-line and re-emit content deltas in our wire format.
async function pipeOpenRouterSse(body: ReadableStream<Uint8Array>, res: VercelResponse) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
      if (isDone(data)) return;
      const token = parseOpenRouterDelta(data);
      if (token) res.write(sseTokenFrame(token));
    }
  }
}
