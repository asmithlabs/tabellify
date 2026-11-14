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
    { kind: "regroup", hint: "new-group", effect: "created", name: "age", edge: "bottom", named: "below", revived: "" });
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
    { kind: "regroup", hint: "join", effect: "joined", name: "Outcome", edge: "bottom", named: null, revived: "" });
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

test("Amendment 3: the last tag leaving a group: the group turns back into a tag at its place", () => {
  // Was Q3 ("an emptied group stays as 'G · 0'"): the group then vanished from the table.
  // Owner, 2026-11-13 (option B): the group becomes an ungrouped tag with its name instead.
  const cb = book([{ id: "g2", name: "Solo" }, { id: "g3", name: "Pair" }], [["only", "g2"], ["p", "g3"], ["q", "g3"], ["age", null]]);
  const layout = frozen({ topOrder: [{ tag: "age" }, { group: "g2" }, { group: "g3" }], tagOrder: { g2: ["only"] } });
  const { p, shown, data } = drop(cb, layout, { groupId: "g2", tag: "only" }, groupCell("g2", "left"));
  assert.equal(p.kind, "regroup");
  assert.deepEqual(plain(p.revived), { groupId: "g2", tag: "Solo", added: true });
  assert.deepEqual(plain(C.groups(data)), [{ id: "g3", name: "Pair" }], "the group is gone");
  assert.deepEqual(plain(data.codebooks[0].tags.find((t) => t.name === "Solo")), { name: "Solo", group: null });
  // "only" lands left of where the group was; "Solo" takes the group's place.
  assert.deepEqual(shown, [[U, ["age", "only", "Solo"]], ["g3", ["p", "q"]]]);
  assert.equal(Object.hasOwn(p.layout.tagOrder, "g2"), false, "the group's tag order is pruned");
  assert.equal(R.describe(cb, layout, { groupId: "g2", tag: "only" }, groupCell("g2", "left")).revived, "Solo");
  // Joining another group: the emptied group's name stays where the group was.
  const join = drop(cb, layout, { groupId: "g2", tag: "only" }, groupCell("g3", "bottom"));
  assert.deepEqual(join.shown, [[U, ["age", "Solo"]], ["g3", ["p", "q", "only"]]]);
  // A tag with that exact name already in the codebook: the group is only removed.
  const cb2 = book([{ id: "g2", name: "Solo" }], [["only", "g2"], ["Solo", null], ["age", null]]);
  const again = drop(cb2, EMPTY, { groupId: "g2", tag: "only" }, tagCell(U, "age", "right"));
  assert.deepEqual(plain(again.p.revived), { groupId: "g2", tag: "Solo", added: false });
  assert.deepEqual(again.shown, [[U, ["Solo", "age", "only"]]]);
  assert.equal(again.data.codebooks[0].tags.filter((t) => t.name === "Solo").length, 1);
  // Inside its own group it is a no-op reorder (nothing changes).
  assert.equal(R.plan(cb, layout, { groupId: "g2", tag: "only" }, groupCell("g2", "bottom")).kind, "reorder");
  // Other drops report no revived group.
  assert.equal(R.plan(cb, layout, { groupId: "g3", tag: "p" }, groupCell("g3", "left")).revived, null);
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

// ---------------------------------------------------------------------------------------
// NOTHING DISAPPEARS (owner smoke test after the 006c merge, 2026-11-13: "the tags
// disappear when dragged to the western boundary. ... they should never disappear").
// Root cause: a nest or flip turns a tag into a group NAME; when that group's last (only)
// tag was then dragged out (e.g. to the left edge of the group's header), the group had
// 0 columns, so the table no longer showed it, and the tag that had become its name
// vanished from the table.
// ---------------------------------------------------------------------------------------

test("never disappears (repro): after a flip, the group's only tag leaving turns the group back into a tag", () => {
  // Flip: bmi becomes a group name over smoker (AC18).
  const flip = drop(setup(), EMPTY, { groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top"));
  assert.equal(flip.p.named, "above");
  const cb = frozen(flip.data);
  const layout = frozen(flip.p.layout);
  const drag = { groupId: "g5", tag: "smoker" };
  // The owner's case: the west (left) edge of the "bmi" header. bmi is a tag again, at the
  // group's place, with smoker right before it.
  const west = drop(cb, layout, drag, groupCell("g5", "left"));
  assert.deepEqual(plain(west.p.revived), { groupId: "g5", tag: "bmi", added: true });
  assert.deepEqual(west.shown.slice(0, 1), [[U, ["age", "sex", "smoker", "bmi", "diet"]]]);
  // Every other way out keeps "bmi" on screen too.
  const targets = [
    groupCell("g5", "top", "left"), groupCell("g5", "right"),
    tagCell(U, "age", "left"), tagCell(U, "diet", "left"), tagCell(U, "age", "bottom"), tagCell(U, "age", "top"),
    tagCell("g2", "Heat index", "left"), groupCell("g2", "left"), groupCell("g2", "bottom"),
    runCell(0, "left"), runCell(1, "left"),
    R.keyboardTarget(cb, layout, drag, "up"),
  ];
  for (const target of targets) {
    const { p, shown } = drop(cb, layout, drag, target);
    assert.equal(p.kind, "regroup", JSON.stringify(target));
    assert.equal(p.revived?.tag, "bmi", JSON.stringify(target));
    assert.ok(shown.some(([, tags]) => tags.includes("bmi")), `bmi is a column after ${JSON.stringify(target)}`);
  }
  // With a second tag in the group, smoker leaves and "bmi" stays a group over the other.
  const join = drop(cb, layout, { groupId: U, tag: "diet" }, groupCell("g5", "bottom"));
  const out = drop(join.data, join.p.layout, drag, groupCell("g5", "left"));
  assert.equal(out.p.revived, null);
  assert.deepEqual(out.shown.slice(0, 2), [[U, ["age", "sex", "smoker"]], ["g5", ["diet"]]]);
});

test("never disappears: hiddenBy names lost tags and groups; the nest / flip name tag is allowed", () => {
  const cb = setup();
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, cb, EMPTY)), []);
  const gone = C.removeTagFromCodebook(cb, "age").data;
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, gone, EMPTY)), [{ tag: "age" }]);
  // A name tag is allowed only when a group with that name (ignoring case) is shown.
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, gone, EMPTY, "age")), [{ tag: "age" }]);
  const named = C.tagToGroupName(cb, "age", "sex").data;
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, named, EMPTY, "age")), []);
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, named, EMPTY)), [{ tag: "age" }]);
  // A group that loses its last column is reported.
  const emptied = C.setTagGroup(C.setTagGroup(cb, "Heat index", null).data, "Temperature", null).data;
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, emptied, EMPTY)), [{ group: "g2" }]);
  // ... unless its name is a column after (Amendment 3: the group turned into a tag).
  const revived = C.groupToTag(emptied, "g2").data;
  assert.deepEqual(plain(R.hiddenBy(cb, EMPTY, revived, EMPTY)), []);
});

