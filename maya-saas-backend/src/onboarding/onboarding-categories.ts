import type { IndustryPresetId } from '../common/industry-presets';
import type { AiOnboardingServiceItem } from './ai-onboarding.types';
import {
  BUSINESS_TEMPLATES,
  type BusinessTemplateId,
} from './business-templates';

export const ONBOARDING_WORK_MODES = ['solo', 'business'] as const;
export type AiOnboardingWorkMode = (typeof ONBOARDING_WORK_MODES)[number];

export const ONBOARDING_CATEGORY_IDS = [
  'solo_barber',
  'solo_hairdresser',
  'solo_nail_master',
  'solo_cosmetologist',
  'solo_massage_therapist',
  'solo_fitness_trainer',
  'solo_dentist',
  'solo_lawyer',
  'solo_psychologist',
  'solo_tutor',
  'solo_photographer',
  'solo_groomer',
  'solo_other',
  'business_barbershop',
  'business_beauty_salon',
  'business_nail_studio',
  'business_cosmetology',
  'business_dentistry',
  'business_fitness',
  'business_massage_spa',
  'business_auto_service',
  'business_detailing',
  'business_pet_services',
  'business_education',
  'business_legal',
  'business_other',
] as const;

export type AiOnboardingCategoryId = (typeof ONBOARDING_CATEGORY_IDS)[number];

export interface OnboardingCategoryDefinition {
  id: AiOnboardingCategoryId;
  workMode: AiOnboardingWorkMode;
  label: string;
  selectionMessage: string;
  templateId: BusinessTemplateId;
  industryPresetId: IndustryPresetId;
  providerTitle: string;
  suggestedServices: readonly AiOnboardingServiceItem[];
  signals: RegExp;
}

const services = (
  ...items: readonly [name: string, durationMinutes: number][]
): readonly AiOnboardingServiceItem[] =>
  items.map(([name, durationMinutes]) => ({
    name,
    price: 0,
    durationMinutes,
  }));

const BARBER_SERVICES = BUSINESS_TEMPLATES.barbershop.suggestedServices;

const HAIR_SERVICES = services(
  ['Стрижка', 60],
  ['Окрашивание волос', 120],
  ['Укладка', 45],
  ['Уход за волосами', 60],
  ['Причёска', 90],
);

const NAIL_SERVICES = services(
  ['Маникюр', 60],
  ['Маникюр с покрытием', 120],
  ['Снятие покрытия', 30],
  ['Педикюр', 90],
  ['Укрепление ногтей', 30],
  ['Дизайн ногтей', 30],
);

const COSMETOLOGY_SERVICES = services(
  ['Консультация', 30],
  ['Уход за лицом', 60],
  ['Чистка лица', 90],
  ['Пилинг', 60],
  ['Массаж лица', 60],
);

const MASSAGE_SERVICES = services(
  ['Классический массаж', 60],
  ['Массаж спины', 45],
  ['Спортивный массаж', 60],
  ['Лимфодренажный массаж', 60],
);

const FITNESS_SERVICES = services(
  ['Первичная консультация', 30],
  ['Персональная тренировка', 60],
  ['Парная тренировка', 60],
  ['Составление программы тренировок', 60],
  ['Онлайн-тренировка', 60],
);

const DENTAL_SERVICES = services(
  ['Первичный приём стоматолога', 60],
  ['Повторный приём стоматолога', 45],
  ['Профессиональная гигиена полости рта', 60],
  ['Лечение кариеса', 90],
);

const LEGAL_SERVICES = services(
  ['Первичная консультация', 60],
  ['Письменная консультация', 60],
  ['Анализ документов', 60],
  ['Подготовка документов', 120],
  ['Представительство', 120],
);

const PSYCHOLOGY_SERVICES = services(
  ['Первая встреча', 50],
  ['Индивидуальная консультация', 50],
  ['Семейная консультация', 80],
  ['Онлайн-консультация', 50],
);

