import type { GateContext, ResolvedNouns } from '../../gate.types';
import type {
  ApprovalRequestOwnerPort,
  EffectRouteOutcome,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const approvalRequestDestination = (
  ctx: GateContext,
  nouns: ResolvedNouns | undefined,
  owner: ApprovalRequestOwnerPort,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx, nouns);
  return input === null ? null : () => owner.request(input);
};
