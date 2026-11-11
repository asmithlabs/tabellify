# ADR-0006: Claude Code agent architecture

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (drafted)

## Context
Development is agent-assisted with Claude Code, which natively supports project
subagents (`.claude/agents/*.md`), project instructions (`CLAUDE.md`), permission rules
(`.claude/settings.json`), skills, worktree isolation, and running a session as an agent
(`claude --agent <name>`).

## Decision
- The **orchestrator** runs as the main session (`claude --agent orchestrator`), because
  coordination must happen where subagent summaries arrive and where the owner is.
- Specialist subagents: **architect** (docs only), **developer**, **tester**,
  **reviewer** (read-only: `Edit`/`Write` disallowed; fresh context for independence).
- Subagent nesting disabled (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`) so all delegation
  is visible in the orchestrator.
- Safety rules enforced by permissions, not just prompts: `ask` for push/merge/tag/
  install/release; `deny` for the Zotero data and profile folders.
- Worktree isolation only for parallel tasks with disjoint file scopes.
- No custom orchestration framework; agent teams not used initially.

## Consequences
Simple, native setup. Revisit when work volume justifies agent teams or skills.
