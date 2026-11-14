# ADR-0019: `layout.json` schema 3: one mixed top-level column order (groups and ungrouped tags)

- **Status:** Accepted (owner approved 2026-11-13, option A, all recommendations)
- **Date:** 2026-11-13
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** ADR-0014 (Accepted: `layout.json`; its 2026-11-13 amendment defines schema 2,
  `groupOrder` + `tagOrder`), ADR-0016 (Accepted: codebook schema 2; §5 the "Ungrouped" view
  block, §6 the reserved `"ungrouped"` ID in `layout.json`, §7 regrouping by drag), ADR-0012
  (Accepted: storage rules: schema version, pure migration, no write on load, atomic write,
  `.bak`, revision check), Feature 006c spec `docs/features/006c-drag-regroup.md`
  ("Amendment 2 (2026-11-13)").
- **Number:** ADR-0017 and ADR-0018 are already reserved for the CSV export and the
  table-view work (`docs/features/006a-workspace-restructure.md`, "Later phases"), so this ADR
  takes **0019**. A new ADR instead of an amendment because ADR-0014 and ADR-0016 are both
  Accepted and this change touches both (agents may not edit an Accepted ADR, ADR-0001).

## Context

On 2026-11-13 the owner redesigned drag regrouping after a smoke test (spec 006c,
Amendment 2). The header stays a two-level tree (a group above its tags), but **ungrouped
tags may now sit anywhere at the top level, between groups**. Each consecutive run of
ungrouped tags gets its own super-header cell labelled "Ungrouped". Example of what the
table may show, left to right:

```
| Ungrouped | Exposure               | Ungrouped | Outcome         |
| age       | Heat index | Temperature | sex     | Hospitalization |
```

Today's `layout.json` (schema 2, ADR-0014 amendment; ADR-0016 §6) cannot store this:

```json
"groupOrder": ["ungrouped", "g2", "g3"],
"tagOrder": { "ungrouped": ["age", "sex"], "g2": ["Temperature", "Heat index"] }
```

`groupOrder` lists **blocks**, and all ungrouped tags form **one** block with the reserved
ID `"ungrouped"`. There is no way to say "`age`, then group g2, then `sex`, then group g3".

What does not change:
- Which tags exist and which group each tag has lives in `codebooks.json` (ADR-0016). An
  ungrouped tag still has `group: null` there. Runs are a **view** made from the layout
  order; they are never stored as things.
- `manualOrders` (paper order per collection) is untouched.

### Background for a JavaScript learner
- **Top-level order**: the left-to-right order of the things directly under the header's top
  row: whole groups (each with its own tags below it) and single ungrouped tags.
- **Discriminated entry**: a small object whose single key says what it is, e.g.
  `{ "group": "g2" }` or `{ "tag": "age" }`. Code checks which key is present
  (`Object.hasOwn(entry, "tag")`) instead of guessing from the text.
- **Why not one list of plain strings?** A group ID looks like `"g2"`, but a tag name is free
  text: a user may have a tag literally named `g2`. A plain string list could not tell them
  apart.

## Decision

**Bump `layout.json` to schema version 3. Replace `perPaperTable.groupOrder` with
`perPaperTable.topOrder`, a list of discriminated entries `{ "group": <id> }` or
`{ "tag": <name> }`. Keep `tagOrder` (per real group) and `manualOrders` unchanged. Keep
`codebooks.json` unchanged.**

### 1. Shape (schemaVersion 3)
```json
{
  "schemaVersion": 3,
  "revision": 9,
  "perPaperTable": {
    "topOrder": [
      { "tag": "age" },
      { "group": "g2" },
      { "tag": "sex" },
      { "group": "ungrouped" },
      { "group": "g3" }
    ],
    "tagOrder": { "g2": ["Temperature", "Heat index"] },
    "manualOrders": { "1/ABCD2345": ["EFGH6789", "JKLM2345"] }
  }
}
```
- `{ "group": "g2" }`: a codebook group (ID as in `codebooks.json`). Its tags' order is
  `tagOrder["g2"]`, as in schema 2.
- `{ "tag": "age" }`: one **ungrouped** tag at this top-level place. Ungrouped tags are no
  longer ordered through `tagOrder`.
- `{ "group": "ungrouped" }`: the reserved ID of ADR-0016 §6 keeps one job, the **home
  marker**: ungrouped tags that `topOrder` does not list (new tags from the tag script box, a
  tag ungrouped by the script box, a tag listed under a stale entry) are shown here, in
  codebook order. At most one marker; it has no column of its own. Without a marker, the home
  is the far left (ADR-0016 §6: default position first).
