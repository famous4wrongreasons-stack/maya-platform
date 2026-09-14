/** B28 executable proof. Only the explicitly owned loopback PostgreSQL DB.
 * Actual compiled readers/controllers; all identities and profile facts synthetic. */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {createHash,createHmac,randomUUID} = require('node:crypto');
const req=createRequire(resolve(process.argv[2],'package.json'));
const {PrismaClient}=req('@prisma/client'),{PrismaPg}=req('@prisma/adapter-pg');
const {ConfigService}=req('@nestjs/config');
const {ClientProfileReadService}=req('./dist/src/crm/client-profile-read.service.js');
const {ClientChannelAuthenticatorService}=req('./dist/src/crm/client-channel-authenticator.service.js');
const {ClientChannelController,LegacyClientChannelController}=req('./dist/src/crm/client-channel.controller.js');
const {ClientHabitsService}=req('./dist/src/crm/client-habits.service.js');
const {serializeClientHabits}=req('./dist/src/action-engine/client-habits.policy.js');
const {CustomersService}=req('./dist/src/customers/customers.service.js');
const {CustomersController}=req('./dist/src/customers/customers.controller.js');
const {CustomerPortalService}=req('./dist/src/customer-portal/customer-portal.service.js');
const {CustomerPortalController}=req('./dist/src/customer-portal/customer-portal.controller.js');
const {UsersService}=req('./dist/src/users/users.service.js');
const {TenantContextService}=req('./dist/src/tenancy/tenant-context.service.js');
const {EncryptionService}=req('./dist/src/encryption/encryption.service.js');
const {clientChannelSubjectHash}=req('./dist/src/crm/client-channel-subject.js');
const url=new URL('postgresql://postgres@127.0.0.1:55498/maya_c06_b28_owned');
assert(url.hostname==='127.0.0.1'&&url.port==='55498'&&url.pathname==='/maya_c06_b28_owned');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
global.fetch=async()=>{throw Error('Live HTTP forbidden in B28 proof');};
const config=new ConfigService({CRM_ENCRYPTION_KEY:'synthetic-b28-encryption'.repeat(3),MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN:'synthetic-b28-telegram'});
const encryption=new EncryptionService(config),context=new TenantContextService();
const channels=new ClientChannelAuthenticatorService(config,context,encryption);
const reader=new ClientProfileReadService(db,context,channels,encryption);
const unused=new Proxy({},{get:()=>()=>{throw Error('Unexpected mutation/provider dependency');}});
const users=new UsersService(db,encryption,context,unused,reader);
const customers=new CustomersService(db,context,users,encryption,unused,unused,unused,reader);
const controller=new CustomersController(customers);
const portal=new CustomerPortalController(new CustomerPortalService(context,users,customers,
 {listClientAppointments:async()=>{throw Error('Synthetic unavailable');}}, {getForUser:async()=>{throw Error('Synthetic unavailable');}}));
