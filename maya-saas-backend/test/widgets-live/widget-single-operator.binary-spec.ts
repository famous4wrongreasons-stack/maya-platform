import request from 'supertest';
import type { ReleaseReceipt } from '../../src/entitlements/widget-release.contract';
const resultBody = (r: { body: unknown }) =>
  r.body as {
    access_token: string;
    replayed: boolean;
    enabled: boolean;
    receipt: ReleaseReceipt;
  };
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import {
  assertNoEnvFiles,
  widgetsLiveChildEnvironment,
} from './support/environment';
import type { WidgetReleasePolicy } from '../../src/entitlements/widget-release-policy.service';
import { randomUUID } from 'node:crypto';
import { releaseHash } from '../../src/entitlements/widget-release.contract';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { singleOperatorProof } from './support/widget-single-operator-proof';
import type { SingleOperatorReleaseAuthorization } from '../../src/entitlements/widget-release-production.contract';

// Full production guards, writer, reader and real PostgreSQL; ephemeral synthetic signing keys.
describe('AR-1 single-operator production execution (ephemeral keys, guarded proof DB) [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const users: string[] = [],
    tenants: string[] = [];
  beforeAll(async () => {
    assertProofDatabase();
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterAll(async () => {
    if (db) {
      await db.prisma.auditLog.deleteMany({
        where: { action: 'widget.release', entityId: { in: tenants } },
      });
    }
    await fx?.teardown();
    if (db)
      await db.prisma.user.deleteMany({
        where: { id: { in: users }, tenantId: null },
      });
    await http?.close();
    await db?.close();
  });
  async function fixture() {
    const tenant = await fx.tenant('AR1 synthetic', CalendarSource.INTERNAL);
    tenants.push(tenant.id);
    const operator = await fx.user(tenant, UserRole.PLATFORM_OWNER);
    users.push(operator.id);
    await db.prisma.user.update({
      where: { id: operator.id },
      data: { tenantId: null },
    });
    const login = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: operator.email, password: operator.password });
    expect(login.status).toBe(201);
    const token = resultBody(login).access_token;
    // Registration is not an entitlement grant; the writer is the only grant in this fixture.
    await db.prisma.feature.upsert({
      where: { key: 'widgets.runtime' },
      update: {},
      create: {
        key: 'widgets.runtime',
        name: 'Widget runtime',
        description: 'synthetic',
        module: 'platform',
        status: 'active',
      },
    });
    const p = singleOperatorProof(
      process.env.DATABASE_URL!,
      tenant.id,
      operator.id,
    );
    const cfg = http.app.get(ConfigService);
    for (const key of [
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_CANDIDATE_SHA',
      'WIDGET_RELEASE_TRUST_JSON',
      'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
      'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
    ])
      cfg.set(key, p.config.get(key));
    const route = '/api/platform/widget-release/' + tenant.id;
    const post = (action: string, body: unknown, override = token) =>
      request(http.app.getHttpServer())
        .post(route + '/' + action)
        .set('Authorization', 'Bearer ' + override)
        .send(body as object);
    const status = () =>
      request(http.app.getHttpServer())
        .get(route + '/status')
        .set('Authorization', 'Bearer ' + token);
    const command = p.command();
    const revoke = (
      version: string,
      over: Partial<SingleOperatorReleaseAuthorization> = {},
    ) => ({
      authorization: p.signOwner({
        ...command.authorization.payload,
        authorizationId: randomUUID(),
        operation: 'revoke',
        expectedVersion: version,
        grantExpiresAt: null,
        ...over,
      }),
    });
    return { tenant, operator, p, token, post, status, command, revoke };
  }
  const audits = (tenantId: string) =>
    db.prisma.auditLog.findMany({
      where: { action: 'widget.release', entityId: tenantId },
    });
  it('SO-BIN [BIN] two production binaries observe the same grant, revoke and expiry without stale process state', async () => {
    assertNoEnvFiles();
    const f = await fixture();
    // The separately built artifact computes its own bytes, not the ts-jest application digest.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compiled = require(
      resolve(
        process.cwd(),
        'dist/src/entitlements/widget-release-policy.service.js',
      ),
    ) as { WidgetReleasePolicy: new (c: ConfigService) => WidgetReleasePolicy };
    const buildDigest = new compiled.WidgetReleasePolicy(
      f.p.config,
    ).buildDigest();
    const command = f.p.command();
    command.certificate = {
      ...command.certificate,
      buildDigest,
    };
    command.authorization = f.p.signOwner({
      ...command.authorization.payload,
      buildDigest,
      certificateDigest: releaseHash(command.certificate),
    });
    async function binary() {
      const socket = createServer();
      socket.listen(0, '127.0.0.1');
      await once(socket, 'listening');
      const address = socket.address();
      if (!address || typeof address === 'string')
        throw new Error('loopback port');
      const port = address.port;
      await new Promise<void>((r) => socket.close(() => r()));
      const settings: Record<string, string> = {
        HOST: '127.0.0.1',
        PORT: String(port),
        NODE_ENV: 'production',
        CLIENT_IDENTITY_HASH_SECRET:
          'ephemeral-client-identity-domain-for-ar1-binary-proof',
        CORS_ALLOWED_ORIGINS: 'capacitor://localhost',
        AUTH_TRUST_PROXY: '127.0.0.1',
        PHONE_LOGIN_ENABLED: 'false',
        EMAIL_LOGIN_ENABLED: 'false',
        SWAGGER_ENABLED: 'false',
        AI_CORE_PROVIDER: 'safe',
      };
      for (const key of [
        'WIDGET_RELEASE_ENVIRONMENT',
        'WIDGET_RELEASE_CANDIDATE_SHA',
        'WIDGET_RELEASE_TRUST_JSON',
        'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
        'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
      ])
        settings[key] = f.p.config.getOrThrow<string>(key);
      const { env } = widgetsLiveChildEnvironment(process.env, settings);
      const child = spawn(process.execPath, ['dist/src/main'], {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let diagnostic = '';
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (chunk: Buffer) => {
          diagnostic = (diagnostic + chunk.toString()).slice(-12000);
        });
      const stop = async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const done = once(child, 'exit');
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        try {
          await done;
        } finally {
          clearTimeout(timer);
        }
      };
      try {
        const until = Date.now() + 20000;
        let ready = false;
        while (Date.now() < until) {
          if (child.exitCode !== null)
            throw new Error('binary exited: ' + diagnostic);
          try {
            ready = (await fetch('http://127.0.0.1:' + port + '/api/health'))
              .ok;
          } catch {
            /* Loopback process is still starting. */
          }
          if (ready) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!ready) throw new Error('binary health deadline: ' + diagnostic);
        const call = async (action: string, body?: unknown) => {
          const response = await fetch(
            'http://127.0.0.1:' +
              port +
              '/api/platform/widget-release/' +
              f.tenant.id +
              '/' +
              action,
            {
              method: body ? 'POST' : 'GET',
              headers: {
                authorization: 'Bearer ' + f.token,
                'content-type': 'application/json',
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            },
          );
          return {
            status: response.status,
            body: (await response.json()) as unknown,
          };
        };
        return { call, stop };
      } catch (error) {
        await stop();
        throw error;
      }
    }
    const one = await binary();
    let two: Awaited<ReturnType<typeof binary>> | undefined;
    try {
      two = await binary();
      expect(
        (await one.call('grant', { certificate: command.certificate })).status,
      ).toBe(403);
      const grant = await one.call('grant', command);
      expect(grant).toMatchObject({ status: 201 });
      expect(resultBody(grant).receipt.execution?.environment).toBe(
        'production',
      );
      expect(resultBody(await two.call('status')).enabled).toBe(true);
      const revoke = {
        authorization: f.p.signOwner({
          ...command.authorization.payload,
          authorizationId: randomUUID(),
          operation: 'revoke',
          expectedVersion: resultBody(grant).receipt.version,
          grantExpiresAt: null,
        }),
      };
      const revoked = await two.call('revoke', revoke);
      expect(revoked.status).toBe(201);
      expect(resultBody(await one.call('status')).enabled).toBe(false);
      expect((await one.call('grant', command)).status).toBe(201);
      expect(resultBody(await two.call('status')).enabled).toBe(false);
      const expiryCommand = structuredClone(command);
      const expiry = new Date(Date.now() + 1200).toISOString();
      expiryCommand.authorization = f.p.signOwner({
        ...command.authorization.payload,
        authorizationId: randomUUID(),
        expectedVersion: resultBody(revoked).receipt.version,
        grantExpiresAt: expiry,
      });
      expect((await one.call('grant', expiryCommand)).status).toBe(201);
      expect(resultBody(await two.call('status')).enabled).toBe(true);
      await new Promise((r) => setTimeout(r, 1400));
      expect(resultBody(await one.call('status')).enabled).toBe(false);
      expect(resultBody(await two.call('status')).enabled).toBe(false);
      expect(await audits(f.tenant.id)).toHaveLength(3);
    } finally {
      await two?.stop();
      await one.stop();
    }
  });
});
