# Tabellify

Tabellify is a Zotero plugin that turns curated tags into structured literature tables
(synthesis matrices), so you can organize, compare and export research findings.

You plan a list of tags (a codebook), tag the highlights in your papers with them in Zotero's
reader, and Tabellify shows a table: one row per paper, one column per codebook tag, a ✓ where
the paper uses the tag. You can save the table and export it as CSV. Tabellify never changes
your Zotero library.

Version **0.1.0** works with **Zotero 10.0.x**. Pages marked **Planned** describe features
that are not available yet.

## What is available

| Feature | Status |
|---|---|
| F001–F002 Install, **Tools → Tabellify…**, workspace as a tab in the main Zotero window | Available in 0.1.0 |
| F003 Read-only access to My Library collections, papers and tags | Available in 0.1.0 |
| F004, 006a Codebook with optional groups, typed in one line | Available in 0.1.0 |
| 006b Tag suggestions while typing, codebook-only **Create tag** | Available in 0.1.0 |
| F005, 005b Tag monitor: counts in the workspace, **Tabellify tags** section beside the reader | Available in 0.1.0 |
| 005c, 006c Per-paper table: sorting, manual order, column moves, regroup by dragging | Available in 0.1.0 |
| 005d Tabellify look, light and dark | Available in 0.1.0 |
| 007a **View table** with Name and Description | Available in 0.1.0 |
| 007b Saved tables with snapshot and live view | Available in 0.1.0 |
| F008 CSV export | Available in 0.1.0 |
| 006d Highlight text in table cells, per-table "Cell content" | **Planned** |
| F009 Column customization (own columns, column types, per-column options) | **Planned** |
| F008 (later step) Excel (XLSX) export | **Planned** |
| F010+ AI-assisted extraction and classification | **Planned** (future) |

Feature numbers follow the roadmap in
[docs/product-requirements.md](https://github.com/asmithlabs/tabellify/blob/main/docs/product-requirements.md)
(see the [Decision Log](Decision-Log) for how the numbers were split and renumbered).

## For researchers

- [Getting Started](Getting-Started): install Tabellify and build your first table
- [Workspace](Workspace): the Tabellify tab, top to bottom
- [Codebooks](Codebooks): typing tags and groups, suggestions, editing
- [Tag Monitor](Tag-Monitor): counts and the **Tabellify tags** section beside the reader
- [Table Builder](Table-Builder): columns, sorting, manual order, dragging and regrouping
- [Saved Tables](Saved-Tables): View table, save, snapshot and live
- [Export](Export): the CSV file
- [Data Safety and Privacy](Data-Safety-and-Privacy): what Tabellify reads, the files it
  keeps, and how to remove them
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
