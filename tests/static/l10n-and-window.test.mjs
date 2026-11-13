// AC3/AC4 (static support only — both ACs are [manual]; see
// docs/testing/manual/001-plugin-shell.md). These checks catch wiring mistakes before the
// owner opens Zotero:
//   - every Fluent ID used in src/ exists in tabellify.ftl, and all IDs start with "tabellify-"
//   - the menu message has a `.label` attribute (MenuManager needs it)
//   - the workspace window's `windowtype` matches what tabellify.js looks for
//   - the chrome:// URL that tabellify.js opens maps to a real file in src/content/
//   - workspace.xhtml loads chrome://global/skin/global.css before <window> (opaque window
//     background), and workspace.css sets no background of its own (docs/zotero-api-notes.md),
//     except on the per-paper table (F005c, narrowed rule below)

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
const workspaceCss = read("content/workspace.css");

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

test("AC4 (static): workspace.xhtml loads global.css via <?xml-stylesheet?> before <window>", () => {
  // Without global.css the root <window> has no background and Gecko makes the native
  // window transparent (docs/zotero-api-notes.md, global.css row). A stylesheet processing
  // instruction only applies if it comes before the root element. Comments are stripped
  // first so a commented-out instruction does not count.
  const code = workspace.replace(/<!--[\s\S]*?-->/g, "");
  const pi = code.search(/<\?xml-stylesheet\s+href="chrome:\/\/global\/skin\/global\.css"(?:\s+type="text\/css")?\s*\?>/);
  const root = code.search(/<window[\s>]/);
  assert.ok(pi >= 0, "missing <?xml-stylesheet href=\"chrome://global/skin/global.css\" …?>");
  assert.ok(root >= 0, "no <window> root element found");
  assert.ok(pi < root, "the global.css processing instruction must come before <window>");
});

/**
 * F005c (docs/features/005c-table-layout.md, "The no-background test", option A, owner-
 * approved as Q4): a background is allowed in workspace.css ONLY
 *   1. on rules whose every selector starts with `#tabellify-items-table`, and
 *   2. with a value that is a translucent text-colour tint
 *      `color-mix(in srgb, currentColor <N>%, transparent)` or the system colour
 *      `-moz-Dialog` / `Canvas`.
 * Everything else stays forbidden: a background on :root, window, #tabellify-workspace-main
 * or anywhere else (the window background comes from global.css; a hard-coded colour breaks
 * dark mode or makes the window see-through), and any literal colour (hex, rgb(), hsl(),
 * named colours).
 * @param {string} cssText
 * @returns {string[]}  One message per forbidden background declaration
 */
function backgroundViolations(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const declRe = /(^|[;{\s])background(?:-color)?\s*:\s*([^;}]*)/gi;
  const allowedValue = /^(?:color-mix\(\s*in\s+srgb\s*,\s*currentColor\s+\d{1,3}(?:\.\d+)?%\s*,\s*transparent\s*\)|-moz-Dialog|Canvas)$/i;
  const allowedSelector = /^#tabellify-items-table(?![\w-])/;
  const violations = [];
  let seen = 0;
  // Innermost rules only ("selectors { declarations }"); inside @media this still finds
  // the inner rule with its own selectors.
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim().split(",").map((x) => x.trim());
    for (const decl of rule[2].matchAll(declRe)) {
      seen++;
      const value = decl[2].trim();
      if (!selectors.every((x) => allowedSelector.test(x))) {
        violations.push(`background outside #tabellify-items-table: ${rule[1].trim()}`);
      } else if (!allowedValue.test(value)) {
        violations.push(`background value not allowed: ${value}`);
      }
    }
  }
  // A declaration outside any rule (broken CSS) must not slip through.
  const total = [...css.matchAll(declRe)].length;
  if (total !== seen) violations.push(`${total - seen} background declaration(s) outside a rule`);
  return violations;
}

test("AC4 / F005c AC12 (static): workspace.css backgrounds only on table cells, tints/system colours only", () => {
  assert.deepEqual(backgroundViolations(workspaceCss), []);
  // The F005c rules really are there (otherwise this test proves nothing new).
  assert.match(workspaceCss, /#tabellify-items-table thead th\s*\{[^}]*background-color:\s*-moz-Dialog/);
  assert.match(workspaceCss, /tr\.tabellify-row-alt\s*\{[^}]*background-color:\s*color-mix\(in srgb, currentColor 6%, transparent\)/);
});

test("F005c AC12: self-check — the background rule still rejects what it was written for", () => {
  const bad = [
    "#tabellify-items-table td { background: #fff; }",
    "#tabellify-items-table td { background-color: rgb(255, 255, 255); }",
    "#tabellify-items-table td { background-color: hsl(0 0% 100%); }",
    "#tabellify-items-table td { background-color: white; }",
    "#tabellify-items-table td { background: color-mix(in srgb, red 10%, transparent); }",
    "#tabellify-items-table td { background: color-mix(in srgb, currentColor 6%, white); }",
    ":root { background-color: -moz-Dialog; }",
    "window { background: Canvas; }",
    "#tabellify-workspace-main { background-color: color-mix(in srgb, currentColor 6%, transparent); }",
    "#tabellify-items-table td, .other { background-color: Canvas; }",
    "#tabellify-items-tablex td { background-color: Canvas; }",
    "@media (prefers-color-scheme: dark) { :root { background: #000; } }",
  ];
  for (const css of bad) assert.ok(backgroundViolations(css).length > 0, `not rejected: ${css}`);
  const good = [
    "#tabellify-items-table thead th { background-color: -moz-Dialog; }",
    "#tabellify-items-table td { background: Canvas; }",
    "#tabellify-items-table tbody tr:hover { background-color: color-mix(in srgb, currentColor 10%, transparent); }",
    "/* background: red; */ #tabellify-items-table td { color: inherit; }",
  ];
  for (const css of good) assert.deepEqual(backgroundViolations(css), [], `wrongly rejected: ${css}`);
});

test("F005b AC12: the reader section's Fluent IDs exist (header .label, side-nav .tooltiptext)", () => {
  const reader = readFileSync(join(srcDir, "reader-tags.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const header = /header:\s*\{\s*l10nID:\s*"([^"]+)"/.exec(reader)?.[1];
  const sidenav = /sidenav:\s*\{\s*l10nID:\s*"([^"]+)"/.exec(reader)?.[1];
  assert.equal(header, "tabellify-reader-section-header");
  assert.equal(sidenav, "tabellify-reader-section-sidenav");
  assert.ok(messages.get(header)?.attributes.includes("label"), `${header} needs .label`);
  assert.ok(messages.get(sidenav)?.attributes.includes("tooltiptext"), `${sidenav} needs .tooltiptext`);
  // Every other tabellify-… literal in reader-tags.js is a message with a value.
  const ids = [...reader.matchAll(/"(tabellify-[\w-]+)"/g)].map((m) => m[1]).filter((id) => id !== header && id !== sidenav);
  assert.ok(ids.length >= 7, "reader Fluent IDs not found (check is vacuous)");
  for (const id of ids) assert.ok(messages.get(id)?.value, `${id} missing from tabellify.ftl or has no value`);
});
