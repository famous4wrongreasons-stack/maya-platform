import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, type TeamAttachment, type TeamMessage, type ActionExecution } from '@prisma/client';
import { ACTION_EXECUTION_REQUEST_CONTRACT, ActionEngineKernel, CanonicalActionIngressService, type TrustedActionExecutionRequestV1 } from '../action-engine';
import { attachExistingInvocationReceipt } from '../action-engine/action-invocation-receipt.context';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import { EncryptionService } from '../encryption/encryption.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave4FileObjectStore } from '../package5-wave4/package5-wave4-object-store.service';
import type { TeamStorageEvidence, TeamStorageIntent } from '../package5-wave4/package5-team-object-store';
import { TEAM_ACTIONS, TEAM_CONTRACT, TEAM_ROLES, normalizeTeamAction, teamCommand, teamHash, teamId, teamKey, type TeamOperation, type TeamPlan, type TeamSendCommand, type TeamReserveCommand, type TeamFinalizeCommand, type TeamWithdrawCommand } from './team-communications.contract';

type Tx = Prisma.TransactionClient;
/** The sole R12 message/reservation owner and canonical local/storage executors.
 * Initiators may transfer quarantined bytes only after reservation admission. */
@Injectable()
export class TeamCommunicationsService {
  readonly storage;
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService, private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService, objects: Package5Wave4FileObjectStore,
    @Optional() private readonly clock: () => Date = () => new Date()) { this.storage = objects.privateTeam(); }
  private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for(let n=0;n<5;n++)try{return await canonicalUtcTransaction(this.prisma,work);}catch(error){if(n<4&&(isPostgresSerializationConflict(error)||(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')))continue;throw error;}
    throw new ConflictException('Team admission contention');
  }
  private async lock(tx:Tx,scope:string){await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r12/${scope}`},0))::text`);}
  async member(tx:Tx,tenantId:string,userId:string){
    this.context.assertTenantId(tenantId);
    const m=await tx.membership.findUnique({where:{userId_tenantId:{tenantId,userId}},include:{user:{select:{status:true}},tenant:{select:{status:true}}}});
    if(!m||m.status!=='active'||m.user.status!=='active'||m.tenant.status!=='active'||!TEAM_ROLES.includes(m.role))throw new ForbiddenException('Current exact-tenant team membership required');return m;
  }
  storageIntent(row:TeamAttachment):TeamStorageIntent{return{objectStoreKey:row.objectStoreKey,contentSha256:row.contentSha256,declaredSize:Number(row.declaredSize),mime:row.mime,kind:row.kind};}
  private async attachment(tx:Tx,tenantId:string,userId:string,id:string){
    await this.lock(tx,`${tenantId}/attachment/${id}`);
    const row=await tx.teamAttachment.findUnique({where:{id_tenantId:{tenantId,id}}});
    if(!row||row.ownerUserId!==userId)throw new NotFoundException('Exact owned team attachment required');return row;
  }
  private result(execution:ActionExecution,commandHash:string){
    const receipt=execution.safeResultSummaryJson;
    if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.commandHash!==commandHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return receipt;
  }
  private async prior(tx:Tx,tenantId:string,userId:string,operation:TeamOperation,sourceRef:string,commandHash:string){
    const row=await tx.actionExecution.findFirst({where:{tenantId,actorUserId:userId,capability:TEAM_ACTIONS[operation],sourceRef}});
    if(!row)return null;
    await attachExistingInvocationReceipt(row);
    if(row.state==='SUCCEEDED')return{execution:row,receipt:this.result(row,commandHash)};
    const input=normalizeTeamAction(operation,await this.kernel.readTrustedNormalizedInput(tenantId,row.id,tx));
    if(input.commandHash!==commandHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');
    return{execution:row,receipt:{contract:TEAM_CONTRACT,actionExecutionId:row.id,state:row.state,attachmentId:row.targetRef,commandHash}};
  }
  async act(tenantId:string,userId:string,operation:TeamOperation,value:unknown,key:unknown):Promise<Prisma.JsonObject>{
    this.context.assertAuthPrincipal(userId,tenantId);
    const command=teamCommand(operation,value),callerKey=teamKey(key);
    const commandHash=teamHash('caller-intent',{contractVersion:1,tenantId,actorUserId:userId,operation,command});
    const identityHash=teamHash('identity',{tenantId,userId,operation,callerKey}),sourceRef=`team:${identityHash}`;
    // Stage verification has no final effect. An existing execution is checked
    // first, so a restart never needs vanished staging to repeat a publish.
    let staged:TeamStorageEvidence|undefined;
    if(operation==='finalize'){
      const pre=await this.transaction(async tx=>{await this.member(tx,tenantId,userId);await this.lock(tx,`${tenantId}/${sourceRef}`);const prior=await this.prior(tx,tenantId,userId,operation,sourceRef,commandHash);if(prior)return prior;
        const c=command as TeamFinalizeCommand,row=await this.attachment(tx,tenantId,userId,c.attachmentId);
        if(row.contentSha256!==c.expectedDigest||row.state!=='RESERVED'||row.uploadExpiresAt<=this.clock()||row.finalizeExecutionId)throw new ConflictException('Original active upload reservation required');return{attachment:row};});
      if('execution'in pre)return this.executeFinalize(tenantId,pre.execution.id,commandHash);
      staged=await this.storage.inspectStaged(this.storageIntent(pre.attachment));
    }
    const admitted=await this.transaction(async tx=>{
      const actor=await this.member(tx,tenantId,userId);await this.lock(tx,`${tenantId}/${sourceRef}`);
      const prior=await this.prior(tx,tenantId,userId,operation,sourceRef,commandHash);if(prior)return{execution:prior.execution,receipt:prior.receipt};
      const now=this.clock();let targetRef:string,facts:Record<string,unknown>,intent:Record<string,unknown>;
      let attachment:TeamAttachment|null=null,message:TeamMessage|null=null,plan:TeamPlan|undefined;
      if(operation==='send'){
        const c=command as TeamSendCommand;targetRef=randomUUID();
        if(c.attachmentId){attachment=await this.attachment(tx,tenantId,userId,c.attachmentId);const final=attachment.finalizeExecutionId?await tx.actionExecution.findUnique({where:{id:attachment.finalizeExecutionId}}):null;
          if(attachment.state!=='SEALED'||attachment.uploadExpiresAt<=now||attachment.payloadErasedAt||final?.state!=='SUCCEEDED'||await tx.teamMessage.findFirst({where:{tenantId,attachmentId:attachment.id}}))throw new ConflictException('One unconsumed confirmed owned attachment required');}
        const payload={text:c.text,attachmentId:c.attachmentId},payloadHash=teamHash('payload',payload);
        const members=await tx.membership.findMany({where:{tenantId,status:'active',role:{in:TEAM_ROLES},user:{status:'active'},userId:{not:userId}},orderBy:{userId:'asc'},take:10001});
        if(members.length>10000)throw new ConflictException('Team audience exceeds bounded admission');
        plan={contract:TEAM_CONTRACT,tenantId,messageId:targetRef,senderUserId:userId,conversationKey:'team/main',createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+365*86400000).toISOString(),payloadHash,slots:members.map(m=>({slotKey:teamHash('slot',{tenantId,messageId:targetRef,userId:m.userId,channel:'inbox'}),userId:m.userId,membershipId:m.id,role:m.role,branchId:m.branchId,channel:'inbox',eligibilityHash:teamHash('eligibility',{membershipId:m.id,role:m.role,branchId:m.branchId,status:m.status,channel:'inbox'})}))};
        facts={messageId:targetRef,plan,planHash:teamHash('plan',plan),attachmentContentHash:attachment?.contentSha256??null};
        intent={contractVersion:1,tenantId,senderUserId:userId,conversationKey:'team/main',normalizedText:c.text,attachmentId:c.attachmentId,attachmentContentHash:attachment?.contentSha256??null};
      }else if(operation==='withdraw'){
        const c=command as TeamWithdrawCommand;targetRef=c.messageId;await this.lock(tx,`${tenantId}/message/${targetRef}`);
        message=await tx.teamMessage.findUnique({where:{id_tenantId:{id:targetRef,tenantId}}});
        if(!message||message.senderUserId!==userId)throw new ForbiddenException('Only current original sender may withdraw');
        if(message.status==='WITHDRAWN')throw new ConflictException('Use original withdrawal identity to retrieve its receipt');
        if(message.revision!==c.expectedRevision)throw new ConflictException('STALE_TEAM_REVISION');
        facts={messageId:targetRef,sendExecutionId:message.sendExecutionId};intent={contractVersion:1,tenantId,senderUserId:userId,messageId:targetRef,expectedRevision:c.expectedRevision};
      }else if(operation==='reserve'){
        const c=command as TeamReserveCommand;targetRef=randomUUID();facts={attachmentId:targetRef,objectStoreKey:`team-v1/${teamHash('object-key',{tenantId,ownerUserId:userId,attachmentId:targetRef})}`,createdAt:now.toISOString(),uploadExpiresAt:new Date(now.getTime()+3600000).toISOString()};
        intent={contractVersion:1,tenantId,ownerUserId:userId,contentSha256:c.contentSha256,declaredSize:c.declaredSize,mediaKind:c.kind,mime:c.mime,normalizedFilename:c.filename,retentionPolicyVersion:c.retentionPolicyVersion};
      }else{
        const c=command as TeamFinalizeCommand;targetRef=c.attachmentId;attachment=await this.attachment(tx,tenantId,userId,targetRef);
        if(!staged||attachment.state!=='RESERVED'||attachment.finalizeExecutionId||attachment.uploadExpiresAt<=now||attachment.contentSha256!==c.expectedDigest||staged.objectStoreKey!==attachment.objectStoreKey||staged.actualSize!==Number(attachment.declaredSize)||staged.mime!==attachment.mime||staged.contentSha256!==attachment.contentSha256)throw new ConflictException('Original verified staged intent required');
        facts={attachmentId:targetRef,objectStoreKey:attachment.objectStoreKey,verifiedStagedSize:staged.actualSize,verifiedStagedMime:staged.mime,stagedContentHash:staged.contentSha256};intent={contractVersion:1,tenantId,ownerUserId:userId,attachmentId:targetRef,expectedDigest:c.expectedDigest,verifiedStagedSize:staged.actualSize,verifiedStagedMime:staged.mime,stagedContentHash:staged.contentSha256};
      }
      const intentHash=teamHash('intent',intent),input={contract:TEAM_CONTRACT,operation,tenantId,actorUserId:userId,actorMembershipId:actor.id,targetRef,command,commandHash,intentHash,facts};
      const request:TrustedActionExecutionRequestV1={contract:ACTION_EXECUTION_REQUEST_CONTRACT,tenantId,capability:TEAM_ACTIONS[operation],source:{type:'authenticated_request',sourceRef,actorUserId:userId,occurrenceScope:sourceRef},targetRef,input,evidenceRefs:[`team-intent:${intentHash}`],callerIdempotency:{scope:`team.${operation}`,key:sourceRef}};
      if((await this.ingress.preview(request)).policyDecision!=='ALLOW')throw new ForbiddenException('Team canonical policy denied');
      const execution=await this.ingress.createExecution(request,tx);
      if(operation==='finalize'){
        await tx.teamAttachment.update({where:{id:targetRef,revision:attachment!.revision},data:{finalizeExecutionId:execution.id,revision:{increment:1}}});
        return{execution,receipt:{contract:TEAM_CONTRACT,actionExecutionId:execution.id,attachmentId:targetRef,state:execution.state,commandHash}};
      }
      const claim=await this.kernel.claimExecution({tenantId,executionId:execution.id,workerId:'team.local'},tx);
      if(operation==='send'){
        const c=command as TeamSendCommand;
        await tx.teamMessage.create({data:{id:targetRef,tenantId,conversationKey:'team/main',senderUserId:userId,sendExecutionId:execution.id,identityHash,intentHash,payloadEncrypted:this.encryption.encrypt(JSON.stringify({text:c.text,attachmentId:c.attachmentId})),payloadHash:plan!.payloadHash,attachmentId:c.attachmentId,createdAt:now,expiresAt:new Date(plan!.expiresAt),revision:0,planHash:String(facts.planHash),planEncrypted:this.encryption.encrypt(JSON.stringify(plan)),status:'SENT'}});
        if(attachment)await tx.teamAttachment.update({where:{id:attachment.id,revision:attachment.revision},data:{state:'BOUND',revision:{increment:1},mediaExpiresAt:new Date(now.getTime()+48*3600000)}});
      }else if(operation==='withdraw')await tx.teamMessage.update({where:{id:targetRef,revision:0},data:{status:'WITHDRAWN',revision:1,withdrawnAt:now,withdrawnByUserId:userId,withdrawalExecutionId:execution.id,withdrawalIdentityHash:identityHash,withdrawalIntentHash:intentHash}});
      else{
        const c=command as TeamReserveCommand;
        await tx.teamAttachment.create({data:{id:targetRef,tenantId,ownerUserId:userId,reserveExecutionId:execution.id,uploadIdentityHash:identityHash,intentHash,objectStoreKey:String(facts.objectStoreKey),contentSha256:c.contentSha256,declaredSize:BigInt(c.declaredSize),mime:c.mime,kind:c.kind,filenameEncrypted:this.encryption.encrypt(c.filename),state:'RESERVED',revision:0,createdAt:now,uploadExpiresAt:new Date(String(facts.uploadExpiresAt))}});
      }
      await this.mutation(tx,execution,intentHash,operation==='withdraw'?1:0);
      const receipt={contract:TEAM_CONTRACT,actionExecutionId:execution.id,commandHash,intentHash,...(operation==='send'||operation==='withdraw'?{messageId:targetRef,status:operation==='send'?'SENT':'WITHDRAWN'}:{attachmentId:targetRef,state:'RESERVED',uploadExpiresAt:String(facts.uploadExpiresAt)}),externalMessages:0};
      await this.kernel.finalizeSuccess({tenantId,executionId:execution.id,attemptId:claim.attempt.id,leaseToken:claim.leaseToken,outcomeCode:'team_owner_committed',safeResult:receipt},tx);
      return{execution,receipt};
    });
    return operation==='finalize'?this.executeFinalize(tenantId,admitted.execution.id,commandHash):admitted.receipt;
  }
  private async mutation(tx:Tx,e:ActionExecution,hash:string,generation:number){
    const existing=await tx.actionTargetMutation.findFirst({where:{tenantId:e.tenantId,actionExecutionId:e.id}});if(existing)return;
    await tx.actionTargetMutation.create({data:{tenantId:e.tenantId,actionExecutionId:e.id,mutationKey:`team:${e.actionClass}:${e.targetRef}`,targetKind:e.targetKind,targetRef:e.targetRef,targetGeneration:generation,mutationKind:e.actionClass,beforeStateHash:teamHash('before',{targetRef:e.targetRef,generation}),afterStateHash:hash}});
  }
  async chunk(tenantId:string,userId:string,id:string,index:number,bytes:Buffer){
    this.context.assertAuthPrincipal(userId,tenantId);teamId(id);
    // No transaction retry wraps byte transfer. A caller repeats the same
    // reserved chunk identity; the storage adapter proves equal bytes.
    return canonicalUtcTransaction(this.prisma,async tx=>{await this.member(tx,tenantId,userId);const row=await this.attachment(tx,tenantId,userId,id);
      if(row.state!=='RESERVED'||row.finalizeExecutionId||row.uploadExpiresAt<=this.clock())throw new ForbiddenException('Active unfinalized reservation required');
      const reserve=await tx.actionExecution.findUniqueOrThrow({where:{id:row.reserveExecutionId}});if(reserve.state!=='SUCCEEDED')throw new ForbiddenException('Upload before canonical admission');
      return{contract:TEAM_CONTRACT,attachmentId:id,...await this.storage.putChunk(this.storageIntent(row),index,bytes)};});
  }
  async executeFinalize(tenantId:string,executionId:string,commandHash:string):Promise<Prisma.JsonObject>{
    this.context.assertTenantId(tenantId);
    let execution=await this.prisma.actionExecution.findUniqueOrThrow({where:{id_tenantId:{id:executionId,tenantId}}});
    if(execution.capability!==TEAM_ACTIONS.finalize||!execution.actorUserId)throw new ForbiddenException('Canonical team finalize execution required');
    await canonicalUtcTransaction(this.prisma,tx=>this.member(tx,tenantId,execution.actorUserId!));
    const row=await this.prisma.teamAttachment.findUniqueOrThrow({where:{id_tenantId:{id:execution.targetRef,tenantId}}});
    if(row.ownerUserId!==execution.actorUserId||row.finalizeExecutionId!==execution.id)throw new ForbiddenException('Exact admitted team object required');
    // A durable confirmed receipt survives the retention of encrypted input.
    // It may repair the existing projection, but never reopens storage publish.
    if(execution.state==='SUCCEEDED'){
      const result=this.result(execution,commandHash);await this.seal(tenantId,execution,row,result);return result;
    }
    const input=normalizeTeamAction('finalize',await this.kernel.readTrustedNormalizedInput(tenantId,execution.id));
    if(input.commandHash!==commandHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');
    if(row.objectStoreKey!==input.facts.objectStoreKey||row.contentSha256!==input.facts.stagedContentHash)throw new ForbiddenException('Exact admitted team object required');
    if(execution.leaseExpiresAt&&execution.leaseExpiresAt<this.clock())execution=await this.kernel.recoverExpiredClaim({tenantId,executionId,asOf:this.clock()});
    const pending=()=>({contract:TEAM_CONTRACT,actionExecutionId:executionId,attachmentId:row.id,state:execution.state,reconciliationState:execution.reconciliationState,commandHash});
    if(execution.state==='SUCCEEDED'){
      const result=this.result(execution,commandHash);await this.seal(tenantId,execution,row,result);return result;
    }
    if(execution.state==='UNKNOWN'){
      if(execution.reconciliationState!=='REQUIRED')return pending();
      const claim=await this.kernel.claimReconciliation({tenantId,executionId,workerId:'team.storage.reconcile'});
      let evidence:TeamStorageEvidence|null=null;try{evidence=await this.storage.head(this.storageIntent(row));}catch{/* An absent/mismatched object is never proof of non-execution. */}
      const result=evidence?this.finalReceipt(execution,input,evidence):{contract:TEAM_CONTRACT,actionExecutionId:executionId,attachmentId:row.id,commandHash,state:'UNKNOWN'};
      await this.kernel.finalizeReconciliation({tenantId,executionId,attemptId:claim.attempt.id,leaseToken:claim.leaseToken,outcome:evidence?'PROVEN_SUCCEEDED':'STILL_UNKNOWN',safeResult:result});
      if(evidence)await this.seal(tenantId,execution,row,result);
      return result;
    }
    if(execution.state!=='READY')return pending();
    let claim;
    try{claim=await this.kernel.claimExecution({tenantId,executionId,workerId:'team.storage.finalize'});}catch(error){
      const current=await this.prisma.actionExecution.findUniqueOrThrow({where:{id:executionId}});if(current.state!=='READY'){execution=current;return pending();}throw error;
    }
    const owned={tenantId,executionId,attemptId:claim.attempt.id,leaseToken:claim.leaseToken};
    try{
      await canonicalUtcTransaction(this.prisma,async tx=>{await this.member(tx,tenantId,execution.actorUserId!);const current=await this.attachment(tx,tenantId,execution.actorUserId!,row.id);if(current.state!=='RESERVED'||current.uploadExpiresAt<=this.clock())throw new ForbiddenException('Upload reservation expired before publish');});
    }catch{
      await this.kernel.finalizeDefinitiveFailure({...owned,outcomeCode:'team_storage_not_dispatched',errorClass:'reservation_unavailable'});return{...pending(),state:'FAILED'};
    }
    await this.kernel.markDispatchMayHaveCrossed(owned);
    try{
      const evidence=await this.storage.publish(this.storageIntent(row)),result=this.finalReceipt(execution,input,evidence);
      await this.transaction(async tx=>{await this.member(tx,tenantId,execution.actorUserId!);const current=await this.attachment(tx,tenantId,execution.actorUserId!,row.id);await this.sealRow(tx,current,evidence);await this.mutation(tx,execution,String(input.intentHash),1);await this.kernel.finalizeSuccess({...owned,outcomeCode:'team_object_committed',safeResult:result},tx);});return result;
    }catch{
      await this.kernel.finalizeUnknown({...owned,outcomeCode:'team_storage_receipt_unknown',errorClass:'storage_unconfirmed'});
      return{...pending(),state:'UNKNOWN',reconciliationState:'REQUIRED'};
    }
  }
  private finalReceipt(execution:ActionExecution,input:ReturnType<typeof normalizeTeamAction>,evidence:TeamStorageEvidence){return{contract:TEAM_CONTRACT,actionExecutionId:execution.id,attachmentId:execution.targetRef,state:'SEALED',commandHash:String(input.commandHash),intentHash:String(input.intentHash),storageReceiptHash:evidence.receiptHash,actualSize:evidence.actualSize};}
  private async sealRow(tx:Tx,row:TeamAttachment,evidence:TeamStorageEvidence){
    if(row.state==='SEALED'||row.state==='BOUND'){if(row.storageReceiptHash!==evidence.receiptHash)throw new ConflictException('Stored team receipt mismatch');return;}
    if(row.state!=='RESERVED')throw new ConflictException('Team object no longer sealable');
    await tx.teamAttachment.update({where:{id:row.id,revision:row.revision},data:{state:'SEALED',actualSize:BigInt(evidence.actualSize),storageReceiptHash:evidence.receiptHash,lastObservedAt:this.clock(),revision:{increment:1}}});
  }
  private async seal(tenantId:string,e:ActionExecution,row:TeamAttachment,result:Prisma.JsonObject|Record<string,unknown>){
    // Reconciliation may have committed its AE receipt before the owner
    // projection. Recovery uses the original exact object, never republishes.
    if(row.state==='BOUND'||row.state==='SEALED'||row.state==='ERASED'){
      if(row.storageReceiptHash!==result.storageReceiptHash||Number(row.actualSize)!==result.actualSize)throw new ConflictException('Confirmed team projection receipt mismatch');return;
    }
    const evidence=await this.storage.head(this.storageIntent(row));if(!evidence||result.storageReceiptHash!==evidence.receiptHash)throw new ConflictException('Confirmed storage receipt unavailable');
    await this.transaction(async tx=>{await this.member(tx,tenantId,e.actorUserId!);const current=await this.attachment(tx,tenantId,e.actorUserId!,row.id);await this.sealRow(tx,current,evidence);await this.mutation(tx,e,String(result.intentHash),1);});
  }
  async feed(tenantId:string,userId:string,before?:string){
    this.context.assertAuthPrincipal(userId,tenantId);if(before)teamId(before);
    return canonicalUtcTransaction(this.prisma,async tx=>{await this.member(tx,tenantId,userId);
      const cursor=before?await tx.teamMessage.findUnique({where:{id_tenantId:{id:before,tenantId}}}):null;if(before&&!cursor)throw new NotFoundException('Exact team cursor required');
      const rows=await tx.teamMessage.findMany({where:{tenantId,conversationKey:'team/main',expiresAt:{gt:this.clock()},...(cursor?{OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:101,include:{senderMembership:{include:{user:{select:{encryptedName:true}}}}}});
      const messages=[];for(const row of rows.slice(0,100)){
        const payload=row.status==='SENT'&&row.payloadEncrypted?JSON.parse(this.encryption.decrypt(row.payloadEncrypted)) as {text:string;attachmentId:string|null}:null;
        if(payload&&teamHash('payload',payload)!==row.payloadHash)throw new ForbiddenException('Team payload integrity failure');
        const attachment=payload?.attachmentId?await tx.teamAttachment.findUnique({where:{id_tenantId:{id:payload.attachmentId,tenantId}}}):null;
        const visible=attachment?.state==='BOUND'&&attachment.mediaExpiresAt&&attachment.mediaExpiresAt>this.clock()&&attachment.filenameEncrypted;
        messages.push({id:row.id,senderUserId:row.senderUserId,senderName:row.senderMembership.user.encryptedName?this.encryption.decrypt(row.senderMembership.user.encryptedName):null,own:row.senderUserId===userId,text:payload?.text??null,status:row.status,revision:row.revision,createdAt:row.createdAt.toISOString(),attachment:visible?{id:attachment.id,kind:attachment.kind,mime:attachment.mime,filename:this.encryption.decrypt(attachment.filenameEncrypted!),size:Number(attachment.actualSize),expiresAt:attachment.mediaExpiresAt!.toISOString()}:null});
      }
      return{contract:TEAM_CONTRACT,tenantId,userId,conversationKey:'team/main',messages,nextCursor:rows.length>100?rows[99].id:null,readOnly:true};
    },{readOnly:true});
  }
  async media(tenantId:string,userId:string,id:string){
    this.context.assertAuthPrincipal(userId,tenantId);teamId(id);
    const row=await canonicalUtcTransaction(this.prisma,async tx=>{await this.member(tx,tenantId,userId);const a=await tx.teamAttachment.findUnique({where:{id_tenantId:{id,tenantId}}}),m=await tx.teamMessage.findFirst({where:{tenantId,attachmentId:id,status:'SENT',expiresAt:{gt:this.clock()},payloadErasedAt:null}});
      if(!a||!m||a.state!=='BOUND'||!a.mediaExpiresAt||a.mediaExpiresAt<=this.clock()||a.payloadErasedAt||!a.filenameEncrypted)throw new NotFoundException('Team media unavailable');return a;},{readOnly:true});
    return{stream:await this.storage.read(this.storageIntent(row)),mime:row.mime,size:Number(row.actualSize),filename:this.encryption.decrypt(row.filenameEncrypted!)};
  }
}
