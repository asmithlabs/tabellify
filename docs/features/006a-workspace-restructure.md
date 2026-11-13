# Feature 006a: Workspace restructure, tag script box and optional groups

- **Status:** Approved (owner, 2026-11-13, all recommendations Q1–Q14)
- **Branch:** `feat/006a-workspace-restructure` (start **after F005d merges**; it rewrites
  the F005d monitor styles)
- **Related ADRs:** **0016 (Proposed: codebook schema 2, optional groups; this spec depends
  on it)**, 0012 (data storage, Accepted), 0014 (layout storage, Accepted; 0016 §6 adds a
  reserved ID without a version bump), 0015 (design system, Accepted), 0009 (workspace
  tab), 0011 (security), 0003 (no bundler). PRD §3, §5 (F006–F009), §6 (library safety).
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs, "How to verify" below) with Debug
  Output captured to `build/debug-N.txt`.
- **This file also holds** the phase plan for the whole request ("Phases") and short
  outlines of the later phases (006b, 006c, 008, 007a/007b) and of the ADRs they need.

## Owner's request (2026-11-13, summary)
Restructure the Tabellify workspace, top to bottom: header "Tabellify Codebook"; the
collection selector; a **tag script box** that defines tags and groups
(`Exposure(heat index, temperature), age, Outcomes(hospitalization)`) and autocompletes from
all library tags (with a codebook-only "Create tag"); **group pills** ("Outcomes · 3",
"Ungrouped · N"); "Reset columns"; the table; "View table" and "Export CSV". Remove the
per-group summary cards and their Remaining/Used chip lists. Groups become optional
(ungrouped tags under one blank super-header; no super-header row when there are no groups);
existing codebooks are migrated. Drag-and-drop gains vertical nesting/ungrouping. Keep the
k/M column, row drag handles, Refresh and "Also count tags on the paper itself" (next to the
collection selector). The full text is in the orchestrator's task record; every point is
mapped to a phase below.

## Phases (each = one PR + one owner smoke test)

The request crosses three roadmap features (F006 table builder, F007 save tables, F008 CSV
export), changes the codebook storage format and adds a new kind of file write (CSV). It is
split so each step is small, testable on its own, and leaves Tabellify working.

| Phase | Feature | What ships | Roadmap | ADR | Needs owner approval of |
|---|---|---|---|---|---|
| **A** | **006a (this spec)** | New layout order; header "Tabellify Codebook"; Refresh + checkbox next to the collection selector; tag script box **parser and commit** (no autocomplete); group pills; optional groups (`group = null`), blank super-header, hidden super-header row; codebook migration v1 → v2; removal of group cards and chip lists; reader section shows ungrouped tags | F006 part 1 (F004/F005 UI rework) | **ADR-0016** (new) | This spec, ADR-0016, Q1–Q14 |
| B | 006b | Autocomplete from all My Library tags (item + annotation tags), group-name suggestions before `(`, keyboard list, `Create tag "xyz"` (codebook-only) | F006 part 2 | none | 006b spec |
| C | 006c | Drag regrouping: sideways into another group's span; drop below a tag to nest (create/join group); drag up into the super-header row to ungroup | F006 part 3 (pulls part of F009 forward) | ADR-0016 §7 | 006c spec; ADR-0016 §7 |
| D | 008 | "Export CSV" button: file picker, two header rows, one row per paper | F008 | **ADR-0017** (outline below) | 008 spec, ADR-0017 |
| E | 007a | "View table" button: table in a modal with Name + Description fields (not saved; Name becomes the CSV file name) | F007 part 1 | none if the modal is inside the workspace document (see outline) | 007a spec |
| (E2) | 007b | Save / list / delete tables (`tables.json`) | F007 part 2 | ADR-0018 (outline below) | 007b spec, ADR-0018 |
| later | 006d | The PRD's original F006 addition: highlight text in cells + per-table "Cell content" (PRD Q1) | F006 part 4 | — | — |

