// Feature 007b AC14–AC17 (ADR-0018): unit tests for the pure saved-tables model
// (src/content/saved-tables-model.js).
//
// The model is a classic browser script (no import/export). Node runs it in an empty
// node:vm sandbox together with the pure models it uses, in workspace.xhtml's order. The
// sandbox has no Zotero, window, document, IOUtils, PathUtils or clock wrapper, so loading
// it proves the model needs none of them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");
const sandbox = vm.createContext({});
for (const name of ["codebook-model.js", "tag-monitor-model.js", "table-layout-model.js", "csv-model.js", "saved-tables-model.js"]) {
  const file = join(contentDir, name);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
}
const S = sandbox.TabellifySavedTables;
const T = sandbox.TabellifyTagMonitor;
const L = sandbox.TabellifyTableLayout;
const Csv = sandbox.TabellifyCsv;

// Objects made inside the sandbox have other prototypes; compare as plain JSON values.
const plain = (v) => JSON.parse(JSON.stringify(v));
const NOW = "2026-11-14T15:40:03.000Z";
const LATER = "2026-11-15T09:00:00.000Z";
const LABELS = { title: "Title", untitled: "(untitled)", k: "Tags used (k)", m: "Codebook tags (M)" };

/** Deep-freeze test inputs: any attempt by the model to change them throws (strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

/** A codebooks.json-shaped object (schema 2): groups `{ id, name, tags }` and ungrouped names. */
const codebookData = (groups, ungrouped = []) => ({
  schemaVersion: 2, revision: 1, nextId: 9,
  codebooks: [{
    id: "c1",
    name: "Codebook",
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    tags: [
      ...ungrouped.map((name) => ({ name, group: null })),
      ...groups.flatMap((g) => g.tags.map((name) => ({ name, group: g.id }))),
    ],
  }],
});

