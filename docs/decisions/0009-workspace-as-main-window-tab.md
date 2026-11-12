# ADR-0009: Workspace as a tab in the main Zotero window

- **Status:** Accepted (owner, 2026-11-11: option A)
- **Date:** 2026-11-11
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Supersedes:** ADR-0004 (workspace as a separate window), now marked "Superseded by ADR-0009".
- **Related:** ADR-0002 / ADR-0008 (compatibility range), ADR-0005 (testing), Feature 002 spec
  `docs/features/002-workspace-tab.md`

## Context

### The new requirement
The owner wants the Tabellify workspace to open as a **tab inside the main Zotero window**,
next to the library and PDF tabs, so it stays usable when Zotero is maximized or in full
screen. In F001 the workspace is a separate window (ADR-0004). In full screen that window is
left behind, which the owner says is not acceptable for the real product.

### Why a tab works in full screen
A tab's content sits inside the main window's own document. Zotero's main window
(`<window id="main-window" windowtype="navigator:browser">`) contains the tab bar and a
`<deck id="tabs-deck">` that holds one content element per tab
([`zoteroPane.xhtml` @ 10.0.9](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/zoteroPane.xhtml),
search `id="tabs-deck"` and `id="main-window"`). Each `Zotero_Tabs.add()` call appends a new
child to that deck (see below). So a Tabellify tab is part of the main window and goes into
full screen with it. A separate window is a different OS window and doesn't. This is
"Verified (source, by construction)" and needs the owner's manual check (F002 AC3).

