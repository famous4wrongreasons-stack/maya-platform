import type { GateContext, ResolvedNouns } from '../../gate.types';
import type {
  CommitBookingOwnerPort,
  EffectRouteOutcome,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const bookingCommitDestination = (
  ctx: GateContext,
  nouns: ResolvedNouns | undefined,
  owner: CommitBookingOwnerPort,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx, nouns);
  return input === null ? null : () => owner.commit(input);
};
