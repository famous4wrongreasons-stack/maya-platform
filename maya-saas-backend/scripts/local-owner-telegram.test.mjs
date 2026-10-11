import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ownerTelegramIngress, telegramProviderRoute, OWNER_TELEGRAM_PROFILE, TELEGRAM_LIMITS } from './local-owner-telegram-policy.mjs';
import { createOwnerTelegramTransport } from './local-owner-telegram-transport.mjs';
import { assertOwnerTelegramPlan, readOwnerTelegramLaunch } from './local-owner-telegram-launch.mjs';
import { realReadIngress } from './local-yclients-read-profile.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const origin = 'http://127.0.0.1:56151', clientId = '123456789', companyId = '12345';
const scope = { stateDirectory: '/private/tmp/synthetic-telegram-state', initialManifestSha256: '1'.repeat(64),
  privateStateSha256: '2'.repeat(64), restartReceiptPath: '/private/tmp/synthetic-telegram-proof/restart.json',
  restartReceiptSha256: '3'.repeat(64), tenantId: 'tenant-a', userId: 'owner-a', branchId: 'branch-a', tenantSlug: 'synthetic-salon', companyId };
const source = { head: 'a'.repeat(40), files: [{ path: 'synthetic-source', sha256: 'a'.repeat(64) }] };
const makePlan = () => ({ contract: OWNER_TELEGRAM_PROFILE, candidateCommit: source.head, sourceSha256: hash(JSON.stringify(source)),
  scope, origin, clientId, notBefore: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), ownerApprovalRef: 'synthetic-owner-approval-only' });
const operation = () => ({ purpose: 'login', code: 'synthetic-code', verifier: 'synthetic-verifier', redirectUri: origin + '/oauth-callback.html', verifiedOwner: true });
const token = () => ({ method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
  code: 'synthetic-code', code_verifier: 'synthetic-verifier', redirect_uri: origin + '/oauth-callback.html' }) });
