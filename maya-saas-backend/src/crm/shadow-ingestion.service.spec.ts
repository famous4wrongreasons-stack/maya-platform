import type { EventStoreService } from '../events/event-store.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CrmService } from './crm.service';
import type { ShadowDeliveryDto } from './dto/shadow-delivery.dto';
import { ShadowIngestionService } from './shadow-ingestion.service';

/**
 * 🔴 CYCLE 03 B2 — теневой приём.
 *
 * Проверяется главное обещание режима: приёмник ЗАМЕЧАЕТ и ничего не делает
 * наружу. Обработчиком остаётся легаси-бот.
 */

type Fn<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

const delivery = (
  over: Partial<ShadowDeliveryDto> = {},
): ShadowDeliveryDto => ({
  provider: 'yclients',
  external_company_id: '503759',
  event: 'record.create',
  external_id: '1911799161',
  payload_keys: ['resource', 'resource_id', 'status'],
  ...over,
});

const appointmentRow = {
  id: 'appointment-maya-1',
  staffId: 'staff-maya-1',
  staffExternalId: '1461615',
  startAt: new Date('2026-08-20T10:00:00.000Z'),
  endAt: new Date('2026-08-20T11:00:00.000Z'),
  status: 'confirmed',
};

const detail = {
  id: '1911799161',
  provider: { id: '1461615', name: 'Мастер' },
  service_ids: ['svc-1'],
  start_at: '2026-08-20T10:00:00.000Z',
  end_at: '2026-08-20T11:00:00.000Z',
  status: 'confirmed',
  attendance: 'expected',
};

const build = (over?: {
  appointment?: unknown;
  resolveTenant?: Fn<BridgeSourceService['resolveTenant']>;
  detail?: unknown;
  detailThrows?: boolean;
  appendOutcome?: 'persisted' | 'duplicate';
}) => {
  const findFirst: Fn<(args: unknown) => Promise<unknown>> = jest
    .fn()
    .mockResolvedValue(
      over?.appointment === undefined ? appointmentRow : over.appointment,
    );
  const prisma = { appointment: { findFirst } } as unknown as PrismaService;

  const resolveTenant =
    over?.resolveTenant ??
    (jest.fn().mockResolvedValue({
      tenantId: 'tenant-salon',
      slug: 'muzhskaya-estetika-3',
      resolvedBy: 'integration',
    }) as Fn<BridgeSourceService['resolveTenant']>);
  const bridgeSource = {
    resolveTenant,
    assertBridgeSecret: jest.fn(),
  } as unknown as BridgeSourceService;

  const getAppointmentDetailForSystem: Fn<
    (tenantId: string, externalId: string) => Promise<unknown>
  > = over?.detailThrows
    ? jest.fn().mockRejectedValue(new Error('not found'))
    : jest.fn().mockResolvedValue(over?.detail ?? detail);
  const crmService = {
    getAppointmentDetailForSystem,
  } as unknown as CrmService;

  const append: Fn<EventStoreService['append']> = jest.fn().mockResolvedValue({
    outcome: over?.appendOutcome ?? 'persisted',
    eventId: over?.appendOutcome === 'duplicate' ? null : 'event-1',
  });
  const quarantine: Fn<EventStoreService['quarantine']> = jest
    .fn()
    .mockResolvedValue({ id: 'quarantine-1' });
  const eventStore = { append, quarantine } as unknown as EventStoreService;

  const service = new ShadowIngestionService(
    prisma,
    new TenantContextService(),
    bridgeSource,
    crmService,
    eventStore,
  );
  return {
    service,
    append,
    quarantine,
    findFirst,
    getAppointmentDetailForSystem,
    resolveTenant,
  };
};

