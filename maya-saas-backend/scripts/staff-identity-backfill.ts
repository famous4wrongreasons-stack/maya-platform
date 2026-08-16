import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { CrmService } from '../src/crm/crm.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

/**
 * Cycle 02 · STAFF IDENTITY · PHASE A — перенос идентичности мастеров.
 *
 * 🔴 Почему это скрипт приложения, а не SQL. Имя мастера обязано лежать
 * зашифрованным: `InternalProvider.displayName` хранится ОТКРЫТЫМ текстом, а
 * `CrmStaffAccess.encryptedDisplayName` — зашифрованным. Понижать планку до
 * открытого текста нельзя даже временно, а шифровать средствами Postgres нечем:
 * ключ у приложения. Плюс мастеров, которых нет в таблице доступа, приходится
 * искать в СОСТАВЕ КОМАНДЫ провайдера — это сетевой вызов.
 *
 * Что скрипт НЕ делает:
 *   * не пишет ни одной колонки наследия (`externalStaffId`, `staffExternalId`);
 *   * не удаляет `InternalProvider`;
 *   * не ставит NOT NULL;
 *   * не трогает авторизацию, сессии и уведомления;
 *   * не выдумывает имя по догадке.
 *
 * По умолчанию — сухой прогон. Запись только по явному `--apply`.
 */

interface Options {
  apply: boolean;
  tenantId: string | null;
  help: boolean;
}

interface Report {
  tenant: string;
  staffFromInternal: number;
  staffFromAccess: number;
  staffFromTeam: number;
  staffTechnical: number;
  linksCreated: number;
  grantsLinked: number;
  appointmentsInternal: number;
  appointmentsExternal: number;
  appointmentsUnresolved: number;
  namesEncrypted: number;
  warnings: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, tenantId: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--tenant') options.tenantId = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

const HELP = `
staff-identity-backfill — перенос идентичности мастеров (Cycle 02, фаза A)

  --apply           выполнить запись (без него — только отчёт)
  --tenant <id>     ограничить одним арендатором
  --help            эта справка

Идемпотентен: повторный запуск не создаёт дублей.
`;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const encryption = app.get(EncryptionService);
  const crm = app.get(CrmService);
  const tenantContext = app.get(TenantContextService);

  const tenants = await prisma.tenant.findMany({
    where: options.tenantId ? { id: options.tenantId } : {},
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });

  const reports: Report[] = [];

