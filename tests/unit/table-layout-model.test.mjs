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
const DEFAULT = ["title", "count", "collections", "tags", "details"];

/** Deep-freeze test inputs: any attempt by the model to change them throws (strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

test("AC10: the model loads in an empty sandbox and has the expected columns", () => {
  assert.equal(typeof L, "object");
  assert.deepEqual(plain(L.COLUMN_IDS), DEFAULT);
  assert.equal(L.MANUAL, "manual");
});

test("AC10: normalizeColumnOrder drops unknown and duplicate IDs and appends missing ones", () => {
  assert.deepEqual(plain(L.normalizeColumnOrder(["tags", "title"])), ["tags", "title", "count", "collections", "details"]);
  assert.deepEqual(plain(L.normalizeColumnOrder(["bogus", "count", "count", 7, null])), ["count", "title", "collections", "tags", "details"]);
  assert.deepEqual(plain(L.normalizeColumnOrder(frozen([...DEFAULT].reverse()))), [...DEFAULT].reverse());
  for (const bad of [undefined, null, "title", 3, { 0: "tags" }]) {
    assert.deepEqual(plain(L.normalizeColumnOrder(bad)), DEFAULT, String(bad));
  }
});

test("AC10: moveColumn moves to start, to end, clamps, and ignores unknown IDs", () => {
  const order = frozen([...DEFAULT]);
  assert.deepEqual(plain(L.moveColumn(order, "count", 0)), ["count", "title", "collections", "tags", "details"]);
  assert.deepEqual(plain(L.moveColumn(order, "title", 4)), ["count", "collections", "tags", "details", "title"]);
  assert.deepEqual(plain(L.moveColumn(order, "title", 99)), ["count", "collections", "tags", "details", "title"]);
  assert.deepEqual(plain(L.moveColumn(order, "details", -3)), ["details", "title", "count", "collections", "tags"]);
  assert.deepEqual(plain(L.moveColumn(order, "nope", 0)), DEFAULT);
  assert.notEqual(L.moveColumn(order, "nope", 0), order, "returns a new array");
});

test("AC10: moveColumnBy moves one place and does nothing at the edges or for unknown IDs", () => {
  const order = frozen([...DEFAULT]);
  assert.deepEqual(plain(L.moveColumnBy(order, "title", 1)), ["count", "title", "collections", "tags", "details"]);
  assert.deepEqual(plain(L.moveColumnBy(order, "tags", -1)), ["title", "count", "tags", "collections", "details"]);
  assert.deepEqual(plain(L.moveColumnBy(order, "title", -1)), DEFAULT);
  assert.deepEqual(plain(L.moveColumnBy(order, "details", 1)), DEFAULT);
  assert.deepEqual(plain(L.moveColumnBy(order, "nope", 1)), DEFAULT);
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

test("AC10: stripeFlags shades every other paper row; detail rows copy their paper", () => {
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
  schemaVersion: 1,
  revision: 7,
  perPaperTable: { columnOrder: ["count", "title", "collections", "tags", "details"], manualOrders: { "1/ABCD2345": ["EFGH6789", "JKLM2345"] } },
  ...over,
});

test("T6: emptyLayout is schema 1, revision 0, default columns, no manual orders", () => {
  assert.deepEqual(plain(L.emptyLayout()), {
    schemaVersion: 1, revision: 0, perPaperTable: { columnOrder: DEFAULT, manualOrders: {} },
  });
  assert.equal(L.SCHEMA_VERSION, 1);
});

test("T6: validateLayout accepts the ADR-0014 example and rejects broken frames", () => {
  assert.deepEqual(plain(L.validateLayout(frozen(layout()))), { ok: true });
  const bad = [
    null, [], "x", 3,
    {},
    layout({ schemaVersion: 0 }),
    layout({ schemaVersion: "1" }),
    layout({ revision: -1 }),
    layout({ revision: 1.5 }),
    layout({ revision: undefined }),
    layout({ perPaperTable: [] }),
    layout({ perPaperTable: null }),
    layout({ perPaperTable: { columnOrder: "title", manualOrders: {} } }),
    layout({ perPaperTable: { columnOrder: [], manualOrders: [] } }),
    layout({ perPaperTable: { columnOrder: [] } }),
  ];
  for (const data of bad) {
    const r = L.validateLayout(data);
    assert.equal(r.ok, false, JSON.stringify(data));
    assert.ok(!r.newer, JSON.stringify(data));
    assert.equal(typeof r.reason, "string");
  }
});

test("T6: validateLayout flags a newer schema as newer (never overwrite)", () => {
  const r = L.validateLayout(layout({ schemaVersion: 2 }));
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
});

test("T6: migrateLayout cleans contents: columns normalized, bad keys and orders dropped", () => {
  const raw = frozen(layout({
    perPaperTable: {
      columnOrder: ["tags", "bogus", "tags"],
      manualOrders: {
        "1/AAAA1111": ["K1", 5, "K1", "", null, "K2"],
        "1/BBBB2222": [],
        "1/CCCC3333": "not an array",
        "": ["K9"],
      },
    },
  }));
  assert.deepEqual(plain(L.migrateLayout(raw)), {
    schemaVersion: 1,
    revision: 7,
    perPaperTable: {
      columnOrder: ["tags", "title", "count", "collections", "details"],
      manualOrders: { "1/AAAA1111": ["K1", "K2"] },
    },
  });
  assert.throws(() => L.migrateLayout({ ...layout(), schemaVersion: 2 }));
});

test("T6: layoutData prunes unknown collections and empty orders, normalizes columns", () => {
  const orders = new Map([["1/AAAA1111", ["K1", "K2", "K1"]], ["1/GONE0000", ["K3"]], ["1/EMPTY000", []]]);
  assert.deepEqual(plain(L.layoutData(frozen(["count"]), orders, new Set(["1/AAAA1111", "1/EMPTY000"]))), {
    columnOrder: ["count", "title", "collections", "tags", "details"],
    manualOrders: { "1/AAAA1111": ["K1", "K2"] },
  });
  // Without a snapshot of the collections nothing is pruned by collection.
  assert.deepEqual(plain(L.layoutData(DEFAULT, orders).manualOrders), { "1/AAAA1111": ["K1", "K2"], "1/GONE0000": ["K3"] });
  // The input Map is not changed.
  assert.equal(orders.size, 3);
  assert.deepEqual(orders.get("1/AAAA1111"), ["K1", "K2", "K1"]);
});
