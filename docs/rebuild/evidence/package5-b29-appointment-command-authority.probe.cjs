/** Isolated B29 inventory reproduction. No HTTP/provider calls; synthetic PG only.
 * Actual compiled HTTP controller, service, repository, User and audit owners.
 * Existing B26 reader is a control, not a changed/reopened runtime.
 */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const req = createRequire(resolve(process.argv[2], 'package.json'));
const {PrismaClient} = req('@prisma/client');
const {PrismaPg} = req('@prisma/adapter-pg');
const {ConfigService} = req('@nestjs/config');
const {AppointmentsController} = req('./dist/src/appointments/appointments.controller.js');
const {AppointmentsService} = req('./dist/src/appointments/appointments.service.js');
const {TenantAppointmentRepository} = req('./dist/src/appointments/tenant-appointment.repository.js');
const {ClientAppointmentReadService} = req('./dist/src/crm/client-appointment-read.service.js');
const {ClientChannelAuthenticatorService} = req('./dist/src/crm/client-channel-authenticator.service.js');
const {TenantContextService} = req('./dist/src/tenancy/tenant-context.service.js');
const {UsersService} = req('./dist/src/users/users.service.js');
const {AuditLogService} = req('./dist/src/audit-log/audit-log.service.js');
const {EncryptionService} = req('./dist/src/encryption/encryption.service.js');
const {clientChannelSubjectHash} = req('./dist/src/crm/client-channel-subject.js');
const connectionString = 'postgresql://postgres@127.0.0.1:55498/maya_c06_b28_owned';
const url = new URL(connectionString);
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.port,'55498');
assert.equal(url.pathname,'/maya_c06_b28_owned');
const db = new PrismaClient({adapter:new PrismaPg({connectionString})});
global.fetch = async () => {throw Error('Live HTTP forbidden');};
const context = new TenantContextService();
const encryption = new EncryptionService(new ConfigService({CRM_ENCRYPTION_KEY:'synthetic-b29'.repeat(8)}));
const channels = new ClientChannelAuthenticatorService(new ConfigService(),context,encryption);
const unavailable = new Proxy({}, {get:()=>()=>{throw Error('Unexpected dependency');}});
const users = new UsersService(db,encryption,context,unavailable);
const audit = new AuditLogService(db,context);
const repository = new TenantAppointmentRepository(db,context);
let providerCalls = 0, inboxRequests = 0;
const crm = {
  getServices:async()=>[], getStaff:async()=>[],
  cancelAppointment:async()=>{providerCalls++;throw Error('Provider calls forbidden');},
};
const reader = new ClientAppointmentReadService(db,context,channels,encryption,crm);
const service = new AppointmentsService(db,context,repository,crm,unavailable,unavailable,users,audit,
  {publishForTenant:async()=>{inboxRequests++;}},undefined,reader);
