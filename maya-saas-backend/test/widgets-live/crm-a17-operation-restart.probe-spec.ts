/** Real HTTP/auth/PG/A17 owners; native adapter with finite synthetic GETs.
 * A loopback relay discards successful HTTP responses AFTER their real commit.
 * This is delivery loss, not a worker crash or an A17 UNKNOWN outcome. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, request as nodeRequest } from 'node:http';
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
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';

const stage = process.env.JEST_C9_OCCUPANCY_STAGE;
const receiptPath = process.env.JEST_C9_OCCUPANCY_RECEIPT!;
const reportPath = process.env.JEST_C9_OCCUPANCY_REPORT!;
assert.ok(
  ['prepare', 'resume'].includes(stage ?? '') && receiptPath && reportPath,
  'Use owned driver --crm-setup',
);
assertProofDatabase(process.env);
const companyId = 424242;
const origin = 'https://synthetic-a17-setup.invalid';
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
};
const sourceFiles = [
  'src/crm/crm-integration.controller.ts',
  'src/crm/dto/connect-crm-integration.dto.ts',
  'src/crm/dto/crm-operation.dto.ts',
  'src/crm/crm-configuration-version.ts',
  'src/crm/crm.service.ts',
  'src/crm/crm-provider-settings.ts',
  'src/crm/adapters/yclients-crm.adapter.ts',
  'src/package5-wave3/package5-wave3-canonical-cutover.service.ts',
  'src/package5-wave3/package5-wave3.service.ts',
  'src/package5-wave3/package5-wave3-production-gateway.service.ts',
  'src/action-engine/package5-wave3-executable.contract.ts',
  'scripts/c9-occupancy-proof.mjs',
  'scripts/crm-a17-operation-proof.test.mjs',
  'test/widgets-live/crm-a17-operation-restart.probe-spec.ts',
  'test/widgets-live/support/http-bootstrap.ts',
  'test/widgets-live/support/proof-db-guard.ts',
  '../maya-carrier-react/test/crm-a17-setup-browser-probe.mjs',
  '../maya-carrier-react/test/crm-a17-setup-browser-guard.mjs',
  '../maya-carrier-react/test/crm-a17-setup-browser-guard.test.mjs',
  '../maya-carrier-react/src/setup/LocalCrmSetup.tsx',
  '../maya-carrier-react/src/runtime/crmPending.ts',
  '../maya-carrier-react/src/runtime/compose.ts',
  '../maya-carrier-react/build.mjs',
  '../maya-chat-shell/src/shell/local-crm-setup.ts',
  '../maya-chat-shell/src/net/crm-setup.ts',
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
  let pause: { reached: () => void; released: Promise<void> } | undefined;

  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    http.app.get(ConfigService).set('EMAIL_LOGIN_ENABLED', 'true');
    http.app.get(ConfigService).set('EMAIL_AUTH_PROVIDER', 'debug');
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        assert.equal(provider, CrmProvider.YCLIENTS);
        assert.ok(
          config.apiToken === 'SYNTHETIC_A17_V1' ||
            config.apiToken === 'SYNTHETIC_A17_V2',
        );
        process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_A17_PARTNER';
        try {
          return new YclientsCRMAdapter({
            ...config,
            baseUrl: origin + '/api/v1',
          });
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
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
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
      providerReads.push(route);
      const company = {
        id: companyId,
        title: 'Synthetic A17 company',
        timezone_name: 'Europe/Moscow',
      };
      let data: unknown;
      if (route === 'companies') data = [company];
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
          `book_staff/${companyId}`,
        ].includes(route)
      )
        data = [];
      else {
        forbidden.push('unexpected-provider-route');
        throw new Error('Provider route refused');
      }
      const response = new Response(JSON.stringify({ success: true, data }), {
        status: 200,
      });
      if (route === `company/${companyId}` && pause) {
        const held = pause;
        pause = undefined;
        held.reached();
        return held.released.then(() => response);
      }
      return Promise.resolve(response);
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
    const names = [
      'initial',
      'loaded',
      'installed',
      'activation-lost',
      'reload',
      'recovered',
    ];
    const initialReads = providerReads.length;
    let index = 0,
      install: Receipt | undefined,
      activationKey: string | undefined;
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
                branchId: owner.branchId,
                branchName: 'Synthetic branch',
                companyId,
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            expect(message.name).toBe(names[index]);
            const current = await durable(owner.tenantId);
            if (message.name === 'initial' || message.name === 'loaded') {
              expect(current.executions).toHaveLength(0);
              expect(current.integration).toBeNull();
              expect(providerReads).toHaveLength(initialReads);
            } else if (message.name === 'installed') {
              const value = object(message.receipt);
              assert.equal(typeof value.requestId, 'string');
              install = receiptOf(
                { receipt: value },
                'install',
                value.requestId as string,
              );
              expect(current.executions).toHaveLength(1);
              expect(current.mutations).toHaveLength(1);
              expect(current.integration?.status).toBe('pending_activation');
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
                  checkpoints: names,
                  installReceiptHash: hash(install),
                  recoveredReceiptHash: hash(receipt),
                  actualCommittedResponseDropped: true,
                  providerReadsDuringRecovery: 0,
                  modelCalls: 0,
                  actualSetupExecutions: current.executions.length,
                  exactGraphHash: committedHash,
                  reloadQualification:
                    'SAME_URL_RELOAD_AND_DEBUG_EMAIL_RELOGIN; not OAuth navigation or browser across PG restart',
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
    checks.push(
      'Current React form uses explicit load/install/activation, clears credential, retains lost-response locator across same-URL reload, recovers exact receipt without resend',
    );
  };

  it('pins versions, loses committed responses, and restores only existing A17 outcomes after actual restart', async () => {
    let passed = false;
    try {
      if (stage === 'prepare') {
        const owner = await createTenant('Synthetic A17 recovery');
        const otherOwner = await addUser(owner, UserRole.TENANT_OWNER);
        const client = await addUser(owner, UserRole.CLIENT);
        const foreign = await createTenant('Synthetic foreign A17');
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
            providerReadCount: providerReads.length,
            forbidden,
            qualification:
              'LOCAL_SYNTHETIC_NATIVE_ADAPTER_ONLY; real canonical A17 writes in disposable PG; actual response-discard relay; no worker-crash or live-provider acceptance',
            boundaries: {
              model: 'forbidden spy',
              providerWrites: 'finite GET-only transport',
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
