// Feature 005b AC10, AC11 (unit part): src/reader-tags.js with fake Zotero objects.
//
// reader-tags.js is a classic script that runs in the plugin's bootstrap scope. Here it runs
// in a node:vm sandbox together with the three scripts it needs (codebook-model.js,
// codebook-store.js, tag-monitor-model.js), exactly as tabellify.js loads them. The sandbox
// gets small fakes instead of Zotero:
//   - items with the read-only getters the code may use (isNote, isAnnotation, isAttachment,
//     isFileAttachment, getTags, getAttachments, getAnnotations), which THROW where Zotero
//     throws (getAttachments on an attachment, getAnnotations on a non-file attachment);
//   - Zotero.Items.get, Zotero.Libraries.get(id).waitForDataLoad, Zotero.DataDirectory.dir;
//   - IOUtils.readJSON over an in-memory "disk"; every IOUtils write method throws, so a
//     write attempt fails the test;
//   - a tiny DOM (createElementNS, createTextNode, setAttribute, textContent, append,
//     replaceChildren) and doc.l10n.formatValue that answers from the real tabellify.ftl;
//   - Zotero.ItemPaneManager / Zotero.Notifier that record calls;
//   - Zotero.Prefs.get answering the "count item tags" switch (Prefs.set throws: the
//     section must never write a pref).
// Lifecycle with the full mocked Zotero (bootstrap → tabellify.js → reader-tags.js) is in
// tests/behavior/lifecycle.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const SCRIPTS = ["content/codebook-model.js", "content/codebook-store.js", "content/tag-monitor-model.js", "reader-tags.js"];
const DATA_DIR = "/dev-data";
const CODEBOOK_PATH = `${DATA_DIR}/tabellify/codebooks.json`;
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Simple `id = value` messages of tabellify.ftl. */
const ftl = new Map(
  [...readFileSync(join(srcDir, "locale", "en-US", "tabellify.ftl"), "utf8").matchAll(/^(tabellify-[\w-]+)\s*=\s*(\S.*)$/gm)]
    .map((m) => [m[1], m[2].trim()]),
);

