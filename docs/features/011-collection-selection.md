# Feature 011: Collection selection: several collections and a Subcollection column

- **Status:** Approved (owner, 2026-11-18, all recommendations Q1–Q15; drafted by the architect). Answers to the open questions
  (Q1–Q15) are needed before development.
- **Branch:** `feat/011-collection-selection` (from `main`). This spec was drafted on
  `docs/011-collection-selection`.
- **Related ADRs:** **0027 (Accepted: collection selections, `tables.json` schema 2, `"sel:"`
  manual-order keys)**; 0018 (Accepted: saved tables);
  0012 (Accepted: storage rules); 0014 / 0019 (Accepted: `layout.json`, manual orders); 0016
  (codebook, unchanged); 0017 (CSV export path, unchanged); 0011 (security review).
- **Specs it builds on:** 003b (grouped dropdown, all-library index, pruning per listed
  library, SEC-018 trash rule), 005c (manual paper order), 007a ("View table" modal), 007b
  (saved tables, "Show live"), 008 (CSV export).
- **Process:** prototype mode (CLAUDE.md): developer builds on the feature branch, `npm test`
  and `npm run build` pass, the owner runs one smoke test with Debug Output in
  `build/debug-N.txt`.
- **PRD:** answers open question Q6 ("Collection names as columns": both meanings).

## Owner requirement (2026-11-18)
"the collections should be selectable as well as the subcollections. for instance i had all my
phenotype papers under the main collection but when i read papers disease by disease [I] found
it easier to split into subcollections". The owner chose **both**:
1. **Pick several:** tick several collections or subcollections at once (for example 3 of 8
   disease subcollections) and build one table from them.
2. **Show subcollection:** when a main collection (or several) is chosen, show which
   subcollection (for example the disease) each paper is in, as a column and/or as row groups.

## Problem / objective
Today (0.2.0) the table is always **one** collection and **all** of its subcollections. A
researcher who splits "Phenotypes" into disease subcollections can either see everything
(and not know which disease a row belongs to) or one disease at a time. They cannot compare
3 of 8 diseases in one table, and the table never says which disease a paper is filed under.

F011 lets the user build one table from **a selection of collections** inside one library and
adds a **Subcollection** column (sortable, with optional row groups) that says where each paper
sits. Choosing one collection from the dropdown works exactly as today. Nothing is written to
the library.

## Decisions recommended in this spec (summary)
1. **Picker:** keep today's dropdown for one collection; add a **Choose several…** button that
   opens a dialog with a checkbox tree (tri-state parents). (Q1)
2. **One library per table.** (Q2)
3. **Ticking a parent ticks all its subcollections; untick a subcollection to leave it out.**
   Later subcollections of a ticked parent join automatically. (Q3)
4. **Subcollection column** shown automatically when the table covers more than one
   collection; text = the path below the chosen collection; a paper in two places lists both;
   a paper directly in the chosen parent shows the parent's name. (Q4–Q7)
5. **Sort by Subcollection** (tree order) and, while sorted that way, **group header rows**
   ("Asthma · 5 papers"). One row per paper, never duplicated. (Q8, Q9)
6. **CSV:** one extra column after Title; no group header rows in the file. (Q10)
7. **Manual order per selection** (ADR-0027 §3). (Q11)
8. **Saved tables** store the selection (`tables.json` schema 2, ADR-0027 §2). (Q12, Q13)

## Scope
**In scope:**
1. **Choose several…** button and the collection picker dialog (checkbox tree, tri-state
   parents, one library at a time, keyboard and screen-reader use).
2. A selection state in the workspace that replaces the single collection ID; the dropdown
   shows the selection while one is active.
3. Scope from include/exclude rules (ADR-0027 §1), pure and unit-tested.
4. **Subcollection** column in the per-paper table, the "View table" modal and the CSV export;
   sort by it; group header rows while sorted by it.
5. Manual order for a selection (`"sel:"` keys) and its pruning rule.
6. Saved tables: save, list, filter, open, "Show live", "Update snapshot", "Save as new table"
   and export for selections; `tables.json` schema 2, migration, one-time `tables.v1.json`.
7. Live updates for selections (papers moved between subcollections, subcollections added,
   renamed, moved, trashed or deleted).
8. Fluent strings, unit/static/behaviour tests, the Zotero mock.

**Out of scope (non-goals):**
- Tables across **several libraries** (Q2 alternative; a later ADR if wanted).
- Saved searches, "Unfiled Items", whole-library scope (003b Q13), feeds.
- Using Zotero's own left-pane multi-selection as the picker (Alternative D below; possible
  later convenience).
- One row per paper **per subcollection** (duplicated rows; PRD Q5).
- A filter box inside the picker (Q14), collapsing tree branches.
- A per-table toggle to hide the Subcollection column (Q5 alternative).
- Dragging a paper from one subcollection group to another (that would mean moving the paper
  in Zotero: a library write, rule 8).
- Any write to the library: the picker never creates, moves or renames collections, and never
  changes Zotero's left-pane selection.

## User stories
- As a researcher who files papers by disease, I want to tick Asthma, COPD and Diabetes and get
  one table, so that I can compare those diseases' phenotype definitions side by side.
- As a researcher with everything under "Phenotypes", I want a Subcollection column, so that I
  can see which disease each row belongs to and sort or group by it.
- As a researcher, I want to leave out one subcollection (for example "Archive"), so that old
  papers do not clutter the table.
- As a keyboard or VoiceOver user, I want to tick collections with Tab and Space and hear
  "mixed" for a partly ticked parent, so that I can use the picker without a mouse.
