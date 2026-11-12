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
 * The cleanup for `insertFTLIfNeeded`: find our `<link href="…">` element(s) and call
 * `.remove()`. Accepted in three shapes:
 *   1. one-liner:  document.querySelector(`link[href="${x}"]`)?.remove()
 *   2. split:      const link = document.querySelector(`link[href="${x}"]`);
 *                  link?.remove();            (or link.remove())
 *   3. all links:  const links = document.querySelectorAll(`link[href="${x}"]`);
 *                  links.forEach((link) => link.remove());
 *                  (arrow parameter with or without parentheses, body with or without braces)
 * In shape 2 `.remove()` must be called on the SAME identifier the querySelector result was
 * assigned to; in shape 3 `.forEach` must be called on the identifier holding the
 * querySelectorAll result, and `.remove()` on the arrow's own parameter (the `\k<…>`
 * back-references). So deleting the remove call, or calling remove on something else,
 * still fails the check.
 */
const IDENT = "[A-Za-z_$][\\w$]*";
/** @param {"querySelector" | "querySelectorAll"} method */
const linkSelector = (method) =>
  `${method}\\(\\s*(?:\`link\\[href="\\$\\{[^}]+\\}"\\]\`|['"]link\\[href="[^"]+"\\]['"])\\s*\\)`;
const LINK_SELECTOR = linkSelector("querySelector");
const LINK_SELECTOR_ALL = linkSelector("querySelectorAll");
const FTL_LINK_REMOVAL = new RegExp(
  // shape 1
  `${LINK_SELECTOR}\\s*\\?\\.remove\\(\\)` +
  "|" +
  // shape 2
  `\\b(?:const|let|var)\\s+(?<ident>${IDENT})\\s*=\\s*[\\w$.?]*${LINK_SELECTOR}\\s*;` +
  `[\\s\\S]*?(?<![\\w$.])\\k<ident>\\s*\\??\\.remove\\(\\)` +
  "|" +
  // shape 3
  `\\b(?:const|let|var)\\s+(?<list>${IDENT})\\s*=\\s*[\\w$.?]*${LINK_SELECTOR_ALL}\\s*;` +
  `[\\s\\S]*?(?<![\\w$.])\\k<list>\\s*\\.forEach\\(\\s*` +
  // One group for the arrow parameter, parentheses optional. (Two alternative groups would
  // be wrong: in JS a back-reference to a group that did not take part matches "".)
  `\\(?\\s*(?<el>${IDENT})\\s*\\)?\\s*=>\\s*(?:\\{\\s*)?` +
  `\\k<el>\\s*\\??\\.remove\\(\\)`,
);

/**
 * Fixed pairs: [what adds, what removes, description].
 * Each `add` pattern found anywhere in src/ requires the `remove` pattern somewhere in src/.
 * @type {Array<[RegExp, RegExp, string]>}
 */
