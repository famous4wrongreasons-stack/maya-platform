import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

/** Approved Option A extensions of the existing AC6 owner. These are payload
 * policies, never permission to delete canonical history or idempotency rows. */
export const RC_PAYLOAD_CLASSES = {
  purge_operational_alert_payloads:{table:'OperationalAlertRun',policyKey:'package5.r06.operational-alert-payload-retention'},
  purge_native_feedback_payloads:{table:'NativeFeedbackRequest',policyKey:'native-feedback-retention'},
  purge_public_community_payloads:{table:'PublicCommunityComment',policyKey:'public-community-retention'},
  purge_superseded_business_configuration_payloads:{table:'TenantBusinessConfigurationRevision',policyKey:'package5.r11.business-configuration-retention'},
  purge_team_message_payloads:{table:'TeamMessage',policyKey:'team-lifecycle-retention'},
  purge_team_attachment_payloads:{table:'TeamAttachment',policyKey:'team-lifecycle-retention'},
  purge_expense_reminder_payloads:{table:'ExpenseReminderRun',policyKey:'package5.r13.expense-reminder-retention'},
  purge_cash_declaration_reason_payloads:{table:'CashDeclaration',policyKey:'package5.r14.cash-declaration-retention'},
} as const;
export type RCPayloadClass=keyof typeof RC_PAYLOAD_CLASSES;
export function isRCPayloadClass(value:string):value is RCPayloadClass {return Object.hasOwn(RC_PAYLOAD_CLASSES,value);}
export interface RCPayloadTarget {id:string;tenantId:string;kind:string;digest:string;deadline:Date}
export interface RCPayloadPlan {actionClass:string;tenantId:string|null;scope:string;cutoffAt:Date;batchSize:number;fingerprint:string}
export interface RCPayloadVerifier {verify(tx:Prisma.TransactionClient,target:RCPayloadTarget):Promise<boolean>}
export interface RCPayloadStorage {eraseClaimedAttachment(tx:Prisma.TransactionClient,target:RCPayloadTarget):Promise<boolean>}
export function rcPayloadItem(plan:RCPayloadPlan,target:RCPayloadTarget) {
 return {itemKind:target.kind,itemRefHash:createHash('sha256').update(`${plan.fingerprint}/${target.kind}/${target.tenantId}/${target.id}/${target.digest}/${target.deadline.getTime()}`).digest('hex')};
}
function variants(actionClass:string):string[] {
 if(!isRCPayloadClass(actionClass))throw Error('AC6 unlisted payload class');
 return actionClass==='purge_native_feedback_payloads'?['NativeFeedbackRequest','NativeFeedbackRevision']:[RC_PAYLOAD_CLASSES[actionClass].table];
}
export function rcPayloadKinds(actionClass:string){return variants(actionClass);}

function rule(kind:string):{digest:string;deadline:string;eligible:string;executions:string;update:string} {
 const ruleByKind:Record<string,ReturnType<typeof rule>>={
  OperationalAlertRun:{digest:'t."intentHash"',deadline:'t."payloadRetentionUntil" AT TIME ZONE \'UTC\'',eligible:'t."intentEncrypted" IS NOT NULL AND (t."expiresAt" AT TIME ZONE \'UTC\')<=clock_timestamp()',executions:'ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=t."tenantId" AND "operationalAlertRunId"=t.id)',update:'"intentEncrypted"=NULL'},
  NativeFeedbackRequest:{digest:'t."planHash"',deadline:'t."retentionUntil"',eligible:'t."payloadErasedAt" IS NULL',executions:'ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=t."tenantId" AND (id=t."requestExecutionId" OR "nativeFeedbackRequestId"=t.id OR id IN (SELECT "executionId" FROM "NativeFeedbackRevision" WHERE "tenantId"=t."tenantId" AND "requestId"=t.id)))',update:'"contentEncrypted"=NULL,"planEncrypted"=NULL,"payloadErasedAt"=clock_timestamp()'},
  NativeFeedbackRevision:{digest:'t."planHash"',deadline:'(SELECT "retentionUntil" FROM "NativeFeedbackRequest" WHERE id=t."requestId" AND "tenantId"=t."tenantId")',eligible:'t."payloadErasedAt" IS NULL',executions:'ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=t."tenantId" AND (id=t."executionId" OR "nativeFeedbackRevisionId"=t.id))',update:'"commentEncrypted"=NULL,"planEncrypted"=NULL,"payloadErasedAt"=clock_timestamp()'},
  PublicCommunityComment:{digest:'t."contentHash"',deadline:'t."retentionUntil"',eligible:'t."payloadErasedAt" IS NULL',executions:'ARRAY_REMOVE(ARRAY[t."creationExecutionId",t."lastModerationExecutionId"],NULL)',update:'"authorEncrypted"=NULL,"textEncrypted"=NULL,"payloadErasedAt"=clock_timestamp()'},
  TenantBusinessConfigurationRevision:{digest:'t."contentHash"',deadline:'t."createdAt"+interval \'365 days\'',eligible:'t."encryptedContent" IS NOT NULL AND EXISTS (SELECT 1 FROM "TenantBusinessConfigurationRevision" r WHERE r."tenantId"=t."tenantId" AND r.namespace=t.namespace AND r.revision>t.revision)',executions:'ARRAY[t."actionExecutionId"]',update:'"encryptedContent"=NULL'},
  TeamMessage:{digest:'t."planHash"',deadline:'LEAST(t."expiresAt",COALESCE(t."withdrawnAt",t."expiresAt"))',eligible:'t."payloadErasedAt" IS NULL',executions:'ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=t."tenantId" AND (id=t."sendExecutionId" OR id=t."withdrawalExecutionId" OR "teamMessageId"=t.id))',update:'"payloadEncrypted"=NULL,"planEncrypted"=NULL,"payloadErasedAt"=clock_timestamp()'},
  TeamAttachment:{digest:'t."contentSha256"',deadline:'CASE WHEN t.state=\'BOUND\' THEN LEAST(t."mediaExpiresAt",COALESCE((SELECT "withdrawnAt" FROM "TeamMessage" WHERE "attachmentId"=t.id AND "tenantId"=t."tenantId"),t."mediaExpiresAt")) ELSE t."uploadExpiresAt" END',eligible:'t.state<>\'ERASED\'',executions:'ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=t."tenantId" AND (id=t."reserveExecutionId" OR id=t."finalizeExecutionId" OR id IN (SELECT "sendExecutionId" FROM "TeamMessage" WHERE "attachmentId"=t.id AND "tenantId"=t."tenantId") OR id IN (SELECT "withdrawalExecutionId" FROM "TeamMessage" WHERE "attachmentId"=t.id AND "tenantId"=t."tenantId") OR "teamMessageId" IN (SELECT id FROM "TeamMessage" WHERE "attachmentId"=t.id AND "tenantId"=t."tenantId")))',update:'state=\'ERASED\',"revision"="revision"+1,"filenameEncrypted"=NULL,"payloadErasedAt"=clock_timestamp()'},
  ExpenseReminderRun:{digest:'t."intentHash"',deadline:'t."payloadRetentionUntil"',eligible:'t."intentEncrypted" IS NOT NULL',executions:'ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=t."tenantId" AND "expenseReminderRunId"=t.id)',update:'"intentEncrypted"=NULL'},
  CashDeclaration:{digest:'t."intentHash"',deadline:'t."createdAt"+interval \'7 years\'',eligible:'t."encryptedReason" IS NOT NULL',executions:'ARRAY[t."actionExecutionId"]',update:'"encryptedReason"=NULL'},
 };
 if(!Object.hasOwn(ruleByKind,kind))throw Error('AC6 payload target kind not allowlisted');return ruleByKind[kind];
}

