import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientWantedSlotService } from '../crm/client-wanted-slot.service';
import { CanonicalInboxProjectionService } from '../inbox/canonical-inbox-projection.service';
/** R06 B48: accepted AC4/AC5 facts initiate their existing owners. */
@Injectable()
export class CanonicalAppointmentAlertsService {
 constructor(private readonly prisma:PrismaService,private readonly context:TenantContextService,private readonly wanted:ClientWantedSlotService,private readonly projections:CanonicalInboxProjectionService,private readonly config:ConfigService){}
 async tickTenant(tenantId:string){this.context.assertTenantId(tenantId);await this.projections.tickTenant(tenantId);const cutover=Date.parse(this.config.get<string>('CANONICAL_INBOX_PROJECTION_CUTOVER_AT')??'');if(!Number.isFinite(cutover))return;
  let cursor:string|undefined;for(;;){const events=await this.prisma.domainEvent.findMany({where:{tenantId,entityType:'appointment',type:'appointment.removed',version:1,observation:'after_watch_started',receivedAt:{gt:new Date(cutover)}},orderBy:{id:'asc'},take:200,...(cursor?{cursor:{id:cursor},skip:1}:{})});if(!events.length)break;
  for(const event of events){const appointment=await this.prisma.appointment.findUnique({where:{id_tenantId:{id:event.entityId,tenantId}}});if(!appointment?.staffId||appointment.crmProvider!=='yclients'||appointment.status!=='canceled'||appointment.startAt<=new Date())continue;
   const links=await this.prisma.staffProviderLink.findMany({where:{tenantId,staffId:appointment.staffId,provider:'yclients',unlinkedAt:null},take:2});if(links.length!==1)continue;
   try{await this.wanted.matchAvailable({externalStaffId:links[0].externalId,availableStartAt:appointment.startAt.toISOString(),sourceEventId:'domain-event:'+event.id});}catch{/* The canonical match/delivery owner retains its original outcome. */}
  }cursor=events.at(-1)!.id;
  }
 }
}
