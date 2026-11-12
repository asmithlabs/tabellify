// AC6 [auto]: library-write guard (CLAUDE.md rule 8, ADR-0005).
//
// Fails if any file under src/ contains a call that could create, change, or delete Zotero
// library data (items, collections, attachments, annotations, tags, relations, DB rows), or
// write to disk (attachment files, the data directory) through IOUtils / Zotero.File.
//
// IMPORTANT: this is a HEURISTIC DENYLIST, NOT A PROOF.
// - It matches text patterns. It cannot see calls built dynamically (obj[name]()), calls
//   through aliases (const s = item.saveTx; s()), or writes hidden in code it doesn't know.
// - It may also flag harmless code (false positives), e.g. a non-Zotero object that happens
//   to have a `.save(` or `.removeItem(` method (such as `localStorage.removeItem`).
// - It scans raw file text INCLUDING comments, on purpose: a false positive in a comment is
//   cheap to fix, a missed write is not.
// Independent code review (AC6 "+ review") remains the second line of defence.
//
// Allowlist: a spec that authorizes a write adds a narrow entry here, citing the spec.
// Feature 001–003 authorize none. Feature 004 (docs/features/004-codebook.md, AC11;
// ADR-0012) authorizes exactly one: IOUtils writes in src/content/codebook-store.js, which
// saves Tabellify's own codebooks.json in <data dir>/tabellify/ (never the Zotero library).
//
// Pattern sources: Zotero's data-object API names (Zotero.DataObject save/erase family,
// Zotero.Item tag/field/collection/relation setters, Zotero.Collection item membership,
// Zotero.Items/Tags/Collections/Attachments/Annotations/Relations write helpers, Zotero.DB,
// Gecko IOUtils file writes, Zotero.File write helpers).
// Where a whole family is matched by prefix (e.g. `Zotero.Tags.remove…`), that is
// deliberate, so the guard does not depend on exact method names.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** @type {Array<{ name: string, re: RegExp }>} */
export const DENYLIST = [
  // Save / delete any data object (item, collection, search, tag-bearing object…)
  { name: ".save(", re: /\.save\s*\(/ },
  { name: ".saveTx(", re: /\.saveTx\s*\(/ },
  { name: ".erase(", re: /\.erase\s*\(/ },
  { name: ".eraseTx(", re: /\.eraseTx\s*\(/ },
  { name: ".deleted = (trash flag)", re: /\.deleted\s*=(?!=)/ },
  // Direct database access: ANY Zotero.DB method call (query, valueQueryAsync,
  // executeTransaction, …). Many are reads, but every direct DB call needs review.
  { name: "Zotero.DB.*(", re: /\bZotero\.DB\.\w+\s*\(/ },
  // File system writes (attachment files, the data directory). Reads (IOUtils.read*,
  // Zotero.File.getContents*) are not matched. makeDirectory creates folders on disk, so it
  // counts as a write too (added in Feature 004).
  { name: "IOUtils write", re: /\bIOUtils\.(?:write|remove|move|copy|setPermissions|makeDirectory)\w*\s*\(/ },
  {
    name: "Zotero.File write",
    re: /\bZotero\.File\.(?:putContents|putContentsAsync|removeIfExists|createDirectoryIfMissing|copyToUnique|rename)\w*\s*\(/,
  },
  // Tags on an item
  { name: ".addTag(", re: /\.addTag\s*\(/ },
  { name: ".removeTag(", re: /\.removeTag\s*\(/ },
  { name: ".setTags(", re: /\.setTags\s*\(/ },
  { name: ".replaceTag(", re: /\.replaceTag\s*\(/ },
  // Item fields, creators, notes
  { name: ".setField(", re: /\.setField\s*\(/ },
  { name: ".setCreator(s)(", re: /\.setCreators?\s*\(/ },
  { name: ".setNote(", re: /\.setNote\s*\(/ },
  // Collection membership
  { name: ".addToCollection(", re: /\.addToCollection\s*\(/ },
  { name: ".removeFromCollection(", re: /\.removeFromCollection\s*\(/ },
  { name: ".setCollections(", re: /\.setCollections\s*\(/ },
  { name: ".addItem(s)( (collection)", re: /\.addItems?\s*\(/ },
  { name: ".removeItem(s)( (collection)", re: /\.removeItems?\s*\(/ },
  // Relations
  { name: ".addRelatedItem(", re: /\.addRelatedItem\s*\(/ },
  { name: ".removeRelatedItem(", re: /\.removeRelatedItem\s*\(/ },
  { name: ".addRelation(", re: /\.addRelation\s*\(/ },
  { name: ".removeRelation(", re: /\.removeRelation\s*\(/ },
  { name: ".setRelations(", re: /\.setRelations\s*\(/ },
  { name: "Zotero.Relations write", re: /Zotero\.Relations\.(?:erase|update|add|remove|delete|set|purge|copy)\w*\s*\(/ },
  // Library-wide helpers
  { name: "Zotero.Items write", re: /Zotero\.Items\.(?:erase|trash|merge|move|copy|delete|remove|add|set|empty)\w*\s*\(/ },
  { name: "Zotero.Tags write", re: /Zotero\.Tags\.(?:rename|remove|set|erase|purge|delete|add)\w*\s*\(/ },
  { name: "Zotero.Collections write", re: /Zotero\.Collections\.(?:erase|delete|remove|create|add|set|move)\w*\s*\(/ },
  { name: "Zotero.Attachments write", re: /Zotero\.Attachments\.(?:import|link|create|add|save|remove|delete|erase|rename|fix|convert|move|set|download)\w*\s*\(/ },
  { name: "Zotero.Annotations write", re: /Zotero\.Annotations\.(?:save|create|add|set|erase|delete|remove|split|merge)\w*\s*\(/ },
  { name: "Zotero.Searches write", re: /Zotero\.Searches\.(?:erase|delete|remove)\w*\s*\(/ },
];

/**
 * Spec-authorized exceptions: { file: "relative/path", pattern: DENYLIST name, spec: "docs/features/…" }.
 * @type {Array<{ file: string, pattern: string, spec: string }>}
 */
const ALLOWLIST = [
  // F004: the codebook store writes codebooks.json (+ .tmp/.bak) and creates its folder.
  { file: "content/codebook-store.js", pattern: "IOUtils write", spec: "docs/features/004-codebook.md" },
];

/**
 * Find denylisted write calls in a piece of text.
 * @param {string} text
 * @returns {Array<{ line: number, pattern: string, text: string }>}
 */
export function findWrites(text) {
  const hits = [];
  text.split("\n").forEach((lineText, i) => {
    for (const { name, re } of DENYLIST) {
      if (re.test(lineText)) hits.push({ line: i + 1, pattern: name, text: lineText.trim() });
    }
  });
  return hits;
}

/** Every file under src/ (all types: .js, .xhtml, .ftl, …), as absolute paths. */
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = join(dir, d.name);
    return d.isDirectory() ? listFiles(full) : d.isFile() ? [full] : [];
  });
}

test("AC6: src/ contains no Zotero library-write calls (heuristic denylist)", () => {
  const files = listFiles(srcDir);
  assert.ok(files.length > 0, "no files found under src/");
  const violations = [];
  for (const file of files) {
    const rel = relative(srcDir, file).split(sep).join("/");
    for (const hit of findWrites(readFileSync(file, "utf8"))) {
      const allowed = ALLOWLIST.some((a) => a.file === rel && a.pattern === hit.pattern);
      if (!allowed) violations.push(`src/${rel}:${hit.line} [${hit.pattern}] ${hit.text}`);
    }
  }
  assert.deepEqual(violations, [], `library-write calls found:\n${violations.join("\n")}`);
});

test("F004 AC11: the allow-list has exactly the one F004 entry, and it is really needed", () => {
  assert.deepEqual(ALLOWLIST, [
    { file: "content/codebook-store.js", pattern: "IOUtils write", spec: "docs/features/004-codebook.md" },
  ]);
  // A stale entry (file no longer writes) would silently allow a future write: fail instead.
  for (const a of ALLOWLIST) {
    const hits = findWrites(readFileSync(join(srcDir, a.file), "utf8")).filter((h) => h.pattern === a.pattern);
    assert.ok(hits.length > 0, `allow-list entry ${a.file} [${a.pattern}] matches nothing`);
  }
  // Only the authorized pattern is allowed there: no other write kind in the store.
  const store = findWrites(readFileSync(join(srcDir, "content/codebook-store.js"), "utf8"));
  assert.deepEqual(store.filter((h) => h.pattern !== "IOUtils write"), []);
});

test("AC6: guard self-test — every denylist pattern catches a known write call", () => {
  // One positive fixture per pattern, so a broken regex can't silently pass the guard.
  const fixtures = {
    ".save(": "await item.save();",
    ".saveTx(": "await item.saveTx();",
    ".erase(": "await collection.erase();",
    ".eraseTx(": "await item.eraseTx();",
    ".deleted = (trash flag)": "item.deleted = true;",
    "Zotero.DB.*(": 'await Zotero.DB.queryAsync("DELETE FROM items");',
    "IOUtils write": 'await IOUtils.writeUTF8(path, "x");',
    "Zotero.File write": 'await Zotero.File.putContentsAsync(path, "x");',
    ".addTag(": 'item.addTag("Methods");',
    ".removeTag(": 'item.removeTag("Methods");',
    ".setTags(": "item.setTags([]);",
    ".replaceTag(": 'item.replaceTag("a", "b");',
    ".setField(": 'item.setField("title", "x");',
    ".setCreator(s)(": "item.setCreators([]);",
    ".setNote(": 'note.setNote("<p>x</p>");',
    ".addToCollection(": "item.addToCollection(key);",
    ".removeFromCollection(": "item.removeFromCollection(key);",
    ".setCollections(": "item.setCollections([]);",
    ".addItem(s)( (collection)": "await collection.addItems([1, 2]);",
    ".removeItem(s)( (collection)": "await collection.removeItem(1);",
    ".addRelatedItem(": "item.addRelatedItem(other);",
    ".removeRelatedItem(": "item.removeRelatedItem(other);",
    ".addRelation(": 'item.addRelation("dc:relation", uri);',
    ".removeRelation(": 'item.removeRelation("dc:relation", uri);',
    ".setRelations(": "item.setRelations({});",
    "Zotero.Relations write": "await Zotero.Relations.eraseByObject(item);",
    "Zotero.Items write": "await Zotero.Items.erase([1]); await Zotero.Items.trashTx([1]);",
    "Zotero.Tags write": 'await Zotero.Tags.rename(1, "a", "b");',
    "Zotero.Collections write": "await Zotero.Collections.erase(1);",
    "Zotero.Attachments write": "await Zotero.Attachments.importFromFile({ file });",
    "Zotero.Annotations write": "await Zotero.Annotations.saveFromJSON(att, json);",
    "Zotero.Searches write": "await Zotero.Searches.erase(1);",
  };
  assert.deepEqual(
    Object.keys(fixtures).sort(),
    DENYLIST.map((d) => d.name).sort(),
    "every denylist pattern needs exactly one fixture",
  );
  for (const [name, code] of Object.entries(fixtures)) {
    const hits = findWrites(code).map((h) => h.pattern);
    assert.ok(hits.includes(name), `pattern "${name}" did not catch: ${code}`);
  }
  // The specific examples named in the task must each be caught.
  for (const code of [
    'Zotero.Tags.removeFromLibrary(1, [2]);',
    "Zotero.Items.trashTx([1]);",
    "Zotero.Items.erase([1]);",
    'Zotero.DB.query("UPDATE items SET x=1");',
    // Any direct DB call, including reads, is flagged for review.
    "await Zotero.DB.executeTransaction(async () => {});",
    'await Zotero.DB.valueQueryAsync("SELECT 1");',
    'await Zotero.DB.rowQueryAsync("SELECT 1");',
    'await Zotero.DB.columnQueryAsync("SELECT 1");',
    // File writes: every IOUtils / Zotero.File family member named in the denylist.
    "await IOUtils.write(path, bytes);",
    'await IOUtils.writeJSON(path, {});',
    "await IOUtils.remove(path);",
    "await IOUtils.move(a, b);",
    "await IOUtils.copy(a, b);",
    "await IOUtils.setPermissions(path, 0o644);",
    "await IOUtils.makeDirectory(dir);",
    'Zotero.File.putContents(file, "x");',
    "await Zotero.File.removeIfExists(path);",
    "await Zotero.File.createDirectoryIfMissing(path);",
    "await Zotero.File.copyToUnique(a, b);",
    'await Zotero.File.rename(path, "new.pdf");',
  ]) {
    assert.ok(findWrites(code).length > 0, `not caught: ${code}`);
  }
});

test("AC6: guard self-test — a source file containing a write call fails the scan", () => {
  const fixtureFile = [
    '"use strict";',
    "var Bad = {",
    "  async run(item) {",
    "    item.setField('title', 'x');",
    "    await item.saveTx();",
    "  },",
    "};",
  ].join("\n");
  const hits = findWrites(fixtureFile);
  assert.deepEqual(
    hits.map((h) => [h.line, h.pattern]),
    [[4, ".setField("], [5, ".saveTx("]],
  );
});

test("AC6: guard self-test — read-only and look-alike code is not flagged", () => {
  for (const code of [
    'Zotero.debug("Tabellify: saved nothing");',
    "if (item.deleted == true) {}",
    "if (item.deleted === true) {}",
    "const ids = await Zotero.Items.getAsync([1]);",
    'const tags = Zotero.Tags.getID("Methods");',
    'const title = item.getField("title");',
    "const tags = item.getTags();",
    "Zotero.MenuManager.registerMenu({});",
    "window.document.querySelector('link')?.remove();",
    // File reads and look-alike names are not writes.
    "const text = await IOUtils.readUTF8(path);",
    "const exists = await IOUtils.exists(path);",
    "const text = await Zotero.File.getContentsAsync(path);",
    "const db = Zotero.DBConnection;",
    "myIOUtils.writeLog(x);",
  ]) {
    assert.deepEqual(findWrites(code), [], `false positive on: ${code}`);
  }
});
