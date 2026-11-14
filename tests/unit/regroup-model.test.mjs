// Feature 006c Amendment 2 AC30: unit tests for the pure regroup model
// (src/content/regroup-model.js): edge-based drops (Tables 1–4), fallbacks, and where things
// land in layout.json schema 3 (A2.5).
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

/**
 * The Amendment 2 Setup: Exposure(Heat index, Temperature), Outcome(Hospitalization,
 * Mortality), then age, sex, smoker, bmi, diet (ungrouped).
 */
function setup(ungrouped = ["age", "sex", "smoker", "bmi", "diet"]) {
  return book(
    [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }],
    [
      ["Heat index", "g2"], ["Temperature", "g2"],
      ["Hospitalization", "g3"], ["Mortality", "g3"],
      ...ungrouped.map((t) => [t, null]),
    ],
  );
}

const EMPTY = frozen({ topOrder: [], tagOrder: {} });

/** What the table would show: [[blockId, tags]] in order (runs appear as "ungrouped"). */
function shownAfter(codebook, layout) {
  return plain(L.orderedGroups(TM.codebookGroups(codebook), layout).map((g) => [g.id, g.tags]));
}

/** Plan a drop and return the plan plus what would be shown after applying it. */
function drop(codebook, layout, drag, target) {
  const p = R.plan(codebook, layout, frozen(drag), frozen(target));
  const data = p.kind === "regroup" ? p.edit.data : codebook;
  return { p, shown: p.layout ? shownAfter(data, p.layout) : null, data };
}

const tagCell = (groupId, tag, edge, side = edge === "right" ? "right" : "left") => ({ cell: "tag", groupId, tag, edge, side });
const groupCell = (groupId, edge, side = edge === "right" ? "right" : "left") => ({ cell: "group", groupId, edge, side });
const runCell = (run, edge, side = edge === "right" ? "right" : "left") => ({ cell: "run", groupId: U, run, edge, side });
const START = [
  [U, ["age", "sex", "smoker", "bmi", "diet"]],
  ["g2", ["Heat index", "Temperature"]],
  ["g3", ["Hospitalization", "Mortality"]],
];

test("AC30: the model loads in an empty sandbox with its three pure helpers", () => {
  assert.equal(typeof R.plan, "function");
  assert.equal(typeof R.describe, "function");
  assert.equal(typeof R.keyboardTarget, "function");
  assert.deepEqual(shownAfter(setup(), EMPTY), START);
});

// ---------------------------------------------------------------------------------------
// Table 1: an ungrouped tag B
// ---------------------------------------------------------------------------------------

test("AC30 Table 1 bottom: B becomes a group name at B's place, A under it (AC17)", () => {
  const cb = setup();
  const { p, shown, data } = drop(cb, EMPTY, { groupId: U, tag: "sex" }, tagCell(U, "age", "bottom"));
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "created");
  assert.equal(p.named, "below");
  assert.equal(p.edge, "bottom");
  assert.equal(p.groupId, "g5");
  assert.equal(C.findTag(data, "age"), undefined, "the tag age left the codebook");
  assert.deepEqual(shown, [
    ["g5", ["sex"]],
    [U, ["smoker", "bmi", "diet"]],
    ["g2", ["Heat index", "Temperature"]],
    ["g3", ["Hospitalization", "Mortality"]],
  ]);
  assert.deepEqual(plain(p.layout.tagOrder), { g5: ["sex"] });
  assert.ok(plain(p.layout.topOrder).some((e) => e.group === U), "home marker kept");
  assert.deepEqual(plain(R.describe(cb, EMPTY, { groupId: U, tag: "sex" }, tagCell(U, "age", "bottom"))),
    { kind: "regroup", hint: "new-group", effect: "created", name: "age", edge: "bottom", named: "below" });
});

