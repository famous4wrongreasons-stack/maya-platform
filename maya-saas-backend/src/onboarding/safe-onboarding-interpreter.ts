import { Injectable } from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import type {
  AiOnboardingBlueprint,
  AiOnboardingInterpretation,
  AiOnboardingMissingField,
  AiOnboardingQuickReply,
  AiOnboardingServiceItem,
  AiOnboardingWeeklyRule,
} from './ai-onboarding.types';
import {
  getBusinessTemplate,
  type BusinessTemplateId,
} from './business-templates';

const TEMPLATE_SIGNALS: readonly [BusinessTemplateId, RegExp][] = [
  ['barbershop', /(барбершоп|барбер|парикмах|мужск(?:ая|ие) стрижк|бород)/iu],
  [
    'beauty_and_care',
    /(салон красоты|маникюр|ногт|бров|ресниц|косметолог|визаж|мейкап)/iu,
  ],
  ['clinic', /(клиник|стоматолог|врач|пациент|медицин|лечу зуб|зубн)/iu],
  ['wellness', /(массаж|спа|spa|йог|телесн|wellness|массажк)/iu],
  [
    'education_and_consulting',
    /(репетитор|обучен|урок|заняти|консульт|коуч)/iu,
  ],
  [
    'auto_service',
    /(автосервис|детейлинг|автомоб|шиномонтаж|мойк|тачк|машин)/iu,
  ],
  ['pet_services', /(груминг|грумер|зоосалон|питом|собак|кошк|ветеринар)/iu],
];

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  двое: 2,
  три: 3,
  трое: 3,
  четыре: 4,
  четверо: 4,
  пять: 5,
  пятеро: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
};

const AMBIGUOUS_SHORT_REPLY =
  /^(?:ага|да|нет|неа|ок|окей|понял[а]?|ясно|хз|незнаю|не\s+знаю|может|наверное|дальше|готово|го|погнали)$/iu;

const NO_FORMAL_BUSINESS_NAME_PATTERN =
  /(?:никак\s+(?:не\s+)?называ(?:ется|юсь|емся)?|(?:отдельн(?:ого|ое)\s+)?названи(?:я|е)\s+(?:нет|не\s+нужно)|нет\s+(?:отдельного\s+)?названия|без\s+(?:отдельного\s+)?названия|работаю\s+(?:просто\s+)?под\s+(?:своим\s+)?именем|(?:клиент[а-яё]*|гости|все)\s+(?:меня\s+)?знают(?:\s+меня)?\s+как)/iu;

export function hasNoFormalBusinessNameSignal(value: string): boolean {
  return NO_FORMAL_BUSINESS_NAME_PATTERN.test(value);
}

