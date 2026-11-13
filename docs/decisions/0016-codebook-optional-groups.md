# ADR-0016: Codebook schema 2: optional groups (ungrouped tags) and regrouping

- **Status:** Accepted (owner approved 2026-11-13)
- **Date:** 2026-11-13
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** ADR-0012 (Accepted: how Tabellify stores its own data; this ADR changes the
  **shape** of `codebooks.json` under its rules §3–§4), ADR-0014 (Accepted: `layout.json`;
  this ADR adds a reserved ID to its version 2 data and changes one sentence of its
  2026-11-13 amendment for Feature 006c), Feature 004 spec (data model; owner decision 6
  "every tag sits under a super-tag" is reversed here), Feature 005c spec (owner decision
  2026-11-13 #2 item 3 "a tag column moves only within its super-tag group" is reversed in
  Feature 006c), Feature 006a spec `docs/features/006a-workspace-restructure.md`

## Context

The owner asked for a restructured workspace (2026-11-13, Feature 006a spec, "Owner's
request"). Three parts of that request change Tabellify's own stored data:

1. **Groups are optional.** "A tag doesn't need a group. Ungrouped tags have group = null …
   Codebook storage must allow group = null. Migrate existing codebooks so they keep
   working."
2. **The tag script box** (`Exposure(heat index, temperature), age`) moves a tag that is
   already in the codebook into the newly named group, instead of adding it twice.
3. **Drag-and-drop regrouping** (Feature 006c): dragging a tag column into another group's
   span, or below another tag, changes which group it belongs to; dragging it up into the
   super-header row ungroups it. "Every drag change updates the codebook."

Today (schema version 1, F004 spec "Data model") every tag sits inside a group:

```json
{ "schemaVersion": 1, "revision": 7, "nextId": 5,
  "codebooks": [ { "id": "c1", "name": "Codebook",
    "groups": [ { "id": "g2", "name": "Exposure", "tags": ["Heat index", "Temperature"] },
                { "id": "g3", "name": "Outcome",  "tags": ["Hospitalization"] } ] } ] }
```

There is no place for a tag without a group. ADR-0012 §4 says a shape change bumps
`schemaVersion` and adds a pure migration step with a unit test. Agents may not edit an
Accepted ADR (ADR-0001), so this new ADR records the change.

Other facts that shape the decision:
- `layout.json` (ADR-0014, version 2) stores the user's column order **by group ID**
  (`groupOrder`, `tagOrder`). Group IDs must survive the migration so saved orders keep
  working.
- The F005b reader section ("Tabellify tags" beside a PDF) and the per-paper table read the
  codebook through one adapter, `TabellifyTagMonitor.codebookGroups()`
  (`src/content/tag-monitor-model.js`). Code outside the model mostly sees groups as
  `{ id, name, tags }`.
- Zotero's own rule for "same tag" (checked in source, `docs/zotero-api-notes.md`, F006a
  rows): a tag name is trimmed and Unicode-normalized (`.trim().normalize()`, NFC) and then
  compared **exactly** (case-sensitive). `Heat` and `heat` are two tags.

### Background for a JavaScript learner
- **Schema version**: a number at the top of a data file that says which "shape" the file
  has. Code that reads the file checks it first and converts old shapes to the current one
  (a **migration**). Here the migration is a pure function: data in, new data out, no disk.
- **`null`**: JavaScript's (and JSON's) value for "deliberately nothing". `group: null`
  means "this tag has no group". It is different from a missing property (`undefined`),
  which JSON cannot even store.
- **View vs storage**: the table shows ungrouped tags under one blank super-header. That
  block is a **view**, made up when the data is shown. It is not stored as a group.

## Decision

**Bump `codebooks.json` to schema version 2. Groups become a plain list of `{ id, name }`;
tags become an ordered list of records `{ name, group }`, where `group` is a group ID or
`null`. Version 1 files are migrated in memory on load and rewritten as version 2 only by
the next user edit.**

### 1. Shape (schemaVersion 2)
```json
{
  "schemaVersion": 2,
  "revision": 8,
  "nextId": 6,
  "codebooks": [
    {
      "id": "c1",
      "name": "Codebook",
      "groups": [
        { "id": "g2", "name": "Exposure" },
        { "id": "g3", "name": "Outcome" },
        { "id": "g5", "name": "Planned" }
      ],
      "tags": [
        { "name": "Heat index",      "group": "g2" },
        { "name": "Temperature",     "group": "g2" },
        { "name": "Hospitalization", "group": "g3" },
        { "name": "age",             "group": null }
      ]
    }
  ]
}
```
- `groups`: ordered; the order is the codebook order of the super-headers. A group may have
  no tags (`g5` above): it keeps its name and pill but has no table column (as today).
- `tags`: ordered; a group's tags are the tags whose `group` is that group's ID, **in the
  order they appear in this list**. Ungrouped tags are those with `group: null`, in list
  order.
