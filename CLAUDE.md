# Project: Job Tracker

A personal job-application tracker for Karan. Status: greenfield (Day 0).
Replace the TODOs in this file and in `KICKOFF_BRIEF.md` before the first build session.

---

## File locations — OVERRIDE your defaults (do not skip)
Your built-in auto-memory prompt points at `~/.claude/projects/<slug>/memory/`. **Ignore it
for this project.** Everything lives in the project folder:

- **Memory** → `./memory/` — one fact per file, indexed in `./memory/MEMORY.md`. Never write
  memory to `~/.claude/…`.
- **Plans** → `./brainstorms/` — dated, one file per feature/wave. Shipped plans move to
  `./brainstorms/archive/`.
- **Runbook** → `./docs/RUNBOOK.md` — every external-config click-path, added once verified.
- **Test fixtures** → `./fixtures/` — representative real/redacted data; the bar for "done".
- **Resume state** → `./.claude/plan-checkpoint.md`.

> This rule was corrected 4+ times on the previous project. It is non-negotiable here.

## How I want you to work
- **Acceptance criteria first.** Before building anything non-trivial, restate the goal and
  list testable acceptance criteria, then wait for my 👍. One confirmed interpretation beats
  three guesses. (Past failure: "No, that's not what I meant" after building the wrong thing.)
- **One wave per session.** Scope each session so it finishes with ~20% context left.
  Checkpoint and stop rather than running into a forced compaction. (Past: 12 compactions.)
- **Default loop is `/session`** — ORIENT → PLAN → IMPLEMENT → SHIP. It wraps `grill-me`
  (lock scope + acceptance criteria) and `plan-implement` (build in chunks). One plan file
  per loop: the grill brainstorm *is* the plan — append `## Implementation Plan` into it; do
  not create a second plan file.
- **Exact click-paths for config/deploy** (page → button → field), never prose. Add each
  verified path to `docs/RUNBOOK.md` so it's never re-derived. (Past: "exactly tell me where".)
- **Fixtures are the test bar.** For any parsing/matching/data logic, show me the failing
  cases against `fixtures/` first, then fix. (Past: wrong amounts, mis-classified records.)
- **Hand off un-self-drivable verification — standing rule, don't make me re-ask.** Any test or
  acceptance check you can't run yourself this session — authenticated / live-data flows, browser
  or visual checks when no Chrome extension is paired, anything needing a real login, device, or a
  live LLM you lack — gets staged as a *ready-to-run prompt + the exact desired output format*
  under `docs/codex-tests/<chunk>-verification.md`, and referenced in the plan, memory, AND
  checkpoint so Codex (or a browser agent) can run it and report back. Never silently skip it or
  report it "verified" when you didn't watch it pass. Lead by example: stage it as part of SHIP,
  unprompted. When a later Codex report contradicts what the code looks like it does, trust the
  empirical result enough to re-verify in prod — don't dismiss it.
- **Bundle independent work**; never edit the same file from parallel agents.
- **Ship is automatic** once the release gate passes (build/tests green): commit + push +
  update memory, no need to ask. Surface anything partial instead of shipping it.

## Model & session
- Default to **Opus for implementation/architecture**; use a cheaper pass for bulk QA only.
- Pick the model *before* starting a session — don't start one you'll abandon to switch.

## Hard constraints
- Secrets / `.env` stay local, never committed. Repo is private.
- Personal project for Karan only (not a team/commercial product) — keep scope tight.
- TODO: <platform caps — e.g. hosting function limits, free-tier quotas>
- Production code is not edited during testing without explicit approval.

## Stack & external services
- TODO: <frontend / backend / DB / auth / hosting — fill after the kickoff grill>
- TODO: <external integrations this touches — fill into docs/RUNBOOK.md as set up>
