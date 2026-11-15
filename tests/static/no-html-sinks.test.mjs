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
//
// SEC-013 added: event-handler attributes, srcdoc, the other markup parsers (DOMParser,
// createContextualFragment, setHTML), URLs (src/href) that are not fixed strings, and
// Fluent arguments that do not go through TabellifyReaderTags.numericArgs (numbers only).
// A Fluent argument is text inserted into a translated message, so library text there
// would bypass the textContent-only rule. Patterns are matched per LINE: a call split over
// several lines is not seen (keep such calls on one line).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../helpers/strip-comments.mjs";

export { stripComments };

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
  // --- SEC-013 ---
  // (Whitespace sits INSIDE each negative lookahead `(?!\s*…)`: a `\s*` before it could match
  // nothing and let the lookahead see the space instead, which would hide a violation.)
  // An "on…" attribute (onclick, onerror, …) holds code that runs on the event.
  { name: "setAttribute on-handler", re: /\bsetAttribute\s*\(\s*["'`]on[a-z]/i },
  { name: "setAttributeNS on-handler", re: /\bsetAttributeNS\s*\(\s*[^,()]+,\s*["'`]on[a-z]/i },
  // Assigning a string to an on… property compiles it as code, too.
  { name: "string on-handler property", re: /\.on[a-z]+\s*=\s*["'`]/ },
  // Attribute names must be fixed strings, so library text can never pick the attribute.
  { name: "setAttribute non-literal name", re: /\bsetAttribute\s*\((?!\s*["'][\w:-]+["']\s*,)/ },
  // An iframe's srcdoc is a whole HTML document given as a string.
  { name: "srcdoc", re: /\bsrcdoc\b/i },
  { name: "DOMParser", re: /\bDOMParser\b/ },
  { name: "parseFromString", re: /\bparseFromString\b/ },
  { name: "createContextualFragment", re: /\bcreateContextualFragment\b/ },
  { name: "setHTML/setHTMLUnsafe/parseHTMLUnsafe", re: /\b(?:setHTML|setHTMLUnsafe|parseHTMLUnsafe)\b/ },
  // A URL that is not a fixed string could be javascript:, data: or a remote page. Allowed:
  // a plain string literal, or an UPPER_CASE constant (checked below to be a chrome:// URL).
  {
    name: "non-literal src/href",
    re: /\.(?:src|href)\s*=(?!=)(?!\s*["'][^"'$]*["']\s*;?\s*$)(?!\s*(?:this|[A-Z]\w*)\.[A-Z][A-Z0-9_]*\s*;?\s*$)/,
  },
  {
    name: "setAttribute non-literal src/href",
    re: /\bsetAttribute(?:NS\s*\(\s*[^,()]+,|\s*\()\s*["'`](?:[sS][rR][cC]|[hH][rR][eE][fF]|xlink:href|action|formaction)["'`]\s*,(?!\s*["'][^"'$]*["']\s*\))(?!\s*(?:this|[A-Z]\w*)\.[A-Z][A-Z0-9_]*\s*\))/,
  },
  // Fluent arguments: numbers only, always through numericArgs().
  { name: "data-l10n-args without numericArgs", re: /["'`]data-l10n-args["'`]\s*,(?!\s*JSON\.stringify\(\s*(?:this|TabellifyReaderTags)\.numericArgs\()/ },
  { name: "dataset.l10nArgs", re: /\bl10nArgs\b/ },
  { name: "Fluent args without numericArgs", re: /\b(?:formatValue|formatValues|formatMessages|setArgs)\s*\(\s*[^,()]+,(?!\s*(?:this|TabellifyReaderTags)\.numericArgs\()/ },
  { name: "setAttributes args without numericArgs", re: /\bsetAttributes\s*\(\s*[^,()]+,\s*[^,()]+,(?!\s*(?:this|TabellifyReaderTags)\.numericArgs\()/ },
];

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

/** SEC-013: rules for markup files (.xhtml, .svg), which the JS rules above do not cover. */
export const MARKUP_SINKS = [
  // An inline event handler attribute (onclick="…", onload="…") is code in the markup.
  { name: "inline on-handler attribute", re: /(?:^|[\s"'])on[a-z]+\s*=\s*["']/i },
  { name: "javascript: URL", re: /javascript\s*:/i },
];
/** SEC-013: an icon must be a picture only: no script or embedded HTML inside an SVG. */
export const SVG_SINKS = [
  { name: "svg <script>", re: /<\s*(?:\w+:)?script\b/i },
  { name: "svg <foreignObject>", re: /<\s*(?:\w+:)?foreignObject\b/i },
];

/**
 * @param {string} code  Markup with comments already removed
 * @param {Array<{ name: string, re: RegExp }>} rules
 */
export function findMarkupSinks(code, rules) {
  const hits = [];
  code.split("\n").forEach((lineText, i) => {
    for (const { name, re } of rules) if (re.test(lineText)) hits.push({ line: i + 1, sink: name, text: lineText.trim() });
  });
  return hits;
}

test("SEC-013: markup (.xhtml, .svg) has no inline handlers, javascript: URLs or SVG scripts", () => {
  const files = listFiles(srcDir).filter((f) => /\.(xhtml|svg)$/i.test(f));
  assert.ok(files.some((f) => f.endsWith("workspace.xhtml")), "workspace.xhtml not scanned");
  assert.ok(files.some((f) => f.endsWith(".svg")), "no SVG scanned");
  const violations = [];
  for (const file of files) {
    const rel = relative(srcDir, file).split(sep).join("/");
    const code = stripComments(readFileSync(file, "utf8"), ".xhtml");
    const rules = file.endsWith(".svg") ? [...MARKUP_SINKS, ...SVG_SINKS] : MARKUP_SINKS;
    for (const hit of findMarkupSinks(code, rules)) violations.push(`src/${rel} [${hit.sink}] ${hit.text}`);
  }
  assert.deepEqual(violations, [], `forbidden markup found:\n${violations.join("\n")}`);
});

test("SEC-013: self-test — markup rules catch known uses and skip look-alikes", () => {
  const all = [...MARKUP_SINKS, ...SVG_SINKS];
  for (const code of [
    '<html:button onclick="run()">',
    '<svg onload="x()" xmlns="http://www.w3.org/2000/svg">',
    "  onerror='x()'",
    '<html:a href="javascript:alert(1)">',
    "<script>alert(1)</script>",
    '<svg:script href="x.js"/>',
    "<foreignObject><div/></foreignObject>",
  ]) {
    assert.ok(findMarkupSinks(code, all).length > 0, `not caught: ${code}`);
  }
  for (const code of [
    '<html:button id="tabellify-online" data-l10n-id="tabellify-x"/>',
    '<html:p class="tabellify-status" hidden="true"/>',
    '<path d="M1 1h14v14H1z" fill="context-fill"/>',
    '<html:option value="one">',
  ]) {
    assert.deepEqual(findMarkupSinks(code, all), [], `false positive on: ${code}`);
  }
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
    "setAttribute on-handler": 'img.setAttribute("onerror", code);',
    "setAttributeNS on-handler": 'el.setAttributeNS(null, "onload", c);',
    "string on-handler property": 'el.onclick = "run()";',
    "setAttribute non-literal name": "el.setAttribute(attrName, value);",
    "srcdoc": "frame.srcdoc = page;",
    "DOMParser": "const p = new DOMParser();",
    "parseFromString": 'p.parseFromString(text, "text/html");',
    "createContextualFragment": "range.createContextualFragment(markup);",
    "setHTML/setHTMLUnsafe/parseHTMLUnsafe": "el.setHTMLUnsafe(markup);",
    "non-literal src/href": "img.src = item.url;",
    "setAttribute non-literal src/href": 'a.setAttribute("href", link);',
    "data-l10n-args without numericArgs": 'el.setAttribute("data-l10n-args", JSON.stringify({ title }));',
    "dataset.l10nArgs": "el.dataset.l10nArgs = json;",
    "Fluent args without numericArgs": 'await doc.l10n.formatValue("tabellify-x", { name });',
    "setAttributes args without numericArgs": 'doc.l10n.setAttributes(el, "tabellify-x", { title });',
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
    'el.setAttribute("ONCLICK", c);',
    'el.setAttribute( "onclick", c);',
    'a.setAttributeNS(null, "href", link);',
    "img.src= url;",
    "el.setAttribute(`on${evt}`, c);",
    'frame.setAttribute("srcdoc", page);',
    "el.setHTML(markup);",
    "Document.parseHTMLUnsafe(markup);",
    "a.href = `${base}/x`;",
    'a.href = "javascript:" + code;',
    "iframe.src = this.url;",
    'iframe.setAttribute("src", url);',
    'iframe.setAttribute("src", this.url);',
    'iframe.setAttribute("SRC", url);',
    'iframe.setAttribute("src", `chrome://x/${name}`);',
    'el.setAttribute("data-l10n-args", JSON.stringify(args));',
    'doc.l10n.formatValue("tabellify-x", args);',
    'doc.l10n.formatValues([{ id: "a", args: { t } }]);',
    'doc.l10n.setArgs(el, { title });',
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
    // SEC-013 look-alikes that are safe.
    'th.setAttribute("scope", "col");',
    'el.setAttribute("open", "");',
    'grip.setAttribute("aria-label", label);',
    'iframe.setAttribute("src", this.WORKSPACE_URL);',
    'iframe.setAttribute("src", "chrome://tabellify/content/workspace.xhtml");',
    'img.src = "chrome://tabellify/content/icons/x.svg";',
    "const same = a.src === b.src;",
    "const u = link.href;",
    'el.setAttribute("data-l10n-args", JSON.stringify(this.numericArgs(args)));',
    'await doc.l10n.formatValue("tabellify-x", this.numericArgs({ used, total }));',
    'await document.l10n.formatValue("tabellify-untitled");',
    "ids.map((id) => document.l10n?.formatValue(id));",
    'doc.l10n.setAttributes(el, "tabellify-x");',
    "const responseText = done ? text : null;",
    'el.setAttribute("title", "online");',
    'el.setAttribute( "role", "button");',
    'a.setAttributeNS(null, "href", "chrome://tabellify/content/x");',
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

test("SEC-013: every UPPER_CASE constant used as a src/href is a fixed chrome:// URL", () => {
  // The two src/href rules allow `this.NAME` / `Obj.NAME`. Check each such NAME is defined
  // in the same file as `NAME: "chrome://…"` (or `const NAME = "chrome://…"`).
  const uses = /(?:\.(?:src|href)\s*=\s*|setAttribute(?:NS\s*\(\s*[^,()]+,|\s*\()\s*["'`](?:src|href|xlink:href|action|formaction)["'`]\s*,\s*)(?:this|[A-Z]\w*)\.([A-Z][A-Z0-9_]*)\b/g;
  let checked = 0;
  for (const file of listFiles(srcDir).filter((f) => /\.m?js$/.test(f))) {
    const code = stripComments(readFileSync(file, "utf8"), extname(file));
    for (const m of code.matchAll(uses)) {
      const def = new RegExp(`(?:\\b${m[1]}\\s*:|const\\s+${m[1]}\\s*=)\\s*"chrome://[^"\\s]+"`);
      assert.match(code, def, `${relative(srcDir, file)}: ${m[1]} is not a fixed chrome:// URL`);
      checked++;
    }
  }
  assert.ok(checked >= 1, "expected at least the workspace iframe's src (tabellify.js)");
});
