import {
  GOODS_RECEIPT_CAPABILITY,
  GOODS_RECEIPT_TOOL,
} from '../../crm/goods-receipt.contract';
import {
  GOODS_RECEIPT_APPROVAL_NOUN_OWNER,
  goodsReceiptApprovalRef,
  parseGoodsReceiptApprovalRef,
} from '../inventory/goods-receipt-approval.port';
import {
  GOODS_RECEIPT_APPROVE_TEMPLATE,
  GOODS_RECEIPT_REJECT_TEMPLATE,
  GOODS_RECEIPT_DETAIL_TEMPLATE,
  isGoodsReceiptTemplate,
  resolveGoodsReceiptTemplate,
} from '../inventory/goods-receipt-intent-template.registry';
import {
  scheduleTemplate,
  SCHEDULE_TEMPLATE,
} from './schedule-intent-template';
import {
  BOOKING_NOUN_OWNERS,
  encodeBookingCatalogOwnerRef,
} from '../booking/booking-noun-identity';
import { presentPersonalSchedule } from '../booking/personal-schedule.presenter';
import type { PersonalScheduleSource } from '../owner-ports/personal-schedule.port';
import { WIDGET_RELEASE_ACCESS } from '../di-tokens';
import type { WidgetReleaseAccessPort } from '../owner-ports/release-access.port';
// P-MINT — the single compose → type → fit → seal → record pipeline.
//
// Effect and target semantics come only from `intent-template.registry.ts`. The request carries a
// WidgetComposerInput and server-resolved principal proof; neither a client nor an LLM can put an
// effect or target on the wire. There is no token-minting overload without both values.

import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  SERVICE_PRICE_CAPABILITY,
  SERVICE_PRICE_TOOL,
} from '../../crm/yclients-service-price.contract';
import {
  SERVICE_PRICE_APPROVAL_NOUN_OWNER,
  servicePriceApprovalRef,
  parseServicePriceApprovalRef,
} from '../pricing/service-price-approval.port';
import {
  SERVICE_PRICE_APPROVE_TEMPLATE,
  SERVICE_PRICE_REJECT_TEMPLATE,
  SERVICE_PRICE_DETAIL_TEMPLATE,
  isServicePriceTemplate,
  resolveServicePriceTemplate,
} from '../pricing/service-price-intent-template.registry';
import type {
  ServicePriceApprovalLinkage,
  GoodsReceiptApprovalLinkage,
} from './record-writer';

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
  readonly bookingSelection?: {
    readonly tenantId: string;
    readonly serviceId?: string;
    readonly scope:
      import('../booking/booking-noun-identity').BookingSlotScope | null;
  };
  readonly inheritedHandles?: Readonly<Record<string, string>>;
  readonly revalidateSource?: () => Promise<void>;
  readonly predecessorWidgetId?: string;
}

interface SuccessorEmissionContext {
  readonly sourceCapability: CapabilityRef;
  readonly textEquivalent: Readonly<Record<string, unknown>>;
}

export type BookingConfirmationEmissionContext = BookingConfirmationLinkage;
export type ServicePriceApprovalEmissionContext = ServicePriceApprovalLinkage;
export type GoodsReceiptApprovalEmissionContext = GoodsReceiptApprovalLinkage;

