import { parseLlmFrame, type ChatMessage } from '../domain/llm';
import type { PrivacyCategory } from '../domain/privacy';

// Browser-side caller for the streaming /api/llm function. Reads the SSE body and invokes
// onToken for each token as it arrives, so the UI renders progressively. The SSE wire format
// + parsing live in shared/domain/llm.ts (tested) — this file is just transport.

export interface StreamLlmOptions {
  action: 'echo' | 'ping' | 'tailor' | 'cover' | 'prep';
  /** echo only. */
  message?: string;
  model?: string;
  noLog?: boolean;
  /** tailor/cover/prep: the client-assembled chat messages (see shared/domain/tailor.ts). */
  messages?: ChatMessage[];
  /** tailor/cover/prep: categories sent, for the server's manifest + audit (B1). */
  includedCategories?: PrivacyCategory[];
  /** tailor/cover/prep: the application this generation is for (links the audit row). */
  applicationId?: string | null;
  /** Supabase session token — the function rejects unauthenticated callers. */
  accessToken: string | null;
  onToken: (token: string) => void;
  signal?: AbortSignal;
}

export async function streamLlm(opts: StreamLlmOptions): Promise<void> {
  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
    },
    body: JSON.stringify({
      action: opts.action,
      message: opts.message,
      model: opts.model,
      no_log: opts.noLog,
      messages: opts.messages,
      included_categories: opts.includedCategories,
      application_id: opts.applicationId,
    }),
    signal: opts.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    // SSE frames are separated by a blank line (\n\n).
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const parsed = parseLlmFrame(line.slice(5));
        if (!parsed) continue;
        if ('done' in parsed) return;
        if ('error' in parsed) throw new Error(parsed.error);
        opts.onToken(parsed.token);
      }
    }
  }
}
