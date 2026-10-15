#!/usr/bin/env node
// Only prepares finite inputs for widgets-evidence-verify.mjs. Does not collect,
// promote, sign, certify or bypass complete widgets-mutation-ci release admission.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(backend);
export function prepare(out) {
  const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const plan = read('docs/rebuild/widget-release-programme/first-phone/BRANCH-EVIDENCE.json');
  assert.equal(plan.contract, 'maya.first-phone-source-evidence/1');
  assert.equal(plan.profile, 'closed-input.no-handoff.no-price-goods@1');
  assert.equal(plan.global_clause_promotion, false);
  const ids = ['G7-FR6d','G11-I4','G11-I5','G11-I6','G11-I10','G13-I1','G13-I2','G13-I9'];
  assert.deepEqual(plan.rows.map(r => r.clause), ids);
  const inventory = read('docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json');
  assert.equal(inventory.gates.flatMap(g => g.clauses).length, 165);
  const audit = read('docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json');
  const proofs = read('docs/rebuild/widget-release-programme/development-v14/u-proofs.json');
  const clauses = {};
  for (const row of plan.rows) {
    assert.equal(row.remainder, `FP-${row.clause}`);
    assert.equal(row.claim, row.clause === 'G7-FR6d' ? 'L' : 'U');
    clauses[row.remainder] = { u_candidate: row.claim === 'U', u_basis: row.basis };
    if (row.claim === 'U') proofs.proofs.push({ ...row, clause: row.remainder });
  }
  inventory.gates.push({ gate: 'FP-REMAINDER', clauses: plan.rows.map(r => ({key:r.remainder, text:r.basis})) });
  audit.gates.push({ gate: 'FP-REMAINDER', clauses });
  // Namespacing makes every scoped claim invalid for the unchanged 165 inventory.
  fs.mkdirSync(out, { recursive: true });
  const files = { inventory, audit, 'u-proofs': proofs };
  for (const [name,value] of Object.entries(files))
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(value,null,2)+'\n', {flag:'wx'});
  return { profile: plan.profile, globalPromotion: false, generated: Object.keys(files) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2], 'output directory required');
  console.log(JSON.stringify(prepare(path.resolve(process.argv[2]))));
}
