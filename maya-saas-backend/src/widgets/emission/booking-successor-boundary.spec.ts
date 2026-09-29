import { SuccessorMinterService } from './successor-minter.service';

const proof = 'a'.repeat(64);
const request = () => ({
  tenantId: 'tenant',
  predecessorWidgetId: 'prior',
  predecessorIntentTokenHash: 'token',
  principal: { authority: { tenantId: 'tenant' }, proofHash: proof },
  kind: 'STAFF_SELECTOR',
  source: {},
  inheritedHandles: { service: 'handle' },
  composerInput: {},
  now: new Date('2026-09-29T12:00:00Z'),
});

const fixture = (initialProof = proof, currentProof = proof) => {
  const previous = {
    widgetId: 'prior',
    turnId: 'turn',
    kind: 'SERVICE_SELECTOR',
    lifecycleState: 'LIVE',
    supersededByWidgetId: null,
    deliveryChannel: 'pwa',
    erasedAt: null,
    turn: { conversationId: 'conversation', erasedAt: null },
    intentRecords: [
      {
        principalProofHash: initialProof,
        erasedAt: null,
        consumedAt: new Date(),
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'catalog.services.read',
      },
    ],
    renderReceipts: [
      {
        deliveryChannel: 'pwa',
        erasedAt: null,
        composedEnvelopeJson: {
          provenance: { source_capability: 'catalog.services.read' },
        },
      },
    ],
  };
  const closed = jest.fn(
    (query: {
      where: { intentRecords?: { some?: { principalProofHash?: string } } };
    }) => {
      // Simulate a principal change between the read and the lock: removing the
      // query predicate makes the update match, so the negative case must fail.
      const expected = query.where.intentRecords?.some?.principalProofHash;
      return Promise.resolve({
        count: expected === undefined || expected === currentProof ? 1 : 0,
      });
    },
  );
  const tx = {
    $executeRaw: jest.fn(),
    widgetEmission: {
      updateMany: closed,
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const cancel = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    widgetEmission: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(previous)
        .mockResolvedValue(null),
      updateMany: cancel,
    },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  };
  const emitBookingSelector = jest
    .fn()
    .mockResolvedValue({ widgetId: 'next', envelope: {} });
  return {
    service: new SuccessorMinterService(
      prisma as never,
      { emitBookingSelector } as never,
    ),
    emitBookingSelector,
    closed,
    cancel,
  };
};

describe('Booking successor principal boundary [BUILD]', () => {
  it('WR-L13 refuses a foreign principal before minting a selector', async () => {
    const f = fixture('b'.repeat(64));
    await expect(
      f.service.mintBookingSelector(request() as never),
    ).resolves.toBeNull();
    expect(f.emitBookingSelector).not.toHaveBeenCalled();
    expect(f.closed).not.toHaveBeenCalled();
  });
  it('WR-L13 lock-time principal change cancels the newly minted successor', async () => {
    const f = fixture(proof, 'b'.repeat(64));
    await expect(
      f.service.mintBookingSelector(request() as never),
    ).resolves.toBeNull();
    expect(f.emitBookingSelector).toHaveBeenCalledTimes(1);
    expect(f.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleState: 'CANCELLED' } }),
    );
  });
  it('WR-L13 the unchanged principal can link the successor', async () => {
    const f = fixture();
    await expect(
      f.service.mintBookingSelector(request() as never),
    ).resolves.toMatchObject({ widgetId: 'next' });
    expect(f.cancel).not.toHaveBeenCalled();
  });
});