const TUTOR_SERVICES = services(
  ['Пробное занятие', 45],
  ['Индивидуальное занятие', 60],
  ['Парное занятие', 60],
  ['Групповое занятие', 90],
  ['Подготовка к экзамену', 90],
);

const PHOTO_SERVICES = services(
  ['Консультация перед съёмкой', 30],
  ['Индивидуальная фотосессия', 60],
  ['Семейная фотосессия', 90],
  ['Контент-съёмка', 120],
  ['Репортажная съёмка', 120],
);

const GROOMING_SERVICES = services(
  ['Гигиенический комплекс', 90],
  ['Комплекс со стрижкой', 120],
  ['Мытьё и вычёсывание', 90],
  ['Стрижка когтей', 20],
  ['Экспресс-линька', 90],
);

const BEAUTY_SALON_SERVICES = services(
  ['Стрижка', 60],
  ['Окрашивание волос', 120],
  ['Укладка', 45],
  ['Уход за волосами', 60],
  ['Маникюр', 60],
  ['Педикюр', 90],
  ['Оформление бровей', 45],
  ['Ламинирование ресниц', 75],
);

const DENTISTRY_SERVICES = services(
  ['Первичный приём стоматолога', 60],
  ['Профессиональная гигиена полости рта', 60],
  ['Лечение кариеса', 90],
  ['Консультация стоматолога-хирурга', 60],
  ['Консультация ортодонта', 60],
  ['Консультация стоматолога-ортопеда', 60],
);

const AUTO_SERVICE_SERVICES = services(
  ['Диагностика автомобиля', 60],
  ['Техническое обслуживание', 120],
  ['Замена масла и фильтров', 60],
  ['Обслуживание тормозной системы', 120],
  ['Ремонт ходовой части', 180],
  ['Шиномонтаж', 60],
);

const DETAILING_SERVICES = services(
  ['Комплексная мойка', 90],
  ['Химчистка салона', 240],
  ['Полировка кузова', 240],
  ['Защитное покрытие кузова', 240],
  ['Полировка фар', 90],
  ['Детейлинг салона', 180],
);

const EDUCATION_SERVICES = services(
  ['Пробное занятие', 45],
  ['Индивидуальное занятие', 60],
  ['Групповое занятие', 90],
  ['Онлайн-занятие', 60],
  ['Подготовка к экзамену', 90],
);

function category(
  definition: OnboardingCategoryDefinition,
): OnboardingCategoryDefinition {
  return definition;
}

export const ONBOARDING_CATEGORIES: Record<
  AiOnboardingCategoryId,
  OnboardingCategoryDefinition
