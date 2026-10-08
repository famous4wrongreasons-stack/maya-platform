import { validate } from 'class-validator';
import { ResolveWidgetDto } from '../dto/resolve-widget.dto';
import { WidgetThreadPageService } from './thread-page.service';

const widgetId = '00000000-0000-4000-8000-000000000001';
const setup = () => {
  let active = true;
  const principal = {
    authority: { tenantId: 'tenant', userId: 'actor' },
    proofHash: 'proof',
  };
  const record = {
    tenantId: 'tenant',
    widgetId,
    principalProofHash: 'proof',
    intentTokenHash: 'token',
    capabilityKey: 'crm.appointment.create.v1',
    confirmationJson: { idempotency_key: 'original-server-key' },
    receipts: [{ actionReceiptRef: null as string | null }],
  };
  const findMany = jest.fn(
    ({
      where,
    }: {
      where: {
        tenantId: string;
        widgetId: string;
        principalProofHash: string;
        [key: string]: unknown;
      };
    }) =>
      Promise.resolve(
        active &&
          where.tenantId === record.tenantId &&
          where.widgetId === record.widgetId &&
          where.principalProofHash === record.principalProofHash
          ? [record]
          : [],
      ),
  );
  const tx = { widgetIntentRecord: { findMany } };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const principals = { resolve: jest.fn(() => Promise.resolve(principal)) };
  const seals = { verify: jest.fn().mockResolvedValue({ ok: true }) };
  const release = { admits: jest.fn().mockResolvedValue(true) };
  const booking = {
    readStatus: jest.fn(async (input: { revalidate: () => Promise<void> }) => {
      await input.revalidate();
      return { executionId: 'original-execution', state: 'SUCCEEDED' };
    }),
  };
  const audit = { reconcileAcceptedReceipt: jest.fn().mockResolvedValue(true) };
  const service = new WidgetThreadPageService(
    prisma as never,
    principals as never,
    seals,
    release as never,
    undefined,
    booking as never,
    audit as never,
  );
  return {
    service,
    record,
    principal,
    principals,
    seals,
    release,
    booking,
    audit,
    findMany,
    erase: () => {
      active = false;
    },
  };
};

describe('explicit original booking receipt status', () => {
  it('passes only stored original identity to the owner and fills the same receipt', async () => {
    const f = setup();
    await f.service.refreshBookingReceipt(widgetId);
    expect(f.booking.readStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant',
        actorUserId: 'actor',
        confirmationIdempotencyKey: 'original-server-key',
      }),
    );
    expect(f.findMany.mock.calls[0][0].where).toMatchObject({
      consumedAt: { not: null },
      erasedAt: null,
      effect: 'COMMIT',
      capabilitySpace: 'AE',
      widgetKind: 'BOOKING_CONFIRMATION',
      emission: {
        erasedAt: null,
        turn: { erasedAt: null, principalProofHash: 'proof' },
      },
    });
    expect(f.audit.reconcileAcceptedReceipt).toHaveBeenCalledWith({
      tenantId: 'tenant',
      intentTokenHash: 'token',
      actionReceiptRef: 'original-execution',
    });
  });
  it.each([
    'foreign-tenant',
    'foreign-actor',
    'foreign-widget',
    'erased',
    'unsealed',
    'release-withdrawn',
    'missing-key',
  ])('does not reach a provider owner for %s', async (reason) => {
    const f = setup();
    let id = widgetId;
    if (reason === 'foreign-tenant') f.principal.authority.tenantId = 'foreign';
    if (reason === 'foreign-actor') f.principal.proofHash = 'foreign';
    if (reason === 'foreign-widget') id = 'foreign';
    if (reason === 'erased') f.erase();
    if (reason === 'unsealed') f.seals.verify.mockResolvedValue({ ok: false });
    if (reason === 'release-withdrawn')
      f.release.admits.mockResolvedValue(false);
    if (reason === 'missing-key')
      f.record.confirmationJson.idempotency_key = '';
    await f.service.refreshBookingReceipt(id);
    expect(f.booking.readStatus).not.toHaveBeenCalled();
    expect(f.audit.reconcileAcceptedReceipt).not.toHaveBeenCalled();
  });
  it('revalidates the current owner of a completed receipt without filling it again', async () => {
    const f = setup();
    f.record.receipts[0].actionReceiptRef = 'original-execution';
    await f.service.refreshBookingReceipt(widgetId);
    expect(f.booking.readStatus).toHaveBeenCalledTimes(1);
    expect(f.audit.reconcileAcceptedReceipt).not.toHaveBeenCalled();
  });
  it.each(['UNKNOWN', 'READY', 'NOT_EXECUTED', 'FAILED'])(
    'never publishes success for %s',
    async (state) => {
      const f = setup();
      f.booking.readStatus.mockResolvedValue({
        executionId: 'original-execution',
        state,
      });
      await f.service.refreshBookingReceipt(widgetId);
      expect(f.audit.reconcileAcceptedReceipt).not.toHaveBeenCalled();
    },
  );
  it('revalidates after provider read and refuses erasure before receipt completion', async () => {
    const f = setup();
    f.booking.readStatus.mockImplementation(() => {
      f.erase();
      return Promise.resolve({
        executionId: 'original-execution',
        state: 'SUCCEEDED',
      });
    });
    await expect(f.service.refreshBookingReceipt(widgetId)).rejects.toThrow(
      'widget_receipt_unavailable',
    );
    expect(f.audit.reconcileAcceptedReceipt).not.toHaveBeenCalled();
  });
  it('rejects current actor revocation inside the provider owner callback', async () => {
    const f = setup();
    f.booking.readStatus.mockImplementation(async (input) => {
      f.principal.proofHash = 'revoked';
      await input.revalidate();
      return { executionId: 'original-execution', state: 'SUCCEEDED' };
    });
    await expect(f.service.refreshBookingReceipt(widgetId)).rejects.toThrow(
      'widget_receipt_unavailable',
    );
    expect(f.audit.reconcileAcceptedReceipt).not.toHaveBeenCalled();
  });
});

describe('closed explicit receipt READ DTO', () => {
  it('accepts one bounded locator and leaves ordinary page reads valid', async () => {
    for (const body of [
      { thread_page: { limit: 20 } },
      { thread_page: { limit: 20 }, booking_receipt: { widget_id: widgetId } },
    ])
      expect(
        await validate(Object.assign(new ResolveWidgetDto(), body)),
      ).toEqual([]);
  });
  it.each([
    { booking_receipt: null },
    { booking_receipt: { widget_id: widgetId, execution_id: 'invented' } },
    { booking_receipt: { widget_id: 'invalid' } },
    {
      booking_receipt: { widget_id: widgetId },
      rendered: {
        widget_id: widgetId,
        body_hash: 'a'.repeat(64),
        envelope_seal: 'b'.repeat(64),
      },
    },
    { booking_receipt: { widget_id: widgetId }, thread_page: { limit: 1 } },
    {
      booking_receipt: { widget_id: widgetId },
      thread_page: { limit: 20, before: widgetId },
    },
  ])('refuses an unbounded or mixed status request %j', async (body) => {
    expect(
      await validate(
        Object.assign(new ResolveWidgetDto(), {
          thread_page: { limit: 20 },
          ...body,
        }),
      ),
    ).not.toEqual([]);
  });
});
