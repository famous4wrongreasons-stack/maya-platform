import type { MayaFeatureKey } from './feature-catalog';

export const INDUSTRY_PRESET_IDS = [
  'general_service',
  'solo_specialist',
  'beauty_salon',
  'barbershop',
  'dental_clinic',
  'auto_detailing',
  'education',
] as const;

export type IndustryPresetId = (typeof INDUSTRY_PRESET_IDS)[number];

export interface IndustryTerminology {
  providerSingular: string;
  providerPlural: string;
  customerSingular: string;
  customerPlural: string;
  bookingSingular: string;
  bookingPlural: string;
  serviceSingular: string;
  servicePlural: string;
  locationSingular: string;
  locationPlural: string;
}

export interface IndustryPresetDefinition {
  id: IndustryPresetId;
  name: string;
  terminology: IndustryTerminology;
  defaultFeatures: readonly MayaFeatureKey[];
  defaultBookingSettings: {
    defaultDurationMinutes: number;
    minimumNoticeMinutes: number;
    cancellationWindowMinutes: number;
  };
  defaultAnalyticsWidgets: readonly string[];
}

export const DEFAULT_INDUSTRY_PRESET_ID: IndustryPresetId = 'general_service';

const commonFeatures = [
  'booking.public',
  'booking.customer_app',
  'customers.core',
  'notifications.core',
  'customer.portal',
  'branding.custom',
] as const satisfies readonly MayaFeatureKey[];

const externalBusinessFeatures = [
  ...commonFeatures,
  'calendar.external',
  'crm.integration',
] as const satisfies readonly MayaFeatureKey[];

const commonAnalytics = [
  'revenue',
  'bookings',
  'new_customers',
  'return_rate',
] as const;

function definePreset(
  id: IndustryPresetId,
  name: string,
  terminology: IndustryTerminology,
  options: {
    defaultFeatures?: readonly MayaFeatureKey[];
    defaultDurationMinutes?: number;
    minimumNoticeMinutes?: number;
    cancellationWindowMinutes?: number;
    defaultAnalyticsWidgets?: readonly string[];
  } = {},
): IndustryPresetDefinition {
  return {
    id,
    name,
    terminology,
    defaultFeatures: options.defaultFeatures ?? commonFeatures,
    defaultBookingSettings: {
      defaultDurationMinutes: options.defaultDurationMinutes ?? 60,
      minimumNoticeMinutes: options.minimumNoticeMinutes ?? 120,
      cancellationWindowMinutes: options.cancellationWindowMinutes ?? 24 * 60,
    },
    defaultAnalyticsWidgets: options.defaultAnalyticsWidgets ?? commonAnalytics,
  };
}

export const MAYA_INDUSTRY_PRESETS: Record<
  IndustryPresetId,
  IndustryPresetDefinition
> = {
  general_service: definePreset('general_service', 'Сервисный бизнес', {
    providerSingular: 'Специалист',
    providerPlural: 'Специалисты',
    customerSingular: 'Клиент',
    customerPlural: 'Клиенты',
    bookingSingular: 'Запись',
    bookingPlural: 'Записи',
    serviceSingular: 'Услуга',
    servicePlural: 'Услуги',
    locationSingular: 'Локация',
    locationPlural: 'Локации',
  }),
  solo_specialist: definePreset(
    'solo_specialist',
    'Частный специалист',
    {
      providerSingular: 'Специалист',
      providerPlural: 'Специалисты',
      customerSingular: 'Клиент',
      customerPlural: 'Клиенты',
      bookingSingular: 'Запись',
      bookingPlural: 'Записи',
      serviceSingular: 'Услуга',
      servicePlural: 'Услуги',
      locationSingular: 'Рабочее место',
      locationPlural: 'Рабочие места',
    },
    {
      defaultFeatures: [
        ...commonFeatures,
        'calendar.internal',
        'expenses.core',
        'analytics.solo',
      ],
      defaultAnalyticsWidgets: [...commonAnalytics, 'expenses', 'net_profit'],
    },
  ),
  beauty_salon: definePreset(
    'beauty_salon',
    'Салон красоты',
    {
      providerSingular: 'Мастер',
      providerPlural: 'Мастера',
      customerSingular: 'Клиент',
      customerPlural: 'Клиенты',
      bookingSingular: 'Запись',
      bookingPlural: 'Записи',
      serviceSingular: 'Услуга',
      servicePlural: 'Услуги',
      locationSingular: 'Салон',
      locationPlural: 'Салоны',
    },
    { defaultFeatures: externalBusinessFeatures },
  ),
  barbershop: definePreset(
    'barbershop',
    'Барбершоп',
    {
      providerSingular: 'Барбер',
      providerPlural: 'Барберы',
      customerSingular: 'Клиент',
      customerPlural: 'Клиенты',
      bookingSingular: 'Запись',
      bookingPlural: 'Записи',
      serviceSingular: 'Услуга',
      servicePlural: 'Услуги',
      locationSingular: 'Барбершоп',
      locationPlural: 'Барбершопы',
    },
    { defaultFeatures: externalBusinessFeatures },
  ),
  dental_clinic: definePreset(
    'dental_clinic',
    'Стоматология или клиника',
    {
      providerSingular: 'Врач',
      providerPlural: 'Врачи',
      customerSingular: 'Пациент',
      customerPlural: 'Пациенты',
      bookingSingular: 'Приём',
      bookingPlural: 'Приёмы',
      serviceSingular: 'Процедура',
      servicePlural: 'Процедуры',
      locationSingular: 'Клиника',
      locationPlural: 'Клиники',
    },
    { defaultFeatures: externalBusinessFeatures, minimumNoticeMinutes: 240 },
  ),
  auto_detailing: definePreset(
    'auto_detailing',
    'Автосервис или детейлинг',
    {
      providerSingular: 'Специалист',
      providerPlural: 'Специалисты',
      customerSingular: 'Клиент',
      customerPlural: 'Клиенты',
      bookingSingular: 'Заказ',
      bookingPlural: 'Заказы',
      serviceSingular: 'Работа',
      servicePlural: 'Работы',
      locationSingular: 'Сервисный центр',
      locationPlural: 'Сервисные центры',
    },
    {
      defaultFeatures: externalBusinessFeatures,
      defaultDurationMinutes: 120,
    },
  ),
  education: definePreset(
    'education',
    'Обучение и консультации',
    {
      providerSingular: 'Преподаватель',
      providerPlural: 'Преподаватели',
      customerSingular: 'Ученик',
      customerPlural: 'Ученики',
      bookingSingular: 'Занятие',
      bookingPlural: 'Занятия',
      serviceSingular: 'Программа',
      servicePlural: 'Программы',
      locationSingular: 'Учебный центр',
      locationPlural: 'Учебные центры',
    },
    { defaultFeatures: externalBusinessFeatures },
  ),
};

export function isIndustryPresetId(value: unknown): value is IndustryPresetId {
  return (
    typeof value === 'string' &&
    INDUSTRY_PRESET_IDS.includes(value as IndustryPresetId)
  );
}

export function getIndustryPreset(
  id: string | null | undefined,
): IndustryPresetDefinition {
  return MAYA_INDUSTRY_PRESETS[
    isIndustryPresetId(id) ? id : DEFAULT_INDUSTRY_PRESET_ID
  ];
}

export function listIndustryPresets(): IndustryPresetDefinition[] {
  return INDUSTRY_PRESET_IDS.map((id) => MAYA_INDUSTRY_PRESETS[id]);
}
