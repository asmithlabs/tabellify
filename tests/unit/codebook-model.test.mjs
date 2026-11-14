// Feature 004 AC8/AC9 and Feature 006a AC13: unit tests for the pure codebook model
// (src/content/codebook-model.js), schema version 2 (ADR-0016) with version 1 migration.
//
// codebook-model.js is a classic browser script (no import/export). Node runs it here in an
// empty node:vm sandbox (as in workspace-helpers.test.mjs); its one global,
// `TabellifyCodebook`, appears as a property of the sandbox. The sandbox has no Zotero,
// window, document, IOUtils or PathUtils, so loading it proves the model needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "codebook-model.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const M = sandbox.TabellifyCodebook;

// Objects made inside the sandbox have different prototypes; compare as plain JSON values.
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Apply an edit that must succeed and return the new data. */
function ok(result) {
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}

/** Version 1 fixture: Exposure (g2: Heat index, Temperature), Outcome (g3: Hospitalization). */
function sampleV1() {
  return {
    schemaVersion: 1,
    revision: 7,
    nextId: 5,
    codebooks: [
      {
        id: "c1",
        name: "Codebook",
        groups: [
          { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
          { id: "g3", name: "Outcome", tags: ["Hospitalization"] },
        ],
      },
    ],
  };
}

/** The same codebook in version 2, plus one ungrouped tag `age`. */
function sample() {
  return {
    schemaVersion: 2,
    revision: 7,
    nextId: 5,
    codebooks: [
      {
        id: "c1",
        name: "Codebook",
        groups: [
          { id: "g2", name: "Exposure" },
          { id: "g3", name: "Outcome" },
        ],
        tags: [
          { name: "Heat index", group: "g2" },
          { name: "Temperature", group: "g2" },
          { name: "Hospitalization", group: "g3" },
          { name: "age", group: null },
        ],
      },
    ],
  };
}

/** A v2 data object with one codebook built from groups/tags. */
function v2(groups, tags, nextId = 9) {
  return { schemaVersion: 2, revision: 1, nextId, codebooks: [{ id: "c1", name: "C", groups, tags }] };
}

const names = (data) => plain(M.groups(data)).map((g) => g.name);
const tagList = (data) => plain(data.codebooks[0].tags);

// ---------------------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------------------

test("the file defines TabellifyCodebook without Zotero/DOM/IOUtils", () => {
  assert.equal(typeof M, "object");
  assert.equal(M.SCHEMA_VERSION, 2);
  assert.equal(M.UNGROUPED_ID, "ungrouped");
  for (const fn of ["emptyData", "validate", "migrate", "groups", "tagsIn", "addGroup", "renameGroup",
    "deleteGroup", "removeTagFromCodebook", "setTagGroup", "applyScript", "availableTags"]) {
    assert.equal(typeof M[fn], "function", fn);
  }
  // Replaced by the v2 edits (ADR-0016).
  assert.equal(M.addTagToGroup, undefined);
  assert.equal(M.removeTagFromGroup, undefined);
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const g of ["Zotero", "IOUtils", "PathUtils", "document", "window"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${g}\\b`), `${g} used in the pure model`);
  }
});

test("AC13: emptyData is valid v2, one codebook with no groups, no tags, revision 0", () => {
  const d = M.emptyData();
  assert.deepEqual(plain(M.validate(d)), { ok: true });
  assert.equal(d.schemaVersion, 2);
  assert.equal(d.revision, 0);
  assert.equal(d.codebooks.length, 1);
  assert.deepEqual(plain(M.groups(d)), []);
  assert.deepEqual(plain(d.codebooks[0].tags), []);
  // A fresh object each time (callers may keep it).
  assert.notEqual(M.emptyData(), M.emptyData());
});

test("AC13: groups() returns { id, name } in order; tagsIn() per group and for null", () => {
  const d = sample();
  assert.deepEqual(plain(M.groups(d)), [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }]);
  assert.deepEqual(plain(M.tagsIn(d, "g2")), ["Heat index", "Temperature"]);
  assert.deepEqual(plain(M.tagsIn(d, "g3")), ["Hospitalization"]);
  assert.deepEqual(plain(M.tagsIn(d, null)), ["age"]);
  assert.deepEqual(plain(M.tagsIn(d, "g99")), []);
});

// ---------------------------------------------------------------------------------------
// Group edits
// ---------------------------------------------------------------------------------------

test("addGroup appends with an id from nextId, trims, keeps order", () => {
  let d = M.emptyData();
  d = ok(M.addGroup(d, "  Exposure "));
  d = ok(M.addGroup(d, "Outcome"));
  assert.deepEqual(plain(M.groups(d)), [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }]);
  assert.equal(d.nextId, 4);
  assert.deepEqual(plain(M.validate(d)), { ok: true });
});

test("addGroup rejects empty and duplicate (ignoring case) names", () => {
  const d = sample();
  for (const bad of ["", "   ", undefined, null]) {
    assert.deepEqual(plain(M.addGroup(d, bad)), { ok: false, error: M.ERR_GROUP_EMPTY }, String(bad));
  }
  assert.deepEqual(plain(M.addGroup(d, "exposure")), { ok: false, error: M.ERR_GROUP_DUPLICATE });
  assert.deepEqual(plain(M.addGroup(d, " OUTCOME ")), { ok: false, error: M.ERR_GROUP_DUPLICATE });
});

test("ids keep counting after a delete (never reused)", () => {
  let d = M.emptyData();
  d = ok(M.addGroup(d, "A"));
  d = ok(M.deleteGroup(d, "g2"));
  d = ok(M.addGroup(d, "B"));
  assert.deepEqual(plain(M.groups(d)).map((g) => g.id), ["g3"]);
});

test("renameGroup trims, keeps id/tags/position, allows a case-only change", () => {
  let d = sample();
  d = ok(M.renameGroup(d, "g3", "  Health outcome "));
  assert.deepEqual(names(d), ["Exposure", "Health outcome"]);
  assert.deepEqual(plain(M.tagsIn(d, "g3")), ["Hospitalization"]);
  d = ok(M.renameGroup(d, "g2", "EXPOSURE"));
  assert.deepEqual(names(d), ["EXPOSURE", "Health outcome"]);
});

test("renameGroup rejects empty, duplicate and unknown group", () => {
  const d = sample();
  assert.deepEqual(plain(M.renameGroup(d, "g3", " ")), { ok: false, error: M.ERR_GROUP_EMPTY });
  assert.deepEqual(plain(M.renameGroup(d, "g3", "exposure")), { ok: false, error: M.ERR_GROUP_DUPLICATE });
  assert.deepEqual(plain(M.renameGroup(d, "g99", "X")), { ok: false, error: M.ERR_GROUP_MISSING });
});

test("AC13: deleteGroup removes the group; its tags become ungrouped in place (Q4)", () => {
  let d = sample();
  d = ok(M.deleteGroup(d, "g2"));
  assert.deepEqual(names(d), ["Outcome"]);
  assert.deepEqual(tagList(d), [
    { name: "Heat index", group: null },
    { name: "Temperature", group: null },
    { name: "Hospitalization", group: "g3" },
    { name: "age", group: null },
  ]);
  assert.deepEqual(plain(M.validate(d)), { ok: true });
  assert.deepEqual(plain(M.deleteGroup(d, "g2")), { ok: false, error: M.ERR_GROUP_MISSING });
});

// ---------------------------------------------------------------------------------------
// Tag edits
// ---------------------------------------------------------------------------------------

test("AC13: removeTagFromCodebook removes exactly that tag; unknown tag refused", () => {
  let d = sample();
  d = ok(M.removeTagFromCodebook(d, "Heat index"));
  assert.deepEqual(plain(M.tagsIn(d, "g2")), ["Temperature"]);
  d = ok(M.removeTagFromCodebook(d, "age"));
  assert.deepEqual(plain(M.tagsIn(d, null)), []);
  assert.deepEqual(plain(M.removeTagFromCodebook(d, "Heat index")), { ok: false, error: M.ERR_TAG_MISSING });
  // Exact match only (case-sensitive, as Zotero).
  assert.deepEqual(plain(M.removeTagFromCodebook(d, "temperature")), { ok: false, error: M.ERR_TAG_MISSING });
});

test("AC13: setTagGroup moves to a group (end of list), to null, and refuses unknowns", () => {
  let d = sample();
  d = ok(M.setTagGroup(d, "Heat index", "g3"));
  assert.deepEqual(plain(M.tagsIn(d, "g3")), ["Hospitalization", "Heat index"]);
  assert.deepEqual(plain(M.tagsIn(d, "g2")), ["Temperature"]);
  d = ok(M.setTagGroup(d, "Hospitalization", null));
  assert.deepEqual(plain(M.tagsIn(d, null)), ["age", "Hospitalization"]);
  // Same group: unchanged position.
  const same = ok(M.setTagGroup(sample(), "Heat index", "g2"));
  assert.deepEqual(tagList(same), tagList(sample()));
  assert.deepEqual(plain(M.setTagGroup(d, "nope", "g2")), { ok: false, error: M.ERR_TAG_MISSING });
  assert.deepEqual(plain(M.setTagGroup(d, "age", "g99")), { ok: false, error: M.ERR_GROUP_MISSING });
  assert.deepEqual(plain(M.validate(d)), { ok: true });
});

// ---------------------------------------------------------------------------------------
// groupUnderTag (Feature 006c AC12): a tag column dropped below another tag column
// ---------------------------------------------------------------------------------------

/** Deep-freeze an input: any mutation by the model throws (the model runs in strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

test("006c AC12: groupUnderTag with the anchor in a group joins that group", () => {
  const r = M.groupUnderTag(frozen(sample()), "age", "Hospitalization");
  assert.equal(r.ok, true);
  assert.equal(r.groupId, "g3");
  assert.equal(r.created, false);
  assert.equal(r.anchorRemoved, false, "an anchor in a group is never removed");
  assert.deepEqual(plain(M.tagsIn(r.data, "g3")), ["Hospitalization", "age"]);
  assert.deepEqual(plain(M.tagsIn(r.data, null)), []);
  assert.equal(r.data.nextId, 5, "no new id");
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
});

test("006c AC12 (amended): an ungrouped anchor becomes only a group name; the tag joins it", () => {
  const d = frozen(v2([{ id: "g2", name: "Exposure" }], [
    { name: "Heat index", group: "g2" },
    { name: "sex", group: null },
    { name: "age", group: null },
  ], 5));
  const r = M.groupUnderTag(d, "sex", "age");
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(r.groupId, "g5", "id from nextId");
  assert.equal(r.data.nextId, 6, "nextId + 1");
  assert.equal(r.anchorRemoved, true);
  assert.deepEqual(plain(M.groups(r.data)), [{ id: "g2", name: "Exposure" }, { id: "g5", name: "age" }]);
  // The TAG `age` is gone from the codebook (no column); `sex` is the group's only tag.
  assert.deepEqual(plain(M.tagsIn(r.data, "g5")), ["sex"]);
  assert.equal(M.findTag(r.data, "age"), undefined);
  assert.deepEqual(plain(M.tagsIn(r.data, null)), []);
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
});

test("006c AC12: groupUnderTag reuses a group with the same name in another case (Q2)", () => {
  const d = frozen(v2([{ id: "g2", name: "Country" }], [
    { name: "country", group: null },
    { name: "region", group: null },
  ], 3));
  const r = M.groupUnderTag(d, "region", "country");
  assert.equal(r.ok, true);
  assert.equal(r.created, false);
  assert.equal(r.groupId, "g2");
  assert.equal(r.data.nextId, 3, "no new id");
  assert.deepEqual(plain(M.groups(r.data)), [{ id: "g2", name: "Country" }], "stored spelling kept, no second group");
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["region"], "tag country removed");
  assert.equal(r.anchorRemoved, true);
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
});

test("006c AC12: groupUnderTag when the tag is already in that group changes nothing", () => {
  const r = M.groupUnderTag(frozen(sample()), "Temperature", "Heat index");
  assert.equal(r.ok, true);
  assert.equal(r.groupId, "g2");
  assert.deepEqual(tagList(r.data), tagList(sample()));
  // Reused group that already holds the dragged tag: only the anchor tag is removed.
  const d = frozen(v2([{ id: "g2", name: "Country" }], [
    { name: "region", group: "g2" },
    { name: "country", group: null },
  ], 3));
  const r2 = M.groupUnderTag(d, "region", "country");
  assert.equal(r2.ok, true);
  assert.deepEqual(plain(M.tagsIn(r2.data, "g2")), ["region"]);
  assert.deepEqual(plain(M.tagsIn(r2.data, null)), []);
  assert.deepEqual(plain(M.validate(r2.data)), { ok: true });
});

test("006c AC12: groupUnderTag refuses a missing tag, a missing anchor and tag = anchor", () => {
  const d = frozen(sample());
  const refused = { ok: false, error: M.ERR_TAG_MISSING };
  assert.deepEqual(plain(M.groupUnderTag(d, "nope", "age")), refused);
  assert.deepEqual(plain(M.groupUnderTag(d, "age", "nope")), refused);
  assert.deepEqual(plain(M.groupUnderTag(d, "age", "age")), refused);
  assert.deepEqual(plain(M.groupUnderTag(d, "Heat index", "Heat index")), refused);
  assert.deepEqual(plain(d), sample(), "input not mutated");
});

test("006c AC12: groupUnderTag keeps \"__proto__\" an ordinary tag and group name", () => {
  const d = frozen(v2([], [
    { name: "__proto__", group: null },
    { name: "x", group: null },
  ], 2));
  const r = M.groupUnderTag(d, "x", "__proto__");
  assert.equal(r.ok, true);
  assert.deepEqual(plain(M.groups(r.data)), [{ id: "g2", name: "__proto__" }]);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["x"]);
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
});

// ---------------------------------------------------------------------------------------
// tagToGroupName (Feature 006c Amendment 2, AC29): a tag becomes a group name
// ---------------------------------------------------------------------------------------

/** Setup of the spec's smoke test: two groups and five ungrouped tags. */
function setup() {
  return v2([{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }], [
    { name: "Heat index", group: "g2" },
    { name: "Temperature", group: "g2" },
    { name: "Hospitalization", group: "g3" },
    { name: "Mortality", group: "g3" },
    { name: "age", group: null },
    { name: "sex", group: null },
    { name: "smoker", group: null },
    { name: "bmi", group: null },
  ], 4);
}

test("AC29: tagToGroupName makes a new group named exactly like the tag; the tag leaves the codebook", () => {
  const d = frozen(setup());
  // Flip: bmi (the dragged tag) becomes the name, smoker goes under it.
  const r = M.tagToGroupName(d, "bmi", "smoker");
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(r.groupId, "g4", "id from nextId");
  assert.equal(r.data.nextId, 5, "nextId + 1");
  assert.deepEqual(plain(M.groups(r.data)).at(-1), { id: "g4", name: "bmi" });
  assert.equal(M.findTag(r.data, "bmi"), undefined, "the name tag is gone from the codebook");
  assert.deepEqual(plain(M.tagsIn(r.data, "g4")), ["smoker"]);
  assert.deepEqual(plain(M.tagsIn(r.data, null)), ["age", "sex"]);
  assert.equal(tagList(r.data).at(-1).name, "smoker", "the child moved to the end of the list");
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
  assert.deepEqual(plain(d), setup(), "input not mutated");
});

test("AC29: tagToGroupName removes a grouped name tag too, and moves a grouped child", () => {
  const r = M.tagToGroupName(frozen(setup()), "Temperature", "Mortality");
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(M.findTag(r.data, "Temperature"), undefined);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["Heat index"]);
  assert.deepEqual(plain(M.tagsIn(r.data, "g3")), ["Hospitalization"]);
  assert.deepEqual(plain(M.tagsIn(r.data, r.groupId)), ["Mortality"]);
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
});

test("AC29: tagToGroupName reuses a group with that name ignoring case (incl. the name tag's own group)", () => {
  // Another group named like the tag: reused, stored spelling kept, no new id.
  const d = frozen(v2([{ id: "g2", name: "Country" }], [
    { name: "country", group: null },
    { name: "region", group: null },
  ], 3));
  const r = M.tagToGroupName(d, "country", "region");
  assert.equal(r.created, false);
  assert.equal(r.groupId, "g2");
  assert.equal(r.data.nextId, 3);
  assert.deepEqual(plain(M.groups(r.data)), [{ id: "g2", name: "Country" }]);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["region"]);
  // The name tag sits in the group of the same name: that group is reused and loses it.
  const own = frozen(v2([{ id: "g2", name: "Diet" }], [
    { name: "diet", group: "g2" },
    { name: "fibre", group: "g2" },
    { name: "salt", group: null },
  ], 3));
  const r2 = M.tagToGroupName(own, "diet", "salt");
  assert.equal(r2.created, false);
  assert.equal(r2.groupId, "g2");
  assert.deepEqual(plain(M.tagsIn(r2.data, "g2")), ["fibre", "salt"]);
  assert.deepEqual(plain(M.validate(r2.data)), { ok: true });
});

test("AC29: tagToGroupName leaves a child already in that group where it is", () => {
  const d = frozen(v2([{ id: "g2", name: "Diet" }], [
    { name: "salt", group: "g2" },
    { name: "fibre", group: "g2" },
    { name: "diet", group: null },
  ], 3));
  const r = M.tagToGroupName(d, "diet", "salt");
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["salt", "fibre"]);
});

test("AC29: tagToGroupName refuses missing tags and equal tags; input not mutated", () => {
  const d = frozen(setup());
  const refused = { ok: false, error: M.ERR_TAG_MISSING };
  assert.deepEqual(plain(M.tagToGroupName(d, "nope", "age")), refused);
  assert.deepEqual(plain(M.tagToGroupName(d, "age", "nope")), refused);
  assert.deepEqual(plain(M.tagToGroupName(d, "age", "age")), refused);
  assert.deepEqual(plain(d), setup());
});

// ---------------------------------------------------------------------------------------
// applyScript (Feature 006a)
// ---------------------------------------------------------------------------------------

test("AC13: applyScript adds ungrouped tags and a new group with ids from nextId", () => {
  const r = M.applyScript(M.emptyData(), [
    { kind: "tag", name: "age" },
    { kind: "group", name: "Humidity", tags: ["rh", "dew point"] },
    { kind: "tag", name: "sex" },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.report), { added: 4, moved: 0, unchanged: 0, groupsCreated: 1 });
  assert.deepEqual(plain(M.groups(r.data)), [{ id: "g2", name: "Humidity" }]);
  assert.equal(r.data.nextId, 3);
  assert.deepEqual(tagList(r.data), [
    { name: "age", group: null },
    { name: "rh", group: "g2" },
    { name: "dew point", group: "g2" },
    { name: "sex", group: null },
  ]);
  assert.deepEqual(plain(M.validate(r.data)), { ok: true });
});

test("AC13: applyScript reuses a group ignoring case (keeps its spelling), moves, leaves unchanged", () => {
  // Spec AC5: Exposure(Heat index, Air quality), country, Outcome(age)
  const r = M.applyScript(sample(), [
    { kind: "group", name: "exposure", tags: ["Heat index", "Air quality"] },
    { kind: "tag", name: "country" },
    { kind: "group", name: "Outcome", tags: ["age"] },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.report), { added: 2, moved: 1, unchanged: 1, groupsCreated: 0 });
  assert.deepEqual(names(r.data), ["Exposure", "Outcome"]);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["Heat index", "Temperature", "Air quality"]);
  // age moved to the end of Outcome.
  assert.deepEqual(plain(M.tagsIn(r.data, "g3")), ["Hospitalization", "age"]);
  assert.deepEqual(plain(M.tagsIn(r.data, null)), ["country"]);
  assert.equal(r.data.nextId, 5);
});

test("AC13: applyScript moves a grouped tag to ungrouped for a top-level mention (Q3)", () => {
  const r = M.applyScript(sample(), [{ kind: "tag", name: "Heat index" }]);
  assert.deepEqual(plain(r.report), { added: 0, moved: 1, unchanged: 0, groupsCreated: 0 });
  assert.deepEqual(plain(M.tagsIn(r.data, null)), ["age", "Heat index"]);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["Temperature"]);
});

test("AC13: applyScript with nothing new reports only unchanged and returns equal data", () => {
  const r = M.applyScript(sample(), [{ kind: "tag", name: "age" }, { kind: "group", name: "Exposure", tags: ["Temperature"] }]);
  assert.deepEqual(plain(r.report), { added: 0, moved: 0, unchanged: 2, groupsCreated: 0 });
  assert.deepEqual(plain(r.data), sample());
});

test("AC13: applyScript empty group creates it once; same group twice merges", () => {
  let r = M.applyScript(sample(), [{ kind: "group", name: "Planned", tags: [] }]);
  assert.deepEqual(plain(r.report), { added: 0, moved: 0, unchanged: 0, groupsCreated: 1 });
  assert.deepEqual(names(r.data), ["Exposure", "Outcome", "Planned"]);
  r = M.applyScript(M.emptyData(), [
    { kind: "group", name: "A", tags: ["x"] },
    { kind: "group", name: "a", tags: ["y"] },
  ]);
  assert.deepEqual(plain(M.groups(r.data)), [{ id: "g2", name: "A" }]);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), ["x", "y"]);
  assert.equal(r.report.groupsCreated, 1);
});

test("AC13: applyScript cleans names (trim + NFC), case-sensitive like Zotero", () => {
  const decomposed = "é"; // "é" as e + combining accent
  const r = M.applyScript(M.emptyData(), [
    { kind: "tag", name: `  ${decomposed}  ` },
    { kind: "tag", name: "Heat" },
    { kind: "tag", name: "heat" },
  ]);
  assert.deepEqual(plain(M.tagsIn(r.data, null)), ["é", "Heat", "heat"]);
});

test("AC13: applyScript refuses empty names and duplicates in one entry, changing nothing", () => {
  const d = sample();
  const before = JSON.stringify(d);
  assert.deepEqual(plain(M.applyScript(d, [{ kind: "tag", name: " " }])), { ok: false, error: M.ERR_TAG_EMPTY });
  assert.deepEqual(plain(M.applyScript(d, [{ kind: "group", name: "", tags: ["x"] }])), { ok: false, error: M.ERR_GROUP_EMPTY });
  assert.deepEqual(plain(M.applyScript(d, [{ kind: "group", name: "G", tags: ["x", ""] }])), { ok: false, error: M.ERR_TAG_EMPTY });
  assert.deepEqual(
    plain(M.applyScript(d, [{ kind: "group", name: "A", tags: ["x"] }, { kind: "group", name: "B", tags: ["x"] }])),
    { ok: false, error: M.ERR_TAG_DUPLICATE },
  );
  assert.deepEqual(plain(M.applyScript(d, [{ kind: "tag", name: "x" }, { kind: "tag", name: " x" }])), { ok: false, error: M.ERR_TAG_DUPLICATE });
  assert.equal(JSON.stringify(d), before);
});

test("AC13: markup in names stays literal text", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const r = M.applyScript(M.emptyData(), [{ kind: "group", name: evil, tags: [evil] }]);
  assert.equal(M.groups(r.data)[0].name, evil);
  assert.deepEqual(plain(M.tagsIn(r.data, "g2")), [evil]);
});

test("AC13: edits never mutate their input (they return new data) and keep revision", () => {
  const d = sample();
  const before = JSON.stringify(d);
  ok(M.addGroup(d, "New"));
  ok(M.renameGroup(d, "g2", "Renamed"));
  ok(M.deleteGroup(d, "g3"));
  ok(M.removeTagFromCodebook(d, "Temperature"));
  ok(M.setTagGroup(d, "age", "g2"));
  M.applyScript(d, [{ kind: "group", name: "Outcome", tags: ["Heat index", "z"] }, { kind: "tag", name: "Temperature" }]);
  M.availableTags(d, ["x", "Temperature"]);
  M.migrate(d);
  M.migrate(sampleV1());
  assert.equal(JSON.stringify(d), before);
  const r = M.addGroup(d, "New");
  assert.notEqual(r.data, d);
  assert.notEqual(r.data.codebooks, d.codebooks);
  assert.equal(r.data.revision, 7);
});

test("availableTags — once each, sorted, minus codebook tags and blanks", () => {
  const out = M.availableTags(sample(), [
    "zeta", "Temperature", "alpha", "Tag 10", "Tag 2", "alpha", "  ", "", "Heat index", "heat index", "Beta", "age",
  ]);
  assert.deepEqual(plain(out), ["alpha", "Beta", "heat index", "Tag 2", "Tag 10", "zeta"]);
  assert.deepEqual(plain(M.availableTags(M.emptyData(), [])), []);
});

// ---------------------------------------------------------------------------------------
// Validation and versions
// ---------------------------------------------------------------------------------------

test("AC13: valid v1 and v2 files pass", () => {
  assert.deepEqual(plain(M.validate(sampleV1())), { ok: true });
  assert.deepEqual(plain(M.validate(sample())), { ok: true });
  // A group with no tags, extra fields on a tag record: allowed.
  assert.deepEqual(plain(M.validate(v2([{ id: "g2", name: "A" }], [{ name: "x", group: null, note: "later" }]))), { ok: true });
  // A group name may equal a tag name (different lists).
  assert.deepEqual(plain(M.validate(v2([{ id: "g2", name: "x" }], [{ name: "x", group: "g2" }]))), { ok: true });
});

test("schemaVersion missing is rejected (no v0 exists)", () => {
  const d = sample();
  delete d.schemaVersion;
  const r = M.validate(d);
  assert.equal(r.ok, false);
  assert.equal(r.newer, undefined);
  assert.match(r.reason, /schemaVersion/);
});

test("AC13: schemaVersion 3 is reported as newer", () => {
  const r = M.validate({ ...sample(), schemaVersion: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
  assert.match(r.reason, /newer/);
  // Even when the rest of the file is a shape this version does not know.
  assert.equal(M.validate({ schemaVersion: 5, whatever: true }).newer, true);
});

test("version 1 files: wrong types and missing fields are rejected with a reason", () => {
  const cb = (groups) => ({ ...sampleV1(), codebooks: [{ id: "c1", name: "C", groups }] });
  const cases = {
    "not an object (null)": null,
    "not an object (array)": [],
    "not an object (string)": "not json",
    "schemaVersion 0": { ...sampleV1(), schemaVersion: 0 },
    "schemaVersion string": { ...sampleV1(), schemaVersion: "1" },
    "schemaVersion 1.5": { ...sampleV1(), schemaVersion: 1.5 },
    "revision missing": (() => { const d = sampleV1(); delete d.revision; return d; })(),
    "revision negative": { ...sampleV1(), revision: -1 },
    "nextId missing": (() => { const d = sampleV1(); delete d.nextId; return d; })(),
    "nextId string": { ...sampleV1(), nextId: "5" },
    "codebooks missing": (() => { const d = sampleV1(); delete d.codebooks; return d; })(),
    "codebooks not array": { ...sampleV1(), codebooks: {} },
    "codebooks empty": { ...sampleV1(), codebooks: [] },
    "codebook not object": { ...sampleV1(), codebooks: ["c1"] },
    "codebook bad id": { ...sampleV1(), codebooks: [{ id: "x", name: "C", groups: [] }] },
    "codebook name missing": { ...sampleV1(), codebooks: [{ id: "c1", groups: [] }] },
    "groups missing": { ...sampleV1(), codebooks: [{ id: "c1", name: "C" }] },
    "group not object": cb([null]),
    "group id wrong prefix": cb([{ id: "c2", name: "A", tags: [] }]),
    "group id >= nextId": cb([{ id: "g5", name: "A", tags: [] }]),
    "group id twice": cb([{ id: "g2", name: "A", tags: [] }, { id: "g2", name: "B", tags: [] }]),
    "group name number": cb([{ id: "g2", name: 3, tags: [] }]),
    "group name empty": cb([{ id: "g2", name: " ", tags: [] }]),
    "group name untrimmed": cb([{ id: "g2", name: " A", tags: [] }]),
    "group names duplicate ignoring case": cb([{ id: "g2", name: "A", tags: [] }, { id: "g3", name: "a", tags: [] }]),
    "tags missing": cb([{ id: "g2", name: "A" }]),
    "tag not a string": cb([{ id: "g2", name: "A", tags: [42] }]),
    "tag empty": cb([{ id: "g2", name: "A", tags: [""] }]),
    "tag untrimmed": cb([{ id: "g2", name: "A", tags: ["x "] }]),
    "duplicate tag in one group": cb([{ id: "g2", name: "A", tags: ["x", "x"] }]),
    "duplicate tag across groups": cb([{ id: "g2", name: "A", tags: ["x"] }, { id: "g3", name: "B", tags: ["x"] }]),
  };
  for (const [label, data] of Object.entries(cases)) {
    const r = M.validate(data);
    assert.equal(r.ok, false, `${label} should be rejected`);
    assert.equal(r.newer, undefined, `${label} is not "newer"`);
    assert.equal(typeof r.reason, "string", `${label} needs a reason`);
    assert.ok(r.reason.length > 0, label);
  }
});

test("AC13: version 2 files: bad groups and tag records are rejected with a reason", () => {
  const G = [{ id: "g2", name: "A" }, { id: "g3", name: "B" }];
  const cases = {
    "tags missing": { ...v2(G, []), codebooks: [{ id: "c1", name: "C", groups: G }] },
    "tags not array": v2(G, {}),
    "tag record not object": v2(G, ["x"]),
    "tag name missing": v2(G, [{ group: null }]),
    "tag name not string": v2(G, [{ name: 1, group: null }]),
    "tag name empty": v2(G, [{ name: "", group: null }]),
    "tag name untrimmed": v2(G, [{ name: " x", group: null }]),
    "duplicate tags": v2(G, [{ name: "x", group: "g2" }, { name: "x", group: null }]),
    "group missing on record": v2(G, [{ name: "x" }]),
    "group points at a missing group": v2(G, [{ name: "x", group: "g7" }]),
    "group is a number": v2(G, [{ name: "x", group: 2 }]),
    "group is false": v2(G, [{ name: "x", group: false }]),
    "group is the view id": v2(G, [{ name: "x", group: "ungrouped" }]),
    "group name untrimmed": v2([{ id: "g2", name: "A " }], []),
    "group names duplicate ignoring case": v2([{ id: "g2", name: "A" }, { id: "g3", name: "a" }], []),
    "group id invalid": v2([{ id: "ungrouped", name: "A" }], []),
    "group id >= nextId": v2([{ id: "g9", name: "A" }], []),
  };
  for (const [label, data] of Object.entries(cases)) {
    const r = M.validate(data);
    assert.equal(r.ok, false, `${label} should be rejected`);
    assert.equal(r.newer, undefined, `${label} is not "newer"`);
    assert.ok(typeof r.reason === "string" && r.reason.length > 0, label);
  }
  // A group of ANOTHER codebook does not count.
  const two = {
    schemaVersion: 2, revision: 1, nextId: 9,
    codebooks: [
      { id: "c1", name: "C", groups: [], tags: [{ name: "x", group: "g3" }] },
      { id: "c2", name: "D", groups: [{ id: "g3", name: "B" }], tags: [] },
    ],
  };
  assert.equal(M.validate(two).ok, false);
});

test("AC13: migrate v1 → v2 keeps ids, nextId, revision, group order and tag order", () => {
  const m = M.migrate(sampleV1());
  assert.deepEqual(plain(m), {
    schemaVersion: 2,
    revision: 7,
    nextId: 5,
    codebooks: [
      {
        id: "c1",
        name: "Codebook",
        groups: [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Outcome" }],
        tags: [
          { name: "Heat index", group: "g2" },
          { name: "Temperature", group: "g2" },
          { name: "Hospitalization", group: "g3" },
        ],
      },
    ],
  });
  assert.deepEqual(plain(M.validate(m)), { ok: true });
  // Names are not re-normalized by the migration (ADR-0016 §2).
  const nfd = sampleV1();
  nfd.codebooks[0].groups[0].tags[0] = "é";
  assert.equal(M.migrate(nfd).codebooks[0].tags[0].name, "é");
});

test("migrate returns an equal copy for v2 and refuses unknown versions", () => {
  const d = sample();
  const m = M.migrate(d);
  assert.deepEqual(plain(m), plain(d));
  assert.notEqual(m, d);
  assert.throws(() => M.migrate({ ...d, schemaVersion: 3 }));
});
