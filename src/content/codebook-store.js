/* Tabellify — codebook-store.js (Feature 004: load and save the codebook file)
 *
 * Reads and writes <Zotero data directory>/tabellify/codebooks.json (ADR-0012).
 * Owner's dev profile: ~/Zotero tabellify-dev/tabellify/codebooks.json
 *
 * ONE OF THE TWO FILES IN src/ THAT WRITE TO DISK (the other is layout-store.js).
 * tests/static/write-guard.test.mjs allows "IOUtils write" calls only in those two files
 * (spec F004 AC11, ADR-0014). It never touches
 * the Zotero library or zotero.sqlite; it writes only these files in its own folder:
 *   codebooks.json      the data
 *   codebooks.json.tmp  short-lived: written first, then moved over codebooks.json
 *   codebooks.json.bak  the previous version (a one-step manual undo)
 *   codebooks.v1.json   once only (Feature 006a, ADR-0016 §3): the old schema version 1
 *                       data, written by the first save that turns a version 1 file into
 *                       version 2. Written with `mode: "create"`, so it is never overwritten.
 * Nothing is created until the first save (loading a missing file creates nothing; loading a
 * version 1 file converts it in memory only).
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

  /** The one-time copy of a version 1 file (ADR-0016 §3, spec F006a Q10). */
  V1_COPY_NAME: "codebooks.v1.json",

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
      // { mode: "create" }: write only if the file does not exist yet (the v1 copy).
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
   * - `{ status: "ok", data, path, existed, fromVersion }` — usable. `existed: false` means
   *   there was no file yet and `data` is a new empty codebook (no file was created).
   *   `data` is always the current schema (migrated in memory); `fromVersion` is the
   *   schemaVersion of the file on disk (null when there was no file), for Debug Output.
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
        return { status: "ok", data: TabellifyCodebook.emptyData(), path, existed: false, fromVersion: null };
      }
      // Bad JSON, no permission, disk error…: treat as "could not load".
      return { status: "invalid", path, reason: `could not read: ${e?.name ?? ""} ${e?.message ?? e}` };
    }
    const check = TabellifyCodebook.validate(raw);
    if (!check.ok) {
      return { status: check.newer ? "newer" : "invalid", path, reason: check.reason };
    }
    // Migration happens here, in memory only: loading never writes (ADR-0012 §3). A version 1
    // file stays version 1 on disk until the next save after a user edit.
    return { status: "ok", data: TabellifyCodebook.migrate(raw), path, existed: true, fromVersion: raw.schemaVersion };
  },

  /**
   * Save `data`, unless the file changed since this workspace loaded it.
   *
   * Steps: re-read the file and compare its `revision` with `loadedRevision` (another
   * Tabellify tab may have saved meanwhile, ADR-0012 §5); create the folder; write
   * atomically with a backup. The saved data gets `revision = loadedRevision + 1`.
   *
   * One-time version 1 copy (ADR-0016 §3): when the file on disk is a valid version 1 file,
   * exactly that data is first written to codebooks.v1.json with `{ mode: "create" }`
   * (refuses to overwrite). If that copy fails (for example it already exists), the save
   * still goes ahead: the .bak file keeps the version 1 data too. The result reports it.
   *
   * Results:
   * - `{ status: "saved", data, path, v1Copy? }` — `data` is what was written (new
   *   revision). `v1Copy` is present only when a copy was attempted:
   *   `{ path, ok: true }` or `{ path, ok: false, error }` (the caller logs a failure).
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
    //    validate() accepts an older valid version too (version 1), so a version 1 file
    //    with the loaded revision is correctly replaced by the version 2 save.
    let diskRevision;
    let onDiskV1 = null;
    try {
      const onDisk = await fs.readJSON(path);
      const check = TabellifyCodebook.validate(onDisk);
      if (!check.ok) return { status: "conflict", path, reason: `file on disk is not valid: ${check.reason}` };
      diskRevision = onDisk.revision;
      if (onDisk.schemaVersion === 1) onDiskV1 = onDisk;
    } catch (e) {
      if (e?.name !== "NotFoundError") {
        return { status: "conflict", path, reason: `could not re-read: ${e?.name ?? ""} ${e?.message ?? e}` };
      }
      diskRevision = 0;
    }
    if (diskRevision !== loadedRevision) {
      return { status: "conflict", path, reason: `revision on disk ${diskRevision}, loaded ${loadedRevision}` };
    }

    // 2. Never write something we could not read back, and only ever write the current
    //    schema (an old shape is migrated on load, never saved again).
    const next = { ...TabellifyCodebook.clone(data), revision: loadedRevision + 1 };
    const check = TabellifyCodebook.validate(next);
    if (!check.ok) return { status: "error", path, error: new Error(`refusing to save invalid data: ${check.reason}`) };
    if (next.schemaVersion !== TabellifyCodebook.SCHEMA_VERSION) {
      return { status: "error", path, error: new Error(`refusing to save schemaVersion ${next.schemaVersion}`) };
    }

    // 3. Folder first (the writes need their parent to exist).
    try {
      await fs.makeDirectory(dir);
    } catch (e) {
      return { status: "error", path, error: e };
    }

    // 4. Version 1 on disk: keep one copy forever (never overwritten: mode "create"). A
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

    // 5. Atomic write: the data goes to the .tmp file and is then moved over
    //    codebooks.json; the old file is kept as .bak. Both helper files sit next to the
    //    target, so the move is a rename.
    try {
      await fs.writeJSON(path, next, { tmpPath: path + ".tmp", backupFile: path + ".bak" });
    } catch (e) {
      return { status: "error", path, error: e, ...(v1Copy ? { v1Copy } : {}) };
    }
    return { status: "saved", data: next, path, ...(v1Copy ? { v1Copy } : {}) };
  },
};

/**
 * @typedef {{
 *   readJSON: (path: string) => Promise<any>,
 *   writeJSON: (path: string, value: any,
 *     options: { tmpPath: string, backupFile: string } | { mode: "create" }) => Promise<any>,
 *   makeDirectory: (path: string) => Promise<any>,
 *   join: (...parts: string[]) => string,
 * }} StoreFs
 * @typedef {{ status: "ok", data: CodebookData, path: string, existed: boolean, fromVersion: number | null }
 *   | { status: "newer" | "invalid", path: string, reason: string }} LoadResult
 * @typedef {{ path: string, ok: true } | { path: string, ok: false, error: unknown }} V1CopyResult
 * @typedef {{ status: "saved", data: CodebookData, path: string, v1Copy?: V1CopyResult }
 *   | { status: "conflict", path: string, reason: string }
 *   | { status: "error", path: string, error: unknown, v1Copy?: V1CopyResult }} SaveResult
 */
