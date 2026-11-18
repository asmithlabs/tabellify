# Zotero APIs Used

Every Zotero, Mozilla or window API Tabellify uses must be verified against official docs or
Zotero source and recorded, with links and Zotero versions, in
[docs/zotero-api-notes.md](https://github.com/asmithlabs/tabellify/blob/main/docs/zotero-api-notes.md)
(CLAUDE.md rule 1). **That file is the source of truth**; this page is only a map of what is
in use and where. Status words below are copied from api-notes in short form; check
api-notes before relying on one, and for the runtime checks the owner ran.

Status values in api-notes: **Verified (docs)**, **Verified (source)**, **Verified
(runtime)** (only the owner assigns it), **UNVERIFIED**; **Internal** marks APIs not in any
zotero.org developer guide.

## Plugin shell (F001, F002)

| API | Used for | File |
|---|---|---|
| `manifest.json` `applications.zotero.{id, strict_min_version, strict_max_version, update_url}` | Identity and compatibility; all four required | `src/manifest.json` |
| Bootstrap hooks, `onMainWindowLoad` / `onMainWindowUnload` | Lifecycle | `src/bootstrap.js` |
| `amIAddonManagerStartup.registerChrome(…)` → `.destruct()` | `chrome://tabellify/` URLs | `src/bootstrap.js` |
| `Services.scriptloader.loadSubScript` | Load `tabellify.js`, the reader section and its models into the bootstrap scope | `src/bootstrap.js`, `src/tabellify.js` |
| `Zotero.MenuManager.registerMenu` / `unregisterMenu` (`main/menubar/tools`) | Tools → Tabellify… | `src/tabellify.js` |
| `window.MozXULElement.insertFTLIfNeeded("tabellify.ftl")`, plugin `.ftl` auto-registration, `data-l10n-id`, `document.l10n.formatValue` | Strings | `src/tabellify.js`, `src/content/` |
| `win.Zotero_Tabs` `add` / `select` / `close` / `getTabInfo` (**Internal**, ADR-0009; exactly these four, enforced by `tests/static/tabs-api.test.mjs`) | The workspace tab | `src/tabellify.js` |
| HTML `<iframe>` with `chrome://tabellify/content/workspace.xhtml` | The workspace document inside the tab | `src/tabellify.js` |
| `Services.obs.addObserver` / `removeObserver` (`quit-application-granted`) | Close tabs before Zotero saves its session (observer order: see api-notes) | `src/tabellify.js` |
| `Zotero.getMainWindow().openDialog`, `Services.wm.getMostRecentWindow` / `getEnumerator` | Fallback workspace window | `src/tabellify.js` |
| `event.target.ownerGlobal` in MenuManager `onCommand` | Pick the window whose menu was used (trusted only if it is a main window); **UNVERIFIED** in api-notes | `src/tabellify.js` |
| `Zotero.getMainWindow()` / `getMainWindows()`, `Zotero.debug`, `Zotero.logError` | Windows, logging | all |

## Reading the library (F003–F007b, F003b, all read-only)

| API | Used for | File |
|---|---|---|
| `<script src="chrome://zotero/content/include.js">` | Gives the workspace document the `Zotero` global | `workspace.xhtml` |
| `Zotero.initializationPromise`, `Zotero.Libraries.userLibraryID`, `Zotero.Libraries.get`, `library.waitForDataLoad("item")` | Wait for Zotero; My Library; load the items of the chosen collection's own library (also a group) | `workspace.js`, `reader-tags.js` |
| `Zotero.Groups.getAll()`; `library.libraryID`, `libraryType`, `name` | F003b: the group libraries (no feeds) for the collection list; library names in the dropdown headings and the Saved tables list (group names are untrusted text, plain text only) | `workspace.js` |
| `Zotero.Collections.getByLibrary(libraryID, true)`; `collection.id`, `name`, `parentID`, `key`, `libraryID`, `getChildItems()` | Collection list, subcollection walk, keys for layout and saved tables | `workspace.js` |
| `item.isRegularItem()`, `getDisplayTitle()`, `getTags()`, `getAttachments()`, `key`; `Zotero.Items.get(ids)`; `isFileAttachment()`, `isAttachment()`, `isNote()`, `isAnnotation()`, `parentItem`; `attachment.getAnnotations()`; `annotation.getTags()` | Papers, titles, item and highlight tags | `workspace.js`, `reader-tags.js` |
| Tag `type` 0 = manual, 1 = automatic | Only manual tags count | `tag-monitor-model.js` |
| Zotero tag identity: `trim().normalize()`, exact case-sensitive match | Matching codebook names to Zotero tags | models |
| `Zotero.Tags.getAll(libraryID)` | Tag suggestions from the chosen collection's library, My Library before a choice (includes highlight tags; owner runtime checks RT-S1 and RT-G2 passed) | `workspace.js` |
| `Zotero.Notifier.registerObserver` / `unregisterObserver` | Live recount in the workspace (types `item-tag`, `collection-item`, `item`, `collection`, `group`; `group` added in F003b to rebuild the library list); refresh of the item pane section | `workspace.js`, `reader-tags.js` |
| `Zotero.ItemPaneManager.registerSection` / `unregisterSection` | "Tabellify tags" section (ADR-0013) | `reader-tags.js` |
| `Zotero.Prefs.get` / `set` (global, `extensions.tabellify.countItemTags`) | The counting switch; `set` only in the workspace | `workspace.js`, `reader-tags.js` |

The read-only guarantee for these calls is recorded in api-notes; the write guard
(`tests/static/write-guard.test.mjs`) fails on any library-write API in `src/`.

## Tabellify's own files (F004, F005c, F007b; ADR-0012)

| API | Used for | File |
|---|---|---|
| `Zotero.DataDirectory.dir` (**Internal**) + `PathUtils.join` | `<data dir>/tabellify/` | the three stores |
| `IOUtils.stat` | Size check before reading (SEC-014) | the three stores |
| `IOUtils.readJSON`, `IOUtils.makeDirectory`, `IOUtils.writeJSON` with `tmpPath` and `backupFile`; `mode: "create"` for the one-time `codebooks.v1.json` copy | Load and atomic save | `codebook-store.js`, `layout-store.js`, `tables-store.js` |
| `setTimeout` / `clearTimeout` in the bootstrap scope | Debounced refresh of the item pane section | `reader-tags.js` |

## CSV export (F008, ADR-0017)

| API | Used for | File |
|---|---|---|
| `ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs")` → `FilePicker` (`modeSave`, `appendFilter`, `defaultString`, `defaultExtension`, `show`) | The save dialog (runtime check RT-S2 recorded as passed in api-notes) | `csv-export.js` |
| `IOUtils.writeUTF8(path, text, { tmpPath })` | The one write outside Tabellify's folder | `csv-export.js` |

## Workspace page (standard web platform)

HTML `<details>`/`<summary>`, `<dialog>` with `showModal()` (View table; runtime checks RT-S3
and RT-S3b recorded as passed in api-notes), HTML drag-and-drop (`draggable`, `DataTransfer`,
`dragover`), `getBoundingClientRect` and `clientX`/`clientY` (drop edges), the WAI-ARIA
combobox pattern (suggestions), `setSelectionRange` / `setRangeText`, `Intl.Collator`,
`Intl.DateTimeFormat`, `String.prototype.normalize`, CSS custom properties and
`prefers-color-scheme` (design tokens). Each has its own row in api-notes.

## Recorded but not used

`Zotero_Tabs.getState` / `restoreState`, `Zotero.Session`, `ZoteroPane.openNote`,
`collection.getDescendents`, `Zotero.PreferencePanes.register`, `Zotero.Reader.registerEventListener`,
`Zotero.File.putContentsAsync`, `ZoteroPane.getSelectedCollections()` and other selection
getters, search conditions; and, **UNVERIFIED**, `Downloads.getPreferredDownloadsDirectory()`,
`nsIFile.reveal()`, `Zotero.Utilities.Internal.copyTextToClipboard`.

## Before raising `strict_max_version`

Re-check the Internal APIs (`Zotero_Tabs`, `Zotero.DataDirectory.dir`) and diff `tabs.js` and
`session.js` between Zotero tags, then rerun the manual checks (ADR-0009 §6, ADR-0012 §1).

## Adding a new API

1. Find it in the official docs (zotero.org/support/dev/…) or Zotero source for the target
   version.
2. Add a row to `docs/zotero-api-notes.md` with the source link and Zotero versions checked.
3. If you cannot verify it, stop and say so in the spec or PR. Never guess.
