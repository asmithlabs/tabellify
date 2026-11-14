# Feature 007b: Saved tables

- **Status:** Approved (owner, 2026-11-14, all recommendations Q1–Q5)
- **Branch:** `feat/007b-saved-tables` (from `main` after F007a, merged as `991512b`)
- **Related ADRs:** **0018 (Proposed: what a saved table is, `tables.json`; this spec
  depends on it)**, 0012 (Accepted: storage rules, write-guard allow-list rule), 0014 / 0019
  (Accepted: `layout.json`, `topOrder` / `tagOrder` / manual orders, copied into a saved
  table), 0016 (Accepted: ungrouped tags), 0017 (Accepted: CSV export path, reused
  unchanged), 0015 (design tokens), 0011 (security review), 0003 (no bundler). PRD §4 ("Save
  → Saved Tables list … Export & edit/delete tables"), §5 F007, §6. Outline:
  `docs/features/006a-workspace-restructure.md`, "Phases" (E2) and "ADR-0018 outline". Builds
  on `docs/features/007a-view-table.md` (the modal) and `docs/features/008-export-csv.md`.
- **Process:** prototype mode (CLAUDE.md). No runtime check is needed before development (no
  API in a new context). Developer builds; `npm test` + `npm run build` pass; owner runs one
  smoke test (the `[manual]` ACs) with Debug Output in `build/debug-N.txt`.

## Owner's request (2026-11-14, verbatim)
"need to have saved tables first. and actually it would be cool to have tables persist. so
someone can see their previous work. whatever the best design decision is go for it."

The owner delegated the design choice. This spec and ADR-0018 pick one design and recommend
it; the owner approves once (T0).

## Problem / objective
Today a table exists only while the Tabellify tab is open: the "View table" modal (F007a)
lets the user name and describe it and export a CSV, but nothing is kept. A researcher who
built a synthesis table last week cannot look at it again, and after more tagging or a
codebook change, the old state is gone for good.

007b adds **saved tables**: the user saves the table from the "View table" modal with its
Name and Description; a **"Saved tables"** list in the workspace shows every saved table;
opening one shows it **exactly as it was saved**, and **"Show live"** rebuilds it from the
current library with the same settings. Saved tables can be renamed, re-described, updated,
exported to CSV and deleted. Nothing in the Zotero library changes.

## Decisions taken in this spec (owner delegated; see "Open questions" for the few to confirm)
1. **A saved table = its definition + a snapshot of its contents** (ADR-0018 option A).
2. **Opening shows the snapshot**; "Show live" rebuilds it now; "Update snapshot" keeps the
   live version.
3. **Saving from "View table" always creates a new saved table** (no silent overwrite of an
   older one). An existing table is changed only from its own modal (Save changes, Update
   snapshot), or copied with "Save as new table".
4. **Saved tables never change the workspace**: opening one, or showing it live, does not
   change the chosen collection, the column order (`layout.json`), the paper order or the
   "Also count tags on the paper itself" setting.
5. **Rename and Edit description** happen in the saved table's modal (the Name and
   Description fields + "Save changes"), not in the list. **Delete** happens in the list,
   with an inline confirmation.
6. Duplicate names are allowed (the list shows the collection and the date).

## Scope
**In scope:**
1. `tables.json` (ADR-0018): pure model `src/content/saved-tables-model.js`, store
   `src/content/tables-store.js` (fourth write-guard entry), load at workspace start.
2. **"Save table"** in the "View table" modal (draft mode: the current workspace table).
3. A **"Saved tables"** section in the workspace: a disclosure under the collection row
   with a count, a filter (All collections / This collection), one entry per table with
   Open, Export CSV and Delete (inline confirmation).
4. The modal's **saved mode**: heading "Saved table", "Snapshot from <date>" line, Name and
   Description editable with **Save changes**, **Show live** / **Show snapshot**, **Update
   snapshot** and **Save as new table** (live only), **Export CSV** (what is shown), Close.
5. Live view: re-read the saved collection (existing read-only calls), build the table with
   the current codebook and the saved column order, sort or manual order and counting
   setting; a note listing saved columns no longer in the codebook.
6. Missing collection (deleted or in the trash) or unavailable codebook: snapshot still
   shown, "Show live" disabled with a reason.
7. Damaged, newer or unreadable `tables.json`: message with the path, saving and deleting
   off, file never overwritten.
8. Fluent strings, CSS (tokens only), tests; design-system sample for the list.

**Out of scope (non-goals):**
- Loading a saved table *into the workspace* (would change `layout.json` and the counting
  pref; not needed to "see previous work").
- Automatic snapshots, version history of one table, undo of a delete (the `.bak` file is
  the one-step manual recovery), sync, export/import of saved tables, XLSX.
- Saving drafts to disk without a Save click (unsaved typing stays in memory, as F007a).
- Saved tables of group libraries (Tabellify reads My Library only, F004 Q7).
- Highlight text in cells (006d; a later snapshot schema).
- Any library write, any new `Zotero.*` call.

## User stories
- As a researcher, I click "View table", type a name and a description, click "Save table",
  and the table appears in "Saved tables" with its collection, size and date.
- As a researcher, after closing Zotero and coming back next week, I open a saved table and
  see exactly the papers, ✓ cells, numbers and column order I saved, even if I have tagged
  more since.
- As a researcher, I click "Show live" to see the same table built from my library today,
  and "Update snapshot" if I want to keep that version, or "Save as new table" to keep both.
- As a researcher, I rename a saved table or fix its description and click "Save changes".
- As a researcher, I export a saved table to CSV and get the table as it was saved.
- As a researcher, I delete a table I no longer need, after confirming.
- As a researcher, if I deleted the collection, my saved table still shows what it was.
- As a researcher, I trust that saving, opening and deleting tables never changes my Zotero
  library.

## Design

### Background for a JavaScript learner
- **Snapshot vs live** (ADR-0018 "Background"): the snapshot is a photo of the table taken
  at save time; live re-runs the recipe (the definition) on today's library.
- **Mode of the modal:** one `<dialog>` element serves two purposes. A variable
  (`viewMode`: `"draft"` or `"saved"`) remembers which one is open, and the code shows or
  hides buttons accordingly. This avoids a second dialog with copied markup.
