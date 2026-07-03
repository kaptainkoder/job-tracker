# Job Tracker — an LLM-native job-search copilot

**Live:** https://job-tracker-sage-two.vercel.app · built and shipped solo with an AI-assisted workflow (Claude Code + Codex as QA)

One place to run a job search end-to-end: track every application through its pipeline, and for each role generate a **tailored resume + interview-prep starter kit** — with the LLM doing the drafting and the human staying in control of every accepted edit.

## What it does

- **Application pipeline** — paste a JD or a messy recruiter InMail; a parser extracts role, company, salary and skills; track stage, outcomes, and follow-ups on a dashboard.
- **Explainable profile-fit scoring** — every job gets a fit score *with reasons* (matched vs. missing skills), not a black-box number.
- **Resume tailoring flow** — semantic, whole-resume bullet editing against a target JD: uniform bullet rhythm, holistic rewording, chronology checks, a live review panel, then export to a typeset PDF.
- **Gap analysis** — what the JD wants that the profile can't evidence, surfaced before you apply.
- **Structured profile as source of truth** — one profile surface; the structured resume drives everything downstream.

## LLM engineering (the interesting part)

- **BYO-key via OpenRouter** (default: Claude Sonnet), pinned to **no-log providers**, streamed token-by-token to the UI.
- **Server-side key isolation** — the browser never sees an LLM key; `api/` Vercel functions are thin entry points that verify the caller's Supabase JWT (`auth.getUser`) before any model call. A forged bearer token buys nothing.
- **Semantic diff review** — model output lands as reviewable per-bullet edits (accept/reject), never silent overwrites of the resume.
- **Fixtures as the quality bar** — `fixtures/` holds real-world messy inputs (recruiter InMails, negated-skills JDs, salary-free JDs); parsing and matching logic must pass them before a feature ships.

## Architecture

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript SPA (installable PWA) |
| UI | Tailwind + lucide-react; semantic CSS-variable token system, light + dark |
| Backend (secrets only) | Vercel serverless functions in `api/` (thin entry points) |
| Data / Auth / Storage | Supabase — Postgres + **Row Level Security** + magic-link auth + file storage |
| LLM | OpenRouter (BYO key), streamed, no-log providers |
| Hosting | Vercel |

All data CRUD goes from the browser straight to Supabase under Row Level Security; `api/`
functions exist only for calls that must hide a secret key server-side.

## Layout (feature-first)

```
api/                      # Vercel functions — thin entry points only
src/
  app/                    # shell: main, App, routing, global css
  shared/
    ui/                   # reusable presentational components
    lib/                  # browser-runtime infra (supabase client, theme)
    domain/               # environment-neutral pure logic (parser, stages) + tests
    types/                # shared domain types (mirror the DB schema)
  features/
    tracker/  profile/  tailor/  privacy/
supabase/migrations/      # SQL schema + RLS
fixtures/                 # representative messy real-world data — the bar for "done"
docs/                     # RUNBOOK + architecture notes
```

## Develop

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

## Quality gate

```bash
npm run gate                 # typecheck + build + domain tests
```

Every wave ships behind this gate; live-data and browser flows are verified by a second
agent (Codex) against staged verification scripts before release.

> Operational click-paths (Supabase, Vercel, deploy) live in [`docs/RUNBOOK.md`](./docs/RUNBOOK.md).
