/** Actual guarded HTTP + PG/process restart; native YclientsCRMAdapter with
 * finite in-process synthetic transport. No real provider/model acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';
import type { Fixtures } from './support/fixtures';
import { firstSlot, object, submit } from './support/release-booking-flow';

const stage = process.env.JEST_BRANCH_BOOKING_STAGE;
const receiptPath = process.env.JEST_BRANCH_BOOKING_RECEIPT!;
const reportPath = process.env.JEST_BRANCH_BOOKING_REPORT!;
assert.ok(
  ['prepare', 'resume', 'browser'].includes(stage ?? '') &&
    receiptPath &&
    reportPath,
  'Use branch-booking-selector-proof.mjs',
);
assertProofDatabase();
type Scenario = {
  key: string;
  tenantId: string;
  slug: string;
  email: string;
  password: string;
  branchId: string;
  otherBranchId: string;
  companyId: number;
  day: string;
  clientId: string;
  linkId: string;
  userId: string;
  confirmation?: Record<string, unknown>;
  mode?: 'typed' | 'personal';
  expectedSelection?: {
    branchId: string;
    staffId: string;
    serviceIds: string[];
    start: string;
  };
};
type Receipt = {
  scenarios: Scenario[];
  preparePid: number;
  preparePgStart: string;
};
const origin = 'https://synthetic-branch-selector.invalid';
const binding = (s: Scenario, branchId = s.branchId) => ({
  contract: 'maya.crm-branch-binding/1',
  companyId: s.companyId,
  branchId,
});
const settings = (s: Scenario, branchId?: string) => ({
  companyId: s.companyId,
  currency: 'RUB',
  branchBinding: binding(s, branchId),
});
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

describe('Branch-preserving native booking selector [SYNTHETIC PROVIDER / ACTUAL HTTP PG]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, receipt: Receipt;
  const reads: string[] = [],
    posts: number[] = [],
    forbidden: string[] = [],
    checkpoints: string[] = [];
  const observations: Record<string, unknown> = {
    stage,
    realProviderAcceptance: false,
    realModelAcceptance: false,
    qualification: 'NOT_ISSUED',
    transport: 'FINITE_IN_PROCESS_SYNTHETIC_NATIVE_YCLIENTS',
    modelCalls: 0,
  };
  const scenarios: Scenario[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    if (stage !== 'resume') {
      // Test-only provider ledger in the freshly owned proof DB; no product migration.
      await db.prisma.$executeRawUnsafe(
        'CREATE TABLE branch_selector_synthetic_posts (id bigserial primary key, company_id integer not null, payload jsonb not null)',
      );
    } else {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt;
      scenarios.push(...receipt.scenarios);
    }
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        assert.equal(provider, CrmProvider.YCLIENTS);
        assert.equal(config.apiToken, 'SYNTHETIC_BRANCH_SELECTOR_USER');
        process.env.YCLIENTS_PARTNER_TOKEN =
          'SYNTHETIC_BRANCH_SELECTOR_PARTNER';
        try {
          return new YclientsCRMAdapter({
            ...config,
            baseUrl: origin + '/api/v1',
          });
        } finally {
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      });
    const config = http.app.get(ConfigService);
    if (stage === 'browser') {
      config.set('EMAIL_LOGIN_ENABLED', 'true');
      config.set('EMAIL_AUTH_PROVIDER', 'debug');
    }
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        if (stage !== 'browser') {
          forbidden.push('model');
          throw new Error('Model forbidden');
        }
        const s = scenarios.find(
          (row) =>
            row.tenantId ===
            http.app.get(TenantContextService).requireTenantId(),
        );
        assert.ok(s?.mode, 'Known synthetic browser actor required');
        const calls = Number(observations.scriptedModelCalls ?? 0) + 1;
        assert.ok(calls <= 24, 'Synthetic model bounded');
        observations.scriptedModelCalls = calls;
        return Promise.resolve({
          reply: input.toolResults.length ? 'Выберите время для записи.' : '',
          toolCall: input.toolResults.length
            ? null
            : s.mode === 'typed'
              ? {
                  name: 'booking.availability.read',
                  arguments: {
                    date: s.day,
                    staff_id: '71',
                    service_ids: ['81'],
                    branch_id: s.branchId,
                  },
                }
              : { name: 'catalog.services.read', arguments: {} },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_BRANCH_BOOKING',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== origin) {
        forbidden.push('external-network');
        throw new Error('External network forbidden');
      }
      const route = url.pathname.replace('/api/v1/', '');
      const method = init?.method ?? 'GET';
      const companyId = Number(
        route.split('/').find((part) => /^42\d{4}$/.test(part)),
      );
      const s = scenarios.find(
        (candidate) => candidate.companyId === companyId,
      );
      let data: unknown;
      if (method === 'POST' && route === `book_record/${companyId}` && s) {
        assert.equal(typeof init?.body, 'string');
        const payload = JSON.parse(init!.body as string) as {
          appointments: {
            services: number[];
            staff_id: number;
            datetime: string;
          }[];
          notify_by_sms: number;
          notify_by_email: number;
        };
        expect(payload.appointments).toHaveLength(1);
        const expected = s.expectedSelection ?? {
          branchId: s.branchId,
          staffId: '71',
          serviceIds: ['81'],
          start: s.day + 'T07:00:00.000Z',
        };
        expect(expected.branchId).toBe(s.branchId);
        const formatted = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Europe/Moscow',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
          .format(new Date(expected.start))
          .replace(' ', 'T');
        expect(payload.appointments[0]).toMatchObject({
          services: expected.serviceIds.map(Number),
          staff_id: Number(expected.staffId),
          datetime: formatted,
        });
        expect(payload.notify_by_email).toBe(0);
        expect(payload.notify_by_sms).toBe(0);
        const rows = await db.prisma.$queryRaw<
          { id: bigint }[]
        >`INSERT INTO branch_selector_synthetic_posts(company_id, payload) VALUES (${companyId}, ${JSON.stringify(payload)}::jsonb) RETURNING id`;
        posts.push(companyId);
        if (s.key === 'unknown')
          throw new TypeError('fetch failed after synthetic ledger persisted');
        data = [{ id: 1, record_id: Number(rows[0].id) + 5000 }];
      } else if (
        method === 'POST' &&
        route === `company/${companyId}/clients/search` &&
        s?.key === 'unknown'
      ) {
        // Native reconciliation uses an HTTP POST for a read-only search. No ledger write.
        assert.equal(typeof init?.body, 'string');
        const query = JSON.parse(init!.body as string) as Record<
          string,
          unknown
        >;
        expect(query).toMatchObject({
          fields: ['id', 'name', 'phone'],
          page: 1,
          page_size: 8,
        });
        observations.syntheticReadOnlySearchPosts =
          Number(observations.syntheticReadOnlySearchPosts ?? 0) + 1;
        return new Response(
          JSON.stringify({
            success: false,
            meta: { message: 'synthetic reconciliation unavailable' },
          }),
          { status: 503 },
        );
      } else if (method === 'GET' && init?.body === undefined) {
        reads.push(route);
        const company = {
          id: companyId,
          title: 'Synthetic salon',
          timezone_name: 'Europe/Moscow',
        };
        if (route === 'companies')
          data = scenarios.map((row) => ({
            id: row.companyId,
            title: 'Synthetic salon',
            timezone_name: 'Europe/Moscow',
          }));
        else if (s && route === `company/${companyId}`) data = company;
        else if (s && route === `book_services/${companyId}`)
          data = {
            services: [
              {
                id: 81,
                title: 'Синтетическая стрижка',
                price_min: 1000,
                price_max: 1000,
                seance_length: 1800,
              },
              {
                id: 82,
                title: 'Синтетическая борода',
                price_min: 800,
                price_max: 800,
                seance_length: 1800,
              },
            ],
          };
        else if (s && route === `service_categories/${companyId}`) data = [];
        else if (
          s &&
          [
            `company/${companyId}/staff`,
            `staff/${companyId}`,
            `book_staff/${companyId}`,
          ].includes(route)
        )
          data = [
            {
              id: 71,
              name: 'Синтетический мастер',
              bookable: true,
              fired: false,
              hidden: false,
              specialization: 'Мастер',
            },
            {
              id: 72,
              name: 'Другой синтетический мастер',
              bookable: true,
              fired: false,
              hidden: false,
              specialization: 'Мастер',
            },
          ];
        else if (
          s &&
          new RegExp(
            `^book_times/${companyId}/(?:71|72)/\\d{4}-\\d{2}-\\d{2}$`,
          ).test(route)
        )
          data = [
            { time: '10:00', seance_length: 1800 },
            { time: '11:00', seance_length: 1800 },
          ];
        else if (s && route === `records/${companyId}` && s.key === 'unknown')
          return new Response(
            JSON.stringify({
              success: false,
              meta: { message: 'synthetic reconciliation unavailable' },
            }),
            { status: 503 },
          );
        else {
          forbidden.push('unknown-provider-read:' + route);
          throw new Error('Unexpected synthetic provider read: ' + route);
        }
      } else {
        forbidden.push('unapproved-provider-write');
        throw new Error('Unexpected synthetic transport method');
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
      });
    });
  });
  afterAll(async () => {
    observations.checkpoints = checkpoints;
    observations.providerReads = reads;
    observations.syntheticPostCompanies = posts;
    observations.forbidden = forbidden;
    observations.pid = process.pid;
    writeFileSync(reportPath, JSON.stringify(observations, null, 2) + '\n', {
      mode: 0o600,
    });
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
    // Fixtures intentionally persist across owned PG restart; driver removes authority by stopping its cluster.
  });
  async function login(s: Scenario) {
    return http.login(s.slug, s.email, s.password);
  }
  async function createScenario(key: string) {
    const tenant = await fx.tenant(
      'Synthetic branch selector ' + key,
      CalendarSource.EXTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const user = await fx.user(tenant, UserRole.CLIENT);
    await fx.bookingSource(tenant, user, true);
    for (const feature of [
      'ai.owner',
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Синтетический филиал',
        timezone: 'Europe/Moscow',
      },
    });
    const other = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Другой синтетический филиал',
        timezone: 'Europe/Moscow',
      },
    });
    const client = await db.prisma.client.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: user.id },
    });
    const link = await db.prisma.clientChannelLink.findFirstOrThrow({
      where: { tenantId: tenant.id, clientId: client.id, revokedAt: null },
    });
    const s: Scenario = {
      key,
      tenantId: tenant.id,
      slug: tenant.slug,
      email: user.email,
      password: user.password,
      userId: user.id,
      clientId: client.id,
      linkId: link.id,
      branchId: branch.id,
      otherBranchId: other.id,
      companyId: 420001 + scenarios.length,
      day: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    };
    scenarios.push(s);
    const token = await http.login(tenant.slug, owner.email, owner.password);
    const connect = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/connect')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', randomUUID())
      .send({
        provider: 'yclients',
        apiToken: 'SYNTHETIC_BRANCH_SELECTOR_USER',
        settingsJson: settings(s),
      });
    expect(connect.status).toBe(201);
    const activate = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/activate')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(activate.status).toBe(201);
    expect(
      (
        await db.prisma.crmIntegration.findUniqueOrThrow({
          where: { tenantId: s.tenantId },
        })
      ).status,
    ).toBe('active');
    await db.prisma.tenant.update({
      where: { id: s.tenantId },
      data: { defaultTimezone: 'UTC' },
    });
    return s;
  }
  async function slots(
    s: Scenario,
    token: string,
    branchId = s.branchId,
    day = s.day,
  ) {
    return http.executeTool(
      token,
      'booking.availability.read',
      {
        surface: 'web',
        arguments: {
          branch_id: branchId,
          staff_id: '71',
          service_ids: ['81'],
          date: day,
        },
      },
      randomUUID(),
    );
  }
  async function selector(s: Scenario, token: string) {
    const read = await slots(s, token);
    expect(read.status).toBe(201);
    const body = object(read.body);
    expect(object(body.result).timezone).toBe('Europe/Moscow');
    const envelope = object(object(object(body.resolution).receipt).envelope);
    expect(envelope.kind).toBe('TIME_SLOT_SELECTOR');
    // Render observations belong only to SERVICE/STAFF_SELECTOR; TIME_SLOT is not that lifecycle.
    expect(
      (await http.resolveWidgets(token, { thread_page: { limit: 50 } })).status,
    ).toBe(200);
    return envelope;
  }
  async function preview(s: Scenario, token: string) {
    const envelope = await selector(s, token);
    const result = await submit(
      http,
      token,
      envelope,
      'DRAFT',
      firstSlot(envelope).slot_ref,
    );
    expect(result.receipt_outcome).toBe('ACCEPTED');
    const confirmation = object(result.next_envelope);
    expect(confirmation.kind).toBe('BOOKING_CONFIRMATION');
    expect(JSON.stringify(confirmation.body)).toContain('Europe/Moscow');
    expect(
      (await http.resolveWidgets(token, { thread_page: { limit: 50 } })).status,
    ).toBe(200);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: s.tenantId },
      }),
    ).toBe(0);
    return confirmation;
  }
  async function ledgerCount(s: Scenario) {
    const rows = await db.prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM branch_selector_synthetic_posts WHERE company_id=${s.companyId}`;
    return Number(rows[0].count);
  }
  async function assertNoEffect(s: Scenario) {
    expect(await ledgerCount(s)).toBe(0);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: s.tenantId },
      }),
    ).toBe(0);
    expect(
      await db.prisma.appointment.count({ where: { tenantId: s.tenantId } }),
    ).toBe(0);
  }
  async function revoke(s: Scenario) {
    const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: s.linkId },
    });
    const proof = randomUUID();
    const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () =>
        Promise.reject(new Error('Synthetic new link forbidden')),
      verifyRevocation: (supplied) =>
        supplied === proof
          ? Promise.resolve({
              tenantId: s.tenantId,
              provider: 'maya_user',
              providerSubjectHash: link.providerSubjectHash,
              linkId: link.id,
              revocationIdentityHash: hash(proof),
              actorProofHash: hash('actor:' + proof),
              reason: 'synthetic branch preview revocation',
              validUntil: new Date(Date.now() + 600000),
            })
          : Promise.reject(new Error('Unknown synthetic revocation')),
    });
    await db.tenantContext.runAsSystemTenant(s.tenantId, () =>
      owner.revoke({ proof }),
    );
  }
  async function browser() {
    for (const [mode, key] of [
      ['typed', 'success'],
      ['typed', 'removed'],
      ['typed', 'unknown'],
      ['personal', 'success'],
      ['personal', 'changed'],
    ] as const) {
      const s = await createScenario(key);
      s.mode = mode;
    }
    observations.scriptedModel = true;
    observations.syntheticA18Verifier = true;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/branch-booking-selector-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve(),
        killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded branch browser timeout')),
        630000,
      );
      child.stderr!.on('data', (buffer: Buffer) => {
        stderr += buffer.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = object(raw);
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output: path.dirname(reportPath),
                scenarios: scenarios.map((s) => ({
                  mode: s.mode,
                  key: s.key,
                  email: s.email,
                  branchId: s.branchId,
                  otherBranchId: s.otherBranchId,
                  branchName: 'Синтетический филиал',
                  otherBranchName: 'Другой синтетический филиал',
                  timezone: 'Europe/Moscow',
                  serviceName: 'Синтетическая стрижка',
                  otherServiceName: 'Синтетическая борода',
                  staffName: 'Синтетический мастер',
                  otherStaffName: 'Другой синтетический мастер',
                  serviceId: '81',
                  otherServiceId: '82',
                  staffId: '71',
                  otherStaffId: '72',
                  day: s.day,
                  alternateDay: new Date(new Date(s.day).getTime() + 86400000)
                    .toISOString()
                    .slice(0, 10),
                })),
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            const expectedNames = [
              ...scenarios.flatMap((s) =>
                ['preview', 'result'].map(
                  (name) => `${s.mode}-${s.key}-${name}`,
                ),
              ),
              ...scenarios.map((s) => `${s.mode}-${s.key}-reload`),
            ];
            expect(message.name).toBe(expectedNames[checkpoints.length]);
            const s = scenarios.find((row) =>
              String(message.name).startsWith(`${row.mode}-${row.key}-`),
            )!;
            if (String(message.name).endsWith('-preview')) {
              await assertNoEffect(s);
              const selection = message.selection
                ? object(message.selection)
                : {
                    staffId: '71',
                    serviceIds: ['81'],
                    branchId: s.branchId,
                    start: message.selectedStart,
                  };
              expect(selection.branchId).toBe(s.branchId);
              expect(typeof selection.start).toBe('string');
              s.expectedSelection = selection as Scenario['expectedSelection'];
              if (s.mode === 'personal') {
                expect(selection.staffId).toBe('72');
                expect(selection.serviceIds).toEqual(['82']);
                expect(String(selection.start).slice(0, 10)).toBe(
                  new Date(new Date(s.day).getTime() + 86400000)
                    .toISOString()
                    .slice(0, 10),
                );
              }
              if (s.key === 'removed')
                await db.prisma.crmIntegration.update({
                  where: { tenantId: s.tenantId },
                  data: {
                    settingsJson: { companyId: s.companyId, currency: 'RUB' },
                  },
                });
              if (s.key === 'changed')
                await db.prisma.crmIntegration.update({
                  where: { tenantId: s.tenantId },
                  data: { updatedAt: new Date(Date.now() + 1000) },
                });
            } else if (s.key === 'removed' || s.key === 'changed') {
              await assertNoEffect(s);
            } else {
              expect(await ledgerCount(s)).toBe(1);
              const executions = await db.prisma.actionExecution.findMany({
                where: { tenantId: s.tenantId },
              });
              expect(executions).toHaveLength(1);
              expect(executions[0]).toMatchObject({
                state: s.key === 'unknown' ? 'UNKNOWN' : 'SUCCEEDED',
                executionAttemptCount: 1,
              });
              const appointments = await db.prisma.appointment.findMany({
                where: { tenantId: s.tenantId },
              });
              expect(appointments).toHaveLength(s.key === 'unknown' ? 0 : 1);
              if (s.key === 'success') {
                expect(appointments[0]).toMatchObject({
                  branchId: s.branchId,
                  mayaClientId: s.clientId,
                  staffExternalId: s.expectedSelection!.staffId,
                  serviceIds: s.expectedSelection!.serviceIds,
                });
                expect(appointments[0].startAt.toISOString()).toBe(
                  new Date(s.expectedSelection!.start).toISOString(),
                );
              }
              observations[String(message.name)] = {
                state: executions[0].state,
                executionAttempts: 1,
                syntheticPosts: 1,
              };
            }
            expect(forbidden).toEqual([]);
            checkpoints.push(String(message.name));
            child.send({ type: 'continue:' + String(message.name) });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(new Error(`Browser ${code}: ${stderr.slice(-2000)}`)),
        );
      });
    });
    expect(checkpoints).toHaveLength(15);
  }
  it(
    'persists MINTED confirmations across restart, dispatches native POST once only after COMMIT and refuses stale scope',
    async () => {
      const pg = await db.prisma.$queryRaw<
        { started: Date }[]
      >`SELECT pg_postmaster_start_time() AS started`;
      observations.pgStart = pg[0].started.toISOString();
      if (stage === 'browser') {
        await browser();
        return;
      }
      if (stage === 'prepare') {
        for (const key of ['success', 'unknown']) {
          const s = await createScenario(key);
          s.confirmation = await preview(s, await login(s));
          await assertNoEffect(s);
        }
        expect(posts).toHaveLength(0);
        receipt = {
          scenarios,
          preparePid: process.pid,
          preparePgStart: pg[0].started.toISOString(),
        };
        writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
        checkpoints.push(
          'A17 activated exact bindings; canonical Client links; branch-local MINTED confirmations persisted with zero AE/provider effects',
        );
        observations.restartState =
          'MINTED_WIDGET_CONFIRMATION_NOT_READY_ACTION_EXECUTION';
      } else {
        expect(process.pid).not.toBe(receipt.preparePid);
        expect(pg[0].started.toISOString()).not.toBe(receipt.preparePgStart);
        for (const s of [...scenarios]) {
          const token = await login(s),
            confirmation = s.confirmation!;
          expect(
            (await http.resolveWidgets(token, { thread_page: { limit: 50 } }))
              .status,
          ).toBe(200);
          const first = await submit(http, token, confirmation, 'COMMIT');
          expect(first.receipt_outcome).toBe('ACCEPTED');
          const results = await Promise.all(
            Array.from({ length: 3 }, () =>
              submit(http, token, confirmation, 'COMMIT'),
            ),
          );
          expect(await ledgerCount(s)).toBe(1);
          const executions = await db.prisma.actionExecution.findMany({
            where: { tenantId: s.tenantId },
          });
          expect(executions).toHaveLength(1);
          expect(executions[0]).toMatchObject({
            state: s.key === 'success' ? 'SUCCEEDED' : 'UNKNOWN',
            executionAttemptCount: 1,
            capability: 'crm.appointment.create.v1',
          });
          if (s.key === 'success') {
            const appointment = await db.prisma.appointment.findFirstOrThrow({
              where: { tenantId: s.tenantId },
            });
            expect(appointment).toMatchObject({
              mayaClientId: s.clientId,
              branchId: s.branchId,
              staffExternalId: '71',
              serviceIds: ['81'],
            });
            expect(appointment.startAt.toISOString()).toBe(
              s.day + 'T07:00:00.000Z',
            );
          } else {
            expect(
              await db.prisma.appointment.count({
                where: { tenantId: s.tenantId },
              }),
            ).toBe(0);
            for (const result of [first, ...results])
              expect(JSON.stringify(result)).not.toContain(
                'Запись подтверждена.',
              );
          }
          observations[s.key] = {
            state: executions[0].state,
            executionAttemptCount: executions[0].executionAttemptCount,
            syntheticPosts: await ledgerCount(s),
            replays: results.length,
          };
          checkpoints.push(
            s.key +
              ' native COMMIT exactly once; durable replay after actual restart',
          );
        }
        for (const change of [
          'mapping',
          'metadata',
          'timezone',
          'removed',
          'revoked',
          'old-slot',
        ]) {
          const s = await createScenario(change),
            token = await login(s);
          const oldSelector =
            change === 'old-slot' ? await selector(s, token) : null;
          const confirmation = oldSelector ? null : await preview(s, token);
          if (change === 'mapping' || change === 'old-slot')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: { settingsJson: settings(s, s.otherBranchId) },
            });
          else if (change === 'metadata')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: { updatedAt: new Date(Date.now() + 1000) },
            });
          else if (change === 'timezone')
            await db.prisma.branch.update({
              where: { id: s.branchId },
              data: { timezone: 'UTC' },
            });
          else if (change === 'removed')
            await db.prisma.crmIntegration.update({
              where: { tenantId: s.tenantId },
              data: {
                settingsJson: { companyId: s.companyId, currency: 'RUB' },
              },
            });
          else await revoke(s);
          const result = oldSelector
            ? await submit(
                http,
                token,
                oldSelector,
                'DRAFT',
                firstSlot(oldSelector).slot_ref,
              )
            : await submit(http, token, confirmation!, 'COMMIT');
          expect(result).toMatchObject(
            change === 'revoked' || change === 'old-slot'
              ? {
                  outcome: 'terminate',
                  receipt_outcome: 'REFUSED',
                  code: 'effect_not_admissible',
                  stopped_at_gate: '13',
                  next_envelope: null,
                }
              : {
                  outcome: 'superseded',
                  receipt_outcome: null,
                  code: 'handle_stale',
                  stopped_at_gate: '11',
                  next_envelope: null,
                },
          );
          await assertNoEffect(s);
          observations[change] = {
            outcome: result.outcome,
            receiptOutcome: result.receipt_outcome,
            code: result.code,
            stoppedAtGate: result.stopped_at_gate,
            syntheticPosts: 0,
            actionExecutions: 0,
          };
          checkpoints.push(change + ' refuses before AE/provider POST');
        }
        const s = await createScenario('foreign-unbound'),
          token = await login(s),
          other = scenarios[0];
        const mark = reads.length;
        expect((await slots(s, token, other.branchId)).status).toBe(404);
        expect((await slots(s, token, s.otherBranchId)).status).toBe(503);
        expect(reads.length).toBe(mark);
        await assertNoEffect(s);
        checkpoints.push(
          'foreign and unbound branches refused before provider GET',
        );
        observations.foreignUnbound = {
          foreign: 404,
          unbound: 503,
          providerReads: 0,
        };
      }
      expect(forbidden).toEqual([]);
    },
    stage === 'browser' ? 660000 : 120000,
  );
});
