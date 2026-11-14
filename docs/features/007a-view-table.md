# Feature 007a: "View table" modal (Name and Description, not saved)

- **Status:** Approved (owner, 2026-11-14, all recommendations Q1–Q13; RT-S3 and RT-S3b passed)
- **Branch:** `feat/007a-view-table` (from `main` after F008, merged as `6913524`)
- **Related ADRs:** 0015 (Accepted: design tokens), 0017 (CSV export; 007a reuses its save
  path unchanged), 0016 / 0019 (Accepted: ungrouped tags, column order), 0011 (security
  review), 0003 (no bundler), 0009 (workspace tab). **No new ADR** (see "Does this need an
  ADR?"). PRD §3 step 5 ("Visualize the table"), §4 ("Generate → note-like modal: Name +
  Description form → rendered table → `NAME.csv`"), §6. Outline:
  `docs/features/006a-workspace-restructure.md`, "Later phases → 007a". Export hook:
  `docs/features/008-export-csv.md`, "Hook for 007a".
- **Process:** prototype mode (CLAUDE.md). Owner runs **RT-S3 first** (AC1, before
  development; it decides the modal mechanism). Developer builds; `npm test` + `npm run
  build` pass; owner runs one smoke test (the `[manual]` ACs) with Debug Output in
  `build/debug-N.txt`.

## Owner's request (2026-11-13)
"View table: opens the rendered table in a modal (name + description fields, as in the
product requirements)." Phase plan: "'View table' button: table in a modal with Name +
Description fields (not saved; Name becomes the CSV file name)". Added 2026-11-13: the
"CSV saved: …" line under the table stays when another collection is chosen; it should go.

## Problem / objective
The per-paper table is edited in a busy page (script box, pills, toolbar, grips, sort
buttons). The PRD sketch shows a calmer step: give the table a **Name** and a
**Description**, see the **finished table** on its own, and export it as `NAME.csv`. 007a
adds a **"View table"** button that opens the current table read-only in a **modal** (a box
over the page that must be closed before the page can be used again) with Name and
Description fields and an **"Export CSV"** button that uses the Name as the file name.

Name and Description are **not saved** in 007a (saving is 007b, ADR-0018). This spec
recommends keeping them in memory while the tab is open (Q2). Nothing is written to the
library, and 007a creates no new kind of file.

Also in scope: a one-line fix so the export status line is cleared when the user chooses
another collection.

## Scope
**In scope:**
1. A "View table" button in the actions block under the table, **left of** "Export CSV".
2. The modal, inside the workspace document: heading, a short "not saved" note, Name field
   (filled in with the collection name), Description field, a **read-only copy** of the
   table as shown (same columns, same order, same rows, same ✓ and k/M), "Export CSV" and
   "Close" buttons, and its own export status line.
3. Closing with "Close" or Esc; keyboard focus kept inside the modal while it is open and
   returned to "View table" afterwards.
4. Export from the modal through the existing F008 path (`exportCsv(baseName)`), with the
   Name as the base of the suggested file name.
5. Name and Description remembered **per collection, in memory, while the tab is open**
   (Q2). Lost when the tab closes or Zotero quits.
6. The fix: `showCollection` clears the export status line when a collection is chosen
   (also when the placeholder is chosen). Refresh and live updates keep it.
7. Fluent strings, CSS (tokens only), tests.

**Out of scope (non-goals):**
- Saving name, description or the table configuration; a list of saved tables (007b,
  ADR-0018).
- Writing the Description anywhere (not in the CSV, Q5; not to disk).
- Editing the table inside the modal (no sorting, dragging, regrouping, script box).
- Sticky header rows inside the modal (Q8), print layout (Q9), XLSX.
- Any library write, any new `Zotero.*` call, any new file write or write-guard entry.

## User stories
- As a researcher, I click "View table" and see my table on its own, exactly as it is in the
  workspace, without grips and buttons in the way.
- As a researcher, I type a name such as "Heat and hospitalization" and a short description,
  click "Export CSV", and the save dialog suggests that name.
- As a researcher, a wide table scrolls sideways inside the modal; the buttons stay where
  they are.
- As a researcher using the keyboard, Tab moves through the modal's fields and buttons only,
  Esc closes it, and I land back on "View table".
- As a researcher, if I close and reopen the modal, my name and description are still
  there until I close the Tabellify tab; the modal tells me they are not saved yet.
- As a researcher, when I choose another collection, the old "CSV saved: …" line goes away.
- As a researcher, I trust that viewing or naming a table never changes my Zotero library.

## Design

### Background for a JavaScript learner
- **Modal dialog:** a box in front of the page. While it is open, the page behind it cannot
  be clicked or reached with Tab ("inert"). HTML has a built-in element for this,
  `<dialog>`: `dialog.showModal()` opens it as a modal, `dialog.close()` closes it, and Esc
  closes it too. The browser also draws a faint layer behind it (the "backdrop").
