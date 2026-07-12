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
    const templateId = preferredTemplateId
      ? getBusinessTemplate(preferredTemplateId).id
      : this.detectTemplate(normalized, previous?.templateId);
    const template = getBusinessTemplate(templateId);
    const detectedSchedule = this.extractSchedule(normalized);
    const blueprint: AiOnboardingBlueprint = {
      templateId: template.id,
      businessName:
        this.extractBusinessName(normalized) ?? previous?.businessName ?? null,
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
      services: this.extractServices(normalized, previous?.services ?? []),
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

  private extractBusinessName(message: string): string | null {
    const patterns = [
      /(?:бизнес|компания|студия|салон|барбершоп|проект)\s+(?:называется|называем)\s+[«"']?([^»"'.,;\n]{2,80})/iu,
      /(?:название|назовем|назовём)\s*[:-]?\s*[«"']?([^»"'.,;\n]{2,80})/iu,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return null;
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
  ): AiOnboardingServiceItem[] {
    const section = message.match(
      /(?:услуги|делаем|предлагаем|работы)\s*[:-]?\s*([^\n.!?]+)/iu,
    )?.[1];
    if (!section) {
      return previous;
    }

    const parsed = section
      .split(/[,;]+|\s+и\s+(?=[а-яё])/iu)
      .map((item) => this.parseService(item))
      .filter((item): item is AiOnboardingServiceItem => item !== null)
      .slice(0, 30);

    return parsed.length > 0 ? parsed : previous;
  }

  private parseService(value: string): AiOnboardingServiceItem | null {
    const cleaned = value.trim();
    const name = cleaned
      .replace(/\d[\d\s]*(?:₽|руб(?:лей|ля|ль)?|р\.)(?=\s|$)/giu, '')
      .replace(/\d{1,3}\s*(?:мин(?:ут[ыа]?)?|час(?:а|ов)?)(?=\s|$)/giu, '')
      .replace(/[()\-–—]+$/u, '')
      .trim();
    if (name.length < 2) {
      return null;
    }

    const priceMatch = cleaned.match(
      /(\d[\d\s]*)\s*(?:₽|руб(?:лей|ля|ль)?|р\.)(?=\s|$)/iu,
    );
    const durationMatch = cleaned.match(
      /(\d{1,3})\s*(мин(?:ут[ыа]?)?|час(?:а|ов)?)(?=\s|$)/iu,
    );
    const durationValue = durationMatch?.[1] ? Number(durationMatch[1]) : 60;
    const durationMinutes = durationMatch?.[2]?.toLowerCase().startsWith('час')
      ? durationValue * 60
      : durationValue;

    return {
      name: name.slice(0, 120),
      price: priceMatch?.[1]
        ? Math.min(Number(priceMatch[1].replace(/\s/g, '')), 10_000_000)
        : 0,
      durationMinutes: Math.max(5, Math.min(durationMinutes, 1440)),
    };
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
      business_name: 'Как называется ваш бизнес?',
      provider_count: 'Сколько специалистов будет принимать клиентов?',
      services: 'Перечислите основные услуги, цену и длительность.',
    };
    return `Основу я поняла. ${missing.map((field) => questions[field]).join(' ')}`;
  }

  private clampProviderCount(value: number): number | null {
    return Number.isInteger(value) && value >= 1 ? Math.min(value, 100) : null;
  }
}
