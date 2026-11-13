// Feature 003 (prototype), static wiring checks for the workspace data browser:
//   - workspace.xhtml loads Zotero's include.js, then workspace.js, both inside <window>
//     (include.js must come first: it defines the `Zotero` global workspace.js uses)
//   - every Fluent ID that workspace.js refers to exists in tabellify.ftl, and every
//     element ID it looks up exists in workspace.xhtml
//   - workspace.js reads the library only through the APIs recorded for F003 in
//     docs/zotero-api-notes.md (a small allow-list of `Zotero.*` names)
// Feature 004 adds:
//   - codebook-model.js and codebook-store.js load after include.js and before workspace.js
//   - the codebook Fluent IDs used from JS (string list, status calls, model error IDs) exist
//   - codebook-store.js uses only `Zotero.DataDirectory.dir`; codebook-model.js no Zotero
// Feature 005 (AC14) adds:
//   - tag-monitor-model.js loads after codebook-model.js and before workspace.js, and uses
//     no Zotero / DOM / IOUtils globals
//   - the tag monitor's Fluent IDs (MONITOR_STRINGS) exist; the allow-list gains exactly
//     `Zotero.Items.get` (attachments → items) and the two Notifier methods
//   - lifecycle symmetry for the Notifier observer: exactly one registerObserver( call, at
//     least one unregisterObserver( call, and onUnload unregisters it
// Owner decision 2026-11-13 (count item tags switch) adds:
//   - the checkbox exists, its Fluent ID exists, its change listener is removed on unload
//   - workspace.js reads and writes only the pref extensions.tabellify.countItemTags, global,
//     through TabellifyTagMonitor.COUNT_ITEM_TAGS_PREF; no other file in src/ sets a pref
// Feature 005c (AC11) adds:
//   - table-layout-model.js loads after tag-monitor-model.js and before workspace.js, and
//     uses no Zotero / DOM / IOUtils globals
//   - the layout Fluent IDs (LAYOUT_STRINGS) exist; the Zotero allow-list gains NO entry
//   - every listener added to the table and the table toolbar is removed in onUnload
//   - workspace.js never reads drag data back (no `getData(`), and sets only the private
//     application/x-tabellify-* drag types
// Owner decision 2026-11-13 (codebook tag columns) adds:
//   - the old summary columns (In, All tags, Details / Show remaining) and their Fluent IDs
//     are gone; the header has a fixed Title first and k/M last, and a second row for tags
//   - tag names never go into a CSS selector (only numeric paper IDs are interpolated)
//   - the drag data of a column is only its kind, never a codebook name
// Feature 005c T6 (ADR-0014) adds:
//   - layout-store.js loads after table-layout-model.js and before workspace.js, and uses
//     no Zotero global at all (workspace.js passes it the folder from the codebook store)
//   - the pending layout-save timer is cleared on unload; layout messages are formatted

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const read = (p) => readFileSync(join(srcDir, p), "utf8");
const xhtml = read("content/workspace.xhtml").replace(/<!--[\s\S]*?-->/g, "");
/** Source text without JS comments (so teaching comments can name any API). */
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const js = code("content/workspace.js");
const modelJs = code("content/codebook-model.js");
const storeJs = code("content/codebook-store.js");
const monitorJs = code("content/tag-monitor-model.js");
const layoutModelJs = code("content/table-layout-model.js");
const layoutStoreJs = code("content/layout-store.js");
const ftlIds = new Set([...read("locale/en-US/tabellify.ftl").matchAll(/^(tabellify-[\w-]+)\s*=/gm)].map((m) => m[1]));

test("F003: workspace.xhtml loads include.js, then workspace.js, inside <window>", () => {
  const root = xhtml.search(/<window[\s>]/);
  const include = xhtml.search(/<script\s+src="chrome:\/\/zotero\/content\/include\.js"\s*\/>/);
  const own = xhtml.search(/<script\s+src="chrome:\/\/tabellify\/content\/workspace\.js"\s*\/>/);
  const end = xhtml.search(/<\/window>/);
  assert.ok(include > root && include < end, "include.js script must be inside <window>");
  assert.ok(own > include && own < end, "workspace.js must come after include.js, inside <window>");
});

