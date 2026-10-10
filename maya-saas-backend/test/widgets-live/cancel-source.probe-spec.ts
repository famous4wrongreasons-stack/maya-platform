/** Actual HTTP/PG and native adapter, finite synthetic transport only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
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
import { ActionEngineRuntimeService } from '../../src/action-engine/action-engine.runtime';

assertProofDatabase();
const output = process.env.JEST_CANCEL_SOURCE_OUTPUT!;
assert.ok(output, 'Use cancel-source-proof.mjs');
const origin = 'https://synthetic-cancel-source.invalid';
type Scenario = {
  tenantId: string;
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
describe('Client cancellation source fence [ACTUAL HTTP PG / SYNTHETIC YCLIENTS]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const scenarios: Scenario[] = [];
  const records = new Map<number, { canceled: boolean; own: boolean }>();
  const transport: { method: string; company: number; route: string }[] = [];
  const observations: Record<string, unknown>[] = [];
  let forbidden = 0;
  let afterDelete:
    ((s: Scenario) => Promise<'gone' | 'lost' | void>) | undefined;
  let afterDetail: ((s: Scenario) => Promise<void>) | undefined;
  let readbackReady = true;
  let readbackId = 5001;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        forbidden++;
        throw new Error('Model forbidden');
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
        assert.equal(records.has(company), false);
        assert.equal(typeof init?.body, 'string');
        const payload = object(JSON.parse(init!.body as string));
        expect(payload).toMatchObject({ notify_by_email: 0, notify_by_sms: 0 });
        records.set(company, { canceled: false, own: true });
        data = [{ id: 1, record_id: 5001 }];
      } else if (
        s &&
        method === 'DELETE' &&
        route === `record/${company}/5001`
      ) {
        assert.ok(records.has(company));
        records.get(company)!.canceled = true;
        const mode = await afterDelete?.(s);
        if (mode === 'lost')
          throw new TypeError('Synthetic DELETE response lost');
        if (mode === 'gone')
          return new Response(JSON.stringify({ success: false }), {
            status: 404,
          });
        data = {};
      } else if (s && method === 'GET' && route === `record/${company}/5001`) {
        if (!readbackReady)
          return new Response(JSON.stringify({ success: false }), {
            status: 503,
          });
        const row = records.get(company);
        assert.ok(row);
        await afterDetail?.(s);
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
            id: row.own ? 901 : 902,
            name: 'Synthetic client',
            phone: '+79990000000',
          },
        };
      } else {
        forbidden++;
        throw new Error('Unadmitted synthetic route: ' + method + ' ' + route);
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
      });
    });
  });
  afterEach(async () => {
    afterDelete = undefined;
    afterDetail = undefined;
    readbackReady = true;
    readbackId = 5001;
    const s = scenarios.at(-1);
    if (!s) return;
    const executions = await db.prisma.actionExecution.findMany({
      where: { tenantId: s.tenantId, capability: 'crm.appointment.cancel.v1' },
      select: {
        id: true,
        state: true,
        executionAttemptCount: true,
        reconciliationState: true,
        attempts: { select: { kind: true, state: true } },
        evidenceRefsJson: true,
      },
    });
    observations.push({
      case: expect.getState().currentTestName,
      companyA: { ...records.get(s.companyA) },
      companyB: { ...records.get(s.companyB) },
      executions,
      provider: transport.filter((row) =>
        [s.companyA, s.companyB].includes(row.company),
      ),
      appointment: await db.prisma.appointment.findFirst({
        where: { id: s.appointmentId, tenantId: s.tenantId },
        select: { id: true, status: true, branchId: true, crmExternalId: true },
      }),
    });
  });
  afterAll(async () => {
    writeFileSync(
      path.join(output, 'observations.json'),
      JSON.stringify(
        {
          qualification: 'SYNTHETIC_NATIVE_YCLIENTS_ONLY',
          realModelCalls: 0,
          realProviderCalls: 0,
          forbidden,
          transport,
          observations,
        },
        null,
        2,
      ) + '\n',
    );
    jest.restoreAllMocks();
    // This private cluster is stopped by the driver; preserve its proof rows.
    try {
      await http?.close();
    } finally {
      await db?.close();
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
    expect(response.status).toBe(201);
    const active = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/activate')
      .set('Authorization', 'Bearer ' + s.ownerToken)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(active.status).toBe(201);
  }
  async function scenario() {
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
    records.set(s.companyB, { canceled: false, own: false });
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
    const own = await http.executeTool(
      s.token,
      'appointments.own.list',
      { surface: 'web', arguments: {} },
      randomUUID(),
    );
    expect(own.status).toBe(201);
    const schedule = object(
      object(object(object(own.body).resolution).receipt).envelope,
    );
    expect(schedule.kind).toBe('SCHEDULE');
    const proposed = await submit(http, s.token, schedule, 'REFINE');
    expect(proposed.receipt_outcome).toBe('ACCEPTED');
    s.confirmation = object(proposed.next_envelope);
    expect(object(s.confirmation.body).confirmation_subject).toBe('cancel');
    return s;
  }
  it('company A preview → company B integration → confirm never deletes the B record with the same ID', async () => {
    const s = await scenario();
    await connect(s, s.companyB);
    const before = transport.length;
    const result = await submit(http, s.token, s.confirmation!, 'COMMIT');
    const appointment = await db.prisma.appointment.findUniqueOrThrow({
      where: { id: s.appointmentId },
    });
    observations.push({
      case: 'company-switch-before-confirm',
      result,
      providerAfterConfirm: transport.slice(before),
      companyA: records.get(s.companyA),
      companyB: records.get(s.companyB),
      appointmentStatus: appointment.status,
    });
    expect(
      transport.slice(before).filter((row) => row.method === 'DELETE'),
    ).toEqual([]);
    expect(records.get(s.companyB)).toEqual({ canceled: false, own: false });
    expect(records.get(s.companyA)?.canceled).toBe(false);
    expect(appointment.status).toBe('confirmed');
    expect(result.receipt_outcome).not.toBe('ACCEPTED');
    expect(forbidden).toBe(0);
  }, 30000);
  const ownedRow = (s: Scenario) =>
    db.prisma.appointment.findUniqueOrThrow({ where: { id: s.appointmentId } });
  const cancelHttp = (s: Scenario, key: string, token = s.token) =>
    request(http.app.getHttpServer())
      .post(`/api/appointments/${s.appointmentId}/cancel`)
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', key)
      .send({});
  const executions = (s: Scenario) =>
    db.prisma.actionExecution.findMany({
      where: { tenantId: s.tenantId, capability: 'crm.appointment.cancel.v1' },
    });
  const deletes = (s: Scenario) =>
    transport.filter(
      (row) =>
        row.method === 'DELETE' &&
        [s.companyA, s.companyB].includes(row.company),
    );
  async function switchCompany(s: Scenario) {
    const integration = await db.prisma.crmIntegration.findUniqueOrThrow({
      where: { tenantId: s.tenantId },
    });
    await db.prisma.crmIntegration.update({
      where: { id: integration.id },
      data: {
        settingsJson: {
          ...object(integration.settingsJson),
          companyId: s.companyB,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: s.companyB,
            branchId: s.branchId,
          },
        },
      },
    });
  }
  async function assertUntouched(s: Scenario) {
    expect(deletes(s)).toEqual([]);
    expect(records.get(s.companyA)?.canceled).toBe(false);
    expect(records.get(s.companyB)).toEqual({ canceled: false, own: false });
    expect((await ownedRow(s)).status).toBe('confirmed');
  }
  it.each([
    'branch-remap',
    'missing-branch',
    'missing-origin',
    'provider-change',
    'internal-source',
    'revoked-link',
  ])(
    'refuses %s after preview before any DELETE',
    async (mode) => {
      const s = await scenario();
      if (mode === 'branch-remap')
        await connect(s, s.companyA, s.otherBranchId);
      if (mode === 'missing-branch')
        await db.prisma.appointment.update({
          where: { id: s.appointmentId },
          data: { branchId: null },
        });
      if (mode === 'missing-origin') {
        // A mirror record without canonical create provenance. Never rewrite
        // the accepted B31 intent or its immutable retention contract.
        await db.prisma.appointment.update({
          where: { id: s.appointmentId },
          data: { crmExternalId: '5002' },
        });
        const direct = await cancelHttp(s, randomUUID());
        expect(direct.status).toBe(409);
        expect(direct.body).toMatchObject({
          error: { code: 'booking_appointment_source_unproven' },
        });
      }
      if (mode === 'provider-change')
        await db.prisma.crmIntegration.update({
          where: { tenantId: s.tenantId },
          data: { provider: 'altegio' },
        });
      if (mode === 'internal-source')
        await db.prisma.tenant.update({
          where: { id: s.tenantId },
          data: { calendarSource: 'internal' },
        });
      if (mode === 'revoked-link') await revoke(s);
      const result = await submit(http, s.token, s.confirmation!, 'COMMIT');
      expect(result.receipt_outcome).not.toBe('ACCEPTED');
      await assertUntouched(s);
    },
    30000,
  );
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
  it('unchanged source cancellation, concurrent same-key callers and replay share one AE/DELETE', async () => {
    const s = await scenario(),
      key = randomUUID();
    afterDelete = async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    };
    const replies = await Promise.all([cancelHttp(s, key), cancelHttp(s, key)]);
    expect(replies.map((r) => r.status)).toEqual([201, 201]);
    expect((await cancelHttp(s, key)).status).toBe(201);
    expect(deletes(s)).toHaveLength(1);
    expect(deletes(s)[0].company).toBe(s.companyA);
    expect((await ownedRow(s)).status).toBe('canceled');
    const rows = await executions(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: 'SUCCEEDED',
      executionAttemptCount: 1,
    });
    expect(records.get(s.companyB)?.canceled).toBe(false);
  }, 30000);
  it('rechecks current Client after a concurrent waiter receives the completed AE result', async () => {
    const s = await scenario(),
      key = randomUUID(),
      runtime = http.app.get(ActionEngineRuntimeService);
    const execute = runtime.executeWithReceipt.bind(runtime);
    let held!: () => void,
      release!: () => void,
      count = 0;
    const entered = new Promise<void>((resolve) => {
      held = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = jest
      .spyOn(runtime, 'executeWithReceipt')
      .mockImplementation(async (input, handlers) => {
        const current =
          input.capability === 'crm.appointment.cancel.v1' ? ++count : 0;
        const result = await execute(input, handlers);
        if (current === 2) {
          held();
          await resumed;
        }
        return result;
      });
    try {
      const first = cancelHttp(s, key).then((r) => r),
        second = cancelHttp(s, key).then((r) => r);
      expect((await Promise.race([first, second])).status).toBe(201);
      await entered;
      await revoke(s);
      release();
      expect(
        (await Promise.all([first, second])).map((r) => r.status).sort(),
      ).toEqual([201, 403]);
      expect(deletes(s)).toHaveLength(1);
      expect(await executions(s)).toHaveLength(1);
    } finally {
      release();
      spy.mockRestore();
    }
  }, 30000);
  it('widget COMMIT preserves late Client revocation instead of disclosing a completed cancel', async () => {
    const s = await scenario(),
      runtime = http.app.get(ActionEngineRuntimeService);
    const execute = runtime.executeWithReceipt.bind(runtime);
    let held!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      held = resolve;
    });
    const resumed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = jest
      .spyOn(runtime, 'executeWithReceipt')
      .mockImplementation(async (input, handlers) => {
        const result = await execute(input, handlers);
        if (input.capability === 'crm.appointment.cancel.v1') {
          held();
          await resumed;
        }
        return result;
      });
    try {
      const pending = submit(http, s.token, s.confirmation!, 'COMMIT');
      await entered;
      await revoke(s);
      release();
      const result = await pending;
      expect(result).toMatchObject({
        receipt_outcome: 'REFUSED',
        owner_decision: null,
      });
      expect(
        await db.prisma.widgetIntentReceipt.findFirstOrThrow({
          where: {
            tenantId: s.tenantId,
            widgetId: String(s.confirmation!.widget_id),
          },
        }),
      ).toMatchObject({ outcome: 'REFUSED', actionReceiptRef: null });
      expect(deletes(s)).toHaveLength(1);
      expect((await executions(s))[0]).toMatchObject({
        state: 'SUCCEEDED',
        executionAttemptCount: 1,
      });
      expect((await ownedRow(s)).status).toBe('canceled');
    } finally {
      release();
      spy.mockRestore();
    }
  }, 30000);
  it.each(['source', 'revoke', 'record-identity'])(
    'rechecks %s inside the native DELETE seam',
    async (mode) => {
      const s = await scenario();
      // Invoked below with the exact native adapter receiver.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = YclientsCRMAdapter.prototype.cancelAppointment;
      const spy = jest
        .spyOn(YclientsCRMAdapter.prototype, 'cancelAppointment')
        .mockImplementationOnce(async function (params) {
          expect(typeof params.assertSourceCurrent).toBe('function');
          if (mode === 'source') await switchCompany(s);
          if (mode === 'revoke') await revoke(s);
          if (mode === 'record-identity')
            await db.prisma.appointment.update({
              where: { id: s.appointmentId },
              data: { crmExternalId: '5002' },
            });
          return original.call(this, params);
        });
      try {
        const result = await submit(http, s.token, s.confirmation!, 'COMMIT');
        expect(result.receipt_outcome).not.toBe('ACCEPTED');
        await assertUntouched(s);
        expect((await executions(s))[0].state).toBe('FAILED');
      } finally {
        spy.mockRestore();
      }
    },
    30000,
  );
  it.each(['ok', 'gone', 'lost'] as const)(
    'source changes after DELETE (%s): UNKNOWN, no company-B read/mirror/retry',
    async (mode) => {
      const s = await scenario();
      afterDelete = async () => {
        await switchCompany(s);
        return mode === 'ok' ? undefined : mode;
      };
      const before = transport.length;
      const result = await submit(http, s.token, s.confirmation!, 'COMMIT');
      expect(result).toMatchObject({
        receipt_outcome: 'ACCEPTED',
        owner_decision: { state: 'UNKNOWN' },
      });
      const replay = await submit(http, s.token, s.confirmation!, 'COMMIT');
      expect(
        (replay.owner_decision as { state?: string } | null)?.state,
      ).not.toBe('SUCCEEDED');
      expect(
        transport.slice(before).filter((row) => row.company === s.companyB),
      ).toEqual([]);
      expect(deletes(s)).toHaveLength(1);
      expect(records.get(s.companyB)?.canceled).toBe(false);
      expect((await ownedRow(s)).status).toBe('confirmed');
      expect((await executions(s))[0]).toMatchObject({
        state: 'UNKNOWN',
        executionAttemptCount: 1,
      });
    },
    30000,
  );
  it('lost DELETE response reconciles the original provider within the existing finite attempt budget', async () => {
    const s = await scenario(),
      key = randomUUID();
    afterDelete = () => Promise.resolve('lost');
    expect((await cancelHttp(s, key)).status).toBe(201);
    expect(deletes(s)).toHaveLength(1);
    expect((await ownedRow(s)).status).toBe('canceled');
    expect((await executions(s))[0]).toMatchObject({
      state: 'SUCCEEDED',
      executionAttemptCount: 1,
    });
  }, 30000);
  it('source changes during UNKNOWN readback: retains UNKNOWN without mirror or company-B access', async () => {
    const s = await scenario(),
      key = randomUUID();
    afterDelete = () => Promise.resolve('lost');
    afterDetail = async () => {
      await switchCompany(s);
    };
    const before = transport.length;
    expect((await cancelHttp(s, key)).status).toBe(503);
    expect(
      transport.slice(before).filter((row) => row.company === s.companyB),
    ).toEqual([]);
    const retryBefore = transport.length;
    expect((await cancelHttp(s, key)).status).toBe(409);
    expect(transport.slice(retryBefore)).toEqual([]);
    expect(deletes(s)).toHaveLength(1);
    expect((await ownedRow(s)).status).toBe('confirmed');
    expect((await executions(s))[0]).toMatchObject({
      state: 'UNKNOWN',
      executionAttemptCount: 1,
    });
  }, 30000);
  it.each(['unavailable', 'foreign-record'])(
    'UNKNOWN readback %s reaches the existing manual bound and replay never redispatches',
    async (mode) => {
      const s = await scenario(),
        key = randomUUID();
      readbackReady = mode !== 'unavailable';
      readbackId = mode === 'foreign-record' ? 5002 : 5001;
      afterDelete = () => Promise.resolve('lost');
      expect((await cancelHttp(s, key)).status).toBe(503);
      const execution = await db.prisma.actionExecution.findFirstOrThrow({
        where: {
          tenantId: s.tenantId,
          capability: 'crm.appointment.cancel.v1',
        },
        include: { attempts: true },
      });
      expect(execution).toMatchObject({
        state: 'UNKNOWN',
        reconciliationState: 'MANUAL_REQUIRED',
        executionAttemptCount: 1,
      });
      expect(
        execution.attempts.filter((a) => a.kind === 'RECONCILIATION'),
      ).toHaveLength(3);
      expect(
        transport.filter(
          (r) =>
            r.company === s.companyA &&
            r.method === 'GET' &&
            r.route === `record/${s.companyA}/5001`,
        ),
      ).toHaveLength(3);
      readbackReady = true;
      readbackId = 5001;
      const before = transport.length;
      expect((await cancelHttp(s, key)).status).toBe(503);
      expect(transport.slice(before)).toEqual([]);
      expect(deletes(s)).toHaveLength(1);
      expect((await ownedRow(s)).status).toBe('confirmed');
      expect(records.get(s.companyB)?.canceled).toBe(false);
    },
    30000,
  );
  it('foreign tenant cannot cancel the owned appointment', async () => {
    const s = await scenario(),
      foreign = await scenario();
    expect((await cancelHttp(s, randomUUID(), foreign.token)).status).toBe(404);
    await assertUntouched(s);
    expect(forbidden).toBe(0);
  }, 30000);
});
