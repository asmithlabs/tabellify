// AC5 [auto], static half: register/unregister symmetry (CLAUDE.md rule 9, ADR-0005).
//
// Reads the plugin's JavaScript as text and checks that every "add something to Zotero"
// call has a matching "remove it again" call somewhere in src/. This is a text check: it
// proves the cleanup call EXISTS, not that it runs. tests/behavior/lifecycle.test.mjs
// proves it runs, and in the right order.

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

/**
 * Fixed pairs: [what adds, what removes, description].
 * Each `add` pattern found anywhere in src/ requires the `remove` pattern somewhere in src/.
 * @type {Array<[RegExp, RegExp, string]>}
 */
const PAIRS = [
  [/\.registerChrome\(/, /\.destruct\(\)/, "registerChrome → chromeHandle.destruct()"],
  [/\.insertFTLIfNeeded\(/, /querySelector\(\s*`link\[href="\$\{[^}]+\}"\]`\s*\)\?\.remove\(\)|querySelector\(\s*['"]link\[href="[^"]+"\]['"]\s*\)\?\.remove\(\)/,
    "insertFTLIfNeeded → querySelector(link[href=…])?.remove()"],
  [/\.addObserver\(/, /\.removeObserver\(/, "addObserver → removeObserver"],
  [/\.addEventListener\(/, /\.removeEventListener\(/, "addEventListener → removeEventListener"],
  [/\.addResourceIds\(/, /\.removeResourceIds\(/, "addResourceIds → removeResourceIds"],
  [/\.openDialog\(|\.openWindow\(/, /\.close\(\)/, "open window → close()"],
];

test("AC5: every add/register call in src/ has a matching remove/unregister call", () => {
  const missing = [];
  for (const [add, remove, label] of PAIRS) {
    if (add.test(allCode) && !remove.test(allCode)) missing.push(label);
  }
  assert.deepEqual(missing, [], `cleanup missing for: ${missing.join("; ")}`);
});

test("AC5: every Zotero.<X>.register<Y>(…) has a Zotero.<X>.unregister<Y>(…)", () => {
  // Generic rule covering MenuManager.registerMenu, ItemPaneManager.registerSection,
  // PreferencePanes.register, Notifier.registerObserver, and anything added later.
  const missing = [];
  const re = /\bZotero\.(\w+)\.register(\w*)\(/g;
  for (const m of allCode.matchAll(re)) {
    const partner = `Zotero.${m[1]}.unregister${m[2]}(`;
    if (!allCode.includes(partner)) missing.push(`${m[0]} has no ${partner}`);
  }
  assert.deepEqual(missing, []);
});

test("AC5: the symmetry check actually finds the F001 registrations (not vacuous)", () => {
  assert.match(allCode, /\.registerChrome\(/, "registerChrome not found in src/");
  assert.match(allCode, /\.insertFTLIfNeeded\(/, "insertFTLIfNeeded not found in src/");
  assert.match(allCode, /Zotero\.MenuManager\.registerMenu\(/, "registerMenu not found in src/");
  assert.match(allCode, /Zotero\.MenuManager\.unregisterMenu\(/, "unregisterMenu not found in src/");
});

test("AC5: bootstrap.js defines all six lifecycle hooks", () => {
  const boot = sources.find((s) => s.file === "bootstrap.js");
  assert.ok(boot, "src/bootstrap.js missing");
  for (const hook of ["install", "startup", "shutdown", "uninstall", "onMainWindowLoad", "onMainWindowUnload"]) {
    assert.match(boot.code, new RegExp(`^function ${hook}\\(`, "m"), `missing function ${hook}()`);
  }
});

test("AC5: shutdown calls Tabellify.shutdown() before chromeHandle.destruct() (source order)", () => {
  const boot = sources.find((s) => s.file === "bootstrap.js").code;
  const body = boot.slice(boot.search(/^function shutdown\(/m));
  const end = body.search(/^}/m);
  const shutdownBody = body.slice(0, end);
  const a = shutdownBody.indexOf("Tabellify?.shutdown()");
  const b = shutdownBody.indexOf("chromeHandle?.destruct()");
  assert.ok(a >= 0 && b >= 0, "both calls must be in shutdown()");
  assert.ok(a < b, "Tabellify.shutdown() must come before chromeHandle.destruct()");
});
