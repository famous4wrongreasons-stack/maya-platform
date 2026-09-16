// K3 — the five widget-layer stores.
//
// They are one service rather than five, for one reason: every write here must be tenant-fenced,
// and a fence repeated in five files is a fence that will eventually be repeated wrong. `scoped()`
// is the only way a tenant id enters a query in this file, and the K3 checker asserts that no
// method builds a `where` without it.
//
// What these stores are NOT: they are not a second home for business data. §5's boundary is that no
// business table references a widget table and no widget row is a canonical record of anything. A
// draft here is a proposal the server owns until it is committed; a receipt here is an adjudication
// of a submission, not of a booking; the timeline is what was said, not what was done.

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/** Retention windows from §5. Stated once so a store cannot invent its own. */
export const RETENTION = {
  /** T_TIMELINE — the conversation a person can see. */
  timelineDays: 180,
  /** Emission bodies are dropped well before the row is, which is why the two are separate. */
  emissionBodyDefaultSec: 7 * 24 * 60 * 60,
} as const;

export interface TimelineTurnInput {
  tenantId: string;
  conversationId: string;
  turnIndex: number;
  /** TurnRole — 'user' or 'assistant'. OWNER RULING, wave 2; the database CHECK admits no other. */
  role: 'user' | 'assistant';
  principalProofHash: string;
  channel: string;
  textContent?: string | null;
  spokenTranscript?: string | null;
}

@Injectable()
export class WidgetStoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The only place a tenant id enters a query in this file. Every store method routes through it,
   * so "is this tenant-fenced?" has one answer instead of one per method.
   */
  private scoped<T extends object>(
    tenantId: string,
    where: T,
  ): T & { tenantId: string } {
    if (!tenantId) throw new Error('widget store: refusing an unscoped query');
    return { ...where, tenantId };
  }

  private plusDays(from: Date, days: number): Date {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // ── 1. TIMELINE STORE ───────────────────────────────────────────────────────────────────────
  // Gate 9 calls this: the lowered utterance is appended as a USER turn with authority NONE, and
  // "from here the path is byte-identical to a typed message". That is the point of the store —
  // a widget tap and a typed sentence become the same kind of row.

  async appendTurn(
    input: TimelineTurnInput,
    now = new Date(),
  ): Promise<{ id: string }> {
    const row = await this.prisma.widgetTimelineTurn.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        turnIndex: input.turnIndex,
        role: input.role,
        principalProofHash: input.principalProofHash,
        channel: input.channel,
        createdAt: now,
        retentionUntil: this.plusDays(now, RETENTION.timelineDays),
        textContent: input.textContent ?? null,
        spokenTranscript: input.spokenTranscript ?? null,
      },
      select: { id: true },
    });
    return row;
  }

  /**
   * Reading the timeline reaches no capability owner — §3's exit requires zero capability calls on
   * this path, and the way to keep that true is for the read to be a plain select with nothing to
   * join to.
   */
  async readTimeline(tenantId: string, conversationId: string, limit = 50) {
    return this.prisma.widgetTimelineTurn.findMany({
      where: this.scoped(tenantId, { conversationId, erasedAt: null }),
      orderBy: { turnIndex: 'asc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        turnIndex: true,
        role: true,
        channel: true,
        createdAt: true,
        textContent: true,
        spokenTranscript: true,
      },
    });
  }

  // ── 2. INTENT-AUDIT STORE ───────────────────────────────────────────────────────────────────
  // What arrived, separately from what was decided. The two are different questions and §5 gives
  // them different tables: the audit records the submission as received, the receipt records the
  // adjudication. Keeping them apart is what lets a refusal be explained without re-deriving it.

  async recordSubmission(
    input: {
      tenantId: string;
      widgetId: string;
      intentTokenHash: string;
      clientNonce: string;
      profileId: string;
      clientEmittedAt?: Date | null;
      readbackRef?: string | null;
      readbackBodyHash?: string | null;
      readbackAffirmation?: string | null;
      inputsClosed?: unknown;
      spokenTranscript?: string | null;
    },
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.prisma.widgetIntentSubmissionAudit.create({
      data: {
        tenantId: input.tenantId,
        widgetId: input.widgetId,
        intentTokenHash: input.intentTokenHash,
        clientNonce: input.clientNonce,
        profileId: input.profileId,
        clientEmittedAt: input.clientEmittedAt ?? null,
        receivedAt: now,
        readbackRef: input.readbackRef ?? null,
        readbackBodyHash: input.readbackBodyHash ?? null,
        readbackAffirmation: input.readbackAffirmation ?? null,
        // Closed-domain values only. Free text and PII have their own columns and their own fences
        // in K4; writing them here would put unvalidated input into the audit trail.
        inputsClosedJson: (input.inputsClosed ?? null) as never,
        spokenTranscript: input.spokenTranscript ?? null,
      },
      select: { id: true },
    });
  }

  // ── 3. RECEIPT STORE (shell) ────────────────────────────────────────────────────────────────
  // K3 builds the shell: one adjudication per token, with a closed refusal vocabulary. The action
  // receipt it can point at belongs to K7, which is why `actionReceiptRef` stays null here.

  async writeReceipt(
    input: {
      tenantId: string;
      widgetId: string;
      intentTokenHash: string;
      outcome: string;
      refusalCode?: string | null;
      answeringChannel: string;
      utteranceEcho?: string | null;
    },
    now = new Date(),
  ): Promise<{ id: string }> {
    return this.prisma.widgetIntentReceipt.create({
      data: {
        tenantId: input.tenantId,
        widgetId: input.widgetId,
        intentTokenHash: input.intentTokenHash,
        submittedAt: now,
        outcome: input.outcome,
        refusalCode: input.refusalCode ?? null,
        actionReceiptRef: null,
        answeringChannel: input.answeringChannel,
        utteranceEcho: input.utteranceEcho ?? null,
      },
      select: { id: true },
    });
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
      where: this.scoped(tenantId, {
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
      where: this.scoped(tenantId, {}),
    });
  }
}
