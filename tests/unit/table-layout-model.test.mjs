// Feature 005c AC10: unit tests for the pure table-layout model
// (src/content/table-layout-model.js).
//
// table-layout-model.js is a classic browser script (no import/export). Node runs it here in
// an empty node:vm sandbox (as in tag-monitor-model.test.mjs); its one global,
// `TabellifyTableLayout`, appears as a property of the sandbox. The sandbox has no Zotero,
// window, document, IOUtils or PathUtils, so loading it proves the model needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "table-layout-model.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const L = sandbox.TabellifyTableLayout;

// Arrays made inside the sandbox have a different prototype; compare as plain JSON values.
const plain = (v) => JSON.parse(JSON.stringify(v));
/** A plain list for the generic list moves (moveColumn / moveColumnBy). */
const LIST = ["a", "b", "c", "d", "e"];

/** Deep-freeze test inputs: any attempt by the model to change them throws (strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

test("AC10: the model loads in an empty sandbox; the old fixed column list is gone", () => {
  assert.equal(typeof L, "object");
  assert.equal(L.MANUAL, "manual");
  assert.equal(L.COLUMN_IDS, undefined, "columns now follow the codebook (owner decision 2026-11-13)");
  assert.equal(L.normalizeColumnOrder, undefined);
});

test("AC10: moveColumn moves to start, to end, clamps, and ignores unknown IDs", () => {
  const order = frozen([...LIST]);
  assert.deepEqual(plain(L.moveColumn(order, "b", 0)), ["b", "a", "c", "d", "e"]);
  assert.deepEqual(plain(L.moveColumn(order, "a", 4)), ["b", "c", "d", "e", "a"]);
  assert.deepEqual(plain(L.moveColumn(order, "a", 99)), ["b", "c", "d", "e", "a"]);
  assert.deepEqual(plain(L.moveColumn(order, "e", -3)), ["e", "a", "b", "c", "d"]);
  assert.deepEqual(plain(L.moveColumn(order, "nope", 0)), LIST);
  assert.notEqual(L.moveColumn(order, "nope", 0), order, "returns a new array");
});

test("AC10: moveColumnBy moves one place and does nothing at the edges or for unknown IDs", () => {
  const order = frozen([...LIST]);
  assert.deepEqual(plain(L.moveColumnBy(order, "a", 1)), ["b", "a", "c", "d", "e"]);
  assert.deepEqual(plain(L.moveColumnBy(order, "d", -1)), ["a", "b", "d", "c", "e"]);
  assert.deepEqual(plain(L.moveColumnBy(order, "a", -1)), LIST);
  assert.deepEqual(plain(L.moveColumnBy(order, "e", 1)), LIST);
  assert.deepEqual(plain(L.moveColumnBy(order, "nope", 1)), LIST);
});

// ---------------------------------------------------------------------------------------
// Owner decision 2026-11-13: codebook tag columns grouped under their super-tag
// ---------------------------------------------------------------------------------------

/** Codebook groups as TabellifyTagMonitor.codebookGroups() returns them (codebook order). */
const GROUPS = () => frozen([
  { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature", "Humidity"] },
  { id: "g3", name: "Outcome", tags: ["Mortality", "Hospitalization"] },
  { id: "g4", name: "Empty", tags: [] },
  { id: "g5", name: "Design", tags: ["Cohort"] },
]);
/** [groupId, tags] pairs of what orderedGroups shows. */
const shown = (groups, columnLayout) => plain(L.orderedGroups(groups, columnLayout).map((g) => [g.id, g.tags]));
const CODEBOOK_ORDER = [
  ["g2", ["Heat index", "Temperature", "Humidity"]],
  ["g3", ["Mortality", "Hospitalization"]],
  ["g5", ["Cohort"]],
];

test("grouped columns: no layout = codebook order; groups without tags have no column", () => {
  assert.deepEqual(shown(GROUPS(), null), CODEBOOK_ORDER);
  assert.deepEqual(shown(GROUPS(), L.emptyColumnLayout()), CODEBOOK_ORDER);
  assert.deepEqual(shown([], null), []);
  assert.equal(L.isCodebookOrder(GROUPS(), L.emptyColumnLayout()), true);
  // Names are carried along for the group header.
  assert.deepEqual(plain(L.orderedGroups(GROUPS(), null).map((g) => g.name)), ["Exposure", "Outcome", "Design"]);
});

test("grouped columns: a saved order is applied; unknown IDs ignored; new groups/tags appended", () => {
  const layout = frozen({
    groupOrder: ["g5", "gone", "g3", "g5"],
    tagOrder: { g2: ["Humidity", "Removed tag", "Heat index"], g9: ["X"], g3: "not a list" },
  });
  assert.deepEqual(shown(GROUPS(), layout), [
    ["g5", ["Cohort"]],
    ["g3", ["Mortality", "Hospitalization"]],
    // g2 is not in groupOrder (e.g. a group added since): appended; its new tag
    // "Temperature" follows the saved ones.
    ["g2", ["Humidity", "Heat index", "Temperature"]],
  ]);
  assert.equal(L.isCodebookOrder(GROUPS(), layout), false);
  // A tag added to the codebook later appears at the end of its group.
  const grown = frozen([{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature", "Humidity", "Wind"] }]);
  assert.deepEqual(shown(grown, layout), [["g2", ["Humidity", "Heat index", "Temperature", "Wind"]]]);
  // A tag removed from the codebook disappears, even if the layout still names it.
  const shrunk = frozen([{ id: "g2", name: "Exposure", tags: ["Heat index"] }]);
  assert.deepEqual(shown(shrunk, layout), [["g2", ["Heat index"]]]);
});

test("grouped columns: a hand-edited '__proto__' key is only an ordinary key", () => {
  const layout = JSON.parse('{"groupOrder":[],"tagOrder":{"__proto__":["Heat index"],"g2":["Temperature"]}}');
  assert.deepEqual(shown(GROUPS(), layout)[0], ["g2", ["Temperature", "Heat index", "Humidity"]]);
  const copy = L.layoutData(layout, new Map());
  // Objects made in the sandbox have the sandbox's Object.prototype.
  assert.equal(Object.getPrototypeOf(copy.tagOrder), Object.getPrototypeOf(L.emptyColumnLayout()), "prototype unchanged");
  assert.deepEqual(plain(Object.getOwnPropertyDescriptor(copy.tagOrder, "__proto__").value), ["Heat index"]);
  assert.deepEqual(Object.keys(copy.tagOrder).sort(), ["__proto__", "g2"]);
});

test("grouped columns: moveTag moves a tag only inside its own group", () => {
  const start = frozen(L.emptyColumnLayout());
  const moved = L.moveTag(start, GROUPS(), "g2", "Humidity", 0);
  assert.deepEqual(shown(GROUPS(), moved), [
    ["g2", ["Humidity", "Heat index", "Temperature"]],
    ["g3", ["Mortality", "Hospitalization"]],
    ["g5", ["Cohort"]],
  ]);
  assert.deepEqual(plain(moved), { groupOrder: [], tagOrder: { g2: ["Humidity", "Heat index", "Temperature"] } });
  // An index past the group's end stays inside the group.
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g2", "Heat index", 99))[0], ["g2", ["Temperature", "Humidity", "Heat index"]]);
  // A tag of another group, an unknown tag or an unknown group: no change.
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g2", "Mortality", 0)), CODEBOOK_ORDER);
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g2", "Nope", 0)), CODEBOOK_ORDER);
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g9", "Heat index", 0)), CODEBOOK_ORDER);
  // Other groups' saved orders are kept.
  const twice = L.moveTag(moved, GROUPS(), "g3", "Hospitalization", 0);
  assert.deepEqual(plain(twice.tagOrder), { g2: ["Humidity", "Heat index", "Temperature"], g3: ["Hospitalization", "Mortality"] });
});

test("grouped columns: moveTagBy (Alt+Left/Right) stops at the group's edges", () => {
  const start = frozen(L.emptyColumnLayout());
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g2", "Heat index", 1))[0], ["g2", ["Temperature", "Heat index", "Humidity"]]);
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g2", "Humidity", -1))[0], ["g2", ["Heat index", "Humidity", "Temperature"]]);
  // The last tag of g2 does not jump into g3; the first of g3 does not jump into g2.
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g2", "Humidity", 1)), CODEBOOK_ORDER);
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g3", "Mortality", -1)), CODEBOOK_ORDER);
  // A one-tag group cannot move its tag at all.
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g5", "Cohort", 1)), CODEBOOK_ORDER);
});

test("grouped columns: moveGroup / moveGroupBy move a whole group among the groups", () => {
  const start = frozen({ groupOrder: [], tagOrder: { g2: ["Temperature", "Heat index", "Humidity"] } });
  const moved = L.moveGroup(start, GROUPS(), "g5", 0);
  assert.deepEqual(shown(GROUPS(), moved), [
    ["g5", ["Cohort"]],
    ["g2", ["Temperature", "Heat index", "Humidity"]],
    ["g3", ["Mortality", "Hospitalization"]],
  ]);
  // The tag order inside a group travels with it; groupOrder lists only shown groups.
  assert.deepEqual(plain(moved), { groupOrder: ["g5", "g2", "g3"], tagOrder: { g2: ["Temperature", "Heat index", "Humidity"] } });
  assert.deepEqual(shown(GROUPS(), L.moveGroup(start, GROUPS(), "g2", 99)).map((g) => g[0]), ["g3", "g5", "g2"]);
  assert.deepEqual(shown(GROUPS(), L.moveGroupBy(start, GROUPS(), "g3", 1)).map((g) => g[0]), ["g2", "g5", "g3"]);
  assert.deepEqual(shown(GROUPS(), L.moveGroupBy(start, GROUPS(), "g2", -1)).map((g) => g[0]), ["g2", "g3", "g5"], "edge: no change");
  assert.deepEqual(shown(GROUPS(), L.moveGroupBy(start, GROUPS(), "g5", 1)).map((g) => g[0]), ["g2", "g3", "g5"], "edge: no change");
  // A group without tags is not shown, so it cannot be moved.
  assert.deepEqual(shown(GROUPS(), L.moveGroup(start, GROUPS(), "g4", 0)).map((g) => g[0]), ["g2", "g3", "g5"]);
});

test("grouped columns: moving columns never changes the codebook groups (inputs not mutated)", () => {
  const groups = GROUPS(); // deep-frozen: a change would throw
  const before = JSON.stringify(groups);
  const layout = frozen({ groupOrder: ["g3"], tagOrder: { g2: ["Humidity"] } });
  L.moveTag(layout, groups, "g2", "Heat index", 0);
  L.moveTagBy(layout, groups, "g3", "Mortality", 1);
  L.moveGroup(layout, groups, "g5", 0);
  L.moveGroupBy(layout, groups, "g2", -1);
  L.orderedGroups(groups, layout);
  L.isCodebookOrder(groups, layout);
  assert.equal(JSON.stringify(groups), before);
});

const P = (id, title = `Paper ${id}`) => ({ id, title });

test("AC10: applyManualOrder keeps the hand-made order, appends new papers, skips missing IDs", () => {
  const papers = frozen([P(1), P(2), P(3), P(4)]);
  const fallback = frozen([P(4), P(3), P(2), P(1)]);
  // Known order kept; 9 is gone (skipped); 4 is new and 3 is new: appended in fallback order.
  const out = L.applyManualOrder(papers, frozen([2, 9, 1]), fallback);
  assert.deepEqual(plain(out.map((p) => p.id)), [2, 1, 4, 3]);
  // Same objects, each once, even with a duplicate in the manual order.
  assert.deepEqual(plain(L.applyManualOrder(papers, frozen([1, 1, 2]), fallback).map((p) => p.id)), [1, 2, 4, 3]);
  // Empty (or missing) manual order = the fallback order.
  assert.deepEqual(plain(L.applyManualOrder(papers, frozen([]), fallback).map((p) => p.id)), [4, 3, 2, 1]);
  assert.deepEqual(plain(L.applyManualOrder(papers, undefined, fallback).map((p) => p.id)), [4, 3, 2, 1]);
  // Without a fallback, new papers follow in input order.
  assert.deepEqual(plain(L.applyManualOrder(papers, frozen([3])).map((p) => p.id)), [3, 1, 2, 4]);
});

test("AC10: applyManualOrder and seedManualOrder accept a key function (item keys)", () => {
  const keys = new Map([[1, "AAAA1111"], [2, "BBBB2222"], [3, "CCCC3333"]]);
  const keyOf = (p) => keys.get(p.id);
  const papers = frozen([P(1), P(2), P(3)]);
  assert.deepEqual(plain(L.applyManualOrder(papers, frozen(["CCCC3333", "AAAA1111"]), papers, keyOf).map((p) => p.id)), [3, 1, 2]);
  assert.deepEqual(plain(L.seedManualOrder(papers, keyOf)), ["AAAA1111", "BBBB2222", "CCCC3333"]);
  assert.deepEqual(plain(L.seedManualOrder(frozen([P(3), P(1)]))), [3, 1]);
});

test("AC10: moveRow moves before a key, to the end, and is a no-op onto itself or for unknown keys", () => {
  const order = frozen([3, 1, 2]);
  assert.deepEqual(plain(L.moveRow(order, 1, 3)), [1, 3, 2]);
  assert.deepEqual(plain(L.moveRow(order, 3, 2)), [1, 3, 2]);
  assert.deepEqual(plain(L.moveRow(order, 3, null)), [1, 2, 3]);
  assert.deepEqual(plain(L.moveRow(order, 1, 1)), [3, 1, 2]);
  assert.deepEqual(plain(L.moveRow(order, 7, 3)), [3, 1, 2]);
  assert.deepEqual(plain(L.moveRow(order, 1, 7)), [3, 1, 2]);
});

test("AC10: moveRowBy moves one place and does nothing at the edges", () => {
  const order = frozen(["a", "b", "c"]);
  assert.deepEqual(plain(L.moveRowBy(order, "a", 1)), ["b", "a", "c"]);
  assert.deepEqual(plain(L.moveRowBy(order, "c", -1)), ["a", "c", "b"]);
  assert.deepEqual(plain(L.moveRowBy(order, "a", -1)), ["a", "b", "c"]);
  assert.deepEqual(plain(L.moveRowBy(order, "c", 1)), ["a", "b", "c"]);
  assert.deepEqual(plain(L.moveRowBy(order, "x", 1)), ["a", "b", "c"]);
});

test("AC10: nextSortState — new key ascending, same key reverses, from manual ascending", () => {
  assert.deepEqual(plain(L.nextSortState(frozen({ key: "count", direction: "asc" }), "title")), { key: "title", direction: "asc" });
  assert.deepEqual(plain(L.nextSortState(frozen({ key: "title", direction: "asc" }), "title")), { key: "title", direction: "desc" });
  assert.deepEqual(plain(L.nextSortState(frozen({ key: "title", direction: "desc" }), "title")), { key: "title", direction: "asc" });
  assert.deepEqual(plain(L.nextSortState(frozen({ key: "manual", direction: "desc" }), "title")), { key: "title", direction: "asc" });
});

test("AC10: dropSide compares the pointer with the middle of the target", () => {
  assert.equal(L.dropSide(10, 0, 100), "before");
  assert.equal(L.dropSide(49.9, 0, 100), "before");
  assert.equal(L.dropSide(50, 0, 100), "after");
  assert.equal(L.dropSide(130, 100, 40), "after");
});

test("AC10: autoScrollDelta — 0 inside, negative near top, positive near bottom, capped", () => {
  assert.equal(L.autoScrollDelta(300, 0, 600), 0);
  assert.equal(L.autoScrollDelta(40, 0, 600), 0);
  assert.ok(L.autoScrollDelta(30, 0, 600) < 0);
  assert.ok(L.autoScrollDelta(570, 0, 600) > 0);
  assert.equal(L.autoScrollDelta(0, 0, 600), -20);
  assert.equal(L.autoScrollDelta(-50, 0, 600), -20, "past the edge is capped");
  assert.equal(L.autoScrollDelta(600, 0, 600), 20);
  assert.equal(L.autoScrollDelta(700, 0, 600), 20, "past the edge is capped");
  assert.ok(Math.abs(L.autoScrollDelta(20, 0, 600)) <= 20 && Math.abs(L.autoScrollDelta(20, 0, 600)) >= 1);
  assert.equal(L.autoScrollDelta(5, 0, 600, 10, 4), -2);
});

test("AC10: stripeFlags shades every other paper row; other row kinds copy their paper", () => {
  assert.deepEqual(plain(L.stripeFlags(frozen(["paper", "paper", "paper"]))), [false, true, false]);
  assert.deepEqual(
    plain(L.stripeFlags(frozen(["paper", "paper", "detail", "paper", "detail", "paper"]))),
    [false, true, true, false, false, true],
  );
  assert.deepEqual(plain(L.stripeFlags(frozen([]))), []);
});

// ---------------------------------------------------------------------------------------
// F005c T6 (ADR-0014): layout.json validation, migration and the data to save
// ---------------------------------------------------------------------------------------

const layout = (over = {}) => ({
  schemaVersion: 2,
  revision: 7,
  perPaperTable: {
    groupOrder: ["g3", "g2"],
    tagOrder: { g2: ["Temperature", "Heat index"] },
    manualOrders: { "1/ABCD2345": ["EFGH6789", "JKLM2345"] },
  },
  ...over,
});
/** A schema 1 file (the five old summary columns), as written before 2026-11-13. */
const layoutV1 = (over = {}) => ({
  schemaVersion: 1,
  revision: 7,
  perPaperTable: { columnOrder: ["count", "title", "collections", "tags", "details"], manualOrders: { "1/ABCD2345": ["EFGH6789", "JKLM2345"] } },
  ...over,
});

test("T6: emptyLayout is schema 2, revision 0, codebook column order, no manual orders", () => {
  assert.deepEqual(plain(L.emptyLayout()), {
    schemaVersion: 2, revision: 0, perPaperTable: { groupOrder: [], tagOrder: {}, manualOrders: {} },
  });
  assert.equal(L.SCHEMA_VERSION, 2);
});

test("T6: validateLayout accepts schema 2 and schema 1 frames and rejects broken frames", () => {
  assert.deepEqual(plain(L.validateLayout(frozen(layout()))), { ok: true });
  assert.deepEqual(plain(L.validateLayout(frozen(layoutV1()))), { ok: true });
  const bad = [
    null, [], "x", 3,
    {},
    layout({ schemaVersion: 0 }),
    layout({ schemaVersion: "2" }),
    layout({ revision: -1 }),
    layout({ revision: 1.5 }),
    layout({ revision: undefined }),
    layout({ perPaperTable: [] }),
    layout({ perPaperTable: null }),
    layout({ perPaperTable: { groupOrder: "g2", tagOrder: {}, manualOrders: {} } }),
    layout({ perPaperTable: { groupOrder: [], tagOrder: [], manualOrders: {} } }),
    layout({ perPaperTable: { groupOrder: [], manualOrders: {} } }),
    layout({ perPaperTable: { groupOrder: [], tagOrder: {}, manualOrders: [] } }),
    layout({ perPaperTable: { groupOrder: [], tagOrder: {} } }),
    // A version 2 file with only the old frame is not valid.
    layout({ perPaperTable: { columnOrder: [], manualOrders: {} } }),
    layoutV1({ perPaperTable: { columnOrder: "title", manualOrders: {} } }),
    layoutV1({ perPaperTable: { columnOrder: [], manualOrders: [] } }),
    layoutV1({ perPaperTable: { columnOrder: [] } }),
  ];
  for (const data of bad) {
    const r = L.validateLayout(data);
    assert.equal(r.ok, false, JSON.stringify(data));
    assert.ok(!r.newer, JSON.stringify(data));
    assert.equal(typeof r.reason, "string");
  }
});

test("T6: validateLayout flags a newer schema as newer (never overwrite)", () => {
  const r = L.validateLayout(layout({ schemaVersion: 3 }));
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
});

test("T6: migrateLayout 1 → 2 drops the old column order and keeps the manual orders", () => {
  const raw = frozen(layoutV1({
    perPaperTable: {
      columnOrder: ["tags", "title"],
      manualOrders: { "1/AAAA1111": ["K1", 5, "K1", "K2"], "1/BBBB2222": [] },
    },
  }));
  assert.deepEqual(plain(L.migrateLayout(raw)), {
    schemaVersion: 2,
    revision: 7,
    perPaperTable: { groupOrder: [], tagOrder: {}, manualOrders: { "1/AAAA1111": ["K1", "K2"] } },
  });
  assert.deepEqual(plain(L.migrateLayout(frozen(layoutV1()))).perPaperTable.manualOrders, { "1/ABCD2345": ["EFGH6789", "JKLM2345"] });
});

test("T6: migrateLayout cleans contents: bad IDs, names, keys and orders dropped", () => {
  const raw = frozen(layout({
    perPaperTable: {
      groupOrder: ["g3", 4, "", "g3", null, "g2"],
      tagOrder: { g2: ["Heat index", 7, "Heat index", ""], g3: [], g4: "not an array", "": ["X"] },
      manualOrders: {
        "1/AAAA1111": ["K1", 5, "K1", "", null, "K2"],
        "1/BBBB2222": [],
        "1/CCCC3333": "not an array",
        "": ["K9"],
      },
    },
  }));
  assert.deepEqual(plain(L.migrateLayout(raw)), {
    schemaVersion: 2,
    revision: 7,
    perPaperTable: {
      groupOrder: ["g3", "g2"],
      tagOrder: { g2: ["Heat index"] },
      manualOrders: { "1/AAAA1111": ["K1", "K2"] },
    },
  });
  assert.throws(() => L.migrateLayout({ ...layout(), schemaVersion: 3 }));
});

test("T6: layoutData prunes unknown collections and empty orders, cleans the column layout", () => {
  const orders = new Map([["1/AAAA1111", ["K1", "K2", "K1"]], ["1/GONE0000", ["K3"]], ["1/EMPTY000", []]]);
  const columns = frozen({ groupOrder: ["g3", "g3", ""], tagOrder: { g2: ["B", "A", "B"], g5: [] } });
  assert.deepEqual(plain(L.layoutData(columns, orders, new Set(["1/AAAA1111", "1/EMPTY000"]))), {
    groupOrder: ["g3"],
    tagOrder: { g2: ["B", "A"] },
    manualOrders: { "1/AAAA1111": ["K1", "K2"] },
  });
  // Without a snapshot of the collections nothing is pruned by collection.
  assert.deepEqual(plain(L.layoutData(null, orders).manualOrders), { "1/AAAA1111": ["K1", "K2"], "1/GONE0000": ["K3"] });
  assert.deepEqual(plain(L.layoutData(null, orders)).groupOrder, []);
  // The input Map is not changed.
  assert.equal(orders.size, 3);
  assert.deepEqual(orders.get("1/AAAA1111"), ["K1", "K2", "K1"]);
});
