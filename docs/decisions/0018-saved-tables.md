# ADR-0018: Saved tables: what a saved table is and how `tables.json` stores it

- **Status:** Accepted (owner approved 2026-11-14, all recommendations)
- **Date:** 2026-11-14
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** Feature 007b spec `docs/features/007b-saved-tables.md` (this ADR's first user);
  outline in `docs/features/006a-workspace-restructure.md` ("ADR-0018 outline"); ADR-0012
  (Accepted: Tabellify's own data in `<data dir>/tabellify/`, one JSON file per concern, the
  write pattern, `schemaVersion`, `revision`, never overwrite a damaged or newer file, kept on
  uninstall; it already names `tables.json`); ADR-0014 and ADR-0019 (Accepted: `layout.json`,
  `topOrder` / `tagOrder` / `manualOrders`; ADR-0014 §8 says saved tables carry their own
  orders); ADR-0016 (Accepted: codebook schema 2, ungrouped tags); ADR-0017 (Accepted: CSV
  export path, reused unchanged); ADR-0011 (security review); PRD §4 ("Save → Saved Tables
  list … Export & edit/delete tables"), §5 F007, §6 (library safety).

## Context

The owner (2026-11-14): "need to have saved tables first. and actually it would be cool to
have tables persist. so someone can see their previous work. whatever the best design
decision is go for it."

Today (F007a) the "View table" modal shows the current table with a Name and a Description,
but nothing is kept: Name and Description live in memory until the Tabellify tab closes. The
PRD sketch shows a persistent "Saved Tables" list with delete and export actions.

ADR-0012 already decides **where and how** Tabellify stores its own data (a JSON file in
`<data dir>/tabellify/`, atomic write with `.tmp` and `.bak`, `schemaVersion`, `revision`
conflict check, pure validation, a write-guard allow-list entry per writing file). It names
`tables.json` and says F007 needs no new ADR "unless the approach changes". This ADR is still
needed because it decides a **new storage format** (CLAUDE.md rule 7): what a saved table
contains. That choice decides what "see their previous work" can mean.

What the table on screen is made of today (all in memory in `workspace.js`):
- **Inputs (the "definition")**: the chosen collection (and its subcollections), the
  codebook (which tags, which groups), the column order (`topOrder` + `tagOrder` from
  `layout.json`, ADR-0019; one order for the whole tab), the paper order (a sort key and
  direction, or the collection's manual order of item keys), and the "Also count tags on the
  paper itself" setting (a global pref).
- **Output (the "contents")**: the blocks of tag columns (`tableGroups`), the papers in the
  shown order with their title, which tags they have (✓) and k/M (`tableRows`), exactly what
  F008 exports and F007a shows.

Every input can change after a table is saved: papers are added, retitled, re-tagged or
removed; the codebook gains, loses or regroups tags; the collection is renamed or deleted;
the column order and the counting setting are global and change with later work.

Constraints: no library writes (CLAUDE.md rule 8, PRD §6); verified APIs only (rule 1); no
new dependency (rule 3); pure logic testable in Node (CLAUDE.md "Technical baseline"); Zotero
10.0.x on Firefox ESR 140 (ADR-0008).

### Background for a JavaScript learner
- **Definition vs snapshot.** A *definition* is a recipe ("collection X, columns in this
  order, sorted by k/M, count paper tags too"). Running the recipe again later gives a table
  built from the library **as it is then**. A *snapshot* is a photo of the finished table
  ("these 12 papers, these ✓ cells, these numbers"), which never changes afterwards.
- **Live** means "rebuilt now from the current library with the saved definition".
- **Item key**: the 8-character, sync-stable identifier of a Zotero item (ADR-0014). Storing
  it next to each row keeps the row traceable to its paper (PRD §6 "traceable synthesis")
  even if the title changes.

## Decision

**A saved table stores BOTH its definition AND a snapshot of its contents at save time, in a
new file `tables.json` (schema version 1) in `<data dir>/tabellify/`, written only by a new
`src/content/tables-store.js` with ADR-0012's write pattern.** Opening a saved table shows the
snapshot exactly as it was saved; "Show live" rebuilds it from the current library with the
saved definition; "Update snapshot" replaces the snapshot with what live shows.

### 1. Shape (schemaVersion 1)
```json
{
  "schemaVersion": 1,
  "revision": 4,
  "nextId": 3,
  "tables": [
    {
      "id": "t1",
      "name": "Heat and hospitalization",
      "description": "Phenotype definitions, first pass.",
      "createdAt": "2026-11-14T15:02:11.000Z",
      "updatedAt": "2026-11-14T15:40:03.000Z",
      "definition": {
        "collectionKey": "1/ABCD2345",
        "codebookId": "c1",
        "columnLayout": {
          "topOrder": [{ "tag": "age" }, { "group": "g2" }, { "group": "ungrouped" }],
          "tagOrder": { "g2": ["Temperature", "Heat index"] }
        },
        "sort": { "key": "count", "direction": "asc" },
        "manualOrder": null,
        "countItemTags": false
      },
      "snapshot": {
        "takenAt": "2026-11-14T15:40:03.000Z",
        "collectionName": "F005 test",
        "blocks": [
          { "group": null, "tags": ["age"] },
          { "group": "Exposure", "tags": ["Temperature", "Heat index"] }
        ],
        "rows": [
          { "itemKey": "EFGH6789", "title": "Smith 2020", "untitled": false, "present": [0, 2] },
          { "itemKey": "JKLM2345", "title": "", "untitled": true, "present": [] }
        ]
      }
    }
  ]
}
```
- **`id`**: `"t<number>"`, from `nextId` (same scheme as codebook IDs; no random-number API
  needed). Never reused.
- **`definition`** (the recipe):
  - `collectionKey`: `"<libraryID>/<collectionKey>"`, the shape `layout.json` already uses
    for `manualOrders` (ADR-0014 §2). Keys survive sync and a move to another computer.
  - `codebookId`: today always `"c1"` (`codebooks.json` has one codebook); stored so a
    future multi-codebook feature does not need a migration.
  - `columnLayout`: a **copy** of `{ topOrder, tagOrder }` at save time, same entry shapes
    and cleaning rules as `layout.json` schema 3 (ADR-0019 §1, §3). Later column moves in the
    workspace do not change it.
  - `sort`: `{ key, direction }` with the workspace's keys (`"title"`, `"count"`,
    `"tag:<name>"`, `"manual"`) and `"asc"` / `"desc"`.
  - `manualOrder`: when `sort.key` is `"manual"`, a **copy** of that collection's manual
    order (item keys) at save time; otherwise `null`.
  - `countItemTags`: the checkbox value at save time.
- **`snapshot`** (the photo):
  - `blocks`: the tag columns left to right, grouped as shown: `group` is the group's
    **name** at save time, or `null` for a run of ungrouped tags (two neighbouring `null`
    blocks would be one run, so the model merges them). `tags` are the column names.
  - `rows`: the papers in the shown order: `itemKey`, `title` as shown (`""` when untitled),
    `untitled`, and `present` = the **indexes** of the columns that showed ✓, counted left to
    right over all blocks (indexes, not names, keep the file small: a 2 000-paper table with
    30 columns stays well under 1 MB).
  - **Derived, not stored:** k = `present.length`, M = the number of columns, "counting" =
    at least one column (exactly how F005 computes them today: the columns are all codebook
    tags). The model rebuilds them, so the file cannot hold contradicting numbers.
  - `collectionName`: the collection's name at save time, shown when the collection is gone.
- **Timestamps**: ISO 8601 UTC strings from `Date.prototype.toISOString()` (always ends in
  `Z`). Formatting for display happens in the workspace (`Intl.DateTimeFormat`), never stored.

### 2. Live re-open uses the current codebook for membership
"Show live" never changes the workspace, `layout.json` or the counting pref. It reads the
saved collection again (the same read-only calls F005 uses), then builds the table with the
**current codebook** for *which* columns exist and the **saved** `columnLayout`, `sort`,
`manualOrder` and `countItemTags` for *order and counting*, with the existing pure functions
(`TabellifyTableLayout.orderedGroups`, `TabellifyTagMonitor.summarize` / `sortPapers`,
`TabellifyTableLayout.applyManualOrder`). This is the rule ADR-0019 §6 already follows ("the
codebook decides membership; the layout decides order"). Columns in the snapshot that are no
longer in the codebook are counted and named in a note ("2 saved columns are no longer in
the codebook"); new codebook tags appear where ADR-0019 puts unlisted tags.

### 3. Storage rules (ADR-0012, unchanged; restated for this file)
- Path: `PathUtils.join(<TabellifyCodebookStore.dataDir()>, "tables.json")`, with
  `tables.json.tmp` and `tables.json.bak`. `Zotero.DataDirectory.dir` is still read in one
  place only (`codebook-store.js`).
- Load: `IOUtils.readJSON`; `NotFoundError` = no saved tables yet (nothing created). Not
  JSON, failed validation, unreadable → the list shows an error with the path, **saving and
  deleting are disabled**, the file is never overwritten (`.bak` for manual recovery).
  `schemaVersion` above 1 → "made by a newer Tabellify", same handling.
- **Whole-file validation (strict).** One malformed table makes the file invalid (no
  silent dropping): saving the remaining tables would delete the malformed one from disk.
- Save: re-read, compare `revision` with the loaded one (another Tabellify tab may have
  saved, ADR-0012 §5); on a mismatch nothing is written, the list reloads and says so. Then
  `IOUtils.makeDirectory(dir)` and
  `IOUtils.writeJSON(path, data, { tmpPath: path + ".tmp", backupFile: path + ".bak" })`.
  Never writes data that its own `validate` refuses; never writes a schema other than 1.
- Loading never writes. Only a user action (Save table, Save changes, Update snapshot, Save
  as new table, Delete) writes, once per action.

### 4. Size limits (pure, checked before every write)
| Limit | Value | Why |
|---|---|---|
| Saved tables | 100 | Keeps the file and the list small; the owner can delete old ones |
| Rows per snapshot | 5 000 papers | Far above a literature review; keeps one table under ~2 MB |
| Columns per snapshot | 500 | Same order as the codebook sizes seen so far (tens) |
| Name | 1–200 characters after trimming | Same limit as the F007a Name field |
| Description | 0–2 000 characters | Same limit as the F007a Description field |
| Title per row | 2 000 characters (longer titles are cut, with "…") | A malformed or giant title cannot blow up the file |
| Whole file | 20 000 000 characters of JSON (about 20 MB) | `readJSON` loads the whole file at every workspace open |
A save that would break a limit is refused with a message naming the limit; nothing is
written. A file that already breaks a limit (hand-edited) is invalid (§3).

### 5. One writer file, the fourth write-guard entry
`src/content/tables-store.js` (global `TabellifyTablesStore`), modelled on
`layout-store.js` (same `fs` injection for Node tests). It is the only file that writes
`tables.json`. `tests/static/write-guard.test.mjs` gains a fourth entry
`{ file: "content/tables-store.js", pattern: "IOUtils write", spec: "docs/features/007b-saved-tables.md" }`,
and pins `FILE_NAME: "tables.json"` and the exact `writeJSON(path, clean, { tmpPath: path +
".tmp", backupFile: path + ".bak" })` call, as it does for `layout-store.js`. No `remove`,
`move` or `copy`: deleting a table is a normal save of the list without it.

### 6. Pure logic in its own module
`src/content/saved-tables-model.js` (global `TabellifySavedTables`; no Zotero, DOM,
`IOUtils`, `PathUtils`, `Services` or `ChromeUtils`): `emptyData`, `validate`, `migrate`
(identity for version 1; the place for later steps), `buildSnapshot`, `snapshotView`
(snapshot → the `{ groups, papers, counting }` shape `viewTableRows` and `TabellifyCsv.build`
already take), `orderPapers`, `addTable`, `updateTable`, `deleteTable`, `listTables`, limit
checks. It sits in `src/content/` like the other pure models (only `src/content/` has a
`chrome://` URL; `workspace.js` header explains why).

### 7. Privacy
`tables.json` contains paper **titles** and **item keys**, collection and group names, tag
names, and the user's Name and Description. It lives in the Zotero data directory next to
`zotero.sqlite`, which already holds all of that, so it adds no new exposure on the disk,
but it is a second copy: deleting a paper from Zotero does not delete its title from a saved
snapshot (until that table is deleted or its snapshot updated). A deleted table stays in
`tables.json.bak` until the next save. Not synced (ADR-0012 §7); kept on uninstall (ADR-0012
§8). Debug Output gets counts, table IDs and outcomes only, never names, titles,
descriptions or paths (as F008 / F007a).

### 8. Relation to the other files
- `layout.json` is unchanged and stays the live workspace's column and manual order. Saving
  copies from it; opening a saved table never writes it (ADR-0014 §8).
- `codebooks.json` is unchanged. A saved table references the codebook by ID and tags by
  **name** (in `columnLayout` and the snapshot), never changes it.
- The countItemTags pref is unchanged by opening or showing live.
- F007a's in-memory `viewDrafts` stays only for **unsaved** typing (spec 007b explains why a
  draft is not written to disk without a Save click).

## Alternatives considered

What a saved table contains:

| Option | Pros | Cons |
|---|---|---|
| **A. Definition + snapshot (recommended)** | "Previous work" is shown exactly as it was (titles, ✓, order), even after the library or codebook changed or the collection was deleted; can also be re-run live; export of a saved table gives the same file as on the day it was saved (reproducible); rows keep item keys (traceable) | Largest file; titles stored a second time (privacy note §7); a snapshot can look "stale" (the modal shows its date and offers Show live / Update snapshot); two things to validate |
| B. Definition only (settings, recomputed when opened) | Smallest file; always current; no titles stored | Not "previous work": opening shows **today's** library, so a table saved before re-tagging silently changes; a deleted collection leaves nothing to show; the export of a saved table is not reproducible |
| C. Snapshot only (contents) | Exactly what was seen; simple to show | Cannot be refreshed: after new tagging the user must rebuild the same column order and sort by hand and save again; no way to answer "what would this table look like now?" |
| D. Definition + snapshot taken only at CSV export (006a outline idea) | Smaller in the common case | Two kinds of saved table; a saved table without export shows nothing reproducible; harder to explain |

Where and how it is stored:

| Option | Pros | Cons |
|---|---|---|
| **`tables.json` under ADR-0012 (recommended)** | Proven pattern (atomic, `.bak`, `schemaVersion`, revision check, Node-testable); travels with the data folder; a damaged file cannot affect codebook or layout | Whole file rewritten on each save (fine at a few MB); one more write-guard entry |
| One file per table (`tables/t1.json`, …) | Small writes; one damaged table does not block the others | Delete needs `IOUtils.remove` (a new write kind in the guard); listing needs `IOUtils.getChildren` (not verified here); a revision per file; more code |
| Add saved tables to `layout.json` or `codebooks.json` | No new file | Mixes concerns; a schema bump of an Accepted format; a snapshot bug could block codebook editing or reset the layout (ADR-0014 rejected the same idea) |
| Prefs (`extensions.tabellify.*`) | One call | Profile, not data folder; Firefox warns above 4 KB per pref; no backup (ADR-0012 option B) |
| Zotero notes / the library | Syncs | **Rejected:** library writes (CLAUDE.md rule 8, PRD §6) |

## Consequences
- **Easier:** the owner's past tables are kept and can be viewed, exported and refreshed;
  the CSV and the modal reuse the existing builders through one adapter (`snapshotView`);
  the live view reuses the existing pure table logic.
- **Harder:** a third schema-versioned Tabellify file with its own validation and limits; a
  fourth write-guard entry for the security audit (ADR-0011); the modal gains a second mode
  (saved table) and more buttons.
- **Riskier:** a second copy of titles on disk (§7, documented in the wiki by the docs pass);
  same internal `Zotero.DataDirectory.dir` dependency as ADR-0012 (no new internal API); a
  strict validator means a hand-edited mistake disables saving until it is fixed or
  `tables.json.bak` is copied back (the list says so).
- **Follow-up:** spec 007b tasks; security-auditor reviews `tables-store.js`, the validator
  (hand-edited input to a privileged document) and the size limits; docs pass (ADR-0010):
  wiki "Saved Tables" and "Data Safety and Privacy" (titles stored, `.bak`, not synced).
- **Revisit when:** 006d adds highlight text to cells (the snapshot then stores cell text:
  schema 2 and a size review); several codebooks exist (`codebookId` becomes meaningful);
  the file grows past a few MB in practice (one file per table); the owner wants saved
  tables on several computers (export/import).

## Open questions for the owner
1. Approve option A (definition + snapshot) in `tables.json`? *Recommended: yes.*
2. Live view: current codebook decides which columns exist, saved order decides where they
   go (§2)? *Recommended: yes.* Alternative: live shows only the saved columns (new codebook
   tags left out).
3. Size limits as in §4? *Recommended: yes* (they can be raised later without a schema bump).
