/**
 * Наполнение зеркала визитов реальными записями CRM.
 *
 * 🔴 Планировщики глушатся ДО импорта Nest — по той же причине, что и в
 * backfill идентичности мастера: полный контекст поднимает их все, а они по
 * умолчанию включены. Один прогон скрипта иначе разослал бы владельцу брифы,
 * клиентам напоминания и провёл бы биллинг.
 */
process.env.OWNER_REPORTS_SCHEDULER_ENABLED = 'false';
process.env.APPOINTMENT_REMINDERS_SCHEDULER_ENABLED = 'false';
process.env.BILLING_SCHEDULER_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { AppointmentMirrorService } from '../src/crm/appointment-mirror.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const daysBack = Number(arg('days-back', '90'));
  const daysForward = Number(arg('days-forward', '31'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const tenantContext = app.get(TenantContextService);
    const mirror = app.get(AppointmentMirrorService);

    const integrations = await prisma.crmIntegration.findMany({
      where: { status: 'active' },
      select: { tenantId: true, provider: true },
    });

    const now = Date.now();
    const from = new Date(now - daysBack * 24 * 60 * 60 * 1000);
    const to = new Date(now + daysForward * 24 * 60 * 60 * 1000);

    const report: unknown[] = [];
    for (const integration of integrations) {
      /**
       * 🔴 После B3.3 повторное НАПОЛНЕНИЕ стало опасным, хотя до неё было
       * безобидным.
       *
       * Наполнение пишет зеркало и НЕ выпускает событий — это его смысл: первый
       * взгляд на работающий салон историей не является. Но с появлением
       * компаратора у зеркала есть второй писатель, который события выпускает.
       * Прогнав наполнение поверх уже наблюдаемого арендатора, мы бы молча
       * перезаписали состояние и потеряли переходы навсегда: следующая сверка
       * сравнила бы новое состояние с новым и не увидела разницы.
       *
       * Поэтому после установленной базовой линии наполнение работает только
       * как сухой прогон. Поддержание зеркала — работа сверки.
       */
      const watching = await prisma.crmIntegration.findUnique({
        where: { tenantId: integration.tenantId },
        select: { watchStartedAt: true },
      });

      if (apply && watching?.watchStartedAt) {
        report.push({
          provider: integration.provider,
          skipped: 'baseline_already_established',
          reason:
            'наполнение не выпускает событий; после базовой линии зеркало ' +
            'поддерживает сверка, иначе переходы теряются',
          watch_started_at: watching.watchStartedAt.toISOString(),
        });
        continue;
      }

      const before = await prisma.appointment.count({
        where: { tenantId: integration.tenantId },
      });

      const result = await tenantContext.runAsSystemTenant(
        integration.tenantId,
        () =>
          mirror.bootstrap({
            tenantId: integration.tenantId,
            from,
            to,
            apply,
          }),
      );

      const after = await prisma.appointment.count({
        where: { tenantId: integration.tenantId },
      });
      const events = await prisma.domainEvent.count({
        where: { tenantId: integration.tenantId },
      });

      report.push({
        provider: integration.provider,
        appointments_before: before,
        appointments_after: after,
        domain_events_total: events,
        ...result,
      });
    }

    // Ни одного поля с персональными данными: только счётчики и границы окна.
    console.log(JSON.stringify({ apply, report }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
