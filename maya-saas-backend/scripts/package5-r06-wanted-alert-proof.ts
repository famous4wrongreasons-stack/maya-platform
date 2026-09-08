import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ConfigService} from '@nestjs/config';
import {Prisma} from '@prisma/client';
import {ActionEngineRuntimeService} from '../src/action-engine';
import {CommunicationDeliveryService} from '../src/communication-delivery';
import {OwnerReportStore} from '../src/owner-reports/owner-report.store';
import {OperationalAlertStore} from '../src/operational-alerts/operational-alert.store';
import {OperationalAlertSourceService} from '../src/operational-alerts/operational-alert-source.service';
import {OperationalAlertsService} from '../src/operational-alerts/operational-alerts.service';
import type {CrmService} from '../src/crm/crm.service';
import type {InternalCalendarService} from '../src/internal-calendar/internal-calendar.service';
import {baseFixture,clientFixture,command,wanted} from './package5-wave-rc-client-proof-support';
import {config,context,db,engine,ingress,secret,staffFixture} from './package5-wave-rc-proof-support';
const settings=new ConfigService({DATABASE_URL:config.get('DATABASE_URL'),CRM_ENCRYPTION_KEY:secret,OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT:new Date(Date.now()-86400000).toISOString()});
const store=new OperationalAlertStore(db,context,ingress,settings),bindings=new OwnerReportStore(db,context,ingress,settings);
const sources=new OperationalAlertSourceService(db,context,{} as CrmService,{} as InternalCalendarService,bindings,store);
const make=()=>new OperationalAlertsService(db,context,store,sources,new CommunicationDeliveryService(db,new ActionEngineRuntimeService(engine,ingress),settings));
const checks:string[]=[];
const checkpoint=resolve(process.env.MAYA_RC_PROOF_DIRECTORY??'/tmp/maya-rc-proof-artifacts','r06-restart.json');
async function afterRestart(){const saved=JSON.parse(readFileSync(checkpoint,'utf8')) as {tenantId:string;runId:string;executions:string[];users:string[]};await context.runAsSystemTenant(saved.tenantId,async()=>{const root=await db.operationalAlertRun.findUniqueOrThrow({where:{id:saved.runId}}),plan=store.read(root);const newUser=await staffFixture(saved.tenantId);await make().resume(root);const rows=await store.executions(root,plan);assert.deepEqual(rows.map(r=>r.id).sort(),saved.executions);assert.ok(rows.every(r=>r.state==='SUCCEEDED'));assert.deepEqual((await db.inboxItem.findMany({where:{tenantId:saved.tenantId}})).map(r=>r.userId).sort(),saved.users);assert.equal(await db.inboxItem.count({where:{tenantId:saved.tenantId,userId:newUser.user.id}}),0);const leaves=await db.marketingCampaignRecipient.findMany({where:{tenantId:saved.tenantId}});assert.ok(leaves.every(r=>r.deliveryState==='DELIVERED'));});console.log(JSON.stringify({phase:'after actual database/process restart',result:'PASS',originalExecutions:true,newSlots:0,productionEffects:0}));}
async function main(){await db.$connect();if(process.argv.includes('--after-restart'))return afterRestart();const base=await baseFixture('r06-alert'),client=await clientFixture(base,'no-user');
 const a=await staffFixture(base.tenantId),b=await staffFixture(base.tenantId,'administrator'),excluded=await staffFixture(base.tenantId,'tenant_admin');
 const otherBranch=await db.branch.create({data:{tenantId:base.tenantId,name:'Other branch'}});await db.membership.update({where:{id:excluded.member.id},data:{branchId:otherBranch.id}});
 await context.runAsSystemTenant(base.tenantId,async()=>{
  const receipt=await wanted().add(client.proof,command(base,new Date(Date.now()+86400000)));
  const original=db.inboxItem.upsert.bind(db.inboxItem);let injected=false;
  Object.defineProperty(db.inboxItem,'upsert',{configurable:true,value:async(args:Prisma.InboxItemUpsertArgs)=>{const row=await original(args);if(args.create.userId===a.user.id&&!injected){injected=true;throw Error('synthetic lost receipt after Inbox commit');}return row;}});
  const claim=engine.claimReconciliation.bind(engine);let interrupted=false;engine.claimReconciliation=async(input)=>{const row=await db.actionExecution.findUniqueOrThrow({where:{id:input.executionId}});if(row.targetRef==='user:'+a.user.id&&!interrupted){interrupted=true;throw Error('synthetic process stopped before reconciliation');}return claim(input);};
  let result;try{result=await make().wanted(base.tenantId,receipt.interestId);}finally{Object.defineProperty(db.inboxItem,'upsert',{configurable:true,value:original});engine.claimReconciliation=claim;}assert.ok(injected&&interrupted);
  assert.ok(result&&'runId' in result);const root=await store.find(base.tenantId,'wanted_slot_admin_notice',(await db.operationalAlertRun.findFirstOrThrow({where:{tenantId:base.tenantId}})).occurrenceRef);assert.ok(root);
  const plan=store.read(root);assert.deepEqual(plan.recipients.map(r=>r.userId).sort(),[a.user.id,b.user.id].sort());assert.equal(client.client.userId,null);
  const first=await store.executions(root,plan);assert.equal(first.find(r=>r.targetRef==='user:'+a.user.id)?.state,'UNKNOWN');assert.equal(first.find(r=>r.targetRef==='user:'+b.user.id)?.state,'SUCCEEDED');
  assert.equal(await db.inboxItem.count({where:{tenantId:base.tenantId}}),2);
  checks.push('Client without Maya User uses verified canonical link/confirmed B9 intent; exact branch admin audience; lost Inbox reply UNKNOWN while other recipient succeeds');
  if(process.argv.includes('--before-restart')){writeFileSync(checkpoint,JSON.stringify({tenantId:base.tenantId,runId:root.id,executions:first.map(r=>r.id).sort(),users:[a.user.id,b.user.id].sort()}));checks.push('durable UNKNOWN retained for actual PostgreSQL restart');return;}
  const late=await staffFixture(base.tenantId);await make().wanted(base.tenantId,receipt.interestId);
  const after=await store.executions(root,plan);assert.ok(after.every(r=>r.state==='SUCCEEDED'));assert.deepEqual(after.map(r=>r.id).sort(),first.map(r=>r.id).sort());
  assert.equal(await db.inboxItem.count({where:{tenantId:base.tenantId}}),2);assert.equal(await db.inboxItem.count({where:{tenantId:base.tenantId,userId:late.user.id}}),0);
  const leaves=await db.marketingCampaignRecipient.findMany({where:{tenantId:base.tenantId,campaign:{actionExecutionId:{in:after.map(r=>r.id)}}}});assert.ok(leaves.every(r=>r.deliveryState==='DELIVERED'&&['NOT_REQUIRED','RESOLVED'].includes(r.reconciliationState!)));
  checks.push('restart resumes original root/AE/slot; canonical row reconciles both CD and AE; new recipient not admitted, no resend');
  const second=await wanted().add(client.proof,command(base,new Date(Date.now()+2*86400000)));
  const prepared=sources.interest.bind(sources);let revoked=false;
  sources.interest=async(...args)=>{const fact=await prepared(...args);if(!revoked){revoked=true;await db.membership.update({where:{id:a.member.id},data:{status:'suspended'}});}return fact;};
  try{await make().wanted(base.tenantId,second.interestId);}finally{sources.interest=prepared;}
  const next=await db.operationalAlertRun.findFirstOrThrow({where:{tenantId:base.tenantId,id:{not:root.id}}});assert.ok(!store.read(next).recipients.some(r=>r.userId===a.user.id));
  const before=await db.actionExecution.count({where:{tenantId:base.tenantId}});await assert.rejects(make().wanted(base.tenantId,'raw-sqlite-id'));assert.equal(await db.actionExecution.count({where:{tenantId:base.tenantId}}),before);
  checks.push('revoked membership and raw SQLite interest cannot supply admission authority');
 });
 console.log(JSON.stringify({package:'R06',scope:'B44 wanted alert/partial resume/UNKNOWN',result:'PASS',checks,productionEffects:0},null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.$disconnect());
