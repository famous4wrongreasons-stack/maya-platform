import { ConflictException } from '@nestjs/common';
import { UserRole } from '../../common/domain.enums';
import { ServicePriceApprovalAdapter } from './service-price-approval.adapter';
import type { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EntitlementsService } from '../../entitlements/entitlements.service';
import type { ActuatingRoutingInput } from '../routing/effect-router.ports';
import { servicePriceApprovalRef } from '../pricing/service-price-approval.port';

const hash = 'a'.repeat(64);
const source = {
  id: 'approval-1',
  payloadHash: hash,
  serviceId: '201',
  proposedPrice: 2500,
  origin: {
    userTurnId: 'turn-1',
    conversationId: 'conversation-1',
    principalProofHash: 'proof',
  },
};
function setup() {
  const runtime = {
    readServicePriceWidgetApproval: jest.fn().mockResolvedValue(source),
    approve: jest.fn().mockResolvedValue({
      status: 'completed',
      result: {
        verified: true,
        source: 'yclients',
        service_id: '201',
        price_rubles: 2500,
        currency: 'RUB',
        action_execution_id: 'actual-action-1',
      },
    }),
    reject: jest.fn().mockResolvedValue({ status: 'rejected' }),
  };
  const prisma = {
    $transaction: (work: (tx: unknown) => unknown) => work({}),
    widgetTimelineTurn: {
      findFirst: jest.fn().mockResolvedValue({ id: 'turn-1' }),
    },
  };
  const entitlements = {
    assertWidgetRuntimeAdmission: jest.fn().mockResolvedValue(undefined),
  };
  const principals = {
    resolve: jest.fn().mockResolvedValue({
      role: UserRole.TENANT_OWNER,
      authority: {
        kind: 'USER',
        tenantId: 'tenant-1',
        userId: 'owner-1',
        membershipId: 'member-1',
      },
    }),
  };
  const adapter = new ServicePriceApprovalAdapter(
    runtime as unknown as AiToolRuntimeService,
    prisma as unknown as PrismaService,
    entitlements as unknown as EntitlementsService,
    principals,
  );
  const input = {
    routing: {
      tenantId: 'tenant-1',
      record: {
        widgetKind: 'APPROVAL',
        capabilitySpace: 'AE',
        capabilityKey: 'crm.service.fixed-price.update.v1',
        confirmationOfKind: 'approval',
        confirmationOfRef: 'approval-1',
        producedByIntentTokenHash: null,
        approvalOfIntentRef: null,
        approvalDecision: 'approve',
      },
    },
    actorUserId: 'owner-1',
    principal: { proofHash: 'proof' },
    resolvedNouns: {
      values: new Map([
        ['approval', servicePriceApprovalRef('approval-1', hash)],
      ]),
    },
  } as unknown as ActuatingRoutingInput;
  return { runtime, prisma, entitlements, principals, adapter, input };
}

describe('typed service price approval owner', () => {
  it('reports only the matching authoritative receipt and composes the admission guard', async () => {
    const f = setup();
    const result = await f.adapter.decide(f.input);
    expect(result.actionReceiptRef).toBe('actual-action-1');
    expect(result.ownerDecision).toMatchObject({
      state: 'SUCCEEDED',
      decision: 'APPROVED',
    });
    const calls = f.runtime.approve.mock.calls as unknown as Array<
      [
        unknown,
        unknown,
        unknown,
        { admissionGuard: (tx: unknown) => Promise<void> },
      ]
    >;
    const guard = calls[0][3].admissionGuard;
    await guard('owned-transaction');
    expect(f.entitlements.assertWidgetRuntimeAdmission).toHaveBeenCalledWith(
      'tenant-1',
      'owned-transaction',
    );
  });
  it('never treats ACCEPTED with uncertain canonical outcome as success', async () => {
    const f = setup();
    f.runtime.approve.mockResolvedValue({ status: 'unknown' });
    const result = await f.adapter.decide(f.input);
    expect(result.actionReceiptRef).toBeNull();
    expect(result.ownerDecision).toMatchObject({
      state: 'UNKNOWN',
      status: 'unknown',
    });
    expect(result.ownerDecision).not.toHaveProperty('outcome');
  });
  it.each([
    new Error('database connection lost'),
    new ConflictException('concurrent decision'),
  ])(
    'holds an ambiguous decision invocation without asserting its decision: %p',
    async (error) => {
      const f = setup();
      f.runtime.approve.mockRejectedValue(error);
      const result = await f.adapter.decide(f.input);
      expect(result.receiptOutcome).toBe('ACCEPTED');
      expect(result.actionReceiptRef).toBeNull();
      expect(result.ownerDecision).toMatchObject({
        state: 'UNKNOWN',
        decision: null,
      });
    },
  );
  it('does not accept a mismatching provider result as the requested outcome', async () => {
    const f = setup();
    f.runtime.approve.mockResolvedValue({
      status: 'completed',
      result: {
        verified: true,
        source: 'yclients',
        service_id: 'other-service',
        price_rubles: 2500,
        currency: 'RUB',
        action_execution_id: 'other-action',
      },
    });
    const result = await f.adapter.decide(f.input);
    expect(result.actionReceiptRef).toBeNull();
    expect(result.ownerDecision).toMatchObject({ state: 'UNKNOWN' });
  });
  it('refuses a revoked owner before any approval invocation', async () => {
    const f = setup();
    f.principals.resolve.mockResolvedValue(null);
    expect((await f.adapter.decide(f.input)).receiptOutcome).toBe('REFUSED');
    expect(f.runtime.approve).not.toHaveBeenCalled();
  });
  it('rejects through the same typed owner without an action receipt', async () => {
    const f = setup();
    const input = {
      ...f.input,
      routing: {
        ...f.input.routing,
        record: { ...f.input.routing.record, approvalDecision: 'reject' },
      },
    };
    const result = await f.adapter.decide(input);
    expect(result.actionReceiptRef).toBeNull();
    expect(result.ownerDecision).toMatchObject({ state: 'REJECTED' });
    expect(f.runtime.approve).not.toHaveBeenCalled();
  });
});
