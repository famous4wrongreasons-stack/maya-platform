import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  BUSINESS_TEMPLATE_IDS,
  getBusinessTemplate,
  listBusinessTemplates,
} from './business-templates';
import {
  hasNoFormalBusinessNameSignal,
  SafeOnboardingInterpreter,
} from './safe-onboarding-interpreter';

const CONFIDENCE_THRESHOLD = 0.72;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

const ACCEPTED_FIELDS = [
  'template',
  'business_name',
  'calendar_source',
  'provider_count',
  'services',
  'weekly_rules',
  'use_template_services',
] as const;
const MODEL_INTENTS = [
  'provide_details',
  'correction',
  'smalltalk',
  'unclear',
] as const;

type AcceptedField = (typeof ACCEPTED_FIELDS)[number];
type ModelProvider = 'deepseek' | 'openai';
type ModelIntent = (typeof MODEL_INTENTS)[number];

type ModelTurn = {
  accepted_fields: AcceptedField[];
  assistant_message: string;
  clarification_question: string | null;
  confidence: number;
  intent: ModelIntent;
  needs_clarification: boolean;
  patch: {
    business_name: string | null;
    calendar_source: CalendarSource | null;
    provider_count: number | null;
    services: AiOnboardingServiceItem[];
    template_id: string | null;
    use_template_services: boolean;
    weekly_rules: AiOnboardingWeeklyRule[];
  };
  quick_replies: AiOnboardingQuickReply[];
};

type OpenAiResponse = {
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
};

type DeepSeekResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
};

@Injectable()
export class ConversationalOnboardingInterpreter {
  private readonly logger = new Logger(
    ConversationalOnboardingInterpreter.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly safeInterpreter: SafeOnboardingInterpreter,
  ) {}

  async interpret(
    message: string,
    previous?: AiOnboardingBlueprint,
    preferredTemplateId?: string,
  ): Promise<AiOnboardingInterpretation> {
    const safe = this.safeInterpreter.interpret(
      message,
      previous,
      preferredTemplateId,
    );
    // Template selection is a deterministic product action. Do not let a
    // probabilistic model drop it and ask the same services question again.
    if (this.didApplyTemplateServices(safe, previous)) {
      return safe;
    }
    // A personal name is deliberately parsed locally. It may be used as the
    // public business label, but it must not be sent to the language model.
    if (this.didResolvePersonalBrandName(message, safe, previous)) {
      return safe;
    }
    const provider = this.resolveModelProvider();
    if (!provider) {
      return safe;
    }

    const sanitizedMessage = this.redactPersonalData(message);
    if (!this.isUsefulModelInput(sanitizedMessage, message, safe)) {
      return safe;
    }

    try {
      const turn = await this.requestStructuredTurn(
        provider,
        sanitizedMessage,
        previous,
        safe.missingFields,
        preferredTemplateId,
      );
      return this.mergeModelTurn(turn, safe, provider, previous);
    } catch (error) {
      this.logger.warn(
        `AI onboarding fallback activated: ${this.safeErrorName(error)}`,
      );
      return safe;
    }
  }

  private async requestStructuredTurn(
    provider: ModelProvider,
    sanitizedMessage: string,
    previous: AiOnboardingBlueprint | undefined,
    missingFields: AiOnboardingMissingField[],
    preferredTemplateId?: string,
  ): Promise<ModelTurn> {
    if (provider === 'deepseek') {
      return this.requestDeepSeekStructuredTurn(
        sanitizedMessage,
        previous,
        missingFields,
        preferredTemplateId,
      );
    }

    return this.requestOpenAiStructuredTurn(
      sanitizedMessage,
      previous,
      missingFields,
      preferredTemplateId,
    );
  }

  private async requestOpenAiStructuredTurn(
    sanitizedMessage: string,
    previous: AiOnboardingBlueprint | undefined,
    missingFields: AiOnboardingMissingField[],
    preferredTemplateId?: string,
  ): Promise<ModelTurn> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('openai_api_key_missing');
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          this.configService
            .get<string>('OPENAI_AI_ONBOARDING_MODEL')
            ?.trim() || 'gpt-5.4-mini',
        store: false,
        max_output_tokens: 1_200,
        instructions: MODEL_INSTRUCTIONS,
        input: JSON.stringify(
          this.buildModelInput(
            sanitizedMessage,
            previous,
            missingFields,
            preferredTemplateId,
          ),
        ),
        text: {
          format: {
            type: 'json_schema',
            name: 'maya_onboarding_turn',
            strict: true,
            schema: MODEL_TURN_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(this.resolveTimeoutMs('openai')),
    });