/** The F005b smoke-test codebook: Exposure (Heat index, Temperature), Health outcome (Hospitalization). */
function codebook() {
  return {
    schemaVersion: 1,
    revision: 7,
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

// ---- Fake items ------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {"regular" | "note" | "annotation" | "file" | "link"} [o.kind]
 * @param {Array<{tag: string, type?: number}>} [o.tags]
 * @param {number[]} [o.attachments]  attachment IDs (regular items only)
 * @param {any[]} [o.annotations]     annotation items (file attachments only)
 */
function makeItem(calls, { id = 1, kind = "regular", tags = [], attachments = [], annotations = [], libraryID = 1 } = {}) {
  return {
    id,
    libraryID,
    isNote: () => kind === "note",
    isAnnotation: () => kind === "annotation",
    isAttachment: () => kind === "file" || kind === "link",
    isFileAttachment: () => kind === "file",
    getTags: () => tags.map((t) => ({ ...t })),
    getAttachments() {
      calls.push(`getAttachments(${id})`);
      if (kind !== "regular") throw new Error("getAttachments() cannot be called on attachment items");
      return [...attachments];
    },
    getAnnotations() {
      calls.push(`getAnnotations(${id})`);
      if (kind !== "file") throw new Error("getAnnotations() can only be called on file attachments");
      return [...annotations];
    },
  };
}

// ---- Fake DOM --------------------------------------------------------------------------

function makeDoc() {
  const doc = {
    createElementNS(ns, tag) {
      assert.equal(ns, XHTML_NS, "elements must be created in the XHTML namespace");
      const attrs = new Map();
      const el = {
        tag,
        children: [],
        _text: "",
        get textContent() { return el._text + el.children.map((c) => c.textContent).join(""); },
        set textContent(v) { el.children = []; el._text = String(v); },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        append(...nodes) { el.children.push(...nodes); },
        replaceChildren(...nodes) { el._text = ""; el.children = [...nodes]; },
      };
      return el;
    },
    // A text node: plain text, never parsed as markup.
    createTextNode(text) {
      return { tag: "#text", children: [], _text: String(text), get textContent() { return this._text; } };
    },
    l10n: {
      formatValue: async (id, args = {}) =>
        ftl.get(id)?.replace(/\{\s*\$(\w+)\s*\}/g, (_, k) => String(args[k])),
    },
  };
  return doc;
}

/** Translated text of a Fluent element (data-l10n-id + numeric data-l10n-args). */
function l10nText(el) {
  const id = el.getAttribute("data-l10n-id");
  const args = JSON.parse(el.getAttribute("data-l10n-args") ?? "{}");
  const text = ftl.get(id);
  assert.ok(text, `${id} missing from tabellify.ftl`);
  return text.replace(/\{\s*\$(\w+)\s*\}/g, (_, k) => String(args[k]));
}

/** Text of a fake element tree, with Fluent elements shown as their translated text. */
function render(el) {
  if (el.getAttribute?.("data-l10n-id")) return [`<${el.tag}>${l10nText(el)}`];
  // A checklist line is one line of text: mark (Fluent) + " " + tag name.
  if (el.tag === "li") {
    return [`<li>${el.children.map((c) => (c.getAttribute?.("data-l10n-id") ? l10nText(c) : c.textContent)).join("")}`];
  }
  if (el.children.length === 0) return [`<${el.tag}>${el._text}`];
  return [`<${el.tag}>`, ...el.children.flatMap(render).map((l) => `  ${l}`)];
}
const bodyLines = (body) => body.children.flatMap(render);

// ---- Sandbox ---------------------------------------------------------------------------

/**
 * Load the four scripts into a fresh sandbox with fake globals.
 * @param {{ files?: Record<string, any>, readError?: Error, items?: any[], waitForDataLoad?: () => Promise<void>,
 *           registerSection?: "ok" | false | "throw", unregisterSectionThrows?: boolean,
 *           unregisterObserverThrows?: boolean }} [o]
 */
function setup(o = {}) {
  // `pref`: what Zotero.Prefs.get returns for the switch (undefined = never set).
  const calls = [];
  const errors = [];
  const debug = [];
  const files = new Map(Object.entries(o.files ?? { [CODEBOOK_PATH]: codebook() }));
  const items = new Map((o.items ?? []).map((i) => [i.id, i]));
  const sections = new Map();
  const observers = new Map();
  let seq = 0;

  const writeTrap = (name) => () => { calls.push(`IOUtils.${name}`); throw new Error(`write attempted: ${name}`); };
  const sandbox = {
    Zotero: {
      debug: (m) => debug.push(String(m)),
      logError: (e) => errors.push(e),
      DataDirectory: { dir: DATA_DIR },
      Prefs: {
        get(name, global) {
          calls.push(`Prefs.get(${name}, ${global})`);
          if (o.prefThrows) throw new Error("Error getting preference");
          return name === "extensions.tabellify.countItemTags" && global === true ? o.pref : undefined;
        },
        set(name) { calls.push(`Prefs.set(${name})`); throw new Error("the reader section must not write prefs"); },
      },
      Items: { get: (ids) => { calls.push(`Items.get(${ids})`); return ids.map((id) => items.get(id)); } },
      Libraries: {
        get: (libraryID) => ({
          waitForDataLoad: (type) => { calls.push(`waitForDataLoad(${libraryID}, ${type})`); return (o.waitForDataLoad ?? (async () => {}))(); },
        }),
      },
      ItemPaneManager: {
        registerSection(options) {
          calls.push(`registerSection(${options.paneID})`);
          if (o.registerSection === "throw") throw new Error("boom");
          if (o.registerSection === false) return false;
          const id = `${options.pluginID}-${options.paneID}#${++seq}`;
          sections.set(id, options);
          return id;
        },
        unregisterSection(id) {
          calls.push(`unregisterSection(${id})`);
          if (o.unregisterSectionThrows) throw new Error("unregisterSection failed");
          return sections.delete(id);
        },
      },
      Notifier: {
        registerObserver(ref, types, id) {
          calls.push(`registerObserver(${JSON.stringify(types)}, ${id})`);
          const key = `${id}_${++seq}`;
          observers.set(key, { ref, types });
          return key;
        },
        unregisterObserver(key) {
          calls.push(`unregisterObserver(${key})`);
          if (o.unregisterObserverThrows) throw new Error("unregisterObserver failed");
          observers.delete(key);
        },
      },
    },
    IOUtils: {
      readJSON: async (path) => {
        calls.push(`IOUtils.readJSON(${path})`);
        if (o.readError) throw o.readError;
        if (!files.has(path)) throw Object.assign(new Error("not found"), { name: "NotFoundError" });
        return structuredClone(files.get(path));
      },
      writeJSON: writeTrap("writeJSON"),
      makeDirectory: writeTrap("makeDirectory"),
    },
    PathUtils: { join: (...parts) => parts.join("/") },
  };
  const context = vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    const full = join(srcDir, file);
    vm.runInContext(readFileSync(full, "utf8"), context, { filename: full });
  }
  return { R: sandbox.TabellifyReaderTags, calls, errors, debug, files, sections, observers, sandbox };
}

/** Run the section's render hooks for `item` the way Zotero does: onRender, then onAsyncRender. */
async function renderSection(R, item) {
  // Renders happen only while the section is registered (async renders check `active`).
  if (!R.active) R.register({ pluginID: "tabellify@asmithlabs.com", });
  const doc = makeDoc();
  const body = doc.createElementNS(XHTML_NS, "div");
  const summaries = [];
  const setSectionSummary = (s) => summaries.push(s);
  R.onRender({ body, doc, setSectionSummary });
  const afterRender = bodyLines(body);
  await R.onAsyncRender({ body, doc, item, setSectionSummary });
  return { body, lines: bodyLines(body), summaries, afterRender, doc };
}

/** The spec's smoke-test paper: item tag "Heat index", a highlight tagged "Hospitalization". */
function smokePaper(calls, extra = {}) {
  const highlight = makeItem(calls, { id: 30, kind: "annotation", tags: [{ tag: "Hospitalization" }] });
  const pdf = makeItem(calls, { id: 20, kind: "file", annotations: [highlight] });
  const paper = makeItem(calls, { id: 10, tags: [{ tag: "Heat index" }], attachments: [20], ...extra });
  return { paper, pdf, highlight };
}

// ---------------------------------------------------------------------------------------
// AC10: collectPaperTags
// ---------------------------------------------------------------------------------------

/** Names that count for a collected paper, by the shared model rule. */
const counted = (s, paper, countItemTags) => [...s.sandbox.TabellifyTagMonitor.countedTagNames(paper, { countItemTags })];

test("AC10: item tags and annotation tags of file attachments are collected separately", () => {
  const s = setup();
  const { R, calls, sandbox } = s;
  const ann1 = makeItem(calls, { id: 31, kind: "annotation", tags: [{ tag: "Hospitalization" }, { tag: "Mortality", type: 1 }] });
  const ann2 = makeItem(calls, { id: 32, kind: "annotation", tags: [{ tag: " Heat index " }] });
  const pdf = makeItem(calls, { id: 21, kind: "file", annotations: [ann1, ann2] });
  const paper = makeItem(calls, { id: 11, tags: [{ tag: "Heat index" }, { tag: "Temperature", type: 1 }], attachments: [21] });
  sandbox.Zotero.Items.get = (ids) => ids.map((id) => ({ 21: pdf })[id]);
  const result = R.collectPaperTags(paper);
  assert.deepEqual(plain(result), {
    applicable: true,
    itemTags: [{ tag: "Heat index" }, { tag: "Temperature", type: 1 }],
    annotationTags: [{ tag: "Hospitalization" }, { tag: "Mortality", type: 1 }, { tag: " Heat index " }],
  });
  // Counting (model): highlights only by default; with the switch, item tags too. Manual only, trimmed, once.
  assert.deepEqual(counted(s, result, false), ["Hospitalization", "Heat index"]);
  assert.deepEqual(counted(s, result, true), ["Hospitalization", "Heat index"]);
});

test("AC10: automatic tags (type 1) never count, on the item or on annotations", () => {
  const s = setup();
  const { R, calls, sandbox } = s;
  const ann = makeItem(calls, { id: 33, kind: "annotation", tags: [{ tag: "Temperature", type: 1 }] });
  const pdf = makeItem(calls, { id: 22, kind: "file", annotations: [ann] });
  const paper = makeItem(calls, { id: 12, tags: [{ tag: "Heat index", type: 1 }], attachments: [22] });
  sandbox.Zotero.Items.get = (ids) => ids.map(() => pdf);
  const result = R.collectPaperTags(paper);
  assert.deepEqual(counted(s, result, false), []);
  assert.deepEqual(counted(s, result, true), []);
});

test("AC10: linked-URL attachments are skipped (getAnnotations never called on them)", () => {
  const calls = [];
  const link = makeItem(calls, { id: 23, kind: "link", tags: [{ tag: "Temperature" }] });
  const { paper, pdf } = smokePaper(calls, { attachments: [20, 23] });
  const s = setup({ items: [pdf, link] });
  const result = s.R.collectPaperTags(paper);
  assert.deepEqual(plain(result), { applicable: true, itemTags: [{ tag: "Heat index" }], annotationTags: [{ tag: "Hospitalization" }] });
  assert.deepEqual(counted(s, result, true), ["Hospitalization", "Heat index"], "the link's own tag is not read");
  assert.ok(calls.includes("getAnnotations(20)"));
  assert.ok(!calls.includes("getAnnotations(23)"), "no getAnnotations on a linked URL");
});

test("AC10: a standalone file attachment counts its own tags and annotations", () => {
  const calls = [];
  const ann = makeItem(calls, { id: 34, kind: "annotation", tags: [{ tag: "Temperature" }] });
  const pdf = makeItem(calls, { id: 24, kind: "file", tags: [{ tag: "Heat index" }], annotations: [ann] });
  const { R, calls: itemsCalls } = setup();
  // The attachment's own tags are its "item tags" (they count only with the switch on).
  assert.deepEqual(plain(R.collectPaperTags(pdf)), {
    applicable: true, itemTags: [{ tag: "Heat index" }], annotationTags: [{ tag: "Temperature" }],
  });
  assert.ok(!calls.includes("getAttachments(24)"), "getAttachments is not called on an attachment (it throws there)");
  assert.ok(!itemsCalls.some((c) => c.startsWith("Items.get")), "no ID lookup needed");
});

test("AC10: notes, annotations, linked-URL attachments and no item are not applicable", () => {
  const calls = [];
  const { R } = setup();
  for (const item of [
    makeItem(calls, { kind: "note", tags: [{ tag: "Heat index" }] }),
    makeItem(calls, { kind: "annotation", tags: [{ tag: "Heat index" }] }),
    makeItem(calls, { kind: "link", tags: [{ tag: "Heat index" }] }),
    null,
    undefined,
  ]) {
    assert.deepEqual(plain(R.collectPaperTags(item)), { applicable: false, itemTags: [], annotationTags: [] });
  }
  assert.deepEqual(calls, [], "nothing is read for items that do not apply");
});

test("AC10: onItemChange shows the section for papers and file attachments, hides it otherwise", () => {
  const calls = [];
  const { R } = setup();
  const cases = [
    ["regular", true], ["file", true], ["note", false], ["annotation", false], ["link", false],
  ];
  for (const [kind, expected] of cases) {
    const seen = [];
    R.onItemChange({ item: makeItem(calls, { kind }), setEnabled: (v) => seen.push(v) });
    assert.deepEqual(seen, [expected], kind);
  }
});

// ---------------------------------------------------------------------------------------
// Rendering (AC2, AC4, AC7 as data)
// ---------------------------------------------------------------------------------------

test("render (default, highlights only): smoke-test paper shows 1 / 3 and the full checklist", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  for (const pref of [undefined, false, "true", 1]) {
    const s = setup({ items: [pdf], pref });
    const { lines, summaries, afterRender } = await renderSection(s.R, paper);
    assert.deepEqual(afterRender, ["<p>Counting…"]);
    assert.deepEqual(summaries, ["", "1 / 3"], `pref ${pref}`);
    assert.deepEqual(lines, [
      "<p>1 of 3 codebook tags used on this paper",
      "<p>",
      "  <strong>Exposure",
      "<ul>",
      "  <li>☐ Heat index",
      "  <li>☐ Temperature",
      "<p>",
      "  <strong>Health outcome",
      "<ul>",
      "  <li>✓ Hospitalization",
    ]);
    assert.ok(s.calls.includes("waitForDataLoad(1, item)"), "item data loaded first");
    assert.ok(s.calls.includes(`IOUtils.readJSON(${CODEBOOK_PATH})`));
    assert.ok(s.calls.includes("Prefs.get(extensions.tabellify.countItemTags, true)"), "reads the global pref by its full name");
    assert.deepEqual(s.errors, []);
  }
});

