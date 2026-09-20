import { ControlRegistryService } from './control-registry.service';

const NOW = new Date('2026-09-20T00:00:00.000Z');

describe('U13a — control.widget.dismiss owns only presentation state', () => {
  it('R3.2.4 scopes tenant and principal in the read and writes LIVE → CANCELLED / cancelled', async () => {
    const prisma = {
      widgetEmission: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'e1', lifecycleState: 'LIVE' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const controls = new ControlRegistryService(prisma as never);
    await expect(
      controls.dismiss({
        tenantId: 't1',
        widgetId: 'w1',
        principalProofHash: 'p1',
        now: NOW,
      }),
    ).resolves.toEqual({ handled: true, code: 'dismissed' });
    expect(prisma.widgetEmission.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        widgetId: 'w1',
        intentRecords: {
          some: { tenantId: 't1', principalProofHash: 'p1' },
        },
      },
      select: { id: true, lifecycleState: true },
    });
    expect(prisma.widgetEmission.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', tenantId: 't1', lifecycleState: 'LIVE' },
      data: {
        lifecycleState: 'CANCELLED',
        deliveryStateJson: { state: 'cancelled', at: NOW.toISOString() },
      },
    });
  });

  it('N-CTRL-FOREIGN-P/T returns not_found and performs no write', async () => {
    const prisma = {
      widgetEmission: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    const controls = new ControlRegistryService(prisma as never);
    await expect(
      controls.dismiss({
        tenantId: 'foreign',
        widgetId: 'w1',
        principalProofHash: 'foreign',
        now: NOW,
      }),
    ).resolves.toEqual({ handled: false, code: 'not_found' });
    expect(prisma.widgetEmission.updateMany).not.toHaveBeenCalled();
  });
});
