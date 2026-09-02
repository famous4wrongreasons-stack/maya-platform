/**
 * Idempotent recovery of owner daily reports for explicitly named local dates.
 * The normal scheduler source event remains untouched for auditability.
 */
process.env.OWNER_REPORTS_SCHEDULER_ENABLED = 'false';
process.env.APPOINTMENT_REMINDERS_SCHEDULER_ENABLED = 'false';
process.env.BILLING_SCHEDULER_ENABLED = 'false';
process.env.CRM_RECONCILIATION_SCHEDULER_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { OwnerReportsService } from '../src/owner-reports/owner-reports.service';

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value?.trim()) throw new Error(`Missing required argument --${name}.`);
  return value.trim();
}

async function main(): Promise<void> {
  const tenantSlug = requiredArg('tenant');
  const dates = [
    ...new Set(
      requiredArg('dates')
        .split(',')
        .map((v) => v.trim()),
    ),
  ];
  const recoveryId = requiredArg('recovery-id');
  if (
    dates.length === 0 ||
    dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))
  ) {
    throw new Error(
      'Dates must be a comma-separated list in YYYY-MM-DD format.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const reports = app.get(OwnerReportsService);
    const tenant = (await reports.listEligibleTenants()).find(
      (candidate) => candidate.slug === tenantSlug,
    );
    if (!tenant) throw new Error('Eligible tenant was not found.');

    const results: Array<{ date: string; status: 'sent' | 'skipped' }> = [];
    for (const date of dates) {
      const status = await reports.recoverDailyReport(tenant, date, recoveryId);
      results.push({ date, status });
    }
    console.log(JSON.stringify({ tenant: tenant.slug, results }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unknown error.');
  process.exitCode = 1;
});
