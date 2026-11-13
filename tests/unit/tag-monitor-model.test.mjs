// Feature 005 AC13: unit tests for the pure tag-monitor model (src/content/tag-monitor-model.js).
//
// tag-monitor-model.js is a classic browser script (no import/export). Node runs it here in
// an empty node:vm sandbox (as in codebook-model.test.mjs); its one global,
// `TabellifyTagMonitor`, appears as a property of the sandbox. The sandbox has no Zotero,
// window, document, IOUtils or PathUtils, so loading it proves the model needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "tag-monitor-model.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const T = sandbox.TabellifyTagMonitor;

// Objects made inside the sandbox have different prototypes; compare as plain JSON values.
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Codebook: Exposure (Heat index, Temperature), Outcome (Hospitalization, Mortality). M = 4. */
function codebook() {
  return {
    schemaVersion: 1,
    revision: 3,
    nextId: 4,
    codebooks: [{
      id: "c1",
      name: "Codebook",
      groups: [
        { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
        { id: "g3", name: "Outcome", tags: ["Hospitalization", "Mortality"] },
      ],
    }],
  };
}

/** "F005 test" (1) with "Phenotype A" (2) and "Phenotype B" (3); "Other" (9) elsewhere. */
function collections() {
  return [
    { id: 1, parentID: false, name: "F005 test" },
    { id: 2, parentID: 1, name: "Phenotype A" },
    { id: 3, parentID: 1, name: "Phenotype B" },
    { id: 9, parentID: null, name: "Other" },
  ];
}

/** The spec's smoke-test setup as plain data. */
function papers() {
  return [
    { id: 101, title: "Paper 1", collectionId: 1, itemTags: [{ tag: "Heat index" }], annotationTags: [] },
    { id: 102, title: "Paper 2", collectionId: 2, itemTags: [], annotationTags: [{ tag: "Hospitalization" }] },
    { id: 102, title: "Paper 2", collectionId: 3, itemTags: [], annotationTags: [{ tag: "Hospitalization" }] },
    { id: 103, title: "Paper 3", collectionId: 3, itemTags: [{ tag: "Temperature", type: 1 }], annotationTags: [] },
    { id: 900, title: "Elsewhere", collectionId: 9, itemTags: [{ tag: "Mortality" }], annotationTags: [] },
  ];
}

const paper = (result, id) => result.papers.find((p) => p.id === id);

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------

test("AC13: the file defines TabellifyTagMonitor without Zotero/DOM/IOUtils", () => {
  assert.equal(typeof T, "object");
  for (const fn of ["descendantIds", "summarize", "sortPapers", "paperSummary"]) assert.equal(typeof T[fn], "function", fn);
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\b(Zotero|window|document|IOUtils|PathUtils|Services|ChromeUtils)\b/);
});

// ---------------------------------------------------------------------------------------
// descendantIds
// ---------------------------------------------------------------------------------------

test("descendantIds: a collection without children gives only itself", () => {
  assert.deepEqual(plain(T.descendantIds(collections(), 2)), [2]);
  assert.deepEqual(plain(T.descendantIds(collections(), 9)), [9]);
});

test("descendantIds: nested levels, root first; siblings and other trees excluded", () => {
  const cols = [
    ...collections(),
    { id: 4, parentID: 2, name: "A child" },
    { id: 5, parentID: 4, name: "A grandchild" },
    { id: 6, parentID: 9, name: "Other child" },
  ];
  assert.deepEqual(plain(T.descendantIds(cols, 1)), [1, 2, 4, 5, 3]);
  // Starting at a subcollection excludes its sibling (3) and its parent (1).
  assert.deepEqual(plain(T.descendantIds(cols, 2)), [2, 4, 5]);
});

test("descendantIds: unknown root gives an empty list", () => {
  assert.deepEqual(plain(T.descendantIds(collections(), 42)), []);
  assert.deepEqual(plain(T.descendantIds([], 1)), []);
});

