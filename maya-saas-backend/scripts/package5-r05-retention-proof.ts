/** Actual R05 cleanup against expressly synthetic historical AE envelopes.
 * This proves retention, not historical runtime admission or provider effects. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { OwnerReportStore } from '../src/owner-reports/owner-report.store';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import { ownerReportFingerprint, OWNER_REPORT_DAY } from '../src/owner-reports/owner-report.contract';
import { stableActionJson } from '../src/action-engine/action-engine.identity';
import { dayIsoRange } from '../src/owner-reports/owner-reports.time';
import { config, context, db, ingress } from './package5-wave-rc-proof-support';
const store=new OwnerReportStore(db,context,ingress,new ConfigService({DATABASE_URL:config.get('DATABASE_URL'),CRM_ENCRYPTION_KEY:'b36-schema-fixture-secret-not-production'}));
async function main(){
 await db.$connect();
 const source=await db.ownerReportRun.findFirstOrThrow({where:{reportType:'morning_owner',intentEncrypted:{not:null},payloadRetentionUntil:{gt:new Date()},executions:{some:{},every:{state:'SUCCEEDED'}}}});
 const plan=context.runAsSystemTenant(source.tenantId,()=>store.readPlan(source)), now=new Date(), roots:string[]=[], allExecutions:string[]=[];
 const age=30+4*await db.ownerReportRun.count({where:{tenantId:source.tenantId}});
 const [sourceJson]=await db.$queryRaw<Array<{row:Prisma.JsonObject}>>`SELECT to_jsonb(r) AS row FROM "OwnerReportRun" r WHERE id=${source.id}`;
 const executionJson=await db.$queryRaw<Array<{row:Prisma.JsonObject}>>`SELECT to_jsonb(e) AS row FROM "ActionExecution" e WHERE "ownerReportRunId"=${source.id} ORDER BY id`;
 for(const [index,state] of ['SUCCEEDED','READY','UNKNOWN','MANUAL_REQUIRED'].entries()){
  const admitted=new Date(now.getTime()-(age+index)*OWNER_REPORT_DAY),date=admitted.toISOString().slice(0,10),range=dayIsoRange(plan.timezone,date),periodEnd=new Date(Date.parse(range.to)+1).toISOString();
  const historical={...plan,periodLocalDate:date,periodStart:range.from,periodEnd,expiresAt:new Date(Date.parse(periodEnd)+7*OWNER_REPORT_DAY).toISOString()};
  const id=randomUUID();roots.push(id);
  await canonicalUtcTransaction(db,async tx=>{
   await tx.ownerReportRun.create({data:{...source,id,periodLocalDate:date,intentHash:ownerReportFingerprint(store.identity,historical),intentEncrypted:store.identity.encryptNormalizedPayload(stableActionJson(historical)),admittedAt:admitted,expiresAt:new Date(historical.expiresAt),payloadRetentionUntil:new Date(admitted.getTime()+7*OWNER_REPORT_DAY),auditRetentionUntil:new Date(admitted.getTime()+365*OWNER_REPORT_DAY)}});
   for(const [slotIndex,{row}] of executionJson.entries()){
    const eid=randomUUID();allExecutions.push(eid);
    const fixture={...row,id:eid,ownerReportRunId:id,identityFingerprint:randomUUID().replaceAll('-','').repeat(2),requestIdempotencyKeyHash:null,idempotencyScope:null,transportIdempotencyKey:randomUUID(),intentExpiresAt:historical.expiresAt,state:'READY',revision:0,executionAttemptCount:0,firstAttemptedAt:null,finalOutcomeCode:null,notExecutedReasonCode:null,finalizedAt:null,leaseOwner:null,leaseTokenHash:null,leaseExpiresAt:null,reconciliationState:'NOT_REQUIRED'};
    await tx.$executeRaw`INSERT INTO "ActionExecution" SELECT * FROM jsonb_populate_record(NULL::"ActionExecution",${JSON.stringify(fixture)}::jsonb)`;
    const final=slotIndex===0?state:'SUCCEEDED';
    const attemptId=randomUUID();
    if(final!=='READY')await tx.actionAttempt.create({data:{id:attemptId,tenantId:source.tenantId,actionExecutionId:eid,attemptNumber:1,kind:'EXECUTION',state:'STARTED',executorKey:'synthetic-retention-history',executorVersion:1,externalDispatchState:'NOT_CROSSED',startedAt:now}});
    if(final!=='READY')await tx.actionExecution.update({where:{id:eid},data:{state:'EXECUTING',revision:{increment:1},executionAttemptCount:1,firstAttemptedAt:now,leaseOwner:'synthetic-retention-history',leaseTokenHash:'a'.repeat(64),leaseExpiresAt:new Date(now.getTime()+60000)}});
    if(final!=='READY')await tx.actionAttempt.update({where:{id:attemptId},data:{state:['UNKNOWN','MANUAL_REQUIRED'].includes(final)?'UNKNOWN':'SUCCEEDED',externalDispatchState:['UNKNOWN','MANUAL_REQUIRED'].includes(final)?'MAY_HAVE_CROSSED':'ACKNOWLEDGED',reconciliationRequired:['UNKNOWN','MANUAL_REQUIRED'].includes(final),finishedAt:now,outcomeCode:'synthetic_retention_history'}});
    if(final!=='READY')await tx.actionExecution.update({where:{id:eid},data:{revision:{increment:1},leaseOwner:null,leaseTokenHash:null,leaseExpiresAt:null,state:['UNKNOWN','MANUAL_REQUIRED'].includes(final)?'UNKNOWN':'SUCCEEDED',reconciliationState:final==='MANUAL_REQUIRED'?'MANUAL_REQUIRED':final==='UNKNOWN'?'REQUIRED':'NOT_REQUIRED',finalizedAt:['UNKNOWN','MANUAL_REQUIRED'].includes(final)?null:now,finalOutcomeCode:['UNKNOWN','MANUAL_REQUIRED'].includes(final)?null:'synthetic_terminal'}});
   }
  });
 }
 const before=await db.actionExecution.findMany({where:{id:{in:allExecutions}},orderBy:{id:'asc'}});
 await context.runAsSystemTenant(source.tenantId,async()=>{
  const race=await Promise.all([store.purgeExpiredPayloads(source.tenantId,now),store.purgeExpiredPayloads(source.tenantId,now)]);
  assert.equal(race.reduce((n,r)=>n+r.count,0),1);
  assert.equal((await db.ownerReportRun.findUniqueOrThrow({where:{id:roots[0]}})).intentEncrypted,null);
  for(const id of roots.slice(1))assert((await db.ownerReportRun.findUniqueOrThrow({where:{id}})).intentEncrypted);
  assert.equal((await store.purgeExpiredPayloads(source.tenantId,now)).count,0);
  await assert.rejects(store.snapshot(source.tenantId,plan.recipients[0].userId,roots[0]));
 });
 assert.deepEqual(await db.actionExecution.findMany({where:{id:{in:allExecutions}},orderBy:{id:'asc'}}),before);
 const [unchanged]=await db.$queryRaw<Array<{row:Prisma.JsonObject}>>`SELECT to_jsonb(r) AS row FROM "OwnerReportRun" r WHERE id=${source.id}`;
 assert.deepEqual(unchanged,sourceJson);
 console.log(JSON.stringify({package:'R05',status:'PASS',checks:['expired resolved payload purged once under concurrent cleanup','READY UNKNOWN and MANUAL_REQUIRED preserve plan','original live report unchanged','all execution/history rows unchanged','purged snapshot unavailable and retry creates nothing'],productionEffects:0},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect());
