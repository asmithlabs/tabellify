// Owner decision 2026-11-13 (Feature 005c) and Feature 006a AC16: rendering checks for the
// per-paper table's codebook tag columns, the ungrouped block, the group pills and the tag
// script box, run against the REAL workspace.js code in Node.
//
// workspace.js normally runs in Zotero's privileged document. Here it runs in a node:vm
// sandbox with a tiny FAKE DOM (below): just enough elements, attributes and simple CSS
// selectors for renderPaperTable(), the header builder, the Alt+arrow handler and the sort
// click handler. The fake has no innerHTML (or any other markup parser): touching one throws,
// so these tests also prove that tag names go onto the page as plain text.
// The models and stores are loaded first, in workspace.xhtml's order. `window` is not
// defined, so workspace.js does not start itself. The codebook store gets a fake file
// system (a Map), so a script-box commit really goes through the save path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");

// ---------------------------------------------------------------------------------------
// A minimal fake DOM
// ---------------------------------------------------------------------------------------

/** Does `el` match a compound selector such as `th.tabellify-fixed-header[data-group-id]`? */
function matchesCompound(el, compound) {
  const m = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/.exec(compound);
  if (!m) throw new Error(`fake DOM: selector not modelled: ${compound}`);
  if (m[1] && el.localName !== m[1]) return false;
  for (const cls of m[2].split(".").filter(Boolean)) if (!el.classList.contains(cls)) return false;
  for (const attr of m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    if (!el.hasAttribute(attr[1])) return false;
    if (attr[2] !== undefined && el.getAttribute(attr[1]) !== attr[2]) return false;
  }
  return true;
}

/** Descendant selectors ("thead th[data-group-id]") and comma lists. */
function matches(el, selector) {
  return selector.split(",").some((part) => {
    const steps = part.trim().split(/\s+/);
    if (!matchesCompound(el, steps.at(-1))) return false;
    let node = el.parentNode;
    for (let i = steps.length - 2; i >= 0; i--) {
      while (node && !matchesCompound(node, steps[i])) node = node.parentNode;
      if (!node) return false;
      node = node.parentNode;
    }
    return true;
  });
}

const toDataKey = (attr) => attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const toDataAttr = (key) => "data-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