test("descendantIds: a cycle does not loop forever", () => {
  const cols = [
    { id: 1, parentID: 2, name: "A" },
    { id: 2, parentID: 1, name: "B" },
    { id: 3, parentID: 2, name: "C" },
  ];
  assert.deepEqual(plain(T.descendantIds(cols, 1)), [1, 2, 3]);
});

// ---------------------------------------------------------------------------------------
// summarize: the whole collection
// ---------------------------------------------------------------------------------------

test("summarize: the spec's smoke-test setup (AC1–AC4 as data)", () => {
  const r = T.summarize(codebook(), collections(), 1, papers());
  assert.equal(r.total, 4);
  assert.equal(r.used, 2);
  assert.equal(r.allUsed, false);
  assert.equal(r.paperCount, 3, "Paper 2 counted once; the paper in 'Other' is out of scope");
  assert.deepEqual(plain(r.groups), [
    { id: "g2", name: "Exposure", total: 2, used: 1, usedTags: [{ tag: "Heat index", papers: 1 }], remainingTags: ["Temperature"] },
    { id: "g3", name: "Outcome", total: 2, used: 1, usedTags: [{ tag: "Hospitalization", papers: 1 }], remainingTags: ["Mortality"] },
  ]);
});

test("summarize: empty codebook", () => {
  for (const data of [null, { codebooks: [] }, { codebooks: [{ id: "c1", groups: [] }] }]) {
    const r = T.summarize(data, collections(), 1, papers());
    assert.equal(r.total, 0);
    assert.equal(r.used, 0);
    assert.equal(r.allUsed, false, "an empty codebook is not 'all used'");
    assert.equal(r.paperCount, 3);
    assert.deepEqual(plain(r.groups), []);
    for (const p of r.papers) assert.deepEqual([p.count, p.total], [0, 0]);
  }
});

test("summarize: no papers", () => {
  const r = T.summarize(codebook(), collections(), 1, []);
  assert.deepEqual([r.total, r.used, r.paperCount, r.allUsed], [4, 0, 0, false]);
  assert.deepEqual(plain(r.papers), []);
  assert.deepEqual(plain(r.groups.map((g) => g.remainingTags)), [["Heat index", "Temperature"], ["Hospitalization", "Mortality"]]);
});

test("summarize: an item-tag match and a highlight-tag match both count", () => {
  const r = T.summarize(codebook(), collections(), 1, [
    { id: 1, title: "Item", collectionId: 1, itemTags: [{ tag: "Mortality" }], annotationTags: [] },
    { id: 2, title: "Highlight", collectionId: 1, itemTags: [], annotationTags: [{ tag: "Temperature" }] },
  ]);
  assert.equal(r.used, 2);
  assert.deepEqual(plain(paper(r, 1).groups[1].present), ["Mortality"]);
  assert.deepEqual(plain(paper(r, 2).groups[0].present), ["Temperature"]);
});

test("summarize: a paper under two collections counts once and keeps both names (tree order)", () => {
  const r = T.summarize(codebook(), collections(), 1, papers());
  const p2 = paper(r, 102);
  assert.deepEqual(plain(p2.collectionNames), ["Phenotype A", "Phenotype B"]);
  assert.equal(r.groups[1].usedTags[0].papers, 1);
  assert.equal(r.papers.filter((p) => p.id === 102).length, 1);
  // Listed in the opposite order: names still follow the collection tree.
  const reversed = T.summarize(codebook(), collections(), 1, [...papers()].reverse());
  assert.deepEqual(plain(paper(reversed, 102).collectionNames), ["Phenotype A", "Phenotype B"]);
  // A paper directly in the chosen collection shows the chosen collection's name (Q-new-3).
  assert.deepEqual(plain(paper(r, 101).collectionNames), ["F005 test"]);
});

test("summarize: a tag on the item and on highlights of the same paper counts the paper once", () => {
  const r = T.summarize(codebook(), collections(), 1, [
    {
      id: 1, title: "P", collectionId: 1,
      itemTags: [{ tag: "Heat index" }],
      annotationTags: [{ tag: "Heat index" }, { tag: "Heat index" }, { tag: "Heat index" }],
    },
  ]);
  assert.deepEqual(plain(r.groups[0].usedTags), [{ tag: "Heat index", papers: 1 }]);
  assert.equal(paper(r, 1).count, 1);
});

