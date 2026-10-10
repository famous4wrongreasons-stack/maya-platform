/** Real HTTP/auth/PG/A17 owners; native adapter with finite synthetic GETs.
 * A loopback relay discards successful HTTP responses AFTER their real commit.
 * This is delivery loss, not a worker crash or an A17 UNKNOWN outcome. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, request as nodeRequest } from 'node:http';
import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import path from 'node:path';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { CrmService } from '../../src/crm/crm.service';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';
// Preserve the established bootstrap/module evaluation order before importing
// the test-only call-through seam for durable admission.
import { CanonicalActionIngressService } from '../../src/action-engine/action-engine.ingress';

const stage = process.env.JEST_C9_OCCUPANCY_STAGE;
const receiptPath = process.env.JEST_C9_OCCUPANCY_RECEIPT!;
const reportPath = process.env.JEST_C9_OCCUPANCY_REPORT!;
assert.ok(
  ['prepare', 'resume', 'matrix'].includes(stage ?? '') &&
    receiptPath &&
    reportPath,
  'Use owned driver --crm-setup or --crm-setup-matrix',
);
assertProofDatabase(process.env);
const companyId = 424242;
const origin = 'https://api.yclients.com';
// Public synthetic material only; the real factory still constructs the native
// adapter, and the actual profile transport validates every outbound request.
const syntheticTokens = [
  'SYNTHETIC_A17_V1',
  'SYNTHETIC_A17_V2',
  'SYNTHETIC_A17_DENIED',
  'SYNTHETIC_A17_FORBIDDEN',
  'SYNTHETIC_A17_COMPANY_MISSING',
  'SYNTHETIC_A17_COMPANY_BAD_TITLE',
] as const;
// Jest wraps imported createRequire with its CJS loader. Use Node's actual
// built-in loader to execute the unchanged ESM profile and transport modules.
const nativeRequire = process
  .getBuiltinModule('module')
  .createRequire(__filename);
type ProfileRequest = ExpressRequest & {
  user?: { tenantId: string; userId: string; membershipStatus: string };
};
type ReadTransport = {
  run(
    request: ExpressRequest,
    response: ExpressResponse,
    next: NextFunction,
  ): unknown;
  fetch: typeof fetch;
  counters: { calls: number; refused: number; routes: Record<string, number> };
};
const { realReadIngress, companyId: validCompanyId } = nativeRequire(
  path.resolve('scripts/local-yclients-read-profile.mjs'),
) as {
  realReadIngress(
    this: void,
    method: string,
    url: string,
    headers: ExpressRequest['headers'],
    body: unknown,
    origin: string,
    allowUserAuth?: boolean,
  ): string | null;
  companyId(this: void, value: unknown): boolean;
};
const { localBrowserBoundary } = nativeRequire(
  path.resolve('scripts/local-onboarding-profile.mjs'),
) as {
  localBrowserBoundary(
    this: void,
    headers: ExpressRequest['headers'],
    origin: string,
    host: string,
  ): boolean;
};
const { createReadTransport } = nativeRequire(
  path.resolve('scripts/local-yclients-read-transport.mjs'),
) as {
  createReadTransport(
    this: void,
    nativeFetch: typeof fetch,
    resolveCompany: (request: ProfileRequest) => Promise<unknown>,
    clock: () => number,
    trace: (value: Record<string, unknown>) => void,
    options?: { allowUserAuth: boolean },
  ): ReadTransport;
};
const { createReadTrace, projectReadTrace, traceHttpRequest } = nativeRequire(
  path.resolve('scripts/local-yclients-read-status.mjs'),
) as {
  createReadTrace(
    this: void,
    send: (value: unknown) => void,
  ): (value: Record<string, unknown>) => void;
  projectReadTrace(this: void, value: unknown): Record<string, unknown> | null;
  traceHttpRequest(
    this: void,
    request: ExpressRequest,
    response: ExpressResponse,
    emit: (value: Record<string, unknown>) => void,
    refusal: string | null,
  ): void;
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value: unknown): Record<string, unknown> => {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
};
type Operation = 'install' | 'activate';
type Receipt = {
  contract: 'maya.crm-operation-receipt/1';
  operation: Operation;
  requestId: string;
  phase: 'installed' | 'activated' | 'import_confirmed';
  configVersion: string;
  executionId: string;
  atomicProjection: boolean;
};
type Login = {
  tenantId: string;
  slug: string;
  userId: string;
  email: string;
  password: string;
  branchId: string;
};
type Saved = {
  owner: Login;
  otherOwner: Login;
  client: Login;
  foreign: Login;
  install: Receipt;
  activate: Receipt;
  graphHash: string;
  processId: number;
  postmasterStartedAt: string;
  preAdmission?: { owner: Login; requestId: string; materialHash: string };
  unfinished?: {
    owner: Login;
    requestId: string;
    executionId: string;
    graphHash: string;
    materialHash: string;
  };
};
const sourceFiles = [
  'src/crm/crm-integration.controller.ts',
  'src/crm/dto/connect-crm-integration.dto.ts',
  'src/crm/dto/crm-operation.dto.ts',
  'src/crm/crm-configuration-version.ts',
  'src/crm/crm.service.ts',
  'src/crm/yclients-user-auth.ts',
  'src/crm/crm-request.errors.ts',
  'src/crm/crm-provider-settings.ts',
  'src/crm/adapters/yclients-crm.adapter.ts',
  'src/crm/adapters/yclients-company-profile-source.spec.ts',
  'src/package5-wave3/package5-wave3-canonical-cutover.service.ts',
  'src/package5-wave3/package5-wave3.service.ts',
  'src/package5-wave3/package5-wave3-production-gateway.service.ts',
  'src/action-engine/package5-wave3-executable.contract.ts',
  'scripts/c9-occupancy-proof.mjs',
  'scripts/local-yclients-read-profile.mjs',
  'scripts/local-yclients-read-transport.mjs',
  'scripts/local-yclients-read-runtime.mjs',
  'scripts/local-yclients-read-status.mjs',
  'scripts/local-yclients-read.mjs',
  'scripts/local-onboarding-profile.mjs',
  'src/crm/crm-adapter.factory.ts',
  'scripts/crm-a17-operation-proof.test.mjs',
  'test/widgets-live/crm-a17-operation-restart.probe-spec.ts',
  'test/widgets-live/support/http-bootstrap.ts',
  'test/widgets-live/support/proof-db-guard.ts',
  '../maya-carrier-react/test/crm-a17-setup-browser-probe.mjs',
  '../maya-carrier-react/test/crm-a17-setup-browser-guard.mjs',
  '../maya-carrier-react/test/crm-a17-setup-browser-guard.test.mjs',
  '../maya-carrier-react/src/setup/LocalCrmSetup.tsx',
  '../maya-carrier-react/src/App.tsx',
  '../maya-carrier-react/src/signin/SignIn.tsx',
  '../maya-carrier-react/src/signin/StandardOnboarding.tsx',
  '../maya-carrier-react/src/runtime/crmPending.ts',
  '../maya-carrier-react/src/runtime/compose.ts',
  '../maya-carrier-react/build.mjs',
  '../maya-chat-shell/src/shell/local-crm-setup.ts',
  '../maya-chat-shell/src/net/crm-setup.ts',
  '../maya-chat-shell/src/net/client.ts',
  '../maya-chat-shell/src/net/types.ts',
  '../maya-chat-shell/test/local-crm-setup.test.mjs',
  '../maya-chat-shell/dev/serve.mjs',
  '../maya-chat-shell/test/cdp-verify.mjs',
];
const sourceHashes = () =>
  Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  );

describe('A17 exact configuration and persisted operation recovery through actual HTTP/PG restart', () => {
  let db: FixtureContext, http: HttpHarness;
  let saved: Saved;
  const checks: string[] = [],
    forbidden: string[] = [],
    providerReads: string[] = [];
  const observations: Record<string, unknown> = {};
  const initialSource = sourceHashes();
  let releaseHeldRead: (() => void) | undefined;
  let readTransport: ReadTransport;
  const readTrace: Record<string, unknown>[] = [];
  let invalidTrace = 0;
  const globalTrace = createReadTrace((value) => {
    const projected = projectReadTrace(value);
    if (projected === null) invalidTrace++;
    else readTrace.push(projected);
  });
  let matrixTrace: ((value: Record<string, unknown>) => void) | undefined;
  let matrixCompanies: { payload: unknown } | undefined;
  const trace = (value: Record<string, unknown>) => {
    globalTrace(value);
    matrixTrace?.(value);
  };
  let browserOrigin: string | undefined;
  const ingressEvidence: {
    checked: number;
    denied: Array<{ method: string; path: string; code: string }>;
  } = { checked: 0, denied: [] };
  let pause: { reached: () => void; released: Promise<void> } | undefined;

  beforeAll(async () => {
    db = await bootFixtureContext();
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    assert.equal(process.env.YCLIENTS_BASE_URL, undefined);
    const syntheticFetch: typeof fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (
        url.origin === origin &&
        url.pathname === '/api/v1/auth' &&
        !url.search &&
        init?.method === 'POST'
      ) {
        expect(new Headers(init.headers).get('authorization')).toBe(
          'Bearer SYNTHETIC_A17_PARTNER',
        );
        expect(init.redirect).toBe('error');
        assert.equal(typeof init.body, 'string');
        const credentials = object(JSON.parse(init.body as string));
        expect(credentials.login).toBe('auth-fixture@example.invalid');
        expect(Object.keys(credentials).sort()).toEqual(['login', 'password']);
        expect(['Synthetic Correct 42', 'Synthetic Incorrect 42']).toContain(
          credentials.password,
        );
        providerReads.push('auth');
        return Promise.resolve(
          credentials.password === 'Synthetic Correct 42'
            ? new Response(
                JSON.stringify({
                  success: true,
                  data: { user_token: 'SYNTHETIC_A17_V1' },
                }),
                { status: 200 },
              )
            : new Response(
                JSON.stringify({ error: 'PRIVATE_FAILURE_DETAIL' }),
                { status: 401 },
              ),
        );
      }
      if (
        url.origin !== origin ||
        init?.method !== 'GET' ||
        init.body !== undefined
      ) {
        forbidden.push('unexpected-provider-transport');
        throw new Error('Provider transport refused');
      }
      const route = url.pathname.replace('/api/v1/', '');
      if (url.search !== (route === 'companies' ? '?my=1' : '')) {
        forbidden.push('unexpected-provider-query');
        throw new Error('Provider query refused');
      }
      assert.equal(init.redirect, 'error');
      const authorization = new Headers(init.headers).get('authorization');
      const material = syntheticTokens.find(
        (value) =>
          authorization === `Bearer SYNTHETIC_A17_PARTNER, User ${value}`,
      );
      assert.ok(
        material,
        'Only fixed public synthetic adapter material is admitted',
      );
      providerReads.push(route);
      if (stage === 'matrix' && route === 'companies' && matrixCompanies) {
        assert.equal(material, 'SYNTHETIC_A17_V1');
        return Promise.resolve(
          new Response(JSON.stringify(matrixCompanies.payload), {
            status: 200,
          }),
        );
      }
      if (
        material === 'SYNTHETIC_A17_DENIED' ||
        material === 'SYNTHETIC_A17_FORBIDDEN'
      ) {
        assert.equal(route, 'companies');
        return Promise.resolve(
          new Response('{}', {
            status: material === 'SYNTHETIC_A17_DENIED' ? 401 : 403,
          }),
        );
      }
      const company = {
        id: companyId,
        title: 'Synthetic A17 company',
        timezone_name: 'Europe/Moscow',
      };
      let data: unknown;
      if (route === 'companies')
        data =
          material === 'SYNTHETIC_A17_COMPANY_MISSING'
            ? [{ ...company, id: companyId + 1 }]
            : material === 'SYNTHETIC_A17_COMPANY_BAD_TITLE'
              ? [{ ...company, title: 42 }]
              : [company];
      else if (route === `company/${companyId}`) data = company;
      else if (route === `book_services/${companyId}`)
        data = {
          services: [
            {
              id: 81,
              title: 'Synthetic service',
              price_min: 1000,
              price_max: 1000,
              seance_length: 1800,
            },
          ],
        };
      else if (
        [
          `service_categories/${companyId}`,
          `company/${companyId}/staff`,
          `staff/${companyId}`,
        ].includes(route)
      )
        data = [];
      else {
        forbidden.push('unexpected-provider-route');
        throw new Error('Provider route refused');
      }
      assert.equal(init?.redirect, 'error');
      const team =
        route === `company/${companyId}/staff` ||
        route === `staff/${companyId}`;
      const response = new Response(
        JSON.stringify({
          success: true,
          data,
          ...(team ? { meta: { total_count: 0, count: 0, page: 1 } } : {}),
        }),
        { status: 200 },
      );
      if (route === `company/${companyId}` && pause) {
        const held = pause;
        pause = undefined;
        held.reached();
        return held.released.then(() => response);
      }
      return Promise.resolve(response);
    };
    readTransport = createReadTransport(
      syntheticFetch,
      async (incoming) => {
        if (incoming.originalUrl === '/api/integrations/crm/connect') {
          return object(object(incoming.body).settingsJson).companyId;
        }
        assert.ok(incoming.user?.tenantId);
        const integration = await db.prisma.crmIntegration.findUnique({
          where: { tenantId: incoming.user.tenantId },
          select: { provider: true, baseUrl: true, settingsJson: true },
        });
        const settings = object(integration?.settingsJson);
        assert.ok(
          integration?.provider === 'yclients' &&
            !integration.baseUrl &&
            validCompanyId(settings.companyId),
        );
        return settings.companyId;
      },
      Date.now,
      trace,
      { allowUserAuth: true },
    );
    jest.spyOn(globalThis, 'fetch').mockImplementation(readTransport.fetch);
    http = await bootHttp(undefined, (app) => {
      app.use(
        (
          incoming: ExpressRequest,
          response: ExpressResponse,
          next: NextFunction,
        ) => {
          const address = app.getHttpServer().address();
          assert.ok(
            address && typeof address === 'object' && address.port > 1024,
          );
          const expectedHost = `127.0.0.1:${address.port}`;
          const expectedOrigin = browserOrigin ?? `http://${expectedHost}`;
          ingressEvidence.checked++;
          const reason = !localBrowserBoundary(
            incoming.headers,
            expectedOrigin,
            expectedHost,
          )
            ? 'local_onboarding_origin_refused'
            : realReadIngress(
                incoming.method,
                incoming.originalUrl,
                incoming.headers,
                incoming.body,
                expectedOrigin,
                true,
              );
          traceHttpRequest(incoming, response, trace, reason);
          if (reason) {
            ingressEvidence.denied.push({
              method: incoming.method,
              path: incoming.path,
              code: reason,
            });
            response.status(403).json({
              error: { code: reason },
              message:
                'Synthetic proof: current local profile refused this route.',
            });
            return;
          }
          readTransport.run(incoming, response, next);
        },
      );
    });
    expect(readTransport.counters).toEqual({
      calls: 0,
      refused: 0,
      routes: {},
    });
    http.app.get(ConfigService).set('EMAIL_LOGIN_ENABLED', 'false');
    const factory = http.app.get(CrmAdapterFactory);
    const create = factory.create.bind(factory);
    jest.spyOn(factory, 'create').mockImplementation((provider, config) => {
      assert.equal(provider, CrmProvider.YCLIENTS);
      assert.ok(syntheticTokens.some((value) => config.apiToken === value));
      assert.ok(!config.baseUrl);
      process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_A17_PARTNER';
      try {
        const adapter = create(provider, config);
        assert.ok(adapter instanceof YclientsCRMAdapter);
        return adapter;
      } finally {
        delete process.env.YCLIENTS_PARTNER_TOKEN;
      }
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        forbidden.push('model');
        throw new Error('Model forbidden in A17 proof');
      });
  });
  afterAll(async () => {
    releaseHeldRead?.();
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
  });
  const api = () => request(http.app.getHttpServer());
  const login = (person: Login) =>
    http.login(person.slug, person.email, person.password);
  const connectBody = (
    branchId: string,
    expectedVersion: string | null,
    version: 1 | 2 = 1,
  ) => ({
    provider: 'yclients',
    apiToken: `SYNTHETIC_A17_V${version}`,
    expectedVersion,
    settingsJson: {
      companyId,
      branchBinding: {
        contract: 'maya.crm-branch-binding/1',
        companyId,
        branchId,
      },
    },
  });
  const post = (
    token: string,
    operation: Operation,
    key: string,
    body: object,
  ) =>
    api()
      .post(
        '/api/integrations/crm/' +
          (operation === 'install' ? 'connect' : 'activate'),
      )
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', key)
      .send(body)
      .timeout({ response: 15000, deadline: 25000 });
  const getOperation = (
    token: string,
    operation: Operation,
    requestId: string,
  ) =>
    api()
      .get('/api/integrations/crm/operation')
      .query({ operation, requestId })
      .set('Authorization', 'Bearer ' + token)
      .timeout({ response: 10000, deadline: 15000 });
  const versionOf = (value: unknown) => {
    const version = object(object(value).connection).configVersion;
    assert.equal(typeof version, 'string');
    assert.match(version as string, /^[a-f0-9]{64}$/);
    return version as string;
  };
  const receiptOf = (
    value: unknown,
    operation: Operation,
    key: string,
  ): Receipt => {
    const receipt = object(object(value).receipt);
    expect(receipt).toMatchObject({
      contract: 'maya.crm-operation-receipt/1',
      operation,
      requestId: key,
      phase: operation === 'install' ? 'installed' : 'import_confirmed',
      atomicProjection: operation === 'activate',
    });
    assert.equal(typeof receipt.configVersion, 'string');
    assert.match(receipt.configVersion as string, /^[a-f0-9]{64}$/);
    assert.equal(typeof receipt.executionId, 'string');
    assert.match(receipt.executionId as string, /^[a-f0-9-]{36}$/);
    return receipt as Receipt;
  };
  const graph = (tenantId: string) =>
    db.prisma.actionExecution.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        capability: true,
        state: true,
        executionAttemptCount: true,
        normalizedInputHash: true,
        evidenceRefsJson: true,
        sourceRef: true,
        attempts: {
          orderBy: { attemptNumber: 'asc' },
          select: {
            id: true,
            attemptNumber: true,
            state: true,
            externalDispatchState: true,
          },
        },
      },
    });
  const mutationGraph = (tenantId: string) =>
    db.prisma.actionTargetMutation.findMany({
      where: { tenantId },
      orderBy: { targetGeneration: 'asc' },
      select: {
        id: true,
        actionExecutionId: true,
        targetGeneration: true,
        beforeStateHash: true,
        afterStateHash: true,
        mutationKind: true,
      },
    });
  const durable = async (tenantId: string) => ({
    executions: await graph(tenantId),
    mutations: await mutationGraph(tenantId),
    integration: await db.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        status: true,
        settingsJson: true,
        updatedAt: true,
        verifiedAt: true,
        lastSyncAt: true,
        lastCheckedAt: true,
      },
    }),
    tenant: await db.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { calendarSource: true, defaultTimezone: true },
    }),
    team: await db.prisma.crmStaffAccess.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
  });
  const noUnrelatedEffects = async (tenantId: string) => {
    expect(await db.prisma.appointment.count({ where: { tenantId } })).toBe(0);
    expect(
      await db.prisma.aiApprovalRequest.count({ where: { tenantId } }),
    ).toBe(0);
    expect(
      await db.prisma.marketingDeliveryAttempt.count({ where: { tenantId } }),
    ).toBe(0);
    expect(await db.prisma.teamMessage.count({ where: { tenantId } })).toBe(0);
    for (const row of await graph(tenantId)) {
      expect(row.capability).toMatch(
        /^package5\.wave3\.(install-crm-credentials|activate-crm-integration|confirm-crm-import)\.execute\.v1$/,
      );
      expect(row.state).not.toBe('UNKNOWN');
      for (const attempt of row.attempts)
        expect(attempt.externalDispatchState).toBe('NOT_CROSSED');
    }
    expect(forbidden).toEqual([]);
  };
  const postmasterStartedAt = async () => {
    const rows = await db.prisma.$queryRaw<
      Array<{ started: Date }>
    >`SELECT pg_postmaster_start_time() AS started`;
    return rows[0].started.toISOString();
  };
  const createTenant = async (name: string): Promise<Login> => {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(name, CalendarSource.EXTERNAL);
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'booking',
      'crm.integration',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    });
    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      userId: owner.id,
      email: owner.email,
      password: owner.password,
      branchId: branch.id,
    };
  };
  const addUser = async (owner: Login, role: UserRole): Promise<Login> => {
    const tenant = await db.prisma.tenant.findUniqueOrThrow({
      where: { id: owner.tenantId },
    });
    const user = await fixturesForHttp(db, http).user(tenant, role);
    return {
      ...owner,
      userId: user.id,
      email: user.email,
      password: user.password,
    };
  };
  /** Transparent local relay forwards one exact authenticated request, drains the
   * actual committed response, then closes the downstream socket without bytes. */
  const loseResponse = async (
    token: string,
    operation: Operation,
    key: string,
    body: object,
  ) => {
    const target = new URL(await http.listenLoopback());
    let committed: unknown,
      upstreamStatus: number | undefined,
      forwarded = 0;
    const route =
      '/api/integrations/crm/' +
      (operation === 'install' ? 'connect' : 'activate');
    const relay = createServer((incoming, outgoing) => {
      if (
        ++forwarded !== 1 ||
        incoming.url !== route ||
        incoming.method !== 'POST'
      ) {
        outgoing.destroy();
        return;
      }
      const upstream = nodeRequest(
        {
          hostname: target.hostname,
          port: target.port,
          path: route,
          method: 'POST',
          headers: {
            ...incoming.headers,
            host: target.host,
            connection: 'close',
          },
        },
        (response) => {
          upstreamStatus = response.statusCode;
          const parts: Buffer[] = [];
          let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 262144) {
              response.destroy();
              outgoing.destroy();
              return;
            }
            parts.push(chunk);
          });
          response.on('end', () => {
            try {
              committed = JSON.parse(
                Buffer.concat(parts).toString('utf8'),
              ) as unknown;
            } catch {
              forbidden.push('invalid-relay-response');
            }
            outgoing.destroy();
          });
          response.on('error', () => outgoing.destroy());
        },
      );
      upstream.setTimeout(20000, () =>
        upstream.destroy(new Error('Bounded relay timeout')),
      );
      upstream.on('error', () => outgoing.destroy());
      incoming.pipe(upstream);
    });
    await new Promise<void>((resolve, reject) => {
      relay.once('error', reject);
      relay.listen(0, '127.0.0.1', resolve);
    });
    try {
      let error: unknown;
      try {
        await request(relay)
          .post(route)
          .set('Authorization', 'Bearer ' + token)
          .set('Idempotency-Key', key)
          .send(body)
          .timeout({ response: 22000, deadline: 25000 });
      } catch (caught) {
        error = caught;
      }
      // Node transport errors can cross Jest's VM realm. The exact error code
      // below proves delivery failure without relying on prototype identity.
      assert.ok(error, 'Downstream must lose its response');
      expect(object(error).code).toBe('ECONNRESET');
      expect(upstreamStatus).toBe(201);
      expect(forwarded).toBe(1);
      return receiptOf(committed, operation, key);
    } finally {
      relay.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        relay.close((error) => (error ? reject(error) : resolve())),
      );
    }
  };
  const readSucceededWithoutEffects = async (
    token: string,
    owner: Login,
    receipt: Receipt,
    matchesCurrentVersion = true,
  ) => {
    const before = await durable(owner.tenantId),
      reads = providerReads.length;
    const result = await getOperation(
      token,
      receipt.operation,
      receipt.requestId,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      contract: 'maya.crm-operation-status/1',
      operation: receipt.operation,
      requestId: receipt.requestId,
      status: 'SUCCEEDED',
      receipt,
      current: { matchesCurrentVersion },
      reason: null,
    });
    expect(providerReads).toHaveLength(reads);
    expect(await durable(owner.tenantId)).toEqual(before);
    return object(result.body);
  };
  const preparePreAdmissionRecovery = async () => {
    const owner = await createTenant('Synthetic request never registered'),
      token = await login(owner),
      requestId = randomUUID();
    const body = connectBody(owner.branchId, null),
      before = await durable(owner.tenantId),
      reads = providerReads.length;
    let discarded = 0;
    // Deliberately drops one real HTTP request before any forwarding/admission.
    const relay = createServer((incoming, outgoing) => {
      expect(incoming.method).toBe('POST');
      expect(incoming.url).toBe('/api/integrations/crm/connect');
      incoming.resume();
      incoming.on('end', () => {
        discarded++;
        outgoing.destroy();
      });
    });
    await new Promise<void>((resolve, reject) => {
      relay.once('error', reject);
      relay.listen(0, '127.0.0.1', resolve);
    });
    try {
      let error: unknown;
      try {
        await request(relay)
          .post('/api/integrations/crm/connect')
          .set('Authorization', 'Bearer ' + token)
          .set('Idempotency-Key', requestId)
          .send(body)
          .timeout({ response: 5000, deadline: 7000 });
      } catch (caught) {
        error = caught;
      }
      assert.ok(error);
      expect(object(error).code).toBe('ECONNRESET');
      expect(discarded).toBe(1);
    } finally {
      relay.closeAllConnections();
      await new Promise<void>((resolve) => relay.close(() => resolve()));
    }
    const status = await getOperation(token, 'install', requestId);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'NOT_OBSERVED',
      phase: null,
      receipt: null,
    });
    expect(await durable(owner.tenantId)).toEqual(before);
    expect(providerReads).toHaveLength(reads);
    saved.preAdmission = { owner, requestId, materialHash: hash(body) };
    observations.preAdmission = {
      responseLostBeforeForward: true,
      backendRegistrations: 0,
      providerReads: 0,
      status: 'NOT_OBSERVED',
      awaitsActualRestart: true,
    };
    checks.push(
      'HTTP request lost before forwarding leaves no registration or credential; NOT_OBSERVED never clears original locator',
    );

    const running = await createTenant(
        'Synthetic original install still running',
      ),
      runningToken = await login(running),
      key = randomUUID();
    const material = connectBody(running.branchId, null);
    let reached!: () => void;
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseHeldRead = resolve;
    });
    pause = { reached, released };
    const original = post(runningToken, 'install', key, material).then(
      (response) => response,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        entered,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Original preview not paused')),
            8000,
          );
        }),
      ]);
      const waiting = await getOperation(runningToken, 'install', key);
      expect(waiting.status).toBe(200);
      expect(waiting.body).toMatchObject({
        status: 'NOT_OBSERVED',
        receipt: null,
      });
      expect((await durable(running.tenantId)).executions).toHaveLength(0);
      const retried = await post(runningToken, 'install', key, material);
      expect(retried.status).toBe(201);
      const receipt = receiptOf(retried.body, 'install', key);
      releaseHeldRead?.();
      const delivered = await original;
      expect(delivered.status).toBe(201);
      expect(receiptOf(delivered.body, 'install', key)).toEqual(receipt);
      const committed = await durable(running.tenantId);
      expect(committed.executions).toHaveLength(1);
      expect(committed.mutations).toHaveLength(1);
      expect(committed.executions[0].executionAttemptCount).toBe(1);
      const previousReads = providerReads.length;
      const changed = await post(
        runningToken,
        'install',
        key,
        connectBody(running.branchId, null, 2),
      );
      expect(changed.status).toBe(409);
      expect(changed.body).toMatchObject({
        error: { code: 'crm_operation_material_changed' },
      });
      expect(await durable(running.tenantId)).toEqual(committed);
      expect(providerReads).toHaveLength(previousReads);
      observations.runningOriginal = {
        observedWhileRunning: 'NOT_OBSERVED',
        firstAndRetrySameReceipt: true,
        exactExecutionCount: 1,
        exactMutationCount: 1,
        exactAttemptCount: 1,
        changedMaterialHttpStatus: 409,
      };
    } finally {
      clearTimeout(timer);
      releaseHeldRead?.();
      await original;
    }
    await noUnrelatedEffects(running.tenantId);
    checks.push(
      'Original preview still running and explicit same-ID retry converge to one durable install; first admitted material refuses later changed credentials',
    );
  };
  const prepareUnfinished = async () => {
    const owner = await createTenant('Synthetic durable READY install'),
      token = await login(owner),
      requestId = randomUUID();
    const material = connectBody(owner.branchId, null);
    const ingress = http.app.get(CanonicalActionIngressService),
      original = ingress.createExecution.bind(ingress);
    let executionId: string | undefined;
    const hold = jest
      .spyOn(ingress, 'createExecution')
      .mockImplementationOnce(async (input) => {
        expect(input.tenantId).toBe(owner.tenantId);
        const admitted = await original(input);
        executionId = admitted.id;
        throw new Error('SYNTHETIC_DELIVERY_LOSS_AFTER_REAL_A17_ADMISSION');
      });
    let response;
    try {
      response = await post(token, 'install', requestId, material);
    } finally {
      hold.mockRestore();
    }
    expect(response.status).toBe(500);
    assert.ok(executionId);
    const admitted = await durable(owner.tenantId);
    expect(admitted.integration).toBeNull();
    expect(admitted.mutations).toHaveLength(0);
    expect(admitted.executions).toHaveLength(1);
    expect(admitted.executions[0]).toMatchObject({
      id: executionId,
      state: 'READY',
      executionAttemptCount: 0,
      attempts: [],
    });
    const reads = providerReads.length;
    const status = await getOperation(token, 'install', requestId);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'READY',
      phase: 'install',
      receipt: null,
    });
    expect(providerReads).toHaveLength(reads);
    expect(await durable(owner.tenantId)).toEqual(admitted);
    saved.unfinished = {
      owner,
      requestId,
      executionId,
      graphHash: hash(admitted),
      materialHash: hash(material),
    };
    observations.unfinished = {
      realCanonicalAdmission: true,
      seam: 'CALL_THROUGH_INGRESS_THEN_THROW_BEFORE_LOCAL_MUTATION',
      state: 'READY',
      attempts: 0,
      mutations: 0,
      awaitsActualRestart: true,
    };
    checks.push(
      'Canonical ingress durably admits READY before a labelled test-only delivery failure; no row seeding or mutation',
    );
  };
  const resumePending = async () => {
    assert.ok(saved.preAdmission && saved.unfinished);
    for (const [kind, entry] of [
      ['NOT_OBSERVED', saved.preAdmission],
      ['READY', saved.unfinished],
    ] as const) {
      const token = await login(entry.owner),
        before = await durable(entry.owner.tenantId),
        reads = providerReads.length;
      if (kind === 'READY')
        expect(hash(before)).toBe(saved.unfinished.graphHash);
      else {
        expect(before.executions).toHaveLength(0);
        expect(before.integration).toBeNull();
      }
      const status = await getOperation(token, 'install', entry.requestId);
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({ status: kind, receipt: null });
      expect(await durable(entry.owner.tenantId)).toEqual(before);
      expect(providerReads).toHaveLength(reads);
      const material = connectBody(entry.owner.branchId, null);
      expect(hash(material)).toBe(entry.materialHash);
      const result = await post(token, 'install', entry.requestId, material);
      expect(result.status).toBe(201);
      const receipt = receiptOf(result.body, 'install', entry.requestId);
      if (kind === 'READY')
        expect(receipt.executionId).toBe(saved.unfinished.executionId);
      const completed = await durable(entry.owner.tenantId);
      expect(completed.executions).toHaveLength(1);
      expect(completed.mutations).toHaveLength(1);
      expect(completed.executions[0]).toMatchObject({
        id: receipt.executionId,
        state: 'SUCCEEDED',
        executionAttemptCount: 1,
      });
      await readSucceededWithoutEffects(token, entry.owner, receipt);
      await noUnrelatedEffects(entry.owner.tenantId);
      observations['restart-' + kind] = {
        statusBeforeExplicitRetry: kind,
        sameRequestId: true,
        exactExecutions: 1,
        exactMutations: 1,
        exactAttempts: 1,
        receiptHash: hash(receipt),
      };
    }
    checks.push(
      'After actual Node/PG restart, both NOT_OBSERVED and durable READY stay inert until an explicit same-ID submission; READY keeps the original execution',
    );
  };
  const proveProjectionRollback = async () => {
    const owner = await createTenant('Synthetic atomic projection rollback'),
      token = await login(owner);
    // This labelled setup makes the projection's company timezone change observable.
    await db.prisma.tenant.update({
      where: { id: owner.tenantId },
      data: { defaultTimezone: 'UTC' },
    });
    const installed = await post(
      token,
      'install',
      randomUUID(),
      connectBody(owner.branchId, null),
    );
    expect(installed.status).toBe(201);
    const version = versionOf(installed.body),
      key = randomUUID();
    const crm = http.app.get(CrmService),
      original = crm.applyCanonicalImportProjection.bind(crm);
    let projectionCalled = 0;
    const failure = jest
      .spyOn(crm, 'applyCanonicalImportProjection')
      .mockImplementation(async (tenantId, preview, tx) => {
        expect(tenantId).toBe(owner.tenantId);
        assert.ok(tx, 'Canonical confirmation must own the transaction');
        projectionCalled++;
        await original(tenantId, preview, tx);
        expect(
          (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }))
            .defaultTimezone,
        ).toBe('Europe/Moscow');
        throw new Error('SYNTHETIC_A17_AFTER_REAL_PROJECTION');
      });
    let response;
    try {
      response = await post(token, 'activate', key, {
        expectedVersion: version,
      });
    } finally {
      failure.mockRestore();
    }
    expect(response.status).toBe(500);
    expect(projectionCalled).toBe(1);
    const held = await durable(owner.tenantId);
    expect(held.integration?.status).toBe('active');
    expect(held.tenant?.defaultTimezone).toBe('UTC');
    expect(
      object(held.integration?.settingsJson).acceptedImportSnapshotHash,
    ).toBeUndefined();
    const confirm = held.executions.find(
      (row) =>
        row.capability === 'package5.wave3.confirm-crm-import.execute.v1',
    );
    assert.ok(confirm);
    expect(confirm.state).toBe('READY');
    expect(confirm.executionAttemptCount).toBe(0);
    expect(confirm.attempts).toEqual([]);
    expect(held.mutations).toHaveLength(2);
    const reads = providerReads.length;
    const status = await getOperation(token, 'activate', key);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'READY',
      phase: 'confirm',
      receipt: null,
    });
    expect(await durable(owner.tenantId)).toEqual(held);
    expect(providerReads).toHaveLength(reads);
    const continued = await post(token, 'activate', key, {
      expectedVersion: version,
    });
    expect(continued.status).toBe(201);
    const receipt = receiptOf(continued.body, 'activate', key);
    expect(receipt.executionId).toBe(confirm.id);
    const completed = await durable(owner.tenantId);
    expect(completed.executions.map((row) => row.id)).toEqual(
      held.executions.map((row) => row.id),
    );
    expect(completed.mutations).toHaveLength(3);
    expect(completed.tenant?.defaultTimezone).toBe('Europe/Moscow');
    for (const row of completed.executions) {
      expect(row.state).toBe('SUCCEEDED');
      expect(row.executionAttemptCount).toBe(1);
      expect(row.attempts).toHaveLength(1);
    }
    await noUnrelatedEffects(owner.tenantId);
    observations.projectionRollback = {
      injectedAfterActualTransactionalProjection: true,
      firstHttpStatus: 500,
      confirmRolledBackToReady: true,
      originalConfirmExecutionPreserved: true,
      finalExecutionCount: completed.executions.length,
      finalMutationCount: completed.mutations.length,
      finalReceiptHash: hash(receipt),
    };
    checks.push(
      'Real import writes roll back after a test-only post-projection throw; explicit same-key continuation finishes the original confirm once',
    );
  };
  const proveCurrentForm = async () => {
    const owner = await createTenant('Synthetic current React A17');
    const refusals = [
      {
        key: 'provider-denied',
        apiToken: 'SYNTHETIC_A17_DENIED',
        code: 'crm_credentials_rejected',
        owner: await createTenant('Synthetic provider denied'),
      },
      {
        key: 'company-unavailable',
        apiToken: 'SYNTHETIC_A17_COMPANY_MISSING',
        code: 'crm_company_not_found',
        owner: await createTenant('Synthetic company unavailable'),
      },
      {
        key: 'company-malformed-title',
        apiToken: 'SYNTHETIC_A17_COMPANY_BAD_TITLE',
        code: 'crm_connection_failed',
        owner: await createTenant('Synthetic malformed company title'),
      },
    ];
    const refused: Record<
      string,
      { requestId: string; reads: number; graphHash: string }
    > = {};
    const refusalEvidence: Array<Record<string, unknown>> = [];
    const names = [
      'initial',
      'loaded',
      'install-lost',
      'install-reloaded',
      'not-observed',
      'installed',
      'activation-lost',
      'reload',
      'recovered',
      ...refusals.flatMap((value) => [
        value.key + '-result',
        value.key + '-observed',
      ]),
    ];
    const initialReads = providerReads.length;
    let index = 0,
      install: Receipt | undefined,
      activationKey: string | undefined;
    let preAdmissionKey: string | undefined;
    let committedHash: string | undefined, committedReads: number | undefined;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/crm-a17-setup-browser-probe.mjs',
          ),
        ],
        {
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' },
        },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve(),
        killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??=
          error instanceof Error
            ? error
            : new Error('Browser checkpoint failed');
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded current CRM form timeout')),
        180000,
      );
      child.stderr!.on('data', (buffer: Buffer) => {
        stderr = (stderr + buffer.toString()).slice(-4096);
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = object(raw);
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output: path.dirname(reportPath),
                email: owner.email,
                tenantSlug: owner.slug,
                password: owner.password,
                branchId: owner.branchId,
                branchName: 'Synthetic branch',
                companyId,
                apiToken: 'SYNTHETIC_A17_V1',
                refusals: refusals.map((value) => ({
                  key: value.key,
                  apiToken: value.apiToken,
                  tenantSlug: value.owner.slug,
                  email: value.owner.email,
                  password: value.owner.password,
                  branchId: value.owner.branchId,
                  branchName: 'Synthetic branch',
                  companyId,
                })),
              });
              return;
            }
            if (message.type === 'web-ready') {
              assert.equal(browserOrigin, undefined);
              assert.equal(typeof message.origin, 'string');
              const web = new URL(message.origin as string);
              assert.equal(web.protocol, 'http:');
              assert.equal(web.hostname, '127.0.0.1');
              assert.equal(
                web.username + web.password + web.search + web.hash,
                '',
              );
              assert.equal(web.pathname, '/');
              assert.ok(Number(web.port) > 1024);
              browserOrigin = web.origin;
              child.send({ type: 'continue:web-ready' });
              return;
            }
            expect(message.type).toBe('checkpoint');
            expect(message.name).toBe(names[index]);
            const current = await durable(owner.tenantId);
            const refusal = refusals.find(
              (value) =>
                message.name === value.key + '-result' ||
                message.name === value.key + '-observed',
            );
            if (refusal) {
              assert.ok(committedHash && committedReads !== undefined);
              expect(hash(current)).toBe(committedHash);
              const state = await durable(refusal.owner.tenantId);
              expect(state.integration).toBeNull();
              expect(state.executions).toEqual([]);
              expect(state.mutations).toEqual([]);
              expect(state.team).toEqual([]);
              assert.equal(typeof message.requestId, 'string');
              const requestId = message.requestId as string;
              assert.match(
                requestId,
                /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
              );
              if (message.name === refusal.key + '-result') {
                expect(message.code).toBe(refusal.code);
                expect(refused[refusal.key]).toBeUndefined();
                const refusalIndex = refusals.indexOf(refusal);
                expect(refusalEvidence).toHaveLength(refusalIndex);
                const startReads =
                  refusalIndex === 0
                    ? committedReads
                    : refused[refusals[refusalIndex - 1].key].reads;
                expect(providerReads.slice(startReads)).toEqual(['companies']);
                refused[refusal.key] = {
                  requestId,
                  reads: providerReads.length,
                  graphHash: hash(state),
                };
              } else {
                expect(message.status).toBe('NOT_OBSERVED');
                const previous = refused[refusal.key];
                assert.ok(previous);
                expect(requestId).toBe(previous.requestId);
                expect(providerReads).toHaveLength(previous.reads);
                expect(hash(state)).toBe(previous.graphHash);
                const result = await getOperation(
                  await login(refusal.owner),
                  'install',
                  requestId,
                );
                expect(result.status).toBe(200);
                expect(result.body).toMatchObject({
                  operation: 'install',
                  requestId,
                  status: 'NOT_OBSERVED',
                  phase: null,
                  receipt: null,
                  current: {
                    configVersion: null,
                    matchesCurrentVersion: false,
                  },
                });
                expect(providerReads).toHaveLength(previous.reads);
                expect(await durable(refusal.owner.tenantId)).toEqual(state);
                refusalEvidence.push({
                  case: refusal.key,
                  httpStatus: 400,
                  code: refusal.code,
                  providerReads: 1,
                  providerRoute: 'companies',
                  operationHash: hash({ operation: 'install', requestId }),
                  receiptStatus: 'NOT_OBSERVED',
                  sameLocatorReload: true,
                  recoveryProviderReads: 0,
                  integrations: 0,
                  executions: 0,
                  mutations: 0,
                });
                observations.currentFormRefusals = refusalEvidence;
              }
              await noUnrelatedEffects(refusal.owner.tenantId);
            } else if (
              [
                'initial',
                'loaded',
                'install-lost',
                'install-reloaded',
                'not-observed',
              ].includes(String(message.name))
            ) {
              expect(current.executions).toHaveLength(0);
              expect(current.integration).toBeNull();
              expect(providerReads).toHaveLength(initialReads);
              if (message.name === 'install-lost') {
                assert.equal(typeof message.requestId, 'string');
                preAdmissionKey = message.requestId as string;
              }
              if (message.name === 'not-observed') {
                assert.ok(preAdmissionKey);
                expect(message.requestId).toBe(preAdmissionKey);
              }
            } else if (message.name === 'installed') {
              const value = object(message.receipt);
              assert.equal(typeof value.requestId, 'string');
              install = receiptOf(
                { receipt: value },
                'install',
                value.requestId as string,
              );
              expect(install.requestId).toBe(preAdmissionKey);
              expect(current.executions).toHaveLength(1);
              expect(current.mutations).toHaveLength(1);
              expect(current.integration?.status).toBe('pending_activation');
              // Separate actual HTTP receipt read after save; no provider read
              // or mutation is permitted by the status path.
              await readSucceededWithoutEffects(
                await login(owner),
                owner,
                install,
              );
            } else if (message.name === 'activation-lost') {
              assert.ok(install);
              assert.equal(typeof message.requestId, 'string');
              activationKey = message.requestId as string;
              expect(message.configVersion).toBe(install.configVersion);
              expect(current.executions).toHaveLength(3);
              expect(current.mutations).toHaveLength(3);
              for (const row of current.executions) {
                expect(row.state).toBe('SUCCEEDED');
                expect(row.executionAttemptCount).toBe(1);
              }
              expect(current.integration?.status).toBe('active');
              expect(
                object(current.integration?.settingsJson)
                  .acceptedImportSnapshotHash,
              ).toMatch(/^[a-f0-9]{64}$/);
              committedHash = hash(current);
              committedReads = providerReads.length;
            } else {
              assert.ok(committedHash && committedReads !== undefined);
              expect(hash(current)).toBe(committedHash);
              expect(providerReads).toHaveLength(committedReads);
              if (message.name === 'recovered') {
                assert.ok(activationKey && install);
                const receipt = receiptOf(message, 'activate', activationKey);
                expect(receipt.configVersion).toBe(install.configVersion);
                expect(
                  current.executions.some(
                    (row) =>
                      row.id === receipt.executionId &&
                      row.state === 'SUCCEEDED',
                  ),
                ).toBe(true);
                observations.currentForm = {
                  actualReact: true,
                  auth: 'ACTUAL_PASSWORD_LOGIN_SYNTHETIC_BCRYPT_USER',
                  profile: 'read_setup_v1',
                  profileScope:
                    'Exact runtime ingress and read-transport functions; test AppModule environment and explicit synthetic grants, not full private launcher acceptance',
                  checkpoints: names,
                  installReceiptHash: hash(install),
                  recoveredReceiptHash: hash(receipt),
                  actualCommittedResponseDropped: true,
                  providerReadsDuringRecovery: 0,
                  modelCalls: 0,
                  actualSetupExecutions: current.executions.length,
                  exactGraphHash: committedHash,
                  reloadQualification:
                    'SAME_URL_RELOAD_AND_ACTUAL_PASSWORD_RELOGIN; not OAuth navigation or browser across PG restart',
                };
              }
            }
            await noUnrelatedEffects(owner.tenantId);
            expect(
              await db.prisma.c9Run.count({
                where: { tenantId: owner.tenantId },
              }),
            ).toBe(0);
            index++;
            child.send({ type: 'continue:' + String(message.name) });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(new Error(`CRM form child ${code}: ${stderr}`)),
        );
      });
    });
    expect(index).toBe(names.length);
    expect(refusalEvidence).toHaveLength(refusals.length);
    checks.push(
      'Current React form uses explicit load/install/activation, clears credential, retains lost-response locator across same-URL reload, recovers exact receipt without resend',
    );
  };

  const proveAdditionalReadRefusals = async () => {
    const owner = await createTenant(
      'Synthetic exact profile refusal boundaries',
    );
    const token = await login(owner);
    const before = await durable(owner.tenantId),
      initialReads = providerReads.length;
    const stale = await post(
      token,
      'install',
      randomUUID(),
      connectBody(owner.branchId, 'f'.repeat(64)),
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: { code: 'crm_config_version_changed' },
    });
    expect(providerReads).toHaveLength(initialReads);
    expect(await durable(owner.tenantId)).toEqual(before);
    const key = randomUUID();
    const forbiddenResponse = await post(token, 'install', key, {
      ...connectBody(owner.branchId, null),
      apiToken: 'SYNTHETIC_A17_FORBIDDEN',
    });
    expect(forbiddenResponse.status).toBe(400);
    expect(forbiddenResponse.body).toMatchObject({
      error: { code: 'crm_credentials_rejected' },
    });
    expect(providerReads.slice(initialReads)).toEqual(['companies']);
    expect(await durable(owner.tenantId)).toEqual(before);
    const status = await getOperation(token, 'install', key);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'NOT_OBSERVED',
      phase: null,
      receipt: null,
    });
    expect(providerReads).toHaveLength(initialReads + 1);
    expect(await durable(owner.tenantId)).toEqual(before);
    observations.additionalReadRefusals = {
      staleVersion: {
        status: 409,
        code: 'crm_config_version_changed',
        providerReads: 0,
        canonicalActions: 0,
      },
      provider403: {
        status: 400,
        code: 'crm_credentials_rejected',
        providerReads: 1,
        canonicalActions: 0,
        recoveryProviderReads: 0,
        receiptStatus: 'NOT_OBSERVED',
      },
    };
    await noUnrelatedEffects(owner.tenantId);
    checks.push(
      'Exact profile rejects stale install source before native reads; native 403 produces safe credential refusal and no admitted operation',
    );
  };

  const proveReadProfileFence = async (owner: Login) => {
    const before = await durable(owner.tenantId);
    const reads = {
      ...readTransport.counters,
      routes: { ...readTransport.counters.routes },
    };
    const priorChecks = ingressEvidence.checked;
    const denied: Array<{
      method: string;
      path: string;
      status: number;
      code: string;
    }> = [];
    for (const [route, body] of [
      ['/api/auth/email/start', { email: owner.email }],
      ['/api/auth/email/verify', { email: owner.email, code: '123456' }],
      ['/api/ai/chat', { message: 'Synthetic request outside setup' }],
      ['/api/widgets/resolve', { thread_page: { limit: 20 } }],
      ['/api/integrations/crm/connect', connectBody(owner.branchId, null)],
    ] as const) {
      // In particular, connect lacks the required operation UUID. All requests
      // are refused by the exact profile before auth/controller/provider work.
      const result = await api().post(route).send(body);
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({
        error: { code: 'local_yclients_read_route_disabled' },
      });
      denied.push({
        method: 'POST',
        path: route,
        status: 403,
        code: 'local_yclients_read_route_disabled',
      });
    }
    const foreignOrigin = await api()
      .post('/api/auth/login')
      .set('Origin', 'https://synthetic-foreign.invalid')
      .send({
        tenantSlug: owner.slug,
        email: owner.email,
        password: owner.password,
      });
    expect(foreignOrigin.status).toBe(403);
    expect(foreignOrigin.body).toMatchObject({
      error: { code: 'local_onboarding_origin_refused' },
    });
    expect(ingressEvidence.checked - priorChecks).toBe(6);
    expect(readTransport.counters).toEqual(reads);
    expect(await durable(owner.tenantId)).toEqual(before);
    observations.readProfileFence = {
      profile: 'read_setup_v1',
      installedBeforeControllers: true,
      denied,
      foreignOriginStatus: 403,
      providerReads: 0,
      providerAttempts: 0,
      canonicalActionChanges: 0,
    };
    checks.push(
      'Exact setup-read ingress runs before controllers; OTP, chat, widgets, missing operation key and foreign origin cannot reach provider or AE',
    );
  };

  const provePreAdmission400Matrix = async () => {
    const results: Array<Record<string, unknown>> = [];
    observations.preAdmission400Matrix = results;
    const base = {
      id: companyId,
      title: 'Synthetic A17 company',
      active: true,
    };
    const preceding = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...base,
        id: companyId + i + 1,
      }));
    type MatrixCase = {
      key: string;
      payload?: unknown;
      control?: 'extra' | 'company' | 'key' | 'branch' | 'role' | 'version';
      status: number;
      code: string | null;
    };
    const cases: MatrixCase[] = [
      {
        key: 'selected-missing',
        payload: { success: true, data: [{ ...base, id: companyId + 1 }] },
        status: 400,
        code: 'crm_company_not_found',
      },
      {
        key: 'selected-inactive-boolean',
        payload: { success: true, data: [{ ...base, active: false }] },
        status: 400,
        code: 'crm_company_not_found',
      },
      {
        key: 'selected-beyond-200',
        payload: { success: true, data: [...preceding(200), base] },
        status: 201,
        code: null,
      },
      {
        key: 'data-absent',
        payload: { success: true },
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'data-non-array',
        payload: { success: true, data: {} },
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'envelope-null',
        payload: null,
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'envelope-array',
        payload: [base],
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'item-null',
        payload: { success: true, data: [null] },
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'items-primitive',
        payload: { success: true, data: [1, true, 'synthetic'] },
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'title-invalid-type',
        payload: { success: true, data: [{ ...base, title: 42 }] },
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'address-invalid-type',
        payload: { success: true, data: [{ ...base, address: 42 }] },
        status: 400,
        code: 'crm_connection_failed',
      },
      {
        key: 'unrelated-row-invalid-title',
        payload: {
          success: true,
          data: [base, { ...base, id: companyId + 1, title: 42 }],
        },
        status: 201,
        code: null,
      },
      {
        key: 'outer-shape',
        control: 'extra',
        status: 403,
        code: 'local_yclients_read_route_disabled',
      },
      {
        key: 'company-binding-mismatch',
        control: 'company',
        status: 403,
        code: 'local_yclients_read_route_disabled',
      },
      {
        key: 'request-key-missing',
        control: 'key',
        status: 403,
        code: 'local_yclients_read_route_disabled',
      },
      { key: 'foreign-branch', control: 'branch', status: 404, code: null },
      { key: 'client-role', control: 'role', status: 403, code: null },
      {
        key: 'stale-version',
        control: 'version',
        status: 409,
        code: 'crm_config_version_changed',
      },
      {
        key: 'positive-selected-first',
        payload: { success: true, data: [base] },
        status: 201,
        code: null,
      },
      {
        key: 'positive-selected-200th-string-id',
        payload: {
          success: true,
          data: [...preceding(199), { ...base, id: String(companyId) }],
        },
        status: 201,
        code: null,
      },
    ];
    const positiveRoutes = [
      'companies',
      `book_services/${companyId}`,
      `service_categories/${companyId}`,
      `company/${companyId}/staff`,
      `company/${companyId}`,
    ];
    const positiveCases = cases.filter((entry) => entry.status === 201).length;
    const beforeProviderCases = cases.filter((entry) => entry.control).length;
    const payloadRefusals = cases.length - positiveCases - beforeProviderCases;
    const expectedProviderReads =
      positiveCases * positiveRoutes.length + payloadRefusals;
    const matrixReadStart = providerReads.length;
    const foreign = await createTenant('Synthetic matrix foreign branch');
    const foreignBefore = await durable(foreign.tenantId);
    for (const entry of cases) {
      const owner = await createTenant('Synthetic matrix ' + entry.key);
      const ownerToken = await login(owner);
      const actorToken =
        entry.control === 'role'
          ? await login(await addUser(owner, UserRole.CLIENT))
          : ownerToken;
      const key = randomUUID(),
        before = await durable(owner.tenantId);
      const body: Record<string, unknown> = connectBody(owner.branchId, null);
      if (entry.control === 'extra') body.extra = true;
      if (entry.control === 'company')
        body.settingsJson = {
          ...object(body.settingsJson),
          companyId: companyId + 1,
        };
      if (entry.control === 'branch')
        body.settingsJson = {
          ...object(body.settingsJson),
          branchBinding: {
            ...object(object(body.settingsJson).branchBinding),
            branchId: foreign.branchId,
          },
        };
      if (entry.control === 'version') body.expectedVersion = 'f'.repeat(64);
      const events: Record<string, unknown>[] = [];
      matrixTrace = createReadTrace((value) => {
        const projected = projectReadTrace(value);
        if (projected === null) invalidTrace++;
        else events.push(projected);
      });
      matrixCompanies = entry.control ? undefined : { payload: entry.payload };
      const firstRead = providerReads.length;
      const invocation = api()
        .post('/api/integrations/crm/connect')
        .set('Authorization', 'Bearer ' + actorToken);
      if (entry.control !== 'key') invocation.set('Idempotency-Key', key);
      const response = await invocation
        .send(body)
        .timeout({ response: 15000, deadline: 25000 });
      const responseError = object(response.body).error;
      const code =
        responseError !== null &&
        typeof responseError === 'object' &&
        !Array.isArray(responseError)
          ? (object(responseError).code ?? null)
          : null;
      const state = await durable(owner.tenantId);
      const connectTrace = events.slice();
      const routes = providerReads.slice(firstRead);
      const row: Record<string, unknown> = {
        case: entry.key,
        boundary: entry.control
          ? 'before_provider'
          : entry.status === 201
            ? 'positive_install'
            : 'native_connection_check',
        httpStatus: response.status,
        errorCode: code,
        providerRoutes: routes,
        executions: state.executions.length,
        mutations: state.mutations.length,
        integrationStatus: state.integration?.status ?? null,
        trace: connectTrace,
        submittedRequestKey: entry.control !== 'key',
      };
      // Persist the observed result before checking a predicted classification.
      // A mismatch stays a failed measured case, never rewritten as a passing plan.
      results.push(row);
      expect(response.status).toBe(entry.status);
      expect(code).toBe(entry.code);
      expect(await durable(foreign.tenantId)).toEqual(foreignBefore);
      const httpEnd = connectTrace.filter(
        (event) =>
          event.surface === 'http' &&
          event.route === 'connect' &&
          event.stage !== 'entered',
      );
      expect(httpEnd).toHaveLength(1);
      expect(httpEnd[0].status).toBe(entry.status);
      const providerEvents = connectTrace.filter(
        (event) => event.surface === 'provider',
      );
      if (entry.status === 201) {
        const receipt = receiptOf(response.body, 'install', key);
        expect(state.executions).toHaveLength(1);
        expect(state.executions[0].state).toBe('SUCCEEDED');
        expect(state.executions[0].executionAttemptCount).toBe(1);
        expect(state.mutations).toHaveLength(1);
        expect(state.integration?.status).toBe('pending_activation');
        expect(routes.slice().sort()).toEqual(positiveRoutes.slice().sort());
        await readSucceededWithoutEffects(ownerToken, owner, receipt);
        row.receiptStatus = 'SUCCEEDED';
        row.receiptHash = hash(receipt);
      } else {
        expect(await durable(owner.tenantId)).toEqual(before);
        expect(state.executions).toEqual([]);
        expect(state.mutations).toEqual([]);
        expect(state.integration).toBeNull();
        if (entry.control) {
          expect(routes).toEqual([]);
          expect(providerEvents).toEqual([]);
        } else {
          expect(routes).toEqual(['companies']);
          expect(
            providerEvents.map((event) => ({
              stage: event.stage,
              status: event.status,
              code: event.code,
            })),
          ).toEqual([
            { stage: 'entered', status: null, code: null },
            { stage: 'completed', status: 200, code: 'provider_response_read' },
          ]);
          // Historical owner trace did not capture the response error code.
          // The new closed observer must preserve this actual canonical code.
          expect(httpEnd[0].code).toBe(entry.code);
        }
        const status = await getOperation(ownerToken, 'install', key);
        expect(status.status).toBe(200);
        expect(status.body).toMatchObject({
          status: 'NOT_OBSERVED',
          receipt: null,
          phase: null,
        });
        expect(providerReads).toHaveLength(firstRead + routes.length);
        expect(await durable(owner.tenantId)).toEqual(before);
        row.receiptStatus = 'NOT_OBSERVED';
      }
      row.recoveryTrace = events.slice(connectTrace.length);
      row.recoveryProviderReads = 0;
      await noUnrelatedEffects(owner.tenantId);
      row.noUnrelatedEffects = true;
      matrixCompanies = undefined;
      matrixTrace = undefined;
    }
    expect(results).toHaveLength(cases.length);
    expect(providerReads).toHaveLength(matrixReadStart + expectedProviderReads);
    checks.push(
      `${payloadRefusals} parsed HTTP200 companies payload classes fail before AE, with exact HTTP error codes and closed traces; status reads remain NOT_OBSERVED without redispatch`,
    );
    checks.push(
      `${beforeProviderCases} malformed/scope/version/role controls refuse before provider dispatch; ${positiveCases} selected-company controls install exactly once, including beyond the display cap and an unrelated invalid title`,
    );
    observations.matrixQualification = {
      cases: cases.length,
      positiveCases,
      beforeProviderCases,
      payloadRefusals,
      providerReads: providerReads.length - matrixReadStart,
      expectedProviderReads,
      realProviderCalls: 0,
      modelCalls: 0,
      perCaseObserver:
        'Existing closed trace projector, first64 per synthetic case; production global cap unchanged',
      historicalOwnerCause:
        'UNKNOWN; equal metadata trace does not identify the original provider payload',
      browserRun: false,
      restartRun: false,
    };
  };

  const proveOwnerLogin = async () => {
    const keys = [
      'MAYA_LOCAL_YCLIENTS_USER_AUTH',
      'MAYA_LOCAL_YCLIENTS_READ_PROFILE',
      'NODE_ENV',
      'YCLIENTS_PARTNER_TOKEN',
    ];
    const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const owner = await createTenant('Synthetic explicit CRM user login'),
      bearer = await login(owner),
      key = randomUUID();
    const before = await durable(owner.tenantId),
      start = providerReads.length;
    const makeBody = (password: string) => {
      const body: Record<string, unknown> = connectBody(owner.branchId, null);
      delete body.apiToken;
      return {
        ...body,
        yclientsLogin: { login: 'auth-fixture@example.invalid', password },
      };
    };
    const events: Record<string, unknown>[] = [];
    matrixTrace = createReadTrace((event) => events.push(object(event)));
    try {
      process.env.MAYA_LOCAL_YCLIENTS_USER_AUTH = 'owner_login_v1';
      process.env.MAYA_LOCAL_YCLIENTS_READ_PROFILE = 'read_setup_v1';
      process.env.NODE_ENV = 'development';
      process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_A17_PARTNER';
      const wrong = await post(
        bearer,
        'install',
        key,
        makeBody('Synthetic Incorrect 42'),
      );
      expect(wrong.status).toBe(400);
      expect(wrong.body).toMatchObject({
        error: { code: 'crm_credentials_rejected' },
      });
      expect(await durable(owner.tenantId)).toEqual(before);
      expect((await getOperation(bearer, 'install', key)).body).toMatchObject({
        status: 'NOT_OBSERVED',
      });
      expect(providerReads.slice(start)).toEqual(['auth']);
      const result = await post(
        bearer,
        'install',
        key,
        makeBody('Synthetic Correct 42'),
      );
      expect(result.status).toBe(201);
      receiptOf(result.body, 'install', key);
      const stored = await durable(owner.tenantId);
      expect(stored.executions).toHaveLength(1);
      expect(stored.mutations).toHaveLength(1);
      expect(stored.integration?.status).toBe('pending_activation');
      const connection = await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
        select: { encryptedApiToken: true },
      });
      expect(connection.encryptedApiToken).not.toContain('SYNTHETIC_A17_V1');
      expect(
        http.app.get(EncryptionService).decrypt(connection.encryptedApiToken),
      ).toBe('SYNTHETIC_A17_V1');
      const durableText = JSON.stringify(stored),
        responseText = JSON.stringify(result.body),
        traceText = JSON.stringify(events);
      for (const text of [durableText, responseText, traceText])
        for (const excluded of [
          'auth-fixture@example.invalid',
          'Synthetic Correct 42',
          'Synthetic Incorrect 42',
          'SYNTHETIC_A17_V1',
          'PRIVATE_FAILURE_DETAIL',
        ])
          expect(text).not.toContain(excluded);
      const readCount = providerReads.length;
      expect((await getOperation(bearer, 'install', key)).body).toMatchObject({
        status: 'SUCCEEDED',
      });
      expect(providerReads).toHaveLength(readCount);
      await noUnrelatedEffects(owner.tenantId);
      checks.push(
        'Actual HTTP/PG user login: wrong password stays NOT_OBSERVED; explicit same-key correction installs encrypted user token once; status reads do not authenticate again; no credential in receipt, durable evidence or trace',
      );
      observations.userLogin = {
        actualHttp: true,
        actualPostgreSQL: true,
        syntheticProvider: true,
        realAuthorizationCalls: 0,
        authCalls: 2,
        installed: true,
        activation: false,
        credentialLeak: false,
        events,
      };
    } finally {
      matrixTrace = undefined;
      for (const [k, v] of Object.entries(original)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it('pins versions, loses committed responses, and restores only existing A17 outcomes after actual restart', async () => {
    let passed = false;
    try {
      if (stage === 'matrix') {
        await provePreAdmission400Matrix();
        await proveOwnerLogin();
      } else if (stage === 'prepare') {
        const owner = await createTenant('Synthetic A17 recovery');
        const otherOwner = await addUser(owner, UserRole.TENANT_OWNER);
        const client = await addUser(owner, UserRole.CLIENT);
        const foreign = await createTenant('Synthetic foreign A17');
        await proveReadProfileFence(owner);
        const token = await login(owner);
        const missing = await getOperation(token, 'install', randomUUID());
        expect(missing.status).toBe(200);
        expect(missing.body).toMatchObject({
          status: 'NOT_OBSERVED',
          receipt: null,
        });
        expect(providerReads).toHaveLength(0);
        const installKey = randomUUID();
        const install = await loseResponse(
          token,
          'install',
          installKey,
          connectBody(owner.branchId, null),
        );
        await readSucceededWithoutEffects(token, owner, install);
        checks.push(
          'Actual install commit survives HTTP response loss; operation GET performs no provider read or repeat mutation',
        );
        const activate = await loseResponse(token, 'activate', randomUUID(), {
          expectedVersion: install.configVersion,
        });
        await readSucceededWithoutEffects(token, owner, activate);
        const committed = await durable(owner.tenantId);
        expect(committed.executions).toHaveLength(3);
        expect(committed.mutations).toHaveLength(3);
        expect(committed.integration?.status).toBe('active');
        expect(committed.tenant?.defaultTimezone).toBe('Europe/Moscow');
        for (const row of committed.executions) {
          expect(row.state).toBe('SUCCEEDED');
          expect(row.executionAttemptCount).toBe(1);
          expect(row.attempts).toHaveLength(1);
        }
        checks.push(
          'Activation and atomic import commit once; final operation receipt survives discarded response',
        );
        observations.committed = {
          executionCount: committed.executions.length,
          attemptCount: committed.executions.reduce(
            (count, row) => count + row.attempts.length,
            0,
          ),
          mutationCount: committed.mutations.length,
          graphHash: hash(committed),
        };
        saved = {
          owner,
          otherOwner,
          client,
          foreign,
          install,
          activate,
          graphHash: hash(committed),
          processId: process.pid,
          postmasterStartedAt: await postmasterStartedAt(),
        };

        const race = await createTenant('Synthetic A17 version race'),
          raceToken = await login(race);
        const v1Response = await post(
          raceToken,
          'install',
          randomUUID(),
          connectBody(race.branchId, null),
        );
        expect(v1Response.status).toBe(201);
        const v1 = versionOf(v1Response.body),
          before = await durable(race.tenantId);
        let reached!: () => void;
        const entered = new Promise<void>((resolve) => {
          reached = resolve;
        });
        const released = new Promise<void>((resolve) => {
          releaseHeldRead = resolve;
        });
        pause = { reached, released };
        const racingKey = randomUUID();
        const racing = post(raceToken, 'activate', racingKey, {
          expectedVersion: v1,
        }).then((response) => response);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            entered,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Verification pause not reached')),
                8000,
              );
            }),
          ]);
          const v2Response = await post(
            raceToken,
            'install',
            randomUUID(),
            connectBody(race.branchId, v1, 2),
          );
          expect(v2Response.status).toBe(201);
          const v2 = versionOf(v2Response.body);
          expect(v2).not.toBe(v1);
          releaseHeldRead?.();
          const refused = await racing;
          expect(refused.status).toBe(409);
          expect(refused.body).toMatchObject({
            error: { code: 'crm_config_version_changed' },
          });
          const current = await db.prisma.crmIntegration.findUniqueOrThrow({
            where: { tenantId: race.tenantId },
          });
          expect(current.status).toBe('pending_activation');
          const after = await durable(race.tenantId);
          expect(after.mutations).toHaveLength(before.mutations.length + 1);
          expect(
            after.executions.filter((row) => row.state === 'SUCCEEDED'),
          ).toHaveLength(2);
          const reads = providerReads.length;
          const stale = await post(raceToken, 'activate', randomUUID(), {
            expectedVersion: v1,
          });
          expect(stale.status).toBe(409);
          expect(providerReads).toHaveLength(reads);
          expect(stale.body).toMatchObject({
            error: { code: 'crm_config_version_changed' },
          });
          expect(await durable(race.tenantId)).toEqual(after);
          observations.versionRace = {
            status: refused.status,
            oldVersionStatus: stale.status,
            v1Hash: hash(v1),
            v2Hash: hash(v2),
            committedMutations: after.mutations.length,
          };
        } finally {
          clearTimeout(timer);
          releaseHeldRead?.();
          await racing;
        }
        checks.push(
          'Replacement during real native verification refuses stale activation; old reviewed version refuses before provider reads',
        );
        await noUnrelatedEffects(owner.tenantId);
        await noUnrelatedEffects(race.tenantId);
        await proveProjectionRollback();
        await preparePreAdmissionRecovery();
        await prepareUnfinished();
        await proveAdditionalReadRefusals();
        await proveCurrentForm();
        writeFileSync(receiptPath, JSON.stringify(saved) + '\n', {
          flag: 'wx',
          mode: 0o600,
        });
      } else {
        saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Saved;
        expect(process.pid).not.toBe(saved.processId);
        expect(await postmasterStartedAt()).not.toBe(saved.postmasterStartedAt);
        const token = await login(saved.owner);
        expect(hash(await durable(saved.owner.tenantId))).toBe(saved.graphHash);
        await readSucceededWithoutEffects(token, saved.owner, saved.install);
        await readSucceededWithoutEffects(token, saved.owner, saved.activate);
        expect(providerReads).toHaveLength(0);
        observations.restored = {
          graphHash: saved.graphHash,
          processChanged: true,
          postmasterChanged: true,
          providerReadCount: providerReads.length,
          installReceiptHash: hash(saved.install),
          activationReceiptHash: hash(saved.activate),
        };
        checks.push(
          'Different Node process and restarted PG preserve exact install/activation receipts, attempts, original evidence and mutation graph',
        );
        const expiredClaims = {
          ...(await db.jwt.verifyAsync<Record<string, unknown>>(token)),
        };
        delete expiredClaims.iat;
        delete expiredClaims.exp;
        delete expiredClaims.nbf;
        // A deliberately expired, correctly signed fixture credential; no AE
        // deadline, source timestamp or persisted authentication row is changed.
        const expiredToken = await db.jwt.signAsync(expiredClaims, {
          expiresIn: -1,
        });
        const beforeExpiredAuth = await durable(saved.owner.tenantId),
          beforeExpiredReads = providerReads.length;
        const expired = await getOperation(
          expiredToken,
          'activate',
          saved.activate.requestId,
        );
        expect(expired.status).toBe(401);
        expect(await durable(saved.owner.tenantId)).toEqual(beforeExpiredAuth);
        expect(providerReads).toHaveLength(beforeExpiredReads);
        observations.expiredAuthentication = {
          fixture: 'SIGNED_EXPIRED_ACCESS_TOKEN',
          httpStatus: 401,
          actionGraphUnchanged: true,
          providerReads: 0,
        };
        await resumePending();

        const reads = providerReads.length,
          before = await durable(saved.owner.tenantId);
        const foreign = await getOperation(
          await login(saved.foreign),
          'activate',
          saved.activate.requestId,
        );
        expect(foreign.status).toBe(200);
        expect(foreign.body).toMatchObject({
          status: 'NOT_OBSERVED',
          receipt: null,
        });
        const other = await getOperation(
          await login(saved.otherOwner),
          'activate',
          saved.activate.requestId,
        );
        expect(other.status).toBe(403);
        expect(other.body).toMatchObject({
          error: { code: 'crm_operation_actor_mismatch' },
        });
        const client = await getOperation(
          await login(saved.client),
          'activate',
          saved.activate.requestId,
        );
        expect(client.status).toBe(403);
        expect(await durable(saved.owner.tenantId)).toEqual(before);
        expect(providerReads).toHaveLength(reads);
        checks.push(
          'Foreign tenant cannot observe receipt; different actor and Client role are refused without provider reads or action changes',
        );

        const replacement = await post(
          token,
          'install',
          randomUUID(),
          connectBody(saved.owner.branchId, saved.activate.configVersion, 2),
        );
        expect(replacement.status).toBe(201);
        expect(versionOf(replacement.body)).not.toBe(
          saved.activate.configVersion,
        );
        await readSucceededWithoutEffects(
          token,
          saved.owner,
          saved.activate,
          false,
        );
        checks.push(
          'Historic success remains an exact receipt after explicit replacement; current configuration is separately marked different',
        );
        // Labelled authority fixture transition, outside the measured operation GET.
        await db.prisma.membership.update({
          where: {
            userId_tenantId: {
              userId: saved.owner.userId,
              tenantId: saved.owner.tenantId,
            },
          },
          data: { status: 'suspended' },
        });
        const beforeRevoked = await durable(saved.owner.tenantId),
          beforeReads = providerReads.length;
        const revoked = await getOperation(
          token,
          'activate',
          saved.activate.requestId,
        );
        // Existing session authentication rejects a suspended membership before
        // controller/role authorization is reached.
        expect(revoked.status).toBe(401);
        expect(await durable(saved.owner.tenantId)).toEqual(beforeRevoked);
        expect(providerReads).toHaveLength(beforeReads);
        checks.push(
          'Revoked membership blocks persisted operation recovery without new authority',
        );
        await noUnrelatedEffects(saved.owner.tenantId);
      }
      expect(invalidTrace).toBe(0);
      expect(readTrace.length).toBeGreaterThan(0);
      expect(readTrace.length).toBeLessThanOrEqual(64);
      readTrace.forEach((value, index) => {
        expect(value.sequence).toBe(index + 1);
        expect(projectReadTrace(value)).toEqual(value);
      });
      expect(readTransport.counters.refused).toBe(0);
      expect(readTransport.counters.calls).toBe(providerReads.length);
      expect(sourceHashes()).toEqual(initialSource);
      passed = true;
    } finally {
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            contract: 'maya.crm-a17-operation-http-pg-proof/1',
            stage,
            status: passed ? 'passed' : 'failed',
            candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
              encoding: 'utf8',
            }).trim(),
            sourceHashes: initialSource,
            sourceUnchanged: hash(sourceHashes()) === hash(initialSource),
            checks,
            observations,
            limits: {
              expiredOrCleanedOperation:
                'UNIT_ONLY: existing 30-day immutable payload retention; no temporal HTTP mutation or clock bypass',
              workerCrash: false,
            },
            providerReadCount: providerReads.length,
            readTransport: readTransport?.counters,
            ingress: ingressEvidence,
            readTrace,
            traceQualification:
              'Actual closed observer, first 64 events only; no request identity or body retention',
            forbidden,
            qualification:
              stage === 'matrix'
                ? 'LOCAL_SYNTHETIC_NATIVE_ADAPTER_ONLY; actual HTTP pre-AE400 matrix and positive canonical installs; no browser/restart/live-provider acceptance'
                : 'LOCAL_SYNTHETIC_NATIVE_ADAPTER_ONLY; real canonical A17 writes in disposable PG; actual response-discard relay; no worker-crash or live-provider acceptance',
            boundaries: {
              model: 'forbidden spy',
              providerWrites:
                'exact local read_setup_v1 transport around finite synthetic native GETs',
              nativeFactory:
                'call-through; fixed synthetic partner scoped to construction',
              auth: 'actual password HTTP; fixture bcrypt user and explicit test entitlements',
              outbound: 'no delivery rows and no admitted external transport',
              privateReceiptArchived: false,
            },
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
    }
  });
});
