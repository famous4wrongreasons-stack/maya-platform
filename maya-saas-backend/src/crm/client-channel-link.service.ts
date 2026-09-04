import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

import { TenantContextService } from '../tenancy/tenant-context.service';

type Tx = Prisma.TransactionClient;
export type ClientChannelProvider = 'maya_user' | 'telegram';

export interface VerifiedClientChannelProof {
  tenantId: string;
  provider: ClientChannelProvider;
  providerSubjectHash: string;
  clientId: string;
  method: 'proven_user_client_link' | 'explicit_verified_challenge';
  verificationIdentityHash: string;
  verifier: string;
  channelControlProofHash: string;
  clientAuthorityProofHash: string;
  validUntil: Date;
  supersedesLinkId?: string;
}

export interface VerifiedClientChannelRevocation {
  tenantId: string;
  provider: ClientChannelProvider;
  providerSubjectHash: string;
  linkId: string;
  revocationIdentityHash: string;
  actorProofHash: string;
  reason: string;
  validUntil: Date;
}

/** Server dependency, never supplied by an HTTP body or a consent initiator.
 * Implementations must verify channel control AND exact Client authority.
 * Verification is read-only; the final receipt is claimed inside the database
 * transaction, so a failed command cannot consume a challenge out of band.
 * There is deliberately no permissive/default verification implementation.
 */
export interface ClientChannelLinkVerifier {
  verifyLink(proof: string): Promise<VerifiedClientChannelProof>;
  verifyRevocation(proof: string): Promise<VerifiedClientChannelRevocation>;
}

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const HEX = /^[0-9a-f]{64}$/;