test("AC30 Table 1 top (flip): A becomes a group name at B's place, B under it (AC18)", () => {
  const cb = setup();
  const { p, shown, data } = drop(cb, EMPTY, { groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top"));
  assert.equal(p.kind, "regroup");
  assert.equal(p.effect, "created");
  assert.equal(p.named, "above");
  assert.equal(p.edge, "top");
  assert.equal(C.findTag(data, "bmi"), undefined, "the dragged tag left the codebook");
  assert.deepEqual(shown, [
    [U, ["age", "sex"]],
    ["g5", ["smoker"]],
    [U, ["diet"]],
    ["g2", ["Heat index", "Temperature"]],
    ["g3", ["Hospitalization", "Mortality"]],
  ]);
  assert.deepEqual(plain(p.layout.tagOrder), { g5: ["smoker"] });
  const info = plain(R.describe(cb, EMPTY, { groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top")));
  assert.equal(info.hint, "new-group");
  assert.equal(info.name, "bmi");
  assert.equal(info.named, "above");
});

test("AC30 Table 1 top: a grouped A leaves its group and becomes the name (A2-Q6)", () => {
  const { p, shown, data } = drop(setup(), EMPTY, { groupId: "g3", tag: "Mortality" }, tagCell(U, "diet", "top"));
  assert.equal(p.kind, "regroup");
  assert.equal(C.findTag(data, "Mortality"), undefined);
  assert.deepEqual(shown, [
    [U, ["age", "sex", "smoker", "bmi"]],
    ["g5", ["diet"]],
    ["g2", ["Heat index", "Temperature"]],
    ["g3", ["Hospitalization"]],
  ]);
});

test("AC30 Table 1 left / right: beside B as an ungrouped tag (reorder or ungroup) (AC19)", () => {
  const cb = setup();
  // A grouped: codebook edit (ungrouped), lands right before diet in the same run.
  const a = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, tagCell(U, "diet", "left"));
  assert.equal(a.p.kind, "regroup");
  assert.equal(a.p.effect, "ungrouped");
  assert.equal(a.p.named, null);
  assert.equal(a.p.groupId, U);
  assert.deepEqual(a.shown, [
    [U, ["age", "sex", "smoker", "bmi", "Temperature", "diet"]],
    ["g2", ["Heat index"]],
    ["g3", ["Hospitalization", "Mortality"]],
  ]);
  assert.equal(R.describe(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, tagCell(U, "diet", "left")).hint, "to-ungrouped");
  // A ungrouped: a reorder (layout only), after B with the right edge.
  const b = drop(cb, EMPTY, { groupId: U, tag: "age" }, tagCell(U, "smoker", "right"));
  assert.equal(b.p.kind, "reorder");
  assert.equal(b.p.edge, "right");
  assert.deepEqual(b.shown[0], [U, ["sex", "smoker", "age", "bmi", "diet"]]);
  assert.equal(R.describe(cb, EMPTY, { groupId: U, tag: "age" }, tagCell(U, "smoker", "right")).hint, "reorder");
});

test("AC30 Table 1: A = B does nothing (no plan, no hint)", () => {
  for (const edge of ["left", "right", "top", "bottom"]) {
    assert.deepEqual(plain(R.plan(setup(), EMPTY, { groupId: U, tag: "age" }, tagCell(U, "age", edge))), { kind: "none" });
    assert.equal(R.describe(setup(), EMPTY, { groupId: U, tag: "age" }, tagCell(U, "age", edge)), null);
  }
});

test("AC30 Table 1 bottom / top into a reused group (Q2): it stays where it is, child at its end", () => {
  const cb = book(
    [{ id: "g2", name: "Country" }, { id: "g3", name: "Outcome" }],
    [["Mortality", "g3"], ["nation", "g2"], ["country", null], ["region", null]],
  );
  const layout = frozen({ topOrder: [{ group: "g2" }, { tag: "country" }, { tag: "region" }, { group: "g3" }], tagOrder: {} });
  const below = drop(cb, layout, { groupId: U, tag: "region" }, tagCell(U, "country", "bottom"));
  assert.equal(below.p.effect, "joined");
  assert.equal(below.p.named, "below");
  assert.deepEqual(below.shown, [["g2", ["nation", "region"]], ["g3", ["Mortality"]]]);
  assert.equal(R.describe(cb, layout, { groupId: U, tag: "region" }, tagCell(U, "country", "bottom")).name, "Country", "stored spelling");
  // Flip: "Country" (reused) gets the target tag at its end.
  const cb2 = book([{ id: "g2", name: "Region" }], [["x", "g2"], ["country", null], ["region", null]]);
  const top = drop(cb2, EMPTY, { groupId: U, tag: "region" }, tagCell(U, "country", "top"));
  assert.equal(top.p.effect, "joined");
  assert.deepEqual(top.shown, [["g2", ["x", "country"]]]);
});

test("AC30: a reused group with no column yet (empty, 'Country · 0') appears at B's place (AC7)", () => {
  const cb = book(
    [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Country" }],
    [["Heat index", "g2"], ["country", null], ["region", null], ["age", null]],
  );
  const { p, shown } = drop(cb, EMPTY, { groupId: U, tag: "region" }, tagCell(U, "country", "bottom"));
  assert.equal(p.effect, "joined");
  assert.equal(p.groupId, "g3");
  assert.deepEqual(shown, [["g3", ["region"]], [U, ["age"]], ["g2", ["Heat index"]]]);
});

// ---------------------------------------------------------------------------------------
// Table 2: a group's super-header
// ---------------------------------------------------------------------------------------

test("AC30 Table 2 bottom: A joins G at its end; already in G = move to the end (AC20)", () => {
  const cb = setup();
  const a = drop(cb, EMPTY, { groupId: "g2", tag: "Heat index" }, groupCell("g3", "bottom"));
  assert.equal(a.p.kind, "regroup");
  assert.equal(a.p.effect, "joined");
  assert.equal(a.p.groupId, "g3");
  assert.deepEqual(a.shown.at(-1), ["g3", ["Hospitalization", "Mortality", "Heat index"]]);
  assert.deepEqual(plain(R.describe(cb, EMPTY, { groupId: "g2", tag: "Heat index" }, groupCell("g3", "bottom"))),
    { kind: "regroup", hint: "join", effect: "joined", name: "Outcome", edge: "bottom", named: null });
  const b = drop(cb, EMPTY, { groupId: "g3", tag: "Hospitalization" }, groupCell("g3", "bottom"));
  assert.equal(b.p.kind, "reorder");
  assert.deepEqual(b.shown.at(-1), ["g3", ["Mortality", "Hospitalization"]]);
  // An ungrouped A joins too.
  const c = drop(cb, EMPTY, { groupId: U, tag: "age" }, groupCell("g2", "bottom"));
  assert.equal(c.p.kind, "regroup");
  assert.deepEqual(c.shown[1], ["g2", ["Heat index", "Temperature", "age"]]);
});

test("AC30 Table 2 left / right: A beside G as an ungrouped top-level tag (AC20)", () => {
  const cb = setup();
  const a = drop(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, groupCell("g3", "right"));
  assert.equal(a.p.kind, "regroup");
  assert.equal(a.p.effect, "ungrouped");
  assert.deepEqual(a.shown, [...START.slice(0, 2), ["g3", ["Hospitalization"]], [U, ["Mortality"]]]);
  assert.equal(R.describe(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, groupCell("g3", "right")).hint, "to-ungrouped");
  const b = drop(cb, EMPTY, { groupId: U, tag: "diet" }, groupCell("g3", "left"));
  assert.equal(b.p.kind, "reorder");
  assert.deepEqual(b.shown, [
    [U, ["age", "sex", "smoker", "bmi"]], ["g2", ["Heat index", "Temperature"]], [U, ["diet"]], ["g3", ["Hospitalization", "Mortality"]],
  ]);
});

test("AC30 Table 2 top falls back to the pointer's side (never 'above a group')", () => {
  const cb = setup();
  const left = R.describe(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, groupCell("g3", "top", "left"));
  const right = R.describe(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, groupCell("g3", "top", "right"));
  assert.equal(left.edge, "left");
  assert.equal(right.edge, "right");
  assert.equal(left.hint, "to-ungrouped");
  const { shown } = drop(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, groupCell("g3", "top", "left"));
  assert.deepEqual(shown, [...START.slice(0, 2), [U, ["Mortality"]], ["g3", ["Hospitalization"]]]);
  // A group that is not shown (unknown / stale): nothing.
  assert.equal(R.describe(cb, EMPTY, { groupId: U, tag: "age" }, groupCell("g9", "bottom")), null);
});

test("AC30: the last tag leaving a group: it stays in the codebook with 0 tags (Q3), its entry pruned", () => {
  const cb = book([{ id: "g2", name: "Solo" }], [["only", "g2"], ["age", null]]);
  const { p, shown, data } = drop(cb, EMPTY, { groupId: "g2", tag: "only" }, groupCell("g2", "left"));
  assert.equal(p.kind, "regroup");
  assert.deepEqual(plain(C.groups(data)), [{ id: "g2", name: "Solo" }]);
  assert.deepEqual(shown, [[U, ["age", "only"]]]);
  assert.equal(plain(p.layout.topOrder).some((e) => e.group === "g2"), false);
});

// ---------------------------------------------------------------------------------------
// Table 3: a tag inside a group
// ---------------------------------------------------------------------------------------

test("AC30 Table 3 left / right: A joins G beside B; already in G = reorder (AC21)", () => {
  const cb = setup();
  const a = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, tagCell("g3", "Hospitalization", "right"));
  assert.equal(a.p.kind, "regroup");
  assert.equal(a.p.effect, "joined");
  assert.deepEqual(a.shown.at(-1), ["g3", ["Hospitalization", "Temperature", "Mortality"]]);
  assert.deepEqual(plain(a.p.layout.tagOrder), { g3: ["Hospitalization", "Temperature", "Mortality"] });
  const b = drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, tagCell("g2", "Heat index", "left"));
  assert.equal(b.p.kind, "reorder");
  assert.deepEqual(b.shown[1], ["g2", ["Temperature", "Heat index"]]);
  // An ungrouped A joins before B.
  const c = drop(cb, EMPTY, { groupId: U, tag: "sex" }, tagCell("g3", "Mortality", "left"));
  assert.deepEqual(c.shown.at(-1), ["g3", ["Hospitalization", "sex", "Mortality"]]);
  assert.deepEqual(c.shown[0], [U, ["age", "smoker", "bmi", "diet"]]);
});

test("AC30 Table 3 top / bottom fall back to left / right (no third level); body alias (AC21, AC23)", () => {
  const cb = setup();
  for (const [edge, side, expected] of [
    ["top", "left", ["Temperature", "Hospitalization", "Mortality"]],
    ["top", "right", ["Hospitalization", "Temperature", "Mortality"]],
    ["bottom", "left", ["Temperature", "Hospitalization", "Mortality"]],
    ["bottom", "right", ["Hospitalization", "Temperature", "Mortality"]],
  ]) {
    const target = tagCell("g3", "Hospitalization", edge, side);
    const info = R.describe(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, target);
    assert.equal(info.edge, side, `${edge}/${side}`);
    assert.equal(info.hint, "join");
    assert.equal(info.name, "Outcome");
    assert.deepEqual(drop(cb, EMPTY, { groupId: "g2", tag: "Temperature" }, target).shown.at(-1), ["g3", expected]);
  }
  // Q7 kept: below a tag of A's own group = move beside it (layout only).
  const same = drop(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, tagCell("g3", "Hospitalization", "bottom", "left"));
  assert.equal(same.p.kind, "reorder");
  assert.deepEqual(same.shown.at(-1), ["g3", ["Mortality", "Hospitalization"]]);
});

test("AC30: a stale target (tag not in that block, unknown tag, unknown cell kind) does nothing", () => {
  const cb = setup();
  assert.equal(R.plan(cb, EMPTY, { groupId: U, tag: "age" }, tagCell("g2", "sex", "left")).kind, "none");
  assert.equal(R.plan(cb, EMPTY, { groupId: U, tag: "age" }, tagCell(U, "nope", "left")).kind, "none");
  assert.equal(R.plan(cb, EMPTY, { groupId: "g2", tag: "age" }, tagCell(U, "sex", "left")).kind, "none");
  assert.equal(R.plan(cb, EMPTY, { groupId: U, tag: "age" }, { cell: "title", edge: "left", side: "left" }).kind, "none");
  assert.equal(R.plan(null, EMPTY, { groupId: U, tag: "age" }, tagCell(U, "sex", "left")).kind, "none");
});

// ---------------------------------------------------------------------------------------
// Table 4: an "Ungrouped" run super-header
// ---------------------------------------------------------------------------------------

const TWO_RUNS = frozen({ topOrder: [{ tag: "age" }, { tag: "sex" }, { group: "g2" }, { tag: "smoker" }, { tag: "bmi" }, { tag: "diet" }, { group: "ungrouped" }, { group: "g3" }], tagOrder: {} });

test("AC30 Table 4: left = before the run's first tag; right / bottom = after its last; top falls back", () => {
  const cb = setup();
  const a = drop(cb, TWO_RUNS, { groupId: "g3", tag: "Mortality" }, runCell(1, "left"));
  assert.equal(a.p.kind, "regroup");
  assert.equal(a.p.effect, "ungrouped");
  assert.deepEqual(a.shown, [[U, ["age", "sex"]], ["g2", ["Heat index", "Temperature"]], [U, ["Mortality", "smoker", "bmi", "diet"]], ["g3", ["Hospitalization"]]]);
  for (const edge of ["right", "bottom"]) {
    const b = drop(cb, TWO_RUNS, { groupId: U, tag: "age" }, runCell(1, edge));
    assert.equal(b.p.kind, "reorder", edge);
    assert.deepEqual(b.shown, [[U, ["sex"]], ["g2", ["Heat index", "Temperature"]], [U, ["smoker", "bmi", "diet", "age"]], ["g3", ["Hospitalization", "Mortality"]]], edge);
    assert.equal(b.p.edge, edge);
  }
  const top = R.describe(cb, TWO_RUNS, { groupId: U, tag: "age" }, runCell(1, "top", "left"));
  assert.equal(top.edge, "left");
  assert.equal(top.hint, "reorder");
  // A run that holds only A: nothing. An unknown run: nothing.
  const solo = frozen({ topOrder: [{ tag: "age" }, { group: "g2" }, { group: "ungrouped" }], tagOrder: {} });
  assert.equal(R.describe(cb, solo, { groupId: U, tag: "age" }, runCell(0, "right")), null);
  assert.equal(R.plan(cb, solo, { groupId: U, tag: "age" }, runCell(0, "bottom")).kind, "none");
  assert.equal(R.plan(cb, TWO_RUNS, { groupId: U, tag: "age" }, runCell(7, "left")).kind, "none");
});

test("AC30 runs: an ungrouped tag dropped beside a tag of another run merges the runs (AC22)", () => {
  const layout = frozen({ topOrder: [{ tag: "diet" }, { group: "g2" }, { group: "g3" }, { tag: "Mortality" }], tagOrder: {} });
  const cb2 = book(
    [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }],
    [["Heat index", "g2"], ["Hospitalization", "g3"], ["diet", null], ["Mortality", null]],
  );
  const { p, shown } = drop(cb2, layout, { groupId: U, tag: "Mortality" }, tagCell(U, "diet", "right"));
  assert.equal(p.kind, "reorder");
  assert.deepEqual(shown, [[U, ["diet", "Mortality"]], ["g2", ["Heat index"]], ["g3", ["Hospitalization"]]]);
});

// ---------------------------------------------------------------------------------------
// layout.json results (A2.5), pruning, collisions, safety
// ---------------------------------------------------------------------------------------

test("AC30 A2.5: the home marker is copied through; stale saved entries never win; moved tags pruned", () => {
  const cb = setup();
  const layout = frozen({
    topOrder: [{ group: "g3" }, { tag: "gone" }, { group: "ungrouped" }, { group: "g2" }],
    tagOrder: { g2: ["Temperature", "sex"], g3: ["Temperature", "Mortality"], ungrouped: ["age"] },
  });
  // Temperature joins g3 before Hospitalization; the stale "Temperature" first in g3's
  // saved order does not win; it is pruned from g2's list.
  const { p, shown } = drop(cb, layout, { groupId: "g2", tag: "Temperature" }, tagCell("g3", "Hospitalization", "right"));
  assert.deepEqual(shown[0], ["g3", ["Mortality", "Hospitalization", "Temperature"]]);
  assert.deepEqual(plain(p.layout.tagOrder), { g2: ["sex"], g3: ["Mortality", "Hospitalization", "Temperature"] });
  assert.deepEqual(plain(p.layout.topOrder), [
    { group: "g3" }, { tag: "age" }, { tag: "sex" }, { tag: "smoker" }, { tag: "bmi" }, { tag: "diet" }, { group: "ungrouped" }, { group: "g2" },
  ]);
});

test("AC30 A2.5: nest prunes A and B from every group's tagOrder", () => {
  const cb = book(
    [{ id: "g2", name: "Exposure" }],
    [["Heat index", "g2"], ["age", null], ["sex", "g2"]],
  );
  const layout = frozen({ topOrder: [], tagOrder: { g2: ["sex", "age", "Heat index"] } });
  const { p, shown } = drop(cb, layout, { groupId: "g2", tag: "sex" }, tagCell(U, "age", "bottom"));
  assert.equal(p.effect, "created");
  // "age" (now the group name) and "sex" (moved) are gone from g2's saved order.
  assert.deepEqual(plain(p.layout.tagOrder), { g2: ["Heat index"], g5: ["sex"] });
  assert.deepEqual(shown, [["g5", ["sex"]], ["g2", ["Heat index"]]]);
});

test("AC30: a refused codebook edit is reported, not applied", () => {
  // A tag missing from the codebook only happens with stale data; simulate with a target
  // whose edit the codebook model refuses (tagToGroupName with an unknown child).
  const cb = setup();
  const orig = C.tagToGroupName;
  try {
    C.tagToGroupName = () => ({ ok: false, error: C.ERR_TAG_MISSING });
    assert.deepEqual(plain(R.plan(cb, EMPTY, { groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top"))), { kind: "refused", error: C.ERR_TAG_MISSING });
    assert.equal(R.describe(cb, EMPTY, { groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top")), null);
  } finally {
    C.tagToGroupName = orig;
  }
});

test("AC30: \"__proto__\" as a tag or group name stays an ordinary key", () => {
  const cb = book([{ id: "g2", name: "__proto__" }], [["x", "g2"], ["__proto__", null], ["y", null]]);
  const { p, shown } = drop(cb, EMPTY, { groupId: U, tag: "y" }, tagCell("g2", "x", "left"));
  assert.equal(p.kind, "regroup");
  assert.deepEqual(shown, [[U, ["__proto__"]], ["g2", ["y", "x"]]]);
  const nest = drop(cb, EMPTY, { groupId: U, tag: "y" }, tagCell(U, "__proto__", "bottom"));
  assert.equal(nest.p.effect, "joined", "reuses the group named __proto__");
  assert.deepEqual(nest.shown, [["g2", ["x", "y"]]]);
  assert.equal(Object.getPrototypeOf(nest.p.layout.tagOrder), Object.getPrototypeOf(L.emptyColumnLayout()));
});

test("AC30: inputs are never mutated (frozen inputs would throw)", () => {
  const cb = setup();
  const layout = TWO_RUNS;
  const targets = [
    [{ groupId: U, tag: "sex" }, tagCell(U, "age", "bottom")],
    [{ groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top")],
    [{ groupId: "g2", tag: "Temperature" }, tagCell(U, "diet", "left")],
    [{ groupId: "g2", tag: "Heat index" }, groupCell("g3", "bottom")],
    [{ groupId: "g3", tag: "Mortality" }, groupCell("g3", "right")],
    [{ groupId: "g2", tag: "Temperature" }, tagCell("g3", "Hospitalization", "top", "right")],
    [{ groupId: "g3", tag: "Mortality" }, runCell(1, "left")],
  ];
  for (const [drag, target] of targets) {
    R.plan(cb, layout, frozen(drag), frozen(target));
    R.describe(cb, layout, frozen(drag), frozen(target));
  }
  assert.deepEqual(plain(cb), plain(setup()));
});

// ---------------------------------------------------------------------------------------
// Keyboard (A2.9): each key is one drop through the same plan
// ---------------------------------------------------------------------------------------

test("AC30 keyboard: a grouped tag: Up leaves the group beside it, Down does nothing", () => {
  const cb = setup();
  assert.deepEqual(plain(R.keyboardTarget(cb, EMPTY, { groupId: "g3", tag: "Hospitalization" }, "up")),
    { cell: "group", groupId: "g3", edge: "left", side: "left" }, "first tag: before the group");
  assert.deepEqual(plain(R.keyboardTarget(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, "up")),
    { cell: "group", groupId: "g3", edge: "right", side: "right" }, "other tags: after the group");
  assert.equal(R.keyboardTarget(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, "down"), null);
  const { shown } = drop(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, R.keyboardTarget(cb, EMPTY, { groupId: "g3", tag: "Mortality" }, "up"));
  assert.deepEqual(shown.at(-1), [U, ["Mortality"]]);
});

test("AC30 keyboard: an ungrouped tag flips / nests with its left neighbour, or joins a group on its left", () => {
  const cb = setup();
  assert.deepEqual(plain(R.keyboardTarget(cb, EMPTY, { groupId: U, tag: "sex" }, "up")),
    { cell: "tag", groupId: U, tag: "age", edge: "top", side: "right" });
  assert.deepEqual(plain(R.keyboardTarget(cb, EMPTY, { groupId: U, tag: "sex" }, "down")),
    { cell: "tag", groupId: U, tag: "age", edge: "bottom", side: "right" });
  // First item: nothing.
  assert.equal(R.keyboardTarget(cb, EMPTY, { groupId: U, tag: "age" }, "up"), null);
  assert.equal(R.keyboardTarget(cb, EMPTY, { groupId: U, tag: "age" }, "down"), null);
  // Left neighbour is a group: Down joins it at its end, Up does nothing.
  assert.deepEqual(plain(R.keyboardTarget(cb, TWO_RUNS, { groupId: U, tag: "smoker" }, "down")),
    { cell: "group", groupId: "g2", edge: "bottom", side: "right" });
  assert.equal(R.keyboardTarget(cb, TWO_RUNS, { groupId: U, tag: "smoker" }, "up"), null);
  const flip = drop(cb, EMPTY, { groupId: U, tag: "sex" }, R.keyboardTarget(cb, EMPTY, { groupId: U, tag: "sex" }, "up"));
  assert.equal(flip.p.named, "above");
  assert.deepEqual(flip.shown[0], ["g5", ["age"]]);
  assert.equal(R.keyboardTarget(cb, EMPTY, { groupId: "g2", tag: "nope" }, "up"), null);
});
