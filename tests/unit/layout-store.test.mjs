// Feature 005c T6 (ADR-0014): layout store (src/content/layout-store.js) with a fake file
// system, like tests/unit/codebook-store.test.mjs.
//
// The store takes its file functions as a parameter (`fs`), so Node can test it without
// Zotero or IOUtils. The fake keeps "files" as text in a Map and records every call, so the
// tests can check that nothing is written on load, that a broken file is never
// overwritten, and that the folder is created before the write.
//
// Both scripts are classic browser scripts; they run in one node:vm sandbox in the same
// order as workspace.xhtml loads them (model first: the store uses TabellifyTableLayout).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");
const sandbox = vm.createContext({});
for (const name of ["table-layout-model.js", "layout-store.js"]) {
  const file = join(contentDir, name);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const Store = sandbox.TabellifyLayoutStore;
const Model = sandbox.TabellifyTableLayout;

const plain = (v) => JSON.parse(JSON.stringify(v));
const DIR = "/data/tabellify";
const FILE = "/data/tabellify/layout.json";
const CODEBOOK = "/data/tabellify/codebooks.json";
const DEFAULT = ["title", "count", "collections", "tags", "details"];

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

function sample(revision = 3) {
  return {
    schemaVersion: 1,
    revision,
    perPaperTable: {
      columnOrder: ["count", "title", "collections", "tags", "details"],
      manualOrders: { "1/ABCD2345": ["EFGH6789", "JKLM2345"] },
    },
  };
}

const table = (manualOrders = {}, columnOrder = DEFAULT) => ({ columnOrder, manualOrders });

// ---------------------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------------------

test("T6: missing file → default layout, existed false, nothing written (nothing written on load)", async () => {
  const fs = fakeFs({ [CODEBOOK]: "{}" });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "ok");
  assert.equal(r.existed, false);
  assert.equal(r.path, FILE);
  assert.deepEqual(plain(r.data), plain(Model.emptyLayout()));
  assert.deepEqual(fs.writes(), []);
  assert.deepEqual([...fs.files.keys()], [CODEBOOK]);
});

test("T6: valid file → its cleaned data, existed true, nothing written", async () => {
  const raw = sample();
  raw.perPaperTable.manualOrders["1/ABCD2345"].push(42, "EFGH6789");
  const fs = fakeFs({ [FILE]: JSON.stringify(raw) });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "ok");
  assert.equal(r.existed, true);
  assert.deepEqual(plain(r.data), sample());
  assert.deepEqual(fs.writes(), []);
});

test("T6: corrupt file → invalid, nothing written, file unchanged", async () => {
  const fs = fakeFs({ [FILE]: "{ not json" });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "invalid");
  assert.equal(r.path, FILE);
  assert.equal(typeof r.reason, "string");
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.get(FILE), "{ not json");
});

test("T6: JSON that fails the frame check → invalid; newer schema → newer; read error → invalid", async () => {
  let fs = fakeFs({ [FILE]: JSON.stringify({ revision: 1 }) });
  assert.equal((await Store.load(fs, DIR)).status, "invalid");
  fs = fakeFs({ [FILE]: JSON.stringify({ ...sample(), schemaVersion: 2 }) });
  assert.equal((await Store.load(fs, DIR)).status, "newer");
  fs = fakeFs({}, { failRead: true });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "invalid");
  assert.match(r.reason, /NotAllowedError/);
  assert.deepEqual(fs.writes(), []);
});

// ---------------------------------------------------------------------------------------
// saveData
// ---------------------------------------------------------------------------------------

test("T6: first save creates the folder, then writes atomically with .tmp and .bak", async () => {
  const fs = fakeFs();
  const r = await Store.saveData(fs, DIR, table({ "1/AAAA1111": ["K1"] }), 0);
  assert.equal(r.status, "saved");
  assert.equal(r.data.revision, 1);
  assert.deepEqual(fs.writes().map((c) => c[0]), ["makeDirectory", "writeJSON"]);
  assert.deepEqual(plain(fs.writes()[1][2]), { tmpPath: `${FILE}.tmp`, backupFile: `${FILE}.bak` });
  assert.deepEqual(JSON.parse(fs.files.get(FILE)), {
    schemaVersion: 1, revision: 1, perPaperTable: { columnOrder: DEFAULT, manualOrders: { "1/AAAA1111": ["K1"] } },
  });
});

test("T6: a later save bumps the revision and keeps the previous file as .bak", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(3)) });
  const r = await Store.saveData(fs, DIR, table({}, ["tags"]), 3);
  assert.equal(r.status, "saved");
  assert.equal(r.data.revision, 4);
  assert.deepEqual(plain(r.data.perPaperTable.columnOrder), ["tags", "title", "count", "collections", "details"]);
  assert.deepEqual(JSON.parse(fs.files.get(`${FILE}.bak`)), sample(3));
  assert.equal(JSON.parse(fs.files.get(FILE)).revision, 4);
});

test("T6: two tabs — revision on disk differs → conflict, nothing written", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(5)) });
  const r = await Store.saveData(fs, DIR, table(), 4);
  assert.equal(r.status, "conflict");
  assert.match(r.reason, /revision on disk 5, loaded 4/);
  assert.deepEqual(fs.writes(), []);
  // A file appeared after we loaded "no file" (revision 0): also a conflict.
  const fs2 = fakeFs({ [FILE]: JSON.stringify(sample(1)) });
  assert.equal((await Store.saveData(fs2, DIR, table(), 0)).status, "conflict");
  assert.deepEqual(fs2.writes(), []);
});

test("T6: a broken file on disk is never overwritten (conflict, nothing written)", async () => {
  for (const text of ["{ not json", JSON.stringify({ hello: 1 }), JSON.stringify({ ...sample(3), schemaVersion: 9 })]) {
    const fs = fakeFs({ [FILE]: text });
    const r = await Store.saveData(fs, DIR, table(), 3);
    assert.equal(r.status, "conflict", text);
    assert.deepEqual(fs.writes(), [], text);
    assert.equal(fs.files.get(FILE), text);
  }
  const fs = fakeFs({}, { failRead: true });
  assert.equal((await Store.saveData(fs, DIR, table(), 0)).status, "conflict");
  assert.deepEqual(fs.writes(), []);
});

test("T6: invalid data to save → error, nothing written", async () => {
  const fs = fakeFs();
  const r = await Store.saveData(fs, DIR, { columnOrder: "title", manualOrders: {} }, 0);
  assert.equal(r.status, "error");
  assert.deepEqual(fs.writes(), []);
});

test("T6: a failed write → error; the file on disk is unchanged", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(2)) }, { failWrite: true });
  const r = await Store.saveData(fs, DIR, table(), 2);
  assert.equal(r.status, "error");
  assert.equal(r.error.name, "OperationError");
  assert.deepEqual(JSON.parse(fs.files.get(FILE)), sample(2));
});

test("T6: the store writes only layout.json (+ .tmp/.bak) in its folder, never codebooks.json", async () => {
  const fs = fakeFs({ [CODEBOOK]: '{"x":1}' });
  await Store.saveData(fs, DIR, table(), 0);
  for (const [name, path, options] of fs.writes()) {
    if (name === "makeDirectory") assert.equal(path, DIR);
    else {
      assert.equal(path, FILE);
      assert.equal(options.tmpPath, `${FILE}.tmp`);
      assert.equal(options.backupFile, `${FILE}.bak`);
    }
  }
  assert.equal(fs.files.get(CODEBOOK), '{"x":1}');
});
