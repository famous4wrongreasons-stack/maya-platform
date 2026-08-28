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

  it('revalidates consent and CRM eligibility immediately before delivery', async () => {
    const campaign = {
      id: 'campaign-123',
      tenantId: 'tenant-1',
      audienceId: 'audience-123',
      status: 'draft',
      message: 'Будем рады видеть вас снова.',
      recipientUserIdsJson: ['user-1', 'user-withdrawn'],
      recipientCount: 2,
      sentCount: 0,
      channel: 'app',
      expiresAt: future,
    };
    const { service, communicationDelivery, recovery } = makeService({
      memberships: [
        {
          userId: 'user-1',
          user: { phone: '+7 999 111-22-33' },
          customerProfile: { marketingConsentAt: new Date('2025-01-01') },
        },
      ],
      campaignFindFirst: jest.fn().mockResolvedValue(campaign),
      audienceFindFirst: jest.fn().mockResolvedValue({
        id: 'audience-123',
        tenantId: 'tenant-1',
        ruleJson: {
          inactive_days: 90,
          minimum_visits: 1,
          max_recipients: 100,
        },
        expiresAt: future,
      }),
      searchClients: jest.fn().mockResolvedValue([
        {
          id: 'crm-1',
          name: 'Hidden',
          phone: '+7 999 111-22-33',
          visits_count: 5,
          sold_amount: 10_000,
          last_visit_date: '2025-01-01T10:00:00.000Z',
        },
      ]),
      audienceRecipientFindMany: jest.fn().mockResolvedValue([
        {
          tenantId: 'tenant-1',
          externalClientId: 'user-1',
          eligibilityStatus: 'ALLOW',
          exclusionReason: null,
        },
        {
          tenantId: 'tenant-1',
          externalClientId: 'user-withdrawn',
          eligibilityStatus: 'SKIP',
          exclusionReason: 'CONSENT_OR_ACCOUNT_INELIGIBLE',
        },
      ]),
    });

    const result = await service.sendCampaign({
      tenantId: 'tenant-1',
      actorUserId: 'owner-1',
      campaignId: 'campaign-123',
      idempotencyKey: 'approval-idempotency-key',
    });

    expect(result).toMatchObject({
      status: 'sent',
      recipient_count: 2,
      sent_count: 1,
      skipped_count: 1,
      failed_count: 0,
      attribution_failed_count: 0,
    });
    expect(communicationDelivery.deliverBulkCampaign).toHaveBeenCalledTimes(1);
    expect(communicationDelivery.deliverBulkCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        campaignId: 'campaign-123',
      }),
    );
    expect(recovery.recordConsentSafeTouchpoint).toHaveBeenCalledTimes(1);
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

  it('replays an already completed campaign without sending again', async () => {
    const campaign = {
      id: 'campaign-123',
      tenantId: 'tenant-1',
      audienceId: 'audience-123',
      status: 'sent',
      message: 'Будем рады видеть вас снова.',
      recipientUserIdsJson: ['user-1'],
      recipientCount: 1,
      sentCount: 1,
      channel: 'app',
      expiresAt: future,
    };
    const { service, communicationDelivery, recovery } = makeService({
      campaignFindFirst: jest.fn().mockResolvedValue(campaign),
    });

    const result = await service.sendCampaign({
      tenantId: 'tenant-1',
      actorUserId: 'owner-1',
      campaignId: 'campaign-123',
      idempotencyKey: 'same-confirmation',
    });

    expect(result).toMatchObject({
      campaign_id: 'campaign-123',
      status: 'sent',
      sent_count: 1,
      replayed: true,
    });
    expect(communicationDelivery.deliverBulkCampaign).not.toHaveBeenCalled();
    expect(recovery.recordConsentSafeTouchpoint).not.toHaveBeenCalled();
  });

  it('does not treat an attribution outage as a failed customer delivery', async () => {
    const campaign = {
      id: 'campaign-123',
      tenantId: 'tenant-1',
      audienceId: 'audience-123',
      status: 'draft',
      message: 'Будем рады видеть вас снова.',
      recipientUserIdsJson: ['user-1'],
      recipientCount: 1,
      sentCount: 0,
      channel: 'app',
      expiresAt: future,
    };
    const { service, recovery } = makeService({
      memberships: [
        {
          userId: 'user-1',
          user: { phone: '+7 999 111-22-33' },
          customerProfile: { marketingConsentAt: new Date('2025-01-01') },
        },
      ],
      campaignFindFirst: jest.fn().mockResolvedValue(campaign),
      audienceFindFirst: jest.fn().mockResolvedValue({
        id: 'audience-123',
        ruleJson: {
          inactive_days: 90,
          minimum_visits: 1,
          max_recipients: 100,
        },
        expiresAt: future,
      }),
      searchClients: jest.fn().mockResolvedValue([
        {
          id: 'crm-1',
          name: 'Hidden',
          phone: '+7 999 111-22-33',
          visits_count: 5,
          sold_amount: 10_000,
          last_visit_date: '2025-01-01T10:00:00.000Z',
        },
      ]),
      audienceRecipientFindMany: jest.fn().mockResolvedValue([
        {
          tenantId: 'tenant-1',
          externalClientId: 'user-1',
          eligibilityStatus: 'ALLOW',
          exclusionReason: null,
        },
      ]),
    });
    recovery.recordConsentSafeTouchpoint.mockRejectedValueOnce(
      new Error('temporary attribution outage'),
    );

    const result = await service.sendCampaign({
      tenantId: 'tenant-1',
      actorUserId: 'owner-1',
      campaignId: 'campaign-123',
      idempotencyKey: 'approval-idempotency-key',
    });

    expect(result).toMatchObject({
      status: 'sent',
      sent_count: 1,
      failed_count: 0,
      attribution_failed_count: 1,
    });
  });

  it.each([
    {
      evidence: {
        id: 'durable-consent-1',
        status: 'granted',
        grantedAt: new Date('2025-01-01'),
        revokedAt: null,
        expiresAt: null,
      },
      decision: 'ALLOW',
      reasonCode: undefined,
    },
    {
      evidence: {
        id: 'revoked-consent-1',
        status: 'revoked',
        grantedAt: new Date('2025-01-01'),
        revokedAt: new Date('2025-02-01'),
        expiresAt: null,
      },
      decision: 'SKIP',
      reasonCode: 'CONSENT_REVOKED',
    },
  ])(
    'uses durable consent evidence and plans $decision without dispatch',
    async ({ evidence, decision, reasonCode }) => {
      const communicationShadow = {
        plan: jest.fn().mockResolvedValue({ externalMessagesSent: 0 }),
      };
      const consentEvidenceUpsert = jest.fn().mockResolvedValue(evidence);
      const campaign = {
        id: 'campaign-123',
        tenantId: 'tenant-1',
        audienceId: 'audience-123',
        status: 'draft',
        message: 'Будем рады видеть вас снова.',
        messageSnapshotHash: 'message-hash',
        recipientUserIdsJson: ['user-1'],
        recipientCount: 1,
        sentCount: 0,
        channel: 'app',
        expiresAt: future,
      };
      const { service, prisma, communicationDelivery } = makeService({
        memberships: [
          {
            userId: 'user-1',
            user: { phone: '+7 999 111-22-33' },
            customerProfile: { marketingConsentAt: new Date('2025-01-01') },
          },
        ],
        campaignFindFirst: jest.fn().mockResolvedValue(campaign),
        audienceFindFirst: jest.fn().mockResolvedValue({
          id: 'audience-123',
          tenantId: 'tenant-1',
          createdByUserId: 'owner-1',
          ruleJson: {
            inactive_days: 90,
            minimum_visits: 1,
            max_recipients: 100,
          },
          expiresAt: future,
          snapshotHash: undefined,
        }),
        searchClients: jest.fn().mockResolvedValue([
          {
            id: 'crm-1',
            name: 'Hidden',
            phone: '+7 999 111-22-33',
            visits_count: 5,
            sold_amount: 10_000,
            last_visit_date: '2025-01-01T10:00:00.000Z',
          },
        ]),
        audienceUpsert: jest.fn().mockResolvedValue({
          id: 'shadow-audience-1',
          snapshotHash: 'shadow-snapshot-1',
        }),
        audienceRecipientFindMany: jest.fn().mockResolvedValue([
          {
            tenantId: 'tenant-1',
            externalClientId: 'user-1',
            eligibilityStatus: decision,
            exclusionReason: reasonCode,
          },
        ]),
        communicationShadow,
        consentEvidenceUpsert,
      });

      const send = service.sendCampaign({
        tenantId: 'tenant-1',
        actorUserId: 'owner-1',
        campaignId: 'campaign-123',
        idempotencyKey: 'approval-idempotency-key',
      });

      if (decision === 'SKIP') {
        await expect(send).rejects.toMatchObject({
          response: {
            error: { code: 'bulk_audience_shadow_divergent' },
          },
        });
      } else {
        await expect(send).resolves.toMatchObject({ status: 'sent' });
      }

      expect(consentEvidenceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: {} }),
      );
      const [[audienceUpsertCall]] = prisma.marketingAudience.upsert.mock
        .calls as unknown as [
        [{ where: { id: string }; update: Record<string, never> }],
      ];
      expect(audienceUpsertCall.where.id).toMatch(
        /^marketing-shadow-audience:/,
      );
      expect(audienceUpsertCall.update).toEqual({});
      expect(prisma.devicePushToken.findMany).not.toHaveBeenCalled();
      if (decision === 'SKIP') {
        expect(communicationShadow.plan).not.toHaveBeenCalled();
        expect(
          communicationDelivery.deliverBulkCampaign,
        ).not.toHaveBeenCalled();
      } else {
        expect(communicationShadow.plan).toHaveBeenCalledTimes(1);
        const [[shadowPlan]] = communicationShadow.plan.mock
          .calls as unknown as [
          [Parameters<CommunicationShadowService['plan']>[0]],
        ];
        expect(shadowPlan).toMatchObject({
          taxonomy: 'bulk_campaign',
          channel: 'inbox',
          recipients: [
            {
              consentEvidenceId: evidence.id,
              eligibility: { decision, reasonCode },
            },
          ],
        });
      }
    },
  );
});