/** A collection as gatherMonitorData() reads it. */
function monitorData(papers = null) {
  return {
    rootId: 1,
    collections: [{ id: 1, parentID: false, name: "F005 test" }],
    papers: papers ?? [
      { id: 101, title: "Paper 1", collectionId: 1, itemTags: [{ tag: "Heat index" }], annotationTags: [{ tag: "Mortality" }, { tag: "age" }] },
      { id: 102, title: "Paper 2", collectionId: 1, itemTags: [], annotationTags: [{ tag: "Temperature" }, { tag: "Heat index" }] },
      { id: 103, title: "", collectionId: 1, itemTags: [], annotationTags: [{ tag: "sex" }] },
      { id: 104, title: "Paper 4", collectionId: 1, itemTags: [], annotationTags: [] },
    ],
    keys: new Map([[101, "ITEM0101"], [102, "ITEM0102"], [103, "ITEM0103"], [104, "ITEM0104"]]),
  };
}
const GROUPS = [
  { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
  { id: "g3", name: "Outcome", tags: ["Mortality"] },
];

/** What the workspace keeps after renderPaperTable: { groups, papers, counting }. */
function workspaceView(codebook, data = monitorData(), layout = null, sort = { key: "count", direction: "asc" }, countItemTags = false) {
  const result = T.summarize(codebook, data.collections, data.rootId, data.papers, { countItemTags });
  const counting = Boolean(codebook) && result.total > 0;
  const groups = counting ? L.orderedGroups(T.codebookGroups(codebook), layout) : [];
  return { groups, papers: T.sortPapers(result.papers, sort.key, sort.direction), counting };
}
const keyOf = (data) => (p) => data.keys.get(p.id);

/** A full valid file with two tables. */
function validFile() {
  return {
    schemaVersion: 1,
    revision: 4,
    nextId: 3,
    tables: [
      {
        id: "t1",
        name: "Heat and hospitalization",
        description: "Phenotype definitions, first pass.",
        createdAt: "2026-11-14T15:02:11.000Z",
        updatedAt: "2026-11-14T15:40:03.000Z",
        definition: {
          collectionKey: "1/ABCD2345",
          codebookId: "c1",
          columnLayout: { topOrder: [{ tag: "age" }, { group: "g2" }, { group: "ungrouped" }], tagOrder: { g2: ["Temperature", "Heat index"] } },
          sort: { key: "count", direction: "asc" },
          manualOrder: null,
          countItemTags: false,
        },
        snapshot: {
          takenAt: "2026-11-14T15:40:03.000Z",
          collectionName: "F005 test",
          blocks: [{ group: null, tags: ["age"] }, { group: "Exposure", tags: ["Temperature", "Heat index"] }],
          rows: [
            { itemKey: "EFGH6789", title: "Smith 2020", untitled: false, present: [0, 2] },
            { itemKey: "JKLM2345", title: "", untitled: true, present: [] },
          ],
        },
      },
      {
        id: "t2",
        name: "Second",
        description: "",
        createdAt: "2026-11-13T10:00:00.000Z",
        updatedAt: "2026-11-13T10:00:00.000Z",
        definition: {
          collectionKey: "1/OTHER001",
          codebookId: "c1",
          columnLayout: { topOrder: [], tagOrder: {} },
          sort: { key: "manual", direction: "asc" },
          manualOrder: ["EFGH6789"],
          countItemTags: true,
        },
        snapshot: { takenAt: "2026-11-13T10:00:00.000Z", collectionName: "Other", blocks: [], rows: [] },
      },
    ],
  };
}

/** A copy of validFile() with `change(file)` applied. */
function broken(change) {
  const file = validFile();
  change(file);
  return file;
}

// ---------------------------------------------------------------------------------------
// AC14: validation and migration
// ---------------------------------------------------------------------------------------

test("AC14: the model loads in an empty sandbox; emptyData is valid; a full file is valid", () => {
  assert.equal(S.SCHEMA_VERSION, 1);
  assert.deepEqual(plain(S.emptyData()), { schemaVersion: 1, revision: 0, nextId: 1, tables: [] });
  assert.deepEqual(plain(S.validate(S.emptyData())), { ok: true });
  assert.deepEqual(plain(S.validate(validFile())), { ok: true });
  assert.deepEqual(plain(S.LIMITS), { tables: 100, rows: 5000, columns: 500, name: 200, description: 2000, title: 2000, fileChars: 20000000 });
});

test("AC14: each validation rule rejects, with a reason that names no field value", () => {
  const SECRET = "Secret-Value-123";
  const longName = "N".repeat(201);
  const cases = {
    "not an object": () => [],
    "schemaVersion 0": (f) => { f.schemaVersion = 0; },
    "negative revision": (f) => { f.revision = -1; },
    "nextId 0": (f) => { f.nextId = 0; },
    "tables not an array": (f) => { f.tables = {}; },
    "unknown top-level key": (f) => { f[SECRET] = 1; },
    "bad id": (f) => { f.tables[0].id = `x${SECRET}`; },
    "id with leading zero": (f) => { f.tables[0].id = "t01"; },
    "id not below nextId": (f) => { f.tables[1].id = "t3"; },
    "duplicate id": (f) => { f.tables[1].id = "t1"; },
    "empty name": (f) => { f.tables[0].name = ""; },
    "untrimmed name": (f) => { f.tables[0].name = ` ${SECRET} `; },
    "201-character name": (f) => { f.tables[0].name = longName; },
    "2001-character description": (f) => { f.tables[0].description = SECRET + "d".repeat(2001); },
    "bad createdAt": (f) => { f.tables[0].createdAt = SECRET; },
    "bad updatedAt": (f) => { f.tables[0].updatedAt = 5; },
    "bad takenAt": (f) => { f.tables[0].snapshot.takenAt = SECRET; },
    "bad collectionKey": (f) => { f.tables[0].definition.collectionKey = `${SECRET}/ x`; },
    "empty codebookId": (f) => { f.tables[0].definition.codebookId = ""; },
    "topOrder not an array": (f) => { f.tables[0].definition.columnLayout.topOrder = SECRET; },
    "tagOrder not an object": (f) => { f.tables[0].definition.columnLayout.tagOrder = []; },
    "bad sort.direction": (f) => { f.tables[0].definition.sort.direction = SECRET; },
    "manualOrder with an empty key": (f) => { f.tables[1].definition.manualOrder = ["", SECRET]; },
    "non-boolean countItemTags": (f) => { f.tables[0].definition.countItemTags = "yes"; },
    "collectionName not a text": (f) => { f.tables[0].snapshot.collectionName = null; },
    "present out of range": (f) => { f.tables[0].snapshot.rows[0].present = [0, 3]; },
    "present unsorted": (f) => { f.tables[0].snapshot.rows[0].present = [2, 0]; },
    "present repeated": (f) => { f.tables[0].snapshot.rows[0].present = [0, 0]; },
    "present not integers": (f) => { f.tables[0].snapshot.rows[0].present = [0.5]; },
    "duplicate tag across blocks": (f) => { f.tables[0].snapshot.blocks[1].tags = ["Temperature", "age"]; },
    "neighbouring null blocks": (f) => { f.tables[0].snapshot.blocks = [{ group: null, tags: ["age"] }, { group: null, tags: [SECRET] }]; },
    "empty block": (f) => { f.tables[0].snapshot.blocks.push({ group: "G", tags: [] }); },
    "empty tag name": (f) => { f.tables[0].snapshot.blocks[0].tags = [""]; },
    "itemKey too long": (f) => { f.tables[0].snapshot.rows[0].itemKey = "K".repeat(33); },
    "untitled not boolean": (f) => { f.tables[0].snapshot.rows[0].untitled = 0; },
    "row title too long": (f) => { f.tables[0].snapshot.rows[0].title = SECRET + "x".repeat(2000); },
    "extra nesting in a row": (f) => { f.tables[0].snapshot.rows[0].extra = { SECRET }; },
    "101 tables": (f) => {
      f.nextId = 200;
      f.tables = Array.from({ length: 101 }, (_, i) => ({ ...validFile().tables[1], id: `t${i + 1}` }));
    },
    "5001 rows": (f) => {
      f.tables[1].snapshot.rows = Array.from({ length: 5001 }, (_, i) => ({ itemKey: `K${i}`, title: "", untitled: true, present: [] }));
    },
    "501 columns": (f) => {
      f.tables[1].snapshot.blocks = [{ group: "Big", tags: Array.from({ length: 501 }, (_, i) => `tag${i}`) }];
    },
  };
  for (const [name, change] of Object.entries(cases)) {
    const file = name === "not an object" ? [] : broken(change);
    const result = S.validate(file);
    assert.equal(result.ok, false, `${name} should be invalid`);
    assert.equal(result.newer, undefined, name);
    assert.equal(typeof result.reason, "string", name);
    assert.ok(!result.reason.includes(SECRET), `${name}: reason holds a value: ${result.reason}`);
    assert.ok(!result.reason.includes(longName), `${name}: reason holds the name`);
  }
});

test("AC14: schemaVersion 2 is newer; a __proto__ key in tagOrder stays an own key; migrate copies", () => {
  const newer = S.validate({ schemaVersion: 2, revision: 0, anything: true });
  assert.equal(newer.ok, false);
  assert.equal(newer.newer, true);

  // JSON.parse makes "__proto__" an ordinary own key, as a hand-edited file would.
  const file = JSON.parse(JSON.stringify(validFile()).replace('"tagOrder":{"g2"', '"tagOrder":{"__proto__":["Polluted"],"g2"'));
  assert.ok(Object.hasOwn(file.tables[0].definition.columnLayout.tagOrder, "__proto__"));
  assert.deepEqual(plain(S.validate(file)), { ok: true });
  const clean = S.migrate(frozen(file));
  const tagOrder = clean.tables[0].definition.columnLayout.tagOrder;
  assert.ok(Object.hasOwn(tagOrder, "__proto__"), "still an own key");
  assert.deepEqual(plain(tagOrder.__proto__), ["Polluted"]);
  // The prototype is still the sandbox's plain Object.prototype (not the array).
  assert.equal(Object.getPrototypeOf(tagOrder), Object.getPrototypeOf(vm.runInContext("({})", sandbox)));
  assert.equal(Array.isArray(Object.getPrototypeOf(tagOrder)), false);

  // migrate: equal but separate.
  const original = validFile();
  const copy = S.migrate(original);
  assert.deepEqual(plain(copy), plain(original));
  assert.notEqual(copy, original);
  assert.notEqual(copy.tables[0], original.tables[0]);
  assert.notEqual(copy.tables[0].snapshot.rows[0].present, original.tables[0].snapshot.rows[0].present);
  copy.tables[0].name = "changed";
  assert.equal(original.tables[0].name, "Heat and hospitalization");
});

// ---------------------------------------------------------------------------------------
// AC15: snapshot round trip
// ---------------------------------------------------------------------------------------

/** Several views to round-trip: groups + ungrouped runs, only ungrouped, no tags, untitled. */
function fixtures() {
  const mixed = codebookData(GROUPS, ["age", "sex"]);
  const runsLayout = { topOrder: [{ tag: "age" }, { group: "g2" }, { tag: "sex" }, { group: "g3" }], tagOrder: { g2: ["Temperature", "Heat index"] } };
  return {
    "groups + two ungrouped runs": workspaceView(mixed, monitorData(), runsLayout),
    "groups + one ungrouped run, sorted by title desc": workspaceView(mixed, monitorData(), null, { key: "title", direction: "desc" }),
    "only ungrouped": workspaceView(codebookData([], ["age", "sex", "Mortality"])),
    "no tags": workspaceView(codebookData([{ id: "g9", name: "Empty", tags: [] }])),
    "no codebook": workspaceView(null),
    "item tags counted": workspaceView(mixed, monitorData(), null, { key: "count", direction: "desc" }, true),
  };
}

test("AC15: buildSnapshot → snapshotView keeps columns, blocks, rows, ✓, k and M; CSV text identical", () => {
  for (const [name, view] of Object.entries(fixtures())) {
    const data = monitorData();
    const built = S.buildSnapshot(frozen(view), { keyOf: keyOf(data), collectionName: "F005 test", takenAt: NOW });
    assert.equal(built.ok, true, name);
    assert.deepEqual(plain(S.validate({ schemaVersion: 1, revision: 0, nextId: 2, tables: [{
      id: "t1", name: "x", description: "", createdAt: NOW, updatedAt: NOW,
      definition: S.buildDefinition({ collectionKey: "1/COLL0001", codebookId: "c1", columnLayout: null, sort: { key: "count", direction: "asc" }, manualOrder: null, countItemTags: false }),
      snapshot: built.snapshot,
    }] })), { ok: true }, name);
    const back = S.snapshotView(built.snapshot);
    // Same columns per block, same block kinds (null → ungrouped runs, kept apart).
    assert.deepEqual(plain(back.groups.map((g) => [g.ungrouped === true, g.name, g.tags, g.run ?? null])),
      plain(view.groups.map((g) => [g.ungrouped === true, g.ungrouped ? "" : g.name, g.tags, g.run ?? null])), name);
    // Same rows: title, untitled, ✓ set, k and M.
    const rowOf = (p) => [p.untitled ? "" : p.title, p.untitled, [...p.groups.flatMap((g) => g.present)].sort(), p.count, p.total];
    if (view.counting) assert.deepEqual(plain(back.papers.map(rowOf)), plain(view.papers.map(rowOf)), name);
    assert.equal(back.counting, view.counting, name);
    assert.deepEqual(plain(back.papers.map((p) => p.itemKey)), plain(view.papers.map((p) => data.keys.get(p.id))), name);
    // The CSV of the round-tripped view is exactly the CSV of the original.
    assert.equal(Csv.build(back, LABELS).text, Csv.build(view, LABELS).text, `${name}: CSV differs`);
  }
});

test("AC15: blocks: group names, null for ungrouped runs, present as column indexes", () => {
  const view = fixtures()["groups + two ungrouped runs"];
  const { snapshot } = S.buildSnapshot(view, { keyOf: keyOf(monitorData()), collectionName: "F005 test", takenAt: NOW });
  assert.deepEqual(plain(snapshot.blocks), [
    { group: null, tags: ["age"] },
    { group: "Exposure", tags: ["Temperature", "Heat index"] },
    { group: null, tags: ["sex"] },
    { group: "Outcome", tags: ["Mortality"] },
  ]);
  const paper1 = snapshot.rows.find((r) => r.itemKey === "ITEM0101");
  assert.deepEqual(plain(paper1), { itemKey: "ITEM0101", title: "Paper 1", untitled: false, present: [0, 4] });
  const untitled = snapshot.rows.find((r) => r.itemKey === "ITEM0103");
  assert.deepEqual(plain(untitled), { itemKey: "ITEM0103", title: "", untitled: true, present: [3] });
  assert.equal(snapshot.takenAt, NOW);
  assert.equal(snapshot.collectionName, "F005 test");
  // Two neighbouring runs in a view are merged into one block.
  const merged = S.buildSnapshot({ groups: [
    { id: "ungrouped", run: 0, name: "", tags: ["a"], ungrouped: true },
    { id: "ungrouped", run: 1, name: "", tags: ["b"], ungrouped: true },
  ], papers: [], counting: true }, { keyOf: () => "K", collectionName: "", takenAt: NOW });
  assert.deepEqual(plain(merged.snapshot.blocks), [{ group: null, tags: ["a", "b"] }]);
  // snapshotView ids: runs "ungrouped" 0, 1; real groups s0, s1.
  assert.deepEqual(plain(S.snapshotView(snapshot).groups.map((g) => [g.id, g.run ?? null])),
    [["ungrouped", 0], ["s0", null], ["ungrouped", 1], ["s1", null]]);
});

test("AC15: a 3000-character title is cut to 2000 with … without splitting an emoji", () => {
  // 1998 "a", then an emoji (2 UTF-16 units) across the cut point, then more text.
  const title = "a".repeat(1998) + "😀" + "b".repeat(1000);
  assert.equal(title.length, 3000);
  const view = { groups: [{ id: "g1", name: "G", tags: ["t"] }], papers: [{ id: 1, title, untitled: false, count: 0, total: 1, groups: [{ present: [] }] }], counting: true };
  const { snapshot } = S.buildSnapshot(view, { keyOf: () => "K1", collectionName: "", takenAt: NOW });
  const cut = snapshot.rows[0].title;
  assert.ok(cut.length <= 2000, `length ${cut.length}`);
  assert.ok(cut.endsWith("…"));
  assert.equal(cut, "a".repeat(1998) + "…", "the emoji is dropped whole, not split");
  assert.doesNotMatch(cut, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, "no lone high surrogate");
  // A title that fits is kept as is (with its emoji).
  const fits = "c".repeat(1990) + "😀";
  const kept = S.buildSnapshot({ ...view, papers: [{ ...view.papers[0], title: fits }] }, { keyOf: () => "K1", collectionName: "", takenAt: NOW });
  assert.equal(kept.snapshot.rows[0].title, fits);
});

test("AC15: 5001 rows and 501 columns are refused with the right Fluent ID; inputs are not mutated", () => {
  const paper = { id: 1, title: "x", untitled: false, count: 0, total: 1, groups: [{ present: [] }] };
  const rows = S.buildSnapshot(frozen({ groups: [{ id: "g1", name: "G", tags: ["t"] }], papers: Array.from({ length: 5001 }, () => paper), counting: true }),
    { keyOf: () => "K", collectionName: "", takenAt: NOW });
  assert.deepEqual(plain(rows), { ok: false, error: "tabellify-saved-error-limit-rows", limit: "rows" });
  const columns = S.buildSnapshot(frozen({ groups: [{ id: "g1", name: "G", tags: Array.from({ length: 501 }, (_, i) => `t${i}`) }], papers: [], counting: true }),
    { keyOf: () => "K", collectionName: "", takenAt: NOW });
  assert.deepEqual(plain(columns), { ok: false, error: "tabellify-saved-error-limit-columns", limit: "columns" });
  // Exactly at the limits is fine.
  const at = S.buildSnapshot({ groups: [{ id: "g1", name: "G", tags: Array.from({ length: 500 }, (_, i) => `t${i}`) }], papers: Array.from({ length: 5000 }, () => paper), counting: true },
    { keyOf: () => "K", collectionName: "", takenAt: NOW });
  assert.equal(at.ok, true);
  // Frozen inputs (fixtures + snapshot) never throw: nothing is changed.
  for (const view of Object.values(fixtures())) {
    const built = S.buildSnapshot(frozen(view), { keyOf: keyOf(monitorData()), collectionName: "F005 test", takenAt: NOW });
    S.snapshotView(frozen(built.snapshot));
  }
});

// ---------------------------------------------------------------------------------------
// AC16: ordering and live view
// ---------------------------------------------------------------------------------------

test("AC16: orderPapers follows displayedPapers' rules for title, count, tag and manual", () => {
  const codebook = codebookData(GROUPS, ["age", "sex"]);
  const data = monitorData();
  const { papers } = T.summarize(codebook, data.collections, data.rootId, data.papers);
  const titles = (list) => list.map((p) => p.title || "(untitled)");
  const k = keyOf(data);
  // Title / count / tag: exactly TabellifyTagMonitor.sortPapers.
  for (const sort of [{ key: "title", direction: "asc" }, { key: "title", direction: "desc" }, { key: "count", direction: "desc" },
    { key: "tag:Temperature", direction: "asc" }, { key: "tag:age", direction: "desc" }]) {
    assert.deepEqual(plain(titles(S.orderPapers(frozen(papers), sort, null, k))), plain(titles(T.sortPapers(papers, sort.key, sort.direction))), sort.key);
  }
  // Manual: by item keys; unknown keys skipped; papers not in the order follow in default order.
  const manual = S.orderPapers(papers, { key: "manual", direction: "asc" }, ["ITEM0102", "GONE0000", "ITEM0104"], k);
  const defaultOrder = titles(T.sortPapers(papers, "count", "asc")).filter((t) => t !== "Paper 2" && t !== "Paper 4");
  assert.deepEqual(plain(titles(manual)), ["Paper 2", "Paper 4", ...defaultOrder]);
  // Manual without an order: the default order.
  assert.deepEqual(plain(titles(S.orderPapers(papers, { key: "manual", direction: "asc" }, null, k))), plain(titles(T.sortPapers(papers, "count", "asc"))));
  // A tag no longer in the codebook: the default sort, whatever the direction.
  assert.deepEqual(plain(titles(S.orderPapers(papers, { key: "tag:Gone", direction: "desc" }, null, k))), plain(titles(T.sortPapers(papers, "count", "asc"))));
});

test("AC16: liveView: current codebook decides the columns, the saved layout their order, the saved switch the counting", () => {
  // Saved: g3 first, then g2 with Temperature before Heat index; "age" not in the codebook yet.
  const definition = S.buildDefinition({
    collectionKey: "1/COLL0001", codebookId: "c1",
    columnLayout: { topOrder: [{ group: "g3" }, { group: "g2" }], tagOrder: { g2: ["Temperature", "Heat index"] } },
    sort: { key: "tag:Heat index", direction: "asc" }, manualOrder: null, countItemTags: false,
  });
  const snapshot = { takenAt: NOW, collectionName: "F005 test", blocks: [
    { group: "Outcome", tags: ["Mortality"] }, { group: "Exposure", tags: ["Temperature", "Heat index"] }, { group: "Old", tags: ["Dropped"] },
  ], rows: [] };
  // Today's codebook: Mortality removed, a new ungrouped tag "age", a new tag in g2.
  const today = codebookData([{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature", "Humidity"] }, { id: "g3", name: "Outcome", tags: [] }], ["age"]);
  const data = monitorData();
  const live = S.liveView(frozen({ codebook: today, monitorData: data, definition, snapshot }));
  // New ungrouped tag at the home marker (far left by default, ADR-0019); g2's saved order, new tag last.
  assert.deepEqual(plain(live.view.groups.map((g) => [g.id, g.tags])), [["ungrouped", ["age"]], ["g2", ["Temperature", "Heat index", "Humidity"]]]);
  assert.equal(live.view.counting, true);
  assert.deepEqual(plain(live.missing), ["Mortality", "Dropped"]);
  // Highlights only (saved switch off): Paper 1's "Heat index" is an item tag, so no ✓.
  const p1 = live.view.papers.find((p) => p.id === 101);
  assert.deepEqual(plain(p1.groups.flatMap((g) => g.present)).sort(), ["age"]);
  // The saved sort: Heat index ✓ first (Paper 2 only).
  assert.equal(live.view.papers[0].id, 102);
  // With the switch on, the item tag counts.
  const on = S.liveView({ codebook: today, monitorData: data, definition: { ...definition, countItemTags: true }, snapshot });
  assert.deepEqual(plain(on.view.papers.find((p) => p.id === 101).groups.flatMap((g) => g.present)).sort(), ["Heat index", "age"]);
  // Manual order by item keys.
  const manual = S.liveView({ codebook: today, monitorData: data, definition: { ...definition, sort: { key: "manual", direction: "asc" }, manualOrder: ["ITEM0104", "ITEM0101"] }, snapshot });
  assert.deepEqual(plain(manual.view.papers.slice(0, 2).map((p) => p.id)), [104, 101]);
  // No codebook: no columns, not counting, every saved column missing.
  const none = S.liveView({ codebook: null, monitorData: data, definition, snapshot });
  assert.deepEqual(plain(none.view.groups), []);
  assert.equal(none.view.counting, false);
  assert.equal(none.missing.length, 4);
});

test("AC16: missingColumns lists snapshot tags not in the given groups, in snapshot order", () => {
  const snapshot = { blocks: [{ group: null, tags: ["a", "b"] }, { group: "G", tags: ["c"] }] };
  assert.deepEqual(plain(S.missingColumns(snapshot, [{ tags: ["b"] }])), ["a", "c"]);
  assert.deepEqual(plain(S.missingColumns(snapshot, [{ tags: ["a", "b", "c", "d"] }])), []);
  assert.deepEqual(plain(S.missingColumns(null, [])), []);
});

test("AC16: buildDefinition copies and cleans the layout; manual order only when sorted manually", () => {
  const layout = { topOrder: [{ group: "g2" }, { group: "g2" }, { bad: 1 }, { tag: "age" }], tagOrder: { g2: ["b", "a", "a"], ungrouped: ["x"] } };
  const d = S.buildDefinition(frozen({ collectionKey: "1/COLL0001", codebookId: "c1", columnLayout: layout, sort: { key: "manual", direction: "asc" }, manualOrder: ["K1", "K1", "K2"], countItemTags: true }));
  assert.deepEqual(plain(d), {
    collectionKey: "1/COLL0001", codebookId: "c1",
    columnLayout: { topOrder: [{ group: "g2" }, { tag: "age" }], tagOrder: { g2: ["b", "a"] } },
    sort: { key: "manual", direction: "asc" }, manualOrder: ["K1", "K2"], countItemTags: true,
  });
  assert.notEqual(d.columnLayout.topOrder, layout.topOrder);
  const sorted = S.buildDefinition({ collectionKey: "1/C", codebookId: "c1", columnLayout: null, sort: { key: "title", direction: "desc" }, manualOrder: ["K1"], countItemTags: false });
  assert.equal(sorted.manualOrder, null);
  assert.deepEqual(plain(sorted.columnLayout), { topOrder: [], tagOrder: {} });
});

// ---------------------------------------------------------------------------------------
// AC17: edits, list and file size
// ---------------------------------------------------------------------------------------

/** A definition and snapshot ready to add. */
function newTableInput(name = "  Heat test A  ", collectionKey = "1/COLL0001") {
  const data = monitorData();
  const view = workspaceView(codebookData(GROUPS));
  return {
    name,
    description: "First pass",
    definition: S.buildDefinition({ collectionKey, codebookId: "c1", columnLayout: null, sort: { key: "count", direction: "desc" }, manualOrder: null, countItemTags: false }),
    snapshot: S.buildSnapshot(view, { keyOf: keyOf(data), collectionName: "F005 test", takenAt: NOW }).snapshot,
  };
}

test("AC17: addTable assigns t<nextId>, bumps nextId, sets both dates, trims the Name; result is valid", () => {
  const start = frozen(S.emptyData());
  const added = S.addTable(start, frozen(newTableInput()), NOW);
  assert.equal(added.ok, true);
  assert.equal(added.id, "t1");
  assert.equal(added.data.nextId, 2);
  assert.equal(added.data.revision, 0, "the store sets the revision");
  const t = added.data.tables[0];
  assert.equal(t.name, "Heat test A");
  assert.equal(t.description, "First pass");
  assert.equal(t.createdAt, NOW);
  assert.equal(t.updatedAt, NOW);
  assert.deepEqual(plain(S.validate(added.data)), { ok: true });
  const second = S.addTable(added.data, newTableInput("B"), LATER);
  assert.equal(second.id, "t2");
  assert.equal(second.data.tables.length, 2);
  assert.equal(start.tables.length, 0, "input not changed");
});

test("AC17: addTable refuses an empty Name and a 101st table", () => {
  assert.deepEqual(plain(S.addTable(S.emptyData(), newTableInput("   "), NOW)), { ok: false, error: "tabellify-saved-error-name-empty" });
  let data = S.emptyData();
  for (let i = 0; i < 100; i++) data = S.addTable(data, newTableInput(`T${i}`), NOW).data;
  assert.equal(data.tables.length, 100);
  assert.deepEqual(plain(S.addTable(data, newTableInput("one more"), NOW)), { ok: false, error: "tabellify-saved-error-limit-tables" });
});

test("AC17: updateTable changes only the given fields and updatedAt; refuses an unknown id or empty Name", () => {
  const data = S.addTable(S.emptyData(), newTableInput(), NOW).data;
  const before = plain(data.tables[0]);
  const renamed = S.updateTable(frozen(data), "t1", { name: " Heat test B2 " }, LATER);
  assert.equal(renamed.ok, true);
  const t = renamed.data.tables[0];
  assert.equal(t.name, "Heat test B2");
  assert.equal(t.description, before.description);
  assert.deepEqual(plain(t.snapshot), before.snapshot);
  assert.deepEqual(plain(t.definition), before.definition);
  assert.equal(t.createdAt, NOW);
  assert.equal(t.updatedAt, LATER);
  const described = S.updateTable(data, "t1", { description: "New" }, LATER).data.tables[0];
  assert.equal(described.name, "Heat test A");
  assert.equal(described.description, "New");
  const snap = { ...before.snapshot, takenAt: LATER, rows: before.snapshot.rows.slice(0, 1) };
  const updated = S.updateTable(data, "t1", { snapshot: snap }, LATER).data.tables[0];
  assert.equal(updated.snapshot.rows.length, 1);
  assert.equal(updated.snapshot.takenAt, LATER);
  assert.deepEqual(plain(S.updateTable(data, "t9", { name: "x" }, LATER)), { ok: false, error: "tabellify-saved-gone" });
  assert.deepEqual(plain(S.updateTable(data, "t1", { name: "  " }, LATER)), { ok: false, error: "tabellify-saved-error-name-empty" });
  assert.equal(data.tables[0].name, "Heat test A", "input not changed");
});

test("AC17: deleteTable removes exactly one table and never reuses its id", () => {
  let data = S.emptyData();
  for (const name of ["A", "B", "C"]) data = S.addTable(data, newTableInput(name), NOW).data;
  const deleted = S.deleteTable(frozen(data), "t2");
  assert.equal(deleted.ok, true);
  assert.deepEqual(plain(deleted.data.tables.map((t) => t.id)), ["t1", "t3"]);
  assert.equal(deleted.data.nextId, 4);
  assert.equal(S.addTable(deleted.data, newTableInput("D"), NOW).id, "t4");
  assert.deepEqual(plain(S.deleteTable(data, "t9")), { ok: false, error: "tabellify-saved-gone" });
});

test("AC17: listTables filters by collection key (null = all), newest first, then by name", () => {
  let data = S.emptyData();
  data = S.addTable(data, newTableInput("beta", "1/COLL0001"), "2026-11-14T10:00:00.000Z").data;
  data = S.addTable(data, newTableInput("Alpha", "1/COLL0001"), "2026-11-14T10:00:00.000Z").data;
  data = S.addTable(data, newTableInput("Other", "1/COLL0002"), "2026-11-15T10:00:00.000Z").data;
  const all = S.listTables(frozen(data), null);
  assert.deepEqual(plain(all.map((e) => e.name)), ["Other", "Alpha", "beta"]);
  assert.deepEqual(plain(all[1]), {
    id: "t2", name: "Alpha", collectionKey: "1/COLL0001", collectionName: "F005 test",
    papers: 4, columns: 3, updatedAt: "2026-11-14T10:00:00.000Z",
  });
  assert.deepEqual(plain(S.listTables(data, "1/COLL0001").map((e) => e.id)), ["t2", "t1"]);
  assert.deepEqual(plain(S.listTables(data, "1/NONE").map((e) => e.id)), []);
});

test("AC17: checkFileSize refuses above the limit; edits refuse a file that would be too large", () => {
  const data = S.addTable(S.emptyData(), newTableInput(), NOW).data;
  const length = JSON.stringify(data).length;
  assert.deepEqual(plain(S.checkFileSize(data, length)), { ok: true });
  assert.deepEqual(plain(S.checkFileSize(data, length - 1)), { ok: false, error: "tabellify-saved-error-limit-file" });
  assert.deepEqual(plain(S.checkFileSize(data)), { ok: true });
});

test("AC14/AC17: the model holds no clock, Zotero, page or file access", () => {
  const code = readFileSync(join(contentDir, "saved-tables-model.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /\b(?:Zotero|window|document|IOUtils|PathUtils|Services|ChromeUtils)\b/);
  assert.doesNotMatch(code, /Date\.now|new Date\(/);
});