- **Only our document is blocked.** The Tabellify page runs inside an `<iframe>` in Zotero's
  main window. MDN: "Only the containing document becomes blocked; if the dialog is rendered
  inside an iframe, the rest of the page remains interactive." So Zotero's tab bar and other
  tabs stay usable while the modal is open. That is fine (and why the table in the modal
  must keep up with library changes, see "Live updates").
- **Focus:** the element that receives key presses. "Return focus" means: after the modal
  closes, the cursor is back on the button that opened it, so a keyboard user does not get
  lost.
- **In memory vs saved:** a value kept in a JavaScript variable lives only as long as the
  page. When the Tabellify tab closes, the page is thrown away and the value with it.
  Nothing touches the disk.

### Mechanism (decided by RT-S3 = AC1)
- **Preferred: HTML `<dialog>` with `showModal()`** in `workspace.xhtml` (`html:dialog`).
  Standard, gives inertness of the page behind, Esc, the backdrop and focus return for free.
  Verified in docs (MDN, WHATWG) and in Firefox ESR 140 source (`HTMLDialogElement.cpp`:
  `ShowModal()` and focus return in `Close()`); **whether it works inside our chrome XUL
  document in the tab iframe is UNVERIFIED (runtime)**: RT-S3 and RT-S3b
  (`docs/zotero-api-notes.md`, "F006a–008 runtime checks").
- **Fallback if RT-S3 fails: an in-page overlay** with no new API: a
  `<html:div id="tabellify-view-dialog" role="dialog" aria-modal="true">` inside a
  full-page `<html:div id="tabellify-view-overlay">` (`position: fixed; inset: 0`), shown
  and hidden with the `hidden` attribute. The overlay catches mouse clicks on the page
  behind; our own key handler does Esc and the Tab wrap (below); our close function returns
  focus. Same element IDs inside, so the rest of this spec applies unchanged.
- **Not proposed:** a separate window (`openDialog`): a new UI surface outside the tab,
  needs an ADR, and gets left behind in full screen (PRD REQ-1).

The developer builds **one** mechanism: `<dialog>` if RT-S3 and RT-S3b pass, otherwise the
overlay. The choice is recorded in the PR.

### Where the button goes
In `#tabellify-table-actions` (F008), before "Export CSV":
```
<html:div id="tabellify-table-actions" hidden="hidden">
  <html:button id="tabellify-view-table" data-l10n-id="tabellify-view-table"
               aria-haspopup="dialog"></html:button>
  <html:button id="tabellify-export-csv" data-l10n-id="tabellify-export-csv"></html:button>
  <html:p id="tabellify-export-status" role="status" hidden="hidden">…unchanged…</html:p>
</html:div>
```
It is shown and hidden with the table (existing `setTableHidden`), so there is no "View
table" when there is no table (006a Q13). Ordinary button style (tokens only).

### The modal (markup, `<dialog>` version)
Placed at the end of `#tabellify-workspace-main`, so it inherits the page's tokens and font.
```
<html:dialog id="tabellify-view-dialog" aria-labelledby="tabellify-view-heading">
  <html:h2 id="tabellify-view-heading" data-l10n-id="tabellify-view-heading"></html:h2>
  <html:p id="tabellify-view-note" data-l10n-id="tabellify-view-not-saved"></html:p>
  <html:div id="tabellify-view-fields">
    <html:label for="tabellify-view-name" data-l10n-id="tabellify-view-name-label"></html:label>
    <html:input id="tabellify-view-name" type="text" maxlength="200" autocomplete="off"
                aria-describedby="tabellify-view-name-help"/>
    <html:p id="tabellify-view-name-help" data-l10n-id="tabellify-view-name-help"></html:p>
    <html:label for="tabellify-view-description"
                data-l10n-id="tabellify-view-description-label"></html:label>
    <html:textarea id="tabellify-view-description" rows="3" maxlength="2000"></html:textarea>
  </html:div>
  <html:div id="tabellify-view-scroll" role="region" tabindex="0"
            data-l10n-id="tabellify-view-table-region">
    <html:table id="tabellify-view-grid" class="tabellify-grid">
      <html:thead id="tabellify-view-head"></html:thead>
      <html:tbody id="tabellify-view-body"></html:tbody>
    </html:table>
  </html:div>
  <html:div id="tabellify-view-actions">
    <html:button id="tabellify-view-export" data-l10n-id="tabellify-export-csv"></html:button>
    <html:button id="tabellify-view-close" data-l10n-id="tabellify-view-close"></html:button>
    <html:p id="tabellify-view-export-status" role="status" hidden="hidden">
      <html:span id="tabellify-view-export-status-text"></html:span>
      <html:code id="tabellify-view-export-status-path" hidden="hidden"></html:code>
    </html:p>
  </html:div>
</html:dialog>
```
- No `<form method="dialog">`: pressing Enter in the Name field must not close the modal.
- `tabellify-view-table-region` is a Fluent message with only an `.aria-label` attribute
  (like the existing `tabellify-column-move`), so screen readers announce "Table preview"
  when the scroll area gets focus.
