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
 *   tables.v1.json   once only (Feature 011, ADR-0027 §2): the schema 1 file 0.2.0 wrote,
 *                    kept as it was read, before the first save writes schema 2. Written
 *                    with `mode: "create"`, so it is never overwritten. Going back to
 *                    0.2.0: copy tables.v1.json over tables.json.
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
 * `fs` = { readJSON, stat, writeJSON, makeDirectory, join } (same idea as layout-store.js).
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

  /** Feature 011: the one-time copy of a schema 1 file (ADR-0027 §2). */
  V1_COPY_NAME: "tables.v1.json",

  /**
   * SEC-014: the largest tables.json Tabellify reads, in bytes. A save is refused above
   * TabellifySavedTables.LIMITS.fileChars (20,000,000 UTF-16 units of JSON); one unit is at
   * most 3 bytes in UTF-8, so every file Tabellify can write is at most 60,000,000 bytes.
   * (A literal, not computed, so this file does not depend on load order; a unit test checks
   * it equals 3 × fileChars.)
   */
  MAX_FILE_BYTES: 60000000,

  /**
   * The real file functions. IOUtils and PathUtils are Firefox globals available to
   * privileged (chrome) documents such as the workspace (docs/zotero-api-notes.md, F004 rows).
   * @returns {TablesFs}
   */
  platformFs() {
    return {
      readJSON: (path) => IOUtils.readJSON(path),
      // SEC-014: the file size, checked before readJSON parses the file. Read-only.
      stat: (path) => IOUtils.stat(path),
      // tmpPath + backupFile: an atomic write that keeps the previous version (ADR-0012 §2).
      // { mode: "create" } (the v1 copy only): write only if the file does not exist yet.
      writeJSON: (path, value, options) => IOUtils.writeJSON(path, value, options),
      // Creates the folder (and missing parents); succeeds if it already exists.
      makeDirectory: (path) => IOUtils.makeDirectory(path),
      join: (...parts) => PathUtils.join(...parts),
    };
  },

  /**
   * SEC-014: read and parse `path`, but refuse a file larger than MAX_FILE_BYTES BEFORE
   * parsing it. Parsing a huge (damaged or planted) file would freeze Zotero and use a lot of
   * memory; Tabellify never writes a file that big. `fs.stat` rejects with "NotFoundError"
   * when there is no file, exactly like `readJSON`, so callers handle both the same way.
   * Too large → throws an error named "FileTooLargeError" (only the name is ever logged).
   * @param {{ stat: (path: string) => Promise<{ size: number }>, readJSON: (path: string) => Promise<any> }} fs
   * @param {string} path
   */
  async readJSONCapped(fs, path) {
    const info = await fs.stat(path);
    if (!(typeof info?.size === "number" && info.size <= this.MAX_FILE_BYTES)) {
      throw Object.assign(new Error("file too large"), { name: "FileTooLargeError" });
    }
    return fs.readJSON(path);
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
      raw = await this.readJSONCapped(fs, path);
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
   *
   * One-time schema 1 copy (Feature 011, ADR-0027 §2): when the file on disk is a valid
   * schema 1 file (written by 0.2.0), exactly the data read from it is first written to
   * tables.v1.json with `{ mode: "create" }` (refuses to overwrite). A failed copy (for
   * example, it already exists) does not block the save: tables.json.bak keeps the schema 1
   * data too. The result reports the attempt (same pattern as codebook-store.js).
   * - `{ status: "saved", data, path, v1Copy? }`: `data` is what was written (new revision).
   *   `v1Copy` is present only when a copy was attempted: `{ path, ok: true }` or
   *   `{ path, ok: false, error }`.
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
    let onDiskV1 = null;
    try {
      const onDisk = await this.readJSONCapped(fs, path);
      const check = TabellifySavedTables.validate(onDisk);
      if (!check.ok) return { status: "conflict", path, reason: `file on disk is not valid: ${check.reason}` };
      diskRevision = onDisk.revision;
      if (onDisk.schemaVersion === 1) onDiskV1 = onDisk;
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

    // 3. Folder first (the writes need their parent to exist).
    try {
      await fs.makeDirectory(dir);
    } catch (e) {
      return { status: "error", path, error: e };
    }

    // 4. Schema 1 on disk: keep one copy forever (never overwritten: mode "create"). A
    //    failure here must not block the save, so it has its own try/catch.
    let v1Copy;
    if (onDiskV1) {
      const copyPath = fs.join(dir, this.V1_COPY_NAME);
      try {
        await fs.writeJSON(copyPath, onDiskV1, { mode: "create" });
        v1Copy = { path: copyPath, ok: true };
      } catch (e) {
        v1Copy = { path: copyPath, ok: false, error: e };
      }
    }

    // 5. Atomic write: the data goes to the .tmp file and is then moved over tables.json;
    //    the old file is kept as .bak.
    try {
      await fs.writeJSON(path, clean, { tmpPath: path + ".tmp", backupFile: path + ".bak" });
    } catch (e) {
      return { status: "error", path, error: e, ...(v1Copy ? { v1Copy } : {}) };
    }
    return { status: "saved", data: clean, path, ...(v1Copy ? { v1Copy } : {}) };
  },
};

/**
 * @typedef {{
 *   readJSON: (path: string) => Promise<any>,
 *   stat: (path: string) => Promise<{ size: number }>,
 *   writeJSON: (path: string, value: any,
 *     options: { tmpPath: string, backupFile: string } | { mode: "create" }) => Promise<any>,
 *   makeDirectory: (path: string) => Promise<any>,
 *   join: (...parts: string[]) => string,
 * }} TablesFs
 */
