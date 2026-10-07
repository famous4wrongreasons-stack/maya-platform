import type { EntitlementsService } from '../../entitlements/entitlements.service';
import type { ActionExecution } from '@prisma/client';

import { admitWithInvocationReceipt } from '../../action-engine/action-invocation-receipt.context';
import type { ClientAppointmentCreateService } from '../../appointments/client-appointment-create.service';
import type { ClientAppointmentCancelService } from '../../crm/client-appointment-cancel.service';
import type { ClientAppointmentRescheduleService } from '../../crm/client-appointment-reschedule.service';
import type { ActuatingRoutingInput } from '../routing/effect-router.ports';
import { CommitBookingAdapter } from './commit-booking.adapter';

const input = (
  capabilityKey = 'crm.appointment.create.v1',
  key: unknown = 'server-confirmation-key',
): ActuatingRoutingInput =>
  ({
    expectedBookingFactsHash: 'a'.repeat(64),
    routing: {
      tenantId: 'tenant-1',
      record: {
        widgetKind: 'BOOKING_CONFIRMATION',
        capabilitySpace: 'AE',
        capabilityKey,
        confirmationIdempotencyKey: key,
      },
    },
    actorUserId: 'user-1',
    resolvedNouns: {
      row: 'A1',
      diverged: false,
      diff: [],
      values: new Map([
        ['appointment', 'appointment-1'],
        ['staff', 'staff-1'],
        ['service', 'service-1'],
        ['slot', '2026-10-01T09:00:00.000Z'],
      ]),
    },
  }) as ActuatingRoutingInput;

const execution = { id: 'execution-1' } as ActionExecution;

const fixture = () => {
  let observedInvocation: unknown;
  const transaction = {} as never;
  const entitlements = {
    assertWidgetRuntimeAdmission: jest.fn().mockResolvedValue(undefined),
    withWidgetRuntimeAdmission: jest.fn(
      (_tenantId: string, admit: (transaction: never) => Promise<unknown>) =>
        admit(transaction),
    ),
  };
  const create = {
    forAccount: jest.fn(),
    executionResult: jest.fn().mockResolvedValue({
      executionId: execution.id,
      state: 'SUCCEEDED',
      outcomeCode: 'appointment_created',
    }),
  };
  const cancel = { forAccount: jest.fn() };
  const reschedule = { forAccount: jest.fn() };
  const canonicalInvocation = (...args: unknown[]) => {
    const invocation = args.at(-1) as {
      sourceType: string;
      callerIdempotency: { scope: string; key: string };
    };
    observedInvocation = invocation;
    return admitWithInvocationReceipt(
      {
        source: { type: invocation.sourceType },
        callerIdempotency: invocation.callerIdempotency,
      } as never,
      () => Promise.resolve(execution),
      {} as never,
    );
  };
  create.forAccount.mockImplementation(canonicalInvocation);
  cancel.forAccount.mockImplementation(canonicalInvocation);
  reschedule.forAccount.mockImplementation(canonicalInvocation);
  return {
    create,
    cancel,
    reschedule,
    entitlements,
    transaction,
    observedInvocation: () => observedInvocation,
    adapter: new CommitBookingAdapter(
      create as unknown as ClientAppointmentCreateService,
      cancel as unknown as ClientAppointmentCancelService,
      reschedule as unknown as ClientAppointmentRescheduleService,
      entitlements as unknown as EntitlementsService,
    ),
  };
};

