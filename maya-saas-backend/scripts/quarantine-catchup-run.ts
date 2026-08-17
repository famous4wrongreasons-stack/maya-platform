/**
 * Адресный догон по карантину (Cycle 03 B3.4).
 *
 * Перечитывает доставки, которые Maya поняла, но не смогла применить — чаще
 * всего потому, что записи ещё не было в зеркале. Регулярная сверка их не
 * подберёт: она смотрит окно по времени, а такие записи могут быть где угодно.
 *
 * 🔴 Планировщики глушатся ДО импорта Nest — тот же урок, что в остальных
 * скриптах: полный контекст поднимает их все, а они по умолчанию включены.
 */
process.env.OWNER_REPORTS_SCHEDULER_ENABLED = 'false';
process.env.APPOINTMENT_REMINDERS_SCHEDULER_ENABLED = 'false';
process.env.BILLING_SCHEDULER_ENABLED = 'false';
process.env.CRM_RECONCILIATION_SCHEDULER_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { QuarantineCatchupService } from '../src/crm/quarantine-catchup.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  const limit = Number(arg('limit', '100'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const tenantContext = app.get(TenantContextService);
    const catchup = app.get(QuarantineCatchupService);

    const integrations = await prisma.crmIntegration.findMany({
      where: { status: 'active' },
      select: { tenantId: true, provider: true },
    });

    const report: unknown[] = [];
    for (const integration of integrations) {
      const eventsBefore = await prisma.domainEvent.count({
        where: { tenantId: integration.tenantId },
      });

      const result = await tenantContext.runAsSystemTenant(
        integration.tenantId,
        () =>
          catchup.run({
            tenantId: integration.tenantId,
            provider: integration.provider,
            limit,
          }),
      );

      const eventsAfter = await prisma.domainEvent.count({
        where: { tenantId: integration.tenantId },
      });
      const stillOpen = await prisma.ingestionQuarantine.count({
        where: { tenantId: integration.tenantId, resolution: 'open' },
      });

      report.push({
        domain_events_before: eventsBefore,
        domain_events_after: eventsAfter,
        quarantine_still_open: stillOpen,
        ...result,
      });
    }

    // Ни одного поля с персональными данными: только счётчики и исходы.
    console.log(JSON.stringify({ report }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
