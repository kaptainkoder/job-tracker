# B0 production verification — 2026-06-28

Tested: prod · 2026-06-28T08:40:02Z · signed in as owner: yes · theme: light+dark

> Outcome: Settings persistence, real model ping, progressive SSE, Stop, secret isolation, and RLS
> passed. The advertised authorization boundary did not: any made-up Bearer value is accepted, so
> an anonymous caller can reach the paid `ping` action. Mobile nav and server-side egress host
> tracing were not live-observed.

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Nav + route | ⚠️ | Desktop passed: Settings appears between Profile and Privacy, `/settings` loads inside the shell, and only Settings is blue. Mobile bottom-tab rendering was not live-verified because the 390×844 browser repeatedly timed out. |
| 2 | Default state (no row yet) | ✅ | Before the first save, production showed Claude Sonnet 4.6 and no-log on. DB `created_at` later confirmed the row was first created during this test. |
| 3 | Save persists | ✅ | Saved Claude Haiku 4.5 + no-log off; both survived refresh and a full sign-out/magic-link re-login. Restored Sonnet 4.6 + no-log on afterward. |
| 4 | Key never in the browser | ✅ | Scanned the deployed JS bundle: neither the exact local OpenRouter key nor an `sk-or-v1-*` pattern appeared. Client calls target same-origin `/api/llm`; Settings states the key is server-only. |
| 5 | **Streaming — echo (free)** | ✅ | A warm retry visibly grew from `Streaming ` → a longer partial sentence → the full sentence over ~560 ms. Raw SSE frames use `data: {"token":"…"}`. The first attempt during deployment rollout returned `FUNCTION_INVOCATION_FAILED`; subsequent echo and ping calls succeeded. |
| 6 | **Streaming — model ping** | ✅ | One authorized ping completed with `pong` while no-log was on. It took roughly 5–6 seconds. |
| 7 | Stop | ✅ | Stopped a free echo mid-sentence; output remained byte-for-byte unchanged after another 650 ms and no error appeared. |
| 8 | Unauthorized guard | ❌ | No header correctly returns 401 `{"error":"Missing bearer token"}`, but `Authorization: Bearer definitely-not-a-session` receives HTTP 200 and a full echo stream. The endpoint checks only the prefix, not a valid Supabase session, so the paid ping is anonymously reachable. |
| 9 | Egress boundary | ⚠️ | Live ping succeeded with no-log on; shipped request builder sends only to `https://openrouter.ai/api/v1/chat/completions` and adds `provider.data_collection: "deny"`. A server-side outbound-host trace was not available, so this is source-backed rather than directly observed. |
| 10 | **RLS for `user_settings`** | ✅ | Anon REST GET returned HTTP 200 `[]`; rollback-only cross-UID insert returned exact PostgreSQL `42501`. |
| 11 | Design conformance | ✅ | Inter, near-monochrome surfaces, sentence case, no emoji, light/dark parity, and the blue focus ring passed. Computed focus showed a 2px outline plus blue ring. |

## Bugs found

1. **Authorization bypass on `/api/llm` (blocking before paid actions remain public)**
   - POST with no Authorization header → 401 (correct).
   - POST with `Authorization: Bearer definitely-not-a-session` and `{"action":"echo"}`.
   - Actual: HTTP 200 SSE stream.
   - Expected: verify the Supabase JWT/session and return 401 for malformed, forged, expired, or
     wrong-project tokens before branching to `echo` or `ping`.
   - Impact: an unauthenticated caller can forge any Bearer string and trigger the paid OpenRouter
     ping using Karan's server key. Header presence is not authentication.

2. **One transient function failure during rollout (not reproduced after warm-up)**
   - First echo returned `FUNCTION_INVOCATION_FAILED` with request id
     `bom1::blgfj-1782635750070-3c6f5b2537f4`.
   - Warm echo retry streamed progressively; the real ping returned `pong`.
   - Inspect Vercel logs for the request id, but do not treat this as a persistent echo failure
     unless it reproduces after deployment propagation.

## Raw first five echo SSE frames

```text
data: {"token":"Streaming "}

data: {"token":"is "}

data: {"token":"live "}

data: {"token":"— "}

data: {"token":"tokens "}
```

## Console/network notes

- Initial echo: `FUNCTION_INVOCATION_FAILED` as recorded above; later calls succeeded.
- No other visible UI/network error occurred.
- Browser console collection itself was unreliable, so console silence is not claimed.

## Cleanup

- Restored model = Claude Sonnet 4.6, no-log = on, and dark theme.
- Removed the `user_settings` row created by this test, returning the table to **0 rows** (the UI
  still derives the same defaults when no row exists).
- No production code was changed by Codex.

## Screenshots

- Checks 1–4, 11: [`B0-01-settings-dark-default.png`](screenshots/2026-06-28-B0/B0-01-settings-dark-default.png)
- Transient failure: [`B0-02-echo-function-failure.png`](screenshots/2026-06-28-B0/B0-02-echo-function-failure.png)
- Check 6 in progress / Stop visible: [`B0-03-ping-in-progress-stop-visible.png`](screenshots/2026-06-28-B0/B0-03-ping-in-progress-stop-visible.png)
- Check 6 complete: [`B0-03-ping-pong.png`](screenshots/2026-06-28-B0/B0-03-ping-pong.png)
- Check 11: [`B0-04-settings-light-focus.png`](screenshots/2026-06-28-B0/B0-04-settings-light-focus.png)
- Check 5: [`B0-05-echo-progressive-success.png`](screenshots/2026-06-28-B0/B0-05-echo-progressive-success.png)
- Check 7: [`B0-06-stop-halts-echo.png`](screenshots/2026-06-28-B0/B0-06-stop-halts-echo.png)

## Paste into Claude Code

```text
Read docs/codex-tests/B0-live-verification-2026-06-28.md and
docs/codex-tests/B-D0-live-verification-2026-06-28.md. B0 Settings persistence, progressive echo
SSE, Stop, real ping (“pong”), deployed-bundle secret isolation, and user_settings RLS all passed.

Fix the B0 authorization bypass before leaving a paid action public: POST /api/llm with
Authorization: Bearer definitely-not-a-session currently returns 200 and streams. Validate the
Supabase JWT/session before action dispatch and return 401 for missing, malformed, forged,
expired, and wrong-project tokens. Add API-level regression tests for all five cases and prove
the provider fetch is never called on rejection. Keep the valid owner echo/ping paths streaming.
Inspect Vercel request bom1::blgfj-1782635750070-3c6f5b2537f4 for the one rollout-time
FUNCTION_INVOCATION_FAILED, but warm echo and ping both passed afterward.

Separately, B-D0 check #9 still fails: tomorrow’s outcome is inserted despite max={today} and the
wired domain validator. Add the ApplicationDetail UI no-insert regression test described in its
report, fix it, deploy both fixes, and stage focused Codex re-checks. Mobile B-D0/B0 nav,
stale-card, Edit-form, and server-side egress-host tracing remain explicitly unverified. Update
.Codex/plan-checkpoint.md and project-local memory from these empirical results.
```
