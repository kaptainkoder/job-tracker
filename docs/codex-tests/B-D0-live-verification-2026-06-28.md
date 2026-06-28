# B-D0 production verification — 2026-06-28

Tested: prod · 2026-06-28T08:27:30Z · signed in as owner: yes · theme: light+dark

> Outcome: the desktop design retrofit is live and visually coherent, but the future-date outcome
> regression is **still present in production**. Mobile, stale-card, and Edit-form portions remain
> unverified because the responsive browser repeatedly timed out; they are not reported as passes.

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | App-shell (desktop ≥1024px) | ✅ | At 1440px the sidebar measured exactly 212px. Brand/nav and bottom theme/sign-out controls were present; only Tracker was blue. The content area was visually capped and offset to the right. |
| 2 | App-shell (mobile ≤640px) | ⚠️ | Not live-verified. A separate 390×844 browser session repeatedly timed out before navigation. Source still declares `md:hidden` mobile top/bottom bars and `md:flex` desktop sidebar, but source inspection is not a production pass. |
| 3 | Tracker dashboard | ✅ | Four StatCards rendered above the board: Total applications, In interview (amber dot), Offers (green dot), Response rate. Values used ink, not blue. |
| 4 | Response rate value | ✅ | Empty state showed `—`. With 1 Lead + 1 Applied + 1 Interviewing + 1 Offer + 1 Rejected, production showed `50%`. |
| 5 | Kanban board | ⚠️ | Desktop passed: five stage columns, dot+label+count headers, and `Nothing here.` for empty columns. Horizontal mobile scrolling was not live-verified. |
| 6 | JobCard | ⚠️ | Verified no stage pill; priority dots were High=red, Medium=amber, Low=grey; company/role/location/`unspecified`/last-touched rendered correctly. Stale-card amber clock/dot was not exercised before browser control stalled. |
| 7 | Near-monochrome / no emoji | ✅ | Only active/actionable controls used the blue accent; stage colors stayed in small dots/pills; no emoji appeared in product UI. |
| 8 | Light + dark parity | ✅ | Both themes flipped canvas/surfaces/text/borders cleanly. Keyboard tab focus produced a blue accent ring (computed blue ring ~4px with ~2px offset). |
| 9 | **Future-date outcome block** | **❌** | **Regression remains.** Date input had `max="2026-06-28"`; setting `2026-06-29` and clicking Log closed the form and inserted a Callback outcome. No inline “The date can’t be in the future.” error appeared. DB inspection confirmed one outcome row before cleanup. |
| 10 | Forms/buttons use the new primitives | ⚠️ | Add, Profile, and Sign-in forms showed labelled inputs/helper text and ~9px primitive radii; primary/secondary styling matched. Edit form was not separately exercised. |

## Bugs found

1. **Blocking regression re-check — future outcome date saves instead of being blocked**
   - Open any application → **Log outcome**.
   - Set Date to tomorrow (`2026-06-29` during this run; input `max` was `2026-06-28`).
   - Click **Log**.
   - Actual: form closes and a Callback outcome is inserted.
   - Expected: no insert; keep form open and show `The date can’t be in the future.` inline.
   - Important: `validateOutcomeForm` is unit-tested and is called in `handleLogOutcome`, so the
     existing unit pass does not explain the live behavior. Diagnose the controlled-input/submit
     path and add a UI-level regression test that asserts **zero Supabase insert calls**.

## Console/network notes

- No visible UI or request error occurred during successful CRUD/theme operations.
- Programmatic console-log collection timed out after the test run, so console silence is not
  claimed. No failing network state was visible in the UI.

## Cleanup

- Created five temporary applications prefixed `BD0` and one accidentally accepted future-date
  outcome.
- Deleted exactly those five applications through the existing local `SUPABASE_DB_URL`; cascade
  removed the outcome.
- Post-cleanup database counts: **0 applications, 0 outcomes**.
- Production code was not changed.

## Screenshots

- Checks 1, 3, 4, 5, 7, 8: [`B-D0-01-desktop-dark-empty.png`](screenshots/2026-06-28-B-D0/B-D0-01-desktop-dark-empty.png)
- Checks 1, 3, 4, 5, 7, 8: [`B-D0-02-desktop-light-empty.png`](screenshots/2026-06-28-B-D0/B-D0-02-desktop-light-empty.png)
- Checks 3–8: [`B-D0-03-desktop-light-five-stages.png`](screenshots/2026-06-28-B-D0/B-D0-03-desktop-light-five-stages.png)
- Checks 3–8: [`B-D0-04-desktop-dark-five-stages.png`](screenshots/2026-06-28-B-D0/B-D0-04-desktop-dark-five-stages.png)
- Check 9 failure: [`B-D0-05-future-date-incorrectly-saved.png`](screenshots/2026-06-28-B-D0/B-D0-05-future-date-incorrectly-saved.png)

## Paste into Claude Code

```text
Read docs/codex-tests/B-D0-live-verification-2026-06-28.md and treat the empirical production
result as authoritative. B-D0 desktop checks passed, but check #9 failed again: with the date
input max=2026-06-28, entering 2026-06-29 and clicking Log inserted an outcome and closed the form
instead of showing “The date can’t be in the future.” The DB contained that outcome before Codex
cleaned all test data back to 0 applications / 0 outcomes.

Diagnose and fix the live submit path; do not close this as “already unit-tested.” Add a UI-level
regression test around ApplicationDetail that sets tomorrow, submits, asserts the inline error,
asserts the form remains open, and asserts Supabase insert was never called. Keep the native max
attribute. Run the full gate, deploy, and stage a focused Codex re-check for #9. Also restage the
unverified mobile ≤640px, stale-card amber marker, and Edit-form primitive checks. Update
.Codex/plan-checkpoint.md and project-local memory with the actual result.
```
