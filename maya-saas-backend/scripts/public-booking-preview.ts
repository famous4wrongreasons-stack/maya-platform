import { CrmOutcomeUnknownError } from '../src/crm/crm-request.errors';
import type { CreatedAppointment } from '../src/crm/crm-adapter.interface';
/** Local synthetic CRM preview only. No inherited credentials or outbound fetch. */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { applyWidgetsLiveEnvironment } from '../test/widgets-live/support/environment';
import { bootFixtureContext } from '../test/widgets-live/support/bootstrap';
import { Fixtures } from '../test/widgets-live/support/fixtures';
import { CalendarSource } from '../src/common/domain.enums';
import { CrmAdapterFactory } from '../src/crm/crm-adapter.factory';
import { EncryptionService } from '../src/encryption/encryption.service';
import { configureHttpApp } from '../src/bootstrap/configure-http-app';

async function main() {
  const origin = process.argv[2];
  const loseFirstReply = process.argv[3] === '--lose-first-reply';
  if (
    !origin ||
    !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ||
    !(
      process.argv.length === 3 ||
      (process.argv.length === 4 && loseFirstReply)
    )
  )
    throw new Error('Explicit loopback website origin required');
  applyWidgetsLiveEnvironment();
  global.fetch = () =>
    Promise.reject(new Error('Synthetic guest preview forbids outbound fetch'));
  const { AppModule } =
    (await import('../src/app.module')) as typeof import('../src/app.module');
  let branchId = '';
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = `${date}T12:00:00+03:00`,
    end = `${date}T12:30:00+03:00`;
  let dispatches = 0;
  const records = new Map<string, CreatedAppointment>();
  const adapter = {
    getStaff: () => Promise.resolve([{ id: '101', name: 'Тестовый мастер' }]),
    getPublicBookingServices: () =>
      Promise.resolve([
        {
          id: '201',
          name: 'Тестовая стрижка',
          duration_minutes: 30,
          price: 1500,
          currency: 'RUB',
        },
      ]),
    getAvailableSlots: (p: { date: string }) =>
      Promise.resolve(
        p.date === date
          ? [{ start, end, staff_id: '101', branch_id: branchId }]
          : [],
      ),
    createAppointment: (input: { providerRequestId: string }) => {
      dispatches++;
      const record = {
        external_id: `synthetic-${dispatches}`,
        start,
        end,
        staff_id: '101',
        service_ids: ['201'],
        status: 'confirmed',
        branch_id: branchId,
      };
      records.set(input.providerRequestId, record);
      if (loseFirstReply && dispatches === 1)
        return Promise.reject(
          new CrmOutcomeUnknownError(
            'Synthetic lost reply after record persisted',
          ),
        );
      return Promise.resolve(record);
    },
    findPublicBookingByRequestId: (input: { requestId: string }) =>
      Promise.resolve(records.get(input.requestId) ?? null),
    getClientAppointments: () =>
      Promise.reject(
        new Error('Guest reconciliation must not search by phone'),
      ),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CrmAdapterFactory)
    .useValue({ create: () => adapter })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureHttpApp(app);
  await app.init();
  const db = await bootFixtureContext();
  const fixtures = new Fixtures(db, null);
  const tenant = await fixtures.tenant(
    'guest-browser-preview',
    CalendarSource.EXTERNAL,
  );
  branchId = (
    await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Тестовый филиал',
        timezone: 'Europe/Moscow',
      },
    })
  ).id;
  await db.prisma.tenant.update({
    where: { id: tenant.id },
    data: { defaultTimezone: 'Europe/Moscow' },
  });
  await db.prisma.brandingSettings.create({
    data: { tenantId: tenant.id, themeJson: { booking: { mode: 'live' } } },
  });
  await db.prisma.crmIntegration.create({
    data: {
      tenantId: tenant.id,
      provider: 'yclients',
      status: 'active',
      encryptedApiToken: app
        .get(EncryptionService)
        .encrypt('synthetic-only-no-credential'),
      settingsJson: { companyId: 123 },
    },
  });
  for (const feature of [
    'booking',
    'booking.public',
    'crm.integration',
  ] as const)
    await fixtures.grantFeature(tenant, feature);
  app.get(ConfigService).set(
    'PUBLIC_BOOKING_SITES',
    JSON.stringify([
      {
        siteKey: 'proof-site',
        tenantId: tenant.id,
        branchId,
        origins: [origin],
        consentVersion: 'proof-v1',
        consentUrl: '/privacy',
      },
    ]),
  );
  await app.listen(0, '127.0.0.1');
  process.stdout.write(
    JSON.stringify({
      mode: 'synthetic_crm_only',
      loseFirstReply,
      baseURL: await app.getUrl(),
      siteKey: 'proof-site',
      websiteOrigin: origin,
      availableDate: date,
      lifetimeMinutes: 30,
    }) + '\n',
  );
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 30 * 60_000);
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });
  await app.close();
  await db.prisma.$executeRaw(
    Prisma.sql`DELETE FROM "PublicBookingAttempt" WHERE "tenantId"=${tenant.id}`,
  );
  await db.prisma.$executeRaw(
    Prisma.sql`DELETE FROM "PublicBookingQuote" WHERE "tenantId"=${tenant.id}`,
  );
  await db.prisma.$executeRaw(
    Prisma.sql`DELETE FROM "PublicBookingSession" WHERE "tenantId"=${tenant.id}`,
  );
  await fixtures.teardown();
  await db.close();
  process.stdout.write(
    JSON.stringify({ stopped: true, syntheticDispatches: dispatches }) + '\n',
  );
}
main().catch(() => {
  process.stderr.write('guest_preview_failed\n');
  process.exitCode = 1;
});
