import { createHmac } from 'node:crypto';
import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientLinkChallengeService } from './client-link-challenge.service';
import {
  successorEvidence,
  successorEvidenceHash,
  type SuccessorCandidate,
} from './client-link-successor-evidence';
import { ClientReverificationController } from './client-reverification.controller';

function fixture() {
  const now = new Date();
  const actor = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    membershipId: 'member-a',
    role: UserRole.TENANT_OWNER,
    email: 'fixture@example.test',
    branchId: null,
    membershipStatus: 'active',
  };
  const candidate: SuccessorCandidate = Object.freeze({
    lineageHash: 'a'.repeat(64),
    tenantId: actor.tenantId,
    userId: actor.userId,
    providerSubjectHash: 'b'.repeat(64),
    clientId: 'client-a',
    predecessorLinkId: 'prior-a',
    verificationChannel: Object.freeze({
      kind: 'sms',
      crmLinkId: 'crm-a',
      addressHash: 'c'.repeat(64),
    }),
    deliveryPhone: '+79990000001',
  });
  const context = new TenantContextService();
  const encryption = {
    opaqueReference: (ns: string, value: string) =>
      createHmac('sha256', 'synthetic-only-key')
        .update(ns + value)
        .digest('hex'),
    encrypt: jest.fn(() => 'ciphertext'),
  };
  const evidence = successorEvidence(candidate, now, encryption as never);
  const evidenceHash = successorEvidenceHash(evidence);
  const id = '12345678-1234-1234-1234-123456789012';
  const code = '345678';
  const row = {
    id,
    tenantId: actor.tenantId,
    clientId: candidate.clientId,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 600_000),
    consumedAt: null as Date | null,
    policyVersion: 2,
    tokenHashVersion: 2,
    issuanceEvidenceJson: evidence,
    issuanceEvidenceHash: evidenceHash,
    tokenHash: encryption.opaqueReference(
      'a18.client-link-challenge.otp.v2',
      JSON.stringify([id, evidenceHash, code]),
    ),
  };
  const tx = {
    $queryRaw: jest.fn((sql: { sql: string }) =>
      Promise.resolve(sql.sql.includes('FOR UPDATE') ? [{ id }] : [{ now }]),
    ),
    clientLinkChallenge: {
      findUniqueOrThrow: jest.fn(() => Promise.resolve(row)),
      create: jest.fn(({ data }: { data: typeof row }) =>
        Promise.resolve({ ...data }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    auditLog: {
      create: jest.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (value: typeof tx) => Promise<unknown>) =>
      Promise.resolve(fn(tx)),
    ),
  };
  const links = {
    bindSuccessorChallengeInTransaction: jest.fn(() =>
      Promise.resolve({
        link: { id: 'successor' },
        resumed: false,
      }),
    ),
  };
  const candidates = {
    resolve: jest.fn(() => Promise.resolve(candidate)),
    assertCurrentInTransaction: jest.fn(() =>
      Promise.resolve(new Date(now.getTime() + 300_000)),
    ),
  };
  const limits = {
    consume: jest.fn(() =>
      Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
    ),
  };
  const delivery = {
    assertClientVerificationAvailable: jest.fn(),
    deliverClientVerificationCode: jest.fn(() =>
      Promise.resolve({ delivery: 'sms' }),
    ),
  };
  const svc = new ClientLinkChallengeService(
    prisma as never,
    context,
    encryption as never,
    links as never,
    { resolverId: 'disabled', resolve: jest.fn() },
    { authenticate: jest.fn() },
    { candidates, delivery, limits } as never,
  );
  const run = <T>(f: () => T) => context.runAsAuthPrincipal(actor, f);
  const consume = (input: unknown = { challengeId: id, code }) =>
    run(() => svc.consumeSuccessor(actor, input));
  return {
    now,
    actor,
    candidate,
    row,
    tx,
    prisma,
    links,
    candidates,
    limits,
    delivery,
    svc,
    run,
    consume,
    id,
    code,
  };
}
describe('SB-1 V2 coordinator guard proofs', () => {
  it('SV2-U-HAPPY verifies exact binding, locks, writes successor, correlates outcome and actual actor', async () => {
    const h = fixture();
    await expect(h.consume()).resolves.toEqual({
      challengeId: h.id,
      linkId: 'successor',
      verified: true,
    });
    expect(h.candidates.assertCurrentInTransaction).toHaveBeenCalledWith(
      h.tx,
      h.actor,
      h.candidate,
    );
    expect(
      h.tx.$queryRaw.mock.calls.some(([sql]) => sql.sql.includes('FOR UPDATE')),
    ).toBe(true);
    expect(h.links.bindSuccessorChallengeInTransaction).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        clientId: h.candidate.clientId,
        tenantId: h.actor.tenantId,
        providerSubjectHash: h.candidate.providerSubjectHash,
        supersedesLinkId: h.candidate.predecessorLinkId,
        verifier: 'a18.client-link-challenge.sms.v2',
        clientAuthorityProofHash: h.row.issuanceEvidenceHash,
      }) as unknown,
    );
    expect(h.tx.clientLinkChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consumedLinkId: 'successor',
          consumedProvider: 'maya_user',
          consumedSubjectHash: h.candidate.providerSubjectHash,
        }) as unknown,
      }) as unknown,
    );
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: h.actor.userId,
        metadataJson: expect.objectContaining({
          authority_context: 'personal_client',
          actorRole: 'tenant_owner',
          actorSessionId: h.actor.sessionId,
          actorMembershipId: h.actor.membershipId,
        }) as unknown,
      }) as unknown,
    });
  });
  it('SV2-U-SESSION bounds the proof by the current authenticated session deadline', async () => {
    const h = fixture();
    await h.consume();
    expect(h.links.bindSuccessorChallengeInTransaction).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        validUntil: new Date(h.now.getTime() + 300_000),
      }),
    );
  });
  it('SV2-U-OTP rejects wrong code before link writer', async () => {
    const h = fixture();
    await expect(
      h.consume({ challengeId: h.id, code: '000000' }),
    ).rejects.toThrow();
    expect(h.links.bindSuccessorChallengeInTransaction).not.toHaveBeenCalled();
  });
  it('SV2-U-EXPIRY rejects expired proof before link writer', async () => {
    const h = fixture();
    h.now.setTime(h.row.expiresAt.getTime() + 1);
    await expect(h.consume()).rejects.toThrow(/expired/);
    expect(h.links.bindSuccessorChallengeInTransaction).not.toHaveBeenCalled();
  });
  it('SV2-U-REPLAY rejects consumed challenge before writer', async () => {
    const h = fixture();
    h.row.consumedAt = new Date();
    await expect(h.consume()).rejects.toThrow(/consumed/);
    expect(h.links.bindSuccessorChallengeInTransaction).not.toHaveBeenCalled();
  });
  it.each([
    'mayaUserId',
    'mayaSubjectHash',
    'verificationChannel',
    'predecessorLinkId',
  ])('SV2-U-BINDING rejects substitution of %s before writer', async (key) => {
    const h = fixture();
    (h.row.issuanceEvidenceJson as Record<string, unknown>)[key] = 'forged';
    await expect(h.consume()).rejects.toThrow(/binding_changed/);
    expect(h.links.bindSuccessorChallengeInTransaction).not.toHaveBeenCalled();
  });
  it.each([
    'policyVersion',
    'tokenHashVersion',
    'clientId',
    'issuanceEvidenceHash',
  ])('SV2-U-POLICY rejects changed %s', async (key) => {
    const h = fixture();
    (h.row as Record<string, unknown>)[key] = key.includes('Version')
      ? 1
      : 'other';
    await expect(h.consume()).rejects.toThrow(/binding_changed/);
    expect(h.links.bindSuccessorChallengeInTransaction).not.toHaveBeenCalled();
  });
  it('SV2-U-OUTCOME refuses a lost compare-and-set outcome', async () => {
    const h = fixture();
    h.tx.clientLinkChallenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(h.consume()).rejects.toThrow(/consume_failed/);
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('SV2-U-LIMIT rejects exhausted attempts before resolving or writing', async () => {
    const h = fixture();
    h.limits.consume.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 600,
    });
    await expect(h.consume()).rejects.toThrow(/Too many/);
    expect(h.candidates.resolve).not.toHaveBeenCalled();
    expect(h.links.bindSuccessorChallengeInTransaction).not.toHaveBeenCalled();
  });
  it('SV2-U-ISSUE creates subject-bound evidence, never returns OTP/phone, strict delivery outside transaction', async () => {
    const h = fixture();
    let inTransaction = false;
    h.prisma.$transaction.mockImplementation(async (fn) => {
      inTransaction = true;
      try {
        return await fn(h.tx);
      } finally {
        inTransaction = false;
      }
    });
    h.delivery.deliverClientVerificationCode.mockImplementation(() => {
      expect(inTransaction).toBe(false);
      return Promise.resolve({ delivery: 'sms' });
    });
    const r = await h.run(() => h.svc.issueSuccessor(h.actor));
    expect(Object.keys(r).sort()).toEqual(['challengeId', 'expiresAt']);
    expect(h.tx.clientLinkChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        policyVersion: 2,
        tokenHashVersion: 2,
        issuanceEvidenceJson: expect.objectContaining({
          mayaUserId: h.actor.userId,
          mayaSubjectHash: h.candidate.providerSubjectHash,
          verificationChannel: h.candidate.verificationChannel,
          predecessorLinkId: h.candidate.predecessorLinkId,
        }) as unknown,
      }) as unknown,
    });
    expect(h.delivery.assertClientVerificationAvailable).toHaveBeenCalled();
    expect(h.delivery.deliverClientVerificationCode).toHaveBeenCalledWith({
      phone: h.candidate.deliveryPhone,
      code: expect.stringMatching(/^[0-9]{6}$/) as unknown,
    });
  });
  it.each([
    'clientId',
    'predecessorLinkId',
    'verificationChannel',
    'mayaUserId',
  ])('SV2-U-INPUT refuses caller authority %s', async (key) => {
    const h = fixture();
    await expect(
      h.consume({ challengeId: h.id, code: h.code, [key]: 'chosen' }),
    ).rejects.toThrow();
    expect(h.candidates.resolve).not.toHaveBeenCalled();
  });
  it('SV2-U-ROUTE requires explicit personal context and empty issuance body', async () => {
    const h = fixture();
    const service = { issue: jest.fn(), consume: jest.fn() };
    const c = new ClientReverificationController(service as never);
    expect(() => c.issue(h.actor, undefined, {})).toThrow();
    expect(() => c.consume(h.actor, 'business', {})).toThrow();
    expect(() =>
      c.issue(h.actor, 'personal_client', { clientId: 'chosen' }),
    ).toThrow();
    expect(service.issue).not.toHaveBeenCalled();
    await c.issue(h.actor, 'personal_client', {});
    expect(service.issue).toHaveBeenCalledWith(h.actor);
  });
});
