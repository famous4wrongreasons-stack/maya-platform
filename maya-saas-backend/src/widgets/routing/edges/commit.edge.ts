import type { GateContext, ResolvedNouns } from '../../gate.types';
import type {
  CommitBookingOwnerPort,
  EffectRouteOutcome,
  EffectRouteAuditPort,
} from '../effect-router.ports';
import { actuatingInputOf } from './actuating-input';

export const bookingCommitDestination = (
  ctx: GateContext,
  nouns: ResolvedNouns | undefined,
  owner: CommitBookingOwnerPort,
  drafts: Pick<EffectRouteAuditPort, 'readBookingCreateFactsHash'>,
): (() => Promise<EffectRouteOutcome>) | null => {
  const input = actuatingInputOf(ctx, nouns);
  if (input === null) return null;
  return async () => {
    if (input.routing.record.capabilityKey !== 'crm.appointment.create.v1')
      return owner.commit(input);
    const ref = input.routing.record.confirmationOfRef;
    const hash = ref
      ? await drafts.readBookingCreateFactsHash(
          input.routing.tenantId,
          ref,
          input.routing.principalProofHash,
          input.routing.now,
        )
      : null;
    if (hash === null)
      return {
        receiptOutcome: 'REFUSED',
        refusalCode: 'booking_confirmation_required',
        actionReceiptRef: null,
        nextEnvelope: null,
        resolvedWidget: null,
        ownerDecision: null,
      };
    return owner.commit({ ...input, expectedBookingFactsHash: hash });
  };
};
