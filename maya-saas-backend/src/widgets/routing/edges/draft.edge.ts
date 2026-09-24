import type { GateContext, ResolvedNouns } from '../../gate.types';
import type {
  DraftOwnerRegistryPort,
  EffectRouteOutcome,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const draftDestination = (
  ctx: GateContext,
  nouns: ResolvedNouns | undefined,
  registry: DraftOwnerRegistryPort,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx, nouns);
  if (input === null) return null;
  const pending = registry.route(input);
  return pending === null ? null : () => pending;
};
