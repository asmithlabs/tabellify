# Changelog

All notable changes to Tabellify are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/).

Security fixes are summarized here once fixed (see [SECURITY.md](SECURITY.md)); open findings
are never published.

## [Unreleased]

## [0.2.0] - Unreleased

First public release. Works with Zotero 10.0.x (`strict_min_version` 10.0,
`strict_max_version` 10.0.*). It includes everything listed under 0.1.0 below.

### Added
- **Group libraries** (Feature 003b). The collection list shows My Library and every group
  library you can see in Zotero: one heading per library, with its collections and
  subcollections under it. Tag counts, the per-paper table, manual order, **View table**,
  **Save table**, **Export CSV** and the reader section work the same for a group collection.
  Tag suggestions come from the chosen collection's library. Nothing is written to any
  library; the codebook is shared by all libraries.
- The **Saved tables** list and the saved table's info line show the library name. The
  collection list updates when a group is added, renamed or removed while the tab is open;
  if the chosen collection disappears, the table is cleared with a message.

### Fixed
- Manual paper orders of one library are no longer at risk when you reorder papers in
  another library.

## [0.1.0] - 2026-11-16

Tagged but never published. Its contents first ship in 0.2.0. Works with Zotero 10.0.x
(`strict_min_version` 10.0, `strict_max_version` 10.0.*).

### Added
- **Workspace tab** (Features 001, 002). **Tools → Tabellify…** opens a **Tabellify** tab in
  the main Zotero window (also in full screen). Choosing it again selects the open tab. The
  tab closes when Tabellify is disabled or removed, when its window closes and when Zotero
  quits; it is not reopened after a restart. If Zotero's tab system is not available, the
  workspace opens as a separate window instead.
- **Collections and tag counts** (Features 003, 005). Choose a collection in My Library; its
  papers and those of all its subcollections are counted once each. A summary line reads
  "Tags used N/M · Papers P", plus "All codebook tags are used." when every codebook tag is
  used. By default only manual tags on highlights count; **Also count tags on the paper
  itself** adds the paper's own manual tags. Automatic tags never count. Counts update
  when tags change; **Refresh** recounts at once.
- **Codebook** (Features 004, 006a). Type tags and groups into the **Tags and groups** box,
  for example `Exposure(heat index, temperature), age`, and press Enter. Groups are
  optional; names with commas or brackets can be written in double quotes. Typing a tag
  that is already in another group moves it. Clear messages point at mistakes in the line.
  Group pills ("Exposure · 2", "Ungrouped · 1") show each group's size. **Edit groups and
  tags** renames or deletes groups and removes tags. The codebook is saved automatically.
- **Suggestions while typing** (Feature 006b). The **Tags and groups** box suggests tags
  from your library (item and highlight tags) and existing group names; ↓/↑ to choose, Tab
  or Enter to accept, Esc to close. **Create tag** adds a new name to the codebook only.
- **Per-paper table** (Features 005c, 006a, 006c). Columns: Title, one column per codebook
  tag under its group name (tags without a group under **Ungrouped**), and **k/M**. Sort by
  clicking Title, k/M or a tag; drag papers (or Option+↑/↓ on a paper's grip) into a
  **Manual order** that is kept per collection; drag tag columns and groups to reorder them;
  **Reset columns** restores the codebook order. Column and paper order are kept between
  sessions.
- **Regroup by dragging** (Feature 006c). Dropping a tag column on another column's header
  can move it into a group, out of a group, or turn a tag into a group name; a hint above
  the table says what the drop will do. Option+arrow keys do the same from the keyboard. A
  group whose last tag is dragged out becomes a tag again, so nothing disappears.
- **Tabellify tags section** (Feature 005b). In Zotero's right-hand pane (reader tabs and the
  library), a collapsible **Tabellify tags** section shows "k / M" for the paper and a
  checklist of every codebook tag (✓ used, ☐ not yet).
- **View table** (Feature 007a). Shows the finished table, read-only, in a panel over the
  workspace (inside the Tabellify tab), with Name and Description fields; **Export CSV** there suggests the Name as file name.
- **Saved tables** (Feature 007b). **Save table** keeps a table with its Name, Description,
  settings and a snapshot of its contents. The **Saved tables** list opens, exports and
  deletes them. A saved table opens as its snapshot; **Show live** rebuilds it from the
  library today, **Update snapshot** or **Save as new table** keep that version.
- **CSV export** (Feature 008). **Export CSV** saves the table as shown to a file you choose:
  two header rows (group names, then Title, tags, "Tags used (k)", "Codebook tags (M)"),
  `1` for ✓, UTF-8 with a byte-order mark so spreadsheets read accents, and protection
  against spreadsheet formulas hidden in titles or tag names.
- **Look** (Feature 005d). The workspace uses Tabellify's colour palette in light and dark
  mode, following Zotero's Color Scheme setting.

### Security
Hardening done before the first release (all fixed):
- Tabellify's Debug Output lines no longer include file paths or error messages, so logs are
  safer to paste into bug reports.
- Tabellify's data files are size-checked before they are read; a file that is too large is
  not read and never overwritten.
- Stricter automated checks keep library text from ever being treated as page markup, and
  keep private details out of log lines.
- The continuous-integration actions are pinned to exact versions.
- The `.xpi` is built only from files tracked in the repository.

### Known issues
- If Zotero crashes (or is forced to quit) while the Tabellify tab is open, Zotero may not
  reopen your other tabs (for example PDFs) at the next start. Your library is not
  affected; reopen the tabs by hand. See the wiki's Troubleshooting page.
- Removing Tabellify and installing it again in the same Zotero session can start a second
  copy (a Zotero 10 bug). Restart Zotero between Remove and Install.
- Uninstalling Tabellify keeps its `tabellify` folder in the Zotero data folder and the
  `extensions.tabellify.countItemTags` setting; the wiki's Data Safety and Privacy page
  explains how to remove them.
