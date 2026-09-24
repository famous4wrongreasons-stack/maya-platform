import type { GateContext, ResolvedNouns } from '../../gate.types';
import type { ActuatingRoutingInput } from '../effect-router.ports';
import { routingInputOf } from '../routing-input';

export const actuatingInputOf = (
  ctx: GateContext,
  nouns: ResolvedNouns | undefined,
): ActuatingRoutingInput | null => {
  const routing = routingInputOf(ctx);
  const authority = ctx.principal?.authority;
  if (
    routing === null ||
    nouns === undefined ||
    ctx.principal === null ||
    authority?.tenantId !== ctx.tenantId ||
    authority.userId !== ctx.actor.userId ||
    ctx.actor.tenantId !== ctx.tenantId
  )
    return null;
  return {
    routing,
    actorUserId: ctx.actor.userId,
    resolvedNouns: nouns,
  };
};