- Reusing the Fluent ID `tabellify-export-csv` on a second button is allowed (Fluent
  translates each element separately).

### What the modal shows: a clean read-only copy (`renderViewTable`, `workspace.js`)
Source of truth: the same in-memory snapshot F008 exports, `this.tableGroups`,
`this.tableRows`, `this.tableCounting` (set by `renderPaperTable`). So **the modal and the
CSV always show the same table**, and both match the screen.

Two ways to make the copy were considered:

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Clone the live table | `table.cloneNode(true)`, then strip grips, sort buttons, `draggable`, `tabindex`, IDs | Little new code | Copies duplicate element IDs and drag/keyboard attributes; every future change to the live table must be stripped again; fragile |
| **B. Build a clean table (recommended)** | A new method `renderViewTable()` writes `<th>`/`<td>` cells from the snapshot with `textContent` | Only what is needed (no grips, buttons or IDs); same data as the CSV; easy to test with the fake DOM | About 60 lines; header rules must match the live table (shared helper below) |

**Columns:** Title, every tag column in the on-screen order, k/M (one column, as on
screen; the CSV's two number columns are a file-format choice). No grip column.

**Header:** same shape as the screen. A small shared helper, e.g.
`headerShape(groups) → { oneRow, twoRows }`, is used by both `renderTableHeader` and
`renderViewTable`, so the two cannot drift apart.
- Two rows when a real group has columns: row 1 = Title (spans both rows, as on screen),
  one `th scope="colgroup"` per block with `colSpan` = its tag count and the group
  name as text; each ungrouped run shows the muted "Ungrouped" label exactly as on screen
  (Q6), class `tabellify-col-group-ungrouped`; k/M spans both rows. Row 2 = tag names.
- One row when no real group has columns (or no tag columns): Title, tag names, k/M.
- Header cells are **plain text**: no sort buttons, no grips. The k/M header text is
  `tabellify-column-count` ("k/M") with a `title` and `aria-label` from
  `tabellify-view-count-label`.

**Rows:** `this.tableRows` in order. Title (or "(untitled)" with the `tabellify-untitled`
class); tag cells with `tabellify-tag-used` where ✓ (CSS draws ✓) and the same
`aria-label`/`title` as on screen ("Heat index: Used" / "Heat index: Not used"); k/M as
`k/M` or "–" when `tableCounting` is false, with `tabellify-count-complete` when complete;
`tabellify-row-alt` stripes from `TabellifyTableLayout.stripeFlags`. Group start lines via
`tabellify-group-start` as on screen.

**Never** in the copy: `id`, `draggable`, `tabindex`, `role="button"`, `data-sort`,
`data-paper-id`, `data-tag`, `data-group-id`, or any `<button>`. All text through
`textContent` or attributes (`no-html-sinks`).

### Opening (`openView`)
On "View table" click:
1. If the modal is already open (`dialog.open`), return. If there is no table
   (`tableRows` empty or the actions block hidden), return.
2. Fill Name and Description: the remembered values for this collection key (Q2), else Name
   = `exportBaseName()` (the collection name, Q3) and Description = "".
3. `renderViewTable()`; hide the modal's export status line.
4. `dialog.showModal()`; then `name.focus()` and `name.select()` (the whole name is
   selected, so typing replaces it).
5. Log `view: opened: <P> paper(s), <T> tag column(s), <H> header row(s)` (numbers only).

### Closing and focus
- "Close" button → `closeView()` → `dialog.close()`.
- **Esc:** a `keydown` handler on the dialog: `key === "Escape"` and not `isComposing` →
  `preventDefault()`, `closeView()`. (With `<dialog>`, Esc also closes natively; handling it
  ourselves gives the same result in both mechanisms and is harmless: `close()` on a closed
  dialog does nothing.)
- **Tab wrap (focus trap):** because only our document is inert, Tab from the last control
  could move focus out of the iframe into Zotero's own window. The same `keydown` handler
  keeps it inside: the focus order is Name → Description → table area → Export CSV → Close;
  Tab on the last enabled one goes to Name, Shift+Tab on Name goes to the last enabled one.
  (Disabled "Export CSV" during an export is skipped.)
- On the dialog's `close` event (fires for every way of closing): remember Name and
  Description for the collection (Q2), then focus "View table" if it is visible, else the
  collection dropdown. (Firefox also restores focus itself for a modal `<dialog>`; doing it
  explicitly is the same result and also covers the overlay.) Log `view: closed`.
- **Table hidden while open** (live update finds no papers, or a load error):
  `setTableHidden(true)` calls `closeView()` when the modal is open.

### Live updates while open
The page behind is inert, but the library can still change (other Zotero tabs stay usable,
the Notifier recomputes). At the end of `renderPaperTable`, if the modal is open,
`renderViewTable()` runs again, so the modal and its "Export CSV" always use the current
snapshot (Q7). The Name and Description fields are not touched; the scroll position of the
table area may reset (acceptable).

### Export from the modal
- "Export CSV" in the modal → `exportCsv(baseName, "view")`, where `baseName` = the trimmed
  Name, or `null` when it is blank (then F008's default, the collection name, is used).
- F008's `exportCsv(baseName = null)` gains a second optional parameter `source = "page"`
  (`"page" | "view"`). Changes are small and keep F008 behaviour for `"page"`:
  - Both export buttons (`tabellify-export-csv`, `tabellify-view-export`) are disabled while
    an export runs, and re-enabled after (one export at a time, as today).
  - `showExportStatus(id, path, isError, target = "page")`: `target` picks the line,
    `"page"` → `tabellify-export-status*`, `"view"` → `tabellify-view-export-status*`.
    The clearing at the start of an export clears the source's line.
  - `reportExport(result, source)`: shows the result in the modal's line if the export came
    from the modal **and the modal is still open**, else in the page's line.
- The suggested file name is F008's `TabellifyCsv.fileName(baseName, date, fallback)`:
  `<Name> <YYYY-MM-DD>.csv` (Q4), cleaned by `safeFileBase` (removes `/ \ ? * : | " < >`,
  control and bidi characters, cuts to 80 characters). Example: Name `Heat study: draft/1`
  → `Heat study draft1 2026-11-14.csv`. Tabellify writes only to the path the user picks
  (ADR-0017, unchanged).
- The macOS save dialog opens over the Zotero window as for F008 (RT-S2 passed); the modal
  stays open behind it.
- Debug Output: the existing `export:` lines plus `export: started from View table`. Never
  the Name or Description.

### Name and Description in memory (Q2)
`viewDrafts: new Map()` on `TabellifyWorkspace`, key = `currentCollectionKey()` (the
`"<libraryID>/<key>"` already used for manual orders), value = `{ name, description }`.
Written on `close` and before an export from the modal, only when the user changed
something (name differs from the default, or description not empty). It is an ordinary
property of the page object, so it disappears with the tab: no `onUnload` work, no pref, no
file.

### The export-status fix (`showCollection`)
In `showCollection`, inside the existing `if (!recompute || value === "")` block, add one
line: `this.showExportStatus(null);`. Effect: choosing another collection (or the
placeholder) hides "CSV saved: …" / the error line. "Refresh" and live updates (recompute)
leave it alone, because the same collection is still shown (Q13). The modal's line is not
touched (the modal is closed whenever a collection can be chosen).

### CSS (`workspace.css`, tokens only, ADR-0015)
- `#tabellify-view-dialog` (and the overlay version): `background:
  var(--tabellify-color-surface)` and `color: var(--tabellify-color-text)` (replacing the
  browser's default `Canvas` / `CanvasText`, which are system colours our rules forbid);
  `border: var(--tabellify-border-width) solid var(--tabellify-color-border-strong)`;
  `border-radius: var(--tabellify-radius-md)`; `padding: var(--tabellify-space-5)`; no
  shadow (flat rule). Size: `width` and `max-height` of `calc(100% - 2 *
  var(--tabellify-space-6))`, `max-width: none`.
- **Pitfall:** the layout rule must be `#tabellify-view-dialog[open] { display: flex;
  flex-direction: column; … }`, **with `[open]`**. A plain `#tabellify-view-dialog {
  display: flex }` would beat the browser's `dialog:not([open]) { display: none }` (an ID
  selector is more specific), and the closed dialog would show on the page.
- `#tabellify-view-scroll`: `flex: 1 1 auto; min-height: 0; overflow: auto;` so a wide or
  long table scrolls **inside** this area in both directions while the heading, fields and
  buttons stay visible. Focus ring from the shared `:focus-visible` rule.
- `#tabellify-view-grid`: `min-width: 100%`; tag cells and headers `white-space: nowrap`;
  Title `min-width` about 16em so titles wrap instead of the tag columns being squeezed. No
  sticky headers (Q8).
- Backdrop: **no `::backdrop` rule**. Firefox's built-in style is
  `dialog::backdrop { background: rgba(0, 0, 0, 0.1); }` (ESR 140 `html.css`). Writing our
  own would need a colour, and MDN says `::backdrop` "neither inherits from nor is inherited
  by any other elements", so our `var(--tabellify-color-*)` tokens may not resolve there.
- The modal's status line reuses the export status styles (add the new ID to the selector
  lists at `#tabellify-export-status`, including the error "!" and bold).
- Field labels and the note: existing label/help styles (muted note, `--tabellify-font-size-sm`).
- Dark mode needs nothing extra: tokens switch with `prefers-color-scheme`.
- `docs/design-system.md` §5a and `docs/design-system-states.html` gain a "View table modal"
  sample (surface, border, scroll area).

### Fluent IDs (no arguments)
Proposed text, owner may change:
- `tabellify-view-table` = View table
- `tabellify-view-heading` = View table
- `tabellify-view-not-saved` = Name and description are kept only while this tab is open.
  They are not saved yet.
- `tabellify-view-name-label` = Name
- `tabellify-view-name-help` = Used as the name of the exported CSV file.
- `tabellify-view-description-label` = Description
- `tabellify-view-table-region` with `.aria-label` = Table preview
- `tabellify-view-close` = Close
- `tabellify-view-count-label` = Codebook tags used on the paper (k of M)
- Reused: `tabellify-export-csv`, `tabellify-column-title`, `tabellify-column-count`,
  `tabellify-untitled`, `tabellify-table-ungrouped-label`, `tabellify-table-tag-used`,
  `tabellify-table-tag-not-used`, the F008 export messages.

New JS list `VIEW_STRINGS` (formatted once in `init`, like `EXPORT_STRINGS`):
`tabellify-column-count`, `tabellify-view-count-label`. The others used from JS are already
formatted (`LAYOUT_STRINGS`, `EXPORT_STRINGS`, `untitledText`).

### Lifecycle
New listeners, all in the workspace document, added in `init` and removed in `onUnload`
(`symmetry` test):
- `click` on `#tabellify-view-table` (`onViewTableClick`)
- `click` on `#tabellify-view-dialog` (delegated: Export CSV, Close; `onViewClick`)
- `keydown` on `#tabellify-view-dialog` (Esc, Tab wrap; `onViewKeydown`)
- `close` on `#tabellify-view-dialog` (`onViewClose`). In the overlay version there is no
  `close` event; `closeView()` calls the same function directly.

No observer, timer, pref, file or main-window change. If the tab closes (or Tabellify is
disabled) while the modal is open, the document is thrown away with the modal in it;
`onUnload` removes the listeners as usual and `unloaded` stops a pending export (F008).
Nothing in `bootstrap.js` or `tabellify.js`.

### Files
| File | Change |
|---|---|
| `src/content/workspace.xhtml` | "View table" button in `#tabellify-table-actions`; the modal at the end of `#tabellify-workspace-main` |
| `src/content/workspace.js` | Status fix in `showCollection`; `headerShape` helper; `renderViewTable`; `openView` / `closeView`; `onViewTableClick`, `onViewClick`, `onViewKeydown`, `onViewClose`; `viewDrafts`; `exportCsv(baseName, source)`, `showExportStatus(…, target)`, `reportExport(result, source)`; both export buttons disabled while busy; `setTableHidden` closes the modal; `renderPaperTable` refreshes it; `VIEW_STRINGS`; listeners in `init` / `onUnload` |
| `src/content/workspace.css` | Modal, scroll area, read-only grid sizing, status line selectors (tokens only) |
| `src/locale/en-US/tabellify.ftl` | New IDs above |
| `tests/unit/workspace-table.test.mjs` | Fake `showModal` / `close` / `open` on the fake element; AC12–AC15 |
| `tests/static/workspace-script.test.mjs` | `VIEW_STRINGS` in the Fluent list check; `target` form of `showExportStatus` still matched; AC16 |
| `docs/design-system.md`, `docs/design-system-states.html` | Modal sample |

### Does this need an ADR?
**No.** The modal is inside the existing workspace document (no new window, tab or pane),
stores nothing (no storage format), writes no new kind of file (export reuses ADR-0017's
path and allow-list entry unchanged), adds no dependency and no public interface. If RT-S3
fails and the owner prefers a separate window over the overlay, that would be a new UI
surface and needs an ADR first.

## Zotero / Mozilla APIs used
Details and sources in `docs/zotero-api-notes.md` ("Feature 007a rows" and the RT-S3 /
RT-S3b runtime checks). **No new `Zotero.*` call** (the `workspace.js` Zotero allow-list
gains no entry). No `IOUtils`, `ChromeUtils` or `Services` use outside the F008 files.

| API | Status |
|---|---|
| `HTMLDialogElement.showModal()`, `.close()`, `.open`; `close` event (not cancelable, does not bubble); Esc closes a modal dialog (`cancel` first); page behind inert, iframe parent not blocked | Verified (docs: MDN, WHATWG) + Verified (source, ESR 140 `HTMLDialogElement.cpp`); **in our chrome XUL document in the tab iframe UNVERIFIED (runtime): RT-S3 (AC1) and RT-S3b** |
| Focus return to the previously focused element when a modal dialog closes | Verified (source, ESR 140 `HTMLDialogElement::Close`: `previouslyFocusedElement->Focus(...)`); we also focus explicitly |
| Browser default styles for `dialog`, `dialog:modal`, `dialog:not([open])`, `dialog::backdrop` | Verified (source, ESR 140 `layout/style/res/html.css`) |
| `::backdrop` does not inherit (why we add no backdrop rule) | Verified (docs, MDN) |
| `closedby` attribute / `requestClose()` | **Not used** (pref-gated / partly unimplemented in ESR 140 source) |
| `HTMLInputElement.select()`, `HTMLElement.focus()`, `<textarea>`, `maxlength`, `tabindex="0"` + `role="region"` + `aria-label`, `aria-labelledby`, `aria-haspopup="dialog"`, `KeyboardEvent.key` / `shiftKey` / `isComposing`, `document.activeElement` | Verified (docs, MDN / WAI-ARIA); standard DOM |
| Already used, unchanged: `TabellifyCsv.fileName` / `safeFileBase`, `TabellifyCsvExport.exportText` (F008), `document.l10n.formatValue`, `Zotero.debug`, `Zotero.logError` | Existing rows |

## Data safety
- **Read from the library:** nothing new. The modal shows the snapshot the table already
  holds in memory (titles, which codebook tags each paper has, counts).
- **Written to the library:** **nothing.** No item, tag, annotation, collection,
  attachment or database change. The write guard still forbids every Zotero write API in
  `src/`.
- **Written to disk:** **nothing new.** Name and Description live only in memory
  (`viewDrafts`) and vanish with the tab. No pref, no file in `<data dir>/tabellify/`. The
  only file 007a can cause is the CSV, and only through F008's existing path (save dialog,
  then one write by `csv-export.js` to the chosen path, ADR-0017); the write-guard
  allow-list gains **no** entry.
