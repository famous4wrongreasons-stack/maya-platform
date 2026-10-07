import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { Client as PgClient } from 'pg';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { MockCRMAdapter } from '../../src/crm/adapters/mock-crm.adapter';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const output = process.env.JEST_BOOKING_CONFIRMATION_OUTPUT!;
if (!output) throw new Error('Use booking-confirmation-proof.mjs');
const database = assertProofDatabase();
if (
  !/^maya_widget_gate_proof_bookingconfirmation_[a-f0-9]+$/.test(
    database.database,
  )
)
  throw new Error('Fresh owned booking-confirmation database required');
type Scenario = {
  key: 'success' | 'revoked' | 'unknown';
  tenant: TenantFixture;
  user: UserFixture;
  clientId: string;
  linkId: string;
  serviceId: string;
  staffId: string;
  serviceName: string;
  staffName: string;
};

describe('Current React canonical booking confirmation [SCRIPTED MODEL / SYNTHETIC A18 / OWN LOCAL PROVIDER]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let server: Server, ledger: PgClient, schema: string, providerUrl: string;
  let dispatches = 0,
    socketLosses = 0,
    reconciliations = 0,
    modelCalls = 0;
  const observations: Record<string, unknown> = {
    realModelAcceptance: false,
    externalProviderAcceptance: false,
    qualification: 'NOT_ISSUED',
  };
  const unexpected: string[] = [];
  const checkpoints: string[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    ledger = new PgClient({ connectionString: database.connectionString });
    await ledger.connect();
    schema =
      'booking_confirmation_provider_' + randomUUID().replaceAll('-', '');
    // Test-provider ledger only; no product schema or model is introduced.
    await ledger.query(`CREATE SCHEMA ${schema}`);
    await ledger.query(
      `CREATE TABLE ${schema}.bookings (id bigserial primary key, payload jsonb not null)`,
    );
    server = createServer((request, response) => {
      void (async () => {
        try {
          if (request.method === 'POST' && request.url === '/bookings') {
            let raw = '';
            for await (const chunk of request) raw += String(chunk);
            const body: unknown = JSON.parse(raw);
            await ledger.query(
              `INSERT INTO ${schema}.bookings(payload) VALUES ($1::jsonb)`,
              [JSON.stringify(body)],
            );
            dispatches++;
            request.socket.destroy(); // Durable provider write, actual lost response.
          } else if (request.method === 'GET' && request.url === '/bookings') {
            reconciliations++;
            response.writeHead(503, { 'content-type': 'application/json' });
            response.end('{"error":"controlled_read_unavailable"}');
          } else {
            unexpected.push('local_provider_route');
            response.writeHead(404);
            response.end();
          }
        } catch (e) {
          response.destroy(e as Error);
        }
      })();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Owned provider listener missing');
    providerUrl = `http://127.0.0.1:${address.port}`;
    const originalFetch = globalThis.fetch.bind(globalThis);
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (
        input !== providerUrl + '/bookings' ||
        !['GET', 'POST'].includes(init?.method ?? 'GET')
      ) {
        unexpected.push('external_fetch_forbidden');
        throw new Error('Only owned loopback test provider admitted');
      }
      return originalFetch(input, init);
    });
    const adapter = new MockCRMAdapter({
      provider: CrmProvider.MOCK,
      apiToken: 'synthetic-no-credential',
    });
    adapter.createAppointment = async (params) => {
      try {
        await fetch(providerUrl + '/bookings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
        });
        throw new Error('The test provider must lose its response');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'TypeError',
          message: 'fetch failed',
        });
        socketLosses++;
        throw new CrmOutcomeUnknownError(
          'Owned test provider response lost after persistence',
          error,
        );
      }
    };
    adapter.getClientAppointments = async () => {
      const response = await fetch(providerUrl + '/bookings');
      await response.text();
      expect(response.status).toBe(503);
      throw new CrmOutcomeUnknownError(
        'Owned test provider reconciliation unavailable',
      );
    };
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider) => {
        if (provider !== CrmProvider.MOCK)
          throw new Error('External provider forbidden');
        return adapter;
      });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        expect(
          input.messages.filter((m) => m.role === 'user').at(-1)?.content,
        ).toBe('Покажи услуги для записи');
        if (modelCalls > 6) throw new Error('Unbounded model loop');
        return Promise.resolve({
          reply: input.toolResults.length
            ? 'Выберите услугу для записи.'
            : null,
          toolCall: input.toolResults.length
            ? null
            : { name: 'catalog.services.read', arguments: {} },
          provider: 'openai',
          model: 'SCRIPTED_LOCAL_CATALOG',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });
  afterAll(async () => {
    observations.checkpoints = checkpoints;
    observations.modelCalls = modelCalls;
    observations.provider = { dispatches, socketLosses, reconciliations };
    observations.unexpected = unexpected;
    writeFileSync(
      path.join(output, 'booking-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (ledger) {
      if (schema) await ledger.query(`DROP SCHEMA ${schema} CASCADE`);
      await ledger.end();
    }
    await fx?.teardown();
    await http?.close();
    await db?.close();
  });
  async function scenario(key: Scenario['key']): Promise<Scenario> {
    const tenant = await fx.tenant(
      'Synthetic readable confirmation ' + key,
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.CLIENT);
    const source = await fx.bookingSource(tenant, user, true);
    let serviceId = source.serviceId,
      staffId = source.staffId;
    let serviceName = 'Оформление бороды',
      staffName = 'Александр';
    if (key === 'unknown') {
      await db.prisma.tenant.update({
        where: { id: tenant.id },
        data: { calendarSource: CalendarSource.EXTERNAL },
      });
      await db.prisma.crmIntegration.create({
        data: {
          tenantId: tenant.id,
          provider: 'mock',
          status: 'active',
          encryptedApiToken: db.encryption.encrypt('synthetic-test-only'),
          baseUrl: providerUrl,
        },
      });
      serviceId = 'svc-consultation';
      staffId = 'provider-alex';
      serviceName = 'Консультация';
      staffName = 'Алексей Орлов';
    } else {
      await db.prisma.internalService.update({
        where: { id: serviceId },
        data: { name: serviceName },
      });
      await db.prisma.internalProvider.update({
        where: { id: staffId },
        data: { displayName: staffName },
      });
    }
    for (const feature of [
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const client = await db.prisma.client.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: user.id },
    });
    const link = await db.prisma.clientChannelLink.findFirstOrThrow({
      where: { tenantId: tenant.id, clientId: client.id, revokedAt: null },
    });
    // Link owns booking authority; the existing user relation supplies fixture
    // contact data to the canonical creator, never a replacement Client proof.
    return {
      key,
      tenant,
      user,
      clientId: client.id,
      linkId: link.id,
      serviceId,
      staffId,
      serviceName,
      staffName,
    };
  }
  async function revoke(s: Scenario) {
    const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: s.linkId },
    });
    const proof = randomUUID();
    const hash = (v: string) => createHash('sha256').update(v).digest('hex');
    const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () => Promise.reject(new Error('Link creation forbidden')),
      verifyRevocation: (supplied) =>
        supplied === proof
          ? Promise.resolve({
              tenantId: s.tenant.id,
              provider: 'maya_user',
              providerSubjectHash: link.providerSubjectHash,
              linkId: link.id,
              revocationIdentityHash: hash(proof),
              actorProofHash: hash('actor:' + proof),
              reason: 'synthetic-confirmation-revocation',
              validUntil: new Date(Date.now() + 600000),
            })
          : Promise.reject(new Error('Unknown synthetic proof')),
    });
    await db.tenantContext.runAsSystemTenant(s.tenant.id, () =>
      owner.revoke({ proof }),
    );
  }
  it('shows current names before explicit COMMIT; success once, revoked link refused, natural UNKNOWN persists on reload', async () => {
    const scenarios: Scenario[] = [];
    // Canonical link creation uses serializable transactions; prepare the
    // three owned fixtures serially as well as the browser scenarios.
    for (const key of ['success', 'revoked', 'unknown'] as const)
      scenarios.push(await scenario(key));
    const selectedStarts = new Map<string, string>();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/booking-confirmation-browser-probe.mjs',
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
        () => fail(new Error('Booking browser timeout')),
        150000,
      );
      child.stderr!.on('data', (b: Buffer) => {
        stderr += b.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const m = raw as {
              type: string;
              name: string;
              selectedStart: string;
              confirmation: { body: { staff_label: { value: string } } };
              result: { receipt_outcome: string };
            };
            if (m.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output,
                scenarios: scenarios.map((s) => ({
                  key: s.key,
                  email: s.user.email,
                  serviceName: s.serviceName,
                  staffName: s.staffName,
                })),
              });
              return;
            }
            expect(m.type).toBe('checkpoint');
            expect(m.name).toBe(
              scenarios.flatMap((s) =>
                ['preview', 'result', 'reload'].map(
                  (stage) => s.key + '-' + stage,
                ),
              )[checkpoints.length],
            );
            const s = scenarios.find((s) => m.name.startsWith(s.key + '-'))!;
            const where = { tenantId: s.tenant.id };
            if (m.name.endsWith('-preview')) {
              expect(await db.prisma.actionExecution.count({ where })).toBe(0);
              expect(await db.prisma.appointment.count({ where })).toBe(0);
              expect(m.confirmation.body.staff_label.value).toBe(s.staffName);
              selectedStarts.set(s.key, m.selectedStart);
              if (s.key === 'revoked') await revoke(s);
            } else if (s.key === 'success') {
              expect(await db.prisma.actionExecution.count({ where })).toBe(1);
              const appointment = await db.prisma.appointment.findFirstOrThrow({
                where,
              });
              expect(appointment.mayaClientId).toBe(s.clientId);
              expect(appointment.staffExternalId).toBe(s.staffId);
              expect(appointment.startAt.toISOString()).toBe(
                new Date(selectedStarts.get(s.key)!).toISOString(),
              );
              expect(appointment.serviceIds).toEqual([s.serviceId]);
              expect(await db.prisma.appointment.count({ where })).toBe(1);
            } else if (s.key === 'revoked') {
              expect(await db.prisma.actionExecution.count({ where })).toBe(0);
              expect(await db.prisma.appointment.count({ where })).toBe(0);
            } else {
              expect(await db.prisma.actionExecution.count({ where })).toBe(1);
              expect(
                (await db.prisma.actionExecution.findFirstOrThrow({ where }))
                  .state,
              ).toBe('UNKNOWN');
              expect(await db.prisma.appointment.count({ where })).toBe(0);
              expect(dispatches).toBe(1);
              expect(socketLosses).toBe(1);
              expect(reconciliations).toBeGreaterThan(0);
              const rows = await ledger.query<{ n: number }>(
                `SELECT count(*)::int AS n FROM ${schema}.bookings`,
              );
              expect(rows.rows).toEqual([{ n: 1 }]);
            }
            expect(unexpected).toEqual([]);
            checkpoints.push(m.name);
            child.send({ type: 'continue:' + m.name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(new Error(`Browser ${code}: ${stderr.slice(-2000)}`)),
        );
      });
    });
    expect(checkpoints).toHaveLength(9);
  }, 180000);
});
