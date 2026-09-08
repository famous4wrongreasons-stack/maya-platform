import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { ACTION_EXECUTION_REQUEST_CONTRACT, type TrustedActionExecutionRequestV1 } from '../action-engine';
import { stableActionJson } from '../action-engine/action-engine.identity';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { localCalendarDate } from '../owner-reports/owner-reports.time';

export const EXPENSE_REMINDER_CONTRACT='maya.expense-reminder-plan/1';
export const EXPENSE_REMINDER_TYPE='weekly_expense_reminder';
export const EXPENSE_REMINDER_CAPABILITY='communication.business-alerts.execute.v1';
export const EXPENSE_INTAKE_CONTRACT='maya.expense-intake-source/1';
export type ExpenseReminderSlot={slotKey:string;executionRef:string;userId:string;membershipId:string;role:'tenant_owner'|'business_owner';authIdentityId:string;telegramId:string;channel:'telegram'};
export type ExpenseReminderPlan={contract:typeof EXPENSE_REMINDER_CONTRACT;tenantId:string;reminderType:typeof EXPENSE_REMINDER_TYPE;contractVersion:1;periodStartLocalDate:string;periodEndLocalDate:string;timezone:string;periodStartAt:string;periodEndExclusiveAt:string;expiresAt:string;content:{title:string;bodyText:string;version:1};slots:ExpenseReminderSlot[]};
export function expenseHash(domain:string,value:unknown){return createHash('sha256').update(`${domain}\0${stableActionJson(value)}`).digest('hex');}
export function expenseDay(date:string,days:number){const value=new Date(`${date}T00:00:00.000Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==date)throw new BadRequestException('Exact calendar date required');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function expenseWeek(timezone:string,now:Date){const date=localCalendarDate(timezone,now),dow=new Date(`${date}T00:00:00Z`).getUTCDay(),start=expenseDay(date,-((dow+6)%7));return{start,end:expenseDay(start,6)};}
export function expenseAuditUntil(now:Date){const result=new Date(now);const month=result.getUTCMonth();result.setUTCFullYear(result.getUTCFullYear()+7);if(result.getUTCMonth()!==month)result.setUTCDate(0);return result;}
export function reminderSlotKey(plan:Pick<ExpenseReminderPlan,'tenantId'|'periodStartLocalDate'|'periodEndLocalDate'>,userId:string,authIdentityId:string){return expenseHash('maya.expense-reminder-slot/1',{tenantId:plan.tenantId,type:EXPENSE_REMINDER_TYPE,start:plan.periodStartLocalDate,end:plan.periodEndLocalDate,userId,authIdentityId,channel:'telegram'});}
export function normalizeExpenseReminder(value:ExpenseReminderPlan):ExpenseReminderPlan{
 const p=value;
 if(!p||p.contract!==EXPENSE_REMINDER_CONTRACT||p.contractVersion!==1||p.reminderType!==EXPENSE_REMINDER_TYPE||!p.tenantId||expenseDay(p.periodStartLocalDate,6)!==p.periodEndLocalDate||new Date(`${p.periodStartLocalDate}T00:00:00Z`).getUTCDay()!==1||!Array.isArray(p.slots)||p.slots.length>10000||p.content?.version!==1||!p.content.title||!p.content.bodyText||p.content.title.length>160||p.content.bodyText.length>3000)throw new BadRequestException('Exact weekly expense plan required');
 if(p.periodStartAt!==localDateMinuteToUtc(p.periodStartLocalDate,0,p.timezone).toISOString()||p.periodEndExclusiveAt!==localDateMinuteToUtc(expenseDay(p.periodEndLocalDate,1),0,p.timezone).toISOString()||p.expiresAt!==localDateMinuteToUtc(expenseDay(p.periodEndLocalDate,8),0,p.timezone).toISOString())throw new BadRequestException('Frozen weekly boundaries mismatch');
 const slots=p.slots.map(s=>{if(!s.userId||!s.membershipId||!s.authIdentityId||!['tenant_owner','business_owner'].includes(s.role)||s.channel!=='telegram'||!/^[1-9][0-9]{0,19}$/.test(s.telegramId)||s.slotKey!==reminderSlotKey(p,s.userId,s.authIdentityId)||s.executionRef!==`expense-reminder:${s.slotKey}`)throw new BadRequestException('Exact weekly recipient required');return{...s};}).sort((a,b)=>a.slotKey.localeCompare(b.slotKey));
 if(new Set(slots.map(s=>s.userId)).size!==slots.length)throw new BadRequestException('Duplicate weekly recipient');
 return{...p,content:{title:p.content.title.normalize('NFC'),bodyText:p.content.bodyText.normalize('NFC'),version:1},slots};
}
export function expenseReminderRequest(runId:string,plan:ExpenseReminderPlan,slot:ExpenseReminderSlot):TrustedActionExecutionRequestV1{
 return{contract:ACTION_EXECUTION_REQUEST_CONTRACT,tenantId:plan.tenantId,capability:EXPENSE_REMINDER_CAPABILITY,source:{type:'scheduler',sourceRef:slot.executionRef,occurrenceScope:slot.executionRef},targetRef:`telegram:${slot.slotKey}`,input:{channel:'telegram',messageType:EXPENSE_REMINDER_TYPE,sourceEventId:slot.executionRef,telegramChatId:slot.telegramId,recipientIdentityRef:slot.slotKey,title:plan.content.title,bodyText:plan.content.bodyText,expenseReminder:{runId,slotKey:slot.slotKey,planHash:expenseHash(EXPENSE_REMINDER_CONTRACT,plan)},buttons:[{text:'Открыть расходы MAYA',url:`https://malesthetic.pro/app/?expenses=reminder&run=${encodeURIComponent(runId)}&slot=${slot.slotKey}`}]},evidenceRefs:[`expense-plan:${expenseHash(EXPENSE_REMINDER_CONTRACT,plan)}`,`expense-slot:${slot.slotKey}`],intentExpiresAt:new Date(plan.expiresAt),callerIdempotency:{scope:'communication:expense-reminder:v1',key:slot.slotKey},expenseReminderSlot:{runId,slotKey:slot.slotKey}};
}
