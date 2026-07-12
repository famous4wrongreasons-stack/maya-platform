import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { CrmService } from '../crm/crm.service';
import { AppointmentsService } from './appointments.service';
import { TenantAppointmentRepository } from './tenant-appointment.repository';

type BranchRecord = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string | null;
};

type UserRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  phone: string | null;
  encryptedName: string | null;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  tenant: null;
  branch: null;
};

type AppointmentRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  branchId: string | null;
  crmExternalId: string | null;
  staffExternalId: string;
  serviceIds: string[];
  startAt: Date;
  status: string;
  notes: string | null;
  providerPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
  branch: BranchRecord | null;
};

describe('AppointmentsService', () => {
  const branch: BranchRecord = {
    id: 'branch-1',
    name: 'Main Branch',
    address: 'Moscow',
    phone: '+79990000000',
    timezone: 'Europe/Moscow',
  };

  const createService = () => {
    const now = new Date();
    const appointmentRecord: AppointmentRecord = {
      id: 'appt-1',
      tenantId: 'tenant-1',
      clientId: 'user-1',
      branchId: 'branch-1',
      crmExternalId: 'crm-1',
      staffExternalId: 'staff-1',
      serviceIds: ['svc-1'],
      startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: 'confirmed',
      notes: null,
      providerPayload: {},
      createdAt: now,
      updatedAt: now,
      branch,
    };
    const branchFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<BranchRecord | null>
    > = jest.fn().mockResolvedValue(branch);
    const appointmentFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<AppointmentRecord | null>
    > = jest.fn().mockResolvedValue(appointmentRecord);
    const appointmentFindManyMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown[]>
    > = jest.fn().mockResolvedValue([]);
    const appointmentUpdateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<AppointmentRecord>
    > = jest.fn().mockResolvedValue({
      ...appointmentRecord,
      status: 'canceled',
      updatedAt: new Date(now.getTime() + 1000),
    });
    const getAvailableSlotsMock: jest.MockedFunction<
      (
        tenantId: string,
        query: Record<string, unknown>,
      ) => Promise<
        Array<{
          start: string;
          end: string;
          staff_id: string;
          branch_id: string | null;
        }>
      >
    > = jest.fn().mockResolvedValue([
      {
        start: '2026-07-05T08:00:00.000Z',
        end: '2026-07-05T09:00:00.000Z',
        staff_id: 'staff-1',
        branch_id: 'branch-1',
      },
    ]);
    const getServicesMock: jest.MockedFunction<
      (tenantId: string) => Promise<
        Array<{
          id: string;
          name: string;
          price: number;
          duration_minutes: number;
          currency: string;
          category?: string;
        }>
      >
    > = jest.fn().mockResolvedValue([
      {
        id: 'svc-1',
        name: 'Haircut',
        price: 2500,
        duration_minutes: 60,
        currency: 'RUB',
        category: 'Haircuts',
      },
    ]);
    const getStaffMock: jest.MockedFunction<
      (tenantId: string) => Promise<
        Array<{
          id: string;
          name: string;
          title?: string;
          specialization?: string;
          avatar_url?: string | null;
          rating?: number | null;
        }>
      >
    > = jest.fn().mockResolvedValue([
      {
        id: 'staff-1',
        name: 'Anton',
        title: 'Senior Barber',
        specialization: 'Senior Barber',
        avatar_url: null,
        rating: 4.9,
      },
    ]);
    const cancelAppointmentMock: jest.MockedFunction<
      (
        tenantId: string,
        externalId: string,
      ) => Promise<{
        external_id: string;
        status: string;
        raw?: Record<string, unknown>;
      }>
    > = jest.fn().mockResolvedValue({
      external_id: 'crm-1',
      status: 'canceled',
      raw: { cancelled: true },
    });
    const rescheduleAppointmentMock: jest.MockedFunction<
      (
        tenantId: string,
        params: {
          externalId: string;
          start: string;
          staffId?: string;
          serviceIds?: string[];
          notes?: string | null;
        },
      ) => Promise<{
        external_id: string;
        status: string;
        start: string;
        staff_id: string;
        service_ids: string[];
        raw?: Record<string, unknown>;
      }>
    > = jest.fn().mockResolvedValue({
      external_id: 'crm-1',
      status: 'confirmed',
      start: '2026-07-05T11:00:00',
      staff_id: 'staff-1',
      service_ids: ['svc-1'],
      raw: { rescheduled: true },
    });
    const getTenantUserOrThrowMock: jest.MockedFunction<
      (userId: string, tenantId: string) => Promise<UserRecord>
    > = jest.fn().mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      branchId: null,
      email: 'phone-79990000000@demo-salon.client.local',
      phone: '+79990000000',
      encryptedName: 'enc:Станислав',
      passwordHash: 'hash',
      role: 'client',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: null,
      branch: null,
    });
    const serializeUserMock: jest.MockedFunction<
      (user: UserRecord) => {
        name: string | null;
        phone: string | null;
      }
    > = jest.fn().mockReturnValue({
      name: 'Станислав',
      phone: '+79990000000',
    });
    const auditLogMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);

    const prisma: Pick<PrismaService, 'appointment' | 'branch'> = {
      appointment: {
        findFirst: appointmentFindFirstMock,
        findMany: appointmentFindManyMock,
        update: appointmentUpdateMock,
      } as PrismaService['appointment'],
      branch: {
        findFirst: branchFindFirstMock,
      } as PrismaService['branch'],
    };
    const crmService: Pick<
      CrmService,
      | 'cancelAppointment'
      | 'getAvailableSlots'
      | 'getServices'
      | 'getStaff'
      | 'rescheduleAppointment'
    > = {
      cancelAppointment: cancelAppointmentMock,
      getAvailableSlots: getAvailableSlotsMock,
      getServices: getServicesMock,
      getStaff: getStaffMock,
      rescheduleAppointment: rescheduleAppointmentMock,
    };
    const assertLiveBookingEnabledMock: jest.MockedFunction<
      (tenantId: string) => Promise<unknown>
    > = jest.fn().mockResolvedValue({ effectiveMode: 'live' });
    const tenantsService: Pick<
      TenantsService,
      'assertBranchBelongsToTenant' | 'assertLiveBookingEnabled'
    > = {
      assertBranchBelongsToTenant: jest
        .fn()
        .mockResolvedValue(
          undefined,
        ) as TenantsService['assertBranchBelongsToTenant'],
      assertLiveBookingEnabled:
        assertLiveBookingEnabledMock as TenantsService['assertLiveBookingEnabled'],
    };
    const usersService: Pick<
      UsersService,
      'getTenantUserOrThrow' | 'serializeUser'
    > = {
      getTenantUserOrThrow: getTenantUserOrThrowMock,
      serializeUser: serializeUserMock,
    };
    const auditLogService: Pick<AuditLogService, 'log'> = {
      log: auditLogMock,
    };
    const tenantContext: Pick<
      TenantContextService,
      'assertTenantId' | 'requireTenantId'
    > = {
      assertTenantId: jest.fn((tenantId: string) => tenantId),
      requireTenantId: jest.fn(() => 'tenant-1'),
    };
    const appointmentRepository = new TenantAppointmentRepository(
      prisma as PrismaService,
      tenantContext as TenantContextService,
    );

    return {
      service: new AppointmentsService(
        prisma as PrismaService,
        tenantContext as TenantContextService,
        appointmentRepository,
        crmService as CrmService,
        tenantsService as TenantsService,
        usersService as UsersService,
        auditLogService as AuditLogService,
      ),
      mocks: {
        assertLiveBookingEnabledMock,
        auditLogMock,
        appointmentFindFirstMock,
        appointmentUpdateMock,
        cancelAppointmentMock,
        getAvailableSlotsMock,
        getServicesMock,
        getStaffMock,
        getTenantUserOrThrowMock,
        rescheduleAppointmentMock,
        serializeUserMock,
      },
    };
  };

  it('fails closed before contacting CRM when live booking is disabled', async () => {
    const {
      service,
      mocks: { assertLiveBookingEnabledMock, getTenantUserOrThrowMock },
    } = createService();

    assertLiveBookingEnabledMock.mockRejectedValue(
      new ForbiddenException({
        message: 'Live booking is not enabled for this tenant.',
        error: {
          code: 'live_booking_disabled',
          mode: 'preview',
        },
      }),
    );

    await expect(
      service.createForClient('tenant-1', 'user-1', {
        staffId: 'staff-1',
        serviceIds: ['svc-1'],
        start: '2026-07-05T11:00:00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertLiveBookingEnabledMock).toHaveBeenCalledWith('tenant-1');
    expect(getTenantUserOrThrowMock).not.toHaveBeenCalled();
  });

  it('uses the stored client profile when preview payload omits name and phone', async () => {
    const {
      service,
      mocks: { auditLogMock, getTenantUserOrThrowMock, serializeUserMock },
    } = createService();

    const result = await service.previewForClient('tenant-1', 'user-1', {
      staffId: 'staff-1',
      serviceIds: ['svc-1'],
      start: '2026-07-05T11:00:00',
    });

    expect(getTenantUserOrThrowMock).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(serializeUserMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      client_name: 'Станислав',
      client_phone: '+79990000000',
      total_price: 2500,
      duration_minutes: 60,
      currency: 'RUB',
    });
    expect(auditLogMock).toHaveBeenCalled();
  });

  it('returns a profile error when the client name is missing everywhere', async () => {
    const {
      service,
      mocks: { serializeUserMock },
    } = createService();

    serializeUserMock.mockReturnValue({
      name: null,
      phone: '+79990000000',
    });

    await expect(
      service.previewForClient('tenant-1', 'user-1', {
        staffId: 'staff-1',
        serviceIds: ['svc-1'],
        start: '2026-07-05T11:00:00',
      }),
    ).rejects.toMatchObject<BadRequestException>({
      response: {
        error: {
          code: 'client_name_required',
          field: 'clientName',
        },
      },
    });
  });

  it('returns service_not_found before asking CRM for slots', async () => {
    const {
      service,
      mocks: { getAvailableSlotsMock },
    } = createService();

    await expect(
      service.previewForClient('tenant-1', 'user-1', {
        staffId: 'staff-1',
        serviceIds: ['missing-service'],
        start: '2026-07-05T11:00:00',
      }),
    ).rejects.toMatchObject<BadRequestException>({
      response: {
        error: {
          code: 'service_not_found',
          field: 'serviceIds',
        },
      },
    });
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });

  it('aggregates available days for a date range', async () => {
    const {
      service,
      mocks: { getAvailableSlotsMock },
    } = createService();

    getAvailableSlotsMock.mockImplementation(
      (_tenantId: string, query: Record<string, unknown>) => {
        const date = String(query.date);

        if (date === '2026-07-05' || date === '2026-07-07') {
          return Promise.resolve([
            {
              start: `${date}T08:00:00.000Z`,
              end: `${date}T09:00:00.000Z`,
              staff_id: 'staff-1',
              branch_id: 'branch-1',
            },
          ]);
        }

        return Promise.resolve([]);
      },
    );

    const result = await service.getAvailableDays('tenant-1', {
      from: '2026-07-05',
      to: '2026-07-08',
      staffId: 'staff-1',
      serviceIds: ['svc-1'],
      branchId: 'branch-1',
    });

    expect(result).toEqual({
      days: ['2026-07-05', '2026-07-07'],
    });
    expect(getAvailableSlotsMock).toHaveBeenCalledTimes(4);
  });

  it('returns service_not_found before probing available days', async () => {
    const {
      service,
      mocks: { getAvailableSlotsMock },
    } = createService();

    await expect(
      service.getAvailableDays('tenant-1', {
        from: '2026-07-05',
        to: '2026-07-08',
        staffId: 'staff-1',
        serviceIds: ['missing-service'],
      }),
    ).rejects.toMatchObject<BadRequestException>({
      response: {
        error: {
          code: 'service_not_found',
          field: 'serviceIds',
        },
      },
    });
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });

  it('cancels an upcoming appointment for the current client', async () => {
    const {
      service,
      mocks: { appointmentUpdateMock, auditLogMock, cancelAppointmentMock },
    } = createService();

    const result = await service.cancelForClient(
      'tenant-1',
      'user-1',
      'appt-1',
    );

    expect(cancelAppointmentMock).toHaveBeenCalledWith('tenant-1', 'crm-1');
    expect(appointmentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId_clientId: {
            id: 'appt-1',
            tenantId: 'tenant-1',
            clientId: 'user-1',
          },
        },
        data: { status: 'canceled' },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      appointment: {
        id: 'appt-1',
        status: 'canceled',
      },
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.cancelled',
        entityId: 'appt-1',
      }),
    );
  });

  it('returns not_found when the appointment does not belong to the client', async () => {
    const {
      service,
      mocks: { appointmentFindFirstMock, cancelAppointmentMock },
    } = createService();

    appointmentFindFirstMock.mockResolvedValue(null);

    await expect(
      service.cancelForClient('tenant-1', 'user-1', 'missing-appt'),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'not_found',
        },
      },
    });
    expect(cancelAppointmentMock).not.toHaveBeenCalled();
  });

  it('returns already_cancelled for an appointment that is already canceled', async () => {
    const {
      service,
      mocks: { appointmentFindFirstMock, cancelAppointmentMock },
    } = createService();

    appointmentFindFirstMock.mockResolvedValue({
      id: 'appt-1',
      tenantId: 'tenant-1',
      clientId: 'user-1',
      branchId: 'branch-1',
      crmExternalId: 'crm-1',
      staffExternalId: 'staff-1',
      serviceIds: ['svc-1'],
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'canceled',
      notes: null,
      providerPayload: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      branch,
    });

    await expect(
      service.cancelForClient('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'already_cancelled',
        },
      },
    });
    expect(cancelAppointmentMock).not.toHaveBeenCalled();
  });

  it('returns too_late_to_cancel when the appointment has already started', async () => {
    const {
      service,
      mocks: { appointmentFindFirstMock, cancelAppointmentMock },
    } = createService();

    appointmentFindFirstMock.mockResolvedValue({
      id: 'appt-1',
      tenantId: 'tenant-1',
      clientId: 'user-1',
      branchId: 'branch-1',
      crmExternalId: 'crm-1',
      staffExternalId: 'staff-1',
      serviceIds: ['svc-1'],
      startAt: new Date(Date.now() - 60 * 1000),
      status: 'confirmed',
      notes: null,
      providerPayload: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      branch,
    });

    await expect(
      service.cancelForClient('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'too_late_to_cancel',
        },
      },
    });
    expect(cancelAppointmentMock).not.toHaveBeenCalled();
  });

  it('reschedules an upcoming appointment for the current client', async () => {
    const {
      service,
      mocks: { appointmentUpdateMock, auditLogMock, rescheduleAppointmentMock },
    } = createService();

    appointmentUpdateMock.mockResolvedValue({
      id: 'appt-1',
      tenantId: 'tenant-1',
      clientId: 'user-1',
      branchId: 'branch-1',
      crmExternalId: 'crm-1',
      staffExternalId: 'staff-1',
      serviceIds: ['svc-1'],
      startAt: new Date('2026-07-05T08:00:00.000Z'),
      status: 'confirmed',
      notes: 'Move later',
      providerPayload: { rescheduled: true },
      createdAt: new Date(),
      updatedAt: new Date(),
      branch,
    });

    const result = await service.rescheduleForClient(
      'tenant-1',
      'user-1',
      'appt-1',
      {
        start: '2026-07-05T11:00:00',
        notes: 'Move later',
      },
    );

    expect(rescheduleAppointmentMock).toHaveBeenCalledWith('tenant-1', {
      externalId: 'crm-1',
      start: '2026-07-05T11:00:00',
      staffId: 'staff-1',
      serviceIds: ['svc-1'],
      notes: 'Move later',
    });
    const updateArgs = appointmentUpdateMock.mock.calls[0]?.[0] as
      | {
          where: {
            id_tenantId_clientId: {
              id: string;
              tenantId: string;
              clientId: string;
            };
          };
          data: {
            staffExternalId: string;
            status: string;
            notes: string | null;
          };
        }
      | undefined;

    expect(updateArgs).toBeDefined();
    expect(updateArgs?.where).toEqual({
      id_tenantId_clientId: {
        id: 'appt-1',
        tenantId: 'tenant-1',
        clientId: 'user-1',
      },
    });
    expect(updateArgs?.data.staffExternalId).toBe('staff-1');
    expect(updateArgs?.data.status).toBe('confirmed');
    expect(updateArgs?.data.notes).toBe('Move later');
    expect(result).toMatchObject({
      ok: true,
      appointment: {
        id: 'appt-1',
        status: 'confirmed',
      },
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.rescheduled',
        entityId: 'appt-1',
      }),
    );
  });

  it('returns slot_taken when a new slot is unavailable during reschedule', async () => {
    const {
      service,
      mocks: { getAvailableSlotsMock, rescheduleAppointmentMock },
    } = createService();

    getAvailableSlotsMock.mockResolvedValue([]);

    await expect(
      service.rescheduleForClient('tenant-1', 'user-1', 'appt-1', {
        start: '2026-07-05T11:00:00',
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'slot_taken',
          field: 'start',
        },
      },
    });
    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
  });

  it('returns too_late_to_reschedule when the appointment has already started', async () => {
    const {
      service,
      mocks: { appointmentFindFirstMock, rescheduleAppointmentMock },
    } = createService();

    appointmentFindFirstMock.mockResolvedValue({
      id: 'appt-1',
      tenantId: 'tenant-1',
      clientId: 'user-1',
      branchId: 'branch-1',
      crmExternalId: 'crm-1',
      staffExternalId: 'staff-1',
      serviceIds: ['svc-1'],
      startAt: new Date(Date.now() - 60 * 1000),
      status: 'confirmed',
      notes: null,
      providerPayload: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      branch,
    });

    await expect(
      service.rescheduleForClient('tenant-1', 'user-1', 'appt-1', {
        start: '2026-07-05T11:00:00',
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'too_late_to_reschedule',
        },
      },
    });
    expect(rescheduleAppointmentMock).not.toHaveBeenCalled();
  });
});
