import { CrmProvider } from '../common/domain.enums';

export const CRM_PROVIDER_IMPLEMENTATION_STATUSES = [
  'ready',
  'development_only',
  'planned',
] as const;

export type CrmProviderImplementationStatus =
  (typeof CRM_PROVIDER_IMPLEMENTATION_STATUSES)[number];

export interface CrmProviderCapability {
  provider: CrmProvider;
  name: string;
  implementationStatus: CrmProviderImplementationStatus;
  connectable: boolean;
  productionReady: boolean;
  bookingMode: 'live_capable' | 'preview_only' | 'unavailable';
  requirements: {
    apiToken: boolean;
    companyId: boolean;
  };
  operations: {
    services: boolean;
    staff: boolean;
    availability: boolean;
    createAppointment: boolean;
    cancelAppointment: boolean;
    rescheduleAppointment: boolean;
  };
  limitations: readonly string[];
}

const COMPLETE_OPERATIONS = {
  services: true,
  staff: true,
  availability: true,
  createAppointment: true,
  cancelAppointment: true,
  rescheduleAppointment: true,
} as const;

const NO_OPERATIONS = {
  services: false,
  staff: false,
  availability: false,
  createAppointment: false,
  cancelAppointment: false,
  rescheduleAppointment: false,
} as const;

const CRM_PROVIDER_ORDER = [
  CrmProvider.YCLIENTS,
  CrmProvider.ALTEGIO,
  CrmProvider.MOCK,
  CrmProvider.DIKIDI,
  CrmProvider.WHITELINES,
  CrmProvider.SALON_ONLINE,
] as const;

export const CRM_PROVIDER_CATALOG: Record<CrmProvider, CrmProviderCapability> =
  {
    [CrmProvider.YCLIENTS]: {
      provider: CrmProvider.YCLIENTS,
      name: 'YClients',
      implementationStatus: 'ready',
      connectable: true,
      productionReady: true,
      bookingMode: 'live_capable',
      requirements: { apiToken: true, companyId: true },
      operations: COMPLETE_OPERATIONS,
      limitations: [
        'Нужен user token владельца. Доступный филиал вы выберете на следующем шаге.',
      ],
    },
    [CrmProvider.ALTEGIO]: {
      provider: CrmProvider.ALTEGIO,
      name: 'Altegio',
      // Адаптер общий с YClients (это один продукт), адрес API свой. Но живьём
      // ни один салон на Altegio ещё не подключался, поэтому «проверено в бою»
      // не заявляем: обещание, которое некому подтвердить, дороже молчания.
      implementationStatus: 'ready',
      connectable: true,
      productionReady: false,
      bookingMode: 'live_capable',
      requirements: { apiToken: true, companyId: true },
      operations: COMPLETE_OPERATIONS,
      limitations: [
        'Нужен user token владельца. Перед запуском MAYA проверит доступные филиалы.',
        'Подключение Altegio ещё не проверялось на живом салоне — напишите нам, поможем на первом запуске.',
      ],
    },
    [CrmProvider.MOCK]: {
      provider: CrmProvider.MOCK,
      name: 'MAYA demo data',
      implementationStatus: 'development_only',
      connectable: true,
      productionReady: false,
      bookingMode: 'preview_only',
      requirements: { apiToken: false, companyId: false },
      operations: COMPLETE_OPERATIONS,
      limitations: [
        'Synthetic data for local development, tests and onboarding previews only.',
        'Must never be presented as a real external CRM connection.',
      ],
    },
    [CrmProvider.DIKIDI]: {
      provider: CrmProvider.DIKIDI,
      name: 'DIKIDI',
      implementationStatus: 'planned',
      connectable: false,
      productionReady: false,
      bookingMode: 'unavailable',
      requirements: { apiToken: false, companyId: false },
      operations: NO_OPERATIONS,
      limitations: [
        'Adapter scaffold exists, but real API calls are not implemented.',
      ],
    },
    [CrmProvider.WHITELINES]: {
      provider: CrmProvider.WHITELINES,
      name: 'Whitelines',
      implementationStatus: 'planned',
      connectable: false,
      productionReady: false,
      bookingMode: 'unavailable',
      requirements: { apiToken: false, companyId: false },
      operations: NO_OPERATIONS,
      limitations: [
        'Adapter scaffold exists, but real API calls are not implemented.',
      ],
    },
    [CrmProvider.SALON_ONLINE]: {
      provider: CrmProvider.SALON_ONLINE,
      name: 'Salon Online',
      implementationStatus: 'planned',
      connectable: false,
      productionReady: false,
      bookingMode: 'unavailable',
      requirements: { apiToken: false, companyId: false },
      operations: NO_OPERATIONS,
      limitations: [
        'Adapter scaffold exists, but real API calls are not implemented.',
      ],
    },
  };

export function listCrmProviderCapabilities(): CrmProviderCapability[] {
  return CRM_PROVIDER_ORDER.map((provider) => CRM_PROVIDER_CATALOG[provider]);
}

export function listConnectableCrmProviders(): CrmProvider[] {
  return listCrmProviderCapabilities()
    .filter((capability) => capability.connectable)
    .map((capability) => capability.provider);
}

export function getCrmProviderCapability(
  provider: CrmProvider,
): CrmProviderCapability {
  return CRM_PROVIDER_CATALOG[provider];
}
