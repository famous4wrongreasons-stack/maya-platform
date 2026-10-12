/** Actual HTTP/PG and native adapter, finite synthetic transport only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Client as PgClient } from 'pg';
import { ConfigService } from '@nestjs/config';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import path from 'node:path';
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
import type { Fixtures } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { firstSlot, object, submit } from './support/release-booking-flow';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';

const database = assertProofDatabase();
const output = process.env.JEST_CANCEL_STATUS_OUTPUT!;
const receipt = process.env.JEST_CANCEL_STATUS_RECEIPT!;
const stage = process.env.JEST_CANCEL_STATUS_STAGE;
assert.ok(
  output && receipt && ['prepare', 'resume'].includes(stage ?? ''),
  'Use cancel-status-react-proof.mjs',
);
assert.match(database.database, /^maya_widget_gate_proof_c9occ_[a-f0-9]+$/);
const origin = 'https://synthetic-cancel-source.invalid';
type Scenario = {
  tenantId: string;
  email: string;
  key: string;
  branchId: string;
  otherBranchId: string;
  clientId: string;
  linkId: string;
  token: string;
  ownerToken: string;
  companyA: number;
  companyB: number;
  day: string;
  appointmentId?: string;
  confirmation?: Record<string, unknown>;
};
describe('Cancel status current React / HTTP / PG restart [SYNTHETIC NATIVE PROVIDER ONLY]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const scenarios: Scenario[] = [];
  let ledger: PgClient;
  let saved: {
    database: string;
    pid: number;
    pgStarted: string;
    scenarios: Scenario[];
    notBefore: number;
    actions: unknown;
  };
  const stages: string[] = [];
  let browserClosed = false;
  const transport: { method: string; company: number; route: string }[] = [];
  const observations: Record<string, unknown>[] = [];
  let forbidden = 0;
  let readbackReady = false;
  const readbackId = 5001;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    ledger = new PgClient({ connectionString: database.connectionString });
    await ledger.connect();
    if (stage === 'prepare')
      await ledger.query(
        'CREATE TABLE cancel_provider_ledger (company integer primary key, canceled boolean not null, deletes integer not null default 0)',
      );
    else {
      saved = JSON.parse(readFileSync(receipt, 'utf8')) as typeof saved;
      expect(saved.database).toBe(database.database);
      expect(saved.pid).not.toBe(process.pid);
      scenarios.push(...saved.scenarios);
      const pgStarted = await ledger.query<{ start: string }>(
        'SELECT pg_postmaster_start_time()::text AS start',
      );
      expect(pgStarted.rows[0].start).not.toBe(saved.pgStarted);
    }
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        expect(stage).toBe('prepare');
        expect(
          input.messages.filter((m) => m.role === 'user').at(-1)?.content,
        ).toBe('Покажи мои записи');
        return Promise.resolve({
          reply: '',
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [
                { intent: 'booking.list_own', entities: {}, confidence: 0.99 },
              ],
            },
            input.principalRole ?? UserRole.CLIENT,
            input.tools.map((t) => t.name),
            input.conversationPlan,
          ),
          toolCall: input.toolResults.length
            ? null
            : { name: 'appointments.own.list', arguments: {} },
          provider: 'openai',
          model: 'SCRIPTED_CANCEL_STATUS_ONLY',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        assert.equal(provider, CrmProvider.YCLIENTS);
        assert.equal(config.apiToken, 'SYNTHETIC_CANCEL_USER');
        process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_CANCEL_PARTNER';
        try {
          return new YclientsCRMAdapter({
            ...config,
            baseUrl: origin + '/api/v1',
          });
        } finally {
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      assert.equal(url.origin, origin, 'External transport forbidden');
      const route = url.pathname.replace('/api/v1/', ''),
        method = init?.method ?? 'GET';
      const company = Number(
        route.split('/').find((part) => /^43\d{4}$/.test(part)),
      );
      const s = scenarios.find(
        (row) => row.companyA === company || row.companyB === company,
      );
      transport.push({ method, company, route });
      let data: unknown;
      if (method === 'GET' && route === 'companies')
        data = scenarios
          .flatMap((row) => [row.companyA, row.companyB])
          .map((id) => ({
            id,
            title: 'Synthetic company',
            timezone_name: 'Europe/Moscow',
          }));
      else if (s && method === 'GET' && route === `company/${company}`)
        data = {
          id: company,
          title: 'Synthetic company',
          timezone_name: 'Europe/Moscow',
        };
      else if (s && method === 'GET' && route === `book_services/${company}`)
        data = {
          services: [
            {
              id: 81,
              title: 'Synthetic haircut',
              price_min: 1000,
              price_max: 1000,
              seance_length: 1800,
            },
          ],
        };
      else if (
        s &&
        method === 'GET' &&
        route === `service_categories/${company}`
      )
        data = [];
      else if (
        s &&
        method === 'GET' &&
        [
          `company/${company}/staff`,
          `staff/${company}`,
          `book_staff/${company}`,
        ].includes(route)
      )
        data = [
          {
            id: 71,
            company_id: company,
            name: 'Synthetic staff',
            bookable: true,
            fired: false,
            hidden: false,
          },
        ];
      else if (
        s &&
        method === 'GET' &&
        new RegExp(`^book_times/${company}/71/\\d{4}-\\d{2}-\\d{2}$`).test(
          route,
        )
      )
        data = [
          { time: '10:00', seance_length: 1800 },
          { time: '11:00', seance_length: 1800 },
        ];
      else if (s && method === 'POST' && route === `book_record/${company}`) {
        assert.equal(company, s.companyA);
        expect(
          (
            await ledger.query(
              'SELECT * FROM cancel_provider_ledger WHERE company=$1',
              [company],
            )
          ).rowCount,
        ).toBe(0);
        assert.equal(typeof init?.body, 'string');
        const payload = object(JSON.parse(init!.body as string));
        expect(payload).toMatchObject({ notify_by_email: 0, notify_by_sms: 0 });
        await ledger.query(
          'INSERT INTO cancel_provider_ledger(company, canceled) VALUES($1, false)',
          [company],
        );
        data = [{ id: 1, record_id: 5001 }];
      } else if (
        s &&
        method === 'DELETE' &&
        route === `record/${company}/5001`
      ) {
        expect(
          (
            await ledger.query(
              'UPDATE cancel_provider_ledger SET canceled=true, deletes=deletes+1 WHERE company=$1 RETURNING company',
              [company],
            )
          ).rowCount,
        ).toBe(1);
        throw new TypeError(
          'Synthetic DELETE response lost after durable provider commit',
        );
      } else if (s && method === 'GET' && route === `record/${company}/5001`) {
        if (!readbackReady)
          return new Response(JSON.stringify({ success: false }), {
            status: 503,
          });
        const rows = await ledger.query<{ canceled: boolean }>(
          'SELECT canceled FROM cancel_provider_ledger WHERE company=$1',
          [company],
        );
        const row = rows.rows[0];
        assert.ok(row);
        data = {
          id: readbackId,
          company_id: company,
          datetime: s.day + 'T10:00:00',
          seance_length: 1800,
          staff_id: 71,
          staff: { id: 71, name: 'Synthetic staff' },
          deleted: row.canceled,
          attendance: 0,
          services: [{ id: 81, cost: 1000 }],
          client: {
            id: 901,
            name: 'Synthetic client',
            phone: '+79990000000',
          },
        };
      } else {
        forbidden++;
        throw new Error('Unadmitted synthetic route: ' + method + ' ' + route);
      }
      const team =
        route === `company/${company}/staff` || route === `staff/${company}`;
      return new Response(
        JSON.stringify({
          success: true,
          data,
          ...(team ? { meta: { total_count: 1, count: 1, page: 1 } } : {}),
        }),
        {
          status: 200,
        },
      );
    });
  });
  afterAll(async () => {
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(
        {
          stage,
          qualification: 'SYNTHETIC_NATIVE_PROVIDER_REAL_HTTP_PG_BROWSER',
          realModelCalls: 0,
          realProviderCalls: 0,
          forbidden,
          browserClosed,
          stages,
          transport,
          observations,
        },
        null,
        2,
      ) + '\n',
    );
    jest.restoreAllMocks();
    try {
      await http?.close();
    } finally {
      await db?.close();
      await ledger?.end();
    }
  });
  async function connect(
    s: Scenario,
    company = s.companyA,
    branchId = s.branchId,
  ) {
    const response = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/connect')
      .set('Authorization', 'Bearer ' + s.ownerToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        provider: 'yclients',
        apiToken: 'SYNTHETIC_CANCEL_USER',
        expectedVersion: null,
        settingsJson: {
          companyId: company,
          currency: 'RUB',
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: company,
            branchId,
          },
        },
      });
    observations.push({
      setup: 'connect',
      status: response.status,
      error: object(response.body).error ?? null,
    });
    expect({
      status: response.status,
      error: object(response.body).error,
    }).toMatchObject({ status: 201 });
    const expectedVersion = object(object(response.body).receipt).configVersion;
    expect(expectedVersion).toMatch(/^[a-f0-9]{64}$/);
    const active = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/activate')
      .set('Authorization', 'Bearer ' + s.ownerToken)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion });
    expect(active.status).toBe(201);
  }
  async function scenario(key: string) {
    const tenant = await fx.tenant(
      'Synthetic cancel source',
      CalendarSource.EXTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER),
      user = await fx.user(tenant, UserRole.CLIENT);
    await fx.bookingSource(tenant, user, true);
    for (const feature of [
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
      'ai.consultant',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch A',
        timezone: 'Europe/Moscow',
      },
    });
    const other = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch B',
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
      tenantId: tenant.id,
      email: user.email,
      key,
      branchId: branch.id,
      otherBranchId: other.id,
      clientId: client.id,
      linkId: link.id,
      token: await http.login(tenant.slug, user.email, user.password),
      ownerToken: await http.login(tenant.slug, owner.email, owner.password),
      companyA: 430001 + scenarios.length * 2,
      companyB: 430002 + scenarios.length * 2,
      day: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    };
    scenarios.push(s);
    await connect(s);
    const available = await http.executeTool(
      s.token,
      'booking.availability.read',
      {
        surface: 'web',
        arguments: {
          branch_id: s.branchId,
          staff_id: '71',
          service_ids: ['81'],
          date: s.day,
        },
      },
      randomUUID(),
    );
    expect(available.status).toBe(201);
    const selector = object(
      object(object(object(available.body).resolution).receipt).envelope,
    );
    const preview = await submit(
      http,
      s.token,
      selector,
      'DRAFT',
      firstSlot(selector).slot_ref,
    );
    expect(preview.receipt_outcome).toBe('ACCEPTED');
    expect(
      await submit(http, s.token, object(preview.next_envelope), 'COMMIT'),
    ).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { state: 'SUCCEEDED' },
    });
    const appointment = await db.prisma.appointment.findFirstOrThrow({
      where: { tenantId: s.tenantId, mayaClientId: s.clientId },
    });
    expect(appointment).toMatchObject({
      branchId: s.branchId,
      crmExternalId: '5001',
      crmProvider: 'yclients',
      status: 'confirmed',
    });
    s.appointmentId = appointment.id;
    return s;
  }
  async function revoke(s: Scenario) {
    const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: s.linkId },
    });
    const proof = randomUUID();
    // Synthetic verifier only; use the canonical immutable A18 revocation owner.
    const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () => Promise.reject(new Error('No link creation authority')),
      verifyRevocation: (provided) =>
        provided === proof
          ? Promise.resolve({
              tenantId: s.tenantId,
              provider: 'maya_user',
              providerSubjectHash: link.providerSubjectHash,
              linkId: s.linkId,
              revocationIdentityHash: 'c'.repeat(64),
              actorProofHash: 'd'.repeat(64),
              reason: 'synthetic-cancel-source-revocation',
              validUntil: new Date(Date.now() + 600000),
            })
          : Promise.reject(new Error('Unknown synthetic proof')),
    });
    await db.tenantContext.runAsSystemTenant(s.tenantId, () =>
      owner.revoke({ proof }),
    );
    expect(
      (
        await db.prisma.clientChannelLink.findUniqueOrThrow({
          where: { id: s.linkId },
        })
      ).revokedAt,
    ).not.toBeNull();
  }
  async function state(s: Scenario) {
    const action = await db.prisma.actionExecution.findFirst({
      where: { tenantId: s.tenantId, capability: 'crm.appointment.cancel.v1' },
    });
    const mirror = await db.prisma.appointment.findUniqueOrThrow({
      where: { id: s.appointmentId },
    });
    const provider = (
      await ledger.query<{ canceled: boolean; deletes: number }>(
        'SELECT canceled,deletes FROM cancel_provider_ledger WHERE company=$1',
        [s.companyA],
      )
    ).rows[0];
    return {
      action: action
        ? {
            id: action.id,
            state: action.state,
            attempts: action.executionAttemptCount,
            evidence: action.evidenceRefsJson,
          }
        : null,
      mirror: mirror.status,
      provider,
    };
  }
  it('persists cancellation UNKNOWN, restarts real application/PG, explicitly reconciles original receipt and refuses revocation', async () => {
    if (stage === 'prepare') {
      await scenario('recover');
      await scenario('revoked');
    } else {
      expect(await Promise.all(scenarios.map(state))).toEqual(saved.actions);
      expect(transport).toHaveLength(0);
    }
    const expectedSteps = scenarios.flatMap((s) =>
      stage === 'prepare'
        ? ['schedule', 'preview', 'unknown'].map((x) => s.key + '-' + x)
        : (s.key === 'recover'
            ? ['restored', 'pending', 'confirmed', 'repeat']
            : ['restored', 'refused']
          ).map((x) => s.key + '-' + x),
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/cancel-status-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve();
      const fail = (e: unknown) => {
        failure ??= e instanceof Error ? e : new Error(String(e));
        child.kill('SIGTERM');
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded cancel recovery browser timeout')),
        180000,
      );
      child.stderr!.on('data', (b: Buffer) => {
        stderr = (stderr + b.toString()).slice(-2000);
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = raw as {
              type: string;
              name: string;
              widgetId: string;
              nextLoginAt: number;
            };
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                stage,
                backendOrigin: await http.listenLoopback(),
                output: path.join(output, stage!),
                notBefore: stage === 'resume' ? saved.notBefore : 0,
                scenarios: scenarios.map((s) => ({
                  key: s.key,
                  email: s.email,
                  widgetId: s.confirmation?.widget_id,
                })),
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            expect(message.name).toBe(expectedSteps[stages.length]);
            const s = scenarios.find((s) =>
              message.name.startsWith(s.key + '-'),
            )!;
            if (message.name.endsWith('-preview'))
              s.confirmation = { widget_id: message.widgetId };
            const observed = await state(s);
            if (
              message.name.endsWith('-schedule') ||
              message.name.endsWith('-preview')
            ) {
              expect(observed.action).toBeNull();
              expect(observed.provider.deletes).toBe(0);
            } else {
              expect(observed.action).not.toBeNull();
              expect(observed.action!.attempts).toBe(1);
              expect(observed.provider).toEqual({ canceled: true, deletes: 1 });
              const confirmed = /-(confirmed|repeat)$/.test(message.name);
              expect(observed.action!.state).toBe(
                confirmed ? 'SUCCEEDED' : 'UNKNOWN',
              );
              expect(observed.mirror).toBe(
                confirmed ? 'canceled' : 'confirmed',
              );
              const receipts = await db.prisma.widgetIntentReceipt.findMany({
                where: {
                  tenantId: s.tenantId,
                  widgetId: String(s.confirmation!.widget_id),
                  outcome: 'ACCEPTED',
                },
              });
              expect(receipts).toHaveLength(1);
              expect(receipts[0].actionReceiptRef).toBe(
                confirmed ? observed.action!.id : null,
              );
            }
            const detailReads = () =>
              transport.filter(
                (r) =>
                  r.method === 'GET' && r.route === `record/${s.companyA}/5001`,
              ).length;
            if (stage === 'resume') {
              expect(
                transport.filter((r) => r.method === 'DELETE'),
              ).toHaveLength(0);
              if (message.name === 'recover-restored') {
                expect(detailReads()).toBe(0);
                const before = transport.length;
                const foreign = await http.resolveWidgets(scenarios[1].token, {
                  thread_page: { limit: 20 },
                  booking_receipt: { widget_id: s.confirmation!.widget_id },
                });
                expect(foreign.status).toBe(200);
                expect(JSON.stringify(foreign.body)).not.toContain(
                  String(s.confirmation!.widget_id),
                );
                expect(transport.length).toBe(before);
              }
              if (message.name === 'recover-pending') {
                expect(detailReads()).toBe(1);
                readbackReady = true;
              }
              if (
                message.name === 'recover-confirmed' ||
                message.name === 'recover-repeat'
              )
                expect(detailReads()).toBe(2);
              if (message.name === 'revoked-restored') {
                expect(detailReads()).toBe(0);
                await revoke(s);
              }
              if (message.name === 'revoked-refused')
                expect(detailReads()).toBe(0);
            }
            stages.push(message.name);
            observations.push({
              name: message.name,
              state: observed,
              nativeDetailReads: detailReads(),
            });
            saved ??= {
              database: database.database,
              pid: process.pid,
              pgStarted: '',
              scenarios,
              notBefore: 0,
              actions: [],
            };
            saved.notBefore = Math.max(
              saved.notBefore,
              message.nextLoginAt || 0,
            );
            child.send({ type: 'continue:' + message.name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        browserClosed = true;
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(new Error(`Browser ${code}: ${stderr}`)),
        );
      });
    });
    expect(stages).toEqual(expectedSteps);
    expect(forbidden).toBe(0);
    if (stage === 'prepare') {
      saved.pgStarted = (
        await ledger.query<{ start: string }>(
          'SELECT pg_postmaster_start_time()::text AS start',
        )
      ).rows[0].start;
      saved.actions = await Promise.all(scenarios.map(state));
      writeFileSync(receipt, JSON.stringify(saved), {
        flag: 'wx',
        mode: 0o600,
      });
    }
  }, 210000);
});