/** Exact tenant, immutable digest/deadline and resolved AE/CD are rechecked both
 * when the manifest freezes and under the claimed run immediately before purge. */
export async function selectRCPayloads(tx:Prisma.TransactionClient,plan:RCPayloadPlan,lock:boolean,runId?:string,verifier?:RCPayloadVerifier):Promise<RCPayloadTarget[]> {
 if(plan.scope!=='tenant' || !plan.tenantId)throw Error('AC6 payload exact system tenant required');
 const targets:RCPayloadTarget[]=[];
 for(const kind of variants(plan.actionClass)) {
  const r=rule(kind),table=Prisma.raw(`"${kind}"`),digest=Prisma.raw(r.digest),deadline=Prisma.raw(`(${r.deadline})`);
  const prefix=`${plan.fingerprint}/${kind}/${plan.tenantId}/`;
  const claim=runId?Prisma.sql`AND EXISTS(SELECT 1 FROM "MaintenanceItemClaim" c WHERE c."maintenanceRunId"=${runId} AND c."itemKind"=${kind} AND c.state='CLAIMED' AND c."itemRefHash"=encode(sha256(convert_to(${prefix}||t.id||'/'||${digest}||'/'||floor(extract(epoch FROM ${deadline})*1000)::bigint::text,'UTF8')),'hex'))`:Prisma.empty;
  const rows=await tx.$queryRaw<RCPayloadTarget[]>(Prisma.sql`SELECT t.id,t."tenantId",${kind} AS kind,${digest} AS digest,${deadline} AS deadline FROM ${table} t
    WHERE t."tenantId"=${plan.tenantId} AND ${Prisma.raw(r.eligible)} AND ${deadline}<=${plan.cutoffAt}
    AND "RC_execution_set_resolved"(t."tenantId",${Prisma.raw(r.executions)}) ${claim}
    ORDER BY t.id LIMIT ${plan.batchSize-targets.length} ${lock?Prisma.sql`FOR UPDATE OF t`:Prisma.empty}`);
  for(const row of rows){if(row.kind==='OperationalAlertRun'&&(!verifier||!await verifier.verify(tx,row)))continue;targets.push(row);}if(targets.length>=plan.batchSize)break;
 }
 return targets;
}
export async function purgeRCPayload(tx:Prisma.TransactionClient,plan:RCPayloadPlan,target:RCPayloadTarget,storage?:RCPayloadStorage):Promise<boolean> {
 if(!variants(plan.actionClass).includes(target.kind) || target.tenantId!==plan.tenantId)throw Error('AC6 payload target outside approved plan');
 const r=rule(target.kind);
 if(target.kind==='TeamAttachment' && (!storage || !(await storage.eraseClaimedAttachment(tx,target))))return false;
 const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`UPDATE ${Prisma.raw(`"${target.kind}"`)} t SET ${Prisma.raw(r.update)} WHERE t.id=${target.id} AND t."tenantId"=${plan.tenantId} AND ${Prisma.raw(r.digest)}=${target.digest}
  AND ${Prisma.raw(`(${r.deadline})`)}=${target.deadline} AND ${Prisma.raw(r.eligible)} AND "RC_execution_set_resolved"(t."tenantId",${Prisma.raw(r.executions)}) RETURNING t.id`);
 return rows.length===1;
}
