/** Isolated proof: real deployed-candidate controller/service + PostgreSQL.
 * Only synthetic provider responses; no live HTTP or provider requests. */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {randomUUID} = require('node:crypto');
const backend=resolve(process.argv[2]);
const req=createRequire(resolve(backend,'package.json'));
const {PrismaClient}=req('@prisma/client');
const {PrismaPg}=req('@prisma/adapter-pg');
const {LoyaltyService}=req('./dist/src/loyalty/loyalty.service.js');
const {LoyaltyController}=req('./dist/src/loyalty/loyalty.controller.js');
const {CrmService}=req('./dist/src/crm/crm.service.js');
const {YclientsCRMAdapter}=req('./dist/src/crm/adapters/yclients-crm.adapter.js');
const {TenantContextService}=req('./dist/src/tenancy/tenant-context.service.js');
const connectionString='postgresql://stanislavmosin@127.0.0.1:55495/maya_c06_b26_probe';
assert(new URL(connectionString).hostname==='127.0.0.1');
const db=new PrismaClient({adapter:new PrismaPg({connectionString})});
const context=new TenantContextService();
// Disable optional live bridge even if the shell has unrelated environment.
process.env.MAYA_LEGACY_BRIDGE_TOKEN='';
process.env.MAYA_LEGACY_LOYALTY_TENANT_SLUGS='';
global.fetch=async()=>{throw new Error('Live HTTP forbidden in B27 proof');};
let calendar='internal',providerReadCount=0;
const adapter=Object.create(YclientsCRMAdapter.prototype);
adapter.findAllClientsByPhone=async()=>{providerReadCount++;return [{id:101},{id:202}];};
adapter.readLoyaltyCardFor=async(client)=>client.id===101?null:{provider:'yclients',external_client_id:'202',balance:321,sold_amount:17};
const crmContext={tenantContext:context,getCalendarSource:async()=>calendar,getAdapterForTenant:async()=>adapter};
const crm={
 getCalendarSource:async()=>calendar,
 getClientLoyaltyEvidenceReadOnly:(...args)=>CrmService.prototype.getClientLoyaltyEvidenceReadOnly.apply(crmContext,args),
 getServices:async()=>[],
};
const users={getTenantUserOrThrow:async(userId,tenantId)=>{
 assert(await db.membership.findFirst({where:{userId,tenantId,status:'active'}}));
 return db.user.findUniqueOrThrow({where:{id:userId}});
}};
const service=new LoyaltyService(db,context,users,crm,{decrypt:()=>''},{log:()=>{throw Error('unexpected audit')}},{});
const controller=new LoyaltyController(service);
const own=(tenantId,userId,fn)=>context.runAsAuthPrincipal({tenantId,userId,role:'client'},fn);
async function fixture() {
 const id=randomUUID(); const tenant=await db.tenant.create({data:{id,slug:id,name:'Synthetic B27',status:'active'}});
 const user=await db.user.create({data:{tenantId:null,email:randomUUID()+'@invalid.test',phone:'+79990000000',role:'client',passwordHash:'synthetic'}});
 await db.membership.create({data:{tenantId:tenant.id,userId:user.id,role:'client'}});
 return {tenant,user,principal:{tenantId:tenant.id,userId:user.id,role:'client'}};
}
async function main() {
 const a=await fixture();
 const before=await db.loyaltyAccount.count();
 await own(a.tenant.id,a.user.id,()=>controller.getMine(a.principal));
 await own(a.tenant.id,a.user.id,()=>controller.getMine(a.principal));
 const account=await db.loyaltyAccount.findUnique({where:{userId_tenantId:{userId:a.user.id,tenantId:a.tenant.id}}});
 assert(account);assert.equal(account.clientId,null);
 assert.equal(await db.loyaltyAccount.count(),before+1);
 assert.equal(await db.actionExecution.count(),0);
 assert.equal(await db.clientChannelLink.count(),0);
 const internal={requests:2,loyaltyAccountRowsCreated:1,canonicalClientOwner:null,actionExecutions:0,verifiedClientLinks:0};
 calendar='external';
 const b=await fixture();
 const client=await db.client.create({data:{tenantId:b.tenant.id,userId:b.user.id}});
 await db.crmClientLink.create({data:{tenantId:b.tenant.id,clientId:client.id,provider:'yclients',externalId:'101'}});
 const result=await own(b.tenant.id,b.user.id,()=>controller.getMine(b.principal));
 assert.equal(result.balance,321);assert.equal(result.sold_amount,17);
 assert.equal(await db.clientChannelLink.count(),0);
 const external={privateBalanceReturned:true,providerPhoneLookup:true,providerReadCount,exactCanonicalCrmClient:'101',returnedCardCrmClient:'202',exactClientMismatchAccepted:true,verifiedClientLinks:0,providerWrites:0};
 const c=await fixture();
 await db.authIdentity.create({data:{tenantId:c.tenant.id,userId:c.user.id,provider:'telegram',providerUserId:'8399999900'}});
 process.env.MAYA_LEGACY_BRIDGE_TOKEN='synthetic-b27-bridge-secret'.repeat(3);
 process.env.MAYA_LEGACY_LOYALTY_TENANT_SLUGS=c.tenant.slug;
 let bridgeCalls=0;
 global.fetch=async(url,options)=>{
  assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.pathname,'/api/internal/loyalty-snapshot');
  assert.deepEqual(JSON.parse(options.body),{telegram_user_id:'8399999900'});
  bridgeCalls++;
  return new Response(JSON.stringify({found:true,balance:777}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const legacyResult=await own(c.tenant.id,c.user.id,()=>controller.getMine(c.principal));
 assert.equal(legacyResult.balance,777);assert.equal(bridgeCalls,1);
 assert.equal(await db.clientChannelLink.count(),0);
 const legacy={syntheticBridgeCalls:bridgeCalls,rawTelegramAuthIdentityAsClientSelector:true,privateLegacyBalanceReturned:true,verifiedClientLinks:0,realNetworkCalls:0};
 console.log(JSON.stringify({verdict:'B27 CONFIRMED',internal,external,legacy,productionMutations:0,realProviderCalls:0,realCompiledControllerServiceCrmReaderAdapter:true,realPostgreSQL:true},null,2));
}
main().finally(()=>db.$disconnect());
