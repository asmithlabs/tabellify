// Feature 006c AC13: unit tests for the pure regroup model (src/content/regroup-model.js).
//
// regroup-model.js is a classic browser script (no import/export) that uses three other
// pure globals. Node runs all four here, in workspace.xhtml's order, in one empty node:vm
// sandbox (as in the other model tests); their globals appear as properties of the
// sandbox. The sandbox has no Zotero, window, document, IOUtils or PathUtils, so loading
// them proves the model needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");
const sandbox = vm.createContext({});
for (const name of ["codebook-model.js", "tag-monitor-model.js", "table-layout-model.js", "regroup-model.js"]) {
  const file = join(dir, name);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const R = sandbox.TabellifyRegroup;
const C = sandbox.TabellifyCodebook;
const L = sandbox.TabellifyTableLayout;
const TM = sandbox.TabellifyTagMonitor;
const U = "ungrouped";

// Objects made inside the sandbox have different prototypes; compare as plain JSON values.
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Deep-freeze test inputs: any attempt by the model to change them throws (strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

/** A v2 codebook from groups and `[name, group]` pairs. */
function book(groups, tags, nextId = 5) {
  return frozen({
    schemaVersion: 2, revision: 3, nextId,
    codebooks: [{ id: "c1", name: "C", groups, tags: tags.map(([name, group]) => ({ name, group })) }],
  });
}

/** The spec's Setup: Exposure(Heat index, Temperature), Outcome(Hospitalization, Mortality), age, sex. */
function setup(extraUngrouped = []) {
  return book(
    [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }],
    [
      ["Heat index", "g2"], ["Temperature", "g2"],
      ["Hospitalization", "g3"], ["Mortality", "g3"],
      ["age", null], ["sex", null], ...extraUngrouped.map((t) => [t, null]),
    ],
  );
}

const EMPTY = frozen({ groupOrder: [], tagOrder: {} });

/** What the table would show: [[blockId, tags]] in order. */
function shownAfter(codebook, layout) {
  return plain(L.orderedGroups(TM.codebookGroups(codebook), layout).map((g) => [g.id, g.tags]));
}

/** Plan a drop and return the plan plus what would be shown after applying it. */
function drop(codebook, layout, drag, target) {
  const p = R.plan(codebook, layout, frozen(drag), frozen(target));
  const data = p.kind === "regroup" ? p.edit.data : codebook;
  return { p, shown: p.layout ? shownAfter(data, p.layout) : null, data };
}

test("AC13: the model loads in an empty sandbox with its three pure helpers", () => {
  assert.equal(typeof R.plan, "function");
  assert.equal(typeof R.describe, "function");
});

test("AC13: tag header in the same block = reorder (layout only, codebook untouched)", () => {
  const cb = setup();
  const { p, shown } = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "header", groupId: "g2", tag: "Heat index", side: "before" });
  assert.equal(p.kind, "reorder");
  assert.equal(p.edit, undefined, "no codebook edit");
  assert.deepEqual(shown, [[U, ["age", "sex"]], ["g2", ["Temperature", "Heat index"]], ["g3", ["Hospitalization", "Mortality"]]]);
});

test("AC13: tag header of another group = join, placed after T (AC2)", () => {
  const cb = setup();
  const { p, shown, data } = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "header", groupId: "g3", tag: "Hospitalization", side: "after" });
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "joined");
  assert.equal(p.groupId, "g3");
  assert.equal(p.edit.ok, true);
  assert.deepEqual(plain(C.tagsIn(data, "g3")), ["Hospitalization", "Mortality", "Temperature"]);
  assert.deepEqual(plain(C.validate(data)), { ok: true });
  assert.deepEqual(shown, [[U, ["age", "sex"]], ["g2", ["Heat index"]], ["g3", ["Hospitalization", "Temperature", "Mortality"]]]);
});

test("AC13: tag header of another group = join, placed before T", () => {
  const cb = setup();
  const before = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "header", groupId: "g3", tag: "Hospitalization", side: "before" });
  assert.deepEqual(before.shown[2], ["g3", ["Temperature", "Hospitalization", "Mortality"]]);
  const beforeLast = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "header", groupId: "g3", tag: "Mortality", side: "before" });
  assert.deepEqual(beforeLast.shown[2], ["g3", ["Hospitalization", "Temperature", "Mortality"]]);
});

