#!/usr/bin/env node
// The signature is only worth what it binds. This asserts that every group the owner marked
// APPROVE WITH CONDITIONS actually has a recorded condition, that the arithmetic in the signature
// matches the arithmetic derived from the dossier data, and that the verdict set is exactly the
// partition. A signature that referred to conditions nobody wrote down would be a signature on
// nothing, which is the failure this file exists to make impossible.
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const sig = JSON.parse(fs.readFileSync(HERE + 'k1-signature.json', 'utf8'));
const groups = JSON.parse(fs.readFileSync(HERE + 'human-dossier-groups.json', 'utf8'));
const rows = JSON.parse(fs.readFileSync(HERE + 'k1-surface-dossier.json', 'utf8'));
const out = [];
const chk = (n, ok, ev) => out.push({ n, ok, ev });

const S = (r) => /^REQUIRES SIGNATURE/.test(r.successorSource || '');
const O = (r) => /^REQUIRES SIGNATURE/.test(r.canonicalOwnerSource || '');
const sig_rows = rows.filter((r) => S(r) || O(r));
const A = sig.arithmetic_accepted;

chk('the signature covers exactly the dossier groups',
  Object.keys(sig.verdicts).sort().join() === Object.keys(groups).sort().join(),
  `${Object.keys(sig.verdicts).length} verdicts over ${Object.keys(groups).length} groups`);

chk('every verdict is APPROVE or APPROVE WITH CONDITIONS',
  Object.values(sig.verdicts).every((v) => /^APPROVE/.test(v)),
  Object.values(sig.verdicts).filter((v) => /CONDITION/i.test(v)).length + ' carry conditions');

// The load-bearing one: a conditional approval with no recorded condition is an unsigned condition.
const conditional = Object.keys(sig.verdicts).filter((k) => /CONDITION/i.test(sig.verdicts[k]));
const covered = (k) =>
  Object.keys(sig.binding_conditions).some((key) => key === k || key.split('_').includes(k));
const uncovered = conditional.filter((k) => !covered(k));
chk('every conditional approval has a recorded binding condition',
  uncovered.length === 0,
  uncovered.length ? 'UNCOVERED: ' + uncovered.join(', ')
    : `${conditional.length} conditional groups, all covered by ${Object.keys(sig.binding_conditions).length} blocks`);

chk('the signed arithmetic matches the data',
  A.human_judgement_rows === sig_rows.length &&
  A.successor_cells === sig_rows.filter(S).length &&
  A.owner_cells === sig_rows.filter(O).length &&
  A.overlap_rows === sig_rows.filter((r) => S(r) && O(r)).length &&
  A.human_judgement_cells === sig_rows.filter(S).length + sig_rows.filter(O).length,
  `${sig_rows.length} rows / ${sig_rows.filter(S).length} successor / ${sig_rows.filter(O).length} owner / ${sig_rows.filter((r) => S(r) && O(r)).length} overlap`);

const all = Object.values(groups).flat();
chk('the signed partition is still total and disjoint',
  new Set(all).size === all.length && all.length === sig_rows.length,
  `${all.length} rows across ${Object.keys(groups).length} groups, no duplicates`);

chk('both out-of-K1 findings are carried, not dropped',
  (sig.out_of_k1_findings || []).length === 2,
  (sig.out_of_k1_findings || []).map((f) => f.id).join(' · '));

for (const c of out) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`);
const bad = out.filter((c) => !c.ok).length;
console.log(bad ? `\n${out.length - bad}/${out.length} — SIGNATURE NOT COHERENT`
                : `\nK1 SIGNED: YES — ${out.length}/${out.length} signature checks pass`);
process.exit(bad ? 1 : 0);
