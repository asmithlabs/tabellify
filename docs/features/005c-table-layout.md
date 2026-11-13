# Feature 005c: Per-paper table layout (formatting, column and row drag-and-drop)

- **Status:** Draft (for owner approval)
- **Branch:** `feat/005c-table-layout`
- **Related ADRs:** 0009 (workspace tab), 0003 (no bundler, no dependency), 0011 (security),
  0012 (data storage; **not touched** under the recommended option), **0014 (Proposed, only
  needed if the owner chooses to save the layout, see Q1)**. PRD §5 F009 (column
  customization). Builds on F005 (`docs/features/005-tag-monitor.md`).
- **Process:** prototype mode (CLAUDE.md). Developer builds; `npm test` + `npm run build`
  pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output captured to
  `build/debug-N.txt`.
- **Sequencing:** F005b (reader popup) is in progress on another branch and may touch
  `workspace.js` / `tag-monitor-model.js`. Start the 005c build **after F005b merges** (or
  rebase onto it) to avoid conflicts in `workspace.js`.

## Problem / objective
Owner feedback on the F005 per-paper table in the Tabellify tab: *"the sort works but the
table needs formatting and drag and drop functionality"*. Owner decisions (2026-11-12):
drag-and-drop for **both** (a) reordering **columns** and (b) reordering **papers (rows)** by
hand. **Not** tag-by-drag: dropping a tag on a paper would write to the library.

F005c makes the table readable (borders, shading, sticky header, sensible widths, wrapped
titles, light/dark mode) and lets the user arrange columns and rows by mouse **and** by
keyboard. Everything stays inside the existing workspace document. Nothing is written to
the library.

## Relation to F009 (and F006/F007)
- **F005c pulls "drag-and-drop column reorder" forward from F009**, for the F005 per-paper
  table only.
