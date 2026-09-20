import type { RoutingInput } from './routing-input';

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
