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
  **Superseded by Amendment 2:** the mixed top-level order needs a `layout.json` schema 3,
  proposed in **ADR-0019** (`docs/decisions/0019-layout-mixed-top-level-order.md`,
  Status: Proposed). Amendment 2 tasks T6–T9 wait for the owner's decision on ADR-0019.



## Amendment 3 (2026-11-13, owner, after merge): an emptied group turns back into a tag
Owner smoke test: dragging the only tag out of a group made the group vanish (the table hides
0-column groups). Owner rule: tags never disappear; everything is a group, a grouped tag or an
ungrouped tag. Owner chose option B:
- When a drag or Alt+arrow move takes the **last** tag out of a group, that group is removed and
  its name becomes an **ungrouped tag** in the codebook (unless a tag with that exact name
  already exists, in which case the group is just removed), placed where the group was.
- Applies to every group emptied by a drag/keyboard move, including groups typed in the script
  box. Replaces Q3 ("G · 0" stays) for drag moves. The refusal added in fix `a8837ce` is
  replaced by this rule; the "nothing ever vanishes" invariant and its exhaustive test stay.
- Script-box and editor behaviour are unchanged.

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

## Amendment 2 (2026-11-13): the cell edge decides; ungrouped tags anywhere at the top level

**Status of Amendment 2:** Approved by the owner 2026-11-13 (all recommendations A2-Q1 to A2-Q12; ADR-0019 accepted).
- **Status:** rules approved by the owner ("yes", 2026-11-13). The details below (edge
  geometry, indicators, hint texts, keyboard mapping, storage) are **Proposed**, waiting for
  the owner's answers to A2-Q1 – A2-Q12 and a decision on **ADR-0019** (`layout.json`
  schema 3, Status: Proposed).
- **Where this wins:** where Amendment 2 and older text in this spec disagree, Amendment 2
  applies. It **replaces**: the super-header row as an "ungroup" zone (rules table row
  "Super-header cell", Q8), the single ungrouped block and its blank header (ADR-0016 §5
  view, §6 default position is kept as the home marker, ADR-0019 §1), the Alt+Up / Alt+Down
  meaning (Q1, "Keyboard"), the dashed "ungroup" indicator, the `tabellify-drop-hint-ungroup`
  text, and ACs AC3, AC6, AC8, AC13, AC14 (replaced by AC16–AC31 below). Amendment 1 (a nest
  makes B only a group name) stays and is extended to the flipped case.
- **Unchanged:** no library write; one codebook save per regroup through
  `applyCodebookEdit`, codebook first and layout second; whole-group drags never write the
  codebook; "Reset columns" never undoes grouping; Q2 (reuse a group with the same name,
  ignoring case), Q3 (an emptied group stays as "G · 0"), Q4 (no undo button), Q7.

### A2.1 Background for a JavaScript learner
- **Header tree:** the table header has at most two levels: a **super-header** (a group's
  name, or "Ungrouped") above its **sub-headers** (one per tag column). There is never a third
  level, so a group can't go inside a group, and a tag inside a group can't get tags under it.
- **Top level:** the left-to-right list of things directly under the top header row: whole
  groups, and single ungrouped tags. Ungrouped tags that sit next to each other form a
  **run**; each run gets its own "Ungrouped" super-header. A run is not stored anywhere: it
  appears whenever ungrouped tags are neighbours (ADR-0019 §2).