- As a researcher, I want a saved table of three diseases to reopen with the same three
  diseases, and its export to carry the Subcollection column.

## Background for a JavaScript learner
- **Tri-state checkbox:** a parent checkbox can be ticked (all of it), empty (none of it) or
  *mixed* (some of it). HTML has this built in: setting `checkbox.indeterminate = true` in
  JavaScript draws the "mixed" look and tells screen readers "mixed". It is only a look; the
  real state is kept in our own data.
- **Rule / nearest rule wins / canonical form:** see ADR-0027 "Background". In short: the
  selection is stored as "include X (and everything below)" and "exclude Y (and everything
  below)"; for each collection, the closest rule above it (or on it) decides.
- **Tree order:** the order Zotero's left pane uses: each collection followed by its
  subcollections, names A→Z at each level. `Zotero.Collections.getByLibrary(libraryID, true)`
  already returns this order (existing api-notes row).

## Acceptance criteria
Each tagged `[auto]` (automated test, `npm test`) or `[manual]` (owner verifies in the dev
profile; one combined smoke test in prototype mode). Test data for the manual ACs: see
"Owner setup".

**Selection model (pure):**
- [ ] AC1 `[auto]` `TabellifySelection.scope` (`tests/unit/selection-model.test.mjs`): with the
  tree Phenotypes › {Asthma, COPD, Diabetes, Archive}, `{ include: [Phenotypes] }` gives all five
  in tree order; adding `exclude: [Archive]` gives four; `{ include: [Asthma, COPD] }` gives two;
  `validate` refuses a key that is in both lists; a rule whose key is unknown is ignored; a
  cycle in a bad input does not loop forever.
- [ ] AC2 `[auto]` `fromTicks` returns the canonical form: ticking Phenotypes then unticking
  Archive gives `{ include: [Phenotypes], exclude: [Archive] }`; ticking only the four children
  of Phenotypes gives `{ include: [Asthma, COPD, Diabetes, Archive] }` (Phenotypes' own papers
  out); the lists are sorted by code-unit order; the same ticks in any click order give the same
  result; `fromTicks(scope(x))` round-trips for every case above.
- [ ] AC3 `[auto]` `tickStates`: a parent is `checked` when it and all its descendants are in the
  scope, empty when none are, `indeterminate` otherwise; `applyTick` on an empty or mixed parent
  ticks it and every descendant, on a ticked parent unticks them all; on a child it changes that
  child and its descendants only.
- [ ] AC4 `[auto]` `selectionKey`: one include and no exclude gives the plain key
  `"1/ABCD2345"`; anything else gives `"sel:…"` (ADR-0027 §3); `parseSelectionKey` reads both
  back; keys from two libraries, more than 1 000 rules, repeats or a key in both lists are
  refused.
- [ ] AC5 `[auto]` `placeLabels` (Subcollection text): one anchor "Phenotypes": a paper in
  Asthma → `["Asthma"]`, a paper directly in Phenotypes → `["Phenotypes"]`, a paper in
  Phenotypes › Respiratory › Asthma → `["Respiratory › Asthma"]`, a paper in Asthma and COPD →
  `["Asthma", "COPD"]` (tree order); several anchors (Asthma, COPD ticked without their
  parent): `["Asthma"]`; anchors with children of their own (Phenotypes and Methods both
  ticked): full paths from the anchor (`"Phenotypes › Asthma"`). Names are returned as the same
  characters (a name `<img onerror=x>` comes back unchanged).

**Picker and dropdown:**
- [ ] AC6 `[manual]` In the dev Zotero window, Tabellify tab: the collection row shows the
  dropdown as before and a **Choose several…** button after it. Choosing one collection from
  the dropdown shows the same table as 0.2.0 (same papers, same counts).
- [ ] AC7 `[manual]` **Choose several…** opens a dialog titled **Choose collections** with the
  chosen collection's library (or My Library) as a tree of checkboxes, indented by level, the
  current selection already ticked. With groups in the profile, a **Library** dropdown at the
  top switches the tree; the tree of the other library starts with nothing ticked.
- [ ] AC8 `[manual]` Ticking **Phenotypes** ticks all its subcollections. Unticking **Archive**
  makes Phenotypes show the mixed look. Clicking the mixed Phenotypes ticks everything again.
  Clicking **Show table** shows one table with the papers of the ticked collections, each paper
  once; the dropdown now reads "4 collections" (or the right number) and the line under the
  collection row lists their names.
- [ ] AC9 `[manual]` Keyboard only: Tab reaches each checkbox in tree order, Space toggles it,
  Tab reaches **Select all**, **Clear**, **Show table**, **Cancel**; Tab from the last button
  wraps to the first control; Escape closes like **Cancel** (selection unchanged). With
  VoiceOver on (macOS: Command-F5), a partly ticked parent is read with "mixed" (or VoiceOver's
  equivalent wording). Focus returns to **Choose several…** after closing.
- [ ] AC10 `[manual]` With nothing ticked, **Show table** is disabled and the help line says
  "Tick at least one collection." Choosing a single collection from the dropdown afterwards
  replaces the selection.

**Subcollection column, sort, groups:**
- [ ] AC11 `[manual]` With **Phenotypes** chosen in the dropdown (it has subcollections), the
  table shows a **Subcollection** column right after Title: Asthma papers read "Asthma", a paper
  directly in Phenotypes reads "Phenotypes", a paper in Respiratory › Bronchitis reads
  "Respiratory › Bronchitis", a paper in two diseases shows both names on two lines. A
  collection without subcollections chosen alone shows **no** Subcollection column.
