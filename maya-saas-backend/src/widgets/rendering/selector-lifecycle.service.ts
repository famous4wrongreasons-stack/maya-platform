import type {
  SelectorObservation,
  SelectorObservationAuditPort,
} from '../owner-ports/selector-observation-audit.port';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PRINCIPAL_RESOLVER,
  SELECTOR_OBSERVATION_AUDIT,
  SEAL_VERIFIER,
  WIDGET_RELEASE_ACCESS,
} from '../di-tokens';
import type { PrincipalResolver } from '../authority/principal-view';
import type { SealVerifier } from '../emission/seal-verifier.service';
import type { WidgetReleaseAccessPort } from '../owner-ports/release-access.port';
import { TimelineStore } from '../stores/timeline.store';
import { digestEquals } from '../token.util';

export interface SelectorRenderEvidence {
  readonly widget_id: string;
  readonly body_hash: string;
  readonly envelope_seal: string;
}

const SELECTORS = ['SERVICE_SELECTOR', 'STAFF_SELECTOR'];

/** L25: lifecycle observations, never a capability/confirmation/booking owner. */
@Injectable()
export class SelectorLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SELECTOR_OBSERVATION_AUDIT)
    private readonly audit: SelectorObservationAuditPort,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
    @Inject(SEAL_VERIFIER) private readonly seals: SealVerifier,
    @Inject(WIDGET_RELEASE_ACCESS)
    private readonly release: WidgetReleaseAccessPort,
  ) {}

  /** Only server HTTP egress may record handing sealed bytes to the channel. */
  delivered(evidence: SelectorRenderEvidence) {
    return this.transition(evidence, 'MINTED', 'DELIVERED');
  }

  /** The mounted carrier reports this independently of any selector action. */
  rendered(evidence: SelectorRenderEvidence) {
    return this.transition(evidence, 'DELIVERED', 'LIVE');
  }

  private async transition(
    e: SelectorRenderEvidence,
    from: 'MINTED' | 'DELIVERED',
    to: 'DELIVERED' | 'LIVE',
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (!principal || !principal.authority.userId) return false;
      const tenantId = principal.authority.tenantId;
      const initial = await tx.widgetEmission.findFirst({
        where: { tenantId, widgetId: e.widget_id, kind: { in: SELECTORS } },
        select: { turn: { select: { conversationId: true } } },
      });
      if (!initial) return false;
      await TimelineStore.lockConversation(
        tx,
        tenantId,
        initial.turn.conversationId,
      );
      const current = await this.principals.resolve(tx);
      if (!current || !digestEquals(current.proofHash, principal.proofHash))
        return false;
      const now = new Date();
      const row = await tx.widgetEmission.findFirst({
        where: {
          tenantId,
          widgetId: e.widget_id,
          kind: { in: SELECTORS },
          erasedAt: null,
          bodyDroppedAt: null,
          supersededByWidgetId: null,
          expiresAt: { gt: now },
          retentionUntil: { gt: now },
          turn: { erasedAt: null },
          intentRecords: {
            some: { principalProofHash: current.proofHash, erasedAt: null },
          },
        },
        include: {
          intentRecords: true,
          renderReceipts: { where: { erasedAt: null } },
        },
      });
      if (
        !row ||
        !digestEquals(row.bodyHash, e.body_hash) ||
        !digestEquals(row.envelopeSeal, e.envelope_seal) ||
        !row.renderReceipts.some(
          (r) => r.deliveryChannel === row.deliveryChannel,
        )
      )
        return false;
      const token = row.intentRecords.find(
        (r) => r.principalProofHash === current.proofHash,
      )?.intentTokenHash;
      if (!token || !(await this.seals.verify(token, { tenantId }, tx)).ok)
        return false;
      for (const intent of row.intentRecords)
        if (!(await this.release.admits(tenantId, intent, tx))) return false;
      const userId = current.authority.userId;
      if (!userId) return false;
      const observation = (
        state: 'DELIVERED' | 'LIVE',
      ): SelectorObservation => ({
        tenantId,
        userId,
        widgetId: row.widgetId,
        bodyHash: row.bodyHash,
        principalProofHash: current.proofHash,
        deliveryChannel: row.deliveryChannel,
        state,
      });
      // Idempotence needs the exact prior observation; legacy LIVE alone is insufficient.
      if (row.lifecycleState === to)
        return this.audit.exists(observation(to), tx);
      if (row.lifecycleState !== from) return false;
      if (
        to === 'LIVE' &&
        !(await this.audit.exists(observation('DELIVERED'), tx))
      )
        return false;
      const changed = await tx.widgetEmission.updateMany({
        where: {
          tenantId,
          widgetId: row.widgetId,
          lifecycleState: from,
          erasedAt: null,
          supersededByWidgetId: null,
          expiresAt: { gt: now },
          bodyHash: e.body_hash,
          envelopeSeal: e.envelope_seal,
        },
        data: { lifecycleState: to },
      });
      if (changed.count !== 1) throw new Error('SELECTOR_LIFECYCLE_CAS');
      await this.audit.append(observation(to), tx);
      return true;
    });
  }
}
