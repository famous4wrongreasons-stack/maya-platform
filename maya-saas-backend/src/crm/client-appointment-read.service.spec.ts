import { ClientAppointmentReadService } from './client-appointment-read.service';
import { LegacyClientChannelController } from './client-channel.controller';
import { TenantContextService } from '../tenancy/tenant-context.service';

describe('B26 channel transport and fail-closed reader', () => {
  it('Client without Maya User uses authenticated channel proof and server-resolved tenant', async () => {
    const context = new TenantContextService();
    const forChannel = jest.fn(() => {
      expect(context.requireTenantId()).toBe('tenant');
      expect(context.get()?.userId).toBeNull();
      return [];
    });
    const bridge = {
      assertBridgeSecret: jest.fn(),
      assertBridgeIntegrationBinding: jest.fn().mockReturnValue({
        provider: 'yclients',
        externalCompanyId: 'company',
      }),
      resolveTenantByIntegration: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant' }),
    };
    const controller = new LegacyClientChannelController(
      bridge as never,
      context,
      {} as never,
      { forChannel } as never,
    );
    const envelope = {
      provider: 'yclients',
      externalCompanyId: 'company',
      channelProof: 'verified-channel-credential',
      payload: {},
    };
    await expect(
      controller.command('bridge-secret', 'appointments-projection', envelope),
    ).resolves.toEqual([]);
    expect(forChannel).toHaveBeenCalledWith(envelope.channelProof);
    for (const payload of [
      { clientId: 'forged' },
      { phone: 'forged' },
      { chat_id: 'forged' },
    ])
      await expect(
        controller.command('bridge-secret', 'appointments-projection', {
          ...envelope,
          payload,
        }),
      ).rejects.toThrow('No Client identity may be supplied');
    expect(forChannel).toHaveBeenCalledTimes(1);
  });

  it.each(
    [
      [],
      [
        { subjectHashVersion: 1, verificationVersion: 1 },
        { subjectHashVersion: 1, verificationVersion: 1 },
      ],
      [{ subjectHashVersion: 2, verificationVersion: 1 }],
    ].map((links) => ({ links })),
  )(
    'missing, ambiguous or unsupported binding never reads appointments: %j',
    async ({ links }) => {
      const context = new TenantContextService();
      const findMany = jest.fn();
      const tx = {
        $executeRaw: jest.fn(),
        clientChannelLink: { findMany: jest.fn().mockResolvedValue(links) },
        appointment: { findMany },
      };
      const prisma = {
        $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
      };
      const channels = {
        authenticate: jest.fn().mockResolvedValue({
          tenantId: 'tenant',
          provider: 'telegram',
          providerSubjectHash: 'hmac',
        }),
      };
      const reader = new ClientAppointmentReadService(
        prisma as never,
        context,
        channels as never,
        {} as never,
        {} as never,
      );
      await expect(
        context.runAsPublicTenant('tenant', () => reader.forChannel('proof')),
      ).rejects.toThrow('client_link_required');
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});
