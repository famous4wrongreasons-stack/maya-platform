// Actual application DI, on an empty owned synthetic database. Only scheduler
// startup is suppressed in this proof process; no production files are changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../../maya-saas-backend'),req=createRequire(path.join(root,'package.json'));
process.env.DATABASE_URL='postgresql://maya_rc@127.0.0.1:55509/maya_rc_policy_replay';
process.env.NODE_ENV='test';
for(const name of fs.readFileSync(path.join(root,'src/config/runtime-config.ts'),'utf8').split('const BOOLEAN_NAMES')[0].match(/'[A-Z_]+SECRET'|'[A-Z_]+KEY'|'[A-Z_]+PEPPER'/g)||[]){const key=name.slice(1,-1);process.env[key]=crypto.createHash('sha256').update('synthetic-rc-bootstrap-only:'+key).digest('hex');}
process.env.MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION='synthetic-v1';
process.env.MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION='synthetic-v1';
process.env.CRM_ENCRYPTION_KEY='synthetic-rc-bootstrap-secret-only';
const get=p=>req(path.join(root,'dist/src',p));
const {AppModule}=get('app.module.js');
const schedulers=[['owner-reports/owner-reports.scheduler.js','OwnerReportsSchedulerService'],
 ['billing/billing-scheduler.service.js','BillingSchedulerService'],
 ['appointment-notifications/appointment-notifications.scheduler.js','AppointmentNotificationsScheduler'],
 ['events/ingestion-retention.scheduler.js','IngestionRetentionScheduler'],
 ['crm/appointment-reconciliation.scheduler.js','AppointmentReconciliationScheduler'],
 ['operational-alerts/operational-alerts.scheduler.js','OperationalAlertsScheduler'],
 ['native-feedback/native-feedback.scheduler.js','NativeFeedbackScheduler'],
 ['team-communications/team-communications.scheduler.js','TeamCommunicationsScheduler'],
 ['expense-intake/expense-reminder.scheduler.js','ExpenseReminderScheduler']];
for(const [file,name] of schedulers){const value=get(file)[name];assert.equal(typeof value?.prototype?.onModuleInit,'function',name);value.prototype.onModuleInit=function(){};}
const owners=[['owner-reports/owner-reports.service.js','OwnerReportsService'],
 ['operational-alerts/operational-alerts.service.js','OperationalAlertsService'],
 ['native-feedback/native-feedback.service.js','NativeFeedbackService'],
 ['public-community/public-community.service.js','PublicCommunityService'],
 ['package5-wave1/package5-wave1.service.js','Package5Wave1ExecutableService'],
 ['team-communications/team-communications.service.js','TeamCommunicationsService'],
 ['expense-intake/expense-intake.service.js','ExpenseIntakeService'],
 ['expenses/cash-declaration.service.js','CashDeclarationService'],
 ['package5-wave3/consent-security-invalidation.service.js','ConsentSecurityInvalidationService']];
(async()=>{const {NestFactory}=req('@nestjs/core');const app=await NestFactory.createApplicationContext(AppModule,{logger:false,abortOnError:false});try{
 const db=app.get(get('prisma/prisma.service.js').PrismaService);
 for(const[file,name]of owners)assert(app.get(get(file)[name]),name);
 assert.equal(await db.actionExecution.count(),0);assert.equal(await db.client.count(),0);
 console.log(JSON.stringify({status:'PASS',actualApplicationDI:true,ownersResolved:owners.length,schedulersSuppressed:schedulers.length,syntheticBusinessWrites:0,productionEffects:0}));
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