test("AC13: tag header in the ungrouped block = becomes ungrouped at that place (AC3)", () => {
  const cb = setup();
  const { p, shown, data } = drop(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, { zone: "header", groupId: U, tag: "age", side: "after" });
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "ungrouped");
  assert.equal(p.groupId, U);
  assert.deepEqual(plain(C.tagsIn(data, null)), ["age", "sex", "Mortality"]);
  assert.deepEqual(shown[0], [U, ["age", "Mortality", "sex"]]);
  assert.deepEqual(shown[2], ["g3", ["Hospitalization"]]);
});

test("AC13: body cell below an ungrouped B = nest into a new group named B, right after B's block (AC4)", () => {
  const cb = setup(["region"]);
  const layout = frozen({ groupOrder: ["g3", U, "g2"], tagOrder: {} });
  const { p, shown, data } = drop(cb, layout, { groupId: U, tag: "sex" }, { zone: "body", groupId: U, tag: "age" });
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "created");
  assert.equal(p.groupId, "g5", "id from nextId");
  assert.equal(data.nextId, 6);
  assert.deepEqual(plain(C.findGroup(data, "g5")), { id: "g5", name: "age" });
  assert.deepEqual(plain(p.layout.tagOrder.g5), ["age", "sex"], "B stays first");
  assert.deepEqual(shown, [["g3", ["Hospitalization", "Mortality"]], [U, ["region"]], ["g5", ["age", "sex"]], ["g2", ["Heat index", "Temperature"]]]);
  assert.deepEqual(plain(C.validate(data)), { ok: true });
});

test("AC13: nest with no saved order puts the new group right after the ungrouped block, not at the far right", () => {
  const cb = setup(["region"]);
  const { shown } = drop(cb, EMPTY, { groupId: U, tag: "sex" }, { zone: "body", groupId: U, tag: "age" });
  assert.deepEqual(shown.map(([id]) => id), [U, "g5", "g2", "g3"]);
});

test("AC13: one-row header (only ungrouped tags): the first nest creates a group", () => {
  const cb = book([], [["a", null], ["b", null], ["c", null]], 2);
  const { p, shown } = drop(cb, EMPTY, { groupId: U, tag: "c" }, { zone: "body", groupId: U, tag: "a" });
  assert.equal(p.effect, "created");
  assert.deepEqual(shown, [[U, ["b"]], ["g2", ["a", "c"]]]);
});

test("AC13: body cell below B in another group = join right after B (AC5)", () => {
  const cb = setup();
  const { p, shown } = drop(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, { zone: "body", groupId: "g2", tag: "Heat index" });
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "joined");
  assert.equal(p.groupId, "g2");
  assert.deepEqual(shown[1], ["g2", ["Heat index", "Mortality", "Temperature"]]);
});

test("AC13: body cell below B in the same group = reorder right after B (Q7)", () => {
  const cb = setup();
  const { p, shown } = drop(cb, EMPTY, { groupId: "g2", tag: "Heat index" }, { zone: "body", groupId: "g2", tag: "Temperature" });
  assert.equal(p.kind, "reorder");
  assert.deepEqual(shown[1], ["g2", ["Temperature", "Heat index"]]);
});

test("AC13: super zone ungroups a grouped tag (end of the ungrouped block) and refuses an ungrouped one (AC6)", () => {
  const cb = setup();
  const { p, shown } = drop(cb, EMPTY, { groupId: "g2", tag: "Heat index" }, { zone: "super" });
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "ungrouped");
  assert.equal(p.groupId, U);
  assert.deepEqual(shown[0], [U, ["age", "sex", "Heat index"]]);
  // A saved order that lists Heat index first in the ungrouped block (stale) does not win.
  const stale = frozen({ groupOrder: [], tagOrder: { [U]: ["Heat index", "sex", "age"] } });
  assert.deepEqual(drop(cb, stale, { groupId: "g2", tag: "Heat index" }, { zone: "super" }).shown[0], [U, ["sex", "age", "Heat index"]]);
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: U, tag: "age" }, { zone: "super" })), { kind: "none" });
});