- [ ] AC12 `[manual]` Clicking the **Subcollection** header sorts by it in Zotero's tree order
  (clicking again reverses it); while sorted by it, a header row "Asthma · 3 papers" (and so on)
  appears above each group, spanning the table; a paper in two places appears once, under its
  first place. Sorting by any other column removes the group rows.
- [ ] AC13 `[auto]` `TabellifyTagMonitor.summarize` with a scope list: papers in two collections
  counted once; `paperCount`, k/M and "Tags used" unchanged against today for a single root;
  each paper gets `collectionIds` in scope order and `firstPlace` (index); `sortPapers(…,
  "subcollection", "asc" | "desc")` orders by `firstPlace`, then title.
- [ ] AC14 `[auto]` CSV (`tests/unit/csv-model.test.mjs`): with the column shown, the file has
  "Subcollection" after "Title" (a blank cell above it when there are two header rows), cells
  join a paper's places with "; ", a place starting with `=` is guarded (`'=`), no group header
  rows appear; without the column the file is byte-for-byte what 0.2.0 writes.
- [ ] AC15 `[manual]` **View table** shows the Subcollection column and (when sorted by it) the
  group rows; **Export CSV** from the page and from the modal both contain the column.

**Manual order:**
- [ ] AC16 `[manual]` With a 3-collection selection, the owner drags a paper to the top, waits 2
  seconds, restarts Zotero, opens the Tabellify tab and ticks the same 3 collections again: the
  hand order is back. Choosing a single collection that had a manual order in 0.2.0 still shows
  that order.
- [ ] AC17 `[auto]` Pruning (`tests/unit/table-layout-model.test.mjs`): a `"sel:"` entry is kept
  when all its keys are retained, dropped when one key of a listed library is gone (trash
  emptied), kept when a key's library is not listed; plain keys follow the 003b/SEC-018 rules
  unchanged; a 0.2.0-style call (no `"sel:"` support) keeps `"sel:"` entries (regression test
  that documents ADR-0027 §3).

**Saved tables:**
- [ ] AC18 `[auto]` `saved-tables-model`: schema 2 validates `definition.selection` strictly (one
  library, 1–1 000 rules, pattern, no repeats), `snapshot.subcollectionColumn`, and
  `rows[].subcollections` (≤ 50 parts, ≤ 500 characters each, empty when the column is off);
  migration 1 → 2 turns `collectionKey` into `{ include: [collectionKey], exclude: [] }` and gives
  every row `subcollections: []`; a schema 3 file is "newer".
- [ ] AC19 `[auto]` `tables-store`: loading a schema 1 file writes nothing; the first save
  writes `tables.v1.json` with `mode: "create"` (the exact bytes read) and then `tables.json`
  as schema 2; a second save does not write the copy again; an existing `tables.v1.json` is
  never overwritten. The write-guard test pins exactly these two calls.
- [ ] AC20 `[manual]` Save a 3-collection table: the **Saved tables** list reads
  "My Library · Asthma, COPD, Diabetes · n papers · m columns · Saved <date>". **Open** shows the
  snapshot with its Subcollection column; **Show live** rebuilds it from the same 3 collections;
  **Export CSV** of the saved table contains the column.
- [ ] AC21 `[manual]` The filter **Current selection** lists only tables whose selection equals
  the current one (a single-collection table matches when that collection is chosen alone).
- [ ] AC22 `[manual]` The owner moves one of the 3 collections to the Zotero trash and empties
  the trash: the saved table still opens (snapshot) and **Show live** builds the table from the
  2 remaining collections with the note "1 saved collection is no longer available."; with all
  3 gone, **Show live** is disabled with the existing reason text.
- [ ] AC23 `[manual]` Tables saved with 0.2.0 still open, show their snapshot unchanged and
  "Show live" works (migration). `tables.v1.json` exists in
  `~/Zotero tabellify-dev/tabellify/` after the first save.

**Live updates:**
- [ ] AC24 `[manual]` With Phenotypes chosen, the owner moves a paper from Asthma to COPD in the
  library tab (drag it onto COPD while holding **Cmd**; without Cmd, Zotero adds it to COPD and
  keeps it in Asthma): within about a second the Subcollection cell changes from "Asthma" to "COPD"
  without pressing **Refresh**. A new subcollection "Cancer" created under Phenotypes appears
  in the tree order and its papers join the table (inherited rule). Renaming Asthma changes the
  cells. Moving Archive out of Phenotypes drops its papers.
- [ ] AC25 `[manual]` With a selection of Asthma + COPD, the owner moves COPD to the trash: the
  table continues with Asthma only and the line under the collection row says "1 chosen
  collection is no longer available."; trashing Asthma too clears the table with the existing
  message "The chosen collection is no longer available. Choose another collection."

**Safety and static checks:**
- [ ] AC26 `[auto]` Static checks: `write-guard.test.mjs` (no new write site; tables-store pin
  updated as AC19), `no-html-sinks.test.mjs` (collection names in the picker, the dropdown
  option, the summary line, the Subcollection cells and group rows only via `textContent`,
  `new Option(...)` or `label`), `no-private-logs.test.mjs` (Debug Output gives counts, numeric
  IDs and rule counts, never collection names or `"sel:"` keys), every new Fluent ID exists,
  lifecycle symmetry (picker listeners removed on unload), the workspace Zotero allow-list is
  **unchanged** (no new `Zotero.*` call).
- [ ] AC27 `[manual]` Read-only proof: RT-G2 (`docs/zotero-api-notes.md`) before and after the
  smoke test gives the same counts (no tagging in between); Debug Output shows no Tabellify save
  other than `layout.json`, `tables.json`, `tables.v1.json` (once) or `codebooks.json`; the
  library's collection tree in the left pane is unchanged by using the picker.

## Design

### UI: how to pick several (alternatives)

**Option A (recommended): keep the dropdown, add "Choose several…" with a checkbox-tree
dialog.**
```
Collection: [ Phenotypes               v ]  [ Choose several… ]  [ Refresh ]  [ ] Also count…
            Showing: Asthma, COPD, Diabetes

