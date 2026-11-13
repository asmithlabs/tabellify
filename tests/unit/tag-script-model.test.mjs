// Feature 006a AC12: unit tests for the tag script parser (src/content/tag-script-model.js).
//
// tag-script-model.js is a classic browser script. Node runs it in an empty node:vm sandbox
// (as the other model tests do); its one global, `TabellifyTagScript`, appears as a property
// of the sandbox. The sandbox has no Zotero, window, document or IOUtils, so loading it
// proves the parser needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "tag-script-model.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const P = sandbox.TabellifyTagScript;

const plain = (v) => JSON.parse(JSON.stringify(v));
const parse = (text) => plain(P.parse(text));
const items = (text) => {
  const r = parse(text);
  assert.equal(r.ok, true, `expected ok for ${JSON.stringify(text)}, got ${JSON.stringify(r)}`);
  return r.items;
};
const tag = (name) => ({ kind: "tag", name });
const group = (name, tags) => ({ kind: "group", name, tags });

test("AC12: the parser is pure (no Zotero / DOM / IOUtils globals)", () => {
  assert.equal(typeof P.parse, "function");
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const g of ["Zotero", "IOUtils", "PathUtils", "document", "window", "Services", "ChromeUtils"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${g}\\b`), `${g} used in the parser`);
  }
});

test("AC12: single tag, comma list, group, empty group, mixed", () => {
  assert.deepEqual(items("age"), [tag("age")]);
  assert.deepEqual(items("sex, region"), [tag("sex"), tag("region")]);
  assert.deepEqual(items("Humidity(rh, dew point)"), [group("Humidity", ["rh", "dew point"])]);
  assert.deepEqual(items("Planned()"), [group("Planned", [])]);
  assert.deepEqual(items("Planned( )"), [group("Planned", [])]);
  assert.deepEqual(items("Exposure(heat index, temperature), age, Outcomes(hospitalization)"), [
    group("Exposure", ["heat index", "temperature"]),
    tag("age"),
    group("Outcomes", ["hospitalization"]),
  ]);
});

test("AC12: whitespace trimmed, inner spaces kept, case kept", () => {
  assert.deepEqual(items("   Heat   index  ,  Exposure  (  Air quality ,B )  "), [
    tag("Heat   index"),
    group("Exposure", ["Air quality", "B"]),
  ]);
  // Case is kept and matters: two different tags (Zotero's rule).
  assert.deepEqual(items("Heat index, heat index"), [tag("Heat index"), tag("heat index")]);
});

test("AC12: NFC normalization", () => {
  const decomposed = "Caf" + "é"; // e + combining acute accent
  assert.deepEqual(items(decomposed), [tag("Café")]);
  assert.deepEqual(items(`G(${decomposed})`), [group("G", ["Café"])]);
  // Two spellings of the same name are one tag → duplicate.
  assert.equal(parse(`Café, ${decomposed}`).error, P.ERR_DUPLICATE);
});

test("AC12: quoted names may contain , ( ) and are trimmed", () => {
  assert.deepEqual(items('"Smith, J.", "a (b)" , G("x,y", " z ")'), [
    tag("Smith, J."),
    tag("a (b)"),
    group("G", ["x,y", "z"]),
  ]);
  assert.deepEqual(items('"Group, one"(a)'), [group("Group, one", ["a"])]);
});

test("AC12: one trailing top-level comma is ignored; only spaces and commas is an empty entry", () => {
  assert.deepEqual(items("a, b,"), [tag("a"), tag("b")]);
  assert.deepEqual(items("a, b,   "), [tag("a"), tag("b")]);
  assert.deepEqual(items("G(a),"), [group("G", ["a"])]);
  for (const empty of ["", "   ", ",", " , , ", "\t"]) {
    assert.deepEqual(parse(empty), { ok: true, items: [] }, JSON.stringify(empty));
  }
  assert.deepEqual(parse(null), { ok: true, items: [] });
});

test("AC12: every error has its Fluent ID and the problem's start/end", () => {
  const cases = [
    // [input, error, start, end]
    ["Exposure(Heat index", P.ERR_UNBALANCED, 8, 19],
    ["A(b", P.ERR_UNBALANCED, 1, 3],
    ["A(", P.ERR_UNBALANCED, 1, 2],
    ["A(b,", P.ERR_UNBALANCED, 1, 4],
    ["a)", P.ERR_UNBALANCED, 1, 2],
    [")", P.ERR_UNBALANCED, 0, 1],
    ["A(b))", P.ERR_UNBALANCED, 4, 5],
    ["a,,b", P.ERR_EMPTY_TAG, 1, 2],
    ["a, ,b", P.ERR_EMPTY_TAG, 2, 3],
    [",a", P.ERR_EMPTY_TAG, 0, 1],
    ["a,,", P.ERR_EMPTY_TAG, 1, 2],
    ["A(b,)", P.ERR_EMPTY_TAG, 3, 4],
    ["A(,b)", P.ERR_EMPTY_TAG, 1, 2],
    ['""', P.ERR_EMPTY_TAG, 0, 2],
    ["(a, b)", P.ERR_EMPTY_GROUP, 0, 1],
    ["x, (a)", P.ERR_EMPTY_GROUP, 3, 4],
    ["A(B(c))", P.ERR_NESTED, 2, 4],
    ["A(b) c", P.ERR_MISSING_COMMA, 5, 6],
    ['"a" b', P.ERR_MISSING_COMMA, 4, 5],
    ['a "b"', P.ERR_MISSING_COMMA, 2, 5],
    ["A(b c\"d\")", P.ERR_MISSING_COMMA, 5, 8],
    ['"abc', P.ERR_UNCLOSED_QUOTE, 0, 4],
    ['a, G("x)', P.ERR_UNCLOSED_QUOTE, 5, 8],
    ["x, x", P.ERR_DUPLICATE, 3, 4],
    ["A(x), B(x)", P.ERR_DUPLICATE, 8, 9],
    ["A(x, y), x", P.ERR_DUPLICATE, 9, 10],
    ['x, "x"', P.ERR_DUPLICATE, 3, 6],
  ];
  for (const [input, error, start, end] of cases) {
    assert.deepEqual(parse(input), { ok: false, error, start, end }, JSON.stringify(input));
  }
  // Every error ID is a Tabellify Fluent ID.
  for (const id of [P.ERR_UNBALANCED, P.ERR_EMPTY_TAG, P.ERR_EMPTY_GROUP, P.ERR_NESTED,
    P.ERR_MISSING_COMMA, P.ERR_UNCLOSED_QUOTE, P.ERR_DUPLICATE]) {
    assert.match(id, /^tabellify-script-error-[a-z-]+$/);
  }
});

test("AC12: the same group named twice merges (ignoring case, first spelling kept)", () => {
  assert.deepEqual(items("A(x), b, a(y)"), [group("A", ["x", "y"]), tag("b")]);
  assert.deepEqual(items("A(x), A()"), [group("A", ["x"])]);
  // A group name may equal a tag name: different lists.
  assert.deepEqual(items("Heat index(Heat index)"), [group("Heat index", ["Heat index"])]);
});

test("AC12: markup characters are plain names", () => {
  assert.deepEqual(items("<b>bold</b>, G(<img src=x onerror=alert`1`>)"), [
    tag("<b>bold</b>"),
    group("G", ["<img src=x onerror=alert`1`>"]),
  ]);
  assert.deepEqual(items('<b>, "<i>(x)</i>"'), [tag("<b>"), tag("<i>(x)</i>")]);
});

test("AC12: very long input (10 000 characters) parses without error", () => {
  const parts = [];
  for (let k = 0; parts.join(", ").length < 10000; k++) parts.push(k % 5 === 0 ? `G${k}(t${k}a, t${k}b)` : `tag ${k}`);
  const text = parts.join(", ");
  assert.ok(text.length >= 10000);
  const r = P.parse(text);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, parts.length);
  // One very long single name too.
  const long = "x".repeat(10000);
  assert.deepEqual(items(long), [tag(long)]);
});
