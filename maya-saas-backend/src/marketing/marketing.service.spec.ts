import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { CommunicationDeliveryService } from '../communication-delivery/communication-delivery.service';
import { CommunicationShadowService } from '../communication-shadow';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryService } from '../recovery/recovery.service';
import { MarketingService } from './marketing.service';

type AudienceCreateInput = {
  data: {
    candidateCount: number;
    eligibleCount: number;
    unavailableCount: number;
    recipientUserIdsJson: string[];
  };
};

type CampaignCreateInput = {
  data: {
    tenantId: string;
    audienceId: string;
    recipientCount: number;
    recipientUserIdsJson: string[];
    channel: string;
    status: string;
    expiresAt: Date;
  };
};

type CampaignUpdateInput = {
  data: { status: string; sentCount: number };
};

describe('MarketingService', () => {
  const future = new Date('2099-01-01T00:00:00.000Z');

  function makeService(input?: {
    memberships?: Array<{
      userId: string;
      user: { phone: string | null };
      customerProfile: { marketingConsentAt: Date | null };
    }>;
    searchClients?: jest.Mock;
    audienceCreate?: jest.Mock;
    audienceUpsert?: jest.Mock;
    campaignCreate?: jest.Mock;
    campaignFindFirst?: jest.Mock;
    audienceFindFirst?: jest.Mock;
    audienceRecipientFindMany?: jest.Mock;
    campaignUpdate?: jest.Mock;
    communicationDelivery?: { deliverBulkCampaign: jest.Mock };
    communicationShadow?: { plan: jest.Mock };
    consentEvidenceUpsert?: jest.Mock;
    pushTokens?: Array<{ userId: string; token: string }>;
  }) {
    const prisma = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue(input?.memberships ?? []),
      },
      marketingAudience: {
        create:
          input?.audienceCreate ??
          jest.fn().mockResolvedValue({
            id: 'audience-123',
            candidateCount: 0,
            eligibleCount: 0,
            unavailableCount: 0,
            expiresAt: future,
          }),
        findFirst: input?.audienceFindFirst ?? jest.fn(),
        upsert:
          input?.audienceUpsert ??
          jest.fn().mockResolvedValue({
            id: 'shadow-audience-default',
            snapshotHash: 'shadow-snapshot-default',
          }),
      },
      marketingAudienceRecipient: {
        findMany:
          input?.audienceRecipientFindMany ?? jest.fn().mockResolvedValue([]),
      },
      marketingCampaign: {
        create: input?.campaignCreate ?? jest.fn(),
        findFirst: input?.campaignFindFirst ?? jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update:
          input?.campaignUpdate ??
          jest
            .fn<
              (input: CampaignUpdateInput) => Promise<{
                id: string;
                status: string;
                recipientCount: number;
                sentCount: number;
              }>
            >()
            .mockImplementation((write: CampaignUpdateInput) =>
              Promise.resolve({
                id: 'campaign-123',
                status: write.data.status,
                recipientCount: 2,
                sentCount: write.data.sentCount,
              }),
            ),
      },
      marketingConsentEvidence: {
        upsert:
          input?.consentEvidenceUpsert ??
          jest.fn().mockResolvedValue({
            id: 'consent-1',
            status: 'granted',
            grantedAt: new Date('2025-01-01'),
            revokedAt: null,
            expiresAt: null,
          }),
      },
      devicePushToken: {
        findMany: jest.fn().mockResolvedValue(input?.pushTokens ?? []),
      },
    };
    const crm = {
      searchClients: input?.searchClients ?? jest.fn().mockResolvedValue([]),
    };
    const communicationDelivery = input?.communicationDelivery ?? {
      deliverBulkCampaign: jest.fn().mockImplementation(async () => {
        const rows =
          (await prisma.marketingAudienceRecipient.findMany()) as Array<{
            externalClientId: string;
            eligibilityStatus: string;
          }>;
        return {
          actionExecutionId: 'bulk-action-1',
          deliveryId: 'bulk-delivery-1',
          status: 'delivered',
          deliveredUserIds: rows
            .filter((row) => row.eligibilityStatus === 'ALLOW')
            .map((row) => row.externalClientId)
            .sort(),
        };
      }),
    };
    const communicationShadow = input?.communicationShadow ?? {
      plan: jest.fn().mockResolvedValue({ externalMessagesSent: 0 }),
    };
    const recovery = {
      recordConsentSafeTouchpoint: jest.fn().mockResolvedValue({ id: 'tp-1' }),
    };
    const service = new MarketingService(
      prisma as unknown as PrismaService,
      crm as unknown as CrmService,
      communicationDelivery as unknown as CommunicationDeliveryService,
      recovery as unknown as RecoveryService,
      new ClientRecencyFactsService(crm as unknown as CrmService),
      communicationShadow as unknown as CommunicationShadowService,
    );
    return {
      service,
      prisma,
      crm,
      communicationDelivery,
      communicationShadow,
      recovery,
    };
  }

  it('returns only aggregate audience data and never leaks client PII', async () => {
    let createdAudience: AudienceCreateInput | undefined;
    const audienceCreate = jest
      .fn<
        (input: AudienceCreateInput) => Promise<{
          id: string;
          candidateCount: number;
          eligibleCount: number;
          unavailableCount: number;
          expiresAt: Date;
        }>
      >()
      .mockImplementation((write: AudienceCreateInput) => {
        createdAudience = write;
        return Promise.resolve({
          id: 'audience-123',
          candidateCount: write.data.candidateCount,
          eligibleCount: write.data.eligibleCount,
          unavailableCount: write.data.unavailableCount,
          expiresAt: future,
        });
      });
    const searchClients = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'crm-1',
          name: 'Private Name',
          phone: '+7 999 111-22-33',
          visits_count: 5,
          sold_amount: 15_000,
          last_visit_date: '2025-01-01T10:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([]);
    const { service } = makeService({
      memberships: [
        {
          userId: 'user-1',
          user: { phone: '+7 999 111-22-33' },
          customerProfile: { marketingConsentAt: new Date('2025-01-01') },
        },
        {
          userId: 'user-2',
          user: { phone: '+7 999 444-55-66' },
          customerProfile: { marketingConsentAt: new Date('2025-01-01') },
        },
      ],
      searchClients,
      audienceCreate,
    });

    const result = await service.findAudience({
      tenantId: 'tenant-1',
      actorUserId: 'owner-1',
      rule: { inactive_days: 90, minimum_visits: 2, max_recipients: 100 },
    });

    expect(result).toMatchObject({
      audience_id: 'audience-123',
      candidate_count: 2,
      eligible_count: 1,
      unavailable_count: 1,
      safeguards: {
        marketing_consent_required: true,
        pii_returned_to_model: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('Private Name');
    expect(JSON.stringify(result)).not.toContain('9991112233');
    expect(createdAudience?.data.recipientUserIdsJson).toEqual(['user-1']);
  });

  it('creates an exact persisted preview without returning recipients or PII', async () => {
    let createdCampaign: CampaignCreateInput | undefined;
    const campaignCreate = jest
      .fn<
        (input: CampaignCreateInput) => Promise<{
          id: string;
          recipientCount: number;
          channel: string;
          status: string;
          expiresAt: Date;
        }>
      >()
      .mockImplementation((write: CampaignCreateInput) => {
        createdCampaign = write;
        return Promise.resolve({
          id: 'campaign-123',
          recipientCount: write.data.recipientCount,
          channel: write.data.channel,
          status: write.data.status,
          expiresAt: write.data.expiresAt,
        });
      });
    const { service, prisma } = makeService({
      audienceFindFirst: jest.fn().mockResolvedValue({
        id: 'audience-123',
        tenantId: 'tenant-1',
        recipientUserIdsJson: ['user-1', 'user-2'],
        expiresAt: future,
      }),
      campaignCreate,
    });

    const result = await service.previewCampaign({
      tenantId: 'tenant-1',
      actorUserId: 'owner-1',
      audienceId: 'audience-123',
      message: 'Будем рады видеть вас снова.',
    });

    expect(result).toMatchObject({
      campaign_id: 'campaign-123',
      channel: 'app',
      status: 'draft',
      recipient_count: 2,
      next_action: 'request_owner_confirmation',
    });
    expect(createdCampaign?.data).toMatchObject({
      tenantId: 'tenant-1',
      audienceId: 'audience-123',
      recipientCount: 2,
      recipientUserIdsJson: ['user-1', 'user-2'],
    });
    expect(JSON.stringify(result)).not.toContain('user-1');
    expect(prisma.marketingAudience.findFirst).toHaveBeenCalledWith({
      where: { id: 'audience-123', tenantId: 'tenant-1' },
    });
  });

  it.each(['draft', 'sent', 'partial'])(
    'rejects every legacy send, including %s history, without admission or writes',
    async (status) => {
      const { service, prisma, communicationDelivery, recovery } = makeService({
        campaignFindFirst: jest.fn().mockResolvedValue({ status }),
      });
      await expect(
        service.sendCampaign({
          tenantId: 'tenant-1',
          actorUserId: 'owner-1',
          campaignId: 'campaign-123',
          idempotencyKey: 'old-key',
        }),
      ).rejects.toThrow('B35_CANONICAL_OWNER_REQUIRED');
      expect(prisma.marketingCampaign.findFirst).not.toHaveBeenCalled();
      expect(prisma.marketingCampaign.updateMany).not.toHaveBeenCalled();
      expect(communicationDelivery.deliverBulkCampaign).not.toHaveBeenCalled();
      expect(recovery.recordConsentSafeTouchpoint).not.toHaveBeenCalled();
    },
  );
});
