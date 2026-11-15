#!/usr/bin/env node
// Build the installable plugin: zip the git-tracked CONTENTS of `src/` into
// `build/tabellify-<version>.xpi`, with the version read from `src/manifest.json`.
//
// An .xpi is just a ZIP file. Zotero expects `manifest.json` and `bootstrap.js` at the
// archive root, so paths inside the archive are relative to `src/` (no "src/" prefix).
//
// Why a hand-written ZIP writer instead of the `zip` CLI or an npm package?
// - Node has no built-in ZIP writer, but it has the two hard parts: DEFLATE compression
//   (`zlib.deflateRawSync`) and the CRC-32 checksum (`zlib.crc32`, Node >= 22.2).
// - The ZIP container around them is a short, well-documented format (PKWARE APPNOTE.TXT,
//   sections 4.3.7 local header, 4.3.12 central directory, 4.3.16 end record).
// - So: no new dependency (ADR-0003), the same result on macOS/Linux/Windows/CI (no `zip`
//   binary needed), and deterministic output (sorted entries, fixed timestamps), so the
//   same source always builds a byte-identical .xpi.
// Limits (fine for a plugin): no ZIP64, so < 65535 entries and < 4 GiB.
//
// Usage: npm run build

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { deflateRawSync, crc32 } from "node:zlib";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repoRoot, "src");
const buildDir = join(repoRoot, "build");

// Only these file types may ship in the .xpi (FU-SEC-008). Anything else under src/ (a
// stray .zip, a backup, a binary) makes the build fail instead of being shipped silently.
// tests/static/xpi.test.mjs checks the same list against the built archive.
const ALLOWED_EXTENSIONS = new Set([".js", ".mjs", ".css", ".svg", ".xhtml", ".ftl", ".json"]);
// Fixed DOS timestamp for every entry (2026-01-01 00:00:00) so builds are reproducible.
// DOS date: bits 15-9 year-1980, 8-5 month, 4-0 day. DOS time: 0 = midnight.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/**
 * List the files git tracks under src/ (FU-SEC-008), as archive paths relative to `srcDir`,
 * plus one entry per parent directory (ending with "/"), exactly like a folder walk would.
 *
 * Why git and not a folder walk: whatever happens to be lying in the working folder
 * (an untracked scratch file, an editor backup, a file a tool dropped there) must not end up
 * in the plugin users install. Only files that went through a commit, and so through review,
 * are shipped. File contents still come from the working folder, as before.
 *
 * `git ls-files -z` prints NUL-separated repository-relative paths with "/" separators on
 * every OS, and never quotes unusual characters when -z is used.
 * @returns {string[]}
 */
function listEntries() {
  const out = execFileSync("git", ["ls-files", "-z", "--", "src"], { cwd: repoRoot, encoding: "utf8" });
  const files = out.split("\0").filter((p) => p !== "").map((p) => {
    if (!p.startsWith("src/")) throw new Error(`git listed a path outside src/: ${p}`);
    return p.slice("src/".length);
  });
  /** @type {Set<string>} */
  const dirs = new Set();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`src/${file}: file type "${ext}" is not on the XPI allow-list`);
    }
    // Add every parent folder ("content/", "content/icons/"), as the ZIP had before.
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/") + "/");
  }
  return [...dirs, ...files];
}

/**
 * Build a complete ZIP archive in memory.
 * @param {string[]} entries Archive paths (directories end with "/")
 * @returns {Buffer}
 */
function buildZip(entries) {
  /** @type {Buffer[]} */
  const localParts = [];
  /** @type {Buffer[]} */
  const centralParts = [];
  let offset = 0;

  for (const name of entries) {
    const isDir = name.endsWith("/");
    const data = isDir ? Buffer.alloc(0) : readFileSync(join(srcDir, name));
    const compressed = isDir ? data : deflateRawSync(data, { level: 9 });
    // Store (method 0) directories; deflate (method 8) files.
    const method = isDir ? 0 : 8;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, "utf8");
    const flags = 0x0800; // bit 11: file name is UTF-8

    // Local file header (30 bytes + name), followed by the file data.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature "PK\3\4"
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localParts.push(local, nameBuf, compressed);

    // Central directory record (46 bytes + name): the archive's table of contents.
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // signature "PK\1\2"
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, spec 2.0
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    // External attributes: Unix mode in the high 16 bits (dir 0755, file 0644).
    central.writeUInt32LE(((isDir ? 0o040755 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42); // where this entry's local header starts
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);

  // End of central directory record (22 bytes).
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // signature "PK\5\6"
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16); // central directory offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDir, end]);
}

const manifest = JSON.parse(readFileSync(join(srcDir, "manifest.json"), "utf8"));
const version = manifest.version;
if (typeof version !== "string" || version === "") {
  throw new Error("src/manifest.json has no \"version\" string");
}

const entries = listEntries().sort();
if (entries.length > 0xffff) {
  throw new Error("Too many files for a non-ZIP64 archive");
}
for (const required of ["manifest.json", "bootstrap.js"]) {
  if (!entries.includes(required)) {
    throw new Error(`src/${required} is missing; Zotero needs it at the XPI root`);
  }
}

mkdirSync(buildDir, { recursive: true });
const outFile = join(buildDir, `tabellify-${version}.xpi`);
const zip = buildZip(entries);
writeFileSync(outFile, zip);

console.log(`Built ${relative(repoRoot, outFile)} (${entries.length} entries, ${zip.length} bytes)`);
