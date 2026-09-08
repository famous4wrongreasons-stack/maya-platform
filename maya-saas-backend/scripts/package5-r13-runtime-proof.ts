import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { ActionEngineRuntimeService } from '../src/action-engine';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import { AiToolHandlerService } from '../src/ai-tools/ai-tool-handler.service';
import { AiToolPolicyService } from '../src/ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../src/ai-tools/ai-tool-registry.service';
import { AiToolRuntimeService } from '../src/ai-tools/ai-tool-runtime.service';
import { AiToolReceiptService } from '../src/ai-tools/ai-tool-receipt.service';
import { CommunicationDeliveryService } from '../src/communication-delivery';
import { EncryptionService } from '../src/encryption/encryption.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { ExpenseCanonicalShadowService } from '../src/expenses/expense-canonical-shadow.service';
import { P407ExpenseCanonicalCutoverService } from '../src/expenses/p4-07-expense-canonical-cutover.service';
import { P407ExpenseExecutableService } from '../src/expenses/p4-07-expense-executable.service';
import { ExpenseReminderStore } from '../src/expense-intake/expense-reminder.store';
import { ExpenseReminderScheduler } from '../src/expense-intake/expense-reminder.scheduler';
import { ExpenseIntakeSourceService } from '../src/expense-intake/expense-intake-source.service';
import { ExpenseIntakeService } from '../src/expense-intake/expense-intake.service';
import { expenseWeek,expenseDay } from '../src/expense-intake/expense-reminder.contract';
import { localDateMinuteToUtc } from '../src/internal-calendar/internal-calendar.utils';
import { localCalendarDate } from '../src/owner-reports/owner-reports.time';
import { BridgeSourceService } from '../src/tenancy/bridge-source.service';
import type { TenantsService } from '../src/tenants/tenants.service';
import type { AuthenticatedUser } from '../src/common/authenticated-user.interface';
import { UserRole } from '../src/common/domain.enums';
import { asActor,config,context,db,engine,ingress,secret,staffFixture,tenantFixture } from './package5-wave-rc-proof-support';

