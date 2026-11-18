# ADR-0027: Collection selections: one table from several collections (`tables.json` schema 2, selection keys in `layout.json`)

- **Status:** Proposed
- **Date:** 2026-11-18
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** Feature 011 spec `docs/features/011-collection-selection.md` (this ADR's first
  user); ADR-0018 (Accepted: saved tables, `tables.json` schema 1, `definition.collectionKey`);
  ADR-0012 (Accepted: storage rules: `schemaVersion`, pure migration, no write on load, atomic
  write, `.bak`, never overwrite a newer or damaged file; 2026-11-14 size limits); ADR-0014 and
  ADR-0019 (Accepted: `layout.json` schema 3, `manualOrders` keyed `"<libraryID>/<collectionKey>"`);
  spec F003b (group libraries; manual-order pruning per listed library, SEC-018 trash rule);
  PRD §8 Q6 ("Collection names as columns").
- **Why a new ADR, not an amendment:** ADR-0018 is Accepted and agents may not edit an Accepted
  ADR (ADR-0001). This ADR changes the `tables.json` format (CLAUDE.md rule 7) and the meaning of
  `layout.json` manual-order keys. If accepted, it amends ADR-0018 §1 (definition and snapshot
  shape) and ADR-0014 §2 (manual-order keys); everything else in those ADRs stays.

## Context

The owner (2026-11-18): "the collections should be selectable as well as the subcollections. for
instance i had all my phenotype papers under the main collection but when i read papers disease
by disease [I] found it easier to split into subcollections". The owner chose both:
1. **Pick several:** tick several collections or subcollections (for example 3 of 8 disease
   subcollections) and build one table from them.
2. **Show subcollection:** show which subcollection each paper is in.

Today (0.2.0) a table is always **one** collection plus all its subcollections:
- the workspace keeps one collection ID (`currentCollection`);
- `TabellifyTagMonitor.descendantIds(collections, rootId)` gives the scope;
- a saved table stores one `definition.collectionKey` (`"<libraryID>/<key>"`, ADR-0018 §1);
- a manual paper order is stored per collection key in `layout.json`
  (`perPaperTable.manualOrders`, ADR-0014 §2).

None of these can describe "Asthma, COPD and Diabetes, but not Phenotypes' own papers", or
"Phenotypes without its Archive subcollection".

### Background for a JavaScript learner
- **Scope:** the set of collections whose papers go into the table.
- **Rule:** a small instruction that covers a collection *and everything below it*: "include
  Phenotypes" or "exclude Archive". A new subcollection created later under an included
  collection is included too, exactly like today's "a collection includes its subcollections".
- **Nearest rule wins:** to decide one collection, walk up from it to the top of the tree; the
  first rule you meet decides. No rule on the way up means "not included".
- **Canonical form:** the shortest list of rules that gives the same ticks. Two people who tick
  the same boxes always get the same rules, so the same text key (needed for manual orders).

## Decision

**A table's scope becomes a *selection*: `{ include: [keys], exclude: [keys] }` inside one
library, evaluated with "nearest rule wins". `tables.json` moves to schema 2 to store it (plus the
Subcollection column of the snapshot). `layout.json` stays schema 3: a multi-collection selection
keeps its manual order under a new, prefixed key form `"sel:…"`. A single collection keeps its
plain key, so every existing order still applies.**

### 1. The selection (pure, `src/content/selection-model.js`, global `TabellifySelection`)
```json
{ "include": ["1/PHEN0001"], "exclude": ["1/ARCH0002"] }
```
- Every key is `"<libraryID>/<collectionKey>"` (the existing shape). **All keys share one library
  ID** (Decision §5 of the spec: one library per table).
- `include` has at least one key. `exclude` may be empty.
- A key may not be in both lists; no key appears twice.
- **Evaluation** `scope(collections, selection)`: for each collection, the nearest rule among
  itself and its ancestors decides; result in Zotero's tree order (depth-first, as
  `getByLibrary(libraryID, true)` returns it). Keys that no longer exist are ignored.
- **Canonical form** `fromTicks(collections, tickedIds)`: walk the tree from the top; a
  collection gets a rule only when its tick differs from what it inherits from its parent
  (top level inherits "not included"). Then sort each list by plain code-unit order
  (`a < b`, not locale order: the key must be the same on every computer).
- A single dropdown choice is `{ include: [key], exclude: [] }`, exactly today's scope.
- Limit: at most **1 000 rules** (include + exclude) per selection. The scope itself can be any
  size (it is computed, never stored).