- **Untrusted text:** titles, tag and group names (library and codebook) and the typed Name
  and Description are shown with `textContent` or attributes only (`no-html-sinks`). Tag
  names are never used in CSS selectors (F005c rule). The Name reaches the file system only
  as a *suggestion* in the save dialog, after `safeFileBase` removed path separators and
  control/bidi characters; the user still chooses the final path.
- **Privacy:** Debug Output gets counts and outcomes only; never a title, tag, group or
  collection name, Name, Description or path (`Zotero.logError` on an export failure may
  include the chosen path, as in F008).
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`; exported
  test files go to a folder the owner picks and can be deleted afterwards.

## Acceptance criteria
`[manual]` = owner, Zotero 10.0.9 dev profile, collection "F005 test", Debug Output captured
to `build/debug-N.txt`. `[auto]` = `npm test`.

- [ ] AC1 `[manual]` **RT-S3 first (before development, any build with the Tabellify tab).**
  With the Tabellify tab open, the RT-S3 snippet (`docs/zotero-api-notes.md`, "RT-S3")
  shows a small box with the text "RT-S3" over the tab and returns `{ open: true, closed:
  true }`. Then RT-S3b (same place) returns `modal: true`, `focusedInside: true`,
  `escClosed: true`, `focusRestored: true` after the owner clicks the box and presses Esc.
  If either fails, the owner reports the result and the developer builds the overlay
  fallback (Design, "Mechanism").
- [ ] AC2 `[manual]` **Button.** With "F005 test" chosen, "View table" is under the table,
  left of "Export CSV". With "Choose a collection" (or a collection without papers) neither
  button is shown.
- [ ] AC3 `[manual]` **Modal content.** Clicking "View table" opens a box over the
  Tabellify page with the heading "View table", the line "Name and description are kept
  only while this tab is open. They are not saved yet.", a Name field containing "F005
  test" (all selected, cursor in it), an empty Description field, the table, and "Export
  CSV" and "Close". The page behind is slightly dimmed and clicking it (e.g. the collection
  dropdown) does nothing. The table has the same columns in the same order (group names and
  "Ungrouped" over the same columns), the same papers in the same order, ✓ in the same
  cells and the same k/M values as the page; it has **no** grips (⋮⋮) and the column names
  are not buttons.
- [ ] AC4 `[manual]` **Order follows the page.** Close the modal, sort the page table by a
  tag column (descending) and drag a tag column to another place; reopen "View table": rows
  and columns follow the new order.
- [ ] AC5 `[manual]` **Scrolling.** Make the Zotero window narrow (about half the screen):
  inside the modal the table scrolls sideways and, with enough papers or a short window,
  up and down; the heading, fields and buttons stay visible; the page behind does not
  scroll.
- [ ] AC6 `[manual]` **Keyboard.** With the modal open, Tab moves Name → Description →
  table area → Export CSV → Close → Name again; Shift+Tab goes backwards. Focus never moves
  to the page behind or to Zotero's tab bar. With the table area focused, the arrow keys
  scroll it. Esc closes the modal and the focus ring is on "View table". Opening again and
  clicking "Close" does the same.
- [ ] AC7 `[manual]` **Export from the modal.** Type the Name `Heat study: draft/1`, click
  "Export CSV": the save dialog suggests `Heat study draft1 <today, YYYY-MM-DD>.csv`. Save
  to the Desktop: "CSV saved:" and the path appear **inside the modal**. The file's content
  is the same as an export from the page button (AC4 order). Then clear the Name and export
  again: the suggestion is `F005 test <today>.csv`. Cancelling the save dialog shows no
  message.
- [ ] AC8 `[manual]` **Kept while the tab is open, not saved.** Type a Name and a
  Description, close the modal, reopen: both are still there. Choose another collection and
  open "View table": its own collection name and an empty Description. Choose "F005 test"
  again: the typed values are back. Close the Tabellify tab, reopen it (Tools →
  Tabellify…), choose "F005 test", open "View table": Name is "F005 test" and Description
  is empty. In Finder, no file in `~/Zotero tabellify-dev/tabellify/` has a newer
  modification time than before the test.
- [ ] AC9 `[manual]` **Status fix.** Export from the page button so "CSV saved: …" shows.
  Click "Refresh": the line stays. Choose another collection: the line is gone. Choose
  "F005 test" again: still gone.
- [ ] AC10 `[manual]` **Dark mode.** Zotero Settings → General → Color Scheme: Dark; open
  "View table": the box uses the dark surface and all text is readable. Switch back.
- [ ] AC11 `[manual]` **Library, log, lifecycle.** The dev library is unchanged (no new
  tags, items or notes). `build/debug-N.txt` has `view: opened: …` and `view: closed` lines
  with numbers only, and no Name, Description, title, tag, group or collection name or path
  in any Tabellify line. Closing the Tabellify tab **while the modal is open**, and
  disabling Tabellify in Tools → Plugins while the modal is open, produce no errors.
- [ ] AC12 `[auto]` **Read-only copy** (`tests/unit/workspace-table.test.mjs`, fake DOM):
  `renderViewTable` builds Title, tag columns in `tableGroups` order and k/M; rows in
  `tableRows` order; two header rows when a real group has columns, one otherwise (same
  result as `renderTableHeader` for the same groups, via `headerShape`); "Ungrouped" label
  over each ungrouped run with the right `colSpan`; ✓ class and `aria-label` per cell;
  "k/M" text and "–" when not counting; `tabellify-count-complete`; stripes; no `id`,
  `draggable`, `tabindex`, `data-sort`, `data-paper-id`, `data-tag`, `data-group-id` or
  `<button>` anywhere in `#tabellify-view-grid`; a title or tag like `<b>x</b>` stays text;
  never the text "null" or "undefined".
