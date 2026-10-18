/** Diagnostic proof only: native YclientsCRMAdapter, actual loopback HTTP and
 * a test-provider PostgreSQL ledger. No fetch/operation override and no supplied
 * UNKNOWN verdict. The exact source candidate is pinned by the external runner. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { Client as PgClient } from 'pg';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { singleOperatorProof } from '../widgets-live/support/widget-single-operator-proof';
import { firstPhoneCertificate } from '../widgets-live/support/widget-first-phone-proof';
import { releaseHash } from '../../src/entitlements/widget-release.contract';
import { WidgetReleaseAccessService } from '../../src/entitlements/widget-release-access.service';
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
const lifecycleAE = process.env.JEST_NATIVE_LIFECYCLE_AE === '1';
const releaseAdmission = process.env.JEST_NATIVE_RELEASE_ADMISSION === '1';
const lifecycleLossAE = process.env.JEST_NATIVE_LIFECYCLE_LOSS_AE === '1';
const lifecycleLossModes = new Map<
  number,
  { action: 'reschedule' | 'cancel'; readable: boolean }
>(
  lifecycleLossAE
    ? [
        [450010, { action: 'reschedule', readable: false }],
        [450011, { action: 'reschedule', readable: true }],
        [450012, { action: 'cancel', readable: false }],
        [450013, { action: 'cancel', readable: true }],
      ]
    : [],
);
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
  releaseAdmission: releaseAdmission
    ? 'CANONICAL_AR1_HTTP_WITH_EPHEMERAL_TEST_SIGNER_AND_ARTIFICIAL_CERTIFICATE'
    : 'HISTORICAL_PROOF_FIXTURE',
  createEgress: process.env.JEST_NATIVE_CREATE_EGRESS
    ? 'SYNTHETIC_ADMISSION_LOOPBACK_TRANSPORT'
    : 'NOT_USED',
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
  const proxies = new Map<
    number,
    {
      server: Server;
      close(): void;
      snapshot(): Record<string, unknown>;
      origin: string;
    }
  >();
  const counters = new Map<
    number,
    {
      posts: number;
      socketLosses: number;
      reconciliations: number;
      reads: number;
      puts: number;
      deletes: number;
      lifecycleReadbacks: number;
      unavailableReadbacks: number;
    }
  >();
  const releases = new Map<number, Awaited<ReturnType<typeof admitRelease>>>();
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
        `SELECT id::int, payload, moved_start, cancelled FROM ${schema}.bookings WHERE company_id=$1 ORDER BY id`,
        [company],
      )
    ).rows as Array<{
      id: number;
      payload: Record<string, unknown>;
      moved_start: string | null;
      cancelled: boolean;
    }>;

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
      `CREATE TABLE ${schema}.bookings (id bigserial primary key, company_id integer not null, payload jsonb not null, moved_start text, cancelled boolean not null default false)`,
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
          assert.ok(source, 'Only admitted synthetic companies exist');
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
              reply([
                {
                  time:
                    lifecycleAE &&
                    (company === HEALTHY || lifecycleLossModes.has(company)) &&
                    counter.posts
                      ? '18:00'
                      : '17:00',
                  seance_length: 1800,
                },
              ]);
            } else if (lifecycleAE && route.startsWith(`record/${company}/`)) {
              const row = (await rows(company)).find(
                (r) => String(r.id) === route.split('/')[2],
              );
              assert.ok(row);
              const lossMode = lifecycleLossModes.get(company);
              if (lossMode && counter.puts + counter.deletes > 0) {
                counter.lifecycleReadbacks++;
                if (!lossMode.readable) {
                  counter.unavailableReadbacks++;
                  reply({ error: 'synthetic_readback_unavailable' }, 503);
                  return;
                }
              }
              reply({
                id: row.id,
                company_id: company,
                staff_id: 71,
                staff: { id: 71, name: 'Артём' },
                datetime: row.moved_start ?? `${day}T17:00:00`,
                seance_length: 1800,
                services: [
                  { id: 81, cost: 1500, first_cost: 1500, discount: 0 },
                ],
                client: {
                  id: 901,
                  name: row.payload.fullname,
                  phone: row.payload.phone,
                },
                attendance: 0,
                comment: row.payload.comment,
                deleted: row.cancelled,
              });
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
          const payload: unknown = raw ? JSON.parse(raw) : null;
          if (
            lifecycleAE &&
            (company === HEALTHY || lifecycleLossModes.has(company)) &&
            ['PUT', 'DELETE'].includes(req.method ?? '')
          ) {
            const row = (await rows(company)).find(
              (r) => route === `record/${company}/${r.id}`,
            );
            assert.ok(row);
            if (req.method === 'PUT') {
              expect(payload).toMatchObject({
                staff_id: 71,
                datetime: `${day}T18:00:00`,
                save_if_busy: false,
                send_sms: false,
                services: [
                  {
                    id: 81,
                    amount: 1,
                    cost: 1500,
                    first_cost: 1500,
                    discount: 0,
                  },
                ],
              });
              await ledger.query(
                `UPDATE ${schema}.bookings SET moved_start=$1 WHERE id=$2`,
                [`${day}T18:00:00`, row.id],
              );
              counter.puts++;
            } else {
              assert.equal(raw, '');
              await ledger.query(
                `UPDATE ${schema}.bookings SET cancelled=true WHERE id=$1`,
                [row.id],
              );
              counter.deletes++;
            }
            if (lifecycleLossModes.has(company)) {
              counter.socketLosses++;
              // PostgreSQL acknowledged this mutation's autocommit before the
              // actual TCP close. The adapter receives no supplied verdict.
              req.socket.destroy();
            } else reply({});
            return;
          }
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
          {
            ...config,
            baseUrl:
              (proxies.get(Number(settings.companyId))?.origin ?? origin) +
              '/api/v1',
          },
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
        assert.ok(
          calls <= (lifecycleLossAE ? 32 : releaseAdmission ? 20 : 8),
          'Finite synthetic model interpretation only',
        );
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
    const allRefusals =
      !releaseAdmission ||
      ['revoked', 'allowlist', 'candidate', 'expiry'].every(
        (mode) => object(observations['release-' + mode] ?? {}).passed === true,
      );
    const allLifecycleLosses = [...lifecycleLossModes.keys()].every(
      (company) =>
        object(observations['lifecycle-loss-' + company] ?? {}).passed === true,
    );
    observations.status =
      complete && allRefusals && allLifecycleLosses ? 'PASS' : 'FAIL';
    observations.providerContractFailures = errors.length;
    observations.syntheticCounters = {
      healthy: counters.get(HEALTHY) ?? null,
      socketLoss: counters.get(LOSS) ?? null,
    };
    observations.fetchIdentityUnchanged = globalThis.fetch === nativeFetch;
    observations.createEgressSnapshots = Object.fromEntries(
      [...proxies].map(([company, proxy]) => [
        company === HEALTHY
          ? 'healthy'
          : company === LOSS
            ? 'socketLoss'
            : String(company),
        proxy.snapshot(),
      ]),
    );
    writeFileSync(output!, JSON.stringify(observations, null, 2) + '\n', {
      mode: 0o600,
    });
    jest.restoreAllMocks();
    for (const proxy of proxies.values()) {
      proxy.close();
      proxy.server.closeAllConnections();
      await new Promise<void>((resolve) => proxy.server.close(() => resolve()));
    }
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

  async function admitRelease(source: CandidateSource, ttlMs = 600000) {
    // Remove the synthetic fixture row BEFORE any widget request. Thereafter
    // only the unchanged canonical HTTP writer can create/change this grant.
    await db.prisma.tenantEntitlement.deleteMany({
      where: { tenantId: source.tenant.id, featureKey: 'widgets.runtime' },
    });
    const operator = await fx.user(source.tenant, UserRole.PLATFORM_OWNER);
    await db.prisma.user.update({
      where: { id: operator.id },
      data: { tenantId: null },
    });
    const login = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: operator.email, password: operator.password });
    expect(login.status).toBe(201);
    const token = String(object(login.body).access_token);
    const p = singleOperatorProof(
      proof.connectionString,
      source.tenant.id,
      operator.id,
    );
    const cfg = http.app.get(ConfigService);
    for (const key of [
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_TRUST_JSON',
      'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
      'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
      'NODE_ENV',
    ])
      cfg.set(key, p.config.get(key));
    cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', observations.candidate);
    const command = p.command();
    command.certificate = firstPhoneCertificate(command.certificate);
    command.certificate.candidateSha = String(observations.candidate);
    const expiresAt = new Date(
      Math.min(Date.now() + ttlMs, Date.parse(command.certificate.expiresAt)),
    ).toISOString();
    command.authorization = p.signOwner({
      ...command.authorization.payload,
      candidateSha: command.certificate.candidateSha,
      profileId: command.certificate.scope,
      profileDigest: command.certificate.profileDigest,
      certificateDigest: releaseHash(command.certificate),
      grantExpiresAt: expiresAt,
    });
    const route = '/api/platform/widget-release/' + source.tenant.id;
    const post = (
      action: string,
      body: unknown,
      bearer = token,
      target = route,
    ) =>
      request(http.app.getHttpServer())
        .post(target + '/' + action)
        .set('Authorization', 'Bearer ' + bearer)
        .send(body as object);
    const status = () =>
      request(http.app.getHttpServer())
        .get(route + '/status')
        .set('Authorization', 'Bearer ' + token);
    const current = () =>
      db.prisma.$transaction((tx) =>
        http.app.get(WidgetReleaseAccessService).current(source.tenant.id, tx),
      );
    expect(await current()).toBeNull();
    const validation = await post('validate', command);
    assert.equal(validation.status, 201, JSON.stringify(validation.body));
    expect(await current()).toBeNull();
    // Caller JSON, ordinary client authority and foreign-tenant binding cannot grant.
    const forged = structuredClone(command);
    forged.authorization.signature = 'A'.repeat(86);
    expect((await post('grant', forged)).status).toBe(403);
    expect((await post('grant', command, source.token)).status).toBe(403);
    const foreign = await fx.tenant(
      'AR1 foreign synthetic',
      CalendarSource.INTERNAL,
    );
    expect(
      (
        await post(
          'grant',
          command,
          token,
          '/api/platform/widget-release/' + foreign.id,
        )
      ).status,
    ).toBe(403);
    const granted = await post('grant', command);
    expect(granted.status).toBe(201);
    const receipt = object(object(granted.body).receipt);
    expect(receipt).toMatchObject({
      governance: 'single-operator',
      independentHumanReview: false,
      actorId: operator.id,
      reviewerId: null,
      candidateSha: observations.candidate,
    });
    expect(await current()).toMatchObject({
      scope: command.certificate.scope,
      certificateDigest: releaseHash(command.certificate),
      profileDigest: command.certificate.profileDigest,
    });
    const audit = await db.prisma.auditLog.findUniqueOrThrow({
      where: { id: String(receipt.auditId) },
    });
    expect(object(audit.metadataJson).receipt).toEqual(receipt);
    expect((await post('grant', command)).body).toMatchObject({
      replayed: true,
    });
    expect(
      await db.prisma.auditLog.count({
        where: { action: 'widget.release', entityId: source.tenant.id },
      }),
    ).toBe(1);
    const revoke = async () => {
      const live = await status();
      expect(live.status).toBe(200);
      return post('revoke', {
        authorization: p.signOwner({
          ...command.authorization.payload,
          authorizationId: randomUUID(),
          operation: 'revoke',
          expectedVersion: String(object(live.body).version),
          grantExpiresAt: null,
        }),
      });
    };
    return { cfg, post, status, current, command, revoke, expiresAt };
  }

  async function fixture(company: number, ttlMs = 600000) {
    // Restore fixture construction mode only; release requests below always use
    // the real production contract on this guarded disposable loopback database.
    if (releaseAdmission) http.app.get(ConfigService).set('NODE_ENV', 'test');
    const source = await bindCandidateSource(
      db,
      http,
      fx,
      {
        id: 'native-socket-' + company,
        role: 'client',
        group: 'booking',
        variant: 'positive',
        userTurns: [],
        fixture: { clock: 'DYNAMIC_CANONICAL_BRANCH_TOMORROW' },
      },
      sources,
    );
    source.company = String(company);
    if (releaseAdmission)
      releases.set(company, await admitRelease(source, ttlMs));
    companies.set(company, source);
    counters.set(company, {
      posts: 0,
      socketLosses: 0,
      reconciliations: 0,
      reads: 0,
      puts: 0,
      deletes: 0,
      lifecycleReadbacks: 0,
      unavailableReadbacks: 0,
    });
    if (process.env.JEST_NATIVE_CREATE_EGRESS) {
      const {
        nativeCreateEgress,
        CREATE_EGRESS_CONTRACT,
        LIFECYCLE_EGRESS_CONTRACT,
      } = await import(process.env.JEST_NATIVE_CREATE_EGRESS);
      const auth =
        'Bearer SYNTHETIC_NATIVE_SOCKET_PARTNER, User SYNTHETIC_NATIVE_SOCKET_USER';
      const proxy = nativeCreateEgress({
        scope: {
          contract:
            lifecycleAE &&
            (company === HEALTHY || lifecycleLossModes.has(company))
              ? LIFECYCLE_EGRESS_CONTRACT
              : CREATE_EGRESS_CONTRACT,
          ...(lifecycleAE &&
          (company === HEALTHY || lifecycleLossModes.has(company))
            ? { maxReschedules: 1, maxCancels: 1 }
            : {}),
          candidate: observations.candidate,
          profile: 'closed-input.no-handoff.no-price-goods@1',
          tenantId: source.tenant.id,
          companyId: String(company),
          executionAuthorizationDigest: releaseAdmission
            ? releaseHash(releases.get(company)!.command.authorization)
            : 'a'.repeat(64),
          credentialDigest: createHash('sha256').update(auth).digest('hex'),
          notBefore: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          maxReads: 256,
          maxCreates: 1,
        },
        ledgerPath: path.join(
          path.dirname(output!),
          `create-egress-${company}.jsonl`,
        ),
        // Synthetic construction only; this is not a platform execution authorization.
        assertCurrent: () => true,
        nativeFetch: async (raw: string, init: RequestInit) => {
          const target = new URL(raw);
          assert.equal(target.origin, 'https://api.yclients.com');
          const response = await nativeFetch(
            origin + target.pathname + target.search,
            init,
          );
          // Test destination substitution only. Preserve actual status/body stream,
          // including native socket/body errors; never supply UNKNOWN ourselves.
          return new Response(response.body, {
            status: response.status,
            headers: response.headers,
          });
        },
      });
      await new Promise<void>((resolve) =>
        proxy.server.listen(0, '127.0.0.1', resolve),
      );
      const address = proxy.server.address();
      assert.ok(address && typeof address !== 'string');
      proxies.set(company, {
        ...proxy,
        origin: `http://127.0.0.1:${address.port}`,
      });
    }
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
    if (releaseAdmission) {
      const r = releases.get(company)!;
      expect((await r.post('grant', r.command, token)).status).toBe(403);
    }
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
    if (proxies.has(HEALTHY))
      expect(proxies.get(HEALTHY)!.snapshot()).toMatchObject({
        creates: 1,
        refused: 0,
        uncertainTransport: 0,
      });
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
    if (lifecycleAE) {
      const appointment = await db.prisma.appointment.findFirstOrThrow({
        where: { tenantId: source.tenant.id, source: 'external' },
      });
      const moveKey = randomUUID(),
        cancelKey = randomUUID();
      const mutate = (
        action: string,
        key: string,
        body: Record<string, unknown> = {},
      ) =>
        request(http.app.getHttpServer())
          .post(`/api/appointments/${appointment.id}/${action}`)
          .set('Authorization', 'Bearer ' + source.token)
          .set('Idempotency-Key', key)
          .send(body);
      const moved = await mutate('reschedule', moveKey, {
        start: source.startsAt.slice(0, 10) + 'T15:00:00.000Z',
      });
      observations.lifecycleMoveHttp = {
        status: moved.status,
        body: moved.status === 201 ? 'SUCCESS' : moved.body,
      };
      expect(moved.status).toBe(201);
      const moveAgain = () =>
        mutate('reschedule', moveKey, {
          start: source.startsAt.slice(0, 10) + 'T15:00:00.000Z',
        });
      await moveAgain();
      await Promise.all(Array.from({ length: 6 }, moveAgain));
      expect(counts(HEALTHY).puts).toBe(1);
      const cancelled = await mutate('cancel', cancelKey);
      observations.lifecycleCancelHttp = {
        status: cancelled.status,
        body: cancelled.status === 201 ? 'SUCCESS' : cancelled.body,
      };
      expect(cancelled.status).toBe(201);
      await mutate('cancel', cancelKey);
      await Promise.all(
        Array.from({ length: 6 }, () => mutate('cancel', cancelKey)),
      );
      const actions = await db.prisma.actionExecution.findMany({
        where: { tenantId: source.tenant.id },
        select: { capability: true, state: true, executionAttemptCount: true },
      });
      for (const name of ['create', 'reschedule', 'cancel'])
        expect(
          actions.filter((a) => a.capability === `crm.appointment.${name}.v1`),
        ).toEqual([
          {
            capability: `crm.appointment.${name}.v1`,
            state: 'SUCCEEDED',
            executionAttemptCount: 1,
          },
        ]);
      const persisted = await rows(HEALTHY);
      expect(persisted).toHaveLength(1);
      expect(persisted[0].cancelled).toBe(true);
      expect(counts(HEALTHY)).toMatchObject({ posts: 1, puts: 1, deletes: 1 });
      expect(proxies.get(HEALTHY)!.snapshot()).toMatchObject({ refused: 0 });
      const final = await db.prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      });
      expect(final.status).toBe('canceled');
      expect(final.startAt.toISOString()).toBe(
        source.startsAt.slice(0, 10) + 'T15:00:00.000Z',
      );
      observations.lifecycleAE = {
        status: 'PASS',
        sameAppointment: true,
        providerCreate: 1,
        providerPut: 1,
        providerDelete: 1,
        canonicalHttp: true,
        actionEngine: true,
        widgetCreateConfirmation: true,
        rescheduleCancelViaHttp: true,
        rescheduleCancelWidgetOrPhoneAcceptance: false,
        normalAndConcurrentMoveRetries: true,
        normalAndConcurrentCancelRetries: true,
      };
    }
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
    // The proxy's one-write ceiling must not hide a broken Action Engine retry.
    // Only the first real transport loss is a refusal; retries never reach it.
    if (proxies.has(LOSS))
      expect(proxies.get(LOSS)!.snapshot()).toMatchObject({
        creates: 1,
        refused: 1,
        uncertainTransport: 1,
      });
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
  if (releaseAdmission) {
    for (const [index, mode] of [
      'revoked',
      'allowlist',
      'candidate',
      'expiry',
    ].entries()) {
      it(
        'AR-1 ' +
          mode +
          ' refuses a real previously minted COMMIT before native dispatch',
        async () => {
          const company = 450003 + index;
          const source = await fixture(
            company,
            mode === 'expiry' ? 20000 : 600000,
          );
          const r = releases.get(company)!;
          const preview = await confirmation(source);
          expect(await r.current()).not.toBeNull();
          const skipped =
            mode === 'revoked' &&
            process.env.JEST_NATIVE_RELEASE_COUNTERFACTUAL === 'skip-revoke';
          if (mode === 'revoked' && !skipped)
            expect((await r.revoke()).status).toBe(201);
          if (mode === 'allowlist')
            r.cfg.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
          if (mode === 'candidate')
            r.cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', 'b'.repeat(40));
          if (mode === 'expiry') {
            // Real expiry, not a substituted application/DB clock or forged row.
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Math.max(0, Date.parse(r.expiresAt) - Date.now() + 40),
              ),
            );
          }
          const response = await http.postIntent(source.token, {
            widget_id: preview.widget_id,
            intent_token: object(
              list(preview.intents).find((i) => object(i).effect === 'COMMIT'),
            ).intent_token,
            inputs: null,
          });
          const current = await r.current();
          const proofRow = {
            passed: false,
            status: response.status,
            outcome: object(response.body).receipt_outcome ?? null,
            currentRelease: current !== null,
            providerBookings: (await rows(company)).length,
            providerPosts: counts(company).posts,
            actionExecutions: await db.prisma.actionExecution.count({
              where: { tenantId: source.tenant.id, capability },
            }),
            appointments: await db.prisma.appointment.count({
              where: { tenantId: source.tenant.id },
            }),
            proxyRefusals: proxies.get(company)!.snapshot().refused,
          };
          observations['release-' + mode] = proofRow;
          expect(current).toBeNull();
          expect(
            response.status === 403 ||
              (response.status === 200 &&
                object(response.body).receipt_outcome === 'REFUSED'),
          ).toBe(true);
          expect(proofRow).toMatchObject({
            providerBookings: 0,
            providerPosts: 0,
            actionExecutions: 0,
            appointments: 0,
            proxyRefusals: 0,
          });
          // Rollback is still available with lost allowlist/candidate/expired access.
          if (mode !== 'revoked') expect((await r.revoke()).status).toBe(201);
          expect((await r.status()).body).toMatchObject({ enabled: false });
          // A replayed original grant is only a historical receipt, never reactivation.
          // Candidate/allowlist checks may refuse that replay outright.
          if (['revoked', 'expiry'].includes(mode)) {
            const replay = await r.post('grant', r.command);
            expect(
              replay.status === 403 ||
                (replay.status === 201 &&
                  object(replay.body).replayed === true),
            ).toBe(true);
            expect((await r.status()).body).toMatchObject({ enabled: false });
          }
          proofRow.passed = true;
        },
      );
    }
  }
  for (const [company, mode] of lifecycleLossModes) {
    it(
      'native ' +
        mode.action +
        ' durable commit + socket loss; readback=' +
        (mode.readable ? 'available' : 'unavailable') +
        ' [canonical AE/AR1]',
      async () => {
        const source = await fixture(company);
        const preview = await confirmation(source);
        expect(
          (await submit(http, source.token, preview, 'COMMIT')).receipt_outcome,
        ).toBe('ACCEPTED');
        const appointment = await db.prisma.appointment.findFirstOrThrow({
          where: { tenantId: source.tenant.id, source: 'external' },
        });
        const targetCapability = 'crm.appointment.' + mode.action + '.v1';
        const key = randomUUID();
        const invoke = () =>
          request(http.app.getHttpServer())
            .post('/api/appointments/' + appointment.id + '/' + mode.action)
            .set('Authorization', 'Bearer ' + source.token)
            .set('Idempotency-Key', key)
            .send(
              mode.action === 'reschedule'
                ? { start: source.startsAt.slice(0, 10) + 'T15:00:00.000Z' }
                : {},
            );
        const first = await invoke();
        const readExecution = () =>
          db.prisma.actionExecution.findFirstOrThrow({
            where: { tenantId: source.tenant.id, capability: targetCapability },
          });
        const initial = await readExecution();
        const attempts = await db.prisma.actionAttempt.findMany({
          where: {
            tenantId: source.tenant.id,
            actionExecutionId: initial.id,
            kind: 'EXECUTION',
          },
        });
        const persisted = await rows(company);
        const fact = {
          passed: false,
          action: mode.action,
          readbackAvailable: mode.readable,
          firstHttpStatus: first.status,
          initialState: initial.state,
          initialExecutionAttemptCount: initial.executionAttemptCount,
          initialReconciliationState: initial.reconciliationState,
          persistedBookings: persisted.length,
          providerMutationPersisted:
            persisted.length === 1 &&
            (mode.action === 'reschedule'
              ? persisted[0].moved_start ===
                  source.startsAt.slice(0, 10) + 'T18:00:00' &&
                persisted[0].cancelled === false
              : persisted[0].moved_start === null &&
                persisted[0].cancelled === true),
          executionAttempts: attempts.map((a) => ({
            state: a.state,
            errorClass: a.errorClass,
            outcomeCode: a.outcomeCode,
          })),
          firstProvider: { ...counts(company) },
          firstLocalStatus: (
            await db.prisma.appointment.findUniqueOrThrow({
              where: { id: appointment.id },
            })
          ).status,
        };
        observations['lifecycle-loss-' + company] = fact;
        expect(attempts).toHaveLength(1);
        expect(attempts[0]).toMatchObject({
          state: 'UNKNOWN',
          errorClass: 'crm_outcome_unknown',
          outcomeCode: 'crm_provider_outcome_unknown',
        });
        expect(initial.executionAttemptCount).toBe(1);
        expect(counts(company).socketLosses).toBe(1);
        expect(persisted).toHaveLength(1);
        expect(persisted[0]).toMatchObject(
          mode.action === 'reschedule'
            ? {
                moved_start: source.startsAt.slice(0, 10) + 'T18:00:00',
                cancelled: false,
              }
            : { moved_start: null, cancelled: true },
        );
        if (mode.readable) {
          expect(first.status).toBe(201);
          expect(initial.state).toBe('SUCCEEDED');
        } else {
          expect(first.status).toBe(503);
          expect(object(first.body).error).toMatchObject({
            code: 'crm_outcome_unknown',
          });
          expect(initial.state).toBe('UNKNOWN');
          expect(fact.firstLocalStatus).toBe('confirmed');
        }
        expect(counts(company).lifecycleReadbacks).toBeGreaterThan(0);
        const normal = await invoke();
        const concurrent = await Promise.all(Array.from({ length: 6 }, invoke));
        if (!mode.readable)
          for (const response of [normal, ...concurrent]) {
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(JSON.stringify(response.body)).not.toContain(
              'Запись подтверждена.',
            );
          }
        const final = await readExecution();
        const mirror = await db.prisma.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        });
        const mutations = {
          posts: counts(company).posts,
          puts: counts(company).puts,
          deletes: counts(company).deletes,
          socketLosses: counts(company).socketLosses,
        };
        expect(mutations).toEqual({
          posts: 1,
          puts: Number(mode.action === 'reschedule'),
          deletes: Number(mode.action === 'cancel'),
          socketLosses: 1,
        });
        expect(
          await db.prisma.actionExecution.count({
            where: { tenantId: source.tenant.id, capability: targetCapability },
          }),
        ).toBe(1);
        expect(final.executionAttemptCount).toBe(1);
        expect(final.state).toBe(mode.readable ? 'SUCCEEDED' : 'UNKNOWN');
        expect(mirror.status).toBe(
          mode.readable && mode.action === 'cancel' ? 'canceled' : 'confirmed',
        );
        expect(mirror.startAt.toISOString()).toBe(
          mode.readable && mode.action === 'reschedule'
            ? source.startsAt.slice(0, 10) + 'T15:00:00.000Z'
            : new Date(source.startsAt).toISOString(),
        );
        // No proxy quota refusal may mask an AE retry. Its only refusal is the
        // original actual socket loss after a durable provider mutation.
        expect(proxies.get(company)!.snapshot()).toMatchObject({
          refused: 1,
          uncertainTransport: 1,
          lifecycleUncertain: true,
        });
        expect(errors).toEqual([]);
        Object.assign(fact, {
          passed: true,
          finalState: final.state,
          finalReconciliationState: final.reconciliationState,
          providerMutations: mutations,
          finalLocalStatus: mirror.status,
          finalLocalStart: mirror.startAt.toISOString(),
          normalRetries: 1,
          concurrentRetries: 6,
          proxy: proxies.get(company)!.snapshot(),
          readbacks: counts(company).lifecycleReadbacks,
          unavailableReadbacks: counts(company).unavailableReadbacks,
        });
      },
    );
  }
});
