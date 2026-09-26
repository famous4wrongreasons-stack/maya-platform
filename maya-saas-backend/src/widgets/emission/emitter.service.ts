// P-MINT — the single compose → type → fit → seal → record pipeline.
//
// Effect and target semantics come only from `intent-template.registry.ts`. The request carries a
// WidgetComposerInput and server-resolved principal proof; neither a client nor an LLM can put an
// effect or target on the wire. There is no token-minting overload without both values.

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { AuthorityEnvelope } from '../../widget-contract/envelope-roots';
import type { WidgetKind } from '../../widget-contract/kinds';
import type { C9Domain } from '../../widget-contract/ambient';
import { profileFor } from '../carriers/channel-profile';
import { fit } from '../carriers/fitter';
import { stableActionJson } from '../authority/contract-bindings';
import type { PrincipalView } from '../gate.types';
import { assertNoForbiddenKeys } from '../validation/f88-walk';
import { assertComposerInput } from './envelope-validator';
import {
  A2_GAP_REF,
  IntentTemplateRefusal,
  resolveIntentTemplate,
} from './intent-template.registry';
import {
  intentRecordData,
  mintIntentMaterial,
  type BookingConfirmationLinkage,
  type MintedIntentMaterial,
} from './record-writer';
import { SealService } from './seal.service';
import {
  buildEnvelopeWithoutSeal,
  envelopeBodyHash,
  f88NestedShapesForEnvelope,
} from './envelope.factory';
import {
  type RetainedLocalBusinessDate,
  validateRetainedLocalBusinessDate,
} from '../query-scalars/local-business-date';
import { BOOKING_ACTUATING_TEMPLATES_DISCHARGED } from '../booking/booking-discharge.runtime';
import {
  bookingTemplateAsIntentRow,
  resolveBookingTemplateForSynthesis,
} from '../booking/booking-intent-template.registry';
import { presentBookingSelector } from '../booking/booking-selector.presenter';
import type { OwnerNounIdentity } from '../noun-resolution/noun-handle.codec';

export const K3_EMITTABLE_KINDS = [
  'METRIC',
  'SCHEDULE',
  'SOURCE_STATUS',
  'PROGRESS',
  'LIMITATION',
] as const;
export type K3EmittableKind = (typeof K3_EMITTABLE_KINDS)[number];

export interface MintRequest {
  tenantId: string;
  conversationId: string;
  turnId: string;
  kind: WidgetKind;
  principalProofHash: string;
  deliveryChannel: string;
  /** Server-composed body. It carries facts and presentation only; never intent effect semantics. */
  body: Record<string, unknown>;
  ttlSeconds: number;
  freshnessClass: 'live' | 'scenario' | 'proactive_once' | 'static';
  /** Server-derived body classification. Client-identifying envelopes never persist slotted copy. */
  piiClass?: AuthorityEnvelope['pii_class'];
  /** The only projector value the minter accepts. */
  composerInput: WidgetComposerInput;
  /** Canonical server-resolved principal. Its proof hash must equal `principalProofHash`. */
  principal: PrincipalView;
  /** The only retained scalar. Server-validated and scoped to operations.journal.read. */
  retainedQueryScalar?: RetainedLocalBusinessDate;
  /** P-MT1: server-derived run witness metadata; never accepted from a client. */
  runWitness?: Readonly<{
    revisionId: string;
    c9Domain: C9Domain;
  }>;
}

export interface SealedEmission {
  widgetId: string;
  bodyHash: string;
  envelopeSeal: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Compatibility accessor for existing fixtures: the first minted token, if one exists. */
  intentToken: string | null;
  intentTokenHash: string | null;
  intentTokens: readonly string[];
  intentTokenHashes: readonly string[];
  kind: WidgetKind;
  a2Limited: boolean;
  /** The exact stored envelope returned by a widget-layer successor edge. */
  envelope: Readonly<Record<string, unknown>>;
}

export interface BookingSelectorContext {
  readonly source: unknown;
  readonly inheritedHandles?: Readonly<Record<string, string>>;
  readonly predecessorWidgetId?: string;
}