- **Edge:** while dragging, the browser gives the pointer position (`event.clientX`,
  `clientY`, in pixels from the window's top-left corner) and the code asks the cell under the
  pointer for its rectangle (`getBoundingClientRect()`, same coordinate system). Comparing the
  two tells which part of the cell the pointer is in: near its left, right, top or bottom.
- **Fallback:** some edges are not allowed on some cells (a tag can't go above a group). Then
  the drop acts as if the pointer were at the nearer of the cell's left or right edge, and the
  indicator and hint show that fallback result, so what you see is always what you get.

### A2.2 Rules (owner, 2026-11-13)
A = the dragged tag column. "Becomes a group name" = Amendment 1: the group with that name
(ignoring case, Q2) is reused or a new group with exactly that spelling is created, and that
**tag** leaves the codebook (its column and its k/M count go; nothing changes in Zotero).
"Top-level position" = ADR-0019 `topOrder`.

**Table 1: A dropped on an ungrouped tag B (its header, or below it, A2.4)**
| Edge | Result | Writes | Where it lands |
|---|---|---|---|
| Bottom | **B becomes a group name**; A goes under it (A leaves its own group if it had one) | codebook, then layout | New group: **B's top-level position**. Reused group: stays where it is, A at its end |
| Top (flipped) | **A becomes a group name** (A leaves its own group, if any, and the codebook as a tag); B goes under it | codebook, then layout | New group: **B's top-level position**. Reused group (named like A, ignoring case; may be A's own group): stays where it is, B at its end |
| Left / right | A sits **beside B as an ungrouped tag** (sibling). A already ungrouped: a reorder | A ungrouped: layout only. A in a group: codebook (A ungrouped), then layout | Right before / after B at the top level (same run as B) |
| any | A = B | nothing (no indicator) | — |

**Table 2: A dropped on a group's super-header G (e.g. "zotero")**
| Edge | Result | Writes | Where it lands |
|---|---|---|---|
| Bottom | A **joins G** (child) | A not in G: codebook, then layout. A already in G: layout only | End of G (A2-Q2) |
| Left / right | A sits **beside G as an ungrouped top-level tag** (same level as G). This is now how a tag leaves its group by mouse | A ungrouped: layout only. A in any group (G included): codebook, then layout | Right before / after G at the top level |
| Top | Not allowed (a tag can't be above a group) → **falls back** to the nearer of left / right | as left / right | as left / right |

**Table 3: A dropped on a tag B inside a group G (sub-header)**
| Edge | Result | Writes | Where it lands |
|---|---|---|---|
| Left / right | A **joins G beside B**. A already in G: a reorder inside G (F005c) | A not in G: codebook, then layout. A in G: layout only | Right before / after B inside G |
| Top / bottom | Not allowed (no third level) → **falls back** to the nearer of left / right | as left / right | as left / right |

**Table 4: A dropped on an "Ungrouped" run super-header R** (not covered by the owner's
rules; proposed, A2-Q3)
| Edge | Result | Writes | Where it lands |
|---|---|---|---|
| Left | A becomes / stays **ungrouped** | A in a group: codebook, then layout. A ungrouped: layout only | Before R's first tag |
| Right, bottom | same | same | After R's last tag |
| Top | Not allowed → falls back to left / right | as left / right | as left / right |
| any | R holds only A | nothing | — |

**Other places** (unchanged unless stated):
- **Body cells below tag B** stay an **alias of B's header with the bottom edge** (A2-Q8): below
  an ungrouped B they nest (Table 1, bottom; as AC4 / Amendment 1); below a B inside a group
  the bottom edge is not allowed, so they fall back to left / right of B by the pointer's half
  of the cell (Table 3; today's Q7 "right after B" becomes "before or after B").
- Title, k/M, the grip column, outside the table: refused (no indicator).
- **Whole-group drags** (grip on a group's super-header) only reorder the top level, layout
  only, never the codebook: over any header cell of a group → before / after that group (as
  F005c); over an ungrouped tag's header → before / after that tag (so a group can be put
  between ungrouped tags); over a run's super-header → before its first / after its last tag.
  The pointer's half of the cell decides before / after. Groups can't be dropped into groups.
- "Ungrouped" run super-headers have **no grip** (A2-Q4): runs are not things that move;
  move their tags one by one (mouse or Alt+Left / Alt+Right).

### A2.3 Edge geometry (pure: `TabellifyTableLayout.dropEdge(x, y, rect)`)
The cell is the header cell under the pointer (`event.target.closest(…)`, as today) or, for
the body alias, the body cell.
```
rect  = cell.getBoundingClientRect()            // left, top, width, height in CSS pixels
fx    = clamp((x - rect.left) / rect.width,  0, 1)   // 0 = left border, 1 = right border
fy    = clamp((y - rect.top)  / rect.height, 0, 1)   // 0 = top border, 1 = bottom border
side  = fx < 0.5 ? "left" : "right"             // same split as today's dropSide()
edge  = fx < BAND      ? "left"
      : fx > 1 - BAND  ? "right"
      : fy < 0.5       ? "top" : "bottom"       // BAND = 0.25
returns { edge, side }   // width or height 0 (hidden cell): edge = side
```
So each cell has four zones: its outer quarter on each side (left, right; full height) and
the middle half split into an upper half (top) and lower half (bottom). On a 120 × 28 px
header cell that is 30 px of "left", 30 px of "right", and a 60 × 14 px "top" and "bottom".
Why proportional bands rather than raw pixel distance to the nearest border: header cells are
wide and short, so with raw distance "left" / "right" would shrink to a thin strip about 14 px
wide, making a sideways move (the most common one, and harmless) hard, and making top /
bottom (which remove a tag from the codebook) easy to hit by accident. A2-Q1 offers the
diagonal ("X") split as the alternative.

**Fallback** (pure, in `TabellifyRegroup`, so Node tests cover it): when `edge` is not allowed
on that cell (top on a group super-header or run super-header; top or bottom on a sub-header),
use `side` instead. Body cells always pass `edge: "bottom"` with their own `side`.
The resolved edge (after fallback) is what the indicator, the hint and the drop all use.

### A2.4 Header rendering
- `TabellifyTableLayout.orderedGroups` returns the shown blocks in top-level order (ADR-0019
  §2): groups `{ id, name, tags }` and runs `{ id: "ungrouped", run: k, name: "", tags,
  ungrouped: true }`, `k` = 0, 1, … from the left.
- Each run's super-header cell shows the text **"Ungrouped"** (new Fluent ID
  `tabellify-table-ungrouped-label`, set with `textContent`) in the existing muted style
  (`.tabellify-col-group-ungrouped`: `--tabellify-color-text-muted`; no new token), spans the
  run's tags, carries `data-group-id="ungrouped"` and `data-run="<k>"`, and has **no grip**.
  The blank header and its `aria-label` override go (the visible text names it).
- Tag headers and body cells of ungrouped tags keep `data-group-id="ungrouped"` (the
  codebook block, one for all runs; `TabellifyRegroup` needs nothing more). Code that looked up
  "the" ungrouped header (`columnHeader("ungrouped")`) uses a new `runHeader(k)` instead.
- **One-row header rule kept:** when no group has a column (only ungrouped tags, which then
  form one run), the super-header row stays hidden, as in 006a, so no "Ungrouped" label shows.
  **No conflict:** in that layout the tag headers sit in the first row and keep all four edges
  (top = flip, bottom = nest, left / right = reorder). The first nest or flip creates a group
  and the header becomes two rows. (006a's condition "no real group has columns" is kept; an
  empty group "G · 0" has no column and does not make a second row.)
- **Pills:** still one "Ungrouped · N" pill (N = all ungrouped tags), at the position of the
  first run (A2-Q9).

### A2.5 Where things land in `layout.json` (pure, `TabellifyRegroup.plan`)
`T` = `TabellifyTableLayout.topItems(groupsBefore, columnLayout)`: the shown top-level order as
`{ group }` / `{ tag }` entries **including the home marker** `{ group: "ungrouped" }` at its
place (ADR-0019 §2). Every plan writes the full, explicit `{ topOrder: T', tagOrder }`:
| Result | `topOrder` (T → T') | `tagOrder` |
|---|---|---|
| Top-level reorder / A becomes ungrouped beside X | remove `{ tag: A }`; insert it right before / after X (X = `{ tag: B }`, `{ group: G }`, or the first / last tag of run R) | A pruned from every group's list |
| A joins G (beside B, or at G's end) | remove `{ tag: A }` if present | `tagOrder[G]` = G's shown tags with A inserted (before / after B, or at the end); A pruned elsewhere |
| Bottom nest, new group N | replace `{ tag: B }` by `{ group: N }`; remove `{ tag: A }` | `tagOrder[N] = [A]`; A and B pruned elsewhere |
| Flipped nest, new group N | replace `{ tag: B }` by `{ group: N }`; remove `{ tag: A }` | `tagOrder[N] = [B]`; A and B pruned elsewhere |
| Nest / flip into a reused group R' | remove `{ tag: B }` and `{ tag: A }`; R' keeps its place | `tagOrder[R']` = shown tags + A (bottom) or + B (top); A and B pruned elsewhere |

Kept rules: a plan whose codebook edit changes nothing is `kind: "reorder"` (old rule 7); the
moved tag's place is computed from what is shown now, so stale saved entries never win (old
rule 2); the home marker is copied through unchanged.

### A2.6 Pure logic changes
- **`TabellifyCodebook.tagToGroupName(data, nameTag, childTag)`** (new, `codebook-model.js`):
  refuse with `ERR_TAG_MISSING` if either tag is missing or they are equal; otherwise reuse the
  group named like `nameTag` (ignoring case, stored spelling wins) or `pushGroup(next,
  nameTag)`; remove the `nameTag` record (wherever it was, grouped or not); move `childTag`
  into the group (end of list) unless already there. Returns `{ ok: true, data, groupId,
  created }`. `groupUnderTag`'s "anchor ungrouped" branch becomes
  `tagToGroupName(data, anchor, tag)` (same behaviour; its tests keep passing). The bottom
  nest calls `groupUnderTag(A, B)`; the flip calls `tagToGroupName(data, A, B)`.
- **`TabellifyRegroup` target shape** (replaces `zone: header | body | super`):
  `{ cell: "tag" | "group" | "run", groupId, tag?, run?, edge, side }` (`tag` for tag cells,
  `run` = k for run headers). `plan` and `describe` apply Tables 1–4 and the fallback;
  `describe` also returns the **resolved edge** for the indicator, and the hint key.
  Plan effects: `joined`, `created`, `ungrouped`, plus `named: "below" | "above" | null`
  (which tag became the group name; replaces the boolean `nest`).
- **`TabellifyTableLayout`** (ADR-0019): `SCHEMA_VERSION` 3, `emptyColumnLayout()` →
  `{ topOrder: [], tagOrder: {} }`, `topItems`, run-aware `orderedGroups`, `isCodebookOrder`,
  `moveTopItem` / `moveTopItemBy` (groups and ungrouped tags among the top level), `moveTag` /
  `moveTagBy` for tags inside a group only, `dropEdge`, `validateLayout` / `migrateLayout`
  (1 → 2 → 3), `layoutData`. `withGroupOrder` becomes `withTopOrder`.

### A2.7 Drop indicators (design tokens only, no new colour token, no background)
Shown for the **resolved** result. They differ by shape, and the hint names the result, so
meaning never depends on colour (design-system rule). Line width
`--tabellify-border-width-strong`, colour `--tabellify-color-action`, drawn with inset
`box-shadow` as today.
| Result | Classes | Look |
|---|---|---|
| Left / right of a tag (sibling, reorder, join beside B) | `tabellify-drop-before` / `-after` on the target header (existing) | vertical line on that side |
| ... and A changes group (joins G) | plus `tabellify-drop-into` on G's super-header (existing) | line under G's name |
| Bottom of ungrouped B (nest) | **new** `tabellify-drop-below` on B's header; `tabellify-drop-nest` on B's body cells (existing) | line along the bottom of B's header; lines on both sides of B's cells |
| Top of ungrouped B (flip) | **new** `tabellify-drop-above` on B's header | line along the top of B's header |
| Bottom of group G (join at end) | `tabellify-drop-into` on G's super-header, `tabellify-drop-after` on G's last tag header | line under G's name and at G's right end |
| Left / right of group G or of run R | `tabellify-drop-before` on the super-header and on its first tag header / `tabellify-drop-after` on the super-header and its last tag header | one vertical line through both header rows |
`tabellify-drop-ungroup` (dashed outline over the whole super-header row) is **retired** with its
CSS rule, its `DROP_CLASSES` entry and its design-system sample (A2-Q11). `dropKey` includes
the resolved edge and the run index, so the DOM changes only when the result changes.
CSS (new rules):
```css
.tabellify-grid th.tabellify-drop-above {
  box-shadow: inset 0 var(--tabellify-border-width-strong) 0 var(--tabellify-color-action);
}
.tabellify-grid th.tabellify-drop-below {
  box-shadow: inset 0 calc(-1 * var(--tabellify-border-width-strong)) 0 var(--tabellify-color-action);
}
```

### A2.8 Drop hint and status texts (Fluent, no arguments; the name is appended as plain text after the text, as the current code does)
| Result | Fluent ID | Text (en-US, owner may change) | Name appended |
|---|---|---|---|
| Any reorder (layout only) | `tabellify-drop-hint-reorder` (existing) | Move column here | — |
| A joins group G | `tabellify-drop-hint-join` (existing) | Move into group: | G's name |
| A becomes ungrouped (Tables 1, 2, 4 left / right) | `tabellify-drop-hint-to-ungrouped` (existing) | Move to Ungrouped | — |
| Bottom nest (B becomes the name) | `tabellify-drop-hint-new-group` (existing) | Turn into a group name: | B (or the reused group's stored spelling) |
| Flip (A becomes the name) | `tabellify-drop-hint-new-group` (existing) | Turn into a group name: | A (or the reused group's stored spelling) |
New IDs: `tabellify-table-ungrouped-label` = Ungrouped; `tabellify-regroup-announce-group-name`
= is now a group name (keyboard flip: "smoker is now a group name" names A).
Retired: `tabellify-drop-hint-ungroup` (no zone uses it); `tabellify-table-ungrouped-header`
if nothing references it after T9 (the static Fluent check reports unused IDs either way).
Status lines unchanged: a flip uses `tabellify-regroup-created` ("The tag is now a group
name.") like the bottom nest.

### A2.9 Keyboard (Alt only, on a focused tag-column grip; Option on macOS)
The keys replay the mouse rules; each key equals one drop, through the same `plan`.
| Key | A inside group G | A ungrouped |
|---|---|---|
| Alt+Left / Alt+Right | Move one place inside G; nothing at G's edges (unchanged, layout only) | Move one **top-level** place: past one ungrouped tag or past a whole group (layout only) |
| Alt+Up | **Leave G**: A becomes ungrouped beside G, **before** G if A is G's first shown tag, otherwise **after** G (= Table 2 left / right), so the column barely moves | Left neighbour is an ungrouped tag B: **flip**, A becomes a group name over B (= Table 1 top on B). Left neighbour is a group, or none: nothing |
| Alt+Down | Nothing (no third level) | Left neighbour is an ungrouped tag B: **nest**, B becomes a group name, A under it (= Table 1 bottom on B). Left neighbour is a group G: A joins G at its end (= Table 2 bottom). None: nothing |
- Group grips: Alt+Left / Alt+Right move the group one top-level place (past one ungrouped
  tag or one group). Row grips: unchanged.
- After the change focus goes to A's grip; after a flip (A is no column any more) to the new
  group's grip. Announcements as today ("Temperature moved to group Outcome", "Heat index is
  now ungrouped"), plus "smoker is now a group name" for a flip.
- `aria-keyshortcuts` unchanged (tag grips list the four Alt+arrow keys).
- "Left neighbour" = the top-level item directly left of A in the shown order (A2-Q7 on the
  choice of the left side for both keys).

### A2.10 Zotero / Mozilla APIs
No new `Zotero.*` call and no new event. Used: `MouseEvent.clientX` / `clientY` (existing
F005c `DragEvent` row) and `Element.getBoundingClientRect()` → `DOMRect` (already called in
`workspace.js`; its own row added to `docs/zotero-api-notes.md` as "Feature 006c Amendment 2",
Verified (docs), Firefox ESR 140).

### A2.11 Data safety (changes only)
- Library: **nothing written** (unchanged). A flip removes tag A from the **codebook** only,
  as the bottom nest removes B (Amendment 1); the Zotero tag and its uses stay.
- `codebooks.json`: **shape unchanged** (ungrouped tags still `group: null`); written only
  through `applyCodebookEdit` (revision check, atomic, `.bak`).
- `layout.json`: schema 3 (ADR-0019), migrated in memory on load, rewritten only by the next
  save after a user action (version 2 kept as `layout.json.bak`); older builds treat it as
  "newer" and never overwrite it. No new file, no new write-guard entry.
- Names stay text-only (`textContent`, `dataset`, `setAttribute`); the run index in
  `data-run` is a number made by our code. Debug Output: IDs, run indexes, edges and counts
  only, never tag or group names (e.g. `regroup: tag dropped on the top edge of an ungrouped
  tag; group g7 created (drag)`).

### A2.12 Acceptance criteria (Amendment 2)
`[manual]` = owner smoke test in the dev profile (Zotero 10.0.9), collection "F005 test".
**Setup** (script box, one entry per Enter): `Exposure(Heat index, Temperature),
Outcome(Hospitalization, Mortality)`, then `age, sex, smoker, bmi, diet`. Expected start: an
"Ungrouped" super-header over `age`, `sex`, `smoker`, `bmi`, `diet` on the left, then
"Exposure", "Outcome". Run AC16–AC24 in order (each starts from the previous result). "Top / bottom / left / right of a header" = hold the pointer in that part of the
cell (outer quarter for left / right, upper / lower half of the middle for top / bottom).
Kept from above: AC1, AC2, AC5, AC7, AC9, AC10, AC11 (AC4 as amended by Amendment 1).

- [ ] AC16 `[manual]` **"Ungrouped" header.** The super-header over the ungrouped tags reads
  "Ungrouped" in the muted (grey) text and has no grip. With a codebook that has only
  ungrouped tags (type `x1, x2` in a fresh codebook, or remove the groups), the header is one
  row and no "Ungrouped" text shows.
- [ ] AC17 `[manual]` **Bottom of an ungrouped tag (nest).** Dragging `sex` to the bottom of
  `age`'s header shows a line along the bottom of `age`'s header and lines beside `age`'s
  cells, hint "Turn into a group name: age". After the drop: super-header "age" over `sex`
  only, where `age` was; no `age` column; pill "age · 1"; status "Codebook saved. The tag is
  now a group name.".
- [ ] AC18 `[manual]` **Top of an ungrouped tag (flip).** Dragging `bmi` to the top of
  `smoker`'s header shows a line along the top of `smoker`'s header, hint "Turn into a group
  name: bmi". After the drop: super-header "bmi" over `smoker`, where `smoker` was; no `bmi`
  column; pill "bmi · 1".
- [ ] AC19 `[manual]` **Left / right of an ungrouped tag.** Dragging `Temperature` to the
  left part of `diet`'s header shows a vertical line on that side, hint "Move to
  Ungrouped"; after the drop `Temperature` is ungrouped right before `diet`, under the same
  "Ungrouped" header; "Exposure · 1". Dragging `diet` to the left part of `Temperature`'s
  header only reorders (hint "Move column here"; `revision` in `codebooks.json` unchanged);
  drag it back.
- [ ] AC20 `[manual]` **Group super-header.** Dragging `Heat index` to the bottom of
  "Outcome" shows a line under "Outcome" and at its right end, hint "Move into group:
  Outcome", and puts `Heat index` last in "Outcome". Dragging `Mortality` to the right part
  of "Outcome" shows one vertical line through both header rows, hint "Move to Ungrouped";
  after the drop `Mortality` sits right of "Outcome" with its own "Ungrouped" header.
  Holding the pointer at the top of "Outcome" never shows a line above it: it shows the left
  or right line instead (fallback).
- [ ] AC21 `[manual]` **Sub-header.** Holding `Temperature` at the top or bottom of
  `Hospitalization`'s header shows only the left or right line (fallback), hint "Move into
  group: Outcome"; after the drop `Temperature` is in "Outcome" beside `Hospitalization`.
  No third header row ever appears.
- [ ] AC22 `[manual]` **Runs.** Now there are two "Ungrouped" headers (one over `diet`, one
  over `Mortality` right of "Outcome"). Dragging `Mortality` to the right part of `diet`'s
  header leaves one "Ungrouped" header (over `diet`, `Mortality`); the pills show one
  "Ungrouped · 2". Closing and reopening
  the Tabellify tab keeps groups, runs and positions. "Reset columns" puts all ungrouped tags
  back in one run at the left and changes no pill count.
- [ ] AC23 `[manual]` **Below a column (alias).** Dropping on the cells under an ungrouped tag
  does the same as its bottom edge (AC17). Dropping on the left / right half of the cells
  under a tag inside a group puts the dragged tag into that group before / after it.
- [ ] AC24 `[manual]` **Keyboard** (Tab to a column grip; Alt = Option). (a) On
  `Temperature`'s grip (in "Outcome"): Alt+Down does nothing; Alt+Right stops at the end of
  "Outcome"; Alt+Up makes it ungrouped right beside "Outcome", focus stays on its grip, and it
  is announced with VoiceOver on. Alt+Left / Alt+Right on it now step past the whole
  "Outcome" group in one press. (b) On `Mortality`'s grip (left neighbour `diet`): Alt+Up
  turns `Mortality` into a group name over `diet`; focus is on the "Mortality" group's grip.
  (c) Type `x1, x2` in the script box: they appear as one run where the old ungrouped block
  used to be (far left unless that block had been moved before this build). On `x2`'s grip,
  Alt+Down turns `x1` into a group name over `x2`.
- [ ] AC25 `[manual]` **Upgrade of the saved layout.** Before installing this build, note the
  column order in the dev profile. After installing: same order (the ungrouped block where it
  was). After the first move, `~/Zotero tabellify-dev/tabellify/layout.json` starts with
  `"schemaVersion": 3` and `layout.json.bak` holds the previous version 2 file.
- [ ] AC26 `[manual]` **Safety.** The indicators are visible in Light and Dark. The dev Zotero
  tag selector shows no new tag and still lists `age`, `bmi` (only the codebook dropped them).
  Debug Output has no Tabellify errors and no tag or group names in `regroup:` / `layout:`
  lines.
- [ ] AC27 `[auto]` **`dropEdge`** (`tests/unit/table-layout-model.test.mjs`): the four
  zones with BAND 0.25 (corners, middle line, exact borders), `side`, pointer outside the rect
  (clamped), zero width / height → side.
- [ ] AC28 `[auto]` **Layout schema 3** (`tests/unit/table-layout-model.test.mjs`,
  `tests/unit/layout-store.test.mjs`): `topItems` (stale `{ group }` / `{ tag }` skipped;
  grouped tag listed as `{ tag }` skipped; unlisted ungrouped tags at the marker, or first
  without one; unlisted groups appended; repeats dropped); `orderedGroups` builds runs with
  indexes; `validateLayout` v3 frame, v4 → newer; cleaning (bad entries, two keys,
  `"__proto__"` as tag name and as key, second marker dropped, `tagOrder.ungrouped` dropped);
  migration 1 → 3 and 2 → 3 for: `"ungrouped"` first / middle / missing with non-empty
  `groupOrder` (appended) / empty `groupOrder`, with and without `tagOrder.ungrouped`; the
  migrated layout shows exactly the schema 2 order; `moveTopItem(By)`; `saveData` writes
  version 3 over a version 2 file with the same revision and refuses a version 4 file.
- [ ] AC29 `[auto]` **`tagToGroupName`** (`tests/unit/codebook-model.test.mjs`): new group
  named exactly like the tag, `nextId` + 1, `created: true`; reuse ignoring case (incl. the
  name tag's own group); name tag removed whether it was grouped or ungrouped; child moved
  to the end; missing / equal tags refused; input not mutated; result passes `validate`;
  existing `groupUnderTag` tests unchanged and passing.
- [ ] AC30 `[auto]` **`TabellifyRegroup`** (`tests/unit/regroup-model.test.mjs`, rewritten):
  every row of Tables 1–4, the body alias, every fallback (group top, run top, sub-header
  top / bottom), A = B; the `layout.json` result of every row of A2.5 (positions in
  `orderedGroups`, home marker kept, pruning); collisions; codebook-unchanged plans are
  `reorder`; `describe` returns hint, name and resolved edge; inputs not mutated.
- [ ] AC31 `[auto]` **Workspace** (`tests/unit/workspace-table.test.mjs`, fake DOM): run
  headers with "Ungrouped" text, `data-run`, no grip; one-row header when no group has a
  column; `dragover` with `clientX` / `clientY` at each zone of a tag header, group header,
  run header and body cell gives the right classes and hint (fallbacks included); regroup
  zones refused while the codebook can't be saved; whole-group drag between ungrouped tags;
  the keyboard table of A2.9 (plans, focus, announcements); `endDrag` clears
  `tabellify-drop-above` / `-below`; one "Ungrouped" pill. Static checks as AC15, with
  `tabellify-drop-ungroup` and `tabellify-drop-hint-ungroup` gone and the new Fluent IDs
  present; no new Zotero allow-list or write-guard entry.

### A2.13 Task breakdown (Amendment 2)
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T5 | Owner answers A2-Q1 – A2-Q12 and decides ADR-0019 | owner / orchestrator | — | — |
| T6 | `layout.json` schema 3: `topItems`, run-aware `orderedGroups`, top-level moves, `dropEdge`, validation, migration 1 → 2 → 3, `layoutData` + tests (AC27, AC28) | developer | T5 | `src/content/table-layout-model.js`, `src/content/layout-store.js` (comments / JSDoc only), `tests/unit/table-layout-model.test.mjs`, `tests/unit/layout-store.test.mjs` |
| T7 | `tagToGroupName`; `groupUnderTag` delegates to it + tests (AC29) | developer | T5 (parallel with T6: no shared file) | `src/content/codebook-model.js`, `tests/unit/codebook-model.test.mjs` |
| T8 | `TabellifyRegroup` for Tables 1–4, fallback, A2.5 placement, `describe` with edge + tests (AC30) | developer | T6, T7 | `src/content/regroup-model.js`, `tests/unit/regroup-model.test.mjs` |
| T9 | Workspace: run headers ("Ungrouped", `data-run`, no grip), `runHeader`, edge-based `tagDropTarget` with body alias, group drags over the mixed top level, indicators, hints, keyboard table, focus / announcements, pills, `columnLayout` shape in load / save / reset / logs; CSS; Fluent; static checks; design-system samples (AC31) | developer | T8 | `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs`, `tests/static/l10n-and-window.test.mjs` (only if its lists name the retired IDs / classes), `docs/design-system-states.html`, `docs/design-system.md` |
| T10 | `npm test`, `npm run build`; owner smoke test AC1, AC2, AC5, AC7, AC9–AC11, AC16–AC26 | developer → owner | T9 | — |
T6 and T7 may run in parallel (worktrees from the branch tip are needed: they build on unmerged
006c work, so the orchestrator runs them in this branch one after the other if worktrees can't
start from it). T8 and T9 are separate commits (one concern each). `workspace.xhtml` needs no
change (script order and the hint element stay).

### A2.14 Open questions (each with the recommendation this amendment assumes)
1. **A2-Q1 Edge zones.** *Recommended:* proportional bands (outer quarter = left / right,
   middle half split into top / bottom). Alternative: diagonal "X" split (true nearest edge in
   proportion; top / bottom then cover most of a wide cell, so sideways moves get harder).
2. **A2-Q2 Where A lands on a group's bottom edge.** *Recommended:* at the end of the group.
   Alternative: under the sub-header column the pointer is above (more precise, more code and
   a less obvious indicator).
3. **A2-Q3 Drops on an "Ungrouped" run header** (not in the owner's rules). *Recommended:*
   Table 4 (left = start of the run, right / bottom = end, top falls back). Alternative:
   refuse drops on run headers.
4. **A2-Q4 Grip on run headers.** *Recommended:* none (runs form by adjacency; tags move one
   by one). Alternative: a grip that moves the whole run as a unit.
5. **A2-Q5 Where new ungrouped tags appear** (script box). *Recommended:* at the home marker
   (where the old ungrouped block was; far left by default), ADR-0019 Q2.
6. **A2-Q6 Flip when A is in a group.** *Recommended:* allowed: A leaves its group and becomes
   a group name at B's place. Alternative: top edge only for an ungrouped A (others fall back).
7. **A2-Q7 Keyboard.** *Recommended:* A2.9 (Alt+Up on a grouped tag leaves the group;
   Alt+Up / Alt+Down on an ungrouped tag flip / nest with the **left** neighbour, so the two
   keys are mirror images on the same pair). Alternative: Alt+Up on an ungrouped tag does
   nothing (safer: the flip removes the focused tag from the codebook; the mouse and script
   box can still do it).
8. **A2-Q8 Body cells.** *Recommended:* keep them as an alias of the bottom edge (a big,
   easy target for the nest; under a grouped tag they fall back to left / right). Alternative:
   body cells refused (only header edges count).
9. **A2-Q9 Pills with several runs.** *Recommended:* one "Ungrouped · N" pill at the first
   run's position. Alternative: one pill per run.
10. **A2-Q10 Copy of the old layout.** *Recommended:* no one-time `layout.v2.json`; the `.bak`
    of the first save is enough (orders only). ADR-0019 Q3.
11. **A2-Q11 Dashed "ungroup" indicator.** *Recommended:* retire it (no zone ungroups the
    whole row any more). Alternative: keep it on the target super-header for "Move to
    Ungrouped" drops.
12. **A2-Q12 Reset columns with runs.** *Recommended:* reset joins all ungrouped tags into one
    run at the left (the default order); grouping unchanged.

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
