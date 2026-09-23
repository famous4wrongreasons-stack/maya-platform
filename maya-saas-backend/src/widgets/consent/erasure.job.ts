import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { ErasureClass } from '../../widget-contract/lifecycle';
import { timelineLockKey } from '../stores/timeline.store';
import { ErasureRefusal, type ErasureRequest } from './erasure';

type ErasableClass = Extract<
  ErasureClass,
  'CONVERSATION_CONTENT' | 'CANONICAL_ELSEWHERE'
>;

/**
 * The executable counterpart of the schema's `// C` and `// X` annotations.
 *
 * This is deliberately closed and model-qualified. A new erasable column cannot be silently left
 * behind: the companion schema ratchet requires exact equality between this map and every C/X
 * marker in `schema.prisma`.
 */
export const WIDGET_ERASURE_CLASS_MAP = Object.freeze({
  WidgetTimelineTurn: Object.freeze({
    textContent: 'CONVERSATION_CONTENT',
    spokenTranscript: 'CONVERSATION_CONTENT',
  }),
  WidgetEmission: Object.freeze({
    bodyJson: 'CONVERSATION_CONTENT',
    textEquivalentJson: 'CONVERSATION_CONTENT',
    a11yJson: 'CONVERSATION_CONTENT',
    speechJson: 'CONVERSATION_CONTENT',
  }),
  WidgetIntentRecord: Object.freeze({
    utteranceTemplate: 'CONVERSATION_CONTENT',
    renderedUtterance: 'CONVERSATION_CONTENT',
    selectedLabels: 'CONVERSATION_CONTENT',
    selectionDomainLabelsJson: 'CONVERSATION_CONTENT',
    spokenTranscript: 'CONVERSATION_CONTENT',
  }),
  WidgetIntentSubmissionAudit: Object.freeze({
    inputsFreeTextJson: 'CONVERSATION_CONTENT',
    inputsPiiJson: 'CANONICAL_ELSEWHERE',
    readbackAffirmation: 'CONVERSATION_CONTENT',
    spokenTranscript: 'CONVERSATION_CONTENT',
  }),
  WidgetIntentReceipt: Object.freeze({
    utteranceEcho: 'CONVERSATION_CONTENT',
  }),
  WidgetRenderReceipt: Object.freeze({
    composedEnvelopeJson: 'CONVERSATION_CONTENT',
    emittedEnvelopeJson: 'CONVERSATION_CONTENT',
  }),
  WidgetDraft: Object.freeze({
    diffJson: 'CONVERSATION_CONTENT',
  }),
} as const satisfies Readonly<
  Record<string, Readonly<Record<string, ErasableClass>>>
>);

type ErasableModel = keyof typeof WIDGET_ERASURE_CLASS_MAP;

const fieldsFor = (model: ErasableModel): readonly string[] =>
  Object.freeze(
    Object.keys(WIDGET_ERASURE_CLASS_MAP[model]).map((field) => `/${field}`),
  );

export interface ConversationErasureRequest extends ErasureRequest {
  /** Exact timeline tuple whose writes are serialised with Gate 9. */
  readonly conversationId: string;
}

export interface ConversationErasureResult {
  readonly tombstonesWritten: number;
}

/**
 * P-RT6's dark provider. K12 will schedule it; this unit only establishes the atomic mechanism.
 *
 * The single data statement first takes the same transaction advisory lock as Gate 9, freezes every
 * target set, clears all C/X columns, stamps `erasedAt`, and appends one tombstone per changed row.
 * A retry sees no `erasedAt IS NULL` target and therefore cannot duplicate a tombstone.
 */
