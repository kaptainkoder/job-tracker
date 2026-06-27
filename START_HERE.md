# Job Tracker — start here

Starter kit pre-wired to minimize back-and-forth (built from analysis of the Subscription
Tracker sessions). What's here and the order to use it:

## Your first move (before any building)
1. **Fill `KICKOFF_BRIEF.md`** — especially §4 acceptance criteria and §9 "what wrong looks
   like." This is the single biggest lever you control.
2. **Fill the TODOs in `CLAUDE.md`** (stack, platform caps) once you've decided them — or leave
   them for the grill to resolve.
3. Run **`/session`** (or just describe the work). It will `/grill-me` the brief into locked
   criteria, write ONE plan file in `brainstorms/`, then build wave-by-wave with checkpoints.

## What's in the kit
| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Auto-loaded every session. Encodes file locations + how-I-work rules so they're not left to memory recall. **The #1 fix** from last project. |
| `KICKOFF_BRIEF.md` | Your "be very clear" template. Fill before building. |
| `memory/` | Lean index + carried-over feedback (file-locations, session-loop, ship-workflow, acceptance-criteria-first) + your profile. |
| `brainstorms/` | Plans, one per wave; `archive/` for shipped ones. See its README. |
| `docs/RUNBOOK.md` | Exact external-config click-paths, added once verified. |
| `fixtures/` | Messy real/redacted data = the test bar for data logic. |
| `.claude/skills/` | Carried-over `session`, `grill-me`, `plan-implement`, `roast`, `session-handoff`. |
| `.claude/plan-checkpoint.md` | Resume state between sessions. |

## The discipline that removes ~80% of the friction
- Acceptance criteria confirmed **before** code.
- One wave per session; checkpoint at ~20% context, don't compact.
- Every config click-path → RUNBOOK the moment it's verified.
- Opus for building; pick the model before you start.