- **Adapter:** a small function that converts one data shape into another. `snapshotView`
  turns a stored snapshot into exactly the shape `viewTableRows` (the modal's table) and
  `TabellifyCsv.build` (the CSV) already accept, so neither needs to change.
- **Inline confirmation:** instead of a pop-up, the Delete button is replaced in place by a
  short question and two buttons (Delete / Cancel), the pattern F004 used ("Confirm
  delete"). No `window.confirm` (not verified in the tab, F004 spec).
- **ISO date string:** `new Date().toISOString()` gives text like
  `2026-11-14T15:40:03.000Z` (UTC). It sorts correctly as text and is turned into a local,
  readable date only when shown (`Intl.DateTimeFormat`).

### Data (`tables.json`, ADR-0018 §1)
See ADR-0018 §1 for the full shape. Summary: `{ schemaVersion: 1, revision, nextId, tables:
[{ id, name, description, createdAt, updatedAt, definition, snapshot }] }`.

How the workspace fills a new table (draft mode, "Save table"):
| Field | From |
|---|---|
| `definition.collectionKey` | `currentCollectionKey()` (`"<libraryID>/<key>"`) |
| `definition.codebookId` | the codebook's ID (`this.codebook.codebooks[0].id`, today `"c1"`) |
| `definition.columnLayout` | a copy of `this.columnLayout` (`topOrder`, `tagOrder`) |
| `definition.sort` | `{ key: this.sortKey, direction: this.sortDirection }` |
| `definition.manualOrder` | when `sortKey` is `"manual"`: the item keys of the papers **as shown** (`tableRows` → `monitorData.keys`), so the saved order is exactly what was on screen even for papers added after the manual order was made; else `null` |
| `definition.countItemTags` | `this.countItemTags` |
| `snapshot` | `TabellifySavedTables.buildSnapshot({ groups: tableGroups, papers: tableRows, counting: tableCounting }, { keyOf, collectionName: exportBaseName(), takenAt: now })` |
| `name`, `description` | the modal's fields, trimmed (Name required) |
| `createdAt`, `updatedAt`, `snapshot.takenAt` | one `now = new Date().toISOString()` per action |

### Pure model (`src/content/saved-tables-model.js`, global `TabellifySavedTables`)
Classic script, `"use strict"`, one `var`. No Zotero, DOM, `IOUtils`, `PathUtils`,
`Services`, `ChromeUtils`, no clock (the caller passes `now`). Uses `TabellifyTagMonitor` and
`TabellifyTableLayout` (pure, loaded before it) only in `orderPapers` and `liveView`. Never
mutates inputs; every object is rebuilt with literals / `Object.fromEntries`, and own keys
are checked with `Object.hasOwn`, so a hand-edited `"__proto__"` stays an ordinary key.
```
SCHEMA_VERSION: 1
LIMITS: { tables: 100, rows: 5000, columns: 500, name: 200, description: 2000,
          title: 2000, fileChars: 20000000 }
emptyData() → { schemaVersion: 1, revision: 0, nextId: 1, tables: [] }
validate(data) → { ok: true } | { ok: false, newer?: true, reason }
migrate(data) → clean copy (version 1: identity; later versions add steps)
buildDefinition({ collectionKey, codebookId, columnLayout, sort, manualOrder, countItemTags })
  → definition (columnLayout cleaned with TabellifyTableLayout.cleanTopOrder / copyTagOrder)
buildSnapshot(view, { keyOf, collectionName, takenAt })
  → { ok: true, snapshot } | { ok: false, error: "<fluent-id>", limit: "rows" | "columns" }
  view = { groups, papers, counting }   (workspace tableGroups / tableRows / tableCounting)
snapshotView(snapshot) → { groups, papers, counting }   (the shape viewTableRows and
  TabellifyCsv.build take; ungrouped blocks get id "ungrouped" and run 0, 1, …; real
  groups get ids "s0", "s1", … that are never looked up in the codebook)
orderPapers(papers, sort, manualOrder, keyOf) → papers   (the saved sort or manual order;
  an unknown tag sort key falls back to TabellifyTagMonitor.DEFAULT_SORT)
liveView({ codebook, monitorData, definition, snapshot }) → { view, missing: string[] }
  (orderedGroups(codebookGroups(codebook), definition.columnLayout); summarize(…,
  { countItemTags }); orderPapers with keyOf = monitorData.keys; `missing` =
  missingColumns(snapshot, view.groups))
missingColumns(snapshot, groups) → string[]   (snapshot column names not in `groups`)
addTable(data, { name, description, definition, snapshot }, now)
  → { ok: true, data, id } | { ok: false, error: "<fluent-id>" }
updateTable(data, id, { name?, description?, snapshot? }, now) → { ok: true, data } | refusal
deleteTable(data, id) → { ok: true, data } | refusal (unknown id)
listTables(data, collectionKey | null) → [{ id, name, collectionKey, collectionName,
  papers, columns, updatedAt }]   (newest `updatedAt` first, then name; null = all)
checkFileSize(data) → { ok } | { ok: false, error }   (JSON.stringify length ≤ fileChars)
```
**Validation (`validate`, strict, ADR-0018 §3):** frame (`schemaVersion` integer ≥ 1; > 1 →
`newer`; `revision` ≥ 0; `nextId` ≥ 1; `tables` array ≤ 100); per table: `id` matches
`^t[1-9][0-9]*$`, below `nextId`, unique; `name` string, trimmed, 1–200 characters;
`description` string ≤ 2 000; `createdAt` / `updatedAt` / `takenAt` strings that
`Date.parse` reads (finite); `definition`: `collectionKey` matches `^[0-9]+/[A-Za-z0-9]+$`,
`codebookId` non-empty string, `columnLayout` with `topOrder` array and `tagOrder` object
(entries cleaned as ADR-0019 §3), `sort.key` string, `sort.direction` `"asc"`/`"desc"`,
`manualOrder` `null` or array of non-empty strings, `countItemTags` boolean; `snapshot`:
`collectionName` string, `blocks` array of `{ group: string | null, tags: string[] }` with
non-empty, unique tag names across all blocks (≤ 500 in total) and no two neighbouring
`null` blocks, `rows` array ≤ 5 000 of `{ itemKey: non-empty string ≤ 32, title: string ≤
2 000, untitled: boolean, present: integers, strictly increasing, each < column count }`.
Anything else (wrong type, extra nesting) → `{ ok: false, reason }` (the reason names the
field, never its value, so Debug Output stays free of titles).

**`buildSnapshot`:** blocks from `view.groups` in order (`group` = name, or `null` for
ungrouped runs; neighbouring ungrouped runs merged); rows from `view.papers` in order:
`itemKey = keyOf(paper)`, `title` = `paper.untitled ? "" : paper.title` cut to 2 000
characters with "…" (without splitting a surrogate pair), `present` = indexes of the paper's
`groups[].present` tags in column order. Refuses above 5 000 rows or 500 columns.

### Store (`src/content/tables-store.js`, global `TabellifyTablesStore`; ADR-0018 §3, §5)
Same structure as `layout-store.js`: `FILE_NAME: "tables.json"`, `platformFs()`,
`load(fs, dir)` → `{ status: "ok", data, path, existed, fromVersion }` | `{ status:
"newer" | "invalid", path, reason }`; `saveData(fs, dir, data, loadedRevision)` → `{ status:
"saved", data, path }` | `{ status: "conflict", path, reason }` | `{ status: "error", path,
error }`. `saveData` re-reads and compares `revision`, refuses a newer or invalid file on
disk (conflict), validates `next` (refuses invalid data and a `checkFileSize` failure as
`error`), then `makeDirectory` and the one write
`fs.writeJSON(path, clean, { tmpPath: path + ".tmp", backupFile: path + ".bak" })`. The
folder comes from `TabellifyCodebookStore.dataDir()` (the single place that reads
`Zotero.DataDirectory.dir`).

### Workspace: start-up and state (`workspace.js`)
- `onLoad` starts `initSavedTables()` next to `initCodebook()` (independent; never throws;
  waits for `Zotero.initializationPromise` before `dataDir()`, as `initCodebook` does).
- State: `savedTables` (the loaded data or `null`), `savedState` (`"loading"`, `"ok"`,
  `"invalid"`, `"newer"`), `savedPath`, `savedBusy` (one save at a time), `savedFilter`
  (`"all"` | `"collection"`, in memory, default `"all"`, Q3), `confirmDeleteId`,
  `collectionNames` (`Map` collection key → current name, filled from the existing
  `Zotero.Collections.getByLibrary(libraryID, true)` result in `init` and refreshed from
  `gatherMonitorData`'s snapshot; no new call).
- **One save path** `saveTables(nextData, what)`: if `savedBusy` or `savedState !== "ok"`,
  refuse; `TabellifyTablesStore.saveData(…, this.savedTables.revision)`; `saved` → keep the
  returned data, re-render the list; `conflict` → reload from disk, re-render, show
  `tabellify-saved-conflict`; `error` → show `tabellify-saved-save-error` + the path. Returns
  the store's status, so callers decide what the modal shows.

### "Saved tables" section (`workspace.xhtml`, after `#tabellify-monitor-warning`, before the codebook section)
```
<html:details id="tabellify-saved">
  <html:summary id="tabellify-saved-summary">
    <html:span data-l10n-id="tabellify-saved-heading"></html:span>
    <html:span id="tabellify-saved-count"></html:span>
  </html:summary>
  <html:div id="tabellify-saved-controls">
    <html:label for="tabellify-saved-filter" data-l10n-id="tabellify-saved-filter-label"></html:label>
    <html:select id="tabellify-saved-filter">
      <html:option value="all" data-l10n-id="tabellify-saved-filter-all"></html:option>
      <html:option value="collection" data-l10n-id="tabellify-saved-filter-collection"></html:option>
    </html:select>
  </html:div>
  <html:p id="tabellify-saved-message" hidden="hidden">
    <html:span id="tabellify-saved-message-text"></html:span>
    <html:code id="tabellify-saved-message-path" hidden="hidden"></html:code>
  </html:p>
  <html:ul id="tabellify-saved-list" aria-labelledby="tabellify-saved-summary"></html:ul>
  <html:p id="tabellify-saved-status" role="status" hidden="hidden">
    <html:span id="tabellify-saved-status-text"></html:span>
    <html:code id="tabellify-saved-status-path" hidden="hidden"></html:code>
  </html:p>
</html:details>
```
- **Closed by default** (Q3); the summary reads "Saved tables · 3" (count of the entries
  the filter shows; the "·" is drawn by CSS as for the pills). The count text is set with
  `textContent`.
- **Messages** (`#tabellify-saved-message`): loading → nothing; no tables at all →
  `tabellify-saved-empty`; filter "This collection" with none chosen →
  `tabellify-saved-choose`; with a collection that has none → `tabellify-saved-empty-collection`;
  `invalid` → `tabellify-saved-load-error` + path; `newer` → `tabellify-saved-newer` + path.
- **One entry** (`<html:li class="tabellify-saved-item" data-table-id="t3">`, built with
  `createElementNS` + `textContent`):
  - line 1: the Name (`<html:span class="tabellify-saved-name">`);
  - line 2 (muted): collection name (current name if the key is in `collectionNames`, else
    the snapshot's `collectionName` plus `tabellify-saved-collection-missing`), "·",
    `<n> papers`, "·", `<m> columns`, "·", "Saved" + local date of `updatedAt`;
  - buttons: **Open** (`data-action="open"`), **Export CSV** (`"export"`), **Delete**
    (`"delete"`). Each button has an `aria-label` "<button text>: <Name>" (Fluent text +
    plain-text Name), so a screen reader can tell the entries apart.
  - **Confirm state** (`confirmDeleteId` = this id): the buttons are replaced by
    `tabellify-saved-delete-question` and two buttons, **Delete** (`"confirm-delete"`) and
    **Cancel** (`"cancel-delete"`); focus moves to Cancel. Only one entry at a time is in
    this state; Esc on it cancels.
- Saving and deleting are disabled (buttons `disabled`) while `savedBusy` or when
  `savedState` is not `"ok"`; Open and Export CSV still work for a loaded file.
- `data-table-id` is our own validated ID (`t<number>`); it is read back with
  `closest("li")?.dataset.tableId` and looked up in the data, never used in a selector.
- Delegated listeners: `click` and `keydown` on `#tabellify-saved`, `change` on
  `#tabellify-saved-filter`. The list re-renders after load, save, conflict reload, filter
  change, collection change (filter "This collection") and the date never needs a timer.

### The modal: draft mode (opened by "View table", F007a + 007b)
Unchanged from F007a except:
- New buttons in `#tabellify-view-actions`, before "Export CSV": **Save table**
  (`#tabellify-view-save`). Order: Save table, Export CSV, Close.
- The note `tabellify-view-not-saved` gets new text: "Not saved yet. Save table keeps this
  table with its name and description."
- **Save table** (`saveFromView()`): Name trimmed; empty → modal status
  `tabellify-saved-error-name-empty`, focus Name, nothing written. Otherwise build
  definition and snapshot (table "Data"), `addTable`, `saveTables`. On `saved`: forget the
  in-memory draft for this collection (`viewDrafts.delete(key)`), switch the open modal to
  **saved mode** for the new table (showing its snapshot), modal status `tabellify-view-saved`
  ("Table saved."), open the "Saved tables" disclosure so the new entry is visible after
  Close. On a refusal (limit) or store failure: the modal stays in draft mode with the
  typed text and shows the message.
- Draft mode keeps F007a's live refresh and its "close when the page table hides" rule.

### The modal: saved mode (opened by "Open" in the list, or right after "Save table")
- Heading text `tabellify-view-heading-saved` ("Saved table").
- `#tabellify-view-meta` (new `<html:p>`, muted, under the heading): showing the snapshot:
  "Snapshot from <local date of snapshot.takenAt> · <collection name>"; showing live:
  `tabellify-view-meta-live` ("Live: built from your library now") · collection name. The
  F007a note is hidden in saved mode.
- Name and Description: filled from the table (or from an in-memory edit, below).
- `#tabellify-view-live-note` (new, hidden unless needed): in live view, when saved columns
  are missing: `tabellify-view-live-missing` + the names joined with ", " (plain text);
  when live is not possible: the reason (below).
- Buttons, in order (hidden ones are skipped by the Tab wrap):
  | Button | Shown | Does |
  |---|---|---|
  | **Save changes** (`#tabellify-view-save`, label switched to `tabellify-view-save-changes`) | always | `updateTable(id, { name, description })`, `saveTables`; status "Changes saved." |
  | **Show live** / **Show snapshot** (`#tabellify-view-live`, `aria-pressed`) | always (disabled with a reason when live is not possible) | Builds the live view (below) / goes back to the snapshot |
  | **Update snapshot** (`#tabellify-view-update`) | live only | `buildSnapshot(liveView)` → `updateTable(id, { name, description, snapshot })`, `saveTables`; then shows the new snapshot; status "Snapshot updated." |
  | **Save as new table** (`#tabellify-view-save-new`) | live only | `addTable` with the current Name, Description, the **saved** definition and the live snapshot; switches the modal to the new table; status "Saved as a new table." |
  | **Export CSV** | always | Exports what is shown (snapshot or live), base name = the Name field (F007a rule) |
  | **Close** | always | As F007a |
- **Unsaved Name/Description edits** in saved mode are kept in `viewDrafts` under the key
  `"saved:<id>"` when the modal closes (same rule as F007a: only if changed), and restored
  when the same table is opened again in this tab. They are not written to disk without
  "Save changes".
- Saved mode never closes or refreshes because of the page table (no `setTableHidden` /
  `renderPaperTable` effect): it does not show the page table.
- If a conflict reload shows the open table no longer exists (deleted in another tab), the
  modal shows `tabellify-saved-gone`, and Save changes, Update snapshot and Show live are
  disabled; Export CSV and Close still work.

### Live view (`showLive()`)
1. Find the collection: the numeric ID whose key in `collectionKeys` equals
   `definition.collectionKey`. None (deleted, or in the trash: `getByLibrary` leaves trashed
   collections out) → disabled button + note `tabellify-view-live-no-collection`.
2. Codebook: `this.codebook` loaded and `definition.codebookId` among its codebooks; else
   disabled + note `tabellify-view-live-no-codebook`.
3. Button disabled, modal status `tabellify-view-loading`; `const data = await
   this.gatherMonitorData(collectionId)` (the existing read-only F005 read; it changes no
   workspace state); `TabellifySavedTables.liveView({ codebook: this.codebook, monitorData:
   data, definition, snapshot })`; keep `{ view, keyOf, collectionName }` for Update snapshot / Save
   as new; render; status hidden; log numbers.
4. If the modal was closed or switched to another table while reading, the result is
   dropped (a request counter, as `showCollection` does).
5. A read error: note `tabellify-view-live-error`, stay on the snapshot, `Zotero.logError`.
6. The live view is built once per click; it does not follow later library changes
   (click "Show snapshot", then "Show live" again to rebuild).

### Export CSV of a saved table
- `exportCsv(baseName, source, view)` (F008/F007a) gains a third optional parameter `view`
  (default: the page table's `{ tableGroups, tableRows, tableCounting }`); `source` gains
  `"saved"` (the list's buttons). The CSV text is built from `view` with the unchanged
  `TabellifyCsv.build`; the file is written by the unchanged `csv-export.js` (ADR-0017, no
  new write-guard entry).
- From the list: `view = snapshotView(snapshot)`, base name = the table's Name; the result
  shows in `#tabellify-saved-status`. From the modal: the shown view, result in the modal's
  status line.
- `showExportStatus(id, path, isError, target)` gains `target = "saved"` →
  `tabellify-saved-status*`. All three export buttons (page, modal, list) are disabled while
  one export runs.
- Debug Output adds `export: started from saved tables list`.

### Refactors needed (no behaviour change, own commit, T3)
- `viewTableRows(texts)` → `viewTableRows(view, texts)`; `renderViewTable()` passes the
  modal's current view (`viewSource()`: draft → the page snapshot; saved → snapshot view or
  live view).
- `exportCsv(baseName, source, view)` as above.
- `displayedPapers(papers)` keeps its behaviour but delegates the ordering to
  `TabellifySavedTables.orderPapers` so the page and the live view sort identically.

### Debug Output (counts, IDs and outcomes only)
- `saved tables: loaded 3 table(s) (file schema 1)` / `saved tables: no file yet` /
  `saved tables: could not load (invalid|newer); saving off`
- `saved tables: saved new table t4: 12 paper(s), 7 column(s) (revision 5)`
- `saved tables: changes saved for t4 (revision 6)` / `saved tables: snapshot updated for
  t4: 13 paper(s), 8 column(s) (revision 7)` / `saved tables: deleted t4 (revision 8)`
- `saved tables: not saved (conflict); reloaded` / `saved tables: not saved (error:
  NotAllowedError)` + `Zotero.logError` / `saved tables: not saved (limit: rows)`
- `view: opened saved table t4 (snapshot): 12 paper(s), 7 tag column(s), 2 header row(s)`
- `view: live table for t4: 13 paper(s), 8 tag column(s), 1 saved column(s) missing`
Never a Name, Description, title, tag, group or collection name, item key or path.

### Fluent IDs (no arguments; numbers, names and dates appended in JS as plain text)
Proposed text, owner may change:
- List: `tabellify-saved-heading` = Saved tables; `tabellify-saved-filter-label` = Show;
  `tabellify-saved-filter-all` = All collections; `tabellify-saved-filter-collection` = This
  collection; `tabellify-saved-empty` = No saved tables yet. Open "View table" and click
  "Save table".; `tabellify-saved-empty-collection` = No saved tables for this collection.;
  `tabellify-saved-choose` = Choose a collection to see its saved tables.;
  `tabellify-saved-load-error` = The saved tables file could not be read. Saving is turned
  off so the file is not overwritten. File:; `tabellify-saved-newer` = The saved tables file
  was made by a newer version of Tabellify. Saving is turned off. File:;
  `tabellify-saved-papers` = papers; `tabellify-saved-columns` = columns;
  `tabellify-saved-on` = Saved; `tabellify-saved-collection-missing` = (collection not
  found); `tabellify-saved-open` = Open; `tabellify-saved-delete` = Delete;
  `tabellify-saved-delete-question` = Delete this saved table? This cannot be undone.;
  `tabellify-saved-delete-confirm` = Delete; `tabellify-saved-delete-cancel` = Cancel;
  `tabellify-saved-deleted` = Saved table deleted.; `tabellify-saved-conflict` = Saved
  tables were changed in another Tabellify tab and have been reloaded. Repeat your last
  change.; `tabellify-saved-save-error` = The saved tables could not be saved. Nothing was
  changed. File:; `tabellify-saved-gone` = This saved table was deleted in another
  Tabellify tab.
- Errors from the model: `tabellify-saved-error-name-empty` = Type a name before saving.;
  `tabellify-saved-error-limit-tables` = Tabellify keeps at most 100 saved tables. Delete
  one first.; `tabellify-saved-error-limit-rows` = This table has more than 5,000 papers and
  cannot be saved.; `tabellify-saved-error-limit-columns` = This table has more than 500
  columns and cannot be saved.; `tabellify-saved-error-limit-file` = The saved tables file
  would become too large. Delete some saved tables first.
- Modal: `tabellify-view-save` = Save table; `tabellify-view-save-changes` = Save changes;
  `tabellify-view-save-new` = Save as new table; `tabellify-view-show-live` = Show live;
  `tabellify-view-show-snapshot` = Show snapshot; `tabellify-view-update` = Update snapshot;
  `tabellify-view-heading-saved` = Saved table; `tabellify-view-meta-snapshot` = Snapshot
  from; `tabellify-view-meta-live` = Live: built from your library now;
  `tabellify-view-saved` = Table saved.; `tabellify-view-saved-new` = Saved as a new
  table.; `tabellify-view-changes-saved` = Changes saved.; `tabellify-view-snapshot-updated`
  = Snapshot updated.; `tabellify-view-loading` = Building the live table…;
  `tabellify-view-live-missing` = Saved columns that are no longer in the codebook:;
  `tabellify-view-live-no-collection` = This table's collection is no longer in My Library,
  so only the saved snapshot can be shown.; `tabellify-view-live-no-codebook` = The
  codebook could not be loaded, so the live table cannot be built.;
  `tabellify-view-live-error` = The live table could not be built. The saved snapshot is
  still shown.
- Changed text: `tabellify-view-not-saved` (above).
- Formatted from JS once in `init` in a new `SAVED_STRINGS` list (like `EXPORT_STRINGS`).

### Dates
`TabellifyWorkspace.formatDate(iso)`: one `new Intl.DateTimeFormat(undefined, { dateStyle:
"medium", timeStyle: "short" })` created in `init`, `.format(new Date(iso))`; an unreadable
date shows "–". `undefined` = the runtime's default locale (in Zotero the app's language).
Sorting uses the ISO strings, never the formatted text.

### CSS (`workspace.css`, tokens only, ADR-0015)
`#tabellify-saved` (summary like the "Edit groups and tags" disclosure; count "·" drawn as
for the pills), list without bullets, one entry per row with the name in
`--tabellify-font-weight-semibold` (or the existing bold token), muted meta line in
`--tabellify-font-size-sm`, buttons in the existing small button style, the confirm state
with the error/warning text colour token, the status line reusing the export status
selectors (add `#tabellify-saved-status`), the modal meta line and live note in the muted
style. `docs/design-system.md` and `docs/design-system-states.html` gain a "Saved tables
list" sample (entry, confirm state).

### Lifecycle
New listeners, all in the workspace document, added in `init` and removed in `onUnload`
(`symmetry` test): `click` and `keydown` on `#tabellify-saved`, `change` on
`#tabellify-saved-filter`. The modal's new buttons use the existing delegated `click` on
the dialog. No observer, timer, pref or main-window change. A save or live read that
finishes after the tab closed only logs (`unloaded` check, as F008). Nothing in
`bootstrap.js` or `tabellify.js`.

### Files
| File | Change |
|---|---|
| `src/content/saved-tables-model.js` | **New.** Pure model (`TabellifySavedTables`) |
| `src/content/tables-store.js` | **New.** Load/save `tables.json` (`TabellifyTablesStore`), write-guard entry 4 |
| `src/content/workspace.xhtml` | Two `<script>`s (`saved-tables-model.js` after `layout-store.js`, `tables-store.js` after it, before `csv-model.js`); "Saved tables" section; modal: meta line, live note, Save table / Show live / Update snapshot / Save as new buttons |
| `src/content/workspace.js` | Refactors (T3); `initSavedTables`, `saveTables`, list rendering and handlers, filter, delete confirm, `saveFromView`, saved mode, `showLive`, `formatDate`, `collectionNames`, `SAVED_STRINGS`; `exportCsv(…, view)`, target `"saved"`; listeners + `onUnload` |
| `src/content/workspace.css` | List, confirm state, modal meta and note (tokens only) |
| `src/locale/en-US/tabellify.ftl` | New IDs, one changed text |
| `tests/unit/saved-tables-model.test.mjs` | **New** (AC14–AC17) |
| `tests/unit/tables-store.test.mjs` | **New** (AC18) |
| `tests/unit/workspace-table.test.mjs` | AC19–AC21 |
| `tests/static/write-guard.test.mjs` | Entry 4, pinned list of four, `tables-store.js` rules (AC22) |
| `tests/static/workspace-script.test.mjs` | Script order, purity of the model, Fluent and element IDs, no new Zotero allow-list entry (AC22) |
| `docs/design-system.md`, `docs/design-system-states.html` | List sample |

### Does this need an ADR?
Yes: a new storage format (CLAUDE.md rule 7) → **ADR-0018 (Proposed)**. The list and the
modal mode are inside the existing workspace document (no new window, tab or pane). The
CSV path is ADR-0017's, unchanged.

## Zotero / Mozilla APIs used
**No new `Zotero.*` call** (the `workspace.js` Zotero allow-list in
`workspace-script.test.mjs` gains no entry). Details in `docs/zotero-api-notes.md`, "Feature
007b rows".

| API | Status |
|---|---|
| `IOUtils.readJSON` (`NotFoundError`), `IOUtils.writeJSON(path, value, { tmpPath, backupFile })`, `IOUtils.makeDirectory`, `PathUtils.join` | Verified (source), ESR 140 (F004 rows); new caller `tables-store.js` only |
| `Zotero.DataDirectory.dir` (Internal) | Verified (source) 10.0.9; still read only in `codebook-store.js` (`dataDir()`) |
| `Zotero.Collections.getByLibrary(libraryID, true)` (names and keys; trashed collections left out), `collection.key` / `libraryID`, and the F005 reads in `gatherMonitorData` | Verified (source) 10.0.9 (F003, F005, F005c rows); reused unchanged for the collection check and the live view |
| `Date.prototype.toISOString()`, `Date.parse`, `Intl.DateTimeFormat(undefined, { dateStyle, timeStyle })`, `JSON.stringify` | Verified (docs, MDN); standard ECMAScript / ECMA-402. Which locale `undefined` picks inside Zotero is not checked (seen in the smoke test; harmless) |
| `<details>` / `<summary>`, `<select>`, `aria-pressed`, `aria-label`, `Element.closest`, `dataset` | Verified (docs, MDN); `<details>` in our document already passed F006a AC5 |
| F007a `<dialog>` and F008 `FilePicker` / `IOUtils.writeUTF8` | Verified (runtime: RT-S3/RT-S3b and RT-S2 passed); reused unchanged |

## Data safety
- **Read from the library:** nothing new. The live view reads one collection's papers,
  tags and highlight tags with the same read-only calls as F005 (`gatherMonitorData`).
  Saving reads only what the table already holds in memory, plus item keys already read.
- **Written to the library:** **nothing.** No item, tag, annotation, collection,
  attachment or database change. The write guard still forbids every Zotero write API in
  `src/`; its allow-list gains exactly one entry, `IOUtils write` in
  `src/content/tables-store.js`.
- **Written to disk (Tabellify's own folder only, `<data dir>/tabellify/`):** `tables.json`
  (created by the first save), `tables.json.tmp` (short-lived), `tables.json.bak` (the
  previous version). Only on Save table, Save changes, Update snapshot, Save as new table
  and Delete; never on load, open, Show live, filter or export. `codebooks.json` and
  `layout.json` are never written by 007b; the `countItemTags` pref is never changed by
  007b. CSV files only through F008's unchanged path.
- **Stored content and privacy (ADR-0018 §7):** `tables.json` holds paper titles, item
  keys, collection, group and tag names, and the Name and Description the user typed. Same
  folder as `zotero.sqlite` (which already holds all of it), not synced, kept on uninstall.
  It is a second copy: deleting a paper in Zotero does not remove its title from a saved
  snapshot; deleting a saved table leaves its last version in `tables.json.bak` until the
  next save.
- **Untrusted text:** `tables.json` can be hand-edited, so every load is validated
  strictly (ADR-0018 §3) before use; all its text and all library text are shown with
  `textContent` or attributes only (`no-html-sinks`); table IDs are validated
  (`t<number>`) and never used in CSS selectors; tag names are never used in selectors
  (F005c rule). A file that fails validation is never overwritten.
- **Logging:** counts, table IDs and outcomes only (Design, "Debug Output");
  `Zotero.logError` on a failed write may contain the path (local only, as F008).
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`.

## Acceptance criteria
`[manual]` = owner, Zotero 10.0.9 dev profile, collection "F005 test", Debug Output captured
to `build/debug-N.txt`. `[auto]` = `npm test`.

- [ ] AC1 `[manual]` **Empty start.** With no `tables.json` in `~/Zotero
  tabellify-dev/tabellify/`, the Tabellify tab shows a closed "Saved tables · 0" line under
  the collection row. Opening it shows "Show: All collections" and "No saved tables yet…".
  No `tables.json` file is created by opening the tab.
- [ ] AC2 `[manual]` **Save from View table.** Choose "F005 test", sort by k/M descending,
  click "View table": the note reads "Not saved yet…" and the buttons are Save table,
  Export CSV, Close. Clear the Name and click "Save table": "Type a name before saving.",
  nothing saved. Type Name `Heat test A` and a Description, click "Save table": "Table
  saved.", the heading becomes "Saved table" with "Snapshot from <today, now> · F005 test",
  and the buttons become Save changes, Show live, Export CSV, Close. After Close, "Saved
  tables · 1" is open and shows `Heat test A`, "F005 test · <n> papers · <m> columns ·
  Saved <date>". `tables.json` now exists and contains `"schemaVersion": 1`; the
  modification times of `codebooks.json` and `layout.json` did not change.
- [ ] AC3 `[manual]` **Persists.** Quit Zotero, start the dev profile again, open the
  Tabellify tab (no collection chosen), open "Saved tables", click "Open" on `Heat test A`:
  the modal shows the same columns, papers, order (k/M descending), ✓ cells and k/M as at
  save time, and the saved Description.
- [ ] AC4 `[manual]` **Snapshot stays, live follows.** Close the modal. In the script box
  type `age` (new ungrouped codebook tag), and in the Zotero reader add the tag
  `Temperature` to a highlight of a paper that did not have it. Open `Heat test A`: the
  snapshot still has no `age` column and the old ✓ cells. Click "Show live": the meta line
  reads "Live: built from your library now", the `age` column appears, the new ✓ is shown,
  rows follow the saved sort, and Update snapshot and Save as new table appear. Click "Show
  snapshot": back to the saved version. Then remove `age` again in "Edit groups and tags"
  and remove a second tag that the snapshot has (e.g. `Mortality`); "Show live" shows the
  note "Saved columns that are no longer in the codebook: Mortality". (Restore the codebook
  afterwards by typing `Outcome(Mortality)`.)
- [ ] AC5 `[manual]` **Update snapshot and Save as new.** In live view click "Update
  snapshot": "Snapshot updated.", the meta line shows the new time, and after Close and
  Open the new snapshot is shown. Show live again, change the Name to `Heat test B`, click
  "Save as new table": "Saved as a new table." and the list has both `Heat test A` and
  `Heat test B`.
- [ ] AC6 `[manual]` **Rename and description.** Open `Heat test B`, change the Name to
  `Heat test B2` and the Description, click "Save changes": "Changes saved."; the list shows
  `Heat test B2` with a newer "Saved" date. Change the Name again, Close without saving, open
  the table again: the unsaved edit is still in the field (in memory); close and reopen the
  Tabellify tab: the saved name `Heat test B2` is back.
- [ ] AC7 `[manual]` **Export.** In the list, click "Export CSV" on `Heat test A`: the save
  dialog suggests `Heat test A <today>.csv`; after saving, "CSV saved:" and the path appear
  under the list. The file's rows and columns match the snapshot (not the live library:
  `age` absent if AC5 did not update A). Exporting from the modal in live view exports the
  live table.
- [ ] AC8 `[manual]` **Delete.** Click "Delete" on `Heat test B2`: the entry shows "Delete
  this saved table? This cannot be undone." with Delete and Cancel, focus on Cancel. Cancel
  (or Esc) restores the entry. Delete again and confirm: "Saved table deleted.", the entry
  is gone, `tables.json.bak` still contains it.
- [ ] AC9 `[manual]` **Filter.** With "F005 test" and a second collection each having one
  saved table (save one from the second collection first): "All collections" shows both;
  "This collection" shows only the chosen collection's table, and with "Choose a
  collection" selected it says "Choose a collection to see its saved tables." The count in
  the summary follows the filter.
- [ ] AC10 `[manual]` **Collection gone.** Create a collection `F007b temp` with one paper,
  save a table from it, then delete the collection in Zotero (it goes to the trash). The
  entry shows "F007b temp (collection not found)"; Open shows the snapshot; "Show live" is
  disabled and the note says the collection is no longer in My Library; Export CSV works.
  Restore the collection from the trash: after reopening the tab, "Show live" works again.
- [ ] AC11 `[manual]` **Damaged file.** Close the Tabellify tab, open `tables.json` in
  TextEdit and delete the first `{`, save, reopen the tab: "Saved tables" shows "The saved
  tables file could not be read…" with the path, there are no entries, "Save table" in the
  modal shows the same message and writes nothing; the damaged file is unchanged. Copy
  `tables.json.bak` over `tables.json` (Finder), reopen the tab: the list is back.
- [ ] AC12 `[manual]` **Keyboard and look.** In saved mode, Tab cycles Name → Description
  → table area → each shown button → Name; hidden buttons are skipped; Esc closes. Light
  and Dark Color Scheme: list and modal readable.
- [ ] AC13 `[manual]` **Library, log, lifecycle.** The dev library has no new items, tags
  or notes (except the owner's own AC4 highlight tag and AC10 collection). `build/debug-N.txt`
  has the `saved tables:` and `view:` lines from "Debug Output" with numbers and IDs only:
  no Name, Description, title, tag, group or collection name, item key or path in any
  Tabellify line. Closing the Tabellify tab while the modal shows a saved table, and
  disabling Tabellify in Tools → Plugins with the list open, produce no errors.
- [ ] AC14 `[auto]` **Model: validation** (`tests/unit/saved-tables-model.test.mjs`):
  `emptyData` is valid; a full valid file passes; each rule in "Validation" rejects with a
  reason that contains no field value (bad id, id ≥ `nextId`, duplicate id, empty or
  untrimmed name, 201-character name, 2 001-character description, bad date, bad
  `collectionKey`, bad `sort.direction`, non-boolean `countItemTags`, `present` out of
  range / unsorted / repeated, duplicate tag across blocks, neighbouring `null` blocks, 101
  tables, 5 001 rows, 501 columns); `schemaVersion` 2 → `newer`; a `"__proto__"` key in
  `tagOrder` stays an own key and changes no prototype; `migrate` returns an equal but
  separate object.
- [ ] AC15 `[auto]` **Model: snapshot round trip** (same file): `buildSnapshot` then
  `snapshotView` gives the same columns, block names (null → ungrouped runs, several runs
  kept apart), rows, ✓, k and M as the input view; `TabellifyCsv.build` on the round-tripped
  view gives **exactly** the same text as on the original view (several fixtures: groups +
  ungrouped runs, only ungrouped, no tags, untitled paper); a 3 000-character title is cut
  to 2 000 with "…" without splitting an emoji; 5 001 rows and 501 columns are refused with
  the right Fluent ID; inputs are not mutated.
- [ ] AC16 `[auto]` **Model: ordering and live** (same file): `orderPapers` matches
  `displayedPapers`' rules for title / count / tag / manual (manual order by item keys,
  unknown keys after, in default order) and falls back to the default sort for a tag no
  longer in the codebook; `liveView` uses the current codebook for columns, the saved
  `columnLayout` for their order (new tags placed as ADR-0019), the saved `countItemTags`
  (an item tag counts only when true); `missingColumns` lists snapshot tags not in the live
  groups.
- [ ] AC17 `[auto]` **Model: edits** (same file): `addTable` assigns `t<nextId>`, bumps
  `nextId`, sets `createdAt = updatedAt = now`, trims Name, refuses an empty Name and a 101st
  table; `updateTable` changes only the given fields and `updatedAt`, keeps `createdAt`,
  refuses an unknown id; `deleteTable` removes exactly one table and never reuses its id;
  `listTables` filters by collection key (null = all) and sorts newest first, then by name;
  `checkFileSize` refuses above the limit (tested with a small injected limit).
- [ ] AC18 `[auto]` **Store** (`tests/unit/tables-store.test.mjs`, fake `fs`): missing file
  → empty data, nothing written; invalid JSON / invalid data / newer → `invalid` / `newer`,
  nothing written; save with the loaded revision writes once with `tmpPath` + `backupFile`
  and `revision + 1`, after `makeDirectory`; a different revision on disk, an invalid or a
  newer file on disk → `conflict`, nothing written; invalid data or a too-large file →
  `error`, nothing written; a rejected write → `error`; loading never calls `writeJSON` or
  `makeDirectory`.
- [ ] AC19 `[auto]` **Workspace: list** (`tests/unit/workspace-table.test.mjs`, fake DOM,
  fake store `fs`): entries newest first with name, collection, counts and formatted date
  as text; "(collection not found)" for an unknown key; the summary count follows the
  filter; the three messages (empty, choose, empty-collection) and the load-error / newer
  messages with the path; Delete → confirm state with focus on Cancel, Cancel and Esc
  restore it, confirm saves once without that table and shows "Saved table deleted.";
  Save and Delete disabled when the file is invalid; a conflict reloads and shows the
  conflict message; names and titles like `<b>x</b>` stay text.
- [ ] AC20 `[auto]` **Workspace: modal** (same file): draft "Save table" with an empty Name
  writes nothing and shows the error; with a Name it saves the definition (collection key,
  codebook id, copied column layout, sort, manual order from the shown rows when sorted
  manually, countItemTags) and the snapshot of the shown table, deletes the draft, switches
  to saved mode with the right buttons, heading and meta line; Open shows the snapshot via
  `snapshotView`; Save changes updates only Name/Description; Show live calls the fake
  `gatherMonitorData` once, renders the live view, shows the missing-columns note, and a
  live read that finishes after the modal was closed changes nothing; Update snapshot
  and Save as new table save once each; Show live is disabled with the right note for an
  unknown collection key and for a missing codebook; in saved mode `setTableHidden(true)`
  and `renderPaperTable` do not close or change the modal; unsaved saved-mode edits are
  kept per table id; the Tab wrap skips hidden buttons.
- [ ] AC21 `[auto]` **Workspace: export and log** (same file, fake `exportIo`): list Export
  CSV writes the snapshot's CSV (equal to `TabellifyCsv.build(snapshotView(…))`) with the
  table Name as the suggested base name and shows the result in the list's status line;
  modal export in live view exports the live view; a page export is unchanged (existing
  F008/F007a tests pass); all export buttons disabled during an export; no `log` call
  during any 007b flow contains a test Name, Description, title, tag, group or collection
  name, item key or path.
- [ ] AC22 `[auto]` **Static checks:** the write-guard allow-list is exactly four entries
  (adds `content/tables-store.js`, `IOUtils write`, citing this spec), each really used;
  `tables-store.js` has `FILE_NAME: "tables.json"` and exactly the write
  `writeJSON(path, clean, { tmpPath: path + ".tmp", backupFile: path + ".bak" })`, no
  `IOUtils.remove`/`move`/`copy`, no `Zotero.DataDirectory`; `saved-tables-model.js` uses no
  Zotero / DOM / `IOUtils` / `PathUtils` / `Services` / `ChromeUtils` / `Date.now` / `new
  Date(` (no clock); script order (`…, layout-store.js, saved-tables-model.js,
  tables-store.js, csv-model.js, csv-export.js, workspace.js`); every new Fluent ID exists
  and starts with `tabellify-`, and `SAVED_STRINGS` is in the Fluent list check; every new
  element ID exists in `workspace.xhtml`; each new `addEventListener` has its
  `removeEventListener` in `onUnload`; the `workspace.js` Zotero allow-list gains no entry;
  `no-html-sinks` and the ADR-0015 colour rule pass.

## How to verify in the dev profile (owner)
The orchestrator turns this into numbered steps with exact windows at smoke-test time.
1. Before installing the 007b build, in Finder note the modification times of
   `codebooks.json` and `layout.json` in `~/Zotero tabellify-dev/tabellify/`.
2. Start the dev profile with Debug Output captured (`build/debug-N.txt`), install the
   `.xpi`, open Tools → Tabellify….
3. Run AC1–AC13 in order (the inputs are in each AC). Exported files go to the Desktop;
   delete them afterwards. AC11 edits only Tabellify's own `tables.json`.
4. Report "yes" or "no" plus anything that looked wrong; the orchestrator reads the debug
   file.

## Test plan
| AC | How |
|---|---|
| AC1–AC13 | Owner smoke test (manual), Debug Output in `build/debug-N.txt` |
| AC14–AC17 | `tests/unit/saved-tables-model.test.mjs` (new; Node `vm` sandbox loading `codebook-model.js`, `tag-monitor-model.js`, `table-layout-model.js`, `csv-model.js` and the model) |
| AC18 | `tests/unit/tables-store.test.mjs` (new; fake `fs` in a `Map`, like `layout-store.test.mjs`) |
| AC19–AC21 | `tests/unit/workspace-table.test.mjs` (fake DOM; fake store `fs`, fake `gatherMonitorData`, fake `exportIo`) |
| AC22 | `tests/static/write-guard.test.mjs`, `tests/static/workspace-script.test.mjs`, `symmetry`, `no-html-sinks`, `l10n-and-window`, `design-tokens` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Owner approves this spec, ADR-0018 and Q1–Q5 | owner / orchestrator | — | — |
| T1 | Pure model: validation, migration, snapshot build and view, ordering, live view, edits, list, limits + tests (AC14–AC17) | developer | T0 | `src/content/saved-tables-model.js`, `tests/unit/saved-tables-model.test.mjs` |
| T2 | Store + write-guard entry 4 and its static rules + tests (AC18, write-guard part of AC22) | developer | T1 (uses `TabellifySavedTables.validate`) | `src/content/tables-store.js`, `tests/unit/tables-store.test.mjs`, `tests/static/write-guard.test.mjs` |
| T3 | Refactors without behaviour change: `viewTableRows(view, texts)`, `exportCsv(baseName, source, view)`, `displayedPapers` via `orderPapers`; the two `<script>` tags; existing tests stay green | developer | T1, T2 | `src/content/workspace.js`, `src/content/workspace.xhtml`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs` |
| T4 | Saved tables: load, list, filter, delete confirm, list export, draft "Save table", saved mode (snapshot, Save changes), Fluent, CSS, static checks, design-system sample (AC19, AC20 without live, AC21, rest of AC22) | developer | T3 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs`, `docs/design-system.md`, `docs/design-system-states.html` |
| T5 | Live view: Show live / Show snapshot, missing-columns note, no-collection / no-codebook reasons, Update snapshot, Save as new table (live part of AC20) | developer | T4 | same files as T4 |
| T6 | `npm test`, `npm run build`; owner smoke test AC1–AC13 | developer → owner | T5 | — |

All tasks run one after the other on `feat/007b-saved-tables` (T2 needs T1's global; T3–T5
share `workspace.js` and its test file). One concern per commit (T1–T5 separate).

## Open questions (each with the recommendation this spec assumes; the owner delegated
design, so these are confirmations)
1. **Q1 What a saved table is:** definition + snapshot in `tables.json` (ADR-0018 option
   A)? *Recommended: yes* (the only option that shows "previous work" exactly and can also
   be refreshed). Alternatives: settings only (always today's data), snapshot only (cannot
   refresh).
2. **Q2 Live columns:** the current codebook decides which columns exist; the saved order,
   sort and counting setting decide the rest; missing saved columns are named in a note?
   *Recommended: yes* (same rule as the workspace, ADR-0019 §6). Alternative: live shows
   only the saved columns.
3. **Q3 Where the list goes:** a closed "Saved tables · N" disclosure right under the
   collection row, filter defaulting to "All collections"? *Recommended: yes* (visible
   without choosing a collection; does not push the table down). Alternatives: open by
   default; a section at the bottom under the table (hard to find with a long table).
4. **Q4 Saving from "View table" always creates a new table** (changes to an existing one
   only through its own modal: Save changes, Update snapshot, Save as new table)?
   *Recommended: yes* (no accidental overwrite of last week's table). Alternative: a "Save"
   that overwrites the table last saved or opened for this collection.
5. **Q5 Limits:** 100 tables, 5 000 papers and 500 columns per table, Name 200 /
   Description 2 000 characters, titles cut at 2 000, file about 20 MB? *Recommended: yes*
   (raise later without a schema change if ever reached).