const controller = new AppointmentsController(service);
const hash = value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scoped = (f,fn)=>context.runAsAuthPrincipal(f.principal,fn);
async function identityState(tenantId) {
  return hash(await Promise.all(['client','clientChannelLink','customerProfile','clientConsentFact']
    .map(model=>db[model].findMany({where:{tenantId},orderBy:{id:'asc'}}))));
}
async function fixture(mode) {
  const tenantId=randomUUID();
  await db.tenant.create({data:{id:tenantId,slug:tenantId,name:'Synthetic B29',status:'active',calendarSource:'internal'}});
  const user=await db.user.create({data:{email:randomUUID()+'@invalid.test',passwordHash:'synthetic',encryptedName:encryption.encrypt('Synthetic account'),role:'client',status:'active'}});
  await db.membership.create({data:{tenantId,userId:user.id,role:'client',status:'active'}});
  const clientA=await db.client.create({data:{tenantId,userId:user.id}});
  const clientB=await db.client.create({data:{tenantId}});
  let link=null;
  if(mode!=='missing') {
    const providerSubjectHash=clientChannelSubjectHash(encryption,'maya_user',user.id);
    const verificationIdentityHash=hash(randomUUID());
    const evidence={contract:'a18.client-channel-verification.v1',verifier:'synthetic-b29',tenantId,
      clientId:clientA.id,provider:'maya_user',providerSubjectHash,verificationIdentityHash,
      channelControlProofHash:hash(user.id),clientAuthorityProofHash:hash(clientA.id)};
    link=await db.clientChannelLink.create({data:{tenantId,clientId:clientA.id,provider:'maya_user',
      providerSubjectHash,verificationMethod:'explicit_verified_challenge',verificationIdentityHash,
      verificationEvidenceJson:evidence,verificationEvidenceHash:hash(evidence)}});
    if(mode==='revoked') {
      const revocationIdentityHash=hash(['revoke',link.id]);
      const revocationEvidenceJson={contract:'a18.client-channel-revocation.v1',revocationIdentityHash,
        tenantId,linkId:link.id,actorProofHash:hash(user.id),reason:'synthetic B29 revocation'};
      await db.clientChannelLink.update({where:{id:link.id},data:{revokedAt:new Date(),revocationIdentityHash,
        revocationEvidenceJson,revocationEvidenceHash:hash(revocationEvidenceJson)}});
    }
  }
  const startAt=new Date(Date.now()+7*86400000),endAt=new Date(startAt.getTime()+3600000);
  const appointment=await db.appointment.create({data:{tenantId,clientId:user.id,mayaClientId:clientB.id,
    source:'internal',staffExternalId:'synthetic-provider',serviceIds:[],startAt,endAt,
    blockedStartAt:startAt,blockedEndAt:endAt,status:'confirmed'}});
  return {tenantId,user,clientA,clientB,appointment,principal:{tenantId,userId:user.id,role:'client'}};
}
async function main() {
  const cases=[];
  for(const mode of ['missing','revoked','verified_to_other_client']) {
    const f=await fixture(mode), before=await identityState(f.tenantId);
    // The accepted read boundary correctly refuses this private appointment.
    if(mode==='verified_to_other_client') {
      const visible=await scoped(f,()=>controller.listMyAppointments(f.principal));
      assert(Array.isArray(visible));assert.equal(visible.length,0);
    } else await assert.rejects(async()=>scoped(f,()=>controller.listMyAppointments(f.principal)));
    assert.equal(await identityState(f.tenantId),before);
    const executionsBefore=await db.actionExecution.count({where:{tenantId:f.tenantId}});
    const result=await scoped(f,()=>controller.cancelAppointment(f.principal,f.appointment.id,'synthetic-b29-'+mode));
    assert.equal(result.ok,true);
    const after=await db.appointment.findUnique({where:{id:f.appointment.id}});
    assert.equal(after.status,'canceled');
    assert.equal(after.mayaClientId,f.clientB.id);
    assert.notEqual(f.clientA.id,f.clientB.id);
    assert.equal(await db.actionExecution.count({where:{tenantId:f.tenantId}}),executionsBefore);
    assert.equal(await identityState(f.tenantId),before);
    assert.equal(await db.auditLog.count({where:{tenantId:f.tenantId,action:'appointment.cancelled'}}),1);
    // Repeat is rejected, but the first unauthorized state change already happened.
    await assert.rejects(async()=>scoped(f,()=>controller.cancelAppointment(f.principal,f.appointment.id,'synthetic-b29-'+mode)));
    cases.push({mode,verifiedReaderDisclosesTarget:false,cancelAccepted:true,
      targetClientIsOtherThanVerifiedOrAccountAssociatedClient:true,statusAfter:'canceled',
      newActionExecutions:0,clientLinkProfileConsentStateUnchanged:true});
  }
  // Allow the service's non-awaited inbox task to settle. Delivery is stubbed.
  await new Promise(r=>setImmediate(r));
  assert.equal(providerCalls,0);
  console.log(JSON.stringify({verdict:'BLOCKER_REPRODUCED',blocker:'B29 / A18',cases,
    route:'POST /api/appointments/:id/cancel',testedCalendarSource:'internal',
    compiledControllerServiceRepository:true,realPostgresql:true,syntheticFixturesOnly:true,
    httpAuthenticationBypassClaimed:false,requiresAuthenticatedTenantMemberAndBookingFeature:true,
    actionEngineExecutionsCreated:0,providerCalls,inboxRequestsIntercepted:inboxRequests,
    realProductionMutations:0,realProductionPrivateReads:0,
    limitations:'Does not execute external CRM cancellation, rescheduling, creation, or production HTTP.'},null,2));
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