    if (!response.ok) {
      throw new Error(`openai_http_${response.status}`);
    }

    const payload = (await response.json()) as OpenAiResponse;
    const outputText = payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === 'output_text')?.text;
    if (!outputText) {
      throw new Error('openai_output_missing');
    }

    return this.validateModelTurn(JSON.parse(outputText) as unknown, 'openai');
  }

  private async requestDeepSeekStructuredTurn(
    sanitizedMessage: string,
    previous: AiOnboardingBlueprint | undefined,
    missingFields: AiOnboardingMissingField[],
    preferredTemplateId?: string,
  ): Promise<ModelTurn> {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('deepseek_api_key_missing');
    }

    const response = await fetch(this.resolveDeepSeekEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          this.configService
            .get<string>('DEEPSEEK_AI_ONBOARDING_MODEL')
            ?.trim() || DEFAULT_DEEPSEEK_MODEL,
        messages: [
          {
            role: 'system',
            content: this.buildDeepSeekInstructions(),
          },
          {
            role: 'user',
            content: JSON.stringify(
              this.buildModelInput(
                sanitizedMessage,
                previous,
                missingFields,
                preferredTemplateId,
              ),
            ),
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1_200,
        temperature: 0.2,
        thinking: { type: this.resolveDeepSeekThinking() },
        stream: false,
      }),
      signal: AbortSignal.timeout(this.resolveTimeoutMs('deepseek')),
    });

    if (!response.ok) {
      throw new Error(`deepseek_http_${response.status}`);
    }

    const payload = (await response.json()) as DeepSeekResponse;
    const choice = payload.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      throw new Error(`deepseek_finish_${choice.finish_reason.slice(0, 32)}`);
    }
    const outputText = choice?.message?.content?.trim();
    if (!outputText) {
      throw new Error('deepseek_output_missing');
    }

    return this.validateModelTurn(
      JSON.parse(outputText) as unknown,
      'deepseek',
    );
  }

  private buildModelInput(
    sanitizedMessage: string,
    previous: AiOnboardingBlueprint | undefined,
    missingFields: AiOnboardingMissingField[],
    preferredTemplateId?: string,
  ) {
    return {
      user_message: sanitizedMessage,
      preferred_template_id: preferredTemplateId ?? null,
      current_state: this.buildPrivacySafeState(previous),
      missing_fields: missingFields,
      templates: listBusinessTemplates().map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        provider_title: template.providerTitle,
      })),
    };
  }

  private buildDeepSeekInstructions(): string {
    return [
      MODEL_INSTRUCTIONS,
      'Верни только один валидный JSON-объект без Markdown и пояснений.',
      `JSON Schema: ${JSON.stringify(MODEL_TURN_SCHEMA)}`,
      `Пример JSON: ${JSON.stringify(MODEL_TURN_EXAMPLE)}`,
    ].join('\n\n');
  }

  private mergeModelTurn(
    turn: ModelTurn,
    safe: AiOnboardingInterpretation,
    provider: ModelProvider,
    previous?: AiOnboardingBlueprint,
  ): AiOnboardingInterpretation {
    const accepted = new Set(turn.accepted_fields);
    const uncertain =
      turn.needs_clarification || turn.confidence < CONFIDENCE_THRESHOLD;
    const templateId =
      accepted.has('template') && turn.patch.template_id
        ? getBusinessTemplate(turn.patch.template_id).id
        : (previous?.templateId ?? safe.blueprint.templateId);
    const template = getBusinessTemplate(templateId);
    const base: AiOnboardingBlueprint = previous
      ? this.cloneBlueprint(previous)
      : {
          templateId: template.id,
          businessName: null,
          summary: template.description,
          industryPresetId: template.industryPresetId,
          calendarSource: template.calendarSource,
          providerCount: template.id === 'solo_specialist' ? 1 : null,
          providerTitle: template.providerTitle,
          services: [],
          weeklyRules: template.defaultWeeklyRules.map((rule) => ({ ...rule })),
          scheduleAssumed: true,
        };

    base.templateId = template.id;
    base.summary = template.description;
    base.industryPresetId = template.industryPresetId;
    base.providerTitle = template.providerTitle;

    if (accepted.has('business_name') && turn.patch.business_name) {
      base.businessName = this.cleanText(turn.patch.business_name, 80);
    }
    if (accepted.has('calendar_source') && turn.patch.calendar_source) {
      base.calendarSource = turn.patch.calendar_source;
    }
    if (accepted.has('provider_count') && turn.patch.provider_count) {
      base.providerCount = this.clampInteger(turn.patch.provider_count, 1, 100);
    }
    if (
      accepted.has('use_template_services') &&
      turn.patch.use_template_services
    ) {
      base.services = template.suggestedServices.map((service) => ({
        ...service,
      }));
    } else if (accepted.has('services') && turn.patch.services.length > 0) {
      base.services = this.normalizeServices(turn.patch.services);
    }
    if (accepted.has('weekly_rules') && turn.patch.weekly_rules.length > 0) {
      base.weeklyRules = this.normalizeWeeklyRules(turn.patch.weekly_rules);
      base.scheduleAssumed = false;
    }

    const missingFields = this.getMissingFields(base);
    const fallbackTurn = this.safeInterpreter.interpret('', base);
    const assistantMessage = this.cleanText(
      uncertain && turn.clarification_question
        ? turn.clarification_question
        : turn.assistant_message,
      500,
    );

    const quickReplies = this.normalizeQuickReplies(turn.quick_replies);

    return {
      assistantMessage: assistantMessage || fallbackTurn.assistantMessage,
      blueprint: base,
      confidence: this.clampNumber(turn.confidence, 0, 1),
      missingFields,
      needsClarification: uncertain,
      quickReplies:
        quickReplies.length > 0 ? quickReplies : fallbackTurn.quickReplies,
      source: provider,
    };
  }

  private validateModelTurn(
    value: unknown,
    provider: ModelProvider,
  ): ModelTurn {
    if (!this.isRecord(value)) {
      throw new Error(`${provider}_output_invalid`);
    }
    const turn = value as Partial<ModelTurn>;
    const patch = turn.patch;
    if (
      !MODEL_INTENTS.includes((turn.intent ?? 'invalid') as ModelIntent) ||
      typeof turn.assistant_message !== 'string' ||
      !this.isNullableString(turn.clarification_question) ||
      !this.isNumberInRange(turn.confidence, 0, 1) ||
      typeof turn.needs_clarification !== 'boolean' ||
      !this.isRecord(patch) ||
      !Array.isArray(turn.accepted_fields) ||
      !turn.accepted_fields.every(
        (field) => typeof field === 'string' && ACCEPTED_FIELDS.includes(field),
      ) ||
      !Array.isArray(turn.quick_replies) ||
      !turn.quick_replies.every(
        (reply) =>
          this.isRecord(reply) &&
          typeof reply.label === 'string' &&
          typeof reply.message === 'string',
      ) ||
      !this.isValidModelPatch(patch)
    ) {
      throw new Error(`${provider}_output_invalid`);
    }

    return turn as ModelTurn;
  }

  private isValidModelPatch(patch: Record<string, unknown>): boolean {
    return (
      (patch.template_id === null ||
        (typeof patch.template_id === 'string' &&
          BUSINESS_TEMPLATE_IDS.includes(
            patch.template_id as (typeof BUSINESS_TEMPLATE_IDS)[number],
          ))) &&
      this.isNullableString(patch.business_name) &&
      (patch.calendar_source === null ||
        patch.calendar_source === CalendarSource.INTERNAL ||
        patch.calendar_source === CalendarSource.EXTERNAL) &&
      (patch.provider_count === null ||
        this.isIntegerInRange(patch.provider_count, 1, 100)) &&
      typeof patch.use_template_services === 'boolean' &&
      Array.isArray(patch.services) &&
      patch.services.every(
        (service) =>
          this.isRecord(service) &&
          typeof service.name === 'string' &&
          this.isIntegerInRange(service.price, 0, 10_000_000) &&
          this.isIntegerInRange(service.durationMinutes, 5, 1_440),
      ) &&
      Array.isArray(patch.weekly_rules) &&
      patch.weekly_rules.every(
        (rule) =>
          this.isRecord(rule) &&
          this.isIntegerInRange(rule.weekday, 0, 6) &&
          typeof rule.startTime === 'string' &&
          typeof rule.endTime === 'string' &&
          /^([01]\d|2[0-3]):[0-5]\d$/u.test(rule.startTime) &&
          /^([01]\d|2[0-3]):[0-5]\d$/u.test(rule.endTime) &&
          rule.startTime < rule.endTime,
      )
    );
  }

  private buildPrivacySafeState(previous?: AiOnboardingBlueprint) {
    if (!previous) {
      return null;
    }

    return {
      template_id: previous.templateId,
      business_name_present: Boolean(previous.businessName),
      calendar_source: previous.calendarSource,
      provider_count: previous.providerCount,
      services: previous.services.map((service) => ({
        ...service,
        name: this.redactPersonalData(service.name),
      })),
      weekly_rules: previous.weeklyRules,
      schedule_assumed: previous.scheduleAssumed,
    };
  }

  private redactPersonalData(value: string): string {
    return value
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-zА-Яа-яЁё]{2,}/gu, '[EMAIL]')
      .replace(/(?:https?:\/\/|www\.)\S+/giu, '[ССЫЛКА]')
      .replace(/@[A-Za-z0-9_]{4,}/gu, '[АККАУНТ]')
      .replace(/(?:\+?7|8)[\s()\-\d]{9,18}\d/gu, '[ТЕЛЕФОН]')
      .replace(
        /((?:api[-\s]?token|токен|api[-\s]?ключ|секретный\s+ключ)\s*(?::|=|это)?\s*)(?:bearer\s+)?[A-Za-z0-9._-]{8,}/giu,
        '$1[СЕКРЕТ]',
      )
      .replace(
        /((?:меня\s+зовут|владел(?:ец|ица)|контактное\s+лицо)\s+)[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2}/giu,
        '$1[ИМЯ]',
      )
      .replace(
        /((?:я|мо[её]\s+имя|обращайтесь\s+ко\s+мне\s+как)\s+)[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2}/gu,
        '$1[ИМЯ]',
      )
      .replace(/((?:^|\s)у\s+)[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?/gu, '$1[ИМЯ]')
      .replace(
        /((?:бизнес|студия|проект|бренд)\s+(?:называется|будет\s+называться)\s+)[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/gu,
        '$1[НАЗВАНИЕ СКРЫТО]',
      )
      .trim();
  }

  private isUsefulModelInput(
    sanitized: string,
    raw: string,
    safe: AiOnboardingInterpretation,
  ): boolean {
    if (
      !sanitized ||
      /^\[(?:EMAIL|ТЕЛЕФОН|ССЫЛКА|АККАУНТ)\]$/u.test(sanitized)
    ) {
      return false;
    }

    const words = raw.trim().split(/\s+/u);
    const likelyPersonalNameReply =
      safe.missingFields.includes('services') &&
      words.length <= 3 &&
      /^[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2}$/u.test(raw.trim());

    return !likelyPersonalNameReply;
  }

  private resolveModelProvider(): ModelProvider | null {
    const provider =
      this.configService
        .get<string>('AI_ONBOARDING_PROVIDER')
        ?.trim()
        .toLowerCase() ?? 'auto';
    const hasDeepSeek = Boolean(
      this.configService.get<string>('DEEPSEEK_API_KEY')?.trim(),
    );
    const hasOpenAi = Boolean(
      this.configService.get<string>('OPENAI_API_KEY')?.trim(),
    );

    if (provider === 'deepseek') return hasDeepSeek ? 'deepseek' : null;
    if (provider === 'openai') return hasOpenAi ? 'openai' : null;
    if (provider !== 'auto') return null;
    if (hasDeepSeek) return 'deepseek';
    if (hasOpenAi) return 'openai';
    return null;
  }

  private didApplyTemplateServices(
    safe: AiOnboardingInterpretation,
    previous?: AiOnboardingBlueprint,
  ): boolean {
    if ((previous?.services.length ?? 0) > 0) return false;
    const suggested = getBusinessTemplate(
      safe.blueprint.templateId,
    ).suggestedServices;
    if (safe.blueprint.services.length !== suggested.length) return false;

    return suggested.every((service, index) => {
      const actual = safe.blueprint.services[index];
      return (
        actual?.name === service.name &&
        actual.price === service.price &&
        actual.durationMinutes === service.durationMinutes
      );
    });
  }

  private didResolvePersonalBrandName(
    message: string,
    safe: AiOnboardingInterpretation,
    previous?: AiOnboardingBlueprint,
  ): boolean {
    return (
      hasNoFormalBusinessNameSignal(message) &&
      Boolean(safe.blueprint.businessName) &&
      safe.blueprint.businessName !== previous?.businessName
    );
  }

  private resolveTimeoutMs(provider: ModelProvider): number {
    const key =
      provider === 'deepseek'
        ? 'DEEPSEEK_AI_ONBOARDING_TIMEOUT_MS'
        : 'OPENAI_AI_ONBOARDING_TIMEOUT_MS';
    const configured = Number(this.configService.get<string>(key));
    return Number.isInteger(configured) && configured >= 1_000
      ? Math.min(configured, 30_000)
      : DEFAULT_TIMEOUT_MS;
  }

  private resolveDeepSeekEndpoint(): string {
    const configured =
      this.configService.get<string>('DEEPSEEK_BASE_URL')?.trim() ||
      DEFAULT_DEEPSEEK_BASE_URL;
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error('deepseek_base_url_invalid');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('deepseek_base_url_invalid');
    }
    url.search = '';
    url.hash = '';
    const basePath = url.pathname.replace(/\/+$/u, '');
    url.pathname = basePath.endsWith('/chat/completions')
      ? basePath
      : `${basePath}/chat/completions`;
    return url.toString();
  }

  private resolveDeepSeekThinking(): 'disabled' | 'enabled' {
    return this.configService
      .get<string>('DEEPSEEK_THINKING')
      ?.trim()
      .toLowerCase() === 'enabled'
      ? 'enabled'
      : 'disabled';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }

  private isNumberInRange(
    value: unknown,
    minimum: number,
    maximum: number,
  ): value is number {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum
    );
  }

  private isIntegerInRange(
    value: unknown,
    minimum: number,
    maximum: number,
  ): value is number {
    return (
      this.isNumberInRange(value, minimum, maximum) && Number.isInteger(value)
    );
  }

  private getMissingFields(
    blueprint: AiOnboardingBlueprint,
  ): AiOnboardingMissingField[] {
    const missing: AiOnboardingMissingField[] = [];
    if (!blueprint.businessName?.trim()) missing.push('business_name');
    if (!blueprint.providerCount) missing.push('provider_count');
    if (blueprint.services.length === 0) missing.push('services');
    return missing;
  }

  private normalizeServices(
    services: AiOnboardingServiceItem[],
  ): AiOnboardingServiceItem[] {
    return services.slice(0, 30).flatMap((service) => {
      const name = this.cleanText(service.name, 120);
      if (name.length < 2) return [];
      return [
        {
          name,
          price: this.clampInteger(service.price, 0, 10_000_000),
          durationMinutes: this.clampInteger(service.durationMinutes, 5, 1_440),
        },
      ];
    });
  }

  private normalizeWeeklyRules(
    rules: AiOnboardingWeeklyRule[],
  ): AiOnboardingWeeklyRule[] {
    return rules.slice(0, 14).flatMap((rule) => {
      if (
        !Number.isInteger(rule.weekday) ||
        rule.weekday < 0 ||
        rule.weekday > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/u.test(rule.startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/u.test(rule.endTime) ||
        rule.startTime >= rule.endTime
      ) {
        return [];
      }
      return [{ ...rule }];
    });
  }

  private normalizeQuickReplies(
    replies: AiOnboardingQuickReply[],
  ): AiOnboardingQuickReply[] {
    return replies.slice(0, 4).flatMap((reply) => {
      const label = this.cleanText(reply.label, 40);
      const message = this.cleanText(reply.message, 200);
      return label && message ? [{ label, message }] : [];
    });
  }

  private cloneBlueprint(
    blueprint: AiOnboardingBlueprint,
  ): AiOnboardingBlueprint {
    return {
      ...blueprint,
      services: blueprint.services.map((service) => ({ ...service })),
      weeklyRules: blueprint.weeklyRules.map((rule) => ({ ...rule })),
    };
  }

  private cleanText(value: string, maxLength: number): string {
    return value.replace(/\s+/gu, ' ').trim().slice(0, maxLength);
  }

  private clampInteger(
    value: number,
    minimum: number,
    maximum: number,
  ): number {
    if (!Number.isFinite(value)) return minimum;
    return Math.max(minimum, Math.min(Math.round(value), maximum));
  }

  private clampNumber(value: number, minimum: number, maximum: number): number {
    if (!Number.isFinite(value)) return minimum;
    return Math.max(minimum, Math.min(value, maximum));
  }

  private safeErrorName(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 80) : 'unknown';
  }
}