class FakeElement {
  constructor(localName) {
    this.localName = localName;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.text = "";
    this.styleProps = new Map();
    this.focused = false;
    const self = this;
    this.classList = {
      add: (...c) => { const s = self.classes(); for (const x of c) s.add(x); self.setClasses(s); },
      remove: (...c) => { const s = self.classes(); for (const x of c) s.delete(x); self.setClasses(s); },
      contains: (c) => self.classes().has(c),
      toggle: (c, force) => {
        const s = self.classes();
        const on = force === undefined ? !s.has(c) : Boolean(force);
        if (on) s.add(c); else s.delete(c);
        self.setClasses(s);
        return on;
      },
    };
    // element.dataset: data-* attributes as camelCase properties.
    this.dataset = new Proxy({}, {
      get: (_, key) => (typeof key === "string" ? self.attrs.get(toDataAttr(key)) : undefined),
      set: (_, key, value) => { self.attrs.set(toDataAttr(key), String(value)); return true; },
      has: (_, key) => self.attrs.has(toDataAttr(key)),
      ownKeys: () => [...self.attrs.keys()].filter((a) => a.startsWith("data-")).map(toDataKey),
      getOwnPropertyDescriptor: (_, key) => ({ enumerable: true, configurable: true, value: self.attrs.get(toDataAttr(key)) }),
    });
    this.style = { setProperty: (name, value) => self.styleProps.set(name, value) };
  }
  classes() { return new Set((this.attrs.get("class") ?? "").split(/\s+/).filter(Boolean)); }
  setClasses(set) { this.attrs.set("class", [...set].join(" ")); }
  get className() { return this.attrs.get("class") ?? ""; }
  set className(v) { this.attrs.set("class", String(v)); }
  get id() { return this.attrs.get("id") ?? ""; }
  set id(v) { this.attrs.set("id", String(v)); }
  get title() { return this.attrs.get("title") ?? ""; }
  set title(v) { this.attrs.set("title", String(v)); }
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(v) { if (v) this.attrs.set("hidden", ""); else this.attrs.delete("hidden"); }
  get colSpan() { return Number(this.attrs.get("colspan") ?? 1); }
  set colSpan(v) { this.attrs.set("colspan", String(v)); }
  get rowSpan() { return Number(this.attrs.get("rowspan") ?? 1); }
  set rowSpan(v) { this.attrs.set("rowspan", String(v)); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.children = []; this.text = String(v); }
  // Markup parsers are not modelled: using one is a bug (no-html-sinks), so it throws.
  get innerHTML() { throw new Error("innerHTML used"); }
  set innerHTML(_) { throw new Error("innerHTML used"); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  adopt(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    return child;
  }
  append(...nodes) { for (const n of nodes) this.children.push(this.adopt(n)); }
  insertBefore(node, ref) {
    this.adopt(node);
    const i = this.children.indexOf(ref);
    if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
  }
  replaceChildren(...nodes) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this.text = "";
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(selector) { return this.descendants().filter((el) => matches(el, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) if (matches(node, selector)) return node;
    return null;
  }
  focus() { this.focused = true; activeElement = this; }
  // F006c: table cells and rows. cellIndex = position in the row; cells = the row's cells.
  get cellIndex() { return this.parentNode ? this.parentNode.children.indexOf(this) : -1; }
  get cells() { return this.children.filter((c) => c.localName === "td" || c.localName === "th"); }
  // Every element is 100px wide at x = 0 (drop side: clientX < 50 is "before").
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }; }
  // Text inputs (the script box): the selected range, set by setSelectionRange.
  setSelectionRange(start, end) {
    this.selection = [start, end];
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  // F006b: replace characters [start, end) of the value; "end" puts the cursor after them.
  setRangeText(text, start, end, mode) {
    const value = String(this.value ?? "");
    this.value = value.slice(0, start) + text + value.slice(end);
    if (mode === "end") this.setSelectionRange(start + text.length, start + text.length);
  }
}

/** The fake document's focused element (set by focus()). */
let activeElement = null;

/** The parts of workspace.xhtml the table code uses, built like the real markup. */
function makeDocument() {
  const byId = new Map();
  const el = (tag, attrs = {}, ...children) => {
    const e = new FakeElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.append(...children);
    if (attrs.id) byId.set(attrs.id, e);
    return e;
  };
  const sortButton = (key) => el("button", { class: "tabellify-sort", "data-sort": key });
  el("table", { id: "tabellify-items-table" },
    el("colgroup", { id: "tabellify-items-cols" }),
    el("thead", {},
      el("tr", { id: "tabellify-items-group-row", class: "tabellify-group-row" },
        el("th", { rowspan: "2", class: "tabellify-col-grip tabellify-fixed-header" }),
        el("th", { rowspan: "2", class: "tabellify-col-title tabellify-fixed-header" }, sortButton("title")),
        el("th", { id: "tabellify-items-count-header", rowspan: "2", class: "tabellify-col-count tabellify-fixed-header" }, sortButton("count")),
      ),
      el("tr", { id: "tabellify-items-tag-row", class: "tabellify-tag-row" }),
    ),
    el("tbody", { id: "tabellify-items-body" }),
  );
  return {
    byId,
    getElementById(id) {
      // Elements outside the table (messages, toolbar buttons, …) are made on first use.
      if (!byId.has(id)) byId.set(id, new FakeElement("div"));
      return byId.get(id);
    },
    querySelectorAll: () => [], // the ".tabellify-status" paragraphs are not needed here
    createElementNS: (_ns, tag) => new FakeElement(tag),
    get activeElement() { return activeElement; },
    defaultView: {}, // the document is "alive" (onNotify checks this)
  };
}

// ---------------------------------------------------------------------------------------
// Loading workspace.js with its models
// ---------------------------------------------------------------------------------------

function load() {
  const document = makeDocument();
  activeElement = null;
  const debug = [];
  const Zotero = { debug: (m) => debug.push(m), logError: () => {} };
  const sandbox = vm.createContext({ document, Zotero });
  for (const name of ["codebook-model.js", "codebook-store.js", "tag-script-model.js", "script-suggest-model.js",
    "tag-monitor-model.js", "table-layout-model.js", "regroup-model.js", "workspace.js"]) {
    const file = join(contentDir, name);
    vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  }
  const W = sandbox.TabellifyWorkspace;
  W.strings = {
    "tabellify-table-tag-used": "Used",
    "tabellify-table-tag-not-used": "Not used",
    "tabellify-table-move-group": "Move group:",
    "tabellify-table-move-tag": "Move column:",
    "tabellify-table-move-paper": "Move paper:",
    "tabellify-table-moved-to": "moved to position",
    "tabellify-table-of": "of",
    "tabellify-table-ungrouped-label": "Ungrouped",
    "tabellify-pill-ungrouped": "Ungrouped",
    "tabellify-pill-tags": "tags",
    "tabellify-pills-label": "Groups",
  };
  W.monitorReady = true;
  W.codebookLoadDone = true;
  W.layoutEditable = false; // no layout file in these tests: layoutChanged() does nothing
  return {
    W, T: sandbox.TabellifyTagMonitor, L: sandbox.TabellifyTableLayout, C: sandbox.TabellifyCodebook,
    S: sandbox.TabellifyScriptSuggest, R: sandbox.TabellifyRegroup, Zotero, document, debug,
  };
}

/**
 * A codebooks.json-shaped object, schema 2 (ADR-0016), written compactly: `groups` as
 * `{ id, name, tags }` and the names of the ungrouped tags (stored first).
 */
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
const GROUPS = () => [
  { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
  { id: "g3", name: "Outcome", tags: ["Mortality"] },
  { id: "g4", name: "Empty", tags: [] },
];

/** The smoke-test collection as gatherMonitorData() would read it. */
function monitorData() {
  return {
    rootId: 1,
    collections: [{ id: 1, parentID: false, name: "F005 test" }],
    collectionKeys: new Map([[1, "1/COLL0001"]]),
    papers: [
      // Paper 1: "Heat index" only on the paper item; "Mortality" on a highlight.
      { id: 101, title: "Paper 1", collectionId: 1, itemTags: [{ tag: "Heat index" }], annotationTags: [{ tag: "Mortality" }] },
      // Paper 2: "Temperature" and "Heat index" on highlights.
      { id: 102, title: "Paper 2", collectionId: 1, itemTags: [], annotationTags: [{ tag: "Temperature" }, { tag: "Heat index" }] },
      { id: 103, title: "Paper 3", collectionId: 1, itemTags: [], annotationTags: [] },
    ],
    keys: new Map([[101, "ITEM0101"], [102, "ITEM0102"], [103, "ITEM0103"]]),
    annotationErrors: 0,
    scopeSize: 1,
  };
}

/** Load, set up a codebook and a collection, and render once. */
function setup({ groups = GROUPS(), ungrouped = [], countItemTags = false, columnLayout = null } = {}) {
  const env = load();
  const { W, L } = env;
  W.codebook = codebookData(groups, ungrouped);
  W.monitorData = monitorData();
  W.collectionKeys = W.monitorData.collectionKeys;
  W.currentCollection = "1";
  W.countItemTags = countItemTags;
  W.columnLayout = columnLayout ?? L.emptyColumnLayout();
  W.renderMonitor();
  return env;
}

const headerRow = (doc, id) => doc.byId.get(id).children;
/** Short names of the first header row: "grip", "title", "count", "group:<id>/<span>", "tag:<name>". */
function groupHeaders(doc) {
  return headerRow(doc, "tabellify-items-group-row").map((th) => {
    if (th.classList.contains("tabellify-col-grip")) return "grip";
    if (th.classList.contains("tabellify-col-title")) return "title";
    if (th.classList.contains("tabellify-col-count")) return "count";
    if (th.hasAttribute("data-tag")) return `tag:${th.dataset.tag}`;
    return `group:${th.dataset.groupId}/${th.colSpan}`;
  });
}
const tagHeaders = (doc) => headerRow(doc, "tabellify-items-tag-row").map((th) => th.dataset.tag);
const bodyRows = (doc) => doc.byId.get("tabellify-items-body").children;
/** One row as text: title, then "✓"/"·" per tag column, then the k/M text. */
function rowText(tr) {
  return tr.children.slice(1).map((td) => {
    if (td.classList.contains("tabellify-col-tag")) return td.classList.contains("tabellify-tag-used") ? "✓" : "·";
    return td.textContent;
  }).join(" | ");
}
const rowTitles = (doc) => bodyRows(doc).map((tr) => tr.children[1].textContent);

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

test("render: header = grip, Title, one group header per super-tag (spanning its tags), k/M", () => {
  const { document } = setup();
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g2/2", "group:g3/1", "count"]);
  assert.deepEqual(tagHeaders(document), ["Heat index", "Temperature", "Mortality"]);
  // A group without tags has no column. The fixed cells span both header rows.
  const fixed = headerRow(document, "tabellify-items-group-row").filter((th) => th.classList.contains("tabellify-fixed-header"));
  assert.deepEqual(fixed.map((th) => th.rowSpan), [2, 2, 2]);
  assert.equal(document.byId.get("tabellify-items-tag-row").hidden, false);
  // One <col> per column (for the widths) and the tag count for the table width.
  const cols = document.byId.get("tabellify-items-cols").children.map((c) => c.className);
  assert.deepEqual(cols, ["tabellify-col-grip", "tabellify-col-title", "tabellify-col-tag", "tabellify-col-tag", "tabellify-col-tag", "tabellify-col-count"]);
  assert.equal(document.byId.get("tabellify-items-table").styleProps.get("--tabellify-tag-columns"), "3");
  // Group and tag headers carry a grip with a plain-text screen-reader name.
  const [g2] = headerRow(document, "tabellify-items-group-row").filter((th) => th.dataset.groupId === "g2");
  assert.equal(g2.querySelector(".tabellify-grip").getAttribute("aria-label"), "Move group: Exposure");
  assert.equal(g2.title, "Exposure");
  const heat = headerRow(document, "tabellify-items-tag-row")[0];
  assert.equal(heat.querySelector(".tabellify-grip").getAttribute("aria-label"), "Move column: Heat index");
  assert.equal(heat.querySelector("button[data-sort]").dataset.sort, "tag:Heat index");
});

test("render: ✓ cells follow the counting rule (highlights only by default; checkbox adds item tags)", () => {
  const off = setup();
  // Default sort: fewest codebook tags first, then title.
  assert.deepEqual(bodyRows(off.document).map(rowText), [
    "Paper 3 | · | · | · | 0/3",
    "Paper 1 | · | · | ✓ | 1/3",
    "Paper 2 | ✓ | ✓ | · | 2/3",
  ]);
  const cell = bodyRows(off.document)[1].children[2];
  assert.equal(cell.getAttribute("aria-label"), "Heat index: Not used");
  assert.equal(cell.title, "Heat index: Not used");
  assert.equal(cell.textContent, "", "the ✓ is drawn by CSS, the text is in aria-label");
  assert.equal(bodyRows(off.document)[2].children[2].getAttribute("aria-label"), "Heat index: Used");

  const on = setup({ countItemTags: true });
  assert.equal(bodyRows(on.document).map(rowText).find((r) => r.startsWith("Paper 1")), "Paper 1 | ✓ | · | ✓ | 2/3");
});

test("render: every row has the same columns as the header; stripes on every other row", () => {
  const { document } = setup();
  for (const tr of bodyRows(document)) {
    assert.equal(tr.children.length, 1 + 1 + 3 + 1, "grip + title + 3 tags + k/M");
    assert.ok(tr.children[0].querySelector(".tabellify-grip"), "row grip first");
    assert.ok(tr.children.at(-1).classList.contains("tabellify-col-count"), "k/M last");
  }
  assert.deepEqual(bodyRows(document).map((tr) => tr.classList.contains("tabellify-row-alt")), [false, true, false]);
  // No detail rows any more.
  assert.equal(document.byId.get("tabellify-items-body").querySelectorAll("tr").length, 3);
});

test("render: the saved column order is used; codebook additions and removals follow at once", () => {
  const { W, document } = setup({ columnLayout: { topOrder: [{ group: "g3" }, { group: "g2" }], tagOrder: { g2: ["Temperature", "Heat index"] } } });
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g3/1", "group:g2/2", "count"]);
  assert.deepEqual(tagHeaders(document), ["Mortality", "Temperature", "Heat index"]);
  assert.deepEqual(rowText(bodyRows(document).find((tr) => tr.children[1].textContent === "Paper 2")), "Paper 2 | · | ✓ | ✓ | 2/3");
  // A tag added to the codebook: a new column at the end of its group.
  W.codebook = codebookData([{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature", "Humidity"] }, { id: "g3", name: "Outcome", tags: ["Mortality"] }]);
  W.renderMonitor();
  assert.deepEqual(tagHeaders(document), ["Mortality", "Temperature", "Heat index", "Humidity"]);
  // A group and a tag removed from the codebook: their columns disappear.
  W.codebook = codebookData([{ id: "g2", name: "Exposure", tags: ["Heat index"] }]);
  W.renderMonitor();
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g2/1", "count"]);
  assert.deepEqual(tagHeaders(document), ["Heat index"]);
  assert.equal(bodyRows(document)[0].children.length, 4);
});

test("render: without codebook tags only Title and k/M show; the tag header row is hidden", () => {
  const { document } = setup({ groups: [{ id: "g2", name: "Exposure", tags: [] }] });
  assert.deepEqual(groupHeaders(document), ["grip", "title", "count"]);
  assert.equal(document.byId.get("tabellify-items-tag-row").hidden, true);
  const fixed = headerRow(document, "tabellify-items-group-row").filter((th) => th.classList.contains("tabellify-fixed-header"));
  assert.deepEqual(fixed.map((th) => th.rowSpan), [1, 1, 1]);
  assert.deepEqual(bodyRows(document).map((tr) => tr.children.at(-1).textContent), ["–", "–", "–"]);
});

test("render: tag and group names with markup characters stay plain text", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const { document } = setup({ groups: [{ id: "g2", name: `${evil} group`, tags: [evil] }] });
  const th = headerRow(document, "tabellify-items-tag-row")[0];
  assert.equal(th.dataset.tag, evil);
  assert.equal(th.querySelector("button[data-sort]").textContent, evil);
  assert.equal(bodyRows(document)[0].children[2].getAttribute("aria-label"), `${evil}: Not used`);
  // (The fake DOM throws on innerHTML, so reaching this line also proves none was used.)
});

/** A fake Alt+arrow keydown on a grip, handled by the real onTableKeydown. */
function altKey(W, grip, key) {
  let prevented = false;
  W.onTableKeydown({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key, target: grip, preventDefault: () => { prevented = true; } });
  return prevented;
}
const tagGrip = (doc, tag) => headerRow(doc, "tabellify-items-tag-row").find((th) => th.dataset.tag === tag).querySelector(".tabellify-grip");
const groupGrip = (doc, id) => headerRow(doc, "tabellify-items-group-row").find((th) => th.dataset.groupId === id).querySelector(".tabellify-grip");

test("keyboard: Alt+Right/Left moves a tag only inside its group; focus stays on its grip", () => {
  const { W, document, debug } = setup();
  assert.equal(altKey(W, tagGrip(document, "Heat index"), "ArrowRight"), true);
  assert.deepEqual(tagHeaders(document), ["Temperature", "Heat index", "Mortality"]);
  assert.equal(tagGrip(document, "Heat index").focused, true);
  assert.match(document.byId.get("tabellify-table-announce").textContent, /^Heat index moved to position 2 of 2$/);
  assert.ok(debug.includes("Tabellify: workspace: layout: a tag column of group g2 moved to position 2 of 2 in its group (keyboard)"), debug.join("\n"));
  // At the group's right edge: no jump into the next group.
  altKey(W, tagGrip(document, "Heat index"), "ArrowRight");
  assert.deepEqual(tagHeaders(document), ["Temperature", "Heat index", "Mortality"]);
  // The codebook itself is unchanged.
  assert.deepEqual(JSON.parse(JSON.stringify(W.codebook)), codebookData(GROUPS()));
  assert.deepEqual(JSON.parse(JSON.stringify(W.columnLayout)), { topOrder: [], tagOrder: { g2: ["Temperature", "Heat index"] } });
});

test("keyboard: Alt+Left/Right on a group header moves the whole group among the groups", () => {
  const { W, document, debug } = setup();
  altKey(W, groupGrip(document, "g3"), "ArrowLeft");
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g3/1", "group:g2/2", "count"]);
  assert.deepEqual(tagHeaders(document), ["Mortality", "Heat index", "Temperature"]);
  assert.equal(groupGrip(document, "g3").focused, true);
  assert.ok(debug.includes("Tabellify: workspace: layout: group g3 moved to top-level position 1 of 2 (keyboard)"), debug.join("\n"));
  assert.match(document.byId.get("tabellify-table-announce").textContent, /^Outcome moved to position 1 of 2$/);
  // Title stays first and k/M last; the first group cannot move further left.
  altKey(W, groupGrip(document, "g3"), "ArrowLeft");
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g3/1", "group:g2/2", "count"]);
  // Body cells follow the header.
  assert.equal(rowText(bodyRows(document).find((tr) => tr.children[1].textContent === "Paper 1")), "Paper 1 | ✓ | · | · | 1/3");
});

test("Reset columns restores the codebook order", () => {
  const { W, document, debug } = setup({ columnLayout: { topOrder: [{ group: "g3" }], tagOrder: { g2: ["Temperature"] } } });
  const button = new FakeElement("button");
  button.setAttribute("data-action", "reset-columns");
  W.onToolbarClick({ target: button });
  assert.deepEqual(tagHeaders(document), ["Heat index", "Temperature", "Mortality"]);
  assert.ok(debug.includes("Tabellify: workspace: layout: columns reset to the codebook order"));
});

/** Click a header sort button (the real delegated onTableClick). */
function clickSort(W, doc, key) {
  const button = doc.byId.get("tabellify-items-table").querySelectorAll("button[data-sort]").find((b) => b.dataset.sort === key);
  W.onTableClick({ target: button });
  return button;
}

test("sort: a tag column sorts ✓ first, a second click ✓ last; Title and k/M still sort", () => {
  const { W, document } = setup();
  const button = clickSort(W, document, "tag:Heat index");
  assert.deepEqual(rowTitles(document), ["Paper 2", "Paper 1", "Paper 3"]);
  assert.equal(button.closest("th").getAttribute("aria-sort"), "ascending");
  assert.equal(button.focused, true);
  clickSort(W, document, "tag:Heat index");
  assert.deepEqual(rowTitles(document), ["Paper 1", "Paper 3", "Paper 2"]);
  assert.equal(button.closest("th").getAttribute("aria-sort"), "descending");
  clickSort(W, document, "title");
  assert.deepEqual(rowTitles(document), ["Paper 1", "Paper 2", "Paper 3"]);
  assert.equal(button.closest("th").hasAttribute("aria-sort"), false);
  clickSort(W, document, "count");
  assert.deepEqual(rowTitles(document), ["Paper 3", "Paper 1", "Paper 2"]);
});

test("sort: when the sorted tag leaves the codebook, the table falls back to the default sort", () => {
  const { W, T, document } = setup();
  clickSort(W, document, "tag:Mortality");
  assert.deepEqual(rowTitles(document), ["Paper 1", "Paper 2", "Paper 3"]);
  W.codebook = codebookData([{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] }]);
  W.renderMonitor();
  assert.equal(W.sortKey, T.DEFAULT_SORT.key);
  assert.deepEqual(rowTitles(document), ["Paper 1", "Paper 3", "Paper 2"]);
});

// ---------------------------------------------------------------------------------------
// Feature 005d AC14: the "complete" k/M cell (spec Q6) and the Remaining card (Q5)
// ---------------------------------------------------------------------------------------

/** Title → [k/M text, has tabellify-count-complete] for every row. */
function countCells(doc) {
  return Object.fromEntries(bodyRows(doc).map((tr) => {
    const cell = tr.children.at(-1);
    return [tr.children[1].textContent, [cell.textContent, cell.classList.contains("tabellify-count-complete")]];
  }));
}

test("F005d AC14: k/M is marked complete exactly when the paper has every codebook tag (highlights only)", () => {
  // Paper 2 has both Exposure tags on highlights; Paper 1 has "Heat index" only on the item.
  const { document } = setup({ groups: [{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] }] });
  assert.deepEqual(countCells(document), {
    "Paper 1": ["0/2", false],
    "Paper 2": ["2/2", true],
    "Paper 3": ["0/2", false],
  });
});

test("F005d AC14: with item tags counted, a paper becomes complete through its item tag", () => {
  const groups = [{ id: "g2", name: "Exposure", tags: ["Heat index"] }, { id: "g3", name: "Outcome", tags: ["Mortality"] }];
  const off = setup({ groups });
  assert.deepEqual(countCells(off.document), {
    "Paper 1": ["1/2", false],
    "Paper 2": ["1/2", false],
    "Paper 3": ["0/2", false],
  });
  const on = setup({ groups, countItemTags: true });
  assert.deepEqual(countCells(on.document), {
    "Paper 1": ["2/2", true],
    "Paper 2": ["1/2", false],
    "Paper 3": ["0/2", false],
  });
});

test("F005d AC14: never complete without codebook tags (k/M shows –)", () => {
  const { document } = setup({ groups: [{ id: "g2", name: "Exposure", tags: [] }] });
  for (const [text, complete] of Object.values(countCells(document))) {
    assert.equal(text, "–");
    assert.equal(complete, false);
  }
});

test("F006a Q2: one summary line (Tags used k/M, Papers n, all used); no Remaining card", () => {
  const { W, document } = setup(); // 3 codebook tags, all 3 used across the collection
  assert.equal(document.getElementById("tabellify-monitor-summary").hidden, false);
  assert.equal(document.getElementById("tabellify-monitor-used").textContent, "tabellify-monitor-tags-used 3/3"); // test strings: ID as text
  assert.equal(document.getElementById("tabellify-monitor-papers").textContent, "tabellify-monitor-papers 3");
  assert.equal(document.getElementById("tabellify-monitor-all-used").hidden, false);
  W.codebook = codebookData([{ id: "g2", name: "Exposure", tags: ["Heat index", "Humidity", "Wind"] }]);
  W.renderMonitor();
  assert.equal(document.getElementById("tabellify-monitor-used").textContent, "tabellify-monitor-tags-used 1/3");
  assert.equal(document.getElementById("tabellify-monitor-all-used").hidden, true);
  // The removed per-group cards and the Remaining card are not filled any more.
  assert.equal(document.byId.has("tabellify-monitor-groups"), false);
  assert.equal(document.byId.has("tabellify-monitor-remaining-total"), false);
});

// ---------------------------------------------------------------------------------------
// Feature 006a AC16: the ungrouped block, the one-row header, the pills, the script box
// ---------------------------------------------------------------------------------------

/** Every text and attribute value in a subtree (to look for "null"). */
function allText(el) {
  return [el.text, ...el.attrs.values(), ...el.children.flatMap(allText)];
}

test("AC16 / 006c AC31: ungrouped tags sit first under an 'Ungrouped' run header (muted, data-run, no grip, no 'null')", () => {
  const { document } = setup({ ungrouped: ["age", "sex"] });
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:ungrouped/2", "group:g2/2", "group:g3/1", "count"]);
  assert.deepEqual(tagHeaders(document), ["age", "sex", "Heat index", "Temperature", "Mortality"]);
  const th = headerRow(document, "tabellify-items-group-row").find((h) => h.dataset.groupId === "ungrouped");
  assert.equal(th.textContent, "Ungrouped", "the visible text names the run");
  assert.equal(th.dataset.run, "0");
  assert.equal(th.colSpan, 2);
  assert.ok(th.classList.contains("tabellify-col-group-ungrouped"), "muted style");
  assert.equal(th.hasAttribute("aria-label"), false, "no aria-label override: the text names it");
  assert.equal(th.hasAttribute("title"), false, "no tooltip");
  assert.equal(th.querySelector(".tabellify-grip"), null, "no grip on a run header");
  // The ungrouped tags are real columns: ✓ cells and k/M include them.
  assert.equal(bodyRows(document)[0].children.length, 1 + 1 + 5 + 1);
  assert.ok(bodyRows(document).every((tr) => tr.children.at(-1).textContent.endsWith("/5")));
  // "null" appears nowhere in the table.
  const table = document.byId.get("tabellify-items-table");
  assert.ok(allText(table).every((t) => !String(t).includes("null")), "no 'null' in the table");
});

test("AC16: only ungrouped tags → one header row (tag headers in the first row, second row hidden)", () => {
  const { document } = setup({ groups: [{ id: "g2", name: "Empty", tags: [] }], ungrouped: ["age", "sex"] });
  assert.deepEqual(groupHeaders(document), ["grip", "title", "tag:age", "tag:sex", "count"]);
  assert.equal(document.byId.get("tabellify-items-tag-row").hidden, true);
  assert.deepEqual(tagHeaders(document), []);
  const fixed = headerRow(document, "tabellify-items-group-row").filter((th) => th.classList.contains("tabellify-fixed-header"));
  assert.deepEqual(fixed.map((th) => th.rowSpan), [1, 1, 1]);
  assert.equal(document.byId.get("tabellify-items-cols").children.length, 2 + 2 + 1);
  assert.deepEqual(bodyRows(document).map((tr) => tr.children.length), [5, 5, 5]);
  // Sorting by an ungrouped tag column works (the sort button is in the first row).
  const age = headerRow(document, "tabellify-items-group-row").find((th) => th.dataset.tag === "age");
  assert.equal(age.querySelector("button[data-sort]").dataset.sort, "tag:age");
  // No run header (and so no "Ungrouped" text) in the one-row header (AC16 of Amendment 2).
  assert.equal(document.byId.get("tabellify-items-table").querySelectorAll("th[data-run]").length, 0);
});

test("006c AC31: a saved topOrder with ungrouped tags between groups shows one run header per run", () => {
  const { W, document } = setup({
    ungrouped: ["age", "sex"],
    columnLayout: { topOrder: [{ group: "g2" }, { tag: "sex" }, { group: "g3" }, { tag: "age" }], tagOrder: {} },
  });
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g2/2", "group:ungrouped/1", "group:g3/1", "group:ungrouped/1", "count"]);
  assert.deepEqual(tagHeaders(document), ["Heat index", "Temperature", "sex", "Mortality", "age"]);
  const runs = document.byId.get("tabellify-items-table").querySelectorAll("th[data-run]");
  assert.deepEqual(runs.map((th) => [th.dataset.run, th.textContent]), [["0", "Ungrouped"], ["1", "Ungrouped"]]);
  assert.equal(W.runHeader(1), runs[1]);
  assert.equal(W.columnHeader("ungrouped"), null, "run headers are found with runHeader(k) only");
  // Alt+Left on an ungrouped tag steps past one whole group (a top-level move).
  altKey(W, tagGrip(document, "age"), "ArrowLeft");
  assert.deepEqual(tagHeaders(document), ["Heat index", "Temperature", "sex", "age", "Mortality"]);
  assert.equal(tagGrip(document, "age").focused, true);
  assert.match(document.byId.get("tabellify-table-announce").textContent, /^age moved to position 3 of 4$/);
  // The two runs are now one.
  assert.equal(document.byId.get("tabellify-items-table").querySelectorAll("th[data-run]").length, 1);
  // A group grip also moves one top-level place: past one ungrouped tag.
  altKey(W, groupGrip(document, "g2"), "ArrowRight");
  assert.deepEqual(tagHeaders(document), ["sex", "Heat index", "Temperature", "age", "Mortality"]);
  // Alt+Left/Right never changes the codebook.
  assert.deepEqual(JSON.parse(JSON.stringify(W.codebook)), codebookData(GROUPS(), ["age", "sex"]));
});

/** Pills as "<name> · <count>" plus their classes. */
function pills(doc) {
  return doc.getElementById("tabellify-group-pills").children.map((li) => {
    const [name, count] = li.children;
    return `${name.textContent} · ${count.textContent}${li.classList.contains("tabellify-pill-ungrouped") ? " (u)" : ""}`;
  });
}

test("AC16: pills follow the table's block order, then groups without tags with 0; ungrouped hidden at 0", () => {
  const { W, document } = setup({
    groups: [...GROUPS(), { id: "g5", name: "Planned", tags: [] }],
    ungrouped: ["age"],
    columnLayout: { topOrder: [{ group: "g3" }, { group: "ungrouped" }, { group: "g2" }], tagOrder: {} },
  });
  assert.deepEqual(pills(document), ["Outcome · 1", "Ungrouped · 1 (u)", "Exposure · 2", "Empty · 0", "Planned · 0"]);
  const list = document.getElementById("tabellify-group-pills");
  assert.equal(list.hidden, false);
  assert.equal(list.getAttribute("aria-label"), "Groups");
  assert.equal(list.children[1].getAttribute("aria-label"), "Ungrouped: 1 tags");
  assert.equal(list.children[0].getAttribute("aria-label"), "Outcome: 1 tags");
  // No ungrouped tags → no ungrouped pill.
  W.codebook = codebookData(GROUPS());
  W.renderMonitor();
  assert.deepEqual(pills(document), ["Outcome · 1", "Exposure · 2", "Empty · 0"]);
  // No codebook → no pills, list hidden.
  W.codebook = null;
  W.renderMonitor();
  assert.deepEqual(pills(document), []);
  assert.equal(list.hidden, true);
});

test("AC16: pills are shown before a collection is chosen; names with markup stay text", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const env = load();
  env.W.codebook = codebookData([{ id: "g2", name: evil, tags: ["a"] }]);
  env.W.monitorReady = false; // strings not ready yet: pills still render from the codebook
  env.W.renderMonitor();
  const li = env.document.getElementById("tabellify-group-pills").children[0];
  assert.equal(li.children[0].textContent, evil);
  assert.equal(li.children[0].children.length, 0, "plain text, no child elements");
  assert.equal(li.getAttribute("aria-label"), `${evil}: 1 tags`);
});

/** A setup with the script box and a fake codebooks.json on a fake disk. */
function scriptSetup({ onDisk, codebook }) {
  const env = setup({ groups: GROUPS() });
  const { W, document } = env;
  const files = new Map([["/d/codebooks.json", JSON.stringify(onDisk)]]);
  const writes = [];
  W.codebookFs = {
    readJSON: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
      return JSON.parse(files.get(path));
    },
    writeJSON: async (path, value, options) => {
      writes.push([path, JSON.parse(JSON.stringify(options))]);
      if (options?.mode === "create" && files.has(path)) throw new Error("exists");
      if (options?.backupFile && files.has(path)) files.set(options.backupFile, files.get(path));
      files.set(path, JSON.stringify(value));
    },
    makeDirectory: async () => {},
    join: (...parts) => parts.join("/"),
  };
  W.codebookDir = "/d";
  W.codebook = codebook;
  W.codebookRevision = codebook.revision;
  W.codebookEditable = true;
  const input = document.getElementById("tabellify-script-input");
  input.setAttribute("data-action", "script-input");
  return { ...env, files, writes, input, error: document.getElementById("tabellify-script-error") };
}