@Injectable()
export class WidgetEmitterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seals: SealService,
    @Inject(WIDGET_RELEASE_ACCESS)
    private readonly releaseAccess: WidgetReleaseAccessPort,
  ) {}

  /**
   * The canonical P-MINT entry. `composerInput` is the only projector value read; `principal` is the
   * one server-resolved authority view. The rest of `request` is transport/store context already
   * owned by the emission service, and contains no effect or target member.
   */
  async emit(request: MintRequest, now = new Date()): Promise<SealedEmission> {
    return this.emitInternal(request, now, null, null, null);
  }

  /** BS-1: canonical personal read and handle production, never a caller-selected Client/id. */
  async emitPersonalSchedule(
    request: MintRequest,
    source: PersonalScheduleSource,
    now = new Date(),
    parentWidgetId: string | null = null,
  ): Promise<SealedEmission> {
    if (
      request.kind !== 'SCHEDULE' ||
      request.composerInput.capability !== 'appointments.own.list' ||
      (parentWidgetId !== null &&
        request.composerInput.correlation_refs.parent_id !== parentWidgetId)
    )
      throw new IntentTemplateRefusal('personal_schedule_source_required');
    await source.revalidate();
    const presented = presentPersonalSchedule(
      request.tenantId,
      source,
      (identity) => this.seals.mintNounHandles([identity])[identity.noun],
      parentWidgetId !== null,
    );
    return this.emitInternal(
      {
        ...request,
        body: presented.body as unknown as Record<string, unknown>,
        piiClass: 'client_identified',
        composerInput: {
          ...request.composerInput,
          intent_proposals: presented.proposals,
        },
      },
      now,
      null,
      null,
      null,
      null,
      source,
      null,
      null,
      null,
      parentWidgetId,
    );
  }

  /** NS-1: only a freshly re-read journal detail may bind its exact retained parent. */
  async emitJournalDetail(
    request: MintRequest,
    parentWidgetId: string,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      request.kind !== 'SCHEDULE' ||
      request.composerInput.capability !== 'operations.journal.read' ||
      request.composerInput.correlation_refs.parent_id !== parentWidgetId
    )
      throw new IntentTemplateRefusal('journal_parent_source_mismatch');
    return this.emitInternal(request, now, null, null, null, parentWidgetId);
  }

  /** Public catalog remains the READ source; SB-1 independently verifies personal context. */
  async emitPersonalCatalogDetail(
    request: MintRequest,
    context: { revalidate(): Promise<void> },
    parentWidgetId: string,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      request.kind !== 'SERVICE_SELECTOR' ||
      request.composerInput.capability !== 'catalog.services.read' ||
      request.composerInput.source.from !== 'capability_envelope' ||
      request.composerInput.source.capability !== 'catalog.services.read' ||
      request.composerInput.correlation_refs.parent_id !== parentWidgetId
    )
      throw new IntentTemplateRefusal('personal_catalog_source_required');
    await context.revalidate();
    const shown = presentBookingSelector({
      tenantId: request.tenantId,
      kind: 'SERVICE_SELECTOR',
      source: request.body,
      mint: (identity) => this.seals.mintNounHandles([identity])[identity.noun],
    });
    if (!shown)
      throw new IntentTemplateRefusal('booking_selector_source_unavailable');
    // The public options retain the passive i1 reference; no selectable recipe or nested opener.
    return this.emitInternal(
      {
        ...request,
        body: shown.body as unknown as Record<string, unknown>,
        composerInput: {
          ...request.composerInput,
          intent_proposals: [
            { intent_template_key: 'none.passive@1', role: 'secondary' },
            {
              intent_template_key: 'control.dismiss@1',
              capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
              role: 'escape',
            },
          ],
        },
      },
      now,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { parentWidgetId, revalidate: () => context.revalidate() },
    );
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
    // Completed availability reads may start here without a prior selector. The
    // handler supplies catalog-qualified selection facts, never model arguments.
    const source = selector.source as Record<string, unknown> | null;
    const selection =
      source && typeof source === 'object' && !Array.isArray(source)
        ? (source.booking_selection as Record<string, unknown> | null)
        : null;
    const catalogRef = (
      id: string,
      scope: Parameters<typeof encodeBookingCatalogOwnerRef>[1],
    ) => {
      const ref = encodeBookingCatalogOwnerRef(id, scope);
      if (!ref)
        throw new IntentTemplateRefusal('booking_selector_source_unavailable');
      return ref;
    };
    const sourceScope =
      selection &&
      typeof selection.branchId === 'string' &&
      typeof selection.branchSourceRevision === 'string'
        ? {
            branchId: selection.branchId,
            sourceRevision: selection.branchSourceRevision,
          }
        : null;
    const inheritedHandles =
      selector.inheritedHandles ??
      (request.kind === 'STAFF_SELECTOR' &&
      selector.bookingSelection?.tenantId === request.tenantId &&
      selector.bookingSelection.serviceId
        ? this.seals.mintNounHandles([
            {
              tenantId: request.tenantId,
              noun: 'service',
              ownerKind: BOOKING_NOUN_OWNERS.service,
              ownerRef: catalogRef(
                selector.bookingSelection.serviceId,
                selector.bookingSelection.scope,
              ),
            },
          ])
        : undefined) ??
      (request.kind === 'TIME_SLOT_SELECTOR' &&
      selection?.tenantId === request.tenantId &&
      typeof selection.serviceId === 'string' &&
      typeof selection.staffId === 'string'
        ? this.seals.mintNounHandles([
            {
              tenantId: request.tenantId,
              noun: 'service',
              ownerKind: BOOKING_NOUN_OWNERS.service,
              ownerRef: catalogRef(selection.serviceId, sourceScope),
            },
            {
              tenantId: request.tenantId,
              noun: 'staff',
              ownerKind: BOOKING_NOUN_OWNERS.staff,
              ownerRef: catalogRef(selection.staffId, sourceScope),
            },
          ])
        : undefined);
    const hasBranchSlots =
      source &&
      Array.isArray(source.slots) &&
      source.slots.some(
        (slot: unknown) =>
          slot &&
          typeof slot === 'object' &&
          'branch_id' in slot &&
          slot.branch_id != null,
      );
    if (hasBranchSlots && !selector.revalidateSource)
      throw new IntentTemplateRefusal('booking_selector_source_unavailable');
    await selector.revalidateSource?.();
    const internalCalendar =
      request.kind === 'TIME_SLOT_SELECTOR' && hasBranchSlots
        ? (
            await this.prisma.tenant.findUnique({
              where: { id: request.tenantId },
              select: { calendarSource: true },
            })
          )?.calendarSource === 'internal'
        : false;
    const presented = presentBookingSelector({
      tenantId: request.tenantId,
      kind: request.kind,
      source: selector.source,
      inherited: inheritedHandles,
      scope: selector.bookingSelection?.scope,
      internalCalendar,
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
          argument_handles: inheritedHandles ?? {},
          role: 'primary',
        },
        ...(request.kind === 'SERVICE_SELECTOR'
          ? [
              {
                intent_template_key: 'navigate.personal-catalog@1',
                role: 'secondary' as const,
              },
            ]
          : []),
        {
          intent_template_key: 'control.dismiss@1',
          capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
          role: 'escape',
        },
      ],
    };
    const emitted = await this.emitInternal(
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
    try {
      await selector.revalidateSource?.();
    } catch (error) {
      await this.prisma.widgetEmission.updateMany({
        where: {
          tenantId: request.tenantId,
          widgetId: emitted.widgetId,
          lifecycleState: 'MINTED',
        },
        data: { lifecycleState: 'CANCELLED' },
      });
      throw error;
    }
    return emitted;
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
    supersedesWidgetId: string | null = null,
  ): Promise<SealedEmission> {
    if (!BOOKING_ACTUATING_TEMPLATES_DISCHARGED)
      throw new IntentTemplateRefusal('a2_booking_not_discharged');
    if (request.kind !== 'BOOKING_CONFIRMATION')
      throw new IntentTemplateRefusal('booking_confirmation_kind_required');
    return this.emitInternal(request, now, null, linkage, supersedesWidgetId);
  }

  /** Only the canonical chat approval owner can supply this source revalidation closure. */
  async emitServicePriceApproval(
    request: MintRequest,
    linkage: ServicePriceApprovalEmissionContext,
    now = new Date(),
    supersedesWidgetId: string | null = null,
  ): Promise<SealedEmission> {
    return this.emitServicePrice(
      request,
      linkage,
      now,
      supersedesWidgetId,
      null,
    );
  }

  /** The detail child reuses only a freshly re-read approval and its still-live sealed parent. */
  async emitServicePriceDetail(
    request: MintRequest,
    linkage: ServicePriceApprovalEmissionContext,
    parentWidgetId: string,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      !parentWidgetId ||
      request.composerInput.correlation_refs.parent_id !== parentWidgetId
    )
      throw new IntentTemplateRefusal('service_price_parent_source_mismatch');
    return this.emitServicePrice(request, linkage, now, null, parentWidgetId);
  }

  private async emitServicePrice(
    request: MintRequest,
    linkage: ServicePriceApprovalEmissionContext,
    now: Date,
    supersedesWidgetId: string | null,
    parentWidgetId: string | null,
  ): Promise<SealedEmission> {
    const source = request.composerInput.source;
    const ref = servicePriceApprovalRef(
      linkage.approvalId,
      linkage.payloadHash,
    );
    const expiresAt = new Date(String(request.body.expires_at));
    if (
      request.kind !== 'APPROVAL' ||
      request.composerInput.kind_proposal !== 'APPROVAL' ||
      request.composerInput.capability !== SERVICE_PRICE_TOOL ||
      source.from !== 'capability_envelope' ||
      source.capability !== SERVICE_PRICE_TOOL ||
      !parseServicePriceApprovalRef(ref) ||
      typeof linkage.revalidate !== 'function' ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime()
    )
      throw new IntentTemplateRefusal('service_price_approval_source_required');
    // Spoken COMMIT needs a separate server readback receipt. This lane currently serves rich chat.
    if (profileFor(request.deliveryChannel)?.tier === 'SPOKEN')
      throw new IntentTemplateRefusal(
        'service_price_spoken_readback_unavailable',
      );
    await linkage.revalidate();
    const handles = this.seals.mintNounHandles([
      {
        tenantId: request.tenantId,
        noun: 'approval',
        ownerKind: SERVICE_PRICE_APPROVAL_NOUN_OWNER,
        ownerRef: ref,
      },
    ]);
    return this.emitInternal(
      {
        ...request,
        ttlSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
        body: {
          ...request.body,
          approval_ref: linkage.approvalId,
          approve_intent: 'i1',
          reject_intent: 'i2',
          detail_intent: 'i3',
        },
        composerInput: {
          ...request.composerInput,
          intent_proposals: [
            {
              intent_template_key: SERVICE_PRICE_APPROVE_TEMPLATE,
              role: 'primary',
              capability: { space: 'AE', key: SERVICE_PRICE_CAPABILITY },
              argument_handles: handles,
            },
            {
              intent_template_key: SERVICE_PRICE_REJECT_TEMPLATE,
              role: 'destructive',
              capability: { space: 'AE', key: SERVICE_PRICE_CAPABILITY },
              argument_handles: handles,
            },
            {
              intent_template_key: SERVICE_PRICE_DETAIL_TEMPLATE,
              role: 'secondary',
              argument_handles: handles,
            },
            {
              intent_template_key: 'control.dismiss@1',
              role: 'escape',
              capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
            },
          ],
        },
      },
      now,
      null,
      null,
      supersedesWidgetId,
      null,
      null,
      linkage,
      parentWidgetId,
    );
  }

  /** Only the canonical chat approval owner can supply this source revalidation closure. */
  async emitGoodsReceiptApproval(
    request: MintRequest,
    linkage: GoodsReceiptApprovalEmissionContext,
    now = new Date(),
    supersedesWidgetId: string | null = null,
  ): Promise<SealedEmission> {
    return this.emitGoodsReceipt(
      request,
      linkage,
      now,
      supersedesWidgetId,
      null,
    );
  }

  /** The detail child reuses only a freshly re-read approval and its still-live sealed parent. */
  async emitGoodsReceiptDetail(
    request: MintRequest,
    linkage: GoodsReceiptApprovalEmissionContext,
    parentWidgetId: string,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      !parentWidgetId ||
      request.composerInput.correlation_refs.parent_id !== parentWidgetId
    )
      throw new IntentTemplateRefusal('goods_receipt_parent_source_mismatch');
    return this.emitGoodsReceipt(request, linkage, now, null, parentWidgetId);
  }

  private async emitGoodsReceipt(
    request: MintRequest,
    linkage: GoodsReceiptApprovalEmissionContext,
    now: Date,
    supersedesWidgetId: string | null,
    parentWidgetId: string | null,
  ): Promise<SealedEmission> {
    const source = request.composerInput.source;
    const ref = goodsReceiptApprovalRef(
      linkage.approvalId,
      linkage.payloadHash,
    );
    const expiresAt = new Date(String(request.body.expires_at));
    if (
      request.kind !== 'APPROVAL' ||
      request.composerInput.kind_proposal !== 'APPROVAL' ||
      request.composerInput.capability !== GOODS_RECEIPT_TOOL ||
      source.from !== 'capability_envelope' ||
      source.capability !== GOODS_RECEIPT_TOOL ||
      !parseGoodsReceiptApprovalRef(ref) ||
      typeof linkage.revalidate !== 'function' ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime()
    )
      throw new IntentTemplateRefusal('goods_receipt_approval_source_required');
    // Spoken COMMIT needs a separate server readback receipt. This lane currently serves rich chat.
    if (profileFor(request.deliveryChannel)?.tier === 'SPOKEN')
      throw new IntentTemplateRefusal(
        'goods_receipt_spoken_readback_unavailable',
      );
    await linkage.revalidate();
    const handles = this.seals.mintNounHandles([
      {
        tenantId: request.tenantId,
        noun: 'approval',
        ownerKind: GOODS_RECEIPT_APPROVAL_NOUN_OWNER,
        ownerRef: ref,
      },
    ]);
    return this.emitInternal(
      {
        ...request,
        ttlSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
        body: {
          ...request.body,
          approval_ref: linkage.approvalId,
          approve_intent: 'i1',
          reject_intent: 'i2',
          detail_intent: 'i3',
        },
        composerInput: {
          ...request.composerInput,
          intent_proposals: [
            {
              intent_template_key: GOODS_RECEIPT_APPROVE_TEMPLATE,
              role: 'primary',
              capability: { space: 'AE', key: GOODS_RECEIPT_CAPABILITY },
              argument_handles: handles,
            },
            {
              intent_template_key: GOODS_RECEIPT_REJECT_TEMPLATE,
              role: 'destructive',
              capability: { space: 'AE', key: GOODS_RECEIPT_CAPABILITY },
              argument_handles: handles,
            },
            {
              intent_template_key: GOODS_RECEIPT_DETAIL_TEMPLATE,
              role: 'secondary',
              argument_handles: handles,
            },
            {
              intent_template_key: 'control.dismiss@1',
              role: 'escape',
              capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
            },
          ],
        },
      },
      now,
      null,
      null,
      supersedesWidgetId,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      linkage,
      parentWidgetId,
    );
  }

  /** A15 only: durable approval is the draft; all linkage comes from its owner. */
  async emitScheduleConfirmation(
    request: MintRequest,
    linkage: BookingConfirmationEmissionContext,
    now = new Date(),
  ): Promise<SealedEmission> {
    if (
      request.kind !== 'SETTINGS_DRAFT' ||
      request.composerInput.capability !== 'staff.schedule.update' ||
      request.composerInput.intent_proposals[0]?.intent_template_key !==
        SCHEDULE_TEMPLATE ||
      linkage.commitIntentIndex !== 0 ||
      linkage.confirmationOfKind !== 'draft'
    )
      throw new IntentTemplateRefusal('schedule_confirmation_context_required');
    return this.emitInternal(
      request,
      now,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      linkage,
    );
  }

  private async emitInternal(
    request: MintRequest,
    now: Date,
    successor: SuccessorEmissionContext | null,
    booking: BookingConfirmationEmissionContext | null,
    supersedesWidgetId: string | null,
    journalParentWidgetId: string | null = null,
    personalSchedule: PersonalScheduleSource | null = null,
    servicePrice: ServicePriceApprovalEmissionContext | null = null,
    servicePriceParentWidgetId: string | null = null,
    schedule: BookingConfirmationEmissionContext | null = null,
    personalParentWidgetId: string | null = null,
    personalCatalog: {
      parentWidgetId: string;
      revalidate(): Promise<void>;
    } | null = null,
    goodsReceipt: GoodsReceiptApprovalEmissionContext | null = null,
    goodsReceiptParentWidgetId: string | null = null,
  ): Promise<SealedEmission> {
    const input = request.composerInput;
    if (servicePrice !== null && goodsReceipt !== null)
      throw new IntentTemplateRefusal('mixed_approval_context');
    const approvalLinkage = servicePrice ?? goodsReceipt;
    const approvalParentWidgetId =
      servicePriceParentWidgetId ?? goodsReceiptParentWidgetId;
    if (
      (input.capability === SERVICE_PRICE_TOOL ||
        input.intent_proposals.some(
          (proposal) =>
            isServicePriceTemplate(proposal.intent_template_key) ||
            (proposal.capability?.space === 'AE' &&
              proposal.capability.key === SERVICE_PRICE_CAPABILITY),
        )) &&
      servicePrice === null
    )
      throw new IntentTemplateRefusal(
        'service_price_approval_context_required',
      );
    if (
      (input.capability === GOODS_RECEIPT_TOOL ||
        input.intent_proposals.some(
          (proposal) =>
            isGoodsReceiptTemplate(proposal.intent_template_key) ||
            (proposal.capability?.space === 'AE' &&
              proposal.capability.key === GOODS_RECEIPT_CAPABILITY),
        )) &&
      goodsReceipt === null
    )
      throw new IntentTemplateRefusal(
        'goods_receipt_approval_context_required',
      );
    if (
      input.capability === 'appointments.own.list' &&
      personalSchedule === null
    )
      throw new IntentTemplateRefusal('personal_schedule_context_required');
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

    if (
      input.intent_proposals.some((p) =>
        p.intent_template_key.startsWith('navigate.journal.'),
      ) &&
      (request.kind !== 'SCHEDULE' ||
        input.capability !== 'operations.journal.read' ||
        input.source.from !== 'capability_envelope' ||
        input.source.capability !== 'operations.journal.read')
    )
      throw new IntentTemplateRefusal('journal_navigation_source_required');

    if (
      input.intent_proposals.some(
        (p) => p.intent_template_key === 'navigate.personal-booking@1',
      ) &&
      (request.kind !== 'SCHEDULE' ||
        personalSchedule === null ||
        input.capability !== 'appointments.own.list' ||
        input.source.from !== 'capability_envelope' ||
        input.source.capability !== 'appointments.own.list')
    )
      throw new IntentTemplateRefusal('personal_navigation_source_required');

    if (
      input.intent_proposals.some(
        (p) => p.intent_template_key === 'navigate.personal-catalog@1',
      ) &&
      (request.kind !== 'SERVICE_SELECTOR' ||
        input.capability !== 'catalog.services.read' ||
        input.source.from !== 'capability_envelope' ||
        input.source.capability !== 'catalog.services.read')
    )
      throw new IntentTemplateRefusal('personal_catalog_source_required');

    const resolved = input.intent_proposals.map((proposal) => {
      if (proposal.intent_template_key === SCHEDULE_TEMPLATE) {
        if (schedule === null)
          throw new IntentTemplateRefusal(
            'schedule_confirmation_context_required',
          );
        return {
          proposal,
          resolved: {
            kind: 'intent' as const,
            row: scheduleTemplate(
              proposal,
              input.kind_proposal,
              request.deliveryChannel,
            ),
          },
        };
      }

      if (isServicePriceTemplate(proposal.intent_template_key)) {
        if (servicePrice === null)
          throw new IntentTemplateRefusal(
            'service_price_approval_context_required',
          );
        return {
          proposal,
          resolved: {
            kind: 'intent' as const,
            row: resolveServicePriceTemplate({
              proposal,
              widgetKind: input.kind_proposal,
              deliveryChannel: request.deliveryChannel,
            }),
          },
        };
      }
      if (isGoodsReceiptTemplate(proposal.intent_template_key)) {
        if (goodsReceipt === null)
          throw new IntentTemplateRefusal(
            'goods_receipt_approval_context_required',
          );
        return {
          proposal,
          resolved: {
            kind: 'intent' as const,
            row: resolveGoodsReceiptTemplate({
              proposal,
              widgetKind: input.kind_proposal,
              deliveryChannel: request.deliveryChannel,
            }),
          },
        };
      }
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
              ...(journalParentWidgetId === null
                ? {}
                : { journalParentWidgetId }),
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
    const expiresAt =
      approvalLinkage === null
        ? new Date(now.getTime() + request.ttlSeconds * 1000)
        : new Date(String(request.body.expires_at));
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
            servicePriceLinkage: servicePrice,
            goodsReceiptLinkage: goodsReceipt,
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
    if (approvalLinkage !== null && emittedIntents.length !== materials.length)
      throw new IntentTemplateRefusal(
        'service_price_approval_controls_withheld',
      );
    const profile = profileFor(request.deliveryChannel);
    if (!profile) throw new IntentTemplateRefusal('carrier_unknown');
    const unsignedEnvelope = buildEnvelopeWithoutSeal({
      personalDetail: personalParentWidgetId !== null,
      personalCatalogDetail: personalCatalog !== null,
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
      approvalEcho:
        approvalLinkage === null
          ? null
          : { owner: 'ai_approval_request', hash: approvalLinkage.payloadHash },
      detailSheet: approvalParentWidgetId !== null,
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
    const recordFacts = emittedTokened.map((material) => ({
      template: material.proposal.intent_template_key,
      record: intentRecordData({
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
        bookingLinkage: booking ?? schedule,
        servicePriceLinkage: servicePrice,
        goodsReceiptLinkage: goodsReceipt,
      }) as never,
    }));
    await this.prisma.$transaction(async (tx) => {
      if (approvalParentWidgetId !== null) {
        if (approvalLinkage === null)
          throw new IntentTemplateRefusal(
            'service_price_approval_context_required',
          );
        const parent = await tx.widgetEmission.findFirst({
          where: {
            tenantId: request.tenantId,
            widgetId: approvalParentWidgetId,
            kind: 'APPROVAL',
            turnId: request.turnId,
            erasedAt: null,
            lifecycleState: { in: ['MINTED', 'DELIVERED', 'LIVE'] },
            expiresAt: { gt: now },
            retentionUntil: { gt: now },
            turn: {
              principalProofHash: principal.proofHash,
              conversationId: request.conversationId,
            },
          },
          select: {
            intentRecords: {
              where: {
                capabilitySpace: 'AE',
                capabilityKey:
                  goodsReceipt === null
                    ? SERVICE_PRICE_CAPABILITY
                    : GOODS_RECEIPT_CAPABILITY,
                confirmationOfKind: 'approval',
                confirmationOfRef: approvalLinkage.approvalId,
              },
              select: { frozenNounsJson: true },
            },
          },
        });
        const expectedNouns = materials[0]?.proposal.argument_handles;
        if (
          !parent ||
          !parent.intentRecords.some(
            (record) =>
              stableActionJson(record.frozenNounsJson) ===
              stableActionJson(expectedNouns),
          ) ||
          !(await this.verifySeal(request.tenantId, approvalParentWidgetId)) ||
          !(await this.releaseAccess.canProject(
            request.tenantId,
            approvalParentWidgetId,
            tx,
          ))
        )
          throw new IntentTemplateRefusal('service_price_parent_unavailable');
      }
      if (journalParentWidgetId !== null) {
        const parent = await tx.widgetEmission.findFirst({
          where: {
            tenantId: request.tenantId,
            widgetId: journalParentWidgetId,
            erasedAt: null,
            expiresAt: { gt: now },
            retentionUntil: { gt: now },
            turn: {
              principalProofHash: principal.proofHash,
              conversationId: request.conversationId,
            },
            intentRecords: {
              some: {
                principalProofHash: principal.proofHash,
                effect: 'NAVIGATE',
                sourceCapabilitySpace: 'C9',
                sourceCapabilityKey: 'operations.journal.read',
                retainedLocalBusinessDate,
              },
            },
          },
        });
        if (
          parent === null ||
          !(await this.verifySeal(request.tenantId, journalParentWidgetId)) ||
          !(await this.releaseAccess.canProject(
            request.tenantId,
            journalParentWidgetId,
            tx,
          ))
        )
          throw new IntentTemplateRefusal('journal_parent_unavailable');
      }
      const entryParent =
        personalCatalog?.parentWidgetId ?? personalParentWidgetId;
      if (entryParent !== null) {
        const parent = await tx.widgetEmission.findFirst({
          where: {
            tenantId: request.tenantId,
            widgetId: entryParent,
            erasedAt: null,
            expiresAt: { gt: now },
            retentionUntil: { gt: now },
            turnId: request.turnId,
            turn: {
              principalProofHash: principal.proofHash,
              conversationId: request.conversationId,
            },
            intentRecords: {
              some: {
                principalProofHash: principal.proofHash,
                effect: 'NAVIGATE',
                sourceCapabilitySpace: 'C9',
                sourceCapabilityKey:
                  personalCatalog === null
                    ? 'appointments.own.list'
                    : 'catalog.services.read',
                targetJson: { equals: { class: 'detail', ref: 'fs.booking' } },
              },
            },
          },
        });
        if (
          parent === null ||
          !(await this.verifySeal(request.tenantId, entryParent)) ||
          !(await this.releaseAccess.canProject(
            request.tenantId,
            entryParent,
            tx,
          ))
        )
          throw new IntentTemplateRefusal('personal_parent_unavailable');
      }
      if (personalSchedule !== null) await personalSchedule.revalidate();
      if (personalCatalog !== null) await personalCatalog.revalidate();
      if (approvalLinkage !== null) await approvalLinkage.revalidate();
      await this.releaseAccess.bindMint(
        request.tenantId,
        recordFacts,
        tx,
        kind,
      );
      await tx.widgetEmission.create({
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
      });
      for (const row of recordFacts)
        await tx.widgetIntentRecord.create({ data: row.record });
      await tx.widgetRenderReceipt.create({
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
      });
    });

    // Observability only: the already-persisted successor relation supplies provenance.
    // No request field, admission verdict, entitlement or lifecycle transition is changed.
    if (supersedesWidgetId !== null)
      for (const material of emittedTokened)
        new Logger('WidgetMintProvenance').log(
          JSON.stringify({
            contract: 'maya.widget-mint-provenance/1',
            trigger: 'successor',
            route: 'POST /api/widgets/intent',
            request_id: widgetId,
            intent_token_hash: material.tokenHash,
            widget_id: widgetId,
            predecessor_widget_id: supersedesWidgetId,
          }),
        );
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
        (proposal) =>
          proposal.intent_template_key === 'refine.journal.date@1' ||
          proposal.intent_template_key === 'navigate.journal.detail@1',
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
