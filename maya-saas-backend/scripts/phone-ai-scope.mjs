// Narrow operator admission for the isolated owner phone check; no product grant.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { candidateReservation, CORE_PHONE_READ_PROFILE } from './conversation-qualification/current-candidate-budget.mjs';
export const PHONE_AI_CONTRACT = 'maya.phone-owner-ai/1';
export const PHONE_AI_TOOLS = Object.freeze(['catalog.services.read','catalog.staff.read','company.business-hours.read']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function validatePhoneAiScope(scope, now = Date.now()) {
  const keys=['contract','approvalRef','candidate','tenantId','userId','branchId','tenantSlug','companyId','notBefore','expiresAt','maxCalls','maxSpendNanoUsd'];
  assert.ok(scope && Object.keys(scope).sort().join(',')===keys.sort().join(','),'phone_ai_scope_shape');
  assert.equal(scope.contract,PHONE_AI_CONTRACT);
  assert.equal(scope.approvalRef,'owner-20261015-phone-deepseek-24h-usd2');
  assert.match(scope.candidate,/^[a-f0-9]{40}$/);
  for(const name of ['tenantId','userId','branchId']) assert.match(scope[name],/^[A-Za-z0-9_-]{1,128}$/);
  assert.match(scope.tenantSlug,/^[a-z0-9-]{1,80}$/);assert.match(scope.companyId,/^[1-9][0-9]{0,14}$/);
  assert.equal(scope.maxCalls,100);assert.equal(scope.maxSpendNanoUsd,2000000000);
  const start=Date.parse(scope.notBefore),end=Date.parse(scope.expiresAt);
  assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<end&&end-start<=86400000,'phone_ai_window');
  return Object.freeze({...scope});
}
export function readPhoneAiScope(file,pin) {
  assert.match(pin,/^[a-f0-9]{64}$/);
  const stat=fs.lstatSync(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0&&(stat.mode&0o077)===0&&stat.size<=4096,'phone_ai_scope_file');
  const bytes=fs.readFileSync(file);assert.equal(sha256(bytes),pin,'phone_ai_scope_changed');
  assert.equal(fs.existsSync(file+'.revoked'),false,'phone_ai_revoked');
  return validatePhoneAiScope(JSON.parse(bytes));
}
export function assertPhoneAiActor(user,scope) {
  assert.ok(user?.userId===scope.userId&&user?.tenantId===scope.tenantId&&user.role==='tenant_owner'&&user.membershipStatus==='active','phone_ai_actor');
}
// Inspect only current canonical sanitized wire data, never raw conversation/DB.
export function assertPhoneAiPayload(init) {
  candidateReservation('https://api.deepseek.com/chat/completions',init,CORE_PHONE_READ_PROFILE);
  const body=JSON.parse(init.body);
  assert.equal(body.messages.length,2);assert.equal(body.messages[0].role,'system');assert.equal(body.messages[1].role,'user');
  const data=JSON.parse(body.messages[1].content);
  assert.ok(['tool_planning','final_response'].includes(data.phase),'phone_ai_phase');
  assert.ok(Array.isArray(data.tool_results)&&data.tool_results.every(x=>PHONE_AI_TOOLS.includes(x?.name)),'phone_ai_private_tool_data');
  assert.ok(Array.isArray(data.remembered_notes)&&data.remembered_notes.length===0,'phone_ai_memory_outside_scope');
  assert.ok(!data.pending_owner_review,'phone_ai_private_review');
  if(data.known_tools)assert.ok(data.known_tools.every(x=>PHONE_AI_TOOLS.includes(x.name)),'phone_ai_tools');
  if(data.available_tools){
    const a=data.available_tools;
    const names=Array.isArray(a)?a.map(x=>x.name):a.rows.map(row=>row[a.columns.indexOf('name')]);
    assert.ok(names.every(name=>PHONE_AI_TOOLS.includes(name)),'phone_ai_tools');
  }
  // Canonical projection is primary. Extra refusal for common raw contacts or
  // stable identity fields accidentally introduced by a future wire change.
  function walk(value,key=''){
    if(typeof value==='string'){
      // AiCore replaces personal names with these per-turn opaque aliases.
      // Exclude only that exact canonical syntax from extra contact screening.
      const screened=value.replace(/\[name removed\]@[a-f0-9]{32}_\d+/g,'[name removed]');
      assert.ok(!screened.includes('@'),'phone_ai_raw_email');
      assert.ok(!/(?:\+\d[\d ()-]{8,}\d|\b\d{10,15}\b)/.test(screened),'phone_ai_raw_phone');
      if(/^(?:clientId|userId|tenantId|phone|email|customer_id|client_id)$/i.test(key))assert.ok(value===''||/^\[/.test(value),'phone_ai_raw_identity');
    }else if(Array.isArray(value))value.forEach(v=>walk(v,key));
    else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))walk(v,k);
  }
  walk({conversation:data.conversation,remembered_notes:data.remembered_notes,tool_results:data.tool_results,current_user_request:data.current_user_request});
}
