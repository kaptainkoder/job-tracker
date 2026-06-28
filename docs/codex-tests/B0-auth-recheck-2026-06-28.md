# B0 auth re-check — forged Bearer must now 401 (RAN 2026-06-28: PASS)

> **Run status (Codex, 2026-06-28): PASS.** No header → 401 `{"error":"Missing bearer token"}`,
> no SSE (req `7cwhw-…`). Forged Bearer + echo → 401 `{"error":"Invalid or expired session"}`,
> no SSE (`nrd5n-…`). Forged + ping → same 401, **no pong/SSE, dispatch stopped before the paid
> path** (`rgwbd-…`). Malformed `eyJhbGc.invalid.sig` + ping → 401 (`cvz8f-…`). Valid owner: echo
> 200 `text/event-stream` (18 chunks, `82bg6-…`); one ping 200 SSE `p`+`ong`+DONE (`dlkfm-…`).
> **Verdict: forged Bearer rejected = YES; valid echo/ping still stream.**
> Mobile 390×844 Settings = PASS (bottom order Tracker/Profile/Settings/Privacy, desktop nav
> hidden, `/settings` in shell, only Settings `aria-current=page`/blue).
> **Egress trace = WARN (residual):** Vercel logs show only the `/api/llm` request, no outbound
> span/body. Live `pong` passed and the source routes `openrouter.ai` + default no-log body adds
> `provider.data_collection=deny`, but this is **not independently proven by a server trace** —
> revisit when B3 makes real tailor calls.

Re-verify the fix for the B0 bug #8 authorization bypass (see
[`B0-live-verification-2026-06-28.md`](B0-live-verification-2026-06-28.md)). Before the fix,
`POST /api/llm` accepted any `Authorization: Bearer <anything>` and streamed — the paid `ping`
was anonymously reachable. The fix verifies the Supabase access token with `auth.getUser()`
**before** action dispatch and before any SSE headers are written, reusing the project's
Supabase URL + anon key (the function falls back to the `VITE_`-prefixed env, which is set).

Prod: `https://job-tracker-sage-two.vercel.app` · function: `/api/llm`.

## What changed (for context, don't re-derive)
- `api/llm.ts` now extracts the bearer token (`extractBearerToken`), calls
  `verifySupabaseToken` → `supabase.auth.getUser(token)`, and returns **401
  `{"error":"Invalid or expired session"}`** for any token the auth server rejects. Missing /
  non-bearer header still returns **401 `{"error":"Missing bearer token"}`**.
- Local + unit proof already done: `npm run test:api-llm` (10 cases: missing, malformed,
  forged, expired, wrong-project all 401 with provider fetch asserted never called; valid
  echo/ping still stream). Forged/malformed tokens were also confirmed rejected against the
  **real** Supabase GoTrue (HTTP 403 `AuthApiError`).

## Steps
1. **No header** → `curl -sS -i -X POST .../api/llm -H 'content-type: application/json' -d '{"action":"echo"}'`
   - Expect: **HTTP 401**, body `{"error":"Missing bearer token"}`, no `text/event-stream`.
2. **Forged bearer** → add `-H 'authorization: Bearer definitely-not-a-session'` to the above.
   - Expect: **HTTP 401**, body `{"error":"Invalid or expired session"}`, **no SSE stream**.
3. **Forged bearer + ping (paid path)** → same header, body `{"action":"ping"}`.
   - Expect: **HTTP 401**, no stream, and (the point) **no OpenRouter spend** — the provider is
     never reached. There is no `pong`.
4. **Malformed JWT** → `-H 'authorization: Bearer eyJhbGc.invalid.sig'`, body `{"action":"ping"}`.
   - Expect: **HTTP 401**.
5. **Valid owner path still works** → sign in to the app, open DevTools console, run:
   ```js
   const t = (await supabase.auth.getSession()).data.session.access_token;
   const r = await fetch('/api/llm', { method:'POST', headers:{'content-type':'application/json','authorization':`Bearer ${t}`}, body: JSON.stringify({action:'echo'}) });
   console.log(r.status, r.headers.get('content-type'));
   ```
   - Expect: **200**, `text/event-stream`, and a progressive echo. Then repeat with
     `{action:'ping'}` and expect a `pong` (a few tokens of spend — keep it to one).

## Still unverified from B0 (please also exercise if the responsive browser cooperates)
- **Mobile bottom-tab nav** at 390×844: Settings tab renders between Profile and Privacy;
  `/settings` loads inside the shell; only Settings is blue. (Timed out last run.)
- **Server-side egress host trace** for `ping`: confirm the only outbound host is
  `openrouter.ai` and the body carries `provider.data_collection:"deny"` when no-log is on.
  (Source-backed only last run.)

## Desired output format
A short markdown table — one row per step above — with columns **# | Check | Result (✅/❌) |
Observed** (status code + body snippet, or `pong`/stream note). Then a one-line verdict:
**"Forged Bearer is now rejected (no paid action reachable): yes/no"**, plus any request id for
a failure. Note explicitly whether the valid owner echo + ping still stream.