interface SuccessorEmissionContext {
  readonly sourceCapability: CapabilityRef;
  readonly textEquivalent: Readonly<Record<string, unknown>>;
}

export type BookingConfirmationEmissionContext = BookingConfirmationLinkage;

@Injectable()
export class WidgetEmitterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seals: SealService,
  ) {}

  /**
   * The canonical P-MINT entry. `composerInput` is the only projector value read; `principal` is the
   * one server-resolved authority view. The rest of `request` is transport/store context already
   * owned by the emission service, and contains no effect or target member.
   */
  async emit(request: MintRequest, now = new Date()): Promise<SealedEmission> {
    return this.emitInternal(request, now, null, null, null);
  }

  /** FBE2E-2: server-owned canonical facts become a strict selector and closed-domain intent. */
  async emitBookingSelector(
    request: MintRequest,
    selector: BookingSelectorContext,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      request.kind !== 'SERVICE_SELECTOR' &&
      request.kind !== 'STAFF_SELECTOR' &&
      request.kind !== 'TIME_SLOT_SELECTOR'
    )
      throw new IntentTemplateRefusal('booking_selector_kind_required');
    const presented = presentBookingSelector({
      tenantId: request.tenantId,
      kind: request.kind,
      source: selector.source,
      inherited: selector.inheritedHandles,
      mint: (identity: OwnerNounIdentity) =>
        this.seals.mintNounHandles([identity])[identity.noun],
    });
    if (presented === null)
      throw new IntentTemplateRefusal('booking_selector_source_unavailable');
    const template =
      request.kind === 'SERVICE_SELECTOR'
        ? 'refine.booking.service@1'
        : request.kind === 'STAFF_SELECTOR'
          ? 'refine.booking.staff@1'
          : 'draft.booking.selection@1';
    const sourceCapability =
      request.kind === 'SERVICE_SELECTOR'
        ? 'catalog.services.read'
        : request.kind === 'STAFF_SELECTOR'
          ? 'catalog.staff.read'
          : 'booking.availability.read';
    const intentCapability =
      request.kind === 'TIME_SLOT_SELECTOR'
        ? 'appointments.own.create'
        : sourceCapability;
    const composerInput: WidgetComposerInput = {
      ...request.composerInput,
      kind_proposal: request.kind,
      capability: sourceCapability,
      intent_proposals: [
        {
          intent_template_key: template,
          capability: { space: 'C9', key: intentCapability },
          argument_handles: selector.inheritedHandles ?? {},
          role: 'primary',
        },
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ],
    };
    return this.emitInternal(
      {
        ...request,
        body: presented.body as unknown as Record<string, unknown>,
        composerInput,
      },
      now,
      null,
      null,
      selector.predecessorWidgetId ?? null,
    );
  }

  /** R3.9.4's dedicated server-owned lane. Generic composer calls cannot resolve this template. */
  async emitSuccessor(
    request: MintRequest,
    sourceCapability: CapabilityRef,
    textEquivalent: Readonly<Record<string, unknown>>,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      request.composerInput.intent_proposals.length !== 1 ||
      request.composerInput.intent_proposals[0]?.intent_template_key !==
        'refine.successor@1' ||
      request.composerInput.intent_proposals[0]?.role !== 'remedy'
    )
      throw new IntentTemplateRefusal('successor_shape_invalid');
    return this.emitInternal(
      request,
      now,
      { sourceCapability, textEquivalent },
      null,
      null,
    );
  }

  /**
   * K7's only confirmation minter. The linkage is a server-owned owner result and never appears in
   * WidgetComposerInput. Until P-DISCHARGE flips the exact booking recipes this path fails closed.
   */
  async emitBookingConfirmation(
    request: MintRequest,
    linkage: BookingConfirmationEmissionContext,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (!BOOKING_ACTUATING_TEMPLATES_DISCHARGED)
      throw new IntentTemplateRefusal('a2_booking_not_discharged');
    if (request.kind !== 'BOOKING_CONFIRMATION')
      throw new IntentTemplateRefusal('booking_confirmation_kind_required');
    return this.emitInternal(request, now, null, linkage, null);
  }

  private async emitInternal(
    request: MintRequest,
    now: Date,
    successor: SuccessorEmissionContext | null,
    booking: BookingConfirmationEmissionContext | null,
    supersedesWidgetId: string | null,
  ): Promise<SealedEmission> {
    const input = request.composerInput;
    const principal = request.principal;
    if (
      principal.authority.tenantId !== request.tenantId ||
      principal.proofHash !== request.principalProofHash
    )
      throw new IntentTemplateRefusal('principal_mismatch');
    assertComposerInput(input);
    if (input.kind_proposal !== request.kind)
      throw new IntentTemplateRefusal('request_kind_mismatch');

    const retainedLocalBusinessDate = this.retainedJournalDate(request);

    const resolved = input.intent_proposals.map((proposal) => {
      const bookingKey =
        proposal.intent_template_key.startsWith('draft.booking.') ||
        proposal.intent_template_key.startsWith('refine.booking.') ||
        proposal.intent_template_key.startsWith('commit.booking.');
      if (bookingKey && !BOOKING_ACTUATING_TEMPLATES_DISCHARGED)
        throw new IntentTemplateRefusal('a2_booking_not_discharged');
      if (
        proposal.intent_template_key.startsWith('commit.booking.') &&
        booking === null
      )
        throw new IntentTemplateRefusal(
          'booking_confirmation_context_required',
        );
      const bookingTemplate = bookingKey
        ? resolveBookingTemplateForSynthesis({
            proposal,
            widgetKind: input.kind_proposal,
            deliveryChannel: request.deliveryChannel,
          })
        : null;
      return {
        proposal,
        resolved: bookingTemplate
          ? {
              kind: 'intent' as const,
              row: bookingTemplateAsIntentRow(
                bookingTemplate,
                bookingSelectionDomain(
                  bookingTemplate.selectionField,
                  request.body,
                ),
              ),
            }
          : resolveIntentTemplate({
              proposal,
              widgetKind: input.kind_proposal,
              deliveryChannel: request.deliveryChannel,
              ...(successor === null
                ? {}
                : { successorSourceCapability: successor.sourceCapability }),
            }),
      };
    });

    const a2Limited = resolved.some(
      (entry) => entry.resolved.kind === 'a2_limitation',
    );
    const kind: WidgetKind = a2Limited ? 'LIMITATION' : input.kind_proposal;
    const body = a2Limited
      ? {
          limitation_codes: [
            ...new Set([...input.limitation_codes, A2_GAP_REF]),
          ],
          capability_gap_ref: A2_GAP_REF,
        }
      : request.body;
    const issuedAt = now;
    const expiresAt = new Date(now.getTime() + request.ttlSeconds * 1000);
    const widgetId = randomUUID();
    const materials: MintedIntentMaterial[] = a2Limited
      ? []
      : resolved.map((entry, index) => {
          if (entry.resolved.kind !== 'intent')
            throw new IntentTemplateRefusal('mixed_a2_resolution');
          return mintIntentMaterial({
            input,
            proposal: entry.proposal,
            resolved: entry.resolved,
            intentIndex: index,
            issuedAt,
            envelopeExpiresAt: expiresAt,
            slotless: request.piiClass === 'client_identified',
          });
        });

    const tokened = materials.filter(
      (m): m is MintedIntentMaterial & { token: string; tokenHash: string } =>
        m.token !== null && m.tokenHash !== null,
    );
    const fitting = fit({
      carrier: request.deliveryChannel,
      intents: tokened.map((m) => ({
        token: m.token,
        label: m.intent.label,
        role: m.intent.role,
        isEscape: m.intent.role === 'escape',
      })),
      bodyText: stableActionJson(body),
      reachableVia:
        tokened.find((m) => m.intent.role === 'escape')?.token ?? 'shell.root',
      remedyOnlySuccessor: successor !== null,
    });
    const emittedTokens = new Set(fitting.emitted.map((i) => i.token));
    const emittedIntents = materials.filter(
      (m) => m.token === null || emittedTokens.has(m.token),
    );
    const profile = profileFor(request.deliveryChannel);
    if (!profile) throw new IntentTemplateRefusal('carrier_unknown');
    const unsignedEnvelope = buildEnvelopeWithoutSeal({
      widgetId,
      tenantId: request.tenantId,
      turnId: request.turnId,
      kind,
      body,
      intents: emittedIntents.map((material) => material.intent),
      input,
      principal,
      fitting,
      deliveryChannel: request.deliveryChannel,
      freshnessClass: request.freshnessClass,
      piiClass: request.piiClass ?? 'none',
      issuedAt,
      expiresAt,
      ttlSeconds: request.ttlSeconds,
      limitations: a2Limited ? [A2_GAP_REF] : input.limitation_codes,
      textEquivalentOverride: successor?.textEquivalent ?? null,
      supersedesWidgetId,
    });
    const bodyHash = envelopeBodyHash(unsignedEnvelope);
    const envelopeSeal = this.seals.seal({
      bodyHash,
      widgetId,
      tenantId: request.tenantId,
      principalProofHash: principal.proofHash,
      issuedAt,
      expiresAt,
      profileId: profile.profileId,
    });
    const envelopeForSeal = Object.freeze({
      ...unsignedEnvelope,
      integrity: Object.freeze({
        ...(unsignedEnvelope.integrity as unknown as Record<string, unknown>),
        body_hash: bodyHash,
        envelope_seal: envelopeSeal,
      }),
    });
    assertNoForbiddenKeys(
      'WidgetEnvelope',
      envelopeForSeal,
      f88NestedShapesForEnvelope(kind),
    );
    if (Buffer.byteLength(stableActionJson(envelopeForSeal), 'utf8') > 32_768)
      throw new IntentTemplateRefusal('envelope_oversize');

    const emittedTokened = emittedIntents.filter(
      (
        material,
      ): material is MintedIntentMaterial & {
        token: string;
        tokenHash: string;
      } => material.token !== null && material.tokenHash !== null,
    );
    const recordWrites = emittedTokened.map((material) =>
      this.prisma.widgetIntentRecord.create({
        data: intentRecordData({
          material,
          input,
          tenantId: request.tenantId,
          widgetId,
          principalProofHash: principal.proofHash,
          bodyHash,
          body,
          issuedAt,
          retainedLocalBusinessDate,
          revisionId: request.runWitness?.revisionId ?? null,
          c9Domain: request.runWitness?.c9Domain ?? null,
          bookingLinkage: booking,
        }) as never,
      }),
    );
    await this.prisma.$transaction([
      this.prisma.widgetEmission.create({
        data: {
          tenantId: request.tenantId,
          widgetId,
          turnId: request.turnId,
          kind,
          bodyVersion: 1,
          envelopeSeal,
          bodyHash,
          lifecycleState: 'MINTED',
          freshnessClass: request.freshnessClass,
          issuedAt,
          expiresAt,
          retentionSec: request.ttlSeconds,
          retentionUntil: expiresAt,
          dedupeKey: `${kind}:${request.conversationId}:${bodyHash.slice(0, 16)}`,
          deliveryChannel: request.deliveryChannel,
          deliveryStateJson: { state: 'composed', delivered: false } as never,
          bodyJson: body as never,
          ...(supersedesWidgetId === null ? {} : { supersedesWidgetId }),
          ...(successor === null
            ? {}
            : { textEquivalentJson: successor.textEquivalent as never }),
        },
      }),
      ...recordWrites,
      this.prisma.widgetRenderReceipt.create({
        data: {
          tenantId: request.tenantId,
          widgetId,
          profileId: profile.profileId,
          profileVersion: 1,
          renderTier: fitting.tier,
          intentsMinted: materials.length,
          intentsEmitted: emittedIntents.length,
          intentsWithheldJson: fitting.intentsWithheld as never,
          bodyReductionsJson: fitting.bodyReductions as never,
          textEquivalentIsCanonical: fitting.textEquivalentIsCanonical,
          degradedAt: issuedAt,
          deliveryChannel: request.deliveryChannel,
          composedEnvelopeJson: envelopeForSeal as never,
          emittedEnvelopeJson: envelopeForSeal as never,
        },
      }),
    ]);

    return Object.freeze({
      widgetId,
      bodyHash,
      envelopeSeal,
      issuedAt,
      expiresAt,
      intentToken: emittedTokened[0]?.token ?? null,
      intentTokenHash: emittedTokened[0]?.tokenHash ?? null,
      intentTokens: Object.freeze(emittedTokened.map((m) => m.token)),
      intentTokenHashes: Object.freeze(emittedTokened.map((m) => m.tokenHash)),
      kind,
      a2Limited,
      envelope: Object.freeze(envelopeForSeal),
    });
  }

  private retainedJournalDate(request: MintRequest): string | null {
    const scalar = request.retainedQueryScalar;
    if (scalar === undefined) return null;
    if (
      request.kind !== 'SCHEDULE' ||
      request.composerInput.capability !== 'operations.journal.read' ||
      !request.composerInput.intent_proposals.some(
        (proposal) => proposal.intent_template_key === 'refine.journal.date@1',
      )
    )
      throw new IntentTemplateRefusal('retained_query_scalar_not_permitted');
    return validateRetainedLocalBusinessDate(scalar);
  }

  async verifySeal(tenantId: string, widgetId: string): Promise<boolean> {
    const row = await this.prisma.widgetEmission.findFirst({
      where: { tenantId, widgetId },
      select: {
        widgetId: true,
        tenantId: true,
        bodyHash: true,
        issuedAt: true,
        expiresAt: true,
        envelopeSeal: true,
        bodyJson: true,
        deliveryChannel: true,
      },
    });
    if (!row) return false;
    const receipt = await this.prisma.widgetRenderReceipt.findFirst({
      where: { tenantId, widgetId, deliveryChannel: row.deliveryChannel },
      select: { profileId: true, emittedEnvelopeJson: true },
    });
    if (!receipt) return false;
    const record = await this.prisma.widgetIntentRecord.findFirst({
      where: { tenantId, widgetId },
      select: { principalProofHash: true },
    });
    if (!record) return false;
    const emittedEnvelope = receipt.emittedEnvelopeJson;
    const bodyStillMatches =
      isRecord(emittedEnvelope) &&
      stableActionJson(emittedEnvelope.body) ===
        stableActionJson(row.bodyJson) &&
      envelopeBodyHash(emittedEnvelope) === row.bodyHash;
    const expected = this.seals.seal({
      bodyHash: row.bodyHash,
      widgetId: row.widgetId,
      tenantId: row.tenantId,
      principalProofHash: record.principalProofHash,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      profileId: receipt.profileId,
    });
    return bodyStillMatches && expected === row.envelopeSeal;
  }
}

