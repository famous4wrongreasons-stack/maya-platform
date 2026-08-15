import { BadRequestException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { CrmService } from '../crm/crm.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AppointmentNotificationsService } from './appointment-notifications.service';

describe('AppointmentNotificationsService', () => {
  const now = new Date('2026-08-14T07:00:00.000Z');
  const appointment = {
    id: 'crm-99',
    client: { id: 'crm-client-1', name: 'Hidden client' },
    provider: { id: 'staff-1', name: 'Мастер' },
    branch: null,
    service_ids: ['service-1'],
    services: [
      {
        id: 'service-1',
        name: 'Стрижка',
        price: 2000,
        duration_minutes: 60,
        currency: 'RUB',
      },
    ],
    start_at: '2026-08-14T09:00:00.000Z',
    end_at: '2026-08-14T10:00:00.000Z',
    status: 'confirmed',
    notes: null,
    total_price: 2000,
    currency: 'RUB',
  };

  function makeService(input?: {
    memberships?: Array<{
      userId: string;
      user: { phone: string | null };
    }>;
    duplicate?: boolean;
    detailPhone?: string | null;
  }) {
    const prisma = {
      appointmentNotificationSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ data, create, update }) =>
          Promise.resolve({
            id: 'setting-1',
            enabled: data?.enabled ?? update?.enabled ?? create.enabled,
            leadTimesMinutes:
              data?.leadTimesMinutes ??
              update?.leadTimesMinutes ??
              create.leadTimesMinutes,
          }),
        ),
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
      membership: {
        findMany: jest.fn().mockResolvedValue(
          input?.memberships ?? [
            { userId: 'client-1', user: { phone: '+7 999 111-22-33' } },
          ],
        ),
      },
    };
    const crm = {
      getJournal: jest.fn().mockResolvedValue({ appointments: [appointment] }),
      getAppointmentDetailForSystem: jest.fn().mockResolvedValue({
        ...appointment,
        client_phone: input?.detailPhone ?? '8 (999) 111-22-33',
        duration_minutes: 60,
        attendance: 0,
        paid: false,
        can_edit: true,
      }),
    };
    const inbox = {
      hasSourceEvent: jest
        .fn()
        .mockResolvedValue(input?.duplicate ?? false),
      publishForTenant: jest
        .fn()
        .mockResolvedValue({ stored: 1, user_ids: ['client-1'] }),
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
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AppointmentNotificationsService(
      prisma as unknown as PrismaService,
      crm as unknown as CrmService,
      inbox as unknown as InboxService,
      tenantContext as unknown as TenantContextService,
      entitlements as unknown as EntitlementsService,
      auditLog as unknown as AuditLogService,
    );
    return {
      service,
      prisma,
      crm,
      inbox,
      tenantContext,
      entitlements,
      auditLog,
    };
  }

  it('stores normalized tenant-scoped settings and writes an audit event', async () => {
    const { service, prisma, auditLog, tenantContext } = makeService();

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
    expect(prisma.appointmentNotificationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'owner-1',
        action: 'notifications.appointments.updated',
      }),
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

  it('delivers to the exact active MAYA client without leaking phone data', async () => {
    const { service, inbox, crm, tenantContext } = makeService();

    const result = await service.tick(now);

    expect(result).toEqual({ tenants: 1, sent: 1, skipped: 0, failed: 0 });
    expect(tenantContext.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Function),
    );
    expect(crm.getAppointmentDetailForSystem).toHaveBeenCalledWith(
      'tenant-1',
      '99',
    );
    expect(inbox.publishForTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        type: 'appointment_reminder',
        sourceEventId: 'appointment_reminder:crm-99:120',
        userIds: ['client-1'],
        fanoutOwners: false,
        payload: expect.objectContaining({
          appointment_id: 'crm-99',
          lead_time_minutes: 120,
        }),
      }),
    );
    const serialized = JSON.stringify(inbox.publishForTenant.mock.calls[0]);
    expect(serialized).not.toContain('9991112233');
    expect(serialized).not.toContain('Hidden client');
  });

  it('does not load client details or deliver a duplicate reminder', async () => {
    const { service, crm, inbox } = makeService({ duplicate: true });

    const result = await service.tick(now);

    expect(result).toEqual({ tenants: 1, sent: 0, skipped: 1, failed: 0 });
    expect(crm.getAppointmentDetailForSystem).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });

  it('never sends an appointment to a non-matching account', async () => {
    const { service, inbox } = makeService({
      detailPhone: '+7 999 000-00-00',
    });

    const result = await service.tick(now);

    expect(result).toEqual({ tenants: 1, sent: 0, skipped: 1, failed: 0 });
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });
});
