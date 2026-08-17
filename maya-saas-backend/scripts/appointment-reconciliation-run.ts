/**
 * Ручной прогон сверки зеркала визитов (Cycle 03 B3.3).
 *
 * 🔴 Планировщика нет намеренно. Сначала владелец видит поведение на
 * управляемых прогонах, и только потом обсуждается расписание: автоматика,
 * включённая до того как поведение доказано, ошибается молча и по кругу.
 *
 * 🔴 Планировщики глушатся ДО импорта Nest — тот же урок, что в наполнении
 * зеркала: полный контекст поднимает их все, а они по умолчанию включены. Один
 * прогон иначе разослал бы владельцу брифы, клиентам напоминания и провёл бы
 * биллинг.
 */
process.env.OWNER_REPORTS_SCHEDULER_ENABLED = 'false';
process.env.APPOINTMENT_REMINDERS_SCHEDULER_ENABLED = 'false';
process.env.BILLING_SCHEDULER_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { AppointmentReconciliationService } from '../src/crm/appointment-reconciliation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  // Стартовое окно из плана: ближний контур ±7 дней.
  const daysBack = Number(arg('days-back', '7'));
  const daysForward = Number(arg('days-forward', '7'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const tenantContext = app.get(TenantContextService);
    const reconciliation = app.get(AppointmentReconciliationService);

    const integrations = await prisma.crmIntegration.findMany({
      where: { status: 'active' },
      select: { tenantId: true, provider: true },
    });

    const now = Date.now();
    const from = new Date(now - daysBack * 24 * 60 * 60 * 1000);
    const to = new Date(now + daysForward * 24 * 60 * 60 * 1000);

    const report: unknown[] = [];
    for (const integration of integrations) {
      const eventsBefore = await prisma.domainEvent.count({
        where: { tenantId: integration.tenantId },
      });

      const result = await tenantContext.runAsSystemTenant(
        integration.tenantId,
        () =>
          reconciliation.run({
            tenantId: integration.tenantId,
            from,
            to,
          }),
      );

      const eventsAfter = await prisma.domainEvent.count({
        where: { tenantId: integration.tenantId },
      });
      const attendanceKnown = await prisma.appointment.count({
        where: { tenantId: integration.tenantId, attendance: { not: null } },
      });

      report.push({
        provider: integration.provider,
        domain_events_before: eventsBefore,
        domain_events_after: eventsAfter,
        appointments_with_known_attendance: attendanceKnown,
        ...result,
      });
    }

    // Ни одного поля с персональными данными: только счётчики и границы окна.
    console.log(JSON.stringify({ report }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
