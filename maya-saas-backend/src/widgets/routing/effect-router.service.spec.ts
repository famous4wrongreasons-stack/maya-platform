import type { PrincipalView } from '../gate.types';
import { ctx, rec } from '../gates/gate-fixtures.spec-helper.spec';
import { EffectRouterService, ROUTABLE_EFFECTS } from './effect-router.service';

const PRINCIPAL: PrincipalView = {
  authority: {
    kind: 'USER',
    tenantId: 't1',
    userId: 'u1',
    membershipId: 'm1',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'a'.repeat(64),
  },
  role: 'administrator',
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: 'a'.repeat(64),
};

const fixture = () => {
  const stores = {
    claimIntentRecord: jest.fn().mockResolvedValue(true),
    writeReceipt: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
    reconcileAcceptedReceipt: jest.fn().mockResolvedValue(true),
  };
  const controls = {
    isRegistered: jest.fn((key: string) => key === 'control.widget.dismiss'),
    dismiss: jest.fn().mockResolvedValue({ handled: true, code: 'dismissed' }),
  };
  return {
    stores,
    controls,
    router: new EffectRouterService(stores as never, controls as never),
  };
};

describe('U13a — closed Gate 13 spine, claim, receipt and dismiss', () => {
  it('G13-R10 exposes exactly the seven routable effects, with no NONE', () => {
    expect(ROUTABLE_EFFECTS).toEqual([
      'NAVIGATE',
      'REFINE',
      'CONTROL',
      'DRAFT',
      'REQUEST_APPROVAL',
      'HANDOFF',
      'COMMIT',
    ]);
    expect(ROUTABLE_EFFECTS).not.toContain('NONE');
  });

  it.each([
    'NONE',
    'INVENTED',
  ])('G13-P01/B28 refuses %s without claim, handler or receipt', async (effect) => {
    const { router, stores, controls } = fixture();
    await expect(
      router.route(ctx(rec({ effect }), { principal: PRINCIPAL })),
    ).resolves.toEqual({ outcome: 'refuse', code: 'effect_not_admissible' });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
    expect(stores.writeReceipt).not.toHaveBeenCalled();
    expect(controls.dismiss).not.toHaveBeenCalled();
  });

  it.each([
    'NAVIGATE',
    'REFINE',
    'DRAFT',
    'REQUEST_APPROVAL',
    'HANDOFF',
    'COMMIT',
  ])('N02/N03/N05: %s fails closed before the claim until its edge lands', async (effect) => {
    const { router, stores } = fixture();
    await expect(
      router.route(ctx(rec({ effect }), { principal: PRINCIPAL })),
    ).resolves.toEqual({ outcome: 'refuse', code: 'mechanism_absent' });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
    expect(stores.writeReceipt).not.toHaveBeenCalled();
  });

  it('G13-R5 claims once, runs the one registered control, and writes a B-29 receipt with no echo', async () => {
    const { router, stores, controls } = fixture();
    const input = ctx(
      rec({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
      }),
      { principal: PRINCIPAL },
    );
    await expect(router.route(input)).resolves.toMatchObject({
      outcome: 'terminate',
      route: {
        receipt_outcome: 'ACCEPTED',
        next_envelope: null,
        resolved_widget: { control: 'dismissed' },
        owner_decision: null,
      },
    });
    expect(stores.claimIntentRecord).toHaveBeenCalledWith({
      tenantId: 't1',
      intentTokenHash: 'h'.repeat(64),
      singleUse: true,
      now: input.now,
    });
    expect(controls.dismiss).toHaveBeenCalledWith({
      tenantId: 't1',
      widgetId: 'w1',
      principalProofHash: PRINCIPAL.proofHash,
      now: input.now,
    });
    expect(stores.writeReceipt).toHaveBeenCalledWith(
      {
        tenantId: 't1',
        widgetId: 'w1',
        intentTokenHash: 'h'.repeat(64),
        outcome: 'ACCEPTED',
        refusalCode: null,
        answeringChannel: 'pwa',
        actionReceiptRef: null,
      },
      input.now,
    );
  });

  it('AMB-54 one concurrent claimant wins; the loser executes no destination and writes no receipt', async () => {
    const { router, stores, controls } = fixture();
    stores.claimIntentRecord.mockResolvedValue(false);
    const input = ctx(
      rec({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
      }),
      { principal: PRINCIPAL },
    );
    await expect(router.route(input)).resolves.toEqual({ outcome: 'expired' });
    expect(controls.dismiss).not.toHaveBeenCalled();
    expect(stores.writeReceipt).not.toHaveBeenCalled();
  });

  it('G13-I5 a reusable record preserves reusable claim semantics while still recording its adjudication', async () => {
    const { router, stores } = fixture();
    const input = ctx(
      rec({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
        singleUse: false,
      }),
      { principal: PRINCIPAL },
    );
    await expect(router.route(input)).resolves.toMatchObject({
      outcome: 'terminate',
      route: { receipt_outcome: 'ACCEPTED' },
    });
    expect(stores.claimIntentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ singleUse: false }),
    );
    expect(stores.writeReceipt).toHaveBeenCalledTimes(1);
  });

  it('N-CTRL-FOREIGN-P: a control without a live principal has no destination and is not claimed', async () => {
    const { router, stores, controls } = fixture();
    const input = ctx(rec({ effect: 'CONTROL', capabilitySpace: 'CONTROL', capabilityKey: 'control.widget.dismiss' }));
    await expect(router.route(input)).resolves.toEqual({
      outcome: 'refuse',
      code: 'mechanism_absent',
    });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
    expect(controls.dismiss).not.toHaveBeenCalled();
  });

  it('B-29 reconciliation fills the accepted receipt ref through the one store edge', async () => {
    const { router, stores } = fixture();
    await expect(
      router.reconcileAcceptedReceipt({
        tenantId: 't1',
        intentTokenHash: 'h'.repeat(64),
        actionReceiptRef: 'ae-receipt-1',
      }),
    ).resolves.toBe(true);
    expect(stores.reconcileAcceptedReceipt).toHaveBeenCalledTimes(1);
  });
});
