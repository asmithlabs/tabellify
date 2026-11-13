// AC3/AC4 (static support only — both ACs are [manual]; see
// docs/testing/manual/001-plugin-shell.md). These checks catch wiring mistakes before the
// owner opens Zotero:
//   - every Fluent ID used in src/ exists in tabellify.ftl, and all IDs start with "tabellify-"
//   - the menu message has a `.label` attribute (MenuManager needs it)
//   - the workspace window's `windowtype` matches what tabellify.js looks for
//   - the chrome:// URL that tabellify.js opens maps to a real file in src/content/
//   - workspace.xhtml loads chrome://global/skin/global.css before <window> (opaque window
//     background), then tokens.css before workspace.css (F005d AC9)
//   - workspace.css uses only semantic colour tokens (F005d AC11, ADR-0015 §7; replaces the
//     F005c background rule), and the reader item pane section stays unbranded

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
const tokensCss = read("content/tokens.css");

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
 * Semantic colour tokens from tokens.css, per mode, resolved to their primitive's hex.
 * tokens.css follows a simple parsing contract (stated at its top); its own checks are in
 * tests/static/design-tokens.test.mjs.
 * @param {string} cssText
 * @returns {{ light: Map<string, string|null>, dark: Map<string, string|null>, other: Set<string> }}
 */
function tokenTable(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const darkRe = /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}/;
  const darkBlock = darkRe.exec(css)?.[1] ?? "";
  const lightCss = css.replace(darkRe, "");
  const decls = (text) => [...text.matchAll(/(--tabellify-[\w-]+)\s*:\s*([^;]*);/g)].map((m) => [m[1], m[2].trim()]);
  const primitives = new Map(decls(lightCss).filter(([n]) => n.startsWith("--tabellify-palette-")));
  const resolveAll = (pairs) => new Map(pairs.filter(([n]) => n.startsWith("--tabellify-color-")).map(([n, v]) => {
    const prim = /^var\(\s*(--tabellify-palette-[\w-]+)\s*\)$/.exec(v)?.[1];
    return [n, prim ? primitives.get(prim) ?? null : null];
  }));
  const other = new Set(decls(lightCss).map(([n]) => n).filter((n) => !n.startsWith("--tabellify-palette-") && !n.startsWith("--tabellify-color-")));
  return { light: resolveAll(decls(lightCss)), dark: resolveAll(decls(darkBlock)), other };
}
const tokenInfo = tokenTable(tokensCss);

/** Custom properties set from JavaScript, not in tokens.css (workspace.js, F005c). */
const SCRIPT_PROPERTIES = new Set(["--tabellify-tag-columns"]);

/** Properties that can carry a colour (ADR-0015 §7). */
const COLOUR_PROPERTY = /^(?:color|background(?:-[\w-]+)?|border(?:-[\w-]+)?|outline(?:-[\w-]+)?|box-shadow|text-decoration-color|caret-color|accent-color|fill|stroke)$/i;
/** Layout-only properties that the pattern above would catch by name. */
const NOT_COLOUR_PROPERTY = new Set(["border-collapse", "border-spacing", "background-clip", "background-origin", "background-repeat", "background-size", "background-position", "background-attachment"]);
/** Words allowed in a colour-bearing value besides tokens and lengths. Anything else
 *  (for example a named colour like `red` or a system colour like `Canvas`) is rejected. */
