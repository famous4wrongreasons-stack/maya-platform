import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIVATE_KEYS, profileEnvironment } from './local-onboarding-profile.mjs';
import { HISTORY_REVIEW_QUESTIONS as questions, OWNER_HISTORY_REVIEW_PROFILE, historyReviewIngress, createHistoryReviewWindow, assertHistoryPlanningRequest } from './local-owner-history-review-policy.mjs';
import { createOwnerHistoryTransport } from './local-owner-history-transport.mjs';
import { resumePlan } from './local-yclients-read-resume.mjs';
const scope = { stateDirectory:'/private/tmp/synthetic-history-review', initialManifestSha256:'a'.repeat(64), privateStateSha256:'b'.repeat(64),
  restartReceiptPath:'/private/tmp/synthetic-history-review/restart.json', restartReceiptSha256:'c'.repeat(64), tenantId:'synthetic-tenant', userId:'synthetic-owner', branchId:'synthetic-branch', tenantSlug:'synthetic-salon', companyId:'12345' };
const actor = { tenantId:scope.tenantId, userId:scope.userId, role:'tenant_owner', membershipStatus:'active' };
const origin = 'http://127.0.0.1:56151';
const body = i => ({ surface:'web', requestId:'synthetic-request-'+i, messages:[{role:'user',content:questions[i]}] });
const ingress = (method, route, data, headers={}) => historyReviewIngress(method, route, headers, data, origin, scope);

test('existing history review admits exactly two typed questions and canonical confirmed setting; no import or authority inputs', () => {
  for (let i=0;i<2;i++) assert.equal(ingress('POST','/api/ai/chat',body(i)),null);
  const setting={confirmed:true,namespace:'client_capabilities',expectedRevision:0,previousRevisionId:null,content:{client_self_visit_history:true}};
  assert.equal(ingress('POST','/api/governed-settings/tenant',setting,{'idempotency-key':'synthetic-review-key'}),null);
  for (const route of ['/api/widgets/act','/api/integrations/crm/activate','/api/client-channel/challenges','/api/ai/tools/execute','/api/auth/phone/start','/api/ai/transcribe']) assert.notEqual(ingress('POST',route,{}),null);
  for (const data of [{...body(0),clientId:'foreign'},{...body(0),surface:'voice'},{...body(0),audience:'client'},
    {...body(0),messages:[{role:'user',content:'Запиши меня'}]}, {...body(0),messages:[{role:'user',content:'Измени цену'},...body(0).messages]}]) assert.notEqual(ingress('POST','/api/ai/chat',data),null);
  assert.notEqual(ingress('POST','/api/ai/chat',body(0),{origin:'https://foreign.invalid'}),null);
  assert.notEqual(ingress('POST','/api/governed-settings/tenant',{...setting,confirmed:false}),null);
});

test('serialized sequence rejects foreign actor, replay, concurrency, expiry and closed request', () => {
  let clock=1000; const w=createHistoryReviewWindow(scope,{now:()=>clock,durationMs:100});
  assert.throws(()=>w.begin({user:actor,body:body(1)}));
  for(const changed of [{tenantId:'foreign'},{userId:'foreign'},{role:'client'},{membershipStatus:'revoked'}]) assert.throws(()=>w.begin({user:{...actor,...changed},body:body(0)}));
  const a=w.begin({user:actor,body:body(0)});a.assertCurrent(actor);
  assert.throws(()=>w.begin({user:actor,body:body(1)}));a.finish();assert.throws(()=>a.assertCurrent(actor));
  assert.throws(()=>w.begin({user:actor,body:body(0)}));
  const b=w.begin({user:actor,body:body(1)});clock=1100;assert.throws(()=>b.assertCurrent(actor));b.finish();
  assert.throws(()=>w.begin({user:actor,body:body(1)}));w.close();
});

test('actual model wire must contain only fixed user questions, no private history, memory, assistant or result phase', () => {
  const input={phase:'tool_planning',conversation:body(0).messages,tool_results:[],remembered_notes:[],semantic_plan:null};
  const wire=value=>({body:JSON.stringify({messages:[{role:'system',content:'synthetic canonical instructions'},{role:'user',content:JSON.stringify(value)}]})});
  assertHistoryPlanningRequest(wire(input));
  for(const changed of [ {phase:'final_response'}, {tool_results:[{private:'visit'}]}, {remembered_notes:['private']}, {semantic_plan:{private:'visit'}},
    {pending_owner_review:{}}, {grounding_corrections:[]}, {conversation:[{role:'assistant',content:'private history'},...body(0).messages]},
    {conversation:[{role:'user',content:'My private phone'},...body(0).messages]} ]) assert.throws(()=>assertHistoryPlanningRequest(wire({...input,...changed})));
});

test('review transport cannot import even through direct journal operation; labels still use exact company and existing bounded transport', async () => {
  let calls=0;const transport=createOwnerHistoryTransport({plan:{scope},allowJournal:false,assertCurrent(){},verifyCurrent:async()=>{},nativeFetch:async()=>{calls++;return Response.json({data:[{id:1,company_id:12345}]});}});
  await assert.rejects(transport.run('journal',async()=>{}));assert.equal(calls,0);
  await transport.run('labels',()=>transport.fetch('https://api.yclients.com/api/v1/staff/12345',{method:'GET'}));assert.equal(calls,1);
  await assert.rejects(transport.run('labels',()=>transport.fetch('https://api.yclients.com/api/v1/records/12345',{method:'GET'})));assert.equal(calls,1);
  transport.stop();await assert.rejects(transport.run('labels',async()=>{}));
});

test('thirty-minute retained review prepares builds and starts the existing database, never migrations or seed', () => {
  const env=profileEnvironment({}, {databaseUrl:'postgresql://maya_local_onboarding:'+ 'c'.repeat(64)+'@127.0.0.1:56149/maya_local_onboarding_0123456789abcdef',keys:Object.fromEntries(PRIVATE_KEYS.map((k,i)=>[k,(i+1).toString(16).padStart(64,'0')])),apiPort:56150,origin,stateDirectory:scope.stateDirectory});
  const plan=resumePlan(env,scope.stateDirectory,'/opt/homebrew/opt/postgresql@16/bin',30,'/private/tmp/synthetic-history-review-output',false,false,OWNER_HISTORY_REVIEW_PROFILE);
  assert.equal(plan.durationMs,1800000);
  assert.deepEqual(plan.setup.map(x=>x.name),['backend-build','react-build','pg-start']);
  assert.throws(()=>resumePlan(env,scope.stateDirectory,'/opt/homebrew/opt/postgresql@16/bin',30,'/private/tmp/synthetic-output'));
});