export async function lockClientChannelIdentity(
  tx: Tx,
  tenantId: string,
  provider: string,
  providerSubjectHash: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(
      jsonb_build_array('a18.client-channel.v1', ${tenantId}::text,
        ${provider}::text, ${providerSubjectHash}::text)::text, 0))::text
  `);
}

/** Completed verified-link foundation. Not a Client registrar or HTTP verifier. */
export class ClientChannelLinkService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly context: TenantContextService,
    private readonly verifier: ClientChannelLinkVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async link(request: unknown) {
    const proof = await this.verifier.verifyLink(this.proofToken(request));
    return this.bindVerified(proof);
  }

  async rebind(request: unknown) {
    if (
      !request ||
      typeof request !== 'object' ||
      Array.isArray(request) ||
      Object.keys(request).sort().join(',') !== 'proof,revocationProof' ||
      !('proof' in request) ||
      !('revocationProof' in request)
    )
      throw new BadRequestException(
        'Explicit link and revocation proofs required',
      );
    const proof = await this.verifier.verifyLink(
      this.proofToken({ proof: request.proof }),
    );
    const revocation = await this.verifier.verifyRevocation(
      this.proofToken({ proof: request.revocationProof }),
    );
    if (
      !proof.supersedesLinkId ||
      proof.supersedesLinkId !== revocation.linkId ||
      proof.tenantId !== revocation.tenantId ||
      proof.provider !== revocation.provider ||
      proof.providerSubjectHash !== revocation.providerSubjectHash
    )
      throw new ForbiddenException(
        'Rebind proofs do not describe the same prior identity',
      );
    return this.bindVerified(proof, revocation);
  }

  private async bindVerified(
    proof: VerifiedClientChannelProof,
    revocation?: VerifiedClientChannelRevocation,
  ) {
    const tenantId = this.context.assertTenantId(proof.tenantId);
    this.assertSubject(proof.provider, proof.providerSubjectHash);
    this.assertValid(proof.validUntil);
    if (
      !proof.clientId ||
      !proof.verifier ||
      proof.verifier.length > 160 ||
      !HEX.test(proof.verificationIdentityHash) ||
      !HEX.test(proof.channelControlProofHash) ||
      !HEX.test(proof.clientAuthorityProofHash) ||
      !['proven_user_client_link', 'explicit_verified_challenge'].includes(
        proof.method,
      ) ||
      (proof.method === 'proven_user_client_link' &&
        proof.provider !== 'maya_user')
    )
      throw new ForbiddenException(
        'Verified Client linking evidence is incomplete',
      );
    const evidence = {
      contract: 'a18.client-channel-verification.v1',
      verifier: proof.verifier,
      channelControlProofHash: proof.channelControlProofHash,
      clientAuthorityProofHash: proof.clientAuthorityProofHash,
      verificationIdentityHash: proof.verificationIdentityHash,
      tenantId,
      provider: proof.provider,
      providerSubjectHash: proof.providerSubjectHash,
      clientId: proof.clientId,
      validUntil: proof.validUntil.toISOString(),
    };
    const evidenceHash = digest(evidence);
    return this.serializable(async (tx) => {
      await lockClientChannelIdentity(
        tx,
        tenantId,
        proof.provider,
        proof.providerSubjectHash,
      );
      this.assertValid(proof.validUntil);
      if (revocation) await this.revokeVerified(tx, revocation);
      const existing = await tx.clientChannelLink.findUnique({
        where: {
          tenantId_verificationIdentityHash: {
            tenantId,
            verificationIdentityHash: proof.verificationIdentityHash,
          },
        },
      });
      if (existing) {
        if (
          existing.verificationEvidenceHash !== evidenceHash ||
          existing.supersedesLinkId !== (proof.supersedesLinkId ?? null)
        )
          throw new ConflictException(
            'Verification identity reused with different material',
          );
        return { link: existing, resumed: true };
      }
      await this.assertClient(tx, tenantId, proof.clientId);
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
      );
      const link = await tx.clientChannelLink.create({
        data: {
          tenantId,
          clientId: proof.clientId,
          provider: proof.provider,
          providerSubjectHash: proof.providerSubjectHash,
          verificationMethod: proof.method,
          verificationIdentityHash: proof.verificationIdentityHash,
          verificationEvidenceJson: evidence,
          verificationEvidenceHash: evidenceHash,
          supersedesLinkId: proof.supersedesLinkId,
          verifiedAt: clock.now,
          createdAt: clock.now,
        },
      });
      return { link, resumed: false };
    });
  }

  async revoke(request: unknown) {
    const proof = await this.verifier.verifyRevocation(
      this.proofToken(request),
    );
    return this.serializable((tx) => this.revokeVerified(tx, proof));
  }

  private async revokeVerified(tx: Tx, proof: VerifiedClientChannelRevocation) {
    const tenantId = this.context.assertTenantId(proof.tenantId);
    this.assertSubject(proof.provider, proof.providerSubjectHash);
    this.assertValid(proof.validUntil);
    if (
      !proof.linkId ||
      !HEX.test(proof.revocationIdentityHash) ||
      !HEX.test(proof.actorProofHash) ||
      !proof.reason.trim() ||
      proof.reason.length > 160
    )
      throw new ForbiddenException(
        'Verified revocation evidence is incomplete',
      );
    const evidence = {
      contract: 'a18.client-channel-revocation.v1',
      revocationIdentityHash: proof.revocationIdentityHash,
      tenantId,
      linkId: proof.linkId,
      actorProofHash: proof.actorProofHash,
      reason: proof.reason,
    };
    const evidenceHash = digest(evidence);
    await lockClientChannelIdentity(
      tx,
      tenantId,
      proof.provider,
      proof.providerSubjectHash,
    );
    this.assertValid(proof.validUntil);
    const link = await tx.clientChannelLink.findUnique({
      where: { id_tenantId: { id: proof.linkId, tenantId } },
    });
    if (
      !link ||
      link.provider !== proof.provider ||
      link.providerSubjectHash !== proof.providerSubjectHash
    )
      throw new ForbiddenException(
        'Revocation subject does not own this binding',
      );
    if (link.revokedAt) {
      if (
        link.revocationIdentityHash !== proof.revocationIdentityHash ||
        link.revocationEvidenceHash !== evidenceHash
      )
        throw new ConflictException('Client binding is already revoked');
      return { link, resumed: true };
    }
    const updated = await tx.clientChannelLink.update({
      where: { id: link.id },
      data: {
        revokedAt: this.now(),
        revocationIdentityHash: proof.revocationIdentityHash,
        revocationEvidenceJson: evidence,
        revocationEvidenceHash: evidenceHash,
      },
    });
    return { link: updated, resumed: false };
  }

  async resolveActive(
    tenantId: string,
    provider: ClientChannelProvider,
    providerSubjectHash: string,
  ) {
    this.context.assertTenantId(tenantId);
    this.assertSubject(provider, providerSubjectHash);
    const links = await this.prisma.clientChannelLink.findMany({
      where: { tenantId, provider, providerSubjectHash, revokedAt: null },
      take: 2,
    });
    if (links.length !== 1)
      throw new ForbiddenException('client_identity_unresolved');
    await this.assertClient(this.prisma, tenantId, links[0].clientId);
    return links[0];
  }

  private async assertClient(
    tx: Tx | PrismaClient,
    tenantId: string,
    clientId: string,
  ) {
    const client = await tx.client.findUnique({
      where: { id_tenantId: { id: clientId, tenantId } },
      include: { crmLinks: { where: { unlinkedAt: null } } },
    });
    if (!client || client.mergedIntoClientId)
      throw new ForbiddenException('client_identity_unresolved');
    if (
      client.crmLinks.length &&
      (await tx.unresolvedClientIdentityHold.findFirst({
        where: {
          tenantId,
          resolvedAt: null,
          OR: client.crmLinks.map((link) => ({
            provider: link.provider,
            externalId: link.externalId,
          })),
        },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('client_identity_unresolved');
  }

  private proofToken(value: unknown): string {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      !('proof' in value) ||
      typeof value.proof !== 'string' ||
      value.proof.length < 16 ||
      value.proof.length > 4096
    )
      throw new BadRequestException(
        'Only an opaque verification proof is accepted',
      );
    return value.proof;
  }

  private assertSubject(provider: string, subjectHash: string) {
    if (!['maya_user', 'telegram'].includes(provider) || !HEX.test(subjectHash))
      throw new ForbiddenException('Authenticated channel identity is invalid');
  }

  private assertValid(validUntil: Date) {
    if (
      !(validUntil instanceof Date) ||
      !Number.isFinite(validUntil.getTime()) ||
      validUntil <= this.now()
    )
      throw new ForbiddenException('Client linking proof expired');
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
            (error.code === 'P2002' &&
              error.meta?.modelName === 'ClientChannelLink') ||
            (error.code === 'P2010' && String(error.meta?.code) === '40001')) &&
          attempt < 4
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException(
      'Client channel transaction could not serialize',
    );
  }
}