describe('теневой приём доставок CRM', () => {
  beforeEach(() => {
    process.env.CRM_SHADOW_INGESTION_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.CRM_SHADOW_INGESTION_ENABLED;
  });

  it('🔴 выключенный режим не пишет ничего — выкат и включение разные события', async () => {
    delete process.env.CRM_SHADOW_INGESTION_ENABLED;
    const { service, append, quarantine } = build();

    await expect(service.ingest(delivery())).resolves.toMatchObject({
      outcome: 'ignored',
    });
    expect(append).not.toHaveBeenCalled();
    expect(quarantine).not.toHaveBeenCalled();
  });

  it('известная доставка становится каноническим событием Maya', async () => {
    const { service, append } = build();

    await expect(service.ingest(delivery())).resolves.toMatchObject({
      outcome: 'persisted',
    });

    const written = append.mock.calls[0][0];
    expect(written.type).toBe('appointment.created');
    // Событие ссылается на идентичность MAYA, внешний id — только провенанс.
    expect(written.entityId).toBe('appointment-maya-1');
    expect(written.sourceRef).toBe('1911799161');
  });

  it('🔴 истина перечитывается у источника, а не берётся из тела', async () => {
    const { service, getAppointmentDetailForSystem } = build();

    await service.ingest(delivery());

    expect(getAppointmentDetailForSystem).toHaveBeenCalledWith(
      'tenant-salon',
      '1911799161',
    );
  });

  it('🔴 повтор доставки — duplicate, а не новое событие и не ошибка', async () => {
    const { service } = build({ appendOutcome: 'duplicate' });

    await expect(service.ingest(delivery())).resolves.toMatchObject({
      outcome: 'duplicate',
    });
  });

  it('🔴 неизвестная доставка уходит в карантин, а не в событие', async () => {
    const { service, append, quarantine } = build();

    const result = await service.ingest(
      delivery({ event: undefined, resource: 'client', status: 'update' }),
    );

    expect(result).toMatchObject({
      outcome: 'quarantined',
      reason: 'unknown_discriminator',
    });
    expect(append).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledTimes(1);
  });

  it('🔴 визита у Maya нет — идентичность НЕ выдумывается', async () => {
    // Создать визит значило бы выдумать ещё и клиента: строка требует его
    // обязательно. Честный карантин вместо изобретённой идентичности.
    const { service, append, quarantine } = build({ appointment: null });

    const result = await service.ingest(delivery());

    expect(result).toMatchObject({
      outcome: 'quarantined',
      reason: 'entity_unresolved',
    });
    expect(append).not.toHaveBeenCalled();
    const written = quarantine.mock.calls[0][0];
    expect(written.reason).toBe('entity_unresolved');
  });

  it('арендатор не разрешён — карантин без арендатора', async () => {
    const resolveTenant = jest
      .fn()
      .mockRejectedValue(new Error('no tenant')) as Fn<
      BridgeSourceService['resolveTenant']
    >;
    const { service, quarantine, append } = build({ resolveTenant });

    const result = await service.ingest(delivery());

    expect(result).toMatchObject({ reason: 'tenant_unresolved' });
    expect(append).not.toHaveBeenCalled();
    expect(quarantine.mock.calls[0][0].tenantId).toBeUndefined();
  });

  it('удалённая запись — доказательство отмены, а не сбой чтения', async () => {
    const { service, append } = build({
      detailThrows: true,
    });

    await service.ingest(delivery({ event: 'record.delete' }));

    expect(append.mock.calls[0][0].type).toBe('appointment.cancelled');
  });

  it('нечитаемая запись при обновлении — карантин, а не выдуманный факт', async () => {
    const { service, append, quarantine } = build({ detailThrows: true });

    const result = await service.ingest(delivery({ event: 'record.update' }));

    expect(result).toMatchObject({ reason: 'source_unreadable' });
    expect(append).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledTimes(1);
  });

  it('смена мастера и переноc различаются сравнением с известным состоянием', async () => {
    const moved = build({
      detail: { ...detail, start_at: '2026-08-20T14:00:00.000Z' },
    });
    await moved.service.ingest(delivery({ event: 'record.update' }));
    expect(moved.append.mock.calls[0][0].type).toBe('appointment.rescheduled');

    const reassigned = build({
      detail: { ...detail, provider: { id: '999', name: 'Другой' } },
    });
    await reassigned.service.ingest(delivery({ event: 'record.update' }));
    expect(reassigned.append.mock.calls[0][0].type).toBe(
      'appointment.staff_changed',
    );
  });

  it('🔴 в диагностику карантина не попадают значения полей', async () => {
    const { service, quarantine } = build();

    await service.ingest(
      delivery({
        event: 'unknown.thing',
        payload_keys: ['client_name', 'client_phone', 'resource'],
      }),
    );

    const written = JSON.stringify(quarantine.mock.calls[0][0]);
    // Имена ключей — да; значения — никогда. Иначе карантин станет тем же
    // логом с ПД, который уже найден у PHP-реле.
    expect(written).toContain('client_phone');
    expect(written).not.toMatch(/\+7\d{10}/);
  });
});
