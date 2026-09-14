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
  TEAM_CONTRACT,
  TEAM_DELIVERY,
  TEAM_ROLES,
  normalizeTeamPlan,
  teamHash,
  type TeamPlan,
  type TeamSlot,
} from './team-communications.contract';

/** Frozen TeamMessage plan materializes one existing A12 slot per User. */
@Injectable()
export class TeamMessageStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}
  async read(
    tx: Prisma.TransactionClient,
    tenantId: string,
    messageId: string,
  ) {
    this.context.assertTenantId(tenantId);
    const row = await tx.teamMessage.findUniqueOrThrow({
      where: { id_tenantId: { id: messageId, tenantId } },
    });
    if (!row.planEncrypted)
      throw new ForbiddenException('Retained immutable team plan required');
    const plan = normalizeTeamPlan(
        JSON.parse(this.encryption.decrypt(row.planEncrypted)),
      ),
      parent = await tx.actionExecution.findUniqueOrThrow({
        where: { id: row.sendExecutionId },
      }),
      receipt = parent.safeResultSummaryJson;
    if (
      plan.tenantId !== tenantId ||
      plan.messageId !== row.id ||
      plan.senderUserId !== row.senderUserId ||
      plan.payloadHash !== row.payloadHash ||
      teamHash('plan', plan) !== row.planHash ||
      parent.state !== 'SUCCEEDED' ||
      parent.dryRun ||
      parent.policyDecision !== 'ALLOW' ||
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt) ||
      receipt.messageId !== row.id ||
      receipt.intentHash !== row.intentHash
    )
      throw new ForbiddenException(
        'Confirmed team owner/plan receipt required',
      );
    return { row, plan, parent };
  }
  private async eligible(
    tx: Prisma.TransactionClient,
    plan: TeamPlan,
    slot: TeamSlot,
  ) {
    const m = await tx.membership.findUnique({
      where: {
        userId_tenantId: { tenantId: plan.tenantId, userId: slot.userId },
      },
      include: {
        user: { select: { status: true } },
        tenant: { select: { status: true } },
      },
    });
    if (
      !m ||
      m.id !== slot.membershipId ||
      m.role !== slot.role ||
      m.branchId !== slot.branchId ||
      m.status !== 'active' ||
      m.user.status !== 'active' ||
      m.tenant.status !== 'active' ||
      !TEAM_ROLES.includes(m.role) ||
      slot.eligibilityHash !==
        teamHash('eligibility', {
          membershipId: m.id,
          role: m.role,
          branchId: m.branchId,
          status: m.status,
          channel: 'inbox',
        })
    )
      throw new ForbiddenException('Frozen team recipient no longer eligible');
  }
  private request(
    plan: TeamPlan,
    slot: TeamSlot,
    input: Record<string, unknown>,
  ): TrustedActionExecutionRequestV1 {
    const identity = teamHash('delivery-identity', {
      tenantId: plan.tenantId,
      messageId: plan.messageId,
      slotKey: slot.slotKey,
    });
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: plan.tenantId,
      capability: TEAM_DELIVERY,
      source: {
        type: 'scheduler',
        sourceRef: `team-slot:${identity}`,
        occurrenceScope: identity,
      },
      targetRef: `user:${slot.userId}`,
      input,
      evidenceRefs: [
        `team-plan:${teamHash('plan', plan)}`,
        `team-slot:${slot.slotKey}`,
      ],
      intentExpiresAt: new Date(plan.expiresAt),
      callerIdempotency: { scope: 'communication:team:v1', key: identity },
      teamMessageSlot: { messageId: plan.messageId, slotKey: slot.slotKey },
    };
  }
  private input(plan: TeamPlan, slot: TeamSlot) {
    return {
      channel: 'inbox',
      messageType: 'team_message',
      sourceEventId: `team-message:${slot.slotKey}`,
      userId: slot.userId,
      title: 'Новое сообщение команды',
      bodyText: 'Откройте командный чат MAYA.',
      deepLink: '/app/?team=main',
      payload: { contract: TEAM_CONTRACT, messageId: plan.messageId },
      recipientIdentityRef: slot.slotKey,
      teamMessage: {
        messageId: plan.messageId,
        slotKey: slot.slotKey,
        planHash: teamHash('plan', plan),
      },
    };
  }
  async dispatch(
    tenantId: string,
    messageId: string,
    slotKey: string,
  ): Promise<ReminderDispatch> {
    const authorize = () =>
      canonicalUtcTransaction(this.prisma, async (tx) => {
        const { row, plan } = await this.read(tx, tenantId, messageId),
          slot = plan.slots.find((s) => s.slotKey === slotKey);
        if (!slot || row.status !== 'SENT' || row.expiresAt <= this.clock())
          throw new ForbiddenException('Team notification unavailable');
        const admitted = await tx.actionExecution.findFirst({
          where: {
            tenantId,
            teamMessageId: messageId,
            teamMessageSlotKey: slotKey,
            capability: TEAM_DELIVERY,
          },
        });
        if (!admitted)
          throw new ForbiddenException('Team delivery before admission');
        await this.eligible(tx, plan, slot);
      });
    for (let attempt = 0; attempt < 5; attempt++)
      try {
        const request = await canonicalUtcTransaction(
          this.prisma,
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r12/slot/${tenantId}/${messageId}/${slotKey}`},0))::text`,
            );
            const { row, plan } = await this.read(tx, tenantId, messageId),
              slot = plan.slots.find((s) => s.slotKey === slotKey);
            if (!slot)
              throw new ForbiddenException('Unknown immutable team slot');
            const expected = this.input(plan, slot),
              request = this.request(plan, slot, expected),
              preview = this.kernel.previewExecution(request);
            const existing = await tx.actionExecution.findFirst({
              where: {
                tenantId,
                teamMessageId: messageId,
                teamMessageSlotKey: slotKey,
              },
            });
            if (existing) {
              if (
                existing.capability !== TEAM_DELIVERY ||
                existing.normalizedInputHash !== preview.normalizedInputHash ||
                existing.identityFingerprint !== preview.identityFingerprint
              )
                throw new ForbiddenException('Linked team delivery mismatch');
              return request;
            }
            if (row.status !== 'SENT' || row.expiresAt <= this.clock())
              throw new ForbiddenException(
                'Team notification no longer available',
              );
            await this.eligible(tx, plan, slot);
            if (
              (await this.ingress.preview(request)).policyDecision !== 'ALLOW'
            )
              throw new ForbiddenException('Team notification policy denied');
            await this.ingress.createExecution(request, tx);
            return request;
          },
        );
        return { request, authorize };
      } catch (error) {
        if (
          attempt < 4 &&
          (isPostgresSerializationConflict(error) ||
            (error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'))
        )
          continue;
        throw error;
      }
    throw new ForbiddenException('Team slot contention');
  }
}
