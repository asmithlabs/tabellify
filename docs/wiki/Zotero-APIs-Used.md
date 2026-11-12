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
| `Zotero.getMainWindow().openDialog(…)` | Open the workspace window (since F002: fallback only) | `src/tabellify.js` |
| `Services.wm.getMostRecentWindow` / `getEnumerator("tabellify:workspace")` | Single instance; close on shutdown | `src/tabellify.js` |
| `Zotero.getMainWindow()` / `Zotero.getMainWindows()` | Reach main windows | `src/tabellify.js` |
| `Zotero.debug`, `Zotero.logError` | Logging | both |

## Added in F002 (workspace tab)

There is **no documented Zotero API for plugin tabs**. ADR-0009 allows exactly four methods
of the internal `Zotero_Tabs` object, nothing else (no `_tabs`, no `tabHooks`, no
`Zotero.Session`); `tests/static/tabs-api.test.mjs` enforces this allow-list. Status and
version columns below summarize api-notes; check api-notes before relying on them.

| API | Used for | Status (api-notes) | File |
|---|---|---|---|
| `win.Zotero_Tabs` (per main window) | Reach the tab manager; feature-detected before use, fallback to the F001 window if missing | **Internal**; verified (runtime, owner RT1/RT2 on 10.0.9) | `src/tabellify.js` |
| `Zotero_Tabs.add({ type: "tabellify", title, data: {}, select: true, onClose })` → `{ id, container }` | Create the tab. Type must have no hyphen; `data` must be an object | **Internal**; verified (runtime) | `src/tabellify.js` |
| `Zotero_Tabs.select(id)` | Single instance: show the existing tab | **Internal**; verified (runtime) | `src/tabellify.js` |
| `Zotero_Tabs.close(id)` | Close our tab (quit, unload, shutdown, incomplete add) | **Internal**; verified (runtime) | `src/tabellify.js` |
| `Zotero_Tabs.getTabInfo(id)` | Confirm a stored id is still a `"tabellify"` tab (unknown id → `{}`) | **Internal**; verified (runtime) | `src/tabellify.js` |
| `Services.obs.addObserver` / `removeObserver` (`"quit-application-granted"`) | Close tabs before Zotero saves its session at quit | API verified (source); **observer order UNVERIFIED (runtime)** until F002 AC6 | `src/tabellify.js` |
| HTML `<iframe>` (`createElementNS`) with `src="chrome://tabellify/content/workspace.xhtml"` in the tab container | Our own privileged document inside the tab | Verified (runtime, RT2) | `src/tabellify.js` |
| `win.document.l10n.formatValue("tabellify-tab-title")` | Localized tab title (fallback `"Tabellify"`) | Verified (runtime, RT2) | `src/tabellify.js` |
| `event.target.ownerGlobal` in MenuManager `onCommand` | Open the tab in the window whose menu was used; trusted only if it is a main window, else `Zotero.getMainWindow()` | **UNVERIFIED** (runtime check RT4) | `src/tabellify.js` |

Not used, recorded in api-notes because they shaped the design: `Zotero_Tabs.getState` /
`restoreState`, `Zotero.Session`, `ZoteroPane.openNote`.

Before raising `strict_max_version`, compare `tabs.js` and `session.js` between Zotero tags
and rerun the F002 manual checks (ADR-0009 §6).

Tabellify 0.1.0 uses **no** library-data APIs (no items, collections, tags, searches).

## Planned

- **F003+ (Planned):** selection getters (`ZoteroPane.getSelectedCollections()` and related;
  the singular getters throw in Zotero 10), search conditions, possibly
  `Zotero.ItemPaneManager.registerSection` or `Zotero.PreferencePanes.register`. Recorded in
  api-notes as verified but not used.

## Adding a new API

1. Find it in the official docs (zotero.org/support/dev/…) or Zotero source for the target
   version.
2. Add a row to `docs/zotero-api-notes.md` with the source link and Zotero versions checked.
3. If you cannot verify it, stop and say so in the spec or PR. Never guess.