### 2. `tables.json` schema 2 (amends ADR-0018 §1)
Changes against schema 1 (everything else unchanged):
```json
"definition": {
  "selection": { "include": ["1/ASTH0001", "1/COPD0002", "1/DIAB0003"], "exclude": [] },
  "codebookId": "c1",
  "columnLayout": { "topOrder": [], "tagOrder": {} },
  "sort": { "key": "subcollection", "direction": "asc" },
  "manualOrder": null,
  "countItemTags": false
},
"snapshot": {
  "takenAt": "2026-11-18T10:00:00.000Z",
  "collectionName": "Asthma, COPD, Diabetes",
  "subcollectionColumn": true,
  "blocks": [ { "group": null, "tags": ["age"] } ],
  "rows": [
    { "itemKey": "EFGH6789", "title": "Smith 2020", "untitled": false, "present": [0],
      "subcollections": ["Asthma"] }
  ]
}
```
- `definition.collectionKey` is **replaced** by `definition.selection` (shape §1, validated
  strictly: pattern, one library, no repeats, 1–1 000 rules).
- `sort.key` may also be `"subcollection"` (the new sortable column). Validation of `sort.key`
  is unchanged ("a non-empty text"); an unknown key already falls back to the default sort.
- `snapshot.collectionName` keeps its type (text) and now holds the **selection label at save
  time**: one name, or the included collections' names joined with ", " (cut to 2 000
  characters with "…", the existing `cut`).
- `snapshot.subcollectionColumn` (boolean, new, required): was the column shown?
- `rows[].subcollections` (array of text, new, required): the column's text parts for that
  paper as shown (empty array when the column was not shown). At most **50** parts per row,
  each at most **500** characters (cut with "…"). When `subcollectionColumn` is false, every
  row's array must be empty.
- **Migration 1 → 2** (pure, in memory on load, ADR-0012 §4):
  `selection = { include: [collectionKey], exclude: [] }`, `subcollectionColumn = false`,
  every row gets `subcollections: []`. Saved tables look exactly as before.
- **One-time copy before the first schema 2 write:** `tables.v1.json`, written with
  `mode: "create"` (never overwrites; the pattern `codebooks.v1.json` already uses, ADR-0016).
  Reason: saved tables are "previous work" (ADR-0018), and `.bak` is replaced on the second
  save. The copy lets the owner go back to 0.2.0 with every table intact.
- **Older builds (0.2.0) meeting schema 2:** `validate` already answers "made by a newer
  Tabellify": the Saved tables list shows that message, saving and deleting are off, the file is
  never overwritten (ADR-0012 §3). Rollback: copy `tables.v1.json` over `tables.json`.

### 3. `layout.json` manual orders for a selection (amends ADR-0014 §2; schema stays 3)
- **Single collection** (`include` has one key, `exclude` empty): the key is the plain
  collection key `"1/ABCD2345"`, as today. Existing orders keep working with no migration.
- **Any other selection:** the key is
  `"sel:" + include.join(",")` and, when `exclude` is not empty, `"|" + exclude.join(",")`,
  with both lists in canonical form (§1). Example:
  `"sel:1/ASTH0001,1/COPD0002,1/DIAB0003"` or `"sel:1/PHEN0001|1/ARCH0002"`.
- **Pruning (new rule, pure, `TabellifyTableLayout.cleanManualOrders`):** a `"sel:"` entry is
  dropped when **any** key in it belongs to a listed library and is not in the retained set
  (collections incl. trash, SEC-018). Otherwise kept. A plain key follows today's rule.
- **Why no schema bump:** the file's *shape* (object of text → list of item keys) does not
  change, only which texts appear as keys. Checked in 0.2.0 code: `validateLayout` accepts any
  non-empty text key, and `cleanManualOrders` keeps a key whose library prefix cannot be read
  (`libraryIdOfKey("sel:…")` is `null`, so "library not listed", so kept). **So a 0.2.0 build
  keeps `"sel:"` orders untouched** and simply never shows them. A bump would instead make
  0.2.0 hide *every* manual order (ADR-0019 §5). The `manualOrders` limit (10 000 entries)
  counts `"sel:"` entries too.
- Key length: at most 1 000 rules × about 18 characters = about 18 000 characters per key.
  Acceptable for a JSON key (the file limit is 20 MiB, ADR-0012 amendment).

### 4. What a selection's table looks like (rules for the spec)
- One row per paper (PRD Q5 unchanged): a paper in two included collections is one row.
- The **Subcollection** column shows, per paper, where in the selection it sits (spec F011,
  "Subcollection column"). It is derived from the live tree every time; only snapshots store
  its text.

