# Zotero APIs Used

Every Zotero, Mozilla or window API Tabellify uses must be verified against official docs or
Zotero source and recorded, with links and Zotero versions, in
[docs/zotero-api-notes.md](https://github.com/asmithlabs/tabellify/blob/main/docs/zotero-api-notes.md)
(CLAUDE.md rule 1). That file is the source of truth; this page only lists what is in use.

## Used in version 0.1.0 (F001)

| API | Used for | File |
|---|---|---|
| `manifest.json` `applications.zotero.{id, strict_min_version, strict_max_version, update_url}` | Identity and compatibility. All four are required, or install fails with "could not be installed" | `src/manifest.json` |
| Bootstrap hooks `install/startup/shutdown/uninstall`, `onMainWindowLoad/Unload` | Lifecycle | `src/bootstrap.js` |
| `amIAddonManagerStartup.registerChrome(…)` → handle `.destruct()` | `chrome://tabellify/content/` URLs | `src/bootstrap.js` |
| `Services.scriptloader.loadSubScript` | Load `tabellify.js` | `src/bootstrap.js` |
| `Zotero.MenuManager.registerMenu` / `unregisterMenu` (target `main/menubar/tools`) | Tools → Tabellify… | `src/tabellify.js` |
| `window.MozXULElement.insertFTLIfNeeded("tabellify.ftl")` | Menu label strings in the main window | `src/tabellify.js` |
| Plugin `.ftl` auto-registration; `<html:link rel="localization">`; `data-l10n-id` | Strings in the workspace window | `src/locale/`, `src/content/workspace.xhtml` |
| `<?xml-stylesheet href="chrome://global/skin/global.css"?>` | Opaque, native window background | `src/content/workspace.xhtml` |
| `Zotero.getMainWindow().openDialog(…)` | Open the workspace window | `src/tabellify.js` |
| `Services.wm.getMostRecentWindow` / `getEnumerator("tabellify:workspace")` | Single instance; close on shutdown | `src/tabellify.js` |
| `Zotero.getMainWindow()` / `Zotero.getMainWindows()` | Reach main windows | `src/tabellify.js` |
| `Zotero.debug`, `Zotero.logError` | Logging | both |

Tabellify 0.1.0 uses **no** library-data APIs (no items, collections, tags, searches).

## Planned

- **F002 (Planned):** the internal `Zotero_Tabs` object (`add`, `select`, `close`,
  `getTabInfo`) for the workspace tab. There is no documented Zotero tab API, so this uses
  Zotero internals with feature detection and a fallback to the F001 window (ADR-0009). Its
  api-notes rows are on the F002 branch until it merges.
- **F003+ (Planned):** selection getters (`ZoteroPane.getSelectedCollections()` and related;
  the singular getters throw in Zotero 10), search conditions, possibly
  `Zotero.ItemPaneManager.registerSection` or `Zotero.PreferencePanes.register`. Recorded in
  api-notes as verified but not used.

## Adding a new API

1. Find it in the official docs (zotero.org/support/dev/…) or Zotero source for the target
   version.
2. Add a row to `docs/zotero-api-notes.md` with the source link and Zotero versions checked.
3. If you cannot verify it, stop and say so in the spec or PR. Never guess.
