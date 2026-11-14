// Feature 008 AC15: the CSV writer (src/content/csv-export.js) with a fake `io`.
//
// exportText() takes the save dialog and the file write as a parameter
// (`io` = { pickSavePath, writeUTF8 }), so Node can test it without Zotero. The sandbox
// has no IOUtils, ChromeUtils or Zotero: if exportText reached for a real platform API
// instead of `io`, these tests would fail with a ReferenceError.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "csv-export.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const X = sandbox.TabellifyCsvExport;

const plain = (v) => JSON.parse(JSON.stringify(v));
const TEXT = "﻿Title\r\nA\r\n";
const OPTIONS = { title: "Export table as CSV", filterTitle: "CSV files", defaultName: "F005 test 2026-11-13.csv" };

/**
 * A fake `io`. `picked`: what the "dialog" returns (null = Cancel); `pickError` /
 * `writeError`: make that step fail. Records every call.
 */
function fakeIo({ picked = null, pickError = null, writeError = null, bytes = 17 } = {}) {
  const calls = [];
  return {
    calls,
    writes: () => calls.filter((c) => c[0] === "writeUTF8"),
    async pickSavePath(options) {
      calls.push(["pickSavePath", options]);
      if (pickError) throw pickError;
      return picked;
    },
    async writeUTF8(path, text, options) {
      calls.push(["writeUTF8", path, text, options]);
      if (writeError) throw writeError;
      return bytes;
    },
  };
}

test("AC15: the sandbox has no platform globals; the writer loads alone", () => {
  assert.equal(typeof X, "object");
  assert.equal(X.TMP_SUFFIX, ".tabellify-tmp");
  assert.equal(sandbox.IOUtils, undefined);
  assert.equal(sandbox.ChromeUtils, undefined);
  assert.equal(sandbox.Zotero, undefined);
});

test("AC15: Cancel writes nothing and reports cancelled/dialog", async () => {
  const io = fakeIo({ picked: null });
  const result = await X.exportText(TEXT, OPTIONS, io);
  assert.deepEqual(plain(result), { status: "cancelled", reason: "dialog" });
  assert.equal(io.writes().length, 0);
  // The dialog got exactly the title, filter and suggested name.
  assert.deepEqual(plain(io.calls[0][1]), OPTIONS);
  // A picked value without a usable path is treated as Cancel too.
  for (const picked of [{}, { path: "" }, { path: 42 }]) {
    const io2 = fakeIo({ picked });
    assert.equal((await X.exportText(TEXT, OPTIONS, io2)).status, "cancelled");
    assert.equal(io2.writes().length, 0);
  }
});

test("AC15: OK writes exactly once to the unchanged path with the same text and tmpPath", async () => {
  for (const path of ["/Users/me/Desktop/F005 test 2026-11-13.csv", "/Users/me/Desktop/no extension", "/tmp/a,b \"c\".CSV"]) {
    const io = fakeIo({ picked: { path, replace: false }, bytes: 99 });
    const result = await X.exportText(TEXT, { ...OPTIONS, shouldWrite: () => true }, io);
    assert.deepEqual(plain(result), { status: "saved", path, bytes: 99, replaced: false });
    const writes = io.writes();
    assert.equal(writes.length, 1);
    assert.equal(writes[0][1], path, "path passed through unchanged");
    assert.equal(writes[0][2], TEXT, "text passed through unchanged");
    assert.deepEqual(plain(writes[0][3]), { tmpPath: `${path}.tabellify-tmp` });
  }
});

test("AC15: Replace reports replaced: true", async () => {
  const path = "/Users/me/Desktop/x.csv";
  const io = fakeIo({ picked: { path, replace: true } });
  const result = await X.exportText(TEXT, OPTIONS, io);
  assert.equal(result.status, "saved");
  assert.equal(result.replaced, true);
  assert.equal(io.writes().length, 1);
});

test("AC15: shouldWrite() false (tab closed during the dialog) → no write, cancelled/closed", async () => {
  for (const shouldWrite of [() => false, () => undefined, () => { throw new Error("gone"); }]) {
    const io = fakeIo({ picked: { path: "/x.csv", replace: false } });
    const result = await X.exportText(TEXT, { ...OPTIONS, shouldWrite }, io);
    assert.deepEqual(plain(result), { status: "cancelled", reason: "closed" });
    assert.equal(io.writes().length, 0);
  }
});

test("AC15: the dialog throwing → error/picker, no write", async () => {
  const io = fakeIo({ pickError: new TypeError("no browsing context") });
  const result = await X.exportText(TEXT, OPTIONS, io);
  assert.equal(result.status, "error");
  assert.equal(result.stage, "picker");
  assert.equal(result.errorName, "TypeError");
  assert.equal(result.path, undefined);
  assert.equal(io.writes().length, 0);
  // A synchronous throw from pickSavePath is caught too.
  const sync = { pickSavePath() { throw new Error("sync"); }, writeUTF8() { throw new Error("must not run"); } };
  assert.equal((await X.exportText(TEXT, OPTIONS, sync)).stage, "picker");
});

test("AC15: the write rejecting → error/write with errorName and the path", async () => {
  const err = Object.assign(new Error("Could not write /Users/me/Desktop/x.csv"), { name: "NotAllowedError" });
  const io = fakeIo({ picked: { path: "/Users/me/Desktop/x.csv", replace: true }, writeError: err });
  const result = await X.exportText(TEXT, OPTIONS, io);
  assert.equal(result.status, "error");
  assert.equal(result.stage, "write");
  assert.equal(result.path, "/Users/me/Desktop/x.csv");
  assert.equal(result.errorName, "NotAllowedError");
  assert.equal(result.error, err, "the error is handed back for Zotero.logError");
  assert.equal(io.writes().length, 1, "one attempt, no retry");
});

test("AC15: never throws, even with odd errors and missing options", async () => {
  const odd = { async pickSavePath() { throw "a string"; }, async writeUTF8() { return 0; } };
  const r1 = await X.exportText(TEXT, undefined, odd);
  assert.equal(r1.stage, "picker");
  assert.equal(r1.errorName, "Error");
  const r2 = await X.exportText(TEXT, undefined, fakeIo({ picked: { path: "/x" }, writeError: null }));
  assert.equal(r2.status, "saved", "no shouldWrite given: the write goes ahead");
  const r3 = await X.exportText(TEXT, OPTIONS, fakeIo({ picked: { path: "/x" }, writeError: { name: 7 } }));
  assert.equal(r3.errorName, "Error");
});

test("AC15: writeOptions derives tmpPath from the path only", () => {
  assert.deepEqual(plain(X.writeOptions("/a/b.csv")), { tmpPath: "/a/b.csv.tabellify-tmp" });
});