  for (const tenant of tenants) {
    const report: Report = {
      tenant: tenant.slug,
      staffFromInternal: 0,
      staffFromAccess: 0,
      staffFromTeam: 0,
      staffTechnical: 0,
      linksCreated: 0,
      grantsLinked: 0,
      appointmentsInternal: 0,
      appointmentsExternal: 0,
      appointmentsUnresolved: 0,
      namesEncrypted: 0,
      warnings: [],
    };

    const integration = await prisma.crmIntegration.findUnique({
      where: { tenantId: tenant.id },
      select: { provider: true },
    });

    // ── 1. Внутренние мастера: id СОХРАНЯЕТСЯ ────────────────────────────────
    //
    // 🔴 Это и делает перенос визитов тождественным: Appointment.staffExternalId
    // у внутренних записей уже содержит InternalProvider.id, а значит после
    // сохранения id становится валидным Staff.id без всякого сопоставления.
    const internals = await prisma.internalProvider.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        userId: true,
        branchId: true,
        displayName: true,
        title: true,
        specialization: true,
        avatarUrl: true,
        active: true,
        slotIntervalMinutes: true,
        createdAt: true,
      },
    });

    for (const provider of internals) {
      const existing = await prisma.staff.findUnique({
        where: { id: provider.id },
        select: { id: true, encryptedDisplayName: true },
      });

      if (!existing) {
        if (options.apply) {
          await prisma.staff.create({
            data: {
              id: provider.id, // ← дословно
              tenantId: tenant.id,
              userId: provider.userId,
              branchId: provider.branchId,
              encryptedDisplayName: encryption.encrypt(provider.displayName),
              title: provider.title,
              specialization: provider.specialization,
              avatarUrl: provider.avatarUrl,
              active: provider.active,
              slotIntervalMinutes: provider.slotIntervalMinutes,
              createdAt: provider.createdAt,
            },
          });
        }
        report.staffFromInternal += 1;
        report.namesEncrypted += 1;
      } else if (!existing.encryptedDisplayName) {
        // Догоняем имя, если строка создана прошлым прогоном до шифрования.
        if (options.apply) {
          await prisma.staff.update({
            where: { id: provider.id },
            data: {
              encryptedDisplayName: encryption.encrypt(provider.displayName),
            },
          });
        }
        report.namesEncrypted += 1;
      }
    }

    // ── 2. Мастера из таблицы доступа ────────────────────────────────────────
    const accesses = await prisma.crmStaffAccess.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        externalStaffId: true,
        userId: true,
        encryptedDisplayName: true,
        title: true,
        status: true,
        staffId: true,
        createdAt: true,
      },
    });

    if (accesses.length > 0 && !integration) {
      // Провайдера взять неоткуда, а подставить 'yclients' наугад значит
      // соврать в ключе связи. Останавливаемся на этом арендаторе.
      report.warnings.push(
        `строк доступа ${accesses.length}, но CrmIntegration отсутствует — связи не создаются`,
      );
      reports.push(report);
      continue;
    }

    const provider = integration?.provider ?? null;
    const plannedExternalIds = new Set<string>();

    for (const access of accesses) {
      if (access.staffId) continue; // уже перенесён

      // §12 гейта: тот же человек мог приехать из InternalProvider.
      // Побеждает строка внутреннего мастера — её id уже стоит в визитах.
      let staffId: string | null = null;
      if (access.userId) {
        const byUser = await prisma.staff.findFirst({
          where: { tenantId: tenant.id, userId: access.userId },
          select: { id: true },
        });
        staffId = byUser?.id ?? null;
      }

      if (!staffId) {
        if (options.apply) {
          const created = await prisma.staff.create({
            data: {
              tenantId: tenant.id,
              userId: access.userId,
              encryptedDisplayName: access.encryptedDisplayName, // уже шифр
              title: access.title,
              active: access.status !== 'disabled',
              createdAt: access.createdAt,
            },
            select: { id: true },
          });
          staffId = created.id;
        }
        report.staffFromAccess += 1;
      }

      if (options.apply && staffId && provider) {
        await prisma.staffProviderLink.upsert({
          where: {
            tenantId_provider_externalId: {
              tenantId: tenant.id,
              provider,
              externalId: access.externalStaffId,
            },
          },
          create: {
            tenantId: tenant.id,
            staffId,
            provider,
            externalId: access.externalStaffId,
          },
          update: { syncedAt: new Date() },
        });
        await prisma.crmStaffAccess.update({
          where: { id: access.id },
          data: { staffId },
        });
      }
      plannedExternalIds.add(access.externalStaffId);
      report.linksCreated += 1;
      report.grantsLinked += 1;
    }

    // ── 3. Мастера, ведущие визиты, но без строки доступа ────────────────────
    //
    // §9 гейта: имя берём из СОСТАВА КОМАНДЫ провайдера. Если провайдер
    // недоступен — техническая неактивная идентичность. Догадки по имени
    // запрещены, потерять визит нельзя.
    const orphanRows = await prisma.$queryRaw<
      Array<{ staffExternalId: string }>
    >`
      SELECT DISTINCT a."staffExternalId"
      FROM "Appointment" a
      WHERE a."tenantId" = ${tenant.id}
        AND a.source = 'external'
        AND a."staffId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "StaffProviderLink" l
          WHERE l."tenantId" = a."tenantId"
            AND l.provider = ${provider ?? ''}
            AND l."externalId" = a."staffExternalId"
        )
    `;

    // 🔴 В сухом прогоне связи шага 2 ещё не записаны, поэтому их надо учесть
    // здесь — иначе отчёт завышает число «технических» идентичностей и вводит
    // в заблуждение ровно там, где решение принимает человек.
    const orphans = orphanRows.filter(
      (row) => !plannedExternalIds.has(row.staffExternalId),
    );

    if (orphans.length > 0 && provider) {
      let team: Array<{ id: string; name: string; title?: string }> = [];
      try {
        // 🔴 CrmService требует контекста арендатора (assertTenantId).
        // Без обёртки вызов падает ВСЕГДА, и каждая идентичность становится
        // технической — то есть скрипт молча делает худшее из возможного.
        team = await tenantContext.runAsSystemTenant(tenant.id, () =>
          crm.getTeamMembers(tenant.id),
        );
      } catch (error) {
        report.warnings.push(
          `состав команды недоступен (${
            error instanceof Error ? error.message : 'неизвестно'
          }) — идентичности будут техническими`,
        );
      }
      const teamById = new Map(team.map((m) => [String(m.id), m]));

      for (const row of orphans) {
        const member = teamById.get(row.staffExternalId);
        const technical = !member;
        const displayName = member
          ? member.name
          : `Мастер ${provider}#${row.staffExternalId}`;

        if (options.apply) {
          const created = await prisma.staff.create({
            data: {
              tenantId: tenant.id,
              encryptedDisplayName: encryption.encrypt(displayName),
              title: member?.title ?? null,
              active: !technical,
            },
            select: { id: true },
          });
          await prisma.staffProviderLink.create({
            data: {
              tenantId: tenant.id,
              staffId: created.id,
              provider,
              externalId: row.staffExternalId,
              unlinkedAt: technical ? new Date() : null,
            },
          });
        }

        if (technical) report.staffTechnical += 1;
        else report.staffFromTeam += 1;
        report.linksCreated += 1;
        report.namesEncrypted += 1;
      }
    } else if (orphans.length > 0) {
      report.warnings.push(
        `${orphans.length} мастеров визитов без связи, но провайдера нет`,
      );
    }

    // ── 4. Визиты ────────────────────────────────────────────────────────────
    if (options.apply) {
      const internalUpdated = await prisma.$executeRaw`
        UPDATE "Appointment" a SET "staffId" = a."staffExternalId"
        WHERE a."tenantId" = ${tenant.id} AND a.source = 'internal' AND a."staffId" IS NULL
          AND EXISTS (SELECT 1 FROM "Staff" s
                      WHERE s.id = a."staffExternalId" AND s."tenantId" = a."tenantId")
      `;
      const externalUpdated = await prisma.$executeRaw`
        UPDATE "Appointment" a SET "staffId" = l."staffId"
        FROM "StaffProviderLink" l
        WHERE l."tenantId" = a."tenantId" AND l."externalId" = a."staffExternalId"
          AND a."tenantId" = ${tenant.id} AND a.source = 'external' AND a."staffId" IS NULL
      `;
      report.appointmentsInternal = internalUpdated;
      report.appointmentsExternal = externalUpdated;
    }

    report.appointmentsUnresolved = await prisma.appointment.count({
      where: { tenantId: tenant.id, staffId: null },
    });

    reports.push(report);
  }

  await app.close();

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? 'apply' : 'dry-run',
        tenants: reports,
        // 🔴 Гейт: после применения незакрытых визитов быть не должно.
        ok:
          !options.apply ||
          reports.every((r) => r.appointmentsUnresolved === 0),
      },
      null,
      2,
    ),
  );

  if (
    options.apply &&
    reports.some((report) => report.appointmentsUnresolved > 0)
  ) {
    throw new Error('backfill: остались визиты без идентичности мастера Maya');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
