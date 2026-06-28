# B-D0 — design-retrofit production verification (for Codex)

**Why this exists:** Claude Code shipped B-D0 (commit `e49f5a4`, prod
`https://job-tracker-sage-two.vercel.app`) but had no paired Chrome extension to verify the new
UI itself. Run the checks below signed in as the owner, in **both light and dark**, and report
back in the table format at the bottom. Production code must not be changed; delete any test
applications afterward so the tracker ends empty.

## What shipped in B-D0 (the design source of truth)
The whole app was retrofitted to the canonical Claude Design (`--ds-*` tokens, `src/shared/ui/`
primitives). Compare against the design project "Job Tracker Application Design"
(`claude.ai/design/p/91fbbf92-a760-4bfc-89d9-b12d019a0c93`), especially
`ui_kits/job-tracker/index.html` + the board screenshots.

## Checks

| # | Check | Expected |
|---|-------|----------|
| 1 | **App-shell (desktop ≥1024px)** | A **212px left sidebar** (Brand, Tracker/Profile/Privacy nav, theme toggle + sign-out at the bottom); content sits to its right, capped ~1180px. Only the active nav item is blue. |
| 2 | **App-shell (mobile ≤640px)** | Sidebar is gone; a slim **sticky top bar** (Brand + theme + sign-out) and a **bottom tab bar** (3 nav items) appear. Active tab is blue. |
| 3 | **Tracker dashboard** | Above the board: **4 StatCards** — Total applications / In interview (amber dot) / Offers (green dot) / Response rate. Numbers are ink-colored, not blue. |
| 4 | **Response rate value** | With a known set (e.g. 1 lead, 1 applied, 1 interviewing, 1 offer, 1 rejected) it reads **50%** (interviews+offers ÷ submitted). With zero submitted it reads **"—"**, never "0%". *(Formula is pending Karan's final confirmation — report the value you see.)* |
| 5 | **Kanban board** | One column per stage (Lead/Applied/Interviewing/Offer/Rejected), each with a dot+label header and a count. On mobile the board **scrolls horizontally**. Empty columns show "Nothing here." |
| 6 | **JobCard** | Cards carry **no stage pill** (stage = the column). Each shows a priority eyebrow (High=red dot, **Medium=amber dot**, Low=grey dot), company, role, `location · salary`, and last-touched. A **stale** active card shows an **amber** clock/dot. Salary with no amounts reads exactly **"unspecified"**. |
| 7 | **Near-monochrome / no emoji** | One blue accent marks only actionable/active things; stage hues appear only as small dots / tint pills; no large colored fills; no emoji anywhere in the product UI. |
| 8 | **Light + dark parity** | Toggle theme: every surface/text/border flips cleanly; the always-visible 2px accent focus ring works when tabbing. |
| 9 | **⚠️ Future-date outcome block (REGRESSION RE-CHECK)** | Application detail → Log outcome → set the date to **tomorrow** → Log. **Expected: an inline error "The date can't be in the future." blocks the save** (the native date picker should also cap at today via `max`). *A prior Codex report (A5) saw this NOT enforced in prod — confirm it is fixed now.* |
| 10 | **Forms/buttons use the new primitives** | Add/Edit form, Profile form, and Sign-in use the Input primitive (label + helper/error); buttons are the new Button (primary blue / secondary bordered / danger red), radius ~9px. |

## Desired output
Reproduce the table above with a **Result** column (✅ / ❌) and a **Notes** column, plus:
- a one-line header: `Tested: prod · <UTC timestamp> · signed in as owner: yes · theme: light+dark`
- a **Bugs found** list (minimal repro each), and any console/network errors,
- screenshots under `docs/codex-tests/screenshots/<date>-B-D0/` referenced by check number.

Flag check #9 prominently — it's the one regression re-check Claude could not self-verify.
