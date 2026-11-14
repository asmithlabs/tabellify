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
  focus() { this.focused = true; this.focusCalls = (this.focusCalls ?? 0) + 1; activeElement = this; }
  // F007a: text fields (select all) and the <dialog> (showModal / close / open, and the
  // "close" event, which the fake fires at once; a real browser fires it a moment later).
  select() { this.selectCalls = (this.selectCalls ?? 0) + 1; }
  get open() { return this.attrs.has("open"); }
  showModal() { this.showModalCalls = (this.showModalCalls ?? 0) + 1; this.attrs.set("open", ""); }
  close() {
    this.closeCalls = (this.closeCalls ?? 0) + 1;
    if (!this.attrs.has("open")) return;
    this.attrs.delete("open");
    for (const fn of this.listeners?.get("close") ?? []) fn({ type: "close", target: this });
  }
  addEventListener(type, fn) {
    this.listeners ??= new Map();
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners?.get(type)?.delete(fn); }
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
    "tag-monitor-model.js", "table-layout-model.js", "regroup-model.js", "saved-tables-model.js", "tables-store.js",
    "csv-model.js", "csv-export.js", "workspace.js"]) {
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
    S: sandbox.TabellifyScriptSuggest, R: sandbox.TabellifyRegroup, Zotero, document, debug, sandbox,
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

// ---------------------------------------------------------------------------------------
// Feature 008 AC16: "Export CSV" with a fake save dialog and a fake write (`exportIo`)
// ---------------------------------------------------------------------------------------

const EXPORT_TEXTS = {
  "tabellify-column-title": "Title",
  "tabellify-export-dialog-title": "Export table as CSV",
  "tabellify-export-filter": "CSV files",
  "tabellify-export-saved": "CSV saved:",
  "tabellify-export-picker-error": "The save dialog could not be opened. Nothing was saved.",
  "tabellify-export-write-error": "The CSV file could not be saved. Check that you can write to this folder, then try again:",
  "tabellify-export-file-fallback": "Tabellify table",
  "tabellify-csv-header-k": "Tags used (k)",
  "tabellify-csv-header-m": "Codebook tags (M)",
};
const EXPORT_PATH = "/Users/tester/Desktop/secret-folder/F005 test.csv";

/**
 * A fake `exportIo`. `picked` is what the dialog returns (null = Cancel); `onPick` runs
 * while the "dialog is open" (to look at the button, or to close the tab).
 */
function fakeExportIo({ picked = { path: EXPORT_PATH, replace: false }, pickError = null, writeError = null, onPick = null } = {}) {
  const io = {
    picks: [],
    writes: [],
    async pickSavePath(options) {
      io.picks.push(options);
      if (onPick) onPick();
      if (pickError) throw pickError;
      return picked;
    },
    async writeUTF8(path, text, options) {
      io.writes.push({ path, text, options });
      if (writeError) throw writeError;
      return text.length + 3;
    },
  };
  return io;
}

/** setup() plus the export's strings and a fake io. */
function setupExport(io, options) {
  const env = setup(options);
  Object.assign(env.W.strings, EXPORT_TEXTS);
  env.W.untitledText = "(untitled)";
  env.W.exportIo = io;
  return env;
}

/** The CSV rows (without BOM and the final CRLF), split into simple comma cells. */
const csvLines = (text) => text.slice(1).split("\r\n").slice(0, -1);

/** What the table shows now, as the expected CSV paper lines (title, 1/empty…, k, M). */
function expectedPaperLines(doc) {
  return bodyRows(doc).map((tr) => {
    const cells = tr.children.slice(1);
    const tags = cells.filter((td) => td.classList.contains("tabellify-col-tag")).map((td) => (td.classList.contains("tabellify-tag-used") ? "1" : ""));
    const [k, m] = cells.at(-1).textContent.split("/");
    return [cells[0].textContent, ...tags, k, m].join(",");
  });
}

const status = (doc) => ({
  hidden: doc.getElementById("tabellify-export-status").hidden,
  text: doc.getElementById("tabellify-export-status-text").textContent,
  path: doc.getElementById("tabellify-export-status-path").textContent,
  pathHidden: doc.getElementById("tabellify-export-status-path").hidden,
  error: doc.getElementById("tabellify-export-status").classList.contains("tabellify-export-error"),
});

test("008 AC16: the actions block is shown and hidden together with the table", () => {
  const { W, document } = setupExport(fakeExportIo());
  assert.equal(document.getElementById("tabellify-table-actions").hidden, false);
  assert.equal(document.byId.get("tabellify-items-table").hidden, false);
  // A collection without papers: no table, no button.
  W.monitorData = { ...monitorData(), papers: [] };
  W.renderMonitor();
  assert.equal(document.byId.get("tabellify-items-table").hidden, true);
  assert.equal(document.getElementById("tabellify-table-actions").hidden, true);
  // Back to papers, then the placeholder: hidden again.
  W.monitorData = monitorData();
  W.renderMonitor();
  assert.equal(document.getElementById("tabellify-table-actions").hidden, false);
  W.setTableHidden(true);
  assert.equal(document.getElementById("tabellify-table-actions").hidden, true);
});

test("008 AC16: a click exports exactly the rendered table (headers, rows, order) and shows the path", async () => {
  const io = fakeExportIo();
  const { W, document } = setupExport(io);
  const result = await W.onExportClick();
  assert.equal(result.status, "saved");
  assert.equal(io.writes.length, 1);
  const { path, text, options } = io.writes[0];
  assert.equal(path, EXPORT_PATH);
  assert.deepEqual(JSON.parse(JSON.stringify(options)), { tmpPath: `${EXPORT_PATH}.tabellify-tmp` });
  assert.equal(text[0], "﻿");
  const lines = csvLines(text);
  assert.deepEqual(lines.slice(0, 2), [
    ",Exposure,Exposure,Outcome,,",
    "Title,Heat index,Temperature,Mortality,Tags used (k),Codebook tags (M)",
  ]);
  assert.deepEqual(lines.slice(2), expectedPaperLines(document));
  assert.equal(lines.length - 2, 3, "one line per paper");
  // Status: "CSV saved:" + the path, as text; not an error.
  assert.deepEqual(status(document), { hidden: false, text: "CSV saved:", path: EXPORT_PATH, pathHidden: false, error: false });
  // The dialog got the title, the filter and the suggested name.
  assert.equal(io.picks[0].title, "Export table as CSV");
  assert.equal(io.picks[0].filterTitle, "CSV files");
});

test("008 AC16: after a sort and after a column move the exported text follows the screen", async () => {
  const io = fakeExportIo();
  const { W, T, L, document } = setupExport(io);
  W.sortKey = T.tagSortKey("Heat index");
  W.sortDirection = "desc";
  W.renderMonitor();
  await W.onExportClick();
  const sorted = csvLines(io.writes[0].text).slice(2);
  assert.deepEqual(sorted, expectedPaperLines(document));
  assert.deepEqual(sorted.map((l) => l.split(",")[0]), rowTitles(document));
  // Move the whole Outcome group to the front.
  W.columnLayout = L.moveTopItem(W.columnLayout, W.codebookGroups(), { group: "g3" }, 0);
  W.renderMonitor();
  await W.onExportClick();
  const moved = csvLines(io.writes[1].text);
  assert.deepEqual(moved.slice(0, 2), [
    ",Outcome,Exposure,Exposure,,",
    "Title,Mortality,Heat index,Temperature,Tags used (k),Codebook tags (M)",
  ]);
  assert.deepEqual(moved.slice(2), expectedPaperLines(document));
});

test("008 AC16: ungrouped tags get a blank super-header; untitled papers get the shown label", async () => {
  const io = fakeExportIo();
  const env = load();
  const { W, L } = env;
  Object.assign(W.strings, EXPORT_TEXTS);
  W.untitledText = "(untitled)";
  W.exportIo = io;
  W.codebook = codebookData(GROUPS(), ["age"]);
  const data = monitorData();
  data.papers.push({ id: 104, title: "", collectionId: 1, itemTags: [], annotationTags: [{ tag: "age" }] });
  data.keys.set(104, "ITEM0104");
  W.monitorData = data;
  W.collectionKeys = data.collectionKeys;
  W.currentCollection = "1";
  W.columnLayout = L.emptyColumnLayout();
  W.renderMonitor();
  await W.onExportClick();
  const lines = csvLines(io.writes[0].text);
  assert.equal(lines[0], ",,Exposure,Exposure,Outcome,,");
  assert.equal(lines[1], "Title,age,Heat index,Temperature,Mortality,Tags used (k),Codebook tags (M)");
  assert.ok(lines.includes("(untitled),1,,,,1,4"), lines.join("\n"));
});

test("008 AC16: the button is disabled while the export runs and enabled after", async () => {
  let duringDialog = null;
  let doc = null;
  const io = fakeExportIo({ onPick: () => { duringDialog = doc.getElementById("tabellify-export-csv").disabled; } });
  const { W, document } = setupExport(io);
  doc = document;
  const running = W.onExportClick();
  // A second click while the first export runs does nothing (one click = one dialog).
  assert.equal(await W.onExportClick(), null);
  await running;
  assert.equal(duringDialog, true);
  assert.equal(document.getElementById("tabellify-export-csv").disabled, false);
  assert.equal(io.picks.length, 1);
  assert.equal(W.exportBusy, false);
});

test("008 AC16: Cancel writes nothing and shows no message; Export works again at once", async () => {
  const io = fakeExportIo({ picked: null });
  const { W, document } = setupExport(io);
  W.showExportStatus("tabellify-export-saved", "/old/path.csv"); // an earlier message is cleared
  const result = await W.onExportClick();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { status: "cancelled", reason: "dialog" });
  assert.equal(io.writes.length, 0);
  assert.equal(status(document).hidden, true);
  assert.equal(document.getElementById("tabellify-export-csv").disabled, false);
});

