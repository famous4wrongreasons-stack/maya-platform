// K3 — the intent-audit store: what arrived, and the adjudication receipt (§4.4.1, T_AUDIT).
//
// A sub-store behind the `WidgetStoresService` facade (U0, D-6). Nothing outside `stores/` constructs
// it; callers reach it through the facade. The receipt lives here because `WidgetIntentReceipt` is in
// the intent-audit store (MAP:606-611). Both methods were moved here unchanged from
// `widget-stores.service.ts`. Gate 13's receipt reference and claim land here with U13a.

import { PrismaService } from '../../prisma/prisma.service';

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
}
