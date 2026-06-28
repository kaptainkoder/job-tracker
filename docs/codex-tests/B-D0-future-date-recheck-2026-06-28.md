# B-D0 #9 future-date re-check + remaining design checks (ready to run)

Re-verify the future-date outcome guard (B-D0 bug #9, see
[`B-D0-live-verification-2026-06-28.md`](B-D0-live-verification-2026-06-28.md)) and clear the
checks that the responsive browser timed out on last run.

Prod: `https://job-tracker-sage-two.vercel.app` · screen: any application → **Log outcome**.

## Diagnosis from this fix session (read before testing)
A new **UI-level regression test renders the real `ApplicationDetail`**, opens the outcome
form, sets **tomorrow** through React's controlled-input path (native value setter + `input`
event, i.e. exactly what a keystroke does), submits, and asserts: the inline error **"The date
can't be in the future."** shows, the form **stays open**, and **zero Supabase inserts** fire.
A control test with **today** asserts exactly **one** insert — proving the harness really drives
the submit path. **Both pass against the current code** (`npm run test:application-detail`).

That means the controlled-input + `validateOutcomeForm` path already blocks future dates with
no insert. The most likely explanation for the prior production save is that the **automation
set the date value without firing React's `onChange`** (e.g. assigning `input.value` or
dispatching only a `change` event — React listens for `input` on date fields). React state then
stayed at *today*, so the inserted outcome was actually **today-dated**, not tomorrow.

**So this re-check must distinguish the two hypotheses** — please drive the input like a human,
and record the date that actually lands in the DB.

## Steps — future-date guard (#9)
1. Open an application → **Log outcome**. Confirm the Date input has `max` = today.
2. Enter **tomorrow** using a **real interaction**:
   - Preferred: open the native date **calendar picker** and try to pick tomorrow (the `max`
     should grey it out — note if you physically cannot select it).
   - If the picker blocks it, **type** tomorrow's date into the field with the keyboard.
   - Avoid setting `.value` directly in JS. If you must script it, dispatch a real
     `input` event (`bubbles:true`) so React's `onChange` runs, and say so in the report.
3. Click **Log**.
   - **Expect:** no insert; form **stays open**; inline **"The date can't be in the future."**
4. **Capture the DB truth** regardless of UI: via `SUPABASE_DB_URL`, after the attempt run
   `select kind, occurred_at from outcomes order by occurred_at desc limit 3;` and report the
   exact `occurred_at`. If a row appears, state whether it is **tomorrow** or **today** (this
   tells us if `onChange` fired). Then clean up any test rows back to baseline.

## Steps — remaining B-D0 checks (timed out last run)
5. **Mobile app-shell ≤640px (390×844):** top bar + bottom tab bar render (`md:hidden`),
   desktop sidebar hidden; Kanban scrolls horizontally; tabs route inside the shell.
6. **Stale-card amber marker:** a card whose stage is non-terminal and `last_activity_at` is
   old shows the amber clock/dot and "needs follow-up". (Set an app's `last_activity_at` back
   ~10+ days via `SUPABASE_DB_URL`, view the board, then restore.)
7. **Edit form primitives:** open an application → **Edit**; confirm labelled inputs, helper
   text, ~9px radii, and primary/secondary button styling match the other forms.

## Desired output format
A markdown table — **# | Check | Result (✅/❌/⚠️) | Observed** — covering steps 1–7. For #9
include the **exact `occurred_at`** found (or "no row") and an explicit line:
**"Future date blocked in prod with a real interaction: yes/no; if a row saved, it was dated:
today/tomorrow."** Note the cleanup (final outcome/application counts) as in prior runs.