test("render (switch on): item tags count too: 2 / 3 with Heat index ticked", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const s = setup({ items: [pdf], pref: true });
  const { lines, summaries } = await renderSection(s.R, paper);
  assert.deepEqual(summaries, ["", "2 / 3"]);
  assert.deepEqual(lines, [
    "<p>2 of 3 codebook tags used on this paper",
    "<p>",
    "  <strong>Exposure",
    "<ul>",
    "  <li>✓ Heat index",
    "  <li>☐ Temperature",
    "<p>",
    "  <strong>Health outcome",
    "<ul>",
    "  <li>✓ Hospitalization",
  ]);
});

test("render: the setting is read on every render (a change shows up on the next render)", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const s = setup({ items: [pdf] });
  const first = await renderSection(s.R, paper);
  s.sandbox.Zotero.Prefs.get = () => true;
  const second = await renderSection(s.R, paper);
  assert.deepEqual([first.summaries.at(-1), second.summaries.at(-1)], ["1 / 3", "2 / 3"]);
});

test("render: an unreadable pref counts highlight tags only and is logged", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const s = setup({ items: [pdf], prefThrows: true });
  const { summaries } = await renderSection(s.R, paper);
  assert.equal(summaries.at(-1), "1 / 3");
  assert.equal(s.errors.length, 1);
});

