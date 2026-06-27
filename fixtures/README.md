# fixtures/

Representative, redacted real data — the **test bar** for any parsing/matching/data logic.

Build 15–20 of the *messy* cases BEFORE writing the logic that consumes them, so Claude can see
the cases it's getting wrong instead of you discovering them one correction at a time (the prior
project hit repeated "wrong amount / mis-classified record" rounds for exactly this reason).

For Job Tracker, good fixtures might include:
- application confirmation emails (varied formats / companies)
- rejection emails (so a card moves to Rejected, not deleted)
- interview-invite emails (timezone-sensitive dates)
- same company / two roles (must stay two applications)
- recruiter outreach vs an application you initiated

Redact personal data. Reference these in acceptance criteria; show failing cases first, then fix.

## Current fixtures (A1 seed set)

Wired into the release gate via `src/shared/domain/parser.test.ts`. **The contract that
matters is no-fabrication:** when a field isn't clearly present, the parser leaves it `null`
(UI shows "unspecified"), never guesses.

| Fixture | Represents | Gate asserts |
|---|---|---|
| `clean-jd.txt` | Full, structured JD: role, company, link, salary | role + company + URL extracted; currency = USD; stage → `applied` |
| `no-salary-jd.txt` | JD with no salary stated | `salary_*` stay `null` — never guessed |
| `form-only-lead.txt` | Just an application link | URL captured; stage → `lead` |
| `messy-recruiter-inmail.txt` | Conversational InMail, role/company in prose | never throws; URL captured (rich extraction deferred to Wave B) |

The seed parser (`src/shared/domain/parser.ts`) is deliberately conservative — it would
rather miss a field than invent one. The messy InMail is the known-hard case Wave B's richer
extraction will improve; the gate locks only the invariants that must hold today. The broader
"15–20 messy cases" set above (confirmation/rejection/invite emails, etc.) lands with Wave B.
