# Kickoff Brief — Job Tracker

> Reshaped after a `/roast` council verdict (RESHAPE, high confidence): keep the tracker +
> per-job prep/tailoring engine; CUT LinkedIn scraping/auto-apply. See `brainstorms/` for the
> full verdict if archived.
> **Stack + key decisions locked 2026-06-27** via `/grill-me` — see
> `brainstorms/2026-06-27-stack-and-decisions-grill.md`. No open `TODO`s remain; ready for Wave A.

## 1. One-sentence goal
A private, single place to run my job search end-to-end: track every application
(applied → interviewing → offer/rejected) **and**, for each role, generate a tailored
application + interview-prep "starter kit" — so I land one or more offers.

## 2. Who + why
- User: Karan (personal use first, cross-device — MacBook + Android). Possible product later.
- Job it does: stop juggling a spreadsheet + ChatGPT + EnhanceCV across tabs; make the
  **night-before-interview prep** and the **per-job tailoring** fast, specific, and trustworthy —
  and learn from what actually wins (outcome loop).

## 3. Scope
**In scope (round 1 — the validated core):**
- Tracker dashboard: jobs as Lead / applied / in-interview (with timelines) / offered / rejected.
- My profile store: personal info, current job, LinkedIn URL, GitHub, base resume.
- **Lead capture (broadened input parser):** paste/forward *anything you receive* — a full JD, a
  partial recruiter InMail, a LinkedIn post snippet, or just a form link + a line of context. The
  parser pulls out company/role/link/recruiter where present and marks the rest **"unspecified"**
  (never invents). It lands as a **"Lead"** card (a stage before "Applied"); promote to a full
  application + run the tailor kit once there's enough info; a form-only lead just holds the link
  + a follow-up nudge. This is NOT a LinkedIn integration — see §3 out-of-scope red line.
- **Paste-a-JD → per-job starter kit:** tailored resume + cover letter (own in-app PDF renderer;
  EnhanceCV export is a deferred-optional toggle, not a dependency), company memory cards, a
  role-specific prep plan with resources, likely interview questions, and suggested
  GitHub/personal-project additions to strengthen the application.
- **Tailor gap-interview:** when a JD wants a skill not evidenced in my profile, the app **asks
  before generating** — "you have this? tell me what shows it and I'll add it truthfully; if not,
  I'll keep it as a future-suggestion" — so a real-but-unlisted skill is never lost and nothing
  is ever fabricated.
- **Outcome loop:** log *what artifact was sent* → *what happened* (callback/reject/offer), so
  later kits get sharper. Build this from day one — it's the only thing that compounds.
- LLM via OpenRouter with **my own key** (privacy-first; near-zero inference cost).

**Out of scope (explicitly NOT now):**
- ❌ LinkedIn feed scraping / easy-apply scraping / **auto-apply** — cut entirely (ToS ban risk
  to my real account; auto-apply doesn't land interviews; brittle to maintain). Job *discovery*
  is manual paste-a-JD in round 1; an official Jobs API / careers-page ingester / RSS is a
  *later* maybe — never a logged-in feed scraper.
  - **Boundary on Lead capture (§3 in-scope):** the app **never logs into LinkedIn and never
    auto-reads my InMails.** I feed it content I already received (paste/forward); it only
    parses. Pasting a recruiter InMail is fine; the app reaching into LinkedIn is the cut red
    line. (Later maybe: I *forward* LinkedIn notification emails via Gmail — still me-initiated.)
- ❌ Multi-user / sharing / commercial billing.
- ❌ Building it as a substitute for referrals + interview reps (the real needle-movers).

## 4. Acceptance criteria (testable — the bar for "done")
- [ ] Given a pasted job description, when I click "tailor", then I get a resume + cover letter
      specific to that JD that I'd send with **only light edits** (beats my 10-min ChatGPT hack).
- [ ] Given a job card the night before an interview, when I open it, then I see company memory
      cards + ≥5 likely questions + a role-specific prep plan — without me re-prompting an LLM.
- [ ] Given an application I sent, when its outcome changes (callback/reject/offer), then the
      sent artifact and outcome are linked and visible in one place.
- [ ] Given the dashboard, when I open it, then every application's stage + last-activity date is
      visible, and stale-but-active ones surface for follow-up.
- [ ] **Privacy is visibly provable.** Given any tailored output, when I open its privacy entry,
      then I see exactly what categories of my data were sent, what was withheld, and the cost —
      and nothing left my DB to a third party (OpenRouter / EnhanceCV) without appearing there.
- [ ] **No fabrication, with a gap-interview.** Given a JD that wants a skill not evidenced in my
      profile, when I tailor, then the app asks me before generating: if I confirm I have it (and
      say what shows it) it's added truthfully; otherwise it's kept as a future-suggestion, never
      claimed.
- [ ] **Cross-device works end-to-end.** Given I add a job on my Mac, when I open the app on my
      Android home-screen PWA, then it's there — and I get the night-before push on my phone.
- [ ] **Salary honesty.** Given a JD with no clear salary, when I save it, then the field shows
      "unspecified" — never a guessed number.

## 5. Data / edge cases that must be right (real example each)
- Same company, two roles = two separate applications, not merged.
- A rejection (or rejection email I paste) moves the card to Rejected, it is NOT deleted.
- CTC/salary parsing: if it's uncertain, show "unspecified" — never invent a number (the Buyer
  said one wrong salary kills trust in the whole tool).
