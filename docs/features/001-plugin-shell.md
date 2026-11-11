# Feature 001: Plugin Shell

- **Status:** Approved (plan) — implementation starts after T1 verification
- **Branch:** `feat/001-plugin-shell`
- **Related ADRs:** 0002, 0003, 0004, 0005, 0008

## Objective
A minimal Tabellify plugin that loads inside Zotero and opens a dedicated workspace window
showing placeholder content.

## Scope
**In scope:** manifest, bootstrap lifecycle, chrome registration, Fluent strings, one menu
item, a placeholder workspace window, build script, static tests, CI, manual checklist.
**Out of scope:** reading library data, tables, tags, persistence, settings pane, export.

## User stories
- As a researcher, I can install Tabellify and open its workspace from Zotero's menu.
- As a researcher, I can disable or remove Tabellify without errors or side effects.

## Acceptance criteria
- [ ] AC1 `[manual]` + `[auto]` The built `.xpi` installs via Tools → Plugins (drag-and-drop or "Install Plugin From File"). Auto: XPI contains `manifest.json`, `bootstrap.js` at root; manifest fields valid.
- [ ] AC2 `[manual]` After install and after restart, Debug Output shows Tabellify startup messages and no Tabellify errors.
- [ ] AC3 `[manual]` A "Tabellify…" menu item opens the workspace window.
- [ ] AC4 `[manual]` The window shows localized placeholder content (title + short description). Reopening focuses/opens without errors.
- [ ] AC5 `[manual]` + `[auto]` Disabling removes the menu item and closes/cleans up the window with no errors; re-enabling restores it. Auto: register/unregister symmetry check.
- [ ] AC6 `[auto]` + review: `src/` contains no library-write calls (write guard passes).

## Design
- `src/manifest.json` — ID `tabellify@asmithlabs.com`, version `0.1.0`, min 10.0 / max 10.0.* (ADR-0008).
- `src/bootstrap.js` — lifecycle hooks; registers chrome; loads `tabellify.js`; forwards hooks.
- `src/tabellify.js` — `Tabellify` object: `init`, `registerMenu`, `openWorkspace`, `shutdown`.
- `src/content/workspace.xhtml|.js|.css` — placeholder window.
- `src/locale/en-US/tabellify.ftl` — strings.
- `scripts/build-xpi.mjs`, `package.json` (scripts only).

## Zotero APIs used
All verified against Zotero 10.0.8 docs/source in T1. Details, links, and caveats are in
`docs/zotero-api-notes.md` (row name in brackets). Runtime checks R1–R4 there are for the
owner to run in the dev profile.

**bootstrap.js (T2)**
- Hooks `startup/shutdown/install/uninstall({id, version, rootURI}, reason)` and
  `onMainWindowLoad/onMainWindowUnload({window})` [bootstrap hooks; onMainWindowLoad].
  Don't branch on `reason` in the unload hook (Zotero passes 9, not 10).
- Chrome registration [registerChrome]:
  `Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup)`
  → `registerChrome(Services.io.newURI(rootURI + "manifest.json"), [["content", "tabellify", "content/"]])`;
  in `shutdown`: `chromeHandle.destruct(); chromeHandle = null;`. (make-it-red doesn't
  do this; the code comes from the Zotero 7 dev guide plus Mozilla source.)
- `Services.scriptloader.loadSubScript(rootURI + "tabellify.js")` [loadSubScript].
- Logging: `Zotero.debug("Tabellify: …")`; errors via `Zotero.logError(err)` [Zotero.debug].

**tabellify.js (T3)**
- Menu [MenuManager rows]: `Zotero.MenuManager.registerMenu({ menuID, pluginID, target, menus: [{ menuType: "menuitem", l10nID, onCommand }] })`.
  Keep the **returned** (namespaced) ID and pass it to `unregisterMenu(id)` in `shutdown`.
  Zotero also auto-removes the menu on disable. Target per the menu-placement decision below
  (Tools = `"main/menubar/tools"`).
- Menu label strings [insertFTLIfNeeded]: MenuManager does **not** load plugin `.ftl` files.
  In `onMainWindowLoad` (and for each `Zotero.getMainWindows()` window during `startup`)
  call `window.MozXULElement.insertFTLIfNeeded("tabellify.ftl")`. Remove the
  `link[href="tabellify.ftl"]` element in `onMainWindowUnload` and for every main window in
  `shutdown`. The FTL message must use a `.label` attribute.
