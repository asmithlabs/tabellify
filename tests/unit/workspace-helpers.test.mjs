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
  for (const fn of ["indentLabel", "collectionOptions", "libraryOptionGroups", "libraryOfKey", "joinTags", "compareText", "itemRows"]) {
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

// Feature 003b AC5: the grouped collection dropdown.
test("003b AC5: libraryOptionGroups puts My Library first, keeps group order, drops feeds", () => {
  const libraries = [
    { libraryID: 7, libraryType: "group", name: "Alpha Group" },
    { libraryID: 3, libraryType: "feed", name: "News feed" },
    { libraryID: 1, libraryType: "user", name: "My Library" },
    { libraryID: 5, libraryType: "group", name: "Beta Group" },
    { libraryID: 9, libraryType: "publications", name: "Odd" },
  ];
  const collections = new Map([
    [1, [{ id: 10, name: "Climate", level: 0 }, { id: 11, name: "Heat", level: 1 }]],
    [7, [{ id: 70, name: "Shared", level: 0 }]],
    [3, [{ id: 30, name: "Should not show", level: 0 }]],
  ]);
  const out = W.libraryOptionGroups(libraries, collections, "(no collections)");
  assert.deepEqual(plain(out), [
    { libraryID: 1, label: "My Library", options: [{ value: "10", label: "Climate" }, { value: "11", label: NBSP3 + "Heat" }], empty: false },
    { libraryID: 7, label: "Alpha Group", options: [{ value: "70", label: "Shared" }], empty: false },
    { libraryID: 5, label: "Beta Group", options: [{ value: "", label: "(no collections)", disabled: true }], empty: true },
  ]);
  assert.deepEqual(plain(W.libraryOptionGroups([], new Map(), "x")), []);
});

test("003b AC5: library and collection names stay literal text", () => {
  const evil = "<img src=x onerror=x>";
  const out = W.libraryOptionGroups(
    [{ libraryID: 2, libraryType: "group", name: evil }],
    new Map([[2, [{ id: 1, name: evil, level: 0 }]]]),
    "(no collections)",
  );
  assert.equal(out[0].label, evil);
  assert.equal(out[0].options[0].label, evil);
});

test("003b: libraryOfKey reads the numeric library ID before the slash", () => {
  assert.equal(W.libraryOfKey("1/AAAA1111"), 1);
  assert.equal(W.libraryOfKey("42/BBBB2222"), 42);
  for (const bad of ["AAAA1111", "/AAAA1111", "x/AAAA1111", "", null, undefined, 5]) {
    assert.equal(W.libraryOfKey(bad), null, String(bad));
  }
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
