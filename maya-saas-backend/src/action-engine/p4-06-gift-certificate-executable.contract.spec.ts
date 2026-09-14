import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_06_EXECUTABLE_CAPABILITIES,
  P4_06_EXECUTABLE_REGISTRATIONS,
} from './p4-06-gift-certificate-executable.contract';

describe('P4-06 gift certificate executable contract', () => {
  it('registers exactly the three approved action classes', () => {
    expect(
      P4_06_EXECUTABLE_REGISTRATIONS.map((entry) => entry.actionClass),
    ).toEqual([
      'initiate_gift_certificate_purchase',
      'activate_gift_certificate',
      'redeem_gift_certificate',
    ]);
  });

  it('keeps external dispatch limited to purchase checkout', () => {
    expect(
      P4_06_EXECUTABLE_REGISTRATIONS.filter(
        (entry) => entry.providerDispatch,
      ).map((entry) => entry.actionClass),
    ).toEqual(['initiate_gift_certificate_purchase']);
  });

  it('publishes the three canonical Action Engine owners', () => {
    const registry = new ActionCapabilityRegistry();
    expect(
      Object.values(P4_06_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).policyDecision,
      ),
    ).toEqual(Array(3).fill(ActionPolicyDecision.ALLOW));
    expect(
      Object.values(P4_06_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).executorKey,
      ),
    ).toEqual([
      'gift-certificates.checkout',
      'gift-certificates.activation',
      'gift-certificates.redemption',
    ]);
  });

  it('reuses strict Shadow normalizers for server-derived facts', () => {
    expect(
      P4_06_EXECUTABLE_REGISTRATIONS.every(
        (entry) => typeof entry.normalizeInput === 'function',
      ),
    ).toBe(true);
  });
});
