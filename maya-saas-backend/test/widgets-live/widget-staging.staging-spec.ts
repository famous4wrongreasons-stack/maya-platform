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
    version: string;
    receipt: ReleaseReceipt;
  };
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { WidgetReleaseService } from '../../src/entitlements/widget-release.service';
import { AuditLogService } from '../../src/audit-log/audit-log.service';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import type { FixtureContext } from './support/bootstrap';
import {
  bootStagingHttp,
  grantStagingAncillaryFeature,
} from './support/widget-staging-http';
type HttpHarness = Awaited<ReturnType<typeof bootStagingHttp>>['http'];
import type { Fixtures } from './support/fixtures';
import { assertStagingProofDatabase } from './support/widget-staging-environment';
import { stagingOperatorProof } from './support/widget-staging-operator-proof';
import { releaseProof } from './support/widget-release-proof';
import { EntitlementsService } from '../../src/entitlements/entitlements.service';
import {
  STAGING_SINGLE_OPERATOR_TRUST,
  STAGING_SINGLE_OPERATOR_TENANTS,
  type StagingSingleOperatorAuthorization,
} from '../../src/entitlements/widget-release-staging.contract';
import { WidgetReleaseAccessService } from '../../src/entitlements/widget-release-access.service';
import { PROFILE_REGISTRY_DIGEST } from '../../src/entitlements/widget-release-profile.contract';

