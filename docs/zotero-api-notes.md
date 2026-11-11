# Verified Zotero API notes

Every Zotero/Mozilla API used in `src/` must appear here with a source link and the Zotero
versions it was verified against. Status values: **Verified (docs)**, **Verified (source)**,
**Verified (runtime)**, **UNVERIFIED**.

Primary sources:
- Zotero 7 for Developers — https://www.zotero.org/support/dev/zotero_7_for_developers
- Zotero 8 for Developers — https://www.zotero.org/support/dev/zotero_8_for_developers
- Zotero 10 for Developers — https://www.zotero.org/support/dev/zotero_10_for_developers

**Target: Zotero 10.0.x (ADR-0008).** Rows marked 7/8 were documented then; each must be
re-confirmed on Zotero 10 in Feature 001 T1 (status → Verified (runtime) on 10.0.8).
- Sample plugin — https://github.com/zotero/make-it-red
- Zotero source — https://github.com/zotero/zotero

| API / mechanism | Purpose | Status | Versions | Source | Notes |
|---|---|---|---|---|---|
| `manifest.json` with `applications.zotero.{id, strict_min_version, strict_max_version, update_url}` | Plugin identity + compatibility | Verified (docs) | 7, 8 | Z7 dev guide | `applications.zotero` required for install |
| `bootstrap.js` hooks `install/startup/shutdown/uninstall({id, version, rootURI}, reason)` | Lifecycle | Verified (docs) | 7, 8 | Z7 dev guide | `shutdown` must remove all functionality |
| `onMainWindowLoad({window})` / `onMainWindowUnload({window})` | Per-window UI setup/teardown | Verified (docs) | 7, 8 | Z7 dev guide | Main window can reopen during a session |
| `amIAddonManagerStartup.registerChrome(manifestURI, entries)` → handle; `handle.destruct()` in shutdown | `chrome://tabellify/…` URLs | Verified (docs) | 7, 8 | Z7 dev guide | Exact acquisition code: copy from make-it-red (T1) |
| Fluent `.ftl` in `locale/<locale>/` (auto-registered); `<link rel="localization">`; `MozXULElement.insertFTLIfNeeded()` | Localization | Verified (docs) | 7, 8 | Z7 dev guide | Prefix IDs `tabellify-` |
| `Zotero.MenuManager.registerMenu({menuID, pluginID, target, menus})` / `unregisterMenu()` | Menu items | Verified (docs) | 8+ | Z8 dev guide | Auto-removed on disable. **Exact `target` ID for Tools menu: UNVERIFIED** (T1) |
| `Zotero.PreferencePanes.register({pluginID, src, scripts, stylesheets})` | Settings pane | Verified (docs) | 7, 8 | Z7 dev guide | Not used in F001 |
| `Zotero.ItemPaneManager.registerSection({paneID, pluginID, header, sidenav, onRender…})` | Item pane section | Verified (docs) | 7, 8 | Z7 dev guide | Candidate for tag monitor (F004) |
| Opening a chrome XHTML window (`window.openDialog` / `Services.ww.openWindow`) | Workspace window | **UNVERIFIED** | — | — | T1: confirm pattern used by Zotero code/plugins on Zotero 8/9 |
| `Zotero.debug(msg)` | Debug logging | **UNVERIFIED** | — | — | Used by make-it-red; confirm in T1 |
| `ZoteroPane.getSelectedCollections()` / `getSelectedLibraryIDs()` / `getCollectionTreeRows()` | Read current selection (F002) | Verified (docs) | 10 | Z10 dev guide | Singular getters (`getSelectedCollection()` etc.) **throw** in 10 |
| `Zotero.ftl.addResourceIds()` | Register plugin Fluent strings | Verified (docs) | 10 | Z10 dev guide | Plugin strings consolidated in 10; T1 decides usage |
| MenuManager in `main/library/collection` & `main/library/item` contexts: use `collectionTreeRows` | Context menus | Verified (docs) | 10 | Z10 dev guide | Reading `collectionTreeRow` throws; MenuManager removes menu DOM on shutdown |
| Search conditions for annotation properties and tag counts | Tag monitor / annotation queries (F004–F005) | Verified (docs, existence only) | 10 | Z10 dev guide | Exact condition names UNVERIFIED |
