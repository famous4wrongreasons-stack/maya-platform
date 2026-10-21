// D4 ordinary AppModule/HTTP/PG proof. Synthetic identities only. Observing
// Prisma/resolve hooks call the real methods; no HTTP authority is replaced.
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as bcrypt from 'bcrypt';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { UserRole } from '../../src/common/domain.enums';
import { ClientChannelRuntimeService } from '../../src/crm/client-channel-runtime.service';
import type { ClientConsentReadService } from '../../src/crm/client-consent-read.service';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { ClientLinkChallengeService } from '../../src/crm/client-link-challenge.service';
import { Package5Wave3CanonicalCutoverService } from '../../src/package5-wave3/package5-wave3-canonical-cutover.service';
import { ConsentSecurityInvalidationService } from '../../src/package5-wave3/consent-security-invalidation.service';
import { ConsentSecurityApprovalService } from '../../src/package5-wave3/consent-security-approval.service';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../../src/action-engine';
import {
  CONSENT_SECURITY_INCIDENT,
  consentSecurityHash,
  type SecurityManifest,
} from '../../src/action-engine/consent-security-invalidation.contract';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';

const out = process.env.JEST_CONSENT_OWN_OUTPUT!;
const h = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sourceTables = [
  'Client',
  'ClientChannelLink',
  'ClientLinkChallenge',
  'CrmClientLink',
  'ClientConsentFact',
  'ClientConsentInvalidation',
  'CustomerProfile',
  'ActionExecution',
  'ActionExecutionIdempotencyBinding',
  'ActionAttempt',
  'ActionTargetMutation',
  'ClientBookingConfirmation',
  'Appointment',
] as const;
type Subject = {
  tenant: TenantFixture;
  user: UserFixture;
  clientId: string;
  linkId: string;
  token: string;
};
describe('D4 own consent actual PostgreSQL HTTP', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let resolveCount = 0,
    deniedNetwork = 0;
  const observations: Record<string, unknown>[] = [];
  const nativeFetch = globalThis.fetch;
  const save = () =>
    writeFileSync(
      path.join(out, 'observations.json'),
      JSON.stringify(
        {
          contract: 'maya.consent-own-http-pg-proof/1',
          observations,
          sourceTables,
          actualReadOnlyResolverCalls: resolveCount,
          unexpectedFetchCalls: deniedNetwork,
          productionEffects: 0,
          certificate: 'NOT_ISSUED',
        },
        null,
        2,
      ) + '\n',
    );
  beforeAll(async () => {
    expect(path.isAbsolute(out)).toBe(true);
    globalThis.fetch = () => {
      deniedNetwork++;
      return Promise.reject(Error('No provider/model/OTP in consent proof'));
    };
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const channels = http.app.get(ClientChannelRuntimeService);
    const resolve = channels.resolve.bind(channels);
    jest.spyOn(channels, 'resolve').mockImplementation(async (proof, tx) => {
      const [setting] = await tx.$queryRawUnsafe<{ mode: string }[]>(
        "SELECT current_setting('transaction_read_only') AS mode",
      );
      expect(setting.mode).toBe('on');
      resolveCount++;
      return resolve(proof, tx);
    });
    const migrations = await db.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    expect(Number(migrations[0].count)).toBe(106);
    observations.push({
      case: 'fresh-pg16-all-migrations',
      applied: Number(migrations[0].count),
    });
    save();
  });
  afterAll(async () => {
    save();
    globalThis.fetch = nativeFetch;
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
    // Keep immutable source evidence. Outer runner stops the owned cluster.
  });

  async function snapshot() {
    const rows: Record<string, string> = {};
    for (const table of sourceTables) {
      const data = await db.prisma.$queryRawUnsafe<unknown[]>(
        'SELECT row_to_json(s) AS row FROM "' +
          table +
          '" s ORDER BY row_to_json(s)::text',
      );
      rows[table] = h(data);
    }
    return rows;
  }
  async function read(
    label: string,
    token: string | null,
    expected: number,
    suffix = '',
    body?: object,
  ) {
    const before = await snapshot(),
      mark = http.recorder.mark();
    let req =
      body === undefined
        ? request(http.app.getHttpServer()).get(
            '/api/privacy/consents' + suffix,
          )
        : request(http.app.getHttpServer())
            .post('/api/privacy/consents' + suffix)
            .send(body);
    if (token) req = req.set('Authorization', 'Bearer ' + token);
    const response = await req;
    const ops = http.recorder.since(mark);
    expect(response.status).toBe(expected);
    const after = await snapshot();
    expect(after).toEqual(before);
    const sourceWrites = ops.filter(
      (op) =>
        op.write &&
        op.model !== null &&
        (sourceTables as readonly string[]).includes(op.model),
    );
    expect(sourceWrites).toEqual([]);
    // Existing recorder conservatively classifies SET as write. Identify only
    // this exact read-only setting locally; never weaken its global classifier.
    const rawWrites = ops.filter(
      (op) =>
        op.model === null &&
        op.write &&
        op.sql?.trim().toUpperCase() !== 'SET TRANSACTION READ ONLY',
    );
    expect(rawWrites).toEqual([]);
    if (expected === 200 || expected === 201) {
      expect(response.headers['cache-control']).toBe('no-store');
      expect(
        ops.some(
          (op) => op.sql?.trim().toUpperCase() === 'SET TRANSACTION READ ONLY',
        ),
      ).toBe(true);
      expect(
        ops.some((op) => op.lock && op.sql?.includes('a18.client-channel.v1')),
      ).toBe(true);
      expect(ops.filter((op) => op.lock).length).toBeGreaterThanOrEqual(2);
    }
    if (body !== undefined && expected === 201) {
      expect(ops.filter((op) => op.model === 'ClientConsentFact')).toEqual([]);
      expect(response.body).not.toHaveProperty('records');
    }
    observations.push({
      case: label,
      status: response.status,
      sourceTablesUnchanged: true,
      sourceSnapshotHashes: { before: h(before), after: h(after) },
      sourceWrites: sourceWrites.length,
      rawDurableWrites: rawWrites.length,
      readOnlyStatements: ops.filter(
        (op) => op.sql?.trim().toUpperCase() === 'SET TRANSACTION READ ONLY',
      ).length,
      advisoryLocks: ops.filter((op) => op.lock).length,
      factReadCount: ops.filter((op) => op.model === 'ClientConsentFact')
        .length,
    });
    save();
    return response.body as unknown;
  }
  async function subject(tenant?: TenantFixture): Promise<Subject> {
    const t = tenant ?? (await fx.tenant('D4 own consent'));
    const user = await fx.user(t, UserRole.TENANT_OWNER);
    const client = await fx.client(t, user);
    const token = await http.login(t.slug, user.email, user.password);
    return { tenant: t, user, ...client, token };
  }
  async function decisions(s: Subject, privacy: boolean, marketing: boolean) {
    // Canonical source writer, outside the observed read-only request windows.
    const ctx = http.app.get(TenantContextService);
    await ctx.runAsSystemTenant(s.tenant.id, () =>
      http.app
        .get(ClientChannelRuntimeService)
        .submitConsent(
          JSON.stringify({ type: 'maya_jwt', credential: s.token }),
          { privacy, marketing, idempotencyKey: 'd4-setup-' + randomUUID() },
        ),
    );
  }
  function states(value: unknown) {
    const body = value as Awaited<
      ReturnType<ClientConsentReadService['readOwn']>
    >;
    expect(body.contract).toBe('maya.privacy.own-consents/1');
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.parse(body.asOf));
    expect(
      Date.parse(body.expiresAt) - Date.parse(body.asOf),
    ).toBeLessThanOrEqual(300000);
    expect(Object.keys(body).sort()).toEqual([
      'asOf',
      'consents',
      'contract',
      'expiresAt',
      'registerExport',
    ]);
    expect(body.registerExport).toEqual({
      available: false,
      reason: 'STEP_UP_UNAVAILABLE',
    });
    expect(body.consents).toHaveLength(2);
    return {
      privacy: body.consents.find((c) => c.kind === 'privacy')!,
      marketing: body.consents.find((c) => c.kind === 'marketing')!,
    };
  }

  it('real JWT, canonical own source, revoke/invalidation, current-authority refusals and no export', async () => {
    const own = await subject();
    const empty = states(await read('never-asked', own.token, 200));
    expect(empty.privacy.state).toBe('NEVER_ASKED');
    expect(empty.marketing.state).toBe('NEVER_ASKED');
    await decisions(own, true, true);
    const granted = states(await read('current-grants', own.token, 200));
    expect(granted.privacy.state).toBe('GRANTED');
    expect(granted.marketing.state).toBe('GRANTED');
    await decisions(own, false, false);
    const revoked = states(await read('current-revokes', own.token, 200));
    expect(revoked.privacy.state).toBe('NOT_GRANTED');
    expect(revoked.marketing.state).toBe('NOT_GRANTED');

    const foreign = await subject();
    const foreignOwn = states(
      await read('foreign-tenant-own-only', foreign.token, 200),
    );
    expect(foreignOwn.privacy.state).toBe('NEVER_ASKED');
    await read(
      'foreign-client-query-refused',
      foreign.token,
      400,
      '?clientId=' + own.clientId,
    );
    await read(
      'foreign-tenant-query-refused',
      own.token,
      400,
      '?tenantId=' + foreign.tenant.id,
    );
    const unlinked = await fx.user(own.tenant, UserRole.TENANT_OWNER);
    const unlinkedToken = await http.login(
      own.tenant.slug,
      unlinked.email,
      unlinked.password,
    );
    await read('same-tenant-unlinked-user-refused', unlinkedToken, 403);
    await read('unauthenticated-refused', null, 401);
    const expired = await subject();
    const expiredPayload = db.jwt.decode<{ session_id: string }>(expired.token);
    await db.prisma.authSession.update({
      where: { id: expiredPayload.session_id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await read('expired-real-session-refused', expired.token, 401);
    const revokedSession = await subject();
    const revokedPayload = db.jwt.decode<{ session_id: string }>(
      revokedSession.token,
    );
    await db.prisma.authSession.update({
      where: { id: revokedPayload.session_id },
      data: {
        revokedAt: new Date(),
        revokeReason: 'synthetic D4 source authority test',
      },
    });
    await read('revoked-real-session-refused', revokedSession.token, 401);
    const revokedLink = await subject();
    const link = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: revokedLink.linkId },
    });
    const linkOwner = new ClientChannelLinkService(
      db.prisma,
      db.tenantContext,
      {
        verifyLink: () =>
          Promise.reject(Error('No links issued by revocation fixture')),
        verifyRevocation: () =>
          Promise.resolve({
            tenantId: link.tenantId,
            provider: 'maya_user',
            providerSubjectHash: link.providerSubjectHash,
            linkId: link.id,
            revocationIdentityHash: h(randomUUID()),
            actorProofHash: h('synthetic-revocation'),
            reason: 'synthetic isolated D4 revocation',
            validUntil: new Date(Date.now() + 600000),
          }),
      },
    );
    await db.tenantContext.runAsSystemTenant(link.tenantId, () =>
      linkOwner.revoke({ proof: 'synthetic-revocation' }),
    );
    await read('revoked-verified-link-refused', revokedLink.token, 403);

    // Existing historical-contamination fixture, never installed in AppModule.
    const ctx = http.app.get(TenantContextService);
    const scope = <T>(work: () => T) =>
      ctx.runAsSystemTenant(own.tenant.id, work);
    const badSubject = h(randomUUID());
    const closedLinks = new ClientChannelLinkService(db.prisma, ctx, {
      verifyLink: () => Promise.reject(Error('Only challenge fixture')),
      verifyRevocation: () =>
        Promise.reject(Error('Only canonical remediation')),
    });
    const challengeOwner = new ClientLinkChallengeService(
      db.prisma,
      ctx,
      db.encryption,
      closedLinks,
      {
        resolverId: 'a18.maya-user-client-association.v1',
        resolve: () =>
          Promise.resolve({
            tenantId: own.tenant.id,
            clientId: own.clientId,
            resolver: 'a18.maya-user-client-association.v1',
            resolutionEvidenceRef: 'synthetic-d4-historical-issuer',
            resolutionEvidenceHash: h('historical'),
            issuerAuthorityHash: h('synthetic-issuer'),
            validUntil: new Date(Date.now() + 600000),
          }),
      },
      {
        authenticate: () =>
          Promise.resolve({
            tenantId: own.tenant.id,
            provider: 'telegram',
            providerSubjectHash: badSubject,
            deliveryAddress: '1000000001',
            channelControlProofHash: h('synthetic-channel'),
            validUntil: new Date(Date.now() + 600000),
          }),
      },
    );
    const challenge = await scope(() =>
      challengeOwner.issue({ resolutionProof: 'synthetic-historical' }),
    );
    const bad = (
      await scope(() =>
        challengeOwner.consume({
          channelProof: 'synthetic-channel',
          token: challenge.token,
        }),
      )
    ).link;
    const consentOwner = http.app.get(Package5Wave3CanonicalCutoverService);
    for (const kind of ['privacy', 'marketing'] as const) {
      await scope(() =>
        consentOwner.recordChannelConsent(
          own.tenant.id,
          {
            userId: null,
            provider: 'telegram',
            providerSubjectHash: bad.providerSubjectHash,
          },
          kind,
          true,
          new Date(),
          'd4-historical-' + kind + '-' + randomUUID(),
        ),
      );
    }
    const beforeInvalidation = states(
      await read(
        'historical-current-grants-before-invalidation',
        own.token,
        200,
      ),
    );
    expect(beforeInvalidation.privacy.state).toBe('GRANTED');
    const facts = await db.prisma.clientConsentFact.findMany({
      where: {
        tenantId: own.tenant.id,
        clientId: own.clientId,
        decision: 'grant',
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    expect(facts).toHaveLength(2);
    const opPassword = 'synthetic-D4-' + randomUUID();
    const operator = await db.prisma.user.create({
      data: {
        tenantId: null,
        email: randomUUID() + '@d4.invalid',
        role: 'platform_owner',
        passwordHash: await bcrypt.hash(opPassword, 10),
        status: 'active',
      },
    });
    const opLogin = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: operator.email, password: opPassword });
    expect(opLogin.status).toBe(201);
    const opToken = (opLogin.body as { access_token: string }).access_token;
    expect(typeof opToken).toBe('string');
    const actor = await http.app
      .get(JwtStrategy)
      .validate(db.jwt.decode(opToken));
    const command = {
      incidentId: CONSENT_SECURITY_INCIDENT,
      tenantId: own.tenant.id,
      clientId: own.clientId,
      linkId: bad.id,
      factIds: facts.map((f) => f.id).sort(),
    };
    const fixtureApproval = {
      verify: (manifest: SecurityManifest) => {
        expect(manifest.command).toEqual(command);
        return consentSecurityHash({ syntheticExternalApproval: command });
      },
    } satisfies ConsentSecurityApprovalService;
    const securityOwner = new ConsentSecurityInvalidationService(
      db.prisma,
      ctx,
      http.app.get(CanonicalActionIngressService),
      http.app.get(ActionEngineKernel),
      fixtureApproval,
    );
    await securityOwner.remediate(actor, command);
    expect(
      await db.prisma.clientConsentInvalidation.count({
        where: { clientId: own.clientId },
      }),
    ).toBe(2);
    const invalidated = states(
      await read('invalidated-heads-no-resurrection', own.token, 200),
    );
    expect(invalidated.privacy).toMatchObject({
      state: 'NOT_GRANTED',
      invalidated: true,
    });
    expect(invalidated.marketing).toMatchObject({
      state: 'NOT_GRANTED',
      invalidated: true,
    });

    const range = {
      from: '2020-01-01T00:00:00.000Z',
      to: '2099-01-01T00:00:00.000Z',
    };
    const qualification = await read(
      'export-step-up-closed',
      own.token,
      201,
      '/export/qualification',
      range,
    );
    expect(qualification).toEqual({
      capability: 'consent.register.export',
      available: false,
      reason: 'STEP_UP_UNAVAILABLE',
      requiredVerification: 'STEP_UP_VERIFIED',
      range,
    });
    expect(
      await read(
        'qualification-replay-no-export',
        own.token,
        201,
        '/export/qualification',
        range,
      ),
    ).toEqual(qualification);
    await read(
      'export-subject-injection-refused',
      own.token,
      400,
      '/export/qualification',
      { ...range, clientId: foreign.clientId },
    );
    await read(
      'export-fake-step-up-refused',
      own.token,
      400,
      '/export/qualification',
      { ...range, verification: 'STEP_UP_VERIFIED' },
    );
    await read(
      'export-revoked-link-refused',
      revokedLink.token,
      403,
      '/export/qualification',
      range,
    );
    expect(deniedNetwork).toBe(0);
    expect(resolveCount).toBeGreaterThan(5);
    save();
  }, 120000);
});
