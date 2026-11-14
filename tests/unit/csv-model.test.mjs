// Feature 008 AC12–AC14: unit tests for the pure CSV builder (src/content/csv-model.js).
//
// csv-model.js is a classic browser script (no import/export). Node runs it here in an
// empty node:vm sandbox (as in table-layout-model.test.mjs); its one global, `TabellifyCsv`,
// appears as a property of the sandbox. The sandbox has no Zotero, window, document,
// IOUtils, PathUtils or ChromeUtils, so loading it proves the model needs none of them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "content", "csv-model.js");
const sandbox = vm.createContext({});
vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
const C = sandbox.TabellifyCsv;

// Arrays made inside the sandbox have a different prototype; compare as plain JSON values.
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Deep-freeze test inputs: any attempt by the model to change them throws (strict mode). */
function frozen(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

const LABELS = frozen({ title: "Title", untitled: "(untitled)", k: "Tags used (k)", m: "Codebook tags (M)" });

/** The spec's example: Ungrouped: age | Exposure: Heat index, Temperature | Outcome: Hospitalization. */
function exampleView() {
  return frozen({
    counting: true,
    groups: [
      { id: "ungrouped", run: 0, name: "", tags: ["age"], ungrouped: true },
      { id: "g1", name: "Exposure", tags: ["Heat index", "Temperature"] },
      { id: "g2", name: "Outcome", tags: ["Hospitalization"] },
    ],
    papers: [
      { title: "Smith 2020", untitled: false, count: 2, total: 4, groups: [{ present: ["age"] }, { present: ["Temperature"] }] },
      { title: "Heat, humidity and health", untitled: false, count: 1, total: 4, groups: [{ present: ["Heat index"] }] },
      { title: '=HYPERLINK("https://example.org","x")', untitled: false, count: 0, total: 4, groups: [] },
      { title: "", untitled: true, count: 1, total: 4, groups: [{ present: ["Hospitalization"] }] },
    ],
  });
}

test("AC12: loads in an empty sandbox; constants", () => {
  assert.equal(typeof C, "object");
  assert.equal(C.BOM, "﻿");
  assert.equal(C.BOM.length, 1);
  assert.equal(C.EOL, "\r\n");
});

test("AC12–AC14: the spec's example produces exactly the documented file", () => {
  const { text, stats } = C.build(exampleView(), LABELS);
  assert.equal(
    text,
    "﻿,,Exposure,Exposure,Outcome,,\r\n" +
      "Title,age,Heat index,Temperature,Hospitalization,Tags used (k),Codebook tags (M)\r\n" +
      "Smith 2020,1,,1,,2,4\r\n" +
      '"Heat, humidity and health",,1,,,1,4\r\n' +
      '"\'=HYPERLINK(""https://example.org"",""x"")",,,,,0,4\r\n' +
      "(untitled),,,,1,1,4\r\n",
  );
  assert.deepEqual(plain(stats), { papers: 4, tagColumns: 4, groups: 2, headerRows: 2 });
});

test("AC12: two header rows when a real group has columns; group name over every column", () => {
  const rows = plain(C.rows(exampleView(), LABELS));
  assert.deepEqual(rows[0], ["", "", "Exposure", "Exposure", "Outcome", "", ""]);
  assert.deepEqual(rows[1], ["Title", "age", "Heat index", "Temperature", "Hospitalization", "Tags used (k)", "Codebook tags (M)"]);
});

test("AC12: one header row with only ungrouped tags, and with no tag columns", () => {
  const onlyUngrouped = frozen({
    counting: true,
    groups: [{ id: "ungrouped", run: 0, name: "", tags: ["a", "b"], ungrouped: true }],
    papers: [{ title: "P", untitled: false, count: 1, total: 2, groups: [{ present: ["b"] }] }],
  });
  assert.deepEqual(plain(C.rows(onlyUngrouped, LABELS)), [
    ["Title", "a", "b", "Tags used (k)", "Codebook tags (M)"],
    ["P", "", "1", "1", "2"],
  ]);
  assert.equal(C.build(onlyUngrouped, LABELS).stats.headerRows, 1);
  assert.equal(C.build(onlyUngrouped, LABELS).stats.groups, 0);

  const noTags = frozen({ counting: false, groups: [], papers: [{ title: "P", untitled: false, count: 0, total: 0, groups: [] }] });
  assert.deepEqual(plain(C.rows(noTags, LABELS)), [["Title", "Tags used (k)", "Codebook tags (M)"], ["P", "", ""]]);
  // A real group without columns does not make a second row.
  const emptyGroup = frozen({ counting: true, groups: [{ id: "g9", name: "Planned", tags: [] }], papers: [] });
  assert.equal(plain(C.rows(emptyGroup, LABELS)).length, 1);
});

test("AC12: several ungrouped runs stay blank; a real group named \"Ungrouped\" keeps its name", () => {
  const view = frozen({
    counting: true,
    groups: [
      { id: "ungrouped", run: 0, name: "", tags: ["a"], ungrouped: true },
      { id: "g1", name: "Ungrouped", tags: ["b"] },
      { id: "ungrouped", run: 1, name: "", tags: ["c", "d"], ungrouped: true },
    ],
    papers: [],
  });
  const rows = plain(C.rows(view, LABELS));
  assert.deepEqual(rows[0], ["", "", "Ungrouped", "", "", "", ""]);
  assert.deepEqual(rows[1], ["Title", "a", "b", "c", "d", "Tags used (k)", "Codebook tags (M)"]);
  // A run recognised by its id alone (no `ungrouped` flag) is blank too.
  const byId = frozen({ counting: true, groups: [{ id: "ungrouped", name: "x", tags: ["a"] }, { id: "g", name: "G", tags: ["b"] }], papers: [] });
  assert.deepEqual(plain(C.rows(byId, LABELS))[0], ["", "", "G", "", ""]);
});

test("AC12: never the text \"null\" or \"undefined\"", () => {
  const view = frozen({
    counting: true,
    groups: [{ id: "g1", name: null, tags: ["a"] }, { id: "g2", tags: ["b"] }],
    papers: [{ title: undefined, untitled: false, groups: [{}] }, { title: null, untitled: false, count: null, total: undefined }],
  });
  const text = C.build(view, frozen({})).text;
  assert.doesNotMatch(text, /null|undefined/);
  assert.doesNotMatch(C.build(null, null).text, /null|undefined/);
  assert.equal(C.build(null, null).text, "﻿,,\r\n");
});

test("AC13: paper rows follow view.papers exactly; 1 / empty from present; k and M as digits", () => {
  const view = exampleView();
  const rows = plain(C.rows(view, LABELS)).slice(2);
  assert.deepEqual(rows.map((r) => r[0]), ["Smith 2020", "Heat, humidity and health", '=HYPERLINK("https://example.org","x")', "(untitled)"]);
  assert.deepEqual(rows[0], ["Smith 2020", "1", "", "1", "", "2", "4"]);
  for (const r of rows) {
    for (const cell of r.slice(1, -2)) assert.ok(cell === "1" || cell === "", cell);
    assert.match(r[r.length - 2], /^\d+$/);
    assert.match(r[r.length - 1], /^\d+$/);
  }
  // Reversed input → reversed rows (the model never sorts).
  const reversed = frozen({ ...plain(view), papers: plain(view.papers).reverse() });
  assert.deepEqual(plain(C.rows(reversed, LABELS)).slice(2).map((r) => r[0]), rows.map((r) => r[0]).reverse());
});

test("AC13: empty k and M when counting is false; a paper with every tag; untitled label", () => {
  const view = frozen({ ...plain(exampleView()), counting: false });
  for (const r of plain(C.rows(view, LABELS)).slice(2)) assert.deepEqual(r.slice(-2), ["", ""]);
  const all = frozen({
    counting: true,
    groups: exampleView().groups,
    papers: [{ title: "All", untitled: false, count: 4, total: 4, groups: [{ present: ["age"] }, { present: ["Heat index", "Temperature"] }, { present: ["Hospitalization"] }] }],
  });
  assert.deepEqual(plain(C.rows(all, LABELS))[2], ["All", "1", "1", "1", "1", "4", "4"]);
  const untitled = frozen({ counting: true, groups: [], papers: [{ title: "ignored", untitled: true, count: 0, total: 0 }] });
  assert.equal(plain(C.rows(untitled, LABELS))[1][0], "(untitled)");
});

test("AC13: zero papers gives the header rows only; stats count", () => {
  const view = frozen({ ...plain(exampleView()), papers: [] });
  const { text, stats } = C.build(view, LABELS);
  assert.equal(text.split("\r\n").length - 1, 2);
  assert.deepEqual(plain(stats), { papers: 0, tagColumns: 4, groups: 2, headerRows: 2 });
});

test("AC13: inputs are not mutated (deep-frozen inputs build fine)", () => {
  const view = exampleView();
  const before = JSON.stringify(view);
  C.build(view, LABELS);
  assert.equal(JSON.stringify(view), before);
});

test("AC13: 2 000 papers × 200 tags builds without error", () => {
  const tags = Array.from({ length: 200 }, (_, i) => `tag ${i}`);
  const groups = [
    { id: "g1", name: "First", tags: tags.slice(0, 100) },
    { id: "ungrouped", run: 0, name: "", tags: tags.slice(100), ungrouped: true },
  ];
  const papers = Array.from({ length: 2000 }, (_, i) => ({
    title: `Paper ${i}`, untitled: false, count: 2, total: 200,
    groups: [{ present: [tags[i % 200]] }, { present: [tags[(i + 7) % 200]] }],
  }));
  const { text, stats } = C.build({ counting: true, groups, papers }, LABELS);
  assert.equal(stats.papers, 2000);
  assert.equal(stats.tagColumns, 200);
  assert.equal(text.split("\r\n").length - 1, 2002);
});

test("AC14: output starts with the BOM; every row ends with CRLF, the last included", () => {
  const { text } = C.build(exampleView(), LABELS);
  assert.equal(text[0], "﻿");
  assert.ok(text.endsWith("\r\n"));
  // No bare LF or CR outside the row ends.
  assert.equal(text.replace(/\r\n/g, "").search(/[\r\n]/), -1);
  assert.equal(C.toCsv([]), "﻿");
  assert.equal(C.toCsv([["a", "b"], ["c"]]), "﻿a,b\r\nc\r\n");
});

test("AC14: quoting for comma, quote, CR and LF; doubled quotes; no quotes otherwise", () => {
  assert.equal(C.field("plain text"), "plain text");
  assert.equal(C.field("a,b"), '"a,b"');
  assert.equal(C.field('say "hi"'), '"say ""hi"""');
  assert.equal(C.field("line\nbreak"), '"line\nbreak"');
  assert.equal(C.field("line\r\nbreak"), '"line\r\nbreak"');
  assert.equal(C.field("cr\ronly"), '"cr\ronly"');
  assert.equal(C.field(""), "");
  assert.equal(C.field(null), "");
  assert.equal(C.field(undefined), "");
});

test("AC14: formula guard for = + - @ tab CR LF and the full-width forms, also after spaces", () => {
  for (const start of ["=", "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠"]) {
    const text = `${start}1+1`;
    assert.equal(C.guardFormula(text), `'${text}`, JSON.stringify(start));
    const field = C.field(text);
    assert.ok(field.startsWith(`"'`) && field.endsWith('"'), `guarded field quoted: ${JSON.stringify(field)}`);
    // Leading spaces are kept after the apostrophe.
    assert.equal(C.guardFormula(`  ${text}`), `'  ${text}`);
  }
  assert.equal(C.field("=1+1"), "\"'=1+1\"");
  assert.equal(C.field("-minus"), "\"'-minus\"");
  assert.equal(C.field("@at"), "\"'@at\"");
  assert.equal(C.field("+plus"), "\"'+plus\"");
  assert.equal(C.field('=HYPERLINK("u","x")'), '"\'=HYPERLINK(""u"",""x"")"');
});

test("AC14: no guard for a=b, 1, a - b, empty text; <b> and emoji pass through", () => {
  for (const text of ["a=b", "1", "42", "a - b", "", "x@y", "<b>bold</b>", "Café \u{1F600}", "'quoted"]) {
    assert.equal(C.guardFormula(text), text);
    assert.equal(C.field(text), text);
  }
});

test("AC14: guard applies to header labels and group names in the file", () => {
  const view = frozen({ counting: true, groups: [{ id: "g", name: "=grp", tags: ["-tag"] }], papers: [{ title: "@t", untitled: false, count: 1, total: 1, groups: [{ present: ["-tag"] }] }] });
  const { text } = C.build(view, { title: "+T", untitled: "", k: "k", m: "m" });
  assert.equal(
    text,
    "﻿,\"'=grp\",,\r\n" + "\"'+T\",\"'-tag\",k,m\r\n" + "\"'@t\",1,1,1\r\n",
  );
});

test("AC14: safeFileBase removes reserved characters, controls, bidi and zero-width characters", () => {
  assert.equal(C.safeFileBase("F005 test"), "F005 test");
  assert.equal(C.safeFileBase('a/b\\c?d*e:f|g"h<i>j'), "abcdefghij");
  assert.equal(C.safeFileBase("a\tb\r\nc\u0000d\u007Fe f g"), "a b c d e f g");
  assert.equal(C.safeFileBase("abc‮vsc.exe"), "abcvsc.exe");
  assert.equal(C.safeFileBase("a​b‏c‪d⁦e⁩f"), "abcdef");
  assert.equal(C.safeFileBase("a     b"), "a b");
  assert.equal(C.safeFileBase("  ..hidden"), "hidden");
  assert.equal(C.safeFileBase("name. . "), "name");
  assert.equal(C.safeFileBase("...."), "");
  assert.equal(C.safeFileBase(""), "");
  assert.equal(C.safeFileBase(null), "");
  assert.equal(C.safeFileBase('/:*?"<>|'), "");
});

test("AC14: safeFileBase normalizes to NFC and cuts at 80 characters without splitting a pair", () => {
  // "e" + combining acute (NFD) becomes the single character é (NFC).
  assert.equal(C.safeFileBase("Témpérature"), "Témpérature");
  const long = "x".repeat(100);
  assert.equal(C.safeFileBase(long).length, 80);
  // 79 x's then emoji: the emoji (two UTF-16 units) is the 80th character and is kept whole.
  const emoji = "x".repeat(79) + "\u{1F600}" + "yyyy";
  assert.equal(C.safeFileBase(emoji), "x".repeat(79) + "\u{1F600}");
  // 80 emoji: 160 UTF-16 units, 80 characters, all whole.
  const emojis = "\u{1F600}".repeat(90);
  const cut = C.safeFileBase(emojis);
  assert.equal(Array.from(cut).length, 80);
  assert.doesNotMatch(cut, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, "no lone high surrogate");
  // A cut that ends in a space or dot is tidied.
  assert.equal(C.safeFileBase("x".repeat(79) + " yyy"), "x".repeat(79));
});

test("AC14: fileName pads the date and uses the fallback for an empty base", () => {
  assert.equal(C.fileName("F005 test", { year: 2026, month: 11, day: 13 }, "Tabellify table"), "F005 test 2026-11-13.csv");
  assert.equal(C.fileName("F005 test", { year: 2026, month: 1, day: 5 }, "Tabellify table"), "F005 test 2026-01-05.csv");
  assert.equal(C.fileName("", { year: 2026, month: 1, day: 5 }, "Tabellify table"), "Tabellify table 2026-01-05.csv");
  assert.equal(C.fileName("///", { year: 2026, month: 1, day: 5 }, "Tabellify table"), "Tabellify table 2026-01-05.csv");
  assert.equal(C.fileName("a:b", { year: 2026, month: 12, day: 31 }, "F"), "ab 2026-12-31.csv");
  assert.equal(C.fileName("", { year: 2026, month: 1, day: 5 }, ""), "2026-01-05.csv");
});
