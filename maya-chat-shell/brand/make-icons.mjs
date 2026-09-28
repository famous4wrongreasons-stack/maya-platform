#!/usr/bin/env node
// MAYA chat shell — the PWA icon set, GENERATED FROM A DESCRIPTION rather than imported as an asset.
//
//   node brand/make-icons.mjs            write brand/icons/*.png and print each sha256
//   node brand/make-icons.mjs --check    regenerate in memory; exit 1 if any committed byte differs
//
// Why a generator and not four .png files somebody exported once: the mark is a PLACEHOLDER the owner
// may replace, and a placeholder nobody can re-derive is a binary of unknown provenance. Everything
// below is arithmetic — no dependency, no network, no font, no drawing library, no clock, no random
// source — so the same description yields the same bytes on every machine and every run.
//
// It also writes the PNG itself rather than calling zlib. `zlib.deflateSync` is deterministic only
// for a fixed zlib build, and this repository is driven from both Node 22 and Node 24; a deflate
// whose bytes could move with the runtime would make `node build.mjs --check` fail for a reason that
// has nothing to do with the shell. So the DEFLATE stream here is hand-written with FIXED Huffman
// codes and distance-1 run matches — a stream defined entirely by RFC 1951 and this file. zlib is
// used in exactly one place, VERIFICATION: every stream is inflated back and compared to its input,
// so a bug in the encoder cannot reach a committed file.
//
// The mark: a full-bleed field in the stylesheet's light `--accent`, carrying an `M` in the light
// `--bg`. Four straight strokes, anti-aliased by 4x4 coverage into a 16-step palette ramp between
// the two token colours — which is also why the files are small. The maskable variant is the same
// mark at a smaller scale so the whole glyph stays inside the 80 % safe area Android may crop to.
//
// The two colours are the stylesheet tokens (entry/styles.css `:root`): change them there and here
// together, or the icons stop matching the shell they belong to.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'icons');

/** The two stylesheet tokens the mark is built from: light `--accent` field, light `--bg` glyph. */
export const FIELD = [0x1d, 0x4e, 0xd8];
export const MARK = [0xf6, 0xf5, 0xf2];

/** The set. `glyph` is the side of the mark's box as a fraction of the icon, centred. */
export const ICONS = [
  { file: 'maya-192.png', size: 192, glyph: 0.56 },
  { file: 'maya-512.png', size: 512, glyph: 0.56 },
  { file: 'maya-512-maskable.png', size: 512, glyph: 0.4 },
  { file: 'maya-apple-180.png', size: 180, glyph: 0.56 },
];

// ── the mark ─────────────────────────────────────────────────────────────────────────────────────
// Unit box, y down. Two verticals full height; two diagonals from the top corners meeting at depth
// D. Each stroke is a convex quadrilateral and the glyph is their union, so no outline arithmetic is
// needed — a sample is ink when it is inside any one of them.

const T = 0.22; // stroke width, fraction of the box
const D = 0.66; // depth the diagonals meet at

const QUADS = [
  [[0, 0], [T, 0], [T, 1], [0, 1]],
  [[1 - T, 0], [1, 0], [1, 1], [1 - T, 1]],
  [[0, 0], [T, 0], [0.5 + T / 2, D], [0.5 - T / 2, D]],
  [[1, 0], [1 - T, 0], [0.5 - T / 2, D], [0.5 + T / 2, D]],
];

/** Inside a convex quad: every edge cross-product has the same sign (an edge hit counts as inside). */
function insideQuad(q, px, py) {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = q[i];
    const [bx, by] = q[(i + 1) % 4];
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (c > 0) pos += 1;
    else if (c < 0) neg += 1;
  }
  return pos === 0 || neg === 0;
}

const SUB = 4; // 4x4 coverage samples per pixel -> 17 levels, quantised to the 16-step ramp

/** One icon's palette indices, row-major, one byte per pixel (packed later). */
export function renderIndices(size, glyphFraction) {
  const side = size * glyphFraction;
  const origin = (size - side) / 2;
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const gx = (x + (sx + 0.5) / SUB - origin) / side;
          const gy = (y + (sy + 0.5) / SUB - origin) / side;
          if (QUADS.some((q) => insideQuad(q, gx, gy))) hits += 1;
        }
      }
      out[y * size + x] = Math.round((hits / (SUB * SUB)) * 15);
    }
  }
  return out;
}

/** 16 entries interpolated from the field colour (0) to the mark colour (15), rounded half-up. */
export function ramp() {
  const bytes = Buffer.alloc(48);
  for (let i = 0; i < 16; i += 1)
    for (let c = 0; c < 3; c += 1)
      bytes[i * 3 + c] = Math.round(FIELD[c] + ((MARK[c] - FIELD[c]) * i) / 15);
  return bytes;
}

// ── DEFLATE, fixed Huffman (RFC 1951 §3.2.6) ─────────────────────────────────────────────────────

class Bits {
  constructor() {
    this.out = [];
    this.cur = 0;
    this.n = 0;
  }

  bit(b) {
    this.cur |= (b & 1) << this.n;
    this.n += 1;
    if (this.n === 8) {
      this.out.push(this.cur);
      this.cur = 0;
      this.n = 0;
    }
  }

  /** Extra bits and block headers: least significant bit first. */
  lsb(value, count) {
    for (let i = 0; i < count; i += 1) this.bit(value >>> i);
  }

  /** A Huffman code: most significant bit first. */
  code(value, count) {
    for (let i = count - 1; i >= 0; i -= 1) this.bit(value >>> i);
  }