test("008 AC16: a failing dialog and a failing write each show their message in the error style", async () => {
  const pickFail = setupExport(fakeExportIo({ pickError: new TypeError("no browsing context") }));
  let errors = 0;
  pickFail.Zotero.logError = () => errors++;
  assert.equal((await pickFail.W.onExportClick()).stage, "picker");
  assert.deepEqual(status(pickFail.document), {
    hidden: false, text: EXPORT_TEXTS["tabellify-export-picker-error"], path: "", pathHidden: true, error: true,
  });
  assert.equal(errors, 1, "Zotero.logError called once");

  const writeIo = fakeExportIo({ writeError: Object.assign(new Error(`cannot write ${EXPORT_PATH}`), { name: "NotAllowedError" }) });
  const writeFail = setupExport(writeIo);
  assert.equal((await writeFail.W.onExportClick()).stage, "write");
  assert.deepEqual(status(writeFail.document), {
    hidden: false, text: EXPORT_TEXTS["tabellify-export-write-error"], path: EXPORT_PATH, pathHidden: false, error: true,
  });
  assert.ok(writeFail.debug.some((m) => m.includes("export: CSV not written: write failed (NotAllowedError)")));
  // Success afterwards drops the error style.
  writeIo.writes.length = 0;
  writeFail.W.exportIo = fakeExportIo();
  await writeFail.W.onExportClick();
  assert.equal(status(writeFail.document).error, false);
});

test("008 AC16: the tab closing while the dialog is open → no write and no DOM change", async () => {
  let env = null;
  const io = fakeExportIo({ onPick: () => { env.W.unloaded = true; } });
  env = setupExport(io);
  const { W, document } = env;
  const result = await W.onExportClick();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { status: "cancelled", reason: "closed" });
  assert.equal(io.writes.length, 0);
  assert.equal(status(document).hidden, true);
  assert.equal(status(document).text, "");
  assert.ok(env.debug.some((m) => m.includes("tab closed while the save dialog was open; nothing written")));
  assert.equal(W.exportBusy, false);
});

