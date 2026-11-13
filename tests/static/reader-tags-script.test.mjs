// Feature 005b AC12 [auto]: static checks for src/reader-tags.js (the "Tabellify tags" item
// pane section) and its wiring in src/tabellify.js.
//   - reader-tags.js uses only the Zotero APIs listed in the spec's "Zotero APIs used"
//     table (an allow-list), only the read-only item getters, and no other privileged
//     globals (Services, ChromeUtils, IOUtils, Zotero_Tabs, Zotero.Reader, …)
//   - it never saves: no saveData / writeJSON / makeDirectory, and it calls only
//     TabellifyCodebookStore.load / platformFs / dataDir
//   - library text reaches the page only through createElementNS + textContent
//   - tabellify.js loads the four scripts in dependency order and they exist
//   - the icons it points at exist under src/content/icons/
// Like the other static checks these are heuristics on text with comments removed; the
// unit and behaviour tests run the code, and review is the last line.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const read = (p) => readFileSync(join(srcDir, p), "utf8");
/** Source text without JS comments (so teaching comments can name any API). */
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const reader = code("reader-tags.js");
const tabellify = code("tabellify.js");

test("F005b AC12: reader-tags.js uses only the Zotero APIs listed in the spec", () => {
  const ALLOWED = new Set([
    "Zotero.ItemPaneManager.registerSection",
    "Zotero.ItemPaneManager.unregisterSection",
    "Zotero.Notifier.registerObserver",
    "Zotero.Notifier.unregisterObserver",
    "Zotero.Items.get",
    "Zotero.Libraries.get",
    "Zotero.debug",
    "Zotero.logError",
  ]);
  const used = new Set([...reader.matchAll(/\bZotero(?:\.[A-Za-z_$][\w$]*)+/g)].map((m) => m[0]));
  assert.ok(used.has("Zotero.ItemPaneManager.registerSection"), "no Zotero calls found (check is vacuous)");
  for (const name of used) assert.ok(ALLOWED.has(name), `${name} is not in the F005b allow-list`);
});

test("F005b AC12: reader-tags.js calls only read-only item getters", () => {
  const ALLOWED_ITEM = new Set([
    "isNote", "isAnnotation", "isAttachment", "isFileAttachment",
    "getTags", "getAttachments", "getAnnotations", "waitForDataLoad",
  ]);
  // Calls on the item-like variables of the file.
  const calls = [...reader.matchAll(/\b(?:item|file|annotation)\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  assert.ok(calls.includes("getAnnotations"), "item calls not found (check is vacuous)");
  for (const name of calls) assert.ok(ALLOWED_ITEM.has(name), `item.${name}() is not allowed`);
  assert.match(reader, /\.waitForDataLoad\("item"\)/);
});

test("F005b AC12: reader-tags.js uses no other privileged globals or Zotero internals", () => {
  for (const banned of [
    /\bServices\b/, /\bChromeUtils\b/, /\bComponents\b/, /\bIOUtils\b/, /\bPathUtils\b/,
    /\bZotero_Tabs\b/, /\bZotero\.Reader\b/, /\bZoteroPane\b/, /\bZotero\.Prefs\b/,
    /\bZotero\.DB\b/, /\bwindow\b/,
  ]) {
    assert.doesNotMatch(reader, banned);
  }
});

test("F005b AC12 / data safety: the section never saves the codebook or writes files", () => {
  assert.doesNotMatch(reader, /\bsaveData\b|\bwriteJSON\b|\bmakeDirectory\b/);
  const storeCalls = [...reader.matchAll(/\bTabellifyCodebookStore\.([\w$]+)/g)].map((m) => m[1]);
  assert.ok(storeCalls.includes("load"), "store call not found (check is vacuous)");
  for (const name of storeCalls) assert.ok(["load", "platformFs", "dataDir"].includes(name), name);
  // Only readJSON and join from platformFs are passed on to load().
  assert.match(reader, /const \{ readJSON, join \} = TabellifyCodebookStore\.platformFs\(\);/);
  assert.match(reader, /TabellifyCodebookStore\.load\(\{ readJSON, join \},/);
  // saveData is referenced only by the workspace (and defined by the store).
  assert.doesNotMatch(tabellify, /\bsaveData\b/);
});

test("F005b AC12 / FU-SEC-004: elements are built with createElementNS(HTML_NS) and textContent", () => {
  assert.match(reader, /HTML_NS:\s*"http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(reader, /doc\.createElementNS\(this\.HTML_NS, tag\)/);
  assert.doesNotMatch(reader, /\bcreateElement\(/, "plain createElement would make XUL elements in the main window");
  assert.match(reader, /\.textContent = group\.name;/);
  assert.match(reader, /\.textContent = tag;/);
  assert.doesNotMatch(reader, /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|createContextualFragment|parseFromString/);
  // Fluent arguments are numbers only (no library text inside data-l10n-args).
  for (const m of reader.matchAll(/this\.para\(doc, "[^"]+", \{([^}]*)\}\)/g)) {
    assert.match(m[1], /^\s*(?:used|total)(?:,\s*(?:used|total))*\s*$/, `args: ${m[1]}`);
  }
});

test("F005b: tabellify.js loads the reader scripts in dependency order, and they exist", () => {
  const list = /READER_SCRIPTS:\s*\[([\s\S]*?)\]/.exec(tabellify)?.[1] ?? "";
  const files = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(files, [
    "content/codebook-model.js",
    "content/codebook-store.js",
    "content/tag-monitor-model.js",
    "reader-tags.js",
  ]);
  for (const f of files) assert.ok(existsSync(join(srcDir, f)), `src/${f} missing`);
  assert.match(tabellify, /Services\.scriptloader\.loadSubScript\(this\.rootURI \+ file\)/);
});

test("F005b: the section icons exist where the chrome:// URLs point", () => {
  const icons = [...reader.matchAll(/"chrome:\/\/tabellify\/content\/(icons\/[\w-]+\.svg)"/g)].map((m) => m[1]);
  assert.deepEqual(icons.sort(), ["icons/reader-tags-16.svg", "icons/reader-tags-20.svg"]);
  for (const icon of icons) {
    const svg = read(`content/${icon}`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /<script|\bon\w+\s*=|href=/i, `${icon} must be plain drawing only`);
  }
});
