/* Tabellify — tables-store.js (Feature 007b, ADR-0018: load and save the saved tables)
 *
 * Reads and writes <Zotero data directory>/tabellify/tables.json: every saved table, with
 * its definition (the recipe) and its snapshot (the photo). Same rules as the codebook and
 * layout files (ADR-0012), in a separate file so a damaged tables file can never block the
 * codebook or the layout (and the other way round).
 * Owner's dev profile: ~/Zotero tabellify-dev/tabellify/tables.json
 *
 * WRITES TO DISK (one of the four files in src/ that do: codebook-store.js, layout-store.js,
 * csv-export.js and this one). tests/static/write-guard.test.mjs allows "IOUtils write"
 * calls here (ADR-0018 §5). It never touches the Zotero library or zotero.sqlite; it writes
 * only these files in Tabellify's own folder:
 *   tables.json      the data
 *   tables.json.tmp  short-lived: written first, then moved over tables.json
 *   tables.json.bak  the previous version (a one-step manual undo, e.g. after a delete)
 * Nothing is created until the first save (loading a missing file creates nothing), and a
 * file that cannot be read, fails the strict check, or was made by a newer Tabellify is
 * NEVER overwritten (ADR-0018 §3). Deleting a table is a normal save of the list without
 * it: there is no remove, move or copy call here.
 *
 * The folder is passed in by the caller (workspace.js gets it from
 * TabellifyCodebookStore.dataDir()), so the internal Zotero data-directory property is
 * still read in exactly one place in src/.
 *
 * TESTABLE WITHOUT ZOTERO: load() and saveData() take the file functions as a parameter
 * `fs` = { readJSON, writeJSON, makeDirectory, join } (same idea as layout-store.js).
 * In Zotero, platformFs() supplies Firefox's IOUtils / PathUtils;
 * tests/unit/tables-store.test.mjs passes a fake that keeps "files" in a Map.
 *
 * async/await: IOUtils functions return Promises (the disk work happens in the background).
 * `await` waits for the result without freezing Zotero; a failed Promise makes `await` throw.
 *
 * Needs saved-tables-model.js loaded first (uses the global TabellifySavedTables).
 */
"use strict";

var TabellifyTablesStore = {
  FILE_NAME: "tables.json",

  /**
   * The real file functions. IOUtils and PathUtils are Firefox globals available to
   * privileged (chrome) documents such as the workspace (docs/zotero-api-notes.md, F004 rows).
   * @returns {TablesFs}
   */
  platformFs() {
    return {
      readJSON: (path) => IOUtils.readJSON(path),
      // tmpPath + backupFile: an atomic write that keeps the previous version (ADR-0012 §2).
      writeJSON: (path, value, options) => IOUtils.writeJSON(path, value, options),
      // Creates the folder (and missing parents); succeeds if it already exists.
      makeDirectory: (path) => IOUtils.makeDirectory(path),
      join: (...parts) => PathUtils.join(...parts),
    };
  },

  /**
   * Read the saved tables file. Never writes.
   * - `{ status: "ok", data, path, existed, fromVersion }`: usable (checked and copied by
   *   the model). `existed: false` means there was no file: `data` is empty, `fromVersion`
   *   is null, and nothing was created.
   * - `{ status: "newer", path, reason }`: made by a newer Tabellify: never overwrite.
   * - `{ status: "invalid", path, reason }`: not JSON, unreadable, or failed the strict
   *   check: never overwrite (`.bak` is the manual recovery).
   * @param {TablesFs} fs
   * @param {string} dir
   * @returns {Promise<object>}
   */
  async load(fs, dir) {
    const path = fs.join(dir, this.FILE_NAME);
    let raw;
    try {
      raw = await fs.readJSON(path);
    } catch (e) {
      // IOUtils reports a missing file with an error named "NotFoundError".
      if (e?.name === "NotFoundError") {
        return { status: "ok", data: TabellifySavedTables.emptyData(), path, existed: false, fromVersion: null };
      }
      return { status: "invalid", path, reason: `could not read: ${e?.name ?? "error"}` };
    }
    const check = TabellifySavedTables.validate(raw);
    if (!check.ok) return { status: check.newer ? "newer" : "invalid", path, reason: check.reason };
    return { status: "ok", data: TabellifySavedTables.migrate(raw), path, existed: true, fromVersion: raw.schemaVersion };
  },

  /**
   * Save `data` (the result of a model edit), unless the file changed since this workspace
   * loaded it.
   *
   * Steps: re-read the file and compare its `revision` with `loadedRevision` (another
   * Tabellify tab may have saved meanwhile, ADR-0012 §5); check the new data (strict check
   * and file size); create the folder; write atomically with a backup. The saved data gets
   * `revision = loadedRevision + 1`.
   * - `{ status: "saved", data, path }`: `data` is what was written (new revision).
   * - `{ status: "conflict", path, reason }`: nothing written; the caller should reload.
   *   Also used when the file on disk has become unreadable or invalid, or was made by a
   *   newer Tabellify, so such a file is never overwritten.
   * - `{ status: "error", path, error }`: the data is invalid or too large, or the write
   *   failed; the file on disk is unchanged.
   * @param {TablesFs} fs
   * @param {string} dir
   * @param {{ nextId: number, tables: object[] }} data
   * @param {number} loadedRevision  revision last loaded or saved (0 = no file)
   * @returns {Promise<object>}
   */
  async saveData(fs, dir, data, loadedRevision) {
    const path = fs.join(dir, this.FILE_NAME);

    // 1. Has someone else saved since we loaded? A missing file counts as revision 0.
    let diskRevision;
    try {
      const onDisk = await fs.readJSON(path);
      const check = TabellifySavedTables.validate(onDisk);
      if (!check.ok) return { status: "conflict", path, reason: `file on disk is not valid: ${check.reason}` };
      diskRevision = onDisk.revision;
    } catch (e) {
      if (e?.name !== "NotFoundError") {
        return { status: "conflict", path, reason: `could not re-read: ${e?.name ?? "error"}` };
      }
      diskRevision = 0;
    }
    if (diskRevision !== loadedRevision) {
      return { status: "conflict", path, reason: `revision on disk ${diskRevision}, loaded ${loadedRevision}` };
    }

    // 2. Never write something we could not read back, or a file above the size limit.
    const next = {
      schemaVersion: TabellifySavedTables.SCHEMA_VERSION,
      revision: loadedRevision + 1,
      nextId: data?.nextId,
      tables: data?.tables,
    };
    const check = TabellifySavedTables.validate(next);
    if (!check.ok) return { status: "error", path, error: new Error(`refusing to save invalid data: ${check.reason}`) };
    const clean = TabellifySavedTables.migrate(next);
    const size = TabellifySavedTables.checkFileSize(clean);
    if (!size.ok) return { status: "error", path, error: new Error("refusing to save: the file would be too large"), limit: size.error };

    // 3. Folder first, then an atomic write: the data goes to the .tmp file and is then
    //    moved over tables.json; the old file is kept as .bak.
    try {
      await fs.makeDirectory(dir);
      await fs.writeJSON(path, clean, { tmpPath: path + ".tmp", backupFile: path + ".bak" });
    } catch (e) {
      return { status: "error", path, error: e };
    }
    return { status: "saved", data: clean, path };
  },
};

/**
 * @typedef {{
 *   readJSON: (path: string) => Promise<any>,
 *   writeJSON: (path: string, value: any, options: { tmpPath: string, backupFile: string }) => Promise<any>,
 *   makeDirectory: (path: string) => Promise<any>,
 *   join: (...parts: string[]) => string,
 * }} TablesFs
 */
