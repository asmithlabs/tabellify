# Decision Log

Architecture Decision Records (ADRs) live in
[`docs/decisions/`](https://github.com/asmithlabs/tabellify/tree/main/docs/decisions).
ADRs with **Accepted** status are binding. Accepted ADRs are not rewritten; a later ADR
supersedes them (ADR-0001).

| ADR | Title | Status |
|---|---|---|
| [0001](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0002-zotero-compatibility-and-plugin-id.md) | Zotero compatibility range and plugin identity | Accepted; compatibility range superseded by ADR-0008 (plugin ID still in force) |
| [0003](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0003-plain-javascript-no-bundler.md) | Plain JavaScript, no bundler | Accepted |
| [0004](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0004-workspace-window.md) | Workspace as a separate window opened from a menu | Superseded by ADR-0009 |
| [0005](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0005-testing-strategy.md) | Testing strategy | Accepted |
| [0006](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0006-agent-architecture.md) | Claude Code agent architecture | Accepted |
| [0007](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0007-license-and-governance.md) | License and community governance | Accepted |
| [0008](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0008-target-zotero-10.md) | Target Zotero 10.0 (supersedes ADR-0002's version range) | Accepted |
| 0009 | Workspace as a tab in the main Zotero window | Accepted (on branch `feat/002-workspace-tab` until Feature 002 merges) |
| [0010](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0010-documentation-structure.md) | Documentation structure (README, wiki source, docs-writer) | Accepted |
| [0011](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0011-security-review-process.md) | Security review process (security-auditor, SECURITY.md) | Accepted |

## Notes

- **ADR-0004 → ADR-0009.** Feature 001 shipped the workspace as a separate window
  (ADR-0004). ADR-0009 replaces it with a tab in the main Zotero window, using Zotero's
  internal `Zotero_Tabs` with strict guards and a fallback to the window. The supersession
  takes effect on `main` when Feature 002 merges; until then the file on `main` still reads
  "Accepted".
- **Roadmap renumbering.** When Feature 002 (workspace tab) was inserted, later features
  moved up by one (old F002 data access is now F003, and so on). Accepted ADRs keep the old
  numbers as historical records. Mapping: old F002→F003 data access, F003→F004 codebook,
  F004→F005 tag monitor, F005→F006 table builder, F006→F007 saved tables, F007→F008 CSV
  export, F008→F009 column customization, F009+→F010+ AI.

New ADRs use
[`_template.md`](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/_template.md)
and start as **Proposed**; the maintainer accepts or rejects them.