**Why this order.** A is the only phase that changes stored data, so it goes first and alone.
B and C only add interaction on top of A's model. D (CSV) is independent of B/C and could
move earlier if the owner needs export sooner (it depends only on A's ungrouped header).
E needs D (the modal's main action is "Export CSV" with the typed name).

**Roadmap note.** `docs/product-requirements.md` §5 gets a one-paragraph note pointing here
(added with this draft, marked "pending owner approval"). The table itself is not rewritten
until the owner approves the split (Q12).

## Conflicts with earlier decisions (owner please confirm)

1. **F005d summary cards and the "Remaining r" card are removed** (F005d is built on
   `feat/005d-design-system`, not merged). The request's layout list has no place for
   "Tags used k/M", "Papers n", "Remaining r" or "All codebook tags are used". These answer
   PRD §3 step 3 ("be informed when all curated tags have been used"). This spec assumes
   **Q2's recommendation**: keep one plain line "Tags used k/M · Papers n" (plus "All
   codebook tags are used." when true) in the collection row, no cards. If the owner says
   "remove fully", AC1 drops that line.
2. **F005 per-group "n/m" and the Remaining/Used chip lists are removed**, including the
   per-tag paper counts ("Heat index · 3 papers"). What is lost in the workspace: a
   collection-wide list of **which codebook tags no paper has yet**, and **how many papers
   use each tag**. What remains: the per-paper ✓ columns (an all-empty column = a tag no
   paper has; sorting by a tag column puts ✓ papers first), k/M per paper, and the reader
   section's per-paper checklist. "Which tags are remaining" now lives only **per paper**
   in the reader section (and implicitly in the table). A later phase could add a small
   footer row with each column's paper count if this is missed.
3. **F004 codebook section** (Add group, per-group Add tag, "Pick from library", Rename,
   Delete, remove ×) is replaced by the script box. Adding is covered; **rename group,
   delete group and remove tag have no place in the request's layout**. Q1 recommends a
   collapsed "Edit groups and tags" disclosure after the pills. "Pick from library" is gone
   in 006a and returns as autocomplete in 006b (a one-phase gap: in 006a tags are typed).
4. **F004 owner decision 6 ("every tag sits under a super-tag") is reversed** by ADR-0016.
5. **F005c decision 3 ("a tag column moves only within its super-tag group") and ADR-0014's
   amendment ("moving a column never changes codebooks.json")** are reversed for
   regrouping moves in 006c (ADR-0016 §7). 006a keeps today's drag behaviour.
6. **"Create tag" stays codebook-only** (006b). Tabellify never writes tags to Zotero items
   (CLAUDE.md rule 8, PRD §6). The created tag only appears in Zotero once the owner tags a
   highlight with that name in Zotero's own UI.
7. **Header text "Tabellify Codebook"** replaces "Tabellify Workspace" although the page also
   shows the table. Q9 recommends changing only the page heading; the tab title stays
   "Tabellify".
8. **Vertical drag: B stays as a sub-column of itself** (006c). Decision and reasons in the
   006c outline; the owner asked us to state the choice.

## Problem / objective
Defining a codebook today takes many clicks (create a group, then add tags one by one, per
group), every tag must sit in a group, and the workspace stacks three sections (codebook,
tag monitor with per-group cards, table). The owner wants one compact page that reads top to
bottom like the table it builds: choose a collection, type the tags and groups in one line,
see the groups as pills, and work in the table. 006a delivers that layout, the one-line
**tag script** (without autocomplete) and **optional groups**, and migrates existing
codebooks. Nothing is written to the library.

## Scope
**In scope (006a):**
1. Layout, top to bottom (inside `#tabellify-workspace-main`):
   1. `h1` "Tabellify Codebook".
   2. Collection row: label + collection dropdown, **Refresh** button, **"Also count tags on
      the paper itself"** checkbox (both moved here from the monitor header), and (Q2) the
      one-line summary. Below it the monitor message line ("Choose a collection…", "The
      codebook has no tags yet…", "…unavailable…") and the highlight-read warning.
   3. Tag script box: visible label, one text input, help line, inline error line, and the
      codebook status line (saved / could not load / newer / could not save / conflict;
      the existing `#tabellify-codebook-status`, moved here).
   4. Group pills.
   5. (Q1) "Edit groups and tags" disclosure, closed by default.
   6. Table toolbar: **Reset columns** (plus "Manual order" / "Clear manual order" when a
      manual order exists, as today) and the layout status line.
   7. Status messages (no collections / loading / no items / load error) and the table.
   8. *(Action buttons "View table" and "Export CSV" arrive with their phases, Q13.)*
2. Removal: the "Tag monitor" heading and section wrapper, per-group monitor cards
   (`#tabellify-monitor-groups`, "Exposure 1/2"), their Remaining/Used chip lists, the
   F005d summary cards styling, the "Remaining r" span, the F004 "Codebook" heading/intro,
   "Add group" row, per-group "Add tag" rows and "Pick from library" selects, and the related
   JavaScript, CSS and Fluent strings. The states gallery (`docs/design-system-states.html`)
   and `docs/design-system.md` drop the removed samples.
3. Tag script box: parser (pure), commit on Enter, inline errors, move-instead-of-duplicate.
4. Optional groups: codebook schema 2 and migration (ADR-0016), ungrouped block in the
   table (blank super-header keeping its span; never the text "null"), super-header row
   hidden when no group has columns, "Ungrouped · N" pill, reader section support.
5. Tests listed in the ACs.

**Out of scope (later phases or not planned):**
- Autocomplete and "Create tag" (006b). In 006a every typed tag goes into the codebook as
  typed (it is codebook-only either way).
- Any drag that changes a tag's group (006c). 006a's drags behave as today; the ungrouped
  block counts as one more group for sideways moves.
- "View table" modal (007a), CSV export (008), saved tables (007b), highlight text in cells
  (006d), clickable pills, group colours, renaming a group from the script box.
- Any library write.

## User stories
- As a researcher, I type `Exposure(Heat index, Temperature), age` and press Enter, and the
  codebook, the pills and the table columns update at once.
- As a researcher, I can keep a tag like `age` outside any group; it shows under a blank
  super-header.
- As a researcher, if I type a tag that is already in another group, it moves instead of
  appearing twice.
- As a researcher, a typo like `Exposure(Heat index` tells me what is wrong right under the
  box, and nothing is saved.
- As a researcher, my existing codebook and column order still work after the update.
- As a researcher, I trust that none of this changes my Zotero library.

## Design

### Background for a JavaScript learner
- **Parser**: a function that reads text and turns it into structured data (here: a list of
  groups and tags), or reports the first mistake with its position. Ours is pure (no DOM,
  no Zotero), so Node tests can feed it hundreds of inputs.
- **`String.prototype.normalize()`**: Unicode allows some letters (like "é") to be stored in
  two ways. `normalize()` picks one (NFC). Zotero normalizes tag names this way before
  comparing them, so Tabellify does too, or a typed "é" might not match the library's "é".
- **`<details>` / `<summary>`**: built-in HTML for a section that opens and closes when its
  summary line is clicked; no JavaScript needed.

### Tag script syntax (pure `src/content/tag-script-model.js`, global `TabellifyTagScript`)
```
entry     := item ( "," item )* [ "," ]       -- one trailing comma at the very end is ignored (Q7)
item      := name                              -- one tag, ungrouped
           | name "(" [ name ( "," name )* ] ")"   -- a group and its tags; "G()" = empty group (Q5)
name      := bare | quoted
bare      := characters other than , ( ) "    -- trimmed at both ends; inner spaces kept
quoted    := '"' characters other than " '"'   -- for names with , or ( ) (Q6); spaces around it allowed
```
- Every name: `String(x).trim().normalize()` (Zotero's own cleaning; case-sensitive).
- `parse(text)` → `{ ok: true, items: [{ kind: "tag", name } | { kind: "group", name, tags:
  string[] }] }` or `{ ok: false, error: "<fluent-id>", start, end }` where `start`/`end` are
  character offsets of the problem (the box selects that range so the owner sees where).
- Errors (each a Fluent ID): unbalanced parentheses (`A(b`, `a)`), empty tag name (`a,,b`,
  `A(b,)`, `A(,b)`), empty group name (`(a, b)`), nested group (`A(B(c))`), missing comma
  (`A(b) c`, `"a" b`), unclosed quote, the same tag twice in one entry (`A(x), B(x)` or
  `x, x`), empty entry (only spaces and commas: nothing to add, the box just stays as is).
- The same group named twice in one entry (`A(x), a(y)`) merges (group names compare
  ignoring case, as in the codebook).

### Applying an entry (pure, `TabellifyCodebook.applyScript(data, items)`)
All or nothing: one new data object, or a refusal with a Fluent ID. For each item in order:
- **group item**: use the codebook group with that name (ignoring case; its stored spelling
  wins) or create it (new ID from `nextId`, appended to `groups`). For each tag: not in the
  codebook → add `{ name, group }` at the end of `tags`; in the codebook under another group
  (or ungrouped) → **move** it (set `group`, move the record to the end of `tags`, so it is
  last in its new group); already in this group → unchanged.
- **tag item**: not in the codebook → add `{ name, group: null }`; in a group → **move to
  ungrouped** (Q3: the owner's "move it to the newly specified group" applied consistently;
  this is also the keyboard way to ungroup); already ungrouped → unchanged.
- Returns `{ ok: true, data, report: { added, moved, unchanged, groupsCreated } }`. If
  nothing changed, the workspace does not save and shows "These tags are already in the
  codebook." Otherwise it saves through the existing `applyCodebookEdit` path (revision
  check, atomic write, `.bak`) and shows "Codebook saved." plus, if `moved > 0`, "Some tags
  were moved to another group."

### Script box behaviour (`workspace.js`)
- Enter commits the whole entry (006a has no suggestion list, so Enter always commits).
  Success: the input is cleared and keeps focus. Failure: the text stays, the error line
  shows the message, `aria-invalid="true"` is set on the input, and the problem range is
  selected with `input.setSelectionRange(start, end)`. Editing the text hides the error.
- The input sits in the codebook `<fieldset>`, so it is disabled while saving and when the
  codebook could not be loaded (ADR-0012 §3), as the F004 controls are today.
- Error and help lines are linked with `aria-describedby`; the error line has `role="alert"`.

### Codebook model v2 (`codebook-model.js`, ADR-0016)
`SCHEMA_VERSION: 2`; `UNGROUPED_ID: "ungrouped"` (view only). New or changed pure functions,
all returning new data: `validate` (v1 and v2), `migrate` (1 → 2), `emptyData` (v2, no
groups, no tags), `groups(data)` → `[{ id, name }]`, `tagsIn(data, groupId | null)` →
`string[]`, `addGroup`, `renameGroup`, `deleteGroup` (**its tags become ungrouped**, Q4),
`removeTagFromCodebook(data, tag)`, `setTagGroup(data, tag, groupId | null)` (used by
`applyScript` and later by 006c), `applyScript(data, items)`, `availableTags` (kept for
006b). `addTagToGroup` / `removeTagFromGroup` are replaced (names still avoid the write
guard's `addTag` / `removeTag` pattern).

### One-time version 1 copy (`codebook-store.js`, Q10)
`saveData` already re-reads the file on disk for its revision check. When that file is
valid **version 1**, it first writes exactly that data to `codebooks.v1.json` with
`{ mode: "create" }` (never overwrites; a failure is logged and the save continues), then
saves version 2 as usual. `load` additionally reports `fromVersion` for the Debug Output
line. Same `fs` injection, so it is tested with the fake file system.

### Ungrouped block in the table (`tag-monitor-model.js`, `workspace.js`)
- `TabellifyTagMonitor.codebookGroups(data)` reads schema 2 and returns, when there are
  ungrouped tags, `{ id: "ungrouped", name: "", tags, ungrouped: true }` **first**, then the
  groups in codebook order. `summarize` and `paperChecklist` work unchanged on that list, so
  k/M, ✓ cells and sorting include ungrouped tags.
- `TabellifyTableLayout.orderedGroups` needs no change: `"ungrouped"` is just another ID
  (ADR-0016 §6).
- Header: the ungrouped block's super-header cell is **empty** (`textContent` stays ""),
  keeps `colSpan` = its tag count, has class `tabellify-col-group-ungrouped`,
  `aria-label` "Ungrouped tags" (Fluent), no `title`, and a grip labelled
  "Move group: Ungrouped tags" (moves the whole block, as for groups).
- **No groups with columns** (only ungrouped tags): the header is **one row**: grip, Title,
  the tag headers, k/M. The super-header row is not shown (developer's choice how: e.g. put
  the tag `th` cells into the first row and hide the second; ACs test the result).
- Pills: `<html:ul id="tabellify-group-pills">` (with an `aria-label` "Groups"), one
  `<li class="tabellify-pill">` per block, **in the table's current block order**, then
  groups without tags (they have no column) in codebook order. Each pill: a name span and a
  count span (the "·" separator is drawn by CSS, decorative); `aria-label` "<name>: <n>
  tags" built from Fluent text + plain-text name and number. The ungrouped pill reads
  "Ungrouped · N" and is **hidden when N = 0** (Q14). Pills are not interactive in 006a.
  All text via `textContent` / attributes.

### "Edit groups and tags" disclosure (Q1)
`<html:details id="tabellify-codebook-editor">` (closed by default) with
`<html:summary data-l10n-id="tabellify-codebook-edit">`. Inside: the existing F004 group
boxes, reduced to: group name, Rename (inline, as today), Delete (no confirmation: tags
become ungrouped, Q4), and each tag with its × remove button; plus an "Ungrouped" box
listing ungrouped tags with ×. No add rows, no "Pick from library". Same event delegation
on `#tabellify-codebook` as today.

### Reader section (`src/reader-tags.js`, ADR-0016 §8)
`checklistNodes` skips the heading for the entry with `ungrouped: true`; its tags are listed
first. Counting is unchanged (it already uses `paperChecklist`).

### Files
| File | Change |
|---|---|
| `src/content/tag-script-model.js` | **New.** `TabellifyTagScript.parse` (pure) |
| `src/content/codebook-model.js` | Schema 2, migration, new edits (above) |
| `src/content/codebook-store.js` | One-time `codebooks.v1.json` copy; `load` reports the file's version |
| `src/content/tag-monitor-model.js` | `codebookGroups` reads schema 2 and adds the ungrouped block |
| `src/reader-tags.js` | No heading for the ungrouped block |
| `src/content/workspace.xhtml` | New order; script box, pills, editor disclosure; monitor section removed; script order: `tag-script-model.js` after `codebook-store.js`, before `tag-monitor-model.js` |
| `src/content/workspace.js` | Script box, pills, editor, header with ungrouped/one-row cases; monitor cards and chip code removed; Refresh/checkbox listeners unchanged (elements move) |
| `src/content/workspace.css` | Styles for script box, error line, pills, disclosure, blank super-header, one-row header; monitor card/chip styles removed (keep `.tabellify-monitor-count`, used by the k/M cell). Tokens only (ADR-0015) |
| `src/locale/en-US/tabellify.ftl` | New/changed/removed IDs (below) |
| tests | See Test plan |
| `docs/design-system-states.html`, `docs/design-system.md` | Remove the monitor-card and chip samples; add a pill and an inline-error sample |

Element IDs that stay (to limit churn): `tabellify-collection-select`, `tabellify-monitor-refresh`,
`tabellify-monitor-count-item-tags`, `tabellify-monitor-message`, `tabellify-monitor-warning`,
`tabellify-monitor-summary` / `-used` / `-all-used` / `-papers` (Q2), `tabellify-codebook`,
`tabellify-codebook-status*`, `tabellify-codebook-controls`, every table and toolbar ID.

### Fluent IDs (no arguments; numbers and names are appended in JS as plain text, as today)
Proposed text, owner may change:
- Changed: `tabellify-workspace-title` = Tabellify Codebook.
- New: `tabellify-script-label` = Tags and groups; `tabellify-script-placeholder` =
  Exposure(heat index, temperature), age; `tabellify-script-help` = Type a tag, several tags
  separated by commas, or Group(tag, tag), then press Enter. Your Zotero tags are never
  changed.; `tabellify-script-error-unbalanced` = Check the brackets: every "(" needs a
  matching ")".; `-error-empty-tag` = A tag name is missing. Remove the extra comma or type a
  name.; `-error-empty-group` = Type a group name before "(".; `-error-nested` = A group
  cannot contain another group.; `-error-missing-comma` = Separate the entries with a
  comma.; `-error-unclosed-quote` = A quotation mark (") is not closed.; `-error-duplicate`
  = The same tag appears twice in this entry.; `tabellify-script-nothing-new` = These tags
  are already in the codebook.; `tabellify-script-moved` = Some tags were moved to another
  group.; `tabellify-pills-label` = Groups; `tabellify-pill-ungrouped` = Ungrouped;
  `tabellify-pill-tags` = tags; `tabellify-table-ungrouped-header` = Ungrouped tags;
  `tabellify-codebook-edit` = Edit groups and tags; `tabellify-codebook-ungrouped` =
  Ungrouped.
- Removed (developer confirms with a grep): `tabellify-workspace-description` (Q9),
  `tabellify-codebook-heading`, `-intro`, `-group-placeholder`, `-add-group`, `-empty`,
  `-tag-placeholder`, `-add-tag`, `-pick-placeholder`, `-delete-confirm`, `-no-tags`,
  `-error-tag-missing` (if unused), `tabellify-monitor-heading`, `-used`, `-remaining`,
  `-none`, `-paper-one`, `-paper-other`, `-remaining-count` (Q2).

### Lifecycle
New listeners only in the workspace document: `keydown` and `input` on the script input
(delegated on `#tabellify-codebook` where possible), removed in `onUnload`. Refresh and the
checkbox keep their listeners (the elements only move). No new observer, timer, pref or
file besides `codebooks.v1.json`. Nothing in `bootstrap.js` or `tabellify.js`.

### Does this need an ADR?
Yes: the codebook storage format changes (CLAUDE.md rule 7) → **ADR-0016 (Proposed)**. The
layout restructure itself is inside the existing workspace document (no new surface).

## Zotero / Mozilla APIs used
**No new `Zotero.*` call in 006a.** Details in `docs/zotero-api-notes.md`, "Feature 006a–008
rows".

| API / mechanism | Status |
|---|---|
| Zotero tag identity: `.trim().normalize()`, then exact (case-sensitive) match; `tags.name UNIQUE` without `COLLATE` | Verified (source, 10.0.9): `tags.js` `cleanData`, `getID`; `resource/schema/userdata.sql` |
| `String.prototype.normalize()` | Verified (docs, MDN; standard ECMAScript, also in Node) |
| `HTMLInputElement.setSelectionRange`, `aria-invalid`, `aria-describedby`, `role="alert"` | Verified (docs, MDN / WAI-ARIA); standard |
| HTML `<details>` / `<summary>` in our XUL document (`html:` namespace) | Verified (docs, MDN); **runtime = AC5** |
| `IOUtils.writeJSON(path, value, { mode: "create" })` (one-time copy) | Verified (source, ESR 140 `IOUtils.webidl`: `WriteMode` "create" refuses to overwrite) |
| Already used, unchanged: `Zotero.Tags.getAll` (kept for 006b), `IOUtils.readJSON`/`writeJSON`/`makeDirectory`, `PathUtils.join`, `Zotero.DataDirectory.dir` (Internal), Notifier, prefs | Existing rows |

## Data safety
- **Read from the library:** nothing new (the same collections, items, highlights and tags
  as F005/F005c; `Zotero.Tags.getAll` as F004).
- **Written to the library:** **nothing.** No item, tag, annotation, collection or database
  change. A tag typed into the script box exists only in `codebooks.json`. Write guard: no
  new allow-list entry; the static test still forbids Zotero tag/item write APIs in `src/`.
- **Written to disk (Tabellify's own folder only, `<data dir>/tabellify/`):**
  `codebooks.json` (version 2 from the first edit after the update), `.tmp`/`.bak` as before,
  **`codebooks.v1.json`** once (Q10, never overwritten), `layout.json` as before. Nothing is
  written on load; a version 1 file stays version 1 until the owner edits the codebook.
- **Untrusted text:** script input, codebook names and library text are shown with
  `textContent` / attributes only (`no-html-sinks`). Tag names never go into CSS selectors
  (F005c rule). The parser never evaluates anything; it only splits text.
- **Rollback:** an older Tabellify refuses a version 2 file without overwriting it
  (ADR-0016 §4); copying `codebooks.v1.json` back restores the old codebook.
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9) with the F005 test setup
(codebook "Exposure" = `Heat index`, `Temperature`; "Outcome" = `Hospitalization`,
`Mortality`, saved by the F005d build, so the file is version 1; collection "F005 test").
`[auto]` = `npm test`.

- [ ] AC1 `[manual]` **Layout.** The Tabellify tab shows, top to bottom: the heading
  "Tabellify Codebook"; the collection dropdown with Refresh and "Also count tags on the
  paper itself" beside it (and, Q2, one line "Tags used 2/4 · Papers 3"); the tag script
  box with its help line; the pills "Exposure · 2" and "Outcome · 2"; a closed "Edit
  groups and tags" line (Q1); "Reset columns"; the table. There is no "Tag monitor"
  heading, no "Exposure 1/2" cards, no Remaining/Used chip lists, no summary cards, no "Add
  group" box and no "Pick from library" list.
- [ ] AC2 `[manual]` **Migration.** Before any edit, the table and the column order are the
  same as before the update, and `~/Zotero tabellify-dev/tabellify/codebooks.json` still
  contains `"schemaVersion": 1`. After the first script-box edit (AC3) it contains
  `"schemaVersion": 2`, a `groups` list and a `tags` list; `codebooks.json.bak` and
  `codebooks.v1.json` contain the old version 1 data.
- [ ] AC3 `[manual]` **Single tag.** Typing `age` and pressing Enter adds the pill
  "Ungrouped · 1", clears the box, shows "Codebook saved.", and the table shows an `age`
  column under a **blank** super-header cell, left of "Exposure". No cell anywhere reads
  "null".
- [ ] AC4 `[manual]` **Comma list and group.** `sex, region` → "Ungrouped · 3".
  `Humidity(rh, dew point)` → a new pill "Humidity · 2" and a "Humidity" super-header over
  two columns.
- [ ] AC5 `[manual]` **Mixed entry and move.** `Exposure(Heat index, Air quality), country,
  Outcome(age)` → "Exposure · 3" (Air quality added, Heat index not doubled), "Ungrouped ·
  3" (sex, region, country), "Outcome · 3" (age moved there), and the status line also says
  "Some tags were moved to another group." Opening "Edit groups and tags" shows the same
  grouping, and Rename, Delete and × work there. Typing `age` again moves it back to
  Ungrouped.
- [ ] AC6 `[manual]` **Errors.** Each of `Exposure(Heat index`, `a,,b`, `(a, b)`,
  `A(B(c))`, `A(b) c` shows a plain message under the box, highlights the problem in the
  box, keeps the text, saves nothing (the `revision` in `codebooks.json` does not change),
  and the message disappears when the owner edits the text. `Heat index, heat index`
  (different case) is accepted as two different tags (Zotero's rule).
- [ ] AC7 `[manual]` **Columns and reset.** Dragging the blank super-header's grip moves the
  whole ungrouped block; dragging an ungrouped tag's grip moves it inside the block; a tag
  still cannot be dropped into another group (006c). "Reset columns" puts the block back
  first and the groups in codebook order, and **does not** change any pill or grouping.
  After closing and reopening the tab the order is kept.
- [ ] AC8 `[manual]` **No groups → one header row.** In "Edit groups and tags", the owner
  deletes every group: their tags become ungrouped (pill "Ungrouped · N" only), and the
  table header is a single row (no blank super-header row). (Afterwards, restore the test
  codebook by typing `Exposure(Heat index, Temperature), Outcome(Hospitalization,
  Mortality)`.)
- [ ] AC9 `[manual]` **Kept features.** Sorting by Title, k/M and a tag column, row drag and
  Alt+arrows, "Manual order", Refresh and the "Also count tags on the paper itself"
  checkbox work as before; k/M counts ungrouped tags (e.g. 1/5 after adding `age` to a
  paper's highlight).
- [ ] AC10 `[manual]` **Reader section.** Opening a "F005 test" PDF shows the "Tabellify
  tags" section with the ungrouped tags listed first without a heading, then each group
  with its name; the "k / M" in its header matches the table's k/M.
- [ ] AC11 `[manual]` **Library unchanged.** The dev Zotero tag selector shows none of
  `age`, `sex`, `region`, `country`, `Air quality`, `rh`, `dew point` (unless the owner
  added them by hand earlier). Debug Output has no Tabellify errors. Closing the tab, and
  disabling Tabellify with the tab open, produce no errors.
- [ ] AC12 `[auto]` **Parser** (`tests/unit/tag-script-model.test.mjs`): single tag; comma
  list; group; empty group `G()`; mixed; whitespace trimmed and inner spaces kept; NFC
  normalization (`"é"` → `"é"`); case kept; quoted names with `,` `(` `)`; trailing
  top-level comma ignored; every error with its Fluent ID and `start`/`end`; duplicate tag;
  group named twice merges; markup characters (`<b>`) are plain names; very long input
  (10 000 characters) parses without error.
- [ ] AC13 `[auto]` **Codebook model v2** (`tests/unit/codebook-model.test.mjs`): `validate`
  accepts v1 and v2 and rejects: tag `group` pointing at a missing group, non-null
  non-string `group`, duplicate tags, untrimmed names, duplicate group names ignoring case,
  `schemaVersion` 3 as "newer"; `migrate` v1 → v2 keeps IDs, `nextId`, `revision`, group
  order and tag order exactly; `applyScript` adds, moves (to the end of the new group),
  leaves unchanged, reuses a group ignoring case (keeping its spelling), creates groups with
  IDs from `nextId`, moves a grouped tag to ungrouped for a top-level mention, reports
  counts, never mutates its input; `deleteGroup` ungroups its tags; `removeTagFromCodebook`;
  `setTagGroup` (to a group, to null, unknown tag/group refused); `emptyData` is valid v2.
- [ ] AC14 `[auto]` **Store** (`tests/unit/codebook-store.test.mjs`, fake `fs`): loading v1
  returns v2 data and writes nothing; the first save over a v1 file writes
  `codebooks.v1.json` with `mode: "create"` and then `codebooks.json` (v2, `tmpPath`,
  `backupFile`); a second save does not write the copy again; a failed copy does not block
  the save; a v3 file is "newer" and never written.
- [ ] AC15 `[auto]` **Ungrouped block** (`tests/unit/tag-monitor-model.test.mjs`,
  `tests/unit/reader-tags.test.mjs`): `codebookGroups` puts the ungrouped entry first only
  when it has tags, with `name: ""` and `ungrouped: true`; `summarize`, `sortPapers` (by an
  ungrouped tag) and `paperChecklist` count ungrouped tags; the reader checklist has no
  heading for that entry and plain-text tags.
- [ ] AC16 `[auto]` **Rendering** (`tests/unit/workspace-table.test.mjs`, fake DOM): blank
  super-header with the right `colSpan`, empty text, `aria-label`, no "null" anywhere in the
  table; one header row when only ungrouped tags exist; pills in table block order, the
  ungrouped pill hidden at 0, groups without tags last with "· 0"; names with markup
  characters stay text; a saved `layout.json` order with `"ungrouped"` in `groupOrder` is
  applied; a successful script commit clears the input, a failed one keeps it and sets
  `aria-invalid` and the selection range.
- [ ] AC17 `[auto]` **Static checks:** removed Fluent IDs and element IDs are gone from
  `src/`; every new Fluent ID exists and starts with `tabellify-`; script order
  (`codebook-model.js`, `codebook-store.js`, `tag-script-model.js`, `tag-monitor-model.js`,
  `table-layout-model.js`, `layout-store.js`, `workspace.js`); `tag-script-model.js` uses
  no Zotero / DOM / IOUtils globals; the Zotero allow-list in `workspace-script.test.mjs`
  gains **no** entries; `write-guard` passes with **no** new allow-list entries;
  `no-html-sinks` passes; every `addEventListener` added has a matching
  `removeEventListener` in `onUnload`; the colour rule of ADR-0015 passes for the new CSS.

## How to verify in the dev profile (owner)
The orchestrator turns this into numbered steps with exact windows at smoke-test time.
1. **Before installing the 006a build**, in Finder open `~/Zotero tabellify-dev/tabellify/`
   and check that `codebooks.json` exists (the F005 test codebook). No other preparation:
   the build makes `codebooks.v1.json` itself on the first edit.
2. Start the dev profile with Debug Output captured (`build/debug-N.txt`), install the
   `.xpi`, open Tools → Tabellify…, choose "F005 test".
3. Run AC1–AC11 in order (the inputs to type are written in each AC). Check AC2's files in
   Finder (open `codebooks.json` with TextEdit, read only).
4. Report "yes" or "no" plus anything that looked wrong; the orchestrator reads the debug
   file.
(A screenshot cannot be produced by an agent; AC1 is the visual check.)

## Test plan
| AC | How |
|---|---|
| AC1–AC11 | Owner smoke test (manual), Debug Output in `build/debug-N.txt` |
| AC12 | `tests/unit/tag-script-model.test.mjs` (new; Node `vm` sandbox like the other model tests) |
| AC13 | `tests/unit/codebook-model.test.mjs` (rewritten for v2; v1 fixtures kept as migration inputs) |
| AC14 | `tests/unit/codebook-store.test.mjs` |
| AC15 | `tests/unit/tag-monitor-model.test.mjs`, `tests/unit/reader-tags.test.mjs` |
| AC16 | `tests/unit/workspace-table.test.mjs` |
| AC17 | `tests/static/workspace-script.test.mjs`, `write-guard`, `no-html-sinks`, `l10n-and-window`, `design-tokens`, `symmetry` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Owner approves this spec, ADR-0016 and Q1–Q14; F005d merged | owner / orchestrator | — | — |
| T1 | Codebook model v2: `validate`, `migrate`, edits, `applyScript`; store: version reporting + one-time v1 copy (AC13, AC14) | developer | T0 | `src/content/codebook-model.js`, `src/content/codebook-store.js`, `tests/unit/codebook-model.test.mjs`, `tests/unit/codebook-store.test.mjs` |
| T2 | Tag script parser (AC12) | developer | T0 (parallel with T1: no shared files) | `src/content/tag-script-model.js`, `tests/unit/tag-script-model.test.mjs` |
| T3 | Ungrouped block in `codebookGroups`; reader section heading rule (AC15) | developer | T1 | `src/content/tag-monitor-model.js`, `src/reader-tags.js`, `tests/unit/tag-monitor-model.test.mjs`, `tests/unit/reader-tags.test.mjs` |
| T4 | Workspace restructure: markup order, script box, pills, editor disclosure, header (blank / one row), removals, CSS, Fluent; static checks; gallery and design-system doc samples (AC16, AC17) | developer | T1, T2, T3 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs`, `tests/static/l10n-and-window.test.mjs`, `docs/design-system-states.html`, `docs/design-system.md` |
| T5 | `npm test`, `npm run build`; owner smoke test AC1–AC11 | developer → owner | T4 | — |

T1 and T2 can run in parallel worktrees (no overlapping files). T3 and T4 run after them, one
after the other.

## Open questions (each with the recommendation this spec assumes)
1. **Q1 Editing without the old Codebook section.** Keep rename group, delete group and
   remove tag in a collapsed "Edit groups and tags" disclosure after the pills? *Recommended:
   yes* (otherwise there is no way to remove a tag or rename a group). Alternative: clickable
   pills that open a small editor (more new code).
2. **Q2 Collection-wide summary.** Keep one plain line "Tags used k/M · Papers n" (+ "All
   codebook tags are used.") in the collection row, no cards? *Recommended: yes* (PRD §3 step
   3). Alternative: remove it as the layout list implies.
3. **Q3 Top-level mention of a grouped tag** (`age` when `age` is in Outcome): move it to
   Ungrouped? *Recommended: yes* (your rule applied consistently; also the keyboard way to
   ungroup; the status line says it moved). Alternative: leave it where it is.
4. **Q4 Delete group:** its tags become ungrouped (nothing lost, no confirmation)?
   *Recommended: yes.* Alternative: delete the tags too, with "Confirm delete" (F004).
5. **Q5 `Group()` with no tags** creates an empty group (pill "Group · 0", no column)?
   *Recommended: yes.* Alternative: error "empty group".
6. **Q6 Names with commas or brackets** (Zotero allows them): write them in double quotes,
   `"Smith, J."`? *Recommended: yes.* A name containing `"` cannot be typed (rare).
7. **Q7 Trailing comma** at the end (`a, b,`) ignored; empty names elsewhere are errors?
   *Recommended: yes.*
8. **Q8 Where the ungrouped block sits by default:** first, left of the groups?
   *Recommended: first.* It can be dragged elsewhere.
9. **Q9 Header text:** page heading "Tabellify Codebook", tab title stays "Tabellify",
   description line "Your literature tables will appear here." removed? *Recommended: yes.*
10. **Q10 One-time `codebooks.v1.json` copy** at the first version 2 save? *Recommended: yes*
    (`.bak` is replaced on every later save; this keeps one safe copy forever).
11. **Q11 Reader section:** ungrouped tags first without a heading? *Recommended: yes.*
    Alternative: a heading "Ungrouped".
12. **Q12 Phase split and numbering** (006a/006b/006c, 008, 007a/007b, 006d for highlight
    text) and the PRD roadmap note? *Recommended: approve.*
13. **Q13 "View table" and "Export CSV"** appear only when their phases ship (no disabled
    placeholders)? *Recommended: yes.*
14. **Q14 Ungrouped pill hidden when it has 0 tags?** *Recommended: yes.*

---

## Later phases (outlines, Draft; each gets its own spec when scheduled)

### 006b: Autocomplete from library tags and codebook-only "Create tag"
- **Source:** `await Zotero.Tags.getAll(Zotero.Libraries.userLibraryID)` (already used by
  F004; Verified (source) 10.0.9). Covers **item and annotation tags** (annotations are rows
  in `items`; the query joins `itemTags` to `items` by library) and tags used only on
  trashed items (no trash filter); manual and automatic tags (de-duplicate by name). My
  Library only (F004 Q7). Runtime check **RT-S1** confirms annotation tags. Reloaded on
  open, on Refresh, and (debounced) on the existing Notifier `item-tag` events.
- **Exclude** names already in the codebook (`TabellifyCodebook.availableTags`).
- **Token at the cursor** (pure `TabellifyTagScript.tokenAt(text, cursor)` →
  `{ start, end, prefix, inGroup, groupName }`): works at top level and inside parentheses.
  At top level, existing **group names** are suggested too; accepting one inserts `Name(`.
- **Matching:** case-insensitive; names starting with the typed text first, then names
  containing it; at most 50 shown. Live filtering on each `input` event.
- **Keyboard:** ↓/↑ move, Tab or Enter accept (replaces the token, keeps the rest), Esc
  closes; Enter with the list closed commits the entry (006a behaviour). WAI-ARIA combobox
  pattern (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`,
  `role="listbox"` / `option`), all standard DOM.
- **Create:** when the typed token is not exactly (case-sensitive) a library tag, the last
  option is `Create tag "xyz"` (Fluent "Create tag" + the token as plain text). Accepting it
  only keeps the token in the box; on commit it becomes a **codebook-only** tag. Nothing is
  written to Zotero; a static test keeps Zotero tag write APIs out of `src/`. Open question
  for 006b: show Create only when **no** suggestion matches (owner's words) or whenever the
  token is not an exact library name (recommended: the latter, so `heat` can be created
  even if `Heat index` exists).
- **No ADR.** Inside the existing document; no new storage or surface.

### 006c: Regroup by drag (ADR-0016 §7)
- **Sideways** (today's header drag): dropping a tag on a header **inside another group's
  span** moves it into that group at that position (codebook edit, then layout order).
- **Nest:** dragging tag A and dropping it on the **body cells below tag B's header** shows a
  "nest" outline on B's column. Drop:
  - B is **ungrouped** → a group named B is created (or the existing group of that name,
    compared ignoring case, is used), **B stays as its first sub-column**, A becomes the
    next sub-column. Pills: "B · 2".
  - B is **in a group** G (or the target is a column under super-header G) → A joins G,
    right after B.
- **Ungroup:** dragging a tag's grip **up into the super-header row** (any super-header
  cell) moves it to the ungrouped block (end).
- Every such drop is a codebook edit through `applyCodebookEdit` (revision check, atomic
  write), so the script box, pills and table stay in sync. "Reset columns" still only
  resets order.
- **Choice: B stays as a sub-column of itself.** Reasons: (1) B is a tag with data (✓ per
  paper); turning it into only a header would hide that column and silently remove a tag
  from the codebook, changing every k/M; (2) nothing is lost and the move is reversible
  (drag B or A up to ungroup); (3) it matches the data model, where group names and tag
  names are separate lists (ADR-0016 §2). Cost: the header shows "B" twice (super-header
  and first sub-header). Alternative if the owner prefers: B becomes only the header and
  the tag B is removed from the codebook, with a confirmation.
- **Keyboard equivalent:** the script box (`B(B, A)` nests; `A` alone ungroups). Optional
  later: a key such as Alt+Shift+Arrow on a grip.
- **API:** no new API (HTML drag-and-drop rows from F005c; mouse drag worked in the F005c
  smoke test, see F005c "Owner decisions 2026-11-13 #2").

### 008: CSV export (needs ADR-0017)
- "Export CSV" button under the table (in 007a also inside the modal). Exports the table as
  shown: columns Title, every tag column in the current order, k/M; rows = papers in the
  displayed order (sort or manual order).
- **Two header rows:** row 1 = super-headers (blank for the ungrouped block); row 2 = Title,
  tag names, k/M. Open question: group name only above the first column of its span (looks
  merged in Excel; recommended) or repeated above every column (easier to filter).
- **Cells:** recommended `1` for ✓ and empty otherwise (sortable/summable); alternative "✓"
  or "Yes".
- **Format:** RFC 4180, CRLF, UTF-8 with a byte-order mark (so Excel reads accents),
  fields quoted when needed; **formula-injection guard** (cells starting with `=`, `+`,
  `-`, `@`, tab or CR get a leading `'`), because titles and tag names are untrusted text
  that a spreadsheet could execute.
- **Where:** a save dialog via Zotero's `FilePicker` module
  (`ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs")`,
  `modeSave`, `defaultString` = collection or table name + `.csv`, filter `*.csv`), then
  `IOUtils.writeUTF8(path, text, { tmpPath })`. Both Verified (source/docs); the picker
  inside the tab iframe is **UNVERIFIED (runtime): RT-S2**.
- Pure CSV builder (`src/content/csv-model.js`) unit-tested; one small writer file is the
  only place allowed to write outside Tabellify's folder.

### 007a: "View table" modal (name + description, not saved)
- Opens the rendered table read-only in a modal **inside the workspace document** with Name
  and Description fields and "Export CSV" / "Close". Name becomes the CSV file name;
  Description is written nowhere in 007a (open question: add it as a first CSV line? not
  recommended, breaks CSV tools).
- Is it F007? The PRD sketch ties Name + Description to **saving** ("Save → Saved Tables
  list"). 007a shows the form so the flow is in place; **persisting** name, description and
  the table configuration is **007b** (needs storage). If the owner wants the name and
  description kept between sessions, 007a and 007b merge and ADR-0018 is needed first.
- Mechanism: HTML `<dialog>` with `showModal()` in our document (standard; **UNVERIFIED in
  a chrome XUL document inside the tab iframe**, RT-S3), fallback an in-page overlay panel
  (no new API). A separate window (`openDialog`) would be a new UI surface → ADR; not
  recommended.

### ADR-0017 outline (for 008): CSV export: where and how Tabellify writes files outside its folder
- **Why an ADR:** first write outside `<data dir>/tabellify/` (CLAUDE.md rule 7 "storage",
  ADR-0011 security), a new write-guard allow-list entry, and a native dialog.
- **Decision to make:** (a) file picker (recommended; architecture §5 already says "CSV
  written only to a user-chosen location") vs. automatic save to Downloads (PRD sketch; the
  Downloads API is UNVERIFIED and not proposed); (b) `IOUtils.writeUTF8` with `tmpPath`
  (recommended) vs. `Zotero.File.putContentsAsync` (OS.File shim, ADR-0012 option A3);
  (c) CSV dialect (RFC 4180, BOM, CRLF), formula-injection guard; (d) one writer file
  (`src/content/csv-export.js`) allow-listed for `IOUtils.writeUTF8` only, writing only to
  the path the picker returned in the same click; (e) overwrite: the picker asks the user
  ("Replace?") and returns `returnReplace`; Tabellify then overwrites.
- **Alternatives:** picker / Downloads / clipboard copy (no file at all; simplest, no write
  guard change; could be an extra button).

### ADR-0018 outline (for 007b): saved tables (`tables.json`)
- ADR-0012 already names `tables.json` and its rules; a short ADR is still recommended for
  the **shape** decision: save a **configuration** (collection key, codebook group IDs and
  tag names, column and row order, options; recomputed from the library when opened) or a
  **snapshot** (the cell values at save time, for reproducible tables; larger, stale).
  Recommendation to evaluate: configuration plus an optional snapshot taken at export.
- Relation to `layout.json` (ADR-0014 §8): saved tables carry their own orders; the live
  workspace table keeps `layout.json`.
- References to tags by name and groups by ID (ADR-0016); what happens when a tag is
  removed from the codebook after a table was saved.