### There is no documented tab API
I checked every Zotero developer guide. None of them documents a way for plugins to create
main-window tabs:
- [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers): no tab API.
- [Zotero 8 for Developers](https://www.zotero.org/support/dev/zotero_8_for_developers): only the
  menu target `main/tab` (adds items to a tab's right-click menu; it cannot create tabs).
- [Zotero 9 for Developers](https://www.zotero.org/support/dev/zotero_9_for_developers): "did not
  include any major developer-facing changes".
- [Zotero 10 for Developers](https://www.zotero.org/support/dev/zotero_10_for_developers): no tab API.
- The plugin API folder at 10.0.9
  ([`xpcom/pluginAPI/`](https://github.com/zotero/zotero/tree/10.0.9/chrome/content/zotero/xpcom/pluginAPI))
  has `itemPaneManager.js`, `itemTreeManager.js`, `menuManager.js`, `pluginAPIBase.mjs`. There is
  no tab manager.

So **any main-window tab uses Zotero internals**: code Zotero does not promise to keep stable.

### How Zotero's tabs work (Zotero 10.0.9)
"Internal" below means "not in any developer guide". All of it is source-verified at tag
[`10.0.9`](https://github.com/zotero/zotero/tree/10.0.9). File:
[`chrome/content/zotero/tabs.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/tabs.js).
Line numbers are approximate (`~`); search for the quoted identifier.

- `var Zotero_Tabs = new function () {…}` is loaded into each main window
  (`Services.scriptloader.loadSubScript("chrome://zotero/content/tabs.js", this)` in
  `zoteroPane.xhtml`). From plugin code: `Zotero.getMainWindow().Zotero_Tabs`. One per window.
- `add({ id, type, data, title, index, select, onClose, preventJumpback })` (~L630). It creates a
  `<tab-content>` element (`document.createXULElement('tab-content')`), sets its `id` to the
  tab id, appends it to the deck (~L650), and **returns `{ id, container }`**. The JSDoc
  documents `type, title, data, index, select, onClose`. `id` and `preventJumpback` are
  accepted but not documented. A non-string `type` isn't rejected (the check has an empty body).
- `close(ids)`: removes the tab from the internal list, calls the tab's `onClose()`, removes
  the container element **later** (inside `setTimeout`), and fires a Notifier `close` event.
- `select(id, reopening, options = {})`: shows the tab and fires a Notifier `select` event.
- `getTabInfo(tabID)`: returns a copy of the tab. For non-library tabs it calls
  `Zotero.Items.get(info.data?.itemID)`. With no `itemID`, that returns `false` and doesn't
  throw ([`dataObjects.js` `get`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/data/dataObjects.js)).
- `parseTabType(type)` splits the type on `-` (`reader-unloaded` → content `reader`, state
  `unloaded`). **A plugin tab type must not contain a hyphen.** Tabellify would use `"tabellify"`.
- `_update()` reads `tab.data.icon` for every non-library tab without checking `data` exists.
  **A plugin tab must pass `data: {}` (or `data: { icon }`).** Missing `data` would throw.
- `tabHooks` (~L97) is a hard-coded object of per-type behaviour (`load`, `restoreState`,
  `undoClose`, `duplicate`, `moveToNewWindow`, …). Only `library`, `reader`, `note` have
  entries. There is **no function to register a new tab type.**
- The tab right-click menu shows "Move to New Window", "Duplicate" and "Undo Close" only for
  types that have those hooks, so a Tabellify tab gets only Close, Move and "Show in Library".

### Session restore: the biggest risk
- `Zotero_Tabs.getState()` (~L581) saves **every** open tab, whatever its type.
  `ZoteroPane.getState()` returns `{ type: 'pane', tabs: Zotero_Tabs.getState() }`
  ([`zoteroPane.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/zoteroPane.js)).
- `Zotero.Session.save()` writes this to `session.json` in the profile. It runs on the
  `quit-application-granted` observer
  ([`xpcom/zotero.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/zotero.js)),
  through a 5-minute debounced save, and when the last main window closes
  ([`xpcom/session.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/session.js)).
- **Plugins are shut down after that save.** Mozilla's Add-on Manager shuts down on
  `profile-before-change`
  ([`AddonManager.sys.mjs` `AsyncShutdown.profileBeforeChange.addBlocker`](https://searchfox.org/mozilla-esr140/source/toolkit/mozapps/extensions/AddonManager.sys.mjs)),
  which comes after `quit-application-granted`. So closing the tab in `shutdown()` at app quit
  is **too late**: the tab is already in `session.json`.
- `Zotero_Tabs.restoreState(tabs)` (~L603), on the next start, does this for each saved tab:
  `let { itemID } = await restoreStateHook(tab, i);`. For an unknown type, `_getHook()` returns
  `async () => {}`, which resolves to `undefined`, and destructuring `undefined` **throws a
  TypeError**. No `try/catch` surrounds the loop, so **every tab after the Tabellify entry is
  not restored**, and the clean-up after the loop is skipped. The caller in `zoteroPane.js`
  (`_loadPane`) wraps the call in `try/catch` but doesn't `await` it, so the error becomes an
  unhandled promise rejection.
- This changed between versions. At [7.0.0](https://github.com/zotero/zotero/blob/7.0.0/chrome/content/zotero/tabs.js)
  `restoreState` only handled `library` and `reader` and **silently skipped** other types. The
  hook-based version that throws has been there since [8.0](https://github.com/zotero/zotero/blob/8.0/chrome/content/zotero/tabs.js).
- If Tabellify is later disabled or removed while a Tabellify entry is in `session.json`, no
  Tabellify code runs to clean it up. The result is the same: lost tabs and a logged error.

So a persisted Tabellify tab can break the owner's PDF and note tabs after restart. The design
must make sure a Tabellify tab is **never in the saved session**.

### What Better Notes does
Better Notes (windingwind/zotero-better-notes) is the model the owner named.
- **Latest release `v3.3.5`** (targets Zotero `8.0-beta.21` to `10.99.99`,
  [`addon/manifest.json`](https://github.com/windingwind/zotero-better-notes/blob/v3.3.5/addon/manifest.json))
  **no longer creates its own tab.** It opens notes in **Zotero 8's native note tabs** with
  `win.ZoteroPane.openNote(noteId, { openInWindow: false })`
  ([`src/hooks.ts` ~L292–298 @ v3.3.5](https://github.com/windingwind/zotero-better-notes/blob/v3.3.5/src/hooks.ts)).
  Its `TAB_TYPE` is `"note"`, Zotero's own type
  ([`src/modules/workspace/tab.ts` L1 @ v3.3.5](https://github.com/windingwind/zotero-better-notes/blob/v3.3.5/src/modules/workspace/tab.ts)).
  Its `onShutdown` doesn't close tabs. It doesn't need to, because Zotero owns note tabs.
  Release [`v3.0.0-beta.7`](https://github.com/windingwind/zotero-better-notes/releases/tag/v3.0.0-beta.7)
  says "Integrate with z8 native note tab" and "Remove unused tab management functions".
  Zotero 8 added note tabs: "Notes now open in tabs by default"
  ([8.0 changelog](https://www.zotero.org/support/8.0_changelog), released 2026-01-22).
- **Before that, `v2.5.7`** (Zotero `7.0.0-beta.70` to `8.0.*`,
  [`addon/manifest.json` @ v2.5.7](https://github.com/windingwind/zotero-better-notes/blob/v2.5.7/addon/manifest.json))
  made its own tab with raw internals, no toolkit wrapper
  ([`src/modules/workspace/tab.ts` @ v2.5.7](https://github.com/windingwind/zotero-better-notes/blob/v2.5.7/src/modules/workspace/tab.ts)):
  - open: `Zotero.getMainWindow().Zotero_Tabs.add({ type: "note", title, data: { itemID }, select, onClose: () => {} })` → `{ id, container }` (~L27–35);
  - content: a custom element `bn-workspace`, created with `new (customElements.get("bn-workspace"))()` and appended to `container`
    ([`content.ts`](https://github.com/windingwind/zotero-better-notes/blob/v2.5.7/src/modules/workspace/content.ts));
  - single instance: searches the internal `Zotero_Tabs._tabs` for `data.itemID`, then `Zotero_Tabs.select(id)` (~L14–21);
  - restore: in `onMainWindowLoad` it reads `Zotero.Session.state.windows.find(x => x.type == "pane").tabs` and reopens its tabs itself (~L64–75);
  - shutdown: **does not close its tabs**
    ([`src/hooks.ts` `onShutdown` @ v2.5.7](https://github.com/windingwind/zotero-better-notes/blob/v2.5.7/src/hooks.ts)).
    That worked on Zotero 7 because 7.0 skipped unknown types on restore.
- Dependencies: Better Notes uses `zotero-plugin-toolkit` `^6.0.0`
  ([`package.json` @ v3.3.5](https://github.com/windingwind/zotero-better-notes/blob/v3.3.5/package.json)),
  but its tab code calls `Zotero_Tabs` directly. **Tabellify needs no new dependency.**

Lesson: the best-known "workspace tab" plugin moved off custom tabs once Zotero had a native
equivalent. Its tab type `"note"` was later taken by Zotero's own note tabs. Custom tab code
needs maintenance each release.

### Constraints
- CLAUDE.md rule 1 (no invented APIs), rule 7 (new UI surface needs an ADR), rule 8 (no
  library writes), rule 9 (lifecycle symmetry).
- ADR-0008: Zotero 10.0.* only (`strict_max_version` 10.0.\*). The owner runs 10.0.9.
- ADR-0003: plain JavaScript, no bundler, no new dependency.

## Decision

**Option A: open the workspace as a main-window tab using the internal `Zotero_Tabs` object,
with strict guards.** Specifically:

1. **Smallest internal surface.** Use only `Zotero_Tabs.add`, `select`, `close` and
   `getTabInfo` (plus the `onClose` option and the `tabs-deck` container they manage). No
   `_tabs`, no `tabHooks` patching, no monkey-patching.
2. **Tab type `"tabellify"`** (no hyphen). Always pass `data: {}`.
3. **Content in our own document.** Put one `<iframe>` in the tab's `container` that loads
   `chrome://tabellify/content/workspace.xhtml` (UNVERIFIED, runtime check RT2). Our HTML,
   CSS and scripts stay in our own page, apart from Zotero's main window, and leave with the
   tab. Fallback if RT2 fails: build plain DOM nodes straight into `container`.
   Not custom elements: `customElements.define()` can't be undone, which breaks lifecycle
   symmetry on disable/re-enable.
4. **Never persist the tab.**
   - In `shutdown()` (disable, uninstall, upgrade): close every Tabellify tab in every main
     window **before** `chromeHandle.destruct()`.
   - In `onMainWindowUnload`: close the Tabellify tab in that window.
   - Register an observer for `quit-application-granted` (`Services.obs.addObserver`) that
     closes Tabellify tabs at quit. `close()` removes the tab from Zotero's list immediately,
     so it is gone before `Zotero.Session.save()` reads the tabs, **provided our observer runs
     first**. Mozilla currently notifies the newest observer first, and ours is registered after
     Zotero's. The source says "there shouldn't be anyone explicitly relying on the order"
     ([`nsObserverList.cpp`](https://searchfox.org/mozilla-esr140/source/xpcom/ds/nsObserverList.cpp)),
     so this is **UNVERIFIED (runtime)** until the owner runs the quit/restart check (F002 AC6).
     Remove the observer in `shutdown()`.
   - The tab does **not** reopen after a restart. The user reopens it from the menu. Restoring
     it would need a session hook Zotero doesn't offer.
5. **Feature-detect and fall back.** Before opening, check
   `typeof win.Zotero_Tabs?.add === "function"` (and `select`, `close`, `getTabInfo`). If
   anything is missing or `add` throws, log it and open the F001 separate window. A Zotero
   change then makes the workspace a window again, not unusable.
6. **Version policy.** Keep `strict_max_version` at `10.0.*` (ADR-0008). Before raising it for
   a new Zotero release, compare `tabs.js` (`add`, `close`, `getState`, `restoreState`,
   `_update`) and `session.js` between tags, and rerun F002's manual checks. Add this to the
   compatibility-check chore.
7. **Single instance.** Keep the tab id returned by `add` (per window). On reopen, if
   `getTabInfo(id).type === "tabellify"`, call `select(id)`. The `onClose` callback clears the
   stored id.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Main-window tab via `Zotero_Tabs` internals (recommended)** | Meets the requirement: works maximized and in full screen. Feels like PDF/note tabs. Small code (`add`/`select`/`close`). Same pattern Better Notes used for years. No dependency | Undocumented, so any Zotero release can change it (it already changed: `vbox`→`tab-content` and skip→throw on restore, 7.0→8.0). A leftover session entry breaks restore of later tabs. Cleanup depends on observer order at quit (runtime check). Can't unit-test against real Zotero, so the owner must test by hand |
| **B. Keep the separate window (ADR-0004)** | Fully documented APIs. Already built in F001. No session risk | Fails the new requirement: left behind in full screen. Opening it as a child or "dependent" window might help on macOS, but that is UNVERIFIED and still not a tab |
| **C1. Reuse Zotero's native note tab (Better Notes v3 approach)** | Zotero restores and cleans up the tab itself | Needs a real note item, so Tabellify would have to **create library data** (breaks rule 8 and the PRD). The tab contains Zotero's note editor, not our UI |
| **C2. Item-pane section** (`Zotero.ItemPaneManager.registerSection`, documented) | Documented; auto-cleanup; visible in full screen | Far too narrow for a table. Tied to the selected item. Still right for the tag monitor (F004) |
| **C3. Settings pane** (`Zotero.PreferencePanes.register`, documented) | Documented; matches the original sketch | Settings opens a **separate window**, so it has the same full-screen problem. Cramped |
| **C4. Take over the library tab's centre pane** (hide the items list, inject our UI) | Visible in full screen | More internal DOM surgery than A, conflicts with Zotero's own layout, high breakage risk, confusing UX |
| **C5. A + restore through `tabHooks` or by editing `Zotero.Session.state`** | Tab survives restarts, like Better Notes v2 | Patches more internals. Doesn't help once the plugin is gone. Editing Zotero's session state touches Zotero data outside the library, which needs explicit approval. Possible later ADR |

## Consequences
- **Easier:** full screen and maximized use. One window to manage. The F001 menu item stays,
  only its action changes.
- **Harder:** maintenance. Tabellify now depends on four undocumented methods and on
  undocumented session behaviour. Each Zotero release needs a source diff of `tabs.js` and
  `session.js` and a manual run (owner) before raising `strict_max_version`.
- **Riskier:** if cleanup misses (crash with the tab open after a debounced save, or observer
  order changes), the owner's tabs after the Tabellify entry won't restore on the next start.
  Mitigations: tab never persisted on purpose, feature-detect + window fallback, manual
  quit/restart check, version pin. Remaining risk: Zotero **crashes** within the 5-minute
  debounced-save window while a Tabellify tab is open. Documented in F002 Open questions.
- **Testing:** `Zotero_Tabs` isn't available in Node. The open/select/close logic is written
  against a small "tabs" parameter so `node:test` can use a fake. Real behaviour is `[manual]`.
- **Follow-up:** ask Zotero (forums / GitHub) for a documented tab API or a safe
  restore fallback for unknown types. If one ships, write a new ADR to move to it.
- **Revisit when:** a Zotero release changes `tabs.js` / `session.js`; Zotero documents a tab
  API; or the owner wants the tab restored after restart (C5).
