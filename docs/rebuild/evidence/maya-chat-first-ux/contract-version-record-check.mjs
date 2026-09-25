#!/usr/bin/env node
// Contract V1.2 — Annexes C/D are records, not rules. This checks that the record is exactly what the owner
// approved and that it cannot be read as rule. Proposed location:
//   docs/rebuild/evidence/maya-chat-first-ux/contract-version-record-check.mjs
// Paths resolve from this file, so it runs in CI and in a scratch copy alike.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const C = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md'), 'utf8');
const PK = fs.readFileSync(path.join(ROOT, 'docs/rebuild/DECISION-SHEET-04-RULING-PACKET.md'), 'utf8').split('\n');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const out = [];
const chk = (n, ok, ev) => out.push({ n, ok, ev });

const lines = C.split('\n');
const top = lines.map((l, i) => [l, i]).filter(([l]) => /^# /.test(l));
const iB = lines.findIndex((l) => l.startsWith('# Annex B'));
const iC = lines.findIndex((l) => l.startsWith('# Annex C'));
const iD = lines.findIndex((l) => l.startsWith('# Annex D'));
chk('exactly one Annex B, C and D, in order, Annex D last',
  top.filter(([l]) => l.startsWith('# Annex B')).length === 1 &&
  top.filter(([l]) => l.startsWith('# Annex C')).length === 1 &&
  top.filter(([l]) => l.startsWith('# Annex D')).length === 1 &&
  iB >= 0 && iC > iB && iD > iC && top[top.length - 1][1] === iD,
  `B@${iB + 1} C@${iC + 1} D@${iD + 1}`);
const annex = lines.slice(iC, iD).join('\n');
const annexD = lines.slice(iD).join('\n');

chk('header pins Version 1.1 by commit and SHA-256 and points to Annexes C/D',
  new RegExp('Version 1\\.2\\. Version 1\\.1 is this file at commit `17b5dc0b` ' +
    '\\(SHA-256 `4629f8762bd47245cfd90078c329439ddd8bbb7fa15439ad76adee49d5105d09`\\)').test(lines[2]) &&
  lines[2].includes('Annexes C and D') && lines[0] === '# MAYA WIDGET CONTRACT v1.2', 'line 1 and line 3');

const A_BLOCK = PK.slice(210, 286).join('\n');
const B_BLOCK = PK.slice(289, 355).join('\n');
chk('Block A: packet lines 211-286 appear verbatim in Annex C, 13 items A1..A13', annex.includes(A_BLOCK) &&
  (A_BLOCK.match(/^- \*\*A\d+ /gm) || []).length === 13, `sha ${sha(A_BLOCK).slice(0, 12)}`);
chk('Block B: packet lines 290-355 appear verbatim in Annex C, 47 top-level bullets', annex.includes(B_BLOCK) &&
  (B_BLOCK.match(/^- \*\*/gm) || []).length === 47, `sha ${sha(B_BLOCK).slice(0, 12)}`);

// the owner's ruling text is not in the repository; its bytes are pinned by hash
const OWNER_SHA = '9f8a9ac072b58b3a873185de3f52bf584af70fc9e0655ab5708d798c30254dff';
const o0 = annex.indexOf('DECISION SHEET 04 — OWNER RULINGS');
const oEnd = 'Не расширять их смысл при переносе в Contract V1.1.';
const o1 = annex.indexOf(oEnd, o0);
chk('owner ruling text is byte-identical to checkpoint ffbd684a', o0 >= 0 && o1 > o0 && sha(annex.slice(o0, o1 + oEnd.length)) === OWNER_SHA, 'pinned hash');

const rows = (hdr) => { const s = annex.indexOf(hdr); if (s < 0) return []; const ls = annex.slice(s).split('\n');
  const t = ls.findIndex((l) => /^\|---/.test(l)); const r = []; for (const l of ls.slice(t + 1)) { if (!l.startsWith('|')) break; r.push(l.split('|')[1].trim()); } return r; };
chk('C.1 rows are R-01..R-05', JSON.stringify(rows('| Ruling | Packet option')) === JSON.stringify(['R-01', 'R-02', 'R-03', 'R-04', 'R-05']), rows('| Ruling | Packet option').join(','));
chk('C.2 rows are A1..A13', JSON.stringify(rows('| ID | Disposition in this version')) === JSON.stringify(Array.from({ length: 13 }, (_, i) => `A${i + 1}`)), `${rows('| ID | Disposition in this version').length}`);
chk('C.3 rows are B-01..B-47', JSON.stringify(rows('| # | ID as published')) === JSON.stringify(Array.from({ length: 47 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`)), `${rows('| # | ID as published').length}`);
chk('C.4 lists exactly the fifteen F36a keys, and F36a declares them',
  rows('| key | packet candidate').length === 15 &&
  rows('| key | packet candidate').every((k) => new RegExp('^\\| ' + k.replace(/[.`]/g, (m) => '\\' + m) + ' \\|', 'm').test(lines.slice(0, iB).join('\n'))),
  `${rows('| key | packet candidate').length} rows`);