// Full production guards, writer, reader and real PostgreSQL; ephemeral synthetic signing keys.
describe('AR-1 single-operator local staging execution contract with ephemeral test keys [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const users: string[] = [],
    tenants: string[] = [];
  afterEach(() => {
    if (http) http.app.get(ConfigService).set('NODE_ENV', 'test');
  });
  beforeAll(async () => {
    assertStagingProofDatabase(process.env.DATABASE_URL);
    ({ db, http, fx } = await bootStagingHttp());
  });
  afterAll(async () => {
    await http?.close();
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
    const p = stagingOperatorProof(
      process.env.DATABASE_URL!,
      tenant.id,
      operator.id,
    );
    const cfg = http.app.get(ConfigService);
    for (const key of [
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_CANDIDATE_SHA',
      'WIDGET_RELEASE_TRUST_JSON',
      STAGING_SINGLE_OPERATOR_TRUST,
      STAGING_SINGLE_OPERATOR_TENANTS,
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
      over: Partial<StagingSingleOperatorAuthorization> = {},
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
  it('LSO-LIFECYCLE validate is read-only; signed grant has atomic audit; same authorization retry never grants twice; revoke refuses an old widget token', async () => {
    const f = await fixture();
    expect((await f.post('validate', f.command)).status).toBe(201);
    expect(await row(f.tenant.id)).toBeNull();
    expect(await audits(f.tenant.id)).toHaveLength(0);
    const g = await f.post('grant', f.command);
    expect(g.status).toBe(201);
    expect(resultBody(g).replayed).toBe(false);
    expect(resultBody(g).receipt.execution).toEqual({
      releaseId: 'synthetic-release',
      environment: 'staging',
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
      await grantStagingAncillaryFeature(db, f.tenant, key);
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
    const version = resultBody(await f.status()).version;
    expect((await f.post('grant', f.p.command(version))).status).toBe(201);
    expect(resultBody(await f.status()).enabled).toBe(true);
    const old = await http.postIntent(login, body);
    expect(old.status).toBe(200);
    expect(old.body).toMatchObject({
      outcome: 'refuse',
      code: 'insufficient_authority',
      stopped_at_gate: '6',
    });
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });
  it('LSO-CONCURRENT two consumes of one authorization produce one grant and one audit', async () => {
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
  it('LSO-STALE two independently signed grants with the same prestate cannot both win CAS', async () => {
    const f = await fixture(),
      second = f.p.command();
    const results = await Promise.all([
      f.post('grant', f.command),
      f.post('grant', second),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await audits(f.tenant.id)).toHaveLength(1);
  });
  it('LSO-AUDIT failure rolls back the entitlement mutation', async () => {
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

  it('LSO-AUDIT-NOOP silently missing audit cannot commit an entitlement', async () => {
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
  it('LSO-REVOKE-BOUND revoke binds exact release, evidence, profile and build; rollback works after allowlist removal and candidate change', async () => {
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
    cfg.set(STAGING_SINGLE_OPERATOR_TENANTS, '[]');
    cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', 'b'.repeat(40));
    expect(resultBody(await f.status()).enabled).toBe(false);
    expect((await f.post('revoke', f.revoke(version))).status).toBe(201);
    expect((await row(f.tenant.id))?.enabled).toBe(false);
    expect(await audits(f.tenant.id)).toHaveLength(2);
  });
  it('LSO-HANDOFF local staging profile refuses HANDOFF at mint and admission owners', async () => {
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
          'SETTINGS_DRAFT',
        ),
      ),
    ).rejects.toThrow('profile_unavailable');
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
  });
  it('LSO-REPLAY-BOUND rebinding an already consumed authorization cannot renew or overwrite', async () => {
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
  it('LSO-ROLE tenant owner and revoked platform session never gain release authority', async () => {
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
  it('LSO-TWO-TENANTS one global session manages two ordinary tenants; grants and revoke never cross scopes', async () => {
    const f = await fixture(),
      second = await fx.tenant(
        'AR1 another ordinary tenant',
        CalendarSource.INTERNAL,
      );
    tenants.push(second.id);
    http.app
      .get(ConfigService)
      .set(
        STAGING_SINGLE_OPERATOR_TENANTS,
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
  it('LSO-TENANT-SESSION a tenant session cannot substitute for a global session, even with forged platform actor claims', async () => {
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
  it.each(['legacy-revokes-staging', 'staging-revokes-legacy'] as const)(
    'LSO-REVOKE-VERSION %s refuses even with valid signatures and matching candidate/certificate',
    async (which) => {
      const f = await fixture(),
        old = releaseProof(process.env.DATABASE_URL!, f.operator.id);
      const cfg = http.app.get(ConfigService);
      cfg.set(
        'WIDGET_RELEASE_TRUST_JSON',
        old.config.get('WIDGET_RELEASE_TRUST_JSON'),
      );
      const legacy = old.command(f.tenant.id);
      legacy.certificate = old.signCertificate({
        ...legacy.certificate.payload,
        environment: 'staging',
      });
      legacy.authorization = old.signOwner({
        ...legacy.authorization.payload,
        environment: 'staging',
        certificateDigest: releaseHash(legacy.certificate),
      });
      const first = which === 'legacy-revokes-staging' ? f.command : legacy;
      const grant = await f.post('grant', first);
      expect(grant.status).toBe(201);
      const other =
        which === 'legacy-revokes-staging'
          ? legacy.authorization.payload
          : f.command.authorization.payload;
      const payload = {
        ...other,
        authorizationId: randomUUID(),
        operation: 'revoke' as const,
        expectedVersion: resultBody(grant).receipt.version,
        grantExpiresAt: null,
        certificateDigest: first.authorization.payload.certificateDigest,
      };
      const authorization =
        which === 'legacy-revokes-staging'
          ? old.signOwner(payload as never)
          : f.p.signOwner(payload as never);
      expect((await f.post('revoke', { authorization })).status).toBe(403);
      expect((await row(f.tenant.id))?.enabled).toBe(true);
      expect(await audits(f.tenant.id)).toHaveLength(1);
    },
  );
  it('LSO-REVOKE-EXPIRED-CERT a fresh signed revoke remains available after certificate expiry', async () => {
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
  it('LSO-PLAN-TRIAL plan and full trial never grant widgets without AR1', async () => {
    const f = await fixture();
    const plan = await db.prisma.subscriptionPlan.create({
      data: {
        name: 'staging-' + randomUUID(),
        priceMonthly: 0,
        maxBranches: 1,
        maxStaff: 1,
        featuresJson: { 'widgets.runtime': true },
      },
    });
    await db.prisma.planEntitlement.create({
      data: { planId: plan.id, featureKey: 'widgets.runtime', enabled: true },
    });
    await db.prisma.tenant.update({
      where: { id: f.tenant.id },
      data: {
        planId: plan.id,
        status: 'trial',
        trialFullAccess: true,
        trialEndsAt: new Date(Date.now() + 600000),
      },
    });
    const effective = await http.app
      .get(EntitlementsService)
      .getEffectiveEntitlements(f.tenant.id);
    expect(effective.features['widgets.runtime']).not.toBe(true);
    expect(await row(f.tenant.id)).toBeNull();
  });
  it('LSO-NO-FIXTURE staging-named test DB does not unlock proof fixture grants', async () => {
    const f = await fixture();
    await expect(fx.grantFeature(f.tenant, 'widgets.runtime')).rejects.toThrow(
      'proof-database guard',
    );
    expect(await row(f.tenant.id)).toBeNull();
  });
});
