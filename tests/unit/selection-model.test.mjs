// Feature 011 AC1–AC5: unit tests for the pure selection model (src/content/selection-model.js,
// ADR-0027 §1 and §3).
//
// selection-model.js is a classic browser script (no import/export). Node runs it here in an
// empty node:vm sandbox (as in tag-monitor-model.test.mjs); its one global,
// `TabellifySelection`, appears as a property of the sandbox. The sandbox has no Zotero,
// window, document, IOUtils or PathUtils, so loading it proves the model needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "selection-model.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const S = sandbox.TabellifySelection;

// Objects made inside the sandbox have different prototypes; compare as plain JSON values.
// A Map or Set from the sandbox is not `instanceof` Node's Map/Set (another realm), so the
// constructor name is checked instead.
const plain = (v) => {
  const kind = v?.constructor?.name;
  return JSON.parse(JSON.stringify(kind === "Map" || kind === "Set" ? [...v] : v));
};

/** Deep-freeze test inputs: any attempt by the model to change them throws (strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

// Tree order, as Zotero.Collections.getByLibrary(libraryID, true) returns it:
// Phenotypes (1) › Archive (2), Asthma (3), COPD (4), Diabetes (5), Respiratory (6) › Bronchitis (7)
// Methods (8)
const KEY = {
  phen: "1/PHEN0001", arch: "1/ARCH0002", asth: "1/ASTH0003", copd: "1/COPD0004",
  diab: "1/DIAB0005", resp: "1/RESP0006", bron: "1/BRON0007", meth: "1/METH0008",
};
const TREE = frozen([
  { id: 1, parentID: false, name: "Phenotypes", key: KEY.phen },
  { id: 2, parentID: 1, name: "Archive", key: KEY.arch },
  { id: 3, parentID: 1, name: "Asthma", key: KEY.asth },
  { id: 4, parentID: 1, name: "COPD", key: KEY.copd },
  { id: 5, parentID: 1, name: "Diabetes", key: KEY.diab },
  { id: 6, parentID: 1, name: "Respiratory", key: KEY.resp },
  { id: 7, parentID: 6, name: "Bronchitis", key: KEY.bron },
  { id: 8, parentID: null, name: "Methods", key: KEY.meth },
]);
// The spec's smaller AC1 tree: Phenotypes › {Asthma, COPD, Diabetes, Archive}.
const SMALL = frozen(TREE.filter((c) => c.id <= 5));

test("loads in an empty sandbox; constants", () => {
  assert.equal(typeof S, "object");
  assert.equal(S.MAX_RULES, 1000);
  assert.equal(S.SEL_PREFIX, "sel:");
  assert.equal(S.PATH_SEPARATOR, " › ");
});

// ------------------------------------------------------------------------------------------
// AC1: scope
// ------------------------------------------------------------------------------------------

test("AC1: include Phenotypes gives all five in tree order", () => {
  assert.deepEqual(plain(S.scope(SMALL, frozen({ include: [KEY.phen], exclude: [] }))), [1, 2, 3, 4, 5]);
});

test("AC1: exclude Archive gives four", () => {
  assert.deepEqual(plain(S.scope(SMALL, frozen({ include: [KEY.phen], exclude: [KEY.arch] }))), [1, 3, 4, 5]);
});

test("AC1: include Asthma and COPD gives two (tree order, not rule order)", () => {
  assert.deepEqual(plain(S.scope(SMALL, frozen({ include: [KEY.copd, KEY.asth], exclude: [] }))), [3, 4]);
});

test("AC1: nearest rule wins (an include below an exclude)", () => {
  const sel = frozen({ include: [KEY.phen, KEY.bron], exclude: [KEY.resp] });
  assert.deepEqual(plain(S.scope(TREE, sel)), [1, 2, 3, 4, 5, 7]);
});

test("AC1: validate refuses a key that is in both lists", () => {
  const r = S.validate({ include: [KEY.phen], exclude: [KEY.phen] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /both lists/);
  assert.equal(r.reason.includes(KEY.phen), false, "the reason never names a key");
});

test("AC1: a rule whose key is unknown is ignored", () => {
  assert.deepEqual(plain(S.scope(SMALL, { include: ["1/GONE9999", KEY.asth], exclude: ["1/GONE0000"] })), [3]);
  assert.deepEqual(plain(S.scope(SMALL, { include: ["1/GONE9999"], exclude: [] })), []);
});

test("AC1: a cycle in bad input does not loop forever", () => {
  const cycle = frozen([
    { id: 1, parentID: 2, name: "A", key: "1/AAAA" },
    { id: 2, parentID: 1, name: "B", key: "1/BBBB" },
    { id: 3, parentID: 3, name: "Self", key: "1/SELF" },
    { id: 4, parentID: false, name: "Top", key: "1/TOPP" },
  ]);
  assert.deepEqual(plain(S.scope(cycle, { include: ["1/AAAA", "1/TOPP", "1/SELF"], exclude: [] })), [3, 4]);
  assert.deepEqual(plain(S.fromTicks(cycle, [1, 2, 4])), { include: ["1/TOPP"], exclude: [] });
  assert.equal(S.tickStates(cycle, [1]).size, 2);
  // Walking down from a cycle member stops after one round.
  assert.deepEqual(plain(S.subtree(cycle, 1)), [1, 2]);
  assert.deepEqual(plain(S.subtree(cycle, 3)), [3]);
  // Walking up for a label stops too (each collection gets some text, no endless loop).
  assert.equal(S.labelMap(cycle, [1, 2]).size, 2);
});

test("AC1: missing or odd selections give an empty scope", () => {
  assert.deepEqual(plain(S.scope(SMALL, null)), []);
  assert.deepEqual(plain(S.scope(SMALL, {})), []);
  assert.deepEqual(plain(S.scope(null, { include: [KEY.phen] })), []);
});

test("validate: accepts the documented shapes", () => {
  assert.deepEqual(plain(S.validate({ include: [KEY.phen], exclude: [] })), { ok: true });
  assert.deepEqual(plain(S.validate({ include: [KEY.phen], exclude: [KEY.arch] })), { ok: true });
});

test("validate: refuses bad shapes", () => {
  const bad = [
    null, [], "x", {},
    { include: [], exclude: [] },
    { include: [KEY.phen] },
    { include: [KEY.phen], exclude: [], extra: 1 },
    { include: ["PHEN0001"], exclude: [] },
    { include: ["1/PH-EN"], exclude: [] },
    { include: [1], exclude: [] },
    { include: [KEY.phen, KEY.phen], exclude: [] },
    { include: [KEY.phen], exclude: [KEY.arch, KEY.arch] },
    { include: [KEY.phen, "2/OTHER001"], exclude: [] },
    { include: [KEY.phen], exclude: ["2/OTHER001"] },
  ];
  for (const s of bad) assert.equal(S.validate(s).ok, false, JSON.stringify(s));
});

test("validate: at most 1 000 rules", () => {
  const keys = (n, p) => Array.from({ length: n }, (_, i) => `1/${p}${i}`);
  assert.equal(S.validate({ include: keys(600, "A"), exclude: keys(400, "B") }).ok, true);
  const r = S.validate({ include: keys(600, "A"), exclude: keys(401, "B") });
  assert.equal(r.ok, false);
  assert.match(r.reason, /1000 rules/);
});

// ------------------------------------------------------------------------------------------
// AC2: fromTicks (canonical form)
// ------------------------------------------------------------------------------------------

test("AC2: ticking Phenotypes then unticking Archive gives include Phenotypes, exclude Archive", () => {
  let ticks = S.applyTick(SMALL, new Set(), 1);
  ticks = S.applyTick(SMALL, ticks, 2);
  assert.deepEqual(plain(S.fromTicks(SMALL, ticks)), { include: [KEY.phen], exclude: [KEY.arch] });
});

test("AC2: ticking only the four children leaves Phenotypes' own papers out", () => {
  assert.deepEqual(plain(S.fromTicks(SMALL, [2, 3, 4, 5])), {
    include: [KEY.arch, KEY.asth, KEY.copd, KEY.diab],
    exclude: [],
  });
});

test("AC2: lists are sorted by code-unit order (not locale order)", () => {
  const tree = frozen([
    { id: 1, parentID: false, name: "b", key: "1/b" },
    { id: 2, parentID: false, name: "B", key: "1/B" },
    { id: 3, parentID: false, name: "a", key: "1/a" },
    { id: 4, parentID: false, name: "Z", key: "1/Z" },
  ]);
  // Code units: "B" (66) < "Z" (90) < "a" (97) < "b" (98). localeCompare would give a, b, B, Z.
  assert.deepEqual(plain(S.fromTicks(tree, [1, 2, 3, 4]).include), ["1/B", "1/Z", "1/a", "1/b"]);
});

test("AC2: the same ticks in any click order give the same result", () => {
  const orders = [[3, 4, 5], [5, 4, 3], [4, 3, 5]];
  const results = orders.map((o) => {
    let ticks = new Set();
    for (const id of o) ticks = S.applyTick(SMALL, ticks, id);
    return JSON.stringify(plain(S.fromTicks(SMALL, ticks)));
  });
  assert.equal(new Set(results).size, 1);
  assert.deepEqual(JSON.parse(results[0]), { include: [KEY.asth, KEY.copd, KEY.diab], exclude: [] });
  // A Set and an array with the same IDs give the same rules.
  assert.deepEqual(plain(S.fromTicks(SMALL, new Set([5, 3, 4]))), JSON.parse(results[0]));
});

test("AC2: fromTicks(scope(x)) round-trips for every case", () => {
  const cases = [
    { tree: SMALL, sel: { include: [KEY.phen], exclude: [] } },
    { tree: SMALL, sel: { include: [KEY.phen], exclude: [KEY.arch] } },
    { tree: SMALL, sel: { include: [KEY.asth, KEY.copd], exclude: [] } },
    { tree: SMALL, sel: { include: [KEY.arch, KEY.asth, KEY.copd, KEY.diab], exclude: [] } },
    { tree: TREE, sel: { include: [KEY.bron, KEY.phen], exclude: [KEY.resp] } },
    { tree: TREE, sel: { include: [KEY.meth, KEY.phen], exclude: [] } },
  ];
  for (const { tree, sel } of cases) {
    assert.deepEqual(plain(S.fromTicks(tree, S.scope(tree, sel))), sel, JSON.stringify(sel));
  }
});

test("AC2: fromTicks with nothing ticked gives an empty include (not valid)", () => {
  const r = S.fromTicks(SMALL, []);
  assert.deepEqual(plain(r), { include: [], exclude: [] });
  assert.equal(S.validate(r).ok, false);
});

// ------------------------------------------------------------------------------------------
// AC3: tickStates and applyTick
// ------------------------------------------------------------------------------------------

test("AC3: tickStates: checked, unchecked, indeterminate", () => {
  assert.deepEqual(plain(S.tickStates(SMALL, [1, 2, 3, 4, 5])), [[2, "checked"], [3, "checked"], [4, "checked"], [5, "checked"], [1, "checked"]]);
  const none = S.tickStates(SMALL, []);
  assert.ok([...none.values()].every((v) => v === "unchecked"));
  const mixed = S.tickStates(SMALL, [1, 3, 4, 5]);
  assert.equal(mixed.get(1), "indeterminate");
  assert.equal(mixed.get(2), "unchecked");
  assert.equal(mixed.get(3), "checked");
  // Only the children ticked (parent's own papers out): parent is mixed.
  assert.equal(S.tickStates(SMALL, [2, 3, 4, 5]).get(1), "indeterminate");
  // Only the parent ticked (children out): parent is mixed too.
  assert.equal(S.tickStates(SMALL, [1]).get(1), "indeterminate");
});

test("AC3: applyTick on an empty parent ticks it and every descendant", () => {
  assert.deepEqual(plain([...S.applyTick(TREE, [], 1)].sort()), [1, 2, 3, 4, 5, 6, 7]);
});

test("AC3: applyTick on a mixed parent ticks everything; on a ticked parent unticks everything", () => {
  const mixed = new Set([1, 3, 4, 5]);
  const all = S.applyTick(SMALL, mixed, 1);
  assert.deepEqual(plain([...all].sort()), [1, 2, 3, 4, 5]);
  assert.deepEqual(plain([...S.applyTick(SMALL, all, 1)]), []);
});

test("AC3: applyTick on a child changes that child and its descendants only", () => {
  const all = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
  const off = S.applyTick(TREE, all, 6);
  assert.deepEqual(plain([...off].sort()), [1, 2, 3, 4, 5, 8]);
  const on = S.applyTick(TREE, off, 6);
  assert.deepEqual(plain([...on].sort()), [1, 2, 3, 4, 5, 6, 7, 8]);
  // A leaf.
  assert.deepEqual(plain([...S.applyTick(TREE, [], 3)]), [3]);
});

test("AC3: applyTick never changes its input and ignores unknown IDs", () => {
  const ticks = Object.freeze([1, 2]);
  const next = S.applyTick(SMALL, ticks, 99);
  assert.deepEqual(plain([...next]), [1, 2]);
  assert.notEqual(next, ticks);
});

// ------------------------------------------------------------------------------------------
// AC4: selectionKey / parseSelectionKey
// ------------------------------------------------------------------------------------------

test("AC4: one include, no exclude gives the plain key", () => {
  assert.equal(S.selectionKey({ include: ["1/ABCD2345"], exclude: [] }), "1/ABCD2345");
});

test("AC4: anything else gives a sel: key (lists sorted)", () => {
  assert.equal(
    S.selectionKey({ include: ["1/DIAB0003", "1/ASTH0001", "1/COPD0002"], exclude: [] }),
    "sel:1/ASTH0001,1/COPD0002,1/DIAB0003",
  );
  assert.equal(S.selectionKey({ include: ["1/PHEN0001"], exclude: ["1/ARCH0002"] }), "sel:1/PHEN0001|1/ARCH0002");
});

test("AC4: parseSelectionKey reads both forms back", () => {
  assert.deepEqual(plain(S.parseSelectionKey("1/ABCD2345")), { include: ["1/ABCD2345"], exclude: [] });
  assert.deepEqual(plain(S.parseSelectionKey("sel:1/ASTH0001,1/COPD0002,1/DIAB0003")), {
    include: ["1/ASTH0001", "1/COPD0002", "1/DIAB0003"], exclude: [],
  });
  assert.deepEqual(plain(S.parseSelectionKey("sel:1/PHEN0001|1/ARCH0002")), { include: ["1/PHEN0001"], exclude: ["1/ARCH0002"] });
  for (const sel of [
    { include: ["1/A"], exclude: [] },
    { include: ["1/B", "1/A"], exclude: [] },
    { include: ["1/A"], exclude: ["1/C", "1/B"] },
  ]) {
    const back = S.parseSelectionKey(S.selectionKey(sel));
    assert.equal(S.selectionKey(back), S.selectionKey(sel));
  }
});

test("AC4: two libraries, too many rules, repeats or a key in both lists are refused", () => {
  const many = Array.from({ length: 1001 }, (_, i) => `1/K${i}`);
  const badSelections = [
    { include: ["1/AAAA", "2/BBBB"], exclude: [] },
    { include: many, exclude: [] },
    { include: ["1/AAAA", "1/AAAA"], exclude: [] },
    { include: ["1/AAAA"], exclude: ["1/AAAA"] },
  ];
  for (const s of badSelections) assert.equal(S.selectionKey(s), null, JSON.stringify(s).slice(0, 60));
  const badKeys = [
    "sel:1/AAAA,2/BBBB",
    "sel:" + many.join(","),
    "sel:1/AAAA,1/AAAA",
    "sel:1/AAAA|1/AAAA",
    "sel:1/AAAA|",
    "sel:1/AAAA|1/B|1/C",
    "sel:",
    "sel:|1/AAAA",
    "",
    "AAAA",
    "1/AA-AA",
    null,
    42,
  ];
  for (const k of badKeys) assert.equal(S.parseSelectionKey(k), null, String(k).slice(0, 60));
});

test("equals compares rules, not list order", () => {
  assert.equal(S.equals({ include: ["1/B", "1/A"], exclude: [] }, { include: ["1/A", "1/B"], exclude: [] }), true);
  assert.equal(S.equals({ include: ["1/A"], exclude: [] }, { include: ["1/A"], exclude: ["1/B"] }), false);
  assert.equal(S.equals(null, null), false);
});

test("single / isSingle / libraryOfSelection", () => {
  assert.deepEqual(plain(S.single("3/ABCD")), { include: ["3/ABCD"], exclude: [] });
  assert.equal(S.isSingle(S.single("3/ABCD")), true);
  assert.equal(S.isSingle({ include: ["3/A"], exclude: ["3/B"] }), false);
  assert.equal(S.isSingle({ include: ["3/A", "3/B"], exclude: [] }), false);
  assert.equal(S.libraryOfSelection({ include: ["3/A"], exclude: [] }), 3);
  assert.equal(S.libraryOfSelection(null), null);
});

// ------------------------------------------------------------------------------------------
// AC5: placeLabels (Subcollection text)
// ------------------------------------------------------------------------------------------

test("AC5: one anchor Phenotypes", () => {
  const scope = S.scope(TREE, { include: [KEY.phen], exclude: [] });
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [3])), ["Asthma"]);
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [1])), ["Phenotypes"]);
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [7])), ["Respiratory › Bronchitis"]);
  // Two places, given in any order: tree order out.
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [4, 3])), ["Asthma", "COPD"]);
  // Collections outside the scope are not places.
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [8, 3, 3])), ["Asthma"]);
});

test("AC5: Phenotypes › Respiratory › Asthma gives the path below the anchor", () => {
  const tree = frozen([
    { id: 1, parentID: false, name: "Phenotypes", key: "1/P" },
    { id: 2, parentID: 1, name: "Respiratory", key: "1/R" },
    { id: 3, parentID: 2, name: "Asthma", key: "1/A" },
  ]);
  const scope = S.scope(tree, { include: ["1/P"], exclude: [] });
  assert.deepEqual(plain(S.placeLabels(tree, scope, [3])), ["Respiratory › Asthma"]);
});

test("AC5: several anchors without children show their own name", () => {
  const scope = S.scope(TREE, { include: [KEY.asth, KEY.copd], exclude: [] });
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [3])), ["Asthma"]);
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [3, 4])), ["Asthma", "COPD"]);
});

test("AC5: anchors with children of their own show full paths from the anchor", () => {
  const scope = S.scope(TREE, { include: [KEY.meth, KEY.phen], exclude: [] });
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [3])), ["Phenotypes › Asthma"]);
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [1])), ["Phenotypes"]);
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [7])), ["Phenotypes › Respiratory › Bronchitis"]);
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [8])), ["Methods"]);
});

test("AC5: names are returned as the same characters", () => {
  const tree = frozen([
    { id: 1, parentID: false, name: "Top", key: "1/T" },
    { id: 2, parentID: 1, name: "<img onerror=x>", key: "1/X" },
    { id: 3, parentID: false, name: "a/b & \"c\"", key: "1/Y" },
  ]);
  assert.deepEqual(plain(S.placeLabels(tree, S.scope(tree, { include: ["1/T"], exclude: [] }), [2])), ["<img onerror=x>"]);
  assert.deepEqual(plain(S.placeLabels(tree, S.scope(tree, { include: ["1/X", "1/Y"], exclude: [] }), [2, 3])), ["<img onerror=x>", "a/b & \"c\""]);
});

test("AC5: labelMap can be computed once and passed in", () => {
  const scope = S.scope(TREE, { include: [KEY.phen], exclude: [KEY.arch] });
  const map = S.labelMap(TREE, scope);
  assert.equal(map.has(2), false, "excluded collections have no label");
  assert.deepEqual(plain(S.placeLabels(TREE, scope, [3, 2], map)), ["Asthma"]);
});

// ------------------------------------------------------------------------------------------
// Names for the summary line, the dropdown and saved tables
// ------------------------------------------------------------------------------------------

test("includedNames: the included collections that exist, in tree order", () => {
  assert.deepEqual(plain(S.includedNames(TREE, { include: [KEY.diab, KEY.asth, "1/GONE"], exclude: [] })), ["Asthma", "Diabetes"]);
  assert.deepEqual(plain(S.includedNames(TREE, { include: [KEY.phen], exclude: [KEY.arch] })), ["Phenotypes"]);
});

test("goneIncludes: included keys not in the tree", () => {
  assert.deepEqual(plain(S.goneIncludes(TREE, { include: [KEY.asth, "1/GONE", KEY.copd], exclude: ["1/ALSO"] })), ["1/GONE"]);
  assert.deepEqual(plain(S.goneIncludes([], { include: [KEY.asth], exclude: [] })), [KEY.asth]);
});

test("shortList: first n names and how many more", () => {
  assert.deepEqual(plain(S.shortList(["a", "b", "c", "d"], 3)), { shown: ["a", "b", "c"], more: 1 });
  assert.deepEqual(plain(S.shortList(["a"], 5)), { shown: ["a"], more: 0 });
  assert.deepEqual(plain(S.shortList(null, 5)), { shown: [], more: 0 });
});
