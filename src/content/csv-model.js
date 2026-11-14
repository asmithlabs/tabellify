/* Tabellify — csv-model.js (Feature 008: build the text of an "Export CSV" file)
 *
 * PURE LOGIC: no Zotero, no page (DOM), no files. It only turns the table that
 * workspace.js last drew (its blocks of tag columns and its papers, in the shown order)
 * into the text of a CSV file. tests/unit/csv-model.test.mjs runs it in Node.
 * Writing the text to disk is csv-export.js's job (ADR-0017 §3), not this file's.
 *
 * The CSV dialect (ADR-0017 §4, spec F008 "CSV dialect"):
 * - RFC 4180: cells separated by commas; a cell that contains a comma, a double quote, a
 *   carriage return (CR) or a line feed (LF) is wrapped in double quotes, and a double
 *   quote inside it is written twice (" becomes ""). Every row ends with CRLF ("\r\n"),
 *   the last row too.
 * - UTF-8 with a BOM: the text starts with the invisible character U+FEFF. When the text
 *   is saved as UTF-8 it becomes the three bytes EF BB BF, which tell Excel "this file is
 *   UTF-8" (without them, Excel shows "é" as "Ã©").
 * - Formula-injection guard: a spreadsheet treats a cell starting with = + - @ as a
 *   formula, so a paper title like =HYPERLINK(...) could run when the file is opened
 *   (OWASP "CSV Injection"). Every text cell that starts (after leading spaces) with one
 *   of those characters, a tab, CR, LF, or their full-width forms gets a ' in front and
 *   is quoted, so spreadsheets show it as plain text.
 *
 * What goes in the file (spec F008 Q1–Q5, Q12): Title, the tag columns in the on-screen
 * order, then k and M as two number columns. Two header rows when the screen shows two
 * (a group name above every column of that group, a blank cell above ungrouped tags,
 * Title, k and M), else only the tag-name row. "1" where the screen shows ✓, empty
 * elsewhere.
 *
 * Classic script (no import/export): workspace.xhtml loads it with <script>, and its one
 * global, TabellifyCsv, is then visible to workspace.js. Never changes its inputs.
 */
"use strict";

