/** Reproduces the approved-contract contradiction; this is NOT R05 acceptance.
 * Read-only observations + a claim expected to reject before attempt creation.
 * Never runs against production or a pre-existing database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { ActionCapabilityRegistry, ActionEngineKernel, CanonicalActionIngressService, CanonicalActionPolicyResolver, createCanonicalProductionPolicyRegistry } from '../src/action-engine';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { OwnerReportStore } from '../src/owner-reports/owner-report.store';
import { ownerReportRequest } from '../src/owner-reports/owner-report.contract';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55509');assert.equal(url.pathname,'/maya_rc_b36_runtime');
const secret='b36-schema-fixture-secret-not-production';
const config=new ConfigService({DATABASE_URL:url.toString(),CRM_ENCRYPTION_KEY:secret});
const db=new PrismaService(config),context=new TenantContextService(),caps=new ActionCapabilityRegistry();
const entitlements:Pick<EntitlementsService,'resolveFeatureRequirements'>={resolveFeatureRequirements:(tenantId,features)=>Promise.resolve({contract:FEATURE_REQUIREMENT_DECISION_CONTRACT,tenantId,planId:null,requiredFeatures:features.map(featureKey=>({featureKey,enabled:true})),allowed:true,evaluatedAt:new Date(),validUntil:new Date('2099-01-01T00:00:00Z')})};
const resolver=new CanonicalActionPolicyResolver(db,entitlements,{attestationSecret:secret},createCanonicalProductionPolicyRegistry(caps),caps);
const engine=new ActionEngineKernel(db,{identitySecret:secret,payloadEncryptionSecret:secret},caps,resolver),ingress=new CanonicalActionIngressService(engine,resolver),store=new OwnerReportStore(db,context,ingress,config);
async function main(){
 await db.$connect();
 const saved=JSON.parse(readFileSync(process.argv[2],'utf8')) as {tenantId:string;id:string;firstUserId:string};
 await context.runAsSystemTenant(saved.tenantId,async()=>{
  const root=await db.ownerReportRun.findUniqueOrThrow({where:{id:saved.id}}),plan=store.readPlan(root);
  const recipient=plan.recipients.find(r=>r.userId!==saved.firstUserId)!;assert.ok(recipient);
  const slot=recipient.slots[0];assert.equal(slot.channel,'inbox');
  const row=await db.actionExecution.findFirstOrThrow({where:{tenantId:root.tenantId,ownerReportRunId:root.id,ownerReportSlotKey:slot.key}});
  assert.equal(row.state,'READY');assert.equal(row.approvalRequirement,'NONE');assert.equal(row.executionAttemptCount,0);
  assert.ok(row.policyValidUntil && row.policyEvaluatedAt && row.policyValidUntil < new Date());
  assert.equal(row.policyValidUntil.getTime()-row.policyEvaluatedAt.getTime(),60000);
  assert.ok(root.intentEncrypted && root.expiresAt>new Date() && root.payloadRetentionUntil>new Date());
  await store.assertDispatchAllowed(root,plan,recipient,slot);
  const current=await ingress.prepare(ownerReportRequest(root.id,store.identity,plan,recipient,slot));
  assert.equal(current.policy.policyDecision,'ALLOW');assert.ok(current.policy.policyValidUntil>new Date());
  const attempts=await db.actionAttempt.count({where:{actionExecutionId:row.id}});
  let reason='';try{await engine.claimExecution({tenantId:root.tenantId,executionId:row.id,workerId:'r05.gap-proof'});assert.fail('Expired persisted policy unexpectedly accepted');}catch(error){assert.ok(error instanceof Error);assert.match(error.message,/APPROVAL_EXPIRED/);reason=error.message;}
  assert.equal(await db.actionAttempt.count({where:{actionExecutionId:row.id}}),attempts);
  assert.deepEqual(await db.actionExecution.findUniqueOrThrow({where:{id:row.id}}),row);
  console.log(JSON.stringify({proof:'confirmed shared policy-resume contradiction',reproduced:true,package:'R05',inventoryPath:'B36 existing OwnerReportRun/A12',approvalRequirement:row.approvalRequirement,state:row.state,originalPolicyTtlMs:60000,policyEvaluatedAt:row.policyEvaluatedAt,policyValidUntil:row.policyValidUntil,observedAt:new Date(),reportExpiresAt:root.expiresAt,payloadRetentionUntil:root.payloadRetentionUntil,currentPolicy:'ALLOW',manifestDispatchAuthority:'PASS',claimOutcome:reason,newAttempts:0,executionMutations:0,newLogicalSlots:0,productionEffects:0,R05_LOCAL_ACCEPTANCE:'FAIL'},null,2));
 });
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
