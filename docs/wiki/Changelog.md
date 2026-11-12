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

### Known issues
- Removing and reinstalling Tabellify in the same Zotero session can start a second copy
  (a Zotero 10 bug). Restart Zotero between Remove and Install. See
  [Troubleshooting](Troubleshooting#two-copies-after-remove-and-reinstall).
- Zotero's update check for Tabellify gets an HTTP 404 because `updates.json` does not exist
  yet. Harmless.