test("summarize: automatic tags (type 1) are ignored on items and highlights; missing type = manual", () => {
  const r = T.summarize(codebook(), collections(), 1, [
    {
      id: 1, title: "P", collectionId: 1,
      itemTags: [{ tag: "Heat index", type: 1 }, { tag: "Mortality" }, { tag: "Temperature", type: 0 }],
      annotationTags: [{ tag: "Hospitalization", type: 1 }],
    },
  ]);
  assert.deepEqual(plain(paper(r, 1).groups.map((g) => g.present)), [["Temperature"], ["Mortality"]]);
  assert.equal(r.used, 2);
  // The smoke-test Paper 3 (only an automatic "Temperature") has 0/4.
  const smoke = T.summarize(codebook(), collections(), 1, papers());
  assert.deepEqual([paper(smoke, 103).count, paper(smoke, 103).total], [0, 4]);
  assert.ok(smoke.groups[0].remainingTags.includes("Temperature"));
});

test("summarize: matching is case-sensitive, ignores surrounding spaces and non-codebook tags", () => {
  const r = T.summarize(codebook(), collections(), 1, [
    {
      id: 1, title: "P", collectionId: 1,
      itemTags: [{ tag: "heat index" }, { tag: "  Mortality  " }, { tag: "Off plan" }, { tag: "" }],
      annotationTags: [{ tag: " Temperature" }],
    },
  ]);
  assert.deepEqual(plain(paper(r, 1).groups.map((g) => g.present)), [["Temperature"], ["Mortality"]]);
  assert.equal(r.used, 2);
  assert.equal(r.total, 4);
  for (const g of r.groups) for (const u of g.usedTags) assert.notEqual(u.tag, "Off plan");
});

test("summarize: per-group n/m, total N/M, allUsed and paper counts", () => {
  const r = T.summarize(codebook(), collections(), 1, [
    { id: 1, title: "A", collectionId: 1, itemTags: [{ tag: "Heat index" }, { tag: "Mortality" }], annotationTags: [] },
    { id: 2, title: "B", collectionId: 2, itemTags: [{ tag: "Heat index" }], annotationTags: [{ tag: "Temperature" }] },
    { id: 3, title: "C", collectionId: 3, itemTags: [], annotationTags: [{ tag: "Hospitalization" }, { tag: "Heat index" }] },
  ]);
  assert.deepEqual([r.used, r.total, r.allUsed, r.paperCount], [4, 4, true, 3]);
  assert.deepEqual(plain(r.groups.map((g) => [g.name, g.used, g.total])), [["Exposure", 2, 2], ["Outcome", 2, 2]]);
  assert.deepEqual(plain(r.groups[0].usedTags), [{ tag: "Heat index", papers: 3 }, { tag: "Temperature", papers: 1 }]);
  assert.deepEqual(plain(r.groups.map((g) => g.remainingTags)), [[], []]);
});

test("summarize: a subcollection as root counts only its own papers (AC5 as data)", () => {
  const r = T.summarize(codebook(), collections(), 2, papers());
  assert.deepEqual([r.used, r.total, r.paperCount], [1, 4, 1]);
  assert.deepEqual(plain(paper(r, 102).collectionNames), ["Phenotype A"]);
});

test("summarize: unknown root gives no papers", () => {
  const r = T.summarize(codebook(), collections(), 42, papers());
  assert.deepEqual([r.used, r.total, r.paperCount], [0, 4, 0]);
});

// ---------------------------------------------------------------------------------------
// summarize: per paper
// ---------------------------------------------------------------------------------------

test("per paper: k/M, present and remaining grouped in codebook order (AC4 Paper 1)", () => {
  const r = T.summarize(codebook(), collections(), 1, papers());
  const p1 = paper(r, 101);
  assert.deepEqual([p1.count, p1.total], [1, 4]);
  assert.deepEqual(plain(p1.groups), [
    { id: "g2", name: "Exposure", present: ["Heat index"], remaining: ["Temperature"] },
    { id: "g3", name: "Outcome", present: [], remaining: ["Hospitalization", "Mortality"] },
  ]);
});

