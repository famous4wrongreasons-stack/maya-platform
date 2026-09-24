import type { GateContext, ResolvedNouns } from '../../gate.types';
import type {
  ApprovalRequestOwnerPort,
  EffectRouteOutcome,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const approvalDecisionDestination = (
  ctx: GateContext,
  nouns: ResolvedNouns | undefined,
  owner: ApprovalRequestOwnerPort,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx, nouns);
  return input === null ? null : () => owner.decide(input);
};

export const approvalPairClaimOf = (
  record: GateContext['record'],
): {
  widgetId: string;
  capabilityKey: string;
  confirmationRef: string;
  decision: 'approve' | 'reject';
} | null =>
  record?.widgetKind === 'APPROVAL' &&
  record.effect === 'COMMIT' &&
  record.capabilitySpace === 'AE' &&
  record.capabilityKey !== null &&
  record.confirmationOfKind === 'approval' &&
  record.confirmationOfRef !== null &&
  (record.approvalDecision === 'approve' ||
    record.approvalDecision === 'reject')
    ? {
        widgetId: record.widgetId,
        capabilityKey: record.capabilityKey,
        confirmationRef: record.confirmationOfRef,
        decision: record.approvalDecision,
      }
    : null;
