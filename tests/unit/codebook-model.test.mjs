// Feature 004 AC8 + AC9: unit tests for the pure codebook model (src/content/codebook-model.js).
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

/** A data object with Exposure (g2: Heat index, Temperature) and Outcome (g3: Hospitalization). */
function sample() {
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

const names = (data) => plain(M.groups(data)).map((g) => g.name);

// ---------------------------------------------------------------------------------------
// AC8: model rules
// ---------------------------------------------------------------------------------------

test("AC8: the file defines TabellifyCodebook without Zotero/DOM/IOUtils", () => {
  assert.equal(typeof M, "object");
  for (const fn of ["emptyData", "validate", "migrate", "addGroup", "renameGroup", "deleteGroup",
    "addTagToGroup", "removeTagFromGroup", "availableTags"]) {
    assert.equal(typeof M[fn], "function", fn);
  }
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const g of ["Zotero", "IOUtils", "PathUtils", "document", "window"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${g}\\b`), `${g} used in the pure model`);
  }
});

test("AC8: emptyData is valid, has one codebook with no groups and revision 0", () => {
  const d = M.emptyData();
  assert.deepEqual(plain(M.validate(d)), { ok: true });
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.revision, 0);
  assert.equal(d.codebooks.length, 1);
  assert.deepEqual(plain(M.groups(d)), []);
  // A fresh object each time (callers may keep it).
  assert.notEqual(M.emptyData(), M.emptyData());
});

test("AC8: addGroup appends with an id from nextId, trims, keeps order", () => {
  let d = M.emptyData();
  d = ok(M.addGroup(d, "  Exposure "));
  d = ok(M.addGroup(d, "Outcome"));
  assert.deepEqual(plain(M.groups(d)), [
    { id: "g2", name: "Exposure", tags: [] },
    { id: "g3", name: "Outcome", tags: [] },
  ]);
  assert.equal(d.nextId, 4);
  assert.deepEqual(plain(M.validate(d)), { ok: true });
});

test("AC8: addGroup rejects empty and duplicate (ignoring case) names", () => {
  const d = sample();
  for (const bad of ["", "   ", undefined, null]) {
    assert.deepEqual(plain(M.addGroup(d, bad)), { ok: false, error: M.ERR_GROUP_EMPTY }, String(bad));
  }
  assert.deepEqual(plain(M.addGroup(d, "exposure")), { ok: false, error: M.ERR_GROUP_DUPLICATE });
  assert.deepEqual(plain(M.addGroup(d, " OUTCOME ")), { ok: false, error: M.ERR_GROUP_DUPLICATE });
});

test("AC8: ids keep counting after a delete (never reused)", () => {
  let d = M.emptyData();
  d = ok(M.addGroup(d, "A"));
  d = ok(M.deleteGroup(d, "g2"));
  d = ok(M.addGroup(d, "B"));
  assert.deepEqual(plain(M.groups(d)).map((g) => g.id), ["g3"]);
});

test("AC8: renameGroup trims, keeps id/tags/position, allows a case-only change", () => {
  let d = sample();
  d = ok(M.renameGroup(d, "g3", "  Health outcome "));
  assert.deepEqual(names(d), ["Exposure", "Health outcome"]);
  assert.deepEqual(plain(M.groups(d)[1]), { id: "g3", name: "Health outcome", tags: ["Hospitalization"] });
  d = ok(M.renameGroup(d, "g2", "EXPOSURE"));
  assert.deepEqual(names(d), ["EXPOSURE", "Health outcome"]);
});

test("AC8: renameGroup rejects empty, duplicate and unknown group", () => {
  const d = sample();
  assert.deepEqual(plain(M.renameGroup(d, "g3", " ")), { ok: false, error: M.ERR_GROUP_EMPTY });
  assert.deepEqual(plain(M.renameGroup(d, "g3", "exposure")), { ok: false, error: M.ERR_GROUP_DUPLICATE });
  assert.deepEqual(plain(M.renameGroup(d, "g99", "X")), { ok: false, error: M.ERR_GROUP_MISSING });
});

test("AC8: deleteGroup removes the group and its tags; unknown id is refused", () => {
  let d = sample();
  d = ok(M.deleteGroup(d, "g2"));
  assert.deepEqual(names(d), ["Outcome"]);
  // Its tags are free again.
  d = ok(M.addTagToGroup(d, "g3", "Heat index"));
  assert.deepEqual(plain(M.groups(d)[0].tags), ["Hospitalization", "Heat index"]);
  assert.deepEqual(plain(M.deleteGroup(d, "g2")), { ok: false, error: M.ERR_GROUP_MISSING });
});

test("AC8: AC2 sequence ends with exactly Exposure, Health outcome", () => {
  let d = M.emptyData();
  d = ok(M.addGroup(d, "Exposure"));
  d = ok(M.addGroup(d, "Outcome"));
  d = ok(M.renameGroup(d, "g3", "Health outcome"));
  d = ok(M.addGroup(d, "Temp"));
  d = ok(M.deleteGroup(d, "g4"));
  assert.deepEqual(names(d), ["Exposure", "Health outcome"]);
});

test("AC8: addTagToGroup trims, appends in order", () => {
  let d = sample();
  d = ok(M.addTagToGroup(d, "g2", "  Humidity "));
  assert.deepEqual(plain(M.groups(d)[0].tags), ["Heat index", "Temperature", "Humidity"]);
  assert.deepEqual(plain(M.validate(d)), { ok: true });
});

test("AC8: addTagToGroup rejects empty, duplicate anywhere in the codebook, unknown group", () => {
  const d = sample();
  assert.deepEqual(plain(M.addTagToGroup(d, "g2", "  ")), { ok: false, error: M.ERR_TAG_EMPTY });
  assert.deepEqual(plain(M.addTagToGroup(d, "g2", "Heat index")), { ok: false, error: M.ERR_TAG_DUPLICATE });
  // Same tag under another group: still a duplicate (one tag → one column).
  assert.deepEqual(plain(M.addTagToGroup(d, "g3", " Heat index ")), { ok: false, error: M.ERR_TAG_DUPLICATE });
  assert.deepEqual(plain(M.addTagToGroup(d, "g99", "X")), { ok: false, error: M.ERR_GROUP_MISSING });
});

test("AC8: tag matching is case-sensitive (owner decision 3)", () => {
  const d = ok(M.addTagToGroup(sample(), "g3", "heat index"));
  assert.deepEqual(plain(M.groups(d)[1].tags), ["Hospitalization", "heat index"]);
});

test("AC8: removeTagFromGroup removes exactly that tag; unknown tag/group refused", () => {
  let d = sample();
  d = ok(M.removeTagFromGroup(d, "g2", "Heat index"));
  assert.deepEqual(plain(M.groups(d)[0].tags), ["Temperature"]);
  assert.deepEqual(plain(M.removeTagFromGroup(d, "g2", "Heat index")), { ok: false, error: M.ERR_TAG_MISSING });
  assert.deepEqual(plain(M.removeTagFromGroup(d, "g3", "Temperature")), { ok: false, error: M.ERR_TAG_MISSING });
  assert.deepEqual(plain(M.removeTagFromGroup(d, "g99", "Temperature")), { ok: false, error: M.ERR_GROUP_MISSING });
});

test("AC8: edits never mutate their input (they return new data)", () => {
  const d = sample();
  const before = JSON.stringify(d);
  ok(M.addGroup(d, "New"));
  ok(M.renameGroup(d, "g2", "Renamed"));
  ok(M.deleteGroup(d, "g3"));
  ok(M.addTagToGroup(d, "g2", "New tag"));
  ok(M.removeTagFromGroup(d, "g2", "Temperature"));
  M.availableTags(d, ["x", "Temperature"]);
  M.migrate(d);
  assert.equal(JSON.stringify(d), before);
  const r = M.addGroup(d, "New");
  assert.notEqual(r.data, d);
  assert.notEqual(r.data.codebooks, d.codebooks);
});

test("AC8: edits do not change revision (the store does)", () => {
  assert.equal(ok(M.addGroup(sample(), "New")).revision, 7);
});

test("AC8/AC4: availableTags — once each, sorted, minus codebook tags and blanks", () => {
  const out = M.availableTags(sample(), [
    "zeta", "Temperature", "alpha", "Tag 10", "Tag 2", "alpha", "  ", "", "Heat index", "heat index", "Beta",
  ]);
  assert.deepEqual(plain(out), ["alpha", "Beta", "heat index", "Tag 2", "Tag 10", "zeta"]);
  assert.deepEqual(plain(M.availableTags(M.emptyData(), [])), []);
});

test("AC8: markup in names stays literal text", () => {
  const evil = '<img src=x onerror="alert(1)">';
  let d = ok(M.addGroup(M.emptyData(), evil));
  d = ok(M.addTagToGroup(d, "g2", evil));
  assert.equal(M.groups(d)[0].name, evil);
  assert.equal(M.groups(d)[0].tags[0], evil);
});

// ---------------------------------------------------------------------------------------
// AC9: validation and versions
// ---------------------------------------------------------------------------------------

test("AC9: a valid v1 file passes", () => {
  assert.deepEqual(plain(M.validate(sample())), { ok: true });
});

test("AC9: schemaVersion missing is rejected (no v0 exists)", () => {
  const d = sample();
  delete d.schemaVersion;
  const r = M.validate(d);
  assert.equal(r.ok, false);
  assert.equal(r.newer, undefined);
  assert.match(r.reason, /schemaVersion/);
});

test("AC9: schemaVersion higher than 1 is reported as newer", () => {
  const r = M.validate({ ...sample(), schemaVersion: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
  assert.match(r.reason, /newer/);
  // Even when the rest of the file is a shape this version does not know.
  assert.equal(M.validate({ schemaVersion: 5, whatever: true }).newer, true);
});

test("AC9: wrong types and missing fields are rejected with a reason", () => {
  const cases = {
    "not an object (null)": null,
    "not an object (array)": [],
    "not an object (string)": "not json",
    "schemaVersion 0": { ...sample(), schemaVersion: 0 },
    "schemaVersion string": { ...sample(), schemaVersion: "1" },
    "schemaVersion 1.5": { ...sample(), schemaVersion: 1.5 },
    "revision missing": (() => { const d = sample(); delete d.revision; return d; })(),
    "revision negative": { ...sample(), revision: -1 },
    "nextId missing": (() => { const d = sample(); delete d.nextId; return d; })(),
    "nextId string": { ...sample(), nextId: "5" },
    "codebooks missing": (() => { const d = sample(); delete d.codebooks; return d; })(),
    "codebooks not array": { ...sample(), codebooks: {} },
    "codebooks empty": { ...sample(), codebooks: [] },
    "codebook not object": { ...sample(), codebooks: ["c1"] },
    "codebook bad id": { ...sample(), codebooks: [{ id: "x", name: "C", groups: [] }] },
    "codebook name missing": { ...sample(), codebooks: [{ id: "c1", groups: [] }] },
    "groups missing": { ...sample(), codebooks: [{ id: "c1", name: "C" }] },
    "group not object": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [null] }] },
    "group id wrong prefix": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "c2", name: "A", tags: [] }] }] },
    "group id >= nextId": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g5", name: "A", tags: [] }] }] },
    "group id twice": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [
      { id: "g2", name: "A", tags: [] }, { id: "g2", name: "B", tags: [] }] }] },
    "group name number": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: 3, tags: [] }] }] },
    "group name empty": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: " ", tags: [] }] }] },
    "group name untrimmed": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: " A", tags: [] }] }] },
    "group names duplicate ignoring case": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [
      { id: "g2", name: "A", tags: [] }, { id: "g3", name: "a", tags: [] }] }] },
    "tags missing": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: "A" }] }] },
    "tag not a string": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: "A", tags: [42] }] }] },
    "tag empty": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: "A", tags: [""] }] }] },
    "tag untrimmed": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [{ id: "g2", name: "A", tags: ["x "] }] }] },
    "duplicate tag in one group": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [
      { id: "g2", name: "A", tags: ["x", "x"] }] }] },
    "duplicate tag across groups": { ...sample(), codebooks: [{ id: "c1", name: "C", groups: [
      { id: "g2", name: "A", tags: ["x"] }, { id: "g3", name: "B", tags: ["x"] }] }] },
  };
  for (const [label, data] of Object.entries(cases)) {
    const r = M.validate(data);
    assert.equal(r.ok, false, `${label} should be rejected`);
    assert.equal(r.newer, undefined, `${label} is not "newer"`);
    assert.equal(typeof r.reason, "string", `${label} needs a reason`);
    assert.ok(r.reason.length > 0, label);
  }
});

test("AC9: migrate returns an equal copy for v1 and refuses unknown versions", () => {
  const d = sample();
  const m = M.migrate(d);
  assert.deepEqual(plain(m), plain(d));
  assert.notEqual(m, d);
  assert.throws(() => M.migrate({ ...d, schemaVersion: 2 }));
});
