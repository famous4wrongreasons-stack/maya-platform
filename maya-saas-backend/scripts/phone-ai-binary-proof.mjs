// Synthetic PostgreSQL + compiled AppModule + canonical login/chat and real HTTP
// model relay. No credentials, retained owner DB or real provider network.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {randomBytes,randomUUID} from 'node:crypto';
import {sessionPlan,stage} from './local-onboarding.mjs';import {PRIVATE_KEYS,profileEnvironment,migrationConfigSource} from './local-onboarding-profile.mjs';
import {phoneAiEgress} from './phone-ai-egress.mjs';import {installPhoneAi} from './phone-ai-runtime.mjs';
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),out=process.argv[2];
assert.ok(out&&path.isAbsolute(out)&&!fs.existsSync(out));fs.mkdirSync(out,{mode:0o700});
const state=fs.mkdtempSync('/private/tmp/maya-phone-ai-proof-');fs.chmodSync(state,0o700);
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const pgPort=await port(),apiPort=await port(),webPort=await port(),password=randomBytes(32).toString('hex'),database='maya_local_onboarding_'+randomBytes(8).toString('hex'),keys=Object.fromEntries(PRIVATE_KEYS.map(k=>[k,randomBytes(32).toString('hex')]));
const opts={databaseUrl:`postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`,keys,apiPort,origin:`http://127.0.0.1:${webPort}`,stateDirectory:state};
const env=profileEnvironment(process.env,opts),plan=sessionPlan({stateDirectory:state,pgBin:'/opt/homebrew/opt/postgresql@16/bin',database,pgPort,apiPort,webPort}),control={cancelled:null,terminate:null};
for(const [name,value]of Object.entries({'pg-password':password+'\n',pgpass:`127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`,'prisma.config.mjs':migrationConfigSource(backend)}))fs.writeFileSync(state+'/'+name,value,{mode:0o600,flag:'wx'});
const report={status:'RUNNING',qualification:'SYNTHETIC_HTTP_PG_COMPILED_APP_NOT_LIVE_ACCEPTANCE',checks:[],realProviderCalls:0};const save=()=>fs.writeFileSync(out+'/RESULT.json',JSON.stringify(report,null,2)+'\n');
let started=false,prisma,app,relay,installed;const originalFetch=globalThis.fetch,oldCwd=process.cwd();
try{
 for(const step of plan.setup){if(step.name==='react-build')continue;if(step.name==='pg-start')started=true;report.phase=step.name;save();await stage(step,env,state,control);}
 process.chdir(state);for(const key of Object.keys(process.env))if(/DATABASE|TOKEN|SECRET|KEY|YCLIENTS|OPENAI|DEEPSEEK|SCHEDULER/.test(key))delete process.env[key];Object.assign(process.env,env);
 const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');prisma=new PrismaClient({adapter:new PrismaPg({connectionString:opts.databaseUrl})});
 async function principal(){const tenant=await prisma.tenant.create({data:{name:'Synthetic phone AI',slug:'synthetic-phone-'+randomBytes(4).toString('hex'),status:'trial',trialFullAccess:true,trialEndsAt:new Date(Date.now()+3600000),calendarSource:'external'}});const email='synthetic-'+randomUUID()+'@example.invalid',pw='Synthetic-only-42!';const owner=await prisma.user.create({data:{tenantId:tenant.id,email,passwordHash:await require('bcrypt').hash(pw,10),role:'tenant_owner',status:'active'}});await prisma.membership.create({data:{tenantId:tenant.id,userId:owner.id,role:'tenant_owner',status:'active'}});const branch=await prisma.branch.create({data:{tenantId:tenant.id,name:'Synthetic',timezone:'Europe/Moscow'}});return{tenant,owner,branch,email,pw};}
 const own=await principal(),foreign=await principal(),now=Date.now(),pin='a'.repeat(64);
 const scope={contract:'maya.phone-owner-ai/1',approvalRef:'owner-20261015-phone-deepseek-24h-usd2',candidate:'b'.repeat(40),tenantId:own.tenant.id,userId:own.owner.id,branchId:own.branch.id,tenantSlug:own.tenant.slug,companyId:'321',notBefore:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString(),maxCalls:100,maxSpendNanoUsd:2000000000};
 require('reflect-metadata');const load=f=>require(path.join(backend,'dist/src',f));const {NestFactory}=require('@nestjs/core');
 globalThis.fetch=async()=>{throw Error('External network forbidden in synthetic proof');};app=await NestFactory.create(load('app.module.js').AppModule,{bodyParser:false,logger:false,abortOnError:false});
 let modelCalls=0,alive=true,clock=now;
 relay=phoneAiEgress({scope,pin,credential:'synthetic_not_real_key',ledgerPath:state+'/model-ledger.jsonl',testClock:()=>clock,testWait:async ms=>{clock+=ms;},assertCurrent(){assert.ok(alive)},nativeFetch:async(_url,init)=>{
  modelCalls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);assert.ok(!init.body.includes(own.email)&&!init.body.includes(own.owner.id));
  const answer=input.phase==='tool_planning'?JSON.stringify({semantic_plan:{parent_request:input.current_user_request,language:'ru',dialogue_act:'question',tasks:[{id:'hello',intent:'small_talk.greeting',entities_json:'{}',depends_on:[],confidence:1,requires_clarification:false,clarification_question:null}],context:{carried_slots:[],replaced_slots:[],unresolved_references:[]}},tool_call:null}):'Привет! Рада тебя видеть. Чем помочь?';
  return Response.json({model:'deepseek-v4-pro',choices:[{finish_reason:'stop',message:{content:answer}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}});
 }});await new Promise(r=>relay.server.listen(0,'127.0.0.1',r));
 installed=await installPhoneAi({app,require,backend,scope,assertCurrent(){assert.ok(alive)},nativeFetch:async()=>{throw Error('Unlisted external request');},relayFetch:init=>originalFetch(`http://127.0.0.1:${relay.server.address().port}/chat/completions`,{method:'POST',body:init.body,signal:init.signal,headers:{'content-type':'application/json','x-maya-scope':pin,'x-maya-tenant':scope.tenantId,'x-maya-user':scope.userId}})});globalThis.fetch=installed.fetch;
 load('bootstrap/configure-http-app.js').configureHttpApp(app);await app.listen(apiPort,'127.0.0.1');const request=require('supertest');
 const login=async p=>{const r=await request(app.getHttpServer()).post('/api/auth/login').send({tenantSlug:p.tenant.slug,email:p.email,password:p.pw});assert.equal(r.status,201);return r.body.access_token;};
 const token=await login(own),other=await login(foreign);report.checks.push('canonical-password-logins');
 const chat=(surface,access=token)=>{const r=request(app.getHttpServer()).post('/api/ai/chat').send({surface,requestId:randomUUID(),messages:[{role:'user',content:'Привет'}]});if(access)r.set('Authorization','Bearer '+access);return r.timeout({response:60000,deadline:65000});};
 for(const surface of ['native','web']){const r=await chat(surface);assert.equal(r.status,201,JSON.stringify(r.body));assert.match(r.body.reply,/Рада тебя видеть/);assert.equal(r.body.source,'deepseek');report.checks.push(surface+'-greeting-full-http-model-relay');}
 const calls=modelCalls;assert.equal((await chat('native',other)).status,403);assert.equal((await chat('native',null)).status,401);assert.equal(modelCalls,calls);report.checks.push('foreign-tenant-and-missing-login-refused-before-model');
 await prisma.membership.updateMany({where:{tenantId:own.tenant.id,userId:own.owner.id},data:{status:'suspended'}});assert.equal((await chat('native')).status,401);assert.equal(modelCalls,calls);report.checks.push('suspended-membership-current-reread');
 assert.equal(await prisma.appointment.count(),0);assert.equal(await prisma.client.count(),0);assert.equal(await prisma.tenantEntitlement.count(),0);report.checks.push('zero-booking-client-or-entitlement-effects');
 report.modelCallsSynthetic=modelCalls;report.modelStatus=relay.snapshot();report.status='PASS';
}catch(error){report.status='FAIL';report.failure=String(error.message).slice(0,3000);process.exitCode=1;}
finally{
 installed?.stop();await app?.close().catch(()=>{});await prisma?.$disconnect();globalThis.fetch=originalFetch;
 if(relay){relay.revoke();relay.server.closeAllConnections();await new Promise(r=>relay.server.close(r));relay.close();}
 if(started){await stage(plan.stop,env,state,control);report.proofDatabaseStopped=!fs.existsSync(plan.cluster+'/postmaster.pid');}
 process.chdir(oldCwd);save();console.log(JSON.stringify(report));
}
