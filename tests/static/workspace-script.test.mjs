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
//     `Zotero.Items.get` (attachments → items)

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
  const listed = ["CODEBOOK_STRINGS", "MONITOR_STRINGS"].flatMap((name) => {
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
  for (const id of literal) assert.ok(listed.includes(id), `${id} is not in CODEBOOK_STRINGS or MONITOR_STRINGS`);
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
