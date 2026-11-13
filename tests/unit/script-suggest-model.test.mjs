// Feature 006b AC9, AC10: unit tests for the suggestion logic
// (src/content/script-suggest-model.js).
//
// Both classic scripts are run in one empty node:vm sandbox, in the workspace's order
// (tag-script-model.js first: script-suggest-model.js uses its `clean` and `tokenAt` is
// needed to build tokens). The sandbox has no Zotero, window, document or IOUtils, so
// loading them proves the logic needs none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content");
const file = join(dir, "script-suggest-model.js");
const sandbox = vm.createContext({});
for (const f of [join(dir, "tag-script-model.js"), file]) {
  vm.runInContext(readFileSync(f, "utf8"), sandbox, { filename: f });
}
const P = sandbox.TabellifyTagScript;
const S = sandbox.TabellifyScriptSuggest;

const plain = (v) => JSON.parse(JSON.stringify(v));
const manual = (...names) => names.map((tag) => ({ tag, type: 0 }));
/** Token with the cursor at the end of `text`. */
const tokenEnd = (text) => P.tokenAt(text, text.length);
const ctx = (codebookTags = [], groupNames = [], extra = {}) => ({ codebookTags: new Set(codebookTags), groupNames, ...extra });
const names = (options) => plain(options).map((o) => o.name);
const kinds = (options) => plain(options).map((o) => o.kind);

test("AC12: the suggestion model is pure (no Zotero / DOM / IOUtils globals)", () => {
  assert.equal(typeof S.suggest, "function");
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const g of ["Zotero", "IOUtils", "PathUtils", "document", "window", "Services", "ChromeUtils"]) {
    assert.doesNotMatch(src, new RegExp(`\\b${g}\\b`), `${g} used in the suggestion model`);
  }
});

test("AC9: fold ignores case and accents", () => {
  assert.equal(S.fold("Étude Über"), "etude uber");
  assert.equal(S.fold("HEAT"), "heat");
  assert.equal(S.fold("Cafe" + "́"), "cafe");
});

test("AC9: prepare keeps manual names, drops automatic-only, blanks, duplicates and quotes", () => {
  const index = S.prepare([
    { tag: "auto only", type: 1 },
    { tag: "both", type: 1 },
    { tag: "both", type: 0 },
    { tag: "Mortality" }, // no type: manual
    { tag: "Mortality", type: 0 },
    { tag: "   ", type: 0 },
    { tag: "", type: 0 },
    { tag: 'say "hi"', type: 0 },
    { tag: 'say "hi"', type: 0 },
    { tag: 'x"y', type: 0 },
    { tag: 42, type: 0 },
    null,
    { tag: "age", type: 0 },
  ]);
  assert.deepEqual(plain(index.entries).map((e) => e.name), ["age", "both", "Mortality"]);
  assert.equal(index.skippedQuote, 2);
  assert.equal(index.names.has("both"), true);
  assert.equal(index.names.has("auto only"), false);
  assert.deepEqual(plain(S.prepare(null).entries), []);
});

test("AC9: case- and accent-insensitive match; starts-with before contains, alphabetical in each", () => {
  const index = S.prepare(manual("Heat index", "heat wave", "Wheat", "Étude", "Preheat", "Cold", "heat"));
  const options = S.suggest(index, tokenEnd("HEA"), ctx());
  assert.deepEqual(names(options), ["heat", "Heat index", "heat wave", "Preheat", "Wheat", "HEA"]);
  assert.deepEqual(kinds(options), ["tag", "tag", "tag", "tag", "tag", "create"]);
  assert.deepEqual(names(S.suggest(index, tokenEnd("etu"), ctx())).slice(0, 1), ["Étude"]);
});

test("AC9: codebook tags are excluded exactly (case-sensitive)", () => {
  const index = S.prepare(manual("Heat index", "heat index", "Hospitalization"));
  const options = S.suggest(index, tokenEnd("Outcome(hea"), ctx(["Heat index"]));
  assert.deepEqual(names(options), ["heat index", "hea"]);
  // AC1: a codebook tag is not offered; only Create may appear.
  const hosp = S.suggest(index, tokenEnd("Outcome(hosp"), ctx(["Hospitalization"]));
  assert.deepEqual(plain(hosp), [{ kind: "create", name: "hosp" }]);
});

