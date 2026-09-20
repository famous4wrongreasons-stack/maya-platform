import type { RoutingInput } from './routing-input';

/**
 * Widget-internal audit edge used by Gate 13.
 *
 * The router depends on this narrow port rather than importing the stores facade.  The facade also
 * owns the submission audit, whose wire-only render profile must never become reachable from a gate
 * antecedent (INV-30).
 */
export const EFFECT_ROUTE_AUDIT = 'EFFECT_ROUTE_AUDIT';

export interface EffectRouteAuditPort {
  readonly claimIntentRecord: (input: {
    tenantId: string;
    intentTokenHash: string;
    singleUse: boolean;
    now: Date;
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
}

/** Closed result of one resolved Gate 13 destination. */
export interface EffectRouteOutcome {
  readonly receiptOutcome: 'ACCEPTED' | 'REFUSED' | 'NEEDS_CONFIRMATION' | 'NEEDS_VERIFICATION';
  readonly refusalCode: string | null;
  readonly actionReceiptRef: string | null;
  readonly nextEnvelope: unknown;
  readonly resolvedWidget: unknown;
  readonly ownerDecision: unknown;
}

/** The only internal destinations U13a can execute before later owner adapters land. */
export interface EffectRouterPorts {
  readonly dismiss: (input: RoutingInput) => Promise<EffectRouteOutcome>;
}
