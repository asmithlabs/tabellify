// Feature 003 (prototype), static wiring checks for the workspace data browser:
//   - workspace.xhtml loads Zotero's include.js, then workspace.js, both inside <window>
//     (include.js must come first: it defines the `Zotero` global workspace.js uses)
//   - every Fluent ID that workspace.js refers to exists in tabellify.ftl, and every
//     element ID it looks up exists in workspace.xhtml
//   - workspace.js reads the library only through the APIs recorded for F003 in
//     docs/zotero-api-notes.md (a small allow-list of `Zotero.*` names)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const read = (p) => readFileSync(join(srcDir, p), "utf8");
const xhtml = read("content/workspace.xhtml").replace(/<!--[\s\S]*?-->/g, "");
const js = read("content/workspace.js")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const ftlIds = new Set([...read("locale/en-US/tabellify.ftl").matchAll(/^(tabellify-[\w-]+)\s*=/gm)].map((m) => m[1]));

test("F003: workspace.xhtml loads include.js, then workspace.js, inside <window>", () => {
  const root = xhtml.search(/<window[\s>]/);
  const include = xhtml.search(/<script\s+src="chrome:\/\/zotero\/content\/include\.js"\s*\/>/);
  const own = xhtml.search(/<script\s+src="chrome:\/\/tabellify\/content\/workspace\.js"\s*\/>/);
  const end = xhtml.search(/<\/window>/);
  assert.ok(include > root && include < end, "include.js script must be inside <window>");
  assert.ok(own > include && own < end, "workspace.js must come after include.js, inside <window>");
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
  ]);
  const used = new Set([...js.matchAll(/\bZotero(?:\.[A-Za-z_$][\w$]*)+/g)].map((m) => m[0]));
  assert.ok(used.size > 0, "no Zotero calls found (check is vacuous)");
  for (const name of used) assert.ok(ALLOWED.has(name), `${name} is not in the F003 allow-list`);
});