test("008 AC16: the suggested name is the chosen collection's name and today's local date", async () => {
  const io = fakeExportIo({ picked: null });
  const { W } = setupExport(io);
  const before = new Date();
  await W.onExportClick();
  const pad = (n) => String(n).padStart(2, "0");
  const name = (d) => `F005 test ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
  assert.ok([name(before), name(new Date())].includes(io.picks[0].defaultName), io.picks[0].defaultName);
  // A collection name with reserved characters is cleaned; the 007a hook overrides it.
  W.monitorData.collections[0].name = "a/b: c";
  await W.onExportClick();
  assert.match(io.picks[1].defaultName, /^ab c \d{4}-\d{2}-\d{2}\.csv$/);
  await W.exportCsv("My table");
  assert.match(io.picks[2].defaultName, /^My table \d{4}-\d{2}-\d{2}\.csv$/);
});

// ---------------------------------------------------------------------------------------
// Feature 007a AC15: the page's export status line goes when another collection is chosen
// ---------------------------------------------------------------------------------------

test("007a AC15: choosing a collection or the placeholder hides the export line; refresh and live updates keep it", async () => {
  for (const [value, reason, hidden] of [
    ["1", "collection chosen", true],
    ["", "collection chosen", true],
    ["1", "refresh", false],
    ["1", "library change", false],
  ]) {
    const io = fakeExportIo();
    const { W, document } = setupExport(io);
    // The library read is replaced by the test data (no Zotero.Collections in Node).
    W.gatherMonitorData = async () => monitorData();
    await W.onExportClick();
    assert.equal(status(document).hidden, false, "CSV saved: shown first");
    await W.showCollection(value, reason);
    assert.equal(status(document).hidden, hidden, `${reason} (${value || "placeholder"})`);
    if (hidden) assert.equal(status(document).text, "");
    else assert.equal(status(document).path, EXPORT_PATH);
  }
});

test("008 AC16: Debug Output during an export holds no title, tag, group, collection name or path", async () => {
  const secrets = ["Paper 1", "Paper 2", "Paper 3", "Heat index", "Temperature", "Mortality", "Exposure", "Outcome",
    "F005 test", EXPORT_PATH, "secret-folder", "tester"];
  for (const io of [
    fakeExportIo({ picked: { path: EXPORT_PATH, replace: true } }),
    fakeExportIo({ picked: null }),
    fakeExportIo({ pickError: Object.assign(new Error(`failed at ${EXPORT_PATH}`), { name: "TypeError" }) }),
    fakeExportIo({ writeError: Object.assign(new Error(`failed at ${EXPORT_PATH}`), { name: "NotAllowedError" }) }),
  ]) {
    const env = setupExport(io);
    const start = env.debug.length;
    await env.W.onExportClick();
    const lines = env.debug.slice(start);
    assert.ok(lines.length >= 2, "built + outcome logged");
    for (const line of lines) {
      assert.match(line, /^Tabellify: workspace: export: /);
      for (const secret of secrets) assert.ok(!line.includes(secret), `"${secret}" in: ${line}`);
    }
  }
  const env = setupExport(fakeExportIo({ picked: { path: EXPORT_PATH, replace: true } }));
  await env.W.onExportClick();
  assert.ok(env.debug.some((m) => /export: CSV built: 3 paper\(s\), 3 tag column\(s\), 2 group\(s\), 2 header row\(s\)$/.test(m)));
  assert.ok(env.debug.some((m) => /export: CSV written: \d+ bytes \(replaced an existing file: yes\)$/.test(m)));
});

// ---------------------------------------------------------------------------------------
// Feature 007a AC12: the read-only copy for the "View table" modal (viewTableRows)
// ---------------------------------------------------------------------------------------

const VIEW_TEXTS = { count: "k/M", countLabel: "Codebook tags used on the paper (k of M)" };

/** The copy's rows as arrays of this realm (the sandbox's arrays fail deepEqual). */
function viewRows(W) {
  const { head, body } = W.viewTableRows(W.pageView(), VIEW_TEXTS);
  return { head: [...head], body: [...body] };
}

/** setup() plus the strings the copy uses; returns the env and the copy's rows. */
function viewSetup(options) {
  const env = setup(options);
  Object.assign(env.W.strings, { "tabellify-column-title": "Title" });
  env.W.untitledText = "(untitled)";
  env.W.renderMonitor();
  return { ...env, view: viewRows(env.W) };
}

/** Every element of the copy, rows included. */
const viewElements = (view) => [...view.head, ...view.body].flatMap((tr) => [tr, ...tr.descendants()]);

/** The page's group-row headers without the fixed cells: text, colSpan, ungrouped look. */
const pageSuperHeaders = (doc) => headerRow(doc, "tabellify-items-group-row")
  .filter((th) => !th.classList.contains("tabellify-fixed-header") && !th.hasAttribute("data-tag"))
  .map((th) => [th.textContent, th.colSpan, th.classList.contains("tabellify-col-group-ungrouped")]);

test("007a AC12: two header rows when a real group has columns: Title, groups over their tags, k/M", () => {
  const { W, document, view } = viewSetup();
  assert.equal(view.head.length, 2);
  const [top, second] = view.head;
  const title = top.children[0];
  const count = top.children.at(-1);
  assert.equal(title.textContent, "Title");
  assert.equal(title.rowSpan, 2);
  assert.equal(count.textContent, "k/M");
  assert.equal(count.rowSpan, 2);
  assert.equal(count.title, VIEW_TEXTS.countLabel);
  assert.equal(count.getAttribute("aria-label"), VIEW_TEXTS.countLabel);
  const supers = top.children.slice(1, -1);
  assert.deepEqual(supers.map((th) => [th.textContent, th.colSpan, th.getAttribute("scope")]),
    [["Exposure", 2, "colgroup"], ["Outcome", 1, "colgroup"]]);
  // Same as the page header (built through the same headerShape rule).
  assert.deepEqual(supers.map((th) => [th.textContent, th.colSpan, false]), pageSuperHeaders(document));
  assert.deepEqual(second.children.map((th) => th.textContent), tagHeaders(document));
  assert.deepEqual(second.children.map((th) => th.classList.contains("tabellify-group-start")), [true, false, true]);
  assert.deepEqual(plainJson(W.headerShape(W.tableGroups)), { oneRow: false, twoRows: true, tagCount: 3 });
});

test("007a AC12: rows follow tableRows: titles, ✓ cells, aria-labels and k/M as on the page", () => {
  const { W, T, document } = setup();
  Object.assign(W.strings, { "tabellify-column-title": "Title" });
  W.sortKey = T.tagSortKey("Heat index");
  W.sortDirection = "desc";
  W.renderMonitor();
  const view = viewRows(W);
  assert.deepEqual(view.body.map((tr) => tr.children[0].textContent), rowTitles(document));
  // Page rows minus the grip cell: the same ✓ pattern and k/M text.
  assert.deepEqual(view.body.map((tr) => [tr.children[0].textContent, ...tr.children.slice(1).map((td) =>
    td.classList.contains("tabellify-col-tag") ? (td.classList.contains("tabellify-tag-used") ? "✓" : "·") : td.textContent)].join(" | ")),
  bodyRows(document).map(rowText));
  const page = bodyRows(document).map((tr) => tr.children.slice(2, -1).map((td) => td.getAttribute("aria-label")));
  assert.deepEqual(view.body.map((tr) => tr.children.slice(1, -1).map((td) => td.getAttribute("aria-label"))), page);
  assert.ok(page.flat().includes("Heat index: Used") && page.flat().includes("Mortality: Not used"));
  // Stripes on every other row.
  assert.deepEqual(view.body.map((tr) => tr.classList.contains("tabellify-row-alt")), [false, true, false]);
});

test("007a AC12: only ungrouped tags → one header row; Title and k/M span one row", () => {
  const { W, document, view } = viewSetup({ groups: [], ungrouped: ["age", "sex"] });
  assert.equal(view.head.length, 1);
  assert.deepEqual(view.head[0].children.map((th) => th.textContent), ["Title", "age", "sex", "k/M"]);
  assert.deepEqual(view.head[0].children.map((th) => th.rowSpan), [1, 1, 1, 1]);
  assert.equal(document.byId.get("tabellify-items-tag-row").hidden, true, "page also has one row");
  assert.deepEqual(plainJson(W.headerShape(W.tableGroups)), { oneRow: true, twoRows: false, tagCount: 2 });
});

test("007a AC12: each ungrouped run gets the muted \"Ungrouped\" label with its colSpan, as on the page", () => {
  const env = setup({ ungrouped: ["age", "sex"] });
  const { W, L, document } = env;
  Object.assign(W.strings, { "tabellify-column-title": "Title" });
  // Put the Outcome group between the two ungrouped tags: runs [age], Outcome, [sex], Exposure.
  W.columnLayout = L.moveTopItem(W.columnLayout, W.codebookGroups(), { group: "g3" }, 1);
  W.renderMonitor();
  const view = viewRows(W);
  const supers = view.head[0].children.slice(1, -1)
    .map((th) => [th.textContent, th.colSpan, th.classList.contains("tabellify-col-group-ungrouped")]);
  assert.deepEqual(supers, pageSuperHeaders(document));
  assert.deepEqual(supers.filter((s) => s[2]).map((s) => [s[0], s[1]]), [["Ungrouped", 1], ["Ungrouped", 1]]);
  assert.deepEqual(view.head[1].children.map((th) => th.textContent), tagHeaders(document));
});

test("007a AC12: without counting k/M shows \"–\"; a complete paper gets tabellify-count-complete", () => {
  const none = viewSetup({ groups: [] });
  assert.equal(none.view.head.length, 1);
  assert.deepEqual(none.view.head[0].children.map((th) => th.textContent), ["Title", "k/M"]);
  assert.deepEqual(none.view.body.map((tr) => tr.children.at(-1).textContent), ["–", "–", "–"]);
  assert.ok(none.view.body.every((tr) => !tr.children.at(-1).classList.contains("tabellify-count-complete")));

  const one = viewSetup({ groups: [{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] }] });
  const counts = Object.fromEntries(one.view.body.map((tr) => [tr.children[0].textContent, tr.children.at(-1)]));
  assert.equal(counts["Paper 2"].textContent, "2/2");
  assert.equal(counts["Paper 2"].classList.contains("tabellify-count-complete"), true);
  assert.equal(counts["Paper 3"].classList.contains("tabellify-count-complete"), false);
});

test("007a AC12: no id, draggable, tabindex, role, data-* or <button> anywhere in the copy", () => {
  const { view } = viewSetup({ ungrouped: ["age"] });
  const all = viewElements(view);
  assert.ok(all.length > 20, "copy is not empty");
  for (const el of all) {
    assert.notEqual(el.localName, "button");
    for (const attr of el.attrs.keys()) {
      assert.ok(!["id", "draggable", "tabindex", "role"].includes(attr) && !attr.startsWith("data-"), `${el.localName}[${attr}]`);
    }
  }
});

test("007a AC12: markup in titles, tags and group names stays text; never \"null\" or \"undefined\"", () => {
  const env = load();
  const { W, L } = env;
  Object.assign(W.strings, { "tabellify-column-title": "Title" });
  W.untitledText = "(untitled)";
  W.codebook = codebookData([{ id: "g2", name: "<i>G</i>", tags: ["<b>t</b>"] }], ["<b>u</b>"]);
  const data = monitorData();
  data.papers = [
    { id: 101, title: "<b>x</b>", collectionId: 1, itemTags: [], annotationTags: [{ tag: "<b>t</b>" }] },
    { id: 102, title: "", collectionId: 1, itemTags: [], annotationTags: [] },
  ];
  W.monitorData = data;
  W.collectionKeys = data.collectionKeys;
  W.currentCollection = "1";
  W.columnLayout = L.emptyColumnLayout();
  W.renderMonitor();
  const view = viewRows(W);
  const all = viewElements(view);
  const texts = all.map((el) => el.text);
  for (const s of ["<b>x</b>", "<i>G</i>", "<b>t</b>", "<b>u</b>", "(untitled)"]) assert.ok(texts.includes(s), s);
  const untitled = view.body.map((tr) => tr.children[0]).find((td) => td.textContent === "(untitled)");
  assert.equal(untitled.classList.contains("tabellify-untitled"), true);
  for (const el of all) {
    for (const value of [el.text, ...el.attrs.values()]) {
      assert.ok(!/\bnull\b|\bundefined\b/.test(value), `"${value}" on ${el.localName}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Feature 007a AC13 / AC14: the "View table" modal with a fake <dialog>
// ---------------------------------------------------------------------------------------

const VIEW_STRINGS_TEXTS = {
  "tabellify-column-title": "Title",
  "tabellify-column-count": "k/M",
  "tabellify-view-count-label": "Codebook tags used on the paper (k of M)",
};

/** setupExport() plus the view's strings; the dialog's "close" event wired as init() does. */
function modalSetup(io = fakeExportIo(), options) {
  const env = setupExport(io, options);
  Object.assign(env.W.strings, VIEW_STRINGS_TEXTS);
  const d = (id) => env.document.getElementById(id);
  d("tabellify-view-dialog").addEventListener("close", env.W.onViewClose);
  // Real buttons start enabled.
  for (const id of ["tabellify-view-export", "tabellify-view-close", "tabellify-view-table", "tabellify-export-csv", "tabellify-view-save",
    "tabellify-view-live", "tabellify-view-update", "tabellify-view-save-new"]) {
    d(id).localName = "button"; // the fake makes unknown IDs <div>s; the click handler looks for a button
    d(id).id = id;
    d(id).disabled = false;
  }
  return { ...env, d, io };
}

const key = (k, extra = {}) => ({ key: k, shiftKey: false, isComposing: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra });
const click = (target) => ({ target });

test("007a AC13: a click opens the modal once; Name = collection name (focused, selected), Description empty", () => {
  const { W, d, debug } = modalSetup();
  W.onViewTableClick();
  const dialog = d("tabellify-view-dialog");
  assert.equal(dialog.open, true);
  assert.equal(dialog.showModalCalls, 1);
  W.onViewTableClick(); // already open: nothing
  assert.equal(dialog.showModalCalls, 1);
  assert.equal(d("tabellify-view-name").value, "F005 test");
  assert.equal(d("tabellify-view-description").value, "");
  assert.equal(d("tabellify-view-name").focused, true);
  assert.equal(d("tabellify-view-name").selectCalls, 1);
  // The copy is in the modal's table; the modal's status line is hidden.
  assert.equal(d("tabellify-view-body").children.length, 3);
  assert.equal(d("tabellify-view-head").children.length, 2);
  assert.equal(d("tabellify-view-export-status").hidden, true);
  assert.ok(debug.some((m) => /view: opened: 3 paper\(s\), 3 tag column\(s\), 2 header row\(s\)$/.test(m)), debug.join("\n"));
});

test("007a AC13: no table → the click does nothing", () => {
  const { W, d } = modalSetup();
  W.setTableHidden(true);
  W.onViewTableClick();
  assert.equal(d("tabellify-view-dialog").showModalCalls, undefined);
});

test("007a AC13: values are remembered per collection key; unchanged values are not; another key gets defaults", () => {
  const { W, d } = modalSetup();
  // Unchanged: nothing remembered.
  W.onViewTableClick();
  W.closeView();
  assert.equal(W.viewDrafts.size, 0);
  // Typed values come back after closing and reopening.
  W.onViewTableClick();
  d("tabellify-view-name").value = "Heat and hospitalization";
  d("tabellify-view-description").value = "Short note";
  W.onViewClick(click(d("tabellify-view-close")));
  assert.equal(d("tabellify-view-dialog").open, false);
  d("tabellify-view-name").value = "";
  d("tabellify-view-description").value = "";
  W.onViewTableClick();
  assert.equal(d("tabellify-view-name").value, "Heat and hospitalization");
  assert.equal(d("tabellify-view-description").value, "Short note");
  W.closeView();
  // Another collection (other key, other name): defaults.
  W.monitorData.collections = [{ id: 2, parentID: false, name: "Other" }];
  W.monitorData.rootId = 2;
  W.collectionKeys = new Map([[1, "1/COLL0001"], [2, "1/COLL0002"]]);
  W.currentCollection = "2";
  W.onViewTableClick();
  assert.equal(d("tabellify-view-name").value, "Other");
  assert.equal(d("tabellify-view-description").value, "");
  W.closeView();
  assert.deepEqual([...W.viewDrafts.keys()], ["1/COLL0001"]);
});

test("007a AC13: Close and Escape close the modal; Escape while composing does not; focus returns to View table", () => {
  const { W, d, debug } = modalSetup();
  const dialog = d("tabellify-view-dialog");
  W.onViewTableClick();
  const composing = key("Escape", { isComposing: true });
  W.onViewKeydown(composing);
  assert.equal(dialog.open, true);
  assert.equal(composing.prevented, false);
  const esc = key("Escape");
  W.onViewKeydown(esc);
  assert.equal(dialog.open, false);
  assert.equal(esc.prevented, true);
  assert.equal(d("tabellify-view-table").focused, true);
  assert.ok(debug.includes("Tabellify: workspace: view: closed"));
  d("tabellify-view-table").focused = false;
  W.onViewTableClick();
  W.onViewClick(click(d("tabellify-view-close")));
  assert.equal(dialog.open, false);
  assert.equal(d("tabellify-view-table").focused, true);
});

test("007a AC13: Tab wraps from the last enabled control to Name, Shift+Tab from Name to the last", () => {
  const { W, d } = modalSetup();
  W.onViewTableClick();
  // Tab on Close → Name.
  d("tabellify-view-close").focus();
  const tab = key("Tab");
  W.onViewKeydown(tab);
  assert.equal(tab.prevented, true);
  assert.equal(d("tabellify-view-name").focusCalls, 2); // once on open, once now
  // Shift+Tab on Name → Close.
  const back = key("Tab", { shiftKey: true });
  W.onViewKeydown(back);
  assert.equal(back.prevented, true);
  assert.equal(d("tabellify-view-close").focusCalls, 2);
  // Tab in the middle is left to the browser.
  d("tabellify-view-description").focus();
  const middle = key("Tab");
  W.onViewKeydown(middle);
  assert.equal(middle.prevented, false);
  // A disabled Close (hypothetical) makes Export the last control; a disabled Export is skipped.
  d("tabellify-view-close").disabled = true;
  d("tabellify-view-export").focus();
  const tab2 = key("Tab");
  W.onViewKeydown(tab2);
  assert.equal(tab2.prevented, true);
  d("tabellify-view-close").disabled = false;
  d("tabellify-view-export").disabled = true;
  d("tabellify-view-name").focus();
  const back2 = key("Tab", { shiftKey: true });
  W.onViewKeydown(back2);
  assert.equal(back2.prevented, true);
  assert.equal(activeElementOf(d), d("tabellify-view-close"));
});
const activeElementOf = () => activeElement;

test("007a AC13: setTableHidden(true) while open closes the modal; renderPaperTable while open re-renders the copy", () => {
  const { W, T, d } = modalSetup();
  W.onViewTableClick();
  const titles = () => d("tabellify-view-body").children.map((tr) => tr.children[0].textContent);
  const pageTitles = () => d("tabellify-items-body").children.map((tr) => tr.children[1].textContent);
  const before = titles();
  assert.deepEqual(before, pageTitles());
  // A sort on the page while the modal is open: the copy follows the new order.
  W.sortKey = T.tagSortKey("Temperature");
  W.sortDirection = "desc";
  W.renderMonitor();
  assert.deepEqual(titles(), pageTitles());
  assert.notDeepEqual(titles(), before, "the sort changed the order");
  // A live update that finds no papers hides the table and closes the modal.
  W.monitorData = { ...monitorData(), papers: [] };
  W.renderMonitor();
  assert.equal(d("tabellify-view-dialog").open, false);
  // Focus goes to the dropdown, because "View table" is gone.
  assert.equal(d("tabellify-collection-select").focused, true);
});

test("007a AC14: the modal's Export uses the trimmed Name; blank Name uses the collection name", async () => {
  const io = fakeExportIo({ picked: null });
  const { W, d } = modalSetup(io);
  W.onViewTableClick();
  d("tabellify-view-name").value = "  Heat study: draft/1  ";
  await W.onViewClick(click(d("tabellify-view-export")));
  assert.match(io.picks[0].defaultName, /^Heat study draft1 \d{4}-\d{2}-\d{2}\.csv$/);
  d("tabellify-view-name").value = "   ";
  await W.onViewClick(click(d("tabellify-view-export")));
  assert.match(io.picks[1].defaultName, /^F005 test \d{4}-\d{2}-\d{2}\.csv$/);
  // The typed Name was remembered before the export.
  assert.equal(W.viewDrafts.get("1/COLL0001").name, "   ");
});

test("007a AC14: both export buttons are disabled during the export; the result shows in the modal only", async () => {
  let during = null;
  let d = null;
  const io = fakeExportIo({ onPick: () => { during = [d("tabellify-export-csv").disabled, d("tabellify-view-export").disabled]; } });
  const env = modalSetup(io);
  d = env.d;
  const { W, document } = env;
  W.showExportStatus("tabellify-export-saved", "/old/page.csv"); // the page's line must stay
  W.onViewTableClick();
  const result = await W.onViewClick(click(d("tabellify-view-export")));
  assert.equal(result.status, "saved");
  assert.deepEqual(during, [true, true]);
  assert.equal(d("tabellify-export-csv").disabled, false);
  assert.equal(d("tabellify-view-export").disabled, false);
  assert.equal(d("tabellify-view-export-status").hidden, false);
  assert.equal(d("tabellify-view-export-status-text").textContent, "CSV saved:");
  assert.equal(d("tabellify-view-export-status-path").textContent, EXPORT_PATH);
  assert.equal(status(document).path, "/old/page.csv", "page line untouched");
  // The same file content as a page export.
  await W.onExportClick();
  assert.equal(io.writes[0].text, io.writes[1].text);
});

test("007a AC14: the modal closed while the save dialog is open → the result shows on the page", async () => {
  let env = null;
  const io = fakeExportIo({ onPick: () => env.W.closeView() });
  env = modalSetup(io);
  const { W, d, document } = env;
  W.onViewTableClick();
  await W.onViewClick(click(d("tabellify-view-export")));
  assert.equal(d("tabellify-view-export-status").hidden, true);
  assert.equal(status(document).hidden, false);
  assert.equal(status(document).text, "CSV saved:");
});

test("007a AC14: no Debug Output line holds the Name, Description, a title, tag, group, collection name or path", async () => {
  const secrets = ["Paper 1", "Paper 2", "Paper 3", "Heat index", "Temperature", "Mortality", "Exposure", "Outcome",
    "F005 test", EXPORT_PATH, "secret-folder", "tester", "Private name", "Private description"];
  for (const io of [fakeExportIo(), fakeExportIo({ picked: null }),
    fakeExportIo({ writeError: Object.assign(new Error(`failed at ${EXPORT_PATH}`), { name: "NotAllowedError" }) })]) {
    const { W, d, debug } = modalSetup(io);
    W.onViewTableClick();
    d("tabellify-view-name").value = "Private name";
    d("tabellify-view-description").value = "Private description";
    await W.onViewClick(click(d("tabellify-view-export")));
    W.closeView();
    assert.ok(debug.includes("Tabellify: workspace: export: started from View table"));
    for (const line of debug) for (const secret of secrets) assert.ok(!line.includes(secret), `"${secret}" in: ${line}`);
  }
});

// ---------------------------------------------------------------------------------------
// Feature 007b AC19–AC21: saved tables (list, modal, export, log) with a fake store `fs`
// ---------------------------------------------------------------------------------------

const SAVED_TEXTS = {
  "tabellify-saved-empty": "No saved tables yet.",
  "tabellify-saved-empty-collection": "No saved tables for this collection.",
  "tabellify-saved-choose": "Choose a collection to see its saved tables.",
  "tabellify-saved-load-error": "The saved tables file could not be read. File:",
  "tabellify-saved-newer": "The saved tables file was made by a newer version of Tabellify. File:",
  "tabellify-saved-papers": "papers",
  "tabellify-saved-columns": "columns",
  "tabellify-saved-on": "Saved",
  "tabellify-saved-collection-missing": "(collection not found)",
  "tabellify-saved-open": "Open",
  "tabellify-saved-delete": "Delete",
  "tabellify-saved-delete-question": "Delete this saved table? This cannot be undone.",
  "tabellify-saved-delete-confirm": "Delete",
  "tabellify-saved-delete-cancel": "Cancel",
  "tabellify-saved-deleted": "Saved table deleted.",
  "tabellify-saved-conflict": "Saved tables were changed in another Tabellify tab and have been reloaded.",
  "tabellify-saved-save-error": "The saved tables could not be saved. File:",
  "tabellify-saved-gone": "This saved table was deleted in another Tabellify tab.",
  "tabellify-saved-error-name-empty": "Type a name before saving.",
  "tabellify-saved-error-limit-tables": "At most 100.",
  "tabellify-saved-error-limit-rows": "Too many papers.",
  "tabellify-saved-error-limit-columns": "Too many columns.",
  "tabellify-saved-error-limit-file": "Too large.",
  "tabellify-export-csv": "Export CSV",
  "tabellify-view-heading": "View table",
  "tabellify-view-heading-saved": "Saved table",
  "tabellify-view-save": "Save table",
  "tabellify-view-save-changes": "Save changes",
  "tabellify-view-meta-snapshot": "Snapshot from",
  "tabellify-view-saved": "Table saved.",
  "tabellify-view-changes-saved": "Changes saved.",
  "tabellify-view-show-live": "Show live",
  "tabellify-view-show-snapshot": "Show snapshot",
  "tabellify-view-update": "Update snapshot",
  "tabellify-view-save-new": "Save as new table",
  "tabellify-view-meta-live": "Live: built from your library now",
  "tabellify-view-saved-new": "Saved as a new table.",
  "tabellify-view-snapshot-updated": "Snapshot updated.",
  "tabellify-view-loading": "Building the live table…",
  "tabellify-view-live-missing": "Saved columns that are no longer in the codebook:",
  "tabellify-view-live-no-collection": "This table's collection is no longer in My Library.",
  "tabellify-view-live-no-codebook": "The codebook could not be loaded.",
  "tabellify-view-live-error": "The live table could not be built.",
};
const SAVED_DIR = "/Users/tester/Zotero tabellify-dev/tabellify";
const SAVED_FILE = `${SAVED_DIR}/tables.json`;
const T1_TIME = "2025-03-14T10:00:00.000Z";
const T2_TIME = "2025-03-15T09:30:00.000Z";

/** A fake store `fs` (like tests/unit/tables-store.test.mjs): "files" in a Map, calls recorded. */
function savedFs(initial = {}, opts = {}) {
  const files = new Map(Object.entries(initial));
  const calls = [];
  return {
    files,
    calls,
    writes: () => calls.filter((c) => c[0] === "writeJSON"),
    async readJSON(path) {
      calls.push(["readJSON", path]);
      if (!files.has(path)) throw Object.assign(new Error(`Could not open ${path}`), { name: "NotFoundError" });
      return JSON.parse(files.get(path));
    },
    async writeJSON(path, value, options) {
      calls.push(["writeJSON", path, options]);
      if (opts.failWrite) throw Object.assign(new Error(`could not write ${path}`), { name: "NotAllowedError" });
      if (options?.backupFile && files.has(path)) files.set(options.backupFile, files.get(path));
      files.set(path, JSON.stringify(value));
      return 1;
    },
    async makeDirectory(path) { calls.push(["makeDirectory", path]); },
    join: (...parts) => parts.join("/"),
  };
}

/** A tables.json text with saved tables built by the real model from a workspace view. */
function savedFileText(sandbox, entries) {
  const S = sandbox.TabellifySavedTables;
  let data = S.emptyData();
  for (const e of entries) {
    const snapshot = e.snapshot ?? {
      takenAt: e.time,
      collectionName: e.collectionName ?? "F005 test",
      blocks: [{ group: "Exposure", tags: ["Heat index", "Temperature"] }, { group: "Outcome", tags: ["Mortality"] }],
      rows: [
        { itemKey: "ITEM0102", title: e.title ?? "Saved paper A", untitled: false, present: [0, 1] },
        { itemKey: "ITEM0101", title: "Saved paper B", untitled: false, present: [2] },
      ],
    };
    const definition = S.buildDefinition({ collectionKey: e.collectionKey ?? "1/COLL0001", codebookId: "c1", columnLayout: null,
      sort: { key: "count", direction: "desc" }, manualOrder: null, countItemTags: false });
    data = S.addTable(data, { name: e.name, description: e.description ?? "", definition, snapshot }, e.time).data;
  }
  return JSON.stringify({ ...data, revision: 3 });
}

/** modalSetup() plus saved-table strings, a fake store fs, and the file loaded. */
async function savedSetup({ entries = null, fileText = undefined, io = fakeExportIo(), options, fsOpts } = {}) {
  const env = modalSetup(io, options);
  const { W, sandbox } = env;
  Object.assign(W.strings, SAVED_TEXTS);
  const text = fileText !== undefined ? fileText : entries ? savedFileText(sandbox, entries) : null;
  const fs = savedFs(text === null ? {} : { [SAVED_FILE]: text }, fsOpts);
  W.savedFs = fs;
  W.savedDir = SAVED_DIR;
  W.collectionNames = new Map([["1/COLL0001", "F005 test"], ["1/COLL0002", "Second"]]);
  await W.loadSavedTables();
  return { ...env, fs, S: sandbox.TabellifySavedTables, Csv: sandbox.TabellifyCsv };
}

const TWO_TABLES = () => [
  { name: "Older table", time: T1_TIME },
  { name: "Newer <b>x</b>", time: T2_TIME, collectionKey: "1/GONE0001", collectionName: "Deleted coll" },
];
const listItems = (d) => d("tabellify-saved-list").children;
const itemOf = (d, id) => listItems(d).find((li) => li.dataset.tableId === id);
const buttonOf = (li, action) => li.querySelector(`button[data-action="${action}"]`);
const savedStatus = (d) => ({
  hidden: d("tabellify-saved-status").hidden,
  text: d("tabellify-saved-status-text").textContent,
  path: d("tabellify-saved-status-path").textContent,
  error: d("tabellify-saved-status").classList.contains("tabellify-export-error"),
});
const fmt = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

test("007b AC19: entries newest first with name, collection, counts and date as text; missing collection marked", async () => {
  const { d, debug } = await savedSetup({ entries: TWO_TABLES() });
  const items = listItems(d);
  assert.deepEqual(items.map((li) => li.dataset.tableId), ["t2", "t1"]);
  const [newer, older] = items;
  assert.equal(newer.querySelector(".tabellify-saved-name").textContent, "Newer <b>x</b>", "markup stays text");
  assert.deepEqual(newer.querySelector(".tabellify-saved-meta").children.map((c) => c.textContent),
    ["Deleted coll (collection not found)", "2 papers", "3 columns", `Saved ${fmt(T2_TIME)}`]);
  assert.deepEqual(older.querySelector(".tabellify-saved-meta").children.map((c) => c.textContent),
    ["F005 test", "2 papers", "3 columns", `Saved ${fmt(T1_TIME)}`]);
  // Buttons: Open, Export CSV, Delete, each named with the table's Name.
  assert.deepEqual(older.querySelectorAll("button").map((b) => [b.dataset.action, b.textContent, b.getAttribute("aria-label")]), [
    ["open", "Open", "Open: Older table"],
    ["export", "Export CSV", "Export CSV: Older table"],
    ["delete", "Delete", "Delete: Older table"],
  ]);
  assert.equal(d("tabellify-saved-count").textContent, "2");
  assert.equal(d("tabellify-saved-count").hidden, false);
  assert.equal(d("tabellify-saved-message").hidden, true);
  assert.ok(debug.includes("Tabellify: workspace: saved tables: loaded 2 table(s) (file schema 1)"), debug.join("\n"));
});

test("007b AC19: the filter and the three messages; the summary count follows the filter", async () => {
  const empty = await savedSetup();
  assert.equal(empty.d("tabellify-saved-count").textContent, "0");
  assert.equal(empty.d("tabellify-saved-message-text").textContent, "No saved tables yet.");
  assert.equal(empty.d("tabellify-saved-message").hidden, false);
  assert.equal(empty.fs.writes().length, 0, "loading never writes");
  assert.ok(empty.debug.includes("Tabellify: workspace: saved tables: no file yet"));

  const { W, d } = await savedSetup({ entries: TWO_TABLES() });
  W.onSavedFilterChange({ target: { value: "collection" } });
  // Collection 1 ("1/COLL0001") is chosen in setup().
  assert.deepEqual(listItems(d).map((li) => li.dataset.tableId), ["t1"]);
  assert.equal(d("tabellify-saved-count").textContent, "1");
  assert.equal(d("tabellify-saved-filter").value, "collection");
  // A collection without saved tables.
  W.collectionKeys = new Map([[1, "1/COLL0001"], [2, "1/COLL0002"]]);
  W.currentCollection = "2";
  W.renderSavedList();
  assert.equal(listItems(d).length, 0);
  assert.equal(d("tabellify-saved-count").textContent, "0");
  assert.equal(d("tabellify-saved-message-text").textContent, "No saved tables for this collection.");
  // No collection chosen.
  W.currentCollection = "";
  W.renderSavedList();
  assert.equal(d("tabellify-saved-message-text").textContent, "Choose a collection to see its saved tables.");
  W.onSavedFilterChange({ target: { value: "all" } });
  assert.equal(listItems(d).length, 2);
  assert.equal(d("tabellify-saved-message").hidden, true);
});

test("007b AC19: a damaged or newer file shows its message and path; no entries; Save off; nothing written", async () => {
  for (const [fileText, message] of [["{ broken", "could not be read"], [JSON.stringify({ schemaVersion: 2, revision: 1 }), "newer version"]]) {
    const { W, d, fs, debug } = await savedSetup({ fileText });
    assert.equal(listItems(d).length, 0);
    assert.match(d("tabellify-saved-message-text").textContent, new RegExp(message));
    assert.equal(d("tabellify-saved-message-path").textContent, SAVED_FILE);
    assert.equal(d("tabellify-saved-message-path").hidden, false);
    assert.ok(d("tabellify-saved-message").classList.contains("tabellify-saved-error"));
    assert.equal(d("tabellify-saved-count").hidden, true);
    // The modal names the problem at once and its Save table is off.
    W.onViewTableClick();
    assert.equal(d("tabellify-view-save").disabled, true);
    assert.match(d("tabellify-view-export-status-text").textContent, new RegExp(message));
    assert.equal(d("tabellify-view-export-status-path").textContent, SAVED_FILE);
    d("tabellify-view-name").value = "Anything";
    await W.saveFromView();
    assert.equal(fs.writes().length, 0);
    assert.equal(fs.files.get(SAVED_FILE), fileText, "the file is unchanged");
    assert.ok(debug.some((m) => /saved tables: could not load \((invalid|newer)\); saving off$/.test(m)), debug.join("\n"));
    W.closeView();
  }
});

test("007b AC19: Delete asks first (focus on Cancel); Cancel and Esc restore; confirm saves once without it", async () => {
  const { W, d, fs, debug } = await savedSetup({ entries: TWO_TABLES() });
  W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "delete")));
  const asking = itemOf(d, "t1");
  assert.equal(asking.querySelector(".tabellify-saved-question").textContent, "Delete this saved table? This cannot be undone.");
  assert.deepEqual(asking.querySelectorAll("button").map((b) => b.dataset.action), ["confirm-delete", "cancel-delete"]);
  assert.equal(activeElement, buttonOf(asking, "cancel-delete"), "focus on Cancel");
  assert.equal(buttonOf(asking, "cancel-delete").getAttribute("aria-label"), "Cancel: Older table");
  // Only one entry asks at a time.
  assert.equal(buttonOf(itemOf(d, "t2"), "delete").dataset.action, "delete");
  W.onSavedClick(click(buttonOf(asking, "cancel-delete")));
  assert.equal(buttonOf(itemOf(d, "t1"), "delete").textContent, "Delete");
  assert.equal(activeElement, buttonOf(itemOf(d, "t1"), "delete"));
  // Esc cancels too.
  W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "delete")));
  const esc = key("Escape");
  W.onSavedKeydown(esc);
  assert.equal(esc.prevented, true);
  assert.equal(W.confirmDeleteId, null);
  assert.equal(fs.writes().length, 0);
  // Confirm: one write, without t1; the .bak keeps the old file.
  W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "delete")));
  const before = fs.files.get(SAVED_FILE);
  await W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "confirm-delete")));
  assert.equal(fs.writes().length, 1);
  const written = JSON.parse(fs.files.get(SAVED_FILE));
  assert.deepEqual(written.tables.map((t) => t.id), ["t2"]);
  assert.equal(written.nextId, 3);
  assert.equal(fs.files.get(`${SAVED_FILE}.bak`), before);
  assert.deepEqual(listItems(d).map((li) => li.dataset.tableId), ["t2"]);
  assert.deepEqual(savedStatus(d), { hidden: false, text: "Saved table deleted.", path: "", error: false });
  assert.ok(debug.includes("Tabellify: workspace: saved tables: deleted t1 (revision 4)"), debug.join("\n"));
});

