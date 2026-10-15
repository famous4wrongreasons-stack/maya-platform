import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {phoneAiEgress} from './phone-ai-egress.mjs';
import {validatePhoneAiScope,assertPhoneAiActor,assertPhoneAiPayload,PHONE_AI_TOOLS} from './phone-ai-scope.mjs';
import {installPhoneAi} from './phone-ai-runtime.mjs';
import {phoneAiCarryForward} from './phone-ai-continuation.mjs';
import {createHash} from 'node:crypto';
import {CandidateBudgetGate,CORE_PHONE_READ_PROFILE,CORE_DIAGNOSTIC_PROFILE} from './conversation-qualification/current-candidate-budget.mjs';
const now=Date.now(),pin='a'.repeat(64);
const scope={contract:'maya.phone-owner-ai/1',approvalRef:'owner-20261015-phone-deepseek-24h-usd2',candidate:'b'.repeat(40),tenantId:'tenant-a',userId:'user-a',branchId:'branch-a',tenantSlug:'synthetic-salon',companyId:'321',notBefore:new Date(now-1000).toISOString(),expiresAt:new Date(now+86399000).toISOString(),maxCalls:100,maxSpendNanoUsd:2000000000};
const user={tenantId:scope.tenantId,userId:scope.userId,role:'tenant_owner',membershipStatus:'active'};
const wire=(patch={})=>JSON.stringify({model:'deepseek-v4-pro',messages:[{role:'system',content:'Synthetic canonical instruction'},{role:'user',content:JSON.stringify({phase:'tool_planning',conversation:[{role:'user',content:'Привет'}],remembered_notes:[],tool_results:[],available_tools:PHONE_AI_TOOLS.map(name=>({name})),...patch})}],max_tokens:128,thinking:{type:'disabled'},stream:false});
const answer=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'Привет!'}}],usage:{prompt_tokens:100,completion_tokens:5,total_tokens:105}}),{status:200});
async function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maya-phone-ai-test-'));let time=now,current=true;const calls=[];
 const app=phoneAiEgress({carryForward:options.carryForward,scope,pin,credential:'synthetic_not_real_key',ledgerPath:dir+'/ledger.jsonl',testClock:()=>time,testWait:async ms=>{time+=ms;},assertCurrent(){assert.ok(current);},nativeFetch:async(...args)=>{calls.push(args);return options.fetch?options.fetch(...args):answer();}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const request=(body=wire(),extra={},method='POST',target='/chat/completions')=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:app.server.address().port,method,path:target,agent:false,headers:{'content-type':'application/json','x-maya-scope':pin,'x-maya-tenant':scope.tenantId,'x-maya-user':scope.userId,...extra}},res=>{let text='';res.on('data',b=>{text+=b});res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end(body);
 });
 t.after(async()=>{app.revoke();app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {...app,dir,calls,request,setTime:t=>{time=t},withdraw:()=>{current=false}};
}
test('exact 24h/100/$2 scope and authenticated owner only',()=>{
 assert.deepEqual(validatePhoneAiScope(scope,now),scope);assertPhoneAiActor(user,scope);
 for(const patch of [{maxCalls:101},{maxSpendNanoUsd:2000000001},{tenantId:'*'},{contract:'anything'},{approvalRef:'invented'},{expiresAt:new Date(now+86400000).toISOString()},{notBefore:new Date(now+1).toISOString()}])assert.throws(()=>validatePhoneAiScope({...scope,...patch},now));
 for(const patch of [{tenantId:'other'},{userId:'other'},{role:'platform_owner'},{membershipStatus:'revoked'}])assert.throws(()=>assertPhoneAiActor({...user,...patch},scope));
});
test('canonical catalogue wire only; personal tools/history/contacts refused',()=>{
 assertPhoneAiPayload({method:'POST',body:wire()});
 assertPhoneAiPayload({method:'POST',body:wire({conversation:[{role:'user',content:'Привет, я [name removed]@0123456789abcdef0123456789abcdef_1'}]})});
 assert.throws(()=>assertPhoneAiPayload({method:'POST',body:wire({conversation:[{role:'user',content:'[name removed]@0123456789abcdef0123456789abcdef_1 me@example.invalid'}]})}));
 for(const patch of [{tool_results:[{name:'appointments.own.list',result:[]}]},{remembered_notes:['private']},{conversation:[{role:'user',content:'me@example.invalid'}]},{tool_results:[{name:'catalog.staff.read',result:{phone:'+79991234567'}}]},{available_tools:[{name:'appointments.create'}]},{pending_owner_review:{}}])assert.throws(()=>assertPhoneAiPayload({method:'POST',body:wire(patch)}));
});
test('exact request; credentials only upstream; fsynced reservation and sanitized metadata',async t=>{
 const f=await fixture(t);const r=await f.request();assert.equal(r.status,200);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'https://api.deepseek.com/chat/completions');assert.equal(f.calls[0][1].redirect,'error');assert.deepEqual(f.calls[0][1].headers,{'Content-Type':'application/json',Authorization:'Bearer synthetic_not_real_key'});
 const ledger=fs.readFileSync(f.dir+'/ledger.jsonl','utf8');assert.match(ledger,/reserved/);assert.doesNotMatch(ledger,/synthetic_not_real_key|Привет|user-a|tenant-a/);assert.equal(f.snapshot().usage.totalTokens,105);
});
for(const [label,headers]of [['foreign tenant',{'x-maya-tenant':'other'}],['foreign user',{'x-maya-user':'other'}],['wrong pin',{'x-maya-scope':'f'.repeat(64)}],['caller auth',{authorization:'secret'}],['cookie',{cookie:'private'}]])test(label+' refused before dispatch',async t=>{const f=await fixture(t);assert.equal((await f.request(wire(),headers)).status,403);assert.equal(f.calls.length,0);});
for(const [method,url]of [['GET','/chat/completions'],['POST','/v1/chat/completions'],['POST','https://evil.invalid'],['POST','/clients'],['CONNECT','api.deepseek.com:443']]){
 if(method==='CONNECT')continue;
 test('route refusal '+method+url,async t=>{const f=await fixture(t);assert.equal((await f.request('',{},method,url)).status,403);assert.equal(f.calls.length,0);});
}
test('expiry/revocation/changed scope stop without a second provider request',async t=>{const f=await fixture(t);assert.equal((await f.request()).status,200);f.withdraw();assert.equal((await f.request()).status,403);assert.equal(f.calls.length,1);});
test('expiry before dispatch',async t=>{const f=await fixture(t);f.setTime(Date.parse(scope.expiresAt));assert.equal((await f.request()).status,403);assert.equal(f.calls.length,0);});
test('exact persistent ledger refuses restart rather than resetting budget',async t=>{const f=await fixture(t);await f.request();assert.throws(()=>phoneAiEgress({scope,pin,credential:'synthetic_not_real_key',ledgerPath:f.dir+'/ledger.jsonl',assertCurrent(){},testClock:()=>now,testWait:async()=>{},nativeFetch:async()=>{throw Error('never')}}),/EEXIST/);});
test('unknown usage latches refusal and reserves the failed call',async t=>{const f=await fixture(t,{fetch:async()=>new Response('{"secret":"do-not-forward"}')});assert.equal((await f.request()).status,403);assert.equal((await f.request()).status,403);assert.equal(f.calls.length,1);assert.equal(f.snapshot().stats.halted,true);assert.ok(f.snapshot().stats.reservedNanoUsd>0);});
test('provider redirect and error never expose response or credential',async t=>{const f=await fixture(t,{fetch:async()=>new Response('sensitive',{status:302,headers:{location:'https://evil.invalid'}})});const r=await f.request();assert.equal(r.status,403);assert.doesNotMatch(r.text,/sensitive|synthetic/);assert.equal(f.calls.length,1);});
test('concurrent admission permits only one upstream reservation',async t=>{
 let go,entered;const ready=new Promise(r=>{entered=r}),wait=new Promise(r=>{go=r});const f=await fixture(t,{fetch:async()=>{entered();await wait;return answer()}});
 const first=f.request();await ready;assert.equal((await f.request()).status,403);go();assert.equal((await first).status,200);assert.equal(f.calls.length,1);
});
test('USD 2 ceiling refuses before dispatch and cannot be reset by another request',async t=>{
 const f=await fixture(t);const large=wire({conversation:[{role:'user',content:'x'.repeat(85000)}]});
 for(let i=0;i<30;i++)await f.request(large);
 assert.ok(f.snapshot().stats.reservedNanoUsd<=2000000000);assert.ok(f.calls.length>0&&f.calls.length<30);const before=f.calls.length;await f.request(large);assert.equal(f.calls.length,before);
});
test('100 attempt ceiling stops exactly with a small payload',async t=>{const f=await fixture(t);for(let i=0;i<102;i++)await f.request();assert.equal(f.calls.length,100);assert.equal(f.snapshot().stats.attempts,100);});
test('revocation aborts in-flight provider request',async t=>{
 let entered;const ready=new Promise(r=>{entered=r});const f=await fixture(t,{fetch:async(_url,init)=>new Promise((_r,reject)=>{init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});entered();})});
 const result=f.request();await ready;f.revoke();assert.equal((await result).status,403);assert.equal(f.snapshot().stats.halted,true);
});
test('runtime keeps canonical chat/read owners and refuses foreign actor/effects/outside model context',async()=>{
 let turns=0,reads=0,actions=0,paid=0,alive=true,installed;
 const values={tenant:{slug:scope.tenantSlug,status:'trial'},user:{tenantId:scope.tenantId,role:'tenant_owner',status:'active'},membership:{id:'synthetic'},branch:{tenantId:scope.tenantId}};
 const prisma=Object.fromEntries(Object.keys(values).map(k=>[k,{findUnique:async()=>values[k],findFirst:async()=>values[k]}]));
 const tools={listTools:async()=>({tools:[...PHONE_AI_TOOLS,'appointments.create'].map(name=>({name}))}),execute:async()=>{reads++;return 'canonical'},replayCompletedRead:async()=>{reads++;return 'canonical'}};
 const services={ConfigService:{set(){}},PrismaService:prisma,AiCoreService:{chat:async(u)=>{turns++;await tools.execute(u,'catalog.services.read');return installed.fetch('https://api.deepseek.com/chat/completions',{method:'POST',body:wire()})}},AiToolRuntimeService:tools,ActionEngineRuntimeService:{execute:()=>{actions++},executeWithReceipt:()=>{actions++}}};
 const names={'@nestjs/config':'ConfigService','prisma.service.js':'PrismaService','ai-core.service.js':'AiCoreService','ai-tool-runtime.service.js':'AiToolRuntimeService','action-engine.runtime.js':'ActionEngineRuntimeService'};
 const require=file=>file==='@nestjs/common'?{ForbiddenException:class extends Error{}}:{[names[file]??names[path.basename(file)]]:names[file]??names[path.basename(file)]};
 installed=await installPhoneAi({app:{get:k=>services[k]},require,backend:'/app',scope,assertCurrent(){assert.ok(alive)},relayFetch:async()=>{paid++;return answer()},nativeFetch:async()=>{throw Error('forbidden')}});
 assert.equal((await services.AiToolRuntimeService.listTools(user)).tools.length,3);
 assert.equal((await services.AiCoreService.chat(user,{surface:'native'})).status,200);assert.equal(turns,1);assert.equal(reads,1);assert.equal(paid,1);
 await assert.rejects(installed.fetch('https://api.deepseek.com/chat/completions',{method:'POST',body:wire()}));
 await assert.rejects(services.AiCoreService.chat({...user,tenantId:'other'},{surface:'native'}));
 assert.throws(()=>services.ActionEngineRuntimeService.execute());assert.throws(()=>services.ActionEngineRuntimeService.executeWithReceipt());assert.equal(actions,0);
 values.membership=null;await assert.rejects(services.AiCoreService.chat(user,{surface:'native'}));values.membership={id:'synthetic'};
 alive=false;await assert.rejects(services.AiCoreService.chat(user,{surface:'native'}));assert.equal(paid,1);
});

