# Changelog

All notable changes to Tabellify, newest first. The repository's
[CHANGELOG.md](https://github.com/asmithlabs/tabellify/blob/main/CHANGELOG.md) is the
authoritative copy; this page follows it.

## 0.1.0 (2026-11-16)

First public release. Works with Zotero 10.0.x.

### Added
- **Workspace tab.** **Tools → Tabellify…** opens a **Tabellify** tab in the main Zotero
  window (also in full screen); see [Workspace](Workspace).
- **Tag counts.** Choose a collection; papers in it and its subcollections are counted. A
  summary line "Tags used N/M · Papers P", a **k/M** column per paper, **Refresh**, and the
  **Also count tags on the paper itself** switch. Only manual tags count; by default only
  tags on highlights. See [Tag Monitor](Tag-Monitor).
- **Codebook in one line** with optional groups, quoted names, moves, and clear error
  messages; group pills; **Edit groups and tags**. See [Codebooks](Codebooks).
- **Suggestions while typing** from your library's tags and group names, and **Create tag**
  (codebook only).
- **Table**: tag columns under group names (or **Ungrouped**), ✓ cells, sorting, manual paper
  order, column moves, **Reset columns**, all kept between sessions. See
  [Table Builder](Table-Builder).
- **Regroup by dragging** with edge-based drops and Option+arrow keys; an emptied group
  becomes a tag again.
- **Tabellify tags** section beside the reader and in the library's item pane: "k / M" and a
  ✓ / ☐ checklist.
- **View table** with Name and Description; **saved tables** with snapshot and live view. See
  [Saved Tables](Saved-Tables).
- **CSV export** of the table as shown: two header rows, `1` for ✓, k and M columns, UTF-8
  with BOM, formula guard. See [Export](Export).
- Tabellify colours in light and dark mode.

### Security
Hardening done before the first release (all fixed): no file paths or error messages in
Tabellify's Debug Output lines; data files size-checked before reading; stricter automated
checks against markup injection and private log content; CI actions pinned to exact
versions; the `.xpi` built only from tracked files.

### Known issues
- If Zotero crashes while the Tabellify tab is open, Zotero may not reopen your other tabs at
  the next start. No data is lost; reopen them by hand. See
  [Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).
- Removing and reinstalling Tabellify in the same Zotero session can start a second copy
  (a Zotero 10 bug). Restart Zotero between Remove and Install. See
  [Troubleshooting](Troubleshooting#two-copies-after-remove-and-reinstall).
- Uninstalling keeps Tabellify's folder and setting; see
  [Data Safety and Privacy](Data-Safety-and-Privacy#removing-tabellifys-files-and-setting).
