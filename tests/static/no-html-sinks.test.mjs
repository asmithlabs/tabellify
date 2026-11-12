// FU-SEC-004 [auto]: no HTML-parsing or code-evaluating sinks anywhere in src/.
//
// Why: the workspace document has full (chrome) privileges and shows text from the user's
// library (collection names, titles, tags), which can come from synced or imported data.
// If such text were ever parsed as markup or run as code, it would run with those
// privileges. src/ must therefore put library text on the page only with textContent /
// createElement / new Option(text, value), and never evaluate strings as code.
//
// Like the write guard, this is a HEURISTIC DENYLIST on text, not a proof: it cannot see
// a sink reached through an alias or a computed name (el["inner" + "HTML"]), and a string
// passed to setTimeout through a variable is not caught. Review is the second line.
//
// Comments are removed before scanning (JS `//` and `/* */`, XML `<!-- -->`, Fluent `#`
// lines), so teaching comments may name the forbidden APIs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** @type {Array<{ name: string, re: RegExp }>} */
export const SINKS = [
  { name: "innerHTML", re: /\binnerHTML\b/ },
  { name: "outerHTML", re: /\bouterHTML\b/ },
  { name: "insertAdjacentHTML", re: /\binsertAdjacentHTML\b/ },
  { name: "document.write", re: /\bdocument\s*\.\s*write(?:ln)?\s*\(/ },
  { name: "eval(", re: /\beval\s*\(/ },
  // `new Function("…")` and plain `Function("…")` both compile a string into code.
  { name: "new Function", re: /(?<![\w$.])Function\s*\(/ },
  // setTimeout/setInterval with a string as first argument evaluate that string.
  { name: "string setTimeout/setInterval", re: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/ },
];

/**
 * Remove comments so documentation can mention the forbidden APIs.
 * @param {string} text
 * @param {string} ext  File extension, e.g. ".js"
 */
export function stripComments(text, ext) {
  if (ext === ".ftl") return text.replace(/^\s*#.*$/gm, "");
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // `//` line comments, but not the `//` inside URLs such as chrome://
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/**
 * @param {string} code  Text with comments already removed
 * @returns {Array<{ line: number, sink: string, text: string }>}
 */
export function findSinks(code) {
  const hits = [];
  code.split("\n").forEach((lineText, i) => {
    for (const { name, re } of SINKS) {
      if (re.test(lineText)) hits.push({ line: i + 1, sink: name, text: lineText.trim() });
    }
  });
  return hits;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = join(dir, d.name);
    return d.isDirectory() ? listFiles(full) : d.isFile() ? [full] : [];
  });
}

test("FU-SEC-004: src/ contains no HTML-parsing or string-eval sinks", () => {
  const files = listFiles(srcDir).filter((f) => !/\.(png|svg|ico|DS_Store)$/i.test(f));
  assert.ok(files.length > 0, "no files found under src/");
  assert.ok(files.some((f) => f.endsWith("workspace.js")), "workspace.js not scanned (check is vacuous)");
  const violations = [];
  for (const file of files) {
    const rel = relative(srcDir, file).split(sep).join("/");
    const code = stripComments(readFileSync(file, "utf8"), extname(file));
    for (const hit of findSinks(code)) violations.push(`src/${rel} [${hit.sink}] ${hit.text}`);
  }
  assert.deepEqual(violations, [], `forbidden sinks found:\n${violations.join("\n")}`);
});

test("FU-SEC-004: self-test — every sink pattern catches a known use", () => {
  const fixtures = {
    "innerHTML": "el.innerHTML = name;",
    "outerHTML": "el.outerHTML = `<b>${t}</b>`;",
    "insertAdjacentHTML": 'el.insertAdjacentHTML("beforeend", tag);',
    "document.write": "document.write(title);",
    "eval(": "eval(code);",
    "new Function": 'const f = new Function("return 1");',
    "string setTimeout/setInterval": 'setTimeout("run()", 10);',
  };
  assert.deepEqual(
    Object.keys(fixtures).sort(),
    SINKS.map((s) => s.name).sort(),
    "every sink pattern needs exactly one fixture",
  );
  for (const [name, code] of Object.entries(fixtures)) {
    assert.ok(findSinks(code).map((h) => h.sink).includes(name), `"${name}" did not catch: ${code}`);
  }
  // More variants that must be caught.
  for (const code of [
    "x.innerHTML += y;",
    "window.eval(code);",
    "document.writeln(t);",
    'const f = Function("a", "return a");',
    "setInterval('tick()', 1000);",
    "setTimeout(`go()`, 0);",
    "window.setTimeout( 'go()' );",
  ]) {
    assert.ok(findSinks(code).length > 0, `not caught: ${code}`);
  }
});

test("FU-SEC-004: self-test — safe and look-alike code is not flagged", () => {
  for (const code of [
    "cell.textContent = row.title;",
    "select.append(new Option(label, value));",
    'document.createElementNS("http://www.w3.org/1999/xhtml", "td");',
    "setTimeout(() => run(), 0);",
    "setInterval(tick, 1000);",
    "const r = evaluate(x);",
    'if (typeof cb === "function") cb();',
    "obj.isFunction(x);",
    "await IOUtils.writeUTF8(p, s);",
  ]) {
    assert.deepEqual(findSinks(code), [], `false positive on: ${code}`);
  }
});

test("FU-SEC-004: self-test — sinks named only in comments are ignored, real ones are not", () => {
  const js = [
    "// never use innerHTML here",
    "/* eval( is forbidden",
    "   insertAdjacentHTML too */",
    'const u = "chrome://tabellify/content/x"; el.innerHTML = u;',
  ].join("\n");
  assert.deepEqual(findSinks(stripComments(js, ".js")).map((h) => h.sink), ["innerHTML"]);
  const xhtml = '<!-- innerHTML -->\n<html:p data-l10n-id="x"/>';
  assert.deepEqual(findSinks(stripComments(xhtml, ".xhtml")), []);
  const ftl = "# innerHTML\ntabellify-x = eval(1)";
  assert.deepEqual(findSinks(stripComments(ftl, ".ftl")).map((h) => h.sink), ["eval("]);
});