+-- Choose collections -----------------------------------+
| Library: [ My Library v ]           (only with groups)  |
| Ticking a collection includes its subcollections.        |
| Untick a subcollection to leave it out.                  |
|  [-] Phenotypes                                          |
|      [x] Asthma                                          |
|      [x] COPD                                            |
|      [x] Diabetes                                        |
|      [ ] Archive                                         |
|  [ ] Methods                                             |
| 4 collections ticked                                     |
|        [ Select all ] [ Clear ]  [ Show table ] [ Cancel ]|
+----------------------------------------------------------+
```
- Pros: the common case (one collection) stays one click and looks the same; the dialog
  reuses the proven F007a `<dialog>` pattern (`showModal`, own Tab wrap, Escape; RT-S3 /
  RT-S3b passed); native checkboxes give keyboard and screen-reader support for free; tri-state
  parents show the "subcollections included" rule visually.
- Cons: two controls for one concept; the dropdown needs a special entry ("4 collections")
  while a selection is active.

**Option B: replace the dropdown with one "Collections…" button that always opens the picker.**
- Pros: one control; one mental model.
- Cons: choosing one collection becomes three steps (open, tick, Show table); loses the
  dropdown's type-to-find; bigger change to a surface the owner already tested (003b).

**Option C: a native multi-select list (`<select multiple>`) with indented options.**
- Pros: no dialog, no new markup pattern.
- Cons: Cmd/Ctrl-click is hidden knowledge; no tri-state; "a parent includes its children" is
  invisible; a tall list box on the main page.

**Option D: use the collections selected in Zotero's left pane** (Zotero 10 supports multiple
selection; `ZoteroPane.getSelectedCollections()`, existing Verified (docs) row).
- Pros: fully Zotero-native.
- Cons: the left pane lives in the library tab, so the user switches tabs to select and back to
  apply; whether a selected parent includes subcollections depends on a Zotero view setting;
  the selection can mix libraries and saved searches; reaching `ZoteroPane` from our iframe
  needs the main window. Good as a later "Use Zotero's selection" button, not as the main
  picker.

Recommendation: **A**.

### Picker dialog details (Option A)
- Markup: a second `html:dialog` in `workspace.xhtml` (`#tabellify-picker-dialog`,
  `aria-labelledby` its heading), structured like `#tabellify-view-dialog`. The tree is a
  nested `<ul>`; each `<li>` holds a native `<input type="checkbox">` and a `<label>` (text set
  with `textContent`). Indentation comes from nesting (CSS tokens only, ADR-0015). The list sits
  in a scroll region (`role="group"`, `aria-label` "Collections") so long trees scroll inside
  the dialog.
- State: the dialog keeps a `Set` of ticked collection IDs while open. Every click goes through
  the pure `TabellifySelection.applyTick` and `tickStates`, then sets each box's `checked` and
  `indeterminate`. Nothing changes the workspace until **Show table**.
- **Show table** converts the ticks with `fromTicks` (canonical rules), closes the dialog and
  shows the table. **Cancel** / Escape close without change. **Select all** ticks every top-level
  collection (and so everything); **Clear** unticks all.
- Library switch (only shown when the profile has group libraries): a `<select>` built from the
  same index as the main dropdown (003b `libraryGroups`). Switching starts the tree empty for
  that library (a selection is one library, Q2).
- The status line (`role="status"`) reads "N collections ticked" (counts the scope, not rules).
- All collections are shown expanded (no collapse buttons in F011; Q14).
- Focus: opening focuses the first checkbox (or the first ticked one); closing returns focus to
  **Choose several…**.

### Dropdown while a selection is active
- When the selection is exactly one collection (one include, no exclude), the dropdown shows
  that collection as today.
- Otherwise the workspace inserts one extra option at the top (after the placeholder), value
  `"selection"`, text "N collections" (Fluent plural, `tabellify-collection-several`), and selects
  it. Choosing any other entry replaces the selection with that single collection. The extra
  option is removed when the selection becomes a single collection again.
- A muted line under the collection row (`#tabellify-selection-summary`, plain text): "Showing:"
  and the included collections' names in tree order, first 5, then "+N more". Hidden for a
  single collection.

### Within one library only (recommended, Q2)
- Pros: keys, manual orders and saved tables stay simple; tag suggestions follow one library
  (003b Decision 3); "Papers N" never counts the same paper twice from two libraries (a paper
  copied into a group is a **different** Zotero item with another key); the reader section and
  "Show live" need no new rules.
- Cons: a team cannot combine My Library and a group in one table (copy the papers into one
  library instead).
- Cross-library later: keys already carry the library ID; it would mainly lift a validation
  rule plus decide the suggestion source and the Subcollection text (prefix with the library
  name). Needs an ADR amendment.

### Parents and subcollections (Q3)
- Ticking a parent includes it **and all its subcollections**, also ones created later (rule
  "include", ADR-0027 §1). This matches what the dropdown does today.
- To leave a subcollection out, untick it (rule "exclude" on it and everything below it).
- To include only the subcollections and **not** the parent's own papers: untick the parent
  (everything goes), then tick the children you want. The parent then shows "mixed".