var TabellifyCsv = {
  /** U+FEFF, the byte-order mark: the first character of every exported text. */
  BOM: "\uFEFF",

  /** Line end after every row (RFC 4180). */
  EOL: "\r\n",

  /**
   * The id of a block of ungrouped tags in the table (TabellifyTagMonitor.UNGROUPED_ID and
   * TabellifyTableLayout.UNGROUPED_ID). Repeated here because this file must also run
   * alone in the Node tests.
   */
  UNGROUPED_ID: "ungrouped",

  /** Longest suggested file name (characters, without the date and ".csv"). */
  MAX_FILE_BASE: 80,

  /**
   * A cell that a spreadsheet could run as a formula: after any leading spaces, its first
   * character is = + - @, a tab, CR or LF, or the full-width ＝ ＋ － ＠ (U+FF1D, U+FF0B,
   * U+FF0D, U+FF20). Source: OWASP "CSV Injection".
   */
  FORMULA_START: /^ *[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/,

  /** Characters that force a field into double quotes (RFC 4180). */
  NEEDS_QUOTES: /[",\r\n]/,

  /**
   * Any value as text: null and undefined become "" (never the words "null"/"undefined").
   * @param {unknown} value
   * @returns {string}
   */
  str(value) {
    return value === null || value === undefined ? "" : String(value);
  },

  /**
   * Put a ' in front of the whole text when a spreadsheet could read it as a formula.
   * Leading spaces are kept (after the ').
   * @param {string} text
   * @returns {string}
   */
  guardFormula(text) {
    const s = this.str(text);
    return this.FORMULA_START.test(s) ? `'${s}` : s;
  },

  /**
   * One CSV field: the formula guard first, then quotes when needed. A guarded field is
   * always quoted (OWASP: prefix with ', wrap in double quotes).
   * @param {string} text
   * @returns {string}
   */
  field(text) {
    const raw = this.str(text);
    const guarded = this.guardFormula(raw);
    if (guarded === raw && !this.NEEDS_QUOTES.test(raw)) return raw;
    // A double quote inside a quoted field is written twice (RFC 4180).
    return `"${guarded.replace(/"/g, '""')}"`;
  },

  /**
   * True for a block of tags without a group (ADR-0016 / ADR-0019): its header cell in the
   * file is blank. A real group named "Ungrouped" has a different id and keeps its name.
   * @param {{ id?: string, ungrouped?: boolean }} block
   */
  isUngrouped(block) {
    return block?.ungrouped === true || block?.id === this.UNGROUPED_ID;
  },

  /**
   * A number Tabellify computed itself (k or M) as digits, or "" when it is missing.
   * @param {unknown} n
   */
  number(n) {
    return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
  },

  /**
   * The rows of the file, cells still unescaped (toCsv quotes them).
   * @param {{ groups?: Array<{ id: string, name?: string, tags?: string[], ungrouped?: boolean, run?: number }>,
   *   papers?: Array<{ title?: string, untitled?: boolean, count?: number, total?: number,
   *     groups?: Array<{ present?: string[] }> }>,
   *   counting?: boolean }} view  What the table shows now (workspace.js tableGroups /
   *   tableRows / tableCounting)
   * @param {{ title: string, untitled: string, k: string, m: string }} labels  Fluent texts
   * @returns {string[][]}
   */
  rows(view, labels) {
    const groups = view?.groups ?? [];
    const papers = view?.papers ?? [];
    const counting = view?.counting === true;
    // One entry per tag column, left to right, with the text above it.
    const columns = groups.flatMap((g) => (g.tags ?? []).map((tag) => ({
      tag: this.str(tag),
      above: this.isUngrouped(g) ? "" : this.str(g.name),
    })));
    const tagRow = [this.str(labels?.title), ...columns.map((c) => c.tag), this.str(labels?.k), this.str(labels?.m)];
    const out = [];
    if (this.headerRowCount(groups) === 2) out.push(["", ...columns.map((c) => c.above), "", ""]);
    out.push(tagRow);
    for (const paper of papers) {
      const present = new Set((paper.groups ?? []).flatMap((g) => g.present ?? []));
      out.push([
        paper.untitled ? this.str(labels?.untitled) : this.str(paper.title),
        ...columns.map((c) => (present.has(c.tag) ? "1" : "")),
        counting ? this.number(paper.count) : "",
        counting ? this.number(paper.total) : "",
      ]);
    }
    return out;
  },

  /**
   * 2 when the screen shows two header rows (at least one real group has columns), else 1
   * (only ungrouped tags, or no tag columns at all): spec F008 Q3.
   * @param {Array<{ id: string, tags?: string[], ungrouped?: boolean }>} groups
   * @returns {1 | 2}
   */
  headerRowCount(groups) {
    return (groups ?? []).some((g) => !this.isUngrouped(g) && (g.tags ?? []).length > 0) ? 2 : 1;
  },

  /**
   * The CSV text: the BOM, then every row's fields joined by commas, each row ending CRLF.
   * @param {string[][]} rows
   * @returns {string}
   */
  toCsv(rows) {
    return this.BOM + rows.map((row) => row.map((cell) => this.field(cell)).join(",") + this.EOL).join("");
  },

  /**
   * The whole export: text plus counts for Debug Output (numbers only, never names).
   * `groups` counts the real groups with columns (ungrouped runs are not groups).
   * @param {Parameters<typeof TabellifyCsv.rows>[0]} view
   * @param {Parameters<typeof TabellifyCsv.rows>[1]} labels
   * @returns {{ text: string, stats: { papers: number, tagColumns: number, groups: number, headerRows: number } }}
   */
  build(view, labels) {
    const groups = view?.groups ?? [];
    const headerRows = this.headerRowCount(groups);
    return {
      text: this.toCsv(this.rows(view, labels)),
      stats: {
        papers: (view?.papers ?? []).length,
        tagColumns: groups.reduce((sum, g) => sum + (g.tags ?? []).length, 0),
        groups: groups.filter((g) => !this.isUngrouped(g) && (g.tags ?? []).length > 0).length,
        headerRows,
      },
    };
  },

  /**
   * A name that is safe to suggest in the save dialog (spec F008 "Suggested file name").
   * Mirrors Zotero.File.getValidFileName's rules (docs/zotero-api-notes.md), plus Windows
   * and length rules. "" when nothing is left.
   * @param {string} name  Untrusted text (a collection name)
   * @returns {string}
   */
  safeFileBase(name) {
    let s = this.str(name).normalize("NFC");
    s = s.replace(/[\/\\?*:|"<>]/g, "");
    // Control characters (tab, CR, LF, …) and line/paragraph separators become spaces.
    s = s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ");
    // Zero-width and bidirectional controls are removed, so a name cannot hide or reverse
    // its real extension (a right-to-left override, U+202E, can make a name ending in
    // "vsc.exe" look like one ending in "exe.csv").
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "");
    s = s.replace(/ {2,}/g, " ");
    // No leading dots (a hidden file on macOS), no trailing dots or spaces (Windows).
    const tidy = (t) => t.trim().replace(/^[. ]+/, "").replace(/[. ]+$/, "");
    s = tidy(s);
    // Array.from splits by characters (code points), so a cut never breaks an emoji or
    // any other character made of two UTF-16 units (a "surrogate pair").
    const chars = Array.from(s);
    if (chars.length > this.MAX_FILE_BASE) s = tidy(chars.slice(0, this.MAX_FILE_BASE).join(""));
    return s;
  },

  /**
   * The suggested file name "<base> YYYY-MM-DD.csv" (spec F008 Q10). `date` is the local
   * date from the caller, so this module needs no clock.
   * @param {string} baseName  e.g. the collection name (cleaned here)
   * @param {{ year: number, month: number, day: number }} date  month 1–12
   * @param {string} fallback  Used when baseName has nothing usable (Fluent text)
   * @returns {string}
   */
  fileName(baseName, date, fallback) {
    const base = this.safeFileBase(baseName) || this.safeFileBase(fallback);
    const pad = (n, width) => String(Math.trunc(Number(n) || 0)).padStart(width, "0");
    const day = `${pad(date?.year, 4)}-${pad(date?.month, 2)}-${pad(date?.day, 2)}`;
    return base ? `${base} ${day}.csv` : `${day}.csv`;
  },
};
