// K3 — the intent-audit store: what arrived, and the adjudication receipt (§4.4.1, T_AUDIT).
//
// A sub-store behind the `WidgetStoresService` facade (U0, D-6). Nothing outside `stores/` constructs
// it; callers reach it through the facade. The receipt lives here because `WidgetIntentReceipt` is in
// the intent-audit store (MAP:606-611). Both methods were moved here unchanged from
// `widget-stores.service.ts`. Gate 13's receipt reference and claim land here with U13a.

import { isPostgresSerializationConflict } from '../../common/postgres-transaction-conflict';
import { PrismaService } from '../../prisma/prisma.service';
import { scoped } from './tenant-scope';

export class IntentAuditStore {
  constructor(private readonly prisma: PrismaService) {}

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

  // K3 builds the receipt shell: one adjudication per token, with a closed refusal vocabulary. The
  // action receipt it can point at belongs to K7, which is why `actionReceiptRef` stays null here.

  async writeReceipt(
    input: {
      tenantId: string;
      widgetId: string;
      intentTokenHash: string;
      outcome: string;
      refusalCode?: string | null;
      answeringChannel: string;
      actionReceiptRef?: string | null;
    },
    now = new Date(),
  ): Promise<{ id: string }> {
    const receipt = await this.prisma.widgetIntentReceipt.upsert({
      where: scoped(input.tenantId, {
        tenantId_intentTokenHash: {
          tenantId: input.tenantId,
          intentTokenHash: input.intentTokenHash,
        },
      }),
      create: {
        tenantId: input.tenantId,
        widgetId: input.widgetId,
        intentTokenHash: input.intentTokenHash,
        submittedAt: now,
        outcome: input.outcome,
        refusalCode: input.refusalCode ?? null,
        actionReceiptRef: input.actionReceiptRef ?? null,
        answeringChannel: input.answeringChannel,
        // B-29: adjudication receipts never retain a copy of the utterance. The conversation owns
        // that content; the receipt owns only the closed outcome and the canonical receipt pointer.
        utteranceEcho: null,
      },
      // A retry observes the same adjudication. It must not rewrite its time, outcome or evidence.
      update: {},
      select: {
        id: true,
        widgetId: true,
        outcome: true,
        actionReceiptRef: true,
      },
    });
    // A missing terminal-line write can be repaired by the same idempotent retry. Crucially, no
    // branch can publish CONFIRMED without the durable canonical action receipt returned above.
    await this.prisma.widgetEmission.updateMany({
      where: scoped(input.tenantId, {
        widgetId: receipt.widgetId,
        kind: 'BOOKING_CONFIRMATION',
        erasedAt: null,
      }),
      data: {
        terminalLinesJson: [terminalLine(receipt)] as never,
      },
    });
    return { id: receipt.id };
  }

  /**
   * AMB-54: claim a single-use record immediately before its resolved destination runs.
   *
   * Gate 1's earlier read cannot serialize two concurrent submissions because its request
   * transaction has committed before owner routing begins. This compare-and-set is the decisive
   * claim. A reusable record needs no claim and is reported as claimed without a write.
   */
  async claimRecord(input: {
    tenantId: string;
    intentTokenHash: string;
    singleUse: boolean;
    now: Date;
    approvalPair?: {
      widgetId: string;
      capabilityKey: string;
      confirmationRef: string;
      decision: 'approve' | 'reject';
    };
  }): Promise<boolean> {
    if (!input.singleUse) return true;
    if (!input.approvalPair) {
      const claimed = await this.prisma.widgetIntentRecord.updateMany({
        where: scoped(input.tenantId, {
          intentTokenHash: input.intentTokenHash,
          singleUse: true,
          consumedAt: null,
        }),
        data: { consumedAt: input.now },
      });
      return claimed.count === 1;
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const pair = input.approvalPair!;
          const siblings = await tx.widgetIntentRecord.findMany({
            where: scoped(input.tenantId, {
              widgetId: pair.widgetId,
              widgetKind: 'APPROVAL',
              effect: 'COMMIT',
              capabilitySpace: 'AE',
              capabilityKey: pair.capabilityKey,
              confirmationOfKind: 'approval',
              confirmationOfRef: pair.confirmationRef,
              approvalDecision: { in: ['approve', 'reject'] },
              singleUse: true,
            }),
            select: {
              intentTokenHash: true,
              approvalDecision: true,
              consumedAt: true,
            },
          });
          if (
            siblings.length !== 2 ||
            new Set(siblings.map((row) => row.approvalDecision)).size !== 2 ||
            siblings.some((row) => row.consumedAt !== null) ||
            !siblings.some(
              (row) =>
                row.intentTokenHash === input.intentTokenHash &&
                row.approvalDecision === pair.decision,
            )
          )
            return false;

          const claimed = await tx.widgetIntentRecord.updateMany({
            where: scoped(input.tenantId, {
              intentTokenHash: {
                in: siblings.map((row) => row.intentTokenHash),
              },
              consumedAt: null,
            }),
            data: { consumedAt: input.now },
          });
          return claimed.count === 2;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      // Concurrent sibling claims serialize to one winner. PostgreSQL reports
      // the loser as a serialization conflict; it is an expired tap, not a
      // transport fault and never a second owner execution.
      if (isPostgresSerializationConflict(error)) return false;
      throw error;
    }
  }

  /**
   * B-29 / AMB-56: UNKNOWN is admitted as ACCEPTED. Reconciliation fills the canonical receipt
   * reference on that SAME adjudication; it never creates a second receipt or rewrites the outcome.
   */
  async reconcileAcceptedReceipt(input: {
    tenantId: string;
    intentTokenHash: string;
    actionReceiptRef: string;
  }): Promise<boolean> {
    const row = await this.prisma.widgetIntentReceipt.findFirst({
      where: scoped(input.tenantId, {
        intentTokenHash: input.intentTokenHash,
        outcome: 'ACCEPTED',
        actionReceiptRef: null,
      }),
      select: { id: true, widgetId: true },
    });
    if (row === null) return false;
    const updated = await this.prisma.widgetIntentReceipt.updateMany({
      where: scoped(input.tenantId, {
        id: row.id,
        outcome: 'ACCEPTED',
        actionReceiptRef: null,
      }),
      data: { actionReceiptRef: input.actionReceiptRef },
    });
    if (updated.count !== 1) return false;
    await this.prisma.widgetEmission.updateMany({
      where: scoped(input.tenantId, {
        widgetId: row.widgetId,
        kind: 'BOOKING_CONFIRMATION',
        erasedAt: null,
      }),
      data: {
        terminalLinesJson: [
          terminalLine({
            outcome: 'ACCEPTED',
            actionReceiptRef: input.actionReceiptRef,
          }),
        ] as never,
      },
    });
    return true;
  }
}

const terminalLine = (receipt: {
  outcome: string;
  actionReceiptRef: string | null;
}) => {
  if (receipt.outcome === 'ACCEPTED' && receipt.actionReceiptRef !== null)
    return Object.freeze({
      outcome: 'CONFIRMED',
      text: 'Запись подтверждена.',
      action_receipt_ref: receipt.actionReceiptRef,
    });
  if (receipt.outcome === 'ACCEPTED')
    return Object.freeze({
      outcome: 'SUBMITTED',
      text: 'Запрос принят. Подтверждение ожидается.',
      action_receipt_ref: null,
    });
  return Object.freeze({
    outcome: 'NOT_CONFIRMED',
    text: 'Запись не подтверждена.',
    action_receipt_ref: null,
  });
};
