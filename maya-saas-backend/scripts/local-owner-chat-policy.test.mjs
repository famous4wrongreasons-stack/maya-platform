import { OWNER_HISTORY_REVIEW_PROFILE, HISTORY_REVIEW_QUESTIONS, HISTORY_REVIEW_TOOLS } from './local-owner-history-review-policy.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { OWNER_CHAT_QUESTIONS, OWNER_CHAT_TOOLS, assertOwnerChatScope, assertOwnerChatActor,
  assertOwnerChatTool, ownerChatIngress, createOwnerChatWindow } from './local-owner-chat-policy.mjs';
import { verifyOwnerChatDatabase, installOwnerChat } from './local-owner-chat-runtime.mjs';
import { createReadTransport } from './local-yclients-read-transport.mjs';
import { CandidateBudgetGate, candidateReservation, CORE_OWNER_READ_LIMITS_SHA256 } from './conversation-qualification/current-candidate-budget.mjs';
import { OWNER_CHAT_PROFILE } from './local-owner-chat-policy.mjs';

export const scope = Object.freeze({ stateDirectory: '/private/tmp/maya-synthetic-owner-chat',
  initialManifestSha256: 'a'.repeat(64), privateStateSha256: 'b'.repeat(64),
  restartReceiptPath: '/private/tmp/maya-synthetic-owner-restart/restart.json', restartReceiptSha256: 'c'.repeat(64),
  tenantId: 'synthetic-tenant-a', userId: 'synthetic-owner-a', branchId: 'synthetic-branch-a',
  tenantSlug: 'synthetic-owner-salon', companyId: '321' });
const user = { tenantId: scope.tenantId, userId: scope.userId, role: 'tenant_owner', membershipStatus: 'active' };
const origin = 'http://127.0.0.1:58117';
const body = (i = 0) => ({ surface: 'web', audience: 'owner', requestId: `request_000${i}`, messages: [{ role: 'user', content: OWNER_CHAT_QUESTIONS[i] }] });
const request = (i = 0) => ({ method: 'POST', originalUrl: '/api/ai/chat', user, body: body(i) });
const ingress = (method, url, data, headers = {}) => ownerChatIngress(method, url, headers, data, origin, scope);

test('owner profile requires the existing admission validator; request keys remain closed', t => {
  const root=fs.mkdtempSync('/private/tmp/maya-owner-budget-');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config={ledgerPath:path.join(root,'ledger.jsonl'),manifestSha256:'a'.repeat(64),candidateCommit:'b'.repeat(40),profile:OWNER_CHAT_PROFILE,mode:'ADMITTED_MODEL_ONLY',transport:async()=>{throw Error('no network')}};
  assert.throws(()=>new CandidateBudgetGate(config),/candidate_admitted_transport_required/);
  const seen=[];
  const gate=new CandidateBudgetGate({...config,assertAdmission(binding){seen.push(binding)}});
  assert.deepEqual(seen,[{candidateCommit:config.candidateCommit,manifestSha256:config.manifestSha256,profile:OWNER_CHAT_PROFILE,limitsSha256:CORE_OWNER_READ_LIMITS_SHA256}]);
  gate.close();
  const body={model:'deepseek-v4-pro',messages:[{role:'user',content:'synthetic'}],max_tokens:20,stream:false,thinking:{type:'disabled'}};
  assert.throws(()=>candidateReservation('https://api.deepseek.com/chat/completions',{method:'POST',body:JSON.stringify({...body,[OWNER_CHAT_PROFILE]:true})},OWNER_CHAT_PROFILE),/candidate_model_contract/);
});

test('fixed owner questions admit ordinary DTO only; stage 0/setup/writes/voice remain outside this window', () => {
  assertOwnerChatScope(scope);
  for (let i=0; i<3; i++) assert.equal(ingress('POST', '/api/ai/chat', body(i)), null);
  for (const path of ['/api/integrations/crm/connect', '/api/integrations/crm/activate', '/api/onboarding/trial', '/api/ai/transcribe', '/api/appointments', '/api/widgets/act', '/api/ai/tools/execute'])
    assert.notEqual(ingress('POST', path, body()), null);
  for (const data of [{...body(),tenantId:scope.tenantId}, {...body(),audience:'client'}, {...body(),surface:'voice'},
    {...body(),messages:[{role:'user',content:'Запиши меня'}]}, {...body(),messages:[{role:'user',content:'Измени цену'},...body().messages]}])
    assert.notEqual(ingress('POST','/api/ai/chat',data), null);
  assert.notEqual(ingress('POST','/api/ai/chat',body(),{origin:'https://foreign.invalid'}),null);
  assert.notEqual(ingress('POST','/api/auth/login',{tenantSlug:'foreign',email:'synthetic@example.invalid',password:'synthetic'}),null);
});