const registry = (page = 1) => ({ method: 'POST', body: JSON.stringify({ fields: ['id','name','phone','visits_count','sold_amount','last_visit_date'], filters: [], page, page_size: 200 }) });
const registryUrl = `https://api.yclients.com/api/v1/company/${companyId}/clients/search`;
const tokenUrl = 'https://oauth.telegram.org/token';
test('finite mode admits exact saved login/link/read shape, never broadens setup', () => {
  const body = { tenantSlug: scope.tenantSlug, platform: 'web', redirectUri: origin + '/oauth-callback.html' };
  assert.equal(ownerTelegramIngress('POST','/api/auth/oauth/telegram/start',{},body,origin,scope),null);
  assert.notEqual(realReadIngress('POST','/api/auth/oauth/telegram/start',{},body,origin),null);
  for (const route of ['/api/client-channel/profile','/api/client-channel/appointments','/api/client-channel/status'])
    assert.equal(ownerTelegramIngress('GET',route,{},undefined,origin,scope),null);
});
for (const [name, method, route, body, headers] of [
  ['foreign tenant','POST','/api/auth/login',{tenantSlug:'other',email:'synthetic@example.invalid',password:'synthetic-only'},{}],
  ['foreign origin','GET','/api/client-channel/profile',undefined,{origin:'https://foreign.invalid'}],
  ['caller Client','GET','/api/client-channel/profile?clientId=foreign',undefined,{}],
  ['SMS','POST','/api/auth/phone/start',{},{}],
  ['binding challenge','POST','/api/client-channel/challenges',{},{}],
  ['consent','POST','/api/client-channel/consent',{privacy:true},{}],
  ['history setting','POST','/api/governed-settings/tenant',{},{}],
  ['model chat','POST','/api/ai/chat',{},{}],
  ['widget action','POST','/api/widgets/intent',{},{}],
  ['import','POST','/api/integrations/crm/activate',{},{}],
  ['refresh','POST','/api/auth/refresh',{refreshToken:'synthetic-only'},{}],
  ['directory enumeration','GET','/api/mobile/pwa/search?q=other',undefined,{}],
  ['native return','POST','/api/auth/oauth/telegram/start',{tenantSlug:scope.tenantSlug,platform:'native',redirectUri:'mayaos://oauth-callback'},{}],
]) test('ingress refuses '+name, () => assert.notEqual(ownerTelegramIngress(method,route,headers,body,origin,scope),null));
test('exact OIDC exchange and canonical paginated registry read only', () => {
  assert.equal(telegramProviderRoute(tokenUrl,token(),operation(),clientId,companyId),'telegram_token');
  assert.equal(telegramProviderRoute(registryUrl,registry(),operation(),clientId,companyId),'client_registry');
  assert.equal(telegramProviderRoute(registryUrl,registry(),{...operation(),purpose:'link'},clientId,companyId),null);
  assert.equal(telegramProviderRoute(registryUrl,registry(),{...operation(),verifiedOwner:false},clientId,companyId),null);
  for (const key of ['client_id','code','code_verifier','redirect_uri']) {
    const init=token(); init.body.set(key,'substituted'); assert.equal(telegramProviderRoute(tokenUrl,init,operation(),clientId,companyId),null);
  }
});
for (const [label,url,init] of [
  ['other company',registryUrl.replace(companyId,'99999'),registry()],
  ['booking',`https://api.yclients.com/api/v1/records/${companyId}`,{method:'POST',body:'{}'}],
  ['other host',registryUrl.replace('api.yclients.com','foreign.invalid'),registry()],
  ['encoded path',registryUrl.replace('company','%63ompany'),registry()],
  ['userinfo',registryUrl.replace('https://','https://user@'),registry()],
  ['fragment',registryUrl+'#x',registry()],
  ['query',registryUrl+'?x=1',registry()],
  ['filter substitution',registryUrl,{method:'POST',body:registry().body.replace('"filters":[]','"filters":["foreign"]')}],
  ['page widening',registryUrl,registry(TELEGRAM_LIMITS.registryPages+1)],
]) test('provider refuses '+label,()=>assert.equal(telegramProviderRoute(url,init,operation(),clientId,companyId),null));
function transport(extra={}) {
  return createOwnerTelegramTransport({clientId,companyId,assertCurrent:()=>{},verifyCurrent:async()=>{},
    nativeFetch:async()=>new Response('{"success":true,"data":[]}'),...extra});
}
test('transport returns exact bytes, strips error body, no follow-redirect',async()=>{
  let options;
  const t=transport({nativeFetch:async(_url,init)=>{options=init;return new Response('{"success":true,"data":[]}');}});
  await t.run(operation(),async()=>assert.equal(await (await t.fetch(registryUrl,registry())).text(),'{"success":true,"data":[]}'));
  assert.equal(options.redirect,'error'); assert.ok(options.signal);
  const bad=transport({nativeFetch:async()=>new Response('SECRET-BEARING PROVIDER ERROR',{status:403})});
  await bad.run(operation(),async()=>assert.equal(await(await bad.fetch(tokenUrl,token())).text(),'{}'));
});
test('background, replay, concurrent exchange and repeated page fail closed',async()=>{
  const t=transport(); await assert.rejects(t.fetch(tokenUrl,token()));
  await t.run(operation(),async()=>{
    await t.fetch(tokenUrl,token());
    await assert.rejects(t.run(operation(),async()=>{}),/busy/);
    await assert.rejects(t.fetch(tokenUrl,token()));
    await assert.rejects(t.fetch(registryUrl,registry())); // Poisoned operation cannot continue.
  });
  await t.run(operation(),async()=>{await t.fetch(registryUrl,registry());await assert.rejects(t.fetch(registryUrl,registry()));});
});
test('expired, stopped and changed current authority cannot dispatch',async()=>{
  let now=0,calls=0,current=true;
  const t=transport({clock:()=>now,verifyCurrent:async()=>assert.ok(current),nativeFetch:async()=>{calls++;return new Response('{}');}});
  await t.run(operation(),async()=>{now=TELEGRAM_LIMITS.operationMs;await assert.rejects(t.fetch(tokenUrl,token()));});
  current=false; await t.run(operation(),async()=>assert.rejects(t.fetch(tokenUrl,token())));
  t.stop(); await assert.rejects(t.run(operation(),async()=>{})); assert.equal(calls,0);
});
test('current authority reread after provider response; oversized response refused',async()=>{
  let current=true;
  const t=transport({verifyCurrent:async()=>assert.ok(current),nativeFetch:async()=>{current=false;return new Response('{}');}});
  await t.run(operation(),async()=>assert.rejects(t.fetch(tokenUrl,token())));
  const large=transport({nativeFetch:async()=>new Response('x'.repeat(65537))});
  await large.run(operation(),async()=>assert.rejects(large.fetch(tokenUrl,token())));
});
test('aborted browser request cannot dispatch or accept an in-flight response',async()=>{
  const abort=new AbortController(); let calls=0;
  const t=transport({nativeFetch:async(_url,init)=>{calls++;abort.abort();assert.equal(init.signal.aborted,true);return new Response('{}');}});
  await t.run({...operation(),signal:abort.signal},async()=>assert.rejects(t.fetch(tokenUrl,token())));
  await t.run({...operation(),signal:abort.signal},async()=>assert.rejects(t.fetch(tokenUrl,token())));
  assert.equal(calls,1);
});
for (const [name, change] of [
  ['changed candidate',p=>{p.candidateCommit='b'.repeat(40);}],
  ['changed source',p=>{p.sourceSha256='b'.repeat(64);}],
  ['missing approval',p=>{delete p.ownerApprovalRef;}],
  ['unapproved scope field',p=>{p.scope={...p.scope,clientId:'caller-selected'};}],
  ['expired',p=>{p.expiresAt=new Date(Date.now()-1).toISOString();}],
  ['future',p=>{p.notBefore=new Date(Date.now()+60000).toISOString();}],
  ['wide window',p=>{p.expiresAt=new Date(Date.now()+3600000).toISOString();}],
  ['foreign origin',p=>{p.origin='http://foreign.invalid:56151';}],
]) test('execution plan refuses '+name,()=>{const p=makePlan();change(p);assert.throws(()=>assertOwnerTelegramPlan(p,source,'synthetic-owner-approval-only'));});
test('private pinned plan has one runner and one child; substitutions/replay refused',()=>{
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'maya-telegram-plan-unit-'))); fs.chmodSync(dir,0o700);
  const file=path.join(dir,'plan.json'),p=makePlan(),bytes=JSON.stringify(p),pin=hash(bytes);
  fs.writeFileSync(file,bytes,{mode:0o600});
  try {
    const args=[file,pin,p.ownerApprovalRef,()=>source];
    const inspected=readOwnerTelegramLaunch(...args);assert.throws(()=>inspected.assertCurrent());
    assert.throws(()=>readOwnerTelegramLaunch(...args,'child'));
    const run=readOwnerTelegramLaunch(...args,'claim'); run.assertCurrent();
    assert.throws(()=>readOwnerTelegramLaunch(...args,'claim'));
    readOwnerTelegramLaunch(...args,'child').assertCurrent();
    assert.throws(()=>readOwnerTelegramLaunch(...args,'child'));
    fs.writeFileSync(file,bytes+' '); assert.throws(()=>run.assertCurrent());
  } finally { fs.rmSync(dir,{recursive:true}); }
});
