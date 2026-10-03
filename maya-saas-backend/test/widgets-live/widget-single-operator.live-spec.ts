import request from 'supertest';
import {
  releaseHash,
  type ReleaseReceipt,
} from '../../src/entitlements/widget-release.contract';
const resultBody = (r: { body: unknown }) =>
  r.body as {
    access_token: string;
    replayed: boolean;
    enabled: boolean;
    receipt: ReleaseReceipt;
  };
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { WidgetReleaseService } from '../../src/entitlements/widget-release.service';
import { AuditLogService } from '../../src/audit-log/audit-log.service';
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
import { productionProof } from './support/widget-production-proof';
import type { SingleOperatorReleaseAuthorization } from '../../src/entitlements/widget-release-production.contract';
import { WidgetReleaseAccessService } from '../../src/entitlements/widget-release-access.service';
import { PROFILE_REGISTRY_DIGEST } from '../../src/entitlements/widget-release-profile.contract';

// Full production guards, writer, reader and real PostgreSQL; ephemeral synthetic signing keys.
describe('AR-1 single-operator production execution contract with ephemeral test keys [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const users: string[] = [],
    tenants: string[] = [];
  afterEach(() => {
    if (http) http.app.get(ConfigService).set('NODE_ENV', 'test');
  });
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
      'NODE_ENV',
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
  it('SO-LIFECYCLE validate is read-only; signed grant has atomic audit; same authorization retry never grants twice; revoke refuses an old widget token', async () => {
    const f = await fixture();
    expect((await f.post('validate', f.command)).status).toBe(201);
    expect(await row(f.tenant.id)).toBeNull();
    expect(await audits(f.tenant.id)).toHaveLength(0);
    const g = await f.post('grant', f.command);
    expect(g.status).toBe(201);
    expect(resultBody(g).replayed).toBe(false);
    expect(resultBody(g).receipt.execution).toEqual({
      releaseId: 'synthetic-release',
      environment: 'production',
      profileId: 'closed-input.no-handoff@1',
      profileDigest: f.command.authorization.payload.profileDigest,
      evidenceDigest: f.command.certificate.evidenceDigest,
    });
    const disclosure = {
      governance: 'single-operator',
      independentHumanReview: false,
      reviewerId: null,
      approverId: f.operator.id,
      actorId: f.operator.id,
    };
    expect(resultBody(g).receipt).toMatchObject(disclosure);
    expect((await audits(f.tenant.id))[0].metadataJson).toMatchObject({
      receipt: disclosure,
    });
    expect(await audits(f.tenant.id)).toHaveLength(1);
    expect((await f.status()).body).toMatchObject({
      enabled: true,
      governance: 'single-operator',
      independentHumanReview: false,
    });
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
  it('SO-CONCURRENT two consumes of one authorization produce one grant and one audit', async () => {
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
  it('SO-STALE two independently signed grants with the same prestate cannot both win CAS', async () => {
    const f = await fixture(),
      second = f.p.command();
    const results = await Promise.all([
      f.post('grant', f.command),
      f.post('grant', second),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('SO-AUDIT failure rolls back the entitlement mutation', async () => {
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

  it('SO-AUDIT-NOOP silently missing audit cannot commit an entitlement', async () => {
    const f = await fixture();
    const spy = jest
      .spyOn(http.app.get(AuditLogService), 'logPlatformAction')
      .mockResolvedValueOnce(undefined as never);
    try {
      expect((await f.post('grant', f.command)).status).toBe(403);
    } finally {
      spy.mockRestore();
    }
    expect(await row(f.tenant.id)).toBeNull();
    expect(await audits(f.tenant.id)).toHaveLength(0);
  });
  it('SO-REVOKE-BOUND revoke binds exact release, evidence, profile and build; rollback works after allowlist removal and candidate change', async () => {
    const f = await fixture(),
      g = await f.post('grant', f.command);
    expect(g.status).toBe(201);
    const version = resultBody(g).receipt.version;
    for (const over of [
      { releaseId: 'other' },
      { evidenceDigest: 'b'.repeat(64) },
      { buildDigest: 'b'.repeat(64) },
    ]) {
      expect((await f.post('revoke', f.revoke(version, over))).status).toBe(
        403,
      );
    }
    const cfg = http.app.get(ConfigService);
    cfg.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
    cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', 'b'.repeat(40));
    expect(resultBody(await f.status()).enabled).toBe(false);
    expect((await f.post('revoke', f.revoke(version))).status).toBe(201);
    expect((await row(f.tenant.id))?.enabled).toBe(false);
    expect(await audits(f.tenant.id)).toHaveLength(2);
  });
  it('SO-HANDOFF production profile refuses HANDOFF at mint and admission owners', async () => {
    const f = await fixture();
    expect((await f.post('grant', f.command)).status).toBe(201);
    const access = http.app.get(WidgetReleaseAccessService);
    await db.prisma.$transaction(async (tx) => {
      expect((await access.current(f.tenant.id, tx))?.scope).toBe(
        'closed-input.no-handoff@1',
      );
      expect(
        await access.admits(
          f.tenant.id,
          { tenantId: f.tenant.id, effect: 'HANDOFF' } as never,
          PROFILE_REGISTRY_DIGEST,
          tx,
        ),
      ).toBe(false);
    });
    await expect(
      db.prisma.$transaction((tx) =>
        access.bindMint(
          f.tenant.id,
          [
            {
              template: 'handoff.settings@1',
              record: { tenantId: f.tenant.id, effect: 'HANDOFF' } as never,
            },
          ],
          PROFILE_REGISTRY_DIGEST,
          tx,
        ),
      ),
    ).rejects.toThrow('profile_unavailable');
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });
  it('SO-REPLAY-BOUND rebinding an already consumed authorization cannot renew or overwrite', async () => {
    const f = await fixture();
    expect((await f.post('grant', f.command)).status).toBe(201);
    const rebound = structuredClone(f.command);
    rebound.authorization = f.p.signOwner({
      ...rebound.authorization.payload,
      releaseId: 'new-release',
    });
    expect((await f.post('grant', rebound)).status).toBe(409);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('SO-ROLE tenant owner and revoked platform session never gain release authority', async () => {
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
  it('SO-TWO-TENANTS one global session manages two ordinary tenants; grants and revoke never cross scopes', async () => {
    const f = await fixture(),
      second = await fx.tenant(
        'AR1 another ordinary tenant',
        CalendarSource.INTERNAL,
      );
    tenants.push(second.id);
    http.app
      .get(ConfigService)
      .set(
        'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
        JSON.stringify([f.tenant.id, second.id]),
      );
    const secondCommand = f.p.command('absent', second.id);
    const secondPost = (body: unknown) =>
      request(http.app.getHttpServer())
        .post('/api/platform/widget-release/' + second.id + '/grant')
        .set('Authorization', 'Bearer ' + f.token)
        .send(body as object);
    expect((await secondPost(f.command)).status).toBe(403);
    const firstGrant = await f.post('grant', f.command);
    expect(firstGrant.status).toBe(201);
    expect((await secondPost(secondCommand)).status).toBe(201);
    expect(await audits(f.tenant.id)).toHaveLength(1);
    expect(await audits(second.id)).toHaveLength(1);
    expect(
      (await f.post('revoke', f.revoke(resultBody(firstGrant).receipt.version)))
        .status,
    ).toBe(201);
    expect((await row(f.tenant.id))?.enabled).toBe(false);
    expect((await row(second.id))?.enabled).toBe(true);
  });
  it('SO-TENANT-SESSION a tenant session cannot substitute for a global session, even with forged platform actor claims', async () => {
    const f = await fixture(),
      owner = await fx.user(f.tenant, UserRole.TENANT_OWNER);
    const token = await http.login(f.tenant.slug, owner.email, owner.password);
    const session = await db.prisma.authSession.findFirstOrThrow({
      where: { userId: owner.id, tenantId: f.tenant.id, revokedAt: null },
    });
    expect((await f.post('grant', f.command, token)).status).toBe(403);
    await expect(
      http.app.get(WidgetReleaseService).grant(
        {
          userId: f.operator.id,
          sessionId: session.id,
          tenantId: null,
          role: UserRole.PLATFORM_OWNER,
          email: f.operator.email,
          branchId: null,
          membershipId: null,
          membershipStatus: null,
        },
        f.tenant.id,
        f.command,
      ),
    ).rejects.toThrow('platform_actor');
    // The schema additionally refuses manufacturing a tenant-scoped session for the global User.
    await expect(
      db.prisma.authSession.updateMany({
        where: { userId: f.operator.id },
        data: { tenantId: f.tenant.id },
      }),
    ).rejects.toThrow();
    expect(await row(f.tenant.id)).toBeNull();
    expect(await audits(f.tenant.id)).toHaveLength(0);
  });
  it.each(['V1-revokes-V2', 'V2-revokes-V1'] as const)(
    'SO-REVOKE-VERSION %s is refused even with a valid signer and matching stored release digests',
    async (which) => {
      const f = await fixture(),
        v1 = productionProof(
          process.env.DATABASE_URL!,
          f.tenant.id,
          f.operator.id,
        ),
        v2 = f.p;
      const first = which === 'V1-revokes-V2' ? v2 : v1,
        second = which === 'V1-revokes-V2' ? v1 : v2;
      const trust = (p: typeof first) =>
        http.app
          .get(ConfigService)
          .set(
            'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
            p.config.get('WIDGET_RELEASE_PRODUCTION_TRUST_JSON'),
          );
      trust(first);
      const command = first.command(),
        grant = await f.post('grant', command);
      expect(grant.status).toBe(201);
      const payload = {
        ...second.command().authorization.payload,
        operation: 'revoke' as const,
        authorizationId: randomUUID(),
        expectedVersion: resultBody(grant).receipt.version,
        grantExpiresAt: null,
        certificateDigest: command.authorization.payload.certificateDigest,
        evidenceDigest: command.authorization.payload.evidenceDigest,
      };
      trust(second);
      const denied = await f.post('revoke', {
        authorization: second.signOwner(payload as never),
      });
      expect(denied.status).toBe(403);
      expect((await row(f.tenant.id))?.enabled).toBe(true);
      expect(await audits(f.tenant.id)).toHaveLength(1);
      trust(first);
      expect(
        (
          await f.post('revoke', {
            authorization: first.signOwner({
              ...command.authorization.payload,
              authorizationId: randomUUID(),
              operation: 'revoke',
              expectedVersion: resultBody(grant).receipt.version,
              grantExpiresAt: null,
            } as never),
          })
        ).status,
      ).toBe(201);
    },
  );
  it('SO-REVOKE-EXPIRED-CERT a fresh signed revoke remains available after certificate expiry', async () => {
    const f = await fixture(),
      c = f.command;
    c.certificate.expiresAt = new Date(Date.now() + 1200).toISOString();
    c.authorization = f.p.signOwner({
      ...c.authorization.payload,
      certificateDigest: releaseHash(c.certificate),
      grantExpiresAt: c.certificate.expiresAt,
    });
    const g = await f.post('grant', c);
    expect(g.status).toBe(201);
    await new Promise((r) => setTimeout(r, 1400));
    expect(resultBody(await f.status()).enabled).toBe(false);
    const revoke = {
      authorization: f.p.signOwner({
        ...c.authorization.payload,
        authorizationId: randomUUID(),
        operation: 'revoke',
        grantExpiresAt: null,
        expectedVersion: resultBody(g).receipt.version,
      }),
    };
    expect((await f.post('revoke', revoke)).status).toBe(201);
    expect((await row(f.tenant.id))?.enabled).toBe(false);
    expect(await audits(f.tenant.id)).toHaveLength(2);
  });
});
