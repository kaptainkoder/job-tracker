# Codex prompt — A5 Outcome-loop + Privacy-log authenticated verification

**Status:** pending.
**Shipped commit:** see `git log` for `feat: A5 — outcome loop + privacy-log screen`.
**Target:** production `https://job-tracker-sage-two.vercel.app` (live Supabase
`bagecwuhpzaujioucjrt`). **Run after** the `0002_privacy_log_model.sql` migration is applied
(privacy "Model" column shows "—" until then, which is fine).

Already proven by Claude Code (don't re-do):
- Gate green (36 tests incl. 6 A5 outcome-domain tests).
- Anon RLS for `outcomes`: SELECT → `[]`, INSERT → `42501`.

---

## Paste this into Codex

> You are verifying the A5 outcome-loop and privacy-log of Job Tracker against live data. Sign in
> as the owner via magic link (account **karanvirendermahajan@gmail.com**; get the link from
> Gmail). Have at least one application on the board (create a throwaway "Globex / Data Engineer"
> if empty). Then:
> 1. **Log outcome** — open an application's detail → "Log outcome". Choose `Callback`, today's
>    date, note "recruiter call". Save. Confirm it appears in the Outcomes list with a Callback
>    pill, the note, and a relative time, and the detail stayed open.
> 2. **Future-date guard** — try logging an outcome dated in the future; confirm an inline error
>    blocks the save.
> 3. **Outcome → stage move** — log an `Offer` outcome with "also move to Offer" checked; confirm
>    the application moves to the Offer stage on the board and last-activity refreshes.
> 4. **Decoupled outcome** — log a `Ghosted` outcome; confirm no "also move" option appears and the
>    stage is unchanged.
> 5. **Owner RLS** — confirm the outcomes you logged are visible only to you (still listed after a
>    reload). In the Supabase SQL editor as owner, attempt an insert with a different `user_id` and
>    confirm `42501`:
>    `insert into outcomes (application_id, user_id, kind) values ('<your app id>','00000000-0000-0000-0000-000000000000','callback');`
> 6. **Privacy page** — open `/privacy`. With no Wave-B calls yet, confirm the empty state
>    ("Nothing has left your data yet"). (If you want to see the table, insert a throwaway
>    `privacy_log` row as owner via SQL, confirm it renders with target/action/model/sent/withheld/
>    hash/cost, then delete it.)
> 7. **Cleanup** — delete any throwaway application/outcome/privacy_log rows you created.
>
> Report in the format specified by the requester.

---

## Output format I want back

```
## A5 Outcome-loop + Privacy verification — <PASS | PARTIAL | FAIL>
Tested: <prod|local> · <UTC timestamp> · owner signed in: <yes/no> · migration 0002 applied: <yes/no>

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Log outcome appears in list, detail stays open | ✅/❌ | … |
| 2 | Future date blocked inline | ✅/❌ | … |
| 3 | Offer + "also move" advances stage | ✅/❌ | … |
| 4 | Ghosted: no move option, stage unchanged | ✅/❌ | … |
| 5 | Owner sees own outcomes; cross-UID insert 42501 | ✅/❌ | … |
| 6 | Privacy empty state / table renders model+manifest | ✅/❌ | … |
| 7 | Throwaway rows cleaned up | ✅/❌ | … |

Bugs found: <none | numbered repro list>
Console/network errors: <none | details>
```

Terse notes. For ❌, include exact error text / screenshot ref. Don't fix code — report only.
