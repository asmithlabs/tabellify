// Feature 004 AC10: store logic (src/content/codebook-store.js) with a fake file system.
//
// The store takes its file functions as a parameter (`fs`), so Node can test it without
// Zotero or IOUtils. The fake below keeps "files" as text in a Map and records every call,
// so the tests can check that nothing is written when it must not be, and that the folder
// is created before the write.
//
// Both scripts are classic browser scripts; they run in one node:vm sandbox in the same
// order as workspace.xhtml loads them (model first: the store uses TabellifyCodebook).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");
const sandbox = vm.createContext({});
for (const name of ["codebook-model.js", "codebook-store.js"]) {
  const file = join(contentDir, name);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const Store = sandbox.TabellifyCodebookStore;
const Model = sandbox.TabellifyCodebook;

const plain = (v) => JSON.parse(JSON.stringify(v));
const DIR = "/data/tabellify";
const FILE = "/data/tabellify/codebooks.json";

/**
 * A fake `fs`. `files` maps path → raw text. readJSON parses like IOUtils (rejecting with a
 * NotFoundError for a missing file). writeJSON imitates tmpPath + backupFile.
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
      return JSON.parse(files.get(path)); // throws SyntaxError on bad JSON
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
    nextId: 3,
    codebooks: [{ id: "c1", name: "Codebook", groups: [{ id: "g2", name: "Exposure", tags: ["Heat index"] }] }],
  };
}

// ---------------------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------------------

test("AC10: missing file → empty data, existed false, nothing written", async () => {
  const fs = fakeFs();
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "ok");
  assert.equal(r.existed, false);
  assert.equal(r.path, FILE);
  assert.deepEqual(plain(r.data), plain(Model.emptyData()));
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.size, 0);
});

test("AC10: valid file → its data, existed true, nothing written", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample()) });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "ok");
  assert.equal(r.existed, true);
  assert.deepEqual(plain(r.data), sample());
  assert.deepEqual(fs.writes(), []);
});

test("AC10/AC7: not-JSON file → invalid, nothing written, file unchanged", async () => {
  const fs = fakeFs({ [FILE]: "not json" });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "invalid");
  assert.equal(r.path, FILE);
  assert.equal(typeof r.reason, "string");
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.get(FILE), "not json");
});

test("AC10: JSON that fails validation → invalid with the model's reason", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify({ revision: 1 }) });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "invalid");
  assert.match(r.reason, /schemaVersion/);
  assert.deepEqual(fs.writes(), []);
});

test("AC10: newer schemaVersion → newer, nothing written", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify({ ...sample(), schemaVersion: 2 }) });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "newer");
  assert.deepEqual(fs.writes(), []);
});

test("AC10: other read error (not NotFoundError) → invalid, nothing written", async () => {
  const fs = fakeFs({}, { failRead: true });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "invalid");
  assert.match(r.reason, /NotAllowedError/);
  assert.deepEqual(fs.writes(), []);
});

// ---------------------------------------------------------------------------------------
// saveData
// ---------------------------------------------------------------------------------------

test("AC10: first save creates the folder, then writes atomically with .tmp and .bak next to the file", async () => {
  const fs = fakeFs();
  const data = Model.addGroup(Model.emptyData(), "Exposure").data;
  const r = await Store.saveData(fs, DIR, data, 0);
  assert.equal(r.status, "saved");
  assert.equal(r.data.revision, 1);
  const writes = plain(fs.writes());
  assert.deepEqual(writes, [
    ["makeDirectory", DIR],
    ["writeJSON", FILE, { tmpPath: FILE + ".tmp", backupFile: FILE + ".bak" }],
  ]);
  assert.deepEqual(JSON.parse(fs.files.get(FILE)), plain(r.data));
  // The input is not changed.
  assert.equal(data.revision, 0);
});

test("AC10: revision +1 on each save; second save keeps the previous file as .bak", async () => {
  const fs = fakeFs();
  let d = Model.addGroup(Model.emptyData(), "Exposure").data;
  const first = await Store.saveData(fs, DIR, d, 0);
  d = Model.addGroup(first.data, "Outcome").data;
  const second = await Store.saveData(fs, DIR, d, first.data.revision);
  assert.equal(second.status, "saved");
  assert.equal(second.data.revision, 2);
  assert.equal(JSON.parse(fs.files.get(FILE + ".bak")).revision, 1);
  assert.equal(JSON.parse(fs.files.get(FILE)).revision, 2);
});

test("AC10: changed revision on disk → conflict, no write", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(5)) });
  const r = await Store.saveData(fs, DIR, sample(3), 3);
  assert.equal(r.status, "conflict");
  assert.deepEqual(fs.writes(), []);
  assert.equal(JSON.parse(fs.files.get(FILE)).revision, 5);
});

test("AC10: file appeared on disk since an empty load → conflict, no write", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(1)) });
  const r = await Store.saveData(fs, DIR, Model.emptyData(), 0);
  assert.equal(r.status, "conflict");
  assert.deepEqual(fs.writes(), []);
});

test("AC10: file deleted since it was loaded → conflict, no write", async () => {
  const fs = fakeFs();
  const r = await Store.saveData(fs, DIR, sample(3), 3);
  assert.equal(r.status, "conflict");
  assert.deepEqual(fs.writes(), []);
});

test("AC10/AC7: file on disk became damaged or newer → conflict, never overwritten", async () => {
  for (const text of ["not json", JSON.stringify({ ...sample(3), schemaVersion: 9 })]) {
    const fs = fakeFs({ [FILE]: text });
    const r = await Store.saveData(fs, DIR, sample(3), 3);
    assert.equal(r.status, "conflict", text);
    assert.deepEqual(fs.writes(), [], text);
    assert.equal(fs.files.get(FILE), text);
  }
  const fs = fakeFs({}, { failRead: true });
  assert.equal((await Store.saveData(fs, DIR, sample(3), 3)).status, "conflict");
  assert.deepEqual(fs.writes(), []);
});

test("AC10: write failure → error, data on disk unchanged", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample(3)) }, { failWrite: true });
  const r = await Store.saveData(fs, DIR, Model.addGroup(sample(3), "New").data, 3);
  assert.equal(r.status, "error");
  assert.match(String(r.error), /disk full/);
  assert.equal(JSON.parse(fs.files.get(FILE)).revision, 3);
});

test("AC10: invalid data is never written", async () => {
  const fs = fakeFs();
  const bad = { ...Model.emptyData(), codebooks: [] };
  const r = await Store.saveData(fs, DIR, bad, 0);
  assert.equal(r.status, "error");
  assert.deepEqual(fs.writes(), []);
});

test("AC10: platformFs and dataDir exist (their IOUtils/Zotero use is checked in Zotero)", () => {
  assert.equal(typeof Store.platformFs, "function");
  assert.equal(typeof Store.dataDir, "function");
});
