import { filterAssistantCapability } from '../dashboard-preferences/assistant-preferences.read';
import { ExpensesService } from '../expenses/expenses.service';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { BadRequestException,ConflictException,ForbiddenException,Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ActionIdentityService } from '../action-engine';
import { AiToolRuntimeService } from '../ai-tools/ai-tool-runtime.service';
import type { ValidatedAiToolArguments } from '../ai-tools/ai-tool.types';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { expenseAuditUntil,expenseHash,expenseDay,EXPENSE_INTAKE_CONTRACT } from './expense-reminder.contract';
import { ExpenseReminderStore } from './expense-reminder.store';
import { assertVerifiedExpenseSource,type VerifiedExpenseSource } from './expense-intake-source.service';

/** Pure candidates only. No model, current-date default or next-message state.
 * A missing dimension requires a new complete explicit source command. */
export function parseExpenseCards(text:string):ValidatedAiToolArguments[]{
 const clean=text.replace(/^\/rashod(?:@[A-Za-z0-9_]+)?\s*/,'').replace(/^@[A-Za-z0-9_-]+:[a-f0-9]{64}\s*/,'').trim(),lines=clean.split(/\r?\n/).filter(s=>s.trim());
 if(lines.length<1||lines.length>10)throw new BadRequestException('One to ten complete expense cards required');
 return lines.map(line=>{const cells=line.split('|').map(s=>s.trim().normalize('NFC'));if(cells.length<4||cells.length>5||!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])||!/^\d+(?:[.,]\d{1,2})?$/.test(cells[2])||!cells[1]||!cells[3]||cells.length===5&&!cells[4])throw new BadRequestException('Укажите: YYYY-MM-DD | статья | рубли | ID филиала или весь бизнес | примечание (необязательно)');return{occurred_on:cells[0],category:cells[1],amount_rubles:Number(cells[2].replace(',','.')),branch_id:['весь бизнес','tenant'].includes(cells[3].toLowerCase())?null:cells[3],...(cells[4]?{note:cells[4]}:{})};});
}
function cardId(hash:string,index:number,kind:string){const h=expenseHash(`maya.expense-intake-${kind}/1`,{sourceEventHash:hash,itemIndex:index});return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}

