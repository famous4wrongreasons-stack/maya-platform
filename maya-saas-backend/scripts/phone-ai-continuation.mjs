// An explicit operator repair may continue once with every prior reservation
// charged, including unresolved calls. This is never an automatic restart.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {sha256} from './phone-ai-scope.mjs';
import {CORE_PHONE_READ_PROFILE} from './conversation-qualification/current-candidate-budget.mjs';
export function phoneAiCarryForward(bytes,{ledgerSha256,scopePin,candidate},previous){
 assert.equal(sha256(bytes),ledgerSha256,'phone_ai_old_ledger_changed');
 const lines=bytes.toString('utf8');assert.ok(lines.endsWith('\n'));
 const rows=lines.trimEnd().split('\n').map(l=>JSON.parse(l)),open=rows[0];
 assert.equal(open.event,'opened');assert.equal(open.manifestSha256,scopePin);assert.equal(open.candidateCommit,candidate);assert.equal(open.profile,CORE_PHONE_READ_PROFILE);assert.equal(open.mode,'ADMITTED_MODEL_ONLY');assert.equal(open.paidAuthorized,true);assert.deepEqual(open.carryForward,previous);
 const carry={attempts:0,inputTokens:0,outputTokens:0,reservedNanoUsd:0,...previous,ledgerSha256};
 for(const r of rows.slice(1)){
  assert.ok(['dialog','turn','reserved','response','halted_after_attempt','closed'].includes(r.event));
  if(r.event!=='reserved')continue;
  assert.equal(r.attempt,carry.attempts+1);
  for(const k of ['input','output','nanoUsd'])assert.ok(Number.isSafeInteger(r[k])&&r[k]>=0);
  assert.equal(r.nanoUsd,r.input*1320+r.output*3960);
  carry.attempts++;carry.inputTokens+=r.input;carry.outputTokens+=r.output;carry.reservedNanoUsd+=r.nanoUsd;
  assert.equal(r.totalInput,carry.inputTokens);assert.equal(r.totalOutput,carry.outputTokens);assert.equal(r.totalNanoUsd,carry.reservedNanoUsd);
 }
 assert.ok(carry.attempts>0);return carry;
}
export function readPhoneAiContinuation(pin,scopePin,scope){
 assert.match(pin,/^[a-f0-9]{64}$/);const p='/run/maya/phone-ai-continuation.json',s=fs.lstatSync(p);
 assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0);
 const bytes=fs.readFileSync(p);assert.equal(sha256(bytes),pin);const c=JSON.parse(bytes);
 const second=c.contract==='maya.phone-ai-operator-continuation/2';
 assert.deepEqual(Object.keys(c).sort(),['candidate','contract','expiresAt','ledgerSha256','scopePin',...(second?['originalLedgerSha256']:[])].sort());
 assert.ok(second||c.contract==='maya.phone-ai-operator-continuation/1');assert.equal(c.scopePin,scopePin);assert.equal(c.candidate,scope.candidate);assert.equal(c.expiresAt,scope.expiresAt);
 const original=phoneAiCarryForward(fs.readFileSync('/var/lib/maya-ai/ledger.jsonl'),{...c,ledgerSha256:second?c.originalLedgerSha256:c.ledgerSha256});
 return {carry:second?phoneAiCarryForward(fs.readFileSync('/var/lib/maya-ai/continuation-1.jsonl'),c,original):original,ledgerName:second?'continuation-2.jsonl':'continuation-1.jsonl'};
}
