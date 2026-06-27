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
