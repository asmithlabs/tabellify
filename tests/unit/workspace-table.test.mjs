// Owner decision 2026-11-13 (Feature 005c): rendering checks for the per-paper table's
// codebook tag columns, run against the REAL workspace.js code in Node.
//
// workspace.js normally runs in Zotero's privileged document. Here it runs in a node:vm
// sandbox with a tiny FAKE DOM (below): just enough elements, attributes and simple CSS
// selectors for renderPaperTable(), the header builder, the Alt+arrow handler and the sort
// click handler. The fake has no innerHTML (or any other markup parser): touching one throws,
// so these tests also prove that tag names go onto the page as plain text.
// The models (tag-monitor-model.js, table-layout-model.js) are loaded first, as
// workspace.xhtml does. `window` is not defined, so workspace.js does not start itself.

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
  focus() { this.focused = true; }
}

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
  };
}

// ---------------------------------------------------------------------------------------
// Loading workspace.js with its models
// ---------------------------------------------------------------------------------------

function load() {
  const document = makeDocument();
  const debug = [];
  const sandbox = vm.createContext({ document, Zotero: { debug: (m) => debug.push(m), logError: () => {} } });
  for (const name of ["tag-monitor-model.js", "table-layout-model.js", "workspace.js"]) {
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
  };
  W.monitorReady = true;
  W.codebookLoadDone = true;
  W.layoutEditable = false; // no layout file in these tests: layoutChanged() does nothing
  return { W, T: sandbox.TabellifyTagMonitor, L: sandbox.TabellifyTableLayout, document, debug };
}

/** A codebooks.json-shaped object (F004) with the given groups. */
const codebookData = (groups) => ({
  schemaVersion: 1, revision: 1, nextId: 9,
  codebooks: [{ id: "c1", name: "Codebook", groups }],
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
function setup({ groups = GROUPS(), countItemTags = false, columnLayout = null } = {}) {
  const env = load();
  const { W, L } = env;
  W.codebook = codebookData(groups);
  W.monitorData = monitorData();
  W.collectionKeys = W.monitorData.collectionKeys;
  W.currentCollection = "1";
  W.countItemTags = countItemTags;
  W.columnLayout = columnLayout ?? L.emptyColumnLayout();
  W.renderMonitor();
  return env;
}

const headerRow = (doc, id) => doc.byId.get(id).children;
/** Short names of the header cells: "grip", "title", "count", "group:<id>", "tag:<name>". */
function groupHeaders(doc) {
  return headerRow(doc, "tabellify-items-group-row").map((th) => {
    if (th.classList.contains("tabellify-col-grip")) return "grip";
    if (th.classList.contains("tabellify-col-title")) return "title";
    if (th.classList.contains("tabellify-col-count")) return "count";
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
  const { W, document } = setup({ columnLayout: { groupOrder: ["g3", "g2"], tagOrder: { g2: ["Temperature", "Heat index"] } } });
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
  assert.deepEqual(W.codebook.codebooks[0].groups[0].tags, ["Heat index", "Temperature"]);
  assert.deepEqual(JSON.parse(JSON.stringify(W.columnLayout)), { groupOrder: [], tagOrder: { g2: ["Temperature", "Heat index"] } });
});

test("keyboard: Alt+Left/Right on a group header moves the whole group among the groups", () => {
  const { W, document, debug } = setup();
  altKey(W, groupGrip(document, "g3"), "ArrowLeft");
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g3/1", "group:g2/2", "count"]);
  assert.deepEqual(tagHeaders(document), ["Mortality", "Heat index", "Temperature"]);
  assert.equal(groupGrip(document, "g3").focused, true);
  assert.ok(debug.includes("Tabellify: workspace: layout: group g3 moved to position 1 of 2 (keyboard)"));
  // Title stays first and k/M last; the first group cannot move further left.
  altKey(W, groupGrip(document, "g3"), "ArrowLeft");
  assert.deepEqual(groupHeaders(document), ["grip", "title", "group:g3/1", "group:g2/2", "count"]);
  // Body cells follow the header.
  assert.equal(rowText(bodyRows(document).find((tr) => tr.children[1].textContent === "Paper 1")), "Paper 1 | ✓ | · | · | 1/3");
});

test("Reset columns restores the codebook order", () => {
  const { W, document, debug } = setup({ columnLayout: { groupOrder: ["g3"], tagOrder: { g2: ["Temperature"] } } });
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
