/* Tabellify — csv-export.js (Feature 008: the "Export CSV" save dialog and file write)
 *
 * WRITES TO DISK, OUTSIDE TABELLIFY'S OWN FOLDER (ADR-0017). This is the only file in src/
 * that may write a file the user chose: tests/static/write-guard.test.mjs allows exactly
 * one IOUtils.writeUTF8 call here (allow-list entry 3) and checks the extra rules of
 * ADR-0017 §3. It never touches the Zotero library or zotero.sqlite. Per export it writes:
 *   <the path the save dialog returned>                 the CSV text
 *   <that path>.tabellify-tmp                           short-lived: written first, then
 *                                                       moved over the path in one step
 * The path is used EXACTLY as the dialog returned it: no extension is added, no folder is
 * created, nothing is deleted, and no path is remembered for later.
 *
 * How the save dialog works: Zotero's FilePicker module wraps Firefox's nsIFilePicker,
 * the operating system's own "Save As" dialog (docs/zotero-api-notes.md, F008 rows).
 * The dialog only ASKS the user for a path; it writes nothing. On macOS it also asks
 * "Replace?" when the file already exists; only after "Replace" does show() return
 * returnReplace, so Tabellify does not ask a second time. Cancel → nothing is written.
 *
 * TESTABLE WITHOUT ZOTERO: exportText() takes its two platform functions as a parameter
 * `io` = { pickSavePath, writeUTF8 } (same idea as codebook-store.js and layout-store.js).
 * In Zotero, platformIo(win) supplies the real dialog and the real write;
 * tests/unit/csv-export.test.mjs passes fakes and checks that Cancel writes nothing.
 *
 * async/await: the dialog and the write both return Promises (values that arrive later).
 * `await` waits for them without freezing Zotero; a failed Promise makes `await` throw.
 *
 * Privacy (ADR-0017 §5): the result carries the path so the page can show it to the user,
 * but this file logs nothing; workspace.js logs counts and outcomes only.
 */
"use strict";

var TabellifyCsvExport = {
  /** Suffix of the temporary file next to the chosen path (ADR-0017 §2). */
  TMP_SUFFIX: ".tabellify-tmp",

  /**
   * The real platform functions. Runs only inside Zotero.
   * @param {Window} win  The workspace document's own window (the tab <iframe>'s window,
   *   or the fallback window). RT-S2 (spec F008 AC1) confirmed the dialog opens from it.
   * @returns {CsvExportIo}
   */
  platformIo(win) {
    return {
      pickSavePath: async ({ title, filterTitle, defaultName }) => {
        // ChromeUtils.importESModule loads a privileged JavaScript module by its chrome://
        // URL (Zotero 7+). "chrome://zotero/…" is a file inside Zotero itself; the module
        // is loaded once and cached, and holds nothing after the dialog closes.
        const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
        const fp = new FilePicker();
        fp.init(win, title, fp.modeSave);
        fp.appendFilter(filterTitle, "*.csv");
        fp.defaultString = defaultName; // the suggested name, with ".csv"
        fp.defaultExtension = "csv"; // some platforms append it if the user removed it
        const rv = await fp.show();
        // Same rule as Zotero's own export: OK and Replace write, anything else is Cancel.
        if (rv !== fp.returnOK && rv !== fp.returnReplace) return null;
        return { path: fp.file, replace: rv === fp.returnReplace };
      },
      writeUTF8: (path, text, options) => IOUtils.writeUTF8(path, text, options),
    };
  },

  /**
   * The options of the one write: a temp file in the same folder, so the write is atomic
   * (the temp file is moved over the target in one step; if the write fails halfway, an
   * existing file at `path` is unchanged). Default mode ("overwrite"); no backup file.
   * @param {string} path  Exactly the path the dialog returned
   */
  writeOptions(path) {
    return { tmpPath: path + this.TMP_SUFFIX };
  },

  /**
   * Ask for a path and write `text` there. Never throws; reports what happened.
   * - `{ status: "saved", path, bytes, replaced }`
   * - `{ status: "cancelled", reason: "dialog" }`: the user pressed Cancel
   * - `{ status: "cancelled", reason: "closed" }`: `shouldWrite()` said no (the tab closed
   *   while the dialog was open, spec Q13)
   * - `{ status: "error", stage: "picker", errorName, error }`: the dialog failed
   * - `{ status: "error", stage: "write", path, errorName, error }`: the write failed
   * `io.writeUTF8` is called at most once, only after the dialog returned a path and
   * `shouldWrite()` returned true, and always with that path unchanged.
   * @param {string} text
   * @param {{ title: string, filterTitle: string, defaultName: string, shouldWrite?: () => boolean }} options
   * @param {CsvExportIo} io
   * @returns {Promise<object>}
   */
  async exportText(text, options, io) {
    const { title, filterTitle, defaultName, shouldWrite } = options ?? {};
    let picked;
    try {
      picked = await io.pickSavePath({ title, filterTitle, defaultName });
    } catch (e) {
      return { status: "error", stage: "picker", errorName: this.errorName(e), error: e };
    }
    if (!picked || typeof picked.path !== "string" || picked.path === "") {
      return { status: "cancelled", reason: "dialog" };
    }
    const path = picked.path;
    let allowed;
    try {
      allowed = typeof shouldWrite === "function" ? shouldWrite() === true : true;
    } catch {
      allowed = false;
    }
    if (!allowed) return { status: "cancelled", reason: "closed" };
    try {
      const bytes = await io.writeUTF8(path, text, this.writeOptions(path));
      return { status: "saved", path, bytes, replaced: picked.replace === true };
    } catch (e) {
      return { status: "error", stage: "write", path, errorName: this.errorName(e), error: e };
    }
  },

  /**
   * An error's name (e.g. "NotAllowedError"), safe to log: never its message, which may
   * contain the path.
   * @param {unknown} e
   */
  errorName(e) {
    const name = e && typeof e === "object" ? e.name : null;
    return typeof name === "string" && name !== "" ? name : "Error";
  },
};

/**
 * @typedef {{
 *   pickSavePath: (options: { title: string, filterTitle: string, defaultName: string })
 *     => Promise<{ path: string, replace: boolean } | null>,
 *   writeUTF8: (path: string, text: string, options: { tmpPath: string }) => Promise<number>,
 * }} CsvExportIo
 */
