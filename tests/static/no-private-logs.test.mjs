// SEC-011 [auto]: Debug Output lines never contain full file paths or raw error messages.
//
// Why: users paste Debug Output into public bug reports. A full path to the Zotero data
// folder usually contains the computer's account name, and an error's `message` often
// contains the path too. So every log call in src/ may name a FILE (e.g. "codebooks.json")
// and an error's NAME (e.g. "NotAllowedError"), never `something.path`, a `path` variable,
// `e.message`, or a whole error object turned into text (`${e}` gives "Name: message").
// The full path may still be shown on screen (status line), where only the user sees it.
//
// Scope: calls to Zotero.debug and to the plugin's log helpers (this.log, W.log, log(...)).
// Zotero.logError(e) is not a Debug Output line written by us; it is the platform's error
// report (accepted in ADR-0017 §5). Like the other static guards this is a heuristic on text,
// not a proof: a path copied into an innocently named variable first is not caught. Review is
// the second line.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../helpers/strip-comments.mjs";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Start of a log call: Zotero.debug(, this.log(, W.log(, TabellifyWorkspace.log(, log(. */
const LOG_CALL = /(?:\bZotero\s*\.\s*debug|(?<![\w$])(?:[\w$]+\s*\.\s*)?log)\s*\(/g;

/** What may not appear in a log call's arguments. */
export const FORBIDDEN = [
  { name: ".path", re: /\.\s*path\b/ },
  { name: ".message", re: /\.\s*message\b/ },
  // A `path` / `dir` / `file` variable interpolated or passed as an argument.
  { name: "path variable", re: /\$\{\s*(?:path|dir|file|filePath|fullPath)\s*\}|^\s*(?:path|dir|filePath|fullPath)\s*$/ },
  // A whole error object turned into text: "Name: message".
  { name: "error as text", re: /\$\{\s*(?:e|err|error|ex)\s*\}|String\(\s*(?:e|err|error|ex)\s*\)|^\s*(?:e|err|error|ex)\s*$/ },
];

/**
 * The argument text of every log call in `code` (comments already removed).
 * Parentheses are matched by counting; good enough for this code base (no log message has an
 * unbalanced parenthesis inside a string).
 * @param {string} code
 * @returns {Array<{ line: number, args: string }>}
 */
export function logCalls(code) {
  const out = [];
  for (const m of code.matchAll(LOG_CALL)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
    }
    out.push({ line: code.slice(0, m.index).split("\n").length, args: code.slice(start, i - 1) });
  }
  return out;
}

/**
 * @param {string} code  Text with comments already removed
 * @returns {Array<{ line: number, rule: string, text: string }>}
 */
export function findPrivateLogs(code) {
  const hits = [];
  for (const { line, args } of logCalls(code)) {
    // Skip the helpers' own definitions, e.g. `log(message) {` or `log: (message) =>`.
    if (/^\s*message\s*$/.test(args)) continue;
    for (const { name, re } of FORBIDDEN) {
      if (re.test(args)) hits.push({ line, rule: name, text: args.replace(/\s+/g, " ").trim() });
    }
  }
  return hits;
}

function listJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = join(dir, d.name);
    if (d.isDirectory()) return listJsFiles(full);
    return d.isFile() && /\.m?js$/.test(d.name) ? [full] : [];
  });
}

test("SEC-011: no log call in src/ includes a path or a raw error message", () => {
  const files = listJsFiles(srcDir);
  assert.ok(files.some((f) => f.endsWith("workspace.js")), "workspace.js not scanned (check is vacuous)");
  let calls = 0;
  const violations = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"), extname(file));
    calls += logCalls(code).length;
    const rel = relative(srcDir, file).split(sep).join("/");
    for (const hit of findPrivateLogs(code)) violations.push(`src/${rel}:${hit.line} [${hit.rule}] ${hit.text}`);
  }
  assert.ok(calls > 50, `only ${calls} log calls found (pattern broken?)`);
  assert.deepEqual(violations, [], `log calls with private data:\n${violations.join("\n")}`);
});

test("SEC-011: no `.message` of an error anywhere in src/ code (reasons are logged too)", () => {
  // The stores put a `reason` text into their results, and the workspace and reader section
  // log it. So an error's message must not be copied into any string at all.
  const violations = [];
  for (const file of listJsFiles(srcDir)) {
    const code = stripComments(readFileSync(file, "utf8"), extname(file));
    code.split("\n").forEach((text, i) => {
      if (/\.\s*message\b/.test(text)) violations.push(`src/${relative(srcDir, file)}:${i + 1} ${text.trim()}`);
    });
  }
  assert.deepEqual(violations, []);
});

test("SEC-011: self-test — private data in log calls is caught", () => {
  for (const code of [
    "this.log(`codebook: loaded ${result.path} (revision 1)`);",
    "W.log(`could not save ${result.v1Copy.path}`);",
    "Zotero.debug(`Tabellify: failed: ${e.message}`);",
    "this.log(`could not read: ${e?.name ?? \"\"} ${e?.message ?? e}`);",
    "this.log(`writing ${path}`);",
    "log(`error ${err}`);",
    "this.log(String(e));",
    "this.log(\n  `layout: loaded ${result.path} ` +\n  `(revision ${r})`,\n);",
  ]) {
    assert.ok(findPrivateLogs(code).length > 0, `not caught: ${code}`);
  }
});

test("SEC-011: self-test — safe log calls are not flagged", () => {
  for (const code of [
    "this.log(`codebook: loaded ${TabellifyCodebookStore.FILE_NAME} (revision ${rev})`);",
    "this.log(`export: CSV not written: write failed (${result.errorName})`);",
    "W.log(`saved tables: not saved (error: ${result.error?.name ?? \"Error\"})`);",
    "log(message) { Zotero.debug(`Tabellify: ${message}`); }",
    "this.log(`listing ${collections.length} collection(s)`);",
    "Zotero.logError(e);",
  ]) {
    assert.deepEqual(findPrivateLogs(code), [], `false positive on: ${code}`);
  }
});
