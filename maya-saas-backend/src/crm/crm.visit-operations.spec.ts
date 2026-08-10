import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CrmProvider, UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';

/**
 * Операции над визитом из сетки расписания.
 *
 * Проверяем ровно то, что отличает этот путь от клиентского: границу доступа к
 * чужой записи, границу показа телефона, отсев невалидного ввода до похода в
 * CRM и админский характер ручной записи.
 */
describe('CrmService: операции над визитом', () => {
  const OWNER: AuthenticatedUser = {
    userId: 'user-owner',
    sessionId: 's1',
    tenantId: 'tenant-1',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.com',
    branchId: null,
    membershipId: null,
    membershipStatus: null,
  };
  const MASTER: AuthenticatedUser = {
    ...OWNER,
    userId: 'user-master',
    role: UserRole.STAFF,
    email: 'master@example.com',
  };

  function build(
    adapter: Record<string, unknown>,
    staffAccess: unknown = null,
  ) {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      crmStaffAccess: {
        findFirst: jest.fn().mockResolvedValue(staffAccess),
      },
      crmIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'crm-1',
          tenantId: 'tenant-1',
          provider: CrmProvider.YCLIENTS,
          encryptedApiToken: 'enc:token',
          baseUrl: null,
          status: 'active',
          settingsJson: { companyId: 503759 },
          verifiedAt: new Date(),
          lastCheckedAt: new Date(),
          lastSyncAt: new Date(),
          lastErrorCode: null,
          lastErrorAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    } as unknown as PrismaService;
    const encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn().mockReturnValue('token'),
    } as unknown as EncryptionService;
    const adapterFactory = {
      create: jest.fn().mockReturnValue(adapter),
    } as unknown as CrmAdapterFactory;
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      prisma,
      encryptionService,
      adapterFactory,
      tenantContext,
      {} as never,
    );

    return {
      service,
      run: <T>(fn: () => Promise<T>) =>
        tenantContext.runAsSystemTenant('tenant-1', fn),
    };
  }

  const detailOf = (staffId: string) => ({
    id: `crm-77`,
    provider: { id: staffId, name: 'Илья' },
    client: { id: '5', name: 'Клиент' },
    client_phone: '+79990000000',
    services: [],
    service_ids: [],
    start_at: '2026-08-04T09:00:00.000Z',
    end_at: '2026-08-04T10:00:00.000Z',
    status: 'confirmed',
    notes: null,
    total_price: 1000,
    currency: 'RUB',
    duration_minutes: 60,
    attendance: 0,
    paid: false,
    can_edit: true,
    branch: null,
  });

  it('отвечает понятным кодом, когда провайдер не умеет операцию', async () => {
    const { service, run } = build({});

    await expect(
      run(() => service.markAppointmentAttendance('tenant-1', OWNER, '77', 1)),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_attendance_not_supported' } },
    });
  });

  it('не пускает в CRM отметку о приходе вне 1 / 0 / -1', async () => {
    const markAppointmentAttendance = jest.fn();
    const { service, run } = build({ markAppointmentAttendance });

    await expect(
      run(() => service.markAppointmentAttendance('tenant-1', OWNER, '77', 5)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(markAppointmentAttendance).not.toHaveBeenCalled();
  });

  it('не пускает длительность за пределы 5..720 минут', async () => {
    const setAppointmentDuration = jest.fn();
    const { service, run } = build({ setAppointmentDuration });

    await expect(
      run(() => service.setAppointmentDuration('tenant-1', OWNER, '77', 4)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run(() => service.setAppointmentDuration('tenant-1', OWNER, '77', 721)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setAppointmentDuration).not.toHaveBeenCalled();
  });

  it('запрещает оставить визит без услуг — это стёрло бы его цену', async () => {
    const setAppointmentServices = jest.fn();
    const { service, run } = build({ setAppointmentServices });

    await expect(
      run(() => service.setAppointmentServices('tenant-1', OWNER, '77', [])),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_services_empty' } },
    });
    expect(setAppointmentServices).not.toHaveBeenCalled();
  });

  it('карточка визита берёт пояс филиала из тенанта', async () => {
    const getAppointmentDetail = jest.fn().mockResolvedValue(detailOf('1'));
    const { service, run } = build({ getAppointmentDetail });

    await run(() => service.getAppointmentDetail('tenant-1', OWNER, '77'));

    expect(getAppointmentDetail).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      externalId: '77',
      timezone: 'Europe/Moscow',
    });
  });

  it('мастер не может открыть чужой визит по перебору идентификатора', async () => {
    const getAppointmentDetail = jest.fn().mockResolvedValue(detailOf('999'));
    const { service, run } = build(
      { getAppointmentDetail },
      { externalStaffId: '1461615', status: 'active' },
    );

    await expect(
      run(() => service.getAppointmentDetail('tenant-1', MASTER, '77')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('мастер работает со своим визитом', async () => {
    const getAppointmentStaffId = jest.fn().mockResolvedValue('1461615');
    const markAppointmentAttendance = jest
      .fn()
      .mockResolvedValue({ external_id: '77', attendance: 1 });
    const { service, run } = build(
      { getAppointmentStaffId, markAppointmentAttendance },
      { externalStaffId: '1461615', status: 'active' },
    );

    await run(() =>
      service.markAppointmentAttendance('tenant-1', MASTER, '77', 1),
    );

    expect(markAppointmentAttendance).toHaveBeenCalledTimes(1);
    // Владельца визита проверяем ОДНИМ запросом, без полной карточки.
    expect(getAppointmentStaffId).toHaveBeenCalledTimes(1);
  });

  it('мастер не может изменить чужой визит', async () => {
    const getAppointmentStaffId = jest.fn().mockResolvedValue('999');
    const markAppointmentAttendance = jest.fn();
    const { service, run } = build(
      { getAppointmentStaffId, markAppointmentAttendance },
      { externalStaffId: '1461615', status: 'active' },
    );

    await expect(
      run(() => service.markAppointmentAttendance('tenant-1', MASTER, '77', 1)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(markAppointmentAttendance).not.toHaveBeenCalled();
  });

  it('без активной привязки к мастеру журнал закрыт (fail-closed)', async () => {
    const getAppointmentDetail = jest
      .fn()
      .mockResolvedValue(detailOf('1461615'));
    const { service, run } = build({ getAppointmentDetail }, null);

    await expect(
      run(() => service.getAppointmentDetail('tenant-1', MASTER, '77')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(getAppointmentDetail).not.toHaveBeenCalled();
  });

  it('телефон клиента виден владельцу и скрыт от мастера', async () => {
    const ownerSide = build({
      getAppointmentDetail: jest.fn().mockResolvedValue(detailOf('1461615')),
    });
    const ownerDetail = await ownerSide.run(() =>
      ownerSide.service.getAppointmentDetail('tenant-1', OWNER, '77'),
    );
    expect(ownerDetail.client_phone).toBe('+79990000000');

    const masterSide = build(
      {
        getAppointmentDetail: jest.fn().mockResolvedValue(detailOf('1461615')),
      },
      { externalStaffId: '1461615', status: 'active' },
    );
    const masterDetail = await masterSide.run(() =>
      masterSide.service.getAppointmentDetail('tenant-1', MASTER, '77'),
    );
    expect(masterDetail.client_phone).toBeNull();
  });

  it('ручная запись из журнала идёт админским путём и несёт длительность мастера', async () => {
    const createAppointment = jest
      .fn()
      .mockResolvedValue({ external_id: '900', status: 'confirmed' });
    const { service, run } = build({ createAppointment });

    await run(() =>
      service.createAppointment('tenant-1', {
        clientId: 'user-1',
        clientName: 'Станислав',
        clientPhone: '+79990000000',
        staffId: '1461615',
        serviceIds: ['18049154'],
        start: '2026-08-04T12:00:00',
        allowBusy: true,
        durationMinutes: 45,
      }),
    );

    expect(createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        allowBusy: true,
        durationMinutes: 45,
        start: '2026-08-04T12:00:00',
      }),
    );
  });

  it('поиск клиента недоступен на провайдере без такой возможности', async () => {
    const { service, run } = build({});

    await expect(
      run(() => service.searchClients('tenant-1', '9182')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('очередь возврата остаётся в tenant-контексте и получает часовой пояс бизнеса', async () => {
    const getClientReturnCandidates = jest.fn().mockResolvedValue([]);
    const { service, run } = build({ getClientReturnCandidates });

    await expect(
      run(() =>
        service.getClientReturnCandidates('tenant-1', 25, {
          lookbackDays: 365,
          futureDays: 90,
          inactiveDays: 90,
        }),
      ),
    ).resolves.toEqual([]);
    expect(getClientReturnCandidates).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      timezone: 'Europe/Moscow',
      limit: 25,
      lookbackDays: 365,
      futureDays: 90,
      inactiveDays: 90,
    });
  });

  it('не позволяет прочитать клиентскую базу соседнего tenant', async () => {
    const getClientReturnCandidates = jest.fn().mockResolvedValue([]);
    const { service, run } = build({ getClientReturnCandidates });

    await expect(
      run(() => service.getClientReturnCandidates('tenant-2', 25)),
    ).rejects.toThrow();
    expect(getClientReturnCandidates).not.toHaveBeenCalled();
  });
});
