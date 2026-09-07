import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type ClientWebPushEndpoint } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EncryptionService } from '../encryption/encryption.service';
import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from './client-channel-link.service';
import {
  CLIENT_WEB_PUSH_POLICY,
  normalizeWebPushSubscription,
  webPushObject,
  type ClientWebPushSubscription,
} from './client-web-push.policy';

type Tx = Prisma.TransactionClient;
type TerminalReason =
  'UNSUBSCRIBED' | 'REPLACED' | 'PERMANENT_ENDPOINT_INVALID';

/** B24 AC3 registry. No delivery, consent, Client/link creation or legacy lookup. */
@Injectable()
export class ClientWebPushService {
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
  ) {
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: () =>
        Promise.reject(new ForbiddenException('Verified linking required')),
      verifyRevocation: () =>
        Promise.reject(new ForbiddenException('Verified linking required')),
    });
  }

  async register(proof: string, value: unknown) {
    const input = webPushObject(value, ['subscription', 'expectedEndpointId']);
    const subscription = normalizeWebPushSubscription(input.subscription);
    const expectedId = this.optionalId(input.expectedEndpointId);
    return this.transaction(async (tx) => {
      const identity = await this.identity(tx, proof);
      const endpointHash = this.endpointHash(subscription.endpoint);
      const predecessor = expectedId
        ? await tx.clientWebPushEndpoint.findFirst({
            where: {
              id: expectedId,
              tenantId: identity.tenantId,
              clientId: identity.clientId,
            },
          })
        : null;
      if (expectedId && !predecessor)
        throw new ForbiddenException('WEB_PUSH_ENDPOINT_UNAVAILABLE');
      await this.lock(tx, identity, [
        endpointHash,
        ...(predecessor ? [predecessor.endpointHash] : []),
      ]);
      const materialHash = this.materialHash(identity, subscription);
      const registrationIdentityHash = this.hash('registration', [
        identity.tenantId,
        identity.clientId,
        identity.linkId,
        endpointHash,
        materialHash,
        expectedId ?? null,
      ]);
      const prior = await tx.clientWebPushEndpoint.findUnique({
        where: {
          tenantId_registrationIdentityHash: {
            tenantId: identity.tenantId,
            registrationIdentityHash,
          },
        },
      });
      if (prior) return this.receipt(prior, false);
      const episodes = await tx.clientWebPushEndpoint.findMany({
        where: { endpointHash },
      });
      if (
        episodes.some(
          (row) =>
            row.tenantId !== identity.tenantId ||
            row.clientId !== identity.clientId,
        )
      )
        throw new ConflictException('WEB_PUSH_ENDPOINT_UNAVAILABLE');
      const active = episodes.find((row) => !row.endedAt);
      if (
        active &&
        active.materialHash === materialHash &&
        active.clientChannelLinkId === identity.linkId &&
        !expectedId
      )
        return this.receipt(active, false);
      if (episodes.length && !expectedId)
        throw new ConflictException('WEB_PUSH_EXPLICIT_REPLACEMENT_REQUIRED');
      if (active && active.id !== expectedId)
        throw new ConflictException('WEB_PUSH_ENDPOINT_UNAVAILABLE');
      if (predecessor) {
        const current = await tx.clientWebPushEndpoint.findUniqueOrThrow({
          where: { id: predecessor.id },
        });
        if (current.endedAt)
          throw new ConflictException('WEB_PUSH_STALE_REPLACEMENT');
        await this.terminate(
          tx,
          current,
          'REPLACED',
          identity.actorProofHash,
          registrationIdentityHash,
        );
      }
      const count = await tx.clientWebPushEndpoint.count({
        where: {
          tenantId: identity.tenantId,
          clientId: identity.clientId,
          endedAt: null,
        },
      });
      if (count >= CLIENT_WEB_PUSH_POLICY.maxActive)
        throw new ConflictException('CLIENT_WEB_PUSH_LIMIT_EXCEEDED');
      if (
        subscription.expirationTime !== null &&
        subscription.expirationTime <= Date.now()
      )
        throw new BadRequestException('WEB_PUSH_SUBSCRIPTION_EXPIRED');
      const ciphertext = this.encryption.encrypt(JSON.stringify(subscription));
      if (
        Buffer.byteLength(ciphertext) >
        CLIENT_WEB_PUSH_POLICY.maxCiphertextBytes
      )
        throw new BadRequestException('WEB_PUSH_MATERIAL_LIMIT_EXCEEDED');
      const evidence = {
        contract: 'b24.web-push.registration.v1',
        linkId: identity.linkId,
        linkEvidenceHash: identity.linkEvidenceHash,
        actorProofHash: identity.actorProofHash,
        materialHash,
        registrationIdentityHash,
      };
      await tx.$executeRaw`SELECT set_config('maya.web_push.verified_link', ${identity.linkId}, true), set_config('maya.web_push.verified_client', ${identity.clientId}, true)`;
      const row = await tx.clientWebPushEndpoint.create({
        data: {
          id: randomUUID(),
          tenantId: identity.tenantId,
          clientId: identity.clientId,
          clientChannelLinkId: identity.linkId,
          endpointHash,
          subscriptionEncrypted: ciphertext,
          materialHash,
          registrationIdentityHash,
          registrationEvidenceJson: evidence,
          registrationEvidenceHash: this.hash('evidence', evidence),
          supersedesEndpointId: expectedId,
        },
      });
      return this.receipt(row, true);
    });
  }

  async unsubscribe(proof: string, value: unknown) {
    const input = webPushObject(value, ['endpointId']);
    const id = this.optionalId(input.endpointId);
    if (!id) throw new BadRequestException('WEB_PUSH_ENDPOINT_ID_REQUIRED');
    return this.transaction(async (tx) => {
      const identity = await this.identity(tx, proof);
      const found = await tx.clientWebPushEndpoint.findFirst({
        where: { id, tenantId: identity.tenantId, clientId: identity.clientId },
      });
      if (!found) throw new ForbiddenException('WEB_PUSH_ENDPOINT_UNAVAILABLE');
      await this.lock(tx, identity, [found.endpointHash]);
      const current = await tx.clientWebPushEndpoint.findUniqueOrThrow({
        where: { id },
      });
      if (current.endedAt) return this.receipt(current, false);
      const ended = await this.terminate(
        tx,
        current,
        'UNSUBSCRIBED',
        identity.actorProofHash,
        this.hash('unsubscribe', [id]),
      );
      return this.receipt(ended, true);
    });
  }

  /** Read-only delivery candidate snapshot. Only opaque episode IDs leave here. */
  async eligibleIds(tenantId: string, clientId: string, issuedAt: Date) {
    if (this.context.requireTenantId() !== tenantId)
      throw new ForbiddenException('Tenant mismatch');
    const rows = await this.prisma.clientWebPushEndpoint.findMany({
      where: {
        tenantId,
        clientId,
        createdAt: { lt: issuedAt },
        endedAt: null,
        clientChannelLink: { revokedAt: null },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: CLIENT_WEB_PUSH_POLICY.maxFanOut,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Server-only. Call exclusively from Communication Delivery at dispatch.
   * Endpoint HMAC binds delivery material; it never resolves the Client. */
  async resolveForDelivery(
    tenantId: string,
    clientId: string,
    endpointId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (this.context.requireTenantId() !== tenantId) return null;
    const row = await db.clientWebPushEndpoint.findFirst({
      where: { id: endpointId, tenantId, clientId, endedAt: null },
      include: { clientChannelLink: true },
    });
    if (
      !row ||
      row.clientChannelLink.revokedAt ||
      row.clientChannelLink.verificationVersion !== 1 ||
      row.clientChannelLink.subjectHashVersion !== 1
    )
      return null;
    try {
      await this.assertTenant(db, tenantId);
      await this.links.assertClientEligible(db, tenantId, clientId);
      const subscription = normalizeWebPushSubscription(
        JSON.parse(this.encryption.decrypt(row.subscriptionEncrypted)),
      );
      if (
        this.endpointHash(subscription.endpoint) !== row.endpointHash ||
        this.materialHash(
          { tenantId, clientId, linkId: row.clientChannelLinkId },
          subscription,
        ) !== row.materialHash ||
        (subscription.expirationTime !== null &&
          subscription.expirationTime <= Date.now())
      )
        return null;
      return subscription;
    } catch {
      return null;
    }
  }

  /** Exact durable attempt only; a temporary/UNKNOWN result cannot use this API.
   * No raw provider response, recipient address or identity mutation is accepted. */
  async invalidateAfterDelivery(
    tenantId: string,
    clientId: string,
    endpointId: string,
    attemptId: string,
  ) {
    if (this.context.requireTenantId() !== tenantId)
      throw new ForbiddenException('Tenant mismatch');
    return this.transaction(async (tx) => {
      const row = await tx.clientWebPushEndpoint.findFirst({
        where: { id: endpointId, tenantId, clientId },
      });
      if (!row) throw new ForbiddenException('WEB_PUSH_ENDPOINT_UNAVAILABLE');
      await this.lock(tx, { tenantId, clientId }, [row.endpointHash]);
      const attempt = await tx.marketingDeliveryAttempt.findFirst({
        where: {
          id: attemptId,
          tenantId,
          outcomeCode: 'web_push_endpoint_invalid',
        },
        include: { recipient: true, campaign: true },
      });
      const bulkOwner = attempt?.campaign.parentRecipientId
        ? await tx.marketingCampaignRecipient.findFirst({
            where: {
              id: attempt.campaign.parentRecipientId,
              tenantId,
              clientId,
              lifecycleVersion: 2,
              recipientKind: 'canonical_client',
            },
          })
        : null;
      const exactEvidence =
        attempt?.recipient?.eligibilityEvidenceRef ===
        (bulkOwner
          ? `b35:endpoint:${endpointId}`
          : `web-push-endpoint:${endpointId}`);
      // The recipient's opaque endpoint reference is independently hashed by
      // Communication Delivery; its explicit evidence binds the exact episode.
      if (
        !attempt ||
        attempt.state !== 'FAILED' ||
        attempt.reconciliationRequired ||
        attempt.campaign.channel !== 'web_push' ||
        attempt.campaign.deliveryCapabilityKey !==
          'communication.production.web-push.client-single' ||
        attempt.recipient?.recipientKind !== 'client_web_push_endpoint' ||
        !exactEvidence ||
        (attempt.campaign.parentRecipientId !== null && !bulkOwner)
      )
        throw new ForbiddenException('PERMANENT_WEB_PUSH_OUTCOME_REQUIRED');
      const current = await tx.clientWebPushEndpoint.findUniqueOrThrow({
        where: { id: endpointId },
      });
      if (current.endedAt) return this.receipt(current, false);
      const ended = await this.terminate(
        tx,
        current,
        'PERMANENT_ENDPOINT_INVALID',
        this.hash('attempt', attemptId),
        this.hash('invalidation', [endpointId, attemptId]),
      );
      return this.receipt(ended, true);
    });
  }

  private hash(kind: string, value: unknown) {
    return this.encryption.opaqueReference(
      `b24.web-push.${kind}.v1`,
      JSON.stringify(value),
    );
  }
  private endpointHash(endpoint: string) {
    return this.hash('endpoint', endpoint);
  }
  private materialHash(
    owner: { tenantId: string; clientId: string; linkId: string },
    subscription: ClientWebPushSubscription,
  ) {
    return this.hash('material', [
      owner.tenantId,
      owner.clientId,
      owner.linkId,
      subscription,
    ]);
  }
  private optionalId(value: unknown) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value))
      throw new BadRequestException('INVALID_WEB_PUSH_EPISODE_ID');
    return value;
  }
  private receipt(row: ClientWebPushEndpoint, changed: boolean) {
    return {
      endpointId: row.id,
      status: row.endedAt ? 'INACTIVE' : 'ACTIVE',
      changed,
    };
  }
  private async assertTenant(tx: Tx | PrismaService, tenantId: string) {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (
      !tenant ||
      !['active', 'trial_active', 'past_due_grace'].includes(
        evaluateTenantAccessState(tenant, new Date()).accessState,
      )
    )
      throw new ForbiddenException('Tenant is not active');
  }
  private async identity(tx: Tx, proof: string) {
    const first = await this.channels.authenticate(proof, tx);
    await lockClientChannelIdentity(
      tx,
      first.tenantId,
      first.provider,
      first.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    if (
      first.tenantId !== current.tenantId ||
      first.provider !== current.provider ||
      first.providerSubjectHash !== current.providerSubjectHash
    )
      throw new ForbiddenException('Authenticated channel changed');
    await this.assertTenant(tx, current.tenantId);
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId: current.tenantId,
        provider: current.provider,
        providerSubjectHash: current.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (
      links.length !== 1 ||
      links[0].verificationVersion !== 1 ||
      links[0].subjectHashVersion !== 1
    )
      throw new ForbiddenException('CLIENT_LINK_REQUIRED');
    const link = links[0];
    await this.links.assertClientEligible(tx, current.tenantId, link.clientId);
    return {
      tenantId: current.tenantId,
      clientId: link.clientId,
      linkId: link.id,
      linkEvidenceHash: link.verificationEvidenceHash,
      actorProofHash: current.channelControlProofHash,
    };
  }
  private async lock(
    tx: Tx,
    owner: { tenantId: string; clientId: string },
    hashes: string[],
  ) {
    for (const hash of [...new Set(hashes)].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'b24.endpoint:' + hash}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array('b24.client', ${owner.tenantId}::text, ${owner.clientId}::text)::text, 0))`;
  }
  private async terminate(
    tx: Tx,
    row: ClientWebPushEndpoint,
    reason: TerminalReason,
    authorityRefHash: string,
    terminationIdentityHash: string,
  ) {
    const evidence = {
      contract: 'b24.web-push.termination.v1',
      endpointId: row.id,
      reason,
      authorityRefHash,
      terminationIdentityHash,
    };
    await tx.$executeRaw`SELECT set_config('maya.web_push.termination_identity', ${terminationIdentityHash}, true)`;
    return tx.clientWebPushEndpoint.update({
      where: { id: row.id },
      data: {
        endedAt: new Date(),
        endReason: reason,
        terminationIdentityHash,
        terminationEvidenceJson: evidence,
        terminationEvidenceHash: this.hash('evidence', evidence),
      },
    });
  }
  private async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 30000,
          timeout: 30000,
        });
      } catch (error) {
        if (
          attempt < 9 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        )
          continue;
        throw error;
      }
    }
  }
}
