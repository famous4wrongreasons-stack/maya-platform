#!/usr/bin/env node
// G2 — the successor map for every row K16 or K15 would retire.
//
//   node k16-successor-map.mjs                      verify successor-proposals.json, write successor-map.json
//   node k16-successor-map.mjs --import a.json ...  first merge proposal files into successor-proposals.json
//
// Two files, kept apart on purpose:
//
//   successor-proposals.json  the JUDGEMENT: for each row, what somebody read and named, with a quote
//                             from the signed dossier and a reason. Proposals may be wrong.
//   successor-map.json        the VERDICT: each proposal checked against the built code by
//                             successor-verify.mjs, the one module that holds the rule.
//
// The K16 evaluator does not trust successor-map.json either. It re-runs the same verification on
// every invocation, so a map cannot keep a row green once the code it names has moved.
//
// The owner's ruling this applies: a successor need not be the same TYPE for every row — a shell
// route, a fullscreen destination or a capability-backed widget for a presentation surface, a
// server-side canonical fence for a K15 enforcement row — but it must be ONE concrete, provable thing,
// never "covered by Maya".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImplementation, verifySuccessor } from './successor-verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const E = here;
const PROPOSALS = path.join(E, 'successor-proposals.json');
const MAP = path.join(E, 'successor-map.json');

const dossier = JSON.parse(fs.readFileSync(path.join(E, 'k1/k1-surface-dossier.json'), 'utf8'));
const retiring = dossier.filter((r) => r.retirementCondition.startsWith('RETIRE'));
const native = new Set(JSON.parse(fs.readFileSync(path.join(E, 'native-pwa-cutover-evidence.json'), 'utf8'))
  .surfacesBlockedByAnOutOfRepositoryNativeChange.ids);

const importIdx = process.argv.indexOf('--import');
if (importIdx > 0) {
  const merged = {};
  for (const f of process.argv.slice(importIdx + 1)) {
    for (const p of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      if (merged[p.id]) throw new Error(`${p.id} proposed twice`);
      merged[p.id] = p;
    }
  }
  const ids = retiring.map((r) => r.id);
  const missing = ids.filter((id) => !merged[id]);
  const extra = Object.keys(merged).filter((id) => !ids.includes(id));
  if (missing.length || extra.length)
    throw new Error(`proposals must cover the ${ids.length} retiring rows exactly: missing ${missing.join(',') || 0}, extra ${extra.join(',') || 0}`);
  fs.writeFileSync(PROPOSALS, JSON.stringify(ids.map((id) => merged[id]), null, 1) + '\n');
}

const proposals = Object.fromEntries(JSON.parse(fs.readFileSync(PROPOSALS, 'utf8')).map((p) => [p.id, p]));
const impl = loadImplementation(repo);

const rows = retiring.map((r) => {
  const p = proposals[r.id];
  const v = verifySuccessor(impl, p);
  return {
    id: r.id,
    surface: r.name,
    retirementCondition: r.retirementCondition,
    proposedType: p?.successorType ?? null,
    resolved: v.resolved,
    successor: v.successor ?? null,
    why: v.why ?? null,
    nativeBlocker: native.has(r.id),
  };
});

fs.writeFileSync(MAP, JSON.stringify({ contract: 'maya.k16.successor-map/1', rule: 'verdicts are recomputed by successor-verify.mjs on every read; this file is a snapshot, not a checkbox', rows }, null, 1) + '\n');

const tally = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const resolved = rows.filter((r) => r.resolved);
console.log('G2 SUCCESSOR MAP  —  proposals verified against the built code');
console.log('='.repeat(78));
console.log(`retiring rows:          ${rows.length}`);
console.log(`resolved successors:    ${resolved.length}`);
console.log(`unresolved:             ${rows.length - resolved.length}`);
console.log(`  of which native-shell blockers: ${rows.filter((r) => !r.resolved && r.nativeBlocker).length}`);
console.log();
console.log('by proposed type:', tally(rows, (r) => r.proposedType));
console.log('resolved by type:', tally(resolved, (r) => r.proposedType));
console.log('unresolved by condition:', tally(rows.filter((r) => !r.resolved), (r) => r.retirementCondition));
console.log();
console.log(`G2 SUCCESSOR MAP: ${resolved.length === rows.length ? 'COMPLETE' : 'INCOMPLETE'}  (${resolved.length}/${rows.length})`);
process.exitCode = resolved.length === rows.length ? 0 : 1;
