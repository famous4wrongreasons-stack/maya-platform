// Synthetic disposable DB only: the operational runner's real DI/auth path.
const assert=require('node:assert/strict'), fs=require('node:fs'), crypto=require('node:crypto');
const path=require('node:path'), {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../../maya-saas-backend'), req=createRequire(path.join(root,'package.json'));
process.env.DATABASE_URL='postgresql://maya_consent_security@127.0.0.1:55517/maya_consent_security_proof';
process.env.NODE_ENV='test';
for(const name of fs.readFileSync(path.join(root,'src/config/runtime-config.ts'),'utf8').split('const BOOLEAN_NAMES')[0].match(/'[A-Z_]+SECRET'|'[A-Z_]+KEY'|'[A-Z_]+PEPPER'/g)||[]){const key=name.slice(1,-1);process.env[key]=crypto.createHash('sha256').update('synthetic-bootstrap-only:'+key).digest('hex');}
process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION='synthetic-v1';
process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION='synthetic-v1';
process.env.CRM_ENCRYPTION_KEY='synthetic-consent-security-proof-secret-only';
for(const k of ['OWNER_REPORTS_SCHEDULER_ENABLED','BILLING_SCHEDULER_ENABLED','APPOINTMENT_REMINDERS_SCHEDULER_ENABLED','INGESTION_QUARANTINE_RETENTION_ENABLED','CRM_RECONCILIATION_SCHEDULER_ENABLED']) process.env[k]='false';
const {NestFactory}=req('@nestjs/core'),{JwtService}=req('@nestjs/jwt');
const get=(p)=>req(path.join(root,'dist/src',p));
const {AppModule}=get('app.module.js'),{PrismaService}=get('prisma/prisma.service.js');
const {ConsentSecurityInvalidationService}=get('package5-wave3/consent-security-invalidation.service.js');
const {AuthService}=get('auth/auth.service.js'),{AuthSessionService}=get('auth/auth-session.service.js'),{JwtStrategy}=get('auth/jwt.strategy.js');
(async()=>{const app=await NestFactory.createApplicationContext(AppModule,{logger:false,abortOnError:false});try{
const db=app.get(PrismaService),operator=await db.user.findFirstOrThrow({where:{role:'platform_owner'}});
const password='Synthetic-A18-Security-Login-Proof';await db.user.update({where:{id:operator.id},data:{passwordHash:await req('bcrypt').hash(password,4)}});
const before=await db.actionExecution.count();
const session=await app.get(AuthService).login({email:operator.email,password},{userAgent:'synthetic canonical security proof'});
const payload=new JwtService().verify(session.access_token,{secret:process.env.JWT_SECRET,algorithms:['HS256']});
const actor=await app.get(JwtStrategy).validate(payload);assert.equal(actor.role,'platform_owner');assert.equal(actor.tenantId,null);assert(actor.sessionId);
assert(app.get(ConsentSecurityInvalidationService));await app.get(AuthSessionService).logout(actor);
assert.equal(await db.actionExecution.count(),before);
console.log(JSON.stringify({status:'PASS',canonicalApplicationContext:true,realAuthOwnerAndJwtStrategy:true,securityOwnerDependencyInjection:true,schedulers:'DISABLED',businessWrites:0,providerEffects:0,messages:0,productionWrites:0}));
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
