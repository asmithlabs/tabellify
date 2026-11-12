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
 * The cleanup for `insertFTLIfNeeded`: find our `<link href="…">` and call `.remove()` on it.
 * Accepted in two shapes:
 *   1. one-liner:  document.querySelector(`link[href="${x}"]`)?.remove()
 *   2. split:      const link = document.querySelector(`link[href="${x}"]`);
 *                  link?.remove();            (or link.remove())
 * In shape 2 the `.remove()` must be called on the SAME identifier the querySelector result
 * was assigned to (the `\k<ident>` back-reference), so deleting the remove call, or
 * calling remove on something else, still fails the check.
 */
const LINK_SELECTOR =
  /querySelector\(\s*(?:`link\[href="\$\{[^}]+\}"\]`|['"]link\[href="[^"]+"\]['"])\s*\)/.source;
const FTL_LINK_REMOVAL = new RegExp(
  `${LINK_SELECTOR}\\s*\\?\\.remove\\(\\)` +
  "|" +
  `\\b(?:const|let|var)\\s+(?<ident>[A-Za-z_$][\\w$]*)\\s*=\\s*[\\w$.?]*${LINK_SELECTOR}\\s*;` +
  `[\\s\\S]*?(?<![\\w$.])\\k<ident>\\s*\\??\\.remove\\(\\)`,
);

/**
 * Fixed pairs: [what adds, what removes, description].
 * Each `add` pattern found anywhere in src/ requires the `remove` pattern somewhere in src/.
 * @type {Array<[RegExp, RegExp, string]>}
 */
const PAIRS = [
  [/\.registerChrome\(/, /\.destruct\(\)/, "registerChrome → chromeHandle.destruct()"],
  [/\.insertFTLIfNeeded\(/, FTL_LINK_REMOVAL,
    "insertFTLIfNeeded → querySelector(link[href=…]) + .remove()"],
  [/\.addObserver\(/, /\.removeObserver\(/, "addObserver → removeObserver"],
  [/\.addEventListener\(/, /\.removeEventListener\(/, "addEventListener → removeEventListener"],
  [/\.addResourceIds\(/, /\.removeResourceIds\(/, "addResourceIds → removeResourceIds"],
  // Weak on purpose: this only checks that SOME `.close()` call exists in src/, not that it
  // closes the window we opened or runs at shutdown. The real proof (workspace windows are
  // closed during shutdown, before chromeHandle.destruct) is in
  // tests/behavior/lifecycle.test.mjs.
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

test("AC5: FTL-link cleanup check accepts both shapes and rejects a missing remove()", () => {
  const accepted = [
    "window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`)?.remove();",
    "const link = window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`);\nlink?.remove();",
    "let el = document.querySelector('link[href=\"tabellify.ftl\"]');\nif (el) el.remove();",
  ];
  const rejected = [
    // remove call deleted
    "const link = window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`);\nthis.log(!!link);",
    // remove called on a different identifier
    "const link = window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`);\nother.remove();",
    // remove on an identifier that merely ends with the same name
    "const link = window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`);\nmylink.remove();",
    // query for a different element
    "document.querySelector('div')?.remove();",
  ];
  for (const code of accepted) assert.match(code, FTL_LINK_REMOVAL, `should accept: ${code}`);
  for (const code of rejected) assert.doesNotMatch(code, FTL_LINK_REMOVAL, `should reject: ${code}`);
});
