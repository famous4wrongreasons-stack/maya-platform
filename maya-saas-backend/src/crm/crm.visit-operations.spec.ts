import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
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
      // 🔴 После cutover страж сравнивает идентичности Maya. Значение из CRM
      // разрешается через связь; неизвестный внешний id даёт null ⇒ отказ.
      staffProviderLink: {
        findFirst: jest.fn(({ where }: { where: { externalId: string } }) =>
          Promise.resolve(
            where.externalId === '1461615' ? { staffId: 'staff-1' } : null,
          ),
        ),
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
      opaqueReference: jest.fn(
        (namespace: string, value: string) => `${namespace}:${value}`,
      ),
    } as unknown as EncryptionService;
    const adapterFactory = {
      create: jest.fn().mockReturnValue(adapter),
    } as unknown as CrmAdapterFactory;
    const tenantContext = new TenantContextService();
    const actionClassByCapability: Record<string, string> = {
      'crm.visit.payment.v1': 'pay_visit',
      'crm.appointment.attendance.v1': 'set_appointment_attendance',
      'crm.appointment.duration.v1': 'set_appointment_duration',
      'crm.appointment.services.v1': 'set_appointment_services',
      'crm.appointment.fields.v1': 'set_appointment_fields',
      'crm.appointment.attendance.shadow.v1': 'set_appointment_attendance',
      'crm.appointment.duration.shadow.v1': 'set_appointment_duration',
      'crm.appointment.services.shadow.v1': 'set_appointment_services',
    };
    const actionEngineRuntime = {
      execute: jest.fn(
        async (
          request: { input: unknown },
          handlers: {
            prepare?: (input: Record<string, unknown>) => Promise<unknown>;
            dispatch: (
              input: Record<string, unknown>,
              idempotencyKey: string,
            ) => Promise<{ value: unknown }>;
          },
        ) => {
          await handlers.prepare?.(request.input as Record<string, unknown>);
          const dispatched = await handlers.dispatch(
            request.input as Record<string, unknown>,
            'visit-operation-test',
          );
          return dispatched.value;
        },
      ),
      executeWithReceipt: jest.fn(
        async (
          request: { input: unknown },
          handlers: {
            prepare?: (input: Record<string, unknown>) => Promise<unknown>;
            dispatch: (
              input: Record<string, unknown>,
              idempotencyKey: string,
            ) => Promise<{ value: unknown }>;
          },
        ) => {
          await handlers.prepare?.(request.input as Record<string, unknown>);
          const dispatched = await handlers.dispatch(
            request.input as Record<string, unknown>,
            'visit-operation-test',
          );
          return { value: dispatched.value, execution: {} };
        },
      ),
      preview: jest.fn(
        (request: {
          tenantId: string;
          capability: string;
          source: { type: string };
          targetRef: string;
        }) => ({
          contract: 'maya.action-execution-preview/1',
          tenantId: request.tenantId,
          sourceType: request.source.type,
          capability: request.capability,
          capabilityVersion: 1,
          actionClass: actionClassByCapability[request.capability],
          targetKind: 'appointment',
          targetRef: request.targetRef,
          normalizedInputHash: 'a'.repeat(64),
          identityFingerprint: 'b'.repeat(64),
          idempotencyScope: 'nest.crm.journal:test',
          requestIdempotencyKeyHash: 'c'.repeat(64),
          policyKey: 'chapter6.residual-appointment-shadow',
          policyVersion: 1,
          policyDecision: 'SHADOW_ONLY',
          autonomyLevel: 'L2_5_SHADOW',
          approvalRequirement: 'NONE',
          executorKey: 'shadow.none',
          executorVersion: 1,
          externalSideEffects: 0,
        }),
      ),
      planShadow: jest.fn().mockResolvedValue({}),
    };
    const service = new CrmService(
      prisma,
      encryptionService,
      adapterFactory,
      tenantContext,
      {} as never,
      {} as never,
      actionEngineRuntime as never,
    );

    return {
      service,
      actionEngineRuntime,
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
    attendance: 'awaiting',
    paid: false,
    can_edit: true,
    branch: null,
  });

  const mutationState = (
    overrides: Partial<{
      attendance: string;
      duration_minutes: number;
      service_ids: string[];
      comment: string;
      client_name: string;
      client_phone: string;
      sms_flag: number;
    }> = {},
  ) => ({
    external_id: '77',
    attendance: 'awaiting',
    duration_minutes: 60,
    service_ids: ['10'],
    comment: '',
    client_name: 'Клиент',
    client_phone: '+79990000000',
    sms_flag: 0,
    ...overrides,
  });

  it('отвечает понятным кодом, когда провайдер не умеет операцию', async () => {
    const { service, run } = build({
      getAppointmentMutationState: jest.fn().mockResolvedValue(mutationState()),
    });

    await expect(
      run(() =>
        service.markAppointmentAttendance('tenant-1', OWNER, '77', 'arrived'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('не пускает в CRM исход, который нельзя проставить записью', async () => {
    // После P3 сервис принимает канон, а не код провайдера, поэтому проверка
    // стала точнее: `confirmed_by_client` — валидный исход ЧТЕНИЯ (код 2), но
    // записать его нельзя. Смысл прежний: сервис не доверяет вызывающему.
    const markAppointmentAttendance = jest.fn();
    const { service, run } = build({ markAppointmentAttendance });

    await expect(
      run(() =>
        service.markAppointmentAttendance(
          'tenant-1',
          OWNER,
          '77',
          'confirmed_by_client',
        ),
      ),
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
      { staffId: 'staff-1', status: 'active' },
    );

    await expect(
      run(() => service.getAppointmentDetail('tenant-1', MASTER, '77')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('мастер работает со своим визитом', async () => {
    let state = mutationState();
    const getAppointmentStaffId = jest.fn().mockResolvedValue('1461615');
    const markAppointmentAttendance = jest.fn().mockImplementation(() => {
      state = mutationState({ attendance: 'arrived' });
      return Promise.resolve({ external_id: '77', attendance: 'arrived' });
    });
    const getAppointmentMutationState = jest.fn(() => Promise.resolve(state));
    const { service, run } = build(
      {
        getAppointmentStaffId,
        getAppointmentMutationState,
        markAppointmentAttendance,
      },
      { staffId: 'staff-1', status: 'active' },
    );

    await run(() =>
      service.markAppointmentAttendance('tenant-1', MASTER, '77', 'arrived'),
    );

    expect(markAppointmentAttendance).toHaveBeenCalledTimes(1);
    // Владельца визита проверяем ОДНИМ запросом, без полной карточки.
    expect(getAppointmentStaffId).toHaveBeenCalledTimes(1);
  });

  it('проводит A04-A06 только через Action Engine и доказывает результат read-back', async () => {
    let state = mutationState();
    const adapter = {
      getAppointmentMutationState: jest.fn(() => Promise.resolve(state)),
      markAppointmentAttendance: jest.fn().mockImplementation(() => {
        state = mutationState({ attendance: 'arrived' });
        return Promise.resolve({ external_id: '77', attendance: 'arrived' });
      }),
      setAppointmentDuration: jest.fn().mockImplementation(() => {
        state = mutationState({ attendance: 'arrived', duration_minutes: 45 });
        return Promise.resolve({ external_id: '77', duration_minutes: 45 });
      }),
      setAppointmentServices: jest.fn().mockImplementation(() => {
        state = mutationState({
          attendance: 'arrived',
          duration_minutes: 45,
          service_ids: ['10', '20'],
        });
        return Promise.resolve({
          external_id: '77',
          service_ids: ['10', '20'],
        });
      }),
    };
    const { service, actionEngineRuntime, run } = build(adapter);

    await run(() =>
      service.markAppointmentAttendance('tenant-1', OWNER, '77', 'arrived'),
    );
    await run(() =>
      service.setAppointmentDuration('tenant-1', OWNER, '77', 45),
    );
    await run(() =>
      service.setAppointmentServices('tenant-1', OWNER, '77', ['20', '10']),
    );

    expect(actionEngineRuntime.executeWithReceipt).toHaveBeenCalledTimes(3);
    expect(actionEngineRuntime.executeWithReceipt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        capability: 'crm.appointment.attendance.v1',
        input: { attendanceCode: 1 },
      }),
      expect.any(Object),
    );
    expect(actionEngineRuntime.executeWithReceipt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        capability: 'crm.appointment.duration.v1',
        input: { durationSeconds: 2700 },
      }),
      expect.any(Object),
    );
    expect(actionEngineRuntime.executeWithReceipt).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        capability: 'crm.appointment.services.v1',
        input: { serviceIds: ['20', '10'] },
      }),
      expect.any(Object),
    );
    expect(adapter.getAppointmentMutationState).toHaveBeenCalledTimes(6);
    expect(actionEngineRuntime.planShadow).not.toHaveBeenCalled();
  });

  it('не создаёт второй dispatch, если provider mutation завершилась ошибкой', async () => {
    const adapter = {
      getAppointmentMutationState: jest.fn().mockResolvedValue(mutationState()),
      setAppointmentDuration: jest
        .fn()
        .mockRejectedValue(new Error('provider rejected')),
    };
    const { service, actionEngineRuntime, run } = build(adapter);

    await expect(
      run(() => service.setAppointmentDuration('tenant-1', OWNER, '77', 45)),
    ).rejects.toThrow('provider rejected');
    expect(adapter.setAppointmentDuration).toHaveBeenCalledTimes(1);
    expect(actionEngineRuntime.planShadow).not.toHaveBeenCalled();
  });

  it('не объявляет успех, если read-back не доказал запрошенное состояние', async () => {
    const adapter = {
      getAppointmentMutationState: jest.fn().mockResolvedValue(mutationState()),
      setAppointmentDuration: jest
        .fn()
        .mockResolvedValue({ external_id: '77', duration_minutes: 45 }),
    };
    const built = build(adapter);

    await expect(
      built.run(() =>
        built.service.setAppointmentDuration('tenant-1', OWNER, '77', 45),
      ),
    ).rejects.toThrow(/without proving the requested appointment state/);
    expect(adapter.setAppointmentDuration).toHaveBeenCalledTimes(1);
    expect(built.actionEngineRuntime.planShadow).not.toHaveBeenCalled();
  });

  it('мастер не может изменить чужой визит', async () => {
    const getAppointmentStaffId = jest.fn().mockResolvedValue('999');
    const markAppointmentAttendance = jest.fn();
    const { service, run } = build(
      { getAppointmentStaffId, markAppointmentAttendance },
      { staffId: 'staff-1', status: 'active' },
    );

    await expect(
      run(() =>
        service.markAppointmentAttendance('tenant-1', MASTER, '77', 'arrived'),
      ),
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
      { staffId: 'staff-1', status: 'active' },
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
        start: '2026-08-04T09:00:00.000Z',
        timezone: 'Europe/Moscow',
      }),
    );
  });

  it('поиск клиента недоступен на провайдере без такой возможности', async () => {
    const { service, run } = build({});

    await expect(
      run(() => service.searchClients('tenant-1', '9182')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('отказывает fail-closed независимо от provider capability', async () => {
    const { service, run } = build({});

    await expect(
      run(() =>
        service.payVisit('tenant-1', {
          externalId: '77',
          amountKopecks: 200_000,
          paymentMethod: 'card',
        }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('строит pay_visit как бизнес-действие, а не как generic finance transport', async () => {
    const adapter = {
      getVisitPaymentState: jest.fn(),
      payVisit: jest.fn(),
    };
    const { service, actionEngineRuntime, run } = build(adapter);

    const preview = await run(() =>
      service.previewPayVisit('tenant-1', {
        externalId: '77',
        amountKopecks: 200_000,
        paymentMethod: 'card',
      }),
    );

    expect(preview).toMatchObject({
      capability: 'crm.visit.payment.v1',
      actionClass: 'pay_visit',
      targetKind: 'appointment',
      targetRef: 'appointment/77',
      externalSideEffects: 0,
    });
    expect(actionEngineRuntime.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        capability: 'crm.visit.payment.v1',
        targetRef: 'appointment/77',
        input: {
          externalId: '77',
          amountKopecks: 200_000,
          paymentMethod: 'card',
        },
      }),
    );
    expect(adapter.getVisitPaymentState).not.toHaveBeenCalled();
    expect(adapter.payVisit).not.toHaveBeenCalled();
  });

  it('не читает payment state и не вызывает provider write', async () => {
    const adapter = {
      getVisitPaymentState: jest.fn(),
      payVisit: jest.fn(),
    };
    const { service, actionEngineRuntime, run } = build(adapter);

    await expect(
      run(() =>
        service.payVisit('tenant-1', {
          externalId: '77',
          amountKopecks: 200_000,
          paymentMethod: 'cash',
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'visit_payment_write_provider_contract_deferred' },
      },
    });

    expect(adapter.getVisitPaymentState).not.toHaveBeenCalled();
    expect(adapter.payVisit).not.toHaveBeenCalled();
    expect(actionEngineRuntime.executeWithReceipt).not.toHaveBeenCalled();
  });

  it('повтор не может обойти provider-deferred запрет', async () => {
    const getVisitPaymentState = jest.fn();
    const payVisit = jest.fn();
    const { service, run } = build({ getVisitPaymentState, payVisit });
    const payment = () =>
      service.payVisit('tenant-1', {
        externalId: '77',
        amountKopecks: 200_000,
        paymentMethod: 'cash',
      });

    await expect(run(payment)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(run(payment)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(getVisitPaymentState).not.toHaveBeenCalled();
    expect(payVisit).not.toHaveBeenCalled();
  });

  it('не даёт выполнить pay_visit вне tenant context', async () => {
    const payVisit = jest.fn();
    const { service, run } = build({
      getVisitPaymentState: jest.fn(),
      payVisit,
    });

    await expect(
      run(() =>
        service.payVisit('tenant-2', {
          externalId: '77',
          amountKopecks: 200_000,
          paymentMethod: 'cash',
        }),
      ),
    ).rejects.toThrow();
    expect(payVisit).not.toHaveBeenCalled();
  });
});