- [ ] AC13 `[auto]` **Open, close, focus** (same file; fake `showModal` / `close` / `open`
  and a fake `focus` that records calls): a click calls `showModal` once and a second click
  while open does nothing; Name is the collection name, Description empty; Name gets
  `focus` and `select`; remembered values per collection key are restored, another key gets
  defaults; nothing is remembered when unchanged; "Close" and an Escape `keydown` call
  `close`, an Escape during IME composition does not; Tab on the last enabled control
  focuses Name and Shift+Tab on Name focuses the last enabled control (Close, or Export
  when enabled), with `preventDefault`; the `close` handler focuses "View table";
  `setTableHidden(true)` while open closes the modal; `renderPaperTable` while open
  re-renders the copy (after a fake sort the copy follows).
- [ ] AC14 `[auto]` **Export from the modal** (same file, fake `exportIo`): the modal's
  button calls the export with the trimmed Name (the fake dialog receives `defaultName`
  `"<safe name> YYYY-MM-DD.csv"`), with `null` for a blank Name (collection name used);
  both export buttons are disabled during the export and enabled after; the result shows in
  the modal's status line, or in the page's line if the modal was closed before the fake
  dialog returned; the page's line is untouched by a modal export; a page export still
  behaves exactly as in F008 (existing F008 tests pass unchanged); no `log` call contains
  the Name, the Description or a test title, tag, group or collection name or path.
