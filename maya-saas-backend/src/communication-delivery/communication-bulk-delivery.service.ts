import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type MarketingCampaign,
  type MarketingCampaignRecipient,
  type CommunicationCampaignState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import {
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ClientWebPushService } from '../crm/client-web-push.service';
import { prepareInboxApnsCanonical } from '../inbox/apns-push';
import { CommunicationBulkPolicyService } from './communication-bulk-policy.service';
import { CommunicationWebPushTransport } from './communication-web-push.transport';
import {
  CommunicationDeliveryKernel,
  projectCommunicationAggregate,
} from './communication-delivery.kernel';
import {
  COMMUNICATION_ENVELOPE_CONTRACT,
  type CommunicationDeliveryClaimV1,
  type CommunicationRecipientV1,
} from './communication-delivery.contract';
import {
  BULK_SLOT_CAPABILITY,
  BULK_TERMINAL,
  bulkContent,
  bulkSlots,
  retryableBulkTransaction,
  type BulkRoute,
} from '../marketing/canonical-bulk.contract';

type Child = MarketingCampaignRecipient;
type Slot = ReturnType<typeof bulkSlots>[number];
const TRANSPORTS: Record<string, string> = {
  inbox: 'communication.production.inbox.package2-single',
  telegram: 'communication.production.telegram.package2-single',
  apns: 'communication.production.apns.package2-single',
  web_push: 'communication.production.web-push.client-single',
};
/** Only Communication Delivery performs transport effects. AE success is admission. */
@Injectable()
export class CommunicationBulkDeliveryService {
  readonly kernel: CommunicationDeliveryKernel;
  private readonly worker = `b35:${randomUUID()}`;
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly runtime: ActionEngineRuntimeService,
    private readonly policy: CommunicationBulkPolicyService,
    private readonly encryption: EncryptionService,
    private readonly endpoints: ClientWebPushService,
    private readonly webPush: CommunicationWebPushTransport,
    private readonly config: ConfigService,
  ) {
    this.kernel = new CommunicationDeliveryKernel(prisma, {
      identitySecret:
        config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
      payloadEncryptionSecret:
        config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
    });
  }
  async resume(root: MarketingCampaign) {
    if (
      !root.confirmedAt ||
      !root.actionExecutionId ||
      !(await this.prisma.actionExecution.findFirst({
        where: {
          id: root.actionExecutionId,
          tenantId: root.tenantId,
          state: 'SUCCEEDED',
          capability: 'communication.bulk-campaign.admit.v2',
        },
      }))
    )
      throw new ConflictException('B35_ROOT_ADMISSION_REQUIRED');
    const deadline = Date.now() + 25000;
    const children = await this.prisma.marketingCampaignRecipient.findMany({
      where: {
        tenantId: root.tenantId,
        campaignId: root.id,
        lifecycleVersion: 2,
        terminalAt: null,
      },
      orderBy: { id: 'asc' },
    });
    // A slow unresolved row must not consume every retry's bounded work window
    // before independent, still-unstarted Clients can be claimed.
    children.sort(
      (a, b) =>
        Number(a.aggregateState === 'UNRESOLVED') -
        Number(b.aggregateState === 'UNRESOLVED'),
    );
    for (const child of children) {
      if (Date.now() > deadline) break;
      const lease = this.policy.hash('logical-lease', randomUUID());
      const claimed = await this.prisma.marketingCampaignRecipient.updateMany({
        where: {
          id: child.id,
          tenantId: root.tenantId,
          terminalAt: null,
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lt: new Date() } },
          ],
        },
        data: {
          leaseOwner: this.worker,
          leaseTokenHash: lease,
          leaseExpiresAt: new Date(Date.now() + 90000),
          aggregateState: 'RUNNING',
          revision: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (!claimed.count) continue;
      try {
        await this.client(root, child, deadline);
      } finally {
        await this.projectClient(root, child, lease);
      }
    }
    await this.projectRoot(root);
  }
  private async client(
    root: MarketingCampaign,
    child: Child,
    deadline: number,
  ) {
    const route = child.routePlanJson as unknown as BulkRoute;
    for (const slot of bulkSlots(route)) {
      if (Date.now() > deadline) break;
      let dependency: 'ALLOW' | 'WAIT' | 'DENY' = 'ALLOW';
      if (slot.key !== 'primary') {
        const primary = await this.prisma.marketingCampaign.findFirst({
          where: {
            tenantId: root.tenantId,
            parentRecipientId: child.id,
            bulkSlotKey: 'primary',
          },
          include: { recipients: true },
        });
        dependency =
          !primary ||
          primary.recipients.some(
            (r) =>
              r.deliveryState === 'NOT_SENT' || r.deliveryState === 'UNKNOWN',
          )
            ? 'WAIT'
            : primary.recipients.some(
                  (r) =>
                    r.deliveryState === 'ACCEPTED' ||
                    r.deliveryState === 'DELIVERED',
                )
              ? 'ALLOW'
              : 'DENY';
      }
      const envelope = await this.admitSlot(
        root,
        child,
        route,
        slot,
        dependency === 'DENY',
      );
      if (dependency === 'WAIT') continue;
      if (dependency === 'DENY') {
        await this.kernel.skipBulkUnstarted(
          root.tenantId,
          envelope.id,
          'PRIMARY_NOT_ACCEPTED',
        );
        continue;
      }
      await this.deliverSlot(root, child, route, envelope, deadline);
    }
  }
  private async admissionTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let i = 0; i < 8; i++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: 'Serializable',
          timeout: 60000,
        });
      } catch (error) {
        if (retryableBulkTransaction(error) && i < 7) continue;
        throw error;
      }
    }
    throw new ConflictException('B35_SLOT_SERIALIZATION_EXHAUSTED');
  }
  private request(
    root: MarketingCampaign,
    child: Child,
    slot: Slot,
  ): TrustedActionExecutionRequestV1 {
    const key = this.policy.hash('slot-key', [
      root.tenantId,
      root.id,
      child.id,
      slot.key,
    ]);
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: root.tenantId,
      capability: BULK_SLOT_CAPABILITY,
      source: {
        type: 'authenticated_request',
        sourceRef: root.id,
        occurrenceScope: key,
        actorUserId: root.confirmedByUserId!,
      },
      targetRef: child.id,
      input: {
        campaignId: root.id,
        recipientId: child.id,
        slotKey: slot.key,
        intentHash: root.bulkIntentHash,
        contentHash: child.contentIdentityHash,
      },
      evidenceRefs: [
        `b35:slot:${slot.key}`,
        `b35:intent:${root.bulkIntentHash}`,
      ],
      callerIdempotency: { scope: 'b35.bulk-slot', key },
    };
  }
  private leaves(route: BulkRoute, slot: Slot) {
    if (slot.channel === 'web_push')
      return route.webPushEndpoints.map((ep) => ({
        recipientRef: ep.id,
        recipientKind: 'client_web_push_endpoint',
        evidenceRef: `b35:endpoint:${ep.id}`,
      }));
    if (slot.channel === 'apns')
      return [
        {
          recipientRef: slot.key.slice(5),
          recipientKind: 'device_token',
          internalUserId: route.userId!,
          evidenceRef: `b35:device:${slot.key.slice(5)}`,
        },
      ];
    return [
      {
        recipientRef: route.link!.id,
        recipientKind:
          slot.channel === 'inbox' ? 'internal_user' : 'telegram_chat',
        ...(slot.channel === 'inbox' ? { internalUserId: route.userId! } : {}),
        evidenceRef: `b35:link:${route.link!.id}`,
      },
    ];
  }
  private async admitSlot(
    root: MarketingCampaign,
    child: Child,
    route: BulkRoute,
    slot: Slot,
    suppress: boolean,
  ) {
    const request = this.request(root, child, slot);
    let envelope = await this.prisma.marketingCampaign.findFirst({
      where: {
        tenantId: root.tenantId,
        parentRecipientId: child.id,
        bulkSlotKey: slot.key,
      },
    });
    if (!envelope) {
      envelope = await this.admissionTransaction(async (tx) => {
        const execution = await this.ingress.createExecution(request, tx);
        if (execution.state !== 'READY')
          throw new ConflictException('B35_SLOT_ADMISSION_DENIED');
        const recipients: CommunicationRecipientV1[] = [];
        for (const leaf of this.leaves(route, slot)) {
          const decision = await this.policy.current(
            tx,
            child,
            route,
            leaf.evidenceRef,
          );
          recipients.push({
            recipientRef: leaf.recipientRef,
            recipientKind: leaf.recipientKind,
            ...('internalUserId' in leaf
              ? { internalUserId: leaf.internalUserId }
              : {}),
            eligibility: {
              basis: 'canonical_client_marketing_policy',
              decision: !suppress && decision.allowed ? 'ALLOW' : 'SKIP',
              policyVersion: 1,
              evidenceRef: leaf.evidenceRef,
              evidenceHash: this.policy.hash('eligibility', decision.proof),
              checkedAt: new Date(),
              reasonCode: suppress ? 'PRIMARY_NOT_ACCEPTED' : decision.reason,
            },
          });
        }
        const admitted = await this.kernel.createEnvelope(
          {
            contract: COMMUNICATION_ENVELOPE_CONTRACT,
            tenantId: root.tenantId,
            actionExecutionId: execution.id,
            scope: 'SINGLE',
            channel: slot.channel,
            capabilityKey: TRANSPORTS[slot.channel],
            campaignIdempotencyKey: request.callerIdempotency!.key,
            contentRef: child.id,
            contentIdentityHash: child.contentIdentityHash!,
            expiresAt: root.expiresAt,
            recipients,
            ...(slot.channel === 'web_push'
              ? { clientId: child.clientId! }
              : {}),
            bulkSlot: { parentRecipientId: child.id, key: slot.key },
          },
          tx,
        );
        await this.runtime.completeBulkAdmissionInTransaction(execution, tx, {
          campaignId: admitted.id,
          recipientId: child.id,
          slotKey: slot.key,
        });
        return admitted;
      });
    }
    return envelope;
  }
  private owned(
    claim: CommunicationDeliveryClaimV1,
    revision = claim.recipient.revision,
  ) {
    return {
      tenantId: claim.campaign.tenantId,
      campaignId: claim.campaign.id,
      recipientId: claim.recipient.id,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
      recipientRevision: revision,
    };
  }
  private async deliverSlot(
    root: MarketingCampaign,
    child: Child,
    route: BulkRoute,
    envelope: MarketingCampaign,
    deadline: number,
  ) {
    const rows = await this.prisma.marketingCampaignRecipient.findMany({
      where: { tenantId: root.tenantId, campaignId: envelope.id },
    });
    for (let row of rows) {
      if (row.leaseExpiresAt && row.leaseExpiresAt < new Date()) {
        await this.kernel.recoverExpiredClaim({
          tenantId: root.tenantId,
          campaignId: envelope.id,
          recipientId: row.id,
        });
        row = await this.prisma.marketingCampaignRecipient.findUniqueOrThrow({
          where: { id: row.id },
        });
      }
      if (
        row.deliveryState === 'UNKNOWN' &&
        row.reconciliationState === 'REQUIRED' &&
        envelope.channel === 'inbox'
      )
        await this.reconcileInbox(root, child, route, envelope, row);
    }
    // Manual UNKNOWN leaves have no send work. Reconciliation above is separate.
    if (!rows.some((row) => row.deliveryState === 'NOT_SENT')) return;
    if (root.expiresAt <= new Date()) {
      await this.kernel.skipBulkUnstarted(
        root.tenantId,
        envelope.id,
        'CAMPAIGN_EXPIRED',
      );
      return;
    }
    while (Date.now() < deadline) {
      const admission = await this.prisma.$transaction(
        async (tx) => {
          const current = await this.policy.current(tx, child, route);
          if (!current.allowed) return { denied: current.reason, claim: null };
          // Policy locks the canonical Client before the first attempt is reserved.
          const claim = await this.kernel.claimNext(
            {
              tenantId: root.tenantId,
              campaignId: envelope.id,
              workerId: this.worker,
            },
            tx,
          );
          return { denied: null, claim };
        },
        { timeout: 30000 },
      );
      if (admission.denied) {
        await this.kernel.skipBulkUnstarted(
          root.tenantId,
          envelope.id,
          admission.denied,
        );
        break;
      }
      const claim = admission.claim;
      if (!claim) break;
      let prepared: Awaited<ReturnType<typeof this.prepare>>;
      try {
        prepared = await this.prepare(
          root,
          child,
          route,
          envelope,
          claim.recipient,
        );
      } catch {
        await this.kernel.finalizePreDispatchFailure({
          ...this.owned(claim),
          outcomeCode: 'B35_TRANSPORT_UNAVAILABLE',
          errorCode: 'B35_TRANSPORT_UNAVAILABLE',
        });
        continue;
      }
      const boundary = await this.kernel.markBulkDispatchBoundary(
        this.owned(claim),
        (tx) =>
          this.policy.current(
            tx,
            child,
            route,
            claim.recipient.eligibilityEvidenceRef!,
          ),
      );
      if (!boundary.allowed) continue;
      const owned = this.owned(claim, boundary.recipient.revision);
      let result: {
        state: 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'UNKNOWN';
        reference?: string;
        code: string;
      };
      try {
        result = await prepared();
      } catch {
        result = { state: 'UNKNOWN', code: 'B35_PROVIDER_OUTCOME_UNKNOWN' };
      }
      if (result.state === 'DELIVERED')
        await this.kernel.finalizeDelivered({
          ...owned,
          outcomeCode: result.code,
          providerReference: result.reference,
        });
      else if (result.state === 'ACCEPTED')
        await this.kernel.finalizeAccepted({
          ...owned,
          outcomeCode: result.code,
          providerReference: result.reference,
        });
      else if (result.state === 'FAILED') {
        await this.kernel.finalizeDeterministicReject({
          ...owned,
          outcomeCode: result.code,
          errorCode: result.code,
        });
        if (result.code === 'web_push_endpoint_invalid')
          await this.endpoints.invalidateAfterDelivery(
            root.tenantId,
            child.clientId!,
            claim.recipient.eligibilityEvidenceRef!.slice(
              'b35:endpoint:'.length,
            ),
            claim.attempt.id,
          );
      } else
        await this.kernel.finalizeUnknown({
          ...owned,
          outcomeCode: result.code,
          errorCode: result.code,
        });
    }
  }
  /** Resolve only the pinned route; never call another channel after a failure. */
  private async prepare(
    root: MarketingCampaign,
    child: Child,
    route: BulkRoute,
    envelope: MarketingCampaign,
    leaf: Child,
  ) {
    const decoded = JSON.parse(
      this.encryption.decrypt(child.contentEncrypted!),
    ) as { body: string };
    const content = bulkContent(decoded.body);
    if (this.policy.hash('content', content) !== child.contentIdentityHash)
      throw new ConflictException('IDEMPOTENCY_CONFLICT');
    type Result = {
      state: 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'UNKNOWN';
      reference?: string;
      code: string;
    };
    const sourceEventId = `b35:${child.id}`;
    if (envelope.channel === 'inbox')
      return async (): Promise<Result> => {
        const item = await this.prisma.inboxItem.upsert({
          where: {
            tenantId_userId_type_sourceEventId: {
              tenantId: root.tenantId,
              userId: route.userId!,
              type: 'marketing_broadcast',
              sourceEventId,
            },
          },
          create: {
            tenantId: root.tenantId,
            userId: route.userId!,
            type: 'marketing_broadcast',
            sourceEventId,
            title: content.title,
            bodyText: content.body,
            deepLink: 'maya://inbox',
          },
          update: {},
        });
        return {
          state: 'DELIVERED',
          reference: item.id,
          code: 'B35_INBOX_DELIVERED',
        };
      };
    if (envelope.channel === 'telegram') {
      const link = await this.prisma.clientChannelLink.findFirstOrThrow({
        where: {
          id: route.link!.id,
          tenantId: root.tenantId,
          clientId: child.clientId!,
        },
      });
      const address = this.encryption.decrypt(link.deliveryAddressEncrypted!);
      const token = this.config.getOrThrow<string>('MAYA_INBOX_BRIDGE_TOKEN');
      const url =
        this.config.get<string>('MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL') ??
        'http://127.0.0.1:8080/api/internal/action-engine/package2-telegram';
      return async (): Promise<Result> => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-maya-inbox-bridge': token,
          },
          body: JSON.stringify({
            contract: 'maya.bulk-telegram-transport/1',
            telegram_chat_id: address,
            message_type: 'marketing_broadcast',
            source_event_id: sourceEventId,
            title: content.title,
            body_text: content.body,
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (response.status >= 400 && response.status < 500)
          return { state: 'FAILED', code: 'B35_TELEGRAM_REJECTED' };
        if (!response.ok)
          return { state: 'UNKNOWN', code: 'B35_TELEGRAM_UNKNOWN' };
        const body = (await response.json()) as {
          message_id?: string | number;
        };
        return body.message_id
          ? {
              state: 'ACCEPTED',
              code: 'B35_TELEGRAM_ACCEPTED',
              reference: String(body.message_id),
            }
          : { state: 'UNKNOWN', code: 'B35_PROVIDER_REFERENCE_MISSING' };
      };
    }
    if (envelope.channel === 'web_push') {
      const id = leaf.eligibilityEvidenceRef!.slice('b35:endpoint:'.length);
      const subscription = await this.endpoints.resolveForDelivery(
        root.tenantId,
        child.clientId!,
        id,
      );
      if (
        !subscription ||
        !this.webPush.ready() ||
        !this.webPush.accepts(subscription)
      )
        throw new ConflictException('B35_ENDPOINT_UNAVAILABLE');
      return async (): Promise<Result> => {
        const result = await this.webPush.send(
          subscription,
          JSON.stringify({
            title: content.title,
            body: content.deviceBody,
            type: 'marketing_broadcast',
            url: '/app/',
            tag: sourceEventId,
          }),
          root.expiresAt,
        );
        return result === 'SUCCEEDED'
          ? { state: 'ACCEPTED', code: 'B35_WEB_PUSH_ACCEPTED' }
          : result === 'UNKNOWN'
            ? { state: 'UNKNOWN', code: 'B35_WEB_PUSH_UNKNOWN' }
            : {
                state: 'FAILED',
                code:
                  result === 'PERMANENT_ENDPOINT_INVALID'
                    ? 'web_push_endpoint_invalid'
                    : 'B35_WEB_PUSH_REJECTED',
              };
      };
    }
    if (envelope.channel === 'apns') {
      const id = envelope.bulkSlotKey!.slice(5),
        pinned = route.apnsDevices.find((d) => d.id === id);
      const device = await this.prisma.devicePushToken.findFirstOrThrow({
        where: { id, tenantId: root.tenantId, userId: route.userId! },
      });
      if (
        !pinned ||
        this.policy.hash('apns-token', [
          root.tenantId,
          child.clientId,
          id,
          device.token,
        ]) !== pinned.tokenHash
      )
        throw new ConflictException('B35_DEVICE_CHANGED');
      const sender = prepareInboxApnsCanonical();
      return async (): Promise<Result> => {
        const result = await sender.send({
          deviceToken: device.token,
          title: content.title,
          body: content.deviceBody,
          deepLink: 'maya://inbox',
          type: 'marketing_broadcast',
        });
        return result.outcome === 'accepted'
          ? {
              state: 'ACCEPTED',
              reference: result.providerReference,
              code: 'B35_APNS_ACCEPTED',
            }
          : result.outcome === 'rejected'
            ? { state: 'FAILED', code: 'B35_APNS_REJECTED' }
            : { state: 'UNKNOWN', code: 'B35_APNS_UNKNOWN' };
      };
    }
    throw new ConflictException('B35_UNPLANNED_CHANNEL');
  }
  private async reconcileInbox(
    root: MarketingCampaign,
    child: Child,
    route: BulkRoute,
    envelope: MarketingCampaign,
    leaf: Child,
  ) {
    const claim = await this.kernel.claimReconciliation({
      tenantId: root.tenantId,
      campaignId: envelope.id,
      recipientId: leaf.id,
      workerId: this.worker,
    });
    const item = await this.prisma.inboxItem.findUnique({
      where: {
        tenantId_userId_type_sourceEventId: {
          tenantId: root.tenantId,
          userId: route.userId!,
          type: 'marketing_broadcast',
          sourceEventId: `b35:${child.id}`,
        },
      },
    });
    // An absent row cannot prove a delayed worker never committed it.
    await this.kernel.finalizeReconciliation({
      ...this.owned(claim),
      outcome: item ? 'PROVEN_DELIVERED' : 'STILL_UNKNOWN',
      ...(item ? { providerReference: item.id } : {}),
      outcomeCode: item ? 'B35_INBOX_RECONCILED' : 'B35_INBOX_UNRESOLVED',
    });
  }
  private async projectClient(
    root: MarketingCampaign,
    child: Child,
    lease: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketingCampaignRecipient.findUniqueOrThrow({
        where: { id: child.id },
      });
      if (current.leaseTokenHash !== lease) return;
      const envelopes = await tx.marketingCampaign.findMany({
        where: { tenantId: root.tenantId, parentRecipientId: child.id },
        include: { recipients: true },
      });
      const leaves = envelopes.flatMap((e) => e.recipients),
        expected = bulkSlots(child.routePlanJson as unknown as BulkRoute);
      const missing = expected.some(
        (s) => !envelopes.some((e) => e.bulkSlotKey === s.key),
      );
      const projected = projectCommunicationAggregate(leaves);
      const state = leaves.some((r) => r.deliveryState === 'UNKNOWN')
        ? 'UNRESOLVED'
        : missing
          ? 'RUNNING'
          : leaves.length
            ? projected.state
            : 'SKIPPED';
      await tx.marketingCampaignRecipient.updateMany({
        where: {
          id: child.id,
          leaseTokenHash: lease,
          revision: current.revision,
        },
        data: {
          aggregateState: state,
          terminalAt: BULK_TERMINAL.has(state) ? new Date() : null,
          terminalReasonCode:
            state === 'SKIPPED'
              ? (leaves[0]?.terminalReasonCode ?? 'NO_ELIGIBLE_ENDPOINT')
              : null,
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    });
  }
  private async projectRoot(root: MarketingCampaign) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "MarketingCampaign" WHERE id=${root.id} AND "tenantId"=${root.tenantId} FOR UPDATE`;
      const children = await tx.marketingCampaignRecipient.findMany({
        where: { tenantId: root.tenantId, campaignId: root.id },
      });
      const states = children.map((c) => c.aggregateState!);
      let state: CommunicationCampaignState;
      if (states.includes('UNRESOLVED')) state = 'UNRESOLVED';
      else if (states.some((s) => !BULK_TERMINAL.has(s))) state = 'RUNNING';
      else if (!states.length) state = 'SKIPPED';
      else if (states.every((s) => s === states[0])) state = states[0];
      else if (
        states.every((s) => ['SKIPPED', 'CANCELLED', 'EXPIRED'].includes(s))
      )
        state = 'SKIPPED';
      else state = 'PARTIAL';
      await tx.marketingCampaign.update({
        where: { id: root.id },
        data: {
          aggregateState: state,
          status: state,
          acceptedCount: states.filter((s) => s === 'COMPLETED').length,
          failedCount: states.filter((s) => s === 'FAILED').length,
          skippedCount: states.filter((s) => s === 'SKIPPED').length,
          unknownCount: states.filter((s) => s === 'UNRESOLVED').length,
          completedAt: BULK_TERMINAL.has(state) ? new Date() : null,
          revision: { increment: 1 },
        },
      });
    });
  }
}