const PAIRS = [
  [/\.registerChrome\(/, /\.destruct\(\)/, "registerChrome → chromeHandle.destruct()"],
  [/\.insertFTLIfNeeded\(/, FTL_LINK_REMOVAL,
    "insertFTLIfNeeded → querySelector(All)(link[href=…]) + .remove()"],
  [/\.addObserver\(/, /\.removeObserver\(/, "addObserver → removeObserver"],
  [/\.addEventListener\(/, /\.removeEventListener\(/, "addEventListener → removeEventListener"],
  [/\.addResourceIds\(/, /\.removeResourceIds\(/, "addResourceIds → removeResourceIds"],
  // Weak on purpose: this only checks that SOME `.close()` call exists in src/, not that it
  // closes the window we opened or runs at shutdown. The real proof (workspace windows are
  // closed during shutdown, before chromeHandle.destruct) is in
  // tests/behavior/lifecycle.test.mjs.
  [/\.openDialog\(|\.openWindow\(/, /\.close\(\)/, "open window → close()"],
  // F002: a Zotero_Tabs tab we add must be closed by id somewhere (behaviour tests prove
  // when: on unload, at quit, and in shutdown).
  [/\btabs\.add\(\s*\{|Zotero_Tabs\.add\(\s*\{/, /\b(?:tabs|Zotero_Tabs)\.close\(\s*[\w$]+\s*\)/,
    "Zotero_Tabs.add({…}) → Zotero_Tabs.close(id)"],
];

/**
 * F002: every `Services.obs.addObserver(x, "topic")` needs a
 * `Services.obs.removeObserver(y, "topic")` for the SAME topic string.
 * @param {string} code
 * @returns {string[]} topics added but never removed
 */
function unremovedObserverTopics(code) {
  const topics = (verb) =>
    new Set([...code.matchAll(new RegExp(`\\.${verb}\\(\\s*[^,]+,\\s*["'\`]([^"'\`]+)["'\`]`, "g"))].map((m) => m[1]));
  const added = topics("addObserver");
  const removed = topics("removeObserver");
  return [...added].filter((t) => !removed.has(t));
}

test("AC5: every add/register call in src/ has a matching remove/unregister call", () => {
  const missing = [];
  for (const [add, remove, label] of PAIRS) {
    if (add.test(allCode) && !remove.test(allCode)) missing.push(label);
  }
  assert.deepEqual(missing, [], `cleanup missing for: ${missing.join("; ")}`);
});

test("F002 AC5/AC6: every observer topic added in src/ is removed for the same topic", () => {
  assert.match(allCode, /Services\.obs\.addObserver\([^,]+,\s*"quit-application-granted"/,
    "quit observer not found in src/ (check is vacuous)");
  assert.deepEqual(unremovedObserverTopics(allCode), []);
  // Self-test of the helper.
  assert.deepEqual(unremovedObserverTopics('obs.addObserver(o, "a"); obs.removeObserver(o, "b");'), ["a"]);
  assert.deepEqual(unremovedObserverTopics('obs.addObserver(o, "a"); obs.removeObserver(this.o, "a");'), []);
});

test("F002 AC5: the tab add/close pair is found in src/ (not vacuous)", () => {
  assert.match(allCode, /\btabs\.add\(\s*\{/, "Zotero_Tabs add call not found");
  assert.match(allCode, /\btabs\.close\(\s*id\s*\)/, "Zotero_Tabs close(id) call not found");
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

test("AC5: FTL-link cleanup check accepts all three shapes and rejects a missing remove()", () => {
  const SEL_ALL = "window.document.querySelectorAll(`link[href=\"${this.FTL_FILE}\"]`);";
  const accepted = [
    "window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`)?.remove();",
    "const link = window.document.querySelector(`link[href=\"${this.FTL_FILE}\"]`);\nlink?.remove();",
    "let el = document.querySelector('link[href=\"tabellify.ftl\"]');\nif (el) el.remove();",
    // shape 3 (all links), as in src/tabellify.js, and its arrow-function variants
    `const links = ${SEL_ALL}\nlinks.forEach((link) => link.remove());`,
    `const links = ${SEL_ALL}\nlinks.forEach(link => link.remove());`,
    `const links = ${SEL_ALL}\nlinks.forEach((l) => { l.remove(); });`,
    `const links = ${SEL_ALL}\nlinks.forEach(l => { l?.remove() });`,
    `let found = document.querySelectorAll('link[href="tabellify.ftl"]');\nthis.log(found.length);\nfound.forEach((x) => x.remove());`,
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
    // all links: forEach callback does not call remove
    `const links = ${SEL_ALL}\nlinks.forEach((link) => this.log(link));`,
    // all links: remove call deleted entirely
    `const links = ${SEL_ALL}\nthis.log(links.length);`,
    // all links: forEach callback calls remove on a different identifier
    `const links = ${SEL_ALL}\nlinks.forEach((link) => other.remove());`,
    `const links = ${SEL_ALL}\nlinks.forEach((link) => mylink.remove());`,
    // all links: forEach called on a different list
    `const links = ${SEL_ALL}\nothers.forEach((link) => link.remove());`,
    // all links: querySelectorAll result itself is not a single element; .remove() on it is a bug
    `const links = ${SEL_ALL}\nlinks.remove();`,
  ];
  for (const code of accepted) assert.match(code, FTL_LINK_REMOVAL, `should accept: ${code}`);
  for (const code of rejected) assert.doesNotMatch(code, FTL_LINK_REMOVAL, `should reject: ${code}`);
});