test("per paper: title trimmed; empty title marked untitled", () => {
  const r = T.summarize(codebook(), collections(), 1, [
    { id: 1, title: "  Spaced  ", collectionId: 1, itemTags: [], annotationTags: [] },
    { id: 2, title: "", collectionId: 1, itemTags: [], annotationTags: [] },
    { id: 3, collectionId: 1 },
  ]);
  assert.deepEqual(plain(r.papers.map((p) => [p.title, p.untitled])), [["Spaced", false], ["", true], ["", true]]);
});

// ---------------------------------------------------------------------------------------
// sortPapers (every sortable column, both directions)
// ---------------------------------------------------------------------------------------

/** Rows as summarize() returns them (only the fields sortPapers reads). */
function rows() {
  return [
    { id: 1, title: "Item 10", untitled: false, count: 1, collectionNames: ["Phenotype B"] },
    { id: 2, title: "item 2", untitled: false, count: 1, collectionNames: ["Phenotype A", "Phenotype B"] },
    { id: 3, title: "", untitled: true, count: 0, collectionNames: ["F005 test"] },
    { id: 4, title: "Zeta", untitled: false, count: 0, collectionNames: ["Phenotype A"] },
    { id: 5, title: "Alpha", untitled: false, count: 3, collectionNames: ["F005 test"] },
    { id: 6, title: "", untitled: true, count: 1, collectionNames: ["Phenotype A"] },
  ];
}
const ids = (list) => plain(list).map((p) => p.id);

test("sortPapers: default = fewest codebook tags first, then title (numeric, case-insensitive), untitled last within the same k", () => {
  const expected = [4, 3, 2, 1, 6, 5];
  assert.deepEqual(ids(T.sortPapers(rows())), expected);
  assert.deepEqual(ids(T.sortPapers(rows(), "count", "asc")), expected);
  assert.deepEqual(plain(T.DEFAULT_SORT), { key: "count", direction: "asc" });
});

test("sortPapers: count descending = most codebook tags first, title tie-break stays A→Z", () => {
  assert.deepEqual(ids(T.sortPapers(rows(), "count", "desc")), [5, 2, 1, 6, 4, 3]);
});

test("sortPapers: title ascending and descending; untitled always last", () => {
  assert.deepEqual(ids(T.sortPapers(rows(), "title", "asc")), [5, 2, 1, 4, 3, 6]);
  assert.deepEqual(ids(T.sortPapers(rows(), "title", "desc")), [4, 1, 2, 5, 3, 6]);
});

test("sortPapers: 'In' column ascending and descending, then title", () => {
  assert.deepEqual(ids(T.sortPapers(rows(), "collections", "asc")), [5, 3, 4, 6, 2, 1]);
  assert.deepEqual(ids(T.sortPapers(rows(), "collections", "desc")), [1, 2, 4, 6, 5, 3]);
});

test("sortPapers: an unknown key falls back to the count order", () => {
  assert.deepEqual(ids(T.sortPapers(rows(), "nope")), ids(T.sortPapers(rows(), "count")));
  assert.deepEqual(plain(T.SORT_KEYS), ["title", "count", "collections"]);
});

// ---------------------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------------------

test("inputs are not mutated", () => {
  const data = codebook();
  const cols = collections();
  const list = papers();
  const before = JSON.stringify([data, cols, list]);
  T.summarize(data, cols, 1, list);
  T.descendantIds(cols, 1);
  assert.equal(JSON.stringify([data, cols, list]), before);

  const r = rows();
  const rowsBefore = JSON.stringify(r);
  const sorted = T.sortPapers(r, "title", "desc");
  assert.equal(JSON.stringify(r), rowsBefore);
  assert.notEqual(sorted, r, "sortPapers returns a new array");
});