- A mixed parent cannot show whether its **own** papers are in. The Subcollection column makes
  it visible (rows reading "Phenotypes"). Accepted limitation; noted in the wiki later.

### Subcollection column
Pure function `TabellifySelection.placeLabels(collections, scopeIds, paperCollectionIds)`:
- A paper's **places** are the in-scope collections it is a direct member of, in tree order.
- An **anchor** is an in-scope collection whose parent is not in scope (the top of a ticked
  branch).
- Text for one place:
  - **One anchor in the selection:** the path from just below the anchor down to the place,
    joined with " › " (U+203A, because collection names may contain "/"). A paper directly in
    the anchor shows the anchor's name. Examples: "Asthma", "Respiratory › Asthma", "Phenotypes".
  - **Several anchors:** an anchor without in-scope children shows its name ("Asthma",
    "COPD"); otherwise the full path from the anchor ("Phenotypes › Asthma"), so two
    subcollections with the same name under different anchors cannot be confused.
- **Several places:** all of them, each on its own line in the cell, in tree order.
- **When shown:** automatically when the scope has **more than one collection**; otherwise
  hidden (every row would show the same name). No toggle in F011 (Q5).
- **Position:** right after Title; it does not move by drag (like Title and k/M). Its header
  is a sort button (`data-sort="subcollection"`, `aria-sort` as for other columns).
- **Sorting:** `"subcollection"` sorts by the first place's tree-order index, then by title
  (A→Z, untitled last); "desc" reverses the place order only. Tree order, not alphabetical, so
  the table follows Zotero's left pane.
- **Group header rows** (Q8): while the sort key is `"subcollection"` (and not manual order),
  the body gets one header row before each run of papers with the same first place:
  `<tr class="tabellify-place-row"><th scope="rowgroup" colspan="…">Asthma · 3 papers</th></tr>`,
  with each group in its own `<tbody>` (HTML's way to say "this header covers the rows below";
  `scope="rowgroup"` is standard HTML, MDN `<th>`). How VoiceOver reads it is checked in the
  smoke test; a plain row without `scope` is the fallback.
  A paper with several places appears once, under its first place; its cell still lists all.
  Group rows are not draggable and are skipped by Alt+Up/Down row moves (they are not papers).
  The modal shows the same rows; the CSV does not (Q10).
- **CSV:** column header "Subcollection" right after "Title" (blank cell above it when there are
  two header rows, like Title), cell = the places joined with "; ". The formula guard applies
  (collection names are untrusted text). Without the column, output is unchanged from 0.2.0.
- **Untrusted text:** collection names can come from group members. Only `textContent` /
  `new Option()` / `label`, never markup; never in Debug Output.

### Manual order (ADR-0027 §3)
- The manual order belongs to the **selection key**: the plain collection key for a single
  collection (all 0.2.0 orders keep working), `"sel:…"` for anything else.
- Choosing (or applying) a selection that has a manual order starts in that order, as
  `onCollectionChange` does today.
- New papers (not in the order) come after the ordered ones, in default order (005c, unchanged).
- Pruning on save: ADR-0027 §3 (any member gone for good, in a listed library → dropped).
- In manual order, no group header rows are drawn (they would split a hand-made order), but the
  Subcollection column stays.

### Saved tables (ADR-0027 §2)
- **Save table** stores `definition.selection` (canonical) and the snapshot with
  `subcollectionColumn` and each row's `subcollections`.
- **List entry:** "<library> · <names> · n papers · m columns · Saved <date>"; names = the live
  names of the included collections in tree order, first 3, then "+N more"; if none is found,
  the saved `collectionName` and "(collection not found)" as today.
- **Filter:** the option "This collection" becomes **Current selection** (text change, same
  ID): a table matches when its selection key equals the current one (Q13).
- **Show live:** uses the saved selection's rules on today's tree. Rules whose keys are gone are
  ignored; if at least one include remains, the live table is built and the live note adds
  "N saved collection(s) no longer available." (Fluent plural); if none remains, "Show live" is
  disabled with the existing `tabellify-view-live-no-collection` text.
