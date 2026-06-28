# Codex prompt — A4 Dashboard authenticated verification

**Status:** run once via Codex 2026-06-28 (`A4-A5-live-verification-2026-06-28.md`). This prompt
was **corrected 2026-06-28** to match the approved A4 criteria — the prior version had two stale
expectations (it demanded Stage=`Applied` after parsing and all five sections on an empty board;
both contradicted the approved criteria, so they produced false ❌s). Re-run after Wave B **B-D0**,
which rebuilds the board as a per-stage **Kanban** dashboard — steps 1 and 4 will need re-wording
for columns at that point.
**Shipped commit:** `18fd577` — `feat: A4 — dashboard board, add/edit, stale surfacing`.
**Target:** production `https://job-tracker-sage-two.vercel.app` (or local `npm run dev` →
`http://localhost:5173` if you prefer; both hit the same live Supabase project
`bagecwuhpzaujioucjrt`).

Already proven by Claude Code (do NOT re-do, just be aware):
- Release gate green (typecheck + build + 30 tests, incl. 12 A4 domain tests).
- Anonymous RLS: `SELECT applications` → `[]`; anon `INSERT` → rejected `42501`.

---

## Paste this into Codex

> You are verifying the A4 dashboard of Job Tracker against live data. Sign in as the owner
> via magic link (account: **karanvirendermahajan@gmail.com** — retrieve the sign-in link from
> Gmail and open it). Then exercise the dashboard at
> `https://job-tracker-sage-two.vercel.app/tracker` and report results in the exact format
> below. Take a screenshot at each numbered step. **Clean up after yourself**: delete every
> application row you create during the test so the board ends as it started.
>
> Run these checks:
> 1. **Empty/initial state** — load `/tracker` with no applications. Confirm a clean **zero-apps
>    empty state** renders (with the "Add application" / "Add your first application" entry point).
>    Per the approved criteria, the five stage sections do NOT need to appear when there are zero
>    applications — a single empty state is correct. (Stage sections appear once rows exist.)
> 2. **Paste quick-add** — click Add application; into the paste box put the clean JD below;
>    click **Parse**. Confirm it prefills Company=`Acme Corp`, Role=`Senior Platform Engineer`,
>    a job link, and currency `USD`. **Stage must stay `Lead`** (quick-add defaults `lead`; you
>    advance stage manually later). Salary min/max stay blank (the parser fills currency only, not
>    amounts). Save.
>    Paste JD:
>    ```
>    Senior Platform Engineer at Acme Corp
>    Apply: https://jobs.acme.example.com/postings/senior-platform-engineer
>    Compensation: $150,000–$185,000 base.
>    ```
> 3. **Salary "unspecified"** — add a second application manually: Company=`Globex`,
>    Role=`Data Engineer`, leave salary blank, Stage=`Lead`. Confirm its card shows salary as
>    **"unspecified"** (never a guessed number).
> 4. **Board grouping** — both Acme and Globex default to **Lead**, so confirm both cards render
>    under the **Lead** group and the board groups cards by stage. (Regrouping after a stage change
>    is verified in step 6, where Globex moves to Applied and should jump to the Applied group.)
> 5. **Edit** — open the Globex card → Edit; change Role to `Senior Data Engineer`; save;
>    confirm the card updates.
> 6. **Stage change + date_applied** — on the Globex detail, change stage from Lead → Applied
>    via the dropdown. Confirm "Applied on" shows today's date and last-activity refreshes to
>    "just now"/"today".
> 7. **Detail view** — open the Acme card; confirm all populated fields show and blank fields
>    read "unspecified"; confirm the job link opens the posting in a new tab.
> 8. **Stale surfacing** — in the Supabase dashboard (SQL editor), set one of your test rows'
>    `last_activity_at` to 12 days ago:
>    `update applications set last_activity_at = now() - interval '12 days' where company = 'Globex';`
>    Reload `/tracker`. Confirm that card shows the **"needs follow-up"** stale flag and the
>    header shows a "1 needs follow-up" count. (Offer/Rejected rows must never be flagged.)
> 9. **Owner CRUD + cross-UID RLS** — confirm you (the owner) can create/read/update/delete your
>    own rows (covered above + delete in cleanup). Then, in the SQL editor as the owner, attempt:
>    `insert into applications (user_id, company, role) values ('00000000-0000-0000-0000-000000000000','X','Y');`
>    Confirm it is **rejected** (RLS `WITH CHECK` / `42501`) — proves you cannot write rows for
>    another user id.
> 10. **Cleanup** — delete all test rows you created (Acme, Globex) so the board is empty again.
>
> Report back in the format specified by the requester.

---

## Output format I want back (paste this requirement to Codex too)

Return a single markdown block:

```
## A4 Dashboard verification — <PASS | PARTIAL | FAIL>
Tested: <prod | local> · <UTC timestamp> · signed in as owner: <yes/no>

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Zero-apps empty state + Add button | ✅/❌ | … |
| 2 | Paste quick-add prefill (company/role/link/USD; stage stays Lead; amounts blank) | ✅/❌ | … |
| 3 | Blank salary → "unspecified" | ✅/❌ | … |
| 4 | Board grouping (both under Lead; regroups after stage change in step 6) | ✅/❌ | … |
| 5 | Edit persists | ✅/❌ | … |
| 6 | Stage change sets date_applied + bumps activity | ✅/❌ | … |
| 7 | Detail view + job link opens | ✅/❌ | … |
| 8 | Stale flag + "needs follow-up" count | ✅/❌ | … |
| 9 | Owner CRUD ok; cross-UID insert rejected 42501 | ✅/❌ | … |
| 10| Test rows cleaned up | ✅/❌ | … |

Bugs found: <none | numbered list with steps to reproduce>
Console/network errors: <none | details>
Screenshots: <count / where saved>
```

Keep notes terse. For any ❌, include the exact error text or screenshot reference and the
minimal repro. Do not fix code — just report; Claude Code will triage.
