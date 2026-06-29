# Runbook — verified external-config steps

> Every external-config click-path goes here, with EXACT steps (page → button → field).
> **Rule:** a step only lands here AFTER it's confirmed working in the live app. This is the
> single source of truth so the same "exactly tell me where do I change this" question never
> recurs across sessions.

## Hosting / deploy — Vercel
- **GitHub repo:** `github.com/kaptainkoder/job-tracker` (private). Default branch `main`.
- **Vercel project:** `kaptainkoders-projects/job-tracker` (scope `team_7Utt…`, prj `prj_abnN…`).
- **Prod URL:** https://job-tracker-sage-two.vercel.app — `/api/health` returns `{ok:true}`.
- **Deploys:** GitHub repo is connected, so **push to `main` = production deploy** automatically.
  Manual deploy from CLI: `vercel --prod --yes` (uploads the working dir; `.vercel/` is git-ignored).
- **Framework:** Vercel auto-detected Vite (build `vite build`, output `dist/`). `api/*.ts` files
  are picked up as serverless functions automatically — no config needed for them.
- **`vercel.json`:** one SPA-fallback rewrite — `"/((?!api/).*)" → "/index.html"` — so React-Router
  client routes (e.g. `/dashboard`) return 200 instead of 404. The `(?!api/)` keeps functions live.
- **First link (one-time, done):** `vercel link --yes --project job-tracker` (auto-created the
  project + connected the GitHub repo), then `vercel --prod --yes`.
- Verify: `curl -s https://job-tracker-sage-two.vercel.app/api/health` → `{"ok":true,...}`;
  `curl -o /dev/null -w "%{http_code}" .../dashboard` → `200`.
Last verified: 2026-06-27.

## Database / auth provider — Supabase (fresh project)
> Project `job_tracker` (`bagecwuhpzaujioucjrt`). Migration and browser auth configuration
> verified in the live dashboard on 2026-06-28.

1. **Create project:** https://supabase.com/dashboard → confirm correct **org** (top-left) →
   **New project**. Name `job-tracker`; **Generate a password** → save it in a password manager;
   pick the closest **Region**; Plan **Free**. **Create new project** (~1–2 min to provision).
2. **Grab credentials:** **Settings (gear) → API**. Copy **Project URL** and the
   **`anon` `public`** key. ⚠️ Use ONLY the `anon` key in the front-end — never `service_role`
   (it bypasses RLS; it goes only in `api/` env, never `VITE_`-prefixed).
3. **`.env.local`** (git-ignored) in the project root:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-public-key>
   ```
   The `VITE_` prefix is required for Vite to expose them to the browser.
4. **Magic-link auth:** **Authentication → Sign In / Providers** → under **User Signups**, set
   **Allow new users to sign up = ON** and **Confirm email = ON** → under **Auth Providers**,
   confirm **Email = Enabled**. Then **Authentication → URL Configuration** → set **Site URL** =
   `http://localhost:5173` → **Redirect URLs → Add URL** → add both
   `http://localhost:5173/**` and `https://job-tracker-sage-two.vercel.app/**` → **Save URLs**.
   Verified state: Email enabled, signups on, confirm-email on, 2 redirect URLs. End-to-end check:
   **app `/sign-in` → enter owner email → Email me a link → Gmail → Log In** opened `/tracker`;
   refresh kept the session; **Sign out** returned `/`; opening `/profile` redirected to
   `/sign-in?next=%2Fprofile` (verified 2026-06-28).
5. **Apply the migration** (`supabase/migrations/0001_init.sql`; applied 2026-06-28):
   **SQL Editor → New query → paste the whole file → Run** (or `supabase db push` if CLI-linked).
   This one file creates **all 5 tables + RLS + the `resumes` storage bucket and its policies** —
   no need to create the bucket by hand. Verified: **Table Editor** shows `profile`, `applications`,
   `interview_events`, `outcomes`, `privacy_log`; **Storage → Files** shows `resumes`; an anon REST
   read returns `[]`, while an anon insert is rejected with PostgreSQL `42501` (RLS enforced).
5b. **Apply later migrations programmatically (no manual SQL-editor paste).** Used for
   `0002_privacy_log_model.sql` on 2026-06-28. One-time: get the **direct** Postgres connection
   string — **Settings (gear) → Database → Connection string → URI** — and put it in `.env.local`
   (git-ignored) as `SUPABASE_DB_URL=postgresql://postgres:<DB-PASSWORD>@db.<project-ref>.supabase.co:5432/postgres`.
   (The DB password is the one saved at project creation; reset under **Settings → Database** if
   lost.) Then `npm i -D pg` and run a tiny node script that reads `SUPABASE_DB_URL` from
   `.env.local`, connects with `ssl:{rejectUnauthorized:false}`, runs the migration file's SQL, and
   verifies via `information_schema.columns`. Verified 2026-06-28: `privacy_log.model` is `text`,
   nullable. ⚠️ Never commit or echo the connection string; it stays in `.env.local` only.
   - **`0003_user_settings.sql` applied 2026-06-28** via this same `SUPABASE_DB_URL` path.
     Verified: `public.user_settings` exists (`user_id` PK, `model text default
     'anthropic/claude-sonnet-4-6'`, `no_log boolean default true`, `created_at`/`updated_at`),
     RLS enabled, policy `own user_settings` (ALL) present.
   - **`0004_profile_skills.sql` applied 2026-06-28** via this same `SUPABASE_DB_URL` path.
     Verified through `information_schema.columns`: `public.profile.skills` is `text[]`,
     `NOT NULL`, default `'{}'::text[]`; profile RLS remains enabled. Re-running the migration is
     safe (`add column if not exists`).
   - **`0005_artifacts.sql` applied 2026-06-28** via this same `SUPABASE_DB_URL` path.
     Verified directly in PostgreSQL: `public.artifacts` exists with RLS enabled, policy
     `own artifacts` is present, and deferred constraint `outcomes_artifact_id_fkey` points outcomes
     at generated artifacts. The migration is idempotent (policy recreated; FK catalog-guarded).
   - **`0006_structured_resume.sql` applied 2026-06-29** via this same `SUPABASE_DB_URL` path.
     Verified directly in PostgreSQL: `public.resume_structured` exists (PK `user_id`, `content`
     jsonb, `source_filename`, `parsed_at`/`confirmed_at`/`created_at`/`updated_at`) with RLS enabled
     and policy `own resume_structured` present. Idempotent (table/policy/trigger guarded).
