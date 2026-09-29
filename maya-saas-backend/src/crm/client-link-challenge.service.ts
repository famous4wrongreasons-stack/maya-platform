import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { ClientReverificationCandidateService } from './client-reverification-candidate.service';
import type { PhoneAuthDeliveryService } from '../auth/phone-auth-delivery.service';
import type { AuthRateLimitRepository } from '../auth/auth-rate-limit.repository';
import { AuthRateLimitException } from '../auth/auth-rate-limit.exception';
import {
  SUCCESSOR_CHALLENGE_POLICY as V2,
  successorEvidence,
  successorEvidenceHash,
} from './client-link-successor-evidence';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
  type ClientChannelProvider,
} from './client-channel-link.service';
import { CLIENT_LINK_CHALLENGE_POLICY as POLICY } from './client-link-challenge.policy';

type Tx = Prisma.TransactionClient;
const HEX = /^[0-9a-f]{64}$/;
const REF = /^[a-zA-Z0-9._:-]{1,240}$/;

export interface TrustedClientResolution {
  tenantId: string;
  clientId: string;
  resolver: string;
  resolutionEvidenceRef: string;
  resolutionEvidenceHash: string;
  issuerAuthorityHash: string;
  validUntil: Date;
}

/** Server dependency: verifies exact Client authority; no heuristic fallback. */
export interface ClientChallengeIssuerAuthority {
  readonly resolverId: string;
  resolve(proof: string, tx: Tx): Promise<TrustedClientResolution>;
}

export interface AuthenticatedClientChannel {
  tenantId: string;
  provider: ClientChannelProvider;
  providerSubjectHash: string;
  /** Ephemeral authenticated delivery address. Never write to evidence/logs. */
  deliveryAddress: string;
  channelControlProofHash: string;
  validUntil: Date;
}

/** Verifies current channel authentication, without claiming Client authority. */
export interface ClientChannelAuthenticator {
  authenticate(proof: string, tx: Tx): Promise<AuthenticatedClientChannel>;
}

export interface SuccessorChallengeDependencies {
  candidates: ClientReverificationCandidateService;
  delivery: PhoneAuthDeliveryService;
  limits: AuthRateLimitRepository;
}

