// AC3/AC4 (static support only — both ACs are [manual]; see
// docs/testing/manual/001-plugin-shell.md). These checks catch wiring mistakes before the
// owner opens Zotero:
//   - every Fluent ID used in src/ exists in tabellify.ftl, and all IDs start with "tabellify-"
//   - the menu message has a `.label` attribute (MenuManager needs it)
//   - the workspace window's `windowtype` matches what tabellify.js looks for
//   - the chrome:// URL that tabellify.js opens maps to a real file in src/content/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const read = (p) => readFileSync(join(srcDir, p), "utf8");

const ftl = read("locale/en-US/tabellify.ftl");
const tabellifyJs = read("tabellify.js");
const workspace = read("content/workspace.xhtml");

/** Map of Fluent message ID → { value: boolean, attributes: string[] }. */
function parseFtl(text) {
  /** @type {Map<string, { value: boolean, attributes: string[] }>} */
  const messages = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const msg = /^([A-Za-z][\w-]*)\s*=\s*(.*)$/.exec(line);
    if (msg) {
      current = { value: msg[2].trim() !== "", attributes: [] };
      messages.set(msg[1], current);
      continue;
    }
    const attr = /^\s+\.([\w-]+)\s*=/.exec(line);
    if (attr && current) current.attributes.push(attr[1]);
  }
  return messages;
}
const messages = parseFtl(ftl);

test("AC3/AC4 (static): all Fluent message IDs start with 'tabellify-'", () => {
  assert.ok(messages.size > 0, "no messages parsed from tabellify.ftl");
  for (const id of messages.keys()) assert.match(id, /^tabellify-/, id);
});

test("AC3 (static): menu l10nID exists in tabellify.ftl and has a .label attribute", () => {
  const m = /l10nID:\s*"([^"]+)"/.exec(tabellifyJs);
  assert.ok(m, "no l10nID in tabellify.js");
  const msg = messages.get(m[1]);
  assert.ok(msg, `${m[1]} missing from tabellify.ftl`);
  assert.ok(msg.attributes.includes("label"), `${m[1]} needs a .label attribute`);
});

test("AC4 (static): every data-l10n-id in workspace.xhtml exists in tabellify.ftl", () => {
  const ids = [...workspace.matchAll(/data-l10n-id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2, "expected at least a title and a description");
  for (const id of ids) assert.ok(messages.has(id), `${id} missing from tabellify.ftl`);
  assert.match(workspace, /<html:link rel="localization" href="tabellify\.ftl"\s*\/>/);
});

test("AC4 (static): workspace.xhtml windowtype matches Tabellify.WORKSPACE_WINDOWTYPE", () => {
  const js = /WORKSPACE_WINDOWTYPE:\s*"([^"]+)"/.exec(tabellifyJs)?.[1];
  const xhtml = /windowtype="([^"]+)"/.exec(workspace)?.[1];
  assert.equal(js, "tabellify:workspace");
  assert.equal(xhtml, js);
});

test("AC3 (static): WORKSPACE_URL maps to an existing file under src/content/", () => {
  const url = /WORKSPACE_URL:\s*"([^"]+)"/.exec(tabellifyJs)?.[1];
  assert.equal(url, "chrome://tabellify/content/workspace.xhtml");
  // bootstrap.js registers ["content", "tabellify", "content/"]: chrome://tabellify/content/X → src/content/X
  const file = url.replace("chrome://tabellify/content/", "content/");
  assert.ok(existsSync(join(srcDir, file)), `src/${file} does not exist`);
});

test("AC4 (static): no hard-coded user-visible text in workspace.xhtml elements", () => {
  // Text between tags (outside comments) should be empty; Fluent fills it.
  const body = workspace.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?xml[^>]*\?>/, "");
  const textNodes = [...body.matchAll(/>([^<]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(textNodes, []);
});
