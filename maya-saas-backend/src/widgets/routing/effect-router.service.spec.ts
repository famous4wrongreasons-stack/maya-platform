import type { GateContext, PrincipalView } from '../gate.types';
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
  const successors = {
    mint: jest.fn().mockResolvedValue({
      widgetId: 'w2',
      envelope: { contract: 'maya.widget.envelope/1', widget_id: 'w2' },
    }),
  };
  const c9Cancel = { cancel: jest.fn().mockResolvedValue(true) };
  const handoffs = {
    sign: jest.fn().mockReturnValue({
      route_key: 'shell.account',
      opaque_handle: 'signed-handoff',
    }),
  };
  const drafts = { route: jest.fn().mockReturnValue(null) };
  const approvals = {
    request: jest.fn().mockResolvedValue({
      receiptOutcome: 'ACCEPTED',
      refusalCode: null,
      actionReceiptRef: 'approval-execution',
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: { state: 'PENDING_APPROVAL' },
    }),
    decide: jest.fn().mockResolvedValue({
      receiptOutcome: 'ACCEPTED',
      refusalCode: null,
      actionReceiptRef: 'approval-execution',
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: { state: 'READY' },
    }),
  };
  const commits = {
    commit: jest.fn().mockResolvedValue({
      receiptOutcome: 'ACCEPTED',
      refusalCode: null,
      actionReceiptRef: 'booking-execution',
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: { state: 'SUCCEEDED' },
    }),
  };
  const metric = { increment: jest.fn(), value: jest.fn() };
  return {
    stores,
    controls,
    successors,
    c9Cancel,
    handoffs,
    drafts,
    approvals,
    commits,
    metric,
    router: new EffectRouterService(
      stores,
      controls as never,
      successors,
      c9Cancel,
      handoffs,
      drafts,
      approvals,
      commits,
      metric as never,
    ),
  };
};

const RESOLVED = {
  row: 'A1' as const,
  diverged: false,
  diff: [],
  values: new Map<string, string>(),
};

