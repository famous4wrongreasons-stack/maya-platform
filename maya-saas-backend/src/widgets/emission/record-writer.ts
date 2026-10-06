import { randomBytes } from 'node:crypto';

import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { C9Domain } from '../../widget-contract/ambient';
import { subjectCapability } from '../../widget-contract/intent';
import type { WidgetIntent } from '../../widget-contract/intent';
import { stableActionJson } from '../authority/contract-bindings';
import { verificationFloor } from '../authority/verification-floor.runtime';
import {
  bookingConfirmationSubjectFor,
  type BookingConfirmationSubject,
} from '../authority/ae-commit-allowlist.runtime';
import { encodeSelectionDomain } from '../input-schema/codec';
import { inputSchemaHash } from '../input-schema/input-schema-hash';
import { parseInputSchema } from '../input-schema/parse-input-schema';
import { sha256Hex } from '../token.util';
import { servicePriceDecision } from '../pricing/service-price-intent-template.registry';
import {
  IntentTemplateRefusal,
  type ResolvedIntentTemplate,
} from './intent-template.registry';

export interface MintedIntentMaterial {
  readonly proposal: IntentProposal;
  readonly intent: WidgetIntent;
  readonly token: string | null;
  readonly tokenHash: string | null;
  readonly selectionDomain: string;
  readonly inputSchemaHash: string | null;
  readonly utteranceTemplate: string;
  readonly selectionDomainLabels: Readonly<
    Record<string, Readonly<Record<string, string>>>
  > | null;
}

export interface BookingConfirmationLinkage {
  readonly commitIntentIndex: number;
  readonly confirmationOfKind: 'draft' | 'record';
  readonly confirmationOfRef: string;
  readonly producedByIntentTokenHash: string | null;
  readonly idempotencyKey: string;
  readonly requiresReadback: boolean;
  readonly readbackRef: string | null;
}

export interface ServicePriceApprovalLinkage {
  readonly approvalId: string;
  readonly payloadHash: string;
  readonly revalidate: () => Promise<void>;
}

const cellTrue = (label: string): WidgetIntent['enabled'] => ({
  state: 'KNOWN',
  value: true,
  label,
  reason_code: null,
  fact_ref: null,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
});

const subjectFields = (
  resolved: Extract<ResolvedIntentTemplate, { kind: 'intent' }>,
): {
  capability: WidgetIntent['capability'];
  handoff: WidgetIntent['handoff_capability_ref'];
} =>
  resolved.row.effect === 'HANDOFF'
    ? { capability: null, handoff: resolved.row.subject }
    : { capability: resolved.row.subject, handoff: null };

