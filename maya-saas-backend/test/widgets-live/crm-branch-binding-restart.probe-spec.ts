/** Actual HTTP/A17/PostgreSQL restart, with finite synthetic native CRM reads.
 * No live credentials, provider writes, model or notifications are admitted. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';

const nativeRequire = createRequire(__filename);
const stage = process.env.JEST_C9_OCCUPANCY_STAGE;
const receiptPath = process.env.JEST_C9_OCCUPANCY_RECEIPT!;
const reportPath = process.env.JEST_C9_OCCUPANCY_REPORT!;
assert.ok(
  ['prepare', 'resume'].includes(stage ?? '') && receiptPath && reportPath,
  'Use owned driver --branch-binding',
);
assertProofDatabase(process.env);
type Receipt = {
  tenantId: string;
  slug: string;
  email: string;
  password: string;
  branchId: string;
  foreignBranchId: string;
  day: string;
  readKey: string;
  clientId: string;
  originExecutionId: string;
};
const companyId = 424242;
const origin = 'https://synthetic-branch-binding.invalid';
const binding = (branchId: string) => ({
  contract: 'maya.crm-branch-binding/1',
  companyId,
  branchId,
});
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceFiles = [
  'src/ai-tools/ai-tool-handler.service.ts',
  'src/crm/crm-provider-settings.ts',
  'src/crm/crm-adapter.interface.ts',
  'src/crm/adapters/yclients-crm.adapter.ts',
  'src/crm/crm.service.ts',
  'src/crm/client-appointment-reschedule.service.ts',
  'src/package5-wave3/package5-wave3-canonical-cutover.service.ts',
  'src/package5-wave3/package5-wave3.service.ts',
  'src/action-engine/action-engine.kernel.ts',
  'src/action-engine/action-engine.runtime.ts',
  'src/ai-tools/ai-tool-runtime.service.ts',
  'src/appointments/appointments.service.ts',
  'scripts/c9-occupancy-proof.mjs',
  'test/widgets-live/crm-branch-binding-restart.probe-spec.ts',
];
describe('native explicit branch binding across HTTP/application/PG restart', () => {
  let db: FixtureContext, http: HttpHarness;
  let saved: Receipt;
  const providerReads: string[] = [],
    forbidden: string[] = [],
    checkpoints: string[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        assert.equal(provider, CrmProvider.YCLIENTS);
        assert.equal(config.apiToken, 'SYNTHETIC_BRANCH_USER');
        process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_BRANCH_PARTNER';
        try {
          return new YclientsCRMAdapter({
            ...config,
            baseUrl: origin + '/api/v1',
          });
        } finally {
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        forbidden.push('model');
        throw new Error('Model forbidden');
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (
        url.origin !== origin ||
        init?.method !== 'GET' ||
        init.body !== undefined
      ) {
        forbidden.push('external-or-write');
        throw new Error('Unexpected provider transport');
      }
      const route = url.pathname.replace('/api/v1/', '');
      providerReads.push(route);
      const company = {
        id: companyId,
        title: 'Synthetic salon',
        timezone_name: 'Europe/Moscow',
      };
      let data: unknown;
      if (route === 'companies') data = [company];
      else if (route === `company/${companyId}`) data = company;
      else if (route === `book_services/${companyId}`)
        data = {
          services: [
            {
              id: 81,
              title: 'Synthetic service',
              price_min: 1000,
              price_max: 1000,
              seance_length: 1800,
            },
          ],
        };
      else if (
        [
          `service_categories/${companyId}`,
          `company/${companyId}/staff`,
          `staff/${companyId}`,
          `book_staff/${companyId}`,
        ].includes(route)
      )
        data = [];
      else if (
        new RegExp(`^book_times/${companyId}/71/\\d{4}-\\d{2}-\\d{2}$`).test(
          route,
        )
      )
        data = [{ time: '10:00', seance_length: 1800 }];
      else {
        forbidden.push('unknown-provider-read');
        throw new Error('Unexpected synthetic read: ' + route);
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data }), { status: 200 }),
      );
    });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  const connect = (token: string, branchBinding: unknown) =>
    request(http.app.getHttpServer())
      .post('/api/integrations/crm/connect')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', randomUUID())
      .send({
        provider: 'yclients',
        apiToken: 'SYNTHETIC_BRANCH_USER',
        settingsJson: { companyId, branchBinding },
      });
  const slots = (
    token: string,
    key: string = randomUUID(),
    branchId = saved.branchId,
  ) =>
    http.executeTool(
      token,
      'booking.availability.read',
      {
        surface: 'web',
        arguments: {
          date: saved.day,
          staff_id: '71',
          service_ids: ['81'],
          branch_id: branchId,
        },
        idempotencyKey: key,
      },
      randomUUID(),
    );
  const assertSlots = (response: { status: number; body: unknown }) => {
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      result: {
        timezone: 'Europe/Moscow',
        slots: [
          { branch_id: saved.branchId, start: saved.day + 'T07:00:00.000Z' },
        ],
      },
    });
  };
  const kernel = () => {
    const { ActionEngineKernel } = nativeRequire(
      path.resolve('src/action-engine/action-engine.kernel'),
    ) as typeof import('../../src/action-engine/action-engine.kernel');
    return new ActionEngineKernel(db.prisma, {
      identitySecret: 'branch-proof-identity'.repeat(4),
      payloadEncryptionSecret: 'branch-proof-payload'.repeat(4),
      controlledFixtureMode: true,
    });
  };
  const finishSyntheticOrigin = async (executionId: string) => {
    const owner = kernel();
    const claim = await owner.claimExecution({
      tenantId: saved.tenantId,
      executionId,
      workerId: 'synthetic_origin_fixture',
    });
    const attempt = {
      tenantId: saved.tenantId,
      executionId,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
    };
    await owner.markDispatchMayHaveCrossed(attempt);
    await owner.markDispatchAcknowledged(attempt);
    await owner.finalizeSuccess({
      ...attempt,
      outcomeCode: 'synthetic_fixture_only',
      safeResult: { externalId: '501' },
    });
  };
  it('stages and activates explicit ownership, restores persisted binding, revokes cached reads and checks origin SQL', async () => {
    const { ACTION_EXECUTION_REQUEST_CONTRACT } = nativeRequire(
      path.resolve('src/action-engine/action-engine.contract'),
    ) as typeof import('../../src/action-engine/action-engine.contract');
    const { CLIENT_BOOKING_INTENT_CONTRACT } = nativeRequire(
      path.resolve('src/action-engine/client-booking-intent.contract'),
    ) as typeof import('../../src/action-engine/client-booking-intent.contract');
    const fx = fixturesForHttp(db, http);
    if (stage === 'prepare') {
      const tenant = await fx.tenant(
        'Synthetic binding tenant',
        CalendarSource.EXTERNAL,
      );
      const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
      for (const feature of [
        'ai.owner',
        'booking',
        'crm.integration',
        'widgets.runtime',
      ] as const)
        await fx.grantFeature(tenant, feature);
      await db.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          defaultTimezone: 'UTC',
          currentPeriodEnd: new Date('2099-01-01'),
        },
      });
      const branch = await db.prisma.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Synthetic bound branch',
          timezone: 'Europe/Moscow',
        },
      });
      const foreign = await fx.tenant('Synthetic foreign binding');
      const foreignBranch = await db.prisma.branch.create({
        data: { tenantId: foreign.id, name: 'Foreign' },
      });
      const client = await db.prisma.client.create({
        data: { tenantId: tenant.id },
        select: { id: true },
      });
      saved = {
        tenantId: tenant.id,
        slug: tenant.slug,
        email: owner.email,
        password: owner.password,
        branchId: branch.id,
        foreignBranchId: foreignBranch.id,
        day: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        readKey: randomUUID(),
        clientId: client.id,
        originExecutionId: '',
      };
      const token = await http.login(saved.slug, saved.email, saved.password);
      expect((await connect(token, binding(foreignBranch.id))).status).toBe(
        404,
      );
      expect(providerReads).toEqual([]);
      checkpoints.push('foreign binding refused before provider read');
      const staged = await connect(token, binding(branch.id));
      expect(staged.status).toBe(201);
      const pending = await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId: tenant.id },
      });
      expect(pending.status).toBe('pending_activation');
      expect(pending.settingsJson).toMatchObject({
        branchBinding: binding(branch.id),
      });
      checkpoints.push('A17 HTTP install persists exact pending binding');
      const activated = await request(http.app.getHttpServer())
        .post('/api/integrations/crm/activate')
        .set('Authorization', 'Bearer ' + token)
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(activated.status).toBe(201);
      expect(
        (
          await db.prisma.crmIntegration.findUniqueOrThrow({
            where: { tenantId: tenant.id },
          })
        ).status,
      ).toBe('active');
      // Activation imports company timezone; create an explicit differing tenant
      // fallback fixture so metadata must actually respect the selected branch.
      await db.prisma.tenant.update({
        where: { id: saved.tenantId },
        data: { defaultTimezone: 'UTC' },
      });
      expect(
        (
          await db.prisma.tenant.findUniqueOrThrow({
            where: { id: saved.tenantId },
          })
        ).defaultTimezone,
      ).toBe('UTC');
      expect(
        (
          await db.prisma.branch.findUniqueOrThrow({
            where: { id: saved.branchId },
          })
        ).timezone,
      ).toBe('Europe/Moscow');
      assertSlots(await slots(token, saved.readKey));
      checkpoints.push(
        'A17 activation and native branch availability at branch timezone',
      );
      // The current native source witness rejects an unbound/foreign branch before
      // the later availability owner. A17 foreign binding above still returns 404.
      const readsBeforeForeign = providerReads.length;
      const foreignSlots = await slots(token, randomUUID(), foreignBranch.id);
      expect(foreignSlots.status).toBe(503);
      expect(foreignSlots.body).toMatchObject({
        error: { code: 'booking_branch_source_unavailable' },
      });
      expect(providerReads).toHaveLength(readsBeforeForeign);
      // Synthetic pre-existing SUCCEEDED create is a fixture, not a provider booking.
      const execution = await kernel().createExecutionForControlledFixture({
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: tenant.id,
        capability: 'crm.appointment.create.v1',
        source: {
          type: 'authenticated_request',
          sourceRef: 'synthetic-link',
          occurrenceScope: 'appointment-mutation:crm.appointment.create.v1:v1',
        },
        targetRef: 'create/source-proof',
        evidenceRefs: [],
        callerIdempotency: {
          scope: 'appointments.client.create.v1',
          key: randomUUID(),
        },
        bookingIntent: {
          contract: CLIENT_BOOKING_INTENT_CONTRACT,
          calendarTarget: {
            source: 'external',
            provider: 'yclients',
            companyId: String(companyId),
          },
          timezone: 'Europe/Moscow',
        },
        input: {
          clientId: client.id,
          clientName: 'Synthetic Client',
          clientPhone: '+79990000001',
          branchId: branch.id,
          staffId: '71',
          serviceIds: ['81'],
          start: saved.day + 'T07:00:00.000Z',
          creationMode: 'client',
          allowBusy: false,
          notifyBySmsHours: 0,
        },
      });
      saved.originExecutionId = execution.id;
      await finishSyntheticOrigin(execution.id);
      expect(
        await kernel().readClientAppointmentOrigin(
          saved.tenantId,
          saved.clientId,
          '501',
        ),
      ).toEqual({
        calendarTarget: {
          source: 'external',
          provider: 'yclients',
          companyId: String(companyId),
        },
        branchId: saved.branchId,
      });
      await expect(
        kernel().readClientAppointmentOrigin(
          saved.tenantId,
          saved.clientId,
          'missing',
        ),
      ).rejects.toThrow();
      checkpoints.push(
        'actual PG bounded immutable origin lookup succeeds and refuses absent source',
      );
      writeFileSync(receiptPath, JSON.stringify(saved), { mode: 0o600 });
    } else {
      saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt;
      const token = await http.login(saved.slug, saved.email, saved.password);
      const row = await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId: saved.tenantId },
      });
      expect(row.status).toBe('active');
      expect(row.settingsJson).toMatchObject({
        branchBinding: binding(saved.branchId),
      });
      expect(
        (
          await db.prisma.tenant.findUniqueOrThrow({
            where: { id: saved.tenantId },
          })
        ).defaultTimezone,
      ).toBe('UTC');
      expect(
        (
          await db.prisma.branch.findUniqueOrThrow({
            where: { id: saved.branchId },
          })
        ).timezone,
      ).toBe('Europe/Moscow');
      assertSlots(await slots(token, saved.readKey));
      expect(providerReads).toEqual([]);
      assertSlots(await slots(token));
      checkpoints.push(
        'fresh app and PG restart restore binding and exact cached READ',
      );
      const source = await kernel().readClientAppointmentOrigin(
        saved.tenantId,
        saved.clientId,
        '501',
      );
      expect(source.branchId).toBe(saved.branchId);
      await expect(
        kernel().readClientAppointmentOrigin(
          saved.tenantId,
          'foreign-client',
          '501',
        ),
      ).rejects.toThrow();
      const second = await kernel().createExecutionForControlledFixture({
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: saved.tenantId,
        capability: 'crm.appointment.create.v1',
        source: {
          type: 'authenticated_request',
          sourceRef: 'synthetic-link',
          occurrenceScope: 'appointment-mutation:crm.appointment.create.v1:v1',
        },
        targetRef: 'create/second-source-proof',
        evidenceRefs: [],
        callerIdempotency: {
          scope: 'appointments.client.create.v1',
          key: randomUUID(),
        },
        bookingIntent: {
          contract: CLIENT_BOOKING_INTENT_CONTRACT,
          calendarTarget: {
            source: 'external',
            provider: 'yclients',
            companyId: String(companyId),
          },
          timezone: 'Europe/Moscow',
        },
        input: {
          ...(await kernel().readTrustedNormalizedInput(
            saved.tenantId,
            saved.originExecutionId,
          )),
          start: saved.day + 'T08:00:00.000Z',
        },
      });
      await finishSyntheticOrigin(second.id);
      await expect(
        kernel().readClientAppointmentOrigin(
          saved.tenantId,
          saved.clientId,
          '501',
        ),
      ).rejects.toThrow();
      checkpoints.push(
        'actual PG origin lookup refuses foreign client and two matching SUCCEEDED fixtures',
      );
      expect((await connect(token, null)).status).toBe(201);
      expect((await slots(token, saved.readKey)).status).toBe(409);
      const activated = await request(http.app.getHttpServer())
        .post('/api/integrations/crm/activate')
        .set('Authorization', 'Bearer ' + token)
        .set('Idempotency-Key', randomUUID())
        .send({});
      expect(activated.status).toBe(201);
      const removed = await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId: saved.tenantId },
      });
      expect(removed.status).toBe('active');
      expect(removed.settingsJson).toMatchObject({ branchBinding: null });
      const reads = providerReads.length;
      const unavailable = await slots(token);
      expect(unavailable.status).toBe(503);
      expect(unavailable.body).toMatchObject({
        error: { code: 'booking_branch_source_unavailable' },
      });
      expect(providerReads).toHaveLength(reads);
      checkpoints.push(
        'explicit binding removal invalidates persisted READ and prevents native read',
      );
    }
    expect(forbidden).toEqual([]);
    const actions = await db.prisma.actionExecution.findMany({
      where: { tenantId: saved.tenantId },
      select: { capability: true, state: true },
    });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          contract: 'maya.crm-branch-binding-http-pg-proof/1',
          stage,
          candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
          }).trim(),
          sourceHashes: Object.fromEntries(
            sourceFiles.map((file) => [
              file,
              createHash('sha256').update(readFileSync(file)).digest('hex'),
            ]),
          ),
          checkpoints,
          branchBindingHash: digest(binding(saved.branchId)),
          actions,
          providerReadCount: providerReads.length,
          providerWrites: 0,
          modelCalls: 0,
          externalCalls: 0,
          forbidden,
          qualification:
            'LOCAL_SYNTHETIC_NATIVE_ADAPTER_ONLY; canonical origin fixture is not a provider booking; no live acceptance',
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  });
});