> = {
  solo_barber: category({
    id: 'solo_barber',
    workMode: 'solo',
    label: 'Барбер',
    selectionMessage: 'Я работаю барбером',
    templateId: 'barbershop',
    industryPresetId: 'barbershop',
    providerTitle: 'Барбер',
    suggestedServices: BARBER_SERVICES,
    signals: /(?:барбер|мужск(?:ой|ая)\s+парикмахер|стриг[уа]\s+мужчин)/iu,
  }),
  solo_hairdresser: category({
    id: 'solo_hairdresser',
    workMode: 'solo',
    label: 'Парикмахер',
    selectionMessage: 'Я работаю парикмахером',
    templateId: 'beauty_and_care',
    industryPresetId: 'beauty_salon',
    providerTitle: 'Парикмахер',
    suggestedServices: HAIR_SERVICES,
    signals: /(?:парикмахер|стилист\s+по\s+волос|колорист)/iu,
  }),
  solo_nail_master: category({
    id: 'solo_nail_master',
    workMode: 'solo',
    label: 'Мастер ногтей',
    selectionMessage: 'Я мастер маникюра и педикюра',
    templateId: 'beauty_and_care',
    industryPresetId: 'beauty_salon',
    providerTitle: 'Мастер ногтевого сервиса',
    suggestedServices: NAIL_SERVICES,
    signals: /(?:маникюр|педикюр|ногт(?:евой|и)|нейл)/iu,
  }),
  solo_cosmetologist: category({
    id: 'solo_cosmetologist',
    workMode: 'solo',
    label: 'Косметолог',
    selectionMessage: 'Я работаю косметологом',
    templateId: 'beauty_and_care',
    industryPresetId: 'beauty_salon',
    providerTitle: 'Косметолог',
    suggestedServices: COSMETOLOGY_SERVICES,
    signals: /(?:косметолог|эстетист|уход\s+за\s+лицом)/iu,
  }),
  solo_massage_therapist: category({
    id: 'solo_massage_therapist',
    workMode: 'solo',
    label: 'Массажист',
    selectionMessage: 'Я работаю массажистом',
    templateId: 'wellness',
    industryPresetId: 'general_service',
    providerTitle: 'Массажист',
    suggestedServices: MASSAGE_SERVICES,
    signals: /(?:массажист|массаж|делаю\s+массаж|телесн(?:ый|ая)\s+практик)/iu,
  }),
  solo_fitness_trainer: category({
    id: 'solo_fitness_trainer',
    workMode: 'solo',
    label: 'Тренер',
    selectionMessage: 'Я фитнес-тренер',
    templateId: 'wellness',
    industryPresetId: 'general_service',
    providerTitle: 'Тренер',
    suggestedServices: FITNESS_SERVICES,
    signals:
      /(?:фитнес[-\s]?тренер|персональн(?:ый|ая)\s+тренер|тренирую|качаю\s+людей)/iu,
  }),
  solo_dentist: category({
    id: 'solo_dentist',
    workMode: 'solo',
    label: 'Стоматолог',
    selectionMessage: 'Я врач-стоматолог',
    templateId: 'clinic',
    industryPresetId: 'dental_clinic',
    providerTitle: 'Врач-стоматолог',
    suggestedServices: DENTAL_SERVICES,
    signals: /(?:стоматолог|зубн(?:ой|ая)\s+врач|лечу\s+зуб)/iu,
  }),
  solo_lawyer: category({
    id: 'solo_lawyer',
    workMode: 'solo',
    label: 'Юрист / адвокат',
    selectionMessage: 'Я юрист или адвокат',
    templateId: 'education_and_consulting',
    industryPresetId: 'general_service',
    providerTitle: 'Юрист',
    suggestedServices: LEGAL_SERVICES,
    signals: /(?:адвокат|юрист|правов(?:ая|ые)\s+(?:помощь|услуг))/iu,
  }),
  solo_psychologist: category({
    id: 'solo_psychologist',
    workMode: 'solo',
    label: 'Психолог',
    selectionMessage: 'Я психолог',
    templateId: 'education_and_consulting',
    industryPresetId: 'general_service',
    providerTitle: 'Психолог',
    suggestedServices: PSYCHOLOGY_SERVICES,
    signals: /(?:психолог|психотерапевт|семейн(?:ый|ая)\s+консультант)/iu,
  }),
  solo_tutor: category({
    id: 'solo_tutor',
    workMode: 'solo',
    label: 'Репетитор',
    selectionMessage: 'Я репетитор или преподаватель',
    templateId: 'education_and_consulting',
    industryPresetId: 'education',
    providerTitle: 'Преподаватель',
    suggestedServices: TUTOR_SERVICES,
    signals:
      /(?:репетитор|преподавател|даю\s+уроки|готовлю\s+к\s+(?:егэ|огэ|экзамен))/iu,
  }),
  solo_photographer: category({
    id: 'solo_photographer',
    workMode: 'solo',
    label: 'Фотограф',
    selectionMessage: 'Я фотограф',
    templateId: 'general_service',
    industryPresetId: 'general_service',
    providerTitle: 'Фотограф',
    suggestedServices: PHOTO_SERVICES,
    signals: /(?:фотограф|фотосъ[её]м|снимаю\s+(?:людей|контент|мероприят))/iu,
  }),
  solo_groomer: category({
    id: 'solo_groomer',
    workMode: 'solo',
    label: 'Грумер',
    selectionMessage: 'Я грумер',
    templateId: 'pet_services',
    industryPresetId: 'general_service',
    providerTitle: 'Грумер',
    suggestedServices: GROOMING_SERVICES,
    signals: /(?:грумер|груминг|стриг[уа]\s+(?:собак|кошек|питомцев))/iu,
  }),
  solo_other: category({
    id: 'solo_other',
    workMode: 'solo',
    label: 'Другая профессия',
    selectionMessage: 'У меня другая профессия',
    templateId: 'solo_specialist',
    industryPresetId: 'solo_specialist',
    providerTitle: 'Специалист',
    suggestedServices: [],
    signals: /другая\s+профессия|другой\s+специалист/iu,
  }),
  business_barbershop: category({
    id: 'business_barbershop',
    workMode: 'business',
    label: 'Барбершоп',
    selectionMessage: 'У меня барбершоп',
    templateId: 'barbershop',
    industryPresetId: 'barbershop',
    providerTitle: 'Барбер',
    suggestedServices: BARBER_SERVICES,
    signals: /(?:барбершоп|мужск(?:ая|ой)\s+парикмахерск)/iu,
  }),
  business_beauty_salon: category({
    id: 'business_beauty_salon',
    workMode: 'business',
    label: 'Салон красоты',
    selectionMessage: 'У меня салон красоты',
    templateId: 'beauty_and_care',
    industryPresetId: 'beauty_salon',
    providerTitle: 'Мастер',
    suggestedServices: BEAUTY_SALON_SERVICES,
    signals: /(?:салон\s+красоты|бьюти[-\s]?салон|студия\s+красоты)/iu,
  }),
  business_nail_studio: category({
    id: 'business_nail_studio',
    workMode: 'business',
    label: 'Студия ногтей',
    selectionMessage: 'У меня студия маникюра и педикюра',
    templateId: 'beauty_and_care',
    industryPresetId: 'beauty_salon',
    providerTitle: 'Мастер ногтевого сервиса',
    suggestedServices: NAIL_SERVICES,
    signals:
      /(?:студия\s+(?:маникюра|ногтей)|нейл[-\s]?студия|маникюрн(?:ый|ая)\s+салон)/iu,
  }),
  business_cosmetology: category({
    id: 'business_cosmetology',
    workMode: 'business',
    label: 'Косметология',
    selectionMessage: 'У меня косметология',
    templateId: 'beauty_and_care',
    industryPresetId: 'beauty_salon',
    providerTitle: 'Косметолог',
    suggestedServices: COSMETOLOGY_SERVICES,
    signals: /(?:косметолог(?:ия|ическ)|студия\s+ухода\s+за\s+лицом)/iu,
  }),
  business_dentistry: category({
    id: 'business_dentistry',
    workMode: 'business',
    label: 'Стоматология',
    selectionMessage: 'У меня стоматология',
    templateId: 'clinic',
    industryPresetId: 'dental_clinic',
    providerTitle: 'Врач-стоматолог',
    suggestedServices: DENTISTRY_SERVICES,
    signals: /(?:стоматолог(?:ия|ическ)|зубн(?:ая|ой)\s+клиник)/iu,
  }),
  business_fitness: category({
    id: 'business_fitness',
    workMode: 'business',
    label: 'Фитнес',
    selectionMessage: 'У меня фитнес-студия или клуб',
    templateId: 'wellness',
    industryPresetId: 'general_service',
    providerTitle: 'Тренер',
    suggestedServices: FITNESS_SERVICES,
    signals:
      /(?:фитнес[-\s]?(?:клуб|студия|зал)|тренаж[её]рн(?:ый|ого)\s+зал)/iu,
  }),
  business_massage_spa: category({
    id: 'business_massage_spa',
    workMode: 'business',
    label: 'Массаж / SPA',
    selectionMessage: 'У меня студия массажа или SPA',
    templateId: 'wellness',
    industryPresetId: 'general_service',
    providerTitle: 'Массажист',
    suggestedServices: MASSAGE_SERVICES,
    signals:
      /(?:студия\s+массажа|массажн(?:ый|ая)\s+салон|spa|спа[-\s]?(?:центр|салон))/iu,
  }),
  business_auto_service: category({
    id: 'business_auto_service',
    workMode: 'business',
    label: 'Автосервис',
    selectionMessage: 'У меня автосервис',
    templateId: 'auto_service',
    industryPresetId: 'auto_detailing',
    providerTitle: 'Автомеханик',
    suggestedServices: AUTO_SERVICE_SERVICES,
    signals:
      /(?:автосервис|сто\b|ремонт\s+(?:машин|автомобил)|шиномонтаж|чиним\s+(?:машины|тачки)|возимся\s+с\s+(?:машинами|тачками)|движ\s+(?:с|про)\s+тачк)/iu,
  }),
  business_detailing: category({
    id: 'business_detailing',
    workMode: 'business',
    label: 'Детейлинг',
    selectionMessage: 'У меня детейлинг-студия',
    templateId: 'auto_service',
    industryPresetId: 'auto_detailing',
    providerTitle: 'Детейлер',
    suggestedServices: DETAILING_SERVICES,
    signals:
      /(?:детейлинг|детейлер|полировк(?:а|ой)\s+(?:кузова|авто)|химчистк(?:а|ой)\s+салона)/iu,
  }),
  business_pet_services: category({
    id: 'business_pet_services',
    workMode: 'business',
    label: 'Груминг / зоосалон',
    selectionMessage: 'У меня груминг-салон или зоосалон',
    templateId: 'pet_services',
    industryPresetId: 'general_service',
    providerTitle: 'Грумер',
    suggestedServices: GROOMING_SERVICES,
    signals:
      /(?:груминг[-\s]?салон|зоосалон|услуги\s+для\s+(?:животных|питомцев))/iu,
  }),
  business_education: category({
    id: 'business_education',
    workMode: 'business',
    label: 'Обучение',
    selectionMessage: 'У меня учебный центр или школа',
    templateId: 'education_and_consulting',
    industryPresetId: 'education',
    providerTitle: 'Преподаватель',
    suggestedServices: EDUCATION_SERVICES,
    signals:
      /(?:учебн(?:ый|ого)\s+центр|языков(?:ая|ой)\s+школ|онлайн[-\s]?школ|образовательн(?:ый|ая)\s+центр)/iu,
  }),
  business_legal: category({
    id: 'business_legal',
    workMode: 'business',
    label: 'Юридическая компания',
    selectionMessage: 'У меня юридическая компания',
    templateId: 'education_and_consulting',
    industryPresetId: 'general_service',
    providerTitle: 'Юрист',
    suggestedServices: LEGAL_SERVICES,
    signals:
      /(?:юридическ(?:ая|ое)\s+(?:компания|бюро|агентство)|адвокатск(?:ое|ая)\s+(?:бюро|контора))/iu,
  }),
  business_other: category({
    id: 'business_other',
    workMode: 'business',
    label: 'Другой бизнес',
    selectionMessage: 'У меня другой сервисный бизнес',
    templateId: 'general_service',
    industryPresetId: 'general_service',
    providerTitle: 'Специалист',
    suggestedServices: [],
    signals: /другой\s+(?:бизнес|сервис)/iu,
  }),
};

export function listOnboardingCategories(
  workMode?: AiOnboardingWorkMode,
): OnboardingCategoryDefinition[] {
  return ONBOARDING_CATEGORY_IDS.map((id) => ONBOARDING_CATEGORIES[id]).filter(
    (item) => !workMode || item.workMode === workMode,
  );
}

export function getOnboardingCategory(
  id: string | null | undefined,
): OnboardingCategoryDefinition | null {
  return id && ONBOARDING_CATEGORY_IDS.includes(id as AiOnboardingCategoryId)
    ? ONBOARDING_CATEGORIES[id as AiOnboardingCategoryId]
    : null;
}

export function detectOnboardingCategory(
  message: string,
  workMode: AiOnboardingWorkMode,
): OnboardingCategoryDefinition | null {
  return (
    listOnboardingCategories(workMode).find((item) =>
      item.signals.test(message),
    ) ?? null
  );
}