test("render: everything used gives 3 / 3 and every line ticked", async () => {
  const calls = [];
  const { paper, pdf, highlight } = smokePaper(calls);
  highlight.getTags = () => [{ tag: "Hospitalization" }, { tag: "Heat index" }, { tag: "Temperature" }];
  const s = setup({ items: [pdf] });
  const { lines, summaries } = await renderSection(s.R, paper);
  assert.deepEqual(summaries.at(-1), "3 / 3");
  assert.equal(lines[0], "<p>3 of 3 codebook tags used on this paper");
  assert.deepEqual(lines.filter((l) => l.includes("<li>")), ["  <li>✓ Heat index", "  <li>✓ Temperature", "  <li>✓ Hospitalization"]);
});

test("render: checklist marks are Fluent messages with a tooltip", () => {
  const ftlText = readFileSync(join(srcDir, "locale", "en-US", "tabellify.ftl"), "utf8");
  assert.match(ftlText, /^tabellify-reader-mark-used = ✓\n {4}\.title = .+$/m);
  assert.match(ftlText, /^tabellify-reader-mark-unused = ☐\n {4}\.title = .+$/m);
});

test("render: no codebook file or a codebook without tags shows 'No codebook yet' and —", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const empty = { schemaVersion: 1, revision: 1, nextId: 2, codebooks: [{ id: "c1", name: "Codebook", groups: [] }] };
  for (const files of [{}, { [CODEBOOK_PATH]: empty }]) {
    const s = setup({ items: [pdf], files });
    const { lines, summaries } = await renderSection(s.R, paper);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^<p>No codebook yet\./);
    assert.equal(summaries.at(-1), "—");
    assert.deepEqual(s.errors, []);
  }
});