export const mintIntentMaterial = (args: {
  readonly input: WidgetComposerInput;
  readonly proposal: IntentProposal;
  readonly resolved: Extract<ResolvedIntentTemplate, { kind: 'intent' }>;
  readonly intentIndex: number;
  readonly issuedAt: Date;
  readonly envelopeExpiresAt: Date;
  readonly slotless: boolean;
  readonly servicePriceLinkage?: ServicePriceApprovalLinkage | null;
}): MintedIntentMaterial => {
  const { row } = args.resolved;
  const subjects = subjectFields(args.resolved);
  const expiresAt = new Date(
    Math.min(
      args.envelopeExpiresAt.getTime(),
      args.issuedAt.getTime() + row.ttlSeconds * 1000,
    ),
  );
  const token =
    row.effect === 'NONE' ? null : randomBytes(24).toString('base64url');
  const schema = row.inputSchema;
  let schemaHash: string | null = null;
  if (schema !== null) {
    const parsed = parseInputSchema(schema);
    if (!parsed.ok)
      throw new IntentTemplateRefusal('registered_input_schema_invalid');
    schemaHash = inputSchemaHash(parsed.schema);
  }
  const encoded = encodeSelectionDomain(row.selectionDomain);
  if (!encoded.ok)
    throw new IntentTemplateRefusal('registered_selection_domain_invalid');

  const utteranceTemplate = args.slotless ? row.label : row.utteranceTemplate;
  const priceDecision = servicePriceDecision(args.proposal.intent_template_key);
  if (priceDecision !== null && !args.servicePriceLinkage)
    throw new IntentTemplateRefusal('service_price_approval_context_required');
  const intent: WidgetIntent = {
    intent_ref: `i${args.intentIndex + 1}`,
    intent_token: token,
    role: args.proposal.role,
    label: row.label,
    utterance_preview: utteranceTemplate.replace('{{selection}}', row.label),
    speech_aliases: [...row.speechAliases],
    ordinal: args.intentIndex + 1,
    priority: row.priority,
    effect: row.effect,
    capability: subjects.capability,
    handoff_capability_ref: subjects.handoff,
    target: row.target,
    input_schema: schema,
    verification_floor: verificationFloor(
      {
        effect: row.effect,
        capability: subjects.capability,
        handoff_capability_ref: subjects.handoff,
        target: row.target,
        priority: row.priority,
      },
      args.input.kind_proposal,
    ),
    confirmation:
      priceDecision === null
        ? null
        : {
            risk_tier: 'high_write',
            reversible: {
              ...cellTrue(
                'Для обратного изменения потребуется новое подтверждение',
              ),
              value: false,
            },
            audience_size: null,
            requires_explicit_confirm_step: true,
            requires_readback: false,
            readback_ref: null,
            readback_text: null,
            idempotency_key: `service-price:${args.servicePriceLinkage!.approvalId}:${args.servicePriceLinkage!.payloadHash}:${priceDecision}`,
            approval_policy: 'actor',
          },
    authority_hint: {
      emphasis: row.priority === 0 ? 'muted' : 'secondary',
      disabled_because: null,
    },
    enabled: cellTrue(row.label),
    expires_at: expiresAt.toISOString(),
    single_use: row.singleUse,
  };

  return Object.freeze({
    proposal: args.proposal,
    intent,
    token,
    tokenHash: token === null ? null : sha256Hex(token),
    selectionDomain: encoded.value,
    inputSchemaHash: schemaHash,
    utteranceTemplate,
    selectionDomainLabels: args.slotless ? null : row.selectionDomainLabels,
  });
};

export const requestedScopeHash = (args: {
  readonly input: WidgetComposerInput;
  readonly tenantId: string;
  readonly principalProofHash: string;
}): string =>
  sha256Hex(
    stableActionJson({
      tenant_id: args.tenantId,
      principal_proof_hash: args.principalProofHash,
      source: args.input.source,
      correlation_refs: args.input.correlation_refs,
      origin: args.input.origin,
      capability: args.input.capability,
      capability_version: args.input.capability_version,
    }),
  );