test('exact authenticated owner/current membership; caller IDs or roles cannot widen scope', () => {
  assertOwnerChatActor(user,scope);
  for (const changed of [{...user,tenantId:'foreign'}, {...user,userId:'foreign'}, {...user,role:'platform_owner'}, {...user,membershipStatus:'revoked'}, {...user,role:'client'}])
    assert.throws(()=>assertOwnerChatActor(changed,scope));
  for (const tool of OWNER_CHAT_TOOLS) assertOwnerChatTool(user,tool,scope);
  for (const tool of ['appointments.create','catalog.service.price.update','clients.list','financial.summary.read','business.rules.read'])
    assert.throws(()=>assertOwnerChatTool(user,tool,scope));
});

test('serial finite questions reject replay, overlap, wrong order, expiry and closed context', () => {
  let now=1000; const window=createOwnerChatWindow(scope,{now:()=>now,durationMs:100});
  assert.throws(()=>window.begin(request(1)));
  const first=window.begin(request()); first.assertCurrent(user);
  assert.throws(()=>window.begin(request(1))); first.finish();
  assert.throws(()=>first.assertCurrent(user)); assert.throws(()=>window.begin(request()));
  const second=window.begin(request(1)); second.finish();
  const third=window.begin(request(2)); third.finish(); assert.throws(()=>window.begin(request(2)));
  now=1100; assert.throws(()=>window.begin(request()));
  const other=createOwnerChatWindow(scope); other.close(); assert.throws(()=>other.begin(request()));
});

function database() {
  const values = { tenant:{slug:scope.tenantSlug,status:'trial'},user:{tenantId:scope.tenantId,role:'tenant_owner',status:'active'},membership:{id:'membership'},branch:{tenantId:scope.tenantId},
    crmIntegration:{status:'active',provider:'yclients',baseUrl:null,verifiedAt:new Date(),settingsJson:{companyId:scope.companyId,acceptedImportSnapshotHash:'d'.repeat(64),branchBinding:{contract:'maya.crm-branch-binding/1',companyId:scope.companyId,branchId:scope.branchId}}}};
  return { values, prisma:Object.fromEntries(Object.keys(values).map(key=>[key,{findUnique:async()=>values[key],findFirst:async()=>values[key]}])) };
}
test('retained database checks active integration, exact branch/company and current owner without tokens', async () => {
  const f=database(); assert.equal(await verifyOwnerChatDatabase(f.prisma,scope),'321');
  for (const [key,value] of [['tenant',{...f.values.tenant,status:'suspended'}],['user',{...f.values.user,status:'suspended'}],['membership',null],['branch',{tenantId:'foreign'}],['crmIntegration',{...f.values.crmIntegration,status:'inactive'}]]) {
    const prior=f.values[key];f.values[key]=value;await assert.rejects(verifyOwnerChatDatabase(f.prisma,scope));f.values[key]=prior;
  }
  f.values.crmIntegration.settingsJson.companyId='999';await assert.rejects(verifyOwnerChatDatabase(f.prisma,scope));
});

test('native transport is default-deny for chat; restricted admission still forbids clients, records, writes and foreign company', async () => {
  let calls=0;
  const native=async()=>{calls++;return new Response('{"success":true,"data":{}}')};
  const legacy=createReadTransport(native,async()=>321);
  await legacy.run(request(),new EventEmitter(),async()=>assert.rejects(legacy.fetch('https://api.yclients.com/api/v1/company/321',{method:'GET'})));
  assert.equal(calls,0);
  for (const [url,method,admitted] of [['company/321','GET',true],['clients/321','GET',false],['records/321','GET',false],['record/321','POST',false],['company/999','GET',false],['companies?my=1','GET',false]]) {
    const guard=createReadTransport(native,async()=>321,Date.now,()=>{}, {allowOwnerChat:async req=>{assertOwnerChatActor(req.user,scope);return true;}});
    await guard.run(request(),new EventEmitter(),async()=>{
      const dispatch=()=>guard.fetch('https://api.yclients.com/api/v1/'+url,{method});
      if(admitted) assert.equal((await dispatch()).status,200); else await assert.rejects(dispatch());
    });
  }
  assert.equal(calls,1);
});