test('provider length completion preserves original bytes for canonical validation; accounting remains strict',async t=>{
 const f=await fixture(t,{fetch:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'valid but bounded'}}],usage:{prompt_tokens:100,completion_tokens:5,total_tokens:105}})});
 const r=await f.request();assert.equal(r.status,200);assert.equal(JSON.parse(r.text).choices[0].finish_reason,'length');assert.equal(f.snapshot().stats.halted,false);assert.equal(f.snapshot().lastTransport.finishReason,'length');
});
test('manual continuation charges unresolved predecessor cost and preserves original ceilings',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maya-phone-carry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rows=[{event:'opened',manifestSha256:pin,candidateCommit:scope.candidate,profile:CORE_PHONE_READ_PROFILE,mode:'ADMITTED_MODEL_ONLY',paidAuthorized:true},{event:'reserved',attempt:1,input:1400000,output:20000,nanoUsd:1927200000,totalInput:1400000,totalOutput:20000,totalNanoUsd:1927200000},{event:'halted_after_attempt',attempt:1}];
 const bytes=Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),binding={ledgerSha256:createHash('sha256').update(bytes).digest('hex'),scopePin:pin,candidate:scope.candidate};
 const carry=phoneAiCarryForward(bytes,binding);assert.equal(carry.reservedNanoUsd,1927200000);assert.equal(carry.attempts,1);
 for(const b of [{...binding,ledgerSha256:'f'.repeat(64)},{...binding,scopePin:'f'.repeat(64)},{...binding,candidate:'f'.repeat(40)}])assert.throws(()=>phoneAiCarryForward(bytes,b));
 const f=await fixture(t,{carryForward:carry});assert.equal(f.snapshot().stats.reservedNanoUsd,1927200000);
 const large=wire({conversation:[{role:'user',content:'x'.repeat(85000)}]});assert.equal((await f.request(large)).status,403);assert.equal(f.calls.length,0);assert.equal(f.snapshot().stats.reservedNanoUsd,1927200000);
 assert.equal((await f.request()).status,200);assert.equal(f.snapshot().stats.attempts,2);assert.ok(f.snapshot().stats.reservedNanoUsd>1927200000);
 assert.throws(()=>new CandidateBudgetGate({ledgerPath:dir+'/forbidden',manifestSha256:pin,candidateCommit:scope.candidate,profile:CORE_DIAGNOSTIC_PROFILE,mode:'OFFLINE_SYNTHETIC_ONLY',transport:async()=>answer(),carryForward:carry}),/carry_forward_refused/);
 const tampered=Buffer.from(rows.map(r=>JSON.stringify(r.event==='reserved'?{...r,totalNanoUsd:0}:r)).join('\n')+'\n');assert.throws(()=>phoneAiCarryForward(tampered,{...binding,ledgerSha256:createHash('sha256').update(tampered).digest('hex')}));
});
