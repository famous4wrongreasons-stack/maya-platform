import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type MarketingCampaign,
  type MarketingCampaignRecipient,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from '../crm/client-channel-authenticator.service';
import { EncryptionService } from '../encryption/encryption.service';
import {
  ActionEngineKernel,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { CommunicationBulkPolicyService } from '../communication-delivery/communication-bulk-policy.service';
import { CommunicationBulkDeliveryService } from '../communication-delivery/communication-bulk-delivery.service';
import {
  BULK_AUDIENCE,
  BULK_INTENT,
  BULK_ROOT_CAPABILITY,
  bulkCanonical,
  bulkCode,
  bulkContent,
  bulkHash,
  bulkObject,
  retryableBulkTransaction,
} from './canonical-bulk.contract';

type Tx = Prisma.TransactionClient;
type Graph = MarketingCampaign & { recipients: MarketingCampaignRecipient[] };
/** Business owner of the approved immutable Client bulk; never a transport. */
@Injectable()
export class CanonicalBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
    private readonly policy: CommunicationBulkPolicyService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly engine: ActionEngineKernel,
    private readonly runtime: ActionEngineRuntimeService,
    private readonly delivery: CommunicationBulkDeliveryService,
  ) {}
  private async authority(proof: string, tx: Tx) {
    const channel = await this.channels.authenticate(proof, tx);
    if (channel.provider !== 'maya_user' || !channel.userId)
      throw new ForbiddenException('B35_CANONICAL_OWNER_SESSION_REQUIRED');
    const owner = await tx.membership.findFirst({
      where: {
        tenantId: channel.tenantId,
        userId: channel.userId,
        status: 'active',
        role: { in: ['tenant_owner', 'business_owner'] },
        user: { status: 'active' },
      },
    });
    const identities = await tx.authIdentity.count({
      where: { userId: channel.userId },
    });
    if (!owner || identities < 1)
      throw new ForbiddenException('B35_OWNER_AUTHORITY_REQUIRED');
    return {
      tenantId: this.context.assertTenantId(channel.tenantId),
      userId: channel.userId,
      proofHash: channel.channelControlProofHash,
    };
  }
  private hash(kind: string, value: unknown) {
    return this.policy.hash(kind, value);
  }
  private async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let i = 0; i < 5; i++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: 'Serializable',
          timeout: 60000,
        });
      } catch (e) {
        if (retryableBulkTransaction(e) && i < 4) continue;
        throw e;
      }
    }
    throw new ConflictException('B35_SERIALIZATION_EXHAUSTED');
  }
  async preview(proof: string, value: unknown) {
    const v = bulkObject(value, ['bulkIdentity', 'text', 'clientIds']);
    const identity = bulkCode(v.bulkIdentity),
      content = bulkContent(v.text);
    let selection: string[] | null = null;
    if (v.clientIds !== undefined) {
      if (!Array.isArray(v.clientIds) || v.clientIds.length > 500)
        throw new ConflictException('B35_AUDIENCE_LIMIT');
      selection = [...new Set(v.clientIds.map(bulkCode))].sort();
    }
    return this.transaction(async (tx) => {
      const owner = await this.authority(proof, tx);
      const key = this.hash('bulk-key', [owner.tenantId, identity]);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const source = {
        contract: 'maya.bulk-client-selection/1',
        source: selection === null ? 'all_clients' : 'explicit_clients',
        clientIds: selection,
      };
      const existing = await tx.marketingCampaign.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: owner.tenantId,
            idempotencyKey: key,
          },
        },
        include: { recipients: true, audience: true },
      });
      if (existing) {
        if (
          existing.lifecycleVersion !== 2 ||
          existing.createdByUserId !== owner.userId ||
          existing.messageSnapshotHash !== this.hash('content', content) ||
          bulkCanonical(existing.audience?.ruleJson) !== bulkCanonical(source)
        )
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return this.previewReceipt(existing);
      }
      const clients = await tx.client.findMany({
        where: {
          tenantId: owner.tenantId,
          mergedIntoClientId: null,
          ...(selection === null ? {} : { id: { in: selection } }),
        },
        orderBy: { id: 'asc' },
        take: 500,
      });
      if (selection && clients.length !== selection.length)
        throw new ForbiddenException('B35_AUDIENCE_CLIENT_CONTEXT_INVALID');
      const ids = clients.map((c) => c.id),
        audienceHash = this.hash('audience', [owner.tenantId, ids]);
      const now = new Date(),
        expiry = new Date(now.getTime() + 86400000);
      const audience = await tx.marketingAudience.create({
        data: {
          tenantId: owner.tenantId,
          createdByUserId: owner.userId,
          ruleJson: source,
          recipientUserIdsJson: [],
          candidateCount: ids.length,
          eligibleCount: ids.length,
          expiresAt: expiry,
          provider: 'canonical_client',
          snapshotContract: BULK_AUDIENCE,
          snapshotHash: audienceHash,
          status: 'ASSEMBLING',
        },
      });
      await tx.marketingAudienceRecipient.createMany({
        data: ids.map((clientId) => ({
          id: randomUUID(),
          tenantId: owner.tenantId,
          audienceId: audience.id,
          clientId,
          externalClientId: this.hash('client-ref', [owner.tenantId, clientId]),
          eligibilityStatus: 'CANDIDATE',
        })),
      });
      await tx.marketingAudience.update({
        where: { id: audience.id },
        data: { status: 'FROZEN' },
      });
      const root = await tx.marketingCampaign.create({
        data: {
          tenantId: owner.tenantId,
          createdByUserId: owner.userId,
          audienceId: audience.id,
          channel: null,
          provider: null,
          message: content.body,
          messageSnapshotHash: this.hash('content', content),
          recipientUserIdsJson: [],
          recipientCount: ids.length,
          idempotencyKey: key,
          expiresAt: expiry,
          lifecycleVersion: 2,
          scope: 'BULK',
          aggregateState: 'DRAFT',
          bulkIntentContract: BULK_INTENT,
          bulkIntentHash: this.hash('assembling', key),
          audienceSnapshotHash: audienceHash,
          payloadRetentionUntil: new Date(now.getTime() + 7 * 86400000),
          auditRetentionUntil: new Date(now.getTime() + 365 * 86400000),
        },
      });
      for (const client of clients) {
        const route = await this.policy.plan(tx, owner.tenantId, client.id);
        // Existing {name} semantics, using only the already verified Maya
        // delivery account. No raw CRM/phone matching; absence retains «друг».
        let firstName = 'друг';
        if (route.userId && content.body.includes('{name}')) {
          const account = await tx.user.findUnique({
            where: { id: route.userId },
          });
          if (account?.encryptedName) {
            try {
              firstName =
                this.encryption
                  .decrypt(account.encryptedName)
                  .trim()
                  .split(/\s+/)[0] || 'друг';
            } catch {
              firstName = 'друг';
            }
          }
        }
        const rendered = bulkContent(
          content.body.replaceAll('{name}', firstName),
        );
        const ref = this.hash('client-ref', [owner.tenantId, client.id]);
        await tx.marketingCampaignRecipient.create({
          data: {
            id: randomUUID(),
            tenantId: owner.tenantId,
            campaignId: root.id,
            clientId: client.id,
            externalClientId: ref,
            idempotencyKey: this.hash('logical-child', [
              owner.tenantId,
              key,
              client.id,
            ]),
            updatedAt: now,
            lifecycleVersion: 2,
            identityVersion: 1,
            recipientKind: 'canonical_client',
            recipientRefHash: ref,
            contentIdentityHash: this.hash('content', rendered),
            contentEncrypted: this.encryption.encrypt(bulkCanonical(rendered)),
            aggregateState: 'READY',
            routePlanJson: route,
            payloadRetentionUntil: root.payloadRetentionUntil,
            auditRetentionUntil: root.auditRetentionUntil,
          },
        });
      }
      const graph = await this.graph(tx, owner.tenantId, root.id);
      const sealed = await tx.marketingCampaign.update({
        where: { id: root.id },
        data: {
          bulkIntentHash: this.manifestHash(graph),
          revision: { increment: 1 },
        },
        include: { recipients: true },
      });
      return this.previewReceipt(sealed);
    });
  }
  private manifestHash(root: Graph) {
    const children = [...root.recipients]
      .sort((a, b) => a.clientId!.localeCompare(b.clientId!))
      .map((c) => {
        const content = JSON.parse(
          this.encryption.decrypt(c.contentEncrypted!),
        ) as unknown;
        if (this.hash('content', content) !== c.contentIdentityHash)
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return {
          clientId: c.clientId,
          idempotencyKey: c.idempotencyKey,
          contentHash: c.contentIdentityHash,
          route: c.routePlanJson,
        };
      });
    return this.hash('intent', {
      contract: BULK_INTENT,
      tenantId: root.tenantId,
      bulkIdentity: root.idempotencyKey,
      audienceId: root.audienceId,
      audienceHash: root.audienceSnapshotHash,
      content: bulkContent(root.message),
      expiresAt: root.expiresAt.toISOString(),
      children,
    });
  }
  private async graph(tx: Tx, tenantId: string, campaignId: string) {
    const root = await tx.marketingCampaign.findUnique({
      where: { id_tenantId: { id: campaignId, tenantId } },
      include: { recipients: true },
    });
    if (
      !root ||
      root.lifecycleVersion !== 2 ||
      root.bulkIntentContract !== BULK_INTENT
    )
      throw new NotFoundException('B35_CAMPAIGN_NOT_FOUND');
    return root;
  }
  private request(root: MarketingCampaign): TrustedActionExecutionRequestV1 {
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: root.tenantId,
      capability: BULK_ROOT_CAPABILITY,
      source: {
        type: 'authenticated_request',
        sourceRef: root.id,
        occurrenceScope: root.id,
        actorUserId: root.createdByUserId!,
      },
      targetRef: root.id,
      input: { campaignId: root.id, intentHash: root.bulkIntentHash },
      evidenceRefs: [`b35:intent:${root.bulkIntentHash}`],
      callerIdempotency: { scope: 'b35.bulk-root', key: root.idempotencyKey! },
    };
  }
  async confirm(proof: string, value: unknown) {
    const v = bulkObject(value, ['campaignId', 'intentHash']);
    const campaignId = bulkCode(v.campaignId),
      reviewed = bulkHash(v.intentHash);
    const root = await this.transaction(async (tx) => {
      const owner = await this.authority(proof, tx);
      await tx.$queryRaw`SELECT id FROM "MarketingCampaign" WHERE id=${campaignId} AND "tenantId"=${owner.tenantId} FOR UPDATE`;
      const graph = await this.graph(tx, owner.tenantId, campaignId);
      if (
        graph.createdByUserId !== owner.userId ||
        graph.bulkIntentHash !== reviewed ||
        this.manifestHash(graph) !== reviewed
      )
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      if (graph.confirmedAt) return graph;
      if (graph.expiresAt <= new Date())
        throw new ConflictException('B35_PREVIEW_EXPIRED');
      await tx.$queryRaw`SELECT id FROM "MarketingAudience" WHERE id=${graph.audienceId} AND "tenantId"=${owner.tenantId} FOR UPDATE`;
      const execution = await this.ingress.createExecution(
        this.request(graph),
        tx,
      );
      if (execution.state !== 'PENDING_APPROVAL')
        throw new ForbiddenException('B35_ADMISSION_DENIED');
      const approved = await this.engine.decideApproval(
        {
          tenantId: owner.tenantId,
          executionId: execution.id,
          approverUserId: owner.userId,
          decision: 'APPROVED',
        },
        tx,
      );
      if (approved.state !== 'READY' || !approved.approvalDecidedAt)
        throw new ForbiddenException('B35_APPROVAL_EXPIRED');
      const confirmed = await tx.marketingCampaign.update({
        where: { id: graph.id },
        data: {
          actionExecutionId: execution.id,
          confirmedAt: approved.approvalDecidedAt,
          confirmedByUserId: owner.userId,
          confirmationHash: this.hash('approval', [
            owner.tenantId,
            owner.userId,
            owner.proofHash,
            reviewed,
            approved.approvalDecidedAt.toISOString(),
          ]),
          aggregateState: 'READY',
          revision: { increment: 1 },
        },
        include: { recipients: true },
      });
      await this.runtime.completeBulkAdmissionInTransaction(approved, tx, {
        campaignId: graph.id,
        intentHash: reviewed,
      });
      return confirmed;
    });
    return this.continue(root);
  }
  async resume(proof: string, value: unknown) {
    const v = bulkObject(value, ['campaignId', 'intentHash']);
    const root = await this.transaction(async (tx) => {
      const owner = await this.authority(proof, tx),
        root = await this.graph(tx, owner.tenantId, bulkCode(v.campaignId));
      if (
        !root.confirmedAt ||
        root.createdByUserId !== owner.userId ||
        root.bulkIntentHash !== bulkHash(v.intentHash)
      )
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return root;
    });
    return this.continue(root);
  }
  async status(proof: string, value: unknown) {
    const v = bulkObject(value, ['campaignId']);
    return this.transaction(async (tx) => {
      const owner = await this.authority(proof, tx);
      return this.receipt(
        await this.graph(tx, owner.tenantId, bulkCode(v.campaignId)),
      );
    });
  }
  private async continue(root: Graph) {
    await this.delivery.resume(root);
    return this.receipt(await this.graph(this.prisma, root.tenantId, root.id));
  }
  private previewReceipt(root: Graph) {
    return {
      ...this.receipt(root),
      intentHash: root.bulkIntentHash,
      text: root.message,
      expiresAt: root.expiresAt.toISOString(),
      audienceMembershipImpliesConsent: false,
    };
  }
  private receipt(root: Graph) {
    return {
      campaignId: root.id,
      intentHash: root.bulkIntentHash,
      state: root.aggregateState,
      recipientCount: root.recipientCount,
      recipients: root.recipients.map((c) => ({
        recipientId: c.id,
        state: c.aggregateState,
        reason: c.terminalReasonCode,
      })),
    };
  }
}