- `revision`, `nextId`, IDs (`c1`, `g2`, …) keep their ADR-0012 / F004 meaning. Tags have no
  ID: the name is the identity (it is unique and it is what Zotero matches).
- Room to grow: a tag record can later get optional fields (a description, a column type for
  F009) without another shape change to the list itself (each would still need a version
  bump and a migration per ADR-0012 §4).

### 2. Rules (pure validation, `TabellifyCodebook.validate`, unit-tested)
- Version 2: `groups` is an array of `{ id: "g<number>", name }`; `tags` is an array of
  `{ name: string, group: string | null }` and nothing else is required.
- Group names: trimmed, not empty, unique **ignoring case** (as v1).
- Tag names: trimmed, not empty, unique in the codebook (exact comparison, as v1).
- `group` is `null` or the ID of a group in the **same** codebook. A tag pointing at a
  missing group makes the file invalid (ADR-0012 §3: message, editing off, never
  overwritten).
- **New input** (script box, later autocomplete) is cleaned the way Zotero cleans tag names:
  `String(name).trim().normalize()` (NFC). Validation does **not** require NFC, so existing
  v1 names that are not NFC still load; they are not rewritten by the migration (rewriting
  could merge two names into one).
- A group name may equal a tag name (`Heat index` can be a group and a tag): they live in
  different lists. Feature 006c needs this (see §7).

### 3. Migration 1 → 2 (pure `TabellifyCodebook.migrate`)
For each codebook, for each v1 group in order: add `{ id, name }` to `groups`; then for each
of its tags in order add `{ name: tag, group: id }` to `tags`. `schemaVersion` becomes 2;
`revision`, `nextId`, every ID and every order stay the same. After migration there are no
ungrouped tags (v1 could not have any), and the table, the pills and `layout.json` show
exactly what they showed before.

When it happens:
- **On load**, in memory only (`TabellifyCodebookStore.load` → `validate` → `migrate`, as
  today). Loading never writes (ADR-0012 §3).
- **The file is rewritten as version 2 only by the next save after a user edit**. The atomic
  write keeps the version 1 file as `codebooks.json.bak` (ADR-0012 §2).
- **One-time copy (recommended, spec Q10):** because `.bak` is replaced by every later save,
  the first save that turns a version 1 file into version 2 also writes the version 1 data
  (as `saveData` re-reads it from disk for its revision check) to `codebooks.v1.json` next to
  it, with `IOUtils.writeJSON(path, data, { mode:
  "create" })` (`mode: "create"` refuses to overwrite an existing file; verified in
  `IOUtils.webidl`, see API notes). It is written by `codebook-store.js`, which the write
  guard already allows; no new allow-list entry. If that copy fails, the save still goes
  ahead (the `.bak` exists) and the failure is logged.
- `saveData`'s "has the file changed on disk?" check already accepts an older valid version
  on disk (it validates, then compares `revision`), so a version 1 file on disk with the
  loaded revision is correctly overwritten by the version 2 save.

### 4. Downgrade
An older Tabellify (F005d or earlier) that opens a version 2 file reports "made by a newer
version of Tabellify", turns editing off and never overwrites the file (ADR-0012 §3,
`tabellify-codebook-newer`). The reader section of that older build shows its "could not
read the codebook" message. To go back, the owner copies `codebooks.v1.json` (or
`codebooks.json.bak`, if only one save happened) over `codebooks.json`.

### 5. The "Ungrouped" block (view only)
- The adapter `TabellifyTagMonitor.codebookGroups(data)` returns the groups as today
  (`{ id, name, tags }`, codebook order) and, **when there is at least one ungrouped tag**, one
  extra entry first: `{ id: "ungrouped", name: "", tags: [...], ungrouped: true }`.
- `"ungrouped"` is a **reserved view ID**. It can never collide with a stored group ID,
  because stored IDs must match `g<number>`. It is never written to `codebooks.json`.
- The table renders that entry's super-header as a blank cell spanning its tags (never the
  text "null"); the pills show "Ungrouped · N". The super-header row is hidden when the
  ungrouped block is the only block with columns.

### 6. `layout.json` (ADR-0014 version 2): no schema bump
- `groupOrder` and `tagOrder` keep keying by group ID. Group IDs survive the migration (§3),
  so every saved order still applies.
- The ungrouped block uses the reserved ID `"ungrouped"` in `groupOrder` and as a `tagOrder`
  key. Version 2 validation already accepts any non-empty string there
  (`TabellifyTableLayout.cleanKeys`), and older builds ignore IDs they do not know
  (`orderedGroups`), so **no `layout.json` version bump** is needed.
- Default position of the ungrouped block: **first** (left of the groups; spec Q8). It moves
  like any group (its blank header has a grip).
