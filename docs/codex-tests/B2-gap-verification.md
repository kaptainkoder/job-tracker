# B2 gap-interview evidence — authenticated production verification (for Codex)

> **Run status:** ready after migration `0004_profile_skills.sql` is applied and the B2 build is
> deployed to production.

Verify Wave B **B2** on production. B2 adds the truthful, user-editable profile evidence that the
gap engine consumes: `profile.skills text[]`, conservative skill extraction, implication-aware
evidence, and the pure pause-before-generate contract. This run verifies the live profile and RLS
boundary. Production code must not be changed.

Prod: `https://job-tracker-sage-two.vercel.app` · screen: `/profile` · owner:
`karanvirendermahajan@gmail.com` · Supabase project: `bagecwuhpzaujioucjrt`.

## Scope boundary — do not report this as missing

The per-JD **gap-interview modal is intentionally deferred to B3**, where the per-application
“Tailor for this job” flow is built from the approved Claude Design. B2 ships the tested gap domain
and its real, reviewable profile evidence source; it does not add a Tailor button or modal. Do not
look for or test that modal in this run.

Already proven locally by the release gate (do not re-derive in the browser): fixture-conservative
skill extraction; XGBoost implication expansion; required-minus-evidenced gap computation;
pause iff gaps exist; and confirmed-with-evidence versus future-suggestion resolution.

## Before starting

1. Confirm deployment is current and migration `0004_profile_skills.sql` has been applied:
   **Supabase Dashboard → project `job_tracker` → Table Editor → `profile` → columns → `skills`**.
   Expected: type `text[]`, `NOT NULL`, default `'{}'::text[]`.
2. Sign in as the owner using the magic link, then open `/profile`.
3. Copy the exact current contents of **Skills → Your skills** into the report as the redacted
   baseline (skill names only). Restore this exact list during cleanup. Do not alter other profile
   fields or the stored résumé.
4. Save screenshots under `docs/codex-tests/screenshots/<YYYY-MM-DD>-B2/`, one per numbered check
   where a visible state is relevant.

## Checks

1. **Migration + existing-value load** — `/profile` loads without an error and shows
   **Skills → Your skills**. Confirm the textarea reflects the current owner row's `skills` array
   (including an empty array as an empty textarea) rather than a placeholder value.

2. **Visible XGBoost implication review** — replace the textarea temporarily with exactly:
   ```text
   XGBoost
   ```
   Before saving, confirm a visible **Also evidenced** review panel says the entry implies both
   **Python** and **Machine learning**. This must be visible to the owner; the inferred skills must
   not be silently inserted as extra textarea lines.

3. **Blank + duplicate normalization** — replace the textarea with the following, preserving the
   blank lines, spaces, spelling, and duplicate casing:
   ```text
     XGBoost

   SQL
   xgboost

   sql
   ```
   Click **Save profile**. Expect `Profile saved.` and the textarea to normalize to exactly two
   lines, preserving the first spelling/order:
   ```text
   XGBoost
   SQL
   ```
   There must be no blank entry and no case-variant duplicate.

4. **Owner save + refresh/re-login persistence** — refresh `/profile`; expect the same two lines
   (`XGBoost`, `SQL`) and the visible **Also evidenced** panel with **Python** and
   **Machine learning**. Sign out, sign back in, and return to `/profile`; expect the same state.
   In **Supabase Dashboard → Table Editor → `profile` → owner row → `skills`**, confirm the stored
   value is exactly `{XGBoost,SQL}` (two elements only). This proves owner load, upsert, and
   persistence against the live column.

5. **Anonymous read + write denial for `profile.skills`** — while signed out, use the public
   project URL + anon key (the anon key is public) to run both probes:
   ```bash
   curl -sS -i "$SUPABASE_URL/rest/v1/profile?select=id,skills" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "authorization: Bearer $SUPABASE_ANON_KEY"

   curl -sS -i -X POST "$SUPABASE_URL/rest/v1/profile" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "content-type: application/json" \
     -H "prefer: return=representation" \
     -d '{"id":"00000000-0000-4000-8000-000000000002","skills":["RLS probe"]}'
   ```
   Expect the read to return HTTP 200 with exact body `[]`. Expect the write to be rejected with
   PostgreSQL code `42501` (`new row violates row-level security policy for table "profile"`).
   Record status and exact response body; confirm no probe row exists.

