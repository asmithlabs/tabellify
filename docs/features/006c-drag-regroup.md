# Feature 006c: Drag regrouping in the table

- **Status:** Approved (owner, 2026-11-13, all recommendations Q1–Q8)
- **Branch:** `feat/006c-drag-regroup` (start from `main` after 006b, merged as `4f7ea1a`)
- **Related ADRs:** **0016 §7 (Accepted: regrouping drags write the codebook; reordering
  stays in `layout.json`)**, 0016 §6 (reserved `"ungrouped"` ID, Reset does not undo
  grouping), 0014 (Accepted: `layout.json`, written after a user action), 0012 (data storage,
  revision check), 0015 (design tokens), 0011 (security), 0003 (no bundler).
  Outline: `docs/features/006a-workspace-restructure.md`, "Later phases → 006c" and
  "Conflicts with earlier decisions" #5 and #8. Builds on F005c (`docs/features/005c-table-layout.md`).
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output in `build/debug-N.txt`.
- **ADR needed?** **No new ADR and no amendment.** ADR-0016 §7 already decides that a drop
  which changes a tag's group is a codebook edit through the normal save, names the four
  drop kinds used here, and names the model functions (`setTagGroup`, `groupUnderTag`).
  006c also writes `layout.json` after such a drop so the column lands where it was dropped;
  that is an ordinary layout save after a user action (ADR-0014 §4), not a new rule. No new
  storage, file, dependency, UI surface or `Zotero.*` call.


## Amendment 2026-11-13 (owner, smoke test): nest makes B a group name only
Owner smoke test: after a nest, "alpha" appeared both as the super-header and as a sub-column
("it should be one or the other"). Owner chose option 1: **B becomes only the group name.**
- Nest (A dropped below ungrouped tag B, mouse or Alt+Down): the group named B is created (or
  the existing group with that name, ignoring case, is reused, Q2); **tag B is removed from the
  codebook** (no column, no longer counted in k/M); A joins the group. B is also pruned from
  `layout.json` orders. Nothing in the Zotero library changes.
- If B is already in a group, A joins that group (unchanged). B is never removed in that case.
- The drop hint and status text say B becomes a group name (e.g. "Make alpha a group name").
- This replaces "B stays first" in the table below and the 006a "B stays as a sub-column of
  itself" choice.

## Owner's rules (2026-11-13, verbatim)
- Sideways drag reorders columns (existing behaviour). Dragging a sub-column into another
  group's span moves it into that group.
- Vertical drag: dropping tag A onto the area below tag B's header nests A under B: if B is
  ungrouped, B becomes a group (super-header named B) and A becomes its sub-header (B also
  stays as first sub-column — already decided); if B is already in a group, A joins that
  group.
- Dragging a sub-header up into the super-header row removes it from its group (it becomes
  ungrouped).
- Every drag change updates the codebook and stays in sync with the tag script box and the
  group pills.
- "Reset columns" restores the default column order; it does not undo grouping changes.

## Problem / objective
After 006a/006b the only ways to change a tag's group are typing in the tag script box or
deleting a group. In the table, a tag column can only move inside its own group (F005c
decision 3), so the table, which is where the owner looks at the data, cannot be used to
reorganise it. 006c lets the owner regroup **by dragging tag columns in the table**:
sideways into another group, down onto a tag to nest, up into the super-header row to
ungroup, with the same result from the keyboard. Every regroup is a normal codebook edit
(same save path as the script box), so the pills, the "Edit groups and tags" list, the
script box's suggestions and the table always agree. Nothing is written to the library.

## Scope
**In scope:**
1. Three new drop zones for a dragged **tag column** (its header grip): tag header row
   (sideways), table body below a tag header (nest), super-header row (ungroup).
2. Pure regroup logic: `TabellifyCodebook.groupUnderTag` (codebook edit) and a new pure
   module `TabellifyRegroup` (`src/content/regroup-model.js`) that turns "this tag was
   dropped there" into a codebook edit plus the new column layout.
3. Visual drop indicators (design tokens only) and a short drop-hint text in the table
   toolbar saying what the drop will do.
4. Keyboard equivalent on a focused tag-column grip: **Alt+Up** ungroups, **Alt+Down** nests
   under the column to its left (Q1).
5. Name collisions, emptied groups, placement in `layout.json`, refusals while the codebook
   cannot be saved.
6. Fluent strings, CSS, tests, a states-gallery sample.

