// Minimal ZIP reader for tests, using only Node built-ins (no `unzip` CLI, no npm package).
//
// An .xpi is a ZIP file. A ZIP file ends with an "end of central directory" (EOCD) record
// that points at the central directory: a table of contents with one record per entry.
// Each record points at the entry's local header, which is followed by the (usually
// DEFLATE-compressed) file data. Format reference: PKWARE APPNOTE.TXT, sections 4.3.7
// (local header), 4.3.12 (central directory header), 4.3.16 (EOCD).
//
// Not supported (not needed for our own build output): ZIP64, encryption, multi-disk.
// This file is a helper, not a test: its name does not match Node's `*.test.mjs` pattern.

import { inflateRawSync, crc32 } from "node:zlib";

const EOCD_SIG = 0x06054b50; // "PK\5\6"
const CEN_SIG = 0x02014b50; // "PK\1\2"
const LOC_SIG = 0x04034b50; // "PK\3\4"

/**
 * @typedef {object} ZipEntry
 * @property {string} name        Archive path ("/" separators; directories end with "/")
 * @property {number} method      0 = stored, 8 = deflate
 * @property {number} crc         CRC-32 stored in the central directory
 * @property {Buffer} data        Uncompressed contents (empty for directories)
 * @property {boolean} crcOk      True when crc32(data) matches `crc`
 */

/**
 * Parse a ZIP archive from a buffer.
 * @param {Buffer} buf
 * @returns {ZipEntry[]}
 */
export function readZip(buf) {
  // The EOCD is at least 22 bytes and may be followed by a comment of up to 65535 bytes,
  // so search backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file: end of central directory record not found");

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize > eocd) throw new Error("Central directory overlaps the EOCD record");

  /** @type {ZipEntry[]} */
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`Bad central directory signature at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (buf.readUInt32LE(localOffset) !== LOC_SIG) {
      throw new Error(`Bad local header signature for ${name}`);
    }
    const locNameLen = buf.readUInt16LE(localOffset + 26);
    const locExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + locNameLen + locExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`Unsupported compression method ${method} for ${name}`);
    if (data.length !== size) throw new Error(`Size mismatch for ${name}`);

    entries.push({ name, method, crc, data, crcOk: crc32(data) === crc });
  }
  return entries;
}