- A tag that changes group (script box, or a drag in 006c) disappears from its old group's
  saved `tagOrder` view (that entry is ignored, as for any tag a group no longer has) and is
  appended at the end of its new group. No layout rewrite is needed for this to be correct.
- "Reset columns" clears `groupOrder` / `tagOrder` only. It **does not** undo grouping
  (owner: "Reset columns restores the default column order. It does not undo grouping
  changes"), because grouping lives in the codebook.

### 7. Regrouping by drag writes the codebook (Feature 006c only)
ADR-0014's amendment says "Moving a column never changes `codebooks.json`". That stays true
for **reordering** (sideways moves inside a group or of whole groups, saved in
`layout.json`). From Feature 006c, moves that **change a tag's group** are codebook edits:
- sideways drop of a tag inside another group's span → the tag joins that group;
- drop below an ungrouped tag B → a group named B is created (or the existing group of that
  name, compared ignoring case, is used) holding B and then the dropped tag;
- drop below a tag that is in a group, or below a group's columns → the tag joins that group;
- drag up into the super-header row → the tag becomes ungrouped.
Each such drop is one call to a pure model function (`TabellifyCodebook.setTagGroup`,
`groupUnderTag`) followed by the normal codebook save (revision check, atomic write,
`.bak`). It is the same path as a script-box edit, so the pills, the script box and the
table always show the same codebook. Reordering stays in `layout.json`.

### 8. The reader section
The F005b section lists ungrouped tags first **without a heading** (mirroring the blank
super-header), then each group with its name, as today (spec Q11).

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Groups list + tag records with `group: id \| null` (recommended)** | Matches the owner's words ("group = null") literally. One list holds every tag, so "a tag appears once" is one check and "move to another group" is changing one field. Room for per-tag fields later (F009 column types, coding notes). Group IDs unchanged, so `layout.json` keeps working | Every reader of `group.tags` must change; mitigated by the one adapter `codebookGroups()` (the table and reader already use it). Tag order inside a group is "filtered list order", a small idea to learn |
| B. Keep v1 groups and add `codebooks[0].ungrouped: string[]` | Smallest diff: `group.tags` stays; migration only adds an empty list | Two places a tag can live: moves must remove from one list and add to another, and uniqueness spans two shapes. No room for per-tag data. "group = null" exists only as an idea, not in the file |
| C. A stored pseudo-group (e.g. `{ id: "g1", name: "Ungrouped" }` or `name: ""`) | No new concepts in the file | A group that is not a group: rename/delete need special cases; a user group named "Ungrouped" would clash; `name: ""` fails today's validation; an older build would show it as a real group with a blank or misleading header |
| D. Keep v1; ungrouped tags only in `layout.json` | No codebook change | Mixes concerns (ADR-0014 keeps the codebook as the source of which tags exist). A damaged layout file would lose tags |
| E. No migration: support v1 and v2 side by side forever | No file rewrite | Every function needs two code paths; against ADR-0012 §4 |

## Consequences
- **Easier:** ungrouped tags, moving a tag between groups and (in 006c) drag regrouping are
  single-field changes with one uniqueness rule. The data is ready for per-tag metadata.
- **Harder:** `codebook-model.js` is largely rewritten (validation, migration, edits);
  `tag-monitor-model.js` (`codebookGroups`), the table header code, the pills and the reader
  section adapt to the ungrouped block. Every edit function gets new unit tests; the v1
  fixtures stay as migration tests.
- **Riskier:** a migration touches the owner's only codebook. Mitigated by: pure, tested
  migration; no write on load; atomic write with `.bak`; the one-time `codebooks.v1.json`
  copy; a "newer version" refusal in old builds that never overwrites. Rolling back the
  plugin needs a manual file copy (§4).
- **Follow-up:**
  - Feature 006a: implement §1–§6 and §8 (spec tasks T1–T4).
  - Feature 006c: implement §7 after this ADR is accepted.
  - Docs pass (ADR-0010, end of prototype mode): wiki "Codebooks" and "Data Safety and
    Privacy" describe version 2, `codebooks.v1.json`, and how to roll back.
  - Security audit (ADR-0011): the new fields are untrusted input; validation covers
    `group` references and types; names stay `textContent`-only.
- **Revisit when:** several codebooks or group libraries arrive (IDs per codebook are already
  in place); tags need IDs (for renames that keep table history), which would be a version 3.

## Open questions for the owner
1. Accept shape A (tag records with `group: id | null`)? *Recommended: yes.*
2. One-time `codebooks.v1.json` copy at the first version 2 save? *Recommended: yes* (spec
   Q10).
3. Default position of the ungrouped block: first (left of the groups)? *Recommended: first*
   (spec Q8).
4. Accept §7 now (so Feature 006c can start after 006b without another ADR round)?
   *Recommended: yes; it changes only what a regrouping drop does, not storage.*