export class ClientLinkChallengeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly links: ClientChannelLinkService,
    private readonly issuer: ClientChallengeIssuerAuthority,
    private readonly channels: ClientChannelAuthenticator,
    private readonly successor?: SuccessorChallengeDependencies,
  ) {}

  async issue(request: unknown) {
    const input = this.input(request, ['resolutionProof']);
    const proof = this.opaqueProof(input.resolutionProof);
    const tenantId = this.context.requireTenantId();
    const token = randomBytes(POLICY.tokenBytes).toString('base64url');
    const tokenHash = this.hashToken(tenantId, token);
    return this.serializable(async (tx) => {
      const resolution = await this.issuer.resolve(proof, tx);
      this.context.assertTenantId(resolution.tenantId);
      const now = await this.clock(tx);
      if (
        resolution.tenantId !== tenantId ||
        !resolution.clientId ||
        resolution.resolver !== this.issuer.resolverId ||
        !/^[a-zA-Z0-9._:-]{1,160}$/.test(resolution.resolver) ||
        !REF.test(resolution.resolutionEvidenceRef) ||
        !HEX.test(resolution.resolutionEvidenceHash) ||
        !HEX.test(resolution.issuerAuthorityHash)
      )
        throw new ForbiddenException(
          'Trusted exact Client resolution required',
        );
      this.validAt(resolution.validUntil, now);
      await this.links.assertClientEligible(tx, tenantId, resolution.clientId);
      const evidence = {
        contract: 'a18.client-link-challenge.issue.v1',
        resolver: resolution.resolver,
        resolutionEvidenceRef: resolution.resolutionEvidenceRef,
        resolutionEvidenceHash: resolution.resolutionEvidenceHash,
        issuerAuthorityHash: resolution.issuerAuthorityHash,
        tenantId,
        clientId: resolution.clientId,
        issuedAt: now.toISOString(),
        policyVersion: POLICY.version,
      };
      const challenge = await tx.clientLinkChallenge.create({
        data: {
          tenantId,
          clientId: resolution.clientId,
          tokenHash,
          tokenHashVersion: POLICY.tokenHashVersion,
          policyVersion: POLICY.version,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + POLICY.ttlSeconds * 1000),
          issuanceEvidenceJson: evidence,
          issuanceEvidenceHash: createHash('sha256')
            .update(JSON.stringify(evidence))
            .digest('hex'),
        },
      });
      // Bearer exists only in the authenticated issuance response, never in a row/log.
      return {
        challengeId: challenge.id,
        token,
        expiresAt: challenge.expiresAt,
      };
    });
  }

  async consume(request: unknown) {
    const input = this.input(request, ['channelProof', 'token']);
    const channelProof = this.opaqueProof(input.channelProof);
    if (
      typeof input.token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
      Buffer.from(input.token, 'base64url').toString('base64url') !==
        input.token
    )
      throw new BadRequestException('Opaque Client linking token required');
    const tenantId = this.context.requireTenantId();
    const tokenHash = this.hashToken(tenantId, input.token);
    return this.serializable(async (tx) => {
      const channel = await this.channels.authenticate(channelProof, tx);
      this.assertChannel(tenantId, channel, await this.clock(tx));
      await lockClientChannelIdentity(
        tx,
        tenantId,
        channel.provider,
        channel.providerSubjectHash,
      );
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ClientLinkChallenge" WHERE "tenantId" = ${tenantId}
          AND "tokenHash" = ${tokenHash} FOR UPDATE
      `);
      if (rows.length !== 1)
        throw new ForbiddenException('client_link_challenge_invalid');
      const challenge = await tx.clientLinkChallenge.findUniqueOrThrow({
        where: { id_tenantId: { id: rows[0].id, tenantId } },
      });
      if (challenge.consumedAt)
        throw new ConflictException('client_link_challenge_already_consumed');
      const currentChannel = await this.channels.authenticate(channelProof, tx);
      const now = await this.clock(tx);
      this.assertChannel(tenantId, currentChannel, now);
      if (
        currentChannel.provider !== channel.provider ||
        currentChannel.providerSubjectHash !== channel.providerSubjectHash
      )
        throw new ForbiddenException('Authenticated channel changed');
      this.validAt(challenge.expiresAt, now);
      if (
        challenge.policyVersion !== POLICY.version ||
        challenge.tokenHashVersion !== POLICY.tokenHashVersion ||
        challenge.expiresAt.getTime() - challenge.issuedAt.getTime() !==
          POLICY.ttlSeconds * 1000
      )
        throw new ForbiddenException(
          'Client linking challenge policy mismatch',
        );
      const result = await this.links.bindChallengeInTransaction(tx, {
        tenantId,
        clientId: challenge.clientId,
        provider: currentChannel.provider,
        providerSubjectHash: currentChannel.providerSubjectHash,
        method: 'explicit_verified_challenge',
        verificationIdentityHash: challenge.tokenHash,
        verifier: 'a18.client-link-challenge.v1',
        channelControlProofHash: currentChannel.channelControlProofHash,
        clientAuthorityProofHash: challenge.issuanceEvidenceHash,
        deliveryAddressEncrypted: this.encryption.encrypt(
          currentChannel.deliveryAddress,
        ),
        validUntil: new Date(
          Math.min(
            challenge.expiresAt.getTime(),
            currentChannel.validUntil.getTime(),
          ),
        ),
      });
      const changed = await tx.clientLinkChallenge.updateMany({
        where: {
          id: challenge.id,
          tenantId,
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: await this.clock(tx) },
        },
        data: {
          consumedAt: await this.clock(tx),
          consumedLinkId: result.link.id,
          consumedProvider: currentChannel.provider,
          consumedSubjectHash: currentChannel.providerSubjectHash,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('client_link_challenge_consume_failed');
      return { challengeId: challenge.id, link: result.link };
    });
  }

  /** Subject-bound V2. The OTP is delivered only through the strict existing SMS path. */
  async issueSuccessor(user: AuthenticatedUser) {
    const actor = { ...user };
    const deps = this.successorDependencies();
    if (!actor.tenantId)
      throw new ForbiddenException('tenant_qualified_account_required');
    const tenantId = this.context.assertTenantId(actor.tenantId);
    if (this.context.get()?.userId !== actor.userId)
      throw new ForbiddenException('authenticated_account_required');
    deps.delivery.assertClientVerificationAvailable();
    await this.successorLimit(actor, 'issue');
    const candidate = await deps.candidates.resolve(actor);
    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challenge = await this.serializable(async (tx) => {
      await deps.candidates.assertCurrentInTransaction(tx, actor, candidate);
      const now = await this.clock(tx);
      const evidence = successorEvidence(candidate, now, this.encryption);
      const evidenceHash = successorEvidenceHash(evidence);
      const row = await tx.clientLinkChallenge.create({
        data: {
          id,
          tenantId,
          clientId: candidate.clientId,
          tokenHash: this.successorTokenHash(id, evidenceHash, code),
          tokenHashVersion: V2.tokenHashVersion,
          policyVersion: V2.version,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + V2.ttlSeconds * 1000),
          issuanceEvidenceJson: evidence,
          issuanceEvidenceHash: evidenceHash,
        },
      });
      await this.successorAudit(
        tx,
        actor,
        row.id,
        'issued',
        candidate.predecessorLinkId,
      );
      return { challengeId: row.id, expiresAt: row.expiresAt };
    });
    // Outside retryable transactions: never duplicate external delivery on serialization retry.
    // Failure leaves an unconsumed, expiring challenge; neither issuance nor delivery grants authority.
    await deps.delivery.deliverClientVerificationCode({
      phone: candidate.deliveryPhone,
      code,
    });
    return challenge;
  }

  async consumeSuccessor(user: AuthenticatedUser, request: unknown) {
    const actor = { ...user };
    const input = this.input(request, ['challengeId', 'code']);
    if (
      typeof input.challengeId !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(input.challengeId) ||
      typeof input.code !== 'string' ||
      !/^[0-9]{6}$/.test(input.code)
    )
      throw new BadRequestException('Challenge id and six-digit OTP required');
    const challengeId = input.challengeId;
    const code = input.code;
    if (!actor.tenantId)
      throw new ForbiddenException('tenant_qualified_account_required');
    const tenantId = this.context.assertTenantId(actor.tenantId);
    if (this.context.get()?.userId !== actor.userId)
      throw new ForbiddenException('authenticated_account_required');
    // Durable failed attempts MUST survive a rolled-back verification transaction.
    await this.successorLimit(actor, 'consume', challengeId);
    const deps = this.successorDependencies();
    const candidate = await deps.candidates.resolve(actor);
    return this.serializable(async (tx) => {
      const authenticatedUntil =
        await deps.candidates.assertCurrentInTransaction(tx, actor, candidate);
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ClientLinkChallenge" WHERE "tenantId" = ${tenantId}
          AND "id" = ${challengeId} FOR UPDATE
      `);
      if (rows.length !== 1)
        throw new ForbiddenException('client_link_challenge_invalid');
      const challenge = await tx.clientLinkChallenge.findUniqueOrThrow({
        where: { id_tenantId: { id: challengeId, tenantId } },
      });
      if (challenge.consumedAt)
        throw new ConflictException('client_link_challenge_already_consumed');
      this.validAt(challenge.expiresAt, await this.clock(tx));
      const expected = successorEvidence(
        candidate,
        challenge.issuedAt,
        this.encryption,
      );
      const expectedHash = successorEvidenceHash(expected);
      if (
        challenge.policyVersion !== V2.version ||
        challenge.tokenHashVersion !== V2.tokenHashVersion ||
        challenge.expiresAt.getTime() - challenge.issuedAt.getTime() !==
          V2.ttlSeconds * 1000 ||
        challenge.clientId !== candidate.clientId ||
        !isDeepStrictEqual(challenge.issuanceEvidenceJson, expected) ||
        challenge.issuanceEvidenceHash !== expectedHash
      )
        throw new ForbiddenException('client_reverification_binding_changed');
      const supplied = this.successorTokenHash(challengeId, expectedHash, code);
      if (
        !HEX.test(challenge.tokenHash) ||
        !timingSafeEqual(
          Buffer.from(supplied, 'hex'),
          Buffer.from(challenge.tokenHash, 'hex'),
        )
      )
        throw new ForbiddenException('client_link_challenge_invalid');
      const result = await this.links.bindSuccessorChallengeInTransaction(tx, {
        tenantId,
        clientId: candidate.clientId,
        provider: 'maya_user',
        providerSubjectHash: candidate.providerSubjectHash,
        method: 'explicit_verified_challenge',
        verificationIdentityHash: challenge.tokenHash,
        verifier: 'a18.client-link-challenge.sms.v2',
        channelControlProofHash: this.encryption.opaqueReference(
          'sb1.verified-otp.v2',
          JSON.stringify([challengeId, expectedHash, challenge.tokenHash]),
        ),
        clientAuthorityProofHash: expectedHash,
        deliveryAddressEncrypted: this.encryption.encrypt(actor.userId),
        validUntil: new Date(
          Math.min(challenge.expiresAt.getTime(), authenticatedUntil.getTime()),
        ),
        supersedesLinkId: candidate.predecessorLinkId,
      });
      const changed = await tx.clientLinkChallenge.updateMany({
        where: {
          id: challengeId,
          tenantId,
          consumedAt: null,
          expiresAt: { gt: await this.clock(tx) },
        },
        data: {
          consumedAt: await this.clock(tx),
          consumedLinkId: result.link.id,
          consumedProvider: 'maya_user',
          consumedSubjectHash: candidate.providerSubjectHash,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('client_link_challenge_consume_failed');
      await this.successorAudit(
        tx,
        actor,
        challengeId,
        'verified',
        candidate.predecessorLinkId,
        result.link.id,
      );
      return { challengeId, linkId: result.link.id, verified: true as const };
    });
  }

  private successorDependencies() {
    if (!this.successor)
      throw new ForbiddenException('successor_verifier_unavailable');
    return this.successor;
  }
  private successorTokenHash(id: string, evidenceHash: string, code: string) {
    return this.encryption.opaqueReference(
      V2.tokenNamespace,
      JSON.stringify([id, evidenceHash, code]),
    );
  }
  private async successorLimit(
    actor: AuthenticatedUser,
    action: 'issue' | 'consume',
    challengeId?: string,
  ) {
    if (!actor.tenantId)
      throw new ForbiddenException('tenant_qualified_account_required');
    const tenantId = this.context.assertTenantId(actor.tenantId);
    const deps = this.successorDependencies();
    const subjectHash = this.encryption.opaqueReference(
      'sb1.otp-limit.v2',
      JSON.stringify([tenantId, actor.userId]),
    );
    const rules = (
      action === 'issue'
        ? [
            { suffix: 'cooldown', maxAttempts: 1, windowSeconds: 60 },
            { suffix: 'window', maxAttempts: 5, windowSeconds: 600 },
          ]
        : [{ suffix: 'window', maxAttempts: 10, windowSeconds: 600 }]
    ).map((r) => ({
      action: `client_reverification_${action}`,
      policyKey: `sb1.otp.v2.${action}.${r.suffix}`,
      scope: 'identity' as const,
      subjectHash,
      tenantId,
      maxAttempts: r.maxAttempts,
      windowSeconds: r.windowSeconds,
    }));
    if (challengeId)
      rules.push({
        action: 'client_reverification_consume',
        policyKey: 'sb1.otp.v2.consume.challenge',
        scope: 'identity',
        tenantId,
        subjectHash: this.encryption.opaqueReference(
          'sb1.otp-attempt.v2',
          JSON.stringify([tenantId, actor.userId, challengeId]),
        ),
        maxAttempts: 5,
        windowSeconds: 600,
      });
    const result = await deps.limits.consume(
      rules,
      await this.clock(this.prisma),
    );
    if (!result.allowed)
      throw new AuthRateLimitException(result.retryAfterSeconds);
  }
  private successorAudit(
    tx: Tx,
    actor: AuthenticatedUser,
    challengeId: string,
    outcome: string,
    predecessorLinkId: string,
    linkId?: string,
  ) {
    return tx.auditLog.create({
      data: {
        scope: 'tenant',
        tenantId: actor.tenantId!,
        userId: actor.userId,
        action: `client_reverification.${outcome}`,
        entityType: 'ClientLinkChallenge',
        entityId: challengeId,
        metadataJson: {
          contract: 'sb1.client-reverification.audit.v2',
          authority_context: 'personal_client',
          actorSessionId: actor.sessionId,
          actorMembershipId: actor.membershipId,
          actorRole: actor.role,
          predecessorLinkId,
          ...(linkId ? { linkId } : {}),
        },
      },
    });
  }

  private hashToken(tenantId: string, token: string) {
    return this.encryption.opaqueReference(
      POLICY.tokenNamespace,
      JSON.stringify([tenantId, token]),
    );
  }

  private assertChannel(
    tenantId: string,
    channel: AuthenticatedClientChannel,
    now: Date,
  ) {
    this.context.assertTenantId(channel.tenantId);
    if (
      channel.tenantId !== tenantId ||
      !['maya_user', 'telegram'].includes(channel.provider) ||
      !HEX.test(channel.providerSubjectHash) ||
      !HEX.test(channel.channelControlProofHash)
    )
      throw new ForbiddenException(
        'Verified current channel authentication required',
      );
    this.validAt(channel.validUntil, now);
  }

  private validAt(until: Date, now: Date) {
    if (
      !(until instanceof Date) ||
      !Number.isFinite(until.getTime()) ||
      until <= now
    )
      throw new ForbiddenException('Client linking proof or challenge expired');
  }

  private async clock(tx: Tx) {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`
      SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
    `);
    return row.now;
  }

  private input(value: unknown, keys: string[]): Record<string, unknown> {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
    )
      throw new BadRequestException(
        'Only opaque challenge/channel proofs are accepted',
      );
    return value as Record<string, unknown>;
  }

  private opaqueProof(value: unknown): string {
    if (typeof value !== 'string' || value.length < 16 || value.length > 4096)
      throw new BadRequestException('Opaque authority proof required');
    return value;
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' && String(error.meta?.code) === '40001')) &&
          attempt < 4
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException('Client linking challenge could not serialize');
  }
}