### 5. Code touched (for the task plan)
New pure file `src/content/selection-model.js` (loaded in `workspace.xhtml` after
`tag-monitor-model.js`); `tag-monitor-model.js` (scope as a list, first-place order),
`table-layout-model.js` (pruning of `"sel:"` keys), `saved-tables-model.js` (schema 2,
validation, migration, snapshot), `tables-store.js` (schema 2 constant, one-time
`tables.v1.json` copy), `csv-model.js` (one optional column), `workspace.js`, `workspace.xhtml`,
`workspace.css`, `tabellify.ftl`, tests. **No new write-guard entry, but a tighter pin
changes:** the one-time copy is a second `writeJSON` call inside the already allow-listed
`tables-store.js`. Today `tests/static/write-guard.test.mjs` asserts that this file has
**exactly one** `fs.writeJSON(` call and **no** `mode:` option. That test must change to allow
exactly one more call, `writeJSON(<path of tables.v1.json>, <the schema 1 data read from disk>,
{ mode: "create" })`, the same pattern `codebook-store.js` uses for `codebooks.v1.json`
(`mode: "create"` means "write only if the file does not exist", so it never overwrites). The
security-auditor reviews that test change (ADR-0011). Option B below avoids it.

## Alternatives considered

How the scope is stored:

| Option | Pros | Cons |
|---|---|---|
| **A. Include/exclude rules, nearest rule wins (recommended)** | Same meaning as today for one collection (new subcollections join automatically); small (only the differences are stored); one canonical form, so a stable key for manual orders; pure and easy to test | A new idea to explain ("exclude"); the tri-state tree must be turned into rules (one pure function) |
| B. The full list of ticked collections | Simplest to explain: "exactly these" | A subcollection created later is never included (unlike today); long lists for big trees; manual-order key changes whenever a subcollection is added |
| C. Several roots only (each root includes all its subcollections), no exclusions | Very simple | Cannot express "Phenotypes without Archive" or "only the children, not the parent's own papers" (both asked for by the tri-state design) |
| D. A Zotero saved search | Zotero-native | **Rejected:** creating a saved search is a library write (CLAUDE.md rule 8) |

Manual order for a multi-collection selection:

| Option | Pros | Cons |
|---|---|---|
| **A. One order per canonical selection, key `"sel:…"` (recommended)** | Same behaviour users know (each table has its own hand order); no schema bump; 0.2.0 keeps the entries; single collections unchanged | Ticking a different set of boxes is a different order (by design); a member collection removed for good drops the order |
| B. No manual order for multi-collection selections (sort only) | Least code | A known feature silently missing; the owner reads disease by disease and may want a hand order across them |
| C. Build the order from the members' own orders (concatenate) | No new keys | Ambiguous for papers in two members and for excludes; a drag would have to decide which member order to change |
| D. A new `selectionOrders` field with a `layout.json` schema 4 | Clean separation | 0.2.0 would hide every manual order and stop saving the layout (ADR-0019 §5) for no gain |

`tables.json` upgrade:

| Option | Pros | Cons |
|---|---|---|
| **A. Schema 2 with migration and a one-time `tables.v1.json` copy (recommended)** | Follows ADR-0012 §4; lossless; rollback path | 0.2.0 can no longer save tables once 0.3.0 has saved (documented) |
| B. Schema 2 without the copy (rely on `.bak`) | One write fewer; the write-guard pin of `tables-store.js` stays exactly as it is | `.bak` holds only the last version; after two saves the schema 1 file is gone |
| C. Keep schema 1, add optional fields | 0.2.0 might read it | Impossible: 0.2.0's validator refuses unknown keys, so it would call the file invalid (worse message, same effect); against ADR-0012 §4 |

## Consequences
- **Easier:** the owner's disease-by-disease reading becomes one table; Q6 of the PRD is
  answered; single-collection use is unchanged on screen and on disk.
- **Harder:** a selection replaces the single collection ID through `workspace.js` (state,
  dropdown, saved-table filter, live view); the snapshot gains a column; one more migration.
- **Riskier:** a `tables.json` migration touches the owner's saved tables. Mitigated by a pure,
  tested migration, no write on load, the one-time `tables.v1.json` copy and `.bak`.
  Downgrading to 0.2.0 disables saving tables until the copy is restored (wiki note).
- **Follow-up if accepted:** spec F011 tasks; security-auditor: new validator branches (hand
  edited input), selection key parsing, Subcollection text (untrusted collection names) in the
  DOM, CSV formula guard on the new column; docs pass: wiki "Saved Tables", "Table Builder",
  "Data Safety and Privacy" (rollback copy).
- **Revisit when:** tables across libraries are wanted (selection keys already carry the library
  ID; the one-library rule is a validation choice); saved searches as a scope; a per-row
  "one row per paper per subcollection" mode (PRD Q5).

## Open questions for the owner
1. Accept option A (include/exclude rules, nearest rule wins)? *Recommended: yes.*
2. Manual orders: one order per selection under a `"sel:"` key, no `layout.json` schema bump?
   *Recommended: yes.*
3. `tables.json` schema 2 with migration and the one-time `tables.v1.json` copy?
   *Recommended: yes.*
4. Limits: 1 000 rules per selection; 50 Subcollection parts per row, 500 characters each?
   *Recommended: yes* (can be raised later without a schema bump).
