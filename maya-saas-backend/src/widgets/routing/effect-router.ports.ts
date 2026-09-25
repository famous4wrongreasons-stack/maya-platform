import type { RoutingInput } from './routing-input';
import type { ResolvedNouns } from '../gate.types';
import type { PrincipalView } from '../gate.types';
import type { BookingConfirmationPreview } from '../booking/booking-confirmation-minter.port';
import type { MintRequest, SealedEmission } from '../emission/emitter.service';

/**
 * Widget-internal audit edge used by Gate 13.
 *
 * The router depends on this narrow port rather than importing the stores facade.  The facade also
 * owns the submission audit, whose wire-only render profile must never become reachable from a gate
 * antecedent (INV-30).
 */
export const EFFECT_ROUTE_AUDIT = 'EFFECT_ROUTE_AUDIT';

/**
 * Widget-internal emission edge used by Gate 13 NAVIGATE(detail). The concrete minter and seal-key
 * custody stay inside WidgetEmissionModule; this type-only port adds no key holder to the gateway.
 */
export interface NavigateWidgetMinterPort {
  emit(request: MintRequest, now?: Date): Promise<SealedEmission>;
}

export interface EffectRouteAuditPort {
  readonly claimIntentRecord: (input: {
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
  }) => Promise<boolean>;
  readonly writeReceipt: (
    input: {
      tenantId: string;
      widgetId: string;
      intentTokenHash: string;
      outcome: string;
      refusalCode?: string | null;
      answeringChannel: string;
      actionReceiptRef?: string | null;
    },
    now?: Date,
  ) => Promise<{ id: string }>;
  readonly reconcileAcceptedReceipt: (input: {
    tenantId: string;
    intentTokenHash: string;
    actionReceiptRef: string;
  }) => Promise<boolean>;
  readonly putDraft: (
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
    now?: Date,
  ) => Promise<{ id: string }>;
}

/** Closed result of one resolved Gate 13 destination. */
export interface EffectRouteOutcome {
  readonly receiptOutcome:
    'ACCEPTED' | 'REFUSED' | 'NEEDS_CONFIRMATION' | 'NEEDS_VERIFICATION';
  readonly refusalCode: string | null;
  readonly actionReceiptRef: string | null;
  readonly nextEnvelope: unknown;
  readonly resolvedWidget: unknown;
  readonly ownerDecision: unknown;
  /** Metric-only Gate 14 re-resolution reason. It is never persisted as a widget refusal code. */
  readonly gate14RefusalReason?: string | null;
}

/** The only internal destinations U13a can execute before later owner adapters land. */
export interface EffectRouterPorts {
  readonly dismiss: (input: RoutingInput) => Promise<EffectRouteOutcome>;
}

export interface C9CancelOwnerPort {
  cancel(input: RoutingInput): Promise<boolean>;
}

export interface HandoffSignerPort {
  sign(
    input: Readonly<{
      tenantId: string;
      principalProofHash: string;
      widgetId: string;
      intentTokenHash: string;
      target: unknown;
      issuedAt: Date;
      expiresAt: Date;
    }>,
  ): Readonly<Record<string, unknown>> | null;
}

export interface ActuatingRoutingInput {
  readonly routing: RoutingInput;
  readonly actorUserId: string;
  readonly resolvedNouns: ResolvedNouns;
  readonly principal: PrincipalView;
}

export interface DraftOwnerRegistryPort {
  route(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> | null;
}

export interface ApprovalRequestOwnerPort {
  request(input: ActuatingRoutingInput): Promise<EffectRouteOutcome>;
  decide(input: ActuatingRoutingInput): Promise<EffectRouteOutcome>;
}

export interface CommitBookingOwnerPort {
  commit(input: ActuatingRoutingInput): Promise<EffectRouteOutcome>;
}

export interface BookingProposeOwnerPort {
  propose(input: ActuatingRoutingInput): Promise<EffectRouteOutcome>;
}

export interface BookingPreviewDecision {
  readonly kind: 'booking_preview';
  readonly preview: BookingConfirmationPreview;
}

export const bookingPreviewOf = (
  value: unknown,
): BookingConfirmationPreview | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const record = value as Partial<BookingPreviewDecision>;
  return record.kind === 'booking_preview' &&
    typeof record.preview === 'object' &&
    record.preview !== null
    ? record.preview
    : null;
};
