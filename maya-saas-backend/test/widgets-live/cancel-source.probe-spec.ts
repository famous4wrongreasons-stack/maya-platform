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
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
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
        data = {};
      } else if (s && method === 'GET' && route === `record/${company}/5001`) {
        const row = records.get(company);
        assert.ok(row);
        data = {
          id: 5001,
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
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data }), { status: 200 }),
      );
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
});
