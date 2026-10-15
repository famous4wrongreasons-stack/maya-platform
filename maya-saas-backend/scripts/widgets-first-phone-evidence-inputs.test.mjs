import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare } from './widgets-first-phone-evidence-inputs.mjs';
test('fixed branch input preserves all 165 global rows and adds eight distinct mandatory remainders', () => {
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'maya-fp-input-proof-'));
  try {
    assert.deepEqual(prepare(out).globalPromotion,false);
    const read=n=>JSON.parse(fs.readFileSync(path.join(out,n+'.json'),'utf8'));
    const inventory=read('inventory');
    const source=JSON.parse(fs.readFileSync('../docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json','utf8'));
    assert.deepEqual(inventory.gates.slice(0,-1),source.gates);
    assert.equal(inventory.gates.at(-1).clauses.length,8);
    assert(inventory.gates.at(-1).clauses.every(c=>c.key.startsWith('FP-')));
    const branchProofs=read('u-proofs').proofs.filter(p=>p.clause.startsWith('FP-'));
    assert.equal(branchProofs.length,7);
    assert(!branchProofs.some(p=>p.clause==='FP-G7-FR6d'));
    for(const p of branchProofs) for(const duty of ['absence','refusal','mechanism'])
      assert(fs.readFileSync(p[duty].source,'utf8').includes(p[duty].marker),p.clause+':'+duty);
    assert.throws(()=>prepare(out),/EEXIST/);
  } finally { fs.rmSync(out,{recursive:true,force:true}); }
});