/**
 * Independent check (not R.hiddenBy): what disappeared between two table states. Every tag
 * of `tagsToKeep` must be a column after, or (only for `nameTag`, a nest / flip) have left
 * the codebook and be the name of a group shown after; every group shown before must still
 * be shown, as a group or (Amendment 3) as a tag column with its name.
 */
function disappeared(cbBefore, layoutBefore, cbAfter, layoutAfter, nameTag, tagsToKeep) {
  const shownBefore = L.orderedGroups(TM.codebookGroups(cbBefore), layoutBefore);
  const shown = L.orderedGroups(TM.codebookGroups(cbAfter), layoutAfter);
  const columns = shown.flatMap((g) => g.tags);
  const names = shown.filter((g) => !g.ungrouped).map((g) => g.name.toLowerCase());
  const inCodebook = new Set(cbAfter.codebooks[0].tags.map((t) => t.name));
  const out = [];
  for (const tag of tagsToKeep) {
    if (columns.includes(tag)) continue;
    if (!inCodebook.has(tag) && names.includes(tag.toLowerCase()) && (nameTag === undefined || tag === nameTag)) continue;
    out.push(`tag ${tag}`);
  }
  // Every group shown before: still a group (same name, ignoring case: a revived name may
  // become a group again later), or a tag column with its exact name (Amendment 3).
  for (const g of shownBefore) {
    if (g.ungrouped || names.includes(g.name.toLowerCase()) || columns.includes(g.name)) continue;
    out.push(`group ${g.name}`);
  }
  if (new Set(columns).size !== columns.length) out.push("a column shown twice");
  return out;
}

