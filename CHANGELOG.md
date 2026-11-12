# Changelog

All notable changes to Tabellify are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/). No version has been released yet.

Security fixes are summarized here once fixed (see [SECURITY.md](SECURITY.md)); open findings
are never published.

## [Unreleased]

### Added
- Feature 001, plugin shell (version 0.1.0):
  - Installs in Zotero 10.0.x (`strict_min_version` 10.0, `strict_max_version` 10.0.*).
  - Adds **Tabellify…** to Zotero's Tools menu.
  - **Tools → Tabellify…** opens a single **Tabellify Workspace** window with placeholder
    content; choosing it again brings the open window to the front.
  - Disabling and re-enabling Tabellify work without restarting Zotero; disabling removes the
    menu item, closes the workspace window and removes the main-window string link.
  - Does not read or change the Zotero library.

- Feature 002, workspace tab: **Tools → Tabellify…** opens the workspace as a **Tabellify**
  tab in the main Zotero window, so it works when Zotero is maximized or full screen.
  Choosing it again selects the existing tab. The tab is closed when Tabellify is disabled or
  removed, when the main window closes, and when Zotero quits; it is not reopened after a
  restart.

### Changed
- The separate **Tabellify Workspace** window from Feature 001 is now used only as an
  automatic fallback if Zotero's tab system is not available.

### Known issues
- If Zotero crashes while the Tabellify tab is open, Zotero may fail to reopen your other
  tabs (for example PDFs) at the next start. Accepted for now; to be revisited before the
  first public release.
- Removing and reinstalling Tabellify in the same Zotero session can start a second copy (a
  Zotero 10 bug). Restart Zotero between Remove and Install.
- Zotero's update check for Tabellify gets an HTTP 404 because `updates.json` does not exist
  yet. Harmless.
