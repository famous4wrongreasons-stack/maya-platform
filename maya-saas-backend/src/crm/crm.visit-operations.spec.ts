import { BadRequestException, ConflictException } from '@nestjs/common';

import { CrmProvider } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';

/**
 * Операции над визитом из сетки расписания.
 *
 * Проверяем ровно то, что отличает этот путь от клиентского: провайдер без
 * нужного метода отвечает понятным кодом, невалидный ввод не доезжает до CRM,
 * а ручная запись идёт админским путём (allowBusy) с длительностью мастера.
 */
describe('CrmService: операции над визитом', () => {
  function build(adapter: Record<string, unknown>) {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
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

  it('отвечает понятным кодом, когда провайдер не умеет операцию', async () => {
    const { service, run } = build({});

    await expect(
      run(() => service.markAppointmentAttendance('tenant-1', '77', 1)),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_attendance_not_supported' } },
    });
  });

  it('не пускает в CRM отметку о приходе вне 1 / 0 / -1', async () => {
    const markAppointmentAttendance = jest.fn();
    const { service, run } = build({ markAppointmentAttendance });

    await expect(
      run(() => service.markAppointmentAttendance('tenant-1', '77', 5)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(markAppointmentAttendance).not.toHaveBeenCalled();
  });

  it('не пускает длительность за пределы 5..720 минут', async () => {
    const setAppointmentDuration = jest.fn();
    const { service, run } = build({ setAppointmentDuration });

    await expect(
      run(() => service.setAppointmentDuration('tenant-1', '77', 4)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run(() => service.setAppointmentDuration('tenant-1', '77', 721)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setAppointmentDuration).not.toHaveBeenCalled();
  });

  it('запрещает оставить визит без услуг — это стёрло бы его цену', async () => {
    const setAppointmentServices = jest.fn();
    const { service, run } = build({ setAppointmentServices });

    await expect(
      run(() => service.setAppointmentServices('tenant-1', '77', [])),
    ).rejects.toMatchObject({
      response: { error: { code: 'crm_services_empty' } },
    });
    expect(setAppointmentServices).not.toHaveBeenCalled();
  });

  it('карточка визита берёт пояс филиала из тенанта', async () => {
    const getAppointmentDetail = jest.fn().mockResolvedValue({ id: 'crm-77' });
    const { service, run } = build({ getAppointmentDetail });

    await run(() => service.getAppointmentDetail('tenant-1', '77'));

    expect(getAppointmentDetail).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      externalId: '77',
      timezone: 'Europe/Moscow',
    });
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
});
