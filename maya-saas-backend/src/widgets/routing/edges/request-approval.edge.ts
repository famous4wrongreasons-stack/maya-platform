import type { GateContext } from '../../gate.types';
import type {
  ApprovalRequestOwnerPort,
  EffectRouteOutcome,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const approvalRequestDestination = (
  ctx: GateContext,
  owner: ApprovalRequestOwnerPort,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx);
  return input === null ? null : () => owner.request(input);
};
