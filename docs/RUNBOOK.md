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
> Karan does steps 1–4 in the dashboard; agent applies the migration (step 5) once it exists.
> Status: walked through 2026-06-27; mark "Last verified" once the app authenticates against it.

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
4. **Magic-link auth:** **Authentication → Sign In / Providers → Email** = **enabled** (this alone
   permits magic-link; the app calls `signInWithOtp`). Then critically set **"Allow new users to
   sign up" = ON** (else the first link sends but login fails — no account to create). **URL
   Configuration:** Site URL = `http://localhost:5173` for dev; under **Redirect URLs** add the
   prod URL `https://job-tracker-sage-two.vercel.app/**` (now known — deployed 2026-06-27).
   (Wrong Site URL / Redirect URLs = #1 cause of broken links.)
5. **Apply the migration** (`supabase/migrations/0001_init.sql` — exists as of A1):
   **SQL Editor → New query → paste the whole file → Run** (or `supabase db push` if CLI-linked).
   This one file creates **all 5 tables + RLS + the `resumes` storage bucket and its policies** —
   no need to create the bucket by hand. Verify: **Table Editor** shows `profile`, `applications`,
   `interview_events`, `outcomes`, `privacy_log`; **Storage** shows a private `resumes` bucket.
   Once env is also set on Vercel, `/api/health` flips `schemaReachable` from `null` → `true`.

Gotcha: free projects pause after ~7 days idle — first load after a quiet week is slow.

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
