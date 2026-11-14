// Feature 007b AC18 (ADR-0018): the saved tables store (src/content/tables-store.js) with a
// fake file system, like tests/unit/layout-store.test.mjs.
//
// The store takes its file functions as a parameter (`fs`), so Node can test it without
// Zotero or IOUtils. The fake keeps "files" as text in a Map and records every call, so the
// tests can check that nothing is written on load, that a broken or newer file is never
// overwritten, and that the folder is created before the one write.
//
// The scripts are classic browser scripts; they run in one node:vm sandbox in
// workspace.xhtml's order (the models first: the store uses TabellifySavedTables).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");
const sandbox = vm.createContext({});
for (const name of ["tag-monitor-model.js", "table-layout-model.js", "saved-tables-model.js", "tables-store.js"]) {
  const file = join(contentDir, name);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const Store = sandbox.TabellifyTablesStore;
const Model = sandbox.TabellifySavedTables;

const plain = (v) => JSON.parse(JSON.stringify(v));
const DIR = "/data/tabellify";
const FILE = "/data/tabellify/tables.json";
const NOW = "2026-11-14T15:40:03.000Z";

/**
 * A fake `fs`. readJSON rejects with a NotFoundError for a missing file (like IOUtils) and
 * throws SyntaxError on bad JSON; writeJSON imitates tmpPath + backupFile.
 * @param {Record<string, string>} [initial]
 * @param {{ failWrite?: boolean, failRead?: boolean }} [opts]
 */
function fakeFs(initial = {}, opts = {}) {
  const files = new Map(Object.entries(initial));
  const calls = [];
  return {
    files,
    calls,
    writes: () => calls.filter((c) => c[0] === "writeJSON" || c[0] === "makeDirectory"),
    async readJSON(path) {
      calls.push(["readJSON", path]);
      if (opts.failRead) throw Object.assign(new Error("permission denied"), { name: "NotAllowedError" });
      if (!files.has(path)) throw Object.assign(new Error(`Could not open ${path}`), { name: "NotFoundError" });
      return JSON.parse(files.get(path));
    },
    async writeJSON(path, value, options) {
      calls.push(["writeJSON", path, options]);
      if (opts.failWrite) throw Object.assign(new Error("disk full"), { name: "OperationError" });
      if (options?.backupFile && files.has(path)) files.set(options.backupFile, files.get(path));
      files.set(path, JSON.stringify(value));
      return 1;
    },
    async makeDirectory(path) {
      calls.push(["makeDirectory", path]);
    },
    join: (...parts) => parts.join("/"),
  };
}

/** One valid saved table. */
function table(id = "t1", name = "Heat test A") {
  return {
    id,
    name,
    description: "",
    createdAt: NOW,
    updatedAt: NOW,
    definition: {
      collectionKey: "1/COLL0001",
      codebookId: "c1",
      columnLayout: { topOrder: [], tagOrder: {} },
      sort: { key: "count", direction: "asc" },
      manualOrder: null,
      countItemTags: false,
    },
    snapshot: {
      takenAt: NOW,
      collectionName: "F005 test",
      blocks: [{ group: "Exposure", tags: ["Heat index"] }],
      rows: [{ itemKey: "ITEM0101", title: "Paper 1", untitled: false, present: [0] }],
    },
  };
}
const sample = (revision = 3) => ({ schemaVersion: 1, revision, nextId: 2, tables: [table()] });

test("AC18: a missing file loads as empty data; nothing is read twice or written", async () => {
  const fs = fakeFs();
  const result = await Store.load(fs, DIR);
  assert.equal(result.status, "ok");
  assert.equal(result.existed, false);
  assert.equal(result.fromVersion, null);
  assert.equal(result.path, FILE);
  assert.deepEqual(plain(result.data), plain(Model.emptyData()));
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.size, 0);
});

test("AC18: a valid file loads as a clean copy with its revision", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(3)) });
  const result = await Store.load(fs, DIR);
  assert.equal(result.status, "ok");
  assert.equal(result.existed, true);
  assert.equal(result.fromVersion, 1);
  assert.deepEqual(plain(result.data), sample(3));
  assert.deepEqual(fs.writes(), []);
});

test("AC18: invalid JSON, invalid data, an unreadable file and a newer file are reported; nothing written", async () => {
  const cases = [
    [{ [FILE]: "{ not json" }, {}, "invalid"],
    [{ [FILE]: JSON.stringify({ ...sample(), tables: [{ ...table(), name: "" }] }) }, {}, "invalid"],
    [{ [FILE]: JSON.stringify({ ...sample(), nextId: 1 }) }, {}, "invalid"],
    [{ [FILE]: JSON.stringify(sample()) }, { failRead: true }, "invalid"],
    [{ [FILE]: JSON.stringify({ ...sample(), schemaVersion: 2 }) }, {}, "newer"],
  ];
  for (const [files, opts, status] of cases) {
    const fs = fakeFs(files, opts);
    const before = fs.files.get(FILE);
    const result = await Store.load(fs, DIR);
    assert.equal(result.status, status, JSON.stringify(files).slice(0, 80));
    assert.equal(result.path, FILE);
    assert.equal(typeof result.reason, "string");
    assert.equal(result.data, undefined);
    assert.deepEqual(fs.writes(), []);
    assert.equal(fs.files.get(FILE), before);
  }
});

