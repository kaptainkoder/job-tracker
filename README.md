# Job Tracker

A private, single place to run a job search end-to-end: track every application and, for each
role, generate a tailored application + interview-prep starter kit. Personal tool for Karan.

> **Source of truth for architecture.** Scope and acceptance criteria live in
> [`KICKOFF_BRIEF.md`](./KICKOFF_BRIEF.md); operational click-paths in [`docs/RUNBOOK.md`](./docs/RUNBOOK.md).

## Architecture

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript SPA (installable PWA) |
| UI | Tailwind + lucide-react; semantic CSS-variable token system, light + dark |
| Backend (secrets only) | Vercel serverless functions in `api/` (thin entry points) |
| Data / Auth / Storage | Supabase — Postgres + RLS + magic-link auth + file storage |
| LLM | OpenRouter (BYO key), default Claude Sonnet 4.6, no-log providers, streamed |
| Hosting | Vercel |

All data CRUD goes from the browser straight to Supabase under Row Level Security; `api/`
functions exist only for calls that must hide a secret key server-side (OpenRouter, EnhanceCV).

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
    tracker/  profile/  privacy/
supabase/migrations/      # SQL schema + RLS
fixtures/                 # representative data — the bar for "done"
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

CI + ESLint: fast-follow (tracked in the Wave A plan).
