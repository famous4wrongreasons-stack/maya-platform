import { CalendarSource } from '../common/domain.enums';
import type { IndustryPresetId } from '../common/industry-presets';
import type {
  AiOnboardingServiceItem,
  AiOnboardingWeeklyRule,
} from './ai-onboarding.types';

export const BUSINESS_TEMPLATE_IDS = [
  'solo_specialist',
  'service_team',
  'beauty_and_care',
  'barbershop',
  'clinic',
  'wellness',
  'education_and_consulting',
  'auto_service',
  'pet_services',
  'general_service',
] as const;

export type BusinessTemplateId = (typeof BUSINESS_TEMPLATE_IDS)[number];

export interface BusinessTemplateDefinition {
  id: BusinessTemplateId;
  name: string;
  description: string;
  industryPresetId: IndustryPresetId;
  calendarSource: CalendarSource;
  providerTitle: string;
  suggestedServices: readonly AiOnboardingServiceItem[];
  defaultWeeklyRules: readonly AiOnboardingWeeklyRule[];
}

const OFFICE_WEEK: readonly AiOnboardingWeeklyRule[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' }),
);
const SERVICE_WEEK: readonly AiOnboardingWeeklyRule[] = [1, 2, 3, 4, 5, 6].map(
  (weekday) => ({ weekday, startTime: '10:00', endTime: '20:00' }),
);

export const BUSINESS_TEMPLATES: Record<
  BusinessTemplateId,
  BusinessTemplateDefinition
> = {
  solo_specialist: template(
    'solo_specialist',
    'Частный специалист',
    'Один специалист со своим расписанием и услугами',
    'solo_specialist',
    'Специалист',
    [service('Консультация', 2000, 60)],
  ),
  service_team: template(
    'service_team',
    'Команда специалистов',
    'Универсальный шаблон для бизнеса с несколькими сотрудниками',
    'general_service',
    'Специалист',
    [service('Консультация', 2000, 60)],
  ),
  beauty_and_care: template(
    'beauty_and_care',
    'Красота и уход',
    'Студия, салон или команда мастеров красоты',
    'beauty_salon',
    'Мастер',
    [service('Консультация', 0, 30), service('Основная услуга', 2500, 60)],
    SERVICE_WEEK,
  ),
  barbershop: template(
    'barbershop',
    'Барбершоп',
    'Барберы, услуги и расписание точки',
    'barbershop',
    'Барбер',
    [
      service('Мужская стрижка', 1800, 60),
      service('Стрижка машинкой + фейд', 1200, 45),
      service('Удлинённая стрижка ножницами', 2000, 75),
      service('Детская стрижка', 1500, 60),
      service('Стрижка под насадку', 1000, 30),
      service('Окантовка', 800, 20),
      service('Моделирование бороды', 1000, 30),
      service('Гладкое бритьё лица', 1200, 45),
      service('Окантовка бороды', 800, 20),
      service('Тонирование бороды', 800, 30),
      service('Бритьё головы', 1500, 45),
      service('Тонирование головы', 1200, 30),
      service('Уход за кожей головы', 500, 20),
      service('Укладка', 600, 20),
      service('Spa для лица', 1200, 45),
      service('Скраб + чёрная маска', 800, 30),
      service('Восковая эпиляция (нос + уши)', 500, 15),
    ],
    SERVICE_WEEK,
  ),
  clinic: template(
    'clinic',
    'Клиника и здоровье',
    'Врачи, процедуры и расписание приемов',
    'dental_clinic',
    'Врач',
    [service('Первичный прием', 3000, 60)],
  ),
  wellness: template(
    'wellness',
    'Wellness и телесные практики',
    'Массаж, спа, йога и оздоровительные практики',
    'general_service',
    'Специалист',
    [service('Сеанс', 2500, 60)],
    SERVICE_WEEK,
  ),
  education_and_consulting: template(
    'education_and_consulting',
    'Обучение и консультации',
    'Репетиторы, наставники, преподаватели и консультанты',
    'education',
    'Преподаватель',
    [service('Индивидуальное занятие', 2000, 60)],
  ),
  auto_service: template(
    'auto_service',
    'Автосервис и детейлинг',
    'Работы, боксы и специалисты автомобильного сервиса',
    'auto_detailing',
    'Специалист',
    [service('Диагностика', 1500, 60), service('Основная работа', 5000, 120)],
  ),
  pet_services: template(
    'pet_services',
    'Услуги для животных',
    'Груминг, передержка и другие услуги для питомцев',
    'general_service',
    'Специалист',
    [service('Консультация', 1000, 30), service('Основная услуга', 2500, 90)],
    SERVICE_WEEK,
  ),
  general_service: template(
    'general_service',
    'Другой сервисный бизнес',
    'Гибкая основа для любого бизнеса, работающего по записи',
    'general_service',
    'Специалист',
    [service('Основная услуга', 2000, 60)],
  ),
};

export function getBusinessTemplate(
  id: string | null | undefined,
): BusinessTemplateDefinition {
  if (id && BUSINESS_TEMPLATE_IDS.includes(id as BusinessTemplateId)) {
    return BUSINESS_TEMPLATES[id as BusinessTemplateId];
  }

  return BUSINESS_TEMPLATES.general_service;
}

export function listBusinessTemplates(): BusinessTemplateDefinition[] {
  return BUSINESS_TEMPLATE_IDS.map((id) => BUSINESS_TEMPLATES[id]);
}

function template(
  id: BusinessTemplateId,
  name: string,
  description: string,
  industryPresetId: IndustryPresetId,
  providerTitle: string,
  suggestedServices: readonly AiOnboardingServiceItem[],
  defaultWeeklyRules: readonly AiOnboardingWeeklyRule[] = OFFICE_WEEK,
): BusinessTemplateDefinition {
  return {
    id,
    name,
    description,
    industryPresetId,
    calendarSource: CalendarSource.INTERNAL,
    providerTitle,
    suggestedServices,
    defaultWeeklyRules,
  };
}

function service(
  name: string,
  price: number,
  durationMinutes: number,
): AiOnboardingServiceItem {
  return { name, price, durationMinutes };
}