test("AC18: loading never calls writeJSON or makeDirectory (all load paths)", async () => {
  for (const files of [{}, { [FILE]: JSON.stringify(sample()) }, { [FILE]: "x" }]) {
    const fs = fakeFs(files);
    await Store.load(fs, DIR);
    assert.deepEqual(fs.calls.map((c) => c[0]), ["readJSON"]);
  }
});

test("AC18: save with the loaded revision writes once (tmpPath + backupFile, revision + 1) after makeDirectory", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(3)) });
  const added = Model.addTable(sample(3), { name: "B", description: "", definition: table().definition, snapshot: table().snapshot }, NOW);
  const result = await Store.saveData(fs, DIR, added.data, 3);
  assert.equal(result.status, "saved");
  assert.equal(result.path, FILE);
  assert.equal(result.data.revision, 4);
  assert.deepEqual(plain(fs.writes()), [
    ["makeDirectory", DIR],
    ["writeJSON", FILE, { tmpPath: FILE + ".tmp", backupFile: FILE + ".bak" }],
  ]);
  const written = JSON.parse(fs.files.get(FILE));
  assert.equal(written.revision, 4);
  assert.equal(written.schemaVersion, 1);
  assert.deepEqual(written.tables.map((t) => t.id), ["t1", "t2"]);
  assert.deepEqual(JSON.parse(fs.files.get(FILE + ".bak")), sample(3), "the previous file is kept as .bak");
  assert.deepEqual(plain(result.data), written);
});

test("AC18: the first save (no file yet, revision 0) creates the folder and the file", async () => {
  const fs = fakeFs();
  const added = Model.addTable(Model.emptyData(), { name: "A", description: "", definition: table().definition, snapshot: table().snapshot }, NOW);
  const result = await Store.saveData(fs, DIR, added.data, 0);
  assert.equal(result.status, "saved");
  assert.equal(result.data.revision, 1);
  assert.equal(fs.writes().length, 2);
});

test("AC18: another revision, an invalid or a newer file on disk → conflict, nothing written", async () => {
  const cases = [
    { [FILE]: JSON.stringify(sample(5)) },
    { [FILE]: "{ broken" },
    { [FILE]: JSON.stringify({ ...sample(3), tables: "x" }) },
    { [FILE]: JSON.stringify({ ...sample(3), schemaVersion: 2 }) },
  ];
  for (const files of cases) {
    const fs = fakeFs(files);
    const before = fs.files.get(FILE);
    const result = await Store.saveData(fs, DIR, sample(3), 3);
    assert.equal(result.status, "conflict");
    assert.equal(typeof result.reason, "string");
    assert.deepEqual(fs.writes(), []);
    assert.equal(fs.files.get(FILE), before);
  }
  // A file that appeared while we thought there was none (loaded revision 0).
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(1)) });
  assert.equal((await Store.saveData(fs, DIR, sample(0), 0)).status, "conflict");
  // A re-read that fails for another reason than "not found".
  const failing = fakeFs({ [FILE]: JSON.stringify(sample(3)) }, { failRead: true });
  assert.equal((await Store.saveData(failing, DIR, sample(3), 3)).status, "conflict");
  assert.deepEqual(failing.writes(), []);
});

test("AC18: invalid data or a too-large file → error, nothing written", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(3)) });
  const bad = await Store.saveData(fs, DIR, { nextId: 2, tables: [{ ...table(), id: "t9" }] }, 3);
  assert.equal(bad.status, "error");
  assert.match(String(bad.error?.message), /invalid/);
  const noTables = await Store.saveData(fs, DIR, null, 3);
  assert.equal(noTables.status, "error");
  assert.deepEqual(fs.writes(), []);
  // Too large: about 20 MB of description text spread over many tables.
  const description = "d".repeat(2000);
  const tables = Array.from({ length: 100 }, (_, i) => ({
    ...table(`t${i + 1}`, `T${i}`),
    description,
    snapshot: {
      ...table().snapshot,
      rows: Array.from({ length: 120 }, (_, j) => ({ itemKey: `K${j}`, title: "x".repeat(2000), untitled: false, present: [0] })),
    },
  }));
  const big = { nextId: 101, tables };
  assert.ok(JSON.stringify(big).length > Model.LIMITS.fileChars, "fixture is above the limit");
  const tooLarge = await Store.saveData(fs, DIR, big, 3);
  assert.equal(tooLarge.status, "error");
  assert.equal(tooLarge.limit, "tabellify-saved-error-limit-file");
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.get(FILE), JSON.stringify(sample(3)));
});

test("AC18: a rejected write → error; the file on disk is unchanged", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(3)) }, { failWrite: true });
  const result = await Store.saveData(fs, DIR, sample(3), 3);
  assert.equal(result.status, "error");
  assert.equal(result.error.name, "OperationError");
  assert.equal(fs.files.get(FILE), JSON.stringify(sample(3)));
});

test("AC18: the store has no Zotero access and only the one write call", () => {
  const code = readFileSync(join(contentDir, "tables-store.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /\bZotero\b/);
  assert.equal((code.match(/fs\.writeJSON\(/g) ?? []).length, 1);
  assert.equal((code.match(/fs\.makeDirectory\(/g) ?? []).length, 1);
});