- `tagOrder` keys are real group IDs only; a `"ungrouped"` key is no longer used (dropped by
  the cleaning in §3).

### 2. How the order is shown (pure, `TabellifyTableLayout`, unit-tested)
`topItems(groups, columnLayout)` turns the codebook view (`TabellifyTagMonitor.codebookGroups`)
plus `topOrder` into the order to show:
1. Walk `topOrder`. Keep `{ group: id }` when that group exists **and has tags**, `{ tag }`
   when that tag exists **and is ungrouped now**, and the first `{ group: "ungrouped" }`.
   Skip everything else (stale: a removed group, a tag that is now in a group or gone) and
   any repeat.
2. Insert the marker at the front if it was not listed.
3. Put the ungrouped tags that were not listed at the marker, in codebook order.
4. Append groups with tags that were not listed, in codebook order (as schema 2 does).
5. `orderedGroups(groups, columnLayout)` (the shape the header code already uses) then
   collapses consecutive ungrouped tags into **runs**:
   `{ id: "ungrouped", run: <0-based index>, name: "", tags: [...], ungrouped: true }`.
   Groups keep `{ id, name, tags }`, with `tags` ordered by `tagOrder[id]` as today.

With an empty layout this gives exactly today's default: all ungrouped tags first (one run),
then the groups in codebook order. "Reset columns" clears `topOrder` and `tagOrder`, so it
also joins all runs back into one run at the left; it never changes grouping (ADR-0016 §6).

### 3. Validation and cleaning (ADR-0012 §3, ADR-0014 §3)
- **Frame check** (`validateLayout`, strict): version 3 needs `perPaperTable.topOrder` to be
  an array, `tagOrder` and `manualOrders` objects. Otherwise the file is invalid: default
  layout, message with the path, saving off, file never overwritten (as today).
- **Content cleaning** (`migrateLayout`, lenient: a bad entry only costs part of the order):
  keep an entry only if it is a plain object with exactly one own key, `group` or `tag`, whose
  value is a non-empty string; drop repeats (same key and value, first kept); keep at most one
  `{ "group": "ungrouped" }`. `tagOrder`: as schema 2, plus drop the key `"ungrouped"`. All
  objects are rebuilt with `Object.fromEntries` / literals so a hand-edited `"__proto__"` stays
  an ordinary key or value.
- Entries naming groups or tags that no longer exist are **ignored when shown** and kept in the
  file until a move rewrites `topOrder` (same "not pruned on save" rule as the ADR-0014
  amendment). Regroup plans prune the entries they make stale (spec 006c Amendment 2).

### 4. Migration 2 → 3 (pure, in memory on load; 1 → 2 → 3 chains)
Built so the table looks **exactly** as schema 2 showed it:
- For each ID in `groupOrder`, in order: `"ungrouped"` becomes `{ tag }` for each name in
  `tagOrder["ungrouped"]` (in that order) followed by the marker `{ "group": "ungrouped" }`;
  any other ID becomes `{ group: id }`.
- If `groupOrder` is **not empty** and lacks `"ungrouped"`, schema 2 showed the ungrouped block
  at the far right (`mergeOrder` appends unknown IDs), so the same `{ tag }` entries plus the
  marker are **appended**. If `groupOrder` is empty, schema 2 showed the ungrouped block
  first: `topOrder` becomes those `{ tag }` entries plus the marker (or stays empty when
  `tagOrder["ungrouped"]` is empty), and the groups follow in codebook order, as before.
- `tagOrder` loses its `"ungrouped"` key; other keys are copied. `manualOrders` unchanged.
- Version 1 files go through the existing 1 → 2 step first (column order dropped).
- Loading never writes. The file is rewritten as version 3 only by the next save after a user
  action; the atomic write keeps the version 2 file as `layout.json.bak` (ADR-0012 §2). No
  one-time copy (unlike `codebooks.v1.json`): the layout holds only orders, and losing it
  means "default order", never lost data (spec Amendment 2, open question A2-Q10).

### 5. Older builds (schema 2) meeting a version 3 file
`validateLayout` in those builds already answers "newer" for `schemaVersion > 2`:
- the table uses the default column order **and** shows no manual paper orders;
- the status line says the layout was made by a newer version (`tabellify-table-layout-newer`);
- layout saving is turned off, and `saveData`'s re-read also refuses a newer file, so the
  version 3 file is **never overwritten**;
- `codebooks.json` is unchanged by this ADR, so the codebook, pills, script box and reader
  section of the older build keep working (all ungrouped tags shown as one blank block).
