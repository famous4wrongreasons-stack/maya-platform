// K3 — the five widget-layer stores, behind one facade.
//
// Callers see one service. Since U0 (integrator decision D-6) it is a FACADE over sub-stores, so a
// unit that builds one store owns one file instead of editing a shared service:
//   - `timeline.store.ts`        TimelineStore         (store 1)
//   - `intent-audit.store.ts`    IntentAuditStore      (stores 2 and 3: the receipt is in the
//                                                       intent-audit store, MAP:606-611)
//   - `divergence.store.ts`      DivergenceStore       (skeleton: no table until AMB-32)
//   - `lowering-source.read.ts`  LoweringSourceReader  (skeleton: its read lands with U8a)
// Each existing method was moved unchanged and is delegated below with the same signature. The draft
// store (4) and the free-input ledger (5) are not split: no unit of the plan owns them, so they stay
// here as they were.
//
// The stores were one service for one reason: every write must be tenant-fenced, and a fence repeated
// in five files is a fence that will eventually be repeated wrong. That reason survives the split in
// `tenant-scope.ts`: `scoped()` is declared once there, and it is the only way a tenant id enters a
// store query's `where`, in this file and in every sub-store.
//
// What these stores are NOT: they are not a second home for business data. §5's boundary is that no
// business table references a widget table and no widget row is a canonical record of anything. A
// draft here is a proposal the server owns until it is committed; a receipt here is an adjudication
// of a submission, not of a booking; the timeline is what was said, not what was done.

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { DivergenceStore } from './divergence.store';
import { IntentAuditStore } from './intent-audit.store';
import { LoweringSourceReader } from './lowering-source.read';
import { scoped } from './tenant-scope';
import {
  TimelineStore,
  type LowerToUserTurnInput,
  type TimelineTurnInput,
} from './timeline.store';
import type { RequestTx } from '../authority/principal-view';

export { RETENTION, type TimelineTurnInput } from './timeline.store';

@Injectable()
export class WidgetStoresService {
  private readonly timeline: TimelineStore;
  private readonly intentAudit: IntentAuditStore;
  // Held so the facade's composition is the plan's (§1.3) before either has a method; no method
  // delegates to them yet.
  private readonly divergence: DivergenceStore;
  private readonly loweringSource: LoweringSourceReader;

  constructor(private readonly prisma: PrismaService) {
    this.timeline = new TimelineStore(prisma);
    this.intentAudit = new IntentAuditStore(prisma);
    this.divergence = new DivergenceStore(prisma);
    this.loweringSource = new LoweringSourceReader(prisma);
  }

  // ── 1. TIMELINE STORE ───────────────────────────────────────────────────────────────────────
  // `TimelineStore` (timeline.store.ts). Gate 9 appends the lowered utterance as a USER turn with
  // authority NONE; reading the timeline reaches no capability owner.

  async appendTurn(
    input: TimelineTurnInput,
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.timeline.appendTurn(input, now);
  }

  async lowerToUserTurn(
    input: LowerToUserTurnInput,
    tx: RequestTx,
    now = new Date(),
  ): Promise<{ id: string; turnIndex: number } | null> {
    return TimelineStore.lowerToUserTurn(input, tx, now);
  }

  async readTimeline(tenantId: string, conversationId: string, limit = 50) {
    return this.timeline.readTimeline(tenantId, conversationId, limit);
  }

  // ── 2. INTENT-AUDIT STORE ───────────────────────────────────────────────────────────────────
  // `IntentAuditStore` (intent-audit.store.ts). What arrived, separately from what was decided.

  async recordSubmission(
    input: Parameters<IntentAuditStore['recordSubmission']>[0],
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.intentAudit.recordSubmission(input, now);
  }

  // ── 3. RECEIPT STORE (shell) ────────────────────────────────────────────────────────────────
  // `IntentAuditStore.writeReceipt`: one adjudication per token, `actionReceiptRef` null until K7.

  async writeReceipt(
    input: Parameters<IntentAuditStore['writeReceipt']>[0],
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.intentAudit.writeReceipt(input, now);
  }

  // ── 4. SERVER-OWNED DRAFT STORE ─────────────────────────────────────────────────────────────
  // "Server-owned" is the whole of it. A draft is a diff the server holds; the client never carries
  // it, cannot edit it in transit, and a COMMIT names it by ref rather than resending it. That is
  // what makes F74's confirmation_of_ref meaningful instead of decorative.

  async putDraft(
    input: {
      tenantId: string;
      draftRef: string;
      draftClass: string;
      ownerCapabilitySpace: string;
      ownerCapabilityKey: string;
      principalProofHash: string;
      diff: unknown;
      ttlSeconds: number;
    },
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.prisma.widgetDraft.create({
      data: {
        tenantId: input.tenantId,
        draftRef: input.draftRef,
        draftClass: input.draftClass,
        ownerCapabilitySpace: input.ownerCapabilitySpace,
        ownerCapabilityKey: input.ownerCapabilityKey,
        principalProofHash: input.principalProofHash,
        diffJson: input.diff as never,
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000),
      },
      select: { id: true },
    });
  }

  /**
   * A draft is readable only by the principal it was minted for. The check is in the query, not
   * after it: a draft belonging to someone else is never loaded, so it cannot be logged, diffed or
   * accidentally returned in an error.
   */
  async readDraft(
    tenantId: string,
    draftRef: string,
    principalProofHash: string,
    now = new Date(),
  ) {
    return this.prisma.widgetDraft.findFirst({
      where: scoped(tenantId, {
        draftRef,
        principalProofHash,
        consumedAt: null,
        erasedAt: null,
        expiresAt: { gt: now },
      }),
      select: {
        id: true,
        draftRef: true,
        draftClass: true,
        diffJson: true,
        expiresAt: true,
      },
    });
  }

  // ── 5. FREE-INPUT LEDGER ────────────────────────────────────────────────────────────────────
  // Every widget that accepts free text has to say so, in advance, with a justification. The ledger
  // is what makes "how many places can a person type something into Maya?" a query rather than an
  // audit: a field that is not minted here does not exist.

  async recordFreeInput(
    input: {
      tenantId: string;
      widgetId: string;
      intentTokenHash: string;
      capabilitySpace: string;
      capabilityKey: string;
      widgetKind: string;
      fieldKinds: string[];
      justification: string;
      boundsSourceRefs?: string[];
      normalizerRefs?: string[];
    },
    now = new Date(),
  ): Promise<{ id: string }> {
    if (!input.justification.trim())
      throw new Error(
        'free-input ledger: a free-text field without a justification is not mintable',
      );
    return this.prisma.widgetFreeInputLedger.create({
      data: {
        tenantId: input.tenantId,
        widgetId: input.widgetId,
        intentTokenHash: input.intentTokenHash,
        capabilitySpace: input.capabilitySpace,
        capabilityKey: input.capabilityKey,
        widgetKind: input.widgetKind,
        fieldKinds: input.fieldKinds,
        justification: input.justification,
        boundsSourceRefs: input.boundsSourceRefs ?? [],
        normalizerRefs: input.normalizerRefs ?? [],
        mintedAt: now,
      },
      select: { id: true },
    });
  }

  async countFreeInputFields(tenantId: string): Promise<number> {
    return this.prisma.widgetFreeInputLedger.count({
      where: scoped(tenantId, {}),
    });
  }
}