- Window [open chrome window; find/focus; close]: if
  `Services.wm.getMostRecentWindow("tabellify:workspace")` exists and isn't `.closed`, call
  `.focus()` on it. Otherwise call
  `Zotero.getMainWindow().openDialog("chrome://tabellify/content/workspace.xhtml", "tabellify-workspace", "chrome,titlebar,centerscreen,resizable=yes,dialog=no")`.
  In `shutdown`, `close()` every window from `Services.wm.getEnumerator("tabellify:workspace")`
  **before** `chromeHandle.destruct()`.

**workspace.xhtml (T3)**
- Root `<window … windowtype="tabellify:workspace">`. Strings via
  `<html:link rel="localization" href="tabellify.ftl"/>` [Fluent link]. Plugin `.ftl` files
  in `locale/en-US/` are still auto-registered on Zotero 10, and Zotero unregisters them on
  disable. `Zotero.ftl.addResourceIds()` is not needed for F001.

## Data safety
Reads nothing from the library. Writes nothing. Write guard enforces this.

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | `git init`, first commit, create public GitHub repo, branch protection | Owner | — | — |
| T1 | Read make-it-red source; verify UNVERIFIED APIs on Zotero 10.0.8; update api-notes; finalize this spec | architect | T0 | `docs/` |
| T2 | manifest + logging-only bootstrap + build script → installable no-op XPI | developer | T1 | `src/manifest.json`, `src/bootstrap.js`, `scripts/`, `package.json` |
| T3 | Menu item, workspace window, Fluent strings, full cleanup | developer | T2 | `src/tabellify.js`, `src/content/`, `src/locale/` |
| T4 | Static tests + manual checklist | tester | T2 | `tests/`, `docs/testing/manual/001-plugin-shell.md` |
| T5 | CI workflow | developer (worktree) | T2 | `.github/workflows/` |
| T6 | Run tests; owner runs manual checklist | tester + owner | T3, T4 | — |
| T7 | Independent review | reviewer | T5, T6 | read-only |

T3, T4, T5 run in parallel after T2 is merged to `main`.

## Open questions
- ~~Installed Zotero version~~ Resolved: 10.0.8 → verify all APIs against Zotero 10.
- ~~Fluent loading~~ Resolved (T1, source-verified on 10.0.8; runtime check R2 pending):
  `<link rel="localization" href="tabellify.ftl">` still works in the plugin's own window.
  Zotero 10's "consolidation" means every plugin's `.ftl` goes into one shared Fluent source
  (`zotero-plugins`), keyed by **file name**. So the file must keep a unique name
  (`tabellify.ftl`). `Zotero.ftl.addResourceIds()` is only for formatting strings from JS
  through `Zotero.ftl` (e.g. undo labels), so it's not needed in F001. **New finding:** the
  main-window menu label needs the FTL inserted into the main window
  (`insertFTLIfNeeded`) and removed on unload/shutdown. This is already within T3's file
  scope (`src/tabellify.js`). It does rely on T2's `bootstrap.js` forwarding
  `onMainWindowLoad/Unload` to `Tabellify`, which matches the Design ("forwards hooks").
- **Menu placement: NEEDS OWNER DECISION.** All three are valid MenuManager targets on 10.0.8:

  | Option | Target | Pros | Cons |
  |---|---|---|---|
  | Tools menu | `main/menubar/tools` | Conventional place for plugin tools, next to Zotero's own "Plugins" item. Always visible, whatever is selected. Matches the current AC3 wording and ADR-0004 | One more item in an already busy menu. Not tied to a collection, so F002 must read the current selection separately |
  | View menu | `main/menubar/view` | make-it-red puts its item here. "View" fits "open a workspace" | Users usually look for plugin features in Tools. View holds display toggles, so a window launcher is less expected there |
  | Collection context menu | `main/library/collection` | Natural for "build a table from *this* collection" (F002). `context.collectionTreeRows` gives the clicked collection(s) | Hidden until you right-click a collection. "Grouped" target, so Zotero may fold it into a submenu when several plugins add items. Not available for every selection (e.g. trash). Needs `collectionTreeRows` (singular throws in 10) |

  **Recommendation (for the owner to accept or change):** Tools menu for F001, because it's the
  simplest, always visible, and needs no context handling. Consider *adding* a collection
  context item in F002, when Tabellify actually uses the selected collection. Registering a
  second menu is one more `registerMenu` call, not a redesign.
- Proposal (no change made): AC4 says "Reopening focuses/opens". The design above makes the
  window single-instance (reopening focuses the existing window). Owner may want to state
  that explicitly in AC4.
- Proposal (no change made): AC5's auto check ("register/unregister symmetry") could also
  assert that `shutdown` closes `tabellify:workspace` windows before `chromeHandle.destruct()`
  and removes the main-window FTL `<link>`.
- `resultLevel` call syntax and tag-at-annotation-level search are UNVERIFIED (api-notes R6).
  They don't affect F001 and must be settled before F004.