To go back fully: copy `layout.json.bak` (version 2, kept by the first version 3 save) over
`layout.json`, or delete `layout.json` (only orders are lost).

### 6. Keeping the codebook and the layout in sync
- The **codebook decides membership** (which groups and tags exist, and each tag's group);
  the **layout decides order only**. `topItems` filters `topOrder` against the codebook every
  time it is shown, so a layout can never make a tag appear in a group it is not in, show a
  removed tag, or hide a codebook tag.
- A regroup drop writes **codebook first, layout second** (unchanged, spec 006c "Data
  safety"). If the layout save fails or conflicts, the codebook is still right; the moved tag
  then appears at the home marker (ungrouped) or at the end of its group, and a group created
  by a nest appears at the far right.
- Script-box edits never write the layout: new or newly ungrouped tags appear at the home
  marker; tags moved into a group appear at that group's end (ADR-0016 §6 rule, unchanged).
- Two open Tabellify tabs: unchanged revision check (ADR-0014 §5).

### 7. Code touched (for the task plan; no new file, no new write-guard entry)
`src/content/table-layout-model.js` (schema 3, `topItems`, `orderedGroups` with runs, top-level
moves, validation, migration, `layoutData`), `src/content/layout-store.js` (comments and JSDoc
only; it already writes `SCHEMA_VERSION`), `src/content/regroup-model.js` and
`src/content/workspace.js` (callers). `codebooks.json`, `codebook-store.js` and the reader
section are not touched by this ADR.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. `topOrder` of `{ group }` / `{ tag }` entries, schema 3 (recommended)** | Unambiguous for any tag name; one list says the whole top-level order; ungrouped runs fall out of adjacency, so nothing about runs is stored; reuses `tagOrder` and the reserved `"ungrouped"` ID (now the home marker); lossless migration | Schema bump; older builds show the default order until rolled back; a little more JSON per ungrouped tag (~12 bytes) |
| B. `topOrder` of prefixed strings (`"g:g2"`, `"t:age"`) | Compact; still unambiguous | Text parsing (split on the first `:`), easy to get wrong for names containing `:`; less readable when hand-checking the file |
| C. Plain strings, group IDs told apart by the `g<number>` pattern | Smallest change | **Rejected:** a tag named `g2` would be read as a group (tag names are free text) |
| D. Keep schema 2 and number the runs (`"ungrouped"`, `"ungrouped#2"`, … in `groupOrder`, one `tagOrder` per run) | Older builds keep reading the file | Runs are not real things: they merge and split whenever a tag moves, so their numbers shift and every move must renumber; older builds would show only the first run and drop the others' tags to the end; fragile |
| E. Add `topOrder` **next to** `groupOrder` without a bump | Older builds still load manual orders | An older build's next save strips `topOrder` silently (its `migrateLayout` copies only known fields), and the two fields can disagree; against ADR-0012 §4 (a shape change bumps the version) |
| F. Store the top-level position in `codebooks.json` (tag list order + a position per group) | One file | Mixes order into the codebook (ADR-0014 keeps them apart), needs codebook schema 3 and its migration; a layout bug could block codebook editing |

## Consequences
- **Easier:** any arrangement the owner can drag is storable; runs need no bookkeeping; the
  codebook file and its migration are untouched.
- **Harder:** `table-layout-model.js` gains a resolver (`topItems`), run collapsing, top-level
  moves and a second migration step, each with unit tests; workspace code that assumed one
  ungrouped block (header, pills, `columnHeader("ungrouped")`, group drags, Alt+Left/Right)
  must handle several runs.
- **Riskier:** a migration touches the owner's `layout.json`. Mitigated by: pure, tested
  migration; no write on load; `.bak` on the first save; older builds never overwrite. The
  worst case of any layout bug is "default column order", never codebook or library data.
- **Follow-up if accepted:** spec 006c Amendment 2 tasks T6–T9; docs pass (ADR-0010): wiki
  "Data Safety and Privacy" mentions `layout.json` version 3 and the rollback copy.
- **Revisit when:** F007 designs `tables.json` (saved tables may reuse `topOrder`); F009 adds
  column widths/visibility (another bump).

## Open questions for the owner
1. Accept option A (`topOrder` with `{ group }` / `{ tag }` entries, schema 3)?
   *Recommended: yes.*
2. Keep the reserved `{ "group": "ungrouped" }` entry as the home marker for new ungrouped
   tags (default far left)? *Recommended: yes* (alternative: new ungrouped tags always go to
   the far left, simpler but a migrated block position is lost for tags the old file did not
   list).
3. No one-time `layout.v2.json` copy (rely on `layout.json.bak`)? *Recommended: yes.*