- [ ] AC15 `[auto]` **Status fix** (same file): after a saved export, `showCollection(id,
  "collection chosen")` and `showCollection("", "collection chosen")` hide
  `#tabellify-export-status`; `showCollection(id, "refresh")` and `(id, "library change")`
  keep it.
- [ ] AC16 `[auto]` **Static checks:** every new Fluent ID exists in `tabellify.ftl` and
  starts with `tabellify-`; `VIEW_STRINGS` is formatted in `init` and included in the
  Fluent list check; every element ID looked up by `workspace.js` exists in
  `workspace.xhtml`; each new `addEventListener` has its `removeEventListener` in
  `onUnload` (`symmetry` and the workspace test); the `workspace.js` Zotero allow-list gains
  no entry; `write-guard` passes with **no** new allow-list entry; `showModal` appears only
  in `workspace.js`; `no-html-sinks` passes; the ADR-0015 colour rule passes for the new
  CSS (no `::backdrop` colour, no system colours).

## How to verify in the dev profile (owner)
The orchestrator turns this into numbered steps with exact windows at smoke-test time.
1. **Before development:** run RT-S3 and RT-S3b (AC1) with the build that is installed now;
   report the results.
2. After the 007a build: start the dev profile with Debug Output captured
   (`build/debug-N.txt`), install the `.xpi`, open Tools → Tabellify…, choose "F005 test".
