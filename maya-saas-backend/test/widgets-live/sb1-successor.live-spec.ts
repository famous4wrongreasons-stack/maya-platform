import request from 'supertest';
import { bootHttp } from './support/http-bootstrap';
import { CrmService } from '../../src/crm/crm.service';
// All identities are synthetic, all SMS.ru network calls are intercepted. No widget gate claim.
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { UserRole } from '../../src/common/domain.enums';
import { PhoneAuthDeliveryService } from '../../src/auth/phone-auth-delivery.service';
import { AuthRateLimitRepository } from '../../src/auth/auth-rate-limit.repository';
import {
  ClientChannelLinkService,
  type VerifiedClientChannelProof,
} from '../../src/crm/client-channel-link.service';
import { ClientLinkChallengeService } from '../../src/crm/client-link-challenge.service';
import { ClientReverificationCandidateService } from '../../src/crm/client-reverification-candidate.service';
import { PersonalClientContextService } from '../../src/appointments/personal-client-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { Fixtures } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
describe('SB-1 JSON V2 successor [PostgreSQL] [mock SMS.ru]', () => {
  let db: FixtureContext;
  let fx: Fixtures;
  const originalFetch = global.fetch;
  let sms: jest.Mock;
  beforeAll(async () => {
    assertProofDatabase();
    db = await bootFixtureContext();
    fx = new Fixtures(db, null);
  });
  beforeEach(() => {
    sms = jest.fn((url: string, init: { body: URLSearchParams }) => {
      if (url !== 'https://sms.ru/sms/send')
        throw new Error('Unexpected network call refused');
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              status: 'OK',
              status_code: 100,
              sms: {
                [init.body.get('to')!]: {
                  status: 'OK',
                  status_code: 100,
                  sms_id: 'synthetic',
                },
              },
            }),
          ),
      });
    });
    global.fetch = sms;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await fx?.teardown();
    await db?.close();
  });

  async function fixture(active = false) {
    const tenant = await fx.tenant('SB1 V2');
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    const actor = await fx.actor(tenant, user);
    const { clientId, linkId } = await fx.client(tenant, user);
    const crmLink = await db.prisma.crmClientLink.create({
      data: {
        tenantId: tenant.id,
        clientId,
        provider: 'yclients',
        externalId: randomUUID(),
      },
    });
    let proof: VerifiedClientChannelProof;
    let revokedId = linkId;
    const prior = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: linkId },
    });
    const links = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () => Promise.resolve(proof),
      verifyRevocation: () =>
        Promise.resolve({
          tenantId: tenant.id,
          provider: 'maya_user',
          providerSubjectHash: prior.providerSubjectHash,
          linkId: revokedId,
          revocationIdentityHash: hash(`revoke-${revokedId}`),
          actorProofHash: hash('synthetic'),
          reason: 'synthetic-test',
          validUntil: new Date(Date.now() + 600_000),
        }),
    });
    const run = <T>(fn: () => T) =>
      db.tenantContext.runAsAuthPrincipal(actor, fn);
    const revoke = (id: string) => {
      revokedId = id;
      return run(() => links.revoke({ proof: 'synthetic-revocation-proof' }));
    };
    if (!active) await revoke(linkId);
    const registry = {
      provider: 'yclients',
      complete: true as const,
      generated_at: new Date().toISOString(),
      clients: [
        {
          external_id: crmLink.externalId,
          phone: '+79990000001',
          name: null,
          visits_count: 0,
          sold_amount: 0,
          last_visit_date: null,
        },
      ],
    };
    const crm = { getClientRegistry: jest.fn(() => Promise.resolve(registry)) };
    const candidates = new ClientReverificationCandidateService(
      db.prisma,
      db.tenantContext,
      db.encryption,
      crm as never,
    );
    const delivery = new PhoneAuthDeliveryService(
      new ConfigService({
        NODE_ENV: 'test',
        PHONE_AUTH_PROVIDER: 'smsru',
        SMSRU_API_ID: 'synthetic-not-a-provider-key',
      }),
    );
    const svc = new ClientLinkChallengeService(
      db.prisma,
      db.tenantContext,
      db.encryption,
      links,
      {
        resolverId: 'synthetic.v1',
        resolve: () =>
          Promise.resolve({
            tenantId: tenant.id,
            clientId,
            resolver: 'synthetic.v1',
            resolutionEvidenceRef: 'fixture:only',
            resolutionEvidenceHash: hash('resolution'),
            issuerAuthorityHash: hash('issuer'),
            validUntil: new Date(Date.now() + 600_000),
          }),
      },
      {
        authenticate: () =>
          Promise.resolve({
            tenantId: tenant.id,
            provider: 'maya_user',
            providerSubjectHash: hash(`other-${user.id}`),
            deliveryAddress: user.id,
            channelControlProofHash: hash('channel'),
            validUntil: new Date(Date.now() + 600_000),
          }),
      },
      { candidates, delivery, limits: new AuthRateLimitRepository(db.prisma) },
    );
    const issue = async () => {
      const r = await run(() => svc.issueSuccessor(actor));
      const call = sms.mock.calls.at(-1)! as [
        string,
        { body: URLSearchParams },
      ];
      const code = call[1].body.get('msg')!.match(/\b[0-9]{6}\b/)![0];
      expect(Object.keys(r).sort()).toEqual(['challengeId', 'expiresAt']);
      return { ...r, code };
    };
    const consume = (r: { challengeId: string; code: string }) =>
      run(() =>
        svc.consumeSuccessor(actor, {
          challengeId: r.challengeId,
          code: r.code,
        }),
      );
    const row = (id: string) =>
      db.prisma.clientLinkChallenge.findUniqueOrThrow({ where: { id } });
    const episodes = () =>
      db.prisma.clientChannelLink.findMany({
        where: {
          tenantId: tenant.id,
          providerSubjectHash: prior.providerSubjectHash,
        },
        orderBy: { createdAt: 'asc' },
      });
    const advance = async (id = linkId, keepActive = false) => {
      proof = {
        tenantId: tenant.id,
        clientId,
        provider: 'maya_user',
        providerSubjectHash: prior.providerSubjectHash,
        method: 'explicit_verified_challenge',
        verificationIdentityHash: hash(randomUUID()),
        verifier: 'synthetic.concurrent-authority.v1',
        channelControlProofHash: hash('channel'),
        clientAuthorityProofHash: hash('client'),
        validUntil: new Date(Date.now() + 600_000),
        supersedesLinkId: id,
      };
      const next = await run(() =>
        links.link({ proof: 'synthetic-independent-verification' }),
      );
      if (!keepActive) await revoke(next.link.id);
      return next.link;
    };
    return {
      tenant,
      user,
      actor,
      clientId,
      linkId,
      run,
      svc,
      issue,
      consume,
      row,
      episodes,
      advance,
      revoke,
      candidates,
      registry,
      crm,
    };
  }

  it('SV2-01 happy successor verification creates usable explicit personal context and actual actor audit', async () => {
    const h = await fixture();
    const issued = await h.issue();
    const r = await h.consume(issued);
    const row = await h.row(issued.challengeId);
    expect(row.policyVersion).toBe(2);
    expect(row.consumedLinkId).toBe(r.linkId);
    expect(row.issuanceEvidenceJson).toMatchObject({
      contract: 'a18.client-link-challenge.issue.v2',
      mayaUserId: h.user.id,
      mayaSubjectHash: (await h.episodes())[0].providerSubjectHash,
      predecessorLinkId: h.linkId,
      verificationChannel: { kind: 'sms' },
    });
    const contexts = new PersonalClientContextService(
      db.prisma,
      db.tenantContext,
      db.encryption,
    );
    const selected = await h.run(() =>
      contexts.select(h.actor, 'personal_client'),
    );
    expect(selected.clientId).toBe(h.clientId);
    expect(selected.linkId).toBe(r.linkId);
    expect(selected.membershipRole).toBe('tenant_owner');
    const audit = await db.prisma.auditLog.findFirstOrThrow({
      where: {
        entityId: issued.challengeId,
        action: 'client_reverification.verified',
      },
    });
    expect(audit.userId).toBe(h.user.id);
    expect(audit.metadataJson).toMatchObject({
      actorSessionId: h.actor.sessionId,
      actorRole: 'tenant_owner',
      authority_context: 'personal_client',
    });
    expect(JSON.stringify(row)).not.toContain('+79990000001');
    expect(row.issuanceEvidenceJson).not.toHaveProperty('code');
  });
  it('SV2-02 wrong OTP has no link or consumption effect', async () => {
    const h = await fixture();
    const r = await h.issue();
    await expect(
      h.consume({ ...r, code: r.code === '000000' ? '111111' : '000000' }),
    ).rejects.toThrow();
    expect((await h.row(r.challengeId)).consumedAt).toBeNull();
    expect(await h.episodes()).toHaveLength(1);
  });
  it('SV2-03 replay fails closed', async () => {
    const h = await fixture();
    const r = await h.issue();
    await h.consume(r);
    await expect(h.consume(r)).rejects.toThrow();
    expect(await h.episodes()).toHaveLength(2);
  });
  it('SV2-04 expired OTP fails under database time', async () => {
    const h = await fixture();
    // Backdated synthetic issuance; immutable history is never edited to simulate expiry.
    const clock = jest
      .spyOn(h.svc as unknown as { clock: () => Promise<Date> }, 'clock')
      .mockResolvedValue(new Date(Date.now() - 601_000));
    const r = await h.issue();
    clock.mockRestore();
    await expect(h.consume(r)).rejects.toThrow(/expired/);
    expect(await h.episodes()).toHaveLength(1);
  });
  it('SV2-05 Client substitution cannot transfer a challenge', async () => {
    const h = await fixture();
    const other = await fixture();
    const r = await h.issue();
    await expect(other.consume(r)).rejects.toThrow();
    await expect(
      h.run(() =>
        h.svc.consumeSuccessor(h.actor, {
          challengeId: r.challengeId,
          code: r.code,
          clientId: other.clientId,
        }),
      ),
    ).rejects.toThrow();
    expect(await h.episodes()).toHaveLength(1);
    expect(await other.episodes()).toHaveLength(1);
  });
  it('SV2-06 tenant substitution fails closed', async () => {
    const h = await fixture();
    const r = await h.issue();
    const other = await fixture();
    await expect(
      h.run(() =>
        h.svc.consumeSuccessor(
          { ...h.actor, tenantId: other.tenant.id },
          { challengeId: r.challengeId, code: r.code },
        ),
      ),
    ).rejects.toThrow();
    expect((await h.row(r.challengeId)).consumedAt).toBeNull();
  });
  it('SV2-07 predecessor changed after resolver read is rejected inside identity lock', async () => {
    const h = await fixture();
    const r = await h.issue();
    const resolve = h.candidates.resolve.bind(h.candidates);
    jest.spyOn(h.candidates, 'resolve').mockImplementation(async (actor) => {
      const c = await resolve(actor);
      await h.advance();
      return c;
    });
    await expect(h.consume(r)).rejects.toThrow(/lineage_changed/);
    expect((await h.row(r.challengeId)).consumedAt).toBeNull();
  });
  it('SV2-08 active predecessor never authorizes issuance or consumption', async () => {
    const h = await fixture(true);
    await expect(h.issue()).rejects.toThrow(/revoked/);
    expect(sms).not.toHaveBeenCalled();
    const other = await fixture();
    const r = await other.issue();
    await other.advance(other.linkId, true);
    await expect(other.consume(r)).rejects.toThrow(/revoked/);
    expect((await other.row(r.challengeId)).consumedAt).toBeNull();
  });
  it('SV2-09 non-latest revoked predecessor cannot be consumed', async () => {
    const h = await fixture();
    const r = await h.issue();
    await h.advance();
    await expect(h.consume(r)).rejects.toThrow(/binding_changed/);
    expect((await h.row(r.challengeId)).consumedAt).toBeNull();
  });
  it('SV2-10 revoked episode remains byte-for-byte immutable', async () => {
    const h = await fixture();
    const before = (await h.episodes())[0];
    const r = await h.issue();
    await h.consume(r);
    expect((await h.episodes())[0]).toEqual(before);
    await expect(
      db.prisma.clientChannelLink.update({
        where: { id: h.linkId },
        data: { revokedAt: null },
      }),
    ).rejects.toThrow();
    expect((await h.episodes())[0]).toEqual(before);
  });
  it('SV2-11 successful consume creates exactly one successor and one outcome', async () => {
    const h = await fixture();
    const r = await h.issue();
    const success = await h.consume(r);
    const successors = (await h.episodes()).filter(
      (l) => l.supersedesLinkId === h.linkId,
    );
    expect(successors).toHaveLength(1);
    expect(successors[0].id).toBe(success.linkId);
    expect(
      await db.prisma.clientLinkChallenge.count({
        where: { consumedLinkId: success.linkId },
      }),
    ).toBe(1);
    expect(
      await db.prisma.auditLog.count({
        where: {
          entityId: r.challengeId,
          action: 'client_reverification.verified',
        },
      }),
    ).toBe(1);
  });
  it('SV2-12 concurrent consume serializes to one success and one refusal', async () => {
    const h = await fixture();
    const r = await h.issue();
    const results = await Promise.allSettled([h.consume(r), h.consume(r)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      (await h.episodes()).filter((l) => l.supersedesLinkId === h.linkId),
    ).toHaveLength(1);
    expect((await h.row(r.challengeId)).consumedAt).not.toBeNull();
  });
  it('SV2-JSON all four V2 fields are mandatory, exact and immutable', async () => {
    const h = await fixture();
    const r = await h.issue();
    const original = await h.row(r.challengeId);
    for (const key of [
      'mayaUserId',
      'mayaSubjectHash',
      'verificationChannel',
      'predecessorLinkId',
    ]) {
      const missing = {
        ...(original.issuanceEvidenceJson as Prisma.JsonObject),
      };
      delete missing[key];
      await expect(
        db.prisma.clientLinkChallenge.create({
          data: {
            ...original,
            id: randomUUID(),
            tokenHash: hash(randomUUID()),
            issuanceEvidenceJson: missing,
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.prisma.clientLinkChallenge.update({
          where: { id: original.id },
          data: { issuanceEvidenceJson: missing },
        }),
      ).rejects.toThrow();
    }
    expect(await h.row(original.id)).toEqual(original);
  });
  it('SV2-CHANNEL canonical channel changed after issuance invalidates exact Client proof', async () => {
    const h = await fixture();
    const r = await h.issue();
    h.registry.clients[0].phone = '+79990000002';
    await expect(h.consume(r)).rejects.toThrow(/binding_changed/);
    expect(await h.episodes()).toHaveLength(1);
  });
  it('SV2-SESSION current revocation is checked on consume', async () => {
    const h = await fixture();
    const r = await h.issue();
    await db.prisma.authSession.update({
      where: { id: h.actor.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(h.consume(r)).rejects.toThrow(/session_inactive/);
    expect(await h.episodes()).toHaveLength(1);
  });
  it('SV2-LIMIT failed OTP attempts survive rollback and cannot be reset with correct code', async () => {
    const h = await fixture();
    const r = await h.issue();
    const wrong = r.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(h.consume({ ...r, code: wrong })).rejects.toThrow();
    await expect(h.consume(r)).rejects.toThrow(/Too many/);
    expect(await h.episodes()).toHaveLength(1);
  });
  it('SV2-DELIVERY failed SMS grants nothing and discloses no OTP', async () => {
    const h = await fixture();
    sms.mockRejectedValue(new Error('synthetic transport offline'));
    await expect(h.issue()).rejects.toThrow(
      'Could not reach SMS transport provider.',
    );
    expect(await h.episodes()).toHaveLength(1);
    expect(
      await db.prisma.clientLinkChallenge.count({
        where: { tenantId: h.tenant.id, consumedAt: { not: null } },
      }),
    ).toBe(0);
  });
  it('SV2-V1 historical V1 remains immutable and initial-only; V1 consumption still works for a fresh subject', async () => {
    const h = await fixture();
    const issued = await h.run(() =>
      h.svc.issue({ resolutionProof: 'synthetic-v1-authority-proof' }),
    );
    const before = await h.row(issued.challengeId);
    expect(before.policyVersion).toBe(1);
    await expect(
      h.consume({ challengeId: issued.challengeId, code: '123456' }),
    ).rejects.toThrow();
    const result = await h.run(() =>
      h.svc.consume({
        channelProof: 'synthetic-v1-channel-proof',
        token: issued.token,
      }),
    );
    const after = await h.row(issued.challengeId);
    expect(after.issuanceEvidenceJson).toEqual(before.issuanceEvidenceJson);
    expect(after.issuanceEvidenceHash).toBe(before.issuanceEvidenceHash);
    expect(result.link.supersedesLinkId).toBeNull();
    expect(after.consumedLinkId).toBe(result.link.id);
    await expect(
      h.run(() =>
        h.svc.consume({
          channelProof: 'synthetic-v1-channel-proof',
          token: issued.token,
        }),
      ),
    ).rejects.toThrow();
  });
  it('SV2-HTTP registered authenticated route refuses caller authority and consumes real V2 coordinator', async () => {
    const h = await fixture();
    jest
      .spyOn(CrmService.prototype, 'getClientRegistry')
      .mockImplementation((tenantId) => {
        if (tenantId !== h.tenant.id)
          throw new Error('Unexpected tenant refused');
        return Promise.resolve(h.registry);
      });
    // HTTP boundary test uses a recording delivery double. The PostgreSQL proofs above exercise
    // the real strict SMS.ru adapter with fetch intercepted before any provider request.
    jest
      .spyOn(
        PhoneAuthDeliveryService.prototype,
        'assertClientVerificationAvailable',
      )
      .mockImplementation(() => {});
    let code = '';
    jest
      .spyOn(
        PhoneAuthDeliveryService.prototype,
        'deliverClientVerificationCode',
      )
      .mockImplementation((params) => {
        expect(params.phone).toBe('+79990000001');
        code = params.code;
        return Promise.resolve({ delivery: 'sms' });
      });
    const http = await bootHttp();
    try {
      const token = await http.login(
        h.tenant.slug,
        h.user.email,
        h.user.password,
      );
      const post = (
        path: string,
        body: unknown,
        selection: string | null = 'personal_client',
        auth = token,
      ) => {
        const r = request(http.app.getHttpServer()).post(
          '/api/personal-client/reverification/' + path,
        );
        if (auth) r.set('authorization', 'Bearer ' + auth);
        if (selection) r.set('x-maya-authority-context', selection);
        return r.send(body as object);
      };
      expect((await post('challenge', {}, 'personal_client', '')).status).toBe(
        401,
      );
      expect((await post('challenge', {}, null)).status).toBe(403);
      expect((await post('challenge', { clientId: h.clientId })).status).toBe(
        400,
      );
      const issued = await post('challenge', {});
      expect(issued.status).toBe(201);
      expect(Object.keys(issued.body as object).sort()).toEqual([
        'challengeId',
        'expiresAt',
      ]);
      for (const key of [
        'clientId',
        'predecessorLinkId',
        'verificationChannel',
        'mayaSubjectHash',
      ])
        expect(
          (
            await post('consume', {
              challengeId: (issued.body as { challengeId: string }).challengeId,
              code,
              [key]: 'forged',
            })
          ).status,
        ).toBe(400);
      const consumed = await post('consume', {
        challengeId: (issued.body as { challengeId: string }).challengeId,
        code,
      });
      expect(consumed.status).toBe(201);
      expect((consumed.body as { verified: boolean }).verified).toBe(true);
      const replay = await post('consume', {
        challengeId: (issued.body as { challengeId: string }).challengeId,
        code,
      });
      expect([403, 409]).toContain(replay.status);
      expect(await h.episodes()).toHaveLength(2);
    } finally {
      await http.close();
    }
  });
});
