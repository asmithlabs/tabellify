/* Tabellify — codebook-store.js (Feature 004: load and save the codebook file)
 *
 * Reads and writes <Zotero data directory>/tabellify/codebooks.json (ADR-0012).
 * Owner's dev profile: ~/Zotero tabellify-dev/tabellify/codebooks.json
 *
 * THIS IS THE ONLY FILE IN src/ THAT WRITES TO DISK. tests/static/write-guard.test.mjs
 * allows "IOUtils write" calls here and nowhere else (spec F004, AC11). It never touches
 * the Zotero library or zotero.sqlite; it writes only these files in its own folder:
 *   codebooks.json      the data
 *   codebooks.json.tmp  short-lived: written first, then moved over codebooks.json
 *   codebooks.json.bak  the previous version (a one-step manual undo)
 * Nothing is created until the first save (loading a missing file creates nothing).
 *
 * TESTABLE WITHOUT ZOTERO: load() and saveData() take the file functions as a parameter
 * `fs` = { readJSON, writeJSON, makeDirectory, join }. In Zotero, platformFs() supplies
 * Firefox's IOUtils / PathUtils; tests/unit/codebook-store.test.mjs passes a fake that
 * keeps "files" in a Map. (Same idea as F002's fake Zotero_Tabs.)
 *
 * async/await: IOUtils functions return Promises (the disk work happens in the background).
 * `await` waits for the result without freezing Zotero; a failed Promise makes `await` throw.
 *
 * Needs codebook-model.js loaded first (uses the global TabellifyCodebook).
 */
"use strict";

var TabellifyCodebookStore = {
  FILE_NAME: "codebooks.json",

  /**
   * The folder for Tabellify's own data: <Zotero data directory>/tabellify.
   * `Zotero.DataDirectory.dir` is an internal Zotero property (docs/zotero-api-notes.md); it
   * throws until Zotero has set up the data directory, so call this only after
   * `await Zotero.initializationPromise`. This is its only use in Tabellify.
   * @returns {string}
   */
  dataDir() {
    return PathUtils.join(Zotero.DataDirectory.dir, "tabellify");
  },

  /**
   * The real file functions. IOUtils and PathUtils are Firefox globals available to
   * privileged (chrome) documents such as the workspace.
   * @returns {StoreFs}
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
   * Read the codebook file.
   *
   * Results (`path` is the file's full path, for messages and Debug Output):
   * - `{ status: "ok", data, path, existed }` — usable. `existed: false` means there was no
   *   file yet and `data` is a new empty codebook (no file was created).
   * - `{ status: "newer", path, reason }` — made by a newer Tabellify: do not edit.
   * - `{ status: "invalid", path, reason }` — not JSON, unreadable, or not a valid codebooks
   *   file: do not edit, never overwrite (ADR-0012 §3).
   * @param {StoreFs} fs
   * @param {string} dir
   * @returns {Promise<LoadResult>}
   */
  async load(fs, dir) {
    const path = fs.join(dir, this.FILE_NAME);
    let raw;
    try {
      raw = await fs.readJSON(path);
    } catch (e) {
      // IOUtils reports a missing file with an error named "NotFoundError".
      if (e?.name === "NotFoundError") {
        return { status: "ok", data: TabellifyCodebook.emptyData(), path, existed: false };
      }
      // Bad JSON, no permission, disk error…: treat as "could not load".
      return { status: "invalid", path, reason: `could not read: ${e?.name ?? ""} ${e?.message ?? e}` };
    }
    const check = TabellifyCodebook.validate(raw);
    if (!check.ok) {
      return { status: check.newer ? "newer" : "invalid", path, reason: check.reason };
    }
    return { status: "ok", data: TabellifyCodebook.migrate(raw), path, existed: true };
  },

  /**
   * Save `data`, unless the file changed since this workspace loaded it.
   *
   * Steps: re-read the file and compare its `revision` with `loadedRevision` (another
   * Tabellify tab may have saved meanwhile, ADR-0012 §5); create the folder; write
   * atomically with a backup. The saved data gets `revision = loadedRevision + 1`.
   *
   * Results:
   * - `{ status: "saved", data, path }` — `data` is what was written (new revision).
   * - `{ status: "conflict", path, reason }` — nothing written; the caller should reload.
   *   Also used when the file on disk has become unreadable or invalid, so a damaged file
   *   is never overwritten.
   * - `{ status: "error", path, error }` — the write (or folder creation) failed, or the
   *   data to save is invalid; the file on disk is unchanged.
   * @param {StoreFs} fs
   * @param {string} dir
   * @param {CodebookData} data
   * @param {number} loadedRevision  revision of the data last loaded or saved (0 = no file)
   * @returns {Promise<SaveResult>}
   */
  async saveData(fs, dir, data, loadedRevision) {
    const path = fs.join(dir, this.FILE_NAME);

    // 1. Has someone else saved since we loaded? A missing file counts as revision 0.
    let diskRevision;
    try {
      const onDisk = await fs.readJSON(path);
      const check = TabellifyCodebook.validate(onDisk);
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
    const next = { ...TabellifyCodebook.clone(data), revision: loadedRevision + 1 };
    const check = TabellifyCodebook.validate(next);
    if (!check.ok) return { status: "error", path, error: new Error(`refusing to save invalid data: ${check.reason}`) };

    // 3. Folder first (the write needs its parent to exist), then an atomic write: the data
    //    goes to the .tmp file and is then moved over codebooks.json; the old file is kept
    //    as .bak. Both helper files sit next to the target, so the move is a rename.
    try {
      await fs.makeDirectory(dir);
      await fs.writeJSON(path, next, { tmpPath: path + ".tmp", backupFile: path + ".bak" });
    } catch (e) {
      return { status: "error", path, error: e };
    }
    return { status: "saved", data: next, path };
  },
};

/**
 * @typedef {{
 *   readJSON: (path: string) => Promise<any>,
 *   writeJSON: (path: string, value: any, options: { tmpPath: string, backupFile: string }) => Promise<any>,
 *   makeDirectory: (path: string) => Promise<any>,
 *   join: (...parts: string[]) => string,
 * }} StoreFs
 * @typedef {{ status: "ok", data: CodebookData, path: string, existed: boolean }
 *   | { status: "newer" | "invalid", path: string, reason: string }} LoadResult
 * @typedef {{ status: "saved", data: CodebookData, path: string }
 *   | { status: "conflict", path: string, reason: string }
 *   | { status: "error", path: string, error: unknown }} SaveResult
 */
