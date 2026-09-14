import { BadRequestException } from '@nestjs/common';

import { AppointmentReminderOrchestratorService } from './appointment-reminder-orchestrator.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { Package5Wave1CanonicalCutoverService } from '../package5-wave1/package5-wave1-canonical-cutover.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AppointmentNotificationsService } from './appointment-notifications.service';

describe('AppointmentNotificationsService', () => {
  const now = new Date('2026-08-14T07:00:00.000Z');
  function makeService() {
    const prisma = {
      appointmentNotificationSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tenant-1',
            slug: 'barbershop',
            defaultTimezone: 'Europe/Moscow',
          },
        ]),
      },
    };
    const reminders = {
      processTenant: jest.fn().mockResolvedValue({ sent: 1, skipped: 0 }),
    };
    const tenantContext = {
      assertTenantId: jest.fn((tenantId: string) => tenantId),
      runAsSystemTenant: jest.fn(
        (_tenantId: string, callback: () => Promise<unknown>) => callback(),
      ),
    };
    const entitlements = {
      hasFeature: jest.fn().mockResolvedValue(true),
    };
    const canonical = {
      updateAppointmentNotifications: jest.fn(
        (
          _tenantId: string,
          _actorUserId: string,
          command: { enabled: boolean; leadTimesMinutes: number[] },
        ) =>
          Promise.resolve({
            enabled: command.enabled,
            lead_times_minutes: command.leadTimesMinutes,
            channel: 'maya_inbox_push' as const,
            transactional: true as const,
          }),
      ),
    };
    const service = new AppointmentNotificationsService(
      prisma as unknown as PrismaService,
      reminders as unknown as AppointmentReminderOrchestratorService,
      tenantContext as unknown as TenantContextService,
      entitlements as unknown as EntitlementsService,
      canonical as unknown as Package5Wave1CanonicalCutoverService,
    );
    return {
      service,
      prisma,
      reminders,
      tenantContext,
      entitlements,
      canonical,
    };
  }

  it('routes normalized tenant-scoped settings through the canonical executor', async () => {
    const { service, canonical, tenantContext } = makeService();

    const result = await service.updateSettings('tenant-1', 'owner-1', {
      enabled: true,
      leadTimesMinutes: [120, 1440],
    });

    expect(result).toEqual({
      enabled: true,
      lead_times_minutes: [1440, 120],
      channel: 'maya_inbox_push',
      transactional: true,
    });
    expect(tenantContext.assertTenantId).toHaveBeenCalledWith('tenant-1');
    expect(canonical.updateAppointmentNotifications).toHaveBeenCalledWith(
      'tenant-1',
      'owner-1',
      { enabled: true, leadTimesMinutes: [1440, 120] },
      undefined,
    );
  });

  it('rejects unsafe reminder timing instead of silently changing it', async () => {
    const { service } = makeService();

    await expect(
      service.updateSettings('tenant-1', 'owner-1', {
        enabled: true,
        leadTimesMinutes: [5],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates scheduler intent within system tenant scope to verified canonical orchestration', async () => {
    const { service, reminders, tenantContext } = makeService();
    expect(await service.tick(now)).toEqual({
      tenants: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    expect(reminders.processTenant).toHaveBeenCalledWith('tenant-1', now);
    expect(tenantContext.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Function),
    );
  });
});
