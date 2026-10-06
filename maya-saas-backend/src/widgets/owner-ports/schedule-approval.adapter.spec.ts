import { ForbiddenException } from '@nestjs/common';
import { ScheduleApprovalAdapter } from './schedule-approval.adapter';
import { SCHEDULE_AE } from '../emission/schedule-intent-template';
import type { ActuatingRoutingInput } from '../routing/effect-router.ports';
import type { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../../common/domain.enums';

describe('schedule confirmation uses existing approval owner and observes late receipts', () => {
  const actor = {
    userId: 'owner',
    tenantId: 'salon',
    role: UserRole.TENANT_OWNER,
  };
  const input = {
    routing: {
      tenantId: actor.tenantId,
      record: {
        widgetKind: 'SETTINGS_DRAFT',
        capabilitySpace: 'AE',
        capabilityKey: SCHEDULE_AE,
        confirmationOfKind: 'draft',
        confirmationOfRef: 'approval',
        confirmationIdempotencyKey: 'approval',
      },
    },
    actorUserId: actor.userId,
    principal: { role: actor.role },
    resolvedNouns: {
      values: new Map([
        ['approval', 'approval'],
        ['payload', 'immutable-hash'],
      ]),
    },
  } as unknown as ActuatingRoutingInput;
  const success = {
    status: 'completed',
    canonical_actions: [{ state: 'SUCCEEDED', executionId: 'existing-ae' }],
  };
  function setup() {
    const runtime = { approve: jest.fn(), observeScheduleApproval: jest.fn() };
    return {
      runtime,
      adapter: new ScheduleApprovalAdapter(
        runtime as unknown as AiToolRuntimeService,
        {} as PrismaService,
      ),
    };
  }
  it('passes only immutable approval identity to existing owner', async () => {
    const { runtime, adapter } = setup();
    runtime.approve.mockResolvedValue(success);
    expect(await adapter.commit(input)).toMatchObject({
      receiptOutcome: 'ACCEPTED',
      actionReceiptRef: 'existing-ae',
      ownerDecision: { state: 'SUCCEEDED' },
    });
    expect(runtime.approve).toHaveBeenCalledWith(actor, 'approval', {
      payloadHash: 'immutable-hash',
    });
  });
  it('keeps UNKNOWN and later observes success without another approve', async () => {
    const { runtime, adapter } = setup();
    runtime.approve.mockResolvedValue({ status: 'unknown' });
    expect(await adapter.commit(input)).toMatchObject({
      actionReceiptRef: null,
      ownerDecision: { state: 'UNKNOWN' },
    });
    runtime.observeScheduleApproval
      .mockResolvedValueOnce({ status: 'unknown' })
      .mockResolvedValueOnce(success);
    expect(await adapter.terminal(actor, 'approval', 'immutable-hash')).toEqual(
      [
        expect.objectContaining({
          outcome: 'SUBMITTED',
          action_receipt_ref: null,
        }),
      ],
    );
    expect(await adapter.terminal(actor, 'approval', 'immutable-hash')).toEqual(
      [
        expect.objectContaining({
          outcome: 'CONFIRMED',
          text: 'График обновлён.',
          action_receipt_ref: 'existing-ae',
        }),
      ],
    );
    expect(runtime.approve).toHaveBeenCalledTimes(1);
  });
  it('does not report a timeout as authority denial or success', async () => {
    const { runtime, adapter } = setup();
    runtime.approve.mockRejectedValue(new Error('timeout'));
    runtime.observeScheduleApproval.mockRejectedValue(
      new Error('read unavailable'),
    );
    expect(await adapter.commit(input)).toMatchObject({
      receiptOutcome: 'ACCEPTED',
      actionReceiptRef: null,
      ownerDecision: { state: 'UNKNOWN' },
    });
  });
  it('retains explicit pre-dispatch role denial', async () => {
    const { runtime, adapter } = setup();
    runtime.approve.mockRejectedValue(new ForbiddenException());
    runtime.observeScheduleApproval.mockResolvedValue({ status: 'pending' });
    expect(await adapter.commit(input)).toMatchObject({
      receiptOutcome: 'REFUSED',
      refusalCode: 'insufficient_authority',
    });
  });
  it('requires canonical success evidence even if a tool says completed', async () => {
    const { runtime, adapter } = setup();
    runtime.approve.mockResolvedValue({ status: 'completed' });
    expect(await adapter.commit(input)).toMatchObject({
      actionReceiptRef: null,
      ownerDecision: { state: 'UNKNOWN' },
    });
  });
  it('refuses mismatched frozen confirmation before owner dispatch', async () => {
    const { runtime, adapter } = setup();
    expect(
      await adapter.commit({
        ...input,
        routing: {
          ...input.routing,
          record: { ...input.routing.record, confirmationOfRef: 'other' },
        },
      }),
    ).toMatchObject({ receiptOutcome: 'REFUSED' });
    expect(runtime.approve).not.toHaveBeenCalled();
  });
});
