/** Owned PostgreSQL proof. Real receipt service/resolver/SQL, synthetic verified channels only. */
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {randomUUID,createHash,createHmac}=require('node:crypto');
const backend=resolve(process.argv[2]), connectionString=process.argv[3];
const url=new URL(connectionString);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55503');assert.equal(url.pathname,'/maya_c06_b33_proof');
const req=createRequire(resolve(backend,'package.json'));
const {PrismaClient}=req('@prisma/client'),{PrismaPg}=req('@prisma/adapter-pg');
const {ConfigService}=req('@nestjs/config');
const load=(p,n)=>req('./dist/src/'+p)[n];
const db=new PrismaClient({adapter:new PrismaPg({connectionString})});
const context=new (load('tenancy/tenant-context.service.js','TenantContextService'))();
const encryption=new (load('encryption/encryption.service.js','EncryptionService'))(new ConfigService({CRM_ENCRYPTION_KEY:'synthetic-b33-proof-key'.repeat(5)}));
const token='123456:synthetic-b33-token';
const channels=new (load('crm/client-channel-authenticator.service.js','ClientChannelAuthenticatorService'))(new ConfigService({MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN:token}),context,encryption);
const runtime=new (load('crm/client-channel-runtime.service.js','ClientChannelRuntimeService'))(db,context,channels,encryption,{},{});
const Receipt=load('crm/client-booking-confirmation.service.js','ClientBookingConfirmationService');
const receipt=new Receipt(db,encryption,runtime.resolve.bind(runtime));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const {clientChannelSubjectHash}=req('./dist/src/crm/client-channel-subject.js');
async function fixture(){
 const tenant=await db.tenant.create({data:{name:'B33 synthetic',slug:randomUUID()}});
 const client=await db.client.create({data:{tenantId:tenant.id}});
 const subject=String(Math.floor(Math.random()*100000000)+100000000);
 const fields={auth_date:Math.floor(Date.now()/1000),id:subject};
 const material=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const signature=createHmac('sha256',createHash('sha256').update(token).digest()).update(material).digest('hex');
 const proof=JSON.stringify({type:'telegram_widget',credential:JSON.stringify({...fields,hash:signature})});
 const providerSubjectHash=clientChannelSubjectHash(encryption,'telegram',subject),verificationIdentityHash=hash(randomUUID());
 const evidence={contract:'a18.client-channel-verification.v1',verifier:'synthetic-b33',tenantId:tenant.id,clientId:client.id,provider:'telegram',providerSubjectHash,verificationIdentityHash,channelControlProofHash:hash(subject),clientAuthorityProofHash:hash(client.id)};
 const link=await db.clientChannelLink.create({data:{tenantId:tenant.id,clientId:client.id,provider:'telegram',providerSubjectHash,verificationMethod:'explicit_verified_challenge',verificationIdentityHash,verificationEvidenceJson:evidence,verificationEvidenceHash:hash(evidence)}});
 return {tenant,client,link,proof};
}
async function main(){
 assert.equal(await db.clientBookingConfirmation.count(),0);
 const f=await fixture(),g=await fixture();
 assert.equal(f.client.userId,null);
 const event={id:randomUUID(),kind:'client_booking_confirmation.v1',sourceStatement:'Подтверждаю запись',sourceContext:'Synthetic assistant proposal before interpretation'};
 const accept=(e=event,who=f,svc=receipt)=>context.runAsPublicTenant(who.tenant.id,()=>svc.accept(who.proof,e));
 const concurrent=await Promise.all(Array.from({length:12},()=>accept()));
 assert(concurrent.every(x=>x.confirmationId===event.id && x.idempotencyKey===concurrent[0].idempotencyKey));
 assert.equal(await db.clientBookingConfirmation.count(),1);
 await assert.rejects(()=>accept({...event,sourceContext:'Changed original context'}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(()=>accept(event,g),/IDEMPOTENCY_CONFLICT/);
 const event2={...event,id:randomUUID()};
 const divergent=await Promise.allSettled([accept(event2),accept({...event2,sourceStatement:'Changed original statement'})]);
 assert.equal(divergent.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(divergent.filter(x=>x.status==='rejected'&&x.reason.message==='IDEMPOTENCY_CONFLICT').length,1);
 const row=await db.clientBookingConfirmation.findUnique({where:{id:event.id}});
 for(const data of [{clientId:g.client.id},{tenantId:g.tenant.id},{confirmationEvidenceHash:hash('change')},{acceptedAt:new Date(0)}])
   await assert.rejects(()=>db.clientBookingConfirmation.update({where:{id:event.id},data}));
 await assert.rejects(()=>db.clientBookingConfirmation.delete({where:{id:event.id}}));
 await assert.rejects(()=>db.clientBookingConfirmation.create({data:{...row,id:randomUUID(),clientId:g.client.id}}));
 const db2=new PrismaClient({adapter:new PrismaPg({connectionString})});
 try{
  const runtime2=new (load('crm/client-channel-runtime.service.js','ClientChannelRuntimeService'))(db2,context,channels,encryption,{},{});
  const reopened=new Receipt(db2,encryption,runtime2.resolve.bind(runtime2));
  assert.deepEqual(await accept(event,f,reopened),concurrent[0]);
 }finally{await db2.$disconnect();}
 assert.equal(await db.actionExecution.count(),0);assert.equal(await db.appointment.count(),0);
 const revocationIdentityHash=hash(['revoke',f.link.id]);
 const revocationEvidenceJson={contract:'a18.client-channel-revocation.v1',revocationIdentityHash,tenantId:f.tenant.id,linkId:f.link.id,actorProofHash:hash('owner'),reason:'synthetic B33 proof'};
 await db.clientChannelLink.update({where:{id:f.link.id},data:{revokedAt:new Date(),revocationIdentityHash,revocationEvidenceJson,revocationEvidenceHash:hash(revocationEvidenceJson)}});
 await assert.rejects(()=>accept());
 await assert.rejects(()=>accept({...event,id:randomUUID()}));
 assert.equal(await db.clientBookingConfirmation.count(),2);
 const cols=await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='ClientBookingConfirmation'`;
 assert.equal(cols.length,8);
 console.log(JSON.stringify({verdict:'PASS',realPostgreSQL:true,persistedFields:8,concurrentSame:12,receiptsForSameEvent:1,concurrentDivergent:'one accepted source / one conflict',tenantClientIsolation:true,clientWithoutUser:true,immutable:true,reopenSameKey:true,revokedDenied:true,backfill:0,actionExecutions:0,appointments:0,providerWrites:0,productionMutations:0},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>db.$disconnect());