- **Update snapshot** / **Save as new table** keep the saved selection (not the workspace's).

### Live updates
- The existing observer (`["item-tag", "collection-item", "item", "collection", "group"]`, one
  debounce timer) is enough; **no new observer, timer or listener on the Zotero side**.
- `collection` events (`add`, `modify`, `trash`, `delete`) are now **Verified (source)** at
  10.0.9 (new api-notes row): `modify` also fires when a collection is renamed, moved to
  another parent, trashed or restored. Each recompute re-reads the tree and re-applies the
  rules, so new, renamed, moved and trashed subcollections are handled by the same code path.
- `collection-item` `add` / `remove` (existing Verified row) cover a paper moved between
  subcollections.
- A selection whose included keys partly disappear keeps working with the rest (AC25); when no
  include is left, today's "collection gone" path runs.
- A save with `skipNotifier` fires nothing (existing note): **Refresh** stays.

### Limits and performance
- Rules per selection: 1 000 (ADR-0027). The picker refuses **Show table** above it with a
  message (practically unreachable: canonical rules are only the differences).
- Reading cost equals choosing the common parent today: one `getChildItems()` per in-scope
  collection, each paper read once (existing `read` map). A whole big library ticked costs the
  same as its top collections today.
- Snapshot limits unchanged (5 000 rows, 500 columns); plus 50 Subcollection parts per row,
  500 characters each (cut with "…").
- The picker tree is built from the in-memory index (`buildCollectionIndex`, 003b); no library
  read when it opens. A library with a few thousand collections gives a long but scrollable list
  (filter box: Q14).

### Workspace changes (`src/content/workspace.js`)
- **State:** `currentSelection` (`{ include: string[], exclude: string[] } | null`, keys) replaces
  `currentCollection` as the source of truth. `currentCollectionKey()` becomes
  `currentSelectionKey()`; callers (manual order, saved filter, save table, suggestions library)
  move over. The dropdown value is derived from the selection.
- **Reading:** `gatherMonitorData(selection)` resolves the library from the first include key,
  awaits `waitForDataLoad("item")` as today, reads the tree with `getByLibrary(libraryID, true)`,
  computes the scope with `TabellifySelection.scope`, and reads `getChildItems()` per in-scope
  collection (unchanged loop). Returns `scope` and `scopeIds` instead of `rootId`.
- **Rendering:** the Subcollection header cell and body cells in `renderTableHeader` / row
  rendering, the group rows, the same in `viewTableRows`; `pageView()` and the snapshot adapter
  carry `subcollections` per paper and `subcollectionColumn`.
- **Picker:** `openPicker`, `onPickerChange` (one delegated `change` listener on the tree),
  `onPickerAction` (buttons), `closePicker`; listeners added in `init`, removed in `onUnload`.
- **Debug Output:** "selection: N rule(s), M collection(s) in scope, P paper(s)"; never names
  or keys (SEC-011).

### Pure model changes
| File | Change |
|---|---|
| `src/content/selection-model.js` (new, global `TabellifySelection`) | `validate`, `scope`, `fromTicks`, `tickStates`, `applyTick`, `selectionKey`, `parseSelectionKey`, `placeLabels`, `label` (names for the summary line and `collectionName`) |
| `src/content/tag-monitor-model.js` | `summarize` accepts a scope list (a number still means "this root and its descendants", so old callers and tests keep working); papers gain `collectionIds` and `firstPlace`; `SORT_KEYS` gains `"subcollection"`; `sortPapers` handles it |
| `src/content/table-layout-model.js` | `cleanManualOrders`: `"sel:"` pruning rule (ADR-0027 §3) |
| `src/content/saved-tables-model.js` | Schema 2: validation, migration 1 → 2, `buildDefinition` / `buildSnapshot` / `snapshotView` / `liveView` with selections and the Subcollection column; filter match by selection key |
| `src/content/tables-store.js` | `SCHEMA_VERSION` 2 via the model; one-time `tables.v1.json` copy (`mode: "create"`) before the first schema 2 write |
| `src/content/csv-model.js` | Optional Subcollection column (`view.subcollectionColumn`, `paper.subcollections`) |

### Fluent strings (`src/locale/en-US/tabellify.ftl`)
New (IDs prefixed `tabellify-`; final wording can change in review):
| ID | en-US text |
|---|---|
| `tabellify-collection-choose-several` | Choose several… |
| `tabellify-collection-several` | `{ $count -> [one] 1 collection *[other] { $count } collections }` |
| `tabellify-selection-showing` | Showing: |
| `tabellify-selection-more` | `+{ $count } more` |
| `tabellify-selection-partly-gone` | `{ $count -> [one] 1 chosen collection is no longer available. *[other] { $count } chosen collections are no longer available. }` |
| `tabellify-picker-heading` | Choose collections |
| `tabellify-picker-library-label` | Library |
| `tabellify-picker-help` | Ticking a collection includes its subcollections. Untick a subcollection to leave it out. |
| `tabellify-picker-tree` (`.aria-label`) | Collections |
| `tabellify-picker-count` | `{ $count -> [one] 1 collection ticked *[other] { $count } collections ticked }` |
| `tabellify-picker-none` | Tick at least one collection. |
| `tabellify-picker-too-many` | Too many separate choices. Tick whole parent collections instead. |
| `tabellify-picker-select-all` | Select all |
| `tabellify-picker-clear` | Clear |
| `tabellify-picker-apply` | Show table |
| `tabellify-picker-cancel` | Cancel |
| `tabellify-column-subcollection` | Subcollection |
| `tabellify-place-group-papers` | `{ $count -> [one] 1 paper *[other] { $count } papers }` |
| `tabellify-view-live-partly-gone` | `{ $count -> [one] 1 saved collection is no longer available. *[other] { $count } saved collections are no longer available. }` |

Changed text, same ID (only en-US exists; 003b Q12 precedent):
`tabellify-saved-filter-collection` = "Current selection".

Fluent variables with plural selectors are already used in `tabellify.ftl`
(`tabellify-reader-used`); the CSV header reuses `tabellify-column-subcollection`.

### Data
- **`layout.json`:** schema 3 unchanged; new `"sel:"` keys in `manualOrders` (ADR-0027 §3).
  0.2.0 keeps them (checked in its code) and never shows them.
- **`tables.json`:** schema 2 (ADR-0027 §2); migration on load (no write); one-time
  `tables.v1.json` copy at the first save; 0.2.0 sees "made by a newer Tabellify" and never
  overwrites.
- **`codebooks.json`** and the `countItemTags` pref: unchanged.

### Files touched
| File | Change |
|---|---|
| `src/content/selection-model.js` | New pure model |
| `src/content/tag-monitor-model.js` | Scope list, `firstPlace`, subcollection sort |
| `src/content/table-layout-model.js` | `"sel:"` pruning |
| `src/content/saved-tables-model.js` | Schema 2 |
| `src/content/tables-store.js` | Schema 2, one-time copy |
| `src/content/csv-model.js` | Subcollection column |
| `src/content/workspace.js` | Selection state, picker, column, group rows, saved tables, live view |
| `src/content/workspace.xhtml` | Button, summary line, picker `<dialog>`, `<script>` for `selection-model.js`, Subcollection header cell |
| `src/content/workspace.css` | Picker tree, summary line, Subcollection cells, group rows (tokens only) |
| `src/locale/en-US/tabellify.ftl` | Strings above |
| `tests/unit/selection-model.test.mjs` (new), `tag-monitor-model`, `table-layout-model`, `saved-tables-model`, `tables-store`, `csv-model`, `workspace-helpers`, `workspace-table`, `workspace-init-unload` tests; `tests/helpers/zotero-mock.mjs`; `tests/static/write-guard.test.mjs`, `workspace-script.test.mjs` (new model file, string IDs) | Tests |

Not touched: `src/reader-tags.js`, `src/tabellify.js`, `src/bootstrap.js`, `codebook-*.js`,
`layout-store.js`, `csv-export.js`, `regroup-model.js`, `script-*.js`, `tag-script-model.js`.

## Zotero APIs used
**No new `Zotero.*` call.** All reads reuse rows already in `docs/zotero-api-notes.md`
(Verified (source) at 10.0.9): `Zotero.Collections.getByLibrary(libraryID, true)` and
`(…, true, true)`, `collection.id` / `parentID` / `name` / `key` / `libraryID`,
`Zotero.Collections.get`, `collection.getChildItems()`, `Zotero.Libraries.get(…).waitForDataLoad("item")`,
item/attachment/annotation getters, `Zotero.Notifier.registerObserver` / `unregisterObserver`.

New rows added for this spec (section "Feature 011" in the api-notes):
- **Notifier type `"collection"` events** (`add`, `modify`, `trash`, `delete`): Verified
  (source) at 10.0.9 (`collection.js` `_finalizeSave`, `dataObject.js` `_saveData` /
  `_finalizeErase`). Supersedes the F005 "UNVERIFIED" note for collection events.
- **`HTMLInputElement.indeterminate`** (tri-state look): Verified (docs: MDN, WHATWG HTML);
  runtime in our chrome document = AC8/AC9 (smoke test). Fallback if the mixed look or the
  "mixed" announcement does not appear: replace the native box by an element with
  `role="checkbox"` and `aria-checked="mixed"` (the WAI-ARIA tri-state checkbox pattern; ARIA in
  HTML does not allow `aria-checked` on a native checkbox) plus a visible "(some)" text. The
  fallback is UNVERIFIED in our document and would be a follow-up task.
- Recorded, not used: `ZoteroPane.getSelectedCollections()` (existing Verified (docs) row;
  Alternative D).

## Data safety
- **Read:** the collection tree of the chosen library (in memory), the papers of the in-scope
  collections with their tags, attachments, highlights and highlight tags, and the library's tag
  names for suggestions. The same kinds of reads as 0.2.0.
- **Written:** **nothing in any Zotero library.** The picker never creates, renames, moves or
  deletes a collection and never changes Zotero's selection. Tabellify's own files:
  `layout.json` (manual orders, existing write), `tables.json` (schema 2, existing write) and
  once `tables.v1.json` (new copy inside the allow-listed `tables-store.js`, `mode: "create"`,
  never overwrites). No new write-guard entry; the tables-store pin is updated (AC19, AC26).
- **Migration safety:** loading never writes; the schema 1 file is kept as `tables.v1.json`
  and as `tables.json.bak`; 0.2.0 never overwrites a schema 2 file.
- **Untrusted text:** collection names (also from group members) reach the page only as plain
  text and the CSV only through the formula guard; Debug Output gets counts and numeric IDs.

## Owner setup (test data in the dev profile, before the smoke test)
1. In the dev Zotero window, left pane, under **My Library**: right-click **My Library** →
   **New Collection…**, name it `Phenotypes`.
2. Right-click `Phenotypes` → **New Subcollection…** five times: `Asthma`, `COPD`, `Diabetes`,
   `Archive`, `Respiratory`. Then right-click `Respiratory` → **New Subcollection…** and name it
   `Bronchitis` (for the nesting check in AC11).
3. Drag 1–2 small PDFs into each subcollection (also `Bronchitis`) and one PDF directly into
   `Phenotypes`. Then drag one paper from `Asthma` onto `COPD` **without** holding any key:
   Zotero adds it to `COPD` and keeps it in `Asthma` (Zotero's documentation: "By default, the
   items will be added to the new collection but won't be removed from their original
   location"; holding Cmd moves instead).
4. Tag a few highlights with codebook tags, as for earlier smoke tests.
(The developer's smoke-test instructions will give exact numbered steps per AC.)

## Test plan
| AC | How |
|---|---|
| AC1–AC5 | Unit tests, new `tests/unit/selection-model.test.mjs` |
| AC13 | Unit tests, `tag-monitor-model.test.mjs` |
| AC14 | Unit tests, `csv-model.test.mjs` |
| AC17 | Unit tests, `table-layout-model.test.mjs` |
| AC18, AC19 | Unit tests, `saved-tables-model.test.mjs`, `tables-store.test.mjs` |
| AC26 | Static tests (`npm test`) |
| AC6–AC12, AC15, AC16, AC20–AC25, AC27 | Owner smoke test in the dev profile, Debug Output in `build/debug-N.txt` |
Regression: the existing suite passes unchanged except where this spec changes behaviour
(tables schema, `summarize` signature extension, filter text, the write-guard pin).

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Approve spec and ADR-0027, answer Q1–Q15; create the test collections ("Owner setup") | owner | — | none (dev profile) |
| T1 | Pure selection model + tests (AC1–AC5) | developer | T0 | `src/content/selection-model.js`, `tests/unit/selection-model.test.mjs` |
| T2 | `summarize` scope list, `firstPlace`, subcollection sort + tests (AC13) | developer | T0 | `src/content/tag-monitor-model.js`, `tests/unit/tag-monitor-model.test.mjs` |
| T3 | `"sel:"` pruning + tests (AC17) | developer | T0 | `src/content/table-layout-model.js`, `tests/unit/table-layout-model.test.mjs` |
| T4 | CSV Subcollection column + tests (AC14) | developer | T0 | `src/content/csv-model.js`, `tests/unit/csv-model.test.mjs` |
| T5 | `tables.json` schema 2, migration, one-time copy, write-guard pin + tests (AC18, AC19) | developer | T1 | `src/content/saved-tables-model.js`, `src/content/tables-store.js`, `tests/unit/saved-tables-model.test.mjs`, `tests/unit/tables-store.test.mjs`, `tests/static/write-guard.test.mjs` |
| T6 | Workspace selection state, reading, Subcollection column, group rows, manual order, saved tables, live view (no picker yet) | developer | T1–T5 | `src/content/workspace.js`, `src/content/workspace.xhtml`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/helpers/zotero-mock.mjs`, `tests/unit/workspace-*.test.mjs`, `tests/static/workspace-script.test.mjs` |
| T7 | Picker dialog, "Choose several…", dropdown special entry, summary line (AC26 statics) | developer | T6 | same files as T6 |
| T8 | Owner smoke test (manual ACs) | owner | T7 | none |
| T9 | User docs (pre-release docs pass, ADR-0010): wiki Table Builder, Workspace, Saved Tables, Data Safety (`tables.v1.json`, rollback), Changelog | docs-writer | T8 | `README.md`, `docs/wiki/*.md` |

T1, T2, T3 and T4 have non-overlapping file scopes and can run in parallel (worktrees). T5 uses
`selection-model.js` for validation, so it follows T1. T6 and T7 share `workspace.js` and run
one after the other.

## Open questions (with recommendations)
1. **Q1 Picker UI.** A: dropdown + "Choose several…" dialog (recommended); B: one
   "Collections…" button always; C: `<select multiple>`; D: use Zotero's left-pane selection.
   *Recommended: A* (one-collection use unchanged; accessible native checkboxes; D later as a
   convenience).
2. **Q2 Libraries.** One library per table (recommended) or across libraries?
   *Recommended: one library* (no double counting of copied papers, simple keys and suggestions;
   cross-library later with an ADR amendment).
3. **Q3 Parent ticks.** Ticking a parent includes all its subcollections, also future ones, and
   unticking a child excludes it (recommended), or ticks mean "exactly these collections"
   (ADR-0027 option B)? *Recommended: include + exclude rules* (same meaning as today's dropdown).
4. **Q4 Paper directly in the chosen parent.** Show the parent's name (recommended), leave the
   cell empty, or show "(main collection)"? *Recommended: the parent's name* (never empty, clear
   in CSV).
5. **Q5 When the column shows.** Automatically when the scope has more than one collection
   (recommended), always, or with a toggle? *Recommended: automatic, no toggle in F011* (fewer
   controls; a toggle can come with F009 column customization).
6. **Q6 Nesting depth.** Full path below the anchor ("Respiratory › Asthma") (recommended) or
   only the first level below the anchor ("Respiratory")? *Recommended: full path* (nothing
   hidden; sorting by tree order still groups by the first level).
7. **Q7 Paper in two subcollections.** One row with both names in the cell (recommended) or one
   row per subcollection (duplicated rows)? *Recommended: one row* (PRD Q5: one row per paper; k
   and "Papers N" stay honest).
8. **Q8 Row grouping.** Group header rows while sorted by Subcollection (recommended), a separate
   "Group by subcollection" switch, or no group rows (sorting only)? *Recommended: header rows
   while sorted by it* (no new switch; the owner asked for grouping).
9. **Q9 Sort order of places.** Zotero's tree order (recommended) or alphabetical by the shown
   text? *Recommended: tree order* (matches the left pane; with Zotero's A→Z names per level the
   two mostly agree).
10. **Q10 CSV.** One "Subcollection" column, places joined with "; ", no group rows (recommended),
    or also group header rows in the file? *Recommended: column only* (spreadsheets sort and
    filter a column; extra rows break that).
11. **Q11 Manual order for selections.** One order per selection key `"sel:…"` (recommended,
    ADR-0027), none for multi-collection selections, or built from the members' orders?
    *Recommended: per selection key.*
12. **Q12 `tables.json` upgrade.** Schema 2 with a one-time `tables.v1.json` copy (recommended)
    or without the copy (rely on `.bak`; no write-guard pin change)? *Recommended: with the
    copy* (saved tables are "previous work").
13. **Q13 Saved-tables filter.** "Current selection" = same selection key (recommended), or
    "tables that include the chosen collection"? *Recommended: same key* (predictable; the other
    meaning can be a later filter).
14. **Q14 Large trees.** Show every collection expanded with a scroll area (recommended for
    F011), or add a filter box and collapsible branches now? *Recommended: expanded + scroll now;
    filter box as a small follow-up if the owner's real library needs it.*
15. **Q15 Feature number.** The PRD roadmap reserves "F010+" (F010 and later) for AI-assisted
    extraction, so "F011" overlaps that range. Keep F011 and relabel the AI row "F010 (and
    later AI features)", or rename this feature (for example "003c", as it extends collection
    access like 003b)? *Recommended: keep F011 and relabel the AI row "F010"* (the branch and
    the orchestrator already use 011; a later AI feature takes the next free number).