test("007b AC19: Delete is off while a save runs; a conflict reloads and says so; a write error shows the path", async () => {
  const { W, d, fs, debug } = await savedSetup({ entries: TWO_TABLES() });
  // Another tab saved: the file on disk now has revision 9 and one more table.
  const other = JSON.parse(fs.files.get(SAVED_FILE));
  fs.files.set(SAVED_FILE, JSON.stringify({ ...other, revision: 9, nextId: 4, tables: [...other.tables, { ...other.tables[0], id: "t3", name: "From elsewhere" }] }));
  W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "delete")));
  const pending = W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "confirm-delete")));
  assert.equal(W.savedBusy, true);
  assert.equal(buttonOf(itemOf(d, "t2"), "delete").disabled, true, "Delete off while saving");
  await pending;
  assert.equal(fs.writes().length, 0);
  assert.deepEqual(listItems(d).map((li) => li.dataset.tableId).sort(), ["t1", "t2", "t3"]);
  assert.equal(savedStatus(d).text, "Saved tables were changed in another Tabellify tab and have been reloaded.");
  assert.equal(savedStatus(d).error, true);
  assert.ok(debug.includes("Tabellify: workspace: saved tables: not saved (conflict); reloaded"));
  assert.equal(W.savedTables.revision, 9);

  const failing = await savedSetup({ entries: TWO_TABLES(), fsOpts: { failWrite: true } });
  failing.W.onSavedClick(click(buttonOf(itemOf(failing.d, "t1"), "delete")));
  await failing.W.onSavedClick(click(buttonOf(itemOf(failing.d, "t1"), "confirm-delete")));
  assert.deepEqual(savedStatus(failing.d), { hidden: false, text: "The saved tables could not be saved. File:", path: SAVED_FILE, error: true });
  assert.ok(failing.debug.includes("Tabellify: workspace: saved tables: not saved (error: NotAllowedError)"), failing.debug.join("\n"));
  assert.equal(listItems(failing.d).length, 2, "nothing removed");
});

