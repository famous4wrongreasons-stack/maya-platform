import { servicePriceApprovalMintRequest } from './service-price-approval.presenter';
import { Inject, Injectable } from '@nestjs/common';
import type { AiApprovalWidgetTriggerPort } from '../../ai-tools/ai-approval-widget-trigger.port';
import { UserRole } from '../../common/domain.enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { PrincipalResolver } from '../authority/principal-view';
import {
  GATE6_OWNERS,
  PRINCIPAL_RESOLVER,
  WIDGET_RELEASE_ACCESS,
  USER_TURN_AUDIT,
} from '../di-tokens';
import { WidgetEmitterService } from '../emission/emitter.service';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import type { WidgetReleaseAccessPort } from '../owner-ports/release-access.port';
import type { UserTurnAuditPort } from '../owner-ports/user-turn-audit.port';
import { TimelineStore } from '../stores/timeline.store';
import {
  SERVICE_PRICE_APPROVAL_OWNER,
  servicePriceApprovalRef,
  type ServicePriceApprovalOwnerPort,
} from './service-price-approval.port';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const resolution = (
  widgetId: string,
  envelopeSeal: string,
  envelope: Readonly<Record<string, unknown>>,
) => ({
  matched: true as const,
  receipt: { widget_id: widgetId, envelope_seal: envelopeSeal, envelope },
  dismiss_widget_id: null,
});
const LIVE = ['MINTED', 'DELIVERED', 'LIVE'];
const SERVICE_PRICE_CAPABILITY = 'crm.service.fixed-price.update.v1';