const ALLOWED_WORDS = new Set([
  "transparent", "currentcolor", "inherit", "initial", "unset", "none", "inset",
  "solid", "dashed", "dotted", "double", "hidden", "groove", "ridge", "outset", "auto",
]);
/** Colour literals that are never allowed outside tokens.css. */
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\s*\(/i;

/**
 * F005d AC11 (ADR-0015 §7), replacing the F005c Q4 background rule. In a component
 * stylesheet:
 *   - no colour literal (hex, rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), color(),
 *     named or system colours) and no --tabellify-palette-… primitive anywhere;
 *   - colour-bearing properties use only var(--tabellify-color-…), transparent,
 *     currentColor, inherit, none, lengths and style words (solid, dashed, inset, …);
 *   - no background on :root or window (global.css paints the window); elsewhere a
 *     background is only var(--tabellify-color-…), transparent or none, and that token is
 *     an opaque hex in BOTH modes;
 *   - every var(--tabellify-…) used is defined in tokens.css (or set by workspace.js).
 * @param {string} cssText
 * @param {ReturnType<typeof tokenTable>} tokens
 * @returns {string[]}  One message per violation
 */
function colourViolations(cssText, tokens = tokenInfo) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const violations = [];
  if (/--tabellify-palette-/.test(css)) violations.push("--tabellify-palette-… used outside tokens.css");
  // Every token reference must exist.
  for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const name = m[1];
    const known = name.startsWith("--tabellify-color-")
      ? tokens.light.has(name) && tokens.dark.has(name)
      : tokens.other.has(name) || SCRIPT_PROPERTIES.has(name);
    if (!known && !name.startsWith("--tabellify-palette-")) violations.push(`undefined token: ${name}`);
  }
  const declRe = /(^|[;{\s])([a-z-]+)\s*:\s*([^;{}]*)/gi;
  let seen = 0;
  // Innermost rules only ("selectors { declarations }"); inside @media this still finds
  // the inner rule with its own selectors. @keyframes steps (from/to) are rules too.
  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim();
    for (const decl of rule[2].matchAll(declRe)) {
      seen++;
      const prop = decl[2].toLowerCase();
      const value = decl[3].trim();
      if (COLOUR_LITERAL.test(value)) violations.push(`colour literal: ${prop}: ${value}`);
      if (!COLOUR_PROPERTY.test(prop) || NOT_COLOUR_PROPERTY.has(prop)) continue;
      // What is left after removing allowed tokens, calc(), lengths and numbers must be
      // allowed words only.
      const words = value
        .replace(/var\(\s*--tabellify-color-[\w-]+\s*\)/g, " ")
        .replace(/var\(\s*--tabellify-(?!palette-|color-)[\w-]+\s*\)/g, " 0 ")
        .replace(/calc\(/g, " ").replace(/[()*,/+]/g, " ")
        .split(/\s+/).filter(Boolean)
        .filter((w) => !/^-?\d*\.?\d+(?:px|em|rem|%|ms|s)?$/.test(w));
      for (const w of words) {
        if (!ALLOWED_WORDS.has(w.toLowerCase())) violations.push(`not allowed in ${prop}: ${w}`);
      }
      if (prop.startsWith("background")) {
        if (selectors.split(",").some((x) => /(^|[\s>+~(])(?::root|window)(?![\w-])/.test(x.trim()))) {
          violations.push(`background on :root or window: ${selectors}`);
        }
        const token = /^var\(\s*(--tabellify-color-[\w-]+)\s*\)$/.exec(value)?.[1];
        if (token) {
          for (const mode of ["light", "dark"]) {
            if (!/^#[0-9a-f]{6}$/.test(tokens[mode].get(token) ?? "")) violations.push(`background token not opaque in ${mode} mode: ${token}`);
          }
        } else if (!/^(?:transparent|none)$/i.test(value)) {
          violations.push(`background value not allowed: ${value}`);
        }
      }
    }
  }
  // A declaration outside any rule (broken CSS) must not slip through: remove every
  // {…} block (innermost first, then @media wrappers); only selectors may be left, and a
  // selector never contains ";".
  let outside = css;
  for (let prev = ""; prev !== outside;) {
    prev = outside;
    outside = outside.replace(/\{[^{}]*\}/g, "");
  }
  if (outside.includes(";") || outside.includes("}")) violations.push(`declaration(s) outside a rule: ${outside.trim()}`);
  if (seen === 0 && css.trim() !== "") violations.push("no declarations found (check is vacuous)");
  return violations;
}

test("F005d AC11 (static): workspace.css uses only semantic colour tokens (ADR-0015 §7)", () => {
  assert.deepEqual(colourViolations(workspaceCss), []);
  // The rule is not vacuous: the page colour and the table surfaces really are tokens.
  assert.match(workspaceCss, /#tabellify-workspace-main\s*\{[^}]*background-color:\s*var\(--tabellify-color-page\)/);
  assert.match(workspaceCss, /tr\.tabellify-row-alt\s*\{[^}]*background-color:\s*var\(--tabellify-color-surface-alt\)/);
  assert.ok(tokenInfo.light.size >= 20 && tokenInfo.dark.size === tokenInfo.light.size, "tokens.css not parsed");
});

test("F005d AC11: self-check — the colour rule rejects what it was written for", () => {
  const bad = [
    ".x { background: #fff; }",
    ".x { color: red; }",
    ".x { border-color: rgb(0 0 0); }",
    ".x { background: var(--tabellify-palette-teal); }",
    ":root { background: var(--tabellify-color-page); }",
    "window { background-color: var(--tabellify-color-surface); }",
    ".x { color: var(--tabellify-color-does-not-exist); }",
    ".x { background-color: Canvas; }",
    ".x { background-color: -moz-Dialog; }",
    ".x { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); }",
    ".x { outline: 2px solid hsl(0 0% 0%); }",
    ".x { box-shadow: inset 2px 0 0 navy; }",
    ".x { background: var(--tabellify-space-2); }",
    "@media (prefers-color-scheme: dark) { :root { background: var(--tabellify-color-page); } }",
    ".x { --my-colour: #123456; }",
    "color: red; .x { color: inherit; }",
  ];
  for (const css of bad) assert.ok(colourViolations(css).length > 0, `not rejected: ${css}`);
  const good = [
    ".x { background-color: var(--tabellify-color-surface); }",
    ".x { border: var(--tabellify-border-width) solid var(--tabellify-color-border); }",
    ".x { box-shadow: inset calc(-1 * var(--tabellify-border-width-strong)) 0 0 var(--tabellify-color-action); }",
    ".x { color: inherit; background-color: transparent; border: 0; outline: none; }",
    ".x { border-collapse: separate; border-spacing: 0; border-radius: var(--tabellify-radius-md); }",
    "/* background: red; */ .x { color: currentColor; }",
  ];
  for (const css of good) assert.deepEqual(colourViolations(css), [], `wrongly rejected: ${css}`);
});

test("F005d AC9 (static): tokens.css loads before workspace.css; the table has class tabellify-grid", () => {
  const code = workspace.replace(/<!--[\s\S]*?-->/g, "");
  const tokens = code.search(/<html:link rel="stylesheet" href="chrome:\/\/tabellify\/content\/tokens\.css"\s*\/>/);
  const css = code.search(/<html:link rel="stylesheet" href="chrome:\/\/tabellify\/content\/workspace\.css"\s*\/>/);
  assert.ok(tokens >= 0, "tokens.css is not linked");
  assert.ok(css >= 0, "workspace.css is not linked");
  assert.ok(tokens < css, "tokens.css must be linked before workspace.css");
  assert.match(code, /<html:table id="tabellify-items-table"[^>]*\bclass="(?:[^"]*\s)?tabellify-grid(?:\s[^"]*)?"/);
});

test("F005d AC9 (static): the reader item pane section stays Zotero-native (no brand tokens)", () => {
  const reader = readFileSync(join(srcDir, "reader-tags.js"), "utf8");
  assert.doesNotMatch(reader, /tokens\.css/);
  assert.doesNotMatch(reader, /--tabellify-palette-|--tabellify-color-/);
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

// XML forbids "--" inside comments; Gecko then refuses to load the whole workspace document
// ("XML Parsing Error: not well-formed"). Found in the F005d smoke test.
test("workspace.xhtml comments contain no double hyphen (well-formed XML)", () => {
  const bad = [...workspace.matchAll(/<!--([\s\S]*?)-->/g)]
    .map((m) => m[1])
    .filter((body) => body.includes("--") || body.endsWith("-"));
  assert.deepEqual(bad, [], `XML comments with "--": ${bad.join(" | ")}`);
});