- Tailored resume must not fabricate experience/skills I don't have — surface gaps as
  *suggestions to add*, never as claims.
- Date/timezone handling for interview reminders.

## 6. Constraints
- **Stack (locked — mirrors the proven Subscription Tracker):**
  - **Frontend:** Vite + React + TypeScript SPA (installable PWA for Android/Mac).
  - **UI:** Tailwind + lucide-react + chart.js. Design = Linear-like calm minimal, card-based;
    reuse the Sub Tracker semantic-token system (`canvas/surface/accent/ink/status`, Inter,
    card shadows, rounded, **light + dark mode**).
  - **Backend (secrets only):** Vercel `/api` serverless functions, consolidated to 1–2
    action-routed functions (all data CRUD goes client-side straight to Supabase via RLS, so
    function count stays ~2–3, well under the 12 cap).
  - **DB + Auth + Storage:** Supabase — **fresh project** (same account as Sub Tracker), Postgres
    + **magic-link email auth** + file storage. Every row user-scoped via RLS from day one →
    multi-user later = flip on signups, no rearchitecture.
  - **LLM:** OpenRouter, BYO key. Default **Claude Sonnet 4.6** (`anthropic/claude-sonnet-4-6`),
    user-swappable in Settings; **"no-log / zero-retention providers only" toggle ON** by default.
    **Stream responses by default** (keeps calls under the Vercel timeout; feels live).
  - **Reminders:** web-push (reused from Sub Tracker) + a daily **Vercel Cron** that checks
    Supabase for upcoming interviews + stale-active apps. Push-only now; email backup deferred.
- Secrets/keys (OpenRouter, EnhanceCV) stay local, never committed.  ·  Privacy: a visible,
  layered **outbound-call log** (pre-flight gate on first-of-type / full-PII calls + permanent
  audit log; stores **manifest + hash**, not full payloads) makes "see exactly what data leaves
  and where" testable. Only two egress targets exist: OpenRouter, EnhanceCV.
- **EnhanceCV (resolved):** real API exists but requires the **Business Plus** plan (Karan's Pro
  sub won't include it). → Round 1 builds our **own in-app PDF renderer** (zero third-party PII
  egress, no dependency); EnhanceCV export is a deferred-optional toggle, tested manually first
  via the existing Pro web app. (→ docs/RUNBOOK.md when/if wired.)
- **Platform caps (all free tiers):** Vercel Hobby — 12 functions (use ~2–3), 100 GB bandwidth,
  daily-granularity cron, **function timeout ~10–60s** (mitigated by streaming LLM calls; Supabase
  Edge Functions are the escape hatch).  ·  Supabase free — 500 MB DB, 1 GB storage, 50k MAU;
  **free projects pause after ~7 days idle** (first load after a quiet week is slow — fine for
  personal use).  ·  OpenRouter — no free tier; BYO credits, ~cents per starter kit.

## 7. External config this touches (→ goes in docs/RUNBOOK.md as set up)
- OpenRouter API key (BYO) + no-log provider routing.  ·  EnhanceCV (Pro now for manual export;
  Business Plus only if/when API round-trip is wired).  ·  Vercel project + Cron + web-push (VAPID)
  keys.  ·  Supabase fresh project (URL, anon key, RLS policies, magic-link email).  ·  GitHub:
  the private repo for this app (this folder is not a git repo yet — `git init` in Wave A), plus
  Karan's GitHub for project-suggestion context.

## 8. Model + session plan
- Model: Opus for build.  Budget per wave: finish ≤50% context, then checkpoint + stop.
- Waves (one session each):
  - **Wave A** — Supabase + RLS + magic-link auth; data model (incl. **Lead** stage); tracker
    dashboard + profile store + **outcome-loop logging** + the privacy outbound-call log shell.
  - **Wave B** — lead capture / paste-JD parser → tailored resume + cover letter via **own in-app
    PDF renderer** (streaming LLM), incl. the **gap-interview** step. EnhanceCV export deferred.
    → then the **validation gate** (below) before Waves C/D.
  - **Wave C** — prep kit: company cards, likely questions, prep plan, project suggestions.
  - **Wave D** — outcome analytics (what framing converts) + polish.
  - (Auto-apply / scraping intentionally absent.)

## 9. What "wrong" looks like (pre-empt the "that's not what I meant")
- ❌ Do NOT build LinkedIn scraping or auto-apply, even "just a small version." It's cut.
- ❌ Do NOT make this a generic CRM or a personal-finance app — it's job-search-and-prep only.
- ❌ Tracking is NOT the hook — prep + tailoring quality is. Don't over-invest in dashboard
   polish before the starter kit genuinely beats my ChatGPT+EnhanceCV combo.
- ❌ No generic LLM mush — if the tailored output needs a full rewrite, it failed.
- ❌ No invented data (salary, skills, matches). Uncertain = say so.
- ❌ Don't let building the tool replace actual applying/networking.

---
### ⚠️ Validation gate — after Wave B, before Waves C/D
(Replaces the original "hand-run it in ChatGPT+EnhanceCV first" gate — dropped because juggling
multiple apps/prompts is exactly the pain this tool exists to kill.) Once Wave B ships the tailor
feature, run it **through the app** on your next **2–3 real postings**. Only invest in Waves C/D
if the output genuinely beats your current 10-minute hack AND you actually open the prep card the
night before. If it doesn't clear that bar → stop and rethink rather than building more.
