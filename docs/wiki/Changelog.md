# Changelog

All notable changes to Tabellify. No version has been released yet.

## Unreleased

### Added
- **Feature 001, plugin shell (version 0.1.0).**
  - Installs in Zotero 10.0.x (`strict_min_version` 10.0, `strict_max_version` 10.0.*).
  - Adds **Tabellify…** to Zotero's Tools menu.
  - **Tools → Tabellify…** opens a single **Tabellify Workspace** window with placeholder
    content; choosing it again brings the open window to the front.
  - Disabling and re-enabling Tabellify work without restarting Zotero; disabling removes
    the menu item, closes the workspace window and removes the main-window string link.
  - Does not read or change the Zotero library.
- **Feature 002, workspace as a tab in the main Zotero window (version 0.1.0).**
  - **Tools → Tabellify…** opens a **Tabellify** tab in the main Zotero window it was chosen
    from, showing the placeholder workspace; it stays usable when Zotero is maximized or in
    full screen.
  - Choosing **Tools → Tabellify…** again selects the existing Tabellify tab.
  - The tab is closed automatically when Tabellify is disabled or removed, when its main
    window closes, and when Zotero quits (before Zotero saves its open tabs), so it is never
    restored after a restart and cannot block restoring other tabs.
  - Uses Zotero's internal tab manager (`Zotero_Tabs`, ADR-0009); reads no library data.

### Changed
- The workspace is no longer a separate window by default (ADR-0004 superseded by
  ADR-0009). The F001 window opens only as an automatic fallback if Zotero's tab system is
  not available.

### Known issues
- If Zotero crashes (or is forced to quit) while the Tabellify tab is open, the next start
  may not restore the PDF and note tabs after it, and Zotero logs
  `Cannot destructure property 'itemID'`. Library data is not affected. Accepted risk, to be
  revisited before public release. See
  [Troubleshooting](Troubleshooting#pdf-or-note-tabs-not-restored-after-a-restart).
- Removing and reinstalling Tabellify in the same Zotero session can start a second copy
  (a Zotero 10 bug). Restart Zotero between Remove and Install. See
  [Troubleshooting](Troubleshooting#two-copies-after-remove-and-reinstall).
- Zotero's update check for Tabellify gets an HTTP 404 because `updates.json` does not exist
  yet. Harmless.