test("007b AC20: draft Save table with an empty Name writes nothing; the draft modal shows Save table first", async () => {
  const { W, d, fs } = await savedSetup();
  W.onViewTableClick();
  assert.equal(d("tabellify-view-heading").textContent, "View table");
  assert.equal(d("tabellify-view-save").textContent, "Save table");
  assert.equal(d("tabellify-view-save").disabled, false);
  assert.equal(d("tabellify-view-note").hidden, false);
  assert.equal(d("tabellify-view-meta").hidden, true);
  d("tabellify-view-name").value = "   ";
  d("tabellify-view-name").focused = false;
  await W.onViewClick(click(d("tabellify-view-save")));
  assert.equal(fs.writes().length, 0);
  assert.equal(d("tabellify-view-export-status-text").textContent, "Type a name before saving.");
  assert.equal(d("tabellify-view-name").focused, true);
  assert.equal(W.viewMode, "draft");
});

test("007b AC20: Save table saves the definition and the shown snapshot once, then switches to saved mode", async () => {
  const { W, T, L, d, fs, S, debug } = await savedSetup({ options: { countItemTags: true, columnLayout: { topOrder: [{ group: "g3" }, { group: "g2" }], tagOrder: {} } } });
  W.sortKey = T.tagSortKey("Mortality");
  W.sortDirection = "desc";
  W.renderMonitor();
  W.onViewTableClick();
  d("tabellify-view-name").value = "  Heat test A  ";
  d("tabellify-view-description").value = " First pass ";
  W.closeView(); // a draft is remembered …
  assert.ok(W.viewDrafts.has("1/COLL0001"));
  W.onViewTableClick();
  const shownTitles = d("tabellify-view-body").children.map((tr) => tr.children[0].textContent);
  await W.onViewClick(click(d("tabellify-view-save")));
  assert.equal(fs.writes().length, 1);
  const file = JSON.parse(fs.files.get(SAVED_FILE));
  assert.equal(file.revision, 1);
  const [t] = file.tables;
  assert.equal(t.id, "t1");
  assert.equal(t.name, "Heat test A");
  assert.equal(t.description, "First pass");
  assert.deepEqual(t.definition, {
    collectionKey: "1/COLL0001", codebookId: "c1",
    columnLayout: { topOrder: [{ group: "g3" }, { group: "g2" }], tagOrder: {} },
    sort: { key: "tag:Mortality", direction: "desc" }, manualOrder: null, countItemTags: true,
  });
  assert.equal(t.snapshot.collectionName, "F005 test");
  assert.deepEqual(t.snapshot.blocks, [{ group: "Outcome", tags: ["Mortality"] }, { group: "Exposure", tags: ["Heat index", "Temperature"] }]);
  assert.deepEqual(t.snapshot.rows.map((r) => r.title), shownTitles);
  assert.equal(t.createdAt, t.updatedAt);
  assert.equal(t.snapshot.takenAt, t.createdAt);
  // The draft is gone; the modal now shows the saved table.
  assert.equal(W.viewDrafts.has("1/COLL0001"), false);
  assert.equal(W.viewMode, "saved");
  assert.equal(W.viewTableId, "t1");
  assert.equal(d("tabellify-view-heading").textContent, "Saved table");
  assert.equal(d("tabellify-view-save").textContent, "Save changes");
  assert.equal(d("tabellify-view-note").hidden, true);
  assert.equal(d("tabellify-view-meta").hidden, false);
  assert.equal(d("tabellify-view-meta").textContent, `Snapshot from ${fmt(t.snapshot.takenAt)} · F005 test`);
  assert.equal(d("tabellify-view-export-status-text").textContent, "Table saved.");
  assert.equal(d("tabellify-saved").hasAttribute("open"), true, "the list is opened");
  assert.deepEqual(listItems(d).map((li) => li.dataset.tableId), ["t1"]);
  assert.ok(debug.includes("Tabellify: workspace: saved tables: saved new table t1: 3 paper(s), 3 column(s) (revision 1)"), debug.join("\n"));
  // Saving the page table again from View table makes a second table (never overwrites).
  W.closeView();
  W.onViewTableClick();
  assert.equal(W.viewMode, "draft");
  await W.onViewClick(click(d("tabellify-view-save")));
  assert.deepEqual(JSON.parse(fs.files.get(SAVED_FILE)).tables.map((x) => x.id), ["t1", "t2"]);
  void L; void S;
});

