import { WidgetThreadPageService } from './thread-page.service';
import { CommitBookingAdapter } from '../owner-ports/commit-booking.adapter';

/** Existing stored receipt and real resolver/owner adapter, synthetic boundaries. */
describe('explicit cancelled booking receipt recovery', () => {
  it('reaches only the cancel status reader using the stored confirmation identity', async () => {
    const principal = {
      authority: { tenantId: 'tenant-a', userId: 'user-a' },
      proofHash: 'proof-a',
    };
    const record = {
      tenantId: 'tenant-a',
      widgetId: 'widget-a',
      principalProofHash: 'proof-a',
      intentTokenHash: 'intent-a',
      capabilityKey: 'crm.appointment.cancel.v1',
      confirmationJson: { idempotency_key: 'stored-cancel-key' },
      receipts: [{ actionReceiptRef: null }],
    };
    const findMany = jest.fn(
      ({ where }: { where: { capabilityKey: { in: string[] } } }) =>
        Promise.resolve(
          where.capabilityKey.in.includes(record.capabilityKey) ? [record] : [],
        ),
    );
    const tx = { widgetIntentRecord: { findMany } };
    const readStatusForAccount = jest.fn(
      async (
        _tenant: string,
        _user: string,
        _key: string,
        revalidate: () => Promise<void>,
      ) => {
        await revalidate();
        return { executionId: 'original-cancel', state: 'SUCCEEDED' };
      },
    );
    const forAccount = jest.fn(() => {
      throw new Error('Status must never cancel again');
    });
    const adapter = new CommitBookingAdapter(
      {} as never,
      { readStatusForAccount, forAccount } as never,
      {} as never,
      {} as never,
    );
    const reconcileAcceptedReceipt = jest.fn().mockResolvedValue(true);
    const service = new WidgetThreadPageService(
      { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } as never,
      { resolve: () => Promise.resolve(principal) } as never,
      { verify: () => Promise.resolve({ ok: true }) } as never,
      { admits: () => Promise.resolve(true) } as never,
      undefined,
      adapter,
      { reconcileAcceptedReceipt } as never,
    );
    await service.refreshBookingReceipt('widget-a');
    expect(readStatusForAccount).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'stored-cancel-key',
      expect.any(Function),
    );
    expect(reconcileAcceptedReceipt).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      intentTokenHash: 'intent-a',
      actionReceiptRef: 'original-cancel',
    });
    expect(forAccount).not.toHaveBeenCalled();
  });
});
