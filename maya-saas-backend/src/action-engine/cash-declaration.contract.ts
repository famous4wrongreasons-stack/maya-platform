import { createHash } from 'node:crypto';
import { ActionContractError } from './action-engine.errors';
import { stableActionJson } from './action-engine.identity';

export const CASH_DECLARATION_CONTRACT='maya.cash-declaration/1';
export const CASH_CAPABILITIES={declare:'cash-declaration.declare.execute.v1',correct:'cash-declaration.correct.execute.v1'} as const;
export type CashOperation=keyof typeof CASH_CAPABILITIES;
export const CASH_ROLES=new Set(['tenant_owner','business_owner','accountant']);
export interface CashCommand {confirmed:true;branchId:string;businessDay:string;timezone:string;countedAt:string;currency:'RUB';countedCashKopecks:number|null;declarationKind:'COUNT'|'WITHDRAWAL';expectedRevision:number;previousDeclarationId:string|null;reason:string|null}
export interface CashIntent {contract:typeof CASH_DECLARATION_CONTRACT;tenantId:string;actorUserId:string;actorMembershipId:string;actorRole:string;operation:CashOperation;targetRef:string;callerId:string;semanticCommand:CashCommand;commandHash:string;intentHash:string}
function fail(message:string):never{throw new ActionContractError(message);}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Unlisted cash input');return value as Record<string,unknown>;}
function opaque(value:unknown):string {if(typeof value!=='string'||!/^[-A-Za-z0-9._:/]{1,160}$/.test(value))fail('Exact canonical cash reference required');return value;}
export function cashCallerId(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))fail('Stable cash caller UUID required');return value.toLowerCase();}
export function cashHash(domain:string,value:unknown):string{return createHash('sha256').update(domain).update('\0').update(stableActionJson(value)).digest('hex');}
export function cashLocalDay(instant:string,timezone:string):string{
 try {return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}catch{fail('Valid observation time and IANA timezone required');}
}
export function cashCommand(operation:CashOperation,value:unknown):CashCommand {
 const x=object(value,['confirmed','branchId','businessDay','timezone','countedAt','currency','countedCashKopecks','declarationKind','expectedRevision','previousDeclarationId','reason']);
 if(x.confirmed!==true)fail('Explicit branch/time/count confirmation required');
 const branchId=opaque(x.branchId);
 if(typeof x.businessDay!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.businessDay)||typeof x.timezone!=='string'||x.timezone.length>80||typeof x.countedAt!=='string'||!Number.isFinite(Date.parse(x.countedAt))||new Date(x.countedAt).toISOString()!==x.countedAt||cashLocalDay(x.countedAt,x.timezone)!==x.businessDay)fail('Exact observed branch-local day/time required');
 if(x.currency!=='RUB'||!['COUNT','WITHDRAWAL'].includes(String(x.declarationKind)))fail('Cash observation kind/currency invalid');
 if(x.declarationKind==='WITHDRAWAL'?x.countedCashKopecks!==null:!Number.isSafeInteger(x.countedCashKopecks)||Number(x.countedCashKopecks)<0||Number(x.countedCashKopecks)>1000000000)fail('Cash count must be integer kopecks; withdrawal is null');
 if(!Number.isSafeInteger(x.expectedRevision)||Number(x.expectedRevision)<0)fail('Expected cash revision required');
 if(operation==='declare'&&(x.expectedRevision!==0||x.previousDeclarationId!==null||x.declarationKind!=='COUNT'))fail('First cash declaration must be COUNT revision 1');
 if(operation==='correct'&&(Number(x.expectedRevision)<1||!x.previousDeclarationId))fail('Exact predecessor required for correction');
 const previousDeclarationId=x.previousDeclarationId===null?null:opaque(x.previousDeclarationId);
 const reason=x.reason===null?null:typeof x.reason==='string'?x.reason.normalize('NFC').replace(/\s+/gu,' ').trim():fail('Cash reason must be text or null');
 if((operation==='correct'&&!reason)||(reason!==null&&(reason.length<1||reason.length>2000)))fail('Bounded correction/withdrawal reason required');
 return {confirmed:true,branchId,businessDay:x.businessDay,timezone:x.timezone,countedAt:x.countedAt,currency:'RUB',countedCashKopecks:x.countedCashKopecks as number|null,declarationKind:x.declarationKind as CashCommand['declarationKind'],expectedRevision:Number(x.expectedRevision),previousDeclarationId,reason};
}
export function normalizeCashIntent(operation:CashOperation,value:unknown):CashIntent {
 const x=object(value,['contract','tenantId','actorUserId','actorMembershipId','actorRole','operation','targetRef','callerId','semanticCommand','commandHash','intentHash']);
 const tenantId=opaque(x.tenantId),actorUserId=opaque(x.actorUserId),actorMembershipId=opaque(x.actorMembershipId),callerId=cashCallerId(x.callerId);
 const command=cashCommand(operation,x.semanticCommand),targetRef=`cash:${command.branchId}:${command.businessDay}`;
 if(x.contract!==CASH_DECLARATION_CONTRACT||x.operation!==operation||x.targetRef!==targetRef||typeof x.actorRole!=='string'||!CASH_ROLES.has(x.actorRole))fail('Canonical cash owner/target required');
 const commandHash=cashHash('maya.cash-command/1',command);
 const content={contract:CASH_DECLARATION_CONTRACT,tenantId,actorUserId,actorMembershipId,actorRole:x.actorRole,operation,targetRef,semanticCommand:command} as const;
 const intentHash=cashHash('maya.cash-intent/1',content);
 if(x.commandHash!==commandHash||x.intentHash!==intentHash)fail('Cash intent fingerprint mismatch');
 return {...content,callerId,commandHash,intentHash};
}
export function makeCashIntent(tenantId:string,actor:{userId:string;id:string;role:string},operation:CashOperation,callerId:string,command:CashCommand):CashIntent {
 const content={contract:CASH_DECLARATION_CONTRACT,tenantId,actorUserId:actor.userId,actorMembershipId:actor.id,actorRole:actor.role,operation,targetRef:`cash:${command.branchId}:${command.businessDay}`,semanticCommand:command} as const;
 return normalizeCashIntent(operation,{...content,callerId,commandHash:cashHash('maya.cash-command/1',command),intentHash:cashHash('maya.cash-intent/1',content)});
}
