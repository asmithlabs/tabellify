# Decision Log

Architecture Decision Records (ADRs) live in
[`docs/decisions/`](https://github.com/asmithlabs/tabellify/tree/main/docs/decisions).
ADRs with **Accepted** status are binding. Accepted ADRs are not rewritten; a later ADR
supersedes them, or a dated amendment or note is added (ADR-0001).

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
| [0009](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0009-workspace-as-main-window-tab.md) | Workspace as a tab in the main Zotero window (supersedes ADR-0004) | Accepted; note 2026-11-14: residual session-restore risk accepted for the first release |
| [0010](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0010-documentation-structure.md) | Documentation structure (README, wiki source, docs-writer) | Accepted |
| [0011](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0011-security-review-process.md) | Security review process (security-auditor, SECURITY.md) | Accepted |
| [0012](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0012-tabellify-data-storage.md) | How Tabellify stores its own data (JSON files in `<data dir>/tabellify/`) | Accepted; amendment 2026-11-14: size and entry limits |
| [0013](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0013-reader-tag-popup.md) | Showing "tags used / remaining" while reading a paper (item pane section) | Accepted |
| [0014](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0014-table-layout-storage.md) | Saving the per-paper table layout (`layout.json`) | Accepted; amendment 2026-11-13: schema 2; shape later replaced by ADR-0019 (schema 3) |
| [0015](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0015-brand-design-system.md) | Tabellify brand palette and design tokens | Accepted |
| [0016](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0016-codebook-optional-groups.md) | Codebook schema 2: optional groups (ungrouped tags) and regrouping | Accepted |
| [0017](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0017-csv-export-file-writes.md) | CSV export: how and where Tabellify writes a file outside its own folder | Accepted |
| [0018](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0018-saved-tables.md) | Saved tables: what a saved table is and how `tables.json` stores it | Accepted |
| [0019](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0019-layout-mixed-top-level-order.md) | `layout.json` schema 3: one mixed top-level column order (groups and ungrouped tags) | Accepted |
| [0020](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/0020-release-and-update-integrity.md) | Release and update integrity: `update_hash` always, versioned immutable release files, protected `v*` tags, manual reproducible builds | Accepted |

## Notes

- **ADR-0004 → ADR-0009.** Feature 001 built the workspace as a separate window
  (ADR-0004). ADR-0009 replaces it with a tab in the main Zotero window (Feature 002), using
  only four methods of Zotero's internal `Zotero_Tabs` with strict guards. The window stays
  only as an automatic fallback.
- **Codebook and layout shapes.** `codebooks.json` schema 1 (Feature 004) became schema 2
  with optional groups (ADR-0016). `layout.json` went from schema 1 (ADR-0014) to schema 2
  (ADR-0014 amendment, tag columns) to schema 3 (ADR-0019, groups and ungrouped tags in one
  order). Older files are migrated in memory on load and rewritten only by the next save
  after a user action.
- **Where each feature's decisions live:** codebook storage ADR-0012 and ADR-0016; reader
  section ADR-0013; table layout ADR-0014 and ADR-0019; look ADR-0015; CSV export ADR-0017;
  saved tables ADR-0018.
- **Roadmap renumbering.** When Feature 002 (workspace tab) was inserted, later features
  moved up by one (old F002 data access is now F003, and so on). Accepted ADRs written before
  that keep the old numbers. Mapping: old F002→F003 data access, F003→F004 codebook,
  F004→F005 tag monitor, F005→F006 table builder, F006→F007 saved tables, F007→F008 CSV
  export, F008→F009 column customization, F009+→F010+ AI.
- **Feature 006 split** (owner-approved 2026-11-13): 006a workspace restructure, 006b
  autocomplete, 006c drag regroup, 006d highlight text in cells (**Planned**); F007 split into
  007a (View table) and 007b (saved tables). Details:
  [Feature 006a, "Phases"](https://github.com/asmithlabs/tabellify/blob/main/docs/features/006a-workspace-restructure.md).

New ADRs use
[`_template.md`](https://github.com/asmithlabs/tabellify/blob/main/docs/decisions/_template.md)
and start as **Proposed**; the maintainer accepts or rejects them.
