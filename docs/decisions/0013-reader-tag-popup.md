# ADR-0013: Showing "tags used / remaining" while reading a paper

- **Status:** Proposed
- **Date:** 2026-11-12
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** PRD §3 step 3, §4 "Tag monitor: panel beside the reader", §7 Q2/Q4;
  `docs/architecture.md` §4 (surfaces table: "Item pane / reader section … to verify");
  ADR-0009 (workspace tab), ADR-0012 (codebook storage), Feature 004 (codebook),
  Feature 005 (tag monitor in the workspace, built on another branch), Feature 005b spec
  `docs/features/005b-reader-tag-popup.md`

## Context

### What the owner asked for
> "When a user is in the reading pane there should be the ability to have a popup or a modal
> that shows how many tags remain and the ability to see what tags remain."
> "That large table editor is too big and would obstruct the reading view, I want this like a
> modal."

So, while a PDF (or EPUB / web snapshot) is open in Zotero's reader, the user needs a
**small** view of *this paper's* codebook progress: "4/15 used", and the list of the 11 tags
still missing, grouped by super-tag. It must not cover the page they are reading, or only
briefly and when asked.

This is a **new UI surface** (CLAUDE.md rule 7), and it lives in or next to Zotero's reader,
which Tabellify has not touched before. Hence this ADR.

