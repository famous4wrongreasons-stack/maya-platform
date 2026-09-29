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
import { randomUUID } from 'node:crypto';
import { AuditLogService } from '../../src/audit-log/audit-log.service';
import { EntitlementsService } from '../../src/entitlements/entitlements.service';
import {
  releaseHash,
  type ReleaseAuthorization,
} from '../../src/entitlements/widget-release.contract';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
import { releaseProof } from './support/widget-release-proof';

// Full production guards, writer, reader and real PostgreSQL; ephemeral synthetic signing keys.
describe('AR-1 synthetic certified writer [HTTP] [PostgreSQL]', () => {
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
    const p = releaseProof(process.env.DATABASE_URL!, operator.id);
    const cfg = http.app.get(ConfigService);
    for (const key of [
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_CANDIDATE_SHA',
      'WIDGET_RELEASE_TRUST_JSON',
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
    const command = p.command(tenant.id);
    const revoke = (
      version: string,
      over: Partial<ReleaseAuthorization> = {},
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
  const row = (tenantId: string) =>
    db.prisma.tenantEntitlement.findUnique({
      where: {
        tenantId_featureKey: { tenantId, featureKey: 'widgets.runtime' },
      },
    });
  const audits = (tenantId: string) =>
    db.prisma.auditLog.findMany({
      where: { action: 'widget.release', entityId: tenantId },
    });
  it('AR1-LIFECYCLE validate is read-only; signed grant has atomic audit; same authorization retry never grants twice; revoke refuses an old widget token', async () => {
    const f = await fixture();
    expect((await f.post('validate', f.command)).status).toBe(201);
    expect(await row(f.tenant.id)).toBeNull();
    expect(await audits(f.tenant.id)).toHaveLength(0);
    const g = await f.post('grant', f.command);
    expect(g.status).toBe(201);
    expect(resultBody(g).replayed).toBe(false);
    expect(await audits(f.tenant.id)).toHaveLength(1);
    expect(resultBody(await f.status()).enabled).toBe(true);
    const replay = await f.post('grant', f.command);
    expect(replay.status).toBe(201);
    expect(resultBody(replay).replayed).toBe(true);
    expect(resultBody(replay).receipt).toEqual(resultBody(g).receipt);
    expect(await audits(f.tenant.id)).toHaveLength(1);
    const client = await fx.user(f.tenant, UserRole.CLIENT);
    await fx.bookingSource(f.tenant, client);
    for (const key of [
      'ai.consultant',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(f.tenant, key);
    const login = await http.login(
      f.tenant.slug,
      client.email,
      client.password,
    );
    const catalog = await http.executeTool(
      login,
      'catalog.services.read',
      { arguments: {}, surface: 'web' },
      'ar1-' + randomUUID(),
    );
    expect([200, 201]).toContain(catalog.status);
    const envelope = (
      catalog.body as {
        resolution: {
          receipt: {
            envelope: {
              widget_id: string;
              intents: Array<{ intent_token: string }>;
              body: { options: Array<{ option_id: string }> };
            };
          };
        };
      }
    ).resolution.receipt.envelope;
    const body = {
      contract: 'maya.widget.intent.submission/1',
      widget_id: envelope.widget_id,
      intent_token: envelope.intents[0].intent_token,
      inputs: { service_ref: envelope.body.options[0].option_id },
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    };
    const revoke = f.revoke(resultBody(g).receipt.version);
    expect((await f.post('revoke', revoke)).status).toBe(201);
    expect(resultBody(await f.status()).enabled).toBe(false);
    expect((await row(f.tenant.id))?.enabled).toBe(false);
    expect(await audits(f.tenant.id)).toHaveLength(2);
    const denied = await http.postIntent(login, body);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: 'feature_locked' } });
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
    await f.post('grant', f.command);
    expect(resultBody(await f.status()).enabled).toBe(false);
    expect(await audits(f.tenant.id)).toHaveLength(2);
  });
  it('AR1-CONCURRENT two consumes of one authorization produce one grant and one audit', async () => {
    const f = await fixture();
    const result = await Promise.all([
      f.post('grant', f.command),
      f.post('grant', f.command),
    ]);
    expect(result.map((r) => r.status)).toEqual([201, 201]);
    expect(result.map((r) => resultBody(r).replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('AR1-STALE two independently signed grants with the same prestate cannot both win CAS', async () => {
    const f = await fixture(),
      second = f.p.command(f.tenant.id);
    const results = await Promise.all([
      f.post('grant', f.command),
      f.post('grant', second),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('AR1-AUDIT failure rolls back the entitlement mutation', async () => {
    const f = await fixture();
    const audit = http.app.get(AuditLogService);
    const original = audit.logPlatformAction.bind(audit);
    const spy = jest
      .spyOn(audit, 'logPlatformAction')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('synthetic audit failure after insert');
      });
    try {
      expect((await f.post('grant', f.command)).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(await row(f.tenant.id)).toBeNull();
    expect(await audits(f.tenant.id)).toHaveLength(0);
  });
  it('AR1-EXPIRY expires without renewal and denies the old authorization', async () => {
    const f = await fixture();
    const expires = new Date(Date.now() + 1600).toISOString();
    f.command.authorization = f.p.signOwner({
      ...f.command.authorization.payload,
      grantExpiresAt: expires,
      expiresAt: expires,
    });
    expect((await f.post('grant', f.command)).status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(resultBody(await f.status()).enabled).toBe(false);
    expect((await f.post('grant', f.command)).status).toBe(403);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('AR1-ADVERSARIAL forged, expired, tenant-substituted and rebound authorizations have no grant effect', async () => {
    const f = await fixture();
    const forged = structuredClone(f.command);
    forged.authorization.payload.expectedVersion = releaseHash('forged');
    expect((await f.post('grant', forged)).status).toBe(403);
    const wrong = f.p.command('other');
    expect((await f.post('grant', wrong)).status).toBe(403);
    const expired = f.p.command(f.tenant.id, 'absent', {
      notBefore: new Date(Date.now() - 10000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect((await f.post('grant', expired)).status).toBe(403);
    expect(await row(f.tenant.id)).toBeNull();
    expect((await f.post('grant', f.command)).status).toBe(201);
    const rebound = structuredClone(f.command);
    rebound.authorization = f.p.signOwner({
      ...rebound.authorization.payload,
      expectedVersion: releaseHash('other'),
    });
    expect((await f.post('grant', rebound)).status).toBe(409);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('AR1-SUSPENDED rollback remains available after a tenant is suspended', async () => {
    const f = await fixture(),
      g = await f.post('grant', f.command);
    expect(g.status).toBe(201);
    await db.prisma.tenant.update({
      where: { id: f.tenant.id },
      data: { status: 'suspended' },
    });
    expect(
      (await f.post('revoke', f.revoke(resultBody(g).receipt.version))).status,
    ).toBe(201);
    expect(resultBody(await f.status()).enabled).toBe(false);
    const next = f.p.command(f.tenant.id, 'absent');
    expect((await f.post('grant', next)).status).toBe(403);
  });
  it('AR1-ROLE tenant owner and revoked platform session never gain release authority', async () => {
    const f = await fixture();
    const owner = await fx.user(f.tenant, UserRole.TENANT_OWNER);
    const token = await http.login(f.tenant.slug, owner.email, owner.password);
    expect((await f.post('grant', f.command, token)).status).toBe(403);
    await db.prisma.authSession.updateMany({
      where: { userId: f.operator.id },
      data: { revokedAt: new Date() },
    });
    expect((await f.post('grant', f.command)).status).toBe(401);
    expect(await row(f.tenant.id)).toBeNull();
  });
  it('AR1-REVOKE-WAIT active admitted work and revoke serialize on the tenant release lock', async () => {
    const f = await fixture();
    const g = await f.post('grant', f.command);
    expect(g.status).toBe(201);
    const ent = http.app.get(EntitlementsService);
    let release!: () => void, entered!: () => void;
    const enteredPromise = new Promise<void>((r) => (entered = r)),
      barrier = new Promise<void>((r) => (release = r));
    const admission = db.prisma.$transaction(async (tx) => {
      await ent.assertWidgetRuntimeAdmission(f.tenant.id, tx);
      entered();
      await barrier;
    });
    await enteredPromise;
    let done = false;
    const revoke = f
      .post('revoke', f.revoke(resultBody(g).receipt.version))
      .then((r) => {
        done = true;
        return r;
      });
    await new Promise((r) => setTimeout(r, 150));
    expect(done).toBe(false);
    release();
    await admission;
    expect((await revoke).status).toBe(201);
    await expect(
      db.prisma.$transaction((tx) =>
        ent.assertWidgetRuntimeAdmission(f.tenant.id, tx),
      ),
    ).rejects.toThrow('entitlement denied');
  });
});
