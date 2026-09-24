import type { GateContext } from '../../gate.types';
import type {
  CommitBookingOwnerPort,
  EffectRouteOutcome,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const bookingCommitDestination = (
  ctx: GateContext,
  owner: CommitBookingOwnerPort,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx);
  return input === null ? null : () => owner.commit(input);
};