- **F009 keeps** user-created columns, column types and per-column options (PRD Q1 "per-column
  override").
- The pure reorder functions written here (`moveColumn`, `moveRow`, `applyManualOrder`) are
  written so F006 (table builder) and F009 can reuse them unchanged.
- **F007** (saved table configurations, `tables.json` under ADR-0012) is the planned home for
  *saved* layouts of synthesis tables. See Q1 for whether this table's layout is saved before
  then.

## Scope
**In scope:**
- Formatting of `#tabellify-items-table`: cell borders, alternating row shading, sticky header,
  fixed column widths, wrapped long titles and tag lists, light/dark mode.
- **Column reorder** of the five data columns (Title, Codebook tags, In, All tags, Details)
  by dragging a grip in the header, and by keyboard (Alt+Left / Alt+Right on the grip).
  "Reset columns" button.
- **Row reorder** of papers by dragging a grip at the start of each row, and by keyboard
  (Alt+Up / Alt+Down on the grip). A paper's open "Show remaining" detail row moves with it.
- A **"Manual order" sort state** next to the clickable sort (see "Sort and manual order").
- Auto-scroll while dragging near the top/bottom edge of the scrolling area.
- A screen-reader announcement after each keyboard move.
- **Persistence (recommended): none.** Column order and manual row orders live in memory for
  as long as the Tabellify tab is open (they survive collection switches, Refresh and live
  updates, not closing the tab or restarting Zotero). Saving them is Q1.

**Out of scope (non-goals):**
- Dragging tags onto papers or anything else that changes the library (owner decision).
- Dragging papers out to Zotero (collections, notes) or in from Zotero: our drag carries a
  Tabellify-only data type and our drop handler ignores everything else.
- Resizable column widths (Q3; recommended later with F009).
- Hiding columns, user-created columns, column types (F009).
- Multi-row drag (one paper at a time).
- Saving the layout to disk (Q1; ADR-0014 drafted in case the owner wants it).

## User stories
- As a researcher, I can read long titles and tag lists without the table becoming a wall of
  text, in light and dark mode, and I keep the column names in view while I scroll.
- As a researcher, I drag the "Codebook tags" column next to the title because that is what I
  look at first.
- As a researcher, I drag papers into the order I want to read or code them, and I can still
  sort by a column and come back to my own order.
- As a keyboard user, I can do all of the above without a mouse.
- As a researcher, I trust that arranging the table never changes my library.

## Design

### Background for a JavaScript learner
- **HTML drag-and-drop** is built into the browser engine (Gecko) that Zotero runs on. You
  mark an element `draggable="true"`; when the user starts dragging it, the browser fires
  `dragstart` on it, then `dragover` repeatedly on whatever is under the pointer, then `drop`
  on the element where the mouse is released, then `dragend` on the dragged element. Each
  event carries `event.dataTransfer`, a small "clipboard" for the drag. A drop is only
  allowed where a `dragover` handler calls `event.preventDefault()`.
- **Event delegation**: instead of one listener per row, one listener on the whole table
  looks at `event.target.closest(...)` to find which row or header was involved (F004/F005
  already do this).
- **Sticky header**: `position: sticky; top: 0` keeps the header cells pinned to the top of
  the scrolling area while the rows scroll under them.

### Formatting (CSS only, `src/content/workspace.css`)
| Item | How | Why |
|---|---|---|
| Borders | Every `th`/`td`: `border: 1px solid color-mix(in srgb, currentColor 20%, transparent)`; header bottom 2px at 40% | Same light/dark-safe technique the file already uses (borders follow the text colour) |
| Border model | `border-collapse: separate; border-spacing: 0` (instead of `collapse`) | With `collapse`, Gecko draws borders on the table, not the sticky cells, so header borders scroll away |
| Alternating shading | `workspace.js` adds class `tabellify-row-alt` to every other **paper** row; a paper's detail row gets the same class as its paper. CSS: `background-color: color-mix(in srgb, currentColor 6%, transparent)` | Translucent tint of the text colour: dark tint on light theme, light tint on dark theme. A JS class (not `:nth-child`) because detail rows would break `nth-child` striping |
| Hover | `tbody tr:hover` tint 10% (same `color-mix`) | Helps following a row across wide tables |
| Sticky header | `thead th { position: sticky; top: 0; z-index: 1; background-color: -moz-Dialog; }` | The header must be **opaque** or rows show through it. `-moz-Dialog` is the window background `global.css` already uses (API notes row 75: "If a later spec needs an explicit background, use a system colour (`-moz-Dialog`, `Canvas`)"). Follows light/dark |
| Column widths | `table-layout: fixed; width: 100%`; widths by **column class**, not position: grip 2.5em, `tabellify-col-title` 38%, `tabellify-col-count` 7em, `tabellify-col-collections` 18%, `tabellify-col-tags` auto, `tabellify-col-details` 10em | Fixed layout = stable widths that don't jump on re-render. Classes (not `nth-child`) so widths follow a column when it is moved |
| Wrapping | Title, In, All tags: `overflow-wrap: anywhere`; count: `white-space: nowrap; font-variant-numeric: tabular-nums` | Long titles and unbroken strings (DOIs, URLs in titles) wrap instead of widening the table |
| Drop indicator | `.tabellify-drop-before` / `-after`: `box-shadow: inset 0 2px 0 currentColor` (rows: top/bottom; columns: left/right) | A line where the item will land, no colour needed |
| Being dragged | `.tabellify-dragging { opacity: 0.5 }` | |
| Grip | `.tabellify-grip::before { content: "⠿"; }`, `cursor: grab`, focus ring via `:focus-visible` outline | Same pattern as the existing ▲/▼ sort arrows (decorative glyph in CSS; the accessible name comes from Fluent) |

**The "no background" test.** `tests/static/l10n-and-window.test.mjs` currently fails if
`workspace.css` contains `background` or `background-color` at all. That rule protects the
window background (owner-approved; a hard-coded colour breaks dark mode or makes the window
see-through). Shading and a sticky header both need a background on **cells**.

| Option | Pros | Cons |
|---|---|---|
| **A. Narrow the test (recommended)** | Honest, readable CSS; the test still protects what it was written for | Changes an owner-approved test (needs this approval) |
| B. Keep the test, fake backgrounds with `box-shadow: inset 0 0 0 100vmax <colour>` | No test change | A hack that dodges the test's intent; harder to read for a learner |
| C. No shading and no sticky header | No test change | Doesn't meet the owner's feedback |

Option A, the new rule: `background`/`background-color` is allowed in `workspace.css` **only**
(1) on selectors that start with `#tabellify-items-table`, and (2) with a value that is either
`color-mix(in srgb, currentColor <N>%, transparent)` or one of the system colours
`-moz-Dialog` / `Canvas`. Still forbidden: any background on `:root`, `window`,
`#tabellify-workspace-main` or elsewhere, and any literal colour (hex, `rgb()`, `hsl()`, named
colours). The test comment cites this spec.

### Columns
- Column IDs (stable, used in code and, if Q1 = C, on disk): `title`, `count`, `collections`,
  `tags`, `details`. Default order = today's order.
- A new **first header cell** (not movable) for the row grips; its accessible name comes from
  Fluent (`tabellify-column-move`).
- Each movable `<th>` gets `data-column="<id>"`, the column class (`tabellify-col-<id>`), and a
  grip `<html:span class="tabellify-grip" draggable="true" tabindex="0" role="button"
  data-l10n-id="tabellify-column-grip">` before its sort button. The grip is a `span`, **not a
  `button`**: in Firefox a `<button draggable="true">` does not start a drag (Mozilla
  [bug 568313](https://bugzilla.mozilla.org/show_bug.cgi?id=568313),
  [bug 646823](https://bugzilla.mozilla.org/show_bug.cgi?id=646823)), and a separate grip keeps
  "click header = sort" and "drag grip = move" apart.
- Reordering the header: `workspace.js` re-appends the existing `<th>` elements in the new
  order (moving a DOM node keeps its Fluent translation). Body cells are built in
  `columnOrder` order in `renderPaperTable`.
- **Mouse:** `dragstart` on a column grip → remember `dragging = { kind: "column", id }`,
  `dataTransfer.setData("application/x-tabellify-column", id)` (Firefox needs some `setData`
  for the drag to start), `effectAllowed = "move"`. `dragover` on a header cell → if
  `dataTransfer.types` includes our column type: `preventDefault()`, `dropEffect = "move"`,
  show the indicator left/right of the cell (pointer left/right of the cell's middle). `drop`
  → `columnOrder = moveColumn(columnOrder, id, targetIndex)`, re-render. `dragend` → clear
  state and indicators (also when the drop was cancelled).
- **Keyboard:** grip focused + Alt+ArrowLeft / Alt+ArrowRight → `moveColumnBy(order, id, ∓1)`;
  focus returns to the same grip; announcement "Moved column Title to position 2 of 5".
- **"Reset columns"** button in the table toolbar → default order.
- Column order is **one global order** for the tab (not per collection).

### Rows (papers)
- Each paper row gets a first cell with a grip `<span class="tabellify-grip" draggable="true"
  tabindex="0" role="button">` whose `aria-label` is "Move paper: <title>" (Fluent text +
  title appended as plain text, like `usedTagLabel`). Rows themselves are **not** draggable,
  so selecting text in a cell still works.
- **Mouse:** `dragstart` on a row grip → `dragging = { kind: "row", id }`,
  `setData("application/x-tabellify-row", String(id))`, `effectAllowed = "move"`,
  `setDragImage(tr, …)` so the whole row is shown. `dragover` on a paper row **or its detail
  row** (treated as the paper) → if our row type: `preventDefault()`, indicator above/below
  (pointer above/below the row's middle). `drop` → `moveRow(...)`, switch to manual order,
  re-render. `dragend` → clear.
- **Keyboard:** grip focused + Alt+ArrowUp / Alt+ArrowDown → move one place; focus stays on
  the moved paper's grip; announcement "Moved <title> to position 3 of 12".
- **Auto-scroll:** while dragging, if the pointer is within 40 px of the top/bottom of
  `#tabellify-workspace-main` (the scrolling area), scroll it by up to 20 px per `dragover`
  (Zotero's own tables do the same in `_onDragOver`, `virtualized-table.jsx` @ 10.0.9).
- The open detail row (`expandedPaperIds`) is rendered right after its paper, so it moves with
  it automatically.

**Safety of drag data.** The drop handler **never reads** `dataTransfer.getData()`; it uses
the in-memory `dragging` state set by our own `dragstart`. The type check only decides whether
to allow a drop. So text, files or Zotero items dragged in from elsewhere are refused (no
`preventDefault()`), and nothing from outside is ever parsed or shown. Our custom types
(`application/x-tabellify-*`) are not types any Zotero drop target accepts, so dropping our
drag elsewhere does nothing (the F005c static test checks that `getData(` does not appear in
`workspace.js`).

### Sort and manual order
State in `workspace.js`: `sortKey` ∈ `"title" | "count" | "collections" | "manual"`,
`sortDirection`, `manualOrders: Map<collectionId, number[]>` (item IDs), `columnOrder:
string[]`.

| User action | Result |
|---|---|
| Choose a collection with no manual order yet | Default sort (fewest codebook tags first), as F005 |
| Choose a collection that has a manual order (this session) | **Manual order** (Q2) |
| Drag or Alt+Arrow a paper while sorted by a column | The order **currently shown** becomes the starting manual order, the move is applied, state = Manual. No header shows ▲/▼ |
| Drag or Alt+Arrow a paper while in Manual | Move applied |
| Click a column header | Sort by that column (click again to reverse). The manual order is **kept** |
| Click **"Manual order"** (toolbar; shown once a manual order exists; `aria-pressed` = true while active) | Back to the hand-made order |
| Click **"Clear manual order"** (toolbar) | Forget it for this collection; default sort |
| A paper appears (live update / Refresh) | Shown **after** the hand-ordered papers, in default sort order among themselves |
| A paper disappears | Skipped when shown; its ID is dropped the next time the order is changed |

A toolbar line above the table (`#tabellify-table-toolbar`) shows: order status ("Sorted by
Title ▲" is already on the header; in manual order it reads "Manual order"), the two
manual-order buttons, "Reset columns", and a visually hidden `role="status"` element for the
keyboard announcements.

### Pure model (new file `src/content/table-layout-model.js`)
One global `TabellifyTableLayout` (classic script, `var`, no Zotero/DOM/IOUtils globals, same
style as `tag-monitor-model.js`; `src/content/` for the same chrome:// URL reason). All
functions return new arrays and never mutate inputs.
- `COLUMN_IDS` = `["title", "count", "collections", "tags", "details"]`
- `normalizeColumnOrder(order)` → valid permutation of `COLUMN_IDS` (drops unknown and
  duplicate IDs, appends missing ones in default order). Also used for any loaded data (Q1).
- `moveColumn(order, id, toIndex)`, `moveColumnBy(order, id, delta)` (no-op at the edges or
  for unknown IDs).
- `applyManualOrder(papers, manualOrder, fallbackSorted)` → papers in manual order, unknown
  papers appended in `fallbackSorted` order, missing IDs skipped.
- `seedManualOrder(displayedPapers)` → IDs in the shown order.
- `moveRow(order, id, beforeId | null)` (`null` = to the end), `moveRowBy(order, id, delta)`.
- `nextSortState(state, clickedKey)` → `{ key, direction }` (click on a new column = asc,
  same column = reverse, from "manual" = asc).
- `dropSide(pointer, start, size)` → `"before" | "after"` (pointer vs. middle).
- `autoScrollDelta(pointerY, top, bottom, edge = 40, max = 20)` → pixels to scroll.
- `stripeFlags(rows)` → which paper rows get `tabellify-row-alt` (detail rows copy their
  paper's flag).

### Lifecycle
New listeners in the workspace document only, all **delegated on `#tabellify-items-table`**
(`dragstart`, `dragover`, `dragleave`, `drop`, `dragend`, `keydown`) plus one `click` on the
toolbar. All removed in `onUnload` next to the existing `onTableClick` removal. No timers
(auto-scroll happens inside `dragover`). No Notifier, no prefs, no file, nothing in
`bootstrap.js` or `tabellify.js`. In-memory layout state dies with the document.

### Does this need an ADR?
- **Recommended option (not persisted): no.** No new subsystem, storage, dependency, public
  interface or UI surface: all inside the existing workspace document (same reasoning as F005).
- **If the owner wants the layout saved (Q1 = C): yes**, a new data file is a new storage
  format (CLAUDE.md rule 7). ADR-0012 is Accepted and only an owner may change it, so the
  addition is drafted as a **short new ADR**: `docs/decisions/0014-table-layout-storage.md`
  (Status: Proposed), which extends ADR-0012's file list with `layout.json` and reuses all of
  ADR-0012's rules.

## Zotero / Mozilla APIs used
No new `Zotero.*` call under the recommended option. New platform (Gecko) APIs, all standard
web APIs; details and sources in the appendix "API notes to merge".

| API | Status |
|---|---|
| HTML `draggable` attribute; `dragstart`/`dragover`/`dragleave`/`drop`/`dragend` events (`DragEvent.dataTransfer`) on HTML elements in a chrome XUL document | Verified (source): Zotero 10.0.9 item tree does exactly this in `zoteroPane.xhtml`. **In our tab iframe: runtime check R12** (= AC4/AC5) |
| `DataTransfer.setData`, `.types`, `.effectAllowed`, `.dropEffect`, `.setDragImage` | Verified (source, Firefox ESR 140 WebIDL) |
| `<button draggable>` does not start a drag in Firefox | Known Gecko limitation (Bugzilla), design avoids it |
| CSS `position: sticky`, `table-layout: fixed`, `overflow-wrap: anywhere`, `color-mix()`, system colour `-moz-Dialog` | Standard CSS (MDN); `-moz-Dialog` already verified (API notes row 75); `color-mix` already used in `workspace.css` |
| `element.scrollBy()`, `getBoundingClientRect()`, `focus()`, `KeyboardEvent.altKey`/`key` | Standard DOM (MDN) |
| Only if Q1 = C: `IOUtils.readJSON`/`writeJSON`/`makeDirectory`, `PathUtils.join`, `Zotero.DataDirectory.dir` (all already verified, F004) and `collection.key` / `item.key` (Verified (source), new row) | See ADR-0014 |

## Data safety
- **Read from the library:** nothing new. The table shows what F005 already reads.
- **Written to the library:** nothing. No tag, item, collection or database change. Drag and
  drop only reorders Tabellify's own in-memory arrays.
- **Written to disk:** nothing under the recommended option (write guard unchanged, no new
  allow-list entry). If Q1 = C: only `<data dir>/tabellify/layout.json` (+ `.tmp`/`.bak`) via
  ADR-0014, with one write-guard allow-list entry for the new store file.
- **Drag data:** our drags carry only Tabellify-private types; dropped data from outside is
  never read or rendered; our drop handler only acts on drags that started in this table.
- **Untrusted text:** titles in `aria-label`s and announcements are set as attribute/text
  values (`setAttribute`, `textContent`), never as markup (`no-html-sinks` still applies).
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`.

## Acceptance criteria
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9), reusing the F005 test
collection "F005 test" (3 papers, subcollections). For the sticky-header check, any
collection with about 20+ papers (or a short Zotero window) works. `[auto]` = `npm test`.

- [ ] AC1 `[manual]` **Formatting.** In the Tabellify tab, the per-paper table has thin
  borders around every cell, every other paper row is lightly shaded, and long titles wrap
  inside the Title column (no sideways scrolling at a normal window width). A paper's open
  "Show remaining" row has the same shading as its paper.
- [ ] AC2 `[manual]` **Light and dark.** After switching Zotero's colour scheme (Zotero
  Settings → General, colour-scheme choice: Light, then Dark) and reopening the Tabellify tab,
  text, borders, shading and header stay readable in both; no white or black blocks.
- [ ] AC3 `[manual]` **Sticky header.** Scrolling down a long table keeps the header row
  visible at the top; rows do not show through the header.
- [ ] AC4 `[manual]` **Column drag (also runtime check R12).** Dragging the grip of "Codebook
  tags" and dropping it on the left half of "Title" moves that column (header and every
  cell) to the first data position, with a drop line shown during the drag. Clicking the
  "Title" header button still sorts by title. Choosing another collection keeps the new
  column order. "Reset columns" restores the original order.
- [ ] AC5 `[manual]` **Row drag (also R12).** With "F005 test" in the default order (Paper 3
  first), dragging Paper 1's grip above Paper 3 shows Paper 1 first; the toolbar shows
  "Manual order" (pressed) and no header shows ▲ or ▼. Text in a cell can still be selected
  with the mouse.
- [ ] AC6 `[manual]` **Back and forth.** After AC5, clicking the "Title" header sorts by title;
  clicking "Manual order" shows Paper 1, Paper 3, Paper 2 again; switching to "Phenotype A"
  and back to "F005 test" opens in that manual order; "Clear manual order" returns to the
  default order.
- [ ] AC7 `[manual]` **Keyboard.** Using only Tab and Alt+arrow keys (Option+arrow on macOS):
  Alt+Down on a paper's grip moves it one row down and the focus stays on its grip; Alt+Right
  on a column grip moves that column one place right. Each move logs nothing to Error Console
  and VoiceOver (if on) announces the new position.
- [ ] AC8 `[manual]` **Detail rows and live updates.** With Paper 1's "Show remaining" open,
  moving Paper 1 moves its detail row with it. Adding a tag to Paper 2 in the library view
  (live update) keeps the manual order; a paper newly added to "F005 test" appears after the
  hand-ordered papers.
- [ ] AC9 `[manual]` **Nothing written, nothing dropped in.** After AC1–AC8: the tag selector
  and the collections are unchanged; `~/Zotero tabellify-dev/tabellify/` contains no new file
  (only `codebooks.json` and its `.bak`); dropping a paper grip outside the table, or dragging
  text from another app onto the table, changes nothing; Debug Output shows no Tabellify
  errors. Closing the Tabellify tab and disabling Tabellify with the tab open produce no
  errors.
- [ ] AC10 `[auto]` **Pure model** (`tests/unit/table-layout-model.test.mjs`): every function
  in "Pure model": `normalizeColumnOrder` (unknown, duplicate, missing, non-array input);
  `moveColumn`/`moveColumnBy` (to start, to end, edges no-op, unknown id no-op);
  `applyManualOrder` (known order kept, new papers appended in fallback order, missing IDs
  skipped, empty manual order = fallback); `seedManualOrder`; `moveRow` (before an id, to end,
  onto itself no-op) and `moveRowBy` (edges); `nextSortState` (new key, same key reverses,
  from manual); `dropSide`; `autoScrollDelta` (inside, near top, near bottom, capped);
  `stripeFlags` (detail rows copy their paper); **inputs not mutated**.
- [ ] AC11 `[auto]` **Static checks:** `table-layout-model.js` uses no Zotero / DOM / IOUtils
  globals and loads after `tag-monitor-model.js` and before `workspace.js`; every
  `addEventListener` added to the table and the toolbar has a matching `removeEventListener`
  in `onUnload`; `workspace.js` does not contain `getData(`; the F003/F005 Zotero allow-list
  in `workspace-script.test.mjs` gains **no** entries; `write-guard` passes with **no** new
  allow-list entries; `no-html-sinks` passes; every new Fluent ID exists and starts with
  `tabellify-`; `workspace.xhtml` has no hard-coded text.
- [ ] AC12 `[auto]` **Background rule** (`tests/static/l10n-and-window.test.mjs`, changed per
  "The no-background test", option A): passes for the new CSS; a unit-style self-check in the
  same test shows it still rejects `background: #fff`, `background-color: rgb(…)` / named
  colours, and any background outside `#tabellify-items-table` selectors.

## Test plan
| AC | How |
|---|---|
| AC1–AC9 | Owner smoke test (manual) in the dev profile, Debug Output in `build/debug-N.txt`. AC4/AC5 double as R12 (drag-and-drop works in the tab iframe) |
| AC10 | `tests/unit/table-layout-model.test.mjs` (Node `vm` sandbox, like `tag-monitor-model.test.mjs`) |
| AC11 | `tests/static/workspace-script.test.mjs`, `write-guard`, `no-html-sinks`, `l10n-and-window` |
| AC12 | `tests/static/l10n-and-window.test.mjs` |

**Fallback if R12 fails** (drag events don't fire, or the drop is refused, in the tab iframe):
ship the keyboard moves plus small "Move up / Move down" and "Move left / Move right" buttons,
and record the failure in the API notes. A pointer-events implementation (what Zotero's own
column reorder uses: its `Draggable` component tracks the mouse instead of HTML drag events)
would be a follow-up spec, not improvised.

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Merge the appendix "API notes to merge" into `docs/zotero-api-notes.md` (after the branch editing it lands) | architect / orchestrator | spec approved | `docs/zotero-api-notes.md` |
| T1 | Pure `TabellifyTableLayout` + unit tests (AC10) | developer | spec approved | `src/content/table-layout-model.js`, `tests/unit/table-layout-model.test.mjs` |
| T2 | Formatting: CSS (borders, separate border model, stripes class, hover, sticky header, column classes and widths, wrapping, grip/indicator styles) + narrowed background test (AC12); `stripeFlags` wired in `renderPaperTable`; column classes on cells | developer | T1 | `src/content/workspace.css`, `src/content/workspace.js`, `tests/static/l10n-and-window.test.mjs` |
| T3 | Column reorder: grip column header, grips in `<th>`, `data-column`, header re-ordering, cells in `columnOrder`, drag handlers, Alt+Left/Right, "Reset columns", toolbar + status element, Fluent strings, listener symmetry and script-order checks (AC11) | developer | T2 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/static/workspace-script.test.mjs` |
| T4 | Row reorder + manual order: row grips, drag handlers, auto-scroll, Alt+Up/Down, `manualOrders`, "Manual order" / "Clear manual order", collection switch rule (Q2), announcements | developer | T3 | same files as T3 |
| T5 | `npm test`, `npm run build`; owner smoke test AC1–AC9 (R12 inside AC4/AC5). If R12 fails: Fallback | developer → owner | T4 | — |
| T6 | **Only if Q1 = C and ADR-0014 accepted:** `layout-store.js` (load/save `layout.json` per ADR-0014), pure `validateLayout`/`migrateLayout` in `table-layout-model.js` + tests, wiring in `workspace.js`, one write-guard allow-list entry, extra ACs from ADR-0014 | developer | T4 | `src/content/layout-store.js`, `src/content/table-layout-model.js`, `src/content/workspace.xhtml`, `src/content/workspace.js`, `tests/unit/layout-store.test.mjs`, `tests/unit/table-layout-model.test.mjs`, `tests/static/write-guard.test.mjs` |

T2–T4 touch the same files, so they run one after the other (no parallel worktrees).

**New Fluent IDs (proposed text, owner may change):** `tabellify-column-move` (grip column
header, "Move"), `tabellify-column-grip` (`.aria-label` "Move column"),
`tabellify-table-move-paper` ("Move paper:"), `tabellify-table-manual-order` ("Manual order"),
`tabellify-table-clear-manual` ("Clear manual order"), `tabellify-table-reset-columns`
("Reset columns"), `tabellify-table-moved-to` ("moved to position"), `tabellify-table-of`
("of"). Numbers and titles are appended in JavaScript as plain text, like F005's counts.

## Open questions (each with the recommendation the spec assumes)
1. **Q1 — Should column order and manual row order survive closing the tab / restarting
   Zotero?**
   - **A. Not saved (recommended for 005c).** Kept while the tab is open, across collection
     switches. Zero storage work, no ADR, no write-guard change, smallest change.
     *Trade-off:* closing the tab or restarting Zotero loses a hand-made order.
   - B. Column order in a pref (`extensions.tabellify.tableColumns`, via the already verified
     `Zotero.Prefs.set(name, value, true)`), rows not saved. Small, but a second storage place
     (profile, not data folder) and still loses the row order, which is the larger effort.
     Not recommended.
   - C. Both saved in `<data dir>/tabellify/layout.json` (ADR-0014, drafted, Proposed):
     schema-versioned, per-collection row order keyed by stable collection/item **keys**,
     one global column order. Adds T6 (store file, validation, migration, write-guard entry,
     extra ACs). *Recommended if the answer to Q1 is "yes, save it".*
   - D. Wait for F007 (saved tables) to save layouts. Fine if F007 is near.
2. **Q2 — When you come back to a collection that has a manual order, which order shows?**
   *Recommended: the manual order* (you made it on purpose; one click on a header sorts).
   Alternative: always start in the default sort and click "Manual order".
3. **Q3 — Resizable column widths?** *Recommended: not in 005c.* Fixed, sensible widths plus
   wrapping solve the readability problem; resizing needs pointer tracking (Zotero uses its
   own `Draggable` component) and, to be useful, saving (Q1). Better with F009.
4. **Q4 — Is the narrowed background test (option A) OK?** *Recommended: yes.* It keeps the
   protection for the window background and literal colours and allows only translucent
   text-colour tints and system colours on table cells.
5. **Q5 — Drag a paper while the table is sorted by a column: allowed (turns into manual
   order) or only in manual order?** *Recommended: allowed*; the order you see is the one you
   start from, and the toolbar says "Manual order" afterwards.
6. **Q6 — Keyboard shortcut: Alt+arrows on the grip?** *Recommended: yes* (no conflict with
   Zotero's own table keys, which ignore Alt, `virtualized-table.jsx` `_onKeyDown`: `if
   (e.altKey) return;`; our table is our own document anyway). Alternative: visible
   move-up/down buttons on every row (more clutter).

## Appendix: API notes to merge
**Do not edit `docs/zotero-api-notes.md` from this branch** (another branch is editing it).
Task T0 merges these rows. Checked 2026-11-12 against Zotero source at tag **`10.0.9`** and
Firefox **ESR 140**.

| API / mechanism | Purpose | Status | Versions | Source | Notes |
|---|---|---|---|---|---|
| HTML `draggable="true"` on HTML elements in a chrome XUL document, with native `dragstart` / `dragover` / `drop` / `dragend` listeners | F005c: column and row drag-and-drop in the workspace table | Verified (source, by analogy); **runtime R12** | 10.0.9 | Zotero item tree in `zoteroPane.xhtml`: [src10:`chrome/content/zotero/itemTree.jsx`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/itemTree.jsx) (`_renderItem`: `div.setAttribute('draggable', true);`, `div.addEventListener('dragstart', e => this.onDragStart(e, index), …)`, `div.addEventListener('dragover', …)`, `div.addEventListener('drop', …)`; `onDragOver` calls `event.preventDefault()`); [src10:`chrome/content/zotero/components/virtualized-table.jsx`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/components/virtualized-table.jsx) (`node.addEventListener('dragstart', …)`, `'dragend'`; `_onDragOver` auto-scrolls near the edges; `_rejectStickyHeaderDrop` sets `e.dataTransfer.dropEffect = 'none'`); [MDN: HTML Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API) | Zotero's main window is a XUL document with HTML rows, like our workspace document; our document is in an HTML `<iframe>` in a main-window tab (same process, system principal), which was **not** checked at runtime: R12 = spec F005c AC4/AC5. Zotero's own **column** reorder does **not** use HTML drag events (it uses its `Draggable` component with mouse tracking, `_handleColumnDragStart/Stop`, `delay={500}`), the fallback if R12 fails |
| `DragEvent.dataTransfer`; `DataTransfer.setData(format, data)`, `.getData(format)`, `.types`, `.effectAllowed`, `.dropEffect`, `.setDragImage(element, x, y)` | F005c: start a drag, check its type on `dragover`, show a move cursor | Verified (source) | ESR 140 (Zotero 10.0.9) | moz:[`dom/webidl/DragEvent.webidl`](https://searchfox.org/mozilla-esr140/source/dom/webidl/DragEvent.webidl) (`interface DragEvent : MouseEvent`, `readonly attribute DataTransfer? dataTransfer;`); moz:[`dom/webidl/DataTransfer.webidl`](https://searchfox.org/mozilla-esr140/source/dom/webidl/DataTransfer.webidl) (`attribute DOMString dropEffect;`, `attribute DOMString effectAllowed;`, `readonly attribute sequence<DOMString> types;`, `undefined setDragImage(Element image, long x, long y);`, `undefined setData(DOMString format, DOMString data);`, `DOMString getData(DOMString format);`) | Tabellify calls `setData` with a private type (`application/x-tabellify-row` / `-column`) only so Firefox starts the drag ([bug 725156](https://bugzilla.mozilla.org/show_bug.cgi?id=725156): no drag without `setData`), checks `types` on `dragover`, and **never calls `getData`** (it uses its own in-memory drag state). `DragEvent` inherits `clientX`/`clientY`/`altKey` from `MouseEvent` |
| `<button draggable="true">` does not start a drag in Firefox | F005c: why grips are `<span>`, not `<button>` | Known limitation (Mozilla Bugzilla) | Firefox (status at ESR 140 not re-checked) | [bug 568313 "Impossible to make <button>s draggable"](https://bugzilla.mozilla.org/show_bug.cgi?id=568313); [bug 646823](https://bugzilla.mozilla.org/show_bug.cgi?id=646823) (duplicate report) | Design avoids the issue regardless of its current status |
| CSS `position: sticky` on `th`, `border-collapse: separate`, `table-layout: fixed`, `overflow-wrap: anywhere` | F005c: sticky header, stable widths, wrapping | Verified (docs) | Firefox ESR 140 | MDN: [`position`](https://developer.mozilla.org/en-US/docs/Web/CSS/position), [`table-layout`](https://developer.mozilla.org/en-US/docs/Web/CSS/table-layout), [`overflow-wrap`](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap) | Standard CSS, all supported in Firefox for years. Sticky cells need an opaque background (`-moz-Dialog`, existing row "System colours") |
| `collection.key`, `item.key` (and `libraryKey` = `"<libraryID>/<key>"`) getters | **Only if Q1 = C** (ADR-0014): stable keys for saved row orders | Verified (source) | 10.0.9 | [src10:`chrome/content/zotero/xpcom/data/dataObject.js`](https://github.com/zotero/zotero/blob/10.0.9/chrome/content/zotero/xpcom/data/dataObject.js) (`Zotero.defineProperty(Zotero.DataObject.prototype, 'key', { get: function () { return this._key; } …`; `'libraryKey'` returns `this._libraryID + "/" + this._key`) | Read-only getters on every data object (items and collections). Keys are 8-character strings that stay the same across sync and on other computers; numeric IDs are local to one database. Not in any dev guide |
| Runtime check **R12** (owner): drag-and-drop in the Tabellify tab | F005c | — | 10.0.9 | Spec F005c AC4/AC5 | Cannot be scripted in Run JavaScript (a real mouse drag is needed). Pass = AC4 and AC5 pass. Record result and change the first row's status (owner) |

**Sources (web search used for the Firefox button limitation):**
[bug 568313](https://bugzilla.mozilla.org/show_bug.cgi?id=568313),
[bug 646823](https://bugzilla.mozilla.org/show_bug.cgi?id=646823),
[bug 725156](https://bugzilla.mozilla.org/show_bug.cgi?id=725156).