const bookingSelectionDomain = (
  field: 'service_ref' | 'staff_ref' | 'slot_ref' | null,
  body: Readonly<Record<string, unknown>>,
):
  | { ids: readonly string[]; labels: Readonly<Record<string, string>> }
  | undefined => {
  if (field === null) return undefined;
  const candidates: unknown[] = [];
  if (field === 'slot_ref' && Array.isArray(body.groups)) {
    const groups: unknown[] = body.groups;
    for (const group of groups)
      if (isRecordValue(group) && Array.isArray(group.slots))
        candidates.push(...(group.slots as unknown[]));
  } else if (Array.isArray(body.options)) {
    candidates.push(...(body.options as unknown[]));
  }
  const ids: string[] = [];
  const labels: Record<string, string> = {};
  for (const candidate of candidates) {
    if (!isRecordValue(candidate)) continue;
    const id = candidate[field] ?? candidate.option_id;
    if (typeof id !== 'string' || id.length === 0) continue;
    ids.push(id);
    const label = isRecordValue(candidate.label)
      ? candidate.label.label
      : undefined;
    const start = isRecordValue(candidate.start)
      ? candidate.start.label
      : undefined;
    labels[id] =
      typeof label === 'string'
        ? label
        : typeof start === 'string'
          ? start
          : id;
  }
  if (ids.length === 0)
    throw new IntentTemplateRefusal('selection_domain_empty');
  return Object.freeze({
    ids: Object.freeze(ids),
    labels: Object.freeze(labels),
  });
};

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