test("F004: codebook-model.js and codebook-store.js load after include.js, before workspace.js", () => {
  const pos = (file) => xhtml.search(new RegExp(`<script\\s+src="${file.replace(/[./]/g, "\\$&")}"\\s*/>`));
  const include = pos("chrome://zotero/content/include.js");
  const model = pos("chrome://tabellify/content/codebook-model.js");
  const store = pos("chrome://tabellify/content/codebook-store.js");
  const own = pos("chrome://tabellify/content/workspace.js");
  assert.ok(include >= 0 && model >= 0 && store >= 0 && own >= 0, "a script tag is missing");
  assert.ok(include < model, "codebook-model.js must come after include.js");
  assert.ok(model < store, "codebook-store.js must come after codebook-model.js (it uses the model)");
  assert.ok(store < own, "workspace.js must come after codebook-store.js");
});

test("F004: codebook Fluent IDs used from JS exist in tabellify.ftl", () => {
  // 1. The lists workspace.js formats at start-up (F004 codebook, F005 tag monitor).
  const listed = ["CODEBOOK_STRINGS", "MONITOR_STRINGS", "LAYOUT_STRINGS"].flatMap((name) => {
    const list = new RegExp(`${name}:\\s*\\[([\\s\\S]*?)\\]`).exec(js)?.[1] ?? "";
    return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  });
  // 2. IDs passed to showCodebookStatus / text / actionButton as literals.
  const literal = [...js.matchAll(/(?:showCodebookStatus|text|actionButton)\(\s*(?:"[^"]*",\s*)?"(tabellify-[^"]+)"/g)]
    .map((m) => m[1]);
  // 3. The model's refusal reasons (ERR_… constants).
  const errors = [...modelJs.matchAll(/\bERR_\w+:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(listed.length >= 10 && literal.length >= 5 && errors.length >= 6, "check is vacuous");
  for (const id of [...listed, ...literal, ...errors]) {
    assert.ok(ftlIds.has(id), `${id} missing from tabellify.ftl`);
  }
  // Every ID shown by text()/showCodebookStatus must have been formatted at start-up.
  for (const id of literal) assert.ok(listed.includes(id), `${id} is not in CODEBOOK_STRINGS, MONITOR_STRINGS or LAYOUT_STRINGS`);
});

test("F003: Fluent IDs used in workspace.js exist in tabellify.ftl", () => {
  // Fluent IDs reach JS only through formatValue(...); elements in the xhtml carry their own
  // data-l10n-id, which tests/static/l10n-and-window.test.mjs already checks.
  const ids = [...js.matchAll(/formatValue\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(ids.includes("tabellify-untitled"), "formatValue ID not found (check is vacuous)");
  for (const id of ids) assert.ok(ftlIds.has(id), `${id} missing from tabellify.ftl`);
});

test("F003: element IDs looked up by workspace.js exist in workspace.xhtml", () => {
  const ids = [
    ...[...js.matchAll(/\bel\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]),
    ...[...js.matchAll(/showStatus\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]),
  ];
  assert.ok(ids.length >= 4, "expected several element lookups");
  for (const id of ids) assert.match(xhtml, new RegExp(`\\bid="${id}"`), `#${id} missing from workspace.xhtml`);
});

test("F003: workspace.js uses only the Zotero APIs recorded for F003", () => {
  const ALLOWED = new Set([
    "Zotero.debug",
    "Zotero.logError",
    "Zotero.initializationPromise",
    "Zotero.Libraries.userLibraryID",
    "Zotero.Libraries.get",
    "Zotero.Collections.getByLibrary",
    "Zotero.Collections.get",
    // F004: library tag names for "Pick from library" (read-only SELECT).
    "Zotero.Tags.getAll",
    // F005: attachment IDs → attachment items, to reach their annotations (read-only).
    "Zotero.Items.get",
    // F005: live updates (an observer only listens; registered and unregistered here).
    "Zotero.Notifier.registerObserver",
    "Zotero.Notifier.unregisterObserver",
    // Owner decision 2026-11-13: the "Also count tags on the paper itself" switch (a pref).
    "Zotero.Prefs.get",
    "Zotero.Prefs.set",
  ]);
  const used = new Set([...js.matchAll(/\bZotero(?:\.[A-Za-z_$][\w$]*)+/g)].map((m) => m[0]));
  assert.ok(used.size > 0, "no Zotero calls found (check is vacuous)");
  for (const name of used) assert.ok(ALLOWED.has(name), `${name} is not in the F003 allow-list`);
});

test("F004: codebook-store.js uses only Zotero.DataDirectory.dir; codebook-model.js no Zotero", () => {
  const used = new Set([...storeJs.matchAll(/\bZotero(?:\.[A-Za-z_$][\w$]*)+/g)].map((m) => m[0]));
  assert.deepEqual([...used], ["Zotero.DataDirectory.dir"]);
  assert.doesNotMatch(modelJs, /\bZotero\b/);
  // The data directory is read in exactly one place in src/ (spec F004).
  assert.doesNotMatch(js, /\bDataDirectory\b/);
});

test("F005: tag-monitor-model.js loads after codebook-model.js, before workspace.js", () => {
  const pos = (file) => xhtml.search(new RegExp(`<script\\s+src="${file.replace(/[./]/g, "\\$&")}"\\s*/>`));
  const model = pos("chrome://tabellify/content/codebook-model.js");
  const monitor = pos("chrome://tabellify/content/tag-monitor-model.js");
  const own = pos("chrome://tabellify/content/workspace.js");
  assert.ok(model >= 0 && monitor >= 0 && own >= 0, "a script tag is missing");
  assert.ok(model < monitor, "tag-monitor-model.js must come after codebook-model.js");
  assert.ok(monitor < own, "tag-monitor-model.js must come before workspace.js");
});

test("F005: tag-monitor-model.js uses no Zotero / DOM / IOUtils globals", () => {
  assert.match(monitorJs, /var TabellifyTagMonitor\b/, "model not found (check is vacuous)");
  assert.doesNotMatch(monitorJs, /\b(?:Zotero|window|document|IOUtils|PathUtils|Services|ChromeUtils)\b/);
});

test("F005: every MONITOR_STRINGS ID exists in tabellify.ftl and starts with tabellify-monitor-", () => {
  const list = /MONITOR_STRINGS:\s*\[([\s\S]*?)\]/.exec(js)?.[1] ?? "";
  const ids = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10, "MONITOR_STRINGS not found (check is vacuous)");
  for (const id of ids) {
    assert.match(id, /^tabellify-monitor-/);
    assert.ok(ftlIds.has(id), `${id} missing from tabellify.ftl`);
  }
});

test("F005: Fluent is used without arguments (no formatValue(id, args), no setAttributes)", () => {
  assert.doesNotMatch(js, /formatValue\(\s*[^)]*,/);
  assert.doesNotMatch(js, /\bsetAttributes\s*\(/);
});

test("F005: Notifier observer symmetry (one register, unregister on unload, debounce cleared)", () => {
  assert.equal((js.match(/\bregisterObserver\s*\(/g) ?? []).length, 1, "exactly one registerObserver( call");
  assert.ok((js.match(/\bunregisterObserver\s*\(/g) ?? []).length >= 1, "at least one unregisterObserver( call");
  // onUnload must call the unregister helper.
  const onUnload = /onUnload:\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.ok(onUnload.length > 0, "onUnload not found (check is vacuous)");
  assert.match(onUnload, /unregisterMonitorObserver\(/);
  // The helper clears the pending debounce timer, and onNotify checks its document first.
  const helper = /unregisterMonitorObserver\(reason\)\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.match(helper, /clearTimeout\(/);
  assert.match(helper, /Zotero\.Notifier\.unregisterObserver\(/);
  const onNotify = /onNotify:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.match(onNotify, /document\.defaultView/);
  assert.match(onNotify, /unregisterMonitorObserver\(/);
});

test("Count-item-tags switch: checkbox, Fluent ID and listener symmetry", () => {
  assert.match(xhtml, /<html:input id="tabellify-monitor-count-item-tags" type="checkbox"\/>/);
  assert.match(xhtml, /data-l10n-id="tabellify-monitor-count-item-tags"/);
  assert.ok(ftlIds.has("tabellify-monitor-count-item-tags"), "Fluent ID missing from tabellify.ftl");
  assert.match(js, /\.addEventListener\("change", this\.onCountItemTagsChange\)/);
  const onUnload = /onUnload:\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.match(onUnload, /removeEventListener\("change", TabellifyWorkspace\.onCountItemTagsChange\)/);
  // The recount passes the switch to the model.
  assert.match(js, /summarize\([^)]*\{\s*countItemTags: this\.countItemTags,?\s*\}\)/);
});

test("Count-item-tags switch: only this pref, global, by the model's name; only workspace.js sets it", () => {
  assert.match(monitorJs, /COUNT_ITEM_TAGS_PREF:\s*"extensions\.tabellify\.countItemTags"/);
  const calls = [...js.matchAll(/Zotero\.Prefs\.(get|set)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`);
  assert.deepEqual(calls, [
    "get(TabellifyTagMonitor.COUNT_ITEM_TAGS_PREF, true)",
    "set(TabellifyTagMonitor.COUNT_ITEM_TAGS_PREF, W.countItemTags, true)",
  ]);
  assert.doesNotMatch(js, /Zotero\.Prefs\.clear\b/);
  // No other source file writes a pref.
  for (const f of ["tabellify.js", "bootstrap.js", "reader-tags.js", "content/codebook-model.js",
    "content/codebook-store.js", "content/tag-monitor-model.js"]) {
    assert.doesNotMatch(code(f), /Prefs\.(?:set|clear)\b|setBoolPref|setStringPref|setIntPref/, f);
  }
});

test("F005c AC11: table-layout-model.js loads after tag-monitor-model.js, before workspace.js", () => {
  const pos = (file) => xhtml.search(new RegExp(`<script\\s+src="${file.replace(/[./]/g, "\\$&")}"\\s*/>`));
  const monitor = pos("chrome://tabellify/content/tag-monitor-model.js");
  const layout = pos("chrome://tabellify/content/table-layout-model.js");
  const own = pos("chrome://tabellify/content/workspace.js");
  assert.ok(monitor >= 0 && layout >= 0 && own >= 0, "a script tag is missing");
  assert.ok(monitor < layout, "table-layout-model.js must come after tag-monitor-model.js");
  assert.ok(layout < own, "table-layout-model.js must come before workspace.js");
});

test("F005c AC11: table-layout-model.js uses no Zotero / DOM / IOUtils globals", () => {
  assert.match(layoutModelJs, /var TabellifyTableLayout\b/, "model not found (check is vacuous)");
  assert.doesNotMatch(layoutModelJs, /\b(?:Zotero|window|document|IOUtils|PathUtils|Services|ChromeUtils)\b/);
});

test("F005c AC11: every LAYOUT_STRINGS ID exists in tabellify.ftl and starts with tabellify-table-", () => {
  const list = /LAYOUT_STRINGS:\s*\[([\s\S]*?)\]/.exec(js)?.[1] ?? "";
  const ids = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3, "LAYOUT_STRINGS not found (check is vacuous)");
  for (const id of ids) {
    assert.match(id, /^tabellify-table-/);
    assert.ok(ftlIds.has(id), `${id} missing from tabellify.ftl`);
  }
  // The new header/toolbar IDs set in workspace.xhtml exist too.
  for (const id of ["tabellify-column-move", "tabellify-column-title", "tabellify-column-count",
    "tabellify-table-manual-order", "tabellify-table-clear-manual", "tabellify-table-reset-columns"]) {
    assert.match(xhtml, new RegExp(`data-l10n-id="${id}"`), `${id} not used in workspace.xhtml`);
    assert.ok(ftlIds.has(id), `${id} missing from tabellify.ftl`);
  }
});

test("F005c AC11: table and toolbar listeners are added in init and removed in onUnload", () => {
  const onUnload = /onUnload:\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.ok(onUnload.length > 0, "onUnload not found (check is vacuous)");
  const pairs = [
    ["table", "click", "onTableClick"],
    ["table", "dragstart", "onTableDragStart"],
    ["table", "dragover", "onTableDragOver"],
    ["table", "dragleave", "onTableDragLeave"],
    ["table", "drop", "onTableDrop"],
    ["table", "dragend", "onTableDragEnd"],
    ["table", "keydown", "onTableKeydown"],
  ];
  for (const [, type, handler] of pairs) {
    assert.match(js, new RegExp(`table\\.addEventListener\\("${type}", this\\.${handler}\\)`), `${type} not added`);
    assert.match(onUnload, new RegExp(`table\\?\\.removeEventListener\\("${type}", TabellifyWorkspace\\.${handler}\\)`), `${type} not removed`);
  }
  assert.match(js, /el\("tabellify-table-toolbar"\)\.addEventListener\("click", this\.onToolbarClick\)/);
  assert.match(onUnload, /el\("tabellify-table-toolbar"\)\s*\?\.removeEventListener\("click", TabellifyWorkspace\.onToolbarClick\)/);
  // Every addEventListener in workspace.js names a handler that onUnload removes (or is the
  // window's own { once: true } load/unload pair).
  const added = [...js.matchAll(/addEventListener\("([\w]+)", (?:this|TabellifyWorkspace)\.(\w+)/g)].map((m) => `${m[1]}:${m[2]}`);
  const removed = new Set([...onUnload.matchAll(/removeEventListener\("([\w]+)", TabellifyWorkspace\.(\w+)\)/g)].map((m) => `${m[1]}:${m[2]}`));
  assert.ok(added.length >= 15, "listeners not found (check is vacuous)");
  for (const a of added) assert.ok(removed.has(a), `${a} is added but not removed in onUnload`);
});

test("F005c AC11: drag data is never read back; only private drag types are set", () => {
  assert.doesNotMatch(read("content/workspace.js"), /getData\(/);
  const types = [...js.matchAll(/_DRAG_TYPE:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(types.sort(), ["application/x-tabellify-column", "application/x-tabellify-row"]);
  const setData = [...js.matchAll(/\.setData\(\s*([^,]+),/g)].map((m) => m[1].trim());
  assert.ok(setData.length === 2, "expected two setData calls (column and row)");
  for (const arg of setData) assert.match(arg, /^W\.(?:COLUMN|ROW)_DRAG_TYPE$/);
});

test("F005c T6: layout-store.js loads after table-layout-model.js, before workspace.js; no Zotero in it", () => {
  const pos = (file) => xhtml.search(new RegExp(`<script\\s+src="${file.replace(/[./]/g, "\\$&")}"\\s*/>`));
  const model = pos("chrome://tabellify/content/table-layout-model.js");
  const store = pos("chrome://tabellify/content/layout-store.js");
  const own = pos("chrome://tabellify/content/workspace.js");
  assert.ok(model >= 0 && store >= 0 && own >= 0, "a script tag is missing");
  assert.ok(model < store, "layout-store.js must come after table-layout-model.js (it uses the model)");
  assert.ok(store < own, "layout-store.js must come before workspace.js");
  assert.match(layoutStoreJs, /var TabellifyLayoutStore\b/, "store not found (check is vacuous)");
  assert.doesNotMatch(layoutStoreJs, /\bZotero\b/);
  // The folder comes from the codebook store (one place reads the data directory).
  assert.match(js, /this\.layoutDir = TabellifyCodebookStore\.dataDir\(\)/);
});

test("F005c T6: the layout-save timer is cleared on unload; layout messages are formatted", () => {
  const onUnload = /onUnload:\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.match(onUnload, /stopLayoutSaveTimer\(/);
  const helper = /stopLayoutSaveTimer\(\)\s*\{([\s\S]*?)\n {2}\},/.exec(js)?.[1] ?? "";
  assert.match(helper, /clearTimeout\(this\.layoutSaveTimer\)/);
  const list = /LAYOUT_STRINGS:\s*\[([\s\S]*?)\]/.exec(js)?.[1] ?? "";
  const ids = new Set([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  const shown = [...js.matchAll(/showLayoutStatus\(\s*"(tabellify-[^"]+)"/g)].map((m) => m[1]);
  assert.ok(shown.length >= 3, "showLayoutStatus calls not found (check is vacuous)");
  for (const id of shown) assert.ok(ids.has(id), `${id} is not in LAYOUT_STRINGS`);
  // Ternary IDs passed through a variable are listed too.
  for (const id of ["tabellify-table-layout-newer", "tabellify-table-layout-load-error"]) assert.ok(ids.has(id), id);
});

test("Owner 2026-11-13: old summary columns and detail rows are gone (markup, code, Fluent)", () => {
  const ftl = read("locale/en-US/tabellify.ftl");
  for (const id of ["tabellify-column-tags", "tabellify-column-in", "tabellify-column-details",
    "tabellify-column-codebook", "tabellify-column-grip", "tabellify-monitor-show-remaining",
    "tabellify-monitor-hide-remaining", "tabellify-monitor-present"]) {
    assert.ok(!ftlIds.has(id), `${id} is still in tabellify.ftl`);
    assert.ok(!ftl.includes(id), `${id} is still mentioned in tabellify.ftl`);
    assert.ok(!js.includes(id), `${id} is still used in workspace.js`);
    assert.ok(!xhtml.includes(id), `${id} is still used in workspace.xhtml`);
  }
  assert.doesNotMatch(xhtml, /data-column=/);
  assert.doesNotMatch(js, /toggle-paper|expandedPaperIds|tabellify-monitor-detail|allTags/);
  assert.doesNotMatch(js, /COLUMN_IDS|normalizeColumnOrder|columnOrder\b/);
});

test("Owner 2026-11-13: header = grip, Title, (tag groups), k/M; tag row and <colgroup> exist", () => {
  const groupRow = /<html:tr id="tabellify-items-group-row"[^>]*>([\s\S]*?)<\/html:tr>/.exec(xhtml)?.[1] ?? "";
  const order = [...groupRow.matchAll(/class="(tabellify-col-[\w-]+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ["tabellify-col-grip", "tabellify-col-title", "tabellify-col-count"]);
  assert.match(groupRow, /id="tabellify-items-count-header"/);
  assert.match(groupRow, /data-sort="title"/);
  assert.match(groupRow, /data-sort="count"/);
  assert.match(xhtml, /<html:tr id="tabellify-items-tag-row"/);
  assert.match(xhtml, /<html:colgroup id="tabellify-items-cols">/);
  // Group headers are inserted before k/M, so k/M stays last.
  assert.match(js, /groupRow\.insertBefore\(th, countHeader\)/);
  assert.match(js, /tr\.append\(this\.rowGripCell\(paper\), title, \.\.\.tagCells, count\)/);
});

test("Owner 2026-11-13: only numeric paper IDs are put into CSS selectors (never tag names)", () => {
  const interpolated = [...js.matchAll(/querySelector(?:All)?\(\s*`([^`]*)`/g)]
    .flatMap((m) => [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1].trim()));
  assert.ok(interpolated.length >= 1, "no interpolated selectors found (check is vacuous)");
  for (const expr of interpolated) assert.match(expr, /^(?:id|Number\(paperId\))$/, `selector built from ${expr}`);
  // The column drag carries only its kind.
  assert.match(js, /dt\.setData\(W\.COLUMN_DRAG_TYPE, grip\.dataset\.grip\)/);
});
