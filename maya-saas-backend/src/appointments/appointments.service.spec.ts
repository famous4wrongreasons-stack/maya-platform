import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { CalendarSource } from '../common/domain.enums';
import { asStaffId } from '../domain';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
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
  crmProvider?: string | null;
  source: string;
  staffExternalId: string;
  serviceIds: string[];
  startAt: Date;
  endAt: Date;
  blockedStartAt: Date;
  blockedEndAt: Date;
  status: string;
  notes: string | null;
  totalPriceKopecks?: number | null;
  currency?: string;
  providerPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
  branch: BranchRecord | null;
};

/** Что именно ушло в строку визита: читаем аргумент, а не сопоставляем матчерами. */
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
      source: CalendarSource.EXTERNAL,
      staffExternalId: 'staff-1',
      serviceIds: ['svc-1'],
      startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      endAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      blockedStartAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      blockedEndAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
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
    // Пояс арендатора — тот, который синхронизирует CRM. Раньше до брони он не
    // доходил вовсе: филиал закрывал путь московским значением.
    const tenantFindUniqueMock: jest.MockedFunction<
      (
        args: Record<string, unknown>,
      ) => Promise<{ defaultTimezone: string } | null>
    > = jest.fn().mockResolvedValue({ defaultTimezone: 'Europe/Moscow' });
    const appointmentFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<AppointmentRecord | null>
    > = jest.fn().mockImplementation((args: Record<string, unknown>) => {
      const where = args.where as
        | {
            crmProvider?: string;
            crmExternalId?: string;
          }
        | undefined;
      if (
        where?.crmProvider &&
        where.crmExternalId &&
        where.crmExternalId !== appointmentRecord.crmExternalId
      ) {
        return Promise.resolve(null);
      }
      return Promise.resolve(appointmentRecord);
    });
    const appointmentFindManyMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown[]>
    > = jest.fn().mockResolvedValue([]);
    const appointmentCreateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<AppointmentRecord>
    > = jest.fn().mockResolvedValue({
      ...appointmentRecord,
      totalPriceKopecks: 250_000,
      currency: 'RUB',
    });
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
      CrmService['cancelAppointment']
    > = jest.fn().mockResolvedValue({
      external_id: 'crm-1',
      status: 'canceled',
      raw: { cancelled: true },
    });
    const createAppointmentMock: jest.MockedFunction<
      CrmService['createAppointment']
    > = jest.fn().mockResolvedValue({
      external_id: 'crm-created-1',
      status: 'confirmed',
      start: '2026-07-05T11:00:00',
      staff_id: 'staff-1',
      service_ids: ['svc-1'],
      branch_id: 'branch-1',
      raw: { created: true },
    });
    const getCalendarSourceMock: jest.MockedFunction<
      CrmService['getCalendarSource']
    > = jest.fn().mockResolvedValue(CalendarSource.EXTERNAL);
    const getExternalProviderKeyMock: jest.MockedFunction<
      CrmService['getExternalProviderKey']
    > = jest.fn().mockResolvedValue('yclients');
    const getClientAppointmentsMock: jest.MockedFunction<
      CrmService['getClientAppointments']
    > = jest.fn().mockResolvedValue([]);
    // 🔴 P7.1: идентичность мастера в пространстве Maya. Разрешение проверяется
    // отдельно (`crm/staff-identity-writer.spec.ts`); здесь важно, что
    // разрешённое значение действительно ДОХОДИТ до строки визита.
    const resolveStaffIdForBookingMock: jest.MockedFunction<
      CrmService['resolveStaffIdForBooking']
    > = jest.fn().mockResolvedValue(asStaffId('staff-maya-1'));
    const rescheduleAppointmentMock: jest.MockedFunction<
      CrmService['rescheduleAppointment']
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
    const cancelForAccountMock: jest.MockedFunction<
      (
        tenantId: string,
        userId: string,
        appointmentId: string,
        invocation?: unknown,
      ) => Promise<AppointmentRecord>
    > = jest.fn().mockResolvedValue({
      ...appointmentRecord,
      status: 'canceled',
      updatedAt: new Date(now.getTime() + 1000),
    });

    const rescheduleForAccountMock: jest.MockedFunction<
      (
        tenantId: string,
        userId: string,
        appointmentId: string,
        dto: unknown,
        invocation?: unknown,
      ) => Promise<{
        appointment: AppointmentRecord;
        previousStartAt: Date;
        timezone: string;
        matchedSlotStart: string;
      }>
    > = jest.fn().mockResolvedValue({
      appointment: {
        ...appointmentRecord,
        startAt: new Date('2026-07-05T08:00:00.000Z'),
        notes: 'Move later',
        providerPayload: { rescheduled: true },
      },
      previousStartAt: appointmentRecord.startAt,
      timezone: 'Europe/Moscow',
      matchedSlotStart: '2026-07-05T11:00:00',
    });

    const prisma = {
      appointment: {
        create: appointmentCreateMock,
        findFirst: appointmentFindFirstMock,
        findMany: appointmentFindManyMock,
        update: appointmentUpdateMock,
      } as PrismaService['appointment'],
      branch: {
        findFirst: branchFindFirstMock,
      } as PrismaService['branch'],
      crmStaffAccess: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tenant: {
        findUnique: tenantFindUniqueMock,
      },
    };
    const crmService: Pick<
      CrmService,
      | 'cancelAppointment'
      | 'createAppointment'
      | 'getCalendarSource'
      | 'getExternalProviderKey'
      | 'getClientAppointments'
      | 'getAvailableSlots'
      | 'getServices'
      | 'getStaff'
      | 'rescheduleAppointment'
      | 'resolveStaffIdForBooking'
    > = {
      cancelAppointment: cancelAppointmentMock,
      createAppointment: createAppointmentMock,
      getCalendarSource: getCalendarSourceMock,
      getExternalProviderKey: getExternalProviderKeyMock,
      getClientAppointments: getClientAppointmentsMock,
      getAvailableSlots: getAvailableSlotsMock,
      getServices: getServicesMock,
      getStaff: getStaffMock,
      rescheduleAppointment: rescheduleAppointmentMock,
      resolveStaffIdForBooking: resolveStaffIdForBookingMock,
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
    const internalCalendarService: Pick<
      InternalCalendarService,
      'getServiceTiming'
    > = {
      getServiceTiming: jest.fn().mockResolvedValue({
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      }),
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
        internalCalendarService as InternalCalendarService,
        tenantsService as TenantsService,
        usersService as UsersService,
        auditLogService as AuditLogService,
        {
          publishForTenant: jest
            .fn()
            .mockResolvedValue({ stored: 0, user_ids: [] }),
        } as never,
        undefined,
        { forAccount: jest.fn().mockResolvedValue([]) } as never,
        { forAccount: cancelForAccountMock } as never,
        { forAccount: rescheduleForAccountMock } as never,
        {
          forAccount: jest.fn().mockResolvedValue({
            appointment: {
              ...appointmentRecord,
              totalPriceKopecks: 250000,
              currency: 'RUB',
              mayaClientId: 'client-1',
              clientId: null,
            },
            services: [
              {
                id: 'svc-1',
                name: 'Cut',
                price: 2500,
                duration_minutes: 60,
                currency: 'RUB',
              },
            ],
            bookingIdentity: {
              clientName: 'Guest',
              clientPhone: '+79990001122',
            },
            timezone: 'Europe/Moscow',
          }),
        } as never,
      ),
      mocks: {
        assertLiveBookingEnabledMock,
        auditLogMock,
        appointmentFindFirstMock,
        appointmentFindManyMock,
        appointmentUpdateMock,
        appointmentCreateMock,
        cancelAppointmentMock,
        cancelForAccountMock,
        rescheduleForAccountMock,
        branchFindFirstMock,
        tenantFindUniqueMock,
        createAppointmentMock,
        getCalendarSourceMock,
        getExternalProviderKeyMock,
        getClientAppointmentsMock,
        getAvailableSlotsMock,
        getServicesMock,
        getStaffMock,
        resolveStaffIdForBookingMock,
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

  it('returns catalog details and a non-zero duration immediately after booking', async () => {
    const { service } = createService();

    const result = await service.createForClient('tenant-1', 'user-1', {
      staffId: 'staff-1',
      serviceIds: ['svc-1'],
      start: '2026-07-05T11:00:00',
      branchId: 'branch-1',
    });

    expect(result).toMatchObject({
      service_ids: ['svc-1'],
      services: [
        expect.objectContaining({
          id: 'svc-1',
          duration_minutes: 60,
        }),
      ],
      total_price: 2500,
      duration_minutes: 60,
      currency: 'RUB',
    });
  });

  it('delegates create to verified Client authority and never writes the Appointment or provider', async () => {
    const { service, mocks } = createService();
    await service.createForClient('tenant-1', 'user-1', {
      staffId: 'staff-1',
      serviceIds: ['svc-1'],
      start: '2099-09-20T10:00:00Z',
    });
    expect(mocks.appointmentCreateMock).not.toHaveBeenCalled();
    expect(mocks.createAppointmentMock).not.toHaveBeenCalled();
    expect(mocks.getTenantUserOrThrowMock).not.toHaveBeenCalled();
  });

  it('delegates every account/AI/cabinet appointment read to the verified reader', async () => {
    const { service, mocks } = createService();
    await expect(
      service.listClientAppointments('tenant-1', 'user-1'),
    ).resolves.toEqual([]);
    expect(mocks.appointmentCreateMock).not.toHaveBeenCalled();
    expect(mocks.appointmentUpdateMock).not.toHaveBeenCalled();
    expect(mocks.getClientAppointmentsMock).not.toHaveBeenCalled();
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

  it('delegates client cancel to the verified Client Action Engine initiator', async () => {
    const {
      service,
      mocks: {
        appointmentUpdateMock,
        auditLogMock,
        cancelAppointmentMock,
        cancelForAccountMock,
      },
    } = createService();

    const result = await service.cancelForClient(
      'tenant-1',
      'user-1',
      'appt-1',
    );

    expect(cancelForAccountMock).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      'appt-1',
      {},
    );
    expect(cancelAppointmentMock).not.toHaveBeenCalled();
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
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
    const logged = auditLogMock.mock.calls[0]?.[0] as {
      metadata?: { execution_owner?: string };
    };
    expect(logged.metadata?.execution_owner).toBe('action_engine');
  });

  it('does not write Appointment state when the canceler reports UNKNOWN', async () => {
    const {
      service,
      mocks: { appointmentUpdateMock, cancelForAccountMock },
    } = createService();
    cancelForAccountMock.mockRejectedValue(
      new ServiceUnavailableException({
        error: { code: 'crm_outcome_unknown' },
      }),
    );

    await expect(
      service.cancelForClient('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toMatchObject({ status: 503 });
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });

  it('still surfaces a confirmed CRM refusal without touching local state', async () => {
    const {
      service,
      mocks: { appointmentUpdateMock, cancelForAccountMock },
    } = createService();
    cancelForAccountMock.mockRejectedValue(
      new Error('YClients request failed with status 403'),
    );

    await expect(
      service.cancelForClient('tenant-1', 'user-1', 'appt-1'),
    ).rejects.toThrow('status 403');
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });

  it('returns not_found when the verified Client does not own the appointment', async () => {
    const {
      service,
      mocks: { cancelAppointmentMock, cancelForAccountMock },
    } = createService();
    cancelForAccountMock.mockRejectedValue(
      new NotFoundException({
        error: { code: 'not_found' },
      }),
    );

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

  it('returns too_late_to_cancel when the appointment has already started', async () => {
    const {
      service,
      mocks: { cancelAppointmentMock, cancelForAccountMock },
    } = createService();
    cancelForAccountMock.mockRejectedValue(
      new BadRequestException({
        error: { code: 'too_late_to_cancel' },
      }),
    );

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
      mocks: { appointmentUpdateMock, auditLogMock, rescheduleForAccountMock },
    } = createService();

    const result = await service.rescheduleForClient(
      'tenant-1',
      'user-1',
      'appt-1',
      {
        start: '2026-07-05T11:00:00',
        notes: 'Move later',
      },
    );

    expect(rescheduleForAccountMock).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      'appt-1',
      {
        start: '2026-07-05T11:00:00',
        notes: 'Move later',
      },
      {},
    );
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      appointment: {
        id: 'appt-1',
        status: 'confirmed',
      },
    });
    const logged = auditLogMock.mock.calls[0]?.[0] as {
      action?: string;
      entityId?: string;
      metadata?: { execution_owner?: string };
    };
    expect(logged.action).toBe('appointment.rescheduled');
    expect(logged.entityId).toBe('appt-1');
    expect(logged.metadata?.execution_owner).toBe('action_engine');
  });

  it('returns slot_taken when a new slot is unavailable during reschedule', async () => {
    const {
      service,
      mocks: { rescheduleForAccountMock, appointmentUpdateMock },
    } = createService();
    rescheduleForAccountMock.mockRejectedValue(
      new BadRequestException({
        error: { code: 'slot_taken', field: 'start' },
      }),
    );

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
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });

  it('returns too_late_to_reschedule when the appointment has already started', async () => {
    const {
      service,
      mocks: { rescheduleForAccountMock, appointmentUpdateMock },
    } = createService();
    rescheduleForAccountMock.mockRejectedValue(
      new BadRequestException({
        error: { code: 'too_late_to_reschedule' },
      }),
    );

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
    expect(appointmentUpdateMock).not.toHaveBeenCalled();
  });
});