/** Codebooks with every kind of dragged tag and every kind of target. */
const NEVER_BOOKS = {
  setup: () => setup(),
  // A group with a single tag ("Solo"), a pair, ungrouped tags.
  solo: () => book([{ id: "g2", name: "Solo" }, { id: "g3", name: "Pair" }], [["x", "g2"], ["p1", "g3"], ["p2", "g3"], ["a", null], ["b", null]]),
  // The repro state: "bmi" became the group name over smoker (a flip).
  afterFlip: () => drop(setup(), EMPTY, { groupId: U, tag: "bmi" }, tagCell(U, "smoker", "top")).data,
  // Only ungrouped tags (one-row header), and only two of them.
  onlyUngrouped: () => book([], [["a", null], ["b", null], ["c", null]]),
  two: () => book([], [["a", null], ["b", null]]),
  // Group names like tags (reuse, Q2), an empty group ("Empty · 0") that has no column.
  sameName: () => book([{ id: "g2", name: "A" }, { id: "g3", name: "Empty" }, { id: "g4", name: "Country" }], [["x", "g2"], ["a", null], ["b", null], ["country", null]]),
  // A group whose name is also a tag (exact): emptying it only removes the group.
  exactName: () => book([{ id: "g2", name: "b" }, { id: "g3", name: "H" }], [["x", "g2"], ["y", "g3"], ["b", null], ["a", null]]),
  // Groups only (no ungrouped tags, so no run headers).
  groupsOnly: () => book([{ id: "g2", name: "G" }, { id: "g3", name: "H" }], [["x", "g2"], ["y", "g3"], ["z", "g3"]]),
};

/** Layouts: codebook order, reversed top level, groups first, the home marker last. */
function neverLayouts(cb) {
  const top = L.topItems(TM.codebookGroups(cb), null);
  const groupsFirst = [...top.filter((e) => Object.hasOwn(e, "group") && !L.isMarker(e)), ...top.filter((e) => Object.hasOwn(e, "tag")), { group: U }];
  return [EMPTY, { topOrder: [...top].reverse(), tagOrder: {} }, { topOrder: groupsFirst, tagOrder: {} }];
}

/** Every target cell shown in a state, with all four edges and both pointer halves. */
function allTargets(cb, layout) {
  const out = [];
  for (const g of L.orderedGroups(TM.codebookGroups(cb), layout)) {
    const cells = [g.ungrouped ? { cell: "run", groupId: U, run: g.run } : { cell: "group", groupId: g.id }];
    for (const tag of g.tags) cells.push({ cell: "tag", groupId: g.id, tag });
    for (const c of cells) for (const edge of ["left", "right", "top", "bottom"]) for (const side of ["left", "right"]) out.push({ ...c, edge, side });
  }
  return out;
}

/**
 * Every change a user can make from a state, as { label, codebook, layout, nameTag }:
 * mouse drops of every tag on every target (all edges), Alt+Up / Alt+Down (through
 * keyboardTarget and plan), Alt+Left / Alt+Right on tag and group grips, and whole-group
 * drops beside every top-level item. Refused or empty plans change nothing.
 */
function allMoves(cb, layout) {
  const out = [];
  const groups = TM.codebookGroups(cb);
  const fromPlan = (label, drag, target) => {
    const p = R.plan(cb, layout, drag, target);
    if (p.kind === "regroup") out.push({ label, codebook: p.edit.data, layout: p.layout, nameTag: p.named === "below" ? target.tag : p.named === "above" ? drag.tag : null, p });
    else if (p.kind === "reorder") out.push({ label, codebook: cb, layout: p.layout, nameTag: null, p });
    else out.push({ label, codebook: cb, layout, nameTag: null, p });
  };
  const targets = allTargets(cb, layout);
  for (const g of groups) {
    for (const tag of g.tags) {
      const drag = { groupId: g.id, tag };
      for (const target of targets) fromPlan(`drop ${JSON.stringify(drag)} on ${JSON.stringify(target)}`, drag, target);
      for (const dir of ["up", "down"]) {
        const target = R.keyboardTarget(cb, layout, drag, dir);
        if (target) fromPlan(`Alt+${dir} on ${JSON.stringify(drag)}`, drag, target);
      }
      for (const delta of [-1, 1]) {
        const next = g.ungrouped ? L.moveTopItemBy(layout, groups, { tag }, delta) : L.moveTagBy(layout, groups, g.id, tag, delta);
        out.push({ label: `Alt+${delta} on ${JSON.stringify(drag)}`, codebook: cb, layout: next, nameTag: null });
      }
    }
  }
  for (const g of groups.filter((x) => !x.ungrouped)) {
    for (const delta of [-1, 1]) out.push({ label: `Alt+${delta} on group ${g.id}`, codebook: cb, layout: L.moveTopItemBy(layout, groups, { group: g.id }, delta), nameTag: null });
    for (const ref of L.visibleTopItems(groups, layout)) {
      for (const side of ["before", "after"]) out.push({ label: `group ${g.id} ${side} ${JSON.stringify(ref)}`, codebook: cb, layout: L.placeTopItem(layout, groups, { group: g.id }, ref, side), nameTag: null });
    }
  }
  return out;
}

