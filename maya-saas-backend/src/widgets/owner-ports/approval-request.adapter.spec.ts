import type { CanonicalBulkService } from '../../marketing/canonical-bulk.service';
import type { ActuatingRoutingInput } from '../routing/effect-router.ports';
import { ApprovalRequestAdapter } from './approval-request.adapter';

const input = (
  overrides: Partial<ActuatingRoutingInput['routing']['record']> = {},
  nouns: ReadonlyMap<string, string> = new Map([
    ['campaign', 'campaign-1'],
    ['intent', 'a'.repeat(64)],
  ]),
): ActuatingRoutingInput =>
  ({
    routing: {
      tenantId: 'tenant-1',
      record: {
        widgetKind: 'APPROVAL',
        capabilitySpace: 'AE',
        capabilityKey: 'communication.bulk-campaign.admit.v2',
        confirmationOfKind: null,
        confirmationOfRef: null,
        approvalDecision: null,
        ...overrides,
      },
    },
    actorUserId: 'user-1',
    resolvedNouns: { row: 'A1', diverged: false, diff: [], values: nouns },
  }) as ActuatingRoutingInput;

const fixture = () => {
  const owner = {
    requestWidgetApproval: jest.fn().mockResolvedValue({
      id: 'execution-1',
      state: 'PENDING_APPROVAL',
    }),
    decideWidgetApproval: jest.fn().mockResolvedValue({
      id: 'execution-1',
      state: 'READY',
      approvalDecision: 'APPROVED',
    }),
  };
  return {
    owner,
    adapter: new ApprovalRequestAdapter(
      owner as unknown as CanonicalBulkService,
    ),
  };
};

describe('U13c approval request owner port', () => {
  it('G13-P06 delegates only the exact immutable B35 campaign and intent identities', async () => {
    const { owner, adapter } = fixture();
    await expect(adapter.request(input())).resolves.toMatchObject({
      receiptOutcome: 'ACCEPTED',
      actionReceiptRef: 'execution-1',
      ownerDecision: { state: 'PENDING_APPROVAL' },
    });
    expect(owner.requestWidgetApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      campaignId: 'campaign-1',
      intentHash: 'a'.repeat(64),
    });
  });

  it('N09 refuses an unknown capability or missing frozen noun before owner invocation', async () => {
    const { owner, adapter } = fixture();
    await expect(
      adapter.request(input({ capabilityKey: 'invented.capability' })),
    ).resolves.toMatchObject({ receiptOutcome: 'REFUSED' });
    await expect(adapter.request(input({}, new Map()))).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
    });
    expect(owner.requestWidgetApproval).not.toHaveBeenCalled();
  });

  it('G13-P08 delegates an exact server-owned approval decision', async () => {
    const { owner, adapter } = fixture();
    await expect(
      adapter.decide(
        input({
          confirmationOfKind: 'approval',
          confirmationOfRef: 'execution-1',
          approvalDecision: 'approve',
        }),
      ),
    ).resolves.toMatchObject({
      receiptOutcome: 'ACCEPTED',
      actionReceiptRef: 'execution-1',
      ownerDecision: { decision: 'APPROVED', state: 'READY' },
    });
    expect(owner.decideWidgetApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      executionId: 'execution-1',
      decision: 'APPROVED',
    });
  });

  it('N09 owner authority refusal remains Gate 14 authority and creates no accepted receipt', async () => {
    const { owner, adapter } = fixture();
    owner.requestWidgetApproval.mockRejectedValue(
      new Error('B35_OWNER_AUTHORITY_REQUIRED'),
    );
    await expect(adapter.request(input())).resolves.toMatchObject({
      receiptOutcome: 'REFUSED',
      actionReceiptRef: null,
      gate14RefusalReason: 'role_denied',
    });
  });
});
