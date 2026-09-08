import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import type { ReminderDispatch } from '../communication-delivery/appointment-reminder.contract';
import { EncryptionService } from '../encryption/encryption.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  FEEDBACK_DELIVERY,
  feedbackHash,
  feedbackPlanHash,
  normalizeFeedbackPlan,
  type FeedbackPlan,
  type FeedbackSlot,
} from './native-feedback.contract';
import { NativeFeedbackPolicyService } from './native-feedback-policy.service';

type Tx = Prisma.TransactionClient;
/** Frozen parent plan -> existing A12/A13 slot admission. No delivery or provider. */
@Injectable()
export class NativeFeedbackStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly policy: NativeFeedbackPolicyService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}
  async read(
    tx: Tx,
    tenantId: string,
    requestId: string,
    revisionId: string | null,
  ) {
    this.context.assertTenantId(tenantId);
    const root = await tx.nativeFeedbackRequest.findUniqueOrThrow({
      where: { id_tenantId: { id: requestId, tenantId } },
    });
    const revision = revisionId
      ? await tx.nativeFeedbackRevision.findUniqueOrThrow({
          where: { id_tenantId: { id: revisionId, tenantId } },
        })
      : null;
    const row = revision ?? root,
      parentId = revision ? revision.executionId : root.requestExecutionId;
    if (
      !row.planEncrypted ||
      (revision &&
        (revision.requestId !== root.id ||
          revision.clientId !== root.clientId ||
          revision.kind !== 'response'))
    )
      throw new ForbiddenException(
        'Native feedback immutable delivery plan unavailable',
      );
    const plan = normalizeFeedbackPlan(
      JSON.parse(this.encryption.decrypt(row.planEncrypted)),
    );
    if (
      plan.tenantId !== tenantId ||
      plan.requestId !== requestId ||
      plan.revisionId !== revisionId ||
      plan.clientId !== root.clientId ||
      plan.appointmentId !== root.appointmentId ||
      plan.contentHash !== row.contentHash ||
      feedbackPlanHash(plan) !== row.planHash ||
      plan.version !== (revision?.version ?? 0)
    )
      throw new ForbiddenException('Native feedback parent/plan mismatch');
    const execution = await tx.actionExecution.findUniqueOrThrow({
      where: { id_tenantId: { id: parentId, tenantId } },
    });
    const receipt = execution.safeResultSummaryJson;
    if (
      execution.state !== 'SUCCEEDED' ||
      execution.policyDecision !== 'ALLOW' ||
      execution.dryRun ||
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt) ||
      receipt.intentHash !== row.intentHash ||
      receipt.requestId !== requestId ||
      (revision && receipt.revisionId !== revisionId)
    )
      throw new ForbiddenException(
        'Native feedback confirmed parent receipt required',
      );
    return { root, revision, plan, parent: execution };
  }
  private request(
    plan: FeedbackPlan,
    slot: FeedbackSlot,
    input: Record<string, unknown>,
  ): TrustedActionExecutionRequestV1 {
    const identity = feedbackHash('delivery-identity', {
      tenantId: plan.tenantId,
      requestId: plan.requestId,
      revisionId: plan.revisionId,
      slotKey: slot.slotKey,
    });
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: plan.tenantId,
      capability:
        FEEDBACK_DELIVERY[plan.phase === 'request' ? 'request' : 'response'],
      source: {
        type: 'scheduler',
        sourceRef: `native-feedback-slot:${identity}`,
        occurrenceScope: identity,
      },
      targetRef: `${slot.channel === 'inbox' ? 'user' : 'client'}:${slot.recipientRef}`,
      input,
      evidenceRefs: [
        `native-feedback-plan:${feedbackPlanHash(plan)}`,
        `native-feedback-slot:${slot.slotKey}`,
      ],
      intentExpiresAt: new Date(plan.expiresAt),
      callerIdempotency: {
        scope: 'communication:native-feedback:v1',
        key: identity,
      },
      nativeFeedbackSlot: {
        requestId: plan.requestId,
        revisionId: plan.revisionId,
        slotKey: slot.slotKey,
      },
    };
  }
  private input(
    plan: FeedbackPlan,
    slot: FeedbackSlot,
    address: string,
  ): Record<string, unknown> {
    const common = {
      channel: slot.channel,
      messageType:
        plan.phase === 'request'
          ? 'native_feedback_invitation'
          : 'native_feedback_response',
      sourceEventId: `native-feedback:${slot.slotKey}`,
      title: plan.title,
      bodyText: plan.bodyText,
      nativeFeedback: {
        requestId: plan.requestId,
        revisionId: plan.revisionId,
        slotKey: slot.slotKey,
        planHash: feedbackPlanHash(plan),
      },
    };
    if (slot.channel === 'web_push')
      return {
        ...common,
        clientId: plan.clientId,
        endpointIds: [slot.endpointId],
        expiresAt: plan.expiresAt,
      };
    if (slot.channel === 'telegram')
      return {
        ...common,
        telegramChatId: address,
        recipientIdentityRef: slot.link!.providerSubjectHash,
        buttons: [
          {
            text: 'Открыть личный кабинет',
            url: 'https://malesthetic.pro/app/?native_feedback=client',
          },
        ],
      };
    return {
      ...common,
      userId: slot.userId,
      recipientIdentityRef: slot.slotKey,
      deepLink: `/app/?native_feedback=management&feedback=${plan.requestId}`,
      payload: {
        nativeFeedbackRequestId: plan.requestId,
        nativeFeedbackRevisionId: plan.revisionId,
      },
    };
  }
  private async sequence(tx: Tx, plan: FeedbackPlan, slot: FeedbackSlot) {
    if (plan.phase !== 'request') return;
    const previous = plan.slots
      .slice(
        0,
        plan.slots.findIndex((s) => s.slotKey === slot.slotKey),
      )
      .map((s) => s.slotKey);
    if (!previous.length) return;
    const succeeded = await tx.actionExecution.count({
      where: {
        tenantId: plan.tenantId,
        nativeFeedbackRequestId: plan.requestId,
        nativeFeedbackRevisionId: null,
        nativeFeedbackSlotKey: { in: previous },
        state: 'SUCCEEDED',
        policyDecision: 'ALLOW',
        dryRun: false,
      },
    });
    if (succeeded !== previous.length)
      throw new ForbiddenException(
        'Previous feedback delivery slot unresolved or failed',
      );
  }
  async dispatch(
    tenantId: string,
    requestId: string,
    revisionId: string | null,
    slotKey: string,
  ): Promise<ReminderDispatch> {
    const authorize = () =>
      canonicalUtcTransaction(this.prisma, async (tx) => {
        const loaded = await this.read(tx, tenantId, requestId, revisionId),
          slot = loaded.plan.slots.find((s) => s.slotKey === slotKey);
        if (
          !slot ||
          loaded.root.retentionUntil <= this.clock() ||
          (revisionId
            ? loaded.root.state === 'WITHDRAWN'
            : loaded.root.state !== 'OPEN')
        )
          throw new ForbiddenException(
            'Native feedback slot no longer eligible',
          );
        const admitted = await tx.actionExecution.findFirst({
          where: {
            tenantId,
            nativeFeedbackRequestId: requestId,
            nativeFeedbackRevisionId: revisionId,
            nativeFeedbackSlotKey: slotKey,
          },
        });
        if (!admitted)
          throw new ForbiddenException(
            'Native feedback delivery before slot admission',
          );
        await this.sequence(tx, loaded.plan, slot);
        await this.policy.authorize(tx, loaded.plan, slot);
      });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const request = await canonicalUtcTransaction(
          this.prisma,
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r08/slot/${tenantId}/${requestId}/${slotKey}`},0))::text`,
            );
            const loaded = await this.read(tx, tenantId, requestId, revisionId),
              { plan } = loaded;
            const slot = plan.slots.find((s) => s.slotKey === slotKey);
            if (!slot)
              throw new ForbiddenException(
                'Unknown native feedback delivery slot',
              );
            const existing = await tx.actionExecution.findFirst({
              where: {
                tenantId,
                nativeFeedbackRequestId: requestId,
                nativeFeedbackSlotKey: slotKey,
              },
            });
            if (existing) {
              const input = await this.kernel.readTrustedNormalizedInput(
                tenantId,
                existing.id,
                tx,
              );
              const request = this.request(plan, slot, input),
                preview = this.kernel.previewExecution(request);
              if (
                existing.nativeFeedbackRevisionId !== revisionId ||
                existing.capability !== request.capability ||
                existing.normalizedInputHash !== preview.normalizedInputHash ||
                existing.identityFingerprint !== preview.identityFingerprint
              )
                throw new ForbiddenException(
                  'Native feedback linked execution mismatch',
                );
              const meta = input.nativeFeedback as
                Record<string, unknown> | undefined;
              if (
                meta?.planHash !== feedbackPlanHash(plan) ||
                input.channel !== slot.channel ||
                input.title !== plan.title ||
                input.bodyText !== plan.bodyText ||
                (slot.channel === 'inbox' && input.userId !== slot.userId) ||
                (slot.channel === 'web_push' &&
                  JSON.stringify(input.endpointIds) !==
                    JSON.stringify([slot.endpointId])) ||
                (slot.channel === 'telegram' &&
                  input.recipientIdentityRef !== slot.link!.providerSubjectHash)
              )
                throw new ForbiddenException(
                  'Native feedback immutable recipient/content mismatch',
                );
              return request;
            }
            if (
              loaded.root.retentionUntil <= this.clock() ||
              (revisionId
                ? loaded.root.state === 'WITHDRAWN'
                : loaded.root.state !== 'OPEN')
            )
              throw new ForbiddenException(
                'Native feedback payload unavailable for delivery',
              );
            await this.sequence(tx, plan, slot);
            const authority = await this.policy.authorize(tx, plan, slot);
            const request = this.request(
              plan,
              slot,
              this.input(plan, slot, authority.address),
            );
            if (
              (await this.ingress.preview(request)).policyDecision !== 'ALLOW'
            )
              throw new ForbiddenException(
                'Native feedback delivery policy denied',
              );
            await this.ingress.createExecution(request, tx);
            return request;
          },
        );
        return { request, authorize };
      } catch (error) {
        if (isPostgresSerializationConflict(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new ForbiddenException('Native feedback admission contention');
  }
}
