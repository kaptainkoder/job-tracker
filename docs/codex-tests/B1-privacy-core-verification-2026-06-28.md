# B1 privacy core — pre-flight gate + audit write + RLS (ready to run)

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
- `src/shared/lib/privacyLog.ts` — `writePrivacyLog` inserts one owner-scoped `privacy_log` row.
- `SettingsPage` — **Ping** now opens the gate on first use (echo stays ungated, zero egress);
  on approval it streams, then writes one `privacy_log` row (cost null until B3 wires usage).
- Gate = **74 tests**, green.

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