const MODEL_INSTRUCTIONS = `
Ты MAYA, спокойный и живой AI-помощник, который настраивает бизнес в MAYA OS через обычный разговор на русском языке.

Понимай разговорную речь, опечатки, сленг и короткие ответы в контексте уже собранных данных. Не требуй анкетного стиля. Задавай только один короткий вопрос за ход.

Критическое правило уверенности: если короткий ответ можно понять несколькими способами, не додумывай. Установи needs_clarification=true, confidence ниже 0.72, не добавляй спорное поле в accepted_fields, задай один уточняющий вопрос и предложи 2-4 быстрых ответа. Каждый quick reply содержит короткую label и самостоятельную message, которую frontend отправит следующим сообщением.

В accepted_fields включай только факты, явно сообщенные пользователем и понятые с высокой уверенностью. Пустое поле patch означает отсутствие изменения, а не удаление. Цены указывай в рублях целым числом, длительность в минутах. Если цена или длительность не названы, используй 0 и 60. Никогда не проси и не повторяй телефон, email, ФИО, токены CRM или иные персональные/секретные данные. Если встречается маркер [ИМЯ], [EMAIL], [ТЕЛЕФОН], [АККАУНТ], [ССЫЛКА], [СЕКРЕТ] или [НАЗВАНИЕ СКРЫТО], игнорируй его.

Если пользователь просит поставить услуги автоматически, взять стандартный набор, выбрать услуги за него или говорит «как обычно», используй use_template_services=true и добавь use_template_services в accepted_fields. Не своди отраслевой набор к одной консультации.

assistant_message должен звучать по-человечески, без канцелярита, без упоминания JSON, схемы, confidence или внутренних полей. Не утверждай, что бизнес уже создан: пока идет только сбор основы.`.trim();