test("AC13: A = B (or dropping on its own header) does nothing", () => {
  const cb = setup();
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "body", groupId: "g2", tag: "Temperature" })), { kind: "none" });
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: U, tag: "age" }, { zone: "body", groupId: U, tag: "age" })), { kind: "none" });
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "header", groupId: "g2", tag: "Temperature", side: "after" })), { kind: "none" });
});

test("AC13: unknown drags and targets do nothing", () => {
  const cb = setup();
  const none = { kind: "none" };
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: "g3", tag: "Temperature" }, { zone: "super" })), none, "tag not in that block");
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: "g9", tag: "x" }, { zone: "super" })), none);
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "body", groupId: "g3", tag: "age" })), none, "B not in that block");
  assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "title" })), none);
  assert.deepEqual(plain(R.plan(null, EMPTY, { groupId: "g2", tag: "Temperature" }, { zone: "super" })), none);
});

test("AC13: name collision reuses the existing group; B then A go to its end (Q2, AC7)", () => {
  const cb = book([{ id: "g2", name: "Country" }], [["country", null], ["region", null]], 3);
  const { p, shown, data } = drop(cb, EMPTY, { groupId: U, tag: "region" }, { zone: "body", groupId: U, tag: "country" });
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "joined", "status says moved, not created");
  assert.equal(p.groupId, "g2");
  assert.equal(data.nextId, 3, "no new id");
  assert.deepEqual(plain(C.groups(data)), [{ id: "g2", name: "Country" }]);
  assert.deepEqual(shown, [["g2", ["country", "region"]]]);
  // The reused group already has a column: B, A are appended after it.
  const cb2 = book([{ id: "g2", name: "Country" }], [["z", "g2"], ["country", null], ["region", null]], 3);
  assert.deepEqual(drop(cb2, EMPTY, { groupId: U, tag: "region" }, { zone: "body", groupId: U, tag: "country" }).shown, [["g2", ["z", "country", "region"]]]);
});

test("AC13: a stale saved tagOrder entry for A does not win; A is pruned from other blocks", () => {
  const cb = setup();
  const layout = frozen({
    groupOrder: [],
    tagOrder: { g2: ["Temperature", "Heat index"], g3: ["Temperature", "Mortality", "Hospitalization"] },
  });
  const { p, shown } = drop(cb, layout, { groupId: "g2", tag: "Temperature" }, { zone: "header", groupId: "g3", tag: "Hospitalization", side: "after" });
  assert.deepEqual(shown[2], ["g3", ["Mortality", "Hospitalization", "Temperature"]]);
  assert.deepEqual(plain(p.layout.tagOrder.g2), ["Heat index"], "A pruned from its old block");
  assert.deepEqual(plain(p.layout.tagOrder.g3), ["Mortality", "Hospitalization", "Temperature"]);
});

test("AC13: the ungrouped block that appears is inserted first unless the saved order has it", () => {
  const cb = book([{ id: "g2", name: "E" }, { id: "g3", name: "O" }], [["a", "g2"], ["b", "g2"], ["c", "g3"]]);
  const { p, shown } = drop(cb, frozen({ groupOrder: ["g3", "g2"], tagOrder: {} }), { groupId: "g2", tag: "a" }, { zone: "super" });
  assert.deepEqual(plain(p.layout.groupOrder), [U, "g3", "g2"]);
  assert.deepEqual(shown, [[U, ["a"]], ["g3", ["c"]], ["g2", ["b"]]]);
  const kept = drop(cb, frozen({ groupOrder: ["g3", "g2", U], tagOrder: {} }), { groupId: "g2", tag: "a" }, { zone: "super" });
  assert.deepEqual(kept.shown.map(([id]) => id), ["g3", "g2", U], "saved place kept");
});

test("AC13: an emptied group stays in the codebook with 0 tags and no column (Q3)", () => {
  const cb = book([{ id: "g2", name: "Solo" }], [["only", "g2"], ["age", null]]);
  const { p, shown, data } = drop(cb, EMPTY, { groupId: "g2", tag: "only" }, { zone: "super" });
  assert.equal(p.kind, "regroup");
  assert.deepEqual(plain(C.groups(data)), [{ id: "g2", name: "Solo" }]);
  assert.deepEqual(plain(C.tagsIn(data, "g2")), []);
  assert.deepEqual(shown, [[U, ["age", "only"]]]);
});