describe('U13c booking COMMIT owner port', () => {
  it('does not invoke create without the server draft facts precondition', async () => {
    const h = fixture();
    await expect(
      h.adapter.commit({ ...input(), expectedBookingFactsHash: undefined }),
    ).resolves.toMatchObject({ receiptOutcome: 'REFUSED' });
    expect(h.create.forAccount).not.toHaveBeenCalled();
  });
  it.each([
    ['crm.appointment.create.v1', 'create'],
    ['crm.appointment.cancel.v1', 'cancel'],
    ['crm.appointment.reschedule.v1', 'reschedule'],
  ] as const)(
    'G13-P07 routes %s through its existing canonical owner and exact receipt identity',
    async (capability, ownerName) => {
      const built = fixture();
      await expect(built.adapter.commit(input(capability))).resolves.toEqual({
        receiptOutcome: 'ACCEPTED',
        refusalCode: null,
        actionReceiptRef: 'execution-1',
        nextEnvelope: null,
        resolvedWidget: null,
        ownerDecision: {
          state: 'SUCCEEDED',
          outcomeCode: 'appointment_created',
        },
        gate14RefusalReason: null,
      });
      expect(built[ownerName].forAccount).toHaveBeenCalledTimes(1);
      const invocation = built.observedInvocation();
      expect(invocation).toEqual({
        ...(capability === 'crm.appointment.create.v1'
          ? { expectedBookingFactsHash: 'a'.repeat(64) }
          : {}),
        sourceType: 'authenticated_request',
        callerIdempotency: {
          scope: 'maya.widgets.booking.commit.v1',
          key: 'server-confirmation-key',
        },
      });
      expect(invocation).not.toHaveProperty('widgetId');
    },
  );

  it('N10 refuses a missing server idempotency identity or an unregistered capability before invocation', async () => {
    const built = fixture();
    await expect(
      built.adapter.commit(input(undefined, null)),
    ).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
      actionReceiptRef: null,
    });
    await expect(
      built.adapter.commit(input('crm.appointment.invented.v1')),
    ).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
      actionReceiptRef: null,
    });
    expect(built.create.forAccount).not.toHaveBeenCalled();
    expect(built.cancel.forAccount).not.toHaveBeenCalled();
    expect(built.reschedule.forAccount).not.toHaveBeenCalled();
  });

  it('N11 refuses an owner invocation whose Action Engine request does not preserve source and key', async () => {
    const built = fixture();
    built.create.forAccount.mockImplementation(() =>
      admitWithInvocationReceipt(
        {
          source: { type: 'telegram_update' },
          callerIdempotency: {
            scope: 'maya.widgets.booking.commit.v1',
            key: 'different-key',
          },
        } as never,
        () => Promise.resolve(execution),
      ),
    );
    await expect(built.adapter.commit(input())).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
      actionReceiptRef: null,
    });
    expect(built.create.executionResult).not.toHaveBeenCalled();
  });

  it('N11-HARNESS a canonical invocation without an existing transaction reaches persistence', async () => {
    const built = fixture();
    const persist = jest.fn().mockResolvedValue(execution);
    const request = {
      source: { type: 'authenticated_request' },
      callerIdempotency: {
        scope: 'maya.widgets.booking.commit.v1',
        key: 'server-confirmation-key',
      },
    };
    built.create.forAccount.mockImplementation(() =>
      admitWithInvocationReceipt(request as never, persist),
    );
    await expect(built.adapter.commit(input())).resolves.toMatchObject({
      receiptOutcome: 'ACCEPTED',
      actionReceiptRef: 'execution-1',
    });
    expect(built.entitlements.withWidgetRuntimeAdmission).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Function),
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(request, built.transaction);
  });

  it('N11-KEY refuses a substituted confirmation key with the correct authenticated source', async () => {
    const built = fixture();
    const persist = jest.fn().mockResolvedValue(execution);
    built.create.forAccount.mockImplementation(() =>
      admitWithInvocationReceipt(
        {
          source: { type: 'authenticated_request' },
          callerIdempotency: {
            scope: 'maya.widgets.booking.commit.v1',
            key: 'different-key',
          },
        } as never,
        persist,
      ),
    );
    await expect(built.adapter.commit(input())).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
      actionReceiptRef: null,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(
      built.entitlements.withWidgetRuntimeAdmission,
    ).not.toHaveBeenCalled();
    expect(
      built.entitlements.assertWidgetRuntimeAdmission,
    ).not.toHaveBeenCalled();
    expect(built.create.executionResult).not.toHaveBeenCalled();
  });

  it.each([
    'agent_task',
    'scheduler',
    'webhook',
    'legacy_bridge',
    'synthetic_shadow',
  ])(
    'WR-F33 refuses a forged %s source even with the correct server key',
    async (source) => {
      const built = fixture();
      built.create.forAccount.mockImplementation(() =>
        admitWithInvocationReceipt(
          {
            source: { type: source },
            callerIdempotency: {
              scope: 'maya.widgets.booking.commit.v1',
              key: 'server-confirmation-key',
            },
          } as never,
          () => Promise.resolve(execution),
        ),
      );
      await expect(built.adapter.commit(input())).resolves.toMatchObject({
        receiptOutcome: 'REFUSED',
        actionReceiptRef: null,
      });
      expect(built.create.executionResult).not.toHaveBeenCalled();
    },
  );

  it('N12/B-29 accepts UNKNOWN without inventing a receipt ref and leaves reconciliation to the canonical path', async () => {
    const built = fixture();
    built.create.executionResult.mockResolvedValue({
      executionId: execution.id,
      state: 'UNKNOWN',
      outcomeCode: null,
    });
    await expect(built.adapter.commit(input())).resolves.toEqual({
      receiptOutcome: 'ACCEPTED',
      refusalCode: null,
      actionReceiptRef: null,
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: { state: 'UNKNOWN', reconciliation: 'required' },
      gate14RefusalReason: null,
    });
  });
});
