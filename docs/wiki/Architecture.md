# Architecture

Sources of truth:
[docs/architecture.md](https://github.com/asmithlabs/tabellify/blob/main/docs/architecture.md),
the [Decision Log](Decision-Log) (ADRs) and the feature specs in
[docs/features/](https://github.com/asmithlabs/tabellify/tree/main/docs/features). This page
is an overview of version 0.2.0; follow the links for detail.

## Platform

Tabellify is a **bootstrapped Zotero plugin** for Zotero 10.0.x (ADR-0008). Zotero runs on
Mozilla's platform (Firefox 140 ESR for Zotero 8–10), so plugin code is privileged
JavaScript with access to Zotero internals and the file system.

- Plain modern JavaScript (ES2022+, strict mode), JSDoc for types, **no bundler** (ADR-0003).
- `src/` is the plugin root and is zipped into the `.xpi` (only git-tracked files with an
  allowed extension).
- Plugin ID `tabellify@asmithlabs.com` (permanent, ADR-0002); preference prefix
  `extensions.tabellify.`.
- All user-visible strings go through Fluent (`src/locale/en-US/tabellify.ftl`), IDs
  prefixed `tabellify-`.

## Files

| File | Role |
|---|---|
| `src/manifest.json` | Identity, version, Zotero range (10.0 – 10.0.*), `update_url` |
| `src/bootstrap.js` | Lifecycle hooks; registers `chrome://tabellify/`, loads `tabellify.js`, forwards hooks |
| `src/tabellify.js` | `Tabellify` object: Tools menu item, workspace tab per main window (window fallback), `quit-application-granted` observer, FTL link per main window, loads and registers the reader section, cleanup |
| `src/reader-tags.js` | F005b: "Tabellify tags" item pane section and its Notifier observer (bootstrap scope, read-only; ADR-0013) |
| `src/content/workspace.xhtml`, `workspace.js`, `workspace.css`, `tokens.css` | The workspace document (in an `<iframe>` in the tab, or the fallback window): collection row, saved tables, script box, pills, editor, table, View table modal. `tokens.css` holds the design tokens (ADR-0015) |
| `src/content/codebook-model.js` | Pure: codebook schema 2, validation, migration, edits, `applyScript`, regroup helpers (ADR-0016) |
| `src/content/tag-script-model.js` | Pure: tag script parser and `tokenAt` |
| `src/content/script-suggest-model.js` | Pure: suggestion ranking and accept edits (F006b) |
| `src/content/tag-monitor-model.js` | Pure: subcollection walk, counting rule, per-paper summary, sorting |
| `src/content/table-layout-model.js` | Pure: column/row order, layout schema 3, drop edges (ADR-0014, ADR-0019) |
| `src/content/regroup-model.js` | Pure: what a tag-column drop does (F006c) |
| `src/content/csv-model.js` | Pure: CSV rows, quoting, BOM, formula guard, file name (F008) |
| `src/content/saved-tables-model.js` | Pure: `tables.json` shape, snapshot, live view (ADR-0018) |
| `src/content/codebook-store.js`, `layout-store.js`, `tables-store.js` | The only writers of `codebooks.json`, `layout.json`, `tables.json` (IOUtils, injectable `fs`) |
| `src/content/csv-export.js` | Save dialog + the one write outside Tabellify's folder (ADR-0017) |
| `src/content/icons/` | Reader section icons |
| `src/locale/en-US/tabellify.ftl` | All strings |
| `scripts/build-xpi.mjs` | Builds `build/tabellify-<version>.xpi` from git-tracked `src/` files, Node built-ins only |
| `scripts/publish-wikijs.mjs`, `scripts/wikijs-model.mjs` | Publishes `docs/wiki/` to the Wiki.js site (dry run by default; creates and updates pages, never moves or deletes them; ADR-0010) |

See [Plugin Lifecycle](Plugin-Lifecycle) for how these fit together at runtime.

## Layering

Pure logic lives in `src/content/*-model.js`: classic scripts that each define one global
(`TabellifyCodebook`, `TabellifyTagMonitor`, …) and use no Zotero, DOM, `IOUtils` or
`PathUtils`, so Node tests load them in a `vm` sandbox. They sit in `src/content/` rather than
a `src/modules/` folder because only `src/content/` has a `chrome://` URL that the workspace
document can load (spec F004, "Where things go"). The stores take their file functions as a
parameter (`fs`), so they are tested with a fake file system. `workspace.js` and
`reader-tags.js` gather plain objects from read-only `Zotero.*` calls and hand them to the
models.

## UI surfaces

| Surface | API basis | Feature |
|---|---|---|
| Tools menu item **Tabellify…** | `Zotero.MenuManager` | F001 |
| Workspace tab in the main window | internal `Zotero_Tabs` (`add`/`select`/`close`/`getTabInfo` only) + `<iframe>` (ADR-0009) | F002 |
| Workspace window (fallback only, if `Zotero_Tabs` is missing or `add` fails) | `openDialog` (ADR-0004, superseded) | F001 |
| "Tabellify tags" item pane section (library and reader context pane) | `Zotero.ItemPaneManager.registerSection` (ADR-0013) | F005b |
| View table modal (inside the workspace document) | HTML `<dialog>` + `showModal()` | F007a |
| Save dialog for CSV | Zotero's `FilePicker` module (ADR-0017) | F008 |

**Look (ADR-0015).** The workspace document uses the Tabellify palette through `tokens.css`,
light and dark. The item pane section stays Zotero-native.

**Tab risk (ADR-0009).** Zotero 8+ stops restoring saved tabs after one of an unknown type, so
the Tabellify tab is closed at `quit-application-granted`, in `onMainWindowUnload` and in
`shutdown()`. A crash with the tab open can still leave it in Zotero's session file; the
owner accepted this risk for the first release (ADR-0009 Notes, 2026-11-14).

## Data

- **Reads (read-only):** the library list (My Library plus `Zotero.Groups.getAll()`, never
  feeds) and every listed library's collections; the chosen collection's and its
  descendants' regular items, file attachments, annotations and tags; `Zotero.Tags.getAll`
  of the chosen collection's library for suggestions; Notifier events. Group libraries are
  read exactly like My Library (spec
  [F003b](https://github.com/asmithlabs/tabellify/blob/main/docs/features/003b-group-libraries.md)).
  `layout.json` and `tables.json` already key collections as `"<libraryID>/<collectionKey>"`,
  so groups needed no schema change; manual orders of libraries that are not currently
  listed are kept, not pruned. Library IDs are local to one Zotero installation. Details per call: [Zotero APIs Used](Zotero-APIs-Used).
- **Tabellify-owned files** in `<Zotero data directory>/tabellify/` (ADR-0012): `codebooks.json`
  (schema 2, ADR-0016), `layout.json` (schema 3, ADR-0019), `tables.json` (schema 1,
  ADR-0018), each with `.bak`; atomic writes; a `revision` check against a second open tab;
  size and entry limits (ADR-0012 amendment 2026-11-14). Never in the Zotero database.
- **Pref:** `extensions.tabellify.countItemTags` (boolean), written only by the workspace.
- **Exports:** CSV written only to the path the save dialog returns (ADR-0017).
- **Write guard:** `tests/static/write-guard.test.mjs` forbids library-write APIs and allows
  `IOUtils` writes only in the four files named above.

## Note on feature numbers

The roadmap was renumbered when Feature 002 was inserted, and Feature 006 was split into
006a–006d (`docs/product-requirements.md` §5). Accepted ADRs written earlier keep the old
numbers; see the mapping in the [Decision Log](Decision-Log).