const habits=new ClientHabitsService(db,context,channels,unused,unused,encryption);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const own=(f,fn)=>context.runAsAuthPrincipal({tenantId:f.tenantId,userId:f.user.id,role:'client'},fn);
const channel=(f,fn)=>context.runAsPublicTenant(f.tenantId,fn);
let subjectCounter=8500000000;
const cases=[];
async function state(){return hash(await Promise.all(['client','customerProfile','clientChannelLink','clientConsentFact','user','membership','actionExecution','actionTargetMutation','loyaltyAccount','loyaltyTransaction'].map(name=>db[name].findMany({orderBy:{id:'asc'}}))));}
async function unchanged(name,fn){const before=await state();await fn();assert.equal(await state(),before,name+': durable state changed');cases.push(name);}
function proof(subject){
 const fields={auth_date:String(Math.floor(Date.now()/1000)),id:subject};
 const material=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const signature=createHmac('sha256',createHash('sha256').update('synthetic-b28-telegram').digest()).update(material).digest('hex');
 return JSON.stringify({type:'telegram_widget',credential:JSON.stringify({...fields,hash:signature})});
}
async function makeLink(f,provider,subject,clientId=f.client.id){
 const providerSubjectHash=clientChannelSubjectHash(encryption,provider,subject),verificationIdentityHash=hash(randomUUID());
 const evidence={contract:'a18.client-channel-verification.v1',verifier:'synthetic-b28',tenantId:f.tenantId,clientId,provider,providerSubjectHash,verificationIdentityHash,channelControlProofHash:hash(subject),clientAuthorityProofHash:hash(clientId)};
 return db.clientChannelLink.create({data:{tenantId:f.tenantId,clientId,provider,providerSubjectHash,verificationMethod:'explicit_verified_challenge',verificationIdentityHash,verificationEvidenceJson:evidence,verificationEvidenceHash:hash(evidence)}});
}
async function fixture({user=true,profile=true,linked=true,tenantId}={}){
 if(!tenantId){tenantId=randomUUID();await db.tenant.create({data:{id:tenantId,slug:tenantId,name:'Synthetic B28',status:'active'}});}
 const u=user?await db.user.create({data:{tenantId:null,email:randomUUID()+'@invalid.test',passwordHash:'synthetic',phone:'+79990000000',role:'client',status:'active'}}):null;
 if(u)await db.membership.create({data:{tenantId,userId:u.id,role:'client',status:'active'}});
 const client=await db.client.create({data:{tenantId,userId:u?.id}});
 const habit='Synthetic preference '+randomUUID();
 const p=profile?await db.customerProfile.create({data:{tenantId,clientId:client.id,userId:u?.id,preferredLocale:'ru',privacyConsentAt:new Date('2026-01-02T00:00:00Z'),marketingConsentAt:new Date('2026-02-03T00:00:00Z'),defaultVisitMood:'blue',notificationPreferencesJson:{version:1,overrides:{reminder:false}},encryptedClientPreferences:encryption.encrypt(serializeClientHabits([habit])),encryptedNotes:encryption.encrypt('Synthetic staff note')}}):null;
 const f={tenantId,user:u,client,profile:p,habit,subject:String(++subjectCounter)};
 f.proof=proof(f.subject);f.principal={tenantId,userId:u?.id,role:'client'};
 if(linked){f.telegramLink=await makeLink(f,'telegram',f.subject);if(u)f.accountLink=await makeLink(f,'maya_user',u.id);}
 return f;
}
async function revoke(link){const revocationIdentityHash=hash(['revoke',link.id]);const evidence={contract:'a18.client-channel-revocation.v1',revocationIdentityHash,tenantId:link.tenantId,linkId:link.id,actorProofHash:hash(link.id),reason:'synthetic proof revocation'};await db.clientChannelLink.update({where:{id:link.id},data:{revokedAt:new Date(),revocationIdentityHash,revocationEvidenceJson:evidence,revocationEvidenceHash:hash(evidence)}});}
function assertOwn(result,f){assert.equal(result.profile_id,f.profile?.id??null);assert(!('notes' in result));assert(!JSON.stringify(result).includes(f.habit));assert.deepEqual(Object.keys(result).sort(),['profile_id','preferred_locale','privacy_consent_at','marketing_consent_at','updated_at'].sort());}
function faultReader(change){const wrapped=new Proxy(db,{get(target,key){if(key==='$transaction')return (fn,options)=>target.$transaction(tx=>fn(change(tx)),options);const value=target[key];return typeof value==='function'?value.bind(target):value;}});return new ClientProfileReadService(wrapped,context,channels,encryption);}
async function main(){
 const a=await fixture();
 await unchanged('verified account Client A returns profile A via actual endpoint',async()=>assertOwn(await own(a,()=>controller.getOwnProfile(a.principal)),a));
 await unchanged('portal profile authority parity even when unrelated projections unavailable',async()=>assertOwn((await own(a,()=>portal.getOverview(a.principal))).profile,a));
 await unchanged('account profile metadata uses shared verified reader',async()=>{const u=await own(a,()=>users.getTenantUserOrThrow(a.user.id,a.tenantId));const x=await own(a,()=>users.serializeCurrentUser(u));assert(x.app_access.available_modes.some(m=>m.profile_linked));});
 const guest=await fixture({user:false});
 await unchanged('Client without Maya User via actual signed Telegram channel',async()=>{const x=await channel(guest,()=>reader.forChannel(guest.proof));assert.equal(x.clientId,guest.client.id);assertOwn(x.profile,guest);});
 const transport={assertBridgeSecret:()=>{},assertBridgeIntegrationBinding:()=>({}),resolveTenantByIntegration:async()=>({tenantId:guest.tenantId})};
 const bridge=new LegacyClientChannelController(transport,context,unused,unused,undefined,reader);
 const envelope={channelProof:guest.proof,externalCompanyId:'synthetic',provider:'yclients',payload:{}};
 await unchanged('guest profile projection through existing independently authenticated bridge',async()=>assertOwn(await bridge.command('synthetic','profile-projection',envelope),guest));
 await unchanged('untrusted bridge clientId cannot override Client',async()=>assert.rejects(async()=>bridge.command('synthetic','profile-projection',{...envelope,payload:{clientId:a.client.id}})));
 const noProfile=await fixture({profile:false});
 await unchanged('verified Client without profile returns null projection without materialization',async()=>assertOwn(await own(noProfile,()=>controller.getOwnProfile(noProfile.principal)),noProfile));
 const missing=await fixture({linked:false});
 await unchanged('missing binding blocks profile endpoint',async()=>assert.rejects(async()=>own(missing,()=>controller.getOwnProfile(missing.principal))));
 await unchanged('missing binding blocks portal profile',async()=>assert.rejects(async()=>own(missing,()=>portal.getOverview(missing.principal))));
 await unchanged('unverified account metadata does not disclose legacy profile existence',async()=>{const u=await own(missing,()=>users.getTenantUserOrThrow(missing.user.id,missing.tenantId));const x=await own(missing,()=>users.serializeCurrentUser(u));assert(x.app_access.available_modes.every(m=>!m.profile_linked));});
 const revoked=await fixture();await revoke(revoked.accountLink);await revoke(revoked.telegramLink);
 await unchanged('revoked account and channel cannot disclose profile',async()=>{await assert.rejects(async()=>own(revoked,()=>controller.getOwnProfile(revoked.principal)));await assert.rejects(async()=>channel(revoked,()=>reader.forChannel(revoked.proof)));});
 const conflict=await fixture({linked:false});
 const exactClient=await db.client.create({data:{tenantId:conflict.tenantId}});
 const exactProfile=await db.customerProfile.create({data:{tenantId:conflict.tenantId,clientId:exactClient.id,preferredLocale:'en'}});
 await makeLink(conflict,'maya_user',conflict.user.id,exactClient.id);
 await unchanged('verified Client A overrides legacy User-associated Client B and profile B',async()=>{const x=await own(conflict,()=>controller.getOwnProfile(conflict.principal));assert.equal(x.profile_id,exactProfile.id);assert.equal(x.preferred_locale,'en');assert.notEqual(x.profile_id,conflict.profile.id);});
 const missingExact=await fixture({linked:false});const emptyClient=await db.client.create({data:{tenantId:missingExact.tenantId}});await makeLink(missingExact,'maya_user',missingExact.user.id,emptyClient.id);
 await unchanged('missing exact profile never falls back to available legacy profile B',async()=>{const x=await own(missingExact,()=>controller.getOwnProfile(missingExact.principal));assert.equal(x.profile_id,null);assert.equal(x.marketing_consent_at,null);});
 const samePhone=await fixture({tenantId:a.tenantId});
 await unchanged('duplicate User phones retain distinct exact Client profiles',async()=>{assert.equal(a.user.phone,samePhone.user.phone);assertOwn(await own(a,()=>controller.getOwnProfile(a.principal)),a);assertOwn(await own(samePhone,()=>controller.getOwnProfile(samePhone.principal)),samePhone);});
 await unchanged('forged clientId and phone fields are not identity authority',async()=>assertOwn(await own(a,()=>controller.getOwnProfile({...a.principal,clientId:samePhone.client.id,phone:samePhone.user.phone,chat_id:samePhone.subject})),a));
 await unchanged('wrong tenant channel proof fails closed',async()=>assert.rejects(async()=>context.runAsPublicTenant(samePhone.tenantId+'-wrong',()=>reader.forChannel(a.proof))));
 await unchanged('forged account target fails before projection',async()=>assert.rejects(async()=>own(a,()=>reader.forAccount(a.tenantId,samePhone.user.id))));
 await unchanged('phone-only and raw Telegram proof fail closed',async()=>{for(const value of [{phone:a.user.phone},{chat_id:a.subject},{type:'telegram_widget',credential:JSON.stringify({id:a.subject})}])await assert.rejects(async()=>channel(a,()=>reader.forChannel(JSON.stringify(value))));});
 const ambiguous=faultReader(tx=>new Proxy(tx,{get(t,k){if(k==='clientChannelLink')return {...t.clientChannelLink,findMany:async args=>{const rows=await t.clientChannelLink.findMany(args);return [...rows,...rows];}};return t[k];}}));
 await unchanged('ambiguous durable identity result fails closed',async()=>assert.rejects(async()=>own(a,()=>ambiguous.forAccount(a.tenantId,a.user.id))));
 const mismatch=faultReader(tx=>new Proxy(tx,{get(t,k){if(k==='customerProfile')return {...t.customerProfile,findUnique:async()=>samePhone.profile};return t[k];}}));
 await unchanged('defensive exact profile owner check rejects mismatched stored projection',async()=>assert.rejects(async()=>own(a,()=>mismatch.forAccount(a.tenantId,a.user.id))));
 const attemptedWrite=faultReader(tx=>new Proxy(tx,{get(t,k){if(k==='customerProfile')return {...t.customerProfile,findUnique:async()=>t.customerProfile.update({where:{id:a.profile.id},data:{preferredLocale:'fr'}})};return t[k];}}));
 await unchanged('PostgreSQL READ ONLY fence rejects a restored hidden profile writer',async()=>assert.rejects(async()=>own(a,()=>attemptedWrite.forAccount(a.tenantId,a.user.id))));
 await unchanged('20 concurrent profile and portal reads keep all durable state byte-equivalent',async()=>{const rows=await Promise.all(Array.from({length:20},(_,i)=>own(a,async()=>i%2?(await portal.getOverview(a.principal)).profile:controller.getOwnProfile(a.principal))));rows.forEach(x=>assertOwn(x,a));});
 await unchanged('B7 encrypted habits resolve exact Client without Maya User',async()=>assert.deepEqual((await channel(guest,()=>habits.read(guest.proof))).preferences,[guest.habit]));
 await unchanged('B7 Client A never decrypts or receives Client B preferences',async()=>{assert.deepEqual((await channel(a,()=>habits.read(a.proof))).preferences,[a.habit]);assert.deepEqual((await channel(samePhone,()=>habits.read(samePhone.proof))).preferences,[samePhone.habit]);});
 await unchanged('B7 missing and revoked bindings disclose no encrypted preferences',async()=>{await assert.rejects(async()=>channel(missing,()=>habits.read(missing.proof)));await assert.rejects(async()=>channel(revoked,()=>habits.read(revoked.proof)));});
 const manager=await db.user.create({data:{email:randomUUID()+'@invalid.test',passwordHash:'synthetic',role:'manager',status:'active'}});await db.membership.create({data:{tenantId:a.tenantId,userId:manager.id,role:'manager',status:'active'}});
 await unchanged('existing manager authority sees only exact verified target staff notes',async()=>{const x=await context.runAsAuthPrincipal({tenantId:a.tenantId,userId:manager.id,role:'manager'},()=>reader.forStaffAccount(a.tenantId,a.user.id));assert.equal(x.profile.profile_id,a.profile.id);assert.equal(x.profile.notes,'Synthetic staff note');assert(!JSON.stringify(x).includes(a.habit));});
 await unchanged('Client cannot use staff private profile projection',async()=>assert.rejects(async()=>own(a,()=>reader.forStaffAccount(a.tenantId,samePhone.user.id))));
 console.log(JSON.stringify({verdict:'PASS',caseCount:cases.length,cases,allReadBusinessStateByteEquivalent:true,clientWithoutMayaUser:true,habitsBoundaryPreserved:true,productionMutations:0,providerCalls:0,newSchema:false,ownedDatabase:'maya_c06_b28_owned'},null,2));
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
