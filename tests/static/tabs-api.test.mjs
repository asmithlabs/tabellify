// Feature 002 [auto], static half of AC10 and AC11 (docs/features/002-workspace-tab.md).
//
// `Zotero_Tabs` is an undocumented Zotero internal (ADR-0009). Tabellify may use only four
// of its methods: add, select, close, getTabInfo. These text checks fail if src/:
//   - touches any other Zotero_Tabs member (getState, restoreState, _tabs, tabHooks, …),
//     directly or through a variable that holds Zotero_Tabs (e.g. `const tabs = …`);
//   - reads a Zotero_Tabs member with a computed key (`tabs[x]`) unless `x` loops over a
//     literal list of allowed names (the feature-detect loop in getTabsAPI);
//   - mentions Zotero.Session (Tabellify must never read or write Zotero's session);
//   - uses a tab type with a hyphen, or anything other than "tabellify" (AC11);
//   - uses a Fluent ID for the tab title that is missing from tabellify.ftl.
// Like the other static checks these are heuristics on text with comments removed. The
// behaviour tests (tests/behavior/workspace-tab.test.mjs) run the code against a strict fake
// Zotero_Tabs that throws on any other member, and review (AC10) is the last line.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** @returns {string[]} absolute paths of .js/.mjs files under dir */
function listJs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = join(dir, d.name);
    if (d.isDirectory()) return listJs(full);
    return /\.m?js$/.test(d.name) ? [full] : [];
  });
}

/** Remove // line comments and block comments, so docs that mention an API don't count. */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const sources = listJs(srcDir).map((file) => ({
  file: relative(srcDir, file),
  code: stripComments(readFileSync(file, "utf8")),
}));
const allCode = sources.map((s) => s.code).join("\n");
const tabellifyJs = sources.find((s) => s.file === "tabellify.js").code;

export const ALLOWED = ["add", "select", "close", "getTabInfo"];
/** Members that must never appear anywhere in src/ code, even as strings. */
const BANNED_WORDS = ["getState", "restoreState", "tabHooks", "_tabs", "_getHook", "_update"];

/**
 * Find Zotero_Tabs uses outside the allow-list.
 * Aliases: `Zotero_Tabs` itself, plus every identifier assigned from an expression that
 * mentions `Zotero_Tabs` or `getTabsAPI(` (e.g. `const tabs = this.getTabsAPI(win)`).
 * Identifiers are matched by name across the file (no scoping), which is stricter than needed.
 * @param {string} code  Source with comments removed
 * @returns {string[]} violations
 */
