import { localCalendarDate } from '../../src/owner-reports/owner-reports.time';
// Explicit registered READ over the synthetic MOCK catalog and controlled transport.
// This proves canonical AE UNKNOWN/no redispatch, not native YCLIENTS branch binding,
// native selector acceptance, or semantic conversation continuation.
import { ClientAppointmentCreateService } from '../../src/appointments/client-appointment-create.service';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { MockCRMAdapter } from '../../src/crm/adapters/mock-crm.adapter';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import type {
  CreateAppointmentParams,
  CreatedAppointment,
} from '../../src/crm/crm-adapter.interface';
import { assertProofDatabase } from './support/proof-db-guard';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import {
  firstOption,
  firstSlot,
  list,
  object,
  observe,
  submit,
} from './support/release-booking-flow';

describe('L20 registered-READ synthetic MOCK lost-response → canonical UNKNOWN [HTTP] [test provider PostgreSQL]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    ledger: PgClient,
    server: Server;
  let url: string,
    schema: string,
    dispatches = 0,
    reconciliations = 0,
    socketLosses = 0;
  beforeAll(async () => {
    const proof = assertProofDatabase();
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    ledger = new PgClient({ connectionString: proof.connectionString });
    await ledger.connect();
    schema = 'l20_provider_' + randomUUID().replaceAll('-', '');
    // Test-provider storage only. No product schema/model/migration, no uniqueness that could hide duplicate dispatch.
    await ledger.query(`CREATE SCHEMA ${schema}`);
    await ledger.query(
      `CREATE TABLE ${schema}.bookings (id bigserial primary key, payload jsonb not null)`,
    );
    server = createServer((request, response) => {
      void (async () => {
        try {
          if (request.method === 'POST' && request.url === '/bookings') {
            let raw = '';
            for await (const part of request) raw += String(part);
            const body: unknown = JSON.parse(raw);
            dispatches++;
            await ledger.query(
              `INSERT INTO ${schema}.bookings(payload) VALUES ($1::jsonb)`,
              [JSON.stringify(body)],
            );
            // COMMIT completed; the connection is lost BEFORE any response bytes.
            request.socket.destroy();
            return;
          }
          reconciliations++;
          // Actual provider read fault, not an empty result or a supplied Action Engine verdict.
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end('{"error":"controlled_read_unavailable"}');
        } catch (error) {
          response.destroy(error as Error);
        }
      })();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw Error('provider listener missing');
    url = `http://127.0.0.1:${address.port}`;
    const adapter = new MockCRMAdapter({
      provider: CrmProvider.MOCK,
      apiToken: 'synthetic-test-provider',
    });
    adapter.createAppointment = async (
      params: CreateAppointmentParams,
    ): Promise<CreatedAppointment> => {
      try {
        const response = await fetch(url + '/bookings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
        });
        return (await response.json()) as CreatedAppointment;
      } catch (error) {
        // Node fetch errors cross Jest's VM realm. Observe the actual transport failure
        // structurally; construct only the adapter error in this realm, never an AE verdict.
        expect(error).toMatchObject({
          name: 'TypeError',
          message: 'fetch failed',
        });
        socketLosses++;
        throw new CrmOutcomeUnknownError(
          'Test provider response lost after durable persistence',
          error,
        );
      }
    };
    adapter.getClientAppointments = async () => {
      const response = await fetch(url + '/bookings');
      await response.text();
      if (response.status !== 200)
        throw new CrmOutcomeUnknownError(
          'Test provider reconciliation read unavailable',
        );
      throw new Error('No successful read was configured');
    };
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider) => {
        if (provider !== CrmProvider.MOCK)
          throw new Error('L20 forbids every external provider');
        return adapter;
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (ledger) {
      await ledger.query(`DROP SCHEMA ${schema} CASCADE`);
      await ledger.end();
    }
    await fx?.teardown();
    await http?.close();
    await db?.close();
  });
  it('L20-LOST-RESPONSE: one persisted booking; UNKNOWN is natural, retries cannot duplicate, unresolved reconciliation stays pending', async () => {
    const tenant = await fx.tenant(
      'L20 provider response loss',
      CalendarSource.EXTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    await db.prisma.user.update({
      where: { id: user.id },
      data: {
        encryptedName: db.encryption.encrypt('L20 synthetic client'),
        phone: '+79990001234',
      },
    });
    await fx.client(tenant, user);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: 'mock',
        status: 'active',
        encryptedApiToken: db.encryption.encrypt('L20-test-only'),
        baseUrl: url,
      },
    });
    for (const f of [
      'widgets.runtime',
      'ai.consultant',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, f);
    const token = await http.login(tenant.slug, user.email, user.password);
    const catalog = await http.executeTool(
      token,
      'catalog.services.read',
      { arguments: {}, surface: 'web' },
      randomUUID(),
    );
    expect(catalog.status).toBe(201);
    const service = object(
      object(object(object(catalog.body).resolution).receipt).envelope,
    );
    await observe(http, token, service);
    const refused = await submit(
      http,
      token,
      service,
      'REFINE',
      firstOption(service),
    );
    expect(refused).toMatchObject({
      code: 'effect_not_admissible',
      receipt_outcome: 'REFUSED',
      next_envelope: null,
    });
    expect(dispatches).toBe(0);
    expect(
      await db.prisma.actionExecution.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
    // The native selector correctly refuses this unsupported external source.
    // This separate READ is already admitted by the registered MOCK source path.
    // Select actual current catalog facts; do not relabel MOCK as a native company.
    const serviceFact = list(object(object(catalog.body).result).services)
      .map(object)
      .find((item) => item.duration_minutes === 60);
    if (!serviceFact || typeof serviceFact.id !== 'string')
      throw new Error('L20 requires an actual 60-minute synthetic service');
    const staffRead = await http.executeTool(
      token,
      'catalog.staff.read',
      { arguments: {}, surface: 'web' },
      randomUUID(),
    );
    expect(staffRead.status).toBe(201);
    const staffFact = object(
      list(object(object(staffRead.body).result).staff)[0],
    );
    if (typeof staffFact.id !== 'string')
      throw new Error('L20 current staff identity absent');
    const trace = randomUUID();
    const availability = await http.executeTool(
      token,
      'booking.availability.read',
      {
        surface: 'web',
        arguments: {
          date: localCalendarDate(
            'Europe/Moscow',
            new Date(Date.now() + 2 * 86_400_000),
          ),
          staff_id: staffFact.id,
          service_ids: [serviceFact.id],
        },
      },
      trace,
    );
    expect(availability.status).toBe(201);
    const slots = object(
      object(object(object(availability.body).resolution).receipt).envelope,
    );
    expect(slots.kind).toBe('TIME_SLOT_SELECTOR');
    expect(object(slots.provenance).source_capability).toBe(
      'booking.availability.read',
    );
    expect(
      http
        .mintProvenance()
        .some(
          (mint) =>
            mint.widget_id === slots.widget_id &&
            mint.trigger === 'T-2b' &&
            mint.request_id === trace,
        ),
    ).toBe(true);
    const confirmation = object(
      (await submit(http, token, slots, 'DRAFT', firstSlot(slots).slot_ref))
        .next_envelope,
    );
    expect(confirmation.kind).toBe('BOOKING_CONFIRMATION');
    expect(dispatches).toBe(0);
    expect(
      await db.prisma.actionExecution.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
    const owner = http.app.get(ClientAppointmentCreateService);
    const run = owner.forAccount.bind(owner);
    let ownerError: string | null = null;
    jest.spyOn(owner, 'forAccount').mockImplementation(async (...args) => {
      try {
        return await run(...args);
      } catch (e) {
        ownerError = e instanceof Error ? e.message : String(e);
        throw e;
      }
    });
    const first = await submit(http, token, confirmation, 'COMMIT');
    if (first.receipt_outcome !== 'ACCEPTED')
      throw Error(
        JSON.stringify({ first, ownerError, dispatches, reconciliations }),
      );
    expect(first).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { state: 'UNKNOWN' },
    });
    const pending = await db.prisma.actionExecution.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(pending.state).toBe('UNKNOWN');
    expect(dispatches).toBe(1);
    expect(socketLosses).toBe(1);
    expect(reconciliations).toBeGreaterThan(0);
    const normal = await submit(http, token, confirmation, 'COMMIT');
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () =>
        submit(http, token, confirmation, 'COMMIT'),
      ),
    );
    for (const result of [first, normal, ...concurrent])
      expect(JSON.stringify(result)).not.toContain('Запись подтверждена.');
    expect(dispatches).toBe(1);
    expect(
      (await ledger.query(`SELECT count(*)::int AS n FROM ${schema}.bookings`))
        .rows,
    ).toEqual([{ n: 1 }]);
    expect(
      await db.prisma.actionExecution.count({ where: { tenantId: tenant.id } }),
    ).toBe(1);
    const row = await db.prisma.actionExecution.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(row.state).toBe('UNKNOWN');
    const emission = await db.prisma.widgetEmission.findFirstOrThrow({
      where: { tenantId: tenant.id, widgetId: String(confirmation.widget_id) },
    });
    expect(emission.terminalLinesJson).toEqual([
      {
        outcome: 'SUBMITTED',
        action_receipt_ref: null,
      },
    ]);
    const page = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    expect(page.status).toBe(200);
    const presented = list(object(page.body).widgets)
      .map(object)
      .find(
        (item) => object(item.envelope).widget_id === confirmation.widget_id,
      );
    expect(presented?.terminal_lines).toEqual([
      {
        outcome: 'SUBMITTED',
        text: 'Запрос принят. Подтверждение ожидается.',
        action_receipt_ref: null,
      },
    ]);
    expect(
      await db.prisma.appointment.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
  });
});
