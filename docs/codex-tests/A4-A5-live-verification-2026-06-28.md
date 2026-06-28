# A4 + A5 production browser verification

Claude handoff from Codex. Production code was not changed. All test applications and their
cascaded outcomes were deleted after testing; the tracker ended empty. Evidence is in
[`screenshots/2026-06-28-A4-A5/`](screenshots/2026-06-28-A4-A5/).

## A4 Dashboard verification — PARTIAL
Tested: prod · 2026-06-28T06:53:45Z · signed in as owner: yes

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Five stage sections + Add button | ❌ | Add button renders, but a zero-row tracker replaces all five sections with the global “No applications yet” state. See `A4-01-initial-state.png`. |
| 2 | Paste quick-add prefill (company/role/link/USD/Applied) | ❌ | Company, role, link, and USD prefilled; Stage remained `Lead`, not `Applied`. Salary min/max stayed blank. See `A4-02-parse-prefill-stage-bug.png`. |
| 3 | Blank salary → "unspecified" | ✅ | Globex card showed exactly “unspecified”. |
| 4 | Board grouping (Acme→Applied, Globex→Lead) | ✅ | Acme was manually changed to Applied after check 2 exposed the prefill mismatch; grouping then rendered correctly. |
| 5 | Edit persists | ✅ | `Data Engineer` → `Senior Data Engineer` persisted and re-rendered. |
| 6 | Stage change sets date_applied + bumps activity | ✅ | Lead→Applied set `Applied on` to `2026-06-28` and `Last activity` to “just now”. |
| 7 | Detail view + job link opens | ✅ | Populated and unspecified fields rendered correctly. Link contract is `target="_blank" rel="noopener noreferrer"`; the supplied `.example.com` host predictably does not resolve. |
| 8 | Stale flag + "needs follow-up" count | ✅ | Backdating Globex by 12 days produced the clock stale marker/“1w ago”, literal “needs follow-up” in detail, and header “1 needs follow-up”. |
| 9 | Owner CRUD ok; cross-UID insert rejected 42501 | ✅ | Owner create/read/update/delete passed. In a simulated authenticated-owner SQL context, the cross-UID insert returned exact `42501: new row violates row-level security policy for table "applications"`. |
| 10| Test rows cleaned up | ✅ | Acme and Globex deleted through the UI; tracker returned to “No applications yet”. |

Bugs found:
1. Zero-row tracker does not render the five stage sections required by the Codex test prompt. Repro: sign in with no applications → open `/tracker`.
2. The clean-JD quick parser leaves Stage at `Lead` instead of `Applied`. Repro: Add application → paste the supplied Acme JD → Parse.

Console/network errors: no app console errors. The only navigation failure was expected DNS
`ERR_NAME_NOT_RESOLVED` for the supplied placeholder host `jobs.acme.example.com`.

Screenshots: 10 in `docs/codex-tests/screenshots/2026-06-28-A4-A5/` (`A4-01` … `A4-10`).

## A5 Outcome-loop + Privacy verification — PARTIAL
Tested: prod · 2026-06-28T06:53:45Z · owner signed in: yes · migration 0002 applied: yes

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Log outcome appears in list, detail stays open | ✅ | Callback + note “recruiter call” appeared with a Callback pill and “just now”; detail stayed open. |
| 2 | Future date blocked inline | ❌ | Date input accepted `2026-06-29` and save completed. No inline error appeared; the persisted list included note “future guard test”. |
| 3 | Offer + "also move" advances stage | ✅ | Offer exposed a checked “Also move this application to Offer”; save moved Globex from Lead to Offer and refreshed activity. |
| 4 | Ghosted: no move option, stage unchanged | ✅ | Ghosted rendered no move checkbox (`count=0`), saved successfully, and stage remained Offer. |
| 5 | Owner sees own outcomes; cross-UID insert 42501 | ✅ | All outcomes remained after reload. In a simulated authenticated-owner SQL context, cross-UID insert returned exact `42501` for table `outcomes`. |
| 6 | Privacy empty state / table renders model+manifest | ✅ | `/privacy` showed “Nothing has left your data yet” and the Wave-B explanation. Live migration 0002 is recorded verified (`privacy_log.model text nullable`) in `docs/RUNBOOK.md` and commit `dbf0ee7`. |
| 7 | Throwaway rows cleaned up | ✅ | Deleting the throwaway application cascaded its outcomes; tracker ended empty. No privacy row was inserted. |

Bugs found:
1. Future-date outcome validation is not enforced in production. Minimal repro: application detail → Log outcome → Date `2026-06-29` (tested on `2026-06-28`) → Log. Expected inline block; actual form closes and outcome persists.

Console/network errors: none observed in the app console.

Screenshots: 6 A5 evidence images in `docs/codex-tests/screenshots/2026-06-28-A4-A5/` (`A5-01` … `A5-06`).

## Design-alignment note from Karan

Karan flagged during testing that the intended dashboard design had a Kanban board. The current
production tracker is a vertically stacked stage board, not Kanban.

This is not presently documented as a temporary visual placeholder:

- `brainstorms/2026-06-27-stack-and-decisions-grill.md` A4 criterion 1 explicitly approved
  “vertical stage sections”.
- The same A4 scope explicitly puts drag-and-drop out of scope.
- `KICKOFF_BRIEF.md` says only “Linear-like calm minimal, card-based”; it does not promise a later
  Kanban conversion, and no later wave currently owns one.

Treat this as a design/scope alignment gap. Do not reassure Karan that a Kanban is already planned
for a later wave; it is not in the current written roadmap. Reconfirm the desired desktop/mobile
Kanban behavior and assign it to an explicit wave before further dashboard polish.

## Test-spec contradictions for Claude to triage

- The A4 browser prompt requires Stage=`Applied` after parsing the supplied JD, while the approved
  A4 criterion says new/pasted leads default to `lead`.
- The browser prompt requires all five stage sections on the empty tracker, while the approved A4
  criterion allows both empty stages and a separate zero-apps empty state without stating they must
  appear simultaneously.

The two A4 failures above are real failures against the handoff prompt, but may represent stale or
misaligned test expectations rather than regressions. Resolve the intended behavior with Karan
before changing production code.
