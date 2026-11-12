# Feature 002: Workspace as a main-window tab

- **Status:** Approved (owner, 2026-11-11). RT1/RT2 run by the owner before T2.
- **Branch:** `feat/002-workspace-tab`
- **Related ADRs:** 0009 (Accepted, supersedes 0004), 0002, 0003, 0005, 0008

## Problem / objective
In Feature 001 the Tabellify workspace opens as a separate window (ADR-0004). When Zotero is
maximized or in full screen, that window is left behind. The owner needs the workspace to open
as a **tab inside the main Zotero window**, next to the library, PDF and note tabs, so it is
always reachable. This feature replaces the F001 window with a main-window tab that shows the
same placeholder content. Opening, closing, disabling and re-enabling must stay clean, and
Zotero's own tabs must still restore after a restart.

## Scope
**In scope:**
- "Tabellify…" (Tools menu, from F001) opens the workspace as a tab in the main window it was
  chosen from.
- Single instance per main window: choosing the menu item again selects the existing tab.
- Placeholder content from F001 (localized title + description) shown inside the tab.
- Clean removal: tab closed on disable/uninstall/upgrade, on main-window unload, and at app
  quit (before Zotero saves its session).
- Feature detection with fallback to the F001 window if `Zotero_Tabs` is missing or fails.
- Tests (automated where possible), manual checklist, api-notes rows.

**Out of scope (non-goals):**
- Restoring the Tabellify tab after a restart (see ADR-0009 option C5; Open question Q2).
- Reading library data (collections, items, tags): later feature.
- Tab icon design, tab right-click menu entries, keyboard shortcut.
- Any change to Zotero's session data (`Zotero.Session.state` / `session.json`).
- Removing the F001 window code. It stays as the fallback (Open question Q4).

## User stories
- As a researcher working with Zotero in full screen, I open Tabellify from the Tools menu and
  it appears as a tab in the same window, so I never lose it behind Zotero.
- As a researcher, choosing "Tabellify…" again takes me to the tab I already have open instead
  of opening a second one.
- As a researcher, I can close the Tabellify tab like any other tab.
- As a researcher, I can disable, re-enable or remove Tabellify, and restart Zotero, without
  losing my open PDF and note tabs and without errors.

## Acceptance criteria
Each tagged `[auto]` (automated test, `npm test`) or `[manual]` (owner verifies in the dev
profile, Zotero 10.0.9). Manual steps go in `docs/testing/manual/002-workspace-tab.md`.

- [ ] AC1 `[manual]` + `[auto]` **Opens as a tab.** Given the dev Zotero window is open, when
  the owner chooses Tools → Tabellify…, then a new tab titled "Tabellify" (`tabellify-tab-title`)
  appears in that window's tab bar, is selected, and shows the placeholder title and
  description. No separate window opens. Auto: with a fake `Zotero_Tabs`, `openWorkspace`
  calls `add` once with `type: "tabellify"`, `data` an object, a string `title`, `select: true`,
  and a function `onClose`, and does not call `openDialog`.
- [ ] AC2 `[manual]` + `[auto]` **Single instance.** Given the Tabellify tab is open and another
  tab (library or PDF) is selected, when the owner chooses Tools → Tabellify… again, then the
  existing Tabellify tab is selected and no second Tabellify tab appears. Auto: second
  `openWorkspace` calls `select(storedID)` and not `add`. After the fake fires `onClose`, the
  next `openWorkspace` calls `add` again.
- [ ] AC3 `[manual]` **Works in full screen and maximized.** Given the dev Zotero window is in
  full screen (macOS: View → Enter Full Screen, or the green window button) and, separately,
  maximized, when the owner opens Tabellify from the Tools menu, then the tab is visible in the
  same full-screen/maximized window and can be switched to and from with the tab bar and
  Ctrl/Cmd-;.