test("render: unreadable or newer codebook shows 'Could not read the codebook.' and logs why", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const newer = { ...codebook(), schemaVersion: 99 };
  for (const opts of [{ files: { [CODEBOOK_PATH]: newer } }, { readError: new SyntaxError("bad JSON") }]) {
    const s = setup({ items: [pdf], ...opts });
    const { lines, summaries } = await renderSection(s.R, paper);
    assert.deepEqual(lines, ["<p>Could not read the codebook."]);
    assert.equal(summaries.at(-1), "—");
    assert.ok(s.debug.some((l) => l.startsWith("Tabellify: reader section: codebook not usable (")), s.debug.join("\n"));
  }
});

test("render: after unregister (plugin disabled mid-render) nothing is written", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const s = setup({ items: [pdf] });
  s.R.register({ pluginID: "p" });
  const doc = makeDoc();
  const body = doc.createElementNS(XHTML_NS, "div");
  const summaries = [];
  s.R.onRender({ body, doc, setSectionSummary: (x) => summaries.push(x) });
  const pending = s.R.onAsyncRender({ body, doc, item: paper, setSectionSummary: (x) => summaries.push(x) });
  s.R.unregister();
  await pending;
  assert.deepEqual(bodyLines(body), ["<p>Counting…"]);
  assert.deepEqual(summaries, [""]);
});