// ---------------------------------------------------------------------------------------
// paperSummary (Feature 005b AC9: one paper, for the reader's "Tabellify tags" section)
// ---------------------------------------------------------------------------------------

/** The F005b smoke-test codebook: Exposure (Heat index, Temperature), Health outcome (Hospitalization). M = 3. */
function readerCodebook() {
  return {
    schemaVersion: 1,
    revision: 1,
    nextId: 4,
    codebooks: [{
      id: "c1",
      name: "Codebook",
      groups: [
        { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
        { id: "g3", name: "Health outcome", tags: ["Hospitalization"] },
      ],
    }],
  };
}

test("F005b AC9: paperSummary — the smoke-test paper gives 2 / 3, only Exposure remaining", () => {
  const s = T.paperSummary(readerCodebook(), ["Heat index", "Hospitalization", "Unrelated"]);
  assert.deepEqual(plain(s), {
    total: 3,
    used: 2,
    allUsed: false,
    remainingByGroup: [{ id: "g2", name: "Exposure", tags: ["Temperature"] }],
  });
});

test("F005b AC9: paperSummary — exact, case-sensitive match after trimming both sides", () => {
  const data = readerCodebook();
  data.codebooks[0].groups[0].tags = ["  Heat index ", "Temperature"];
  const s = T.paperSummary(data, ["heat index", " Temperature  ", "Hospitalization "]);
  assert.equal(s.used, 2);
  assert.deepEqual(plain(s.remainingByGroup), [{ id: "g2", name: "Exposure", tags: ["Heat index"] }]);
});

test("F005b AC9: paperSummary — groups in codebook order, groups with nothing remaining omitted", () => {
  const s = T.paperSummary(codebook(), ["Hospitalization"]);
  assert.deepEqual(plain(s.remainingByGroup.map((g) => g.name)), ["Exposure", "Outcome"]);
  assert.deepEqual(plain(s.remainingByGroup[1].tags), ["Mortality"]);
  const none = T.paperSummary(codebook(), ["Heat index", "Temperature"]);
  assert.deepEqual(plain(none.remainingByGroup.map((g) => g.name)), ["Outcome"]);
});

test("F005b AC9: paperSummary — everything used gives allUsed and no remaining groups", () => {
  const s = T.paperSummary(readerCodebook(), ["Temperature", "Heat index", "Hospitalization", "Temperature"]);
  assert.deepEqual(plain(s), { total: 3, used: 3, allUsed: true, remainingByGroup: [] });
});

test("F005b AC9: paperSummary — empty or missing codebook gives total 0 (never allUsed)", () => {
  const empty = { schemaVersion: 1, revision: 0, nextId: 1, codebooks: [{ id: "c1", name: "Codebook", groups: [] }] };
  for (const data of [empty, null, undefined, {}]) {
    assert.deepEqual(plain(T.paperSummary(data, ["Heat index"])), { total: 0, used: 0, allUsed: false, remainingByGroup: [] });
  }
  // A group without tags counts nothing and is not listed.
  const noTags = { codebooks: [{ groups: [{ id: "g1", name: "Empty", tags: [] }] }] };
  assert.deepEqual(plain(T.paperSummary(noTags, [])), { total: 0, used: 0, allUsed: false, remainingByGroup: [] });
});

test("F005b AC9: paperSummary — no tags on the paper, blank names ignored", () => {
  const s = T.paperSummary(readerCodebook(), ["", "   ", null]);
  assert.equal(s.used, 0);
  assert.equal(s.total, 3);
  assert.deepEqual(plain(T.paperSummary(readerCodebook(), undefined).remainingByGroup.length), 2);
});

test("F005b AC9: paperSummary — inputs are not mutated", () => {
  const data = readerCodebook();
  const names = ["Heat index", " Temperature "];
  const before = JSON.stringify([data, names]);
  const s = T.paperSummary(data, names);
  assert.equal(JSON.stringify([data, names]), before);
  // The returned tag lists are new arrays, not the codebook's own.
  s.remainingByGroup[0]?.tags.push("x");
  assert.equal(JSON.stringify(data), JSON.stringify(readerCodebook()));
});