6. **Authenticated cross-UID denial for `profile.skills`** — get the real owner auth UID from
   **Supabase Dashboard → Authentication → Users → owner email → User UID**. Then go to
   **SQL Editor → Create a new query**, substitute that UID, and run this rollback-only probe:
   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
   insert into public.profile (id, skills)
   values ('<OWNER_AUTH_UID>', array['Cross-UID RLS probe']::text[]);
   rollback;
   ```
   Expect exact PostgreSQL code `42501`: `new row violates row-level security policy for table
   "profile"`. The existing owner row and its skills must remain unchanged.

7. **Light/dark design sanity** — on desktop (at least 1024px), inspect `/profile` once in light
   and once in dark mode. Confirm the Skills section uses the existing calm design primitives:
   readable label/helper copy, one blue accent, visible focus ring, flat card surfaces, legible
   textarea and implication panel, and no clipped/low-contrast text. Only Profile is active/blue in
   the navigation.

8. **Mobile sanity** — at 390×844, confirm `/profile` remains inside the app shell, desktop sidebar
   is hidden, the bottom navigation is visible with only Profile active, the Skills textarea and
   **Also evidenced** panel fit without page-level horizontal overflow, and **Save profile** is
   reachable and usable. Do not save another test value here.

9. **Cleanup** — restore the exact baseline skills copied before step 1 and click **Save profile**.
   Refresh once and confirm the baseline remains. Recheck the owner row in Table Editor; confirm
   there is still exactly one owner profile row, its `skills` equals the baseline, and neither RLS
   probe created a row. Restore the original theme and leave the owner signed in unless the initial
   state was signed out.

## Required output format

Return one markdown block in exactly this shape:

```text
## B2 gap-interview evidence verification — <PASS | PARTIAL | FAIL>
Tested: prod · <UTC timestamp> · owner signed in: <yes/no> · migration 0004: <applied/not applied> · theme: light+dark · viewport: desktop+390×844

| # | Check | Result | Observed |
|---|-------|--------|----------|
| 1 | Migration + owner skills load | ✅/❌/⚠️ | Column details; baseline loaded (redact anything sensitive) |
| 2 | XGBoost visibly implies Python + Machine learning | ✅/❌/⚠️ | Exact visible copy; inferred lines silently inserted: yes/no |
| 3 | Blank/duplicate normalization | ✅/❌/⚠️ | Exact textarea value and DB array after save |
| 4 | Owner save + refresh/re-login persistence | ✅/❌/⚠️ | Refresh result; re-login result; stored array |
| 5 | Anonymous profile.skills read/write isolation | ✅/❌/⚠️ | Read status/body; write status/code/body; row delta |
| 6 | Cross-UID profile.skills write rejected | ✅/❌/⚠️ | Exact PostgreSQL code/message; owner row unchanged yes/no |
| 7 | Desktop light/dark design sanity | ✅/❌/⚠️ | Light; dark; nav/focus/contrast notes; screenshot refs |
| 8 | Mobile 390×844 sanity | ✅/❌/⚠️ | Shell/nav/overflow/save reachability; screenshot ref |
| 9 | Cleanup restored baseline | ✅/❌/⚠️ | Final profile row count; final skills; theme/auth restored |

Owner skills save/load/refresh works: <yes/no>
XGBoost inference is visible and reviewable: <yes/no>
Anonymous and cross-UID access to profile.skills is denied: <yes/no>
Per-JD gap-interview modal: deferred to B3 by plan (not tested; not a B2 failure)

Bugs found: <none | numbered list with minimal repro, exact error, and screenshot/request reference>
Console/network errors: <none | exact details>
Screenshots: <count and directory>
Cleanup: baseline restored <yes/no>; unexpected profile rows <count>; probe rows persisted <count>
```

For any ❌, include the exact error/status/body and the smallest reliable repro. Do not fix code;
report only so the implementation session can triage and checkpoint the live result.