test('installed local boundary retains original allowed read owner and blocks all Action Engine entry, including internal calls', async () => {
  const f=database(); let readCalls=0,actionCalls=0;
  const tokens={}; const fakeRequire = file => {
    if(file==='@nestjs/common') return {ForbiddenException:class extends Error{}};
    const names={'@nestjs/config':'ConfigService','ai-core.service.js':'AiCoreService','ai-tool-runtime.service.js':'AiToolRuntimeService','action-engine.runtime.js':'ActionEngineRuntimeService'};
    const name=names[file] ?? names[file.split('/').at(-1)]; assert.ok(name); tokens[name] ??= {name};return {[name]:tokens[name]};
  };
  const tools={listTools:async()=>({tools:[...OWNER_CHAT_TOOLS,'appointments.create'].map(name=>({name}))}),execute:async()=>{readCalls++;return 'canonical-read';},replayCompletedRead:async()=>{readCalls++;return 'canonical-replay';}};
  const core={chat:async u=>tools.execute(u,'catalog.services.read',{})};
  const engine={execute:async()=>{actionCalls++;},executeWithReceipt:async()=>{actionCalls++;}};
  const services={AiCoreService:core,AiToolRuntimeService:tools,ActionEngineRuntimeService:engine,ConfigService:{set(){}}};
  const app={get:token=>services[token.name],useGlobalInterceptors(i){this.interceptor=i;}};
  const launch={manifest:{ownerScope:scope,limits:{model:'deepseek-v4-pro',outputPerAttempt:2048}},admission:{expiresAt:Date.now()+600000},assertCurrent(){}};
  const installed=await installOwnerChat({app,prisma:f.prisma,require:fakeRequire,backend:process.cwd(),launch,providerFetch:async()=>{throw Error('no network')}});
  assert.deepEqual((await tools.listTools(user,'web')).tools.map(t=>t.name),OWNER_CHAT_TOOLS);
  await assert.rejects(tools.execute(user,'catalog.services.read',{})); // no live chat context
  assert.equal(await core.chat(user,body()),'canonical-read');assert.equal(readCalls,1);
  await assert.rejects(core.chat({...user,tenantId:'foreign'},body(1)));
  assert.throws(()=>engine.execute()); assert.throws(()=>engine.executeWithReceipt());assert.equal(actionCalls,0);
  installed.stop();await assert.rejects(core.chat(user,body(1)));
});

