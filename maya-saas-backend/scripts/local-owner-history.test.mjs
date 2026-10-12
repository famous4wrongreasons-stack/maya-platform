import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { OWNER_HISTORY_PROFILE, HISTORY_LIMITS as L, historyDates, historyProviderRoute, ownerHistoryIngress, assertOwnerHistoryPlan, historyResultProjection } from './local-owner-history-policy.mjs';
import { createOwnerHistoryTransport } from './local-owner-history-transport.mjs';
import { readOwnerHistoryLaunch } from './local-owner-history-launch.mjs';
import { ownerTelegramIngress } from './local-owner-telegram-policy.mjs';
const scope = { stateDirectory: '/private/tmp/synthetic-history-state', initialManifestSha256: '1'.repeat(64),
  privateStateSha256: '2'.repeat(64), restartReceiptPath: '/private/tmp/synthetic-history-state/restart.json', restartReceiptSha256: '3'.repeat(64),
  tenantId: 'tenant-a', userId: 'owner-a', branchId: 'branch-a', tenantSlug: 'synthetic-salon', companyId: '12345' };
const hash = v => createHash('sha256').update(v).digest('hex'), source = { head: 'a'.repeat(40), files: [] };
const plan = () => ({ contract: OWNER_HISTORY_PROFILE, candidateCommit: source.head, sourceSha256: hash(JSON.stringify(source)),
  scope, origin: 'http://127.0.0.1:56151', day: '2026-10-12', timezone: 'Europe/Moscow',
  notBefore: new Date(Date.now()-1000).toISOString(), expiresAt: new Date(Date.now()+600000).toISOString(), ownerApprovalRef: 'synthetic-history-execution-only' });