@Injectable()
export class WidgetConversationErasureJob {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    request: ConversationErasureRequest,
    now = new Date(),
  ): Promise<ConversationErasureResult> {
    for (const [name, value] of Object.entries({
      tenantId: request.tenantId,
      conversationId: request.conversationId,
      erasureRequestRef: request.erasureRequestRef,
      subjectPrincipalProofHash: request.subjectPrincipalProofHash,
    }))
      if (value.trim().length === 0)
        throw new ErasureRefusal(
          `${name} is required for conversation erasure`,
        );

    const lockKey = timelineLockKey(request.tenantId, request.conversationId);

    const fields = {
      turn: fieldsFor('WidgetTimelineTurn'),
      emission: fieldsFor('WidgetEmission'),
      record: fieldsFor('WidgetIntentRecord'),
      submission: fieldsFor('WidgetIntentSubmissionAudit'),
      receipt: fieldsFor('WidgetIntentReceipt'),
      render: fieldsFor('WidgetRenderReceipt'),
      draft: fieldsFor('WidgetDraft'),
    } as const;

    const tombstonesWritten = await this.prisma.$transaction(
      async (tx) =>
        tx.$executeRaw`
        WITH lock_row AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        ),
        turn_targets AS MATERIALIZED (
          SELECT t."id"
          FROM "WidgetTimelineTurn" t
          CROSS JOIN lock_row
          WHERE t."tenantId" = ${request.tenantId}
            AND t."conversationId" = ${request.conversationId}::uuid
            AND t."principalProofHash" = ${request.subjectPrincipalProofHash}
            AND t."erasedAt" IS NULL
        ),
        emission_targets AS MATERIALIZED (
          SELECT e."id", e."widgetId"
          FROM "WidgetEmission" e
          JOIN turn_targets t ON t."id" = e."turnId"
          WHERE e."tenantId" = ${request.tenantId}
            AND e."erasedAt" IS NULL
        ),
        record_targets AS MATERIALIZED (
          SELECT r."id", r."intentTokenHash"
          FROM "WidgetIntentRecord" r
          JOIN emission_targets e ON e."widgetId" = r."widgetId"
          WHERE r."tenantId" = ${request.tenantId}
            AND r."principalProofHash" = ${request.subjectPrincipalProofHash}
            AND r."erasedAt" IS NULL
        ),
        submission_targets AS MATERIALIZED (
          SELECT a."id"
          FROM "WidgetIntentSubmissionAudit" a
          JOIN record_targets r ON r."intentTokenHash" = a."intentTokenHash"
          WHERE a."tenantId" = ${request.tenantId}
            AND a."erasedAt" IS NULL
        ),
        receipt_targets AS MATERIALIZED (
          SELECT r."id"
          FROM "WidgetIntentReceipt" r
          JOIN record_targets i ON i."intentTokenHash" = r."intentTokenHash"
          WHERE r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
        ),
        render_targets AS MATERIALIZED (
          SELECT r."id"
          FROM "WidgetRenderReceipt" r
          JOIN emission_targets e ON e."widgetId" = r."widgetId"
          WHERE r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
        ),
        draft_targets AS MATERIALIZED (
          SELECT d."id"
          FROM "WidgetDraft" d
          WHERE d."tenantId" = ${request.tenantId}
            AND d."principalProofHash" = ${request.subjectPrincipalProofHash}
            AND d."erasedAt" IS NULL
        ),
        erased_turns AS (
          UPDATE "WidgetTimelineTurn" t
          SET "textContent" = NULL,
              "spokenTranscript" = NULL,
              "erasedAt" = ${now}
          FROM turn_targets x
          WHERE t."id" = x."id" AND t."tenantId" = ${request.tenantId}
          RETURNING t."id"
        ),
        erased_emissions AS (
          UPDATE "WidgetEmission" e
          SET "bodyJson" = NULL,
              "textEquivalentJson" = NULL,
              "a11yJson" = NULL,
              "speechJson" = NULL,
              "erasedAt" = ${now}
          FROM emission_targets x
          WHERE e."id" = x."id" AND e."tenantId" = ${request.tenantId}
          RETURNING e."id"
        ),
        erased_records AS (
          UPDATE "WidgetIntentRecord" r
          SET "utteranceTemplate" = NULL,
              "renderedUtterance" = NULL,
              "selectedLabels" = ARRAY[]::text[],
              "selectionDomainLabelsJson" = NULL,
              "spokenTranscript" = NULL,
              "erasedAt" = ${now}
          FROM record_targets x
          WHERE r."id" = x."id" AND r."tenantId" = ${request.tenantId}
          RETURNING r."id"
        ),
        erased_submissions AS (
          UPDATE "WidgetIntentSubmissionAudit" a
          SET "inputsFreeTextJson" = NULL,
              "inputsPiiJson" = NULL,
              "readbackAffirmation" = NULL,
              "spokenTranscript" = NULL,
              "erasedAt" = ${now}
          FROM submission_targets x
          WHERE a."id" = x."id" AND a."tenantId" = ${request.tenantId}
          RETURNING a."id"
        ),
        erased_receipts AS (
          UPDATE "WidgetIntentReceipt" r
          SET "utteranceEcho" = NULL,
              "erasedAt" = ${now}
          FROM receipt_targets x
          WHERE r."id" = x."id" AND r."tenantId" = ${request.tenantId}
          RETURNING r."id"
        ),
        erased_renders AS (
          UPDATE "WidgetRenderReceipt" r
          SET "composedEnvelopeJson" = NULL,
              "emittedEnvelopeJson" = NULL,
              "erasedAt" = ${now}
          FROM render_targets x
          WHERE r."id" = x."id" AND r."tenantId" = ${request.tenantId}
          RETURNING r."id"
        ),
        erased_drafts AS (
          UPDATE "WidgetDraft" d
          SET "diffJson" = NULL,
              "erasedAt" = ${now}
          FROM draft_targets x
          WHERE d."id" = x."id" AND d."tenantId" = ${request.tenantId}
          RETURNING d."id"
        ),
        changed AS (
          SELECT 'timeline'::text AS store, 'WidgetTimelineTurn/' || "id"::text AS row_key, ${fields.turn}::text[] AS fields FROM erased_turns
          UNION ALL SELECT 'timeline', 'WidgetEmission/' || "id"::text, ${fields.emission}::text[] FROM erased_emissions
          UNION ALL SELECT 'intent_audit', 'WidgetIntentRecord/' || "id"::text, ${fields.record}::text[] FROM erased_records
          UNION ALL SELECT 'intent_audit', 'WidgetIntentSubmissionAudit/' || "id"::text, ${fields.submission}::text[] FROM erased_submissions
          UNION ALL SELECT 'intent_audit', 'WidgetIntentReceipt/' || "id"::text, ${fields.receipt}::text[] FROM erased_receipts
          UNION ALL SELECT 'intent_audit', 'WidgetRenderReceipt/' || "id"::text, ${fields.render}::text[] FROM erased_renders
          UNION ALL SELECT 'intent_audit', 'WidgetDraft/' || "id"::text, ${fields.draft}::text[] FROM erased_drafts
        )
        INSERT INTO "WidgetErasureTombstone"
          ("id", "tenantId", "erasedAt", "erasureRequestRef", "store", "rowKey", "fieldsErased")
        SELECT gen_random_uuid(), ${request.tenantId}, ${now}, ${request.erasureRequestRef}, store, row_key, fields
        FROM changed
      `,
    );

    return Object.freeze({ tombstonesWritten });
  }
}
