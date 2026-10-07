// Qualified local proof only: synthetic A18 links, intercepted model serializer,
// owned loopback provider. No model/SMS/YCLIENTS request leaves this process.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import {
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
} from '../../src/action-engine';
import {
  BOOKING_FACTS_EVIDENCE_PREFIX,
  type ServiceCatalogReadItem,
} from '../../src/crm/service-catalog-read';
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
const catalogEntry = process.env.JEST_PERSONAL_OWNER_ENTRY === 'catalog';
const seedCount = catalogEntry ? 0 : 1;
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
  navRevoked: Salon;
  revoked: Salon;
  incomplete: Salon;
  changed: Salon;
  ready: Salon;
  readyEvidence?: unknown;
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
  const catalogOverrides = new Map<string, Partial<ServiceCatalogReadItem>>();
  const observations: Record<string, unknown> = {
    stage,
    entrySource: catalogEntry ? 'catalog' : 'schedule',
    initialAppointments: seedCount,
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
      expect(requests.length).toBeLessThanOrEqual(
        stage === 'prepare' ? (catalogEntry ? 14 : 9) : 2,
      );
      expect(init.body).not.toMatch(
        /PRIVATE_OWNER_VISIT|PRIVATE_PERSONAL_BRANCH|Предстоящих: 1|12:00|Release proof client/,
      );
      if (saved)
        for (const s of [
          saved.success,
          saved.unknown,
          saved.navRevoked,
          saved.revoked,
          saved.incomplete,
          saved.changed,
          saved.ready,
        ]) {
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
      const prepare =
        planRequest.conversation.at(-1)?.content === 'Хочу записаться';
      const plan = {
        semantic_plan: {
          parent_request: prepare
            ? 'Хочу записаться'
            : 'Покажи мои личные записи',
          language: 'ru',
          dialogue_act: 'question',
          tasks: [
            {
              id: 'own',
              intent: prepare ? 'booking.prepare_personal' : 'booking.list_own',
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
        tool_call: {
          name: prepare ? 'catalog.services.read' : 'appointments.own.list',
          arguments_json: '{}',
        },
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
    const catalog = adapter.readServiceCatalog.bind(adapter);
    const syntheticSlots = adapter.getAvailableSlots.bind(adapter);
    // The owned provider fixture supplies exact slot ends for its selected
    // synthetic services; the generic mock's one-hour grid is not such evidence.
    adapter.getAvailableSlots = async (params) => {
      const slots = await syntheticSlots(params);
      const selected = (await adapter.getServices(params.tenantId)).filter(
        (service) => params.serviceIds?.includes(service.id),
      );
      if (selected.length !== params.serviceIds?.length)
        throw new Error('Synthetic service selection incomplete');
      const duration = selected.reduce(
        (sum, service) => sum + service.duration_minutes,
        0,
      );
      return slots.map((slot) => ({
        ...slot,
        end: new Date(
          new Date(slot.start).getTime() + duration * 60_000,
        ).toISOString(),
      }));
    };
    adapter.readServiceCatalog = async (tenantId) => {
      const read = await catalog(tenantId);
      const override = catalogOverrides.get(tenantId);
      return override
        ? {
            ...read,
            services: read.services.map((service) =>
              service.id === 'svc-consultation'
                ? { ...service, ...override }
                : service,
            ),
          }
        : read;
    };
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
    if (!catalogEntry)
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
  const personal = (token: string, route: string, body: object) =>
    request(http.app.getHttpServer())
      .post('/api/personal-client/' + route)
      .set('authorization', 'Bearer ' + token)
      .set('x-maya-authority-context', 'personal_client')
      .send(body);
  const login = (s: Salon) =>
    http.login(s.tenant.slug, s.user.email, s.user.password);

  async function factsHttp() {
    const s = saved.incomplete,
      token = await login(s);
    const checks = [];
    for (const patch of [
      { price: null, price_min: null, price_max: null },
      { price: null, price_min: 1000, price_max: 2000 },
      { duration_minutes: null },
      { currency: null },
    ]) {
      catalogOverrides.set(s.tenant.id, patch);
      const listed = await request(http.app.getHttpServer())
        .get('/api/services')
        .set('authorization', 'Bearer ' + token);
      expect(listed.status).toBe(200);
      expect(
        (listed.body as ServiceCatalogReadItem[]).find(
          (v) => v.id === 'svc-consultation',
        ),
      ).toMatchObject(patch);
      const preview = await personal(token, 'appointments/preview', s.dto);
      const create = await personal(token, 'appointments', {
        ...s.dto,
        previewFactsHash: '0'.repeat(64),
      });
      expect(preview.status).toBe(503);
      expect(create.status).toBe(503);
      expect(preview.body).toMatchObject({
        error: { code: 'booking_service_facts_unavailable' },
      });
      checks.push({
        patch,
        servicesStatus: listed.status,
        previewStatus: preview.status,
        createStatus: create.status,
      });
    }
    catalogOverrides.set(s.tenant.id, { price: 0, price_min: 0, price_max: 0 });
    const zero = await personal(token, 'appointments/preview', s.dto);
    expect(zero.status).toBe(201);
    const zeroBody = zero.body as {
      services: Array<{ price: number | null }>;
      factsHash: string;
    };
    expect(zeroBody.services[0].price).toBe(0);
    catalogOverrides.set(s.tenant.id, {
      price: 2000,
      price_min: 2000,
      price_max: 2000,
    });
    const stale = await personal(token, 'appointments', {
      ...s.dto,
      previewFactsHash: zeroBody.factsHash,
    });
    expect(stale.status).toBe(409);
    expect(await state(s)).toEqual({ rows: [], appointments: seedCount });
    catalogOverrides.set(s.tenant.id, {
      price: null,
      price_min: 1000,
      price_max: 2000,
    });
    observations.factsHttp = {
      checks,
      observedZeroPreserved: true,
      stalePreviewStatus: stale.status,
      actions: 0,
      providerDispatches: dispatches,
    };
  }

  async function readyRestart() {
    const s = saved.ready,
      token = await login(s);
    if (stage === 'prepare') {
      const preview = await personal(token, 'appointments/preview', s.dto);
      expect(preview.status).toBe(201);
      const previewBody = preview.body as { factsHash: string };
      expect(previewBody.factsHash).toMatch(/^[a-f0-9]{64}$/);
      const runtime = http.app.get(ActionEngineRuntimeService);
      const hold = jest
        .spyOn(runtime, 'executeWithReceipt')
        .mockImplementationOnce(async (input, handlers) => {
          await handlers.authorizeIngress!();
          const execution = await http.app
            .get(CanonicalActionIngressService)
            .createExecution(input);
          expect(execution.state).toBe('READY');
          throw new ServiceUnavailableException(
            'synthetic_stop_after_canonical_admission',
          );
        });
      const held = await personal(token, 'appointments', {
        ...s.dto,
        previewFactsHash: previewBody.factsHash,
      });
      hold.mockRestore();
      expect(held.status).toBe(503);
      const snapshot = await state(s);
      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.rows[0]).toMatchObject({
        state: 'READY',
        executionAttemptCount: 0,
      });
      expect(snapshot.rows[0].evidenceRefsJson).toContain(
        BOOKING_FACTS_EVIDENCE_PREFIX + previewBody.factsHash,
      );
      saved.readyEvidence = snapshot.rows[0].evidenceRefsJson;
      await db.prisma.internalService.update({
        where: { id: s.dto.serviceIds[0] },
        data: { price: { increment: 1 } },
      });
      observations.readyHeldBeforeClaim = {
        state: 'READY',
        attempts: 0,
        syntheticHold: true,
        originalFactsPersisted: true,
      };
    } else {
      const retried = await personal(token, 'appointments', s.dto);
      expect(retried.status).toBe(409);
      const snapshot = await state(s);
      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.rows[0]).toMatchObject({
        state: 'FAILED',
        executionAttemptCount: 1,
      });
      expect(snapshot.rows[0].evidenceRefsJson).toEqual(saved.readyEvidence);
      expect(snapshot.appointments).toBe(seedCount);
      observations.readyRestartRefusedChangedFacts = {
        status: retried.status,
        state: snapshot.rows[0].state,
        attempts: 1,
        originalEvidenceUnchanged: true,
        appointments: snapshot.appointments,
        providerDispatches: dispatches,
      };
    }
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
        navRevoked: await salon(),
        revoked: await salon(),
        incomplete: await salon(true),
        changed: await salon(),
        ready: await salon(),
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
    if (stage === 'prepare') await factsHttp();
    await readyRestart();
    if (stage === 'prepare') {
      for (const key of ['success', 'revoked', 'unknown'] as const) {
        expect(await state(saved[key])).toEqual({
          rows: [],
          appointments: seedCount,
        });
      }
      observations.initialStateVerified = true;
    }
    const keys =
      stage === 'prepare'
        ? catalogEntry
          ? ([
              'success',
              'revoked',
              'unknown',
              'navRevoked',
              'incomplete',
              'changed',
            ] as const)
          : ([
              'success',
              'revoked',
              'unknown',
              'incomplete',
              'changed',
            ] as const)
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
                entrySource: catalogEntry ? 'catalog' : 'schedule',
                notBefore: stage === 'resume' ? saved.notBefore : 0,
                scenarios: keys.map((key) => ({
                  key,
                  email: saved[key].user.email,
                  serviceName: ['unknown', 'incomplete'].includes(key)
                    ? 'Консультация'
                    : 'PRIVATE_OWNER_VISIT',
                  staffName: ['unknown', 'incomplete'].includes(key)
                    ? 'Алексей Орлов'
                    : 'Release proof provider',
                  date: saved[key].dto.start.slice(0, 10),
                })),
              });
            } else if (m.type === 'checkpoint') {
              const key = m.name.split('-')[0] as
                | 'success'
                | 'revoked'
                | 'unknown'
                | 'navRevoked'
                | 'incomplete'
                | 'changed';
              const salon = saved[key],
                snapshot = await state(salon);
              if (m.name.endsWith('-before-nav')) {
                expect(snapshot).toEqual({ rows: [], appointments: 0 });
                await revoke(salon);
              } else if (m.name.endsWith('-preview')) {
                expect(snapshot.rows).toHaveLength(0);
                expect(snapshot.appointments).toBe(seedCount);
                expect(m.selectedStart).toBeTruthy();
                salon.dto.start = m.selectedStart!;
                // Slot branch belongs to the fresh canonical availability, not the seed row.
                if (key === 'unknown')
                  delete (salon.dto as { branchId?: string }).branchId;
                if (key === 'revoked') await revoke(salon);
                if (key === 'changed')
                  await db.prisma.internalService.update({
                    where: { id: salon.dto.serviceIds[0] },
                    data: { price: { increment: 1 } },
                  });
              } else {
                expect(snapshot.rows).toHaveLength(
                  ['revoked', 'navRevoked', 'incomplete', 'changed'].includes(
                    key,
                  )
                    ? 0
                    : 1,
                );
                if (
                  !['revoked', 'navRevoked', 'incomplete', 'changed'].includes(
                    key,
                  )
                ) {
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
                expect(snapshot.appointments).toBe(
                  seedCount + (key === 'success' ? 1 : 0),
                );
                observations[m.name] = {
                  state: snapshot.rows[0]?.state ?? 'REFUSED',
                  attempts: snapshot.rows[0]?.executionAttemptCount ?? 0,
                  appointments: snapshot.appointments,
                  membershipUnchanged: true,
                };
              }
              if (m.name === 'navRevoked-result') {
                const refused = await db.prisma.widgetIntentReceipt.findMany({
                  where: {
                    tenantId: salon.tenant.id,
                    outcome: 'REFUSED',
                    refusalCode: 'insufficient_authority',
                  },
                });
                expect(refused).toHaveLength(1);
                const children = await db.prisma.widgetEmission.count({
                  where: { tenantId: salon.tenant.id },
                });
                expect(children).toBe(1); // only the public catalog parent
                observations.personalNavigationRefusedDurably = true;
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
      expect(requests).toHaveLength(catalogEntry ? 14 : 9);
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
