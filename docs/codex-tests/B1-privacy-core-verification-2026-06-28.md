# B1 privacy core — server-audit repair deployed; authenticated re-check pending

> **Run status (Codex, 2026-06-28): mostly PASS, one blocking FAIL.**
> Final `privacy_log` count = 1; denied RLS attempts created no rows.
>
> | # | Check | Result | Observed |
> |---|-------|--------|----------|
> | 1 | Echo ungated | ✅ | streamed, no dialog, privacy_log delta 0 |
> | 2 | Pre-flight gate before egress | ✅ | expected SENT/WITHHELD lists shown before `/api/llm` |
> | 3 | Cancel = zero egress | ✅ | no stream, no request, no audit row |
> | 4 | First approval | ✅ | pong, confirmation shown, exactly **one** audit row |
> | 5 | SHA-256 integrity | ✅ | recomputed == stored = `f1ad844a05f1f4c13e7c7992f7486a6b9b8bbc7442db44db92e14f3903bdb129` |
> | 6 | Second same-session ping | ❌ **BLOCKER** | no re-prompt + pong streamed, but **privacy_log delta 0** (egress without a log row). Unlogged req `smkcd-1782651146869-027400e21c06`, `2026-06-28T12:52:26Z` |
> | 7 | Owner read | ⚠️ partial | first row visible; expected second row absent (consequence of #6) |
> | 8 | Anonymous RLS | ✅ | `42501` |
> | 9 | Cross-UID RLS | ✅ | `42501` |
>
> **Verdicts:** No un-gated egress = **YES**. Every external call logged exactly once = **NO**.
>
> **Original B1 blocker:** the second (already-approved) ping egressed to
> OpenRouter but wrote **no** `privacy_log` row. NOTE: the source shows *no* code bypass — both the
> gated and already-approved paths funnel through `runStream('ping')`, which calls `writePrivacyLog`
> unconditionally for every ping, and there is no unique constraint on the table. So the missed row
> is a **failed/dropped client-side insert**, not a skipped call. Root lesson: a best-effort,
> client-side audit write **cannot guarantee once-per-call** — if the lone insert fails (or the tab
> navigates/errors after streaming), egress already happened and nothing logs. **Fix direction:**
> move the audit write **server-side into `/api/llm`** and fail closed before provider access.
>
> **Repair implemented after this run:** auditing now lives in `api/llm.ts`, uses the verified
> caller JWT for an owner-scoped insert, and runs **before** OpenRouter. An audit failure returns
> 503 before SSE starts and the provider fetch is never called. The client-side insert was removed,
> preventing duplicate writers. Regression tests cover audit-before-provider ordering, two rows for
> two identical same-session Pings, and fail-closed zero-egress behavior. The live re-run below is
> still required against deployment `dpl_BnKQ9u2a6F1Naz3ziYEjmodVQHwf` (`Ready`, commit
> `4f6f6dd`). `/api/health` is OK and unauthenticated Ping still fails 401 before egress.

---

Verify Wave B **B1** (privacy core) on prod. B1 adds the egress contract every external call must
pass: a **pre-flight approve-before-send gate** (no un-gated egress) and a **privacy_log audit
write** (no un-logged egress). The real tailor calls land in B3; B1 wires the gate + audit to the
existing **"Ping the model"** action on Settings as the first live exercise of the path.

Prod: `https://job-tracker-sage-two.vercel.app` · screen: `/settings` · signed in as the owner.

## What changed (for context, don't re-derive)
- `src/shared/domain/privacy.ts` — pure, tested (13 cases in `npm run test:privacy`): `buildManifest`
  (sent + the complete "what is NOT sent" list), `payloadHash` (deterministic, key-order-independent
  SHA-256; known vector `SHA-256("{}")`), `requiresPreflight` (first-of-type per `(target, action)`
  OR any résumé/contact-bearing call), `buildPrivacyLogRow` (labelled manifests; never the payload).
- `src/shared/ui/PreflightModal.tsx` — approve-before-send dialog listing SENT vs. NOT-SENT.
- `api/llm.ts` — after token verification and before OpenRouter, inserts one owner-scoped audit row
  with the caller JWT; audit failure returns 503 and performs zero provider fetches.
- `SettingsPage` — **Ping** opens the gate on first use; the separate client audit writer was
  removed so the server is the sole writer (echo stays ungated/unlogged because it has zero egress).
- B1-fix adds repeat-Ping and fail-closed audit regressions; the full working-tree gate was green
  before deployment.

## Steps (signed in as owner, on `/settings`)
1. **Echo is ungated** — click **"Test streaming (free)"**. Expect: tokens stream, **no dialog**,
   and **no new privacy_log row** (echo never leaves the device).
2. **Ping fires the gate (first of type)** — click **"Ping the model"**. Expect: the
   **"Approve before sending"** dialog appears *before* any network call to OpenRouter. It shows a
   **Sent** column ("Nothing from your profile — only a short test message") and a **Not sent**
   column listing the withheld categories (Job description, Résumé content, Contact details, …).
3. **Cancel = zero egress** — open the gate again (reload first so it re-prompts) and click
   **Cancel**. Expect: dialog closes, **no stream**, and (the point) **no OpenRouter request** in
   the Network tab and **no new privacy_log row**.
4. **Approve = stream + one audit row** — click Ping → **Approve & send**. Expect: a `pong` streams
   (one tiny spend), then "Logged to your privacy log." appears. Open **/privacy**: exactly **one
   new row** — target OpenRouter, action `ping`, model = your selected model, a SENT/WITHHELD
   manifest, a 64-hex `payload_sha256`, cost `—` (null).
5. **Hash integrity** — in DevTools console on `/settings`, recompute the hash of the exact client
   payload and confirm it matches the logged row:
   ```js
   // canonical = sorted-key JSON of what the client sent for the ping
   const payload = { action:'ping', model:'<your selected model>', no_log:<true|false> };
   const sorted = Object.fromEntries(Object.keys(payload).sort().map(k=>[k,payload[k]]));
   const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sorted)));
   console.log([...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''));
   ```
   - Expect: the 64-hex string **equals** the `payload_sha256` on the row from step 4.
6. **Second ping does NOT re-prompt** — click Ping again in the same session. Expect: **no dialog**
   (already-approved `openrouter:ping`), it streams directly, and a **second** privacy_log row is
   written (still gated-then-logged; the gate is just satisfied for the session).

## Live RLS proof for `privacy_log` (owner / anon / cross-UID)
7. **Owner insert + read** — the rows from steps 4 and 6 are visible on `/privacy` for the owner.
8. **Anon denied** — signed out, in console:
   ```js
   const { error } = await supabase.from('privacy_log').insert({ target:'openrouter', action:'x', sent_manifest:[], withheld_manifest:[], payload_sha256:'x' });
   console.log(error?.code, error?.message); // expect 42501 (RLS), insert rejected
   ```
9. **Cross-UID denied** — signed in as owner, attempt an insert with `user_id` set to a different
   UUID. Expect rejection (`42501`) — RLS pins rows to the authenticated owner.

## Still relevant from earlier waves (run if the browser cooperates)
- **Server-side egress host trace** for the approved ping: the only outbound host is
  `openrouter.ai`, and the body carries `provider.data_collection:"deny"` when no-log is on.
- **Mobile** (390×844): the gate dialog is readable and the Approve/Cancel buttons are reachable.

## Desired output format
A markdown table — one row per step 1–9 — with columns **# | Check | Result (✅/❌) | Observed**
(dialog yes/no, row count delta, status/error code, the two hashes for step 5). Then a one-line
verdict each: **"No un-gated egress: yes/no"** and **"Every external call logged exactly once:
yes/no"**, plus any request id for a failure.