test("007b AC20: manual order: the definition keeps the item keys in the order shown", async () => {
  const { W, L, d, fs } = await savedSetup();
  W.manualOrders = new Map([["1/COLL0001", ["ITEM0102"]]]);
  W.sortKey = L.MANUAL;
  W.renderMonitor();
  W.onViewTableClick();
  await W.onViewClick(click(d("tabellify-view-save")));
  const [t] = JSON.parse(fs.files.get(SAVED_FILE)).tables;
  assert.equal(t.definition.sort.key, "manual");
  assert.deepEqual(t.definition.manualOrder, t.snapshot.rows.map((r) => r.itemKey));
  assert.equal(t.definition.manualOrder[0], "ITEM0102");
  assert.equal(t.definition.manualOrder.length, 3, "papers after the manual order are included as shown");
});

test("007b AC20: Open shows the snapshot (not the page); Save changes updates only Name and Description", async () => {
  const { W, d, fs, S, debug } = await savedSetup({ entries: TWO_TABLES() });
  W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "open")));
  assert.equal(d("tabellify-view-dialog").open, true);
  assert.equal(W.viewMode, "saved");
  const snapshot = W.savedTables.tables[0].snapshot;
  const expected = W.viewTableRows(S.snapshotView(snapshot), { count: "k/M", countLabel: "x" }).body.map((tr) => tr.textContent);
  assert.deepEqual(d("tabellify-view-body").children.map((tr) => tr.textContent), expected);
  assert.deepEqual(d("tabellify-view-body").children.map((tr) => tr.children[0].textContent), ["Saved paper A", "Saved paper B"]);
  assert.equal(d("tabellify-view-name").value, "Older table");
  assert.equal(d("tabellify-view-meta").textContent, `Snapshot from ${fmt(T1_TIME)} · F005 test`);
  assert.ok(debug.includes("Tabellify: workspace: view: opened saved table t1 (snapshot): 2 paper(s), 3 tag column(s), 2 header row(s)"), debug.join("\n"));
  // The page table changing does not touch the saved modal.
  W.sortKey = "title";
  W.renderMonitor();
  W.setTableHidden(true);
  assert.equal(d("tabellify-view-dialog").open, true);
  assert.deepEqual(d("tabellify-view-body").children.map((tr) => tr.textContent), expected);
  // Save changes.
  const before = JSON.parse(fs.files.get(SAVED_FILE)).tables[0];
  d("tabellify-view-name").value = " Renamed ";
  d("tabellify-view-description").value = "New description";
  await W.onViewClick(click(d("tabellify-view-save")));
  const after = JSON.parse(fs.files.get(SAVED_FILE)).tables[0];
  assert.equal(after.name, "Renamed");
  assert.equal(after.description, "New description");
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.deepEqual(after.definition, before.definition);
  assert.equal(after.createdAt, before.createdAt);
  assert.notEqual(after.updatedAt, before.updatedAt);
  assert.equal(d("tabellify-view-export-status-text").textContent, "Changes saved.");
  assert.equal(d("tabellify-view-name").value, "Renamed");
  assert.equal(fs.writes().length, 1);
  assert.ok(debug.includes("Tabellify: workspace: saved tables: changes saved for t1 (revision 4)"), debug.join("\n"));
  // Newest first: the renamed table moves to the top.
  assert.deepEqual(listItems(d).map((li) => li.dataset.tableId), ["t1", "t2"]);
  // Close: focus returns to its Open button.
  W.closeView();
  assert.equal(activeElement, buttonOf(itemOf(d, "t1"), "open"));
});