6. **Vercel browser env:** from the linked project folder, run
   `vercel env add VITE_SUPABASE_URL production` and
   `vercel env add VITE_SUPABASE_ANON_KEY production`, then repeat with `development`. These four
   entries were set 2026-06-28. Preview env was intentionally left unset (no preview-branch flow).
   The anon key is designed to be public; RLS is the security boundary. Server-side
   `SUPABASE_SERVICE_ROLE_KEY` remains unset, so `/api/health` still reports
   `schemaReachable:null` until that optional deep-readiness probe is wired.
7. **Verify A3 owner profile + private resume:** local app → `/profile` → fill **Personal
   details**, **Current role**, and **Professional links** → **Save profile** → refresh `/profile`
   and confirm the saved values return. Under **Base resume** → **Upload PDF** → choose the base
   resume → confirm `base-resume.pdf is securely stored` → **Download** and confirm the download
   completes. The app writes one `profile` row keyed by the auth UID and stores the file at
   `<uid>/base-resume.pdf` in the private `resumes` bucket. Verified 2026-06-28 with the owner
   session: create/read/update, refresh persistence, upload/replace state, and authenticated
   download all succeeded.
8. **Verify A3 RLS isolation:** first run an anon REST read with the project URL + anon key; after
   the owner row exists, `GET /rest/v1/profile?select=id` must still return HTTP 200 with `[]`, and
   `GET /storage/v1/object/resumes/<uid>/base-resume.pdf` must fail. For a cross-UID authenticated
   proof: Supabase Dashboard → project `job_tracker` → **SQL Editor** → **Create a new query** →
   paste the rollback-only probe below → **Run**. Expected result is PostgreSQL `42501: new row
   violates row-level security policy for table "profile"`; no row is written.
   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
   insert into public.profile (id, full_name)
   values ('<owner-auth-uid>', 'RLS probe — must never persist');
   rollback;
   ```
   Verified 2026-06-28: anon profile read returned `[]`; anon resume request returned HTTP 400;
   cross-UID insert returned `42501`.
9. **Verify B2 profile skills:** authenticated app → **Profile → Skills → Your skills** → enter one
   truthful skill per line (for example `XGBoost`, `SQL`) → confirm **Also evidenced** visibly lists
   `Python, Machine learning` for XGBoost → **Save profile** → refresh `/profile` and confirm the
   skill lines persist. Anonymous profile reads must still return `[]`; a cross-UID authenticated
   update remains rejected by the existing `own profile` RLS policy. Production browser proof is
   staged at `docs/codex-tests/B2/B2-gap-verification.md`.

Last verified: 2026-06-28 by Codex session (dashboard + REST RLS check).

Gotcha: free projects pause after ~7 days idle — first load after a quiet week is slow.

## LLM provider — OpenRouter (server secret for `/api/llm`)
> The Wave-B `/api/llm` function reads `OPENROUTER_API_KEY` server-side only. It is **never**
> `VITE_`-prefixed and never reaches the browser bundle; only the model *choice* is user-facing
> (stored per-user in `user_settings`). Set 2026-06-28.

1. **Local:** put `OPENROUTER_API_KEY=<your-key>` in `.env.local` (git-ignored). Used by
   `vercel dev`; the browser never sees it.
2. **Vercel (prod + dev):** Dashboard → project `job-tracker` → **Settings → Environment
   Variables → Add New** → Key `OPENROUTER_API_KEY`, Value `<your-key>`, check **Production** and
   **Development** (leave Preview unchecked — no preview-branch flow) → **Save**. CLI equivalent:
   `vercel env add OPENROUTER_API_KEY production` then `… development`.
3. **Verify:** `vercel env ls` shows `OPENROUTER_API_KEY` for Development + Production (Encrypted).
   Confirmed 2026-06-28. End-to-end stream check is staged in
   `docs/codex-tests/B0/B0-settings-verification.md` (echo = free; ping = a few tokens).
Last verified: 2026-06-28.

## OAuth / external integrations
_TODO — consent screen, redirect URIs, scopes._

## Domains / DNS
_TODO._

---
### Template for a new entry
```
## <Provider> — <task>
1. Go to <exact page / URL>
2. Click <exact button/menu>
3. Set <field> = <value>
4. Verify: <what you should see when it worked>
Last verified: <date> by <session>
```
