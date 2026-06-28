# B0 — Settings + streaming `/api/llm` production verification (for Codex)

**Why this exists:** Claude Code shipped B0 (Settings page, `user_settings` migration `0003`,
and the streaming `api/llm.ts` skeleton) but had no paired Chrome extension to drive the live
authenticated UI or watch tokens stream. Run the checks below **signed in as the owner** on prod
`https://job-tracker-sage-two.vercel.app`, and report back in the table format at the bottom.
Production code must not be changed.

## What shipped in B0
- **`/settings`** screen (new sidebar nav item between Profile and Privacy): a model dropdown
  (default **Claude Sonnet 4.6**, sentence-case labels), a **no-log / zero-retention** toggle
  (on by default), a read-only note that the OpenRouter key is a server secret, a **Save**
  action that upserts an owner-scoped `user_settings` row, and a **Connection test** card.
- **`user_settings`** table (migration `0003`, applied 2026-06-28): `user_id` PK, `model`,
  `no_log`, timestamps; RLS owner-only.
- **`api/llm.ts`**: action-routed streaming function. `echo` = free, no provider egress (proves
  the streaming transport beats the function timeout); `ping` = one tiny real OpenRouter call
  (proves the server key + no-log routing). Tokens stream back as SSE `data: {"token":"…"}`.
- `OPENROUTER_API_KEY` is set in Vercel (Production + Development), read **server-side only**.

## Checks

| # | Check | Expected |
|---|-------|----------|
| 1 | **Nav + route** | Sidebar (desktop) and bottom tab bar (mobile) show a **Settings** item; `/settings` loads inside the app shell. Only the active item is blue. |
| 2 | **Default state (no row yet)** | First visit shows model = **Claude Sonnet 4.6** and the no-log toggle **on**, even before saving. |
| 3 | **Save persists** | Change model to another option, toggle no-log off, **Save settings** → "Settings saved." Refresh `/settings` (and re-login) → the saved model + toggle state return. |
| 4 | **Key never in the browser** | Open DevTools → Sources/Network: the OpenRouter key appears **nowhere** in the JS bundle or any client request. The Settings copy states the key is a server secret. |
| 5 | **Streaming — echo (free)** | Click **Test streaming (free)** → text fills the output panel **progressively, token by token** (not all at once), then stops. No provider call (check Network: only `/api/llm`). |
| 6 | **Streaming — model ping** | Click **Ping the model (uses a few tokens)** → a short real reply (≈"pong") streams in. Confirms the server key + model routing work. (Spends a few tokens — run once.) |
| 7 | **Stop** | While streaming, **Stop** halts output without an error. |
| 8 | **Unauthorized guard** | A `POST /api/llm` **without** an `Authorization: Bearer` header returns **401** (the function refuses anonymous callers). |
| 9 | **Egress boundary** | During the ping, the only outbound third-party host is OpenRouter (`openrouter.ai`); the request body carries `provider.data_collection: "deny"` when no-log is on. |
| 10 | **RLS for `user_settings`** | Anon REST `GET /rest/v1/user_settings?select=user_id` returns HTTP 200 `[]`; a cross-UID insert is rejected with PostgreSQL `42501` (use the rollback probe pattern in RUNBOOK §8, table `user_settings`). |
| 11 | **Design conformance** | Settings uses the `--ds-*` primitives: near-monochrome (one blue accent), Inter, sentence case, flat surfaces, card shadow, visible 2px accent focus ring on tab, **no emoji**. Light + dark both flip cleanly. |

## How to hit `/api/llm` directly (checks 8–9)
Signed in, grab the Supabase access token from the app (DevTools → Application → Local Storage →
`sb-…-auth-token` → `access_token`). Then:
```
# 401 without auth:
curl -i -X POST https://job-tracker-sage-two.vercel.app/api/llm \
  -H 'content-type: application/json' -d '{"action":"echo"}'
# streams with auth:
curl -N -X POST https://job-tracker-sage-two.vercel.app/api/llm \
  -H "authorization: Bearer <ACCESS_TOKEN>" -H 'content-type: application/json' \
  -d '{"action":"echo"}'
```

## Desired output
Reproduce the table above with a **Result** column (✅ / ❌) and a **Notes** column, plus:
- header: `Tested: prod · <UTC timestamp> · signed in as owner: yes · theme: light+dark`
- a **Bugs found** list (minimal repro each) + any console/network errors,
- the raw first ~5 SSE frames seen for the echo stream (to confirm `data: {"token":…}` framing),
- screenshots under `docs/codex-tests/screenshots/<date>-B0/` referenced by check number.

Flag checks **#5/#6 (streaming actually streams)** and **#10 (RLS)** prominently — those are the
ones Claude could not self-verify.
