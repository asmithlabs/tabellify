/* Tabellify — layout-store.js (Feature 005c, ADR-0014: load and save the table layout)
 *
 * Reads and writes <Zotero data directory>/tabellify/layout.json: the order of the
 * per-paper table's codebook tag columns (groups, and tags inside each group; schema 2,
 * ADR-0014 amendment 2026-11-13) and the hand-made paper order of each collection. Same rules as the
 * codebook file (ADR-0012), in a separate file so a damaged layout can never block the
 * codebook (and the other way round).
 * Owner's dev profile: ~/Zotero tabellify-dev/tabellify/layout.json
 *
 * WRITES TO DISK (with codebook-store.js, one of the only two files in src/ that do).
 * tests/static/write-guard.test.mjs allows "IOUtils write" calls here (ADR-0014 §6). It
 * never touches the Zotero library or zotero.sqlite; it writes only these files in
 * Tabellify's own folder:
 *   layout.json      the data
 *   layout.json.tmp  short-lived: written first, then moved over layout.json
 *   layout.json.bak  the previous version (a one-step manual undo)
 * Nothing is created until the first save (loading a missing file creates nothing), and a
 * file that cannot be read or checked is NEVER overwritten: the table then just uses the
 * default layout (ADR-0014 §3).
 *
 * The folder is passed in by the caller (workspace.js gets it from
 * TabellifyCodebookStore.dataDir()), so the internal Zotero data-directory property is
 * still read in exactly one place in src/.
 *
 * TESTABLE WITHOUT ZOTERO: load() and saveData() take the file functions as a parameter
 * `fs` = { readJSON, writeJSON, makeDirectory, join } (same idea as codebook-store.js).
 * In Zotero, platformFs() supplies Firefox's IOUtils / PathUtils;
 * tests/unit/layout-store.test.mjs passes a fake that keeps "files" in a Map.
 *
 * async/await: IOUtils functions return Promises (the disk work happens in the background).
 * `await` waits for the result without freezing Zotero; a failed Promise makes `await` throw.
 *
 * Needs table-layout-model.js loaded first (uses the global TabellifyTableLayout).
 */
"use strict";

var TabellifyLayoutStore = {
  FILE_NAME: "layout.json",

  /**
   * The real file functions. IOUtils and PathUtils are Firefox globals available to
   * privileged (chrome) documents such as the workspace (docs/zotero-api-notes.md, F004 rows).
   * @returns {LayoutFs}
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
   * Read the layout file.
   * - `{ status: "ok", data, path, existed, fromVersion? }`: usable (already migrated and
   *   cleaned by migrateLayout; `fromVersion` is the file's own schemaVersion).
   *   `existed: false` means there was no file and `data` is the default layout (nothing
   *   was created).
   * - `{ status: "newer", path, reason }`: made by a newer Tabellify: use the default
   *   layout and never overwrite the file.
   * - `{ status: "invalid", path, reason }`: not JSON, unreadable, or not a layout file:
   *   same as "newer".
   * @param {LayoutFs} fs
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
        return { status: "ok", data: TabellifyTableLayout.emptyLayout(), path, existed: false };
      }
      return { status: "invalid", path, reason: `could not read: ${e?.name ?? ""} ${e?.message ?? e}` };
    }
    const check = TabellifyTableLayout.validateLayout(raw);
    if (!check.ok) return { status: check.newer ? "newer" : "invalid", path, reason: check.reason };
    // `fromVersion` < SCHEMA_VERSION means the data was migrated in memory (e.g. 1 → 2);
    // the file itself is rewritten only by the next save after a user action.
    return { status: "ok", data: TabellifyTableLayout.migrateLayout(raw), path, existed: true, fromVersion: raw.schemaVersion };
  },

  /**
   * Save `perPaperTable`, unless the file changed since this workspace loaded it.
   *
   * Steps: re-read the file and compare its `revision` with `loadedRevision` (another
   * Tabellify tab may have saved meanwhile, ADR-0014 §5); create the folder; write
   * atomically with a backup. The saved data gets `revision = loadedRevision + 1`.
   * - `{ status: "saved", data, path }`: `data` is what was written (new revision).
   * - `{ status: "conflict", path, reason }`: nothing written; the caller should reload.
   *   Also used when the file on disk has become unreadable or invalid, so a damaged file
   *   is never overwritten.
   * - `{ status: "error", path, error }`: the write failed or the data is invalid; the
   *   file on disk is unchanged.
   * @param {LayoutFs} fs
   * @param {string} dir
   * @param {{ groupOrder: string[], tagOrder: Record<string, string[]>,
   *   manualOrders: Record<string, string[]> }} perPaperTable
   * @param {number} loadedRevision  revision last loaded or saved (0 = no file)
   * @returns {Promise<object>}
   */
  async saveData(fs, dir, perPaperTable, loadedRevision) {
    const path = fs.join(dir, this.FILE_NAME);

    // 1. Has someone else saved since we loaded? A missing file counts as revision 0.
    let diskRevision;
    try {
      const onDisk = await fs.readJSON(path);
      const check = TabellifyTableLayout.validateLayout(onDisk);
      if (!check.ok) return { status: "conflict", path, reason: `file on disk is not valid: ${check.reason}` };
      diskRevision = onDisk.revision;
    } catch (e) {
      if (e?.name !== "NotFoundError") {
        return { status: "conflict", path, reason: `could not re-read: ${e?.name ?? ""} ${e?.message ?? e}` };
      }
      diskRevision = 0;
    }
    if (diskRevision !== loadedRevision) {
      return { status: "conflict", path, reason: `revision on disk ${diskRevision}, loaded ${loadedRevision}` };
    }

    // 2. Never write something we could not read back.
    const next = {
      schemaVersion: TabellifyTableLayout.SCHEMA_VERSION,
      revision: loadedRevision + 1,
      perPaperTable,
    };
    const check = TabellifyTableLayout.validateLayout(next);
    if (!check.ok) return { status: "error", path, error: new Error(`refusing to save invalid data: ${check.reason}`) };
    const clean = TabellifyTableLayout.migrateLayout(next);

    // 3. Folder first, then an atomic write: the data goes to the .tmp file and is then
    //    moved over layout.json; the old file is kept as .bak.
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
 * }} LayoutFs
 */