const nullableString = { type: ['string', 'null'] } as const;
const MODEL_TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['provide_details', 'correction', 'smalltalk', 'unclear'],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    needs_clarification: { type: 'boolean' },
    assistant_message: { type: 'string' },
    clarification_question: nullableString,
    accepted_fields: {
      type: 'array',
      items: { type: 'string', enum: ACCEPTED_FIELDS },
    },
    quick_replies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['label', 'message'],
      },
    },
    patch: {
      type: 'object',
      additionalProperties: false,
      properties: {
        template_id: {
          type: ['string', 'null'],
          enum: [...BUSINESS_TEMPLATE_IDS, null],
        },
        business_name: nullableString,
        calendar_source: {
          type: ['string', 'null'],
          enum: [CalendarSource.INTERNAL, CalendarSource.EXTERNAL, null],
        },
        provider_count: { type: ['integer', 'null'], minimum: 1, maximum: 100 },
        use_template_services: { type: 'boolean' },
        services: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              price: { type: 'integer', minimum: 0, maximum: 10_000_000 },
              durationMinutes: { type: 'integer', minimum: 5, maximum: 1_440 },
            },
            required: ['name', 'price', 'durationMinutes'],
          },
        },
        weekly_rules: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              weekday: { type: 'integer', minimum: 0, maximum: 6 },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
            },
            required: ['weekday', 'startTime', 'endTime'],
          },
        },
      },
      required: [
        'template_id',
        'business_name',
        'calendar_source',
        'provider_count',
        'use_template_services',
        'services',
        'weekly_rules',
      ],
    },
  },
  required: [
    'intent',
    'confidence',
    'needs_clarification',
    'assistant_message',
    'clarification_question',
    'accepted_fields',
    'quick_replies',
    'patch',
  ],
} as const;

const MODEL_TURN_EXAMPLE = {
  intent: 'unclear',
  confidence: 0.4,
  needs_clarification: true,
  assistant_message: 'Хочу уточнить ваш ответ.',
  clarification_question: 'Вы работаете один или у вас есть команда?',
  accepted_fields: [],
  quick_replies: [
    { label: 'Работаю один', message: 'Я работаю один' },
    { label: 'Есть команда', message: 'У меня есть команда' },
  ],
  patch: {
    template_id: null,
    business_name: null,
    calendar_source: null,
    provider_count: null,
    use_template_services: false,
    services: [],
    weekly_rules: [],
  },
} satisfies ModelTurn;