export const intentRecordData = (args: {
  readonly material: MintedIntentMaterial;
  readonly input: WidgetComposerInput;
  readonly tenantId: string;
  readonly widgetId: string;
  readonly principalProofHash: string;
  readonly bodyHash: string;
  readonly body: unknown;
  readonly issuedAt: Date;
  readonly retainedLocalBusinessDate?: string | null;
  readonly revisionId?: string | null;
  readonly c9Domain?: C9Domain | null;
  readonly bookingLinkage?: BookingConfirmationLinkage | null;
  readonly servicePriceLinkage?: ServicePriceApprovalLinkage | null;
}): Record<string, unknown> => {
  const { intent } = args.material;
  if (args.material.tokenHash === null)
    throw new IntentTemplateRefusal('none_has_no_record');
  const subject = subjectCapability(intent);
  const cap = intent.effect === 'HANDOFF' ? null : subject;
  const handoff = intent.effect === 'HANDOFF' ? subject : null;
  const retainsSourceCapability =
    intent.effect === 'NAVIGATE' &&
    (intent.target?.class === 'detail' || intent.target?.class === 'w');
  const runId = args.input.correlation_refs.run_id ?? null;
  const confirmationSubject = confirmationSubjectAtMint({
    kind: args.input.kind_proposal,
    body: args.body,
    intent,
  });
  const booking = args.bookingLinkage;
  const isBookingCommit =
    booking !== null &&
    booking !== undefined &&
    args.material.intent.ordinal === booking.commitIntentIndex + 1;
  if (isBookingCommit && intent.effect !== 'COMMIT')
    throw new IntentTemplateRefusal('booking_linkage_not_commit');
  const priceDecision = servicePriceDecision(
    args.material.proposal.intent_template_key,
  );
  if (
    priceDecision !== null &&
    (!args.servicePriceLinkage || intent.effect !== 'COMMIT')
  )
    throw new IntentTemplateRefusal('service_price_approval_context_required');
  return {
    tenantId: args.tenantId,
    intentTokenHash: args.material.tokenHash,
    widgetId: args.widgetId,
    principalProofHash: args.principalProofHash,
    widgetKind: args.input.kind_proposal,
    effect: intent.effect,
    priority: intent.priority,
    capabilitySpace: cap?.space ?? null,
    capabilityKey: cap?.key ?? null,
    handoffSpace: handoff?.space ?? null,
    handoffKey: handoff?.key ?? null,
    targetJson: intent.target,
    sourceCapabilitySpace: retainsSourceCapability ? 'C9' : null,
    sourceCapabilityKey: retainsSourceCapability ? args.input.capability : null,
    verificationFloor: intent.verification_floor,
    confirmationJson: isBookingCommit
      ? {
          requires_readback: booking.requiresReadback,
          readback_ref: booking.readbackRef,
          idempotency_key: booking.idempotencyKey,
        }
      : priceDecision === null
        ? null
        : {
            requires_readback: false,
            readback_ref: null,
            idempotency_key: intent.confirmation!.idempotency_key,
          },
    confirmationSubject,
    approvalDecision: priceDecision,
    inputSchemaHash: args.material.inputSchemaHash,
    requestedScopeHash: requestedScopeHash({
      input: args.input,
      tenantId: args.tenantId,
      principalProofHash: args.principalProofHash,
    }),
    bodyHash: args.bodyHash,
    selectionDomain: args.material.selectionDomain,
    c9Domain: args.c9Domain ?? null,
    runId,
    revisionId: args.revisionId ?? null,
    approvalOfIntentRef: null,
    confirmationOfKind: isBookingCommit
      ? booking.confirmationOfKind
      : priceDecision === null
        ? null
        : 'approval',
    confirmationOfRef: isBookingCommit
      ? booking.confirmationOfRef
      : priceDecision === null
        ? null
        : args.servicePriceLinkage!.approvalId,
    producedByIntentTokenHash: isBookingCommit
      ? booking.producedByIntentTokenHash
      : null,
    issuedAt: args.issuedAt,
    expiresAt: new Date(intent.expires_at),
    singleUse: intent.single_use,
    frozenNounsJson: args.material.proposal.argument_handles ?? {},
    utteranceTemplate: args.material.utteranceTemplate,
    renderedUtterance: null,
    selectedLabels: [],
    selectionDomainLabelsJson: args.material.selectionDomainLabels,
    retainedLocalBusinessDate:
      (intent.effect === 'REFINE' &&
        cap?.space === 'C9' &&
        cap.key === 'operations.journal.read') ||
      (args.material.proposal.intent_template_key ===
        'navigate.journal.detail@1' &&
        intent.effect === 'NAVIGATE' &&
        args.input.kind_proposal === 'SCHEDULE' &&
        args.input.capability === 'operations.journal.read' &&
        intent.target?.class === 'detail' &&
        intent.target.ref === 'fs.calendar')
        ? (args.retainedLocalBusinessDate ?? null)
        : null,
    spokenTranscript: null,
  };
};

const confirmationSubjectAtMint = (args: {
  readonly kind: WidgetComposerInput['kind_proposal'];
  readonly body: unknown;
  readonly intent: WidgetIntent;
}): BookingConfirmationSubject | null => {
  if (args.kind !== 'BOOKING_CONFIRMATION') return null;
  if (typeof args.body !== 'object' || args.body === null)
    throw new IntentTemplateRefusal('booking_confirmation_subject_invalid');
  const value = (args.body as { readonly confirmation_subject?: unknown })
    .confirmation_subject;
  if (value !== 'create' && value !== 'reschedule' && value !== 'cancel')
    throw new IntentTemplateRefusal('booking_confirmation_subject_invalid');
  if (args.intent.effect === 'COMMIT') {
    const derived = bookingConfirmationSubjectFor(
      subjectCapability(args.intent),
    );
    if (derived !== value)
      throw new IntentTemplateRefusal('booking_confirmation_subject_mismatch');
  }
  return value;
};
