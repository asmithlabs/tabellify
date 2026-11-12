# Tabellify

Tabellify is a Zotero plugin that turns curated tags into structured literature tables
(synthesis matrices), so you can organize, compare and export research findings.

> **Status: early development.** Version 0.1.0 (Feature 001, the plugin shell) installs in
> Zotero 10.0.x and opens a placeholder workspace window from **Tools → Tabellify…**. It
> does not read your library or build tables yet. Pages marked **Planned** describe features
> that are not available.

## What is available today

| Feature | Status |
|---|---|
| F001 Plugin shell: install, Tools → Tabellify…, placeholder workspace window | Available (unreleased; no GitHub Release yet) |
| F002 Workspace as a tab in the main Zotero window | **Planned** (approved, in development) |
| F003 Read-only data access (collections, items, tags) | **Planned** |
| F004 Codebook (curated tag list with super-tag groups) | **Planned** |
| F005 Tag monitor | **Planned** |
| F006 Table builder | **Planned** |
| F007 Saved tables | **Planned** |
| F008 CSV export | **Planned** |
| F009 Column customization | **Planned** |
| F010+ AI-assisted extraction and classification | **Planned** (future) |

Feature numbers follow the roadmap in
[docs/product-requirements.md](https://github.com/asmithlabs/tabellify/blob/main/docs/product-requirements.md)
as renumbered for Feature 002 (see [Decision Log](Decision-Log)).

## For researchers

- [Getting Started](Getting-Started): install Tabellify and open the workspace
- [Workspace](Workspace): what the workspace shows today
- [Codebooks](Codebooks), [Tag Monitor](Tag-Monitor), [Table Builder](Table-Builder),
  [Saved Tables](Saved-Tables), [Export](Export): planned features
- [Data Safety and Privacy](Data-Safety-and-Privacy): what Tabellify reads and never changes
- [Troubleshooting](Troubleshooting) and [FAQ](FAQ)

## For developers

- [Architecture](Architecture) and [Plugin Lifecycle](Plugin-Lifecycle)
- [Zotero APIs Used](Zotero-APIs-Used)
- [Testing](Testing) and [Contributing](Contributing)
- [Decision Log](Decision-Log) (ADR index)
- [Release Process](Release-Process) and [Changelog](Changelog)

## About this wiki

These pages are generated from
[`docs/wiki/`](https://github.com/asmithlabs/tabellify/tree/main/docs/wiki) in the repository
and reviewed in pull requests (ADR-0010). Please propose changes there, not by editing the
wiki directly.
