import {Injectable} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {ActionEngineKernel} from '../action-engine';
import type {RCPayloadTarget,RCPayloadVerifier} from '../package5-wave6/package5-wave-rc-payloads';
import {OperationalAlertStore} from './operational-alert.store';
import {alertRequest} from './operational-alert.contract';
/** AC6 reads the same approved immutable manifest and exact AE binding set. */
@Injectable()
export class OperationalAlertPayloadVerifier implements RCPayloadVerifier {
 constructor(private readonly store:OperationalAlertStore,private readonly kernel:ActionEngineKernel){}
 async verify(tx:Prisma.TransactionClient,target:RCPayloadTarget){
  if(target.kind!=='OperationalAlertRun')return false;
  try{
   const root=await tx.operationalAlertRun.findUniqueOrThrow({where:{id_tenantId:{id:target.id,tenantId:target.tenantId}}});
   if(root.intentHash!==target.digest||root.payloadRetentionUntil.getTime()!==target.deadline.getTime())return false;
   const plan=this.store.read(root),executions=await this.store.executions(root,plan,tx);
   return plan.recipients.every(recipient=>{const expected=this.kernel.previewExecution(alertRequest(root.id,this.store.identity,plan,recipient));const row=executions.find(e=>e.operationalAlertSlotKey===recipient.slot.key);return row?.normalizedInputHash===expected.normalizedInputHash&&row.identityFingerprint===expected.identityFingerprint;});
  }catch{return false;}
 }
}