test("AC16: a successful script commit saves, clears the input, keeps focus, updates pills and table", async () => {
  const data = codebookData(GROUPS());
  const s = scriptSetup({ onDisk: data, codebook: data });
  s.input.value = "age, Outcome(Heat index), Humidity(rh)";
  let prevented = false;
  s.W.onCodebookKeydown({ key: "Enter", target: s.input, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  // Let the save (several awaits on the fake disk) finish.
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.equal(s.input.value, "");
  assert.equal(s.input.focused, true);
  assert.equal(s.input.hasAttribute("aria-invalid"), false);
  const saved = JSON.parse(s.files.get("/d/codebooks.json"));
  assert.equal(saved.revision, 2);
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(pills(s.document), ["Ungrouped · 1 (u)", "Exposure · 1", "Outcome · 2", "Humidity · 1", "Empty · 0"]);
  assert.deepEqual(tagHeaders(s.document), ["age", "Temperature", "Mortality", "Heat index", "rh"]);
  // "Codebook saved." plus "Some tags were moved…" (test strings: IDs as text).
  assert.equal(s.document.getElementById("tabellify-codebook-status-text").textContent,
    "tabellify-codebook-saved tabellify-script-moved");
  // Only Tabellify's own file was written.
  assert.deepEqual(s.writes.map((w) => w[0]), ["/d/codebooks.json"]);
});

test("AC16: a failed script commit keeps the text, sets aria-invalid and selects the problem; editing hides it", async () => {
  const data = codebookData(GROUPS());
  const s = scriptSetup({ onDisk: data, codebook: data });
  s.input.value = "Exposure(Heat index";
  await s.W.commitScript();
  assert.equal(s.input.value, "Exposure(Heat index");
  assert.equal(s.input.getAttribute("aria-invalid"), "true");
  assert.deepEqual(s.input.selection, [8, 19]);
  assert.equal(s.error.hidden, false);
  assert.equal(s.error.textContent, "tabellify-script-error-unbalanced");
  assert.deepEqual(s.writes, [], "nothing saved");
  // Editing the text hides the error.
  s.W.onCodebookInput({ target: s.input });
  assert.equal(s.error.hidden, true);
  assert.equal(s.input.hasAttribute("aria-invalid"), false);
});

test("AC16: an entry with nothing new is not saved; an empty entry does nothing", async () => {
  const data = codebookData(GROUPS());
  const s = scriptSetup({ onDisk: data, codebook: data });
  s.input.value = "Exposure(Heat index)";
  await s.W.commitScript();
  assert.deepEqual(s.writes, []);
  assert.equal(s.input.value, "");
  assert.equal(s.document.getElementById("tabellify-codebook-status-text").textContent, "tabellify-script-nothing-new");
  s.input.value = " , ";
  await s.W.commitScript();
  assert.equal(s.input.value, " , ");
  assert.deepEqual(s.writes, []);
});

test("AC16 / ADR-0016 §3: the first commit over a version 1 file keeps the v1 copy and writes version 2", async () => {
  const v1 = {
    schemaVersion: 1, revision: 4, nextId: 4,
    codebooks: [{ id: "c1", name: "Codebook", groups: [{ id: "g2", name: "Exposure", tags: ["Heat index"] }] }],
  };
  const env = load();
  const s = scriptSetup({ onDisk: v1, codebook: env.C.migrate(v1) });
  s.input.value = "age";
  await s.W.commitScript();
  assert.deepEqual(JSON.parse(s.files.get("/d/codebooks.v1.json")), v1);
  assert.equal(JSON.parse(s.files.get("/d/codebooks.json")).schemaVersion, 2);
  assert.equal(JSON.parse(s.files.get("/d/codebooks.json.bak")).schemaVersion, 1);
  assert.deepEqual(s.writes.map((w) => w[1]), [{ mode: "create" }, { tmpPath: "/d/codebooks.json.tmp", backupFile: "/d/codebooks.json.bak" }]);
  assert.ok(s.debug.some((m) => m.includes("kept the schemaVersion 1 data once")), s.debug.join("\n"));
});

test("AC16: the editor lists ungrouped tags first; Delete ungroups a group's tags without confirmation", async () => {
  const data = codebookData(GROUPS(), ["age"]);
  const s = scriptSetup({ onDisk: data, codebook: data });
  s.W.renderCodebook();
  const boxes = () => s.document.getElementById("tabellify-codebook-groups").children.map((box) => [
    box.querySelector(".tabellify-codebook-group-name").textContent,
    box.querySelectorAll("li").map((li) => li.children[0].textContent),
  ]);
  assert.deepEqual(boxes(), [
    ["tabellify-codebook-ungrouped", ["age"]],
    ["Exposure", ["Heat index", "Temperature"]],
    ["Outcome", ["Mortality"]],
    ["Empty", []],
  ]);
  const del = s.document.getElementById("tabellify-codebook-groups").querySelectorAll("button[data-action]")
    .find((b) => b.dataset.action === "delete" && b.dataset.groupId === "g2");
  s.W.onCodebookClick({ target: del });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(boxes(), [
    ["tabellify-codebook-ungrouped", ["age", "Heat index", "Temperature"]],
    ["Outcome", ["Mortality"]],
    ["Empty", []],
  ]);
  // The × button removes a tag from the codebook only.
  const remove = s.document.getElementById("tabellify-codebook-groups").querySelectorAll("button[data-action]")
    .find((b) => b.dataset.action === "remove-tag" && b.dataset.tag === "Mortality");
  s.W.onCodebookClick({ target: remove });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(boxes().find((b) => b[0] === "Outcome"), ["Outcome", []]);
});

// ---------------------------------------------------------------------------------------
// Feature 006b AC11: the suggestion list under the script box
// ---------------------------------------------------------------------------------------

/** A script setup with a library tag list. GROUPS() has Mortality in the codebook. */
function suggestSetup(libraryNames = ["Mortality", "Morbidity", "<b>mor</b>", "Hospitalization", "Exposure time"]) {
  const data = codebookData(GROUPS());
  const s = scriptSetup({ onDisk: data, codebook: data });
  s.W.libraryIndex = s.S.prepare(libraryNames.map((tag) => ({ tag, type: 0 })));
  s.list = s.document.getElementById("tabellify-script-suggestions");
  s.input.setAttribute("aria-expanded", "false");
  s.input.focus();
  return s;
}

/** Type `text` into the box (cursor at `cursor`) and fire the "input" handler. */
function typeInto(s, text, cursor = text.length) {
  s.input.value = text;
  s.input.setSelectionRange(cursor, cursor);
  s.W.onCodebookInput({ target: s.input });
}

/** A keydown on the script box through the real delegated handler. */
function press(s, key, extra = {}) {
  const event = {
    key, target: s.input, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...extra,
  };
  s.W.onCodebookKeydown(event);
  return event;
}

const optionTexts = (s) => s.list.children.map((li) => li.textContent);
const tick = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

test("F006b AC11: typing opens the list (aria-expanded); codebook tags excluded; text only; IDs by index", () => {
  const s = suggestSetup();
  typeInto(s, "Outcome(mor");
  assert.equal(s.list.hidden, false);
  assert.equal(s.input.getAttribute("aria-expanded"), "true");
  // Mortality is in the codebook: not offered. Starts-with, then contains, then Create.
  assert.deepEqual(optionTexts(s), ["Morbidity", "<b>mor</b>", 'tabellify-script-create "mor"tabellify-script-create-hint']);
  s.list.children.forEach((li, i) => {
    assert.equal(li.id, `tabellify-script-option-${i}`);
    assert.equal(li.getAttribute("role"), "option");
    assert.equal(li.getAttribute("aria-selected"), "false");
  });
  // The markup-looking name is one plain text span (no child elements parsed from it).
  const evil = s.list.children[1].children[0];
  assert.equal(evil.textContent, "<b>mor</b>");
  assert.equal(evil.children.length, 0);
  assert.ok(!s.list.children.some((li) => /Morbidity|<b>/.test(li.id)), "an option ID contains a tag name");
  assert.equal(s.list.children[2].classList.contains("tabellify-suggest-create"), true);
  // Debug Output has counts only, never the typed text or tag names.
  assert.ok(s.debug.some((m) => m.includes("suggestions: 3 options")), s.debug.join("\n"));
  assert.ok(!s.debug.some((m) => /mor|Morbidity/.test(m)), s.debug.join("\n"));
  // No match and nothing typed: the list closes again.
  typeInto(s, "Outcome(");
  assert.equal(s.list.hidden, true);
  assert.equal(s.input.getAttribute("aria-expanded"), "false");
});

test("F006b AC11: ↓/↑ move aria-activedescendant and aria-selected; ↑ on the first removes the highlight", () => {
  const s = suggestSetup();
  typeInto(s, "Outcome(mor");
  assert.equal(s.input.hasAttribute("aria-activedescendant"), false, "nothing highlighted at first (Q1)");
  assert.equal(press(s, "ArrowDown").prevented, true);
  assert.equal(s.input.getAttribute("aria-activedescendant"), "tabellify-script-option-0");
  assert.equal(s.list.children[0].getAttribute("aria-selected"), "true");
  press(s, "ArrowDown");
  assert.equal(s.input.getAttribute("aria-activedescendant"), "tabellify-script-option-1");
  assert.equal(s.list.children[0].getAttribute("aria-selected"), "false");
  assert.equal(s.list.children[1].getAttribute("aria-selected"), "true");
  press(s, "ArrowDown");
  press(s, "ArrowDown"); // stays on the last option
  assert.equal(s.input.getAttribute("aria-activedescendant"), "tabellify-script-option-2");
  press(s, "ArrowUp");
  press(s, "ArrowUp");
  assert.equal(s.input.getAttribute("aria-activedescendant"), "tabellify-script-option-0");
  press(s, "ArrowUp");
  assert.equal(s.input.hasAttribute("aria-activedescendant"), false);
  assert.ok(s.list.children.every((li) => li.getAttribute("aria-selected") === "false"));
});

test("F006b AC11: Tab accepts the first option when none is highlighted; Shift+Tab is not intercepted", () => {
  const s = suggestSetup();
  typeInto(s, "Outcome(mor");
  assert.equal(press(s, "Tab", { shiftKey: true }).prevented, false);
  assert.equal(s.list.hidden, false);
  const tab = press(s, "Tab");
  assert.equal(tab.prevented, true);
  assert.equal(s.input.value, "Outcome(Morbidity");
  assert.deepEqual([s.input.selectionStart, s.input.selectionEnd], [17, 17]);
  assert.equal(s.list.hidden, true);
  assert.equal(s.input.getAttribute("aria-expanded"), "false");
  // With the list closed, Tab keeps its normal meaning.
  assert.equal(press(s, "Tab").prevented, false);
});

test("F006b AC11: Enter accepts a highlighted option, and otherwise commits the entry", async () => {
  const s = suggestSetup();
  let commits = 0;
  s.W.commitScript = async () => { commits++; };
  typeInto(s, "a, Hosp");
  press(s, "ArrowDown");
  const accept = press(s, "Enter");
  assert.equal(accept.prevented, true);
  assert.equal(s.input.value, "a, Hospitalization");
  assert.equal(commits, 0, "accepting does not commit");
  // List open, nothing highlighted: Enter commits.
  typeInto(s, "a, Hosp");
  assert.equal(s.list.hidden, false);
  assert.equal(press(s, "Enter").prevented, true);
  assert.equal(commits, 1);
  // List closed: Enter commits.
  typeInto(s, "a, ");
  assert.equal(s.list.hidden, true);
  press(s, "Enter");
  assert.equal(commits, 2);
});

test("F006b AC11: a real commit closes the list and saves the accepted name to the codebook only", async () => {
  const s = suggestSetup();
  typeInto(s, "Outcome(Hosp");
  press(s, "Tab");
  typeInto(s, "Outcome(Hospitalization)");
  assert.equal(s.list.hidden, true, "after ) no list");
  typeInto(s, "zz tabellify test");
  assert.deepEqual(optionTexts(s), ['tabellify-script-create "zz tabellify test"tabellify-script-create-hint']);
  press(s, "Tab"); // Create: the text stays the cleaned name, the list closes
  assert.equal(s.input.value, "zz tabellify test");
  assert.equal(s.list.hidden, true);
  press(s, "Enter");
  await tick();
  const saved = JSON.parse(s.files.get("/d/codebooks.json"));
  assert.ok(saved.codebooks[0].tags.some((t) => t.name === "zz tabellify test" && t.group === null));
  assert.deepEqual(s.writes.map((w) => w[0]), ["/d/codebooks.json"], "only Tabellify's own file");
});

test("F006b AC11: Esc closes an open list without changing the text; Esc with the list closed is not handled", () => {
  const s = suggestSetup();
  typeInto(s, "Outcome(mor");
  const esc = press(s, "Escape");
  assert.equal(esc.prevented, true);
  assert.equal(esc.stopped, true);
  assert.equal(s.list.hidden, true);
  assert.equal(s.input.value, "Outcome(mor");
  const again = press(s, "Escape");
  assert.equal(again.prevented, false);
  assert.equal(again.stopped, false);
});

test("F006b AC11: keys are ignored while an input method is composing", () => {
  const s = suggestSetup();
  let commits = 0;
  s.W.commitScript = async () => { commits++; };
  typeInto(s, "Outcome(mor");
  assert.equal(press(s, "ArrowDown", { isComposing: true }).prevented, false);
  assert.equal(s.input.hasAttribute("aria-activedescendant"), false);
  press(s, "Enter", { isComposing: true });
  assert.equal(commits, 0);
  assert.equal(s.list.hidden, false);
});

test("F006b AC11: group names first at the top level; accepting one inserts Name( and reopens on typing", () => {
  const s = suggestSetup();
  typeInto(s, "Exp");
  assert.deepEqual(optionTexts(s).slice(0, 2), ["Exposuretabellify-script-group-hint", "Exposure time"]);
  press(s, "Tab");
  assert.equal(s.input.value, "Exposure(");
  assert.equal(s.input.selectionStart, 9);
  assert.equal(s.list.hidden, true, "empty token: closed until a letter is typed");
  typeInto(s, "Exposure(h");
  assert.equal(s.list.hidden, false);
  assert.equal(optionTexts(s).some((t) => t.includes("group-hint")), false, "no groups inside a group");
  // ↓ in an empty token lists the library tags (Q7).
  typeInto(s, "Exposure(");
  press(s, "ArrowDown");
  assert.equal(s.list.hidden, false);
  assert.equal(s.input.getAttribute("aria-activedescendant"), "tabellify-script-option-0");
});

test("F006b AC11: mousedown on an option accepts it and keeps focus; focusout closes the list", () => {
  const s = suggestSetup();
  typeInto(s, "x, mor");
  const li = s.list.children[0];
  let prevented = false;
  s.W.onCodebookMousedown({ target: li.children[0], preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(s.input.value, "x, Morbidity");
  assert.equal(s.document.activeElement, s.input);
  typeInto(s, "x, mor");
  s.W.onCodebookFocusout({ target: s.input });
  assert.equal(s.list.hidden, true);
  assert.equal(s.input.value, "x, mor");
});

test("F006b AC11: the list closes when the box is disabled (saving or not loaded)", () => {
  const s = suggestSetup();
  typeInto(s, "x, mor");
  s.W.codebookBusy = true;
  s.W.updateCodebookControls();
  assert.equal(s.list.hidden, true);
  typeInto(s, "x, mor");
  assert.equal(s.list.hidden, true, "no list while saving");
});

test("F006b AC11: an item-tag notify marks the tag list stale even with no collection chosen", () => {
  const s = suggestSetup();
  s.W.currentCollection = "";
  s.W.onNotify("add", "collection-item", [1], {});
  assert.equal(s.W.libraryTagsStale, false);
  s.W.onNotify("add", "item-tag", ["1-2"], {});
  assert.equal(s.W.libraryTagsStale, true);
});

test("F006b AC11: focus with a stale list reloads it once, then refreshes the suggestions; Refresh reloads too", async () => {
  const s = suggestSetup();
  let calls = 0;
  s.Zotero.Libraries = { userLibraryID: 1 };
  s.Zotero.Tags = {
    getAll: async (libraryID) => {
      calls++;
      assert.equal(libraryID, 1);
      return [{ tag: "zz-tabellify-fresh", type: 0 }, { tag: "auto", type: 1 }];
    },
  };
  // Not stale: focus does not read.
  s.W.onCodebookFocusin({ target: s.input });
  assert.equal(calls, 0);
  typeInto(s, "zz-tab");
  assert.deepEqual(optionTexts(s), ['tabellify-script-create "zz-tab"tabellify-script-create-hint']);
  s.W.libraryTagsStale = true;
  s.W.onCodebookFocusin({ target: s.input });
  s.W.onCodebookFocusin({ target: s.input }); // a second focus while reading: no second read
  await tick();
  assert.equal(calls, 1);
  assert.equal(s.W.libraryTagsStale, false);
  assert.deepEqual(optionTexts(s), ["zz-tabellify-fresh", 'tabellify-script-create "zz-tab"tabellify-script-create-hint']);
  assert.ok(s.debug.some((m) => m.includes("1 tag name(s) in My Library for suggestions")), s.debug.join("\n"));
  // Refresh re-reads the tag list, also when no collection is chosen.
  s.W.currentCollection = "";
  s.W.onRefreshClick();
  await tick();
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------------------------------
// Feature 006c (Amendment 2, AC31): drag regrouping by cell edge, run headers, keyboard
// ---------------------------------------------------------------------------------------

/** The spec's Setup: Exposure(Heat index, Temperature), Outcome(Hospitalization, Mortality), then ungrouped tags. */
const REGROUP_GROUPS = () => [
  { id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] },
  { id: "g3", name: "Outcome", tags: ["Hospitalization", "Mortality"] },
];

/** Test text for the 006c Fluent IDs (as the real tabellify.ftl). */
const REGROUP_STRINGS = {
  "tabellify-drop-hint-reorder": "Move column here",
  "tabellify-drop-hint-join": "Move into group:",
  "tabellify-drop-hint-to-ungrouped": "Move to Ungrouped",
  "tabellify-drop-hint-new-group": "Turn into a group name:",
  "tabellify-regroup-announce-moved": "moved to group",
  "tabellify-regroup-announce-ungrouped": "is now ungrouped",
  "tabellify-regroup-announce-group-name": "is now a group name",
};

/**
 * A table with the Setup codebook, a fake codebooks.json on a fake disk (so a regroup really
 * goes through the save path) and a scrollable main area for the drag auto-scroll.
 * @param {{ onDiskRevision?: number, ungrouped?: string[], groups?: object[] }} [options]
 */
function regroupSetup({ onDiskRevision = 1, ungrouped = ["age", "sex"], groups = REGROUP_GROUPS() } = {}) {
  const env = setup({ groups, ungrouped });
  const { W, document } = env;
  Object.assign(W.strings, REGROUP_STRINGS);
  const data = codebookData(groups, ungrouped);
  const files = new Map([["/d/codebooks.json", JSON.stringify({ ...data, revision: onDiskRevision })]]);
  const writes = [];
  W.codebookFs = {
    readJSON: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
      return JSON.parse(files.get(path));
    },
    writeJSON: async (path, value, options) => {
      writes.push(path);
      if (options?.backupFile && files.has(path)) files.set(options.backupFile, files.get(path));
      files.set(path, JSON.stringify(value));
    },
    makeDirectory: async () => {},
    join: (...parts) => parts.join("/"),
  };
  W.codebookDir = "/d";
  W.codebook = data;
  W.codebookRevision = data.revision;
  W.codebookEditable = true;
  W.renderMonitor();
  document.getElementById("tabellify-workspace-main").scrollBy = () => {};
  // As in workspace.xhtml: the drop hint starts hidden.
  document.getElementById("tabellify-drop-hint").hidden = true;
  return { ...env, files, writes, hint: document.getElementById("tabellify-drop-hint") };
}

const COLUMN_TYPES = ["application/x-tabellify-column"];
/**
 * A fake drag event at `target`. Every fake cell is 100 × 20 px at (0, 0), so with
 * TabellifyTableLayout.dropEdge (BAND 0.25): clientX < 25 = left, > 75 = right; in between
 * clientY < 10 = top, otherwise bottom. ZONE (below) gives one point per edge.
 */
function dragEvent(target, { clientX = 80, clientY = 10, types = COLUMN_TYPES } = {}) {
  return {
    target, clientX, clientY, prevented: false,
    dataTransfer: { types, dropEffect: "", effectAllowed: "", setData() {}, setDragImage() {} },
    preventDefault() { this.prevented = true; },
  };
}
/** Start a drag on tag column `tag`'s grip (the real onTableDragStart). */
function startTagDrag(W, doc, tag) {
  W.onTableDragStart(dragEvent(regroupTagGrip(doc, tag)));
  assert.equal(W.dragging?.kind, "tag");
}
/** Tag header cells live in the tag row (two rows) or the group row (one row). */
function tagTh(doc, tag) {
  return [...headerRow(doc, "tabellify-items-tag-row"), ...headerRow(doc, "tabellify-items-group-row")]
    .find((th) => th.dataset.tag === tag);
}
const regroupTagGrip = (doc, tag) => tagTh(doc, tag).querySelector(".tabellify-grip");
const superTh = (doc, id) => headerRow(doc, "tabellify-items-group-row").find((th) => th.dataset.groupId === id && !th.hasAttribute("data-tag"));
/** The body cell of column `tag` in the first row. */
const bodyCell = (doc, tag) => bodyRows(doc)[0].children.find((td) => td.dataset.tag === tag);
const hasClass = (el, cls) => el.classList.contains(cls);
/** Every element in the table that carries one of the drop classes. */
function marked(doc) {
  return doc.byId.get("tabellify-items-table").descendants()
    .filter((el) => ["tabellify-drop-before", "tabellify-drop-after", "tabellify-drop-into", "tabellify-drop-nest", "tabellify-drop-above", "tabellify-drop-below"]
      .some((c) => el.classList.contains(c)));
}
const plainJson = (v) => JSON.parse(JSON.stringify(v));
const ZONE = {
  left: { clientX: 10, clientY: 10 },
  right: { clientX: 90, clientY: 10 },
  top: { clientX: 40, clientY: 5 },
  topRight: { clientX: 60, clientY: 5 },
  bottom: { clientX: 40, clientY: 15 },
  bottomRight: { clientX: 60, clientY: 15 },
};
/** Classes of the drop marks on an element (short names). */
const marks = (el) => ["before", "after", "into", "nest", "above", "below"].filter((c) => hasClass(el, `tabellify-drop-${c}`));
/** Drag over `target` at `zone`; returns the event. */
function over(W, target, zone) {
  const ev = dragEvent(target, ZONE[zone]);
  W.onTableDragOver(ev);
  return ev;
}
/** The Amendment 2 Setup's ungrouped tags. */
const A2_UNGROUPED = ["age", "sex", "smoker", "bmi", "diet"];
const runTh = (doc, k) => headerRow(doc, "tabellify-items-group-row").find((th) => th.dataset.run === String(k));

test("006c AC31: body tag cells carry their column (data-group-id, data-tag)", () => {
  const { document } = regroupSetup();
  const cells = bodyRows(document)[0].children.filter((td) => td.classList.contains("tabellify-col-tag"));
  assert.deepEqual(cells.map((td) => [td.dataset.groupId, td.dataset.tag]), [
    ["ungrouped", "age"], ["ungrouped", "sex"], ["g2", "Heat index"], ["g2", "Temperature"],
    ["g3", "Hospitalization"], ["g3", "Mortality"],
  ]);
});

test("006c AC31: tag grips list the four Alt keys; group grips keep two; run headers have none", () => {
  const { document } = regroupSetup();
  assert.equal(regroupTagGrip(document, "Temperature").getAttribute("aria-keyshortcuts"),
    "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown");
  assert.equal(regroupTagGrip(document, "age").getAttribute("aria-keyshortcuts"),
    "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown");
  assert.equal(superTh(document, "g2").querySelector(".tabellify-grip").getAttribute("aria-keyshortcuts"),
    "Alt+ArrowLeft Alt+ArrowRight");
  assert.equal(runTh(document, 0).querySelector(".tabellify-grip"), null);
});

test("006c AC31: tag header inside a group: left / right only; top / bottom fall back (Table 3)", () => {
  const { W, document, hint } = regroupSetup();
  startTagDrag(W, document, "Temperature");
  // Same group, left part: a reorder.
  assert.equal(over(W, tagTh(document, "Heat index"), "left").prevented, true);
  assert.deepEqual(marks(tagTh(document, "Heat index")), ["before"]);
  assert.equal(marked(document).length, 1);
  assert.equal(hint.hidden, false);
  assert.equal(hint.textContent, "Move column here");
  // Another group, right part: join, plus a line under that group's name.
  over(W, tagTh(document, "Hospitalization"), "right");
  assert.deepEqual(marks(tagTh(document, "Hospitalization")), ["after"]);
  assert.deepEqual(marks(superTh(document, "g3")), ["into"]);
  assert.equal(hint.textContent, "Move into group: Outcome");
  // Top and bottom are not allowed there: only the left / right line (fallback).
  for (const [zone, side] of [["top", "before"], ["topRight", "after"], ["bottom", "before"], ["bottomRight", "after"]]) {
    over(W, tagTh(document, "Hospitalization"), zone);
    assert.deepEqual(marks(tagTh(document, "Hospitalization")), [side], zone);
    assert.equal(hint.textContent, "Move into group: Outcome", zone);
    assert.equal(marked(document).length, 2, zone);
  }
});

test("006c AC31: ungrouped tag header: bottom = nest, top = flip, left / right = sibling (Table 1)", () => {
  const { W, document, hint } = regroupSetup();
  startTagDrag(W, document, "sex");
  over(W, tagTh(document, "age"), "bottom");
  assert.deepEqual(marks(tagTh(document, "age")), ["below"]);
  const index = bodyCell(document, "age").cellIndex;
  for (const tr of bodyRows(document)) assert.deepEqual(marks(tr.children[index]), ["nest"]);
  assert.equal(marked(document).length, 1 + bodyRows(document).length);
  assert.equal(hint.textContent, "Turn into a group name: age");
  over(W, tagTh(document, "age"), "top");
  assert.deepEqual(marks(tagTh(document, "age")), ["above"]);
  assert.equal(marked(document).length, 1, "old marks cleared");
  assert.equal(hint.textContent, "Turn into a group name: sex");
  over(W, tagTh(document, "age"), "left");
  assert.deepEqual(marks(tagTh(document, "age")), ["before"]);
  assert.equal(hint.textContent, "Move column here");
  W.endDrag();
  // A grouped tag beside an ungrouped one: "Move to Ungrouped", no line under the run header.
  startTagDrag(W, document, "Temperature");
  over(W, tagTh(document, "sex"), "right");
  assert.deepEqual(marks(tagTh(document, "sex")), ["after"]);
  assert.deepEqual(marks(runTh(document, 0)), []);
  assert.equal(hint.textContent, "Move to Ungrouped");
});

test("006c AC31: group super-header: bottom = join at the end; left / right = beside it; top falls back (Table 2)", () => {
  const { W, document, hint } = regroupSetup();
  startTagDrag(W, document, "Heat index");
  over(W, superTh(document, "g3"), "bottom");
  assert.deepEqual(marks(superTh(document, "g3")), ["into"]);
  assert.deepEqual(marks(tagTh(document, "Mortality")), ["after"]);
  assert.equal(hint.textContent, "Move into group: Outcome");
  over(W, superTh(document, "g3"), "right");
  assert.deepEqual(marks(superTh(document, "g3")), ["after"]);
  assert.deepEqual(marks(tagTh(document, "Mortality")), ["after"], "one line through both rows");
  assert.equal(hint.textContent, "Move to Ungrouped");
  over(W, superTh(document, "g3"), "top");
  assert.deepEqual(marks(superTh(document, "g3")), ["before"], "never above a group");
  assert.deepEqual(marks(tagTh(document, "Hospitalization")), ["before"]);
  assert.equal(document.byId.get("tabellify-items-table").querySelectorAll(".tabellify-drop-above").length, 0);
});

test("006c AC31: run header: left = before its first tag, right = after its last; top falls back (Table 4)", () => {
  const { W, document, hint } = regroupSetup();
  startTagDrag(W, document, "Mortality");
  over(W, runTh(document, 0), "left");
  assert.deepEqual(marks(runTh(document, 0)), ["before"]);
  assert.deepEqual(marks(tagTh(document, "age")), ["before"]);
  assert.equal(hint.textContent, "Move to Ungrouped");
  over(W, runTh(document, 0), "bottom");
  assert.deepEqual(marks(runTh(document, 0)), ["after"]);
  assert.deepEqual(marks(tagTh(document, "sex")), ["after"]);
  over(W, runTh(document, 0), "topRight");
  assert.deepEqual(marks(runTh(document, 0)), ["after"]);
});

test("006c AC31: body cells are an alias of the header's bottom edge (A2-Q8, AC23)", () => {
  const { W, document, hint } = regroupSetup();
  startTagDrag(W, document, "sex");
  over(W, bodyCell(document, "age"), "top"); // any point of a body cell: bottom edge
  assert.deepEqual(marks(tagTh(document, "age")), ["below"]);
  assert.equal(hint.textContent, "Turn into a group name: age");
  W.endDrag();
  // Below a tag inside a group: the pointer's half of the cell decides before / after.
  startTagDrag(W, document, "Temperature");
  over(W, bodyCell(document, "Hospitalization"), "bottom");
  assert.deepEqual(marks(tagTh(document, "Hospitalization")), ["before"]);
  assert.deepEqual(marks(superTh(document, "g3")), ["into"]);
  over(W, bodyCell(document, "Hospitalization"), "bottomRight");
  assert.deepEqual(marks(tagTh(document, "Hospitalization")), ["after"]);
  assert.equal(hint.textContent, "Move into group: Outcome");
});

test("006c AC31: refused on Title, k/M and grip cells, on itself, on a run holding only it, and for foreign drags", () => {
  const { W, document, hint } = regroupSetup({ ungrouped: ["age"] });
  const row = bodyRows(document)[0];
  const refusedAt = (target, types) => {
    const ev = dragEvent(target, types ? { types } : {});
    W.onTableDragOver(ev);
    return !ev.prevented && marked(document).length === 0 && hint.hidden;
  };
  startTagDrag(W, document, "Temperature");
  const titleTh = headerRow(document, "tabellify-items-group-row").find((th) => th.classList.contains("tabellify-col-title"));
  assert.ok(refusedAt(titleTh), "Title header");
  assert.ok(refusedAt(row.children[1]), "Title cell");
  assert.ok(refusedAt(row.children.at(-1)), "k/M cell");
  assert.ok(refusedAt(row.children[0]), "grip cell");
  assert.ok(refusedAt(row.children[0].children[0]), "row grip");
  assert.ok(refusedAt(bodyCell(document, "Temperature")), "its own column (A = B)");
  assert.ok(refusedAt(tagTh(document, "Temperature")), "its own header (A = B)");
  assert.ok(refusedAt(bodyCell(document, "age"), ["text/plain"]), "text dragged in from elsewhere");
  W.endDrag();
  startTagDrag(W, document, "age");
  assert.ok(refusedAt(runTh(document, 0)), "the run holds only the dragged tag");
  W.endDrag();
  const ev = dragEvent(bodyCell(document, "age"));
  W.onTableDragOver(ev);
  assert.equal(ev.prevented, false, "a drag that did not start in this table");
});

test("006c AC31: regroup drops are refused while saving or not editable; reorders still accepted", () => {
  for (const state of [{ codebookBusy: true }, { codebookEditable: false }, { codebook: null }]) {
    const { W, document } = regroupSetup();
    startTagDrag(W, document, "Temperature");
    Object.assign(W, state);
    for (const [target, zone] of [[tagTh(document, "Hospitalization"), "right"], [bodyCell(document, "age"), "left"],
      [superTh(document, "g3"), "bottom"], [tagTh(document, "age"), "top"], [runTh(document, 0), "left"]]) {
      assert.equal(over(W, target, zone).prevented, false, `${JSON.stringify(state)} ${zone}`);
    }
    if (state.codebook === null) continue; // no codebook: nothing to describe
    assert.equal(over(W, tagTh(document, "Heat index"), "left").prevented, true, `reorder while ${JSON.stringify(state)}`);
  }
});

test("006c AC31: endDrag clears every drop class (incl. above / below) and hides the hint", () => {
  const { W, document, hint } = regroupSetup();
  startTagDrag(W, document, "sex");
  over(W, tagTh(document, "age"), "top");
  assert.equal(marked(document).length, 1);
  W.onTableDragEnd();
  over(W, tagTh(document, "age"), "top"); // no drag any more: nothing shown
  assert.equal(marked(document).length, 0);
  startTagDrag(W, document, "sex");
  over(W, tagTh(document, "age"), "bottom");
  assert.ok(marked(document).length > 1);
  W.onTableDragEnd();
  assert.equal(marked(document).length, 0);
  assert.equal(hint.hidden, true);
  assert.equal(hint.textContent, "");
  assert.equal(W.dragging, null);
});

test("006c AC31: a regroup drop saves the codebook once and changes the layout only after it is shown", async () => {
  const { W, R, document, files, writes, debug } = regroupSetup();
  const before = plainJson(W.columnLayout);
  const expected = R.plan(W.codebook, W.columnLayout, { groupId: "g2", tag: "Temperature" },
    { cell: "tag", groupId: "g3", tag: "Hospitalization", edge: "right", side: "right" });
  startTagDrag(W, document, "Temperature");
  const ev = dragEvent(tagTh(document, "Hospitalization"), ZONE.right);
  W.onTableDrop(ev);
  assert.equal(ev.prevented, true);
  assert.equal(marked(document).length, 0, "endDrag ran in the drop handler");
  assert.deepEqual(plainJson(W.columnLayout), before, "layout unchanged while the save runs");
  await tick();
  assert.deepEqual(writes, ["/d/codebooks.json"], "one codebook save, nothing else");
  const saved = JSON.parse(files.get("/d/codebooks.json"));
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.codebooks[0].tags.filter((t) => t.group === "g3").map((t) => t.name), ["Hospitalization", "Mortality", "Temperature"]);
  assert.deepEqual(plainJson(W.columnLayout), plainJson(expected.layout));
  assert.deepEqual(tagHeaders(document), ["age", "sex", "Heat index", "Hospitalization", "Temperature", "Mortality"]);
  assert.deepEqual(pills(document), ["Ungrouped · 2 (u)", "Exposure · 1", "Outcome · 3"]);
  assert.equal(document.getElementById("tabellify-codebook-status-text").textContent,
    "tabellify-codebook-saved tabellify-regroup-joined");
  // Debug Output: IDs and edges only, never names.
  assert.ok(debug.includes("Tabellify: workspace: regroup: tag dropped on the right edge (drag)"), debug.join("\n"));
  assert.ok(debug.includes("Tabellify: workspace: regroup: a tag moved from block g2 to block g3 (drag)"));
  assert.ok(!debug.some((m) => /regroup:|layout:/.test(m) && /Temperature|Outcome|Exposure|Hospitalization/.test(m)));
});

test("006c AC31: a nest drop (bottom edge / body) makes B only a group name at B's place (AC17)", async () => {
  const { W, document, debug, files } = regroupSetup({ ungrouped: A2_UNGROUPED });
  startTagDrag(W, document, "sex");
  W.onTableDrop(dragEvent(tagTh(document, "age"), ZONE.bottom));
  await tick();
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g9/1", "group:ungrouped/3", "group:g2/2", "group:g3/2", "count"]);
  assert.deepEqual(tagHeaders(document), ["sex", "smoker", "bmi", "diet", "Heat index", "Temperature", "Hospitalization", "Mortality"]);
  const saved = JSON.parse(files.get("/d/codebooks.json"));
  assert.deepEqual(saved.codebooks[0].groups.at(-1), { id: "g9", name: "age" });
  assert.equal(saved.codebooks[0].tags.some((t) => t.name === "age"), false, "tag age left the codebook");
  assert.deepEqual(pills(document), ["age · 1", "Ungrouped · 3 (u)", "Exposure · 2", "Outcome · 2"]);
  assert.equal(document.getElementById("tabellify-codebook-status-text").textContent,
    "tabellify-codebook-saved tabellify-regroup-created");
  assert.ok(debug.includes("Tabellify: workspace: regroup: group g9 created by a nest (drag)"), debug.join("\n"));
  assert.ok(debug.includes("Tabellify: workspace: regroup: the nest target tag became the name of group g9 and left the codebook (drag)"));
});

test("006c AC31: a flip drop (top edge) makes the dragged tag the group name at B's place (AC18)", async () => {
  const { W, document, debug, files } = regroupSetup({ ungrouped: A2_UNGROUPED });
  startTagDrag(W, document, "bmi");
  W.onTableDrop(dragEvent(tagTh(document, "smoker"), ZONE.top));
  await tick();
  assert.deepEqual(groupHeaders(document),
    ["grip", "title", "group:ungrouped/2", "group:g9/1", "group:ungrouped/1", "group:g2/2", "group:g3/2", "count"]);
  assert.deepEqual(tagHeaders(document).slice(0, 4), ["age", "sex", "smoker", "diet"]);
  assert.equal(superTh(document, "g9").textContent, "bmi");
  const saved = JSON.parse(files.get("/d/codebooks.json"));
  assert.equal(saved.codebooks[0].tags.some((t) => t.name === "bmi"), false, "the dragged tag left the codebook");
  // One "Ungrouped" pill for both runs, at the first run's place (A2-Q9).
  assert.deepEqual(pills(document), ["Ungrouped · 3 (u)", "bmi · 1", "Exposure · 2", "Outcome · 2"]);
  assert.equal(document.getElementById("tabellify-codebook-status-text").textContent,
    "tabellify-codebook-saved tabellify-regroup-created");
  assert.ok(debug.includes("Tabellify: workspace: regroup: tag dropped on the top edge (drag)"), debug.join("\n"));
  assert.ok(debug.includes("Tabellify: workspace: regroup: the dragged tag from block ungrouped became the name of group g9 and left the codebook (drag)"));
  assert.ok(!debug.some((m) => /regroup:/.test(m) && /bmi|smoker/.test(m)));
});

test("006c AC31: a nest into a same-named group reuses it (Q2, AC7)", async () => {
  const groups = [{ id: "g2", name: "Country", tags: [] }];
  const { W, document, files } = regroupSetup({ groups, ungrouped: ["country", "region"] });
  startTagDrag(W, document, "region");
  W.onTableDrop(dragEvent(bodyCell(document, "country")));
  await tick();
  const saved = JSON.parse(files.get("/d/codebooks.json"));
  assert.deepEqual(saved.codebooks[0].groups, [{ id: "g2", name: "Country" }], "no second group");
  assert.deepEqual(saved.codebooks[0].tags, [{ name: "region", group: "g2" }]);
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g2/1", "count"]);
  assert.deepEqual(tagHeaders(document), ["region"]);
  assert.equal(document.getElementById("tabellify-codebook-status-text").textContent,
    "tabellify-codebook-saved tabellify-regroup-created");
});

test("006c AC31: on a save conflict the codebook is reloaded and the layout is NOT changed", async () => {
  const { W, document, writes } = regroupSetup({ onDiskRevision: 5 });
  const before = plainJson(W.columnLayout);
  startTagDrag(W, document, "Temperature");
  W.onTableDrop(dragEvent(tagTh(document, "Hospitalization"), ZONE.right));
  await tick();
  assert.deepEqual(writes, [], "nothing written over the newer file");
  assert.deepEqual(plainJson(W.columnLayout), before);
  assert.equal(W.codebookRevision, 5, "reloaded from disk");
});

test("006c AC31: reorder drops never save the codebook (inside a group and at the top level)", async () => {
  const { W, document, writes } = regroupSetup();
  startTagDrag(W, document, "Temperature");
  W.onTableDrop(dragEvent(tagTh(document, "Heat index"), ZONE.left));
  startTagDrag(W, document, "age");
  W.onTableDrop(dragEvent(superTh(document, "g3"), ZONE.right));
  await tick();
  assert.deepEqual(writes, []);
  assert.deepEqual(tagHeaders(document), ["sex", "Temperature", "Heat index", "Hospitalization", "Mortality", "age"]);
  assert.equal(document.byId.get("tabellify-items-table").querySelectorAll("th[data-run]").length, 2);
});

test("006c AC31: a whole group can be dropped between ungrouped tags (layout only)", async () => {
  const { W, document, writes, debug } = regroupSetup({ ungrouped: A2_UNGROUPED });
  W.onTableDragStart(dragEvent(superTh(document, "g3").querySelector(".tabellify-grip")));
  assert.equal(W.dragging.kind, "group");
  // Over the group itself: refused.
  assert.equal(over(W, tagTh(document, "Mortality"), "left").prevented, false);
  const ev = over(W, tagTh(document, "smoker"), "left");
  assert.equal(ev.prevented, true);
  assert.deepEqual(marks(tagTh(document, "smoker")), ["before"]);
  W.onTableDrop(dragEvent(tagTh(document, "smoker"), ZONE.left));
  assert.deepEqual(tagHeaders(document), ["age", "sex", "Hospitalization", "Mortality", "smoker", "bmi", "diet", "Heat index", "Temperature"]);
  assert.deepEqual(groupHeaders(document),
    ["grip", "title", "group:ungrouped/2", "group:g3/2", "group:ungrouped/3", "group:g2/2", "count"]);
  assert.ok(debug.includes("Tabellify: workspace: layout: group g3 moved to top-level position 3 of 7 (drag)"), debug.join("\n"));
  // Over a run header: after its last tag (right half).
  W.onTableDragStart(dragEvent(superTh(document, "g2").querySelector(".tabellify-grip")));
  over(W, runTh(document, 0), "right");
  assert.deepEqual(marks(runTh(document, 0)), ["after"]);
  assert.deepEqual(marks(tagTh(document, "sex")), ["after"]);
  W.onTableDrop(dragEvent(runTh(document, 0), ZONE.right));
  assert.deepEqual(tagHeaders(document).slice(0, 4), ["age", "sex", "Heat index", "Temperature"]);
  await tick();
  assert.deepEqual(writes, [], "never the codebook");
});

test("006c AC31: keyboard, grouped tag: Alt+Up leaves the group beside it, Alt+Down does nothing (AC24a)", async () => {
  const s = regroupSetup();
  altKey(s.W, regroupTagGrip(s.document, "Mortality"), "ArrowDown");
  await tick();
  assert.deepEqual(s.writes, []);
  const target = s.R.keyboardTarget(s.W.codebook, s.W.columnLayout, { groupId: "g3", tag: "Mortality" }, "up");
  const expected = s.R.plan(s.W.codebook, s.W.columnLayout, { groupId: "g3", tag: "Mortality" }, target);
  assert.equal(altKey(s.W, regroupTagGrip(s.document, "Mortality"), "ArrowUp"), true);
  await tick();
  assert.deepEqual(plainJson(s.W.columnLayout), plainJson(expected.layout));
  assert.deepEqual(tagHeaders(s.document), ["age", "sex", "Heat index", "Temperature", "Hospitalization", "Mortality"]);
  assert.equal(tagTh(s.document, "Mortality").dataset.groupId, "ungrouped");
  assert.equal(regroupTagGrip(s.document, "Mortality").focused, true);
  assert.equal(s.document.byId.get("tabellify-table-announce").textContent, "Mortality is now ungrouped");
  assert.ok(s.debug.includes("Tabellify: workspace: regroup: a tag moved from block g3 to block ungrouped (keyboard)"));
  // Now ungrouped right of "Outcome": Alt+Left steps past the whole group in one press.
  altKey(s.W, regroupTagGrip(s.document, "Mortality"), "ArrowLeft");
  assert.deepEqual(tagHeaders(s.document), ["age", "sex", "Heat index", "Temperature", "Mortality", "Hospitalization"]);
  assert.equal(regroupTagGrip(s.document, "Mortality").focused, true);
  // The first tag of a group leaves it to the LEFT of the group.
  const t = regroupSetup();
  altKey(t.W, regroupTagGrip(t.document, "Hospitalization"), "ArrowUp");
  await tick();
  assert.deepEqual(tagHeaders(t.document), ["age", "sex", "Heat index", "Temperature", "Hospitalization", "Mortality"]);
  assert.deepEqual(groupHeaders(t.document),
    ["grip", "title", "group:ungrouped/2", "group:g2/2", "group:ungrouped/1", "group:g3/1", "count"]);
});

test("006c AC31: keyboard, ungrouped tag: Alt+Up flips, Alt+Down nests or joins the group on its left (AC24b, c)", async () => {
  // Flip: sex becomes a group name over age; focus on the new group's grip.
  let s = regroupSetup();
  altKey(s.W, regroupTagGrip(s.document, "sex"), "ArrowUp");
  await tick();
  assert.deepEqual(groupHeaders(s.document), ["grip", "title", "group:g9/1", "group:g2/2", "group:g3/2", "count"]);
  assert.equal(superTh(s.document, "g9").textContent, "sex");
  assert.equal(tagTh(s.document, "sex"), undefined);
  assert.equal(superTh(s.document, "g9").querySelector(".tabellify-grip").focused, true);
  assert.equal(s.document.byId.get("tabellify-table-announce").textContent, "sex is now a group name");
  // Nest: age becomes a group name over sex.
  s = regroupSetup();
  altKey(s.W, regroupTagGrip(s.document, "sex"), "ArrowDown");
  await tick();
  assert.equal(tagTh(s.document, "sex").dataset.groupId, "g9");
  assert.equal(superTh(s.document, "g9").textContent, "age");
  assert.equal(regroupTagGrip(s.document, "sex").focused, true);
  assert.equal(s.document.byId.get("tabellify-table-announce").textContent, "sex moved to group age");
  // A group on its left: Alt+Down joins it at its end; Alt+Up does nothing.
  s = regroupSetup();
  s.W.columnLayout = { topOrder: [{ group: "g2" }, { tag: "age" }], tagOrder: {} };
  s.W.renderMonitor();
  altKey(s.W, regroupTagGrip(s.document, "age"), "ArrowUp");
  await tick();
  assert.deepEqual(s.writes, []);
  altKey(s.W, regroupTagGrip(s.document, "age"), "ArrowDown");
  await tick();
  assert.equal(tagTh(s.document, "age").dataset.groupId, "g2");
  // "sex" is not listed in topOrder, so it sits at the home marker (far left).
  assert.deepEqual(tagHeaders(s.document).slice(0, 4), ["sex", "Heat index", "Temperature", "age"]);
  assert.equal(s.document.byId.get("tabellify-table-announce").textContent, "age moved to group Exposure");
});

test("006c AC31: keyboard: the first ungrouped tag (no left neighbour) does nothing on Alt+Up / Alt+Down", async () => {
  const s = regroupSetup();
  const before = plainJson(s.W.codebook);
  altKey(s.W, regroupTagGrip(s.document, "age"), "ArrowUp");
  altKey(s.W, regroupTagGrip(s.document, "age"), "ArrowDown");
  await tick();
  assert.deepEqual(s.writes, []);
  assert.deepEqual(plainJson(s.W.codebook), before);
  // Alt+Left/Right on a grouped tag never leave its group.
  altKey(s.W, regroupTagGrip(s.document, "Heat index"), "ArrowLeft");
  assert.equal(tagTh(s.document, "Heat index").dataset.groupId, "g2");
  assert.deepEqual(s.writes, []);
});

test("006c AC31: one-row header (only ungrouped tags): edges work and the first nest makes two rows", async () => {
  const { W, document, files } = regroupSetup({ groups: [], ungrouped: ["x1", "x2"] });
  assert.deepEqual(groupHeaders(document), ["grip", "title", "tag:x1", "tag:x2", "count"]);
  altKey(W, regroupTagGrip(document, "x2"), "ArrowDown");
  await tick();
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g9/1", "count"]);
  assert.deepEqual(tagHeaders(document), ["x2"]);
  assert.deepEqual(JSON.parse(files.get("/d/codebooks.json")).codebooks[0].groups, [{ id: "g9", name: "x1" }]);
});

test("006c AC31: names with markup reach the hint and announcements only as text", async () => {
  const evil = "<img src=x onerror=alert(1)>";
  const s = regroupSetup({ ungrouped: [evil, "sex"] });
  startTagDrag(s.W, s.document, "sex");
  over(s.W, bodyCell(s.document, evil), "left");
  assert.equal(s.hint.textContent, `Turn into a group name: ${evil}`);
  assert.equal(s.hint.children.length, 0, "plain text, no child elements");
  s.W.endDrag();
  altKey(s.W, regroupTagGrip(s.document, "sex"), "ArrowDown");
  await tick();
  const announce = s.document.byId.get("tabellify-table-announce");
  assert.equal(announce.textContent, `sex moved to group ${evil}`);
  assert.equal(announce.children.length, 0);
  // (The fake DOM throws on innerHTML, so reaching this line also proves none was used.)
});

// Owner smoke test after the 006c merge (2026-11-13): "the tags disappear when dragged to
// the western boundary ... they should never disappear". After a flip made "bmi" the name of
// a group whose only column is smoker, dragging smoker out (e.g. to the left edge of the
// "bmi" header) emptied the group, so the "bmi" header vanished from the table.
// Spec Amendment 3 (owner, option B): the emptied group turns back into the tag "bmi".
test("Amendment 3: dragging a flipped group's only tag west turns the group back into a tag", async () => {
  const s = regroupSetup({ ungrouped: A2_UNGROUPED });
  Object.assign(s.W.strings, {
    "tabellify-drop-hint-group-to-tag": "· Group becomes a tag:",
    "tabellify-regroup-group-to-tag": "The group became a tag again.",
  });
  startTagDrag(s.W, s.document, "bmi");
  s.W.onTableDrop(dragEvent(tagTh(s.document, "smoker"), ZONE.top));
  await tick();
  assert.equal(superTh(s.document, "g9").textContent, "bmi");
  startTagDrag(s.W, s.document, "smoker");
  // The hint says what will happen, including the group turning back into a tag.
  const ev = over(s.W, superTh(s.document, "g9"), "left");
  assert.equal(ev.prevented, true);
  assert.equal(s.hint.textContent, "Move to Ungrouped · Group becomes a tag: bmi");
  s.W.onTableDrop(dragEvent(superTh(s.document, "g9"), ZONE.left));
  await tick();
  // "bmi" is a column again, where the group was; smoker right before it; no "bmi" group.
  assert.deepEqual(tagHeaders(s.document).slice(0, 5), ["age", "sex", "smoker", "bmi", "diet"]);
  assert.equal(tagTh(s.document, "bmi").dataset.groupId, "ungrouped");
  assert.equal(superTh(s.document, "g9"), undefined);
  const saved = JSON.parse(s.files.get("/d/codebooks.json")).codebooks[0];
  assert.equal(saved.groups.some((g) => g.id === "g9"), false, "the group left the codebook");
  assert.deepEqual(saved.tags.find((t) => t.name === "bmi"), { name: "bmi", group: null });
  assert.equal(s.document.getElementById("tabellify-codebook-status-text").textContent,
    "tabellify-codebook-saved tabellify-regroup-ungrouped The group became a tag again.");
  assert.ok(s.debug.includes("Tabellify: workspace: regroup: emptied group g9 turned back into a tag (drag)"), s.debug.join("\n"));
  assert.ok(!s.debug.some((m) => /regroup:/.test(m) && /bmi|smoker/.test(m)), "no names in Debug Output");
  assert.ok(s.W.LAYOUT_STRINGS.includes("tabellify-regroup-group-to-tag"));
  assert.ok(s.W.LAYOUT_STRINGS.includes("tabellify-drop-hint-group-to-tag"));
});

test("Amendment 3: Alt+Up on a group's only tag turns the group back into a tag (announced)", async () => {
  const s = regroupSetup({ ungrouped: ["age"], groups: [{ id: "g7", name: "Solo", tags: ["only"] }, ...REGROUP_GROUPS()] });
  s.W.strings["tabellify-regroup-group-to-tag"] = "The group became a tag again.";
  altKey(s.W, regroupTagGrip(s.document, "only"), "ArrowUp");
  await tick();
  assert.deepEqual(tagHeaders(s.document).slice(0, 3), ["age", "only", "Solo"]);
  assert.equal(tagTh(s.document, "Solo").dataset.groupId, "ungrouped");
  assert.equal(regroupTagGrip(s.document, "only").focused, true);
  assert.equal(s.document.byId.get("tabellify-table-announce").textContent, "only is now ungrouped. The group became a tag again.");
  assert.deepEqual(pills(s.document).slice(0, 1), ["Ungrouped · 3 (u)"]);
});
