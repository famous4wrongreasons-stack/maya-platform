import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import request from 'supertest';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { MockCRMAdapter } from '../../src/crm/adapters/mock-crm.adapter';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import type { CreatedAppointment } from '../../src/crm/crm-adapter.interface';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

/** Real HTTP/auth/Action Engine/PostgreSQL; a stateful synthetic provider, no YCLIENTS call. */
describe('ADMIN booking another customer [HTTP] [PostgreSQL] [synthetic provider]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const tenants: string[] = [];
  let records: Map<string, CreatedAppointment>;
  let create: jest.SpiedFunction<MockCRMAdapter['createAppointment']>;
  let move: jest.SpiedFunction<MockCRMAdapter['rescheduleAppointment']>;
  let cancel: jest.SpiedFunction<MockCRMAdapter['cancelAppointment']>;
  let loseCreateResponse = false;
  let loseMutationResponse: 'move' | 'cancel' | null = null;
  let mutationResponseLost = false;
  let reconciliationAvailable = true;
  const recordKey = (tenantId: string, id: string) => `${tenantId}/${id}`;
  const body = {
    staff_id: 'test-staff',
    service_ids: ['test-service'],
    start: '2026-10-06T15:00:00+03:00',
    client_name: 'Synthetic guest',
    client_phone: '+79000000001',
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  beforeEach(() => {
    records = new Map();
    loseCreateResponse = false;
    loseMutationResponse = null;
    mutationResponseLost = false;
    reconciliationAvailable = true;
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        if (provider !== CrmProvider.MOCK)
          throw new Error('test refuses any external provider');
        return Object.assign(new MockCRMAdapter(config), {
          getClientAppointments: (input: {
            tenantId: string;
            phone: string;
          }) => {
            if (!reconciliationAvailable)
              throw new CrmOutcomeUnknownError('synthetic lookup unavailable');
            return Promise.resolve(
              input.phone === body.client_phone
                ? [...records.entries()]
                    .filter(([key]) => key.startsWith(`${input.tenantId}/`))
                    .map(([, row]) => ({ ...row }))
                : [],
            );
          },
          getAppointmentDetail: (input: {
            tenantId: string;
            externalId: string;
          }) => {
            if (mutationResponseLost && !reconciliationAvailable)
              throw new CrmOutcomeUnknownError('synthetic lookup unavailable');
            const row = records.get(
              recordKey(input.tenantId, input.externalId),
            );
            if (!row)
              throw new NotFoundException('synthetic appointment absent');
            return Promise.resolve({
              id: row.external_id,
              provider: { id: row.staff_id, name: 'Synthetic staff' },
              client: { id: 'test-client', name: 'Synthetic guest' },
              client_phone: body.client_phone,
              branch: null,
              service_ids: row.service_ids,
              services: [],
              start_at: row.start,
              end_at: new Date(
                new Date(row.start).getTime() + 30 * 60_000,
              ).toISOString(),
              status: row.status,
              notes: null,
              total_price: null,
              currency: 'RUB',
              duration_minutes: 30,
              paid: false,
              can_edit: true,
            });
          },
        });
      });
    create = jest
      .spyOn(MockCRMAdapter.prototype, 'createAppointment')
      .mockImplementation((input) => {
        const row = {
          external_id: randomUUID(),
          status: 'confirmed',
          start: input.start,
          staff_id: input.staffId,
          service_ids: input.serviceIds,
          branch_id: input.branchId ?? null,
        };
        records.set(recordKey(input.tenantId, row.external_id), row);
        if (loseCreateResponse)
          throw new CrmOutcomeUnknownError('synthetic lost response');
        return Promise.resolve(row);
      });
    move = jest
      .spyOn(MockCRMAdapter.prototype, 'rescheduleAppointment')
      .mockImplementation((input) => {
        const row = records.get(recordKey(input.tenantId, input.externalId));
        if (!row) throw new NotFoundException('synthetic appointment absent');
        row.start = input.start;
        row.staff_id = input.staffId ?? row.staff_id;
        row.service_ids = input.serviceIds ?? row.service_ids;
        if (loseMutationResponse === 'move') {
          mutationResponseLost = true;
          throw new CrmOutcomeUnknownError('synthetic lost response');
        }
        return Promise.resolve({ ...row });
      });
    cancel = jest
      .spyOn(MockCRMAdapter.prototype, 'cancelAppointment')
      .mockImplementation((input) => {
        const row = records.get(recordKey(input.tenantId, input.externalId));
        if (!row) throw new NotFoundException('synthetic appointment absent');
        row.status = 'canceled';
        if (loseMutationResponse === 'cancel') {
          mutationResponseLost = true;
          throw new CrmOutcomeUnknownError('synthetic lost response');
        }
        return Promise.resolve({
          external_id: row.external_id,
          status: row.status,
        });
      });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    http.recorder.clear();
    // Retain independent Action Engine evidence and its actor FKs in the proof DB.
    for (const id of tenants.splice(0))
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });

  async function salon(label: string, role = UserRole.ADMINISTRATOR) {
    const tenant = await fx.tenant(label, CalendarSource.EXTERNAL);
    tenants.push(tenant.id);
    const user = await fx.user(tenant, role);
    await fx.grantFeature(tenant, 'crm.integration');
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.MOCK,
        encryptedApiToken: db.encryption.encrypt('synthetic-test-only'),
        status: 'active',
      },
    });
    const token = await http.login(tenant.slug, user.email, user.password);
    const post = (
      path: string,
      key: string,
      value: Record<string, unknown> = {},
    ) =>
      request(http.app.getHttpServer())
        .post(`/api/integrations/crm/journal/appointments${path}`)
        .set('Authorization', `Bearer ${token}`)
        .set('idempotency-key', key)
        .send(value);
    return { tenant, user, post };
  }

  it('creates another customer once, moves the same record and cancels through three canonical actions', async () => {
    const f = await salon('Admin chain');
    const key = randomUUID();
    const first = await f.post('', key, body);
    if (first.status !== 201) throw new Error(JSON.stringify(first.body));
    const created = first.body as CreatedAppointment;
    expect(created.start).toBe('2026-10-06T12:00:00.000Z');
    const replay = await f.post('', key, body);
    expect(replay.body).toEqual(first.body);
    expect(create).toHaveBeenCalledTimes(1);
    const input = create.mock.calls[0][0] as {
      tenantId: string;
      clientId: string;
      clientName: string;
      clientPhone: string;
      creationMode: string;
      notifyBySmsHours: number;
    };
    expect(input).toMatchObject({
      tenantId: f.tenant.id,
      clientName: body.client_name,
      clientPhone: body.client_phone,
      creationMode: 'admin',
      notifyBySmsHours: 0,
    });
    expect(input.clientId).not.toBe(f.user.id);
    const moveKey = randomUUID();
    const moved = await f.post(`/${created.external_id}/reschedule`, moveKey, {
      start: '2026-10-07T18:00:00+03:00',
    });
    if (moved.status !== 201) throw new Error(JSON.stringify(moved.body));
    expect(moved.status).toBe(201);
    expect(moved.body).toMatchObject({
      external_id: created.external_id,
      start: '2026-10-07T15:00:00.000Z',
    });
    expect(
      (
        await f.post(`/${created.external_id}/reschedule`, moveKey, {
          start: '2026-10-07T18:00:00+03:00',
        })
      ).status,
    ).toBe(201);
    const cancelKey = randomUUID();
    expect(
      (await f.post(`/${created.external_id}/cancel`, cancelKey)).status,
    ).toBe(201);
    expect(
      (await f.post(`/${created.external_id}/cancel`, cancelKey)).status,
    ).toBe(201);
    expect(move).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(1);
    expect(
      records.get(recordKey(f.tenant.id, created.external_id))?.status,
    ).toBe('canceled');
    const actions = await db.prisma.actionExecution.findMany({
      where: { tenantId: f.tenant.id },
    });
    expect(actions).toHaveLength(3);
    expect(actions.every((action) => action.state === 'SUCCEEDED')).toBe(true);
  });

  it('isolates two salons using the same caller key and rejects the client at the admin boundary', async () => {
    const one = await salon('Admin first salon'),
      two = await salon('Admin second salon');
    const key = randomUUID();
    const first = await one.post('', key, body),
      second = await two.post('', key, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const record = first.body as CreatedAppointment;
    expect(second.body).not.toEqual(first.body);
    expect(
      (await two.post(`/${record.external_id}/cancel`, randomUUID())).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      records.get(recordKey(one.tenant.id, record.external_id))?.status,
    ).toBe('confirmed');
    const client = await salon('Client cannot admin', UserRole.CLIENT);
    expect((await client.post('', randomUUID(), body)).status).toBe(403);
    expect(create).toHaveBeenCalledTimes(2);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: client.tenant.id },
      }),
    ).toBe(0);
  });

  it('keeps an unresolved response UNKNOWN with manual reconciliation required and never redispatches', async () => {
    const f = await salon('Admin unknown');
    loseCreateResponse = true;
    reconciliationAvailable = false;
    const key = randomUUID();
    const unknown = await f.post('', key, body);
    expect(unknown.status).toBe(503);
    expect(unknown.body).toEqual({
      message:
        'Результат создания записи пока неизвестен. Проверьте актуальное состояние записи перед новым действием.',
      error: { code: 'crm_outcome_unknown' },
    });
    expect((await f.post('', key, body)).status).toBeGreaterThanOrEqual(400);
    expect(create).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(1);
    const actions = await db.prisma.actionExecution.findMany({
      where: { tenantId: f.tenant.id },
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      state: 'UNKNOWN',
      reconciliationState: 'MANUAL_REQUIRED',
    });
    reconciliationAvailable = true;
    expect((await f.post('', key, body)).status).toBeGreaterThanOrEqual(400);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reconciles a lost response from authoritative provider state without another create', async () => {
    const f = await salon('Admin reconciled');
    loseCreateResponse = true;
    const key = randomUUID();
    const recovered = await f.post('', key, body);
    expect(recovered.status).toBe(201);
    expect((recovered.body as CreatedAppointment).external_id).toBe(
      [...records.values()][0].external_id,
    );
    expect((await f.post('', key, body)).body).toEqual(recovered.body);
    expect(create).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(1);
    expect(
      await db.prisma.actionExecution.findFirstOrThrow({
        where: { tenantId: f.tenant.id },
      }),
    ).toMatchObject({ state: 'SUCCEEDED' });
  });

  it.each(['move', 'cancel'] as const)(
    'exposes UNKNOWN for %s while retaining exactly one provider effect',
    async (operation) => {
      const f = await salon(`Admin uncertain ${operation}`);
      const created = await f.post('', randomUUID(), body);
      expect(created.status).toBe(201);
      const id = (created.body as CreatedAppointment).external_id;
      loseMutationResponse = operation;
      reconciliationAvailable = false;
      const key = randomUUID();
      const path = `/${id}/${operation === 'move' ? 'reschedule' : 'cancel'}`;
      const input =
        operation === 'move' ? { start: '2026-10-07T18:00:00+03:00' } : {};
      const unknown = await f.post(path, key, input);
      expect(unknown.status).toBe(503);
      expect(unknown.body).toMatchObject({
        error: { code: 'crm_outcome_unknown' },
      });
      expect((await f.post(path, key, input)).status).toBe(503);
      expect(operation === 'move' ? move : cancel).toHaveBeenCalledTimes(1);
      expect(records.get(recordKey(f.tenant.id, id))).toMatchObject(
        operation === 'move'
          ? { start: '2026-10-07T15:00:00.000Z' }
          : { status: 'canceled' },
      );
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: f.tenant.id, state: 'UNKNOWN' },
        }),
      ).toBe(1);
    },
  );
});
