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
    putDraft: jest.fn().mockResolvedValue({ id: 'draft-1' }),
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
    mintBookingSelector: jest.fn().mockResolvedValue({
      widgetId: 'w-selector',
      envelope: {
        contract: 'maya.widget.envelope/1',
        widget_id: 'w-selector',
      },
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
  const bookingPropose = {
    propose: jest.fn().mockResolvedValue({
      receiptOutcome: 'REFUSED',
      refusalCode: 'effect_not_admissible',
      actionReceiptRef: null,
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: null,
    }),
    proposeCreateSelection: jest.fn().mockResolvedValue({
      outcome: {
        receiptOutcome: 'REFUSED',
        refusalCode: 'effect_not_admissible',
        actionReceiptRef: null,
        nextEnvelope: null,
        resolvedWidget: null,
        ownerDecision: null,
      },
      values: new Map(),
    }),
  };
  const bookingSelectors = { advance: jest.fn().mockResolvedValue(null) };
  const bookingMinter = {
    mint: jest.fn().mockResolvedValue({
      contract: 'maya.widget.envelope/1',
      widget_id: 'w-confirmation',
    }),
  };
  const projector = {
    composeNavigate: jest.fn().mockResolvedValue({
      kind: 'composer_input',
      input: { kind_proposal: 'SERVICE_SELECTOR' },
      source: { services: [] },
    }),
    composeCompletedRead: jest.fn(),
  };
  const emitter = {
    emit: jest.fn().mockResolvedValue({
      envelope: { contract: 'maya.widget.envelope/1', widget_id: 'w-nav' },
    }),
  };
  const threadPage = {
    resolveForNavigate: jest.fn().mockResolvedValue({
      conversationId: '00000000-0000-4000-8000-000000000010',
      turnId: '00000000-0000-4000-8000-000000000011',
      deliveryChannel: 'pwa',
      envelope: { contract: 'maya.widget.envelope/1', widget_id: 'w-stored' },
    }),
  };
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
    projector,
    emitter,
    threadPage,
    bookingPropose,
    bookingSelectors,
    bookingMinter,
    router: new EffectRouterService(
      stores,
      controls as never,
      successors,
      c9Cancel,
      handoffs,
      drafts,
      approvals,
      commits,
      bookingPropose,
      bookingSelectors,
      bookingMinter,
      metric as never,
      projector as never,
      emitter,
      threadPage as never,
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

  it('G13-P02 NAVIGATE(detail) reprojects and mints one successor envelope', async () => {
    const { router, stores, successors, projector, emitter } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'NAVIGATE',
            targetJson: { class: 'detail', ref: { route: 'shell.detail' } },
            sourceCapabilitySpace: 'C9',
            sourceCapabilityKey: 'catalog.services.read',
            widgetKind: 'SERVICE_SELECTOR',
          }),
          { principal: PRINCIPAL },
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: {
        next_envelope: {
          contract: 'maya.widget.envelope/1',
          widget_id: 'w-nav',
        },
      },
    });
    expect(stores.claimIntentRecord).toHaveBeenCalledTimes(1);
    expect(projector.composeNavigate).toHaveBeenCalledTimes(1);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    expect(successors.mint).not.toHaveBeenCalled();
  });

  it('G13-P02-W returns the exact stored sealed envelope after current authority', async () => {
    const { router, threadPage, projector, emitter } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'NAVIGATE',
            targetJson: { class: 'w', ref: 'w-stored' },
            sourceCapabilitySpace: 'C9',
            sourceCapabilityKey: 'catalog.services.read',
          }),
          { principal: PRINCIPAL },
        ),
      ),
    ).resolves.toMatchObject({
      route: {
        resolved_widget: {
          contract: 'maya.widget.envelope/1',
          widget_id: 'w-stored',
        },
      },
    });
    expect(threadPage.resolveForNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        widgetId: 'w-stored',
        principalProofHash: PRINCIPAL.proofHash,
      }),
    );
    expect(projector.composeNavigate).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
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

  it('FBE2E-2 SERVICE_SELECTOR uses the validated opaque option and the canonical server owner to choose STAFF_SELECTOR', async () => {
    const { router, bookingSelectors, successors, projector } = fixture();
    bookingSelectors.advance.mockResolvedValue({
      nextKind: 'STAFF_SELECTOR',
      capabilityKey: 'catalog.staff.read',
      source: { staff: [{ id: 'canonical-staff-1', name: 'Alice' }] },
      fact: { capability: 'catalog.staff.read' },
      inheritedHandles: { service: 'opaque-service' },
    });
    projector.composeCompletedRead.mockReturnValue({
      kind: 'composer_input',
      input: { kind_proposal: 'STAFF_SELECTOR' },
    });
    const input = ctx(
      rec({
        effect: 'REFINE',
        widgetKind: 'SERVICE_SELECTOR',
        capabilitySpace: 'C9',
        capabilityKey: 'catalog.services.read',
        frozenNounsJson: {},
      }),
      {
        principal: PRINCIPAL,
        facts: {
          validatedInputs: {
            closed: new Map([['service_ref', ['opaque-service']]]),
          },
        },
      },
    );
    await expect(routeEffect(router, input)).resolves.toMatchObject({
      outcome: 'terminate',
      route: { next_envelope: { widget_id: 'w-selector' } },
    });
    expect(bookingSelectors.advance).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'service',
        actor: input.actor,
        handles: { service: 'opaque-service' },
      }),
    );
    expect(successors.mintBookingSelector).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'STAFF_SELECTOR' }),
    );
  });

  it('FBE2E-2 STAFF_SELECTOR retains the exact service handle and lets the canonical owner choose TIME_SLOT_SELECTOR', async () => {
    const { router, bookingSelectors, successors, projector } = fixture();
    bookingSelectors.advance.mockResolvedValue({
      nextKind: 'TIME_SLOT_SELECTOR',
      capabilityKey: 'booking.availability.read',
      source: { slots: [{ start: '2026-06-02T10:00:00.000Z' }] },
      fact: { capability: 'booking.availability.read' },
      inheritedHandles: {
        service: 'opaque-service',
        staff: 'opaque-staff',
      },
    });
    projector.composeCompletedRead.mockReturnValue({
      kind: 'composer_input',
      input: { kind_proposal: 'TIME_SLOT_SELECTOR' },
    });
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'REFINE',
            widgetKind: 'STAFF_SELECTOR',
            capabilitySpace: 'C9',
            capabilityKey: 'catalog.staff.read',
            frozenNounsJson: { service: 'opaque-service' },
          }),
          {
            principal: PRINCIPAL,
            facts: {
              validatedInputs: {
                closed: new Map([['staff_ref', ['opaque-staff']]]),
              },
            },
          },
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: { next_envelope: { widget_id: 'w-selector' } },
    });
    expect(bookingSelectors.advance).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'staff',
        handles: {
          service: 'opaque-service',
          staff: 'opaque-staff',
        },
      }),
    );
    expect(successors.mintBookingSelector).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'TIME_SLOT_SELECTOR' }),
    );
  });

  it('FBE2E-2 TIME_SLOT_SELECTOR creates an existing server draft and confirmation without client-selected capability', async () => {
    const { router, bookingPropose, bookingMinter, stores } = fixture();
    bookingPropose.proposeCreateSelection.mockResolvedValue({
      outcome: {
        receiptOutcome: 'ACCEPTED',
        refusalCode: null,
        actionReceiptRef: null,
        nextEnvelope: null,
        resolvedWidget: null,
        ownerDecision: {
          kind: 'booking_preview',
          preview: {
            subject: 'create',
            sourceCapabilityKey: 'appointments.own.create',
            frozenArgumentHandles: {
              service: 'opaque-service',
              staff: 'opaque-staff',
              slot: 'opaque-slot',
            },
            draftRef: 'draft-ref',
            appointmentRef: null,
            producingIntentTokenHash: null,
            when: '2026-06-02T10:00:00.000Z',
            whenPrevious: null,
            serviceLabel: 'Service',
            staffLabel: 'Staff',
            durationMinutes: 60,
            priceKopecks: 100000,
            currency: 'RUB',
            fact: { capability: 'appointments.own.create' },
          },
        },
      },
      values: new Map([
        ['service', 'service-1'],
        ['staff', 'staff-1'],
        ['slot', '2026-06-02T10:00:00.000Z'],
      ]),
    });
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'DRAFT',
            widgetKind: 'TIME_SLOT_SELECTOR',
            capabilitySpace: 'C9',
            capabilityKey: 'appointments.own.create',
            frozenNounsJson: {
              service: 'opaque-service',
              staff: 'opaque-staff',
            },
          }),
          {
            principal: PRINCIPAL,
            facts: {
              validatedInputs: {
                closed: new Map([['slot_ref', ['opaque-slot']]]),
              },
            },
          },
        ),
      ),
    ).resolves.toMatchObject({
      outcome: 'terminate',
      route: { next_envelope: { widget_id: 'w-confirmation' } },
    });
    expect(bookingPropose.proposeCreateSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: {
          service: 'opaque-service',
          staff: 'opaque-staff',
          slot: 'opaque-slot',
        },
      }),
    );
    expect(stores.putDraft).toHaveBeenCalledTimes(1);
    expect(bookingMinter.mint).toHaveBeenCalledTimes(1);
  });

  it('FBE2E-2 fails closed when a selector input or inherited handle set is not exact', async () => {
    const { router, bookingSelectors, bookingPropose } = fixture();
    await expect(
      routeEffect(
        router,
        ctx(
          rec({
            effect: 'REFINE',
            widgetKind: 'STAFF_SELECTOR',
            capabilitySpace: 'C9',
            capabilityKey: 'catalog.staff.read',
            frozenNounsJson: { service: 's', client_capability: 'forged' },
          }),
          {
            principal: PRINCIPAL,
            facts: {
              validatedInputs: {
                closed: new Map([['staff_ref', ['staff-a', 'staff-b']]]),
              },
            },
          },
        ),
      ),
    ).resolves.toMatchObject({
      route: { receipt_outcome: 'REFUSED' },
    });
    expect(bookingSelectors.advance).not.toHaveBeenCalled();
    expect(bookingPropose.proposeCreateSelection).not.toHaveBeenCalled();
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
