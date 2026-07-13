import { Injectable } from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import type {
  AiOnboardingBlueprint,
  AiOnboardingInterpretation,
  AiOnboardingMissingField,
  AiOnboardingServiceItem,
  AiOnboardingWeeklyRule,
} from './ai-onboarding.types';
import {
  getBusinessTemplate,
  type BusinessTemplateId,
} from './business-templates';

const TEMPLATE_SIGNALS: readonly [BusinessTemplateId, RegExp][] = [
  ['barbershop', /(барбершоп|барбер|мужск(?:ая|ие) стрижк)/iu],
  ['beauty_and_care', /(салон красоты|маникюр|бров|ресниц|косметолог|визаж)/iu],
  ['clinic', /(клиник|стоматолог|врач|пациент|медицин)/iu],
  ['wellness', /(массаж|спа|spa|йог|телесн|wellness)/iu],
  [
    'education_and_consulting',
    /(репетитор|обучен|урок|заняти|консульт|коуч)/iu,
  ],
  ['auto_service', /(автосервис|детейлинг|автомоб|шиномонтаж|мойк)/iu],
  ['pet_services', /(груминг|зоосалон|питом|собак|кошк|ветеринар)/iu],
];

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
};

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
      services: this.extractServices(normalized, previousServices, {
        allowLoose: expectsServices && (Boolean(previous) || hasServiceIntro),
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

    return {
      blueprint,
      missingFields,
      assistantMessage: this.buildAssistantMessage(blueprint, missingFields),
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
      /(без crm|без срм|без црм|сво[её]й crm нет|календарь maya)/iu.test(
        message,
      )
    ) {
      return CalendarSource.INTERNAL;
    }

    if (/(yclients|altegio|dikidi|crm|срм|црм)/iu.test(message)) {
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

    if (allowStandalone) {
      const candidate = message.split(/[,.!?;\n]+/u)[0]?.trim() ?? '';
      if (
        candidate.length >= 2 &&
        candidate.length <= 80 &&
        candidate.split(/\s+/u).length <= 8 &&
        !/\d/u.test(candidate) &&
        !/^(?:я|мы|у\s+меня|у\s+нас|работаю|работаем|занимаюсь|занимаемся|делаю|делаем|оказываю|оказываем)\b/iu.test(
          candidate,
        )
      ) {
        return this.cleanBusinessName(candidate);
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
      /(один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(?:мастер|барбер|врач|специалист|сотрудник|преподавател)/iu,
    );
    if (wordMatch?.[1]) {
      return NUMBER_WORDS[wordMatch[1].toLowerCase()] ?? null;
    }

    if (
      /(работаю один|работаю одна|я один|я одна|без сотрудников)/iu.test(
        message,
      )
    ) {
      return 1;
    }

    return null;
  }

  private extractServices(
    message: string,
    previous: AiOnboardingServiceItem[],
    context: { allowLoose: boolean; businessName: string | null },
  ): AiOnboardingServiceItem[] {
    const section = message.match(
      /(?:услуг(?:а|и)?|делаю|делаем|предлагаю|предлагаем|оказываю|оказываем|работы)(?:\s+(?:это|такие|включают|включают\s+в\s+себя))?\s*[:\-–—]?\s*([^\n.!?]+)/iu,
    )?.[1];
    const candidates = section
      ? section.split(/[,;\n]+/u)
      : context.allowLoose
        ? message.split(/[,;.!?\n]+/u)
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
      /^(?:услуг(?:а|и)?|нет|не\s+знаю|пока\s+не\s+знаю|неважно)$/iu.test(
        name,
      ) ||
      (!hasFacts &&
        /^(?:я|мы|у\s+меня|у\s+нас|работаю|работаем|занимаюсь|занимаемся)\b/iu.test(
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
  ): string {
    if (missing.length === 0) {
      return `Я собрала основу для «${blueprint.businessName}». Проверьте услуги, команду и расписание на итоговой карточке.`;
    }

    const questions: Record<AiOnboardingMissingField, string> = {
      business_name:
        'Напишите только название бизнеса, например: «Тихая сила».',
      provider_count: 'Сколько специалистов будет принимать клиентов?',
      services:
        'Перечислите услуги обычным списком. Цены и длительность можно добавить сейчас или поправить на следующем экране.',
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
    const prefix =
      saved.length > 0
        ? `Сохранила ${saved.join(', ')}.`
        : 'Продолжим настройку.';
    return `${prefix} ${missing.map((field) => questions[field]).join(' ')}`;
  }

  private clampProviderCount(value: number): number | null {
    return Number.isInteger(value) && value >= 1 ? Math.min(value, 100) : null;
  }
}
