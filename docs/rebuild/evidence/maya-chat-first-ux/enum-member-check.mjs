#!/usr/bin/env node
// MAPPING ENUM MEMBERS == CERTIFIED CONTRACT ENUM MEMBERS — the exact set, not the cardinality.
//
// The weaker version of this check compared counts, and counts are what let three enums drift by up
// to six members with every gate green. Comparing sets catches the case counting cannot: two sets of
// equal size with different members, which is the drift that produces a database silently rejecting
// a legal value while every total still adds up.
//
// Five things are compared, and the middle one is what makes the others worth anything:
//   1. every member set the mapping's table spells out == the canonical set
//   2. every count in that table == its canonical set size
//   3. every CHECK constraint in the staged SQL admits exactly the canonical set
//   4. no CHECK admits a member no canonical definition contains
//   5. the six Prisma back-relations reached no physical table
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../../..');
const E = path.join(ROOT, 'docs/rebuild/evidence/maya-chat-first-ux');
const STAGED = path.join(E, 'k3-migrations-staged');
const MAP = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md'), 'utf8');
const SETS = JSON.parse(fs.readFileSync(path.join(STAGED, 'widget-enum-sets.json'), 'utf8'));

const out = [];
const chk = (n, ok, ev) => out.push({ n, ok, ev });
const SEP = String.fromCharCode(1);
const eq = (a, b) => a.length === b.length && [...a].sort().join(SEP) === [...b].sort().join(SEP);

// ── 1 and 2. the table's own rows ────────────────────────────────────────────────────────────
const rows = [...MAP.matchAll(/^\|\s*`(\w+)`\s*\|\s*\**(\d+)[^|]*\|\s*([^|]*)\|/gm)]
  .map((m) => ({ set: m[1], count: Number(m[2]), source: m[3] }))
  .filter((r) => SETS[r.set]);

// The generated block is the machine-readable half of the mapping; the table above it stays prose.
// Parsing prose is how "not `expense`" became a member and `body_hash` became a RenderTier: the
// heuristic version of this check misread both, which is why the block exists.
const blk = MAP.slice(MAP.indexOf('BEGIN GENERATED ENUM MEMBERS'), MAP.indexOf('END GENERATED ENUM MEMBERS'));
const declared = Object.fromEntries(
  [...blk.matchAll(/^(\w+)\s+(\d+)\s+(.+)$/gm)].map((m) => [m[1], m[3].trim().split(/\s+/)]),
);
const blockBad = Object.entries(declared).filter(([k, v]) => !SETS[k] || !eq(v, SETS[k].members));
chk(
  `every set in the generated block matches its canonical definition (${Object.keys(declared).length} sets)`,
  blockBad.length === 0,
  blockBad.length ? blockBad.map(([k]) => k).join(', ') : Object.keys(declared).join(', '),
);

const unblocked = Object.keys(SETS).filter((k) => SETS[k]);
chk(
  'the block declares every set that has a canonical definition',
  unblocked.every((k) => declared[k]),
  unblocked.filter((k) => !declared[k]).join(', ') || `${unblocked.length} of ${Object.keys(SETS).length} declared; the rest are named as blocked`,
);

// The prose table above the block keeps its own count column, and a reader will trust it. It is
// checked too, so the two halves of the mapping cannot disagree with each other either.
const badCount = rows.filter((r) => SETS[r.set].members.length !== r.count);
chk(
  `every count in the prose table matches its canonical set size (${rows.length} rows)`,
  badCount.length === 0,
  badCount.length
    ? badCount.map((r) => `${r.set}: table ${r.count} vs canonical ${SETS[r.set].members.length}`).join(' | ')
    : `${rows.length} rows resolved against a canonical definition`,
);

// ── 3 and 4. what the emitted SQL actually admits ────────────────────────────────────────────
const sql = ['checks-migration-1.sql', 'checks-migration-2.sql']
  .map((f) => fs.readFileSync(path.join(STAGED, f), 'utf8'))
  .join('\n');
const emitted = [...sql.matchAll(/--\s*(\w+)\s*\(\d+\)[^\n]*\n[^\n]*CHECK \("(\w+)" IN \(([^)]*)\)\)/g)].map((m) => ({
  set: m[1],
  col: m[2],
  members: [...m[3].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'")),
}));

const drift = emitted.filter((e) => !SETS[e.set] || !eq(e.members, SETS[e.set].members));
chk(
  `every emitted CHECK admits exactly its canonical set (${emitted.length} enum constraints)`,
  drift.length === 0,
  drift.length ? drift.map((e) => `${e.set} on ${e.col}`).join(' | ') : 'no constraint admits a member the contract does not',
);

const unknown = emitted.flatMap((e) =>
  SETS[e.set] ? e.members.filter((m) => !SETS[e.set].members.includes(m)).map((m) => `${e.set}.${m}`) : [],
);
chk('no CHECK admits a member absent from every canonical definition', unknown.length === 0, unknown.join(', ') || 'none');

// ── the count, and the one deliberately missing ──────────────────────────────────────────────
const ranges = (sql.match(/_check" CHECK \(\s*"/g) || []).length - emitted.length;
const missing = Object.keys(SETS).filter((k) => !SETS[k]);
chk(
  'CHECKS GENERATED == 34, or the shortfall is named',
  emitted.length + ranges === 34,
  `${emitted.length} enum + ${ranges} range = ${emitted.length + ranges} of 34` +
    (emitted.length + ranges < 34 ? ` — blocked: ${missing.join(', ') || 'unnamed'}` : ''),
);

// ── 5. the back-relation guard the wave-2 ruling requires ────────────────────────────────────
// Six Prisma back-relations were added so the relation graph validates. They are virtual: if one of
// them reached the database it would appear here as an ALTER on a business table.
const migs = fs
  .readdirSync(STAGED)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('checks-'))
  .map((f) => fs.readFileSync(path.join(STAGED, f), 'utf8'))
  .join('\n');
const tenantAlters = (migs.match(/ALTER TABLE "Tenant"/g) || []).length;
const nonWidget = [...new Set([...migs.matchAll(/(?:ALTER|CREATE) TABLE "(\w+)"/g)].map((m) => m[1]).filter((t) => !t.startsWith('Widget')))];
chk(
  'the six back-relations add no physical column: no ALTER TABLE "Tenant"',
  tenantAlters === 0 && nonWidget.length === 0,
  tenantAlters
    ? `${tenantAlters} ALTER TABLE "Tenant"`
    : nonWidget.length
      ? `non-widget tables touched: ${nonWidget.join(', ')}`
      : 'no Tenant alter; every CREATE and ALTER targets a Widget* table',
);

for (const c of out) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`);
const bad = out.filter((c) => !c.ok).length;
console.log(bad ? `\n${out.length - bad}/${out.length} — enum reconciliation incomplete` : `\n${out.length}/${out.length} enum member checks pass`);
process.exit(bad ? 1 : 0);
