// AC1 [auto]: the built .xpi is installable in shape — `manifest.json` and `bootstrap.js` at
// the archive root, and the manifest fields Zotero checks are valid (ADR-0002, ADR-0008).
//
// The test runs the real build script (`node scripts/build-xpi.mjs`, same as `npm run
// build`). Its output goes to `build/tabellify-<version>.xpi`, which is .gitignored and is
// the normal build artifact, so there is nothing temporary to clean up.
//
// The manual half of AC1 (actually installing the XPI in Zotero) is in
// docs/testing/manual/001-plugin-shell.md.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readZip } from "../helpers/zip.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcDir = join(repoRoot, "src");
const srcManifest = JSON.parse(readFileSync(join(srcDir, "manifest.json"), "utf8"));
const xpiPath = join(repoRoot, "build", `tabellify-${srcManifest.version}.xpi`);

/** @type {Buffer} */
let xpi;
/** @type {import("../helpers/zip.mjs").ZipEntry[]} */
let entries;
/** @type {Map<string, Buffer>} */
let files;

/** Build once, read the archive once; every test below inspects the same result. */
function build() {
  execFileSync(process.execPath, [join(repoRoot, "scripts", "build-xpi.mjs")], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  return readFileSync(xpiPath);
}

before(() => {
  xpi = build();
  entries = readZip(xpi);
  files = new Map(entries.filter((e) => !e.name.endsWith("/")).map((e) => [e.name, e.data]));
});

/** All regular files under src/, as archive paths ("/" separators), skipping OS clutter. */
function listSrcFiles(dir = srcDir) {
  /** @type {string[]} */
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === ".DS_Store" || d.name === "Thumbs.db") continue;
    const full = join(dir, d.name);
    if (d.isDirectory()) out.push(...listSrcFiles(full));
    else if (d.isFile()) out.push(relative(srcDir, full).split(sep).join("/"));
  }
  return out;
}

test("AC1: XPI has manifest.json and bootstrap.js at the archive root", () => {
  assert.ok(files.has("manifest.json"), "manifest.json missing at XPI root");
  assert.ok(files.has("bootstrap.js"), "bootstrap.js missing at XPI root");
  // Guard against zipping the `src` folder itself instead of its contents.
  assert.ok(
    !entries.some((e) => e.name.startsWith("src/")),
    "archive paths must not start with src/",
  );
});

test("AC1: XPI entries are intact (CRC-32 matches) and use only stored/deflate", () => {
  for (const e of entries) {
    assert.ok(e.crcOk, `CRC mismatch for ${e.name}`);
    assert.ok(e.method === 0 || e.method === 8, `${e.name}: method ${e.method}`);
  }
});

test("AC1: XPI contains every src/ file byte-for-byte, and nothing else", () => {
  const expected = listSrcFiles().sort();
  assert.deepEqual([...files.keys()].sort(), expected);
  for (const name of expected) {
    assert.ok(
      files.get(name).equals(readFileSync(join(srcDir, ...name.split("/")))),
      `${name} in XPI differs from src/${name}`,
    );
  }
  assert.ok(
    !entries.some((e) => /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(e.name)),
    "OS clutter files must not ship",
  );
});

test("AC1: manifest fields are valid (id, version, manifest_version, Zotero 10.0 range)", () => {
  const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));
  assert.equal(manifest.manifest_version, 2);
  assert.equal(typeof manifest.name, "string");
  assert.ok(manifest.name.length > 0, "name must be non-empty");
  assert.equal(typeof manifest.version, "string");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "version must be MAJOR.MINOR.PATCH");
  const z = manifest.applications?.zotero;
  assert.ok(z, "applications.zotero is required for Zotero to install the plugin");
  assert.equal(z.id, "tabellify@asmithlabs.com");
  assert.equal(z.strict_min_version, "10.0");
  assert.equal(z.strict_max_version, "10.0.*");
});

test("AC1: versions agree (XPI file name, manifest, package.json)", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));
  assert.equal(manifest.version, srcManifest.version);
  assert.equal(pkg.version, manifest.version, "package.json and manifest.json versions differ");
  assert.ok(xpiPath.endsWith(`tabellify-${manifest.version}.xpi`));
});

test("AC1: build is reproducible (two builds are byte-identical)", () => {
  assert.ok(build().equals(xpi), "second build differs from the first");
});