test("never disappears (exhaustive): every source × target × edge × side, and every key", () => {
  const seen = { sources: new Set(), targets: new Set(), revived: 0, named: 0 };
  for (const [name, make] of Object.entries(NEVER_BOOKS)) {
    const cb = frozen(make());
    for (const layout of neverLayouts(cb).map(frozen)) {
      const tags = TM.codebookGroups(cb).flatMap((g) => g.tags);
      for (const m of allMoves(cb, layout)) {
        const lost = disappeared(cb, layout, m.codebook, m.layout, m.nameTag ?? null, tags);
        assert.deepEqual(lost, [], `${name}: ${m.label} made something disappear`);
        assert.notEqual(m.p?.kind, "refused", `${name}: ${m.label} was refused`);
        if (m.p?.revived) seen.revived++;
        if (m.p?.named) seen.named++;
      }
      // Kinds covered (so the loop is not vacuous).
      for (const g of TM.codebookGroups(cb)) {
        for (const t of g.tags) seen.sources.add(g.ungrouped ? "ungrouped" : g.tags.length === 1 ? "sole tag of a group" : "grouped");
      }
      const shown = L.orderedGroups(TM.codebookGroups(cb), layout);
      shown.forEach((g, i) => {
        seen.targets.add(g.ungrouped ? "run header" : "group header");
        if (i === 0) seen.targets.add("first tag column (next to Title)");
        if (!g.ungrouped) seen.targets.add("leftmost column of a group");
        for (const t of g.tags) seen.targets.add(g.ungrouped ? "ungrouped tag" : "tag inside a group");
      });
    }
  }
  assert.deepEqual([...seen.sources].sort(), ["grouped", "sole tag of a group", "ungrouped"]);
  assert.deepEqual([...seen.targets].sort(), [
    "first tag column (next to Title)", "group header", "leftmost column of a group", "run header", "tag inside a group", "ungrouped tag",
  ]);
  assert.ok(seen.revived > 0, "some drops emptied a group (it became a tag)");
  assert.ok(seen.named > 0, "some nests / flips happened");
});

test("never disappears (two steps): every tag and group of the start is still a column or a shown group", () => {
  // Two changes in a row (e.g. a flip, then a drop of the new group's only tag to the
  // west): the original tags must all still be on screen.
  const start = frozen(book([{ id: "g2", name: "Exposure" }, { id: "g3", name: "Solo" }], [["Heat", "g2"], ["Temp", "g2"], ["x", "g3"], ["a", null], ["b", null]]));
  const original = TM.codebookGroups(start).flatMap((g) => g.tags);
  const states = new Map();
  for (const m of allMoves(start, EMPTY)) {
    states.set(JSON.stringify([m.codebook, L.orderedGroups(TM.codebookGroups(m.codebook), m.layout)]), m);
  }
  assert.ok(states.size > 20, `enough distinct first steps (${states.size})`);
  let checked = 0;
  for (const first of states.values()) {
    for (const m of allMoves(frozen(first.codebook), frozen(first.layout))) {
      const lost = disappeared(start, EMPTY, m.codebook, m.layout, undefined, original);
      assert.deepEqual(lost, [], `${first.label}, then ${m.label}`);
      checked++;
    }
  }
  assert.ok(checked > 1000, `checked ${checked}`);
});
