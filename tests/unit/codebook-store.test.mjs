// Feature 004 AC10 and Feature 006a AC14: store logic (src/content/codebook-store.js) with a fake file system.
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
 * NotFoundError for a missing file). writeJSON imitates tmpPath + backupFile, and
 * `mode: "create"` (IOUtils refuses to overwrite an existing file: a rejected promise).
 * @param {Record<string, string>} [initial]
 * @param {{ failWrite?: boolean, failRead?: boolean, failCopy?: boolean }} [opts]
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
      if (options?.mode === "create") {
        if (opts.failCopy) throw Object.assign(new Error("copy failed"), { name: "OperationError" });
        if (files.has(path)) throw Object.assign(new Error(`${path} exists`), { name: "NoModificationAllowedError" });
        files.set(path, JSON.stringify(value));
        return 1;
      }
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

const V1_COPY = "/data/tabellify/codebooks.v1.json";

/** A version 2 file (the current schema). */
function sample(revision = 3) {
  return {
    schemaVersion: 2,
    revision,
    nextId: 3,
    codebooks: [{ id: "c1", name: "Codebook", groups: [{ id: "g2", name: "Exposure" }],
      tags: [{ name: "Heat index", group: "g2" }] }],
  };
}

/** The same codebook as a version 1 file (made by F005d and earlier). */
function sampleV1(revision = 3) {
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
  assert.equal(r.fromVersion, null);
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.size, 0);
});

test("AC10: valid file → its data, existed true, nothing written", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sample()) });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "ok");
  assert.equal(r.existed, true);
  assert.equal(r.fromVersion, 2);
  assert.deepEqual(plain(r.data), sample());
  assert.deepEqual(fs.writes(), []);
});

test("AC14: loading a v1 file returns v2 data (migrated in memory), fromVersion 1, writes nothing", async () => {
  const text = JSON.stringify(sampleV1());
  const fs = fakeFs({ [FILE]: text });
  const r = await Store.load(fs, DIR);
  assert.equal(r.status, "ok");
  assert.equal(r.fromVersion, 1);
  assert.deepEqual(plain(r.data), sample());
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.get(FILE), text);
  assert.equal(fs.files.has(V1_COPY), false);
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

test("AC10/AC14: newer schemaVersion (3) → newer, nothing written", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify({ ...sample(), schemaVersion: 3 }) });
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

// ---------------------------------------------------------------------------------------
// Feature 006a AC14: the one-time version 1 copy
// ---------------------------------------------------------------------------------------

test("AC14: first save over a v1 file writes codebooks.v1.json (mode create), then codebooks.json v2", async () => {
  const v1Text = JSON.stringify(sampleV1(3));
  const fs = fakeFs({ [FILE]: v1Text });
  const loaded = await Store.load(fs, DIR);
  const edited = Model.addGroup(loaded.data, "Outcome").data;
  const r = await Store.saveData(fs, DIR, edited, loaded.data.revision);
  assert.equal(r.status, "saved");
  assert.deepEqual(plain(r.v1Copy), { path: V1_COPY, ok: true });
  assert.deepEqual(plain(fs.writes()), [
    ["makeDirectory", DIR],
    ["writeJSON", V1_COPY, { mode: "create" }],
    ["writeJSON", FILE, { tmpPath: FILE + ".tmp", backupFile: FILE + ".bak" }],
  ]);
  // The copy is exactly the version 1 data that was on disk.
  assert.deepEqual(JSON.parse(fs.files.get(V1_COPY)), sampleV1(3));
  // codebooks.json is now version 2 with the next revision; .bak holds the v1 file.
  const saved = JSON.parse(fs.files.get(FILE));
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.revision, 4);
  assert.deepEqual(plain(Model.validate(saved)), { ok: true });
  assert.equal(fs.files.get(FILE + ".bak"), v1Text);
});

test("AC14: a second save does not write the copy again", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sampleV1(3)) });
  const loaded = await Store.load(fs, DIR);
  const first = await Store.saveData(fs, DIR, Model.addGroup(loaded.data, "A").data, 3);
  const copyText = fs.files.get(V1_COPY);
  fs.calls.length = 0;
  const second = await Store.saveData(fs, DIR, Model.addGroup(first.data, "B").data, first.data.revision);
  assert.equal(second.status, "saved");
  assert.equal(second.v1Copy, undefined);
  assert.deepEqual(plain(fs.writes()).map((c) => c[1]), [DIR, FILE]);
  assert.equal(fs.files.get(V1_COPY), copyText);
});

test("AC14: an existing codebooks.v1.json is never overwritten; the save still happens", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sampleV1(3)), [V1_COPY]: "older copy" });
  const r = await Store.saveData(fs, DIR, Model.migrate(sampleV1(3)), 3);
  assert.equal(r.status, "saved");
  assert.equal(r.v1Copy.ok, false);
  assert.equal(fs.files.get(V1_COPY), "older copy");
  assert.equal(JSON.parse(fs.files.get(FILE)).schemaVersion, 2);
});

test("AC14: a failed copy does not block the save", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sampleV1(3)) }, { failCopy: true });
  const r = await Store.saveData(fs, DIR, Model.migrate(sampleV1(3)), 3);
  assert.equal(r.status, "saved");
  assert.equal(r.v1Copy.ok, false);
  assert.match(String(r.v1Copy.error), /copy failed/);
  assert.equal(fs.files.has(V1_COPY), false);
  assert.equal(JSON.parse(fs.files.get(FILE)).revision, 4);
});

test("AC14: a v1 file with another revision → conflict, no copy, no write", async () => {
  const fs = fakeFs({ [FILE]: JSON.stringify(sampleV1(5)) });
  const r = await Store.saveData(fs, DIR, Model.migrate(sampleV1(3)), 3);
  assert.equal(r.status, "conflict");
  assert.deepEqual(fs.writes(), []);
});

test("AC14: a v3 file is never written (load says newer, save says conflict)", async () => {
  const text = JSON.stringify({ ...sample(3), schemaVersion: 3 });
  const fs = fakeFs({ [FILE]: text });
  assert.equal((await Store.load(fs, DIR)).status, "newer");
  assert.equal((await Store.saveData(fs, DIR, sample(3), 3)).status, "conflict");
  assert.deepEqual(fs.writes(), []);
  assert.equal(fs.files.get(FILE), text);
});

test("AC14: version 1 data is never saved (only the current schema)", async () => {
  const fs = fakeFs();
  const r = await Store.saveData(fs, DIR, sampleV1(0), 0);
  assert.equal(r.status, "error");
  assert.deepEqual(fs.writes(), []);
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
