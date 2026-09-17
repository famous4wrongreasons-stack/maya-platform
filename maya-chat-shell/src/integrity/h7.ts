// K5 — H7, the check a rendering pipeline makes before it draws (WC §1.9 H1, H7; R-5, D1).
//
// Pure: ES intrinsics only. No clock (the caller passes `nowIso`), no entropy, no host crypto and
// no TextEncoder, so SHA-256 and UTF-8 are written out here. Imported by `shell/` only: it runs on
// the FULL ingested envelope, before `shell/view.ts` builds the token-free view, and the drawing
// module receives the verdict and never the hash inputs (L5, SH-07).
//
// What it verifies is exactly H7's two things and nothing keyed:
//   (i)  sha256(canonicalJson(H1 terms)) === integrity.body_hash
//   (ii) lifecycle.expires_at has not passed
// The seal is a keyed HMAC and is verified server-side only (H4), so no key is anywhere near here.
//
// Two readings this module implements, both reversible defaults of the shell plan (§3.2):
//   R7-E5  stripIntentToken removes the `intent_token` member and NOTHING else, so a class-'i'
//          target's ref stays a hash term.
//   R7-E6  the canonicaliser is a byte-for-byte port of the backend's, including its default-locale
//          key sort; a locale whose collation differs can disagree with the minter, and the outcome
//          of that disagreement is the safe one (frozen prose, never an error surface).

import type { WidgetEnvelope, WidgetIntent } from '../contract.ts';

/** Structurally identical to `renderer/nodes.ts` IntegrityVerdict, which this layer may not import. */
export type H7Verdict = 'valid' | 'body_mismatch' | 'expired';

// ── UTF-8 ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The UTF-8 bytes of a string. A lone surrogate becomes U+FFFD, which is what the backend's
 * `createHash().update(string)` does, so the two hash the same bytes for every JS string.
 */
export const utf8 = (text: string): Uint8Array => {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i += 1;
      } else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(out);
};

// ── SHA-256 (FIPS 180-4) ───────────────────────────────────────────────────────────────────────

const ROUND = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** Lowercase hex SHA-256 of raw bytes. */
export const sha256Bytes = (bytes: Uint8Array): string => {
  const blocks = Math.ceil((bytes.length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  // The message length in bits, as a 64-bit big-endian integer split into two 32-bit words.
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85 | 0;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a | 0;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c | 0;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Int32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getInt32(offset + t * 4);
    for (let t = 16; t < 64; t += 1) {
      const x = w[t - 15] ?? 0;
      const y = w[t - 2] ?? 0;
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = (s1 + (w[t - 7] ?? 0) + s0 + (w[t - 16] ?? 0)) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let t = 0; t < 64; t += 1) {
      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const sigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t1 = (h + sigma1 + ch + (ROUND[t] ?? 0) + (w[t] ?? 0)) | 0;
      const t2 = (sigma0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
};

/** Lowercase hex SHA-256 of a string's UTF-8 bytes (what `createHash('sha256').update(s)` hashes). */
export const sha256Hex = (text: string): string => sha256Bytes(utf8(text));

// ── the canonicaliser ──────────────────────────────────────────────────────────────────────────

/**
 * A port of the backend's `normalizeJson` (action-engine.identity.ts), step for step: null, boolean
 * and string pass; a non-finite number refuses; -0 becomes 0; arrays map; object keys are sorted
 * with the DEFAULT-LOCALE `localeCompare` and inserted into a fresh object in that order; an
 * `undefined` member is skipped; anything else refuses. Integer-like keys therefore serialise in
 * the engine's index order, exactly as they do on the minter.
 */
const normalize = (value: unknown): unknown => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite numbers are not canonical JSON');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const entries: [string, unknown][] = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, item] of entries) {
      if (item === undefined) continue;
      result[key] = normalize(item);
    }
    return result;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
};

/** The same bytes the backend's canonical JSON function returns for the same value. */
export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value));

// ── H1: the ten terms ──────────────────────────────────────────────────────────────────────────

/** An intent with its `intent_token` member removed — and only that member (R7-E5, SH-07). */
export type IntentWithoutToken = Omit<WidgetIntent, 'intent_token'>;

export const stripIntentToken = (intent: WidgetIntent): IntentWithoutToken => {
  const { intent_token: _removed, ...rest } = intent;
  return rest;
};

/**
 * The closed term list of H1. `cell_index_digest` is read from `integrity`; `render` contributes its
 * fitted tier ALONE, never the whole receipt (withheld/reduction pointers are appended after sealing).
 */
export const bodyHashTerms = (envelope: WidgetEnvelope) => ({
  contract: envelope.contract,
  kind: envelope.kind,
  body_version: envelope.body_version,
  body: envelope.body,
  cell_index_digest: envelope.integrity.cell_index_digest,
  provenance: envelope.provenance,
  limitations: envelope.limitations,
  intents: envelope.intents.map((intent) => stripIntentToken(intent)),
  presentation: envelope.presentation,
  render_tier: envelope.render.render_tier,
});

/** sha256(canonicalJson(H1 terms)), lowercase hex. Throws on a value the canonicaliser refuses. */
export const bodyHash = (envelope: WidgetEnvelope): string => sha256Hex(canonicalJson(bodyHashTerms(envelope)));

// ── instants, without a clock ──────────────────────────────────────────────────────────────────

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/;

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number): number =>
  m === 2 ? (isLeap(y) ? 29 : 28) : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;

/** Days since 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant's days_from_civil). */
const daysFromCivil = (year: number, month: number, day: number): number => {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
};

/** RFC 3339 date-time → epoch milliseconds (fractional), or null when it is not one. */
export const parseInstant = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const m = INSTANT.exec(value);
  if (m === null) return null;
  const part = (i: number): number => Number(m[i] ?? 'x');
  const [year, month, day, hour, minute, second] = [part(1), part(2), part(3), part(4), part(5), part(6)];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 60) return null;
  const fraction = m[7] === undefined ? 0 : Number(`0.${m[7]}`) * 1000;
  let offset = 0;
  if (m[8] !== undefined) {
    const oh = part(9);
    const om = part(10);
    if (oh > 23 || om > 59) return null;
    offset = (oh * 60 + om) * 60000 * (m[8] === '-' ? -1 : 1);
  }
  return daysFromCivil(year, month, day) * 86400000 + ((hour * 60 + minute) * 60 + second) * 1000 + fraction - offset;
};

// ── the verdict ────────────────────────────────────────────────────────────────────────────────

/**
 * H7 on the full envelope. Integrity first: a body that does not match its seal-covered hash is
 * `body_mismatch` whatever its expiry says. Then expiry: `expired` once `now >= expires_at`. An
 * unreadable hash input, a missing hash, or an unparseable instant fails closed — each draws the
 * frozen-prose fallback, never an error surface.
 */
export const verify = (envelope: WidgetEnvelope, nowIso: string): H7Verdict => {
  let recomputed: string | null;
  try {
    recomputed = bodyHash(envelope);
  } catch {
    recomputed = null;
  }
  const sealed: unknown = envelope.integrity?.body_hash;
  if (recomputed === null || typeof sealed !== 'string' || recomputed !== sealed) return 'body_mismatch';
  const expires = parseInstant(envelope.lifecycle?.expires_at);
  const now = parseInstant(nowIso);
  if (expires === null || now === null || now >= expires) return 'expired';
  return 'valid';
};