test("render: an error while reading the library shows the error message and is logged", async () => {
  const calls = [];
  const { paper } = smokePaper(calls);
  const s = setup({ waitForDataLoad: async () => { throw new Error("db closed"); } });
  const { lines, summaries } = await renderSection(s.R, paper);
  assert.deepEqual(lines, ["<p>Could not read the codebook."]);
  assert.equal(summaries.at(-1), "—");
  assert.equal(s.errors.length, 1);
});

test("render: never writes (only IOUtils.readJSON; the store gets no write functions)", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  const s = setup({ items: [pdf], files: {} });
  await renderSection(s.R, paper);
  assert.ok(!s.calls.some((c) => /IOUtils\.(?!readJSON)/.test(c)), s.calls.join("\n"));
  assert.ok(!s.calls.some((c) => c.startsWith("Prefs.set")), "no pref is written");
  assert.equal(s.files.size, 0, "no codebook file was created");
});

test("render: a slow render overtaken by a newer one does not overwrite it", async () => {
  const calls = [];
  const { paper, pdf } = smokePaper(calls);
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  const s = setup({ items: [pdf], waitForDataLoad: () => (first ? ((first = false), gate) : Promise.resolve()) });
  s.R.register({ pluginID: "p" });
  const doc = makeDoc();
  const body = doc.createElementNS(XHTML_NS, "div");
  const summaries = [];
  const set = (x) => summaries.push(x);
  s.R.onRender({ body, doc, setSectionSummary: set });
  const slow = s.R.onAsyncRender({ body, doc, item: paper, setSectionSummary: set });
  s.R.onRender({ body, doc, setSectionSummary: set });
  await s.R.onAsyncRender({ body, doc, item: paper, setSectionSummary: set });
  const done = bodyLines(body);
  release();
  await slow;
  assert.deepEqual(bodyLines(body), done, "the outdated render changed nothing");
  assert.deepEqual(summaries, ["", "", "1 / 3"]);
});