test("AC9: at most 50 options", () => {
  const many = [];
  for (let k = 0; k < 200; k++) many.push(`tag ${k}`);
  const index = S.prepare(manual(...many));
  const options = S.suggest(index, tokenEnd("tag"), ctx());
  assert.equal(options.length, 50);
  assert.equal(options.at(-1).kind, "create");
  assert.equal(S.suggest(index, tokenEnd("tag"), ctx(), 10).length, 10);
});

test("AC9: group options only at the top level, first, matched ignoring case", () => {
  const index = S.prepare(manual("Exposure time", "export"));
  const top = S.suggest(index, tokenEnd("exp"), ctx([], ["Outcome", "Exposure", "EXPERT"]));
  assert.deepEqual(plain(top.slice(0, 2)), [{ kind: "group", name: "Exposure" }, { kind: "group", name: "EXPERT" }]);
  assert.deepEqual(names(top.slice(2)), ["export", "Exposure time", "exp"]);
  const inGroup = S.suggest(index, tokenEnd("Outcome(exp"), ctx([], ["Exposure"]));
  assert.equal(inGroup.some((o) => o.kind === "group"), false);
  // At most 5 group options.
  const groups = ["g1", "g2", "g3", "g4", "g5", "g6"];
  assert.equal(S.suggest(index, tokenEnd("g"), ctx([], groups)).filter((o) => o.kind === "group").length, 5);
});

test("AC9: Create appears last when the typed name is new, and not otherwise", () => {
  const index = S.prepare(manual("Mortality", "Heat index"));
  // Not exactly a library name (only a prefix of one): Mortality, then Create "Mort".
  const mort = S.suggest(index, tokenEnd("Mort"), ctx());
  assert.deepEqual(plain(mort), [{ kind: "tag", name: "Mortality" }, { kind: "create", name: "Mort" }]);
  // Exactly a library name: no Create.
  assert.deepEqual(kinds(S.suggest(index, tokenEnd("Mortality"), ctx())), ["tag"]);
  // Exactly a codebook tag: no Create (and the tag itself is hidden).
  assert.deepEqual(plain(S.suggest(index, tokenEnd("Mortality"), ctx(["Mortality"]))), []);
  // Case matters for identity: "mortality" is a new name.
  assert.equal(S.suggest(index, tokenEnd("mortality"), ctx()).at(-1).kind, "create");
  // AC4: nothing matches at all → only Create.
  assert.deepEqual(plain(S.suggest(index, tokenEnd("zz tabellify test"), ctx())),
    [{ kind: "create", name: "zz tabellify test" }]);
  // Create uses the whole token, also the part after the cursor.
  const text = "Mor tality";
  const token = P.tokenAt(text, 3);
  assert.equal(S.suggest(index, token, ctx()).at(-1).name, "Mor tality");
  // No index loaded yet: Create still works.
  assert.deepEqual(plain(S.suggest(null, tokenEnd("abc"), ctx())), [{ kind: "create", name: "abc" }]);
});

test("AC9: empty prefix gives [] unless browsing (↓), which lists the first tags", () => {
  const many = [];
  for (let k = 0; k < 80; k++) many.push(`t${String(k).padStart(2, "0")}`);
  const index = S.prepare(manual(...many));
  assert.deepEqual(plain(S.suggest(index, tokenEnd("G("), ctx())), []);
  assert.deepEqual(plain(S.suggest(index, null, ctx())), []);
  const browse = S.suggest(index, tokenEnd("G("), ctx(["t00"], [], { browse: true }));
  assert.equal(browse.length, 50);
  assert.equal(browse[0].name, "t01"); // codebook tag skipped
  assert.equal(browse.every((o) => o.kind === "tag"), true);
});

test("AC9: names like <b>x</b> are returned as plain strings", () => {
  const index = S.prepare(manual("<b>x</b>", "<img src=x onerror=alert(1)>"));
  const options = S.suggest(index, tokenEnd("<"), ctx());
  assert.deepEqual(names(options), ["<b>x</b>", "<img src=x onerror=alert(1)>", "<"]);
  for (const o of options) assert.equal(typeof o.name, "string");
});

