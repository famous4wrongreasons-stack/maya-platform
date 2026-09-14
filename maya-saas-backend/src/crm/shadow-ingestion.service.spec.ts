import type { EventStoreService } from '../events/event-store.service';
import type { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  AppointmentApplyResult,
  AppointmentChangeService,
  ObservedAppointment,
} from './appointment-change.service';
import type { AppointmentObservationService } from './appointment-observation.service';
import type { ShadowDeliveryDto } from './dto/shadow-delivery.dto';
import { ShadowIngestionService } from './shadow-ingestion.service';
import { DOMAIN_EVENT_TYPE } from '../domain';

/**
 * 🔴 CYCLE 03 B2 + B3.3 — теневой приём.
 *
 * Обещание режима не изменилось: приёмник ЗАМЕЧАЕТ и ничего не делает наружу,
 * обработчиком остаётся легаси-бот.
 *
 * Что изменилось в B3.3: своей классификации у приёмника больше нет. Он читает
 * истину у источника и отдаёт её ОБЩЕМУ компаратору — тому же, которым
 * пользуется сверка. Поэтому здесь проверяется маршрут, а правила переходов —
 * в `domain/appointment-change.spec.ts`.
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

const observation: ObservedAppointment = {
  externalId: '1911799161',
  state: {
    staffExternalId: '1461615',
    staffId: 'staff-maya-1',
    startAt: new Date('2026-08-20T10:00:00.000Z'),
    endAt: new Date('2026-08-20T11:00:00.000Z'),
    serviceIds: ['svc-1'],
    status: 'confirmed',
    attendance: null,
    mayaClientId: null,
  },
  totalPriceKopecks: 250_000,
  currency: 'RUB',
};

const applied = (
  over: Partial<AppointmentApplyResult> = {},
): AppointmentApplyResult => ({
  appointmentId: 'appointment-maya-1',
  outcome: 'updated',
  transitions: [DOMAIN_EVENT_TYPE.appointmentRescheduled],
  eventsEmitted: 1,
  duplicateEvents: 0,
  ...over,
});

const build = (over?: {
  resolveTenant?: Fn<BridgeSourceService['resolveTenant']>;
  observed?: ObservedAppointment | 'unreadable';
  result?: AppointmentApplyResult;
  baseline?: boolean;
}) => {
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

  const quarantine: Fn<EventStoreService['quarantine']> = jest
    .fn()
    .mockResolvedValue({ id: 'quarantine-1' });
  const eventStore = { quarantine } as unknown as EventStoreService;

  const observe: Fn<AppointmentObservationService['observe']> = jest
    .fn()
    .mockResolvedValue(over?.observed ?? observation);
  const baselineEstablished: Fn<
    AppointmentObservationService['baselineEstablished']
  > = jest.fn().mockResolvedValue(over?.baseline ?? true);
  const observationService = {
    observe,
    baselineEstablished,
  } as unknown as AppointmentObservationService;

  const applyObservation: Fn<AppointmentChangeService['applyObservation']> =
    jest.fn().mockResolvedValue(over?.result ?? applied());
  const changeService = {
    applyObservation,
  } as unknown as AppointmentChangeService;

  const service = new ShadowIngestionService(
    new TenantContextService(),
    bridgeSource,
    eventStore,
    observationService,
    changeService,
  );

  return {
    service,
    quarantine,
    observe,
    applyObservation,
    resolveTenant,
    baselineEstablished,
  };
};

describe('теневой приём доставок CRM', () => {
  beforeEach(() => {
    process.env.CRM_SHADOW_INGESTION_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.CRM_SHADOW_INGESTION_ENABLED;
  });

  it('🔴 выключенный режим не делает ничего — выкат и включение разные события', async () => {
    delete process.env.CRM_SHADOW_INGESTION_ENABLED;
    const { service, applyObservation, quarantine } = build();

    await expect(service.ingest(delivery())).resolves.toMatchObject({
      outcome: 'ignored',
    });
    expect(applyObservation).not.toHaveBeenCalled();
    expect(quarantine).not.toHaveBeenCalled();
  });

  it('🔴 истина перечитывается у источника, а не берётся из тела', async () => {
    const { service, observe } = build();

    await service.ingest(delivery());

    expect(observe).toHaveBeenCalledWith({
      tenantId: 'tenant-salon',
      provider: 'yclients',
      externalId: '1911799161',
      expectRemoved: false,
    });
  });

  it('🔴 применение идёт ОБЩИМ компаратором, а не своей классификацией', async () => {
    const { service, applyObservation } = build();

    await expect(service.ingest(delivery())).resolves.toMatchObject({
      outcome: 'persisted',
    });

    expect(applyObservation).toHaveBeenCalledTimes(1);
    expect(applyObservation.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-salon',
      provider: 'yclients',
      ingestionMethod: 'webhook',
    });
  });

  it('🔴 повтор доставки не даёт второго события', async () => {
    // Зеркало уже обновлено предыдущей доставкой — различий не осталось.
    const { service, applyObservation } = build({
      result: applied({
        outcome: 'unchanged',
        transitions: [],
        eventsEmitted: 0,
      }),
    });

    await expect(service.ingest(delivery())).resolves.toMatchObject({
      outcome: 'stale',
      reason: 'no_observable_change',
    });
    expect(applyObservation).toHaveBeenCalledTimes(1);
  });

  it('доставка удаления идёт с признаком снятия', async () => {
    const { service, observe } = build();

    await service.ingest(delivery({ event: 'record.delete' }));

    expect(observe.mock.calls[0][0].expectRemoved).toBe(true);
  });

  it('🔴 неизвестная доставка уходит в карантин, а не в событие', async () => {
    const { service, applyObservation, quarantine } = build();

    const result = await service.ingest(
      delivery({ event: undefined, resource: 'client', status: 'update' }),
    );

    expect(result).toMatchObject({
      outcome: 'quarantined',
      reason: 'unknown_discriminator',
    });
    expect(applyObservation).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledTimes(1);
  });

  it('нечитаемая запись при обновлении — карантин, а не выдуманный факт', async () => {
    const { service, applyObservation, quarantine } = build({
      observed: 'unreadable',
    });

    const result = await service.ingest(delivery({ event: 'record.update' }));

    expect(result).toMatchObject({ reason: 'source_unreadable' });
    expect(applyObservation).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledTimes(1);
  });

  it('арендатор не разрешён — карантин без арендатора', async () => {
    const resolveTenant = jest
      .fn()
      .mockRejectedValue(new Error('no tenant')) as Fn<
      BridgeSourceService['resolveTenant']
    >;
    const { service, quarantine, applyObservation } = build({ resolveTenant });

    const result = await service.ingest(delivery());

    expect(result).toMatchObject({ reason: 'tenant_unresolved' });
    expect(applyObservation).not.toHaveBeenCalled();
    expect(quarantine.mock.calls[0][0].tenantId).toBeUndefined();
  });

  it('🔴 состояние базовой линии передаётся компаратору, а не решается здесь', async () => {
    const { service, applyObservation } = build({ baseline: false });

    await service.ingest(delivery());

    expect(applyObservation.mock.calls[0][0].baselineEstablished).toBe(false);
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