test("render: tag and group names go in as text, not markup", async () => {
  const calls = [];
  const data = codebook();
  data.codebooks[0].groups[0].name = "<img src=x onerror=alert(1)>";
  data.codebooks[0].groups[0].tags = ["<b>bold</b>"];
  const { paper, pdf } = smokePaper(calls);
  const s = setup({ items: [pdf], files: { [CODEBOOK_PATH]: data } });
  const { body } = await renderSection(s.R, paper);
  const group = body.children[1].children[0];
  assert.equal(group.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(group.children.length, 0);
  const label = body.children[2].children[0].children[2];
  assert.equal(label.textContent, "<b>bold</b>");
  assert.equal(label.children.length, 0);
});

// ---------------------------------------------------------------------------------------
// AC11 (unit part): register / unregister / observer
// ---------------------------------------------------------------------------------------

test("AC11: register adds one section (required options) and one observer for item + item-tag", () => {
  const s = setup();
  const log = [];
  s.R.register({ pluginID: "tabellify@asmithlabs.com", log: (m) => log.push(m) });
  assert.deepEqual(s.calls, [
    "registerSection(reader-tags)",
    'registerObserver(["item","item-tag"], tabellify)',
  ]);
  const [[id, options]] = s.sections;
  assert.equal(options.pluginID, "tabellify@asmithlabs.com");
  assert.equal(options.header.l10nID, "tabellify-reader-section-header");
  assert.equal(options.sidenav.l10nID, "tabellify-reader-section-sidenav");
  assert.equal(options.header.icon, "chrome://tabellify/content/icons/reader-tags-16.svg");
  assert.equal(options.sidenav.icon, "chrome://tabellify/content/icons/reader-tags-20.svg");
  for (const hook of ["onRender", "onAsyncRender", "onInit", "onDestroy", "onItemChange"]) {
    assert.equal(typeof options[hook], "function", hook);
  }
  assert.equal(s.R.sectionID, id, "keeps the RETURNED id");
  const [key] = s.observers.keys();
  assert.equal(s.R.observerID, key);
  assert.deepEqual(log, [`reader section registered (${id})`, `notifier observer added (${key})`]);
});

test("AC11: unregister uses the returned ids, in reverse order, and clears the refresh map", () => {
  const s = setup();
  s.R.register({ pluginID: "p", log: () => {} });
  const [id] = s.sections.keys();
  const [key] = s.observers.keys();
  s.R.onInit({ body: {}, refresh: async () => {} });
  assert.equal(s.R.refreshers.size, 1);
  s.calls.length = 0;
  s.R.unregister();
  assert.deepEqual(s.calls, [`unregisterObserver(${key})`, `unregisterSection(${id})`]);
  assert.equal(s.sections.size, 0);
  assert.equal(s.observers.size, 0);
  assert.equal(s.R.refreshers.size, 0);
  assert.equal(s.R.sectionID, null);
  assert.equal(s.R.observerID, null);
});

test("AC11: a second register/unregister cycle works with new ids", () => {
  const s = setup();
  s.R.register({ pluginID: "p", log: () => {} });
  const firstID = s.R.sectionID;
  s.R.unregister();
  s.R.register({ pluginID: "p", log: () => {} });
  assert.notEqual(s.R.sectionID, firstID);
  assert.equal(s.sections.size, 1);
  assert.equal(s.observers.size, 1);
  s.R.unregister();
  assert.equal(s.sections.size, 0);
  assert.equal(s.observers.size, 0);
});

test("AC11: unregister still runs both steps if one throws", () => {
  for (const opts of [{ unregisterObserverThrows: true }, { unregisterSectionThrows: true }]) {
    const s = setup(opts);
    s.R.register({ pluginID: "p", log: () => {} });
    s.calls.length = 0;
    s.R.unregister();
    assert.equal(s.calls.filter((c) => c.startsWith("unregister")).length, 2, JSON.stringify(opts));
    assert.equal(s.errors.length, 1);
    assert.equal(s.R.sectionID, null);
    assert.equal(s.R.observerID, null);
  }
});

test("AC11: failed section registration adds no observer and unregisters nothing", () => {
  for (const mode of [false, "throw"]) {
    const s = setup({ registerSection: mode });
    s.R.register({ pluginID: "p", log: () => {} });
    assert.equal(s.observers.size, 0);
    s.calls.length = 0;
    s.R.unregister();
    assert.deepEqual(s.calls, []);
  }
});

test("AC4 (data): a Notifier event refreshes every live section; onDestroy and unregister stop it", async () => {
  const s = setup();
  s.R.register({ pluginID: "p", log: () => {} });
  const [{ ref, types }] = s.observers.values();
  assert.deepEqual(plain(types), ["item", "item-tag"]);
  const counts = { a: 0, b: 0 };
  const bodyA = {};
  const bodyB = {};
  s.R.onInit({ body: bodyA, refresh: async () => { counts.a++; } });
  s.R.onInit({ body: bodyB, refresh: async () => { counts.b++; throw new Error("render failed"); } });
  ref.notify("add", "item-tag", ["10-5"], {});
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(counts, { a: 1, b: 1 });
  assert.equal(s.errors.length, 1, "a failing refresh is logged, not thrown");

  s.R.onDestroy({ body: bodyB });
  ref.notify("modify", "item", [10], {});
  assert.deepEqual(counts, { a: 2, b: 1 });

  s.R.unregister();
  ref.notify("modify", "item", [10], {});
  assert.deepEqual(counts, { a: 2, b: 1 }, "nothing refreshed after unregister");
});

// ---------------------------------------------------------------------------------------
// Feature 006a AC15: ungrouped tags (codebook schema 2, ADR-0016 §8, spec Q11)
// ---------------------------------------------------------------------------------------

test("F006a AC15: ungrouped tags are listed first without a heading, as plain text; k/M counts them", async () => {
  const calls = [];
  const { paper, pdf, highlight } = smokePaper(calls);
  highlight.getTags = () => [{ tag: "Hospitalization" }, { tag: "<b>age</b>" }];
  const v2 = {
    schemaVersion: 2,
    revision: 8,
    nextId: 4,
    codebooks: [{
      id: "c1",
      name: "Codebook",
      groups: [{ id: "g2", name: "Exposure" }, { id: "g3", name: "Health outcome" }],
      tags: [
        { name: "Heat index", group: "g2" },
        { name: "<b>age</b>", group: null },
        { name: "Hospitalization", group: "g3" },
        { name: "sex", group: null },
      ],
    }],
  };
  const s = setup({ items: [pdf], files: { [CODEBOOK_PATH]: v2 } });
  const { lines, summaries, body } = await renderSection(s.R, paper);
  assert.equal(summaries.at(-1), "2 / 4");
  assert.deepEqual(lines, [
    "<p>2 of 4 codebook tags used on this paper",
    "<ul>",
    "  <li>✓ <b>age</b>",
    "  <li>☐ sex",
    "<p>",
    "  <strong>Exposure",
    "<ul>",
    "  <li>☐ Heat index",
    "<p>",
    "  <strong>Health outcome",
    "<ul>",
    "  <li>✓ Hospitalization",
  ]);
  // No heading element at all for the ungrouped block, and no "null" anywhere.
  assert.equal(body.children[1].tag, "ul");
  assert.ok(lines.every((l) => !l.includes("null")));
  // The tag name is a text node's content, not markup.
  const label = body.children[1].children[0].children[2];
  assert.equal(label.children.length, 0);
  assert.equal(label.textContent, "<b>age</b>");
  assert.deepEqual(s.errors, []);
  assert.ok(!s.calls.some((c) => c.startsWith("IOUtils.write")), "nothing written");
});