3. Run AC2–AC11 in order. Exported files go to the Desktop; delete them afterwards.
4. Report "yes" or "no" plus anything that looked wrong; the orchestrator reads the debug
   file.

## Test plan
| AC | How |
|---|---|
| AC1 | Owner, Run JavaScript (RT-S3, RT-S3b), before T1 |
| AC2–AC11 | Owner smoke test (manual), Debug Output in `build/debug-N.txt` |
| AC12–AC15 | `tests/unit/workspace-table.test.mjs` (fake DOM; the fake element gains `showModal`, `close`, `open`, `focus`, `select`) |
| AC16 | `tests/static/workspace-script.test.mjs`, `symmetry`, `write-guard`, `no-html-sinks`, `l10n-and-window`, `design-tokens` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Owner approves this spec and Q1–Q13; owner runs RT-S3 + RT-S3b (AC1); orchestrator records the results in `docs/zotero-api-notes.md` | owner / orchestrator | — | `docs/zotero-api-notes.md` |
| T1 | Status fix: `showExportStatus(null)` in `showCollection` + tests (AC15). Own commit | developer | T0 | `src/content/workspace.js`, `tests/unit/workspace-table.test.mjs` |
| T2 | Read-only copy: `headerShape` (used by `renderTableHeader` too), `renderViewTable`, CSS for the grid in the modal + tests (AC12). Own commit | developer | T1 | `src/content/workspace.js`, `src/content/workspace.css`, `tests/unit/workspace-table.test.mjs` |
| T3 | The modal: markup (dialog or overlay per AC1), "View table" button, open/close, Esc, Tab wrap, focus return, `viewDrafts`, live refresh, close on hide, export from the modal (`exportCsv(baseName, source)`, `showExportStatus(…, target)`, `reportExport(…, source)`), `VIEW_STRINGS`, listeners + `onUnload`, CSS, Fluent; static checks; design-system sample (AC13, AC14, AC16) | developer | T2 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs`, `docs/design-system.md`, `docs/design-system-states.html` |
| T4 | `npm test`, `npm run build`; owner smoke test AC2–AC11 | developer → owner | T3 | — |

All tasks touch `workspace.js` and the same test file, so they run one after the other on
one branch (no parallel worktrees). One concern per commit (T1, T2, T3 separate).

## Open questions (each with the recommendation this spec assumes)
1. **Q1 Mechanism.** `<dialog>` with `showModal()` if RT-S3/RT-S3b pass, else an in-page
   overlay (no new API)? *Recommended: yes.* A separate window is not recommended (new UI
   surface, ADR, full-screen problem).
2. **Q2 Name and Description before 007b.** (a) kept **in memory per collection while the
   tab is open** (recommended: closing the modal by mistake does not lose typing; honest
   note in the modal; nothing on disk); (b) cleared every time the modal closes (simplest,
   but easy to lose text); (c) saved to disk now (that is 007b's storage, needs ADR-0018
   first).
3. **Q3 Default Name:** the collection's name, selected so typing replaces it?
   *Recommended: yes* (exporting without typing gives the same file name as the page
   button). Alternative: empty field with a placeholder.
4. **Q4 File name from the Name:** `<Name> <YYYY-MM-DD>.csv` (F008's rule, the date
   appended)? *Recommended: yes*: no change to the tested `csv-model.js`, same look as page
   exports, and a second export of the same table on another day does not ask to replace
   the first. The user can still edit the name in the save dialog. Alternative: exactly
   `<Name>.csv` as in the PRD sketch (small change to `TabellifyCsv.fileName` and its tests).
5. **Q5 Description in the CSV?** *Recommended: no* (a text line above the header breaks
   spreadsheets, R and Python readers). 007b saves it with the table instead.
6. **Q6 Ungrouped header in the modal:** the muted "Ungrouped" label as on the page?
   *Recommended: yes* (the modal shows the table as on screen). The CSV keeps its blank
   cell (F008 Q1). Alternative: blank as in the CSV.
7. **Q7 Library changes while the modal is open:** refresh the copy live? *Recommended:
   yes*, so the modal and its "Export CSV" always match. Alternative: freeze the table at
   opening (then the modal's export needs its own snapshot passed to `exportCsv`, more
   code).
8. **Q8 Sticky header rows inside the modal** while scrolling down? *Recommended: out of
   scope* (two sticky rows need measured offsets; the page table already has them). Can be
   added later.
9. **Q9 Print-friendly layout?** *Recommended: out of scope* (not trivial in a modal inside
   a tab; export to CSV and print from the spreadsheet).
10. **Q10 Button order:** "View table" left of "Export CSV" (the order in your request)?
    *Recommended: yes.*
11. **Q11 Field limits:** Name up to 200 characters, Description up to 2 000? *Recommended:
    yes* (only to keep the page fast; the file name is cut to 80 characters anyway).
12. **Q12 Where the export result shows** when exporting from the modal: in the modal; on the
    page only if the modal was closed meanwhile? *Recommended: yes.*
13. **Q13 Status fix scope:** clear the page's export line when a collection (or the
    placeholder) is chosen, but keep it on Refresh and live updates (same collection)?
    *Recommended: yes.*
