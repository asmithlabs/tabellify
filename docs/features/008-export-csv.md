# Feature 008: Export CSV

- **Status:** Approved (owner, 2026-11-13, all recommendations Q1–Q13; RT-S2 passed)
- **Branch:** `feat/008-export-csv` (from `main` after 006c, merged as `f60f283`)
- **Related ADRs:** **0017 (Proposed: CSV export, save dialog, writer file, CSV dialect; this
  spec depends on it)**, 0012 (Accepted: write-guard allow-list rule), 0014 / 0019 (Accepted:
  column order, `layout.json` schema 3), 0016 (Accepted: ungrouped tags), 0011 (Accepted:
  security review; formula injection and export paths are in its threat model), 0015
  (design tokens), 0003 (no bundler). PRD §3 step 6, §5 F008, §6. Architecture §5 ("CSV
  written only to a user-chosen location (file picker)"). Outline:
  `docs/features/006a-workspace-restructure.md`, "Later phases → 008" and "ADR-0017 outline".
  Builds on 006c Amendment 2 (`docs/features/006c-drag-regroup.md`: "Ungrouped" run headers).
- **Process:** prototype mode (CLAUDE.md). Owner runs **RT-S2 first** (AC1, before
  development). Developer builds; `npm test` + `npm run build` pass; owner runs one smoke
  test (the `[manual]` ACs) with Debug Output in `build/debug-N.txt`.

## Owner's request (2026-11-13, verbatim)
"Export CSV: two header rows (super-header, then tag), with a blank super-header for
ungrouped tags. One row per paper."

## Problem / objective
The per-paper table (Title, codebook tag columns under their groups, k/M) is the synthesis
matrix the owner builds, but it lives only inside Zotero. To analyse, share or include it in
a paper, the owner needs it in a spreadsheet. 008 adds an **"Export CSV"** button below the
table that saves **exactly what the table shows** (same columns in the same order, same
papers in the same order) as a CSV file at a place the owner chooses. Nothing in the Zotero
library changes.

## Scope
**In scope:**
1. An "Export CSV" button below the table, with an inline status line (saved / error).
2. A pure CSV builder (`src/content/csv-model.js`, `TabellifyCsv`): header rows, paper rows,
   cell values, RFC 4180 quoting, CRLF, BOM, formula-injection guard, suggested file name.
3. A writer (`src/content/csv-export.js`, `TabellifyCsvExport`): the save dialog and the one
   file write (ADR-0017), the third write-guard allow-list entry.
4. Fluent strings, CSS (tokens only), tests.

**Out of scope (non-goals):**
- XLSX or any other format; copy to clipboard (ADR-0017 option C, possible later).
- Extra columns not on screen (authors, year, citation key, item key, links): Q6.
- Highlight text in cells (006d), "View table" modal and its Name field (007a), saved tables
  (007b). 008 is built so 007a can pass its Name as the file name (Design, "Hook for 007a").
- Remembering the last folder, "export again to the same file", automatic save to Downloads.
- Any library write, any new `Zotero.*` call.

## User stories
- As a researcher, I click "Export CSV", pick a place, and get a file I can open in Excel or
  Numbers that looks like the table on screen.
- As a researcher, the group names appear above their tag columns, and tags without a group
  have an empty cell above them.
- As a researcher, papers appear in the order I sorted or arranged them.
- As a researcher, accented and non-Latin titles look right when I open the file.
- As a researcher, a paper title that starts with "=" cannot run a formula on my computer.
- As a researcher, cancelling the dialog does nothing, and replacing an existing file only
  happens after the system asked me.
- As a researcher, I trust that exporting never changes my Zotero library.

## Design

### Background for a JavaScript learner
- **CSV** ("comma-separated values"): plain text, one line per table row, cells separated by
  commas. A cell that itself contains a comma, a quote or a line break is wrapped in double
  quotes, and a quote inside it is written twice (`"` → `""`). The rules are in RFC 4180.
- **Pure module:** a file whose functions only turn inputs into outputs (no Zotero, no page,
  no files). Node tests can then check hundreds of cases quickly. Here: `csv-model.js` builds
  the text; `csv-export.js` does the two things Node cannot (dialog, disk).
- **Snapshot:** the export uses the table's rows and columns **at the moment of the click**.
  If the library changes while the save dialog is open, the file still matches what was on
  screen when the button was clicked.
- **Dependency injection:** `csv-export.js` receives its two platform functions (`pickSavePath`,
  `writeUTF8`) as a parameter instead of calling `IOUtils` directly everywhere, so a test can
  pass fake functions and check "cancel writes nothing" without Zotero (the same idea as
  `codebook-store.js`).

### Where the button goes
Per the 006a layout ("the table; 'View table' and 'Export CSV'"), a new block **directly after
the table** in `workspace.xhtml`:
```
<html:div id="tabellify-table-actions" hidden="hidden">
  <html:button id="tabellify-export-csv" data-l10n-id="tabellify-export-csv"></html:button>
  <html:p id="tabellify-export-status" role="status" hidden="hidden">
    <html:span id="tabellify-export-status-text"></html:span>
    <html:code id="tabellify-export-status-path" hidden="hidden"></html:code>
  </html:p>
</html:div>
```
- Shown and hidden **together with the table** (`setTableHidden` also sets this block's
  `hidden`), so there is no button when no collection is chosen or the collection has no
  papers (006a Q13: no disabled placeholders).
- Left-aligned, ordinary button style from `workspace.css` (tokens only, ADR-0015); 007a
  later adds "View table" in the same block.
- The button is `disabled` while an export runs (dialog open or writing), so one click = one
  dialog.

### What the CSV contains (the table as shown)
Source of truth: what `renderPaperTable` last drew. It already computes `groups` (the shown
blocks, `TabellifyTableLayout.orderedGroups`, in the current column order, with "Ungrouped"
runs) into `this.tableGroups`, and `shown` (the papers in the displayed order: the chosen
sort or the manual order). 008 also keeps `shown` and `counting` (`this.tableRows`,
`this.tableCounting`), so the export never re-sorts or re-reads anything.

**Columns, left to right:** Title, every tag column in the on-screen order, then **k** and
**M** as two number columns (Q4). The grip column is not exported. No other columns (Q6).

**Header rows** (Q1–Q3):
- **Two header rows when the screen shows two** (at least one real group has columns):
  - Row 1 (super-headers): empty above Title; above each tag column, the **group's name,
    repeated above every column of that group** (Q2); **empty above ungrouped tags** (Q1:
    blank, as the owner originally asked, not the on-screen word "Ungrouped"); empty above
    k and M.
  - Row 2: `Title`, the tag names, `Tags used (k)`, `Codebook tags (M)`.
- **One header row when the screen shows one** (no real group has columns, or there are no
  tag columns): just row 2 (Q3).
- Header labels come from Fluent (Title reuses `tabellify-column-title`).

**One row per paper**, in the displayed order:
- Title: the paper's title as shown; an untitled paper gets the shown "(untitled)" text
  (`tabellify-untitled`, Q12).
- Tag cells: **`1`** where the screen shows ✓, **empty** otherwise (Q5). "✓" follows the
  same counting rule as the screen ("Also count tags on the paper itself"), because the
  values come from the same `present` lists.
- k and M: the numbers from the k/M cell (`paper.count`, `paper.total`). When the screen
  shows "–" (no codebook, or a codebook without tags), both are empty.

**Example.** On screen: Title | **Ungrouped**: age | **Exposure**: Heat index, Temperature |
**Outcome**: Hospitalization | k/M. The file (`␍␊` = CRLF, BOM at the very start):
```
[BOM],,Exposure,Exposure,Outcome,,␍␊
Title,age,Heat index,Temperature,Hospitalization,Tags used (k),Codebook tags (M)␍␊
Smith 2020,1,,1,,2,4␍␊
"Heat, humidity and health",,1,,,1,4␍␊
"'=HYPERLINK(""https://example.org"",""x"")",,,,,0,4␍␊
(untitled),,,,1,1,4␍␊
```

### CSV dialect (ADR-0017 §4)
- Separator: comma (Q9). Line end: CRLF after **every** row, the last included.
- Encoding: UTF-8 with a **BOM** (the invisible character U+FEFF as the first character of
  the text; in JavaScript a backslash-u escape, `TabellifyCsv.BOM`) (Q8).
- Quoting (RFC 4180, minimal): a field is quoted when it contains `,` `"` CR or LF, or when
  the formula guard changed it; inner `"` become `""`. Line breaks inside a title are kept
  (inside quotes; spreadsheets show them as a line break in the cell).
- **Formula-injection guard** (Q7), applied to **every** text cell (titles, tag names, group
  names, header labels): if the text, after any leading spaces, starts with `=` `+` `-` `@`,
  tab, CR, LF, or full-width `＝` `＋` `－` `＠`, a `'` is put in front of the **whole** text
  (leading spaces kept after it) and the field is quoted. Numbers Tabellify makes (`1`, k, M)
  are digits only. Source: OWASP "CSV Injection" (characters, apostrophe + quotes advice).
- Lone UTF-16 surrogates (broken characters) become U+FFFD when `writeUTF8` encodes the text
  (Gecko `UTF8String` conversion); no extra handling.

### Suggested file name
`<collection name> <YYYY-MM-DD>.csv`, e.g. `F005 test 2026-11-13.csv` (Q10):
- Collection name: the chosen (top) collection's own name, from `monitorData.collections`
  (already read). Date: today's **local** date, zero-padded.
- Cleaned by a pure `TabellifyCsv.safeFileBase(name)` (mirrors Zotero's
  `Zotero.File.getValidFileName` rules, verified in source, plus a few for Windows and length):
  NFC-normalize; remove `/ \ ? * : | " < >`; replace control characters (U+0000–U+001F,
  U+007F, including tab/CR/LF) and line/paragraph separators (U+2028/U+2029) with a space;
  remove zero-width and bidirectional control characters (U+200B–U+200F, U+202A–U+202E,
  U+2066–U+2069, so a name cannot disguise its extension); collapse runs of spaces; trim;
  remove leading dots and trailing dots/spaces; cut to 80 characters without splitting a
  character; if nothing is left, use Fluent `tabellify-export-file-fallback` ("Tabellify
  table").
- This is only a **suggestion** in the dialog. Tabellify writes to whatever path the dialog
  returns, unchanged (ADR-0017 §1).

### Save flow (`workspace.js` → `csv-export.js`)
On click (`onExportClick`, async, errors caught):
1. If `exportBusy`, return. Set `exportBusy = true`, disable the button, hide the old status.
2. **Snapshot:** `const csv = TabellifyCsv.build({ groups: this.tableGroups, papers:
   this.tableRows, counting: this.tableCounting }, labels)` → `{ text, stats }`. `labels` =
   the formatted Fluent strings (Title, "(untitled)", k, M). Log
   `export: CSV built: <P> paper(s), <T> tag column(s), <G> group(s), <H> header row(s)`.
3. `const result = await TabellifyCsvExport.exportText(csv.text, { title, filterTitle,
   defaultName }, this.exportIo)`:
   - `io.pickSavePath(...)` opens the dialog (below). Cancel → `{ status: "cancelled" }`.
   - Before writing, `exportText` calls `options.shouldWrite()`; `workspace.js` passes
     `() => !this.unloaded` (Q13: the tab closed while the dialog was open → nothing is
     written, `{ status: "cancelled", reason: "closed" }`).
   - `io.writeUTF8(path, text, { tmpPath: path + ".tabellify-tmp" })` → `{ status: "saved",
     path, bytes, replaced }`; a rejection → `{ status: "error", stage: "write", path,
     errorName }`; the dialog throwing → `{ status: "error", stage: "picker", errorName }`.
4. If the document is gone (`this.unloaded`), only log. Otherwise show:
   - saved → status text "CSV saved:" + the path in `<code>` (plain text).
   - cancelled → no message (status stays hidden).
   - error, picker → "The save dialog could not be opened. Nothing was saved."
   - error, write → "The CSV file could not be saved. Check that you can write to this
     folder, then try again:" + the path in `<code>`. The status `<p>` gets the error style.
5. `finally`: `exportBusy = false`, re-enable the button.

`TabellifyCsvExport.platformIo(win)` (the real `io`; the only Zotero-run code in that file):
```js
pickSavePath: async ({ title, filterTitle, defaultName }) => {
  const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
  const fp = new FilePicker();
  fp.init(win, title, fp.modeSave);           // win = the workspace document's window (RT-S2)
  fp.appendFilter(filterTitle, "*.csv");
  fp.defaultString = defaultName;             // "… 2026-11-13.csv" (includes the extension)
  fp.defaultExtension = "csv";                // some platforms append it if the user removed it
  const rv = await fp.show();
  if (rv !== fp.returnOK && rv !== fp.returnReplace) return null;   // Cancel
  return { path: fp.file, replace: rv === fp.returnReplace };
},
writeUTF8: (path, text, options) => IOUtils.writeUTF8(path, text, options),
```
(Shape for the developer; exact code is theirs. `exportText` is where `path` flows from
`pickSavePath` to `writeUTF8` without change.)

**Overwrite.** On macOS the save sheet itself asks "… already exists. Do you want to replace
it?". Only after "Replace" does `show()` return `returnReplace`; Tabellify then overwrites
without asking a second time (like every Mac app). `returnOK` and `returnReplace` are
treated alike, as in Zotero's own export. The temp file makes the replacement atomic: if the
write fails, the old file is unchanged.

**Hook for 007a.** `onExportClick` takes an optional `baseName` (default: the collection
name). 007a's modal calls the same path with its Name field.

### Debug Output (no titles, names or paths)
All through `this.log` (`Tabellify: workspace: …`):
- `export: CSV built: 12 paper(s), 7 tag column(s), 2 group(s), 2 header row(s)`
- `export: save dialog cancelled` / `export: tab closed while the save dialog was open; nothing written`
- `export: CSV written: 4812 bytes (replaced an existing file: yes)`
- `export: CSV not written: write failed (NotAllowedError)` / `export: save dialog failed (TypeError)`,
  each followed by `Zotero.logError(e)` (its message may contain the chosen path, ADR-0017 §5).
Never a paper title, tag name, group name, collection name, file name or path in `this.log`.

### Pure module API (`src/content/csv-model.js`, global `TabellifyCsv`)
Classic script, `"use strict"`, one `var TabellifyCsv = { … }`; no Zotero, DOM, `IOUtils`,
`PathUtils`, `Services` or `ChromeUtils`. Never mutates inputs.
```
BOM: U+FEFF (one character), EOL: "\r\n"
guardFormula(text: string) → string            // adds "'" when needed (rules above)
field(text: string) → string                    // guard, then quote/escape when needed
rows(view, labels) → string[][]                 // header row(s) + one row per paper, unescaped
  view   = { groups: Array<{ id, name, tags, ungrouped?, run? }>,   // this.tableGroups
             papers: Array<{ title, untitled, count, total, groups: [{ present: string[] }] }>,
             counting: boolean }
  labels = { title, untitled, k, m }            // formatted Fluent strings
toCsv(rows: string[][]) → string                // BOM + fields joined by "," + CRLF per row
build(view, labels) → { text, stats: { papers, tagColumns, groups, headerRows } }
safeFileBase(name: string) → string             // "" when nothing is left
fileName(baseName, date: { year, month, day }, fallback) → string   // "<base> YYYY-MM-DD.csv"
```
`workspace.js` passes `{ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }`
from `new Date()` (local time), so the model needs no clock.

### Writer API (`src/content/csv-export.js`, global `TabellifyCsvExport`; ADR-0017 §3)
```
platformIo(win) → { pickSavePath, writeUTF8 }   // the only IOUtils / ChromeUtils use in src/
TMP_SUFFIX: ".tabellify-tmp"
exportText(text, { title, filterTitle, defaultName, shouldWrite }, io) →
  { status: "saved", path, bytes, replaced }
| { status: "cancelled", reason: "dialog" | "closed" }
| { status: "error", stage: "picker" | "write", path?, errorName }
```
`exportText` never throws (it catches and reports), never changes `path`, and calls
`io.writeUTF8` at most once, only after `pickSavePath` returned a path and `shouldWrite()`
returned true.

### Files
| File | Change |
|---|---|
| `src/content/csv-model.js` | **New.** Pure CSV builder (`TabellifyCsv`) |
| `src/content/csv-export.js` | **New.** Save dialog + the one write (`TabellifyCsvExport`), allow-listed (ADR-0017) |
| `src/content/workspace.xhtml` | Actions block after the table; two `<script>`s: `csv-model.js` and `csv-export.js` after `layout-store.js`, before `workspace.js` |
| `src/content/workspace.js` | Keep `tableRows` / `tableCounting`; `setTableHidden` covers the actions block; `onExportClick`; `exportBusy`, `unloaded`, `exportIo`; `EXPORT_STRINGS` formatted in `init`; click listener added in `init`, removed in `onUnload` |
| `src/content/workspace.css` | Actions block spacing, status line (reuse the codebook status styles; tokens only) |
| `src/locale/en-US/tabellify.ftl` | New IDs (below) |
| `tests/unit/csv-model.test.mjs` | **New** (AC14) |
| `tests/unit/csv-export.test.mjs` | **New** (AC15) |
| `tests/unit/workspace-table.test.mjs` | Export button and flow with fakes (AC16) |
| `tests/static/write-guard.test.mjs` | Third allow-list entry; pinned list; `csv-export.js` rules (AC17) |
| `tests/static/workspace-script.test.mjs` | Script order; new globals' purity; Fluent IDs; element IDs (AC17) |

### Fluent IDs (no arguments; paths appended in JS as plain text)
Proposed text, owner may change:
- `tabellify-export-csv` = Export CSV
- `tabellify-export-dialog-title` = Export table as CSV
- `tabellify-export-filter` = CSV files
- `tabellify-export-saved` = CSV saved:
- `tabellify-export-picker-error` = The save dialog could not be opened. Nothing was saved.
- `tabellify-export-write-error` = The CSV file could not be saved. Check that you can write
  to this folder, then try again:
- `tabellify-export-file-fallback` = Tabellify table
- `tabellify-csv-header-k` = Tags used (k)
- `tabellify-csv-header-m` = Codebook tags (M)
- Reused: `tabellify-column-title` (Title), `tabellify-untitled` ((untitled)).

### Lifecycle
One new listener: `click` on `#tabellify-export-csv`, added in `init`, removed in `onUnload`
(`symmetry` test). `onUnload` also sets `unloaded = true` (checked after the dialog
returns). No observer, timer, pref or main-window change. The `FilePicker` module is loaded
on demand and holds nothing after the dialog closes. Nothing in `bootstrap.js` or
`tabellify.js`.

### Does this need an ADR?
Yes: the first write outside `<data dir>/tabellify/`, a new write-guard entry and a native
dialog (CLAUDE.md rule 7, ADR-0012 §6) → **ADR-0017 (Proposed)**.

## Zotero / Mozilla APIs used
Details and sources in `docs/zotero-api-notes.md` ("Feature 008 rows", and the 006a–008 rows
for `FilePicker` / `IOUtils.writeUTF8`). **No new `Zotero.*` call** (`workspace.js`'s Zotero
allow-list gains no entry).

| API | Status |
|---|---|
| `ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs")` → `FilePicker`; `new FilePicker()`, `init(window, title, modeSave)`, `appendFilter`, `defaultString`, `defaultExtension`, `show()` → `returnOK` / `returnCancel` / `returnReplace`, `file` | Verified (docs + source), Zotero 10.0.9 / ESR 140. **From the tab `<iframe>`: UNVERIFIED (runtime) → RT-S2 = AC1** |
| `IOUtils.writeUTF8(path, text, { tmpPath })` (absolute path; default mode `"overwrite"`; resolves with bytes written; rejects with a `DOMException`) | Verified (source), ESR 140 `IOUtils.webidl` |
| UTF-8 encoding of the text (`UTF8String`: lone surrogates → U+FFFD; U+FEFF → bytes `EF BB BF`) | Verified (source), ESR 140 `TextEncoder.webidl` comment on `UTF8String` |
| `Date` (`getFullYear`, `getMonth`, `getDate`), `String.prototype.normalize`, regular expressions | Standard ECMAScript (MDN) |
| Already used, unchanged: `Zotero.debug`, `Zotero.logError`, `document.l10n.formatValue` | Existing rows |
| Not used (alternatives): `Zotero.File.getValidFileName` (rules mirrored in pure code), `Downloads.getPreferredDownloadsDirectory` (UNVERIFIED), `Zotero.File.putContentsAsync`, clipboard helpers (UNVERIFIED) | See api-notes |

## Data safety
- **Read from the library:** nothing new. The export uses only the rows and columns the table
  already holds in memory (titles, which codebook tags each paper has, counts).
- **Written to the library:** **nothing.** No item, tag, annotation, collection, attachment or
  database change. The write guard still forbids every Zotero write API in `src/`.
- **Written to disk:** exactly **one** file per export, at the path the user chose in the
  save dialog, plus a short-lived `<that path>.tabellify-tmp` in the same folder (moved over
  the file when the write completes; may remain only after a crash or a failed final move).
  An existing file is replaced only after the system dialog asked and the user chose
  "Replace". Nothing is written to `<data dir>/tabellify/`; no pref, no remembered path.
  Only `src/content/csv-export.js` may do this write (write-guard entry 3, ADR-0017).
- **Untrusted text:** titles, tag and group names go into the file only through
  `TabellifyCsv.field` (quoting + formula guard). On the page, the saved path is shown with
  `textContent` (`no-html-sinks`).
- **Privacy:** Debug Output has counts and outcomes only (no titles, names or paths);
  `Zotero.logError` on a failure may include the chosen path (ADR-0017 §5).
- Development and testing use only the dev profile and `~/Zotero tabellify-dev`; exported
  test files go to a folder the owner picks (e.g. the Desktop) and can be deleted afterwards.

## Acceptance criteria
`[manual]` = owner, Zotero 10.0.9 dev profile, collection "F005 test", Debug Output captured
to `build/debug-N.txt`. `[auto]` = `npm test`. Spreadsheet checks use whatever the owner has
(Numbers, Excel or LibreOffice); TextEdit shows the raw text (Format → Make Plain Text if
needed).

- [ ] AC1 `[manual]` **RT-S2 first (before development, any build with the Tabellify tab).**
  With the Tabellify tab open, the RT-S2 snippet (`docs/zotero-api-notes.md`, "RT-S2") opens
  a save dialog in front of Zotero titled "Tabellify RT-S2: press Cancel"; after Cancel it
  returns `{ rv: 1, cancel: 1 }`. Nothing is written. If it throws or no dialog appears, the
  owner reports the error and development waits (ADR-0017 "Riskier": switch to the main
  window and re-check).
- [ ] AC2 `[manual]` **Button.** With "F005 test" chosen, "Export CSV" is directly below the
  table. With the placeholder "Choose a collection" (or a collection without papers) there
  is no table and no button.
- [ ] AC3 `[manual]` **Save.** Clicking "Export CSV" opens the macOS save dialog with the
  title "Export table as CSV" and the suggested name "F005 test <today, YYYY-MM-DD>.csv".
  Saving to the Desktop shows "CSV saved:" and the full path under the button; the file is on
  the Desktop. (If macOS asks whether Zotero may access the Desktop, allowing it is fine.)
- [ ] AC4 `[manual]` **Content matches the screen.** Opening the file in TextEdit: the first
  line starts with a comma (empty cell above Title) and has each group's name above **every**
  column of that group and **empty** cells above ungrouped tags and above the last two
  columns; the second line is `Title`, the tag names in the on-screen order, `Tags used (k)`,
  `Codebook tags (M)`; then one line per paper in the on-screen order, `1` where the screen
  shows ✓, nothing where it does not, and k and M equal to the paper's k/M cell. The number
  of paper lines equals "Papers n".
- [ ] AC5 `[manual]` **Order follows the screen.** Sort by a tag column (descending), export
  again (new name), and the rows follow that order. Drag a tag column to another place and
  export: the columns follow. With "Manual order" shown, the export follows the manual
  order.
- [ ] AC6 `[manual]` **Spreadsheet and accents.** In the script box type
  `Exposure(Température)` (codebook only; Zotero's tags do not change). Export and open the
  file in the spreadsheet app: "Température" and every accented title show correctly (no
  "Ã©"), the two header rows and the `1` cells are in their own cells, and k and M are
  numbers (not dates). Remove `Température` afterwards in "Edit groups and tags".
- [ ] AC7 `[manual]` **Formula guard.** Type `"=1+1", -minus, @at, +plus` in the script box
  (four ungrouped codebook tags). Export and open the file: in TextEdit the header cells read
  `"'=1+1"`, `"'-minus"`, `"'@at"`, `"'+plus"`; in the spreadsheet app none of these cells
  shows a computed value (no `2`) or an error. Remove the four tags afterwards.
- [ ] AC8 `[manual]` **Replace.** Export again with the same name in the same folder: the
  system asks whether to replace it. "Cancel" there writes nothing; "Replace" overwrites the
  file (TextEdit shows the new content) without a second Tabellify question, and no
  `.tabellify-tmp` file is left in the folder.
- [ ] AC9 `[manual]` **Cancel.** Pressing Cancel in the save dialog writes no file, shows no
  message, and "Export CSV" works again at once.
- [ ] AC10 `[manual]` **Write error.** In Finder, select the exported file → File → Get Info →
  tick "Locked". Export again with the same name and choose "Replace": the line "The CSV file
  could not be saved. Check that you can write to this folder, then try again:" and the path
  appear in the error style; the locked file still has its old content. Note whether a
  `.tabellify-tmp` file was left (expected behaviour UNVERIFIED; report it). Untick
  "Locked" afterwards.
- [ ] AC11 `[manual]` **Library and log.** The dev Zotero library is unchanged (no new tags,
  items or notes; the tag selector does not list `Température`, `=1+1`, `-minus`, `@at`,
  `+plus`). `build/debug-N.txt` has the `export:` lines from the Design section with numbers
  only, **no paper title, tag name, group name, collection name or path** in them, and no
  Tabellify errors except the expected AC10 failure. Closing the tab afterwards produces no
  errors.
- [ ] AC12 `[auto]` **Header rows** (`tests/unit/csv-model.test.mjs`): two rows when a real
  group has columns, one when only ungrouped tags or no tags; group name repeated over every
  column of its group; empty over ungrouped runs (also several runs, and a real group named
  "Ungrouped" keeps its name), over Title, k and M; tag names in `view.groups` order; never
  the text "null" or "undefined".
- [ ] AC13 `[auto]` **Paper rows** (same file): order exactly as `view.papers`; `1` / empty
  from `present`; k and M as digits; empty k and M when `counting` is false; "(untitled)"
  label for untitled papers; a paper with every tag; zero papers gives header rows only;
  `stats` counts; inputs not mutated; 2 000 papers × 200 tags builds without error.
- [ ] AC14 `[auto]` **Dialect and guard** (same file): output starts with U+FEFF; every
  row ends with `"\r\n"` (last included); quoting for `,` `"` CR LF and doubled quotes; a
  field without specials is not quoted; guard for each of `=` `+` `-` `@` tab CR LF `＝` `＋`
  `－` `＠`, also after leading spaces; no guard for `a=b`, `1`, `-` in the middle, empty
  text; guarded fields always quoted; `<b>` and emoji pass through unchanged;
  `safeFileBase` (reserved characters, controls, bidi controls, zero-width, leading dots,
  trailing dots/spaces, NFC, 80-character cut without splitting a surrogate pair, empty
  result) and `fileName` (zero-padded date, fallback used for an empty base).
- [ ] AC15 `[auto]` **Writer** (`tests/unit/csv-export.test.mjs`, fake `io`, Node `vm`
  sandbox without `IOUtils` / `ChromeUtils`): cancel → no write, `cancelled`; OK → exactly one
  write to the **unchanged** path (also a path without `.csv`), with the same text and
  `tmpPath` = path + `.tabellify-tmp`, `saved` with bytes and `replaced: false`; replace →
  `replaced: true`; `shouldWrite()` false → no write, `cancelled/closed`; picker throws →
  `error/picker`, no write; write rejects → `error/write` with `errorName`; never throws.
- [ ] AC16 `[auto]` **Workspace** (`tests/unit/workspace-table.test.mjs`, fake DOM and fake
  `exportIo`): the actions block is hidden and shown with the table; a click builds the CSV
  from the rendered `tableGroups` / `tableRows` (after a sort and after a column move the
  text follows); the button is disabled during the export and enabled after; saved shows
  "CSV saved:" + path as text; cancel shows nothing; both error kinds show their message;
  `unloaded` set while the fake dialog is open → no write and no DOM change; the suggested
  name is built from the chosen collection's name; every `log` call during an export
  contains none of a test paper title, tag name, group name, collection name or path.
- [ ] AC17 `[auto]` **Static checks:** write-guard allow-list is exactly the three entries
  (codebook store, layout store, `content/csv-export.js` citing this spec), each really used;
  `csv-export.js` has exactly one `IOUtils.writeUTF8(` and exactly one place that builds its
  options, `{ tmpPath: path + this.TMP_SUFFIX }` (or equivalent; the developer pins the exact
  text in the test, as for `layout-store.js`), no `mode:`, no other
  `IOUtils` / `PathUtils` member, no `Zotero`, `Services` or `Zotero.File`, and its only
  `ChromeUtils` use is the `filePicker.mjs` import; no other file in `src/` mentions
  `filePicker.mjs`, `FilePicker` or `writeUTF8`; `csv-model.js` uses no Zotero / DOM /
  IOUtils / ChromeUtils globals; script order (`…, layout-store.js, csv-model.js,
  csv-export.js, workspace.js`); new Fluent IDs exist and start with `tabellify-`; new element
  IDs exist in `workspace.xhtml`; the Zotero allow-list for `workspace.js` gains no entry;
  `no-html-sinks`, `symmetry` and the ADR-0015 colour rule pass.

## How to verify in the dev profile (owner)
The orchestrator turns this into numbered steps with exact windows at smoke-test time.
1. **Before development:** run RT-S2 (AC1) with the build that is installed now; report the
   result.
2. After the 008 build: start the dev profile with Debug Output captured
   (`build/debug-N.txt`), install the `.xpi`, open Tools → Tabellify…, choose "F005 test".
3. Run AC2–AC11 in order (the inputs to type are in each AC). Exported files go to the
   Desktop; delete them afterwards.
4. Report "yes" or "no" plus anything that looked wrong; the orchestrator reads the debug
   file.

## Test plan
| AC | How |
|---|---|
| AC1 | Owner, Run JavaScript (RT-S2), before T1 |
| AC2–AC11 | Owner smoke test (manual), Debug Output in `build/debug-N.txt` |
| AC12–AC14 | `tests/unit/csv-model.test.mjs` (new; Node `vm` sandbox, like the other model tests) |
| AC15 | `tests/unit/csv-export.test.mjs` (new; `vm` sandbox with fake `io`) |
| AC16 | `tests/unit/workspace-table.test.mjs` (fake DOM) |
| AC17 | `tests/static/write-guard.test.mjs`, `tests/static/workspace-script.test.mjs`, `no-html-sinks`, `symmetry`, `l10n-and-window`, `design-tokens` |

## Task breakdown
| # | Task | Agent | Depends on | File scope |
|---|---|---|---|---|
| T0 | Owner approves this spec, ADR-0017 and Q1–Q13; owner runs RT-S2 (AC1) | owner / orchestrator | — | — |
| T1 | Pure CSV builder: `rows`, `field`, `guardFormula`, `toCsv`, `build`, `safeFileBase`, `fileName` + tests (AC12–AC14) | developer | T0 | `src/content/csv-model.js`, `tests/unit/csv-model.test.mjs` |
| T2 | Writer: `platformIo`, `exportText`; write-guard allow-list entry 3 and the `csv-export.js` static rules + tests (AC15, write-guard part of AC17) | developer | T0 (parallel with T1: no shared files) | `src/content/csv-export.js`, `tests/unit/csv-export.test.mjs`, `tests/static/write-guard.test.mjs` |
| T3 | Workspace: actions block, script order, `tableRows` / `tableCounting`, `setTableHidden`, `onExportClick`, status line, `unloaded`, `EXPORT_STRINGS`, listener + `onUnload`; CSS; Fluent; static checks (AC16, rest of AC17) | developer | T1, T2 | `src/content/workspace.xhtml`, `src/content/workspace.js`, `src/content/workspace.css`, `src/locale/en-US/tabellify.ftl`, `tests/unit/workspace-table.test.mjs`, `tests/static/workspace-script.test.mjs` |
| T4 | `npm test`, `npm run build`; owner smoke test AC2–AC11 | developer → owner | T3 | — |

T1 and T2 may run in parallel worktrees from `main` (no shared files). T3 needs both. One
concern per commit (T1, T2, T3 separate). If RT-S2 fails, T2's `platformIo` takes the main
window instead (`workspace.js` passes `Zotero.getMainWindow()`, a new allow-list entry for
`workspace.js` that needs a spec amendment and a re-run of RT-S2 in that form).

## Open questions (each with the recommendation this spec assumes)
1. **Q1 Super-header above ungrouped tags: blank or "Ungrouped"?** The screen now shows
   "Ungrouped" (006c Amendment 2). *Recommended: blank*, as you first asked. Reasons: a real
   group may be named "Ungrouped" (group names are free text), and a blank cell is the only
   value that can never be mistaken for one; in spreadsheets and R/Python an empty cell
   naturally means "no group"; "Ungrouped" on screen is a label for dragging, not data.
   Alternative: "Ungrouped" (matches the screen; ambiguous with a group of that name).
2. **Q2 Group name above every column of its group, or only above the first?** *Recommended:
   every column.* With blank-for-ungrouped, "first column only" makes a group's later columns
   look exactly like a neighbouring ungrouped tag (both blank), so the file could not be read
   back correctly; repeating also makes filtering and pivot tables work. Alternative: first
   column only (looks "merged" in Excel; only safe if Q1 = "Ungrouped").
3. **Q3 When the screen shows one header row** (no real group has columns): one row in the
   CSV too? *Recommended: yes*, so the file always matches the screen and has no empty first
   row. Alternative: always two rows (the first entirely empty in that case).
4. **Q4 k/M.** *Recommended: two number columns, "Tags used (k)" and "Codebook tags (M)".* A
   single "2/5" cell is turned into a **date** (5 February) by Excel and Numbers. Alternatives:
   one text column "2 of 5" (not a number); k only (M is the same on every row).
5. **Q5 ✓ cells.** *Recommended: `1` for ✓ and empty otherwise* (matches the empty cells on
   screen; `SUM`/`COUNT` work). Alternatives: `1`/`0` (better for averages; "0" where the
   screen is blank), "✓"/empty (looks like the screen; not countable), "Yes"/"No".
6. **Q6 Extra columns** (authors, year, citation key, Zotero item key/link)? *Recommended: none
   in 008* (your request: the table as shown). A later option could add an "Item key" column
   so each row can be traced back to its paper (PRD §6 "traceable synthesis").
7. **Q7 Formula guard.** *Recommended: put `'` in front and quote* (your suggestion; OWASP),
   checking the first character **after leading spaces** and including line feed and the
   full-width `＝＋－＠`. Cost: a title like "-omics review" is exported as "'-omics review"
   (the `'` may be visible in some apps). Alternatives: a tab instead of `'` (invisible in
   Excel, invisible change elsewhere); no guard (unsafe).
8. **Q8 UTF-8 with BOM?** *Recommended: yes* (Excel needs it for accents). Cost: R's
   `read.csv` and Python's `csv` show an invisible U+FEFF in the **first** cell unless told the encoding
   is `UTF-8-BOM` / `utf-8-sig`; in our files that first cell is empty (row 1 above Title), so
   the effect is small. Alternative: no BOM (accents break in Excel).
9. **Q9 Separator: comma?** *Recommended: comma* (RFC 4180, works in US/UK Excel, Numbers,
   LibreOffice, R, Python). In locales that use a decimal comma (e.g. German Excel), Excel
   expects ";" and puts everything in column A; such users can use File → Import. A
   "semicolon" setting could come later.
10. **Q10 Suggested file name** `"<collection> YYYY-MM-DD.csv"`? *Recommended: yes*
    (sortable date; 007a's Name replaces the collection name). Alternative: collection name
    only.
11. **Q11 After saving: only the line "CSV saved: <path>"?** *Recommended: yes.* A "Show in
    Finder" button would need `nsIFile.reveal()`, which is **UNVERIFIED** and not proposed.
12. **Q12 Untitled papers:** export the shown "(untitled)"? *Recommended: yes* (matches the
    screen). Alternative: empty title cell.
13. **Q13 Tab closed while the save dialog is open:** write nothing? *Recommended: yes* (the
    page that would report the result is gone; the user can export again).
