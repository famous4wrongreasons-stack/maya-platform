// Qualified local proof only: synthetic A18 links, intercepted model serializer,
// owned loopback provider. No model/SMS/YCLIENTS request leaves this process.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { Client as PgClient } from 'pg';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { MockCRMAdapter } from '../../src/crm/adapters/mock-crm.adapter';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import { PersonalClientReadService } from '../../src/appointments/personal-client-read.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_PERSONAL_OWNER_STAGE;
const receipt = process.env.JEST_PERSONAL_OWNER_RECEIPT!;
const output = process.env.JEST_PERSONAL_OWNER_OUTPUT!;
if (!['prepare', 'resume'].includes(stage ?? '') || !receipt || !output)
  throw new Error('Use personal-owner-proof.mjs');
const database = assertProofDatabase();
if (!/^maya_widget_gate_proof_personalowner_[a-f0-9]+$/.test(database.database))
  throw new Error('Fresh owned personal-owner database required');
type Salon = {
  tenant: TenantFixture;
  user: UserFixture;
  linkId: string;
  dto: {
    staffId: string;
    serviceIds: string[];
    start: string;
    branchId: string;
  };
};
type Saved = {
  database: string;
  pid: number;
  pgStarted: string;
  schema: string;
  success: Salon;
  unknown: Salon;
  foreign: Salon;
  revoked: Salon;
  notBefore: number;
  conversationId: string;
  privateReply: string;
};