/** Named YC-SP1 admission. Authority stays with the canonical approval owner and the one minter. */
@Injectable()
export class ServicePriceApprovalTriggerService implements AiApprovalWidgetTriggerPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
    @Inject(SERVICE_PRICE_APPROVAL_OWNER)
    private readonly source: ServicePriceApprovalOwnerPort,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
    @Inject(GATE6_OWNERS) private readonly gate6: Gate6Owners,
    @Inject(WIDGET_RELEASE_ACCESS)
    private readonly releaseAccess: WidgetReleaseAccessPort,
    @Inject(USER_TURN_AUDIT) private readonly turnAudit: UserTurnAuditPort,
  ) {}

  async readServicePriceUserTurnBinding(
    input: Parameters<
      AiApprovalWidgetTriggerPort['readServicePriceUserTurnBinding']
    >[0],
    tx?: Parameters<
      AiApprovalWidgetTriggerPort['readServicePriceUserTurnBinding']
    >[1],
  ) {
    const read = async (transaction: NonNullable<typeof tx>) => {
      const rows = await this.turnAudit.read(
        input.tenantId,
        input.userId,
        input.turnId,
        transaction,
      );
      if (rows.length !== 1 || !isRecord(rows[0])) return null;
      const proof = rows[0];
      if (
        Object.keys(proof).sort().join('|') !==
          'contract|conversationId|intentTokenHash|principalProofHash|turnId' ||
        proof.contract !== 'maya.user-turn-binding/1' ||
        proof.turnId !== input.turnId ||
        proof.conversationId !== input.conversationId ||
        proof.intentTokenHash !== null ||
        typeof proof.principalProofHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(proof.principalProofHash) ||
        (input.principalProofHash !== undefined &&
          proof.principalProofHash !== input.principalProofHash)
      )
        return null;
      return {
        turnId: input.turnId,
        conversationId: input.conversationId,
        principalProofHash: proof.principalProofHash,
      };
    };
    return tx ? read(tx) : this.prisma.$transaction(read);
  }

  async afterPendingServicePriceApproval(
    input: Parameters<
      AiApprovalWidgetTriggerPort['afterPendingServicePriceApproval']
    >[0],
  ) {
    const tenantId = input.actor.tenantId;
    if (
      !tenantId ||
      ![UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER].includes(
        input.actor.role,
      ) ||
      !(await this.gate6.grantsRequiredFeatures(tenantId, ['widgets.runtime']))
    )
      return null;
    const principal = await this.prisma.$transaction((tx) =>
      this.principals.resolve(tx),
    );
    if (
      !principal ||
      principal.authority.kind !== 'USER' ||
      principal.authority.tenantId !== tenantId ||
      principal.authority.userId !== input.actor.userId ||
      !['tenant_owner', 'business_owner'].includes(principal.role ?? '')
    )
      return null;

    const actor = { tenantId, userId: input.actor.userId };
    const ref = servicePriceApprovalRef(input.approvalId, input.payloadHash);
    const snapshot = await this.source.read(
      actor,
      ref,
      principal.proofHash,
      true,
    );
    if (
      snapshot.id !== input.approvalId ||
      snapshot.payloadHash !== input.payloadHash ||
      snapshot.origin.conversationId !== input.userTurn.conversationId ||
      snapshot.origin.principalProofHash !== principal.proofHash
    )
      return null;
    const now = new Date();
    const ttlSeconds = Math.floor(
      (snapshot.expiresAt.getTime() - now.getTime()) / 1000,
    );
    if (ttlSeconds <= 0) return null;
    const conversationId = snapshot.origin.conversationId;
    // The canonical origin survives replay. A later request may not invent a new parent turn.
    const turn = await this.prisma.$transaction((tx) =>
      TimelineStore.ensureAssistantExecutionTurn(
        tx,
        {
          tenantId,
          conversationId,
          parentUserTurnId: snapshot.origin.userTurnId,
          principalProofHash: principal.proofHash,
          channel: 'pwa',
          executionId: `service-price-approval:${snapshot.id}`,
        },
        now,
      ),
    );
    if (!turn || turn.principalProofHash !== principal.proofHash) return null;

    return this.prisma.$transaction(
      async (tx) => {
        await TimelineStore.lockConversation(tx, tenantId, conversationId);
        const saved = await tx.widgetEmission.findMany({
          where: {
            tenantId,
            turnId: turn.id,
            kind: 'APPROVAL',
            erasedAt: null,
            turn: { conversationId, principalProofHash: principal.proofHash },
          },
          orderBy: { issuedAt: 'asc' },
          take: 20,
          select: {
            widgetId: true,
            envelopeSeal: true,
            lifecycleState: true,
            expiresAt: true,
            renderReceipts: {
              where: { erasedAt: null },
              orderBy: { degradedAt: 'desc' },
              take: 1,
              select: { emittedEnvelopeJson: true },
            },
          },
        });
        // Details share the original assistant turn. Replaying chat must retain the root CARD,
        // never promote a later SHEET child into the timeline or manufacture another root.
        const previous = saved.find((row) => {
          const envelope = row.renderReceipts[0]?.emittedEnvelopeJson;
          return (
            isRecord(envelope) &&
            isRecord(envelope.correlation) &&
            envelope.correlation.parent_widget_id === null
          );
        });
        if (saved.length > 0) {
          if (!previous) return null;
          if (
            !LIVE.includes(previous.lifecycleState) ||
            previous.expiresAt.getTime() <= Date.now() ||
            !(await this.releaseAccess.canProject(
              tenantId,
              previous.widgetId,
              tx,
            ))
          )
            return null;
          const envelope = previous.renderReceipts[0]?.emittedEnvelopeJson;
          if (
            !isRecord(envelope) ||
            envelope.widget_id !== previous.widgetId ||
            !isRecord(envelope.integrity) ||
            envelope.integrity.envelope_seal !== previous.envelopeSeal
          )
            return null;
          return resolution(previous.widgetId, previous.envelopeSeal, envelope);
        }
        const candidates = await tx.widgetEmission.findMany({
          where: {
            tenantId,
            kind: 'APPROVAL',
            erasedAt: null,
            lifecycleState: { in: LIVE },
            expiresAt: { gt: now },
            turn: { conversationId, principalProofHash: principal.proofHash },
            intentRecords: {
              some: {
                principalProofHash: principal.proofHash,
                capabilitySpace: 'AE',
                capabilityKey: SERVICE_PRICE_CAPABILITY,
                confirmationOfKind: 'approval',
                effect: 'COMMIT',
                consumedAt: null,
              },
            },
          },
          orderBy: { issuedAt: 'desc' },
          take: 20,
          select: {
            widgetId: true,
            renderReceipts: {
              where: { erasedAt: null },
              orderBy: { degradedAt: 'desc' },
              take: 1,
              select: { emittedEnvelopeJson: true },
            },
            intentRecords: {
              where: {
                principalProofHash: principal.proofHash,
                capabilitySpace: 'AE',
                capabilityKey: SERVICE_PRICE_CAPABILITY,
                confirmationOfKind: 'approval',
                effect: 'COMMIT',
                consumedAt: null,
              },
              take: 1,
              select: { confirmationOfRef: true },
            },
          },
        });
        let predecessorWidgetId: string | undefined;
        for (const candidate of candidates) {
          const envelope = candidate.renderReceipts[0]?.emittedEnvelopeJson;
          if (
            !isRecord(envelope) ||
            !isRecord(envelope.correlation) ||
            envelope.correlation.parent_widget_id !== null
          )
            continue;
          const approvalId = candidate.intentRecords[0]?.confirmationOfRef;
          if (
            approvalId &&
            (await this.source.sameServiceApproval(
              actor,
              approvalId,
              snapshot.id,
            ))
          ) {
            predecessorWidgetId = candidate.widgetId;
            break;
          }
        }
        const request = servicePriceApprovalMintRequest(
          snapshot,
          principal,
          turn.id,
          ttlSeconds,
        );
        const minted = await this.emitter.emitServicePriceApproval(
          request,
          {
            approvalId: snapshot.id,
            payloadHash: snapshot.payloadHash,
            revalidate: async () => {
              // The provider was re-read before taking the conversation lock. Inside mint, check only
              // the canonical pending approval/origin; no provider HTTP is held inside a transaction.
              const current = await this.source.read(
                actor,
                ref,
                principal.proofHash,
                false,
              );
              if (
                current.origin.userTurnId !== snapshot.origin.userTurnId ||
                current.origin.conversationId !== conversationId ||
                current.payloadHash !== snapshot.payloadHash
              )
                throw new Error('service_price_chat_origin_changed');
            },
          },
          now,
          predecessorWidgetId,
        );
        return resolution(
          minted.widgetId,
          minted.envelopeSeal,
          minted.envelope,
        );
      },
      { maxWait: 1000, timeout: 20_000 },
    );
  }
}
