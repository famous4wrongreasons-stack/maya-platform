import { ConfigService } from '@nestjs/config';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OwnerReportsService } from './owner-reports.service';

type PublishInput = Parameters<InboxService['publishForTenant']>[1];

describe('OwnerReportsService', () => {
  const tenant = {
    id: 'tenant-a',
    slug: 'barber-a',
    name: 'Барбершоп A',
    defaultTimezone: 'Europe/Moscow',
  };

  function createService(options?: {
    alreadySent?: boolean;
    enabledUserIds?: string[];
  }) {
    const prisma = {
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'owner-user' }]),
      },
      crmStaffAccess: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'master-user', staffId: 'staff-1' }]),
      },
      internalProvider: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const overview = {
      data_source: 'crm',
      period: {
        from: '2026-08-12T21:00:00.000Z',
        to: '2026-08-13T20:59:59.999Z',
        timezone: 'Europe/Moscow',
      },
      appointments: {
        total: 8,
        active: 7,
        scheduled: 5,
        completed: 1,
        cancelled: 1,
        no_show: 1,
        booked_minutes: 420,
      },
      revenue: [],
      expenses: [],
      net: [],
      average_ticket: [],
      daily: [],
      services: [],
      staff: [
        {
          staff_external_id: 'crm-1',
          staff_id: 'staff-1',
          name: 'Илья',
          total: 6,
          appointments: 5,
          scheduled: 4,
          completed: 1,
          cancelled: 1,
          no_show: 0,
          booked_minutes: 300,
          services: [],
        },
      ],
    };
    const analytics = {
      getBusinessOperationalOverview: jest.fn().mockResolvedValue(overview),
    };
    const publishForTenant = jest.fn((_tenantId: string, input: PublishInput) =>
      Promise.resolve({
        stored: 1,
        user_ids: input.userIds ?? ['owner-user'],
      }),
    );
    const inbox = {
      hasSourceEvent: jest
        .fn()
        .mockResolvedValue(Boolean(options?.alreadySent)),
      publishForTenant,
    };
    const tenantContext = {
      runAsSystemTenant: jest
        .fn()
        .mockImplementation((_tenantId: string, work: () => Promise<unknown>) =>
          work(),
        ),
    };
    const config = { get: jest.fn() };
    const dashboardPreferences = {
      filterUsersWithAssistantCapability: jest
        .fn()
        .mockImplementation((_tenantId: string, userIds: string[]) =>
          Promise.resolve(
            options?.enabledUserIds === undefined
              ? userIds
              : userIds.filter((userId) =>
                  options.enabledUserIds?.includes(userId),
                ),
          ),
        ),
    };
    const service = new OwnerReportsService(
      prisma as unknown as PrismaService,
      analytics as unknown as OperationsAnalyticsService,
      inbox as unknown as InboxService,
      tenantContext as unknown as TenantContextService,
      config as unknown as ConfigService,
      dashboardPreferences as unknown as DashboardPreferencesService,
    );

    return { service, analytics, inbox, publishForTenant };
  }

  it('stores one owner brief and one private master brief for the local day', async () => {
    const { service, analytics, inbox, publishForTenant } = createService();

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('sent');
    expect(analytics.getBusinessOperationalOverview).toHaveBeenCalledWith(
      'tenant-a',
      {
        from: '2026-08-12T21:00:00.000Z',
        to: '2026-08-13T20:59:59.999Z',
      },
    );
    expect(inbox.publishForTenant).toHaveBeenCalledTimes(2);

    const ownerMessage = publishForTenant.mock.calls[0]?.[1];
    expect(ownerMessage).toMatchObject({
      type: 'morning_brief',
      sourceEventId: 'nest:morning_brief:2026-08-13',
      userIds: ['owner-user'],
      fanoutOwners: false,
    });
    expect(ownerMessage?.bodyText).toContain('всего 8 записей');

    const masterMessage = publishForTenant.mock.calls[1]?.[1];
    expect(masterMessage).toMatchObject({
      type: 'morning_brief',
      sourceEventId: 'nest:master_morning_brief:2026-08-13:master-user',
      userIds: ['master-user'],
      fanoutOwners: false,
    });
    expect(masterMessage?.bodyText).toContain('Доброе утро, Илья');
    expect(masterMessage?.bodyText).toContain('Записей: 6');
    expect(masterMessage?.bodyText).toContain('Совет MAYA');
  });

  it('does not duplicate already delivered morning messages', async () => {
    const { service, analytics, inbox } = createService({ alreadySent: true });

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('skipped');
    expect(analytics.getBusinessOperationalOverview).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });

  it('does not deliver briefs to users who disabled daily brief', async () => {
    const { service, analytics, inbox } = createService({
      enabledUserIds: [],
    });

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('skipped');
    expect(analytics.getBusinessOperationalOverview).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });
});