const heads = new Set([...C.matchAll(/^#{2,4}\s+(A?[\d.]+)\s/gm)].map((m) => m[1]));
const bad = [...new Set([...annex.matchAll(/§(A?\d+(?:\.\d+)*)/g)].map((m) => m[1]).filter((r) => !heads.has(r)))];
chk('every § pointer in Annex C resolves to a heading of the body', bad.length === 0, bad.join(', ') || 'all resolve');
chk('Annex C can state no rule: no code fence, no Mechanism, no evaluation point, no P-row, no backticked GAP key',
  !/```/.test(annex) && !/\*Mechanism|\*Evaluation point|\*Evaluated at/.test(annex) && !/^\| \*\*P-\d\d\*\*/m.test(annex) && !/`GAP-[A-Z]/.test(annex), 'clean');

chk('Annex D records OD-1 A, OD-2 C, I-MIG3 approval and P-G15c non-activation',
  annexD.includes('| OD-1 | Option A |') && annexD.includes('| OD-2 | Option C |') &&
  annexD.includes('| I-MIG3 | Approved |') && annexD.includes('| P-G15c | Not activated |'),
  'four dispositions');
// F2, targeted: every identifier this version introduces into the body is declared in a ts fence of the body
const body = lines.slice(0, iB).join('\n');
const tsFences = [...body.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
const INTRODUCED = ['R01ReadRow', 'R01_READ_SET', 'C9_REGISTRY_HASH_R01', 'allowedKinds', 'BOOKING_OWNER_KEYS',
  'BOOKING_OWNER_PROPOSAL', 'HandoffTarget', 'HandoffAnswer', 'routeUtterance', 'liveCandidates', 'ownerSet',
  'DivergenceAuditRecord', 'TelegramCommandIngress', 'confirmation_subject', 'approval_decision',
  'selection_domain_labels', 'resolved_widget', 'route_key', 'opaque_handle', 'StaffMarketingRevokeRequest',
  'request_channel', 'request_contact'];
const declared = (n) => new RegExp(`(?:interface|type|declare const|declare function|const|function)\\s+${n}\\b|^\\s*${n}\\??:`, 'm').test(tsFences);
const undeclaredNew = INTRODUCED.filter((n) => !declared(n));
chk('every identifier this version introduces is declared in a ts block of the body (F2, targeted)', undeclaredNew.length === 0,
  undeclaredNew.join(', ') || `${INTRODUCED.length} declared`);
// R-04: the staff door is counted beside the programme's three routes (never placed outside the programme), every
// limit of the ruling is one clause of R3.5.5 with a mechanism and an evaluation point, the one Action Engine branch
// it needs is named wherever the engine fence and the C6-C9 figure are stated, and it is pending on its own row P-34.
{
  const ws = (s) => s.replace(/\s+/g, ' ');
  const pre = ws(lines.slice(3, lines.findIndex((l) => l.startsWith('## 0. '))).join('\n'));
  const p01 = lines.find((l) => l.startsWith('| **P-01** |')) || '';
  const p33 = lines.find((l) => l.startsWith('| **P-33** |')) || '';
  const p34 = lines.find((l) => l.startsWith('| **P-34** |')) || '';
  const s0 = body.indexOf('**R3.5.5 — '); const s1 = body.indexOf('\n### 3.6 ', s0);
  const door = s0 >= 0 && s1 > s0 ? ws(body.slice(s0, s1)) : '';
  const ENV = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-CHAT-FIRST-IMPLEMENTATION-ENVELOPE.md'), 'utf8');
  const g8 = ENV.split('\n').find((l) => l.startsWith('| **G8** |')) || '';
  const MAP = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md'), 'utf8');
  const fr6a = lines.find((l) => l.startsWith('| **FR-6a** |')) || '';
  const LIMITS = ['к существующему canonical consent owner', 'для подтверждённых phone/e-mail requests',
    'Staff bridge может только отзывать marketing consent', 'выдавать consent', 'менять privacy consent',
    'создавать второго consent owner', 'записывать consent в chat history/provider state',
    'Любой successful revoke должен закончиться canonical consent receipt.',
    'До появления executable path текст не должен обещать уже выполненный revoke.'];
  const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const clauses = LETTERS.map((c, k) => {
    const i = door.indexOf(`(${c}) **`);
    const j = k + 1 < LETTERS.length ? door.indexOf(`(${LETTERS[k + 1]}) **`, i) : door.indexOf('*Status:*', i);
    const txt = i >= 0 ? door.slice(i, j > i ? j : undefined) : '';
    return { c, ok: /\*Mechanism:\*/.test(txt) && /\*Evaluation points?:\*/.test(txt) };
  });
  const ROLES = ['tenant_owner', 'business_owner', 'tenant_admin', 'administrator', 'manager', 'branch_manager',
    'accountant', 'provider', 'employee', 'staff'];
  const OUTSIDE = ['nor a route of that programme', 'not a route of the chat-first widget programme',
    'not a route of this programme', 'not a programme route'];
  const bodyWs = ws(body); const mapWs = ws(MAP); const envWs = ws(ENV);
  const miss = [
    ...(/Exactly \*\*three\*\* new routes exist in the chat-first widget programme/.test(pre) ? [] : ['preamble: three programme routes']),
    ...(/exactly \*\*one\*\* further ingress/.test(pre) && pre.includes('§3.5 R3.5.5') && pre.includes('§A1.3 P-34') ? [] : ['preamble: the R-04 door']),
    ...(p01.includes('POST /api/widgets/resolve') && p01.includes('POST /api/widgets/intent') && p33.includes('§3.12 R3.12.7') && p34.includes('§3.5 R3.5.5') ? [] : ['V1.2 split route rows P-01/P-33/P-34']),
    ...(/^\| \*\*P-34\*\* \|/m.test(C) ? [] : ['P-34 row']),
    ...(g8.includes('§3.12 R3.12.7') && g8.includes('§3.5 R3.5.5') && g8.includes('R-04 revoke-only staff authority') ? [] : ['envelope G8']),
    ...LIMITS.filter((l) => !door.includes(l)).map((l) => `R3.5.5 lacks «${l}»`),
    ...OUTSIDE.filter((p) => bodyWs.includes(p) || mapWs.includes(p) || envWs.includes(p)).map((p) => `the door is placed outside the programme: «${p}»`),
    ...(ROLES.every((r) => door.includes('`' + r + '`')) && door.includes('`platform_owner`') && door.includes('`platform_admin`') && !/role is none of/.test(door) ? [] : ['R3.5.5 (a): staff is not the ten-role allowlist with platform roles refused']),
    ...(!door.includes('request_confirmed') && door.includes('`Client.phoneHash`') ? [] : ['R3.5.5 (d): confirmation is not a contact match']),
    ...(pre.includes('§3.5 R3.5.5 (j)') && fr6a.includes('R3.5.5 (j)') && g8.includes('R3.5.5 (j)') ? [] : ['the R-04 engine branch is not named in the preamble, FR-6a and G8']),
    ...clauses.filter((x) => !x.ok).map((x) => `R3.5.5 (${x.c}) lacks a mechanism or an evaluation point`),
    ...(door.includes('*Status:* `NORMATIVE-PENDING` on **P-34**') ? [] : ['R3.5.5 status']),
  ];
  chk('R-04: the staff door is counted beside the three programme routes and carries every limit of the ruling and its one engine branch (§3.5 R3.5.5, P-34, FR-6a, G8)',
    miss.length === 0, miss.join('; ') || `${LIMITS.length} limits, ${LETTERS.length} clauses, 10 staff roles, P-01, P-34, FR-6a, G8`);
}
chk('the body carries no version mark', !/V1\.1|Contract v1\.1|\(V1\.1\)/.test(lines.slice(3, iB).join('\n').replace(/MAYA WIDGET CONTRACT v1\.2/g, '')), 'lines 4..Annex B');

let fail = 0;
for (const c of out) { if (!c.ok) fail++; console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`); }
console.log(`\n${fail ? 'FAIL: ' : ''}${out.length - fail}/${out.length} version-record checks pass`);
process.exit(fail ? 1 : 0);
