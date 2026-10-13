/** Test-only native YCLIENTS transport. Product serialization/parsing stays real;
 * all provider state lives in a fresh guarded PG database, never the owner's DB. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../../src/crm/adapters/yclients-crm.adapter';
import type { FixtureContext } from './bootstrap';
import type { HttpHarness } from './http-bootstrap';
import type { Fixtures } from './fixtures';
import type { CandidateSource } from './current-candidate-sources';
import { assertProofDatabase } from './proof-db-guard';

type ProviderRow = {
  record_id: number;
  start: string;
  canceled: boolean;
  posts: number;
  puts: number;
  deletes: number;
};
export async function bindNativeFollowup(
  db: FixtureContext,
  http: HttpHarness,
  fx: Fixtures,
  source: CandidateSource,
) {
  assert.match(
    assertProofDatabase().database,
    /^maya_widget_gate_proof_bookingconfirmation_[a-f0-9]+$/,
  );
  assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
  const origin = 'https://synthetic-booking-followup.invalid';
  const company = 440001,
    recordId = 5001;
  const day = source.startsAt.slice(0, 10);
  const requests: Array<{ method: string; route: string }> = [];
  const forbidden: string[] = [];
  // No product migration; this table represents the test provider, not a Maya mirror.
  await db.prisma.$executeRawUnsafe(
    'CREATE TABLE followup_test_provider (record_id integer primary key, start text not null, canceled boolean not null default false, posts integer not null, puts integer not null default 0, deletes integer not null default 0)',
  );
  const ledger = () =>
    db.prisma.$queryRaw<
      ProviderRow[]
    >`SELECT * FROM followup_test_provider ORDER BY record_id`;
  const detail = async () => {
    const rows = await ledger();
    assert.equal(rows.length, 1);
    const row = rows[0];
    return {
      id: row.record_id,
      company_id: company,
      datetime: row.start,
      seance_length: 1800,
      staff_id: 71,
      staff: { id: 71, name: 'Артём' },
      deleted: row.canceled,
      attendance: 0,
      services: [{ id: 81, cost: 1500, first_cost: 1500, discount: 0 }],
      client: {
        id: 901,
        name: 'Synthetic followup client',
        phone: '+79990000000',
      },
    };
  };
  jest
    .spyOn(http.app.get(CrmAdapterFactory), 'create')
    .mockImplementation((provider, config) => {
      assert.equal(provider, CrmProvider.YCLIENTS);
      assert.equal(config.apiToken, 'SYNTHETIC_FOLLOWUP_USER');
      process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_FOLLOWUP_PARTNER';
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
    if (url.origin !== origin) {
      forbidden.push('external-network');
      throw new Error('External network forbidden');
    }
    const route = url.pathname.replace('/api/v1/', ''),
      method = init?.method ?? 'GET';
    requests.push({ method, route });
    assert.ok(requests.length <= 300, 'Finite native transport budget');
    let data: unknown;
    const companyData = {
      id: company,
      title: 'Synthetic followup salon',
      timezone_name: 'Europe/Moscow',
    };
    if (method === 'GET' && init?.body === undefined && route === 'companies')
      data = [companyData];
    else if (
      method === 'GET' &&
      init?.body === undefined &&
      route === `company/${company}`
    )
      data = companyData;
    else if (
      method === 'GET' &&
      init?.body === undefined &&
      route === `book_services/${company}`
    )
      data = {
        services: [
          {
            id: 81,
            title: 'Мужская стрижка',
            price_min: 1500,
            price_max: 1500,
            seance_length: 1800,
          },
        ],
      };
    else if (
      method === 'GET' &&
      init?.body === undefined &&
      route === `service_categories/${company}`
    )
      data = [];
    else if (
      method === 'GET' &&
      init?.body === undefined &&
      [
        `company/${company}/staff`,
        `staff/${company}`,
        `book_staff/${company}`,
      ].includes(route)
    )
      data = [
        { id: 71, name: 'Артём', bookable: true, fired: false, hidden: false },
      ];
    else if (
      method === 'GET' &&
      init?.body === undefined &&
      route === `book_times/${company}/71/${day}`
    ) {
      const row = (await ledger())[0];
      data = ['17:00', '17:30', '18:00']
        .filter(
          (time) => !row || row.canceled || row.start !== `${day}T${time}:00`,
        )
        .map((time) => ({ time, seance_length: 1800 }));
    } else if (method === 'POST' && route === `book_record/${company}`) {
      assert.equal(typeof init?.body, 'string');
      const payload = JSON.parse(init!.body as string) as Record<
        string,
        unknown
      >;
      expect(payload).toMatchObject({
        notify_by_email: 0,
        notify_by_sms: 0,
        appointments: [
          { staff_id: 71, services: [81], datetime: `${day}T17:00:00` },
        ],
      });
      expect(payload.appointments).toHaveLength(1);
      expect(await ledger()).toHaveLength(0);
      await db.prisma
        .$executeRaw`INSERT INTO followup_test_provider(record_id,start,posts) VALUES(${recordId},${day + 'T17:00:00'},1)`;
      data = [{ id: 1, record_id: recordId }];
    } else if (method === 'PUT' && route === `record/${company}/${recordId}`) {
      assert.equal(typeof init?.body, 'string');
      const payload = JSON.parse(init!.body as string) as Record<
        string,
        unknown
      >;
      expect(payload).toMatchObject({
        datetime: `${day}T17:30:00`,
        staff_id: 71,
        send_sms: false,
        save_if_busy: false,
      });
      expect(await ledger()).toEqual([
        {
          record_id: recordId,
          start: `${day}T17:00:00`,
          canceled: false,
          posts: 1,
          puts: 0,
          deletes: 0,
        },
      ]);
      await db.prisma
        .$executeRaw`UPDATE followup_test_provider SET start=${day + 'T17:30:00'},puts=puts+1 WHERE record_id=${recordId}`;
      data = await detail();
    } else if (
      method === 'DELETE' &&
      route === `record/${company}/${recordId}`
    ) {
      expect(await ledger()).toEqual([
        {
          record_id: recordId,
          start: `${day}T17:30:00`,
          canceled: false,
          posts: 1,
          puts: 1,
          deletes: 0,
        },
      ]);
      await db.prisma
        .$executeRaw`UPDATE followup_test_provider SET canceled=true,deletes=deletes+1 WHERE record_id=${recordId}`;
      data = {};
    } else if (
      method === 'GET' &&
      init?.body === undefined &&
      route === `record/${company}/${recordId}`
    )
      data = await detail();
    else {
      forbidden.push(method + ':' + route);
      throw new Error(
        'Unadmitted synthetic provider route: ' + method + ' ' + route,
      );
    }
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
    });
  });
  await db.prisma.tenant.update({
    where: { id: source.tenant.id },
    data: { calendarSource: CalendarSource.EXTERNAL },
  });
  const owner = await fx.user(source.tenant, UserRole.TENANT_OWNER);
  const token = await http.login(
    source.tenant.slug,
    owner.email,
    owner.password,
  );
  const connect = await request(http.app.getHttpServer())
    .post('/api/integrations/crm/connect')
    .set('Authorization', 'Bearer ' + token)
    .set('Idempotency-Key', randomUUID())
    .send({
      provider: 'yclients',
      apiToken: 'SYNTHETIC_FOLLOWUP_USER',
      expectedVersion: null,
      settingsJson: {
        companyId: company,
        currency: 'RUB',
        branchBinding: {
          contract: 'maya.crm-branch-binding/1',
          companyId: company,
          branchId: source.branchId,
        },
      },
    });
  expect(connect.status).toBe(201);
  const connected = connect.body as { receipt: { configVersion: string } };
  const activated = await request(http.app.getHttpServer())
    .post('/api/integrations/crm/activate')
    .set('Authorization', 'Bearer ' + token)
    .set('Idempotency-Key', randomUUID())
    .send({ expectedVersion: connected.receipt.configVersion });
  expect(activated.status).toBe(201);
  expect(
    (
      await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId: source.tenant.id },
      })
    ).status,
  ).toBe('active');
  const bookingCapabilities = [
    'crm.appointment.create.v1',
    'crm.appointment.reschedule.v1',
    'crm.appointment.cancel.v1',
  ];
  return {
    requests,
    forbidden,
    ledger,
    bookingCapabilities,
    async checkpoint(index: number) {
      const rows = await ledger();
      if (index < 3) expect(rows).toEqual([]);
      else
        expect(rows).toEqual([
          {
            record_id: recordId,
            start: `${day}T${index < 6 ? '17:00' : '17:30'}:00`,
            canceled: index >= 9,
            posts: 1,
            puts: index >= 6 ? 1 : 0,
            deletes: index >= 9 ? 1 : 0,
          },
        ]);
      expect(forbidden).toEqual([]);
      return rows;
    },
  };
}
