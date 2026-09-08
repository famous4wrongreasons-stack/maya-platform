import { Injectable,ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma,type OperationalAlertRun } from '@prisma/client';
import { ActionIdentityService,stableActionJson } from '../action-engine/action-engine.identity';
import { CanonicalActionIngressService } from '../action-engine/action-engine.ingress';
import { ActionConflictError,ActionContractError } from '../action-engine/action-engine.errors';
import { retryableBulkTransaction } from '../marketing/canonical-bulk.contract';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ALERT_DAY,alertFingerprint,alertRequest,normalizeAlert,type AlertPlan,type AlertRecipient } from './operational-alert.contract';
@Injectable()
export class OperationalAlertStore {
 readonly identity:ActionIdentityService;readonly cutoverAt:number;
 constructor(private readonly prisma:PrismaService,private readonly context:TenantContextService,private readonly ingress:CanonicalActionIngressService,config:ConfigService){this.identity=new ActionIdentityService(config.get<string>('ACTION_ENGINE_IDENTITY_SECRET')??config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET')??config.getOrThrow<string>('CRM_ENCRYPTION_KEY'));this.cutoverAt=Date.parse(config.get<string>('OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT')??'');}
 find(tenantId:string,kind:AlertPlan['alertType'],occurrenceRef:string){this.context.assertTenantId(tenantId);return this.prisma.operationalAlertRun.findUnique({where:{tenantId_alertType_occurrenceRef_contractVersion:{tenantId,alertType:kind,occurrenceRef,contractVersion:1}}});}
 read(run:OperationalAlertRun):AlertPlan{if(!run.intentEncrypted)throw new ForbiddenException('R06 alert payload unavailable');const plan=normalizeAlert(JSON.parse(this.identity.decryptNormalizedPayload(run.intentEncrypted)));if(plan.tenantId!==run.tenantId||plan.alertType!==run.alertType||plan.occurrenceRef!==run.occurrenceRef||alertFingerprint(this.identity,plan)!==run.intentHash||Date.parse(plan.expiresAt)!==run.expiresAt.getTime()||Date.parse(plan.occurredAt)!==run.occurredAt.getTime())throw new ActionContractError('R06 durable manifest mismatch');return plan;}
 async authorize(plan:AlertPlan,recipient:AlertRecipient,tx:Prisma.TransactionClient=this.prisma){
  this.context.assertTenantId(plan.tenantId);
  const member=await tx.membership.findFirst({where:{id:recipient.membershipId,tenantId:plan.tenantId,userId:recipient.userId,role:recipient.role as never,status:'active',user:{status:'active'},tenant:{status:'active'}}});
  if(!member||(member.branchId?'branch:'+member.branchId:'tenant')!==recipient.branchScope||member.branchId&&member.branchId!==plan.source.branchId)throw new ForbiddenException('R06 exact current recipient authority required');
  const key=this.identity.hmac('maya.operational-alert-slot/1',{tenantId:plan.tenantId,occurrenceRef:plan.occurrenceRef,userId:member.userId,membershipId:member.id,channel:'inbox'});
  if(key!==recipient.slot.key)throw new ForbiddenException('R06 exact immutable recipient slot required');
 }
 async admit(candidate:AlertPlan,verifySource:(tx:Prisma.TransactionClient)=>Promise<void>,now=new Date()){
  const plan=normalizeAlert(candidate);this.context.assertTenantId(plan.tenantId);const hash=alertFingerprint(this.identity,plan);
  const equivalent=(run:OperationalAlertRun)=>{if(run.intentHash!==hash)throw new ActionConflictError('IDEMPOTENCY_CONFLICT');return run;};
  for(let attempt=0;attempt<5;attempt++)try{return await this.prisma.$transaction(async tx=>{
   const prior=await tx.operationalAlertRun.findUnique({where:{tenantId_alertType_occurrenceRef_contractVersion:{tenantId:plan.tenantId,alertType:plan.alertType,occurrenceRef:plan.occurrenceRef,contractVersion:1}}});if(prior)return equivalent(prior);
   const occurred=Date.parse(plan.occurredAt),end=Date.parse(plan.expiresAt),window=plan.alertType==='staff_shift_reminder'?300000:ALERT_DAY;
   if(!Number.isFinite(this.cutoverAt)||occurred<=this.cutoverAt||occurred>now.getTime()||now.getTime()>=occurred+window||end<=now.getTime())throw new ActionContractError('R06 prospective finite admission window required');
   await verifySource(tx);for(const recipient of plan.recipients)await this.authorize(plan,recipient,tx);
   const root=await tx.operationalAlertRun.create({data:{tenantId:plan.tenantId,alertType:plan.alertType,occurrenceRef:plan.occurrenceRef,contractVersion:1,occurredAt:new Date(plan.occurredAt),expiresAt:new Date(plan.expiresAt),admittedAt:now,intentHash:hash,intentEncrypted:this.identity.encryptNormalizedPayload(stableActionJson(plan)),payloadRetentionUntil:new Date(now.getTime()+7*ALERT_DAY),auditRetentionUntil:new Date(now.getTime()+365*ALERT_DAY)}});
   for(const recipient of plan.recipients){const row=await this.ingress.createExecution(alertRequest(root.id,this.identity,plan,recipient),tx);if(row.state!=='READY'||row.operationalAlertRunId!==root.id||row.operationalAlertSlotKey!==recipient.slot.key)throw new ActionContractError('R06 complete atomic slot admission required');}
   return root;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000,maxWait:10000});}catch(error){if(!retryableBulkTransaction(error)||attempt===4)throw error;const winner=await this.find(plan.tenantId,plan.alertType,plan.occurrenceRef);if(winner)return equivalent(winner);}
  throw new ActionConflictError('R06 admission did not converge');
 }
 async executions(root:OperationalAlertRun,plan:AlertPlan,tx:Prisma.TransactionClient=this.prisma){const rows=await tx.actionExecution.findMany({where:{tenantId:root.tenantId,operationalAlertRunId:root.id},orderBy:{operationalAlertSlotKey:'asc'}});if(rows.length!==plan.recipients.length||rows.some(row=>!plan.recipients.some(r=>r.slot.key===row.operationalAlertSlotKey)||row.capability!==plan.policy.capability||row.intentExpiresAt?.getTime()!==root.expiresAt.getTime()))throw new ActionContractError('R06 full immutable slot set required');return rows;}
 async dispatch(root:OperationalAlertRun,recipient:AlertRecipient,verifySource:()=>Promise<void>){const plan=this.read(root);await this.executions(root,plan);const frozen=plan.recipients.find(r=>r.slot.key===recipient.slot.key);if(!frozen||stableActionJson(frozen)!==stableActionJson(recipient))throw new ActionContractError('R06 slot outside admitted audience');return{request:alertRequest(root.id,this.identity,plan,frozen),authorize:async()=>{const current=await this.prisma.operationalAlertRun.findUniqueOrThrow({where:{id_tenantId:{id:root.id,tenantId:root.tenantId}}});if(current.expiresAt<=new Date()||!current.intentEncrypted||current.intentHash!==root.intentHash)throw new ForbiddenException('R06 alert expired');await this.authorize(plan,frozen);await verifySource();if((await this.ingress.preview(alertRequest(root.id,this.identity,plan,frozen))).policyDecision!=='ALLOW')throw new ForbiddenException('R06 current policy denied');}};}
}