@Injectable()
export class SafeOnboardingInterpreter {
  interpret(
    message: string,
    previous?: AiOnboardingBlueprint,
    preferredTemplateId?: string,
  ): AiOnboardingInterpretation {
    const normalized = message.trim();
    const previousServices = previous?.services ?? [];
    const expectsBusinessName = !previous?.businessName?.trim();
    const expectsServices = previousServices.length === 0;
    const hasServiceIntro = this.hasServiceIntro(normalized);
    const extractedBusinessName = this.extractBusinessName(
      normalized,
      Boolean(previous) &&
        expectsBusinessName &&
        !hasServiceIntro &&
        !this.hasServiceFacts(normalized) &&
        !this.looksLikeServiceList(normalized),
    );
    const needsPersonalDisplayName =
      expectsBusinessName &&
      hasNoFormalBusinessNameSignal(normalized) &&
      !extractedBusinessName;
    const templateId = preferredTemplateId
      ? getBusinessTemplate(preferredTemplateId).id
      : this.detectTemplate(normalized, previous?.templateId);
    const template = getBusinessTemplate(templateId);
    const detectedSchedule = this.extractSchedule(normalized);
    const blueprint: AiOnboardingBlueprint = {
      templateId: template.id,
      businessName: extractedBusinessName ?? previous?.businessName ?? null,
      summary: previous?.summary ?? template.description,
      industryPresetId: template.industryPresetId,
      calendarSource: this.detectCalendarSource(
        normalized,
        previous?.calendarSource ?? template.calendarSource,
      ),
      providerCount:
        this.extractProviderCount(normalized) ??
        previous?.providerCount ??
        (template.id === 'solo_specialist' ? 1 : null),
      providerTitle: template.providerTitle,
      services: this.shouldUseTemplateServices(normalized, expectsServices)
        ? template.suggestedServices.map((service) => ({ ...service }))
        : this.extractServices(normalized, previousServices, {
            allowLoose:
              expectsServices && (Boolean(previous) || hasServiceIntro),
            businessName: extractedBusinessName,
          }),
      weeklyRules:
        detectedSchedule ??
        previous?.weeklyRules ??
        template.defaultWeeklyRules.map((rule) => ({ ...rule })),
      scheduleAssumed: detectedSchedule
        ? false
        : (previous?.scheduleAssumed ?? true),
    };
    const missingFields = this.getMissingFields(blueprint);
    const madeProgress = this.hasProgress(previous, blueprint);
    const needsClarification =
      needsPersonalDisplayName ||
      (AMBIGUOUS_SHORT_REPLY.test(normalized) && !madeProgress);
    const confidence = needsClarification
      ? 0.3
      : madeProgress
        ? 0.88
        : missingFields.length === 0
          ? 0.86
          : 0.62;

    return {
      blueprint,
      missingFields,
      assistantMessage: this.buildAssistantMessage(
        blueprint,
        missingFields,
        needsClarification,
        needsPersonalDisplayName,
      ),
      confidence,
      needsClarification,
      quickReplies: this.buildQuickReplies(
        blueprint,
        missingFields,
        needsPersonalDisplayName,
      ),
      source: 'safe_fallback',
    };
  }

  private detectTemplate(
    message: string,
    previousTemplateId?: string,
  ): BusinessTemplateId {
    const match = TEMPLATE_SIGNALS.find(([, pattern]) => pattern.test(message));
    if (match) {
      return match[0];
    }

    if (previousTemplateId) {
      return getBusinessTemplate(previousTemplateId).id;
    }

    if (
      /(самозанят|частн|работаю один|работаю одна|я один|я одна)/iu.test(
        message,
      )
    ) {
      return 'solo_specialist';
    }

    if (/(команд|сотрудник|специалист|мастер)/iu.test(message)) {
      return 'service_team';
    }

    return 'general_service';
  }

  private detectCalendarSource(
    message: string,
    fallback: CalendarSource,
  ): CalendarSource {
    if (
      /(без crm|без срм|без црм|сво[её]й crm нет|календарь maya|внутри maya|внутри майи)/iu.test(
        message,
      )
    ) {
      return CalendarSource.INTERNAL;
    }

    if (
      /(yclients|y clients|ю?клиентс|уклиентс|ал(ь)?тегио|dikidi|ди(ки|ги)ди|crm|срм|црм)/iu.test(
        message,
      )
    ) {
      return CalendarSource.EXTERNAL;
    }

    return fallback;
  }