describe('Owner personal booking HTTP/read/restart [SYNTHETIC IDENTITY / SERIALIZED SCRIPTED MODEL / OWN PROVIDER]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  let ledger: PgClient, server: Server, providerUrl: string, schema: string;
  const requests: string[] = [],
    unexpected: string[] = [];
  let dispatches = 0,
    reconciliations = 0;
  const observations: Record<string, unknown> = {
    stage,
    qualification: 'NOT_ISSUED',
    syntheticA18Verifier: true,
    realModelAcceptance: false,
    externalProviderAcceptance: false,
  };
  beforeAll(async () => {
    if (stage === 'resume')
      saved = JSON.parse(readFileSync(receipt, 'utf8')) as Saved;
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const reads = http.app.get(PersonalClientReadService);
    const preview = reads.preview.bind(reads),
      results = reads.results.bind(reads);
    jest
      .spyOn(reads, 'preview')
      .mockImplementation((...args) =>
        http.recorder.within('personal-read-preview', () => preview(...args)),
      );
    jest
      .spyOn(reads, 'results')
      .mockImplementation((...args) =>
        http.recorder.within('personal-read-results', () => results(...args)),
      );
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    config.set('AI_CORE_PROVIDER', 'openai');
    config.set('OPENAI_API_KEY', 'synthetic-transport-no-credential');
    config.set('OPENAI_AI_CORE_MODEL', 'SCRIPTED_LOCAL_SERIALIZATION_PROOF');
    config.set('PHONE_AUTH_PROVIDER', 'smsru');
    config.set('SMSRU_API_ID', 'synthetic-no-credential');
    ledger = new PgClient({ connectionString: database.connectionString });
    await ledger.connect();
    schema =
      stage === 'resume'
        ? saved.schema
        : 'personal_owner_provider_' + randomUUID().replaceAll('-', '');
    if (stage === 'prepare') {
      await ledger.query(`CREATE SCHEMA ${schema}`);
      await ledger.query(
        `CREATE TABLE ${schema}.bookings (id bigserial primary key, payload jsonb not null)`,
      );
    }
    server = createServer((req, res) => {
      void (async () => {
        if (req.method === 'POST' && req.url === '/bookings') {
          let body = '';
          for await (const part of req) body += String(part);
          await ledger.query(
            `INSERT INTO ${schema}.bookings(payload) VALUES ($1::jsonb)`,
            [body],
          );
          dispatches++;
          req.socket.destroy();
        } else if (req.method === 'GET' && req.url === '/bookings') {
          reconciliations++;
          res.writeHead(503);
          res.end('unavailable');
        } else {
          unexpected.push('provider_route');
          res.writeHead(404);
          res.end();
        }
      })().catch((e: Error) => res.destroy(e));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Listener unavailable');
    providerUrl = `http://127.0.0.1:${address.port}`;
    const originalFetch = globalThis.fetch.bind(globalThis);
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (input === providerUrl + '/bookings')
        return originalFetch(input, init);
      if (
        input !== 'https://api.openai.com/v1/responses' ||
        init?.method !== 'POST' ||
        typeof init.body !== 'string'
      ) {
        unexpected.push('external_fetch_forbidden');
        throw new Error('External network forbidden');
      }
      requests.push(init.body);
      expect(requests.length).toBeLessThanOrEqual(stage === 'prepare' ? 6 : 2);
      expect(init.body).not.toMatch(
        /PRIVATE_OWNER_VISIT|PRIVATE_PERSONAL_BRANCH|Предстоящих: 1|12:00|Release proof client/,
      );
      if (saved)
        for (const s of [saved.success, saved.unknown, saved.foreign]) {
          for (const value of [
            s.tenant.id,
            s.user.id,
            s.user.email,
            s.linkId,
            s.dto.start,
          ])
            expect(init.body).not.toContain(value);
        }
      const wire = JSON.parse(init.body) as { input: string };
      const planRequest = JSON.parse(wire.input) as {
        phase: string;
        conversation: Array<{ role: string; content: string }>;
        tool_results: unknown[];
      };
      expect(planRequest.phase).toBe('tool_planning');
      expect(planRequest.conversation.every((m) => m.role === 'user')).toBe(
        true,
      );
      expect(planRequest.tool_results).toEqual([]);
      const plan = {
        semantic_plan: {
          parent_request: 'Покажи мои личные записи',
          language: 'ru',
          dialogue_act: 'question',
          tasks: [
            {
              id: 'own',
              intent: 'booking.list_own',
              entities_json: '{}',
              depends_on: [],
              confidence: 1,
              requires_clarification: false,
              clarification_question: null,
            },
          ],
          context: {
            carried_slots: [],
            replaced_slots: [],
            unresolved_references: [],
          },
        },
        tool_call: { name: 'appointments.own.list', arguments_json: '{}' },
      };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [{ type: 'output_text', text: JSON.stringify(plan) }],
              },
            ],
            usage: {},
          }),
          { status: 200 },
        ),
      );
    });
    const adapter = new MockCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic-no-credential',
    });
    adapter.createAppointment = async (params) => {
      try {
        await fetch(providerUrl + '/bookings', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      } catch (e) {
        expect(e).toMatchObject({ name: 'TypeError', message: 'fetch failed' });
        throw new CrmOutcomeUnknownError(
          'Owned response lost after persistence',
          e,
        );
      }
      throw new Error('Expected lost response');
    };
    adapter.getClientAppointments = async () => {
      const response = await fetch(providerUrl + '/bookings');
      await response.text();
      expect(response.status).toBe(503);
      throw new CrmOutcomeUnknownError('Owned reconciliation unavailable');
    };
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider) => {
        if (provider !== CrmProvider.YCLIENTS)
          throw new Error('External provider forbidden');
        return adapter;
      });
  });
  afterAll(async () => {
    observations.readServiceWrites = {
      preview: http?.recorder.writes('personal-read-preview'),
      results: http?.recorder.writes('personal-read-results'),
    };
    observations.provider = { dispatches, reconciliations };
    observations.unexpected = unexpected;
    writeFileSync(
      path.join(output, stage + '-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
    );
    writeFileSync(
      path.join(output, stage + '-serialized-model-requests.json'),
      JSON.stringify(
        { syntheticTransportOnly: true, externalNetworkCalls: 0, requests },
        null,
        2,
      ) + '\n',
    );
    jest.restoreAllMocks();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    await ledger?.end();
    await http?.close();
    await db?.close();
  });
  async function salon(external = false): Promise<Salon> {
    const tenant = await fx.tenant(
      'Synthetic personal owner',
      CalendarSource.INTERNAL,
    );
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'Europe/Moscow' },
    });
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    const source = await fx.bookingSource(tenant, user, true);
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'PRIVATE_PERSONAL_BRANCH',
        timezone: 'Europe/Moscow',
      },
    });
    await db.prisma.internalProvider.update({
      where: { id: source.staffId },
      data: { branchId: branch.id },
    });
    for (const f of [
      'booking',
      'booking.customer_app',
      'crm.integration',
      'ai.consultant',
      'ai.owner',
      'ai.admin',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, f);
    const link = await db.prisma.clientChannelLink.findFirstOrThrow({
      where: { tenantId: tenant.id, revokedAt: null },
    });
    let { staffId, serviceId } = source;
    if (external) {
      await db.prisma.tenant.update({
        where: { id: tenant.id },
        data: { calendarSource: CalendarSource.EXTERNAL },
      });
      await db.prisma.crmIntegration.create({
        data: {
          tenantId: tenant.id,
          // Supported configured provider, with only the owned synthetic
          // adapter above. The real YCLIENTS adapter is never constructed.
          provider: 'yclients',
          settingsJson: { companyId: 900001 },
          status: 'active',
          encryptedApiToken: db.encryption.encrypt('synthetic'),
          baseUrl: providerUrl,
        },
      });
      staffId = 'provider-alex';
      serviceId = 'svc-consultation';
    } else
      await db.prisma.internalService.update({
        where: { id: serviceId },
        data: { name: 'PRIVATE_OWNER_VISIT' },
      });
    const client = await db.prisma.client.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: user.id },
    });
    const priorStart = new Date(Date.now() + 2 * 86400_000);
    priorStart.setUTCHours(9, 0, 0, 0);
    const priorEnd = new Date(priorStart.getTime() + 1800000);
    await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        mayaClientId: client.id,
        branchId: branch.id,
        source: external ? 'external' : 'internal',
        staffExternalId: staffId,
        serviceIds: [serviceId],
        startAt: priorStart,
        endAt: priorEnd,
        blockedStartAt: priorStart,
        blockedEndAt: priorEnd,
        status: 'confirmed',
      },
    });
    const date = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    return {
      tenant,
      user,
      linkId: link.id,
      dto: {
        staffId,
        serviceIds: [serviceId],
        start: date + 'T12:00:00+03:00',
        branchId: branch.id,
      },
    };
  }
  async function state(s: Salon) {
    const where = { tenantId: s.tenant.id };
    const rows = await db.prisma.actionExecution.findMany({
      where,
      select: {
        id: true,
        state: true,
        executionAttemptCount: true,
        evidenceRefsJson: true,
        actorUserId: true,
      },
    });
    const memberships = await db.prisma.membership.findMany({
      where: { ...where, userId: s.user.id },
      select: { role: true, status: true },
    });
    expect(memberships).toEqual([{ role: 'tenant_owner', status: 'active' }]);
    return { rows, appointments: await db.prisma.appointment.count({ where }) };
  }
  async function revoke(s: Salon) {
    const proof = randomUUID();
    const prior = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: s.linkId },
    });
    const hash = (v: string) => createHash('sha256').update(v).digest('hex');
    const owner = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () => Promise.reject(new Error('No new link authority')),
      verifyRevocation: (supplied) =>
        supplied === proof
          ? Promise.resolve({
              tenantId: s.tenant.id,
              provider: 'maya_user',
              providerSubjectHash: prior.providerSubjectHash,
              linkId: prior.id,
              revocationIdentityHash: hash(prior.id),
              actorProofHash: hash('synthetic'),
              reason: 'synthetic-personal-read-revocation',
              validUntil: new Date(Date.now() + 600000),
            })
          : Promise.reject(new Error('Unknown synthetic proof')),
    });
    await db.tenantContext.runAsSystemTenant(s.tenant.id, () =>
      owner.revoke({ proof }),
    );
  }
  it('current owner React form confirms canonical success, revokes safely, and never redispatches UNKNOWN after actual app/PG restart', async () => {
    const pg = await ledger.query<{ started: string }>(
      'SELECT pg_postmaster_start_time()::text AS started',
    );
    if (stage === 'prepare') {
      saved = {
        database: database.database,
        pid: process.pid,
        pgStarted: pg.rows[0].started,
        schema,
        success: await salon(),
        unknown: await salon(true),
        foreign: await salon(),
        revoked: await salon(),
        conversationId: '',
        privateReply: '',
        notBefore: 0,
      };
    } else {
      expect(saved.database).toBe(database.database);
      expect(saved.pid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(pg.rows[0].started);
      observations.applicationAndPostgresRestart = true;
    }
    const keys =
      stage === 'prepare'
        ? (['success', 'revoked', 'unknown'] as const)
        : (['success', 'unknown'] as const);
    const checkpoints: string[] = [];
    const browserOutput = path.join(output, stage + '-browser');
    mkdirSync(browserOutput);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/personal-owner-browser-probe.mjs',
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
        () => fail(new Error('Personal owner browser timed out')),
        200000,
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
              selectedStart?: string;
            };
            if (m.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output: browserOutput,
                stage,
                notBefore: stage === 'resume' ? saved.notBefore : 0,
                scenarios: keys.map((key) => ({
                  key,
                  email: saved[key].user.email,
                  serviceName:
                    key === 'unknown' ? 'Консультация' : 'PRIVATE_OWNER_VISIT',
                  staffName:
                    key === 'unknown'
                      ? 'Алексей Орлов'
                      : 'Release proof provider',
                  date: saved[key].dto.start.slice(0, 10),
                })),
              });
            } else if (m.type === 'checkpoint') {
              const key = m.name.split('-')[0] as
                'success' | 'revoked' | 'unknown';
              const salon = saved[key],
                snapshot = await state(salon);
              if (m.name.endsWith('-preview')) {
                expect(snapshot.rows).toHaveLength(0);
                expect(snapshot.appointments).toBe(1);
                expect(m.selectedStart).toBeTruthy();
                salon.dto.start = m.selectedStart!;
                // Slot branch belongs to the fresh canonical availability, not the seed row.
                if (key === 'unknown')
                  delete (salon.dto as { branchId?: string }).branchId;
                if (key === 'revoked') await revoke(salon);
              } else {
                expect(snapshot.rows).toHaveLength(key === 'revoked' ? 0 : 1);
                if (key !== 'revoked') {
                  expect(snapshot.rows[0]).toMatchObject({
                    state: key === 'success' ? 'SUCCEEDED' : 'UNKNOWN',
                    executionAttemptCount: 1,
                    actorUserId: null,
                  });
                  expect(snapshot.rows[0].evidenceRefsJson).toEqual(
                    expect.arrayContaining([
                      'personal-context:v1:personal_client',
                      `personal-actor-user:v1:${salon.user.id}`,
                      'personal-actor-role:v1:tenant_owner',
                    ]),
                  );
                }
                expect(snapshot.appointments).toBe(key === 'success' ? 2 : 1);
                observations[m.name] = {
                  state: snapshot.rows[0]?.state ?? 'REFUSED',
                  attempts: snapshot.rows[0]?.executionAttemptCount ?? 0,
                  appointments: snapshot.appointments,
                  membershipUnchanged: true,
                };
              }
              checkpoints.push(m.name);
              child.send({ type: 'continue:' + m.name });
            }
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        void pending.then(() => {
          if (failure) reject(failure);
          else if (code !== 0)
            reject(new Error('Personal owner browser failed: ' + stderr));
          else resolve();
        }, reject);
      });
    });
    if (stage === 'prepare') {
      saved.notBefore = Date.now() + 61000;
      writeFileSync(receipt, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
      expect(dispatches).toBe(1);
      expect(requests).toHaveLength(6);
    } else {
      expect(dispatches).toBe(0);
      expect(requests).toHaveLength(2);
    }
    const ledgerCount = await ledger.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${schema}.bookings`,
    );
    expect(ledgerCount.rows).toEqual([{ n: 1 }]);
    expect(unexpected).toEqual([]);
    expect(http.recorder.writes('personal-read-preview')).toEqual([]);
    expect(http.recorder.writes('personal-read-results')).toEqual([]);
    observations.providerLedgerCount = 1;
    observations.checkpoints = checkpoints;
  });
});
