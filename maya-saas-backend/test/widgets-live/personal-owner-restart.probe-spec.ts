// Qualified local proof only: synthetic A18 links, intercepted model serializer,
// owned loopback provider. No model/SMS/YCLIENTS request leaves this process.
import request from 'supertest';
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
  conversationId: string;
  privateReply: string;
};
type Chat = { reply: string; user_turn: { conversationId: string } };

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
      expect(requests.length).toBeLessThanOrEqual(3);
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
  const login = (s: Salon) =>
    http.login(s.tenant.slug, s.user.email, s.user.password);
  const personal = (
    token: string,
    route: string,
    body?: object,
    selection = 'personal_client',
  ) => {
    const r =
      body === undefined
        ? request(http.app.getHttpServer()).get('/api/personal-client/' + route)
        : request(http.app.getHttpServer())
            .post('/api/personal-client/' + route)
            .send(body);
    return r
      .set('authorization', 'Bearer ' + token)
      .set('x-maya-authority-context', selection);
  };
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
  async function chat(
    s: Salon,
    token: string,
    prior?: Chat,
    expectPrivate = true,
  ): Promise<Chat> {
    const r = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('authorization', 'Bearer ' + token)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        ...(prior ? { conversationId: prior.user_turn.conversationId } : {}),
        messages: [
          ...(prior
            ? [
                { role: 'user', content: 'Покажи мои личные записи' },
                { role: 'assistant', content: prior.reply },
              ]
            : []),
          {
            role: 'user',
            content: prior
              ? 'Проверь мои личные записи ещё раз'
              : 'Покажи мои личные записи',
          },
        ],
      });
    expect(r.status).toBe(201);
    const body = r.body as Chat;
    if (expectPrivate) {
      expect(body.reply).toContain('PRIVATE_OWNER_VISIT');
      expect(body.reply).toMatch(/12:00/);
    } else
      expect(body.reply).not.toMatch(
        /PRIVATE_OWNER_VISIT|12:00|Предстоящих: 1/,
      );
    expect((await state(s)).rows).toHaveLength(1);
    return body;
  }
  it('keeps actual owner authority; confirms only canonical success; restart reads and replay never redispatch UNKNOWN', async () => {
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
        conversationId: '',
        privateReply: '',
      };
      for (const s of [saved.success, saved.unknown]) {
        const token = await login(s);
        expect(
          (await personal(token, 'appointments/results', undefined, 'client'))
            .status,
        ).toBe(403);
        expect(
          (
            await personal(token, 'appointments/preview', {
              ...s.dto,
              clientId: 'foreign',
            })
          ).status,
        ).toBe(400);
        const preview = await personal(token, 'appointments/preview', s.dto);
        if (preview.status !== 201)
          throw new Error(
            'Synthetic preview failed: ' + JSON.stringify(preview.body),
          );
        expect((await state(s)).rows).toHaveLength(0);
        expect(
          (await personal(token, 'appointments/results')).body,
        ).toMatchObject({ results: [], hasPending: false });
        const created = await personal(token, 'appointments', s.dto);
        expect(created.status).toBe(s === saved.success ? 201 : 503);
        const after = await state(s);
        expect(after.rows).toHaveLength(1);
        expect(after.rows[0]).toMatchObject({
          state: s === saved.success ? 'SUCCEEDED' : 'UNKNOWN',
          executionAttemptCount: 1,
          actorUserId: null,
        });
        expect(after.rows[0].evidenceRefsJson).toEqual(
          expect.arrayContaining([
            'personal-context:v1:personal_client',
            `personal-actor-user:v1:${s.user.id}`,
            'personal-actor-role:v1:tenant_owner',
          ]),
        );
        const beforeRead = JSON.stringify(after);
        const providerBeforeRead = { dispatches, reconciliations };
        const results = await personal(token, 'appointments/results');
        expect(results.status).toBe(200);
        expect(results.body).toMatchObject({
          results: [{ state: after.rows[0].state }],
          hasPending: s === saved.unknown,
        });
        expect(JSON.stringify(await state(s))).toBe(beforeRead);
        expect({ dispatches, reconciliations }).toEqual(providerBeforeRead);
        observations[s === saved.success ? 'success' : 'unknown'] = {
          state: after.rows[0].state,
          attempts: 1,
          appointments: after.appointments,
          readOnlyResults: true,
        };
      }
      const ft = await login(saved.foreign);
      expect((await personal(ft, 'appointments/results')).body).toMatchObject({
        results: [],
      });
      expect(
        (await personal(ft, 'appointments/preview', saved.success.dto)).status,
      ).not.toBe(201);
      const unlinked = await fx.user(
        saved.success.tenant,
        UserRole.TENANT_OWNER,
      );
      const ut = await http.login(
        saved.success.tenant.slug,
        unlinked.email,
        unlinked.password,
      );
      // Existing canonical lineage alone grants no Client authority. V2 is
      // successor-only even when this account has one exact Client row.
      await db.prisma.client.create({
        data: { tenantId: saved.success.tenant.id, userId: unlinked.id },
      });
      expect((await personal(ut, 'appointments/results')).status).toBe(403);
      expect((await personal(ut, 'reverification/challenge', {})).status).toBe(
        403,
      );
      const st = await login(saved.success);
      const first = await chat(saved.success, st);
      await chat(saved.success, st, first);
      saved.conversationId = first.user_turn.conversationId;
      saved.privateReply = first.reply;
      writeFileSync(receipt, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
      expect(dispatches).toBe(1);
      expect(requests).toHaveLength(2);
    } else {
      expect(saved.database).toBe(database.database);
      expect(saved.pid).not.toBe(process.pid);
      expect(saved.pgStarted).not.toBe(pg.rows[0].started);
      observations.applicationAndPostgresRestart = true;
      for (const s of [saved.success, saved.unknown]) {
        const token = await login(s);
        const providerBeforeRead = { dispatches, reconciliations };
        const results = await personal(token, 'appointments/results');
        expect(results.status).toBe(200);
        expect(results.body).toMatchObject({
          results: [{ state: s === saved.success ? 'SUCCEEDED' : 'UNKNOWN' }],
          hasPending: s === saved.unknown,
        });
        expect({ dispatches, reconciliations }).toEqual(providerBeforeRead);
        const replay = await personal(token, 'appointments', s.dto);
        expect(replay.status).toBe(s === saved.success ? 201 : 503);
        const after = await state(s);
        expect(after.rows).toHaveLength(1);
        expect(after.rows[0].executionAttemptCount).toBe(1);
        observations[
          s === saved.success ? 'successAfterRestart' : 'unknownAfterRestart'
        ] = {
          state: after.rows[0].state,
          attempts: 1,
          appointments: after.appointments,
        };
      }
      const token = await login(saved.success);
      await chat(saved.success, token, {
        reply: saved.privateReply,
        user_turn: { conversationId: saved.conversationId },
      });
      expect(requests).toHaveLength(1);
      const before = JSON.stringify(await state(saved.success));
      await revoke(saved.success);
      for (const route of [
        'appointments/results',
        'appointments/preview',
        'appointments',
      ])
        expect(
          (
            await personal(
              token,
              route,
              route.endsWith('results') ? undefined : saved.success.dto,
            )
          ).status,
        ).toBe(403);
      expect(JSON.stringify(await state(saved.success))).toBe(before);
      await chat(
        saved.success,
        token,
        {
          reply: saved.privateReply,
          user_turn: { conversationId: saved.conversationId },
        },
        false,
      );
      expect(requests).toHaveLength(2);
      observations.revocation = {
        readRefused: true,
        createRefused: true,
        effectsUnchanged: true,
        nextSerializedRequestPrivateFactsAbsent: true,
      };
      await db.prisma.membership.updateMany({
        where: {
          tenantId: saved.success.tenant.id,
          userId: saved.success.user.id,
        },
        data: { status: 'suspended' },
      });
      const denied = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('authorization', 'Bearer ' + token)
        .send({
          surface: 'web',
          requestId: randomUUID(),
          messages: [{ role: 'user', content: 'Покажи мои личные записи' }],
        });
      expect(denied.status).toBe(401);
      expect(requests).toHaveLength(2);
      observations.membershipRevocation = {
        httpStatus: 401,
        addedModelRequests: 0,
      };
      expect(dispatches).toBe(0);
    }
    const ledgerCount = await ledger.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${schema}.bookings`,
    );
    expect(ledgerCount.rows).toEqual([{ n: 1 }]);
    expect(unexpected).toEqual([]);
    expect(http.recorder.writes('personal-read-preview')).toEqual([]);
    expect(http.recorder.writes('personal-read-results')).toEqual([]);
    observations.providerLedgerCount = 1;
  });
});