test("007b AC20: unsaved saved-mode edits are kept per table id; Tab skips hidden buttons", async () => {
  const { W, d } = await savedSetup({ entries: TWO_TABLES() });
  W.openSaved("t1");
  d("tabellify-view-name").value = "Unsaved edit";
  W.closeView();
  W.openSaved("t2");
  assert.equal(d("tabellify-view-name").value, "Newer <b>x</b>");
  W.closeView();
  W.openSaved("t1");
  assert.equal(d("tabellify-view-name").value, "Unsaved edit");
  assert.ok(W.viewDrafts.has("saved:t1"));
  assert.equal(W.viewDrafts.has("saved:t2"), false, "unchanged values are not kept");
  // Tab order: Name, Description, table area, Save changes, Show live, Export CSV, Close
  // (Update snapshot and Save as new table are hidden on the snapshot); hidden buttons are skipped.
  assert.deepEqual([...W.viewFocusOrder()].map((el) => el.id), ["tabellify-view-name", "tabellify-view-description", "tabellify-view-scroll",
    "tabellify-view-save", "tabellify-view-live", "tabellify-view-export", "tabellify-view-close"].map((id) => d(id).id));
  d("tabellify-view-save").hidden = true;
  assert.equal(W.viewFocusOrder().includes(d("tabellify-view-save")), false);
  d("tabellify-view-save").hidden = false;
  W.closeView();
});

test("007b AC20: a table deleted in another tab: the modal says so and Save changes is off", async () => {
  const { W, d, fs } = await savedSetup({ entries: TWO_TABLES() });
  W.openSaved("t1");
  const other = JSON.parse(fs.files.get(SAVED_FILE));
  fs.files.set(SAVED_FILE, JSON.stringify({ ...other, revision: 7, tables: other.tables.filter((t) => t.id !== "t1") }));
  d("tabellify-view-name").value = "Renamed";
  await W.onViewClick(click(d("tabellify-view-save")));
  assert.equal(d("tabellify-view-export-status-text").textContent, "This saved table was deleted in another Tabellify tab.");
  assert.equal(d("tabellify-view-save").disabled, true);
  assert.equal(fs.writes().length, 0);
  // The snapshot is still shown and can be exported.
  assert.equal(d("tabellify-view-body").children.length, 2);
});

test("007b AC21: list Export CSV writes the snapshot's CSV under the table Name; result under the list", async () => {
  let during = null;
  let env = null;
  const io = fakeExportIo({ onPick: () => {
    const d = env.d;
    during = [d("tabellify-export-csv").disabled, d("tabellify-view-export").disabled, buttonOf(itemOf(d, "t1"), "export").disabled];
  } });
  env = await savedSetup({ entries: TWO_TABLES(), io });
  const { W, d, S, Csv, debug } = env;
  W.showExportStatus("tabellify-export-saved", "/old/page.csv"); // the page's line must stay
  const result = await W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "export")));
  assert.equal(result.status, "saved");
  assert.deepEqual(during, [true, true, true], "every Export CSV button is off during the export");
  assert.equal(buttonOf(itemOf(d, "t1"), "export").disabled, false);
  assert.match(io.picks[0].defaultName, /^Older table \d{4}-\d{2}-\d{2}\.csv$/);
  const table = W.savedTables.tables.find((t) => t.id === "t1");
  const expected = Csv.build(S.snapshotView(table.snapshot), {
    title: "Title", untitled: "(untitled)", k: "Tags used (k)", m: "Codebook tags (M)",
  }).text;
  assert.equal(io.writes[0].text, expected);
  assert.deepEqual(savedStatus(d), { hidden: false, text: "CSV saved:", path: EXPORT_PATH, error: false });
  assert.equal(status(env.document).path, "/old/page.csv", "page line untouched");
  assert.ok(debug.includes("Tabellify: workspace: export: started from saved tables list"));
  // From the modal in saved mode: the snapshot too (not the page).
  W.openSaved("t1");
  await W.onViewClick(click(d("tabellify-view-export")));
  assert.equal(io.writes[1].text, expected);
  assert.match(io.picks[1].defaultName, /^Older table /);
  W.closeView();
  // A page export is unchanged: the page table, not the snapshot.
  await W.onExportClick();
  assert.notEqual(io.writes[2].text, expected);
});

test("007b AC21: no Debug Output line in a 007b flow holds a name, description, title, tag, group, collection, key or path", async () => {
  const secrets = ["Paper 1", "Paper 2", "Paper 3", "Saved paper", "Heat index", "Temperature", "Mortality", "Exposure", "Outcome",
    "F005 test", "Deleted coll", "Older table", "Newer", "Secret name", "Secret description", "ITEM01", "COLL0001", "GONE0001",
    "tabellify-dev", "tables.json", "tester", EXPORT_PATH];
  const { W, d, fs, debug } = await savedSetup({ entries: TWO_TABLES() });
  // Save from View table, rename, export from the list, delete, a conflict and a write error.
  W.onViewTableClick();
  d("tabellify-view-name").value = "Secret name";
  d("tabellify-view-description").value = "Secret description";
  await W.onViewClick(click(d("tabellify-view-save")));
  d("tabellify-view-name").value = "Secret name 2";
  await W.onViewClick(click(d("tabellify-view-save")));
  W.closeView();
  await W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "export")));
  W.onSavedClick(click(buttonOf(itemOf(d, "t2"), "delete")));
  await W.onSavedClick(click(buttonOf(itemOf(d, "t2"), "confirm-delete")));
  const disk = JSON.parse(fs.files.get(SAVED_FILE));
  fs.files.set(SAVED_FILE, JSON.stringify({ ...disk, revision: disk.revision + 5 }));
  W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "delete")));
  await W.onSavedClick(click(buttonOf(itemOf(d, "t1"), "confirm-delete")));
  W.openSaved("t3");
  W.closeView();
  assert.ok(debug.length >= 8, "flows logged");
  for (const line of debug) for (const secret of secrets) assert.ok(!line.includes(secret), `"${secret}" in: ${line}`);
});

// ---------------------------------------------------------------------------------------
// Feature 007b AC20 (live part) / AC21: Show live, Update snapshot, Save as new table
// ---------------------------------------------------------------------------------------

/**
 * savedSetup() with a fake gatherMonitorData (counts calls). The live library has a new
 * ungrouped tag "age" and no "Mortality" any more, so the saved "Mortality" column is missing.
 */