  flush() {
    if (this.n > 0) {
      this.out.push(this.cur);
      this.cur = 0;
      this.n = 0;
    }
    return Buffer.from(this.out);
  }
}

/** The fixed literal/length alphabet (RFC 1951 table in §3.2.6). */
function fixedLit(sym) {
  if (sym <= 143) return [0x30 + sym, 8];
  if (sym <= 255) return [0x190 + (sym - 144), 9];
  if (sym <= 279) return [sym - 256, 7];
  return [0xc0 + (sym - 280), 8];
}

/** base length, length symbol, extra bits. */
const LENGTHS = [
  [3, 257, 0], [4, 258, 0], [5, 259, 0], [6, 260, 0], [7, 261, 0], [8, 262, 0], [9, 263, 0], [10, 264, 0],
  [11, 265, 1], [13, 266, 1], [15, 267, 1], [17, 268, 1],
  [19, 269, 2], [23, 270, 2], [27, 271, 2], [31, 272, 2],
  [35, 273, 3], [43, 274, 3], [51, 275, 3], [59, 276, 3],
  [67, 277, 4], [83, 278, 4], [99, 279, 4], [115, 280, 4],
  [131, 281, 5], [163, 282, 5], [195, 283, 5], [227, 284, 5],
  [258, 285, 0],
];

/**
 * One fixed-Huffman block over `data`, matching runs at distance 1 only.
 *
 * A filtered scanline of a flat icon is mostly runs, so distance 1 is where nearly all of the
 * compression is; anything cleverer would be a search whose result would have to be pinned as well.
 */
export function deflateFixed(data) {
  const b = new Bits();
  b.lsb(1, 1); // BFINAL
  b.lsb(1, 2); // BTYPE = 01, fixed Huffman
  const literal = (byte) => {
    const [c, n] = fixedLit(byte);
    b.code(c, n);
  };
  const match = (len) => {
    let row = LENGTHS[0];
    for (const r of LENGTHS) if (r[0] <= len) row = r;
    const [base, sym, extra] = row;
    const [c, n] = fixedLit(sym);
    b.code(c, n);
    if (extra > 0) b.lsb(len - base, extra);
    b.code(0, 5); // distance code 0 = distance 1, no extra bits
  };
  let i = 0;
  while (i < data.length) {
    let run = 1;
    while (i + run < data.length && data[i + run] === data[i]) run += 1;
    literal(data[i]);
    i += 1;
    let rest = run - 1;
    while (rest >= 3) {
      const len = rest > 258 && rest - 258 < 3 ? rest - 3 : Math.min(rest, 258);
      match(len);
      rest -= len;
      i += len;
    }
    while (rest > 0) {
      literal(data[i]);
      i += 1;
      rest -= 1;
    }
  }
  const [end, endBits] = fixedLit(256);
  b.code(end, endBits);
  return b.flush();
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** A zlib stream (RFC 1950): CM 8, CINFO 7, no dictionary, level bits 0 — `78 01` checks out mod 31. */
export function zlibStream(data) {
  const body = deflateFixed(data);
  const out = Buffer.alloc(2 + body.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  body.copy(out, 2);
  out.writeUInt32BE(adler32(data), 2 + body.length);
  return out;
}

// ── PNG ──────────────────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, 'latin1');
  payload.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}

/** Indexed PNG, bit depth 4, filter None on every row: the whole file is determined by its inputs. */
export function pngIndexed4(size, palette, indices) {
  const rowBytes = Math.ceil(size / 2);
  const raw = Buffer.alloc(size * (1 + rowBytes));
  for (let y = 0; y < size; y += 1) {
    const at = y * (1 + rowBytes);
    raw[at] = 0; // filter: None
    for (let x = 0; x < size; x += 1) {
      const v = indices[y * size + x] & 0x0f;
      const off = at + 1 + (x >> 1);
      raw[off] |= x % 2 === 0 ? v << 4 : v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 4; // bit depth
  ihdr[9] = 3; // colour type: indexed
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  const stream = zlibStream(raw);
  const inflated = zlib.inflateSync(stream); // VERIFY ONLY — never a source of committed bytes
  if (Buffer.compare(inflated, raw) !== 0) throw new Error(`the ${size}px stream did not inflate back to its input`);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', palette),
    chunk('IDAT', stream),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function buildIcon(spec) {
  return pngIndexed4(spec.size, ramp(), renderIndices(spec.size, spec.glyph));
}

export function buildAll() {
  return ICONS.map((spec) => ({ ...spec, bytes: buildIcon(spec) }));
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────

function main(argv) {
  const check = argv.includes('--check');
  const built = buildAll();
  let bad = 0;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const icon of built) {
    const abs = path.join(OUT_DIR, icon.file);
    const digest = createHash('sha256').update(icon.bytes).digest('hex');
    if (check) {
      const have = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
      const same = have !== null && Buffer.compare(have, icon.bytes) === 0;
      if (!same) bad += 1;
      console.log(`${same ? 'PASS' : 'FAIL'}  ${icon.file}  ${icon.size}x${icon.size}  ${digest}  ${icon.bytes.length} bytes${have === null ? '  (absent)' : ''}`);
    } else {
      fs.writeFileSync(abs, icon.bytes);
      console.log(`wrote ${icon.file}  ${icon.size}x${icon.size}  ${digest}  ${icon.bytes.length} bytes`);
    }
  }
  if (check) console.log(bad === 0 ? 'icons: PASS (committed bytes equal a fresh generation)' : `icons: FAIL (${bad} differ)`);
  return bad === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