const routeEffect = (router: EffectRouterService, input: GateContext) =>
  router.route(input, input.facts.resolvedNouns);

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

  it.each(['NONE', 'INVENTED'])(
    'B28 refuses %s without claim, handler or receipt',
    async (effect) => {
      const { router, stores, controls } = fixture();
      await expect(
        routeEffect(router, ctx(rec({ effect }), { principal: PRINCIPAL })),
      ).resolves.toEqual({ outcome: 'refuse', code: 'effect_not_admissible' });
      expect(stores.claimIntentRecord).not.toHaveBeenCalled();
      expect(stores.writeReceipt).not.toHaveBeenCalled();
      expect(controls.dismiss).not.toHaveBeenCalled();
    },
  );

  it('G13-P01 refuses a missing record without claim, handler or receipt', async () => {
    const { router, stores, controls } = fixture();
    const input = { ...ctx(rec(), { principal: PRINCIPAL }), record: null };
    await expect(routeEffect(router, input)).resolves.toEqual({
      outcome: 'refuse',
      code: 'effect_not_admissible',
    });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
    expect(stores.writeReceipt).not.toHaveBeenCalled();
    expect(controls.dismiss).not.toHaveBeenCalled();
  });

  it('N08: DRAFT fails closed before the claim while its canonical registry has no owner', async () => {
    const { router, stores } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(rec({ effect: 'DRAFT' }), {
          principal: PRINCIPAL,
          facts: { resolvedNouns: RESOLVED },
        }),
      ),
    ).resolves.toEqual({ outcome: 'refuse', code: 'effect_not_admissible' });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
    expect(stores.writeReceipt).not.toHaveBeenCalled();
  });

  it('G13-P06 routes REQUEST_APPROVAL through the canonical owner after claim', async () => {
    const { router, stores, approvals } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'REQUEST_APPROVAL',
            widgetKind: 'APPROVAL',
            capabilitySpace: 'AE',
            capabilityKey: 'communication.bulk-campaign.admit.v2',
          }),
          {
            principal: PRINCIPAL,
            facts: { resolvedNouns: RESOLVED },
          },
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: { receipt_outcome: 'ACCEPTED' },
    });
    expect(approvals.request).toHaveBeenCalledTimes(1);
    expect(stores.claimIntentRecord).toHaveBeenCalledTimes(1);
  });

  it('G13-P07 routes booking COMMIT through the canonical owner with no router-side business facts', async () => {
    const { router, commits } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'COMMIT',
            widgetKind: 'BOOKING_CONFIRMATION',
            capabilitySpace: 'AE',
            capabilityKey: 'crm.appointment.create.v1',
            confirmationIdempotencyKey: 'server-key',
          }),
          {
            principal: PRINCIPAL,
            facts: { resolvedNouns: RESOLVED },
          },
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: { receipt_outcome: 'ACCEPTED' },
    });
    expect(commits.commit).toHaveBeenCalledTimes(1);
  });

  it('G13-P08 routes APPROVAL COMMIT by the server-owned approvalDecision', async () => {
    const { router, approvals } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'COMMIT',
            widgetKind: 'APPROVAL',
            capabilitySpace: 'AE',
            capabilityKey: 'communication.bulk-campaign.admit.v2',
            confirmationOfKind: 'approval',
            confirmationOfRef: 'approval-execution',
            approvalDecision: 'approve',
          }),
          {
            principal: PRINCIPAL,
            facts: { resolvedNouns: RESOLVED },
          },
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: { receipt_outcome: 'ACCEPTED' },
    });
    expect(approvals.decide).toHaveBeenCalledTimes(1);
  });

  it('G6-14C counts a fresh Gate 14 revocation but preserves Gate 14 refusal', async () => {
    const { router, approvals, metric } = fixture();
    approvals.request.mockResolvedValue({
      receiptOutcome: 'REFUSED',
      refusalCode: 'insufficient_authority',
      actionReceiptRef: null,
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: null,
      gate14RefusalReason: 'entitlement_denied',
    });
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'REQUEST_APPROVAL',
            widgetKind: 'APPROVAL',
            capabilitySpace: 'AE',
            capabilityKey: 'communication.bulk-campaign.admit.v2',
          }),
          {
            principal: PRINCIPAL,
            facts: { resolvedNouns: RESOLVED },
          },
        ),
      ),
    ).resolves.toMatchObject({
      route: { receipt_outcome: 'REFUSED' },
    });
    expect(metric.increment).toHaveBeenCalledWith('entitlement_denied');
  });

  it('G13-P02 NAVIGATE terminates as the zero-read DEV-1 degraded result', async () => {
    const { router, stores, successors } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(rec({ effect: 'NAVIGATE' }), { principal: PRINCIPAL }),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: { resolved_widget: { degraded: 'navigate_interim' } },
    });
    expect(stores.claimIntentRecord).toHaveBeenCalledTimes(1);
    expect(successors.mint).not.toHaveBeenCalled();
  });

  it('G13-P03 REFINE mints one successor for the same live principal', async () => {
    const { router, successors } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(rec({ effect: 'REFINE' }), { principal: PRINCIPAL }),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: {
        next_envelope: {
          contract: 'maya.widget.envelope/1',
          widget_id: 'w2',
        },
      },
    });
    expect(successors.mint).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        predecessorWidgetId: 'w1',
        predecessorIntentTokenHash: 'h'.repeat(64),
        principal: PRINCIPAL,
      }),
    );
  });

  it('G13-P04 HANDOFF returns exactly one signed principal-bound target', async () => {
    const { router, handoffs } = fixture();
    const record = rec({
      effect: 'HANDOFF',
      capabilitySpace: null,
      capabilityKey: null,
      handoffSpace: 'C9',
      handoffKey: 'settings.read',
      targetJson: {
        class: 's',
        ref: { route: 'shell.account', param: null },
      },
    });
    await expect(
      routeEffect(router, ctx(record, { principal: PRINCIPAL })),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: {
        resolved_widget: {
          route_key: 'shell.account',
          opaque_handle: 'signed-handoff',
        },
      },
    });
    expect(handoffs.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        intentTokenHash: 'h'.repeat(64),
        principalProofHash: PRINCIPAL.proofHash,
      }),
    );
  });

  it('N05 an invalid HANDOFF target fails before the claim', async () => {
    const { router, stores, handoffs } = fixture();
    handoffs.sign.mockReturnValue(null);
    await expect(
      routeEffect(
        router,
        ctx(rec({ effect: 'HANDOFF' }), { principal: PRINCIPAL }),
      ),
    ).resolves.toEqual({ outcome: 'refuse', code: 'effect_not_admissible' });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
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
    await expect(routeEffect(router, input)).resolves.toMatchObject({
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
    await expect(routeEffect(router, input)).resolves.toEqual({
      outcome: 'expired',
    });
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
    await expect(routeEffect(router, input)).resolves.toMatchObject({
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
    const input = ctx(
      rec({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
      }),
    );
    await expect(routeEffect(router, input)).resolves.toEqual({
      outcome: 'refuse',
      code: 'effect_not_admissible',
    });
    expect(stores.claimIntentRecord).not.toHaveBeenCalled();
    expect(controls.dismiss).not.toHaveBeenCalled();
  });

  it('N-CANCEL-FOREIGN: run.cancel rechecks the exact tenant and principal at its owner adapter', async () => {
    const { router, stores, c9Cancel } = fixture();
    c9Cancel.cancel.mockResolvedValue(false);
    const input = ctx(
      rec({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.run.cancel',
        runId: '11111111-1111-4111-8111-111111111111',
        revisionId: '22222222-2222-4222-8222-222222222222',
      }),
      { principal: PRINCIPAL },
    );
    await expect(routeEffect(router, input)).resolves.toMatchObject({
      outcome: 'terminate',
      route: { receipt_outcome: 'REFUSED' },
    });
    expect(c9Cancel.cancel).toHaveBeenCalledTimes(1);
    expect(stores.writeReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'REFUSED' }),
      input.now,
    );
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