  private extractBusinessName(
    message: string,
    allowStandalone = false,
  ): string | null {
    const patterns = [
      /(?:бизнес|компания|студия|салон|барбершоп|проект|бренд)\s+(?:называется|называем|будет называться)\s+[«"']?([^»"'.,;\n]{2,80})/iu,
      /название\s*(?:(?:моего|нашего)\s+)?(?:(?:бизнеса|компании|студии|салона|барбершопа|проекта|бренда)\s*)?(?::|[-–—]|это)?\s*[«"']?([^»"'.,;\n]{2,80})/iu,
      /(?:^|[.!?]\s*)(?:называется|назовем|назовём|назову|будет называться)\s+[«"']?([^»"'.,;\n]{2,80})/iu,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        return this.cleanBusinessName(match[1]);
      }
    }

    if (hasNoFormalBusinessNameSignal(message)) {
      const personalName = this.extractPersonalBrandName(message);
      if (personalName) {
        return personalName;
      }
      return null;
    }

    if (allowStandalone) {
      const candidate = message.split(/[,.!?;\n]+/u)[0]?.trim() ?? '';
      if (
        candidate.length >= 2 &&
        candidate.length <= 80 &&
        candidate.split(/\s+/u).length <= 8 &&
        !/\d/u.test(candidate) &&
        !/^(?:я|мы|у\s+меня|у\s+нас|работаю|работаем|занимаюсь|занимаемся|делаю|делаем|оказываю|оказываем)\b/iu.test(
          candidate,
        ) &&
        !AMBIGUOUS_SHORT_REPLY.test(candidate)
      ) {
        return this.cleanBusinessName(candidate);
      }
    }

    return null;
  }

  private extractPersonalBrandName(message: string): string | null {
    const patterns = [
      /(?:меня\s+зовут|зовут\s+меня)\s+[«"']?([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'-]{1,39})/iu,
      /(?:клиент[а-яё]*|гости|все)\s+(?:меня\s+)?знают(?:\s+меня)?\s+как\s+[«"']?([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'-]{1,39})/iu,
      /(?:работаю|принимаю)\s+под\s+(?:своим\s+)?именем\s+[«"']?([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'-]{1,39})/iu,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        const cleaned = this.cleanBusinessName(match[1]);
        return `${cleaned.charAt(0).toLocaleUpperCase('ru-RU')}${cleaned.slice(1)}`;
      }
    }

    return null;
  }

  private cleanBusinessName(value: string): string {
    return value
      .replace(/^[«"']+|[»"']+$/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  private extractProviderCount(message: string): number | null {
    const digitMatch = message.match(
      /\b(\d{1,2})\s+(?:мастер|барбер|врач|специалист|сотрудник|преподавател)/iu,
    );
    if (digitMatch?.[1]) {
      return this.clampProviderCount(Number(digitMatch[1]));
    }

    const wordMatch = message.match(
      /(один|одна|два|две|двое|три|трое|четыре|четверо|пять|пятеро|шесть|семь|восемь|девять|десять)\s+(?:мастер|барбер|врач|специалист|сотрудник|преподавател)/iu,
    );
    if (wordMatch?.[1]) {
      return NUMBER_WORDS[wordMatch[1].toLowerCase()] ?? null;
    }

    const teamWordMatch = message.match(
      /(?:нас|работаем)\s+(двое|трое|четверо|пятеро)/iu,
    );
    if (teamWordMatch?.[1]) {
      return NUMBER_WORDS[teamWordMatch[1].toLowerCase()] ?? null;
    }

    if (
      /(работаю один|работаю одна|я один|я одна|без сотрудников|сам(?:а)? на себя|я соло|работаю соло|в одного|один справляюсь|снимаю\s+(?:одно\s+)?кресло|арендую\s+(?:одно\s+)?кресло|работаю\s+на\s+арендованном\s+кресле)/iu.test(
        message,
      )
    ) {
      return 1;
    }

    const standalone = message
      .trim()
      .toLocaleLowerCase('ru-RU')
      .replace(/[.!?]+$/gu, '');
    if (NUMBER_WORDS[standalone]) {
      return NUMBER_WORDS[standalone];
    }
    if (/^\d{1,2}$/u.test(standalone)) {
      return this.clampProviderCount(Number(standalone));
    }

    return null;
  }

  private extractServices(
    message: string,
    previous: AiOnboardingServiceItem[],
    context: { allowLoose: boolean; businessName: string | null },
  ): AiOnboardingServiceItem[] {
    const explicitSection = message.match(
      /услуг(?:а|и)?(?:\s+(?:это|такие|включают|включают\s+в\s+себя))?\s*[:\-–—]?\s*([^\n.!?]+)/iu,
    )?.[1];
    const actionSection = message.match(
      /(?:делаю|делаем|предлагаю|предлагаем|оказываю|оказываем|работы)(?:\s+(?:это|такие|включают|включают\s+в\s+себя))?\s*[:\-–—]?\s*([^\n.!?]+)/iu,
    )?.[1];
    const section = explicitSection ?? actionSection;
    const candidates = section
      ? section.split(/[,;/\n]+/u)
      : context.allowLoose
        ? message.split(/[,;/|.!?\n]+/u)
        : message
            .split(/[.!?;\n]+/u)
            .filter((item) => this.hasServiceFacts(item));

    const parsed = candidates
      .map((item) => item.trim())
      .filter(
        (item) =>
          item.length > 0 &&
          !this.extractBusinessName(item) &&
          this.cleanBusinessName(item).toLocaleLowerCase('ru-RU') !==
            context.businessName?.toLocaleLowerCase('ru-RU'),
      )
      .map((item) => this.parseService(item, context.allowLoose || !!section))
      .filter((item): item is AiOnboardingServiceItem => item !== null)
      .slice(0, 30);

    if (parsed.length === 0) return previous;
    if (previous.length === 0) return parsed;

    const merged = new Map(
      previous.map((service) => [
        service.name.toLocaleLowerCase('ru-RU'),
        service,
      ]),
    );
    for (const service of parsed) {
      merged.set(service.name.toLocaleLowerCase('ru-RU'), service);
    }
    return [...merged.values()].slice(0, 30);
  }

  private parseService(
    value: string,
    allowLoose: boolean,
  ): AiOnboardingServiceItem | null {
    const cleaned = value
      .trim()
      .replace(/^(?:и\s+)?(?:это|такие\s+как)\s+/iu, '')
      .replace(/^(?:мои|наши)\s+услуг(?:а|и)?\s*[:\-–—]?\s*/iu, '');
    const hasFacts = this.hasServiceFacts(cleaned);
    if (!hasFacts && !allowLoose) {
      return null;
    }

    const durationMatch = cleaned.match(
      /(\d{1,3})\s*(мин(?:ут[ыа]?)?\.?|час(?:а|ов)?)(?=\s|$)/iu,
    );
    const currencyPriceMatch = cleaned.match(
      /(\d[\d\s]*)\s*(?:₽|руб(?:лей|ля|ль)?\.?|р\.)(?=\s|$)/iu,
    );
    const withoutDuration = durationMatch
      ? cleaned.replace(durationMatch[0], ' ')
      : cleaned;
    const barePriceMatch = currencyPriceMatch
      ? null
      : withoutDuration.match(/\b(\d{2,8})\b/u);

    let name = cleaned;
    if (currencyPriceMatch) name = name.replace(currencyPriceMatch[0], ' ');
    if (barePriceMatch) name = name.replace(barePriceMatch[0], ' ');
    if (durationMatch) name = name.replace(durationMatch[0], ' ');
    name = name
      .replace(
        /(?:^|\s)(?:стоит|цена|ценой|длится|продолжительность|около|примерно|и)(?=\s|$)/giu,
        ' ',
      )
      .replace(/^(?:я\s+)?(?:делаю|предлагаю|оказываю)\s+/iu, '')
      .replace(/[()\-–—]+$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      name.length < 2 ||
      (!hasFacts && name.split(/\s+/u).length > 10) ||
      /^(?:(?:поставь|заполни|добавь|подбери|выбери|возьми|проставь|сделай)\s+)?(?:услуг(?:у|и)?\s+)?(?:поставь|заполни|добавь|подбери|выбери|возьми|проставь|сделай)?\s*(?:автоматически|автоматом|по\s+умолчанию|как\s+обычно)$/iu.test(
        name,
      ) ||
      /^(?:услуг(?:а|и)?|нет|не\s+знаю|пока\s+не\s+знаю|неважно)$/iu.test(
        name,
      ) ||
      AMBIGUOUS_SHORT_REPLY.test(name) ||
      hasNoFormalBusinessNameSignal(name) ||
      /^(?:меня\s+зовут|зовут\s+меня|(?:клиент[а-яё]*|гости|все)\s+(?:меня\s+)?знают)/iu.test(
        name,
      ) ||
      (!hasFacts &&
        /^(?:я|мы|у\s+меня|у\s+нас|работаю|работаем|занимаюсь|занимаемся)(?=\s|$)/iu.test(
          name,
        ))
    ) {
      return null;
    }

    const durationValue = durationMatch?.[1] ? Number(durationMatch[1]) : 60;
    const durationMinutes = durationMatch?.[2]?.toLowerCase().startsWith('час')
      ? durationValue * 60
      : durationValue;
    const priceValue = currencyPriceMatch?.[1] ?? barePriceMatch?.[1];

    return {
      name: name.slice(0, 120),
      price: priceValue
        ? Math.min(Number(priceValue.replace(/\s/g, '')), 10_000_000)
        : 0,
      durationMinutes: Math.max(5, Math.min(durationMinutes, 1440)),
    };
  }

  private hasServiceIntro(value: string): boolean {
    return /(?:услуг(?:а|и)?|делаю|делаем|предлагаю|предлагаем|оказываю|оказываем|работы)\b/iu.test(
      value,
    );
  }

  private shouldUseTemplateServices(
    value: string,
    expectsServices: boolean,
  ): boolean {
    const explicitlyRequestsTemplate =
      /(?:возьми|взять|используй|подставь|добавь|замени|выбери|подбери|поставь|заполни|сделай).{0,30}(?:услуг|прайс|набор).{0,30}(?:шаблон|готов|типов|стандарт|обычн)/iu.test(
        value,
      ) ||
      /(?:возьми|взять|используй|подставь|добавь|замени|выбери|подбери|поставь|заполни|сделай).{0,30}(?:услуг|прайс|набор).{0,30}(?:автомат|по\s+умолчанию)/iu.test(
        value,
      ) ||
      /(?:услуг|прайс|набор).{0,30}(?:возьми|взять|используй|подставь|добавь|замени|выбери|подбери|поставь|заполни|сделай).{0,30}(?:автомат|по\s+умолчанию|как\s+обычно)/iu.test(
        value,
      ) ||
      /(?:возьми|взять|используй|подставь|добавь|замени|выбери|подбери|поставь|заполни|сделай).{0,30}(?:готов|типов|стандарт|обычн).{0,20}(?:услуг|прайс|набор)/iu.test(
        value,
      ) ||
      /(?:готов|типов|стандарт|обычн).{0,30}(?:услуг|прайс|набор).{0,30}(?:шаблон|возьми|добавь|используй|выбери|подбери)/iu.test(
        value,
      );
    if (explicitlyRequestsTemplate) return true;
    if (!expectsServices) return false;

    const normalized = value
      .toLocaleLowerCase('ru-RU')
      .replace(/[.,!?;:]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    return (
      /^(?:давай\s+|можешь\s+|просто\s+)?(?:поставь|заполни|добавь|подбери|выбери|возьми|проставь|сделай)(?:\s+(?:всё|все|их|сама|сам|самостоятельно))*\s+(?:автоматически|автоматом|по\s+умолчанию|как\s+обычно)$/u.test(
        normalized,
      ) ||
      /^(?:давай\s+|можешь\s+|просто\s+)?(?:поставь|заполни|добавь|подбери|выбери|возьми|проставь|сделай)\s+(?:сама|сам)$/u.test(
        normalized,
      ) ||
      /^(?:автоматически|автоматом|по\s+умолчанию|как\s+обычно|всё\s+стандартное|все\s+стандартные|стандартный\s+набор|типовой\s+набор)$/u.test(
        normalized,
      ) ||
      /^(?:сама|сам)\s+(?:подбери|выбери|реши|заполни|поставь|добавь)(?:\s+(?:услуги|прайс|всё|все))?$/u.test(
        normalized,
      ) ||
      /^(?:на\s+тво[её]\s+усмотрение|выбери\s+за\s+меня)$/u.test(normalized)
    );
  }

  private looksLikeServiceList(value: string): boolean {
    return (
      value
        .split(/[,;\n]+/u)
        .map((item) => item.trim())
        .filter(Boolean).length > 1
    );
  }

  private hasServiceFacts(value: string): boolean {
    return (
      /\d[\d\s]*\s*(?:₽|руб(?:лей|ля|ль)?\.?|р\.)(?=\s|$)/iu.test(value) ||
      /\d{1,3}\s*(?:мин(?:ут[ыа]?)?\.?|час(?:а|ов)?)(?=\s|$)/iu.test(value)
    );
  }

  private extractSchedule(message: string): AiOnboardingWeeklyRule[] | null {
    const hours = message.match(
      /(?:с\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:до|[-–—])\s*(\d{1,2})(?::(\d{2}))?/iu,
    );
    if (!hours) {
      return null;
    }

    const startHour = Number(hours[1]);
    const endHour = Number(hours[3]);
    if (startHour > 23 || endHour > 24 || startHour >= endHour) {
      return null;
    }

    const weekdays =
      /(?:пн|понедельник)\s*[-–—]\s*(?:пт|пятниц)|с понедельника по пятницу/iu.test(
        message,
      )
        ? [1, 2, 3, 4, 5]
        : /(?:пн|понедельник)\s*[-–—]\s*(?:сб|суббот)|с понедельника по субботу/iu.test(
              message,
            )
          ? [1, 2, 3, 4, 5, 6]
          : [1, 2, 3, 4, 5];

    return weekdays.map((weekday) => ({
      weekday,
      startTime: `${String(startHour).padStart(2, '0')}:${hours[2] ?? '00'}`,
      endTime: `${String(endHour).padStart(2, '0')}:${hours[4] ?? '00'}`,
    }));
  }

  private getMissingFields(
    blueprint: AiOnboardingBlueprint,
  ): AiOnboardingMissingField[] {
    const missing: AiOnboardingMissingField[] = [];
    if (!blueprint.businessName) missing.push('business_name');
    if (!blueprint.providerCount) missing.push('provider_count');
    if (blueprint.services.length === 0) missing.push('services');
    return missing;
  }

  private buildAssistantMessage(
    blueprint: AiOnboardingBlueprint,
    missing: AiOnboardingMissingField[],
    needsClarification = false,
    needsPersonalDisplayName = false,
  ): string {
    if (missing.length === 0) {
      return `Я собрала основу для «${blueprint.businessName}». Проверьте услуги, команду и расписание на итоговой карточке.`;
    }

    const questions: Record<AiOnboardingMissingField, string> = {
      business_name:
        'Как вас или ваш бизнес знают клиенты? Можно написать имя или название.',
      provider_count: 'Сколько человек будет принимать клиентов, включая вас?',
      services:
        'Какие услуги вы оказываете? Можно написать как говорите, цены и время необязательны.',
    };
    const saved: string[] = [];
    if (blueprint.businessName)
      saved.push(`название «${blueprint.businessName}»`);
    if (blueprint.services.length > 0) {
      saved.push(`услуг: ${blueprint.services.length}`);
    }
    if (blueprint.providerCount) {
      saved.push(`специалистов: ${blueprint.providerCount}`);
    }
    const prefix = needsClarification
      ? 'Не хочу додумывать за вас.'
      : saved.length > 0
        ? `Сохранила ${saved.join(', ')}.`
        : 'Поняла основу.';
    if (needsPersonalDisplayName) {
      return 'Поняла, отдельного названия нет. Как вас называют клиенты? Можно просто написать имя.';
    }
    return `${prefix} ${questions[missing[0]]}`;
  }

  private buildQuickReplies(
    blueprint: AiOnboardingBlueprint,
    missing: AiOnboardingMissingField[],
    needsPersonalDisplayName = false,
  ): AiOnboardingQuickReply[] {
    if (needsPersonalDisplayName) return [];

    const next = missing[0];
    if (next === 'provider_count') {
      return [
        { label: 'Работаю один', message: 'Я работаю один' },
        { label: 'Нас двое', message: 'Нас двое специалистов' },
        { label: 'Нас трое', message: 'Нас трое специалистов' },
      ];
    }
    if (next === 'services') {
      const replies: AiOnboardingQuickReply[] = [
        { label: 'Перечислю сам', message: 'Сейчас перечислю услуги' },
      ];
      if (getBusinessTemplate(blueprint.templateId).suggestedServices.length) {
        replies.unshift({
          label: 'Взять из шаблона',
          message: 'Используй готовые услуги из шаблона',
        });
      }
      return replies;
    }
    if (next === 'business_name') {
      return [
        {
          label: 'Нет отдельного названия',
          message: 'У меня нет отдельного названия',
        },
        {
          label: 'Сначала услуги',
          message: 'Сначала расскажу об услугах',
        },
      ];
    }
    return [];
  }

  private hasProgress(
    previous: AiOnboardingBlueprint | undefined,
    current: AiOnboardingBlueprint,
  ): boolean {
    if (!previous) {
      return Boolean(
        current.businessName ||
        current.providerCount ||
        current.services.length,
      );
    }

    return (
      previous.businessName !== current.businessName ||
      previous.providerCount !== current.providerCount ||
      previous.templateId !== current.templateId ||
      previous.calendarSource !== current.calendarSource ||
      previous.services.length !== current.services.length ||
      previous.scheduleAssumed !== current.scheduleAssumed
    );
  }

  private clampProviderCount(value: number): number | null {
    return Number.isInteger(value) && value >= 1 ? Math.min(value, 100) : null;
  }
}
