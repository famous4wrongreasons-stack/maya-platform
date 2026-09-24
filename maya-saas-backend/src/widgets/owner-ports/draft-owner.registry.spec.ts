import type { ActuatingRoutingInput } from '../routing/effect-router.ports';
import { DraftOwnerRegistry } from './draft-owner.registry';

const input = (capabilityKey: string): ActuatingRoutingInput =>
  ({
    routing: {
      tenantId: 'tenant-1',
      record: {
        capabilitySpace: 'C9',
        capabilityKey,
      },
    },
  }) as ActuatingRoutingInput;

describe('B-31 draft owner registry', () => {
  it('N08 fails closed for an unbound or unknown propose key', () => {
    expect(
      new DraftOwnerRegistry([]).route(input('appointments.own.create')),
    ).toBeNull();
    const owner = {
      aeCapabilityKey: 'crm.appointment.create.v1',
      draft: jest.fn(),
    };
    expect(
      new DraftOwnerRegistry([owner]).route(input('c9.unknown')),
    ).toBeNull();
    expect(owner.draft).not.toHaveBeenCalled();
  });

  it('routes a traced propose key to the one server-owned AE draft owner', async () => {
    const outcome = {
      receiptOutcome: 'ACCEPTED' as const,
      refusalCode: null,
      actionReceiptRef: null,
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: { preview: true },
    };
    const owner = {
      aeCapabilityKey: 'crm.appointment.create.v1',
      draft: jest.fn().mockResolvedValue(outcome),
    };
    const routed = new DraftOwnerRegistry([owner]).route(
      input('appointments.own.create'),
    );
    await expect(routed).resolves.toEqual(outcome);
    expect(owner.draft).toHaveBeenCalledTimes(1);
  });

  it('refuses duplicate AE owner registrations at startup', () => {
    const owner = {
      aeCapabilityKey: 'crm.appointment.create.v1',
      draft: jest.fn(),
    };
    expect(() => new DraftOwnerRegistry([owner, owner])).toThrow(
      'duplicate draft owner',
    );
  });
});
