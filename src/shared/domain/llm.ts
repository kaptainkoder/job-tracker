// Environment-neutral LLM helpers shared by the browser and the api/llm function.
// Pure request-shaping + SSE parsing so the egress contract is unit-tested in one place
// (the function and the client must agree on the wire format). No network here.

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Extract the raw credential from an `Authorization: Bearer <token>` header. Returns null
// when the header is absent or not a well-formed, non-empty bearer credential. Presence of
// the bearer prefix is NOT authentication — the returned token must still be verified
// against Supabase before any paid action runs (see api/llm.ts).
export function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  const match = /^bearer[ \t]+(\S.*)$/i.exec(authHeader.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface OpenRouterRequestInput {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** When true, route only to providers that honour zero-retention (the locked privacy posture). */
  noLog?: boolean;
  /** When true, ask OpenRouter to emit a final `usage` (incl. real `cost`) for the audit row. */
  usage?: boolean;
}

// Build the OpenRouter chat-completions body. Always streams. When noLog is set, the
// provider routing preference forbids data collection (no-log / zero-retention). When usage is
// set, request the trailing usage frame so B3 can audit the per-call cost. Deterministic field set
// (no undefined keys) so payloadHash() over this body is recompute-verifiable.
export function buildOpenRouterBody(input: OpenRouterRequestInput): Record<string, unknown> {
  return {
    model: input.model,
    messages: input.messages,
    max_tokens: input.maxTokens ?? 256,
    stream: true,
    ...(input.usage ? { usage: { include: true } } : {}),
    ...(input.noLog ? { provider: { data_collection: 'deny' } } : {}),
  };
}

// True when an SSE data line is OpenRouter's terminal sentinel.
export function isDone(dataLine: string): boolean {
  return dataLine.trim() === '[DONE]';
}

// Parse one OpenRouter SSE `data:` payload into its incremental token. Returns null for the
// terminal sentinel, keep-alive comments, or any frame without a content delta (so the
// caller can skip it without special-casing).
export function parseOpenRouterDelta(dataLine: string): string | null {
  const data = dataLine.trim();
  if (!data || isDone(data)) return null;
  try {
    const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
    const token = json.choices?.[0]?.delta?.content;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

// Parse an OpenRouter SSE `data:` payload for a trailing usage frame and return the real per-call
// cost in USD, or null when this frame carries no usage cost. OpenRouter attaches `usage` (with a
// `cost` field, in USD) to a frame near the end of the stream when `usage: { include: true }` was
// requested. Used by api/llm.ts to backfill the audit row's cost_usd after the stream completes.
export function parseOpenRouterUsage(dataLine: string): number | null {
  const data = dataLine.trim();
  if (!data || isDone(data)) return null;
  try {
    const json = JSON.parse(data) as { usage?: { cost?: unknown } };
    const cost = json.usage?.cost;
    return typeof cost === 'number' && Number.isFinite(cost) ? cost : null;
  } catch {
    return null;
  }
}

// --- Our own wire format (function -> browser) -----------------------------------------
// The function re-emits tokens as `data: {"token": "..."}` SSE frames, signals errors as
// `data: {"error": "..."}`, and ends with `data: [DONE]`. The client parses only JSON.

export function sseTokenFrame(token: string): string {
  return `data: ${JSON.stringify({ token })}\n\n`;
}

export function sseErrorFrame(message: string): string {
  return `data: ${JSON.stringify({ error: message })}\n\n`;
}

export const SSE_DONE = 'data: [DONE]\n\n';

export type LlmFrame = { token: string } | { error: string } | { done: true };

// Parse one of OUR `data:` payloads (used by the browser client + its tests).
export function parseLlmFrame(dataLine: string): LlmFrame | null {
  const data = dataLine.trim();
  if (!data) return null;
  if (isDone(data)) return { done: true };
  try {
    const json = JSON.parse(data) as { token?: unknown; error?: unknown };
    if (typeof json.error === 'string') return { error: json.error };
    if (typeof json.token === 'string') return { token: json.token };
    return null;
  } catch {
    return null;
  }
}
