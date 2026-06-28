import { parseLlmFrame } from '../domain/llm';

// Browser-side caller for the streaming /api/llm function. Reads the SSE body and invokes
// onToken for each token as it arrives, so the UI renders progressively. The SSE wire format
// + parsing live in shared/domain/llm.ts (tested) — this file is just transport.

export interface StreamLlmOptions {
  action: 'echo' | 'ping';
  message?: string;
  model?: string;
  noLog?: boolean;
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
