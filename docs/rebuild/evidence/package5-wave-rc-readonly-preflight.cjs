// Run from the current release with its existing environment. SELECT-only;
// no Nest application bootstrap, session, scheduler or business command.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const req = createRequire(path.join(process.cwd(), 'package.json'));
const { Client } = req('pg');
const names = ['OperationalAlertRun', 'NativeFeedbackRequest', 'NativeFeedbackRevision',
  'PublicCommunityComment', 'PublicCommunityInteraction', 'TenantBusinessConfigurationRevision',
  'TeamMessage', 'TeamAttachment', 'ExpenseReminderRun', 'ExpenseIntakeBinding', 'CashDeclaration'];
(async () => {
  assert.equal(fs.realpathSync('/opt/maya-saas/current'),
    '/opt/maya-saas/releases/20260908-a18-security-consent-0867ecea');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let result;
  try {
    await db.query('BEGIN READ ONLY');
    const migrations = (await db.query('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY migration_name')).rows;
    const pending = migrations.filter(m => !m.finished && !m.rolled_back);
    assert.equal(pending.length, 0);
    const tables = (await db.query('SELECT tablename FROM pg_tables WHERE schemaname=\'public\' AND tablename = ANY($1)', [names])).rows;
    assert.equal(tables.length, 0, 'Unexpected R-C production tables: scope reconciliation required');
    const reportRows = (await db.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT ("reportType"=\'daily_report\' AND "reportVersion"=1 AND "expiresAt">"admittedAt" AND "payloadRetentionUntil"="admittedAt"+interval \'7 days\' AND "auditRetentionUntil"="admittedAt"+interval \'365 days\'))::int AS incompatible FROM "OwnerReportRun"')).rows[0];
    assert.equal(reportRows.incompatible, 0);
    const security = (await db.query('SELECT count(*)::int AS invalidations FROM "ClientConsentInvalidation"')).rows[0];
    const boundReports = (await db.query('SELECT count(*)::int AS count FROM "ActionExecution" WHERE "ownerReportRunId" IS NOT NULL')).rows[0].count;
    await db.query('ROLLBACK');
    const uploadRoot = process.env.UPLOAD_ROOT?.trim() || path.join(process.cwd(), 'uploads');
    const privateRoot = path.resolve(uploadRoot, '..', 'team-private');
    const metadata = p => fs.existsSync(p) ? (() => { const s=fs.lstatSync(p); return {exists:true, directory:s.isDirectory(), symlink:s.isSymbolicLink(), mode:(s.mode&0o777).toString(8), uid:s.uid,gid:s.gid}; })() : {exists:false};
    let ffprobe=false;
    try { ffprobe=execFileSync('ffprobe',['-version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).startsWith('ffprobe version'); } catch {}
    result = {status:'PASS', release:path.basename(process.cwd()), migrations,
      newRCTables:tables.length, reportRows, boundReports, security,
      media:{privateRoot,parent:metadata(path.dirname(privateRoot)),root:metadata(privateRoot),ffprobe},
      existingActivation:{operationalCutoverConfigured:!!process.env.OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT,
        expenseReminderScheduler:process.env.EXPENSE_REMINDERS_CANONICAL_ENABLED==='true'},
      productionBusinessWrites:0, productionMessages:0, productionProviderEffects:0};
  } finally { await db.end(); }
  console.log(JSON.stringify(result));
})().catch(() => { console.error('R-C read-only preflight failed; no production mutation attempted.'); process.exitCode=1; });
