// Feature 003 (prototype): unit tests for the pure helpers in src/content/workspace.js.
//
// workspace.js is a classic browser script (no import/export), loaded by workspace.xhtml.
// Node runs it here in an empty sandbox with node:vm. There is no `window` in the sandbox,
// so the file skips its start-up code, and its one global, `TabellifyWorkspace`, appears
// as a property of the sandbox. Only the helpers that use no Zotero/DOM globals are tested.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "workspace.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const W = sandbox.TabellifyWorkspace;
const NBSP3 = "   ";

// Arrays made inside the sandbox have a different Array prototype, which deepStrictEqual
// treats as different. Round-trip through JSON to compare plain values.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("workspace.js loads in Node without touching window/Zotero and defines the helpers", () => {
  assert.equal(typeof W, "object");
  for (const fn of ["indentLabel", "collectionOptions", "joinTags", "compareText", "itemRows"]) {
    assert.equal(typeof W[fn], "function", fn);
  }
});

test("indentLabel: indents with no-break spaces by level; bad levels count as 0", () => {
  assert.equal(W.indentLabel("Top", 0), "Top");
  assert.equal(W.indentLabel("Child", 1), NBSP3 + "Child");
  assert.equal(W.indentLabel("Grandchild", 2), NBSP3 + NBSP3 + "Grandchild");
  for (const bad of [undefined, null, -1, 1.5, NaN, "2"]) {
    assert.equal(W.indentLabel("X", bad), "X", `level ${String(bad)}`);
  }
  assert.equal(W.indentLabel(undefined, 0), "");
});

test("collectionOptions: keeps order, uses the id as value, falls back to level 0", () => {
  const out = W.collectionOptions([
    { id: 7, name: "Alpha", level: 0 },
    { id: 9, name: "Beta", level: 1 },
    { id: 3, name: "Gamma" }, // `level` missing
  ]);
  assert.deepEqual(plain(out), [
    { value: "7", label: "Alpha" },
    { value: "9", label: NBSP3 + "Beta" },
    { value: "3", label: "Gamma" },
  ]);
  assert.deepEqual(plain(W.collectionOptions([])), []);
});

test("collectionOptions: markup in a name stays literal text", () => {
  const evil = '<img src=x onerror="alert(1)">';
  assert.equal(W.collectionOptions([{ id: 1, name: evil, level: 0 }])[0].label, evil);
});

test("joinTags: sorted case-insensitively, de-duplicated, empty names dropped", () => {
  assert.equal(W.joinTags([]), "");
  assert.equal(
    W.joinTags([{ tag: "methods" }, { tag: "Findings", type: 1 }, { tag: "methods", type: 1 }, { tag: "" }]),
    "Findings, methods",
  );
  assert.equal(W.joinTags([{ tag: "b" }, { tag: "A" }, { tag: "c" }]), "A, b, c");
});

test("itemRows: sorts by title (numeric-aware), untitled last with the placeholder", () => {
  const rows = W.itemRows(
    [
      { title: "Study 10", tags: [] },
      { title: "", tags: [{ tag: "x" }] },
      { title: "study 2", tags: [{ tag: "b" }, { tag: "a" }] },
      { title: "   ", tags: [] },
      { title: "Alpha", tags: [] },
    ],
    "(untitled)",
  );
  assert.deepEqual(plain(rows), [
    { title: "Alpha", tags: "", untitled: false },
    { title: "study 2", tags: "a, b", untitled: false },
    { title: "Study 10", tags: "", untitled: false },
    { title: "(untitled)", tags: "x", untitled: true },
    { title: "(untitled)", tags: "", untitled: true },
  ]);
});

test("itemRows: tolerates missing tags and keeps markup in titles as text", () => {
  const rows = W.itemRows([{ title: "<b>Bold</b>" }], "(untitled)");
  assert.deepEqual(plain(rows), [{ title: "<b>Bold</b>", tags: "", untitled: false }]);
});
