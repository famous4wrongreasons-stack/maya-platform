import { ConfigService } from '@nestjs/config';
import { CommunicationWebPushService } from './communication-web-push.service';

describe('Web Push historical intent ownership', () => {
  it.each([0, 1])(
    'a binding created %s ms at/after the original intent cannot receive its history',
    async (offset) => {
      const createdAt = new Date('2026-09-01T00:00:00.000Z');
      const prisma = {
        actionExecution: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'original',
            tenantId: 'tenant',
            createdAt,
          }),
        },
        clientChannelLink: {
          findMany: jest.fn().mockResolvedValue([
            {
              clientId: 'relinked-client',
              createdAt: new Date(createdAt.getTime() + offset),
              verifiedAt: new Date(createdAt.getTime() + offset),
            },
          ]),
        },
      };
      const kernel = {
        readTrustedNormalizedInput: jest.fn().mockResolvedValue({
          channel: 'telegram',
          messageType: 'appointment_reminder',
          recipientIdentityRef: 'a'.repeat(64),
        }),
      };
      const endpoints = {
        eligibleIds: jest.fn(),
        resolveForDelivery: jest.fn(),
      };
      const transport = { send: jest.fn() };
      const service = new CommunicationWebPushService(
        prisma as never,
        {} as never,
        {} as never,
        kernel as never,
        endpoints as never,
        {} as never,
        transport as never,
        new ConfigService({
          CRM_ENCRYPTION_KEY: 'synthetic-test-key'.repeat(3),
        }),
      );
      expect(
        await service.deliverFromAcceptedReceipt('tenant', 'original'),
      ).toEqual({ status: 'CLIENT_BINDING_POSTDATES_INTENT' });
      expect(endpoints.eligibleIds).not.toHaveBeenCalled();
      expect(transport.send).not.toHaveBeenCalled();
    },
  );
});
