// Feature 005c AC10 and Feature 006c Amendment 2 AC27 / AC28: unit tests for the pure
// table-layout model (src/content/table-layout-model.js).
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
// Codebook tag columns: one mixed top-level order (spec 006c Amendment 2, ADR-0019)
// ---------------------------------------------------------------------------------------

/** Codebook groups as TabellifyTagMonitor.codebookGroups() returns them (codebook order). */
const GROUPS = () => frozen([
  { id: "ungrouped", name: "", tags: ["age", "sex"], ungrouped: true },
  { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature", "Humidity"] },
  { id: "g3", name: "Outcome", tags: ["Mortality", "Hospitalization"] },
  { id: "g4", name: "Empty", tags: [] },
  { id: "g5", name: "Design", tags: ["Cohort"] },
]);
/** Groups without an ungrouped block (every tag is in a group). */
const GROUPED_ONLY = () => frozen(GROUPS().slice(1).map((g) => ({ ...g })));
/** [id, run, tags] triples of what orderedGroups shows. */
const shown = (groups, columnLayout) =>
  plain(L.orderedGroups(groups, columnLayout).map((g) => [g.id, g.run ?? null, g.tags]));
/** topItems as short strings: "g:g2", "t:age", "home". */
const top = (groups, columnLayout) => plain(L.topItems(groups, columnLayout)).map((e) =>
  ("tag" in e ? `t:${e.tag}` : e.group === "ungrouped" ? "home" : `g:${e.group}`));
const CODEBOOK_ORDER = [
  ["ungrouped", 0, ["age", "sex"]],
  ["g2", null, ["Heat index", "Temperature", "Humidity"]],
  ["g3", null, ["Mortality", "Hospitalization"]],
  ["g5", null, ["Cohort"]],
];
const T = (...items) => items.map((s) => (s === "home" ? { group: "ungrouped" } : s.startsWith("g:") ? { group: s.slice(2) } : { tag: s.slice(2) }));

test("columns: no layout = codebook order (ungrouped first, one run); empty groups have no column", () => {
  assert.deepEqual(shown(GROUPS(), null), CODEBOOK_ORDER);
  assert.deepEqual(shown(GROUPS(), L.emptyColumnLayout()), CODEBOOK_ORDER);
  assert.deepEqual(plain(L.emptyColumnLayout()), { topOrder: [], tagOrder: {} });
  assert.deepEqual(shown([], null), []);
  assert.equal(L.isCodebookOrder(GROUPS(), L.emptyColumnLayout()), true);
  assert.deepEqual(plain(L.orderedGroups(GROUPS(), null).map((g) => g.name)), ["", "Exposure", "Outcome", "Design"]);
  const run = plain(L.orderedGroups(GROUPS(), null)[0]);
  assert.deepEqual(run, { id: "ungrouped", run: 0, name: "", tags: ["age", "sex"], ungrouped: true });
  assert.deepEqual(top(GROUPS(), null), ["t:age", "t:sex", "home", "g:g2", "g:g3", "g:g5"]);
});

test("AC28 topItems: stale entries skipped, grouped tags skipped, repeats dropped, unlisted placed", () => {
  const layout = frozen({
    topOrder: T("g:g3", "g:gone", "t:Heat index", "t:sex", "g:g4", "g:g3", "t:sex", "t:nope", "home", "g:g2", "home"),
    tagOrder: {},
  });
  // g:gone (removed group), t:Heat index (now in a group), g:g4 (no tags), t:nope (gone)
  // skipped; repeats of g3 / sex / the marker dropped; unlisted "age" before the marker;
  // unlisted g5 appended.
  assert.deepEqual(top(GROUPS(), layout), ["g:g3", "t:sex", "t:age", "home", "g:g2", "g:g5"]);
  // Without a marker the home is the far left: unlisted ungrouped tags go first.
  assert.deepEqual(top(GROUPS(), frozen({ topOrder: T("g:g3", "t:sex"), tagOrder: {} })),
    ["t:age", "home", "g:g3", "t:sex", "g:g2", "g:g5"]);
  // Without any ungrouped tag the marker is still there (it has no column).
  assert.deepEqual(top(GROUPED_ONLY(), null), ["home", "g:g2", "g:g3", "g:g5"]);
  assert.deepEqual(plain(L.visibleTopItems(GROUPED_ONLY(), null)), T("g:g2", "g:g3", "g:g5"));
});

test("AC28 orderedGroups builds runs of neighbouring ungrouped tags with indexes", () => {
  const layout = frozen({ topOrder: T("t:age", "g:g2", "t:sex", "home", "g:g3"), tagOrder: { g2: ["Humidity"] } });
  assert.deepEqual(shown(GROUPS(), layout), [
    ["ungrouped", 0, ["age"]],
    ["g2", null, ["Humidity", "Heat index", "Temperature"]],
    // The home marker between "sex" and g3 does not split anything; g5 appended.
    ["ungrouped", 1, ["sex"]],
    ["g3", null, ["Mortality", "Hospitalization"]],
    ["g5", null, ["Cohort"]],
  ]);
  // The marker sits between two ungrouped tags: still one run.
  const joined = frozen({ topOrder: T("g:g2", "t:sex", "home", "t:age"), tagOrder: {} });
  assert.deepEqual(shown(GROUPS(), joined)[1], ["ungrouped", 0, ["sex", "age"]]);
  assert.equal(L.isCodebookOrder(GROUPS(), layout), false);
});

test("columns: saved tag orders inside groups; new and removed tags; '__proto__' stays a key", () => {
  const layout = frozen({ topOrder: [], tagOrder: { g2: ["Humidity", "Removed tag", "Heat index"], g9: ["X"], g3: "not a list" } });
  assert.deepEqual(shown(GROUPS(), layout)[1], ["g2", null, ["Humidity", "Heat index", "Temperature"]]);
  const grown = frozen([{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature", "Humidity", "Wind"] }]);
  assert.deepEqual(shown(grown, layout), [["g2", null, ["Humidity", "Heat index", "Temperature", "Wind"]]]);
  const raw = JSON.parse('{"topOrder":[{"tag":"__proto__"},{"group":"__proto__"}],"tagOrder":{"__proto__":["Heat index"],"g2":["Temperature"]}}');
  const copy = L.layoutData(raw, new Map());
  assert.equal(Object.getPrototypeOf(copy.tagOrder), Object.getPrototypeOf(L.emptyColumnLayout()), "prototype unchanged");
  assert.deepEqual(plain(Object.getOwnPropertyDescriptor(copy.tagOrder, "__proto__").value), ["Heat index"]);
  assert.deepEqual(plain(copy.topOrder), [{ tag: "__proto__" }, { group: "__proto__" }]);
  // A tag literally named "__proto__" (ungrouped) is shown where topOrder says; no marker
  // is listed, so the home (with the unlisted "x") is the far left.
  const odd = frozen([{ id: "ungrouped", name: "", tags: ["x", "__proto__"], ungrouped: true }]);
  assert.deepEqual(top(odd, raw), ["t:x", "home", "t:__proto__"]);
});

test("columns: moveTag / moveTagBy move a tag only inside its own real group", () => {
  const start = frozen(L.emptyColumnLayout());
  const moved = L.moveTag(start, GROUPS(), "g2", "Humidity", 0);
  assert.deepEqual(plain(moved), { topOrder: [], tagOrder: { g2: ["Humidity", "Heat index", "Temperature"] } });
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g2", "Heat index", 99))[1], ["g2", null, ["Temperature", "Humidity", "Heat index"]]);
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g2", "Mortality", 0)), CODEBOOK_ORDER);
  assert.deepEqual(shown(GROUPS(), L.moveTag(start, GROUPS(), "g9", "Heat index", 0)), CODEBOOK_ORDER);
  // Ungrouped tags are not ordered by tagOrder any more: no change, no "ungrouped" key.
  assert.deepEqual(plain(L.moveTag(start, GROUPS(), "ungrouped", "sex", 0)), { topOrder: [], tagOrder: {} });
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g2", "Heat index", 1))[1], ["g2", null, ["Temperature", "Heat index", "Humidity"]]);
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g2", "Humidity", 1)), CODEBOOK_ORDER, "edge");
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "g3", "Mortality", -1)), CODEBOOK_ORDER, "edge");
  assert.deepEqual(shown(GROUPS(), L.moveTagBy(start, GROUPS(), "ungrouped", "age", 1)), CODEBOOK_ORDER);
});

test("AC28 moveTopItem / moveTopItemBy / placeTopItem move groups and ungrouped tags among the top level", () => {
  const start = frozen({ topOrder: [], tagOrder: { g2: ["Temperature", "Heat index", "Humidity"] } });
  // A group to the far left; the tag order inside travels with it; the marker keeps its place.
  const moved = L.moveTopItem(start, GROUPS(), { group: "g5" }, 0);
  assert.deepEqual(top(GROUPS(), moved), ["g:g5", "t:age", "t:sex", "home", "g:g2", "g:g3"]);
  assert.deepEqual(plain(moved.tagOrder), { g2: ["Temperature", "Heat index", "Humidity"] });
  // An ungrouped tag between two groups: two runs.
  const between = L.moveTopItem(start, GROUPS(), { tag: "age" }, 2);
  assert.deepEqual(shown(GROUPS(), between).map((b) => [b.at(0), b.at(1)]), [["ungrouped", 0], ["g2", null], ["ungrouped", 1], ["g3", null], ["g5", null]]);
  assert.deepEqual(shown(GROUPS(), between)[2][2], ["age"]);
  // Clamped to the end.
  assert.deepEqual(top(GROUPS(), L.moveTopItem(start, GROUPS(), { tag: "age" }, 99)), ["t:sex", "home", "g:g2", "g:g3", "g:g5", "t:age"]);
  // By one place: past one ungrouped tag, or past one whole group.
  assert.deepEqual(top(GROUPS(), L.moveTopItemBy(start, GROUPS(), { tag: "sex" }, 1)), ["t:age", "home", "g:g2", "t:sex", "g:g3", "g:g5"]);
  assert.deepEqual(top(GROUPS(), L.moveTopItemBy(start, GROUPS(), { tag: "sex" }, -1)), ["t:sex", "t:age", "home", "g:g2", "g:g3", "g:g5"]);
  assert.deepEqual(top(GROUPS(), L.moveTopItemBy(start, GROUPS(), { group: "g2" }, -1)), ["t:age", "g:g2", "t:sex", "home", "g:g3", "g:g5"]);
  // Edges and unknown items: no change.
  assert.deepEqual(top(GROUPS(), L.moveTopItemBy(start, GROUPS(), { tag: "age" }, -1)), top(GROUPS(), null));
  assert.deepEqual(top(GROUPS(), L.moveTopItemBy(start, GROUPS(), { group: "g5" }, 1)), top(GROUPS(), null));
  assert.deepEqual(top(GROUPS(), L.moveTopItem(start, GROUPS(), { group: "g4" }, 0)), top(GROUPS(), null), "no column");
  assert.deepEqual(top(GROUPS(), L.moveTopItem(start, GROUPS(), { tag: "Heat index" }, 0)), top(GROUPS(), null), "grouped tag");
  // Before / after another item (e.g. a group dropped beside an ungrouped tag).
  assert.deepEqual(top(GROUPS(), L.placeTopItem(start, GROUPS(), { group: "g3" }, { tag: "sex" }, "before")), ["t:age", "g:g3", "t:sex", "home", "g:g2", "g:g5"]);
  assert.deepEqual(top(GROUPS(), L.placeTopItem(start, GROUPS(), { group: "g3" }, { tag: "age" }, "after")), ["t:age", "g:g3", "t:sex", "home", "g:g2", "g:g5"]);
  assert.deepEqual(top(GROUPS(), L.placeTopItem(start, GROUPS(), { tag: "age" }, { group: "g5" }, "after")), ["t:sex", "home", "g:g2", "g:g3", "g:g5", "t:age"]);
  assert.deepEqual(top(GROUPS(), L.placeTopItem(start, GROUPS(), { group: "g3" }, { group: "g3" }, "after")), top(GROUPS(), null), "onto itself");
  // The result lists every shown item explicitly.
  assert.deepEqual(plain(moved.topOrder), T("g:g5", "t:age", "t:sex", "home", "g:g2", "g:g3"));
});

test("columns: moves never change their inputs", () => {
  const groups = GROUPS(); // deep-frozen: a change would throw
  const layout = frozen({ topOrder: T("g:g3", "t:sex"), tagOrder: { g2: ["Humidity"] } });
  L.moveTag(layout, groups, "g2", "Heat index", 0);
  L.moveTagBy(layout, groups, "g3", "Mortality", 1);
  L.moveTopItem(layout, groups, { group: "g5" }, 0);
  L.moveTopItemBy(layout, groups, { tag: "sex" }, 1);
  L.placeTopItem(layout, groups, { tag: "age" }, { group: "g3" }, "after");
  L.orderedGroups(groups, layout);
  L.topItems(groups, layout);
  L.isCodebookOrder(groups, layout);
  assert.deepEqual(plain(groups), plain(GROUPS()));
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

test("AC27 dropEdge: the four zones with BAND 0.25 (outer quarters, middle split top / bottom)", () => {
  const rect = frozen({ left: 100, top: 50, width: 120, height: 28 });
  assert.equal(L.EDGE_BAND, 0.25);
  // Left / right quarters, full height (30 px each on a 120 px cell).
  assert.deepEqual(plain(L.dropEdge(100, 50, rect)), { edge: "left", side: "left" }, "top-left corner");
  assert.deepEqual(plain(L.dropEdge(129.9, 78, rect)), { edge: "left", side: "left" }, "bottom-left corner");
  assert.deepEqual(plain(L.dropEdge(220, 50, rect)), { edge: "right", side: "right" }, "top-right corner");
  assert.deepEqual(plain(L.dropEdge(190.1, 77, rect)), { edge: "right", side: "right" });
  // Exactly on a band border: fx = 0.25 is no longer "left"; fx = 0.75 is not "right" yet.
  assert.deepEqual(plain(L.dropEdge(130, 55, rect)), { edge: "top", side: "left" });
  assert.deepEqual(plain(L.dropEdge(190, 55, rect)), { edge: "top", side: "right" });
  // Middle half: upper half = top, lower half = bottom; the middle line counts as bottom.
  assert.deepEqual(plain(L.dropEdge(150, 60, rect)), { edge: "top", side: "left" });
  assert.deepEqual(plain(L.dropEdge(170, 70, rect)), { edge: "bottom", side: "right" });
  assert.deepEqual(plain(L.dropEdge(150, 64, rect)), { edge: "bottom", side: "left" }, "fy = 0.5");
  assert.deepEqual(plain(L.dropEdge(160, 63.9, rect)), { edge: "top", side: "right" }, "fx = 0.5 is right");
});

test("AC27 dropEdge: a pointer outside the rect is clamped; zero width / height → side", () => {
  const rect = frozen({ left: 100, top: 50, width: 120, height: 28 });
  assert.deepEqual(plain(L.dropEdge(40, 60, rect)), { edge: "left", side: "left" });
  assert.deepEqual(plain(L.dropEdge(400, 60, rect)), { edge: "right", side: "right" });
  assert.deepEqual(plain(L.dropEdge(160, 0, rect)), { edge: "top", side: "right" });
  assert.deepEqual(plain(L.dropEdge(150, 500, rect)), { edge: "bottom", side: "left" });
  assert.deepEqual(plain(L.dropEdge(150, 60, { left: 100, top: 50, width: 120, height: 0 })), { edge: "left", side: "left" });
  assert.deepEqual(plain(L.dropEdge(170, 60, { left: 100, top: 50, width: 120, height: 0 })), { edge: "right", side: "right" });
  assert.deepEqual(plain(L.dropEdge(90, 60, { left: 100, top: 50, width: 0, height: 28 })), { edge: "left", side: "left" });
  assert.deepEqual(plain(L.dropEdge(100, 60, { left: 100, top: 50, width: 0, height: 28 })), { edge: "right", side: "right" });
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
// layout.json validation, migration 1 → 2 → 3 and the data to save (ADR-0014, ADR-0019)
// ---------------------------------------------------------------------------------------

const MANUAL = { "1/ABCD2345": ["EFGH6789", "JKLM2345"] };
const layout = (over = {}) => ({
  schemaVersion: 3,
  revision: 7,
  perPaperTable: {
    topOrder: [{ tag: "age" }, { group: "g2" }, { tag: "sex" }, { group: "ungrouped" }, { group: "g3" }],
    tagOrder: { g2: ["Temperature", "Heat index"] },
    manualOrders: MANUAL,
  },
  ...over,
});
const layoutV2 = (perPaperTable = {}) => ({
  schemaVersion: 2,
  revision: 7,
  perPaperTable: { groupOrder: ["g3", "g2"], tagOrder: { g2: ["Temperature", "Heat index"] }, manualOrders: MANUAL, ...perPaperTable },
});
/** A schema 1 file (the five old summary columns), as written before 2026-11-13. */
const layoutV1 = (over = {}) => ({
  schemaVersion: 1,
  revision: 7,
  perPaperTable: { columnOrder: ["count", "title", "collections", "tags", "details"], manualOrders: MANUAL },
  ...over,
});

test("AC28: emptyLayout is schema 3, revision 0, codebook column order, no manual orders", () => {
  assert.deepEqual(plain(L.emptyLayout()), {
    schemaVersion: 3, revision: 0, perPaperTable: { topOrder: [], tagOrder: {}, manualOrders: {} },
  });
  assert.equal(L.SCHEMA_VERSION, 3);
});

test("AC28: validateLayout accepts schema 3, 2 and 1 frames and rejects broken frames", () => {
  assert.deepEqual(plain(L.validateLayout(frozen(layout()))), { ok: true });
  assert.deepEqual(plain(L.validateLayout(frozen(layoutV2()))), { ok: true });
  assert.deepEqual(plain(L.validateLayout(frozen(layoutV1()))), { ok: true });
  const bad = [
    null, [], "x", 3,
    {},
    layout({ schemaVersion: 0 }),
    layout({ schemaVersion: "3" }),
    layout({ revision: -1 }),
    layout({ revision: 1.5 }),
    layout({ revision: undefined }),
    layout({ perPaperTable: [] }),
    layout({ perPaperTable: null }),
    layout({ perPaperTable: { topOrder: {}, tagOrder: {}, manualOrders: {} } }),
    layout({ perPaperTable: { topOrder: [], tagOrder: [], manualOrders: {} } }),
    layout({ perPaperTable: { topOrder: [], manualOrders: {} } }),
    layout({ perPaperTable: { topOrder: [], tagOrder: {}, manualOrders: [] } }),
    layout({ perPaperTable: { topOrder: [], tagOrder: {} } }),
    // A version 3 file with the version 2 frame is not valid, and the other way round.
    layout({ perPaperTable: { groupOrder: [], tagOrder: {}, manualOrders: {} } }),
    layoutV2({ groupOrder: undefined, topOrder: [] }),
    layoutV2({ tagOrder: [] }),
    layout({ perPaperTable: { columnOrder: [], manualOrders: {} } }),
    layoutV1({ perPaperTable: { columnOrder: "title", manualOrders: {} } }),
    layoutV1({ perPaperTable: { columnOrder: [] } }),
  ];
  for (const data of bad) {
    const r = L.validateLayout(data);
    assert.equal(r.ok, false, JSON.stringify(data));
    assert.ok(!r.newer, JSON.stringify(data));
    assert.equal(typeof r.reason, "string");
  }
});

test("AC28: validateLayout flags schema 4 as newer (never overwrite)", () => {
  const r = L.validateLayout(layout({ schemaVersion: 4 }));
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
  assert.throws(() => L.migrateLayout({ ...layout(), schemaVersion: 4 }));
});

test("AC28: migrateLayout 1 → 3 drops the old column order and keeps the manual orders", () => {
  const raw = frozen(layoutV1({
    perPaperTable: { columnOrder: ["tags", "title"], manualOrders: { "1/AAAA1111": ["K1", 5, "K1", "K2"], "1/BBBB2222": [] } },
  }));
  assert.deepEqual(plain(L.migrateLayout(raw)), {
    schemaVersion: 3,
    revision: 7,
    perPaperTable: { topOrder: [], tagOrder: {}, manualOrders: { "1/AAAA1111": ["K1", "K2"] } },
  });
});

/** A codebook view for the "same order as schema 2" checks. */
const MIG_GROUPS = () => frozen([
  { id: "ungrouped", name: "", tags: ["age", "sex", "bmi"], ungrouped: true },
  { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
  { id: "g3", name: "Outcome", tags: ["Mortality"] },
  { id: "g5", name: "Design", tags: ["Cohort"] },
]);
/**
 * What schema 2 showed for a version 2 perPaperTable (the old orderedGroups, written out
 * here so the test does not depend on the code it checks): blocks in groupOrder order with
 * unknown IDs appended in codebook order (ungrouped block first), tags by tagOrder.
 */
function schema2Shown(groups, table) {
  const merge = (items, saved) => {
    const out = [];
    for (const id of Array.isArray(saved) ? saved : []) if (items.includes(id) && !out.includes(id)) out.push(id);
    for (const id of items) if (!out.includes(id)) out.push(id);
    return out;
  };
  const withTags = groups.filter((g) => g.tags.length > 0);
  return merge(withTags.map((g) => g.id), table.groupOrder).map((id) => {
    const g = withTags.find((x) => x.id === id);
    return [id, merge(g.tags, table.tagOrder[id])];
  });
}

test("AC28: migrateLayout 2 → 3 builds topOrder from groupOrder and tagOrder.ungrouped (ADR-0019 §4)", () => {
  const cases = [
    // "ungrouped" first, with a saved ungrouped order
    [{ groupOrder: ["ungrouped", "g3", "g2"], tagOrder: { ungrouped: ["sex", "age"], g2: ["Temperature"] } },
      [{ tag: "sex" }, { tag: "age" }, { group: "ungrouped" }, { group: "g3" }, { group: "g2" }]],
    // "ungrouped" in the middle
    [{ groupOrder: ["g3", "ungrouped", "g2"], tagOrder: { ungrouped: ["bmi"] } },
      [{ group: "g3" }, { tag: "bmi" }, { group: "ungrouped" }, { group: "g2" }]],
    // "ungrouped" in the middle, no saved ungrouped order
    [{ groupOrder: ["g3", "ungrouped"], tagOrder: {} },
      [{ group: "g3" }, { group: "ungrouped" }]],
    // missing from a non-empty groupOrder: appended (schema 2 showed it after the listed groups)
    [{ groupOrder: ["g3", "g2"], tagOrder: { ungrouped: ["sex"] } },
      [{ group: "g3" }, { group: "g2" }, { tag: "sex" }, { group: "ungrouped" }]],
    [{ groupOrder: ["g3"], tagOrder: {} },
      [{ group: "g3" }, { group: "ungrouped" }]],
    // empty groupOrder: ungrouped first (or nothing to say)
    [{ groupOrder: [], tagOrder: { ungrouped: ["bmi", "age"] } },
      [{ tag: "bmi" }, { tag: "age" }, { group: "ungrouped" }]],
    [{ groupOrder: [], tagOrder: {} }, []],
  ];
  for (const [table, topOrder] of cases) {
    const raw = frozen(layoutV2(table));
    const out = plain(L.migrateLayout(raw));
    assert.equal(out.schemaVersion, 3);
    assert.equal(out.revision, 7);
    assert.deepEqual(out.perPaperTable.topOrder, topOrder, JSON.stringify(table));
    assert.equal(Object.hasOwn(out.perPaperTable.tagOrder, "ungrouped"), false, "tagOrder.ungrouped dropped");
    assert.deepEqual(out.perPaperTable.manualOrders, MANUAL);
    // The migrated layout shows exactly the schema 2 order (one run where the block was).
    const now = plain(L.orderedGroups(MIG_GROUPS(), out.perPaperTable).map((g) => [g.id, g.tags]));
    assert.deepEqual(now, schema2Shown(plain(MIG_GROUPS()), table), JSON.stringify(table));
  }
});

test("AC28: migrateLayout cleans schema 3 contents (bad entries, two keys, repeats, second marker)", () => {
  const raw = frozen(JSON.parse(JSON.stringify(layout({
    perPaperTable: {
      topOrder: [
        { tag: "age" }, { tag: "age" }, { group: "g2" }, "g3", null, [], 5, {}, { tag: "" }, { group: 7 },
        { group: "g3", tag: "x" }, { name: "x" }, { group: "ungrouped" }, { tag: "ungrouped" }, { group: "ungrouped" },
        { tag: "g2" },
      ],
      tagOrder: { g2: ["Heat index", 7, "Heat index", ""], g3: [], g4: "not an array", "": ["X"], ungrouped: ["age"] },
      manualOrders: { "1/AAAA1111": ["K1", 5, "K1", "", null, "K2"], "1/BBBB2222": [], "1/CCCC3333": "x", "": ["K9"] },
    },
  }))));
  assert.deepEqual(plain(L.migrateLayout(raw)), {
    schemaVersion: 3,
    revision: 7,
    perPaperTable: {
      // A tag named "ungrouped" or "g2" is an ordinary tag entry (the key says what it is).
      topOrder: [{ tag: "age" }, { group: "g2" }, { group: "ungrouped" }, { tag: "ungrouped" }, { tag: "g2" }],
      tagOrder: { g2: ["Heat index"] },
      manualOrders: { "1/AAAA1111": ["K1", "K2"] },
    },
  });
  // "__proto__" as a tag name (value) and as a tagOrder key stays ordinary data.
  const proto = L.migrateLayout(JSON.parse(
    '{"schemaVersion":3,"revision":1,"perPaperTable":{"topOrder":[{"tag":"__proto__"},{"__proto__":"x"}],' +
    '"tagOrder":{"__proto__":["a"]},"manualOrders":{}}}',
  ));
  assert.deepEqual(plain(proto.perPaperTable.topOrder), [{ tag: "__proto__" }]);
  assert.deepEqual(Object.keys(proto.perPaperTable.tagOrder), ["__proto__"]);
  assert.equal(Object.getPrototypeOf(proto.perPaperTable.tagOrder), Object.getPrototypeOf(L.emptyColumnLayout()));
});

test("AC28: layoutData prunes unknown collections and empty orders, cleans the column layout", () => {
  const orders = new Map([["1/AAAA1111", ["K1", "K2", "K1"]], ["1/GONE0000", ["K3"]], ["1/EMPTY000", []]]);
  const columns = frozen({ topOrder: [{ group: "g3" }, { group: "g3" }, { tag: "" }], tagOrder: { g2: ["B", "A", "B"], g5: [], ungrouped: ["x"] } });
  assert.deepEqual(plain(L.layoutData(columns, orders, new Set(["1/AAAA1111", "1/EMPTY000"]))), {
    topOrder: [{ group: "g3" }],
    tagOrder: { g2: ["B", "A"] },
    manualOrders: { "1/AAAA1111": ["K1", "K2"] },
  });
  assert.deepEqual(plain(L.layoutData(null, orders).manualOrders), { "1/AAAA1111": ["K1", "K2"], "1/GONE0000": ["K3"] });
  assert.deepEqual(plain(L.layoutData(null, orders)).topOrder, []);
  assert.equal(orders.size, 3);
  assert.deepEqual(orders.get("1/AAAA1111"), ["K1", "K2", "K1"]);
});
