// U10b — Gate 10's durable divergence store (G10 §5, plan §2.6).
//
// The store is deliberately not a business owner. It reads widget-layer intent records for the
// same tenant and principal proof, and writes only the AUDIT_RETAINED comparison Gate 10 decided.
// No canonical fact, owner result or client content is persisted here.

import { PrismaService } from '../../prisma/prisma.service';
import type { EffectClass } from '../../widget-contract/intent';
import type { IntentRecordRow } from '../gate.types';
import type { RequestTx } from '../authority/principal-view';
import type { RoutingCandidate } from '../routing/deterministic-router';
import { scoped } from './tenant-scope';

export type Gate10Candidate = RoutingCandidate &
  Pick<IntentRecordRow, 'handoffSpace' | 'handoffKey' | 'targetJson'>;

export interface DivergenceAuditInput {
  readonly tenantId: string;
  readonly widgetId: string;
  readonly tappedIntentTokenHash: string;
  readonly resolvedIntentTokenHash: string | null;
  readonly resolvedEffect: EffectClass | null;
  readonly refusalCode: 'intent_divergence' | null;
  readonly observedAt: Date;
}

type DivergenceClient = Pick<
  RequestTx,
  'widgetIntentRecord' | 'widgetIntentDivergenceAudit'
>;

export class DivergenceStore {
  constructor(private readonly prisma: PrismaService) {}

  static liveCandidates(
    client: DivergenceClient,
    record: Pick<IntentRecordRow, 'tenantId' | 'principalProofHash'>,
    now: Date,
  ): Promise<readonly Gate10Candidate[]> {
    return client.widgetIntentRecord.findMany({
      where: scoped(record.tenantId, {
        principalProofHash: record.principalProofHash,
        expiresAt: { gt: now },
        consumedAt: null,
      }),
      orderBy: [{ issuedAt: 'desc' }, { intentTokenHash: 'asc' }],
      select: {
        intentTokenHash: true,
        effect: true,
        priority: true,
        capabilitySpace: true,
        capabilityKey: true,
        handoffSpace: true,
        handoffKey: true,
        targetJson: true,
        issuedAt: true,
        erasedAt: true,
        utteranceTemplate: true,
        selectionDomainLabelsJson: true,
      },
    });
  }

  static async recordDivergence(
    client: DivergenceClient,
    input: DivergenceAuditInput,
  ): Promise<void> {
    await client.widgetIntentDivergenceAudit.create({
      data: {
        tenantId: input.tenantId,
        widgetId: input.widgetId,
        tappedIntentTokenHash: input.tappedIntentTokenHash,
        resolvedIntentTokenHash: input.resolvedIntentTokenHash,
        resolvedEffect: input.resolvedEffect,
        refusalCode: input.refusalCode,
        observedAt: input.observedAt,
      },
      select: { id: true },
    });
  }

  countDivergences(tenantId: string): Promise<number> {
    return this.prisma.widgetIntentDivergenceAudit.count({
      where: scoped(tenantId, {}),
    });
  }
}
