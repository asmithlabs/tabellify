# ADR-0011: Security review process (security-auditor, SECURITY.md)

- **Status:** Accepted (owner, 2026-11-12)
- **Date:** 2026-11-12
- **Deciders:** Antonio Smith (owner), Claude (orchestrator, drafted)

## Context
Tabellify runs as privileged code inside Zotero, displays text from users' libraries (which
can come from shared libraries and imported records), will export files, ships updates from
GitHub, and may later send paper content to AI services. The general code review covers some
security points but not a full threat model, and its reviewer has seen the feature's context.

## Decision
- A `security-auditor` agent (`.claude/agents/security-auditor.md`) audits with fresh context,
  read-only (no Edit/Write; Bash for read-only commands only), against a fixed threat model:
  untrusted library text in privileged DOM, CSV/XLSX formula injection, export paths and
  overwrite, library writes and Zotero internals, the update path and repository security,
  supply chain (dependencies, lockfile, GitHub Actions pinned to commit SHAs), future AI
  features (prompt injection, API keys, data sent externally), and secrets in the repo.
- Each finding has an ID, severity, file:line, attack scenario, proposed fix and a way to
  verify the fix. No working exploit code; proof-of-concept steps only, dev profile only.
- Workflow: security-auditor runs on every feature after reviewer and before docs-writer.
  Critical and high findings block the PR until fixed (developer) and re-audited. A full audit
  runs before every release.
- Confidentiality: findings go to the orchestrator only. Open findings are saved in
  `build/security/` (gitignored) and never committed; only fixed issues are summarized in the
  changelog.
- `SECURITY.md` asks reporters to use GitHub private vulnerability reporting, lists supported
  versions, and asks for no public issues about vulnerabilities.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Rely on the reviewer's security checklist | No extra step | Shares context with the feature; no full threat model |
| External audit only before releases | Independent | Late and costly; misses issues per feature |
| Publish all findings openly | Transparent | Discloses unfixed issues to attackers |

## Consequences
- Every feature gets an extra read-only pass; critical/high findings can delay a PR.
- Open findings exist only on the owner's machine (`build/security/`); they are lost if
  `build/` is deleted, so the orchestrator lists open findings in its reports.
- Private vulnerability reporting must be enabled in the GitHub repository settings
  (owner action).
- Revisit before the first public release and when AI features are specified.
