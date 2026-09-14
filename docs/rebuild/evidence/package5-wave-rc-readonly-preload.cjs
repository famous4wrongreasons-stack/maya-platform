// One isolated readiness process only. Do not use for the live systemd unit.
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module'),req=createRequire(path.join(process.cwd(),'package.json'));
req('reflect-metadata');
req(path.join(process.cwd(),'dist/src/app.module.js'));
const schedulers=[['owner-reports/owner-reports.scheduler.js','OwnerReportsSchedulerService'],
 ['billing/billing-scheduler.service.js','BillingSchedulerService'],
 ['appointment-notifications/appointment-notifications.scheduler.js','AppointmentNotificationsScheduler'],
 ['events/ingestion-retention.scheduler.js','IngestionRetentionScheduler'],
 ['crm/appointment-reconciliation.scheduler.js','AppointmentReconciliationScheduler'],
 ['operational-alerts/operational-alerts.scheduler.js','OperationalAlertsScheduler'],
 ['native-feedback/native-feedback.scheduler.js','NativeFeedbackScheduler'],
 ['team-communications/team-communications.scheduler.js','TeamCommunicationsScheduler'],
 ['expense-intake/expense-reminder.scheduler.js','ExpenseReminderScheduler']];
for(const[file,name]of schedulers){const value=req(path.join(process.cwd(),'dist/src',file))[name];assert.equal(typeof value?.prototype?.onModuleInit,'function');value.prototype.onModuleInit=function(){};}