test("AC13: \"__proto__\" as a tag or group name stays an ordinary key", () => {
  const cb = book([], [["__proto__", null], ["x", null], ["y", null]], 2);
  const { p, shown } = drop(cb, EMPTY, { groupId: U, tag: "x" }, { zone: "body", groupId: U, tag: "__proto__" });
  assert.equal(p.effect, "created");
  assert.deepEqual(shown, [[U, ["y"]], ["g2", ["__proto__", "x"]]]);
  // A hand-edited layout with an own "__proto__" key keeps it as data, not as a prototype.
  const layout = frozen(JSON.parse('{"groupOrder":[],"tagOrder":{"__proto__":["q"],"ungrouped":["y","x"]}}'));
  const r = R.plan(cb, layout, { groupId: U, tag: "x" }, { zone: "body", groupId: U, tag: "__proto__" });
  assert.equal(Object.hasOwn(r.layout.tagOrder, "__proto__"), true);
  assert.deepEqual(plain(r.layout.tagOrder.ungrouped), ["y"], "moved tags pruned from the old block");
  assert.equal(Object.getPrototypeOf(r.layout.tagOrder), vm.runInContext("Object.prototype", sandbox));
});

test("AC13: inputs are never mutated (frozen inputs would throw)", () => {
  const cb = setup(["region"]);
  const layout = frozen({ groupOrder: ["g2", U, "g3"], tagOrder: { g2: ["Temperature", "Heat index"] } });
  const copy = plain(cb);
  for (const target of [
    { zone: "super" },
    { zone: "body", groupId: U, tag: "age" },
    { zone: "header", groupId: "g3", tag: "Mortality", side: "after" },
  ]) {
    R.plan(cb, layout, { groupId: "g2", tag: "Temperature" }, target);
    R.describe(cb, { groupId: "g2", tag: "Temperature" }, target);
  }
  assert.deepEqual(plain(cb), copy);
});

test("AC13: describe returns the hint kind and the plain name", () => {
  const cb = book(
    [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }, { id: "g4", name: "Country" }],
    [["Heat index", "g2"], ["Temperature", "g2"], ["Hospitalization", "g3"], ["age", null], ["sex", null], ["country", null]],
  );
  const d = (drag, target) => plain(R.describe(cb, drag, target));
  const temp = { groupId: "g2", tag: "Temperature" };
  assert.deepEqual(d(temp, { zone: "header", groupId: "g2", tag: "Heat index", side: "before" }), { kind: "reorder", hint: "reorder", effect: null, name: "" });
  assert.deepEqual(d(temp, { zone: "header", groupId: "g3", tag: "Hospitalization", side: "after" }), { kind: "regroup", hint: "join", effect: "joined", name: "Outcome" });
  assert.deepEqual(d(temp, { zone: "header", groupId: U, tag: "age", side: "after" }), { kind: "regroup", hint: "to-ungrouped", effect: "ungrouped", name: "" });
  assert.deepEqual(d(temp, { zone: "body", groupId: U, tag: "age" }), { kind: "regroup", hint: "new-group", effect: "created", name: "age" });
  assert.deepEqual(d(temp, { zone: "body", groupId: U, tag: "country" }), { kind: "regroup", hint: "join", effect: "joined", name: "Country" });
  assert.deepEqual(d(temp, { zone: "body", groupId: "g2", tag: "Heat index" }), { kind: "reorder", hint: "reorder", effect: null, name: "" });
  assert.deepEqual(d(temp, { zone: "super" }), { kind: "regroup", hint: "ungroup", effect: "ungrouped", name: "" });
  assert.equal(R.describe(cb, { groupId: U, tag: "age" }, { zone: "super" }), null);
  assert.equal(R.describe(cb, temp, { zone: "body", groupId: "g2", tag: "Temperature" }), null);
  // Names are returned as given (markup stays literal text; the workspace sets textContent).
  const html = book([], [["<b>x</b>", null], ["y", null]], 2);
  assert.equal(R.describe(html, { groupId: U, tag: "y" }, { zone: "body", groupId: U, tag: "<b>x</b>" }).name, "<b>x</b>");
});