- [ ] AC4 `[manual]` **Closing the tab works.** Closing the Tabellify tab (its × button, File →
  Close Tab / Cmd-W, or the tab's right-click → Close) removes it with no Tabellify errors in
  Help → Debug Output Logging → View Output or in the Error Console. Reopening from the menu
  afterwards opens a fresh tab.
- [ ] AC5 `[manual]` + `[auto]` **Disable removes the tab.** Given the Tabellify tab is open,
  when the owner disables Tabellify in Tools → Plugins, then the tab disappears, the menu item
  disappears, and no Tabellify errors appear. Running RT1 afterwards shows no `"tabellify"`
  type in the open tabs. Auto: `shutdown()` calls `close` on every stored Tabellify tab id, in
  every main window, **before** `chromeHandle.destruct()`, removes the
  `quit-application-granted` observer, and clears stored ids.
- [ ] AC6 `[manual]` + `[auto]` **No restorable session entry; other tabs survive.** Given a
  PDF tab, the Tabellify tab, and a second PDF tab are open in that order, when the owner quits
  Zotero (Zotero → Quit) and starts it again, then both PDF tabs are restored, no Tabellify tab
  is restored, RT3 shows no `"tabellify"` entry in the saved session, and no
  "Cannot destructure property 'itemID'" error appears. Repeat once with Tabellify disabled
  before the quit. Auto: the `quit-application-granted` observer closes every stored Tabellify
  tab; `startup` adds the observer and `shutdown` removes it (symmetry test).
- [ ] AC7 `[manual]` **Re-enable works.** After AC5, re-enabling Tabellify in Tools → Plugins
  brings the menu item back, and Tools → Tabellify… opens a working tab with no errors.
- [ ] AC8 `[manual]` **Main window close (macOS).** With the Tabellify tab and one PDF tab
  open, close the main window (red button; Zotero keeps running), then reopen it from the Dock.
  The PDF tab is restored, no Tabellify tab is restored, and no destructuring error appears.
- [ ] AC9 `[auto]` **Fallback.** If `Zotero_Tabs` or any of `add/select/close/getTabInfo` is
  missing, or `add` throws, `openWorkspace` logs once and opens the F001 window instead.
- [ ] AC10 `[auto]` + review **No library writes.** The write guard passes. The plugin does not
  write `Zotero.Session` or any file. Review confirms only the internals listed below are used
  (no `_tabs`, no `tabHooks`, no `Zotero.Session`).
- [ ] AC11 `[auto]` **Tab type rules.** The tab type string is exactly `"tabellify"` (no
  hyphen, because Zotero splits types on `-`), and `data` is always an object (Zotero's
  `_update` reads `tab.data.icon`).

## Design

### Behaviour
```
Tools → Tabellify…  ──▶  Tabellify.openWorkspace(win)
                           │ feature-detect win.Zotero_Tabs.{add,select,close,getTabInfo}
                           │   missing → openWorkspaceWindow()  (F001 code, fallback)
                           │ stored id for win AND getTabInfo(id).type === "tabellify"
                           │   → Zotero_Tabs.select(id)
                           │ else
                           │   → { id, container } = Zotero_Tabs.add({
                           │        type: "tabellify", title, data: {}, select: true,
                           │        onClose: () => forget(win) })
                           │     container.append(<iframe src="chrome://tabellify/content/workspace.xhtml">)
                           │     remember(win, id)
quit-application-granted ──▶ closeAllTabs()       (before Zotero.Session.save, see ADR-0009)
onMainWindowUnload(win)  ──▶ closeTab(win)        (plus F001's FTL-link removal)
shutdown()               ──▶ closeAllTabs(); closeWorkspaceWindows(); removeObserver;
                             unregisterMenu; per-window unload; then bootstrap destructs chrome
```

- **Which window:** MenuManager's `onCommand(event, context)` runs in the window whose menu was
  used. Use `event.target.ownerGlobal` (standard DOM; UNVERIFIED for MenuManager items) or, if
  that's not available, `Zotero.getMainWindow()`.
- **Title:** `await win.document.l10n.formatValue("tabellify-tab-title")` (new message,
  `tabellify-tab-title = Tabellify`; owner decision Q5). The main
  window already has `tabellify.ftl` (F001 inserts it for the menu label). If formatting fails,
  fall back to `"Tabellify"`.
- **Content:** an HTML `<iframe>` filling the container, `src` =
  `chrome://tabellify/content/workspace.xhtml` (the F001 document, which already loads its own
  Fluent file and CSS). It is UNVERIFIED that this loads as a privileged chrome document inside
  the tab (RT2). If RT2 fails, T2 uses the fallback: plain `html:main/h1/p` nodes with
  `data-l10n-id` built directly into `container`. **No `customElements.define`**, because it
  can't be undone on disable.
- **Bookkeeping:** a `Map` (or `WeakMap`) from main window to tab id. Cleared by `onClose`.
- **Order in `shutdown`:** close tabs and windows first, while `chrome://tabellify/` still
  resolves, then the rest. Bootstrap destructs chrome last (unchanged from F001).

### Files touched (proposed)
- `src/tabellify.js`: `openWorkspace` becomes tab-first with window fallback; new
  `openWorkspaceTab`, `closeWorkspaceTab(win)`, `closeAllWorkspaceTabs()`, quit observer;
  `onMainWindowUnload` and `shutdown` extended. **`bootstrap.js` unchanged.**
- `src/content/workspace.xhtml` / `.css`: only if RT2 shows the document needs adjusting to
  sit inside an iframe (e.g. `<window>` root sizing). Keep it working as a window for the
  fallback.
- `src/locale/en-US/tabellify.ftl`: only if a separate tab-title message is wanted (Q5).
- `tests/helpers/zotero-mock.mjs`, `tests/behavior/*.test.mjs`, `tests/static/*.test.mjs`:
  fake `Zotero_Tabs` modelling only the behaviour verified below; fake `Services.obs`.
- `docs/testing/manual/002-workspace-tab.md`.

## Zotero APIs used
Proposed rows for `docs/zotero-api-notes.md`, to be merged after owner approval. "Internal" =
not in any zotero.org developer guide (Z7, Z8, Z9, Z10 checked; see ADR-0009 Context).
`src10:` = `https://github.com/zotero/zotero/blob/10.0.9/`. Line numbers are approximate
(`~`); search the file for the quoted identifier. Nothing here is Verified (runtime): agents
can't run Zotero.

| API / mechanism | Purpose | Status | Versions | Source | Notes |
|---|---|---|---|---|---|
| `win.Zotero_Tabs` (window global, `var Zotero_Tabs = new function () {…}`) | Reach the tab manager of a main window | Verified (source). **Internal** | 7.0.0, 8.0, 10.0.9 | [src10:`chrome/content/zotero/tabs.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/tabs.js) (top of file); [src10:`chrome/content/zotero/zoteroPane.xhtml`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/zoteroPane.xhtml) (`loadSubScript("chrome://zotero/content/tabs.js", this)`) | One per main window. Same declaration at [7.0.0](https://github.com/zotero/zotero/blob/7.0.0/chrome/content/zotero/tabs.js). Feature-detect before use (AC9) |
| `Zotero_Tabs.add({ id?, type, title, data, index?, select, onClose, preventJumpback? })` → `{ id, container }` | Create the tab | Verified (source). **Internal** | 7.0.0, 8.0, 10.0.9 | src10:`tabs.js` `this.add = function` (~L630; JSDoc above it: `@return {{ id: string, container: XULElement}}`) | Same signature at 7.0.0 and 8.0. Container element changed: `vbox` (7.0.0) → `tab-content` (8.0, 10.0.9), appended to `#tabs-deck`, `container.id = id`. JSDoc documents `type, title, data, index, select, onClose`; `id`, `preventJumpback` are undocumented. Type must have **no hyphen** (`parseTabType` splits on `-`). Always pass **`data: {}`**: `_update()` reads `tab.data.icon` for every non-library tab, so missing `data` would throw. With no `data.icon`, `_update` tries `Zotero.Items.get(undefined)` inside `try/catch` (harmless). Reference use: Better Notes v2.5.7 [`tab.ts` ~L27–35](https://github.com/windingwind/zotero-better-notes/blob/v2.5.7/src/modules/workspace/tab.ts); Zotero's own `ReaderTab` in [src10:`xpcom/reader.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/reader.js) |
| `Zotero_Tabs.select(id, reopening?, options?)` | Single instance: show existing tab | Verified (source). **Internal** | 7.0.0, 10.0.9 | src10:`tabs.js` `this.select = function (id, reopening, options = {})` | Dereferences the found tab without a guard, so call only for an id confirmed by `getTabInfo` |
| `Zotero_Tabs.close(ids)` (string or array) | Close our tab (user, unload, quit, shutdown) | Verified (source). **Internal** | 7.0.0, 8.0, 10.0.9 | src10:`tabs.js` `this.close = function (ids)` | Removes the tab from the internal list **immediately**, calls the tab's `onClose()`, fires Notifier `close`, and removes the container **later** in a `setTimeout`. Throws if given `zotero-pane`. Same at 7.0.0 and 8.0 |
| `onClose` option of `add` | Clear our stored id when the tab closes | Verified (source). **Internal** (documented in JSDoc only) | 7.0.0, 8.0, 10.0.9 | src10:`tabs.js` `close` (`if (tab.onClose) { tab.onClose(); }`) | Called for every close path that goes through `close()` |
| `Zotero_Tabs.getTabInfo(tabID)` | Check whether our stored id is still a Tabellify tab | Verified (source). **Internal** | 10.0.9 | src10:`tabs.js` `this.getTabInfo = function (tabID)`; `Zotero.Items.get(undefined)` returns `false` ([src10:`xpcom/data/dataObjects.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/data/dataObjects.js) `get`) | Returns a copy of the tab. For an unknown id, source suggests it returns `{}` (not verified at runtime, RT2). Use `getTabInfo(id)?.type === "tabellify"` |
| `#tabs-deck` in the main window | Where tab content lives; why full screen works | Verified (source) | 7.0.0, 8.0, 10.0.9 | src10:`zoteroPane.xhtml` (`<deck id="tabs-deck">` inside `<window id="main-window" windowtype="navigator:browser">`); `tabs.js` `deck` getter (`document.getElementById('tabs-deck')`) | Not called directly by Tabellify. Full-screen visibility follows from this (AC3, manual) |
| Session save/restore: `Zotero_Tabs.getState()` / `restoreState(tabs)`; `ZoteroPane.getState()`; `Zotero.Session.save()` on `quit-application-granted`; `Zotero.Session.state` | **Not used.** Recorded because it drives the cleanup design | Verified (source). **Internal** | 7.0.0 (skip), 8.0 + 10.0.9 (throw) | src10:`tabs.js` `getState` (~L581, saves every tab), `restoreState` (~L603, `let { itemID } = await restoreStateHook(tab, i);`), `_getHook` (~L307, default `async () => {}`); [src10:`zoteroPane.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/zoteroPane.js) (`getState` → `{type:'pane', tabs: Zotero_Tabs.getState()}`; `_loadPane` calls `restoreState` in `try/catch` without `await`); [src10:`xpcom/session.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/session.js) (`session.json` in the profile; 5-min `debounceSave`); [src10:`xpcom/zotero.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/zotero.js) (`quit-application-granted` → `Zotero.Session.save()`) | **A saved tab of unknown type throws a TypeError on restore, and every later tab is not restored** (8.0+). At [7.0.0](https://github.com/zotero/zotero/blob/7.0.0/chrome/content/zotero/tabs.js) unknown types were skipped. Tabellify must never be in the saved session (ADR-0009 §4) |
| `Services.obs.addObserver(observer, "quit-application-granted")` / `removeObserver(observer, topic)` | Close our tab before Zotero saves the session at quit | Verified (source) for the API; **UNVERIFIED (runtime)** for ordering | ESR 140 / 10.0.9 | [moz:`xpcom/ds/nsIObserverService.idl`](https://searchfox.org/mozilla-esr140/source/xpcom/ds/nsIObserverService.idl) (`addObserver(in nsIObserver anObserver, in string aTopic, [optional] in boolean ownsWeak)`); order: [moz:`xpcom/ds/nsObserverList.cpp`](https://searchfox.org/mozilla-esr140/source/xpcom/ds/nsObserverList.cpp) (`ReverseCloneObserverArray`: newest observer notified first; comment says nobody should rely on order) | Ours registers after Zotero's, so it should run first. Proven only by AC6. Add in `startup` (`init`), remove in `shutdown` |
| Add-on shutdown happens at `profile-before-change` (after `quit-application-granted`) | Why closing the tab in `shutdown()` at app quit is too late | Verified (source) | ESR 140 | [moz:`toolkit/mozapps/extensions/AddonManager.sys.mjs`](https://searchfox.org/mozilla-esr140/source/toolkit/mozapps/extensions/AddonManager.sys.mjs) (`AsyncShutdown.profileBeforeChange.addBlocker("AddonManager: shutting down.", …)`) | Not called. Informs design |
| HTML `<iframe>` with a `chrome://` `src` inside the tab container | Our own document in the tab | **UNVERIFIED** | — | Standard DOM. No Zotero precedent found: `zoteroPane.xhtml` @ 10.0.9 has no `<iframe>`/`<browser>`; `ReaderTab` uses `<browser type="content">` for an unprivileged page | Verify with RT2: the document loads, `nodePrincipal.isSystemPrincipal === true`, Fluent strings render. Fallback: build DOM directly in `container` |
| `win.document.l10n.formatValue(id)` | Localized tab title | **UNVERIFIED** | — | Mozilla DOMLocalization (standard in Firefox 140 chrome documents); main window gets `tabellify.ftl` via F001's `insertFTLIfNeeded` row | Verify with RT2. Fallback title `"Tabellify"` |
| `event.target.ownerGlobal` in MenuManager `onCommand(event, context)` | Open the tab in the window whose menu was used | **UNVERIFIED** | — | `onCommand(event, context)` is source-verified (api-notes MenuManager row); `ownerGlobal` is a Mozilla chrome-only DOM property | Verify with RT4. Fallback: `Zotero.getMainWindow()` |
| `ZoteroPane.openNote(id, { openInWindow: false })` (native note tab) | **Not used** (would need a note item = library write) | Recorded from Better Notes v3.3.5 | 8.0+ | [Better Notes `src/hooks.ts` @ v3.3.5](https://github.com/windingwind/zotero-better-notes/blob/v3.3.5/src/hooks.ts) (~L292–298); [8.0 changelog](https://www.zotero.org/support/8.0_changelog) "Notes now open in tabs by default" | Listed so it isn't retried. See ADR-0009 option C1 |

**Stability summary (7.0.0 → 8.0 → 10.0.9):** `add` signature and `{id, container}` return,
`close`, `select`, `onClose`, `tabs-deck`: unchanged. Container element `vbox` → `tab-content`
(doesn't matter to us). `rename` became async (not used). `restoreState` changed from
"skip unknown" to "throw on unknown" in 8.0. That change is why cleanup matters.

## Runtime checks for the owner
Run these **only in the dev profile** (Zotero 10.0.9). They write no library data and no
files. Report each result back so the matching rows can be set to Verified (runtime) by the
owner.

**RT1: Internals exist (read-only). Run before T2.**
1. Start Zotero with the dev profile. Wait until the dev Zotero window shows the library.
2. In the dev Zotero window, choose **Tools → Developer → Run JavaScript**. The Run JavaScript
   window opens.
3. In the Run JavaScript window, untick "Run as async function", paste the code below, and
   click **Run**.
   ```js
   const win = Zotero.getMainWindow();
   const T = win.Zotero_Tabs;
   ({
     version: Zotero.version,
     zoteroTabs: typeof T,
     add: typeof T?.add,
     select: typeof T?.select,
     close: typeof T?.close,
     getTabInfo: typeof T?.getTabInfo,
     deck: !!win.document.getElementById("tabs-deck"),
     restoreHookTypes: Object.keys(T?.tabHooks?.restoreState ?? {}),
     openTabTypes: T?.getState().map(t => t.type),
     unknownTabInfo: JSON.stringify(T?.getTabInfo("no-such-tab-id")),
   })
   ```
4. **Expected:** `version` `"10.0.9"`; `zoteroTabs` `"object"`; `add`, `select`, `close`,
   `getTabInfo` all `"function"`; `deck` `true`; `restoreHookTypes` `["library","reader","note"]`
   (order may differ); `openTabTypes` lists your open tabs (e.g. `["library","reader"]`);
   `unknownTabInfo` `"{}"`. If `unknownTabInfo` throws instead, report the error text: T2 will
   then wrap that call in `try/catch`.

**RT2: Temporary probe tab with our iframe (UI only, closes itself). Run before T2, with the
F001 build installed and enabled** (it provides `chrome://tabellify/` and `tabellify.ftl`).
1. In the dev Zotero window, open at least one PDF so a reader tab exists. Select the
   **library** tab again.
2. In the dev Zotero window, choose **Tools → Developer → Run JavaScript**.
3. In the Run JavaScript window, **tick "Run as async function"**, paste the code below, and
   click **Run**. A tab titled with the Tabellify title appears for 5 seconds and then closes by
   itself. While it is open, look at it: is the placeholder visible? Is the right-hand item
   pane/context pane shown or hidden?
   ```js
   const win = Zotero.getMainWindow();
   const T = win.Zotero_Tabs;
   const out = {};
   let id;
   try {
     out.title = await win.document.l10n.formatValue("tabellify-workspace-title");
     ({ id } = T.add({ type: "tabellifyprobe", title: out.title || "Probe", data: {}, select: true, onClose: () => { out.onCloseCalled = true; } }));
     const container = win.document.getElementById(id);
     out.containerTag = container?.localName;
     out.parentId = container?.parentElement?.id;
     out.infoType = T.getTabInfo(id).type;
     const iframe = win.document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
     iframe.setAttribute("style", "flex: 1; border: 0; width: 100%; height: 100%;");
     const loaded = new Promise(r => iframe.addEventListener("load", r, { once: true }));
     iframe.src = "chrome://tabellify/content/workspace.xhtml";
     container.append(iframe);
     await Promise.race([loaded, new Promise(r => setTimeout(r, 3000))]);
     const doc = iframe.contentDocument;
     out.iframeURL = doc?.documentURI;
     out.systemPrincipal = doc?.nodePrincipal?.isSystemPrincipal;
     await new Promise(r => setTimeout(r, 1000));
     out.h1 = doc?.querySelector("h1")?.textContent;
     await new Promise(r => setTimeout(r, 4000));
   } catch (e) {
     out.error = String(e);
   } finally {
     if (id) T.close(id);
   }
   await new Promise(r => setTimeout(r, 200));
   out.elementGoneAfterClose = !win.document.getElementById(id);
   out.openTabTypesAfter = T.getState().map(t => t.type);
   out
   ```
4. **Expected:** `title` and `h1` are the real localized workspace title (not `null`/empty);
   `containerTag` `"tab-content"`; `parentId` `"tabs-deck"`; `infoType` `"tabellifyprobe"`;
   `iframeURL` `"chrome://tabellify/content/workspace.xhtml"`; `systemPrincipal` `true`;
   `onCloseCalled` `true`; `elementGoneAfterClose` `true`; `openTabTypesAfter` has no
   `"tabellifyprobe"`; no `error`. Note what you saw in the right-hand pane.
5. **Safety:** this only adds and removes a UI tab. Don't quit Zotero during the 5 seconds
   (the probe type would be saved in the session and break tab restore on the next start; if
   that happens, report it and don't run anything else).

**RT3: Saved session contents (read-only). Use during AC6/AC8.**
1. In the dev Zotero window, choose **Tools → Developer → Run JavaScript**.
2. In the Run JavaScript window, untick "Run as async function", paste, click **Run**:
   ```js
   Zotero.Session.state.windows.map(w => ({ type: w.type, tabs: (w.tabs || []).map(t => t.type) }))
   ```
3. **Expected:** after a restart (AC6), the `pane` entry has no `"tabellify"` tab. This shows
   what Zotero loaded at startup from `session.json`, not the current tabs.

**RT4: Which window a menu command runs in (UI only). Run during T2 manual testing.** T2 adds a
temporary debug line in `onCommand` logging `event.target.ownerGlobal === Zotero.getMainWindow()`.
1. In the dev Zotero window, choose **Tools → Tabellify…**.
2. Choose **Help → Debug Output Logging → View Output**.
3. **Expected:** a `Tabellify:` line showing `true`. The debug line is removed before review.

## Data safety
- **Reads:** nothing from the library. It reads only Zotero's in-memory tab list for our own
  tab (`getTabInfo`).
- **Writes:** nothing to the library (no items, collections, tags, annotations, attachments or
  database rows). No files.
- **Zotero UI state:** Tabellify adds and closes **its own** tab only. It never closes, moves
  or changes other tabs.
- **Zotero session (`session.json`):** Tabellify never writes it. Zotero writes it. The design
  makes sure our tab is closed before Zotero saves it (ADR-0009). Residual risk: if Zotero
  crashes while a Tabellify tab is open after a 5-minute debounced save, the next start may
  not restore tabs after the Tabellify entry. That affects Zotero's tab restore only, never
  library data (Q3).
- Write guard (F001 AC6) extended: no `Zotero.Session` writes, no `_tabs`/`tabHooks` access.

## Test plan
| AC | Unit / behaviour (`node:test`, fake `Zotero_Tabs` in `tests/helpers/zotero-mock.mjs`) | Static | Manual |
|---|---|---|---|
| AC1 | `add` called once with required shape; no `openDialog` | — | Tools → Tabellify… |
| AC2 | second call → `select`; after `onClose` → `add` | — | reopen from menu |
| AC3 | — | — | full screen + maximized |
| AC4 | `onClose` clears stored id | — | × / Cmd-W / context menu |
| AC5 | shutdown closes tabs before `destruct`, removes observer | add/remove observer symmetry | disable in Tools → Plugins + RT1 |
| AC6 | quit observer closes all tabs | observer symmetry | quit/restart + RT3 |
| AC7 | startup after shutdown re-registers cleanly | — | re-enable |
| AC8 | `onMainWindowUnload` closes that window's tab | — | macOS close/reopen main window |
| AC9 | missing methods / `add` throws → window fallback | — | — |
| AC10 | — | write guard; internal-API allow-list (`add`, `select`, `close`, `getTabInfo` only) | review |
| AC11 | type `"tabellify"`, `data` is an object | — | — |

The fake `Zotero_Tabs` models only source-verified behaviour: `add` returns `{id, container}`;
`close` removes the tab immediately, calls `onClose`, removes the container later;
`getTabInfo` of an unknown id returns `{}`.

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Accept/change ADR-0009; approve this spec; run RT1 and RT2 and report results | Owner | F001 merged (for RT2) | — |
| T1 | Merge "Zotero APIs used" rows into api-notes with RT1/RT2 results; update architecture §4 surfaces table (ADR-0004 superseded and PRD renumbering already done on `docs/002-workspace-tab`) | orchestrator + architect | T0 | `docs/zotero-api-notes.md`, `docs/architecture.md` |
| T2 | Tab open/select/close, quit observer, unload/shutdown cleanup, window fallback; adjust workspace document for iframe use only if RT2 requires | developer | T1 | `src/tabellify.js`, `src/content/` (only if needed), `src/locale/en-US/tabellify.ftl` (add `tabellify-tab-title`) |
| T3 | Extend mock with fake `Zotero_Tabs` and `Services.obs`; behaviour + static tests for AC1, 2, 4–6, 9–11 | tester | T1 (can start in parallel with T2 on the same branch, sequentially) | `tests/` |
| T4 | Manual checklist for AC1–AC8 with RT3/RT4 | tester | T1 | `docs/testing/manual/002-workspace-tab.md` |
| T5 | Run `npm test`; owner runs manual checklist on 10.0.9 | tester + owner | T2, T3, T4 | — |
| T6 | Independent review (internal-API allow-list, lifecycle symmetry, shutdown order) | reviewer | T5 | read-only |

Run sequentially on `feat/002-workspace-tab` (same reason as F001: worktrees branch from
`main`, and T2–T4 build on each other).

## Open questions
- ~~Q1~~ **Resolved (owner, 2026-11-11): option A accepted; ADR-0009 Accepted.** It relies on undocumented `Zotero_Tabs` internals
  (four methods). The alternatives either fail the full-screen requirement (B, C3) or need
  library writes (C1).
- ~~Q2~~ **Resolved (owner): no tab restore after restart for now.** Not in this spec. Doing it needs
  either patching Zotero's internal `tabHooks` or reading/editing `Zotero.Session.state` like
  Better Notes v2 did (ADR-0009 option C5), plus a new ADR.
- **Q3 — Resolved for now (owner): residual risk accepted. Revisit before public release.** If Zotero crashes with the tab open after a debounced save,
  the next start won't restore tabs after the Tabellify entry, and Zotero logs a TypeError. A
  fix would mean removing `"tabellify"` entries from `Zotero.Session.state` in `startup`. That
  touches Zotero's session state (not library data), and it's UNVERIFIED whether plugin
  `startup` runs before the main window restores tabs. Accept the residual risk for now?
- ~~Q4~~ **Resolved (owner): yes, keep the F001 window code as the automatic fallback (AC9).** Proposed: keep it as the automatic fallback
  (AC9). Removing it later is a small separate change.
- ~~Q5~~ **Resolved (owner): add `tabellify-tab-title = Tabellify`.** Reuse `tabellify-workspace-title`, or add a shorter
  `tabellify-tab-title` (e.g. "Tabellify")?
- **Q6: main-window close on macOS (AC8).** Zotero saves the pane state when the last main
  window closes (`ZoteroPane.destroy` → `setLastClosedZoteroPaneState`). It is UNVERIFIED
  whether our `onMainWindowUnload` closes the tab before that. If AC8 fails, T2 adds an
  `unload`-time listener registered earlier, or Q3's startup clean-up becomes necessary.
- **Q7: right-hand pane.** For unknown tab types Zotero's context pane doesn't collapse
  (`contextPane.js` only collapses for `library`). RT2 will show whether the item/notes pane
  stays visible next to the workspace. If it does, a later task may need to hide it, which is
  more internals.
- **Q8 — Resolved (owner): yes.** The owner will post a request on forums.zotero.org (draft by orchestrator). Should the owner ask Zotero (forums/GitHub) for a documented plugin tab API
  or for `restoreState` to skip unknown types like 7.0 did? That would remove most of the risk.