const p = plan(), base = 'https://api.yclients.com/api/v1/';
const records = n => base + 'records/12345?start_date=2026-10-05&end_date=2026-10-18&count=200&page=' + n + '&with_deleted=1';
const transport = extra => createOwnerHistoryTransport({ plan: p, assertCurrent: () => {}, verifyCurrent: async () => {}, nativeFetch: async () => Response.json({success:true,data:[]}), ...extra });
test('fourteen calendar dates across month and year boundaries', () => {
  assert.deepEqual(historyDates('2026-01-01'), { startDate:'2025-12-25',endDate:'2026-01-07',exclusiveDate:'2026-01-08' });
  assert.deepEqual(historyDates('2024-03-01'), { startDate:'2024-02-23',endDate:'2024-03-07',exclusiveDate:'2024-03-08' });
  assert.throws(() => historyDates('2026-02-30'));
});
test('canonical calendar conversion preserves local midnight including DST, never 14 elapsed days', () => {
  const { canonicalAppointmentInstant } = createRequire(import.meta.url)('../dist/src/crm/appointment-time.utils.js');
  for (const [day, zone, hours] of [['2026-03-29','Europe/Berlin',335],['2026-10-25','Europe/Berlin',337],['2026-01-01','Pacific/Kiritimati',336],['2026-01-01','America/Los_Angeles',336]]) {
    const d=historyDates(day), from=canonicalAppointmentInstant(d.startDate+'T00:00:00',zone), to=canonicalAppointmentInstant(d.exclusiveDate+'T00:00:00',zone);
    assert.equal((Date.parse(to)-Date.parse(from))/3600000,hours);
  }
});
for (const [name,change] of [
  ['candidate', q=>q.candidateCommit='b'.repeat(40)], ['source',q=>q.sourceSha256='b'.repeat(64)],
  ['expired',q=>q.expiresAt=new Date(Date.now()-1).toISOString()], ['future',q=>q.notBefore=new Date(Date.now()+60000).toISOString()],
  ['wide window',q=>q.expiresAt=new Date(Date.parse(q.notBefore)+L.sessionMs+1).toISOString()],
  ['unapproved day format',q=>q.day='2026-02-31'], ['caller Client',q=>q.clientId='foreign'],
  ['unknown contract',q=>q.contract='owner_telegram_saved_login_batch_v2'], ['missing execution allowance',q=>delete q.ownerApprovalRef],
]) test('history plan refuses '+name,()=>{const q=plan();change(q);assert.throws(()=>assertOwnerHistoryPlan(q,source,p.ownerApprovalRef));});
test('pinned private plan requires one parent and one child and current source; revoked claim fails',()=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'maya-history-unit-')));fs.chmodSync(dir,0o700);
  const file=path.join(dir,'plan.json'),q=plan(),bytes=JSON.stringify(q);fs.writeFileSync(file,bytes,{mode:0o600});
  const args=[file,hash(bytes),q.ownerApprovalRef,()=>source];
  try {assert.throws(()=>readOwnerHistoryLaunch(...args,'child'));const run=readOwnerHistoryLaunch(...args,'claim');run.assertCurrent();
    readOwnerHistoryLaunch(...args,'child');assert.throws(()=>readOwnerHistoryLaunch(...args,'child'));assert.throws(()=>readOwnerHistoryLaunch(...args,'claim'));
    fs.unlinkSync(file+'.consumed');assert.throws(()=>run.assertCurrent());
  } finally {fs.rmSync(dir,{recursive:true});}
});
test('existing consent and CAS settings shape only; Telegram allowance remains closed',()=>{
  const consent={privacy:true,marketing:false,idempotencyKey:'synthetic-consent-key'};
  const body={confirmed:true,namespace:'client_capabilities',expectedRevision:0,previousRevisionId:null,content:{client_self_visit_history:true}};
  assert.equal(ownerHistoryIngress('POST','/api/client-channel/consent',{},consent,p.origin,scope),null);
  assert.equal(ownerHistoryIngress('POST','/api/governed-settings/tenant',{'idempotency-key':'synthetic-history-key'},body,p.origin,scope),null);
  for(const bad of [{...consent,marketing:true},{...consent,clientId:'other'}]) assert.notEqual(ownerHistoryIngress('POST','/api/client-channel/consent',{},bad,p.origin,scope),null);
  assert.notEqual(ownerHistoryIngress('POST','/api/governed-settings/tenant',{},body,p.origin,scope),null);
  assert.notEqual(ownerTelegramIngress('POST','/api/client-channel/consent',{},consent,p.origin,scope),null);
  for(const route of ['/api/ai/chat','/api/widgets/intent','/api/client-channel/challenges','/api/auth/oauth/telegram/start','/api/integrations/crm/activate','/api/auth/phone/start','/api/history/import']) assert.notEqual(ownerHistoryIngress('POST',route,{}, {},p.origin,scope),null);
  assert.notEqual(ownerHistoryIngress('GET','/api/client-channel/appointments?clientId=foreign',{},null,p.origin,scope),null);
});
for(const [name,url,init,purpose] of [
  ['foreign company',records(1).replace('12345','99999'),{},'journal'], ['wide dates',records(1).replace('10-05','09-01'),{},'journal'],
  ['caller client filter',records(1)+'&client_id=123',{},'journal'], ['duplicate query',records(1)+'&count=200',{},'journal'],
  ['page 26',records(26),{},'journal'], ['write',records(1),{method:'POST'},'journal'],
  ['wrong host',records(1).replace('api.yclients.com','evil.invalid'),{},'journal'], ['encoded path',records(1).replace('records','%72ecords'),{},'journal'],
  ['GET cannot sync',records(1),{},'labels'], ['registry',base+'company/12345/clients/search',{method:'POST',body:'{}'},'journal'],
  ['model','https://api.deepseek.com/chat/completions',{method:'POST'},'journal'],
]) test('finite provider refuses '+name,()=>assert.equal(historyProviderRoute(url,init,p,purpose),null));
test('journal bytes preserved and redirects prohibited',async()=>{
  const body=JSON.stringify({success:true,data:[{id:1,notes:'synthetic-private'}]});let options;
  const t=transport({nativeFetch:async(_raw,init)=>{options=init;return new Response(body);}});
  await t.run('journal',async()=>assert.equal(await(await t.fetch(records(1))).text(),body));assert.equal(options.redirect,'error');assert.ok(options.signal);
});
test('one invocation including failed/concurrent retry; background cannot dispatch',async()=>{
  const t=transport();let release;const pending=t.run('journal',()=>new Promise(r=>release=r));
  await assert.rejects(t.run('journal',async()=>{}));release();await pending;await assert.rejects(t.run('journal',async()=>{}));
  const b=transport();await assert.rejects(b.fetch(records(1)));assert.equal(b.counters.calls,0);
});
test('ordered pages and replay; foreign request poisons remaining run',async()=>{
  const t=transport();await t.run('journal',async()=>{await t.fetch(records(1));await assert.rejects(t.fetch(records(1)));}).then(()=>assert.fail('poison survived'),()=>{});
  const out=transport();await assert.rejects(out.run('journal',()=>out.fetch(records(2))));assert.equal(out.counters.calls,0);
});
test('exact page cap 25 and row cap 200 including overfilled provider responses',async()=>{
  const t=transport();await t.run('journal',async()=>{for(let i=1;i<=25;i++)await t.fetch(records(i));});assert.equal(t.counters.calls,25);
  const over=transport({nativeFetch:async()=>Response.json({data:Array(201).fill({id:1})})});await assert.rejects(over.run('journal',()=>over.fetch(records(1))));
});
test('catalogue size and page byte cap are enforced',async()=>{
  const over=transport({nativeFetch:async()=>Response.json({data:Array(2001).fill({id:1})})});await assert.rejects(over.run('labels',()=>over.fetch(base+'services/12345')));
  const big=transport({nativeFetch:async()=>Response.json({data:[{note:'x'.repeat(L.responseBytes+1)}]})});await assert.rejects(big.run('journal',()=>big.fetch(records(1))));
});
test('aggregate byte cap across individually valid pages',async()=>{
  const body=JSON.stringify({data:[{note:'x'.repeat(1024*1024)}]});const t=transport({nativeFetch:async()=>new Response(body)});
  await assert.rejects(t.run('journal',async()=>{for(let i=1;i<=17;i++)await t.fetch(records(i));}));
  assert.equal(t.counters.calls,16);
});
test('expired, revoked and changed authority refuses even an in-flight response',async()=>{
  let current=true;const t=transport({verifyCurrent:async()=>assert.ok(current),nativeFetch:async()=>{current=false;return Response.json({data:[]});}});
  await assert.rejects(t.run('journal',()=>t.fetch(records(1))));
  let now=0;const expired=transport({clock:()=>now});await assert.rejects(expired.run('journal',()=>{now=L.operationMs;return expired.fetch(records(1));}));
  const stopped=transport();stopped.stop();await assert.rejects(stopped.run('journal',async()=>{}));
});
test('provider errors sanitized; no retry; no private data in result projection',async()=>{
  const t=transport({nativeFetch:async()=>new Response('synthetic-private-credential',{status:403})});
  await t.run('journal',async()=>assert.equal(await(await t.fetch(records(1))).text(),'{}'));
  assert.equal(t.counters.calls,1);assert.deepEqual(historyResultProjection({status:'already_running',held_by:'private'}),{status:'already_running'});
  assert.deepEqual(historyResultProjection({status:'failed',phone:'private'}),{status:'failed'});
});

test('catalogue replay is refused independently of journal page ordering',async()=>{
  const t=transport();await assert.rejects(t.run('labels',async()=>{await t.fetch(base+'services/12345');await t.fetch(base+'services/12345');}));
});
test('explicit foreign company in provider response is refused',async()=>{
  const t=transport({nativeFetch:async()=>Response.json({data:[{id:1,company_id:99999}]})});await assert.rejects(t.run('journal',()=>t.fetch(records(1))));
});