export function findTabsViolations(code) {
  const IDENT = "[A-Za-z_$][\\w$]*";
  const aliases = new Set(["Zotero_Tabs"]);
  const assign = new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*[^;\\n]*(?:Zotero_Tabs|getTabsAPI\\()`, "g");
  for (const m of code.matchAll(assign)) aliases.add(m[1]);

  const violations = [];
  for (const alias of aliases) {
    const esc = alias.replace(/\$/g, "\\$");
    // Dot access: alias.x or alias?.x
    for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${esc}\\s*(?:\\?\\.|\\.)\\s*(${IDENT})`, "g"))) {
      if (!ALLOWED.includes(m[1])) violations.push(`${alias}.${m[1]}`);
    }
    // Computed access: alias[x] / alias?.[x]
    for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${esc}\\s*(?:\\?\\.)?\\[\\s*([^\\]]*?)\\s*\\]`, "g"))) {
      const key = m[1];
      const literal = /^["'`]([^"'`]+)["'`]$/.exec(key);
      if (literal) {
        if (!ALLOWED.includes(literal[1])) violations.push(`${alias}["${literal[1]}"]`);
        continue;
      }
      // Allowed only as `for (const key of [ "add", … ])` over allowed literal names.
      const loop = new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s+${key.replace(/\$/g, "\\$")}\\s+of\\s+\\[([^\\]]*)\\]`).exec(code);
      const names = loop ? [...loop[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((n) => n[1]) : null;
      if (!names || names.length === 0 || names.some((n) => !ALLOWED.includes(n))) {
        violations.push(`${alias}[${key}]`);
      }
    }
  }
  for (const word of BANNED_WORDS) {
    if (new RegExp(`(?<![\\w$])${word.replace(/\$/g, "\\$")}(?![\\w$])`).test(code)) violations.push(`banned: ${word}`);
  }
  return violations;
}

test("F002 AC10: src/ uses only Zotero_Tabs.add/select/close/getTabInfo (internal-API allow-list)", () => {
  assert.match(allCode, /Zotero_Tabs/, "Zotero_Tabs not found in src/ (check would be vacuous)");
  assert.deepEqual(findTabsViolations(allCode), []);
});

test("F002 AC10: allow-list self-test — accepts allowed uses, rejects everything else", () => {
  const accepted = [
    "const tabs = win?.Zotero_Tabs; tabs.add({}); tabs.select(id); tabs.close(id);",
    "const tabs = this.getTabsAPI(win); tabs.getTabInfo(id)?.type;",
    'const tabs = win.Zotero_Tabs; for (const method of ["add", "select", "close", "getTabInfo"]) { typeof tabs[method]; }',
    'win.Zotero_Tabs["close"](id);',
    'this.log("Zotero_Tabs.add failed");',
  ];
  const rejected = [
    "win.Zotero_Tabs.getState();",
    "Zotero_Tabs.restoreState([]);",
    "const T = win.Zotero_Tabs; T._tabs.length;",
    "const tabs = this.getTabsAPI(win); tabs.tabHooks.restoreState.x = 1;",
    "const tabs = win.Zotero_Tabs; tabs.rename(id, 'x');",
    "const tabs = win.Zotero_Tabs; tabs?.move(id, 0);",
    'win.Zotero_Tabs["getState"]();',
    "const tabs = win.Zotero_Tabs; tabs[name]();",
    'const tabs = win.Zotero_Tabs; for (const m of ["add", "getState"]) tabs[m];',
    'const name = "getState"; win[name];',
  ];
  for (const code of accepted) assert.deepEqual(findTabsViolations(code), [], `should accept: ${code}`);
  for (const code of rejected) assert.notDeepEqual(findTabsViolations(code), [], `should reject: ${code}`);
});

test("F002 AC10: src/ never mentions Zotero.Session (no session reads or writes)", () => {
  const hits = sources.filter((s) => /\bZotero\s*\.\s*Session\b|\bsession\.json\b/.test(s.code)).map((s) => s.file);
  assert.deepEqual(hits, []);
});

test("F002 AC11: the tab type is exactly \"tabellify\" (no hyphen) and add() uses it with data: {}", () => {
  const type = /TAB_TYPE:\s*["'`]([^"'`]*)["'`]/.exec(tabellifyJs)?.[1];
  assert.equal(type, "tabellify");
  assert.ok(!type.includes("-"), "Zotero splits tab types on '-'");

  const addCall = /\btabs\.add\(\s*\{([\s\S]*?)\}\s*\)\s*;/.exec(tabellifyJs)?.[1];
  assert.ok(addCall, "tabs.add({ … }) not found");
  const typeExpr = /\btype:\s*([^,\n]+)/.exec(addCall)?.[1].trim();
  assert.ok(
    typeExpr === "this.TAB_TYPE" || typeExpr === '"tabellify"',
    `add() type must be this.TAB_TYPE or "tabellify", got ${typeExpr}`,
  );
  assert.match(addCall, /\bdata:\s*\{\s*\}/, "add() must pass data: {}");
  // No other tab-type literal with a hyphen anywhere near a type: key.
  for (const m of allCode.matchAll(/\btype:\s*["'`]([^"'`]*)["'`]/g)) {
    assert.ok(!m[1].includes("-"), `tab type with hyphen: ${m[1]}`);
  }
});

test("F002 AC1: the tab-title Fluent ID used in src/ exists in tabellify.ftl as a plain value", () => {
  const ftl = readFileSync(join(srcDir, "locale", "en-US", "tabellify.ftl"), "utf8");
  const id = /formatValue\(\s*["'`](tabellify-[\w-]+)["'`]\s*\)/.exec(tabellifyJs)?.[1];
  assert.equal(id, "tabellify-tab-title");
  const line = new RegExp(`^${id}\\s*=\\s*(.*)$`, "m").exec(ftl);
  assert.ok(line, `${id} missing from tabellify.ftl`);
  assert.notEqual(line[1].trim(), "", `${id} needs a value (formatValue returns the value)`);
  const fallback = /FALLBACK_TAB_TITLE:\s*["'`]([^"'`]+)["'`]/.exec(tabellifyJs)?.[1];
  assert.equal(fallback, "Tabellify");
});