@Injectable()
export class ExpenseIntakeService {
 private readonly identity:ActionIdentityService;
 constructor(private readonly prisma:PrismaService,private readonly context:TenantContextService,private readonly store:ExpenseReminderStore,private readonly approvals:AiToolRuntimeService,config:ConfigService,private readonly expenses:ExpensesService){this.identity=new ActionIdentityService(config.get<string>('ACTION_ENGINE_IDENTITY_SECRET')??config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET')??config.getOrThrow<string>('CRM_ENCRYPTION_KEY'));}
 private async reminder(tx:Prisma.TransactionClient,verified:VerifiedExpenseSource){const {source:s,actor,authIdentityId}=verified;if(s.mode==='standalone')return{runId:null,slotKey:null};
  const candidates=await tx.expenseReminderRun.findMany({where:{tenantId:s.tenantId,...(s.reminderRunId?{id:s.reminderRunId}:{}),expiresAt:{gt:this.store.clock()},intentEncrypted:{not:null}},take:100});const matches:Array<{runId:string;slotKey:string}>=[];
  for(const root of candidates){const plan=this.store.read(root),slot=plan.slots.find(r=>r.userId===actor.userId&&r.membershipId===actor.membershipId&&r.authIdentityId===authIdentityId&&r.telegramId===s.senderId&&(!s.reminderSlotKey||r.slotKey===s.reminderSlotKey));if(!slot)continue;const executions=await this.store.executions(root,plan,tx),execution=executions.find(e=>e.expenseReminderSlotKey===slot.slotKey)!;
   if(s.replyToMessageId){const refHash=this.identity.hmac('maya.communication-provider-reference/1',s.replyToMessageId);const receipt=await tx.marketingDeliveryAttempt.findFirst({where:{tenantId:s.tenantId,providerReferenceHash:refHash,campaign:{actionExecutionId:execution.id,channel:'telegram'},state:'SUCCEEDED'}});if(!receipt)continue;}
   matches.push({runId:root.id,slotKey:slot.slotKey});
  }if(matches.length!==1)throw new ForbiddenException('Exact unexpired original reminder context required; UNKNOWN is not delivery proof');return matches[0];
 }
 async admit(v:VerifiedExpenseSource,parser:(text:string)=>ValidatedAiToolArguments[]=parseExpenseCards){assertVerifiedExpenseSource(v);const {source:s,actor}=v;this.context.assertTenantId(s.tenantId);
  return this.store.transaction(async tx=>{const member=await this.store.actor(tx,s.tenantId,actor.userId);if(member.id!==actor.membershipId||member.role!==actor.role)throw new ForbiddenException('Expense membership changed');
   await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r13-intake/${s.tenantId}/${s.sourceNamespace}/${v.sourceEventHash}`},0))::text`);
   const identity=await tx.authIdentity.findFirst({where:{id:v.authIdentityId,tenantId:s.tenantId,userId:actor.userId,provider:'telegram',providerUserId:s.senderId}}),session=await tx.authSession.findFirst({where:{id:actor.sessionId,tenantId:s.tenantId,userId:actor.userId,revokedAt:null,expiresAt:{gt:this.store.clock()}}});if(!identity||!session)throw new ForbiddenException('Current verified source identity/session required');
   const previous=await tx.expenseIntakeBinding.findMany({where:{tenantId:s.tenantId,sourceNamespace:s.sourceNamespace,sourceEventHash:v.sourceEventHash},orderBy:{itemIndex:'asc'}});
   if(previous.length){if(previous.some((b,i)=>b.sourceContentHash!==v.sourceContentHash||b.actorUserId!==actor.userId||b.actorMembershipId!==member.id||b.authIdentityId!==v.authIdentityId||b.itemIndex!==i||b.sourceItemCount!==previous.length))throw new ConflictException('IDEMPOTENCY_CONFLICT');return{contract:EXPENSE_INTAKE_CONTRACT,replayed:true,cards:await this.approvals.readExpenseIntakeApprovals(tx,actor,previous.map(b=>b.approvalRequestId)),ledgerMutations:0};}
   const now=this.store.clock();if(Date.parse(s.sourceAt)>now.getTime()+60000||Date.parse(s.sourceAt)+10*60000<=now.getTime())throw new ForbiddenException('Original expense source admission window expired');
   if(v.sourceText===null)throw new BadRequestException('Paste the original expense command for first admission');
   const link=await this.reminder(tx,v),cards=parser(v.sourceText);if(cards.length<1||cards.length>10)throw new BadRequestException('Complete one-to-ten expense bundle required');const admitted=[];
   for(let i=0;i<cards.length;i++){const approvalId=cardId(v.sourceEventHash,i,'approval'),id=cardId(v.sourceEventHash,i,'binding');admitted.push(await this.approvals.admitExpenseIntakeApproval(tx,actor,cards[i],approvalId,`expense-intake:${v.sourceEventHash}:${i}`,now));await tx.expenseIntakeBinding.create({data:{id,tenantId:s.tenantId,actorUserId:actor.userId,actorMembershipId:member.id,authIdentityId:v.authIdentityId,sourceNamespace:s.sourceNamespace,sourceEventHash:v.sourceEventHash,itemIndex:i,sourceItemCount:cards.length,sourceContentHash:v.sourceContentHash,reminderRunId:link.runId,reminderSlotKey:link.slotKey,approvalRequestId:approvalId,createdAt:now,auditRetentionUntil:expenseAuditUntil(now)}});}
   return{contract:EXPENSE_INTAKE_CONTRACT,replayed:false,cards:admitted,ledgerMutations:0};
  });
 }
 async reportPeriod(actor:AuthenticatedUser,day:string){if(!actor.tenantId)throw new ForbiddenException('Tenant required');const tenantId=this.context.assertTenantId(actor.tenantId);expenseDay(day,0);await this.store.actor(this.prisma,tenantId,actor.userId);const tenant=await this.prisma.tenant.findUniqueOrThrow({where:{id:tenantId}}),from=localDateMinuteToUtc(day,0,tenant.defaultTimezone),to=new Date(localDateMinuteToUtc(expenseDay(day,1),0,tenant.defaultTimezone).getTime()-1);const [ledger,declaration]=await Promise.all([this.expenses.list(tenantId,{from:from.toISOString(),to:to.toISOString()}),this.expenses.findPeriodDeclaration(tenantId,day,day)]);return{contract:'maya.expense-period-projection/1',tenantId,day,timezone:tenant.defaultTimezone,ledger,declaration,completeness:ledger.totals_basis!=='all_recorded_expenses_in_scope'?'UNAVAILABLE':declaration?'DECLARED_COMPLETE':'RECORDED_ONLY',readOnly:true};}
 async ownContexts(actor:AuthenticatedUser){if(!actor.tenantId)throw new ForbiddenException('Tenant required');const tenantId=this.context.assertTenantId(actor.tenantId);return this.store.transaction(async tx=>{const member=await this.store.actor(tx,tenantId,actor.userId),routes=await tx.authIdentity.findMany({where:{tenantId,userId:actor.userId,provider:'telegram'},take:2});if(routes.length!==1)throw new ForbiddenException('One verified Telegram identity required');const roots=await tx.expenseReminderRun.findMany({where:{tenantId,intentEncrypted:{not:null},expiresAt:{gt:this.store.clock()}},orderBy:{admittedAt:'desc'},take:20});return{contract:EXPENSE_INTAKE_CONTRACT,tenantId,userId:actor.userId,weeklyOptIn:(await filterAssistantCapability(tx,tenantId,[actor.userId],'weekly_expense_reminders')).length===1,contexts:roots.flatMap(root=>{const p=this.store.read(root),slot=p.slots.find(s=>s.userId===actor.userId&&s.membershipId===member.id&&s.authIdentityId===routes[0].id&&s.telegramId===routes[0].providerUserId);return slot?[{runId:root.id,slotKey:slot.slotKey,start:p.periodStartLocalDate,end:p.periodEndLocalDate,expiresAt:p.expiresAt}]:[]}),readOnly:true};});}
}