test('model adapter uses the existing private broker socket with exact turn binding and drops application authorization', async t => {
  const root=fs.mkdtempSync('/private/tmp/maya-owner-socket-');fs.chmodSync(root,0o700);
  const channel=path.join(root,'channel');fs.mkdirSync(channel,{mode:0o700});fs.chownSync(channel,process.getuid(),process.getgid());
  const socket=path.join(channel,'b.sock'), requests=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req) body+=chunk;
    requests.push({path:req.url,headers:req.headers,body});res.setHeader('content-type','application/json');res.end('{"synthetic":true}');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve)});fs.chmodSync(socket,0o600);
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
  const target={host:'localhost',workDirectory:process.cwd(),brokerUid:process.getuid(),runnerUid:process.getuid(),brokerSocket:{path:socket,gid:process.getgid()}};
  const f=database();let installed,nativeCalls=0;
  const modelBody=JSON.stringify({model:'deepseek-v4-pro',messages:[{role:'user',content:'synthetic'}],max_tokens:20,stream:false,thinking:{type:'disabled'}});
  const call=()=>installed.fetch('https://api.deepseek.com/chat/completions',{method:'POST',body:modelBody,headers:{authorization:'Bearer SYNTHETIC_APP_ONLY'},signal:AbortSignal.timeout(5000)});
  const services={ConfigService:{set(){}},AiCoreService:{chat:async()=>call()},AiToolRuntimeService:{listTools:async()=>({tools:[]}),execute:async()=>{},replayCompletedRead:async()=>{}},ActionEngineRuntimeService:{execute(){},executeWithReceipt(){}}};
  const fakeRequire=file=>{
    if(file==='@nestjs/common')return {ForbiddenException:class extends Error{}};
    const names={'@nestjs/config':'ConfigService','ai-core.service.js':'AiCoreService','ai-tool-runtime.service.js':'AiToolRuntimeService','action-engine.runtime.js':'ActionEngineRuntimeService'};
    const name=names[file]??names[file.split('/').at(-1)];return {[name]:name};
  };
  const launch={manifest:{ownerScope:scope,manifestSha256:'e'.repeat(64),admissionContext:{target},limits:{model:'deepseek-v4-pro',outputPerAttempt:2048}},admission:{expiresAt:Date.now()+60000},assertCurrent(){}};
  installed=await installOwnerChat({app:{get:name=>services[name],useGlobalInterceptors(){}},prisma:f.prisma,require:fakeRequire,backend:process.cwd(),launch,providerFetch:async()=>{nativeCalls++;throw Error('native dispatch forbidden')}});
  await assert.rejects(call(),/owner_chat_model_request_required/);
  assert.deepEqual(await (await services.AiCoreService.chat(user,body())).json(),{synthetic:true});
  assert.equal(requests.length,1);assert.equal(nativeCalls,0);
  assert.equal(requests[0].path,'/chat/completions');assert.equal(requests[0].body,modelBody);
  assert.equal(requests[0].headers.authorization,undefined);
  assert.equal(requests[0].headers['x-candidate-manifest'],'e'.repeat(64));
  assert.equal(requests[0].headers['x-candidate-case'],'owner-salon-services');
  assert.equal(requests[0].headers['x-candidate-turn'],'1');installed.stop();
});

test('history review boundary retains original allowed read owner and blocks all Action Engine entry, including internal calls', async () => {
  const body=i=>({surface:'web',requestId:'history-review-'+(i??0),messages:[{role:'user',content:HISTORY_REVIEW_QUESTIONS[i??0]}]});
  const f=database(); let readCalls=0,actionCalls=0;
  const tokens={}; const fakeRequire = file => {
    if(file==='@nestjs/common') return {ForbiddenException:class extends Error{}};
    const names={'@nestjs/config':'ConfigService','ai-core.service.js':'AiCoreService','ai-tool-runtime.service.js':'AiToolRuntimeService','action-engine.runtime.js':'ActionEngineRuntimeService'};
    const name=names[file] ?? names[file.split('/').at(-1)]; assert.ok(name); tokens[name] ??= {name};return {[name]:tokens[name]};
  };
  const tools={listTools:async()=>({tools:[...HISTORY_REVIEW_TOOLS,'appointments.create'].map(name=>({name}))}),execute:async()=>{readCalls++;return 'canonical-read';},replayCompletedRead:async()=>{readCalls++;return 'canonical-replay';}};
  const core={chat:async u=>tools.execute(u,'appointments.own.list',{})};
  const engine={execute:async()=>{actionCalls++;},executeWithReceipt:async()=>{actionCalls++;}};
  const services={AiCoreService:core,AiToolRuntimeService:tools,ActionEngineRuntimeService:engine,ConfigService:{set(){}}};
  const app={get:token=>services[token.name],useGlobalInterceptors(i){this.interceptor=i;}};
  const launch={manifest:{profile:OWNER_HISTORY_REVIEW_PROFILE,ownerScope:scope,limits:{model:'deepseek-v4-pro',outputPerAttempt:2048}},admission:{expiresAt:Date.now()+600000},assertCurrent(){}};
  const installed=await installOwnerChat({app,prisma:f.prisma,require:fakeRequire,backend:process.cwd(),launch,providerFetch:async()=>{throw Error('no network')}});
  assert.deepEqual((await tools.listTools(user,'web')).tools.map(t=>t.name),HISTORY_REVIEW_TOOLS);
  await assert.rejects(tools.execute(user,'appointments.own.list',{})); // no live chat context
  assert.equal(await core.chat(user,body()),'canonical-read');assert.equal(readCalls,1);
  await assert.rejects(core.chat({...user,tenantId:'foreign'},body(1)));
  assert.throws(()=>engine.execute()); assert.throws(()=>engine.executeWithReceipt());assert.equal(actionCalls,0);
  installed.stop();await assert.rejects(core.chat(user,body(1)));
});