let clock=new Date(),enabled=true,telegramCalls=0,unknownChat='',failedChat='';
const settings=new ConfigService({DATABASE_URL:config.get('DATABASE_URL'),CRM_ENCRYPTION_KEY:secret,MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN:secret,MAYA_INBOX_BRIDGE_TOKEN:secret,MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL:'http://127.0.0.1:1/r13-synthetic'}),encryption=new EncryptionService(settings),registry=new AiToolRegistryService();
const feature={assertFeature:async()=>{if(!enabled)throw new (await import('@nestjs/common')).ForbiddenException('synthetic_feature_denied');}} as unknown as EntitlementsService;
const policy=new AiToolPolicyService(context,feature,registry),store=new ExpenseReminderStore(db,context,encryption,ingress,engine,policy,registry,()=>clock),runtime=new ActionEngineRuntimeService(engine,ingress),audit=new AuditLogService(db,context);
const cutover=new P407ExpenseCanonicalCutoverService(new ExpenseCanonicalShadowService(runtime,db,context,encryption),ingress,engine,new P407ExpenseExecutableService(db,ingress,engine));
const tenantService={assertBranchBelongsToTenant:async(id:string,tenantId:string)=>{assert.ok(await db.branch.findFirst({where:{id,tenantId}}));}} as unknown as TenantsService;
const expenses=new ExpensesService(db,context,tenantService,encryption,audit,cutover);
const handlerArgs=Array.from({length:11},()=>({})) as unknown as ConstructorParameters<typeof AiToolHandlerService>;handlerArgs[4]=expenses;handlerArgs[5]=db;
const handler=new AiToolHandlerService(...handlerArgs),receipts=new AiToolReceiptService(db,encryption,engine),approvals=new AiToolRuntimeService(db,context,registry,policy,handler,encryption,audit,receipts);
const source=new ExpenseIntakeSourceService(db,new BridgeSourceService(db),context,encryption,settings),intake=new ExpenseIntakeService(db,context,store,approvals,settings,expenses);
const delivery=new CommunicationDeliveryService(db,runtime,settings,undefined,undefined,undefined,undefined,store),scheduler=new ExpenseReminderScheduler(db,context,store,delivery,settings);
const dispatch=delivery.deliverExpenseReminderSlot.bind(delivery);delivery.deliverExpenseReminderSlot=async(...args)=>{try{return await dispatch(...args);}catch(e){if(process.env.MAYA_RC_DEBUG==='1')console.error(e);throw e;}};
const checkpoint=resolve(process.env.MAYA_RC_PROOF_DIRECTORY??'/tmp/maya-rc-proof-artifacts','r13-restart.json'),checks:string[]=[];
const providerRefs=new Map<string,string>();
const originalFetch=global.fetch;global.fetch=(async(url:unknown,init?:RequestInit)=>{assert.equal(String(url),'http://127.0.0.1:1/r13-synthetic');telegramCalls++;const payload=JSON.parse(String(init?.body)) as {telegram_chat_id?:string;chat_id?:string};if(JSON.stringify(payload).includes(unknownChat)&&unknownChat)throw Error('Synthetic lost Telegram receipt');if(failedChat&&JSON.stringify(payload).includes(failedChat))return new Response(JSON.stringify({error:'synthetic_permission_denied'}),{status:403});const reference=String(700000+telegramCalls);providerRefs.set(String(payload.telegram_chat_id??payload.chat_id),reference);return new Response(JSON.stringify({message_id:reference}),{status:200});}) as typeof fetch;
async function principal(tenantId:string,staff:Awaited<ReturnType<typeof staffFixture>>,telegramId:string){const identity=await db.authIdentity.create({data:{tenantId,userId:staff.user.id,provider:'telegram',providerUserId:telegramId}}),session=await db.authSession.create({data:{tenantId,userId:staff.user.id,deviceLabel:'R13 synthetic',expiresAt:new Date(Date.now()+86400000)}});return{identity,actor:{tenantId,userId:staff.user.id,role:staff.member.role as UserRole,membershipId:staff.member.id,membershipStatus:'active',branchId:null,email:staff.user.email,sessionId:session.id} as AuthenticatedUser};}
const run=<T>(actor:AuthenticatedUser,fn:()=>T)=>asActor(actor.tenantId!,actor.userId,actor.role,fn);
async function main(){await db.$connect();
 if(process.argv.includes('--after-restart')){const s=JSON.parse(readFileSync(checkpoint,'utf8')) as {tenantId:string;runId:string;executions:string[];actor:AuthenticatedUser;capsule:string;cardIds:string[];company:string};process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN=secret;process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER='yclients';process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID=s.company;
  const prior=await db.actionExecution.findMany({where:{tenantId:s.tenantId,expenseReminderRunId:s.runId}});await context.runAsSystemTenant(s.tenantId,()=>scheduler.resume(s.runId,s.tenantId));assert.equal(telegramCalls,0);assert.deepEqual((await db.actionExecution.findMany({where:{tenantId:s.tenantId,expenseReminderRunId:s.runId}})).map(r=>r.id).sort(),s.executions);assert.ok(prior.some(r=>r.state==='UNKNOWN'));
  const bundle=await run(s.actor,async()=>intake.admit(await source.verify(s.actor,s.capsule),()=>{throw Error('Must never reparse admitted source');}));assert.deepEqual(bundle.cards.map(c=>c.id),s.cardIds);assert.equal(bundle.replayed,true);assert.equal(await db.expense.count({where:{tenantId:s.tenantId}}),1);console.log(JSON.stringify({package:'R13',phase:'after actual restart',result:'PASS',sameSlots:true,reparse:0,newDelivery:0,partialExpenseCount:1,productionEffects:0}));return;
 }
 const tenant=await tenantFixture(),a=await staffFixture(tenant.id),b=await staffFixture(tenant.id,'business_owner'),off=await staffFixture(tenant.id),denied=await staffFixture(tenant.id,'administrator');
 const first=await principal(tenant.id,a,'8130001'),second=await principal(tenant.id,b,'8130002');await principal(tenant.id,off,'8130003');const admin=await principal(tenant.id,denied,'8130004');
 const company=randomUUID();process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN=secret;process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER='yclients';process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID=company;await db.crmIntegration.create({data:{tenantId:tenant.id,provider:'yclients',encryptedApiToken:encryption.encrypt('synthetic'),settingsJson:{companyId:company}}});
 const week=expenseWeek('Europe/Moscow',new Date()),start=expenseDay(week.start,-7),end=expenseDay(week.end,-7);clock=localDateMinuteToUtc(end,20*60+10,'Europe/Moscow');
 for(const u of [a,b,denied])await db.dashboardPreference.create({data:{tenantId:tenant.id,userId:u.user.id,section:'assistant',configJson:{schema_version:1,enabled_capabilities:['weekly_expense_reminders']}}});
 let runId='',executions:string[]=[];
 await context.runAsSystemTenant(tenant.id,async()=>{const roots=await Promise.all(Array.from({length:4},()=>store.admit(tenant.id,start,end)));assert.ok(roots.every(r=>r.id===roots[0].id));const root=roots[0],plan=store.read(root);runId=root.id;assert.deepEqual(plan.slots.map(s=>s.userId).sort(),[a.user.id,b.user.id].sort());executions=(await store.executions(root,plan)).map(e=>e.id).sort();assert.equal(executions.length,2);assert.equal(telegramCalls,0);
  await assert.rejects(store.admit(tenant.id,start,end,{...plan,content:{...plan.content,bodyText:'changed'}}),/IDEMPOTENCY_CONFLICT/);
  await db.dashboardPreference.update({where:{userId_tenantId_section:{tenantId:tenant.id,userId:off.user.id,section:'assistant'}},data:{configJson:{schema_version:1,enabled_capabilities:['weekly_expense_reminders']}}}).catch(async()=>{await db.dashboardPreference.create({data:{tenantId:tenant.id,userId:off.user.id,section:'assistant',configJson:{schema_version:1,enabled_capabilities:['weekly_expense_reminders']}}});});
  unknownChat='8130001';await scheduler.resume(root.id,tenant.id);assert.equal(telegramCalls,2);const rows=await store.executions(root,plan);assert.equal(rows.filter(r=>r.state==='UNKNOWN').length,1);assert.equal(rows.filter(r=>r.state==='SUCCEEDED').length,1);unknownChat='';await scheduler.resume(root.id,tenant.id);assert.equal(telegramCalls,2);assert.deepEqual((await store.executions(root,plan)).map(e=>e.id).sort(),executions);assert.equal((await store.admit(tenant.id,start,end)).intentHash,root.intentHash);
 });checks.push('Sunday exact window; default-off/narrow role; concurrent root and complete A13 slots atomic; changed intent conflicts; UNKNOWN one recipient/other succeeds; no retry expansion/resend');
 const empty=await tenantFixture();await context.runAsSystemTenant(empty.id,async()=>{const root=await store.admit(empty.id,start,end);assert.equal(store.read(root).slots.length,0);assert.equal(await db.actionExecution.count({where:{tenantId:empty.id}}),0);clock=localDateMinuteToUtc(expenseDay(end,7),21*60,'Europe/Moscow');await assert.rejects(store.admit(empty.id,expenseDay(start,7),expenseDay(end,7)));assert.equal(await db.expenseReminderRun.count({where:{tenantId:empty.id}}),1);});
 clock=new Date();const today=localCalendarDate('Europe/Moscow',clock),text=`/rashod ${today} | supplies | 12.34 | весь бизнес | Синтетический чек\n${today} | rent | 25 | весь бизнес`,sourceBody={provider:'yclients',externalCompanyId:company,chatType:'private',forwarded:false,senderId:'8130001',chatId:'8130001',messageId:'101',sourceAt:clock.toISOString(),sourceText:text,mode:'standalone',replyToMessageId:null,reminderRunId:null,reminderSlotKey:null};
 await assert.rejects(source.capsule('bad',sourceBody));await assert.rejects(source.capsule(secret,{...sourceBody,forwarded:true}));await assert.rejects(source.capsule(secret,{...sourceBody,chatId:'8130002'}));
 const capsule=(await source.capsule(secret,sourceBody,clock)).capsule;assert.equal(await db.aiApprovalRequest.count({where:{tenantId:tenant.id}}),0);await assert.rejects(run(second.actor,()=>source.verify(second.actor,capsule)));await assert.rejects(run(admin.actor,()=>source.verify(admin.actor,capsule)));
 const bundle=await run(first.actor,async()=>{const proof=await source.verify(first.actor,capsule,text),values=await Promise.all(Array.from({length:3},()=>intake.admit(proof)));assert.ok(values.every(v=>v.cards[0].id===values[0].cards[0].id));return values[0];});assert.equal(bundle.cards.length,2);assert.equal(await db.expense.count({where:{tenantId:tenant.id}}),0);assert.equal(await db.expenseIntakeBinding.count({where:{tenantId:tenant.id}}),2);
 await run(first.actor,async()=>{const changed=(await source.capsule(secret,{...sourceBody,sourceText:text.replace('12.34','99')},clock)).capsule;await assert.rejects(intake.admit(await source.verify(first.actor,changed)),/IDEMPOTENCY_CONFLICT/);const repeated=await intake.admit(await source.verify(first.actor,capsule,text),()=>{throw Error('Original bundle must be loaded before parsing');});assert.deepEqual(repeated.cards.map(c=>c.id),bundle.cards.map(c=>c.id));});
 checks.push('authenticated bot alone creates zero approvals; existing R02 session and exact identity required; concurrent source complete bundle; edited text conflict; retry never reparses; admission ledger writes zero');
 await run(first.actor,async()=>{const card=bundle.cards[0];await assert.rejects(approvals.approve(first.actor,card.id,{payloadHash:'f'.repeat(64)}));await approvals.approve(first.actor,card.id,{payloadHash:card.payload_hash});await approvals.approve(first.actor,card.id,{payloadHash:card.payload_hash});});
 const expense=await db.expense.findFirstOrThrow({where:{tenantId:tenant.id}});assert.equal(expense.amountKopecks,1234);assert.equal(expense.createdById,first.actor.userId);assert.ok(expense.actionExecutionId);assert.equal(await db.expense.count({where:{tenantId:tenant.id}}),1);assert.equal(await db.expensePeriodDeclaration.count({where:{tenantId:tenant.id}}),0);assert.equal((await db.aiApprovalRequest.findUniqueOrThrow({where:{id:bundle.cards[1].id}})).status,'pending');
 const ai=await db.aiToolExecution.findFirstOrThrow({where:{tenantId:tenant.id,approvalRequestId:bundle.cards[0].id}}),receipt=receipts.read(ai.encryptedResult);assert.equal(receipt?.bindings[0].executionId,expense.actionExecutionId);assert.equal((await db.actionExecution.findUniqueOrThrow({where:{id:expense.actionExecutionId!}})).state,'SUCCEEDED');checks.push('exact per-card confirmation through real AI handler/R10/P407; one canonical Expense; second card remains pending; no period completeness inference');
 if(!process.argv.includes('--before-restart')){
  const admitBody=async(body:Omit<typeof sourceBody,'replyToMessageId'|'reminderRunId'|'reminderSlotKey'>&{replyToMessageId:string|null;reminderRunId:string|null;reminderSlotKey:string|null})=>run(first.actor,async()=>{const c=(await source.capsule(secret,body,clock)).capsule;return intake.admit(await source.verify(first.actor,c,body.sourceText));});
  const originalCount=await db.aiApprovalRequest.count({where:{tenantId:tenant.id}}),plan=await context.runAsSystemTenant(tenant.id,async()=>store.read(await store.load(tenant.id,runId))),mySlot=plan.slots.find(s=>s.userId===first.actor.userId)!;
  await assert.rejects(admitBody({...sourceBody,messageId:'102',sourceText:'/rashod incomplete'}));assert.equal(await db.aiApprovalRequest.count({where:{tenantId:tenant.id}}),originalCount);
  await assert.rejects(admitBody({...sourceBody,messageId:'103',mode:'reply',replyToMessageId:'999999'}));
  const explicit=await admitBody({...sourceBody,messageId:'104',mode:'reply',reminderRunId:runId,reminderSlotKey:mySlot.slotKey});assert.equal(explicit.cards.length,2);assert.equal(await db.expense.count({where:{tenantId:tenant.id}}),1);
  await assert.rejects(admitBody({...sourceBody,messageId:'105',mode:'reply',reminderRunId:runId,reminderSlotKey:plan.slots.find(s=>s.userId!==first.actor.userId)!.slotKey}));
  // Correlate only the exact canonical slot's successful provider receipt.
  const secondRef=providerRefs.get('8130002');assert.ok(secondRef);
  const secondBody={...sourceBody,senderId:'8130002',chatId:'8130002',messageId:'201',mode:'reply',replyToMessageId:secondRef};
  const secondCapsule=(await source.capsule(secret,secondBody,clock)).capsule;
  const correlated=await run(second.actor,async()=>intake.admit(await source.verify(second.actor,secondCapsule,text)));assert.equal(correlated.cards.length,2);
  await assert.rejects(admitBody({...sourceBody,messageId:'202',mode:'reply',replyToMessageId:secondRef}));
  assert.equal(await db.expense.count({where:{tenantId:tenant.id}}),1);
  checks.push('exact successful provider message correlates to its own frozen recipient only; foreign reply cannot authorize intake; no automatic Expense');
  const expired=(await source.capsule(secret,{...sourceBody,messageId:'106'},clock)).capsule;clock=new Date(clock.getTime()+11*60000);await assert.rejects(run(first.actor,async()=>intake.admit(await source.verify(first.actor,expired,text))),/window expired/);clock=new Date();
  const proof=await run(first.actor,()=>source.verify(first.actor,capsule,text));await db.authSession.update({where:{id:first.actor.sessionId},data:{revokedAt:new Date()}});await assert.rejects(run(first.actor,()=>intake.admit(proof)),/session required/);first.actor.sessionId=(await db.authSession.create({data:{tenantId:tenant.id,userId:first.actor.userId,deviceLabel:'R13 fresh synthetic session',expiresAt:new Date(Date.now()+86400000)}})).id;
  enabled=false;await assert.rejects(admitBody({...sourceBody,messageId:'107'}));enabled=true;
  const branch=await db.branch.create({data:{tenantId:tenant.id,name:'Explicit expense branch'}}),branchText=`/rashod ${today} | supplies | 42 | ${branch.id}`,branched=await admitBody({...sourceBody,messageId:'108',sourceText:branchText});
  await run(first.actor,()=>approvals.approve(first.actor,branched.cards[0].id,{payloadHash:branched.cards[0].payload_hash}));assert.equal((await db.expense.findFirstOrThrow({where:{tenantId:tenant.id,amountKopecks:4200}})).branchId,branch.id);
  checks.push('missing fields no approval; unrelated/other-recipient replies denied; explicit context for UNKNOWN is not delivery proof; expired source denied; revoked session/feature denied; exact confirmed branch preserved');
  const crashCard=(await admitBody({...sourceBody,messageId:'109',sourceText:`/rashod ${today} | taxes | 39 | весь бизнес`})).cards[0],handlerExecute=handler.execute.bind(handler);let lost=false;
  handler.execute=async(...args)=>{const value=await handlerExecute(...args);if(args[0]==='expenses.create'&&!lost){lost=true;throw Error('Synthetic crash after P407 commit before AI presentation settled');}return value;};
  try{await run(first.actor,()=>approvals.approve(first.actor,crashCard.id,{payloadHash:crashCard.payload_hash}));}finally{handler.execute=handlerExecute;}
  const committed=await db.expense.findFirstOrThrow({where:{tenantId:tenant.id,amountKopecks:3900}});assert.ok(lost);const observed=await run(first.actor,()=>approvals.approve(first.actor,crashCard.id,{payloadHash:crashCard.payload_hash}));assert.equal(observed.status,'unknown');assert.equal(await db.expense.count({where:{tenantId:tenant.id,amountKopecks:3900}}),1);assert.equal((await db.actionExecution.findUniqueOrThrow({where:{id:committed.actionExecutionId!}})).state,'SUCCEEDED');
  const beforeCard=(await admitBody({...sourceBody,messageId:'110',sourceText:`/rashod ${today} | utilities | 28 | весь бизнес`})).cards[0],admitExecution=ingress.createExecution.bind(ingress);let interrupted=false;
  ingress.createExecution=async(...args)=>{const row=await admitExecution(...args);if(row.actionClass==='create_expense'&&!interrupted){interrupted=true;throw Error('Synthetic crash after bound canonical admission before local effect');}return row;};
  try{await run(first.actor,()=>approvals.approve(first.actor,beforeCard.id,{payloadHash:beforeCard.payload_hash}));}finally{ingress.createExecution=admitExecution;}
  assert.equal(await db.expense.count({where:{tenantId:tenant.id,amountKopecks:2800}}),0);const invocation=await db.aiToolExecution.findFirstOrThrow({where:{approvalRequestId:beforeCard.id}}),bound=receipts.read(invocation.encryptedResult)!.bindings[0].executionId;
  await run(first.actor,()=>approvals.approve(first.actor,beforeCard.id,{payloadHash:beforeCard.payload_hash}));assert.equal((await db.expense.findFirstOrThrow({where:{tenantId:tenant.id,amountKopecks:2800}})).actionExecutionId,bound);assert.equal(await db.expensePeriodDeclaration.count({where:{tenantId:tenant.id}}),0);
  checks.push('crash after canonical commit retains one SUCCEEDED P407 outcome with honest unsettled AI wrapper; crash before local effect resumes the same R10-bound execution; no list/period completeness inference');
  const dispatchTenant=await tenantFixture(),targets:Array<{staff:Awaited<ReturnType<typeof staffFixture>>;human:Awaited<ReturnType<typeof principal>>}>=[];
  for(let i=0;i<4;i++){const staff=await staffFixture(dispatchTenant.id),human=await principal(dispatchTenant.id,staff,'813009'+i);targets.push({staff,human});await db.dashboardPreference.create({data:{tenantId:dispatchTenant.id,userId:staff.user.id,section:'assistant',configJson:{schema_version:1,enabled_capabilities:['weekly_expense_reminders']}}});}
  clock=localDateMinuteToUtc(end,20*60+10,'Europe/Moscow');
  await context.runAsSystemTenant(dispatchTenant.id,async()=>{
   const root=await store.admit(dispatchTenant.id,start,end),plan=store.read(root);assert.equal(plan.slots.length,4);
   await db.dashboardPreference.create({data:{tenantId:dispatchTenant.id,userId:targets[0].staff.user.id,section:'staff_notifications',configJson:{schema_version:1,membershipId:targets[0].staff.member.id,telegramMutedUntil:new Date(clock.getTime()+3600000).toISOString()}}});
   await db.membership.update({where:{id:targets[1].staff.member.id},data:{status:'suspended'}});
   failedChat='8130092';const beforeCalls=telegramCalls;await scheduler.resume(root.id,dispatchTenant.id);failedChat='';
   assert.equal(telegramCalls-beforeCalls,2);const rows=await store.executions(root,plan),byUser=(userId:string)=>rows.find(e=>e.expenseReminderSlotKey===plan.slots.find(s=>s.userId===userId)!.slotKey)!;
   assert.equal(byUser(targets[2].staff.user.id).state,'FAILED');assert.equal(byUser(targets[3].staff.user.id).state,'SUCCEEDED');
   assert.ok(['FAILED','NOT_EXECUTED'].includes(byUser(targets[0].staff.user.id).state));assert.ok(['FAILED','NOT_EXECUTED'].includes(byUser(targets[1].staff.user.id).state));
   await scheduler.resume(root.id,dispatchTenant.id);assert.equal(telegramCalls-beforeCalls,2);assert.equal((await store.executions(root,plan)).length,4);
  });clock=new Date();checks.push('post-admission mute/revoked Member prevent dispatch; deterministic Telegram failure terminal without fallback; independent recipient succeeds; no route or slot expansion');

 }
 if(process.argv.includes('--before-restart'))writeFileSync(checkpoint,JSON.stringify({tenantId:tenant.id,runId,executions,actor:first.actor,capsule,cardIds:bundle.cards.map(c=>c.id),company}));
 console.log(JSON.stringify({package:'R13',phase:process.argv.includes('--before-restart')?'before actual restart':'runtime',result:'PASS',checks,syntheticTelegramCalls:telegramCalls,productionEffects:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{global.fetch=originalFetch;await db.$disconnect();});
