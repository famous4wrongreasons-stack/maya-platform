import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { ErasureClass } from '../../widget-contract/lifecycle';
import type { RequestTx } from '../authority/principal-view';
import { TimelineStore } from '../stores/timeline.store';
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
    retainedLocalBusinessDate: 'CANONICAL_ELSEWHERE',
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
 * P-RT6's existing job, called by the explicitly authenticated privacy owner.
 *
 * Acquire Gate 9's lock in a separate statement BEFORE taking the target snapshot. A lock inside
 * the erasure CTE would retain a pre-wait READ COMMITTED snapshot and miss a concurrent writer.
 * The following data statement clears C/X columns and appends one tombstone per changed row.
 * A retry sees no `erasedAt IS NULL` target and therefore cannot duplicate a tombstone.
 */
@Injectable()
export class WidgetConversationErasureJob {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    request: ConversationErasureRequest,
    now = new Date(),
  ): Promise<ConversationErasureResult> {
    this.assertRequest(request);
    return this.prisma.$transaction(
      (tx) => this.runInTransaction(tx, request, now),
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** The privacy owner resolves authority in this SAME ReadCommitted transaction. */
  async runInTransaction(
    tx: RequestTx,
    request: ConversationErasureRequest,
    now: Date,
  ): Promise<ConversationErasureResult> {
    this.assertRequest(request);
    await TimelineStore.lockConversation(
      tx,
      request.tenantId,
      request.conversationId,
    );

    const fields = {
      turn: fieldsFor('WidgetTimelineTurn'),
      emission: fieldsFor('WidgetEmission'),
      record: fieldsFor('WidgetIntentRecord'),
      submission: fieldsFor('WidgetIntentSubmissionAudit'),
      receipt: fieldsFor('WidgetIntentReceipt'),
      render: fieldsFor('WidgetRenderReceipt'),
      draft: fieldsFor('WidgetDraft'),
    } as const;

    const tombstonesWritten = await tx.$executeRaw`
        WITH turn_scope AS MATERIALIZED (
          SELECT t."id", t."erasedAt"
          FROM "WidgetTimelineTurn" t
          WHERE t."tenantId" = ${request.tenantId}
            AND t."conversationId" = ${request.conversationId}::uuid
            AND t."principalProofHash" = ${request.subjectPrincipalProofHash}
        ),
        turn_targets AS MATERIALIZED (
          SELECT "id" FROM turn_scope WHERE "erasedAt" IS NULL
        ),
        emission_scope AS MATERIALIZED (
          SELECT e."id", e."widgetId", e."erasedAt"
          FROM "WidgetEmission" e
          JOIN turn_scope t ON t."id" = e."turnId"
          WHERE e."tenantId" = ${request.tenantId}
        ),
        emission_targets AS MATERIALIZED (
          SELECT "id" FROM emission_scope WHERE "erasedAt" IS NULL
        ),
        record_scope AS MATERIALIZED (
          SELECT r."id", r."intentTokenHash", r."confirmationOfKind", r."confirmationOfRef", r."erasedAt"
          FROM "WidgetIntentRecord" r
          JOIN emission_scope e ON e."widgetId" = r."widgetId"
          WHERE r."tenantId" = ${request.tenantId}
            AND r."principalProofHash" = ${request.subjectPrincipalProofHash}
        ),
        record_targets AS MATERIALIZED (
          SELECT "id" FROM record_scope WHERE "erasedAt" IS NULL
        ),
        submission_targets AS MATERIALIZED (
          SELECT a."id"
          FROM "WidgetIntentSubmissionAudit" a
          JOIN record_scope r ON r."intentTokenHash" = a."intentTokenHash"
          WHERE a."tenantId" = ${request.tenantId}
            AND a."erasedAt" IS NULL
        ),
        receipt_targets AS MATERIALIZED (
          SELECT r."id"
          FROM "WidgetIntentReceipt" r
          JOIN record_scope i ON i."intentTokenHash" = r."intentTokenHash"
          WHERE r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
        ),
        render_targets AS MATERIALIZED (
          SELECT r."id"
          FROM "WidgetRenderReceipt" r
          JOIN emission_scope e ON e."widgetId" = r."widgetId"
          WHERE r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
        ),
        draft_targets AS MATERIALIZED (
          SELECT d."id"
          FROM "WidgetDraft" d
          WHERE d."tenantId" = ${request.tenantId}
            AND d."principalProofHash" = ${request.subjectPrincipalProofHash}
            AND d."erasedAt" IS NULL
            AND EXISTS (
              SELECT 1 FROM record_scope r
              WHERE r."confirmationOfKind" = 'draft'
                AND r."confirmationOfRef" = d."draftRef"
            )
        ),
        erased_turns AS (
          UPDATE "WidgetTimelineTurn" t
          SET "textContent" = NULL,
              "spokenTranscript" = NULL,
              "erasedAt" = ${now}
          FROM turn_targets x
          WHERE t."id" = x."id" AND t."tenantId" = ${request.tenantId}
            AND t."erasedAt" IS NULL
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
            AND e."erasedAt" IS NULL
          RETURNING e."id"
        ),
        erased_records AS (
          UPDATE "WidgetIntentRecord" r
          SET "utteranceTemplate" = NULL,
              "renderedUtterance" = NULL,
              "selectedLabels" = ARRAY[]::text[],
              "selectionDomainLabelsJson" = NULL,
              "retainedLocalBusinessDate" = NULL,
              "spokenTranscript" = NULL,
              "erasedAt" = ${now}
          FROM record_targets x
          WHERE r."id" = x."id" AND r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
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
            AND a."erasedAt" IS NULL
          RETURNING a."id"
        ),
        erased_receipts AS (
          UPDATE "WidgetIntentReceipt" r
          SET "utteranceEcho" = NULL,
              "erasedAt" = ${now}
          FROM receipt_targets x
          WHERE r."id" = x."id" AND r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
          RETURNING r."id"
        ),
        erased_renders AS (
          UPDATE "WidgetRenderReceipt" r
          SET "composedEnvelopeJson" = NULL,
              "emittedEnvelopeJson" = NULL,
              "erasedAt" = ${now}
          FROM render_targets x
          WHERE r."id" = x."id" AND r."tenantId" = ${request.tenantId}
            AND r."erasedAt" IS NULL
          RETURNING r."id"
        ),
        erased_drafts AS (
          UPDATE "WidgetDraft" d
          SET "diffJson" = NULL,
              "erasedAt" = ${now}
          FROM draft_targets x
          WHERE d."id" = x."id" AND d."tenantId" = ${request.tenantId}
            AND d."erasedAt" IS NULL
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
      `;

    const repaired = await this.repairRetainedTerminalContent(tx, request, now);
    return Object.freeze({ tombstonesWritten: tombstonesWritten + repaired });
  }

  /** Remove legacy narrative accidentally retained in the audit-only terminal JSON.
   * Only emissions already tombstoned by THIS request are eligible. A completion
   * replay may repair those bytes, never erase a new row or change its completion.
   * Tombstones name the exact removed JSON pointers; outcome/ref audit survives.
   */
  async repairRetainedTerminalContent(
    tx: RequestTx,
    request: ConversationErasureRequest,
    now: Date,
  ): Promise<number> {
    this.assertRequest(request);
    return tx.$executeRaw`
      WITH candidates AS MATERIALIZED (
        SELECT e."id", e."terminalLinesJson" AS data
        FROM "WidgetEmission" e
        JOIN "WidgetTimelineTurn" t ON t."id" = e."turnId" AND t."tenantId" = e."tenantId"
        WHERE e."tenantId" = ${request.tenantId}
          AND t."conversationId" = ${request.conversationId}::uuid
          AND t."principalProofHash" = ${request.subjectPrincipalProofHash}
          AND t."erasedAt" IS NOT NULL AND e."erasedAt" IS NOT NULL
          AND e."terminalLinesJson" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "WidgetErasureTombstone" prior
            WHERE prior."tenantId" = e."tenantId"
              AND prior."erasureRequestRef" = ${request.erasureRequestRef}
              AND prior."store" = 'timeline'
              AND prior."rowKey" = 'WidgetEmission/' || e."id"::text
              AND prior."fieldsErased" @> ARRAY['/bodyJson']::text[]
          )
      ), projections AS MATERIALIZED (
        SELECT c."id",
          CASE WHEN jsonb_typeof(c.data) = 'array' THEN (
            SELECT COALESCE(jsonb_agg(
              CASE WHEN jsonb_typeof(item.value) = 'object' THEN (
                SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
                FROM jsonb_each(item.value) kv
                WHERE kv.key IN ('outcome', 'action_receipt_ref')
              ) ELSE 'null'::jsonb END ORDER BY item.ordinality
            ), '[]'::jsonb)
            FROM jsonb_array_elements(c.data) WITH ORDINALITY item
          ) ELSE NULL END AS retained,
          CASE WHEN jsonb_typeof(c.data) = 'array' THEN ARRAY(
            SELECT '/terminalLinesJson/' || (item.ordinality - 1)::text ||
              CASE WHEN jsonb_typeof(item.value) = 'object'
                THEN '/' || replace(replace(k.key, '~', '~0'), '/', '~1') ELSE '' END
            FROM jsonb_array_elements(c.data) WITH ORDINALITY item
            CROSS JOIN LATERAL (
              SELECT key FROM jsonb_object_keys(
                CASE WHEN jsonb_typeof(item.value) = 'object' THEN item.value ELSE '{}'::jsonb END
              ) key WHERE key NOT IN ('outcome', 'action_receipt_ref')
              UNION ALL SELECT '' WHERE jsonb_typeof(item.value) NOT IN ('object', 'null')
            ) k
            ORDER BY item.ordinality, k.key
          ) ELSE ARRAY['/terminalLinesJson']::text[] END AS paths
        FROM candidates c
      ), repaired AS (
        UPDATE "WidgetEmission" e SET "terminalLinesJson" = p.retained
        FROM projections p WHERE e."id" = p."id" AND e."tenantId" = ${request.tenantId}
          AND e."terminalLinesJson" IS DISTINCT FROM p.retained
          AND cardinality(p.paths) > 0
        RETURNING e."id", p.paths
      )
      INSERT INTO "WidgetErasureTombstone"
        ("id", "tenantId", "erasedAt", "erasureRequestRef", "store", "rowKey", "fieldsErased")
      SELECT gen_random_uuid(), ${request.tenantId}, ${now}, ${request.erasureRequestRef},
        'timeline', 'WidgetEmission/' || "id"::text, paths FROM repaired
    `;
  }

  private assertRequest(request: ConversationErasureRequest): void {
    for (const [name, value] of Object.entries({
      tenantId: request.tenantId,
      conversationId: request.conversationId,
      erasureRequestRef: request.erasureRequestRef,
      subjectPrincipalProofHash: request.subjectPrincipalProofHash,
    }))
      if (typeof value !== 'string' || value.trim().length === 0)
        throw new ErasureRefusal(
          `${name} is required for conversation erasure`,
        );
    // UUID aliases must not use different advisory locks for the same database tuple.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        request.conversationId,
      )
    )
      throw new ErasureRefusal('conversationId must be a canonical UUID');
  }
}