**Out of scope (non-goals):**
- Any library write (tags, items, annotations, collections).
- Dragging a **whole group** onto another group or below a tag (groups inside groups do not
  exist, ADR-0016). Whole-group drags keep reordering only (F005c).
- Undo button (Q4: reverse drag, script box, or `codebooks.json.bak` instead).
- Dragging pills, dragging in the "Edit groups and tags" list, dragging from the script box.
- Horizontal auto-scroll while dragging (vertical auto-scroll exists; see Design, "Geometry").
- Renaming a group created by a nest (use "Edit groups and tags" → Rename, as today).
- Paper (row) drags: unchanged.

## User stories
- As a researcher, I drag the `Temperature` column next to `Hospitalization` and it becomes
  part of "Outcome"; the pills and the editor say so at once.
- As a researcher, I drop `sex` on the cells under `age` and get a new group "age" with
  `age` and `sex`, without typing.
- As a researcher, I drag a tag up onto the group headers and it leaves its group.
- As a keyboard user, I can do the same with Alt+Up / Alt+Down on the column's grip.
- As a researcher, "Reset columns" never undoes my grouping.
- As a researcher, I trust that none of this changes my Zotero library.

## Design

### Background for a JavaScript learner
- **Drop zone:** a part of the table where a drop means one particular thing. The browser
  only tells us *which element* is under the pointer during a drag (`dragover` fires "at the
  element the mouse is pointing at", MDN); our code decides what that element means.
- **Plan, then apply:** the pure module only *computes* what a drop would do (a new codebook
  object and a new column layout). `workspace.js` then saves the codebook through the
  existing `applyCodebookEdit` and, only if that worked, uses the new layout. Splitting it
  this way lets Node tests check every case without a browser.
- **View ID vs stored ID:** the table calls the block of ungrouped tags `"ungrouped"`
  (ADR-0016 §5). In `codebooks.json` the same tags have `group: null`. The regroup module
  translates between the two.

### What each drop does (the rules)
A = the dragged tag column; its block is `fromBlock` (a group ID like `"g2"`, or
`"ungrouped"`). "Block" = a group's columns, or the ungrouped block.

| Zone (pointer over …) | Condition | Result | Writes |
|---|---|---|---|
| **Tag header** of tag T in block X (sideways) | X = `fromBlock` | Reorder inside the block (F005c, unchanged) | `layout.json` only |
| | X ≠ `fromBlock`, X a group | A **joins** group X, placed before/after T (pointer left/right of T's middle) | codebook, then layout |
| | X = `"ungrouped"` | A becomes **ungrouped**, placed before/after T | codebook, then layout |
| **Body cell** below tag B (nest) | B = A | Nothing (refused, no indicator) | — |
| | B in group G, A not in G | A **joins** G right after B | codebook, then layout |
| | B in group G, A already in G | A moves right after B (Q7) | `layout.json` only |
| | B ungrouped | **Nest:** group named B is created, or the existing group with that name (ignoring case) is reused (Q2). B then A go into it; **B stays first** | codebook, then layout |
| **Super-header cell** (any cell of the group-header row, including the blank ungrouped one) | A is in a group | A becomes **ungrouped**, at the end of the ungrouped block | codebook, then layout |
| | A is already ungrouped | Nothing (refused) | — |
| Title, k/M, grip column, outside the table | — | Refused (as today) | — |

Notes:
- **One-row header** (only ungrouped tags, 006a): there is no super-header row, so there is
  no ungroup zone (every tag is already ungrouped). Sideways reorder and nest work; the first
  nest creates a group and the header becomes two rows.
- **Emptied group** (A was its last tag): the group **stays** in the codebook with no tags:
  pill "G · 0", no column (the 006a rule for empty groups; Q3). It can be deleted in
  "Edit groups and tags".
- **A group created by a nest** gets a new ID from `nextId` and B's exact spelling as its
  name. Group names and tag names live in different lists, so a group and a tag may share a
  name (ADR-0016 §2).
- **Name collision (Q2).** When B is ungrouped and a group with B's name (ignoring case)
  already exists, that group is used (ADR-0016 §7); its stored spelling wins; B and A are
  added at its end (B before A). No second group with the same name can ever be created
  (validation forbids it). The status line says "Tag moved to another group." instead of
  "New group created.", so the reuse is visible.
- **Whole-group drags** keep their F005c meaning (reorder groups) in every zone.

### Pure logic 1: `TabellifyCodebook.groupUnderTag(data, tag, anchor)` (`codebook-model.js`)
Named in ADR-0016 §7. Returns a new data object, never mutates its input:
- `tag` or `anchor` missing, or `tag === anchor` → `{ ok: false, error: ERR_TAG_MISSING }`
  (no new Fluent ID: the workspace never asks for a self-nest; the test only checks the
  refusal).
- `anchor` in group G → same as `setTagGroup(data, tag, G)`;
  result `{ ok: true, data, groupId: G, created: false }`.
- `anchor` ungrouped → find a group whose name equals `anchor` ignoring case; if none,
  `pushGroup(next, anchor)` (`created: true`). Then `moveTagRecord` for `anchor`, then for
  `tag` (each only if not already in that group), so `anchor` precedes `tag` in the tag list.
  Result `{ ok: true, data, groupId, created }`.
- The name avoids the write guard's `addTag` / `removeTag` pattern.

### Pure logic 2: `TabellifyRegroup` (new `src/content/regroup-model.js`)
Classic script, one `var TabellifyRegroup = { … }`, `"use strict"`, **no Zotero, DOM,
IOUtils or PathUtils globals**. It uses the pure globals loaded before it:
`TabellifyCodebook`, `TabellifyTagMonitor` (for `codebookGroups`, the view with the
ungrouped block) and `TabellifyTableLayout` (`orderedGroups`, `moveTag`, `withGroupOrder`,
`withTagOrder`). Load order in `workspace.xhtml`: after `table-layout-model.js`, before
`layout-store.js`.

```
plan(codebook, columnLayout, drag, target) → Plan
  drag   = { groupId: string /* view ID */, tag: string }
  target = { zone: "header", groupId, tag, side: "before" | "after" }
         | { zone: "body",   groupId, tag }
         | { zone: "super" }
  Plan   = { kind: "none" }
         | { kind: "reorder", layout }
         | { kind: "regroup", edit: { ok: true, data }, layout,
             effect: "joined" | "created" | "ungrouped", groupId /* view ID of A's new block */ }
         | { kind: "refused", error /* Fluent ID from the codebook edit */ }

describe(codebook, drag, target) → { kind, effect, name } | null
  // what the drop would do, for the drop hint; `name` = target group name or B (plain text)
```
Rules for `layout` (all through `TabellifyTableLayout`, so `"__proto__"`-safe):
1. `groupsAfter = TabellifyTagMonitor.codebookGroups(edit.data)`.
2. **Position of A** inside its new block: the drop position computed from the block's
   **shown** order before the drop (`orderedGroups(groupsBefore, columnLayout)`), i.e. before
   or after T, right after B, or at the end (ungroup). Applied with
   `moveTag(layout, groupsAfter, newBlockId, A, index)`. This is explicit, so a stale entry
   for A in that block's saved `tagOrder` (ADR-0014 amendment: stale entries are not pruned)
   can never put A somewhere else.
3. **Prune A** from every other block's `tagOrder` (keeps `layout.json` tidy; harmless if
   skipped, because stale entries are ignored when shown).
4. **New group from a nest** (`created`): its ID is inserted into `groupOrder` **right after
   the block B was in** (the ungrouped block), using the shown block order; `tagOrder` for it
   is `[B, A]`. Without this, `orderedGroups` would append the new group at the far right
   (Q5).
5. **Reused group** (collision): B then A are placed at the end of that group's shown order.
6. **Ungrouped block that did not exist before** (an ungroup when no tag was ungrouped): if
   `"ungrouped"` is not in the saved `groupOrder`, it is inserted at the front (ADR-0016 §6:
   default position first). If it is there from earlier, its saved place is kept.
7. A plan whose codebook edit changes nothing (e.g. A already in G and Q7 reorder) is
   `kind: "reorder"`, never a codebook save.

### Workspace integration (`workspace.js`)
**Body cells carry their column.** In `renderPaperTable`, each `td.tabellify-col-tag` gets
`dataset.groupId` and `dataset.tag` (plain attribute strings, as the header cells already
have; never used in a CSS selector). The cell's column index is `td.cellIndex`.

**`dropTarget(event)`** gains a branch for `drag.kind === "tag"` (group and row drags
unchanged):
1. `const th = event.target.closest("thead th[data-group-id]")`:
   - `th` has `data-tag` → zone `header` (side from `dropSide(clientX, …)`, as today).
   - `th` has no `data-tag` (a super-header cell) → zone `super`.
2. Else `const td = event.target.closest("tbody td.tabellify-col-tag")` → zone `body`
   (B = `td.dataset.tag`, block = `td.dataset.groupId`).
3. Else → `null` (refused).
4. Then `TabellifyRegroup.describe(...)`. If the drop would be a **regroup** and the codebook
   cannot be saved now (`!codebookEditable || codebookBusy`, or no codebook), → `null`
   (refused: no indicator, no drop). Reorders are allowed as today.

**Indicators** (`showDropIndicator` / `clearDropIndicator` extended; DOM work only when the
target changes, not on every `dragover`):
| Drop | Classes | Look (tokens only) |
|---|---|---|
| Reorder inside block | `tabellify-drop-before/-after` on T's header (existing) | existing 2px `action` line left/right |
| Join another block (sideways) | the line above **plus** `tabellify-drop-into` on that block's super-header (if the header has two rows) | 2px `action` line under the group name: `box-shadow: inset 0 calc(-1 * var(--tabellify-border-width-strong)) 0 var(--tabellify-color-action)` |
| Nest / join below B | `tabellify-drop-nest` on B's header and on B's cell in every body row (`row.cells[td.cellIndex]`) | 2px `action` lines on both sides of the column: two inset box-shadows (left and right) |
| Ungroup | `tabellify-drop-ungroup` on every super-header cell | dashed 2px `action` outline inside each cell: `outline: var(--tabellify-border-width-strong) dashed var(--tabellify-color-action); outline-offset: calc(-1 * var(--tabellify-border-width-strong))` (dashed = the design system's "ungrouped" look) |

No new colour token; no background (so no new contrast pair). The indicators differ by
**shape**, and the drop hint names the action, so meaning never depends on colour alone
(design-system rule).

**Drop hint (Q6).** A `<html:span id="tabellify-drop-hint" aria-hidden="true" hidden>` in
the table toolbar, next to "Reset columns". During a tag drag over a valid zone it shows,
as plain text: "Move column here" / "Move into group: <name>" / "Move to Ungrouped" /
"Make a new group: <B>" / "Remove from its group". Hidden on `dragend`, drop and
`dragleave` out of the table. `aria-hidden`: it is mouse feedback; keyboard users get
announcements (below).

**`onTableDrop`** for a tag drag: `plan(...)`, then
- `reorder` → `setColumnLayout(plan.layout, …, "drag")` (existing path).
- `regroup` → `applyRegroup(plan, "drag")` (new, async, called without blocking the event
  handler; errors caught and logged):
  1. `const shown = await this.applyCodebookEdit(plan.edit, extraId)` where `extraId` is
     `tabellify-regroup-joined` / `-created` / `-ungrouped`.
  2. If `shown` is true (saved, or kept on screen after a failed write, as for script
     edits): `this.columnLayout = plan.layout; this.renderMonitor(); this.layoutChanged();`.
     If false (refused, busy, or a **conflict** reload): the layout is **not** changed.
  3. Debug Output, IDs only: `regroup: a tag moved from block g2 to block g5 (drag)`,
     `regroup: group g7 created by a nest (drag)`. Never tag or group names.
- `refused` → `showCodebookStatus(error, null, true)`.
Because the save is `applyCodebookEdit`, `renderCodebook` re-renders the table, the pills
and the editor, and the script box's suggestions read the new codebook on the next keystroke
(006b `suggest` reads codebook tags on every call). The text typed in the script box is
never touched by a drag.

`endDrag()` also clears the new classes and hides the hint. As today, `endDrag()` runs in
the drop handler before the table is re-rendered (the dragged grip may be removed by the
re-render, so its `dragend` might not reach the table).

### Keyboard (Q1)
On a focused **tag-column** grip (`data-grip="tag"`), handled in the existing
`onTableKeydown`, Alt only (no Ctrl/Meta/Shift), as for Alt+Left/Right:
- **Alt+Up** = drop on the super-header row (ungroup). Ungrouped tag: nothing.
- **Alt+Down** = drop on the body cell of the **column to its left** in the shown order
  (nest under that tag, or join its group). First column, or the left column is in the same
  group (already together): nothing.
- Alt+Left / Alt+Right stay **inside** the block (unchanged; never a codebook write).
- After the save, focus returns to A's grip (`focusColumnGrip(newBlockId, A)`), and the
  existing `role="status"` element announces, e.g. "Temperature moved to group Outcome" /
  "Heat index is now ungrouped" (Fluent text + names as plain text).
- Group grips and row grips: unchanged. Tag grips' `aria-keyshortcuts` becomes
  `"Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"`.
- The script box remains a second keyboard path (`B(B, A)` nests; `A` alone ungroups).

Why Alt+Up/Down: the arrows match the mouse gesture (up = into the super-header row, down =
below a tag); Alt+Up/Down is unused on column grips (only row grips use it, and those are
different elements); Zotero's own tables ignore Alt (`virtualized-table.jsx` `_onKeyDown`:
`if (e.altKey) return;`, F005c Q6); and the grip is a `span`, so there is no text-selection
default to fight.

### Geometry
- Zones come from the element under the pointer (`event.target.closest(…)`), not from pixel
  maths, except the existing before/after split on tag headers (`dropSide`).
- The super-header row is sticky (F005c), so it stays reachable when the table is scrolled
  down; vertical auto-scroll is unchanged (it runs on every `dragover`).
- The body zone is every body cell of a tag column, top to bottom. With 0 papers the table is
  hidden (006a), so there is nothing to drag; the script box still works.
- Wide tables scroll sideways; there is no horizontal auto-scroll (out of scope). The owner
  can drop on a visible column, or use the keyboard.

### Lifecycle
**No new listener**: the existing delegated `dragstart` / `dragover` / `dragleave` / `drop` /
`dragend` / `keydown` listeners on `#tabellify-items-table` gain branches. No timer (the
existing layout save debounce is reused), no observer, no pref, no file. Nothing in
`bootstrap.js`, `tabellify.js` or `reader-tags.js`.

### Fluent IDs (no arguments; names appended as plain text, as today)
Proposed text, owner may change:
- `tabellify-regroup-joined` = Tag moved to another group.
- `tabellify-regroup-created` = New group created.
- `tabellify-regroup-ungrouped` = Tag removed from its group.
- `tabellify-regroup-announce-moved` = moved to group
- `tabellify-regroup-announce-ungrouped` = is now ungrouped
- `tabellify-drop-hint-reorder` = Move column here
- `tabellify-drop-hint-join` = Move into group:
- `tabellify-drop-hint-to-ungrouped` = Move to Ungrouped
- `tabellify-drop-hint-new-group` = Make a new group:
- `tabellify-drop-hint-ungroup` = Remove from its group

### Files
| File | Change |
|---|---|
| `src/content/codebook-model.js` | Add `groupUnderTag` |
| `src/content/regroup-model.js` | **New.** `TabellifyRegroup.plan`, `describe` (pure) |
| `src/content/workspace.xhtml` | Script tag for `regroup-model.js` (after `table-layout-model.js`); `#tabellify-drop-hint` in the toolbar |
| `src/content/workspace.js` | Body cell data attributes; tag-drag zones; indicators; hint; `applyRegroup`; Alt+Up/Down on tag grips; `aria-keyshortcuts`; strings added to `LAYOUT_STRINGS` |
| `src/content/workspace.css` | `.tabellify-drop-into`, `-nest`, `-ungroup`, `#tabellify-drop-hint` (tokens only) |
| `src/locale/en-US/tabellify.ftl` | New IDs above |
| tests | See Test plan |
| `docs/design-system-states.html`, `docs/design-system.md` | Samples of the three new indicators; one §5 bullet |

## Zotero / Mozilla APIs used
**No new `Zotero.*` call.** Rows in `docs/zotero-api-notes.md` ("Feature 006c rows").

| API / mechanism | Status |
|---|---|
| HTML drag-and-drop events, `DataTransfer` (`setData` with private type, `types`, `effectAllowed`, `dropEffect`; `getData` never called) | Existing F005c rows; Verified (source); mouse drag worked in the F005c smoke test (R12 row not yet re-labelled by the owner) |
| `dragover` fires repeatedly at the element under the pointer; a drop is allowed only where `dragover` is cancelled | Verified (docs), new 006c row (MDN "Drag operations", `dragover` event) |
| `MouseEvent.clientX/clientY` (inherited by `DragEvent`), `getBoundingClientRect()`, `Element.closest()` | Existing F005c rows |
| `HTMLTableCellElement.cellIndex`, `HTMLTableRowElement.cells` | Verified (docs), new 006c row |
| CSS `outline` (dashed) with negative `outline-offset`; inset `box-shadow` lines | Verified (docs), new 006c row; inset lines already used |

## Data safety
- **Read from the library:** nothing new (the same papers, highlights and tags as F005/006a).
- **Written to the library:** **nothing.** A regroup changes only which group a tag has in
  Tabellify's codebook. No item, tag, annotation, collection or database change.
- **Written to disk (Tabellify's folder only, `<data dir>/tabellify/`):** `codebooks.json`
  through the existing `applyCodebookEdit` → `TabellifyCodebookStore.saveData` (revision
  check, atomic write, `.bak`; one save per drop), and `layout.json` through the existing
  debounced `TabellifyLayoutStore.saveData`. **No new file, no new write-guard allow-list
  entry**; `regroup-model.js` never writes.
- **Order of the two writes:** codebook first; the layout changes only after the codebook
  edit is shown. If the layout save fails, the codebook is still right and the columns fall
  back to codebook order; if the codebook save hits a conflict, nothing changes.
- **Drag data:** unchanged rule: our drags carry only `application/x-tabellify-column`; the
  drop handler never calls `getData`, never reads text dragged in from outside, and only acts
  on drags that started in this table.
- **Untrusted text:** tag and group names go into `dataset`, `aria-label`, the hint and
  announcements only as text (`textContent` / `setAttribute`); never into CSS selectors or
  markup (`no-html-sinks`). Debug Output logs IDs and counts only.
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9), collection "F005 test".
**Setup** (script box, one entry per Enter): `Exposure(Heat index, Temperature),
Outcome(Hospitalization, Mortality)`, then `age, sex`. Expected start: pills "Ungrouped · 2",
"Exposure · 2", "Outcome · 2"; blank super-header over `age`, `sex` on the left.
"Drop on the cells under X" = release the mouse over any body cell of column X.
`[auto]` = `npm test`.

- [ ] AC1 `[manual]` **Reorder unchanged.** Dragging `Temperature`'s grip onto the left half
  of `Heat index`'s header shows the drop line and swaps them; the hint reads "Move column
  here"; the `revision` in `codebooks.json` does not change.
- [ ] AC2 `[manual]` **Sideways join.** Dragging `Temperature` onto the right half of
  `Hospitalization`'s header shows the drop line and a line under "Outcome", hint "Move into
  group: Outcome". After the drop: `Temperature` is right after `Hospitalization` under
  "Outcome"; pills "Exposure · 1", "Outcome · 3"; status "Codebook saved. Tag moved to another
  group."; "Edit groups and tags" shows the same.
- [ ] AC3 `[manual]` **Sideways into Ungrouped.** Dragging `Mortality` onto `age`'s header
  makes it ungrouped at that place; pill "Ungrouped · 3".
- [ ] AC4 `[manual]` **Nest, new group.** Dragging `sex` and holding it over the cells under
  `age` outlines the `age` column and shows "Make a new group: age". After the drop: a
  super-header "age" over `age` (first) and `sex`, placed right after the ungrouped block;
  pill "age · 2"; status "… New group created.".
- [ ] AC5 `[manual]` **Nest into a group.** Dropping `Mortality` on the cells under
  `Heat index` puts it right after `Heat index` under "Exposure"; pill "Exposure · 2".
- [ ] AC6 `[manual]` **Ungroup.** Dragging `Heat index` up over any group header outlines the
  whole group-header row with dashes, hint "Remove from its group". After the drop `Heat
  index` is the last ungrouped column. Dragging an ungrouped tag up there shows no outline
  and does nothing. Ungrouping both tags of "age" leaves the pill "age · 0" and no "age"
  column.
- [ ] AC7 `[manual]` **Name collision.** Type `Country(), country, region` (an empty group
  "Country" and two ungrouped tags). Dropping `region` on the cells under `country` creates
  **no** second group: super-header "Country" over `country`, `region`; pill "Country · 2"
  (no other "country" pill); status "… Tag moved to another group.".
- [ ] AC8 `[manual]` **Keyboard.** Tab to `Temperature`'s column grip: Alt+Up (Option+Up)
  makes it ungrouped and focus stays on its grip; Alt+Down on it nests it under the column to
  its left (pill counts change accordingly); with VoiceOver on, each move is announced.
  Alt+Left/Right still never leave the block.
- [ ] AC9 `[manual]` **Reset and persistence.** "Reset columns" puts columns back in
  codebook order and changes **no** pill count and no grouping. Closing and reopening the
  Tabellify tab keeps both grouping and column positions.
- [ ] AC10 `[manual]` **Refusals and sync.** Dragging a tag column over Title, k/M or a
  paper's grip cell shows no indicator and does nothing; dragging text from another app
  onto the table does nothing. After AC1–AC9, typing an existing tag in the script box
  (e.g. `sex`) still moves it as in 006a, and the table, pills and editor agree.
- [ ] AC11 `[manual]` **Light/dark and safety.** The three indicators are visible in Light
  and Dark (Zotero Settings → General → Color Scheme). The dev Zotero tag selector shows no
  new tag (no `age`, `sex`, `country`, `region` unless added by hand before). Debug Output has
  no Tabellify errors and no tag names in `regroup:` lines. Closing the tab during a drag,
  and disabling Tabellify with the tab open, produce no errors.
- [ ] AC12 `[auto]` **`groupUnderTag`** (`tests/unit/codebook-model.test.mjs`): anchor in a
  group → joins it; anchor ungrouped → new group named exactly like the anchor, ID from
  `nextId`, `nextId` + 1, anchor before tag in the list, `created: true`; existing group with
  the same name in another case is reused (stored spelling kept, `created: false`, no new
  ID); tag already in that group; missing tag / anchor / tag = anchor refused; input not
  mutated; result passes `validate`.
- [ ] AC13 `[auto]` **`TabellifyRegroup.plan` / `describe`**
  (`tests/unit/regroup-model.test.mjs`, new; Node `vm` sandbox loading codebook-model,
  tag-monitor-model, table-layout-model, regroup-model): every row of the rules table
  (reorder same block; join group before/after T; sideways into ungrouped; nest new group,
  nest join, nest same group = reorder; super zone ungroups a grouped tag and refuses an
  ungrouped one; A = B none); positions in the resulting `orderedGroups` exactly as in the
  table; new group placed right after B's block and `tagOrder` `[B, A]`; collision reuse
  puts B, A at the end; stale saved `tagOrder` entries for A do not win; A pruned from
  other blocks; `"ungrouped"` inserted first when the block appears and the saved
  `groupOrder` lacks it; an emptied group stays in the codebook with 0 tags; plans that
  change nothing in the codebook are `reorder`; `"__proto__"` as a tag or group name stays
  an ordinary key; inputs not mutated; `describe` returns the hint kind and the plain name.
- [ ] AC14 `[auto]` **Workspace** (`tests/unit/workspace-table.test.mjs`, fake DOM): body tag
  cells have `data-group-id` / `data-tag`; for a tag drag, `dragover` on a tag header, a
  body cell and a super-header cell is accepted (`preventDefault`) with the right classes and
  hint text, and refused on Title / k/M / grip cells and on the super row for an ungrouped
  tag; regroup zones are refused while `codebookBusy` or not editable, reorders still
  accepted; a regroup drop calls the codebook save once and changes `columnLayout` only
  after it is shown (not on conflict); `endDrag` clears all new classes and hides the hint;
  Alt+Up / Alt+Down on a tag grip produce the same plans as the drops, keep focus and
  announce; tag grips' `aria-keyshortcuts` lists the four keys; names appear only as text.
- [ ] AC15 `[auto]` **Static checks:** script order (`codebook-model.js`, `codebook-store.js`,
  `tag-script-model.js`, `script-suggest-model.js`, `tag-monitor-model.js`,
  `table-layout-model.js`, `regroup-model.js`, `layout-store.js`, `workspace.js`);
  `regroup-model.js` uses no Zotero / DOM / IOUtils / PathUtils globals; `workspace.js`
  still has no `getData(`; the Zotero allow-list in `workspace-script.test.mjs` gains **no**
  entry; `write-guard` passes with **no** new allow-list entry; `no-html-sinks` passes;
  `symmetry` passes (no new listener); new Fluent IDs exist and start with `tabellify-`;
  design-token and colour rules pass for the new CSS.

## How to verify in the dev profile (owner)
The orchestrator turns this into numbered steps with exact windows at smoke-test time.
1. Start the dev profile with Debug Output captured, install the `.xpi`, open the Tabellify
   tab, choose "F005 test", and type the Setup entries.
2. Run AC1–AC11 in order; report "yes" or "no" plus anything that looked wrong.
3. Afterwards restore the test codebook with the script box (AC9's tab reopen keeps it).

## Test plan
| AC | How |
|---|---|
| AC1–AC11 | Owner smoke test (manual), Debug Output in `build/debug-N.txt` |
| AC12 | `tests/unit/codebook-model.test.mjs` (extended) |
| AC13 | `tests/unit/regroup-model.test.mjs` (new) |
| AC14 | `tests/unit/workspace-table.test.mjs` (fake DOM extended as needed: `cellIndex`, `cells`, drag events with `clientX` and `dataTransfer.types`) |
| AC15 | `tests/static/workspace-script.test.mjs`, `write-guard`, `no-html-sinks`, `symmetry`, `l10n-and-window`, `design-tokens` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Owner approves this spec and Q1–Q8 | owner / orchestrator | — | — |
| T1 | `groupUnderTag` + tests (AC12) | developer | T0 | `src/content/codebook-model.js`, `tests/unit/codebook-model.test.mjs` |
| T2 | `TabellifyRegroup` (`plan`, `describe`) + tests (AC13) | developer | T1 | `src/content/regroup-model.js`, `tests/unit/regroup-model.test.mjs` |
| T3 | Workspace integration: script tag, body-cell attributes, zones, indicators, hint, `applyRegroup`, Alt+Up/Down, CSS, Fluent, static checks, gallery and design-system samples (AC14, AC15) | developer | T2 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs`, `tests/static/l10n-and-window.test.mjs` (only if its file list needs the new module), `tests/static/symmetry.test.mjs` (same), `docs/design-system-states.html`, `docs/design-system.md` |
| T4 | `npm test`, `npm run build`; owner smoke test AC1–AC11 | developer → owner | T3 | — |

T1 → T2 → T3 run one after the other (each uses the previous one's functions). T1 and T2
are separate commits (one concern each).

## Open questions (each with the recommendation this spec assumes)
1. **Q1 Keyboard equivalent.** *Recommended:* **Alt+Up** (ungroup) and **Alt+Down** (nest
   under / join the column to the left) on a tag-column grip; Alt+Left/Right stay inside the
   block. Alternatives: (a) Alt+Left/Right at a block edge crosses into the next block
   (a sideways regroup by keyboard; but then an ordinary reorder key could write the
   codebook by surprise); (b) no table shortcut, script box only (simplest; weaker
   accessibility).
2. **Q2 B's name is already a group name** (ignoring case). *Recommended:* reuse that group
   (ADR-0016 §7), its spelling wins, B and A go to its end, status says "Tag moved to another
   group.". Alternatives: refuse with a message; or create "B (2)" (a second, confusing name).
3. **Q3 Emptied group** (its last tag dragged away). *Recommended:* keep it ("G · 0", no
   column), as for any empty group since 006a; delete it in "Edit groups and tags".
   Alternative: delete it automatically (cleaner, but silently removes something the owner
   may have named on purpose, and a nest then un-nest would leave no trace either way).
4. **Q4 Undo.** *Recommended:* **no undo in 006c.** Every regroup is reversed by the opposite
   drag, Alt+Up/Down or the script box; `codebooks.json.bak` holds the previous version; the
   status line says what happened. Only leftover: an auto-created group stays as "B · 0"
   (Q3). Alternative: a one-step "Undo" button in the status line that re-saves the previous
   codebook and layout (more code and tests; worth it only if accidental drops happen in
   practice).
5. **Q5 Where a group created by a nest appears.** *Recommended:* right after the block B
   came from (usually right after the ungrouped block, so it stays where the owner was
   looking). Alternative: at the far right (codebook order; no layout write needed).
6. **Q6 Drop hint text in the toolbar during a drag.** *Recommended:* yes; the nest and
   ungroup zones are not otherwise self-explaining, and it makes the smoke test easy to
   judge. Alternative: indicators only.
7. **Q7 Nest below B when A is already in B's group.** *Recommended:* move A right after B
   (layout only, no codebook save). Alternative: refuse (no indicator).
8. **Q8 Drop on a group's own super-header.** Your rule says the super-header row ungroups,
   even over the header of the group A could join. *Recommended:* follow the rule as written
   (dashed outline + "Remove from its group" make it explicit; joining is done on tag headers
   or below a tag). Alternative: a drop on another group's super-header joins that group and
   only the blank ungrouped header (or A's own group header) ungroups.
