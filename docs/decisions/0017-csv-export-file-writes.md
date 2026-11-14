# ADR-0017: CSV export: how and where Tabellify writes a file outside its own folder

- **Status:** Accepted (owner approved 2026-11-13, option A, all recommendations)
- **Date:** 2026-11-13
- **Deciders:** Antonio Smith (owner), Claude (architect, drafted)
- **Related:** Feature 008 spec `docs/features/008-export-csv.md` (this ADR's first user);
  outline in `docs/features/006a-workspace-restructure.md` ("ADR-0017 outline" and "Later
  phases → 008"); ADR-0012 (Accepted: Tabellify's own data in `<data dir>/tabellify/`, the
  write-guard allow-list rule, §6); ADR-0014 (Accepted: `layout.json`, the second allow-list
  entry); ADR-0011 (Accepted: security review; its threat model names "CSV/XLSX formula
  injection" and "export paths and overwrite"); ADR-0003 (no bundler, no new dependency);
  `docs/architecture.md` §5 ("CSV written only to a user-chosen location (file picker)");
  PRD §3 step 6, §6 (library safety).

## Context

Feature 008 adds an "Export CSV" button under the per-paper table. Until now Tabellify writes
files **only** inside its own folder, `<Zotero data directory>/tabellify/`, from exactly two
files (`codebook-store.js`, `layout-store.js`), each a narrow entry in the write guard
(`tests/static/write-guard.test.mjs`, ADR-0012 §6, ADR-0014 §6). A CSV export is different
in three ways:

1. **It writes anywhere the user chooses** (Desktop, Documents, a shared folder), not in a
   folder Tabellify owns. A bug in the path could overwrite one of the user's own files.
2. **It may overwrite an existing file** (the user exports twice under the same name).
3. **The file is opened later by other programs** (Excel, Numbers, LibreOffice, R, Python).
   Paper titles, tag names and group names are untrusted text (they can come from synced or
   imported data, ADR-0011). A spreadsheet treats a cell that starts with `=`, `+`, `-` or
   `@` as a formula, so a title like `=HYPERLINK("https://evil.example","click")` could run
   or leak data when the file is opened. This is called **CSV injection** or **formula
   injection** ([OWASP, "CSV Injection"](https://owasp.org/www-community/attacks/CSV_Injection)).

CLAUDE.md rule 7 asks for an ADR for a new kind of storage write and a new UI surface (a
native dialog), and ADR-0012 §6 says every new write location needs its own allow-list entry.

Constraints: verified APIs only (rule 1), no new dependency (rule 3), no library writes
(rule 8), Zotero 10.0.x on Firefox 140 ESR (ADR-0008).

### Background for a JavaScript learner
- **File picker:** the operating system's own "Save As" dialog. Tabellify only *asks* it for a
  path; the dialog itself writes nothing. On macOS it is the standard save sheet, which also
  asks "Replace?" when the chosen file already exists.
- **`nsIFilePicker` / Zotero's `FilePicker`:** Firefox's interface to that dialog, and Zotero's
  small wrapper around it (`chrome://zotero/content/modules/filePicker.mjs`). Zotero's own
  "Export Library…" uses the same wrapper. `show()` returns a number: `returnOK` (0, a new
  file), `returnCancel` (1), or `returnReplace` (2, "User acknowledged file already exists so
  ok to replace", `nsIFilePicker.idl`).
- **Atomic write with `tmpPath`:** `IOUtils.writeUTF8(path, text, { tmpPath })` writes the
  whole text to a temporary file first, then moves it over `path` in one step. If Zotero
  crashes or the disk is full halfway, the old file at `path` is still intact.
- **BOM (byte-order mark):** three invisible bytes (`EF BB BF`) at the very start of a file
  that tell Excel "this file is UTF-8". Without them, Excel on macOS and Windows often shows
  "é" as "Ã©".
- **CRLF:** the two characters "carriage return + line feed" (`\r\n`) that end each line.
  RFC 4180, the CSV standard, uses them; every spreadsheet reads them.

## Decision

### 1. Where: a save dialog, every time
Tabellify writes a CSV file **only to the path that Zotero's `FilePicker` returned, in save
mode, for the click that started this export.**
- `const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs")`
  (the import line documented in the Zotero 7 developer guide), `new FilePicker()`,
  `fp.init(window, title, fp.modeSave)` with the workspace document's own `window` (it works
  in the tab `<iframe>` and in the fallback window if runtime check **RT-S2** passes; see
  Consequences), `fp.appendFilter(<"CSV files">, "*.csv")`, `fp.defaultString = <suggested
  name>.csv`, `fp.defaultExtension = "csv"`, `const rv = await fp.show()`.
- `rv === fp.returnOK` or `rv === fp.returnReplace` → write to `fp.file`. Anything else
  (Cancel) → write nothing. This is exactly how Zotero's own export treats the two codes
  (`fileInterface.js`, `Zotero_File_Exporter.prototype.save`: `if (rv != fp.returnOK && rv !=
  fp.returnReplace) { return; }`).
- **The path is used exactly as returned.** Tabellify never adds or changes an extension,
  never builds a path itself, never remembers a path to write to it again later without a
  new dialog, and never writes a second file next to it except the short-lived temp file
  (§2). (If the user deletes ".csv" in the dialog, the file is saved without it. Adding
  ".csv" ourselves could overwrite a different, existing file that the dialog never asked
  about.)
- **No "save to Downloads automatically"** (the PRD sketch). It would create files the user
  did not place, needs a Mozilla API that is UNVERIFIED for Zotero
  (`Downloads.getPreferredDownloadsDirectory`), and contradicts `docs/architecture.md` §5.

### 2. How: `IOUtils.writeUTF8` with a temp file
`await IOUtils.writeUTF8(path, text, { tmpPath: path + ".tabellify-tmp" })`
- Default `mode` `"overwrite"`: creates the file, or replaces it. Replacing is allowed only
  because the dialog already asked the user (macOS "Replace?") and returned `returnReplace`
  (or `returnOK`, which Zotero treats the same way).
- `tmpPath` in the **same folder** as the target (a move inside one folder is a rename, so it
  is atomic). The suffix `.tabellify-tmp` makes a clash with a real user file practically
  impossible. On success the temp file is gone (moved over the target).
- No `backupFile`: a `.bak` copy would be a second file in the user's folder that the user
  did not ask for.
- No `flush: true` (slow, system-wide; same reasoning as ADR-0012 §2).
- No folder creation (`makeDirectory`), no `remove`, `move` or `copy` calls: the dialog only
  returns folders that exist.
- The returned byte count is logged (a number only).

### 3. One writer file, the third write-guard entry
- New file **`src/content/csv-export.js`** (global `TabellifyCsvExport`): opens the dialog and
  writes the text. It is the **only** file in `src/` that may call `IOUtils.writeUTF8`, and
  the only file that may import `filePicker.mjs`.
- `tests/static/write-guard.test.mjs` gets a third allow-list entry:
  `{ file: "content/csv-export.js", pattern: "IOUtils write", spec: "docs/features/008-export-csv.md" }`,
  and the self-test that pins the list now expects three entries.
- Extra static rules for that file (spec F008 AC17): exactly one `IOUtils.writeUTF8(` call;
  exactly one place that builds the write options, with `tmpPath` derived from the path the
  picker returned (the unit test with fake `io` proves the path is passed through unchanged);
  no other `IOUtils` or `PathUtils` member; no `Zotero.File`, `Zotero.DB`,
  `Services` or `Zotero` at all; the only `ChromeUtils` use is the `filePicker.mjs` import;
  no `mode:` option (the default is wanted, and `"append"` is never allowed).
- Testable without Zotero: like the two stores, it takes its platform functions as a
  parameter (`io = { pickSavePath, writeUTF8 }`); a Node test passes fakes.
- `workspace.js` calls it and never touches `IOUtils`, `ChromeUtils` or `FilePicker`.

### 4. What is written: a fixed CSV dialect, built by pure code
The text is built by a new **pure** module, `src/content/csv-model.js` (global
`TabellifyCsv`; no Zotero, DOM, `IOUtils` or `ChromeUtils`), unit-tested in Node:
- **RFC 4180** ([RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)): comma separator; a field
  is wrapped in double quotes when it contains a comma, a double quote, CR or LF; a double
  quote inside a quoted field is doubled (`"` → `""`); every line ends with CRLF, including
  the last.
- **UTF-8 with a BOM** (the character U+FEFF, written in JavaScript as backslash-u-FEFF, as
  the first character of the text; `writeUTF8` encodes it
  as `EF BB BF`).
- **Formula-injection guard** on **every** text cell (titles, tag names, group names, header
  labels): if the cell, after any leading spaces, starts with `=`, `+`, `-`, `@`, a tab, CR,
  LF, or the full-width forms `＝ ＋ － ＠`, a single quote `'` is put in front and the field is
  quoted. This follows OWASP's list of leading characters and its "prepend a single quote,
  wrap in double quotes, double inner quotes" advice. Numbers Tabellify makes itself (`1`,
  k, M) are digits only and never match.
- What the rows and columns are (two header rows, blank super-header for ungrouped tags,
  ✓ → `1`, k and M as numbers) is product behaviour and lives in the feature spec, not here.

### 5. Privacy and logging
- Debug Output for an export holds **counts and outcomes only**: number of papers, tag
  columns, groups and header rows, byte count, "cancelled", "replaced an existing file:
  yes/no", and an error's `name` (e.g. `NotAllowedError`). Never paper titles, tag or group
  names, the collection name, the file name or the path.
- On a failure Tabellify also calls `Zotero.logError(e)` (as everywhere else); the platform's
  error message may contain the chosen path. That is accepted: the path is the user's own
  choice and the Error Console is local.
- The path is shown to the user on the page (status line, as the codebook status already
  does), as plain text.
- Nothing about an export is stored: no pref for "last folder", no history.

### 6. Library safety
An export reads only what the table already shows (Tabellify's in-memory rows and columns
from the last render). It makes **no** new `Zotero.*` call and writes nothing to the
library, to `zotero.sqlite`, or to `<data dir>/tabellify/`.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **A. Save dialog (`FilePicker`) + `IOUtils.writeUTF8` with `tmpPath` (recommended)** | User decides where; the OS asks before replacing; same wrapper Zotero's own export uses; documented import line (Z7); atomic write; one small allow-listed file | One more allow-list entry; the dialog in the tab `<iframe>` needs RT-S2; a crash between the temp write and the move can leave a `.tabellify-tmp` file in that folder |
| B. Save automatically to Downloads (PRD sketch) | One click, no dialog | Files appear where the user did not choose; overwrite or "name (2).csv" logic needed; `Downloads.sys.mjs` UNVERIFIED for Zotero; contradicts architecture §5 |
| C. Copy the CSV to the clipboard (no file) | No file write at all, no write-guard change; paste into any spreadsheet | No file to keep or share; large tables are awkward; the clipboard helper in Zotero (`Zotero.Utilities.Internal.copyTextToClipboard`) is internal and **UNVERIFIED** here. Could be an extra button later |
| D. `Zotero.File.putContentsAsync(path, text)` | Listed on Zotero's JavaScript API page | Built on Zotero's `OS.File` compatibility shim, which the Z7 guide says not to rely on (ADR-0012 option A3); no BOM control beyond the string; a second write family in the guard |
| E. `nsIFileOutputStream` + converter stream (what Zotero's "Save as RTF/HTML" bibliography does) | Used by Zotero itself | XPCOM streams, more code to open/close correctly, not atomic, not testable with a simple fake |
| F. `IOUtils.writeUTF8(path, text)` without `tmpPath` | Simplest; no temp file ever | A failure halfway leaves a broken file where the user's old file was (when replacing) |
| G. Dialog `returnReplace` refused (always write with `mode: "create"`) | Can never overwrite anything | Exporting again under the same name fails although the user just confirmed "Replace"; unlike every other app |

Formula-injection guard alternatives (detail in spec Q7):

| Option | Pros | Cons |
|---|---|---|
| **Apostrophe `'` prefix + quoting (recommended; the owner's suggestion; OWASP)** | Widely used; Excel and LibreOffice treat the cell as text | The `'` is part of the data: visible in TextEdit, R, Python, and possibly in the spreadsheet cell |
| Tab prefix inside the quotes (OWASP's Excel-specific advice) | Invisible in Excel | Changes the data invisibly; other tools see a tab; less known |
| No guard | Data unchanged | Untrusted titles can run formulas when the file is opened (ADR-0011 threat) |

## Consequences
- **Easier:** later exports (XLSX, saved tables in 007b, the "View table" modal's export in
  007a) reuse `csv-export.js` and `csv-model.js`; the audit has one place to read.
- **Harder:** the write guard now allows writes **outside** Tabellify's folder in one file;
  that file's static rules (§3) are what keep it narrow, so changes to it need the
  security-auditor (ADR-0011).
- **Riskier:**
  - **RT-S2 (UNVERIFIED at runtime):** whether `FilePicker.init(window, …)` works with the
    tab `<iframe>`'s window. `init` uses `parentWindow.browsingContext`; a chrome iframe has
    one, but it was not observed. If RT-S2 fails, this ADR's §1 changes to the main window
    (`Zotero.getMainWindow()`, called in `workspace.js` and passed in), which must be checked
    the same way. RT-S2 is the owner's first check (spec F008 AC1), before development.
  - `filePicker.mjs` is a Zotero module, not a Mozilla one. Its import line is documented in
    the Z7 guide, and Zotero's own export uses it, so a silent change is unlikely. **Recheck
    `chrome/content/zotero/modules/filePicker.mjs` before each `strict_max_version` raise.**
  - A leftover `<name>.csv.tabellify-tmp` after a crash or a failed final move. Harmless
    text; the error message names the folder. Not cleaned up automatically (that would need
    `IOUtils.remove` outside our folder, which this ADR does not allow).
  - The apostrophe guard changes some cells (a title starting with "-" gains a "'").
- **Follow-up:** spec F008 tasks; security-auditor checks the threat-model items "formula
  injection" and "export paths and overwrite"; docs-writer updates `docs/wiki/Export.md` and
  "Data Safety and Privacy" (end of prototype mode).
- **Revisit when:** XLSX is added (a binary format and maybe a dependency, own ADR); a
  "remember last folder" or "export again to the same file" feature is wanted (stores a
  path; changes §1); Zotero offers a documented plugin export API.

## Open questions for the owner
1. Approve option A (save dialog + `writeUTF8` with `tmpPath`, one allow-listed writer file)?
   *Recommended: yes.*
2. Approve the apostrophe guard (spec Q7)? *Recommended: yes.*
3. Accept that `Zotero.logError` on a failed export may contain the chosen path (§5)?
   *Recommended: yes* (local only; titles and names never logged).
