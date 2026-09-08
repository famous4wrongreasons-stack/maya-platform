import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { CommunicationDeliveryService } from '../communication-delivery';
import { TeamMessageStore } from './team-message.store';
/** Only resumes already admitted message plans, never synthesizes a sender,
 * message, new audience or external delivery route. */
@Injectable()
export class TeamCommunicationsScheduler implements OnModuleInit,OnModuleDestroy{
 private first?:NodeJS.Timeout;private timer?:NodeJS.Timeout;private busy=false;private readonly logger=new Logger(TeamCommunicationsScheduler.name);
 constructor(private readonly prisma:PrismaService,private readonly context:TenantContextService,private readonly store:TeamMessageStore,private readonly delivery:CommunicationDeliveryService){}
 onModuleInit(){this.first=setTimeout(()=>void this.tick(),90000);this.first.unref();this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}
 onModuleDestroy(){if(this.first)clearTimeout(this.first);if(this.timer)clearInterval(this.timer);}
 async tickTenant(tenantId:string){let cursor:string|undefined;
  for(;;){const rows:Array<{id:string}>=await this.prisma.teamMessage.findMany({where:{tenantId,planEncrypted:{not:null}},orderBy:{id:'asc'},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true}});
   for(const row of rows){let loaded:Awaited<ReturnType<TeamMessageStore['read']>>;try{loaded=await canonicalUtcTransaction(this.prisma,tx=>this.store.read(tx,tenantId,row.id),{readOnly:true});}catch{continue;}
    for(const slot of loaded.plan.slots){const existing=await this.prisma.actionExecution.findFirst({where:{tenantId,teamMessageId:row.id,teamMessageSlotKey:slot.slotKey}});if(existing&&['SUCCEEDED','FAILED','NOT_EXECUTED','CANCELED'].includes(existing.state))continue;
     try{await this.delivery.deliverTeamMessageSlot(tenantId,row.id,slot.slotKey);}catch{/* Original AE/CD remains the outcome authority; independent recipients continue. */}
    }
   }if(rows.length<100)break;cursor=rows.at(-1)!.id;
  }
 }
 async tick(){if(this.busy)return;this.busy=true;try{let cursor:string|undefined;for(;;){const tenants:Array<{id:string}>=await this.prisma.tenant.findMany({where:{status:'active'},select:{id:true},orderBy:{id:'asc'},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{})});for(const t of tenants)await this.context.runAsSystemTenant(t.id,()=>this.tickTenant(t.id).catch(()=>{this.logger.warn('Canonical team resume held');}));if(tenants.length<100)break;cursor=tenants.at(-1)!.id;}}finally{this.busy=false;}}
}
