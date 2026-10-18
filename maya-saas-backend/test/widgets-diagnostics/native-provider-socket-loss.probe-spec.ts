/** Diagnostic proof only: native YclientsCRMAdapter, actual loopback HTTP and
 * a test-provider PostgreSQL ledger. No fetch/operation override and no supplied
 * UNKNOWN verdict. The exact source candidate is pinned by the external runner. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { Client as PgClient } from 'pg';
import request from 'supertest';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import {
  bootFixtureContext,
  type FixtureContext,
} from '../widgets-live/support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from '../widgets-live/support/http-bootstrap';
import type { Fixtures } from '../widgets-live/support/fixtures';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import {
  bindCandidateSource,
  type CandidateSource,
} from '../widgets-live/support/current-candidate-sources';
import { assertProofDatabase } from '../widgets-live/support/proof-db-guard';
import {
  firstOption,
  firstSlot,
  list,
  object,
  observe,
  submit,
} from '../widgets-live/support/release-booking-flow';

const proof = assertProofDatabase();
assert.match(
  proof.database,
  /^maya_widget_gate_proof_native_socket_[a-f0-9]+$/,
);
const output = process.env.JEST_NATIVE_SOCKET_OUTPUT;
assert.ok(output, 'Use native-provider-socket-proof.mjs');
const HEALTHY = 450001,
  LOSS = 450002;
const capability = 'crm.appointment.create.v1';
const nativeFetch = globalThis.fetch;
const observations: Record<string, unknown> = {
  contract: 'maya.native-provider-socket-proof/1',
  status: 'INCOMPLETE',
  candidate: '6356db1875545337e34b6c8888b7ca858bb64361',
  provider: 'LOOPBACK_HTTP_AND_SYNTHETIC_POSTGRESQL',
  adapter:
    process.env.JEST_NATIVE_SOCKET_COUNTERFACTUAL === 'definite-outcome'
      ? 'TEST_COPY_NATIVE_TRANSPORT_CATCH_MUTATED'
      : 'UNMODIFIED_YCLIENTS_ADAPTER',
  fetchMocked: false,
  operationOverridden: false,
  suppliedUnknownVerdict: false,
  providerUniquenessOrIdempotencyGuard: false,
  realProviderEffects: 0,
  realModelCalls: 0,
  releaseCertification: 'NOT_ISSUED',
};

describe('native provider durable POST then actual socket loss [HTTP/PG diagnostic]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    ledger: PgClient,
    server: Server;
  let origin: string, schema: string;
  const sources = new Map<string, CandidateSource>();
  const companies = new Map<number, CandidateSource>();
  const counters = new Map<
    number,
    {
      posts: number;
      socketLosses: number;
      reconciliations: number;
      reads: number;
    }
  >();
  const errors: string[] = [];
  let complete = false;
  const counts = (company: number) => {
    const found = counters.get(company);
    assert.ok(found, 'Unknown synthetic company');
    return found;
  };
  const rows = async (company: number) =>
    (
      await ledger.query(
        `SELECT id::int, payload FROM ${schema}.bookings WHERE company_id=$1 ORDER BY id`,
        [company],
      )
    ).rows as Array<{ id: number; payload: Record<string, unknown> }>;

  beforeAll(async () => {
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    assert.equal(jest.isMockFunction(globalThis.fetch), false);
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    ledger = new PgClient({ connectionString: proof.connectionString });
    await ledger.connect();
    schema = 'native_socket_' + randomUUID().replaceAll('-', '');
    await ledger.query(`CREATE SCHEMA ${schema}`);
    // Surrogate row identity only: repeated identical POSTs create repeated rows.
    // There is deliberately no company/payload uniqueness or provider idempotency.
    await ledger.query(
      `CREATE TABLE ${schema}.bookings (id bigserial primary key, company_id integer not null, payload jsonb not null)`,
    );
    server = createServer((req, res) => {
      void (async () => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          assert.equal(
            req.headers.authorization,
            'Bearer SYNTHETIC_NATIVE_SOCKET_PARTNER, User SYNTHETIC_NATIVE_SOCKET_USER',
          );
          assert.equal(req.headers.accept, 'application/vnd.yclients.v2+json');
          assert.ok(url.pathname.startsWith('/api/v1/'));
          const route = url.pathname.slice('/api/v1/'.length);
          const companyInfo = (company: number) => ({
            id: company,
            title: 'Synthetic socket proof salon',
            timezone_name: 'Europe/Moscow',
          });
          const reply = (data: unknown, status = 200) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                success: status === 200,
                data,
                meta: { total_count: Array.isArray(data) ? data.length : 1 },
              }),
            );
          };
          if (req.method === 'GET' && route === 'companies') {
            assert.equal(url.search, '?my=1');
            reply([...companies.keys()].map(companyInfo));
            return;
          }
          const numbers = route.split('/').filter((part) => /^\d+$/.test(part));
          const company = Number(numbers[0]);
          const source = companies.get(company);
          assert.ok(source, 'Only the two admitted synthetic companies exist');
          const counter = counts(company);
          const day = source.startsAt.slice(0, 10);
          if (req.method === 'GET') {
            counter.reads++;
            if (route === `company/${company}`) reply(companyInfo(company));
            else if (route === `book_services/${company}`)
              reply({
                services: [
                  {
                    id: 81,
                    title: 'Мужская стрижка',
                    price_min: 1500,
                    price_max: 1500,
                    seance_length: 1800,
                  },
                ],
              });
            else if (route === `service_categories/${company}`) reply([]);
            else if (
              [
                `company/${company}/staff`,
                `staff/${company}`,
                `book_staff/${company}`,
              ].includes(route)
            )
              reply([
                {
                  id: 71,
                  name: 'Артём',
                  bookable: true,
                  fired: false,
                  hidden: false,
                },
              ]);
            else if (route === `book_times/${company}/71/${day}`) {
              assert.equal(url.searchParams.get('date'), day);
              assert.deepEqual(url.searchParams.getAll('service_ids[]'), [
                '81',
              ]);
              assert.deepEqual([...url.searchParams.keys()].sort(), [
                'date',
                'service_ids[]',
              ]);
              reply([{ time: '17:00', seance_length: 1800 }]);
            } else throw new Error('Unadmitted read route');
            return;
          }
          let raw = '';
          for await (const part of req) {
            raw += String(part);
            assert.ok(
              Buffer.byteLength(raw) <= 65536,
              'Finite synthetic request size',
            );
          }
          const payload: unknown = JSON.parse(raw);
          if (req.method === 'POST' && route === `book_record/${company}`) {
            expect(payload).toMatchObject({
              notify_by_email: 0,
              notify_by_sms: 0,
              appointments: [
                {
                  id: 1,
                  staff_id: 71,
                  services: [81],
                  datetime: `${day}T17:00:00`,
                },
              ],
            });
            expect(object(payload).appointments).toHaveLength(1);
            counter.posts++;
            // Each POST owns its own transaction/connection: neither a unique
            // constraint nor connection serialization can hide duplicate effects.
            const transaction = new PgClient({
              connectionString: proof.connectionString,
            });
            await transaction.connect();
            let inserted: number;
            try {
              await transaction.query('BEGIN');
              const result = await transaction.query(
                `INSERT INTO ${schema}.bookings(company_id,payload) VALUES ($1,$2::jsonb) RETURNING id::int`,
                [company, JSON.stringify(payload)],
              );
              inserted = Number(result.rows[0].id);
              await transaction.query('COMMIT');
            } finally {
              await transaction.end();
            }
            if (company === LOSS) {
              counter.socketLosses++;
              // The durable provider COMMIT preceded this actual TCP failure.
              // No bytes/status reach the native adapter and no error is supplied
              // by this test to the adapter, CRM owner or Action Engine.
              req.socket.destroy();
            } else reply([{ id: 1, record_id: inserted }]);
            return;
          }
          if (
            req.method === 'POST' &&
            route === `company/${company}/clients/search`
          ) {
            counter.reconciliations++;
            // A failed provider read cannot prove either success or absence.
            reply({ error: 'synthetic_reconciliation_unavailable' }, 503);
            return;
          }
          throw new Error('Unadmitted mutation route');
        } catch {
          errors.push('synthetic_provider_contract_failure');
          res.destroy();
        }
      })();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    origin = `http://127.0.0.1:${address.port}`;
    // Bind only the transport destination and synthetic credentials at the
    // existing factory seam. Every native operation/serializer/parser is real.
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        assert.equal(provider, CrmProvider.YCLIENTS);
        assert.equal(config.apiToken, 'SYNTHETIC_NATIVE_SOCKET_USER');
        const settings = object(config.settings);
        assert.ok(companies.has(Number(settings.companyId)));
        return new YclientsCRMAdapter(
          { ...config, baseUrl: origin + '/api/v1' },
          'SYNTHETIC_NATIVE_SOCKET_PARTNER',
        );
      });
    // Only utterance interpretation is synthetic. The ordinary chat owner
    // resolves the current branch and seals selector scope; a direct catalog
    // read intentionally lacks that authority and cannot stand in for it.
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        const tenantId = http.app.get(TenantContextService).requireTenantId();
        assert.ok(
          [...companies.values()].some(
            (source) => source.tenant.id === tenantId,
          ),
        );
        assert.equal(
          input.messages.filter((message) => message.role === 'user').at(-1)
            ?.content,
          'Хочу записаться',
        );
        const calls = Number(observations.scriptedModelCalls ?? 0) + 1;
        assert.ok(calls <= 8, 'Finite synthetic model interpretation only');
        observations.scriptedModelCalls = calls;
        return Promise.resolve({
          reply: '',
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [
                {
                  intent: 'booking.prepare_personal',
                  entities: {},
                  confidence: 0.99,
                },
              ],
            },
            input.principalRole ?? UserRole.CLIENT,
            input.tools.map((tool) => tool.name),
            input.conversationPlan,
          ),
          toolCall: input.toolResults.length
            ? null
            : { name: 'catalog.services.read', arguments: {} },
          provider: 'openai',
          model: 'SCRIPTED_SYNTHETIC_NATIVE_SOCKET',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });

  afterAll(async () => {
    observations.status = complete ? 'PASS' : 'FAIL';
    observations.providerContractFailures = errors.length;
    observations.syntheticCounters = {
      healthy: counters.get(HEALTHY) ?? null,
      socketLoss: counters.get(LOSS) ?? null,
    };
    observations.fetchIdentityUnchanged = globalThis.fetch === nativeFetch;
    writeFileSync(output!, JSON.stringify(observations, null, 2) + '\n', {
      mode: 0o600,
    });
    jest.restoreAllMocks();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (ledger) {
      if (schema) await ledger.query(`DROP SCHEMA ${schema} CASCADE`);
      await ledger.end();
    }
    // This whole disposable cluster belongs to the outer runner. Preserve the
    // canonical immutable links/AE rows for inspection instead of deleting
    // their principals and violating RESTRICT; always close both app clients.
    try {
      await http?.close();
    } finally {
      await db?.close();
    }
  });

  async function fixture(company: number) {
    const source = await bindCandidateSource(
      db,
      http,
      fx,
      {
        id:
          company === HEALTHY ? 'native-socket-healthy' : 'native-socket-loss',
        role: 'client',
        group: 'booking',
        variant: 'positive',
        userTurns: [],
        fixture: { clock: 'DYNAMIC_CANONICAL_BRANCH_TOMORROW' },
      },
      sources,
    );
    source.company = String(company);
    companies.set(company, source);
    counters.set(company, {
      posts: 0,
      socketLosses: 0,
      reconciliations: 0,
      reads: 0,
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
        apiToken: 'SYNTHETIC_NATIVE_SOCKET_USER',
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
    const expectedVersion = object(object(connect.body).receipt).configVersion;
    expect(expectedVersion).toMatch(/^[a-f0-9]{64}$/);
    const activate = await request(http.app.getHttpServer())
      .post('/api/integrations/crm/activate')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion });
    expect(activate.status).toBe(201);
    expect(
      (
        await db.prisma.crmIntegration.findUniqueOrThrow({
          where: { tenantId: source.tenant.id },
        })
      ).status,
    ).toBe('active');
    return source;
  }

  async function confirmation(source: CandidateSource) {
    const catalog = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', 'Bearer ' + source.token)
      .send({
        surface: 'web',
        audience: 'client',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Хочу записаться' }],
      });
    expect(catalog.status).toBe(201);
    const service = object(
      object(object(object(catalog.body).resolution).receipt).envelope,
    );
    expect(service.kind).toBe('SERVICE_SELECTOR');
    await observe(http, source.token, service);
    const chosen = await submit(
      http,
      source.token,
      service,
      'REFINE',
      firstOption(service),
    );
    observations['selection-' + source.company] = {
      receipt_outcome: chosen.receipt_outcome,
      code: chosen.code,
      owner_decision: chosen.owner_decision,
    };
    expect(chosen.receipt_outcome).toBe('ACCEPTED');
    const staff = object(chosen.next_envelope);
    expect(staff.kind).toBe('STAFF_SELECTOR');
    await observe(http, source.token, staff);
    const selected = await submit(
      http,
      source.token,
      staff,
      'REFINE',
      firstOption(staff),
    );
    expect(selected).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { kind: 'booking_selection_pending', next: 'date' },
    });
    const availability = await http.executeTool(
      source.token,
      'booking.availability.read',
      {
        surface: 'web',
        arguments: {
          branch_id: source.branchId,
          date: source.startsAt.slice(0, 10),
          staff_id: '71',
          service_ids: ['81'],
        },
      },
      randomUUID(),
    );
    expect(availability.status).toBe(201);
    const slots = object(
      object(object(object(availability.body).resolution).receipt).envelope,
    );
    expect(slots.kind).toBe('TIME_SLOT_SELECTOR');
    expect(object(object(availability.body).result).timezone).toBe(
      'Europe/Moscow',
    );
    const draft = await submit(
      http,
      source.token,
      slots,
      'DRAFT',
      firstSlot(slots).slot_ref,
    );
    expect(draft.receipt_outcome).toBe('ACCEPTED');
    const result = object(draft.next_envelope);
    expect(result.kind).toBe('BOOKING_CONFIRMATION');
    expect(counts(Number(source.company)).posts).toBe(0);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: source.tenant.id, capability },
      }),
    ).toBe(0);
    return result;
  }

  it('healthy native catalog → availability → canonical confirmation → COMMIT persists exactly one booking', async () => {
    const source = await fixture(HEALTHY);
    const preview = await confirmation(source);
    const result = await submit(http, source.token, preview, 'COMMIT');
    expect(result.receipt_outcome).toBe('ACCEPTED');
    const executions = await db.prisma.actionExecution.findMany({
      where: { tenantId: source.tenant.id, capability },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      state: 'SUCCEEDED',
      executionAttemptCount: 1,
    });
    expect(await rows(HEALTHY)).toHaveLength(1);
    expect(counts(HEALTHY)).toMatchObject({ posts: 1, socketLosses: 0 });
    expect(
      await db.prisma.appointment.count({
        where: {
          tenantId: source.tenant.id,
          source: 'external',
          crmProvider: 'yclients',
        },
      }),
    ).toBe(1);
    expect(errors).toEqual([]);
    observations.healthy = {
      state: 'SUCCEEDED',
      providerBookings: 1,
      executionAttempts: 1,
      nativeHttp: true,
    };
  });

  it('durable native POST followed by real socket loss stays UNKNOWN; normal and six concurrent retries cannot duplicate', async () => {
    const source = await fixture(LOSS);
    const preview = await confirmation(source);
    const first = await submit(http, source.token, preview, 'COMMIT');
    const execution = await db.prisma.actionExecution.findFirstOrThrow({
      where: { tenantId: source.tenant.id, capability },
    });
    const attempts = await db.prisma.actionAttempt.findMany({
      where: {
        tenantId: source.tenant.id,
        actionExecutionId: execution.id,
        kind: 'EXECUTION',
      },
      orderBy: { attemptNumber: 'asc' },
    });
    // Save only non-sensitive state/class facts BEFORE assertions so a realm
    // mismatch cannot disappear behind a plausible terminal UI response.
    observations.socketLossInitial = {
      state: execution.state,
      executionAttemptCount: execution.executionAttemptCount,
      attempts: attempts.map((attempt) => ({
        state: attempt.state,
        errorClass: attempt.errorClass,
        outcomeCode: attempt.outcomeCode,
      })),
      providerBookings: (await rows(LOSS)).length,
    };
    expect(first).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { state: 'UNKNOWN' },
    });
    expect(execution).toMatchObject({
      state: 'UNKNOWN',
      executionAttemptCount: 1,
    });
    expect(attempts).toHaveLength(1);
    // The native CrmOutcomeUnknownError is classified by the actual CrmService
    // into this durable canonical errorClass (not the JS constructor name).
    expect(attempts[0]).toMatchObject({
      state: 'UNKNOWN',
      errorClass: 'crm_outcome_unknown',
      outcomeCode: 'crm_provider_outcome_unknown',
    });
    expect(counts(LOSS)).toMatchObject({ posts: 1, socketLosses: 1 });
    expect(counts(LOSS).reconciliations).toBeGreaterThan(0);
    const normal = await submit(http, source.token, preview, 'COMMIT');
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () =>
        submit(http, source.token, preview, 'COMMIT'),
      ),
    );
    for (const result of [first, normal, ...concurrent])
      expect(JSON.stringify(result)).not.toContain('Запись подтверждена.');
    expect(counts(LOSS).posts).toBe(1);
    expect(await rows(LOSS)).toHaveLength(1);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: source.tenant.id, capability },
      }),
    ).toBe(1);
    expect(
      await db.prisma.actionExecution.findUniqueOrThrow({
        where: { id: execution.id },
      }),
    ).toMatchObject({ state: 'UNKNOWN', executionAttemptCount: 1 });
    expect(
      await db.prisma.appointment.count({
        where: { tenantId: source.tenant.id },
      }),
    ).toBe(0);
    const page = await http.resolveWidgets(source.token, {
      thread_page: { limit: 30 },
    });
    expect(page.status).toBe(200);
    const widget = list(object(page.body).widgets)
      .map(object)
      .find((row) => object(row.envelope).widget_id === preview.widget_id);
    expect(widget?.terminal_lines).toEqual([
      {
        outcome: 'SUBMITTED',
        text: 'Результат пока не подтверждён. Не отправляйте повторно.',
        action_receipt_ref: null,
      },
    ]);
    expect(errors).toEqual([]);
    expect(globalThis.fetch).toBe(nativeFetch);
    observations.socketLoss = {
      state: 'UNKNOWN',
      nativeErrorClassification: 'crm_outcome_unknown',
      providerBookings: 1,
      executionAttempts: 1,
      normalRetries: 1,
      concurrentRetries: 6,
      noFalseSuccess: true,
      reconciliation: 'SAFELY_PENDING',
    };
    complete = observations.healthy !== undefined;
  });
});
