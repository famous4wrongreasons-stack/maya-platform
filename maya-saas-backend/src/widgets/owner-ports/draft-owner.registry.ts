import { aeForPropose } from '../authority/propose-pairing';
import { subjectOf } from '../gates/subject';
import type {
  ActuatingRoutingInput,
  DraftOwnerRegistryPort,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';

export interface DraftOwnerPort {
  readonly aeCapabilityKey: string;
  draft(input: ActuatingRoutingInput): Promise<EffectRouteOutcome>;
}

/**
 * B-31 / AMB-59: a DRAFT owner is indexed by the traced AE side of
 * AE_PROPOSE_PAIRING. An unknown propose key and an unbound owner are both a
 * miss. Wave 5 intentionally has no booking draft owner; P-MINT-BOOK supplies
 * it in Wave 6.
 */
export class DraftOwnerRegistry implements DraftOwnerRegistryPort {
  private readonly byAe = new Map<string, DraftOwnerPort>();

  constructor(owners: readonly DraftOwnerPort[]) {
    for (const owner of owners) {
      if (this.byAe.has(owner.aeCapabilityKey))
        throw new Error(`duplicate draft owner: ${owner.aeCapabilityKey}`);
      this.byAe.set(owner.aeCapabilityKey, owner);
    }
  }

  route(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> | null {
    const subject = subjectOf(input.routing.record);
    const ae = aeForPropose(subject);
    if (ae === null) return null;
    const owner = this.byAe.get(ae.key);
    return owner ? owner.draft(input) : null;
  }
}
