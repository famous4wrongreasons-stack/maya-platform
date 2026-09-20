import type { GateContext } from '../gate.types';
import type { IntentRecordRow } from '../gate.types';

/**
 * The AUDIT_RETAINED-only projection Gate 13 may hand to the projector.
 *
 * No conversation content, profile claim or raw submission object crosses this seam. F15's source
 * test treats this list as the complete value-flow surface into routing and owner decisions.
 */
export interface RoutingInput {
  readonly record: IntentRecordRow;
  readonly tenantId: string;
  readonly principalProofHash: string;
  readonly answeringChannel: GateContext['carrier'];
  readonly now: Date;
}

export const routingInputOf = (ctx: GateContext): RoutingInput | null => {
  const record = ctx.record;
  if (record === null) return null;
  return {
    record,
    tenantId: ctx.tenantId,
    principalProofHash: ctx.principal?.proofHash ?? '',
    answeringChannel: ctx.carrier,
    now: ctx.now,
  };
};
