# Codex test prompts

Hand-off prompts for running **authenticated browser / live-data verification** that
Claude Code can't run itself (no paired Chrome extension in its session). Each file is a
self-contained prompt you can paste into Codex (or any agent with browser control + your
Gmail for the magic link). Run them when a chunk's code is shipped but its authenticated
end-to-end flow still needs a human-in-the-loop pass.

When a prompt is satisfied, paste Codex's summary back to Claude Code so it can fold the
result into `.Codex/plan-checkpoint.md` and `memory/`.

## Index
- [`A4-dashboard-verification.md`](A4-dashboard-verification.md) — dashboard board, add/paste,
  edit, stage-change, detail, stale surfacing, owner CRUD + cross-UID RLS. **Status: completed;
  see [`A4-A5-live-verification-2026-06-28.md`](A4-A5-live-verification-2026-06-28.md).**
- [`A5-outcomes-privacy-verification.md`](A5-outcomes-privacy-verification.md) — outcome logging,
  future-date guard, outcome→stage move, privacy-log screen, owner/cross-UID RLS. **Status:
  completed with a future-date failure; see
  [`A4-A5-live-verification-2026-06-28.md`](A4-A5-live-verification-2026-06-28.md).**
- [`B-D0-design-retrofit-verification.md`](B-D0-design-retrofit-verification.md) — canonical design
  retrofit + future-date regression re-check. **Status: partially completed; desktop passed,
  future-date failed, mobile/stale/Edit checks remain. See
  [`B-D0-live-verification-2026-06-28.md`](B-D0-live-verification-2026-06-28.md).**
- [`B0-settings-verification.md`](B0-settings-verification.md) — Settings persistence, streaming,
  real ping, auth guard, egress, RLS, and design. **Status: partially completed; core UI/stream/RLS
  passed, forged Bearer auth failed, mobile/egress tracing remain. See
  [`B0-live-verification-2026-06-28.md`](B0-live-verification-2026-06-28.md).**
- [`B0-auth-recheck-2026-06-28.md`](B0-auth-recheck-2026-06-28.md) — **re-check after fix:**
  forged/malformed/missing Bearer must now 401 (no paid action reachable); valid owner echo/ping
  still stream; also mobile nav + egress-host trace. **Status: ready to run.**
- [`B-D0-future-date-recheck-2026-06-28.md`](B-D0-future-date-recheck-2026-06-28.md) — **re-check
  after fix:** future-date outcome blocked in prod via a *real* interaction (records the DB
  `occurred_at`); plus mobile ≤640px, stale-card amber marker, Edit-form primitives. **Status:
  ready to run.**