test("AC9: 50 000 names: suggest returns at most 50 options, fast", () => {
  const many = [];
  for (let k = 0; k < 50000; k++) many.push({ tag: `name ${k} ${k % 7 === 0 ? "heat" : "cold"}`, type: k % 11 === 0 ? 1 : 0 });
  const index = S.prepare(many);
  const t0 = performance.now();
  const options = S.suggest(index, tokenEnd("hea"), ctx());
  const options2 = S.suggest(index, tokenEnd("zzz-nothing"), ctx());
  const ms = performance.now() - t0;
  assert.ok(options.length <= 50 && options.length > 0);
  assert.deepEqual(kinds(options2), ["create"]);
  assert.ok(ms < 250, `suggest took ${ms} ms`);
});

// ---- AC10: accept ----------------------------------------------------------------------

/** Accept at the cursor "|" in `marked`; returns the result. */
const acceptAt = (marked, option) => {
  const cursor = marked.indexOf("|");
  const text = marked.slice(0, cursor) + marked.slice(cursor + 1);
  return plain(S.accept(text, P.tokenAt(text, cursor), option));
};

test("AC10: a tag replaces only the token and keeps the rest; cursor after it", () => {
  assert.deepEqual(acceptAt("Outcome(mor|", { kind: "tag", name: "Mortality" }),
    { text: "Outcome(Mortality", cursor: 17 });
  assert.deepEqual(acceptAt("a,  Mo|rt  , b", { kind: "tag", name: "Mortality" }),
    { text: "a,  Mortality  , b", cursor: 13 });
  assert.deepEqual(acceptAt("G(x, hea|)", { kind: "tag", name: "Heat index" }),
    { text: "G(x, Heat index)", cursor: 15 });
});

test("AC10: names with , ( ) are quoted; a quoted token is replaced with its quotes", () => {
  assert.deepEqual(acceptAt("smi|", { kind: "tag", name: "Smith, J." }), { text: '"Smith, J."', cursor: 11 });
  assert.deepEqual(acceptAt('"a (|"', { kind: "tag", name: "a (b)" }), { text: '"a (b)"', cursor: 7 });
  assert.deepEqual(acceptAt('"plain|', { kind: "tag", name: "plain text" }), { text: "plain text", cursor: 10 });
});

test("AC10: group inserts Name( and create inserts the cleaned token", () => {
  assert.deepEqual(acceptAt("x, Exp|", { kind: "group", name: "Exposure" }), { text: "x, Exposure(", cursor: 12 });
  assert.deepEqual(acceptAt("  zz tabellify test|  ", { kind: "create", name: "zz tabellify test" }),
    { text: "  zz tabellify test  ", cursor: 19 });
  // The decomposed "é" the user typed is replaced by the cleaned (NFC) name.
  const typed = "G(Cafe\u0301";
  const token = P.tokenAt(typed, typed.length);
  assert.deepEqual(plain(S.accept(typed, token, { kind: "create", name: token.value })), { text: "G(Caf\u00e9", cursor: 6 });
});

test("AC10: the accepted text parses like text typed by hand", () => {
  const index = S.prepare(manual("Mortality", "Smith, J.", "a (b)"));
  const parsed = (text) => plain(P.parse(text));
  // Tag inside a group (the user then types ")").
  const t1 = S.accept("Outcome(mor", tokenEnd("Outcome(mor"), S.suggest(index, tokenEnd("Outcome(mor"), ctx())[0]);
  assert.deepEqual(parsed(`${t1.text})`), { ok: true, items: [{ kind: "group", name: "Outcome", tags: ["Mortality"] }] });
  // A name with a comma comes back quoted and parses to the exact name.
  const t2 = S.accept("smi", tokenEnd("smi"), S.suggest(index, tokenEnd("smi"), ctx())[0]);
  assert.deepEqual(parsed(t2.text), { ok: true, items: [{ kind: "tag", name: "Smith, J." }] });
  // Group, then a quoted tag with brackets, as the user would type it.
  const g = S.accept("Out", tokenEnd("Out"), { kind: "group", name: "Outcome" });
  const typed = `${g.text}"a (`;
  const t3 = S.accept(typed, tokenEnd(typed), { kind: "tag", name: "a (b)" });
  assert.deepEqual(parsed(`${t3.text})`), { ok: true, items: [{ kind: "group", name: "Outcome", tags: ["a (b)"] }] });
  // Create, then Enter.
  const c = S.accept("zz test ", tokenEnd("zz test "), { kind: "create", name: "zz test" });
  assert.deepEqual(parsed(c.text), { ok: true, items: [{ kind: "tag", name: "zz test" }] });
});
