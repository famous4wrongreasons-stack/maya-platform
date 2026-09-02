import { ConfigService } from '@nestjs/config';

import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { InboxService } from '../inbox/inbox.service';
import {
  buildStack,
  LOCAL_DATE,
  RANGE,
  TENANT,
  visit,
} from './brief-stack.spec-helper.spec';
import { OwnerReportsService } from './owner-reports.service';

type PublishInput = Parameters<InboxService['publishForTenant']>[1];

describe('OwnerReportsService', () => {
  const tenant = TENANT;

  function createService(options?: {
    alreadySent?: boolean;
    enabledUserIds?: string[];
  }) {
    // 🔴 Настоящая цепочка вместо подменённого обзора: числа в тексте обязаны
    // приезжать из канонического владельца, и спека это проверяет по-честному.
    const stack = buildStack({
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-1', 2500, 'confirmed'),
        visit('c', 'crm-1', 2500, 'confirmed'),
        visit('d', 'crm-1', 2500, 'confirmed'),
        visit('e', 'crm-1', 2500, 'confirmed'),
        visit('f', 'crm-1', 2500, 'confirmed'),
        visit('g', 'crm-2', 3000, 'confirmed'),
        visit('h', 'crm-2', 3000, 'canceled'),
      ],
      masters: [{ userId: 'master-user', externalStaffId: 'crm-1' }],
    });
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
    const businessState = stack.businessState;
    const readState = jest.spyOn(businessState, 'business');
    const service = new OwnerReportsService(
      stack.prisma,
      businessState,
      inbox as unknown as InboxService,
      stack.tenantContext,
      config as unknown as ConfigService,
      dashboardPreferences as unknown as DashboardPreferencesService,
    );

    return { service, inbox, publishForTenant, readState };
  }

  it('stores one owner brief and one private master brief for the local day', async () => {
    const { service, inbox, publishForTenant, readState } = createService();

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('sent');
    // Период дня арендатора остался тем же — миграция границ не двигала.
    expect(readState).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: tenant.id,
        period: RANGE,
        comparisonMode: 'none',
        // Утренний бриф денежный контур не читает: не читал и раньше.
        financeAllowed: false,
        retryOnFailure: false,
      }),
    );
    expect(inbox.publishForTenant).toHaveBeenCalledTimes(2);

    const ownerMessage = publishForTenant.mock.calls[0]?.[1];
    expect(ownerMessage).toMatchObject({
      type: 'morning_brief',
      sourceEventId: `nest:morning_brief:${LOCAL_DATE}`,
      userIds: ['owner-user'],
      telegramChatIds: ['10001'],
      fanoutOwners: false,
    });
    expect(ownerMessage?.bodyText).toContain('всего 8 записей');

    const masterMessage = publishForTenant.mock.calls[1]?.[1];
    expect(masterMessage).toMatchObject({
      type: 'morning_brief',
      sourceEventId: `nest:master_morning_brief:${LOCAL_DATE}:master-user`,
      userIds: ['master-user'],
      fanoutOwners: false,
    });
    expect(masterMessage?.bodyText).toContain('Доброе утро, Илья');
    expect(masterMessage?.bodyText).toContain('Записей: 6');
    expect(masterMessage?.bodyText).toContain('Совет MAYA');
  });

  it('does not duplicate already delivered morning messages', async () => {
    const { service, inbox, readState } = createService({ alreadySent: true });

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('skipped');
    expect(readState).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });

  it('delivers the daily owner report to the linked Telegram chat', async () => {
    const { service, publishForTenant } = createService();

    const result = await service.runDailyReport(
      tenant,
      new Date('2026-08-13T18:05:00.000Z'),
    );

    expect(result).toBe('sent');
    expect(publishForTenant).toHaveBeenCalledWith(
      tenant.id,
      expect.objectContaining({
        type: 'daily_report',
        sourceEventId: `nest:daily_report:${LOCAL_DATE}`,
        userIds: ['owner-user'],
        telegramChatIds: ['10001'],
        fanoutOwners: false,
      }),
    );
  });

  it('uses a separate idempotent source event for report recovery', async () => {
    const { service, publishForTenant } = createService();

    const result = await service.recoverDailyReport(
      tenant,
      LOCAL_DATE,
      'incident-20260903',
    );

    expect(result).toBe('sent');
    expect(publishForTenant).toHaveBeenCalledWith(
      tenant.id,
      expect.objectContaining({
        sourceEventId: `nest:daily_report:${LOCAL_DATE}:recovery:incident-20260903`,
        telegramChatIds: ['10001'],
      }),
    );
  });

  it('does not deliver briefs to users who disabled daily brief', async () => {
    const { service, inbox, readState } = createService({ enabledUserIds: [] });

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('skipped');
    expect(readState).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });
});
