import { CrmProvider } from '../../common/domain.enums';
import { getCrmProviderCapability } from '../crm-provider-catalog';
import {
  CrmUnsupportedCapabilityError,
  isUnsupportedCapability,
} from '../crm-request.errors';
import type { CRMAdapter, CrmAdapterConfig } from '../crm-adapter.interface';
import { DikidiCRMAdapter } from './dikidi-crm.adapter';
import { MockCRMAdapter } from './mock-crm.adapter';
import { SalonOnlineCRMAdapter } from './salon-online-crm.adapter';
import { WhitelinesCRMAdapter } from './whitelines-crm.adapter';

/**
 * 🔴 ГЛАВНЫЙ ИНВАРИАНТ P6:
 *
 *     UNSUPPORTED CAPABILITY ≠ EMPTY BUSINESS RESULT
 *
 * `[]` означает: возможность поддерживается, запрос выполнен, результатов
 * действительно нет. «Не умею» — отдельный явный исход.
 *
 * До P6 из девяти обязательных методов каркаса ровно один нарушал это правило:
 * `getClientAppointments` возвращал пустой массив, и вызывающий не мог отличить
 * «провайдер не умеет» от «у клиента нет записей».
 */

const config = (provider: CrmProvider): CrmAdapterConfig => ({
  provider,
  apiToken: 'test',
  settings: {},
});

const SCAFFOLDED: Array<[string, CRMAdapter, CrmProvider]> = [
  [
    'Dikidi',
    new DikidiCRMAdapter(config(CrmProvider.DIKIDI)),
    CrmProvider.DIKIDI,
  ],
  [
    'Salon Online',
    new SalonOnlineCRMAdapter(config(CrmProvider.SALON_ONLINE)),
    CrmProvider.SALON_ONLINE,
  ],
  [
    'Whitelines',
    new WhitelinesCRMAdapter(config(CrmProvider.WHITELINES)),
    CrmProvider.WHITELINES,
  ],
];

/** Девять обязательных методов контракта, кроме `testConnection`. */
const MANDATORY: Array<[string, (adapter: CRMAdapter) => Promise<unknown>]> = [
  ['getServices', (a) => a.getServices('tenant-1')],
  ['getStaff', (a) => a.getStaff('tenant-1')],
  [
    'getAvailableSlots',
    (a) => a.getAvailableSlots({ tenantId: 'tenant-1', date: '2026-08-17' }),
  ],
  [
    'createAppointment',
    (a) =>
      a.createAppointment({
        tenantId: 'tenant-1',
        clientId: 'c',
        clientName: 'n',
        staffId: 's',
        serviceIds: ['x'],
        start: '2026-08-17T10:00:00.000Z',
      }),
  ],
  [
    'cancelAppointment',
    (a) => a.cancelAppointment({ tenantId: 'tenant-1', externalId: '1' }),
  ],
  [
    'rescheduleAppointment',
    (a) =>
      a.rescheduleAppointment({
        tenantId: 'tenant-1',
        externalId: '1',
        start: '2026-08-17T10:00:00.000Z',
      }),
  ],
  [
    'getClientAppointments',
    (a) =>
      a.getClientAppointments({ tenantId: 'tenant-1', phone: '+70000000000' }),
  ],
  [
    'getClientLoyalty',
    (a) => a.getClientLoyalty({ tenantId: 'tenant-1', phone: '+70000000000' }),
  ],
];

describe('контракт возможностей адаптера', () => {
  describe.each(SCAFFOLDED)('каркас %s', (_name, adapter, provider) => {
    it.each(MANDATORY)(
      '🔴 %s не возвращает успешный пустой результат — только явный отказ',
      async (capability, call) => {
        await expect(call(adapter)).rejects.toBeInstanceOf(
          CrmUnsupportedCapabilityError,
        );

        // И это именно «не умею», а не случайная ошибка.
        await call(adapter).catch((error: unknown) => {
          expect(isUnsupportedCapability(error)).toBe(true);
          if (isUnsupportedCapability(error)) {
            expect(error.capability).toBe(capability);
            expect(error.provider).toBe(provider);
          }
        });
      },
    );

    it('testConnection сохраняет прежнюю честную семантику', async () => {
      // Вопрос «подключишься?» имеет нормальный отрицательный ответ, поэтому
      // здесь исключение было бы неверным. Поведение до P6 сохранено дословно.
      await expect(adapter.testConnection('tenant-1')).resolves.toMatchObject({
        ok: false,
        provider,
      });
    });

    it('гейт подключаемости остаётся закрытым', () => {
      // Каркас недостижим через обычный поток интеграции — это и есть причина,
      // по которой его ложь не проявлялась в проде.
      expect(getCrmProviderCapability(provider).connectable).toBe(false);
      expect(getCrmProviderCapability(provider).productionReady).toBe(false);
    });
  });

  describe('поддерживаемая возможность имеет право на пустой результат', () => {
    const mock = new MockCRMAdapter(config(CrmProvider.MOCK));

    it('mock реализует возможность и может вернуть [] честно', async () => {
      const result = await mock.getClientAppointments({
        tenantId: 'tenant-1',
        phone: '+79990000000',
      });
      // Здесь пустота законна: провайдер умеет, запрос выполнен, записей нет.
      expect(Array.isArray(result)).toBe(true);
    });

    it('mock не бросает «не умею» на реализованном методе', async () => {
      await expect(mock.getStaff('tenant-1')).resolves.toBeDefined();
    });
  });

  describe('боевые провайдеры не затронуты', () => {
    it('YCLIENTS остаётся единственным production-ready', () => {
      expect(
        getCrmProviderCapability(CrmProvider.YCLIENTS).productionReady,
      ).toBe(true);
      for (const provider of [
        CrmProvider.ALTEGIO,
        CrmProvider.MOCK,
        CrmProvider.DIKIDI,
        CrmProvider.WHITELINES,
        CrmProvider.SALON_ONLINE,
      ]) {
        expect(getCrmProviderCapability(provider).productionReady).toBe(false);
      }
    });

    it('ALTEGIO остаётся подключаемым вариантом того же API', () => {
      expect(getCrmProviderCapability(CrmProvider.ALTEGIO).connectable).toBe(
        true,
      );
    });
  });
});
