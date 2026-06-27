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
  edit, stage-change, detail, stale surfacing, owner CRUD + cross-UID RLS. **Status: pending.**