### Background for a JavaScript learner
- **Reader tab.** When you open a PDF, Zotero opens a tab. The page you read is drawn by a
  separate web page (`resource://zotero/reader/reader.html`) inside an `<iframe>` in that tab.
  It is built from a different repository, [zotero/reader](https://github.com/zotero/reader).
- **Context pane.** The column on the right of a reader tab that shows the paper's Info,
  Abstract, Tags, Notes… sections. It can be collapsed with a toolbar button. Internally each
  reader tab gets its own `<item-details>` element there, the same element the library uses
  for its right-hand item pane.
- **Item pane section.** One of those collapsible blocks (Info, Tags, …). Since Zotero 7
  plugins can add their own with a documented API, `Zotero.ItemPaneManager.registerSection`.
  Each section has a header you click to collapse or expand it, and an icon in the thin
  "side navigation" strip on the far right that jumps to it.
- **Documented vs internal.** "Documented" = described in a zotero.org developer guide, so
  Zotero tries to keep it working for plugins. "Internal" = only found by reading Zotero's
  code; it can change in any release without notice (like `Zotero_Tabs`, ADR-0009).

### Constraints
- Rule 1: verified APIs only (all sources below, checked at Zotero **10.0.9**; reader UI at
  the `reader` submodule commit that 10.0.9 pins,
  [`c3d467b`](https://github.com/zotero/reader/tree/c3d467bfcb9e3a8cacfbbe04c5c7fd1369030a36)).
- Rule 8 / PRD §6: **read-only**. No tag, item or annotation is written. The codebook file is
  only read here (it is written only by the workspace, ADR-0012).
- Rule 9: everything registered in `startup` is removed in `shutdown`, including for reader
  tabs that were open before the plugin started and while it is disabled.
- ADR-0003: no bundler, no new dependency. ADR-0008: Zotero 10.0.x only.
- Line numbers below are approximate (`~`), counted by a fetch tool from the raw files. Search
  the file for the quoted identifier.

### What the code shows (Zotero 10.0.9)

**(a) Item pane sections appear beside the reader.**
- The reader tab's context pane makes one `item-details` element per reader item:
  [`elements/contextPane.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/elements/contextPane.js)
  `_addItemContext` (~L309–350): `document.createXULElement('item-details')` (~L339),
  `itemDetails.tabType = Zotero_Tabs.parseTabType(tabType).tabContentType` (~L347). The item
  shown is the **parent item** of the open attachment (`targetItem = parentID ?
  Zotero.Items.get(parentID) : item`, ~L327–333); a standalone attachment shows itself; a note
  shows itself.
- `item-details` renders plugin sections from `Zotero.ItemPaneManager.customSectionData` in
  `renderCustomSections` (~L325–385 of
  [`elements/itemDetails.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/elements/itemDetails.js)):
  it creates `item-pane-custom-section` elements and calls `this.sidenav.addPane(paneID)`. It
  listens to the Notifier for `['item', 'itempane', 'tab']` (~L201) and re-runs
  `renderCustomSections` on an `itempane` event (~L390). Panes in a tab that is not selected
  are not rendered until the tab is selected (`skipRender`, `_handleTabSelect` ~L465).
- **Header, collapse and side icon: yes.** Every section is a `collapsible-section`
  ([`elements/collapsibleSection.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/elements/collapsibleSection.js)):
  clicking the header toggles `open` (`this.open = !this.open`, `_handleClick` ~L439–443); the
  state is remembered in Zotero's prefs as `panes.<paneID>.open`, default open (~L399–412).
  Plugins must give a header label + 16×16 icon and a side-nav tooltip + 20×20 icon (both
  required by the option schema in
  [`xpcom/pluginAPI/itemPaneManager.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/pluginAPI/itemPaneManager.js),
  class `ItemPaneSectionManagerInternal` ~L196–300). Optional **`sectionButtons`** add small
  icon buttons to the header (~L265; typedef `SectionButton` ~L49–55).
- **A summary in the collapsed header.** Render hooks receive `setSectionSummary`, documented
  in the JSDoc as "Set pane section summary, shown in collapsed header" (typedef
  `SectionUIHookArgs` ~L65–73). So a collapsed section can still read **"4 / 15"**.
- **Lifecycle.** `registerSection` (~L548) → `PluginAPIBase.register`
  ([`pluginAPIBase.mjs`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/pluginAPI/pluginAPIBase.mjs)
  ~L118–126) returns a namespaced id (`CSS.escape(pluginID + "-" + paneID)`, ~L313–321) or
  `false`, and calls `_refresh()`, which fires the Notifier `itempane` event (~L327–336). So
  **already-open reader tabs get the section immediately**. `unregisterSection(id)` (~L557)
  also refreshes, `renderCustomSections` then calls `elem.remove()`, and the element's
  `disconnectedCallback` calls `destroy()`
  ([`elements/base.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/elements/base.js)
  ~L68–77), which runs our `onDestroy` hook
  ([`elements/itemPaneCustomSection.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/elements/itemPaneCustomSection.js)
  `_handleDestroy` ~L248). As a safety net, Zotero also unregisters all sections of a plugin
  when it shuts down (`Zotero.Plugins.addObserver({shutdown})` → `_unregisterByPluginID`,
  `pluginAPIBase.mjs` ~L350–380).
- **Hook arguments** (`itemPaneCustomSection.js` ~L209–236): `paneID`, `doc`, `body`, `item`,
  `tabType` (`"reader"` or `"library"`), `editable`, `setEnabled`, `setSectionSummary`,
  `setL10nArgs`, `setSectionButtonStatus`; `onInit` also gets **`refresh()`**.
- **Documented:** [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers),
  "Custom Item Pane Sections": plugins "should use this official API rather than manually
  injecting content into the item pane"; sections are removed automatically when the plugin is
  disabled. The guide does not say that sections show in the reader's context pane; that part
  is source-verified (above).

**(b) Reader toolbar injection (`renderToolbar`).**
- Documented in the Z7 guide, "Custom Reader Event Handlers":
  `Zotero.Reader.registerEventListener(type, handler, pluginID)`, types include
  `renderToolbar` ("triggered when the reader's top toolbar is rendered"); the handler gets
  `{ reader, doc, params, append }`; handlers are removed automatically on disable;
  `unregisterEventListener(type, handler)` removes one by hand.
- Source ([`xpcom/reader.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/reader.js)):
  `registerEventListener` ~L1975, `unregisterEventListener` ~L1997, `_dispatchEvent` ~L1890,
  auto-cleanup by plugin id ~L1893 / ~L2003. The `append` passed to us wraps nodes with
  `Components.utils.cloneInto(…, { wrapReflectors: true, cloneFunctions: true })` (~L235).
- Reader side ([`toolbar.js` @ c3d467b](https://github.com/zotero/reader/blob/c3d467bfcb9e3a8cacfbbe04c5c7fd1369030a36/src/common/components/toolbar.js)
  ~L264: `<CustomSections type="Toolbar"/>`, first item of the right-hand group, before the
  Appearance, Find and context-pane buttons;
  [`custom-sections.js`](https://github.com/zotero/reader/blob/c3d467bfcb9e3a8cacfbbe04c5c7fd1369030a36/src/common/components/common/custom-sections.js)
  L3–19): the event fires from a React `useEffect` of a `memo` component. It clears its
  container, dispatches `render` + `Toolbar`, and **`append` must be called synchronously**
  (otherwise it throws "Append must be called directly and synchronously in the event", L10).
- Consequences found in the code:
  - The toolbar fires the event when it is first drawn. A reader tab **opened before Tabellify
    started gets no button** until it is closed and reopened (no documented way to ask the
    reader to redraw its toolbar).
  - Auto-cleanup removes our *listener*, **not the button already in open readers**. On
    disable, a button whose click handler points into unloaded plugin code would stay in every
    open reader. Tabellify would have to remember each node it appended and remove it in
    `shutdown()`.
  - The popup itself: the button lives in the unprivileged reader page. Zotero's own reader
    popups (e.g. `_openTagsPopup`) create a XUL `<panel>` in the **main window** and position it
    using the internal `reader._iframe.getBoundingClientRect()` and internal `_popupset`. A
    plugin would need the same internals, or draw a floating `<div>` inside the reader page
    (whose stylesheet and focus handling are not ours).

**(c) A small separate window** would use `openDialog` (already verified for F001). It floats
on top of the reader and is left behind in full screen (the reason REQ-1 / ADR-0009 moved the
workspace into a tab).

**(d) Context menu entries.** Two verified openers: the reader's page right-click menu
(`createViewContextMenu`, Z7 guide, `append({ label, onCommand })`) and MenuManager's
`main/tab` target (tab right-click; verified in `docs/zotero-api-notes.md`). A menu can only
**open** something; it still needs (a), (b) or (c) to show the list. Menu labels are built
synchronously while our counts need async reads, so putting "4/15" into the label itself is
not straightforward.

## Decision

**Option A: a Tabellify section in the item pane, registered with the documented
`Zotero.ItemPaneManager.registerSection`. In a reader tab it sits in the right-hand context
pane beside the page; collapsed, its header still shows "Tags 4 / 15".**

Concretely:
1. **Register once** in `Tabellify.init()` (startup): `paneID: "reader-tags"`, `pluginID`,
   `header: { l10nID, icon }`, `sidenav: { l10nID, icon }` (16×16 / 20×20 SVGs shipped in
   `src/content/icons/`), hooks `onInit`, `onItemChange`, `onRender`, `onAsyncRender`,
   `onDestroy`. Keep the returned id. **Unregister** it in `Tabellify.shutdown()` with
   `unregisterSection(id)` (before `chromeHandle.destruct()`, which the existing order already
   guarantees). Nothing per window: Zotero adds the section to every `item-details` itself.
2. **What it shows** (all text via `textContent` or Fluent, never HTML strings):
   - Collapsed header (summary): "4 / 15".
   - Expanded body: "4 of 15 codebook tags used on this paper", then the **remaining** tags
     grouped by super-tag, in codebook order. Groups with nothing remaining are left out.
     If none remain: "All 15 codebook tags used."
   - No codebook / empty codebook: "No codebook yet. Create one in Tools → Tabellify…".
     Codebook unreadable or newer: "Could not read the codebook." (details to Debug Output).
3. **Which tags count for "this paper"** (read-only): manual tags (`type` 0) on the item shown
   in the pane, plus manual tags on every non-trashed annotation of every non-trashed file
   attachment of that item. Automatic tags are ignored, matching F005. Exact, case-sensitive
   match after trimming (F004 rule). If F005's definition ends up different, F005 wins and this
   spec follows.
4. **Where it is enabled:** in reader tabs and in the library item pane for regular items and
   standalone file attachments; disabled (`setEnabled(false)`, hidden) for notes and for
   linked-URL attachments. (Owner question 2: reader only?)
5. **Codebook data:** the hooks run in Tabellify's own bootstrap scope (the code that defined
   them), not in the workspace iframe and not in the reader page. `tabellify.js` loads
   `content/codebook-model.js`, `content/codebook-store.js` and F005's pure model into that
   scope with `Services.scriptloader.loadSubScript(rootURI + …)` (the same way `bootstrap.js`
   loads `tabellify.js`). `IOUtils`, `PathUtils` and `Zotero` exist in the bootstrap scope
   (verified, api-notes F004 row "`IOUtils` / `PathUtils` / `Localization` in the bootstrap
   scope"). The section calls **only** `TabellifyCodebookStore.load(...)`, never `saveData`.
   The file is re-read on each render (a few KB), so codebook edits in the workspace show up
   the next time the section renders.
6. **Live update:** one Notifier observer (`Zotero.Notifier.registerObserver(observer,
   ["item", "item-tag"], "tabellify")`) registered in `init`, unregistered in `shutdown`. Each
   live section adds its `refresh` function (from `onInit`) to a `Set`, and removes it in
   `onDestroy`. On a relevant event the observer calls those `refresh` functions. Sections in
   unselected tabs skip rendering until shown (Zotero's `skipRender`). No timers.
7. **No reader-page DOM, no `Zotero_Tabs`, no `Zotero.Reader` internals** are used.

**Honest caveat for the owner:** this is a *panel beside the page*, not a floating popup. It
never covers the text. It is "compact" because it collapses to one header line with the count,
and the whole right-hand pane can be hidden with the reader's own toolbar button. If you want
a true floating popup on top of the page, that is option B below, and it costs more (see
Consequences). A B-style toolbar button could be added later **on top of** A.

## Alternatives considered

| Option | How it appears | Covers the page? | Open / close | Lifecycle (startup/shutdown, readers open before/after install, disable while reading) | Documented vs internal | Risks |
|---|---|---|---|---|---|---|
| **A. Item pane section (recommended)** | A collapsible section "Tabellify tags" in the right-hand context pane of every reader tab (and in the library item pane), with an icon in the side-nav strip | **No.** Sits beside the page. Takes pane width only when the context pane is open | Click the header to collapse/expand (state remembered by Zotero); click the side-nav icon to jump to it; hide the whole pane with the reader's context-pane button | **Clean.** One `registerSection` in startup, one `unregisterSection` in shutdown. Registration fires an `itempane` refresh, so readers already open get it at once; new readers get it on creation. Unregister removes the element and runs `onDestroy`. Zotero also auto-removes it on plugin shutdown | **Documented** (Z7 guide). Placement in the reader context pane, collapse, summary: source-verified | Owner may find a panel less "popup-like". Context pane must be open to see it. Zotero stores `panes.<id>.open` in its prefs when the user toggles it (Zotero's own pref; left behind after uninstall, harmless). Item pane layout changed in Z7; may change again |
| B. Reader toolbar button (`renderToolbar`) + floating popup | A small button in the reader's top toolbar (right side, before Appearance/Find). Click shows a popup with "4/15" and the remaining list | **Yes, while open** (dismiss with Esc / click outside) | Click the button; Esc or click elsewhere closes | **Weak spots.** Listener: registered in startup, unregistered in shutdown (and auto-removed). **Readers open before install/enable get no button** until reopened. **Buttons stay in open readers after disable**: we must track and remove every appended node ourselves. Popup must be closed and removed in shutdown | Event API: **documented** (Z7). Button-to-paper link via `reader.itemID`: source only. Popup positioning like Zotero's own: **internal** (`reader._iframe`, `_popupset`). A popup drawn inside the reader page: unprivileged foreign page, styling and focus not ours | Most UI code, most manual testing; depends on the reader repo's React toolbar (`CustomSections`), which changes with reader releases; internal positioning; stale buttons if cleanup misses |
| C. Small separate window (`openDialog`) | A small always-on-top-ish window with the counts | **Yes**, floats over the reader | A menu item or button opens it; window close button | Open/close verified (F001). Must be closed in shutdown | Documented Mozilla API | Left behind in full screen (the REQ-1 problem); must track which paper is in front; feels un-native |
| D. Context-menu entry (reader page right-click via `createViewContextMenu`, or tab right-click via MenuManager `main/tab`) | A menu item, e.g. "Tabellify: remaining tags…" | Menu only while open | Right-click → item | Menu registration is clean (documented, auto-removed). But it is only an **opener**: it needs A, B or C to display the list | Documented (Z7 / Z8) | Not discoverable; label can't easily show async counts; adds a second surface for no gain over A |

## Consequences
- **Easier:** no Zotero internals, no reader-page DOM, nothing to clean up per window or per
  reader. Works the same in every reader tab and in the library. Fits PRD §4 ("panel beside
  the reader") and the architecture surfaces table, which already planned this API.
- **Harder:** the section is a narrow column (~300 px): long tag names wrap. Two icons
  (16 px, 20 px SVG) must be made and shipped (`src/content/icons/`, no dependency).
- **Riskier:** low. Item pane UI is documented; Zotero redesigned it in Z7 and could again.
  Recheck `itemPaneManager.js`, `itemDetails.js`, `contextPane.js` before each
  `strict_max_version` raise. The `refresh` call from a Notifier observer and the
  `item-tag` event id format are runtime-unverified (RT-R2, RT-R3 below); a wrong guess
  only means a stale count until the next render, never a data change.
- **Data safety:** read-only. Reads the shown item, its attachments, their annotations and
  tags (all in-memory reads after `waitForDataLoad`), and `codebooks.json`. Writes nothing
  (Zotero itself writes its `panes.<id>.open` pref when the user collapses the section).
- **Follow-up:** update `docs/architecture.md` §4 (surface row: F005b, ADR-0013) when this is
  accepted; merge the appendix rows into `docs/zotero-api-notes.md` after F005 merges.
- **Revisit when:** the owner wants a floating popup (add B on top of A, new ADR revision);
  Zotero documents a reader sidebar/panel API; a Zotero release changes the item pane.

## Open questions for the owner
1. **Panel beside the page (A, recommended) or floating popup over the page (B)?** A is
   documented and never covers the text; B is closer to "a popup/modal" but needs internals,
   leaves buttons behind in open readers if cleanup misses, and does not appear in readers
   that were open before Tabellify started.
2. **Show the section only in reader tabs, or also in the library item pane?** *Recommended:
   both* (same code; useful when browsing papers). Reader-only is one line
   (`setEnabled(tabType === "reader")`).
3. **Collection totals** (e.g. a second line "collection: 9/15 used") are **out of scope**: a
   paper can be in several collections and the reader doesn't say which one you came from.
   *Recommended:* leave to the workspace tag monitor (F005).

---

## Appendix: API notes to merge

To be merged into `docs/zotero-api-notes.md` after F005 (which also edits that file) is on
`main`. Checked 2026-11-12 against Zotero source at tag **`10.0.9`** and the `reader`
submodule commit pinned by 10.0.9
([`c3d467b`](https://github.com/zotero/reader/tree/c3d467bfcb9e3a8cacfbbe04c5c7fd1369030a36)).
`src10:` = `https://github.com/zotero/zotero/blob/10.0.9/`;
`rdr:` = `https://github.com/zotero/reader/blob/c3d467bfcb9e3a8cacfbbe04c5c7fd1369030a36/`.
Line numbers are approximate; search for the quoted identifier.

| API / mechanism | Purpose | Status | Versions | Source | Notes |
|---|---|---|---|---|---|
| `Zotero.ItemPaneManager.registerSection(options)` → namespaced id string or `false`; `unregisterSection(id)` → `boolean` | F005b: the "Tabellify tags" section | Verified (docs + source) | 10.0.9 (source); existing row checked 10.0.8 | Z7 guide "Custom Item Pane Sections"; src10:`chrome/content/zotero/xpcom/pluginAPI/itemPaneManager.js` (`registerSection(options)` ~L548, `unregisterSection(paneID)` ~L557); src10:`…/pluginAPI/pluginAPIBase.mjs` (`register` ~L118–126 returns `mainKey` or `false`; `unregister` ~L133–140; `_namespacedMainKey` ~L313–321 `CSS.escape(\`${pluginID}-${mainKey}\`)`; `_refresh` ~L327–336 fires Notifier `itempane`; `_unregisterByPluginID` + `Zotero.Plugins.addObserver({shutdown})` ~L350–380) | Required: `paneID`, `pluginID`, `onRender`, `header.{l10nID, icon}`, `sidenav.{l10nID, icon}` (validation throws "Option must have …" / returns `false`). Optional: `header.darkIcon`, `sidenav.darkIcon`, `sidenav.orderable`, `bodyXHTML`, `onInit`, `onItemChange`, `onAsyncRender`, `onToggle`, `onDestroy`, `sectionButtons`. Pass the **returned** id to `unregisterSection`. Auto-cleanup on plugin shutdown exists; call `unregisterSection` anyway (symmetry). Replaces the 10.0.8 row |
| Section hook arguments | F005b: render and control the section | Verified (source) | 10.0.9 | src10:`chrome/content/zotero/elements/itemPaneCustomSection.js` (`_getBasicHookProps` ~L209: `paneID`, `doc`, `body`; `_getUIHookProps` ~L217: `item`, `tabType`, `editable`, `setL10nArgs`, `setEnabled`, `setSectionSummary`, `setSectionButtonStatus`; `init` hook ~L236 adds `refresh`; `toggle` adds `event`; `destroy` ~L248 basic props only); typedefs in `itemPaneManager.js` ~L65–193 (`setSectionSummary`: "shown in collapsed header"; `SectionRefresh` returns `Promise<void>`) | `refresh` only in `onInit`. `onAsyncRender` for async work (our reads are async). Build DOM with `doc.createElementNS(HTML_NS, …)` + `textContent` |
| Section shows in reader tabs' context pane, for the parent item | F005b: "beside the reader" | Verified (source) | 10.0.9 | src10:`chrome/content/zotero/elements/contextPane.js` (`_addItemContext` ~L309–350: `createXULElement('item-details')` ~L339; `tabType = Zotero_Tabs.parseTabType(tabType).tabContentType` ~L347; `targetItem = parentID ? Zotero.Items.get(parentID) : item` ~L327–333; notes show themselves); src10:`chrome/content/zotero/elements/itemDetails.js` (`renderCustomSections` ~L325–385 creates `item-pane-custom-section` and `sidenav.addPane`; Notifier types `['item','itempane','tab']` ~L201; `itempane` → `renderCustomSections` ~L390; `skipRender` for unselected tabs ~L465) | Not stated in the dev guides. Runtime: F005b smoke test. Whether separate **reader windows** (View → open in new window) have this pane is **UNVERIFIED** (not checked; spec open question) |
| Collapse / open state, summary in header | F005b: compact "4 / 15" when collapsed | Verified (source) | 10.0.9 | src10:`chrome/content/zotero/elements/collapsibleSection.js` (`open` getter/setter ~L36–76; header click `this.open = !this.open` ~L439–443; `Zotero.Prefs.set(\`panes.${this.dataset.pane}.open\`, this.open)` / default `?? true` ~L399–412; summary `_summary.textContent = this.summary` ~L102–109) | Zotero (not Tabellify) writes the pref when the user toggles. Whether the summary is visible only when collapsed is CSS (not read); JSDoc says "shown in collapsed header" |
| Section removal runs `onDestroy` | F005b: drop our `refresh` from the Set | Verified (source, by composition) | 10.0.9 | `itemDetails.js` `renderCustomSections` (removed panes: `elem.remove()`, `sidenav.removePane`); src10:`chrome/content/zotero/elements/base.js` (`disconnectedCallback` ~L68–77: `this.replaceChildren(); this.destroy();`); `itemPaneCustomSection.js` `destroy` ~L120 → `_handleDestroy` | The class chain from `item-pane-custom-section` to `XULElementBase` was not read line by line. Shutdown also clears the Set, so a missed `onDestroy` cannot leak past disable |
| Fluent shape for section labels: header message with `.label`, side-nav message with `.tooltiptext` | F005b: `tabellify-reader-section-header`, `tabellify-reader-section-sidenav` | Verified (source) | 10.0.9 | src10:`chrome/locale/en-US/zotero/zotero.ftl` (`section-info =` / `.label = { pane-info }`; `sidenav-info =` / `.tooltiptext = { pane-info }`); `itemPaneCustomSection.js` `setL10nID` ~L152 (`this._section.dataset.l10nId = l10nId`) | Strings resolve in the main window because `onMainWindowLoad` already inserts `tabellify.ftl` there (verified row `insertFTLIfNeeded`) |
| Section icons: `header.icon` / `sidenav.icon` as a URI string (16×16 / 20×20) | F005b: icons | Verified (source) for the option; **UNVERIFIED (runtime)** that a `chrome://tabellify/content/icons/…svg` URL loads there | 10.0.9 | `itemPaneManager.js` JSDoc ~L458–459 ("Icon should be 16*16 …", "20*20"); `itemPaneCustomSection.js` `updateSectionIcon` ~L176 (CSS `--custom-section-icon-light: url('…')`) | Smoke test AC shows the icon. Fallback: `rootURI + "content/icons/…"` |
| `item.getAttachments(includeTrashed = false)` → **item IDs** | F005b: find the paper's file attachments | Verified (docs + source) | 10.0.9 | JSAPI (`let attachmentIDs = item.getAttachments();`); src10:`chrome/content/zotero/xpcom/data/item.js` (`Zotero.Item.prototype.getAttachments = function (includeTrashed)`: throws on attachment items, `_requireData('childItems')`, trashed removed unless `includeTrashed`) | Call only on regular items. Resolve with `Zotero.Items.get(ids)` |
| `attachment.getAnnotations(includeTrashed = false, asIDs = false)` → `Zotero.Item[]` | F005b: annotations whose tags count | Verified (source) | 10.0.9 | src10:`…/xpcom/data/item.js` (`Zotero.Item.prototype.getAnnotations = function (includeTrashed, asIDs)`: throws "getAnnotations() can only be called on file attachments"; `_requireData('childItems')`; trashed filtered by default; returns `Zotero.Items.get(ids)`) | Guard with `isFileAttachment()` first. Read-only |
| `item.isFileAttachment()`, `isAttachment()`, `isNote()`, `isAnnotation()`, `parentItem` (getter) | F005b: decide what to count / when to disable | Verified (source) | 10.0.9 | src10:`…/xpcom/data/item.js` (`isFileAttachment`: attachment and `attachmentLinkMode != LINK_MODE_LINKED_URL`; `isRegularItem` uses `isNote`/`isAttachment`/`isAnnotation`; `parentItem` getter `Zotero.Items.get(this.parentID) \|\| undefined`) | Pure reads |
| `Zotero.Items.get(ids[])` → array of items | F005b: IDs from `getAttachments` to items | Verified (source) | 10.0.9 | Used the same way inside `getAnnotations` (`return Zotero.Items.get(ids)`); src10:`…/xpcom/data/dataObjects.js` `get` | Synchronous cache read |
| `annotation.getTags()` (same as `item.getTags()`) | F005b: annotation tags | Verified (source) | 10.0.9 | Existing F003 row `item.getTags()` (annotations are `Zotero.Item`s; `isRegularItem` excludes them but `getTags` is on the prototype) | `type ?? 0` = manual. Load data first with `Zotero.Libraries.get(item.libraryID).waitForDataLoad("item")` (existing F003 row) |
| `Zotero.Notifier.registerObserver(ref, types, id?, priority?)` → string; `unregisterObserver(id)` | F005b: refresh the section when tags change | Verified (source); notifier system described in JSAPI | 10.0.9 | src10:`chrome/content/zotero/xpcom/notifier.js` (`_types` ~L33–55 incl. `'item'`, `'item-tag'`, `'itempane'`; `this.registerObserver = function (ref, types, id, priority)` ~L67, `@returns {string}` ~L103; `this.unregisterObserver = function (id)` ~L107; `ref.notify(event, type, ids, extraData)` awaited inside try/catch ~L150–165); JSAPI "notification system" (events `add/modify/delete/remove`, `it = item-tag`) | Register in `init`, unregister in `shutdown` (symmetry test pairs `Zotero.X.registerY`/`unregisterY`). **Format of `ids` for `item-tag` is UNVERIFIED** (RT-R3); code must not depend on it |
| Bootstrap scope can load our `content/*.js` with `Services.scriptloader.loadSubScript(rootURI + "content/…")` | F005b: codebook model/store in the section code | Verified (source: sample + existing use) | 10.0.9 | Existing row `Services.scriptloader.loadSubScript(rootURI + "tabellify.js")`; bootstrap scope globals row (`IOUtils`, `PathUtils`, `Zotero`) | Same mechanism as `tabellify.js`. `var` globals land in the bootstrap scope; `shutdown` sets them to `undefined` |
| `Zotero.Reader.registerEventListener(type, handler, pluginID)` / `unregisterEventListener(type, handler)`; event `renderToolbar` `{ reader, doc, params, append }` | **Not used** (option B). Recorded for the comparison | Verified (docs + source) | 10.0.9 | Z7 guide "Custom Reader Event Handlers"; src10:`chrome/content/zotero/xpcom/reader.js` (`registerEventListener` ~L1975, `unregisterEventListener` ~L1997, `_dispatchEvent` ~L1890, auto-cleanup ~L1893/~L2003, `ReaderEventType` typedef ~L1905, `append` via `cloneInto` ~L235, `get itemID` ~L555, `getByTabID` ~L2180, `_openTagsPopup` uses a main-window `<panel>` + internal `_iframe`/`_popupset`); rdr:`src/common/components/toolbar.js` ~L264 (`<CustomSections type="Toolbar"/>`); rdr:`src/common/components/common/custom-sections.js` L3–19 (fires in `useEffect` of a `memo` component; `append` only synchronously) | Fires once per toolbar mount: no button in readers open before startup; appended nodes survive listener removal |
| `win.Zotero_Tabs.selectedID` (getter) | **Runtime check only** (RT-R2), never in `src/` | Verified (source). **Internal** | 10.0.9 | src10:`chrome/content/zotero/tabs.js` (`Object.defineProperty(this, 'selectedID', { get: () => this._selectedID })` ~L42–44) | Diagnostics only |

### Runtime checks (owner, dev profile, read-only)
Tools → Developer → Run JavaScript, tick "Run as async function". None of these write.

**RT-R1: APIs exist (any time).** Expect `"function"` four times.
```js
return JSON.stringify({
  registerSection: typeof Zotero.ItemPaneManager.registerSection,
  unregisterSection: typeof Zotero.ItemPaneManager.unregisterSection,
  registerObserver: typeof Zotero.Notifier.registerObserver,
  unregisterObserver: typeof Zotero.Notifier.unregisterObserver,
});
```

**RT-R2: Tags of the open paper (open a PDF that has a tagged annotation, keep its tab
selected, then run).** Expect `readerItemIsAttachment: true`, `parentIsRegular: true`, and the
item's and annotations' manual tag names.
```js
const win = Zotero.getMainWindow();
const reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
const att = Zotero.Items.get(reader.itemID);
const paper = att.parentItem || att;
await Zotero.Libraries.get(paper.libraryID).waitForDataLoad("item");
const manual = (t) => (t.type ?? 0) === 0;
const files = paper.isRegularItem() ? Zotero.Items.get(paper.getAttachments()) : [paper];
const annTags = files.filter((a) => a.isFileAttachment())
  .flatMap((a) => a.getAnnotations())
  .flatMap((an) => an.getTags().filter(manual).map((t) => t.tag));
return JSON.stringify({
  readerItemIsAttachment: att.isAttachment(),
  parentIsRegular: paper.isRegularItem(),
  itemTags: paper.isRegularItem() ? paper.getTags().filter(manual).map((t) => t.tag) : [],
  annotationTags: [...new Set(annTags)],
});
```

**RT-R3: What `item-tag` events look like (optional).** Run part 1, then add a tag to an
annotation in the reader by hand (a normal edit of the **dev** library, made by the owner, not
by the snippet), then run part 2 and paste the result. Part 2 also removes the
temporary observer.
```js
// part 1
Zotero._tabellifyProbe = [];
Zotero._tabellifyProbeID = Zotero.Notifier.registerObserver(
  { notify: (event, type, ids) => { Zotero._tabellifyProbe.push({ event, type, ids }); } },
  ["item", "item-tag"], "tabellifyProbe");
return Zotero._tabellifyProbeID;
```
```js
// part 2
Zotero.Notifier.unregisterObserver(Zotero._tabellifyProbeID);
const out = JSON.stringify(Zotero._tabellifyProbe);
delete Zotero._tabellifyProbe; delete Zotero._tabellifyProbeID;
return out;
```
(The probe stores two temporary properties on the in-memory `Zotero` object and deletes them;
nothing is saved.)
