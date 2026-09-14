/** B34: actual controller/DTO/role/membership/tenant/AC4 composition on owned PG.
 * Synthetic principals (not a JWT/network HTTP smoke). Python tests execute real
 * retired function bodies; all provider I/O is forbidden. No old database access. */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const backend = resolve(process.argv[2]);
const connectionString = process.argv[3];
const url = new URL(connectionString);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55504');
assert.equal(url.pathname, '/maya_c06_b34_proof');
const req = createRequire(resolve(backend, 'package.json'));
req('ts-node').register({project:resolve(backend,'tsconfig.scripts.json'),transpileOnly:true});
const {PrismaClient} = req('@prisma/client');
const {PrismaPg} = req('@prisma/adapter-pg');
const {ConfigService} = req('@nestjs/config');
const {Reflector} = req('@nestjs/core');
const {ValidationPipe} = req('@nestjs/common');
const load = (file, key) => req('./src/' + file)[key];
const Context = load('tenancy/tenant-context.service.ts', 'TenantContextService');
const Memberships = load('tenancy/memberships.service.ts', 'MembershipsService');
const Roles = load('guards/roles.guard.ts', 'RolesGuard');
const Encryption = load('encryption/encryption.service.ts', 'EncryptionService');
const Audit = load('audit-log/audit-log.service.ts', 'AuditLogService');
const Facts = load('package5-wave4/package5-wave4.service.ts', 'Package5Wave4ReviewFactService');
const Service = load('business-content/business-content.service.ts', 'BusinessContentService');
const Controller = load('business-content/business-content.controller.ts', 'BusinessContentController');
const Dto = load('business-content/dto/business-review.dto.ts', 'IngestBusinessReviewDto');
const db = new PrismaClient({adapter:new PrismaPg({connectionString})});
const context = new Context();
const memberships = new Memberships(db);
const roles = new Roles(new Reflector());
const encryption = new Encryption(new ConfigService({CRM_ENCRYPTION_KEY:'b34-synthetic-proof-only'}));
const audit = new Audit(db, context);
const facts = new Facts(db, encryption);
let ownerCalls = 0;
const accept = facts.accept.bind(facts);
facts.accept = async input => {ownerCalls++; return accept(input);};
const service = new Service(db, context, audit, {}, {}, facts);
const controller = new Controller(service);
const pipe = new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
global.fetch = async () => {throw Error('Live HTTP forbidden');};
const payload = {source:' Yandex ',externalRef:' original ',rating:5,occurredAt:'2026-09-01T12:00:00.000Z',text:' Original synthetic evidence '};
const code = n => e => e?.getStatus?.() === n;
async function request(scope, input, contextTenant = scope.tenantId) {
  const member = await memberships.getActiveMembership(scope.userId, scope.tenantId);
  const principal = {userId:scope.userId,tenantId:member.tenantId,role:member.role};
  roles.canActivate({getHandler:()=>Controller.prototype.ingestReview,getClass:()=>Controller,switchToHttp:()=>({getRequest:()=>({user:principal})})});
  const dto = await pipe.transform(input,{type:'body',metatype:Dto});
  return context.run(randomUUID(), () => {
    context.setResolvedTenant({tenantId:contextTenant,userId:principal.userId,membershipId:member.id,role:member.role,source:'membership'});
    return controller.ingestReview(principal,dto);
  });
}
async function fixture() {
 const scope={tenantId:randomUUID(),userId:randomUUID(),branchId:randomUUID()};
 await db.tenant.create({data:{id:scope.tenantId,slug:scope.tenantId,name:'B34 synthetic tenant',status:'active',branches:{create:{id:scope.branchId,name:'Synthetic branch'}},users:{create:{id:scope.userId,email:`${scope.userId}@proof.invalid`,passwordHash:'synthetic-not-a-password',role:'tenant_owner',memberships:{create:{tenantId:scope.tenantId,role:'tenant_owner',status:'active'}}}}}});
 return scope;
}
const row = id => db.businessReview.findUniqueOrThrow({where:{id}});
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function main() {
 if(process.argv[4] === '--child') {
   const result = await request(JSON.parse(process.argv[5]),payload);
   console.log(JSON.stringify({id:result.id})); return;
 }
 const a=await fixture(),b=await fixture();
 const beforeExecutions=await db.actionExecution.count();
 const first=await request(a,payload); const original=await row(first.id);
 assert.equal(original.tenantId,a.tenantId);assert.equal(original.source,'yandex');assert.equal(original.externalRef,'original');
 assert.equal(encryption.decrypt(original.encryptedText),payload.text.trim());
 assert.equal((await request(a,payload)).id,first.id);
 for(const changed of [{text:'Different'},{rating:1},{occurredAt:'2026-09-02T12:00:00Z'},{branchId:a.branchId},{staffExternalId:'staff-other'}]) {
   await assert.rejects(request(a,{...payload,...changed}),code(409));
   assert.deepEqual(await row(first.id),original);
 }
 for(const unknown of [{author:'Changed'},{tenantId:b.tenantId},{cardId:'different-card'}])
   await assert.rejects(request(a,{...payload,...unknown}),code(400));
 await assert.rejects(request(a,{...payload,externalRef:''}),code(400));
 await assert.rejects(request(a,{...payload,branchId:b.branchId}),code(404));
 await assert.rejects(request(a,payload,b.tenantId),code(403));
 await assert.rejects(request({...a,tenantId:b.tenantId},payload),code(401));
 await db.membership.update({where:{userId_tenantId:{userId:a.userId,tenantId:a.tenantId}},data:{status:'suspended'}});
 await assert.rejects(request(a,payload),code(401));
 await db.membership.update({where:{userId_tenantId:{userId:a.userId,tenantId:a.tenantId}},data:{status:'active',role:'client'}});
 await assert.rejects(request(a,payload),code(403));
 await db.membership.update({where:{userId_tenantId:{userId:a.userId,tenantId:a.tenantId}},data:{role:'tenant_owner'}});
 assert.equal(await db.businessReview.count(),1);
 const identical=await Promise.all(Array.from({length:12},()=>request(a,{...payload,externalRef:'concurrent-same'})));
 assert.equal(new Set(identical.map(x=>x.id)).size,1);
 const divergent=await Promise.allSettled([request(a,{...payload,externalRef:'concurrent-different',text:'A'}),request(a,{...payload,externalRef:'concurrent-different',text:'B'})]);
 assert.equal(divergent.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(divergent.filter(x=>x.status==='rejected' && code(409)(x.reason)).length,1);
 const provider=await request(a,{...payload,source:'2gis'});
 const tenant=await request(b,payload);
 assert.notEqual(provider.id,first.id);assert.notEqual(tenant.id,first.id);
 const child=JSON.parse(execFileSync(process.execPath,[__filename,backend,connectionString,'--child',JSON.stringify(a)],{encoding:'utf8'}));
 assert.equal(child.id,first.id);
 const beforeLegacy=await db.businessReview.findMany({orderBy:{id:'asc'}});
 const legacy=execFileSync('python3',['-B','-m','unittest','test_package5_b34_review_retirement','test_reputation'],{cwd:resolve(backend,'../ai администратор'),encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.deepEqual(await db.businessReview.findMany({orderBy:{id:'asc'}}),beforeLegacy);
 assert.deepEqual(await row(first.id),original);
 assert.equal(await db.businessReview.count(),5);
 assert.equal(await db.actionExecution.count(),beforeExecutions);
 assert.equal(await db.crmIntegration.count(),0);
 console.log(JSON.stringify({scope:'B34 approved Option A',database:'owned 127.0.0.1:55504/maya_c06_b34_proof',canonicalIngress:'PASS — actual controller/DTO/role/membership/tenant/AC4 composition',principal:'synthetic, not JWT HTTP-server proof',firstImport:'PASS',exactReplay:'PASS',changedTextRatingTimeBranchStaff:'CONFLICT',authorAndTenantAndCardUnknownFields:'REJECTED',wrongRevokedMembershipAndRole:'REJECTED',concurrentIdentical:12,concurrentDivergent:'ONE ACCEPTED + ONE CONFLICT',differentProviderTenant:'INDEPENDENT SCOPED IDENTITIES',restart:'new Node process same canonical outcome',originalEvidenceSha256:hash(original),originalEvidenceUnchanged:true,canonicalFacts:5,ownerCalls,legacyTests:10,legacyTestStdoutSha256:hash(legacy),legacyCanonicalMutations:0,actionExecutions:0,fakeIntegrationBindings:0,providerCalls:0,productionMutations:0,verdict:'PASS'},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