async function liveSetup(options = {}) {
  const env = await savedSetup({ entries: TWO_TABLES(), ...options });
  const { W } = env;
  env.reads = [];
  env.release = null;
  W.codebook = codebookData([{ id: "g2", name: "Exposure", tags: ["Heat index", "Temperature"] }], ["age"]);
  W.gatherMonitorData = async (id) => {
    env.reads.push(id);
    if (env.hold) await new Promise((resolve) => { env.release = resolve; });
    if (env.readError) throw env.readError;
    const data = monitorData();
    data.papers[2].annotationTags = [{ tag: "age" }];
    return data;
  };
  return env;
}

test("007b AC20: Show live reads once, renders the live table with the note; Show snapshot goes back; nothing written", async () => {
  const { W, d, fs, reads, debug } = await liveSetup();
  W.openSaved("t1");
  const snapshotRows = d("tabellify-view-body").children.map((tr) => tr.textContent);
  assert.equal(d("tabellify-view-live").hidden, false);
  assert.equal(d("tabellify-view-live").textContent, "Show live");
  assert.equal(d("tabellify-view-live").getAttribute("aria-pressed"), "false");
  assert.equal(d("tabellify-view-update").hidden, true);
  assert.equal(d("tabellify-view-save-new").hidden, true);
  assert.equal(d("tabellify-view-live-note").hidden, true);
  await W.onViewClick(click(d("tabellify-view-live")));
  assert.deepEqual(reads, [1], "one read of the saved collection");
  assert.equal(W.viewShowingLive, true);
  // Live columns: today's codebook (age, Heat index, Temperature), not the saved Mortality.
  const heads = d("tabellify-view-head").children.flatMap((tr) => tr.children.map((th) => th.textContent));
  assert.ok(heads.includes("age") && !heads.includes("Mortality"), heads.join("|"));
  assert.equal(d("tabellify-view-body").children.length, 3, "today's three papers");
  assert.equal(d("tabellify-view-live-note").textContent, "Saved columns that are no longer in the codebook: Mortality");
  assert.equal(d("tabellify-view-live-note").hidden, false);
  assert.equal(d("tabellify-view-meta").textContent, "Live: built from your library now · F005 test");
  assert.equal(d("tabellify-view-live").textContent, "Show snapshot");
  assert.equal(d("tabellify-view-live").getAttribute("aria-pressed"), "true");
  assert.equal(d("tabellify-view-update").hidden, false);
  assert.equal(d("tabellify-view-save-new").hidden, false);
  assert.equal(d("tabellify-view-export-status").hidden, true);
  assert.ok(debug.includes("Tabellify: workspace: view: live table for t1: 3 paper(s), 3 tag column(s), 1 saved column(s) missing"), debug.join("\n"));
  // Saved order (sort count desc): most codebook tags first.
  assert.equal(d("tabellify-view-body").children[0].children[0].textContent, "Paper 2");
  // Back to the snapshot.
  await W.onViewClick(click(d("tabellify-view-live")));
  assert.equal(W.viewShowingLive, false);
  assert.deepEqual(d("tabellify-view-body").children.map((tr) => tr.textContent), snapshotRows);
  assert.equal(d("tabellify-view-update").hidden, true);
  assert.equal(d("tabellify-view-live-note").hidden, true);
  assert.equal(fs.writes().length, 0);
  // The workspace is unchanged: sort, layout and the counting switch.
  assert.equal(W.sortKey, "count");
  assert.equal(W.countItemTags, false);
  W.closeView();
});

test("007b AC20: a live read that finishes after the modal closed changes nothing; a read error keeps the snapshot", async () => {
  const env = await liveSetup();
  const { W, d } = env;
  W.openSaved("t1");
  env.hold = true;
  const pending = W.onViewClick(click(d("tabellify-view-live")));
  assert.equal(d("tabellify-view-live").disabled, true, "off while reading");
  assert.equal(d("tabellify-view-export-status-text").textContent, "Building the live table…");
  W.closeView();
  env.release();
  assert.equal(await pending, null);
  assert.equal(W.viewShowingLive, false);
  assert.equal(W.viewLive, null);
  // A read error: the note says so, the snapshot stays.
  env.hold = false;
  env.readError = new Error("read failed");
  W.openSaved("t1");
  await W.onViewClick(click(d("tabellify-view-live")));
  assert.equal(W.viewShowingLive, false);
  assert.equal(d("tabellify-view-live-note").textContent, "The live table could not be built.");
  assert.equal(d("tabellify-view-body").children.length, 2);
  W.closeView();
});

test("007b AC20: Show live is off with a note for an unknown collection key and for a missing codebook", async () => {
  const { W, d, reads } = await liveSetup();
  W.openSaved("t2"); // saved from "1/GONE0001"
  assert.equal(d("tabellify-view-live").disabled, true);
  assert.equal(d("tabellify-view-live-note").textContent, "This table's collection is no longer in My Library.");
  assert.equal(d("tabellify-view-meta").textContent, `Snapshot from ${fmt(T2_TIME)} · Deleted coll (collection not found)`);
  await W.showLive();
  assert.deepEqual(reads, []);
  W.closeView();
  W.codebook = null;
  W.openSaved("t1");
  assert.equal(d("tabellify-view-live").disabled, true);
  assert.equal(d("tabellify-view-live-note").textContent, "The codebook could not be loaded.");
  // Export CSV still works (the snapshot).
  assert.equal(d("tabellify-view-export").disabled, false);
  W.closeView();
});

test("007b AC20: Update snapshot and Save as new table save once each", async () => {
  const { W, d, fs, debug } = await liveSetup();
  W.openSaved("t1");
  await W.onViewClick(click(d("tabellify-view-live")));
  await W.onViewClick(click(d("tabellify-view-update")));
  assert.equal(fs.writes().length, 1);
  let file = JSON.parse(fs.files.get(SAVED_FILE));
  const t1 = file.tables.find((t) => t.id === "t1");
  assert.deepEqual(t1.snapshot.blocks, [{ group: null, tags: ["age"] }, { group: "Exposure", tags: ["Heat index", "Temperature"] }]);
  assert.equal(t1.snapshot.rows.length, 3);
  assert.equal(t1.snapshot.takenAt, t1.updatedAt);
  assert.equal(t1.createdAt, T1_TIME);
  assert.equal(W.viewShowingLive, false, "the new snapshot is shown");
  assert.equal(d("tabellify-view-export-status-text").textContent, "Snapshot updated.");
  assert.equal(d("tabellify-view-meta").textContent, `Snapshot from ${fmt(t1.snapshot.takenAt)} · F005 test`);
  assert.equal(d("tabellify-view-body").children.length, 3);
  assert.ok(debug.includes("Tabellify: workspace: saved tables: snapshot updated for t1: 3 paper(s), 3 column(s) (revision 4)"), debug.join("\n"));
  // Save as new: current Name, the saved definition, the live snapshot.
  await W.onViewClick(click(d("tabellify-view-live")));
  d("tabellify-view-name").value = "Heat test B";
  await W.onViewClick(click(d("tabellify-view-save-new")));
  assert.equal(fs.writes().length, 2);
  file = JSON.parse(fs.files.get(SAVED_FILE));
  const t3 = file.tables.find((t) => t.id === "t3");
  assert.equal(t3.name, "Heat test B");
  assert.deepEqual(t3.definition, t1.definition);
  assert.equal(file.tables.find((t) => t.id === "t1").name, "Older table", "the source table is unchanged");
  assert.equal(W.viewTableId, "t3");
  assert.equal(d("tabellify-view-export-status-text").textContent, "Saved as a new table.");
  assert.deepEqual(listItems(d).map((li) => li.dataset.tableId).slice(0, 1), ["t3"]);
  assert.equal(W.viewDrafts.has("saved:t1"), false);
  W.closeView();
});

test("007b AC21: an export from the modal in live view exports the live table", async () => {
  const io = fakeExportIo();
  const { W, d, S, Csv } = await liveSetup({ io });
  W.openSaved("t1");
  await W.onViewClick(click(d("tabellify-view-live")));
  await W.onViewClick(click(d("tabellify-view-export")));
  const labels = { title: "Title", untitled: "(untitled)", k: "Tags used (k)", m: "Codebook tags (M)" };
  assert.equal(io.writes[0].text, Csv.build(W.viewLive.view, labels).text);
  assert.notEqual(io.writes[0].text, Csv.build(S.snapshotView(W.savedTables.tables[0].snapshot), labels).text);
  W.closeView();
});

test("007b AC21: no Debug Output line in the live flows holds a name, title, tag, collection or key", async () => {
  const secrets = ["Paper", "Saved paper", "Heat index", "Temperature", "Mortality", "age", "Exposure", "F005 test",
    "Older table", "Heat test", "ITEM01", "COLL0001", "tables.json", "tester"];
  const { W, d, debug } = await liveSetup();
  W.openSaved("t1");
  await W.onViewClick(click(d("tabellify-view-live")));
  await W.onViewClick(click(d("tabellify-view-update")));
  await W.onViewClick(click(d("tabellify-view-live")));
  d("tabellify-view-name").value = "Heat test B";
  await W.onViewClick(click(d("tabellify-view-save-new")));
  W.closeView();
  const own = debug.filter((m) => /saved tables:|view:/.test(m));
  assert.ok(own.length >= 5);
  for (const line of own) for (const secret of secrets) assert.ok(!line.includes(secret), `"${secret}" in: ${line}`);
});
