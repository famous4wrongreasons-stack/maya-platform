import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import {
  ASSISTANT_CAPABILITY_CATALOG,
  type AssistantCapability,
} from '../dashboard-preferences/assistant-capabilities.constants';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MayaBrainService } from '../ai-brain/maya-brain.service';
import type { MayaBrainContext } from '../ai-brain/maya-brain.types';
import { AiCoreModelService } from './ai-core-model.service';
import type {
  AiCoreMessage,
  AiCoreModelDecision,
  AiCoreToolDescriptor,
  AiCoreToolResult,
} from './ai-core.types';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

const MAX_CHAT_INPUT_BYTES = 16 * 1_024;
const COMMON_PERSON_NAME_FORMS = buildCommonPersonNameForms([
  'александр',
  'алексей',
  'алёна',
  'анастасия',
  'андрей',
  'анна',
  'антон',
  'артём',
  'борис',
  'вадим',
  'валерий',
  'валерия',
  'василий',
  'виктор',
  'виктория',
  'владимир',
  'дарья',
  'диана',
  'дмитрий',
  'евгений',
  'евгения',
  'егор',
  'екатерина',
  'елена',
  'иван',
  'илья',
  'ирина',
  'кирилл',
  'константин',
  'ксения',
  'максим',
  'маргарита',
  'марина',
  'мария',
  'михаил',
  'надежда',
  'наталья',
  'никита',
  'николай',
  'олег',
  'ольга',
  'павел',
  'пётр',
  'полина',
  'роман',
  'руслан',
  'светлана',
  'сергей',
  'софия',
  'станислав',
  'татьяна',
  'тимур',
  'фёдор',
  'юлия',
  'юрий',
  'ярослав',
]);

function buildCommonPersonNameForms(names: string[]): Set<string> {
  const forms = new Set<string>();
  for (const name of names) {
    forms.add(name);
    const final = name.at(-1);
    const stem = name.slice(0, -1);
    if (final === 'а') {
      ['а', 'ы', 'и', 'е', 'у', 'ой', 'ою'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'я') {
      ['я', 'и', 'е', 'ю', 'ей', 'ею'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'й') {
      ['й', 'я', 'ю', 'ем', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else if (final === 'ь') {
      ['ь', 'я', 'и', 'ю', 'ем', 'ью', 'е'].forEach((ending) =>
        forms.add(`${stem}${ending}`),
      );
    } else {
      ['', 'а', 'у', 'ом', 'е'].forEach((ending) =>
        forms.add(`${name}${ending}`),
      );
    }
  }
  return forms;
}

type ToolUsage = {
  name: string;
  status: string;
  execution_id: string | null;
};

type GroundingRequirement = {
  domain: string;
  toolNames: string[];
  strictNumbers: boolean;
};

type GroundingReport = {
  status: 'not_required' | 'verified' | 'blocked';
  domain: string | null;
  required_tools: string[];
  evidence_tools: string[];
};

type AiCoreCompletion = {
  reply: string;
  source: 'deepseek' | 'openai' | 'safe_fallback';
  action: Record<string, unknown> | null;
  grounding?: GroundingReport;
};

const GROUNDING_FACT_PATTERN =
  /(сколько|какая|какой|какие|покажи|показать|дай|посчитай|есть\s+ли|когда|кто|мои|моя|мой|у\s+меня|за\s+сегодня|за\s+вчера|за\s+недел[а-яёa-z]*|за\s+месяц[а-яёa-z]*|сегодня|завтра)/i;
const GROUNDING_ANALYTICS_PATTERN =
  /(выруч[а-яёa-z]*|оборот[а-яёa-z]*|касс[а-яёa-z]*|доход[а-яёa-z]*|зарплат[а-яёa-z]*|средн[а-яёa-z]*\s+чек|прибыл[а-яёa-z]*|марж[а-яёa-z]*|аналитик[а-яёa-z]*|статистик[а-яёa-z]*|показател[а-яёa-z]*|цифр[а-яёa-z]*)/i;
const GROUNDING_APPOINTMENT_METRIC_PATTERN =
  /(?:(?:сколько|количеств[а-яёa-z]*|числ[а-яёa-z]*).{0,32}запис[а-яёa-z]*|запис[а-яёa-z]*.{0,32}(?:за\s+)?(?:сегодня|вчера|недел[а-яёa-z]*|месяц[а-яёa-z]*))/i;
const GROUNDING_PERSONAL_SCOPE_PATTERN =
  /(моя|мой|мои|личн[а-яёa-z]*|у\s+меня|сколько\s+я|я\s+заработ)/i;
const GROUNDING_BUSINESS_SCOPE_PATTERN =
  /(бизнес[а-яёa-z]*|компан[а-яёa-z]*|по\s+всем|все\s+сотрудник[а-яёa-z]*|все\s+специалист[а-яёa-z]*|общ[а-яёa-z]*\s+(?:выруч|касс|статист)|мы\s+заработ)/i;
const GROUNDING_NUMBER_PATTERN =
  /(?<![\p{L}\p{N}_-])-?(?:\d{1,3}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_-])/gu;
const GROUNDING_SMALL_METRIC_PATTERN =
  /(?<number>\d{1,3}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:₽|руб\w*|%|балл\w*|бонус\w*|визит\w*|клиент\w*|запис\w*|минут\w*|час\w*|специалист\w*)/giu;
const ASSISTANT_MANAGER_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
]);

@Injectable()
export class AiCoreService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly runtime: AiToolRuntimeService,
    private readonly model: AiCoreModelService,
    private readonly auditLog: AuditLogService,
    private readonly dashboardPreferences: DashboardPreferencesService,
    private readonly staffScheduleCommand: StaffScheduleCommandService,
    private readonly brain: MayaBrainService,
  ) {}

  async chat(user: AuthenticatedUser, dto: AiCoreChatDto) {
    const tenantId = this.requireTenant(user);
    await this.rateLimit.assertTenant('ai_chat', {
      tenantId,
      identity: user.userId,
    });
    const sanitized = this.sanitizeMessages(dto.messages);
    const brain = await this.brain.prepare(user, dto, sanitized.messages);
    const scheduleCommand = await this.staffScheduleCommand.tryHandle(
      user,
      dto,
    );
    if (scheduleCommand) {
      return this.complete(
        user,
        dto,
        brain,
        false,
        scheduleCommand.toolUsage ? [scheduleCommand.toolUsage] : [],
        [],
        {
          reply: scheduleCommand.reply,
          source: 'safe_fallback',
          action: scheduleCommand.action,
        },
      );
    }
    const assistantCommand = await this.handleAssistantCommand(
      user,
      sanitized.messages,
    );
    if (assistantCommand) {
      return this.complete(user, dto, brain, sanitized.redacted, [], [], {
        ...assistantCommand,
        source: 'safe_fallback',
        action: null,
      });
    }
    if (
      brain.active &&
      brain.knowledgeRequired &&
      brain.knowledge.length === 0
    ) {
      return this.complete(user, dto, brain, sanitized.redacted, [], [], {
        reply:
          'В базе знаний пока нет подтверждённого материала по этому вопросу. Я не буду придумывать ответ — добавьте источник или сформулируйте запрос точнее.',
        source: 'safe_fallback',
        action: null,
      });
    }
    const listed = await this.runtime.listTools(user, dto.surface);
    const tools: AiCoreToolDescriptor[] = listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_tier: tool.risk_tier,
      approval_policy: tool.approval_policy,
    }));
    const allowedNames = new Set(tools.map((tool) => tool.name));
    const toolResults: AiCoreToolResult[] = [];
    const toolsUsed: ToolUsage[] = [];
    const decisions: AiCoreModelDecision[] = [];
    const signatures = new Set<string>();
    const maxToolSteps = this.maxToolSteps();
    const requirement = this.groundingRequirement(
      sanitized.messages,
      allowedNames,
    );
    const requiredToolNames =
      requirement?.toolNames.filter((name) => allowedNames.has(name)) ?? [];
    let groundingRetries = 0;

    try {
      if (requirement && requiredToolNames.length === 0) {
        return this.complete(
          user,
          dto,
          brain,
          sanitized.redacted,
          toolsUsed,
          decisions,
          this.groundingFallback(requirement, toolResults, true),
        );
      }
      for (let step = 0; step <= maxToolSteps; step += 1) {
        const requirementSatisfied = this.groundingSatisfied(
          requirement,
          toolResults,
        );
        if (requirement && !requirementSatisfied && step >= maxToolSteps) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            this.groundingFallback(requirement, toolResults),
          );
        }
        const decision = await this.model.decide({
          surface: dto.surface,
          persona: brain.persona,
          messages: sanitized.messages,
          tools,
          toolResults: [...toolResults],
          allowToolCall: step < maxToolSteps,
          requiredToolNames:
            requirement && !requirementSatisfied ? requiredToolNames : [],
          brain,
        });
        if (!decision) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply:
                'MAYA AI пока не подключена к этой среде. Доступные функции защищены и станут доступны после настройки серверного AI-ключа.',
              source: 'safe_fallback',
              action: null,
              grounding: this.groundingReport(
                requirement,
                requirement ? 'blocked' : 'not_required',
                toolResults,
              ),
            },
          );
        }
        decisions.push(decision);
        if (!decision.toolCall) {
          if (requirement && !requirementSatisfied) {
            if (groundingRetries < 1 && step < maxToolSteps) {
              groundingRetries += 1;
              continue;
            }
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              this.groundingFallback(requirement, toolResults),
            );
          }
          const reply = this.plainReply(decision.reply);
          if (
            requirement &&
            !this.groundedNumbersMatch(
              reply,
              requirement,
              toolResults,
              this.latestUserText(sanitized.messages),
            )
          ) {
            return this.complete(
              user,
              dto,
              brain,
              sanitized.redacted,
              toolsUsed,
              decisions,
              this.groundingFallback(requirement, toolResults),
            );
          }
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply,
              source: decision.provider,
              action: null,
              grounding: this.groundingReport(
                requirement,
                requirement ? 'verified' : 'not_required',
                toolResults,
              ),
            },
          );
        }
        if (step >= maxToolSteps) {
          this.modelFailure('ai_model_tool_step_limit');
        }
        if (!allowedNames.has(decision.toolCall.name)) {
          this.modelFailure('ai_model_tool_not_allowed');
        }
        if (
          requirement &&
          !requirementSatisfied &&
          !requiredToolNames.includes(decision.toolCall.name)
        ) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            this.groundingFallback(requirement, toolResults),
          );
        }
        const signature = this.toolSignature(
          decision.toolCall.name,
          decision.toolCall.arguments,
        );
        if (signatures.has(signature)) {
          this.modelFailure('ai_model_repeated_tool_call');
        }
        signatures.add(signature);

        let execution: Record<string, unknown>;
        try {
          execution = this.record(
            await this.runtime.execute(user, decision.toolCall.name, {
              surface: dto.surface,
              arguments: decision.toolCall.arguments,
              idempotencyKey: this.toolIdempotencyKey(
                tenantId,
                user.userId,
                dto.requestId,
                step,
                decision.toolCall.name,
              ),
            }),
          );
        } catch (error) {
          if (error instanceof BadRequestException) {
            this.modelFailure('ai_model_tool_arguments_invalid');
          }
          throw error;
        }
        const status =
          typeof execution.status === 'string' ? execution.status : 'unknown';
        const executionId =
          typeof execution.execution_id === 'string'
            ? execution.execution_id
            : null;
        toolsUsed.push({
          name: decision.toolCall.name,
          status,
          execution_id: executionId,
        });
        if (status === 'approval_required') {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply: 'Действие подготовлено и ждёт вашего подтверждения.',
              source: decision.provider,
              action: {
                status: 'approval_required',
                approval: execution.approval ?? null,
              },
              grounding: this.groundingReport(
                requirement,
                requirement ? 'verified' : 'not_required',
                toolResults,
              ),
            },
          );
        }
        if (status !== 'completed' || !('result' in execution)) {
          this.modelFailure('ai_tool_result_unavailable');
        }
        const safeResult = this.sanitizeToolResult(execution.result);
        toolResults.push({
          name: decision.toolCall.name,
          result: safeResult,
        });
        const deterministicReply = this.deterministicGroundedReply(
          requirement,
          toolResults,
          this.latestUserText(sanitized.messages),
        );
        if (deterministicReply) {
          return this.complete(
            user,
            dto,
            brain,
            sanitized.redacted,
            toolsUsed,
            decisions,
            {
              reply: deterministicReply,
              source: decision.provider,
              action: null,
              grounding: this.groundingReport(
                requirement,
                'verified',
                toolResults,
              ),
            },
          );
        }
      }
      this.modelFailure('ai_model_tool_step_limit');
    } catch (error) {
      await this.auditLog.log({
        tenantId,
        userId: user.userId,
        action: 'ai.core_turn_failed',
        entityType: 'ai_core_turn',
        entityId: dto.requestId,
        metadata: {
          surface: dto.surface,
          error_code: this.safeErrorCode(error),
          model_calls: decisions.length,
          tools_started: toolsUsed.length,
          redacted_input: sanitized.redacted,
        },
      });
      throw error;
    }
  }

  private async handleAssistantCommand(
    user: AuthenticatedUser,
    messages: AiCoreMessage[],
  ): Promise<{ reply: string } | null> {
    const text = this.latestUserText(messages)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[!?.,:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return null;

    const asksCapabilities =
      /(что\s+ты\s+умеешь|что\s+умеет\s+(?:майя|maya)|возможност[а-яa-z]*\s+(?:майи|maya)|на\s+что\s+ты\s+способна|познакомься|расскажи\s+(?:о\s+себе|что\s+можешь)|настро(?:ить|й)\s+анализ)/i.test(
        text,
      );
    const togglesOn =
      /(?:^|\s)(?:включи|подключи|активируй|добавь)(?:\s|$)/i.test(text);
    const togglesOff =
      /(?:^|\s)(?:выключи|отключи|деактивируй|убери)(?:\s|$)/i.test(text);
    const requested = this.requestedAssistantCapabilities(text);
    const isClient =
      user.role === UserRole.CLIENT || user.role === UserRole.CUSTOMER;

    if (isClient) {
      if (!asksCapabilities) return null;
      return {
        reply:
          'Я MAYA, помощница вашего бизнеса. Помогу выбрать услугу и мастера, найти реальное свободное время, записаться, показать ваши записи и проверить баллы. Личные и финансовые данные других людей я не раскрываю.',
      };
    }

    if (!ASSISTANT_MANAGER_ROLES.has(user.role)) {
      if (togglesOn || togglesOff) {
        return {
          reply:
            'Настройки аналитики меняет владелец или администратор. Я продолжу отвечать на доступные вашей роли вопросы о рабочем дне и личных показателях.',
        };
      }
      if (!asksCapabilities) return null;
      return {
        reply:
          'Я MAYA, ваша рабочая помощница. Могу показать личный план дня, записи, свободные окна и доступные вашей роли показатели. Данные бизнеса и клиентов всегда ограничены серверными правами доступа.',
      };
    }

    if (!asksCapabilities && !togglesOn && !togglesOff) return null;
    const tenantId = this.requireTenant(user);
    const preferences = await this.dashboardPreferences.getAssistant(
      tenantId,
      user.userId,
    );
    const enabled = new Set<AssistantCapability>(
      preferences.config.enabled_capabilities,
    );

    if ((togglesOn || togglesOff) && requested.length > 0) {
      for (const capability of requested) {
        if (togglesOn) enabled.add(capability);
        if (togglesOff) enabled.delete(capability);
      }
      const updated = await this.dashboardPreferences.updateAssistant(
        tenantId,
        user.userId,
        { enabledCapabilities: [...enabled] },
      );
      const changed = requested
        .map((capability) => this.assistantCapabilityTitle(capability))
        .join(', ');
      return {
        reply: `${togglesOn ? 'Включила' : 'Отключила'}: ${changed}. ${this.assistantCapabilitiesSummary(updated.config.enabled_capabilities)}`,
      };
    }

    if (togglesOn || togglesOff) {
      return {
        reply: `${this.assistantCapabilitiesSummary([...enabled])} Напишите, например: «включи анализ сотрудников» или «отключи ежедневную сводку».`,
      };
    }

    return {
      reply: `Я MAYA, ваша операционная помощница. Работаю только с данными, которые подтверждены CRM и разрешены вашей ролью. ${this.assistantCapabilitiesSummary([...enabled])} Настройки можно менять прямо здесь командами «включи...» и «отключи...».`,
    };
  }

  private requestedAssistantCapabilities(text: string): AssistantCapability[] {
    const result: AssistantCapability[] = [];
    const add = (capability: AssistantCapability, pattern: RegExp) => {
      if (pattern.test(text) && !result.includes(capability)) {
        result.push(capability);
      }
    };
    add(
      'daily_brief',
      /(ежедневн|утренн|дневн|сводк[а-яa-z]*\s+дн|план[а-яa-z]*\s+на\s+день)/i,
    );
    add(
      'finance_analytics',
      /(финанс|касс|деньг|выруч|оборот|средн[а-яa-z]*\s+чек)/i,
    );
    add(
      'staff_performance',
      /(сотрудник|мастер|специалист|команд|персонал|исполнен[а-яa-z]*\s+план)/i,
    );
    add(
      'client_return',
      /(возврат[а-яa-z]*\s+клиент|клиент[а-яa-z]*\s+верн|просроченн[а-яa-z]*\s+цикл)/i,
    );
    add(
      'business_analytics',
      /(анализ[а-яa-z]*\s+бизнес|бизнес[а-яa-z]*\s+аналитик|общ[а-яa-z]*\s+показател)/i,
    );
    return result;
  }

  private assistantCapabilityTitle(capability: AssistantCapability): string {
    return (
      ASSISTANT_CAPABILITY_CATALOG.find((item) => item.key === capability)
        ?.title ?? capability
    );
  }

  private assistantCapabilitiesSummary(
    enabledCapabilities: AssistantCapability[],
  ): string {
    const enabled = new Set(enabledCapabilities);
    const lines = ASSISTANT_CAPABILITY_CATALOG.map(
      (item) =>
        `${enabled.has(item.key) ? 'включено' : 'выключено'} — ${item.title}`,
    );
    return `Ваши модули: ${lines.join('; ')}.`;
  }

  private async complete(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
    brain: MayaBrainContext,
    redacted: boolean,
    toolsUsed: ToolUsage[],
    decisions: AiCoreModelDecision[],
    response: AiCoreCompletion,
  ) {
    const citedIds = [
      ...new Set(decisions.flatMap((decision) => decision.citationIds ?? [])),
    ];
    const citations = this.brain.citations(brain, citedIds);
    const missingRequiredCitation =
      brain.active && brain.knowledgeRequired && citations.length === 0;
    const completedResponse: AiCoreCompletion = missingRequiredCitation
      ? {
          reply:
            'Не нашла подтверждённого ответа в базе знаний. Я не буду дополнять его догадками.',
          source: 'safe_fallback',
          action: null,
        }
      : response;
    const grounding =
      completedResponse.grounding ??
      this.groundingReport(null, 'not_required', []);
    const usage = decisions.reduce(
      (totals, decision) => ({
        input_tokens: this.addTokenCount(
          totals.input_tokens,
          decision.usage.inputTokens,
        ),
        output_tokens: this.addTokenCount(
          totals.output_tokens,
          decision.usage.outputTokens,
        ),
        total_tokens: this.addTokenCount(
          totals.total_tokens,
          decision.usage.totalTokens,
        ),
      }),
      {
        input_tokens: null as number | null,
        output_tokens: null as number | null,
        total_tokens: null as number | null,
      },
    );
    const plan = await this.brain.recordOutcome(brain, {
      toolNames: toolsUsed.map((tool) => tool.name),
      approvalRequired: completedResponse.action !== null,
      blocked: missingRequiredCitation || grounding.status === 'blocked',
      citedIds: citations.map((citation) => citation.id),
    });
    await this.auditLog.log({
      tenantId: this.requireTenant(user),
      userId: user.userId,
      action: 'ai.core_turn_completed',
      entityType: 'ai_core_turn',
      entityId: dto.requestId,
      metadata: {
        surface: dto.surface,
        source: completedResponse.source,
        models: [...new Set(decisions.map((decision) => decision.model))],
        model_calls: decisions.length,
        tools_used: toolsUsed.map((tool) => tool.name),
        outcome: completedResponse.action ? 'approval_required' : 'reply',
        brain_profile: brain.profile,
        brain_active: brain.active,
        brain_intent: brain.intent,
        brain_prompt_version: brain.promptVersion,
        brain_plan_status: plan.status,
        brain_memory_keys: brain.preferences.map((item) => item.key),
        brain_citation_count: citations.length,
        grounding_status: grounding.status,
        grounding_domain: grounding.domain,
        grounding_evidence_tools: grounding.evidence_tools,
        redacted_input: redacted,
        ...usage,
      },
    });
    return {
      request_id: dto.requestId,
      reply: completedResponse.reply,
      source: completedResponse.source,
      redacted_input: redacted,
      action: completedResponse.action,
      tools_used: toolsUsed,
      grounding,
      citations,
      brain: {
        session_id: brain.sessionId,
        active: brain.active,
        profile: brain.profile,
        intent: brain.intent,
        prompt_version: brain.promptVersion,
        plan,
        memory_applied: brain.preferences.map((item) => item.key),
      },
    };
  }

  private groundingRequirement(
    messages: AiCoreMessage[],
    allowedNames: Set<string>,
  ): GroundingRequirement | null {
    const text = this.latestUserText(messages).toLowerCase().replace(/ё/g, 'е');
    if (!text) {
      return null;
    }
    const factRequest = GROUNDING_FACT_PATTERN.test(text);

    if (
      /(баланс[а-яёa-z]*|сколько\s+.*(?:балл|бонус)|мои\s+(?:балл|бонус)|(?:потрат|спис|оплат)[а-яёa-z]*.*(?:балл|бонус)|на\s+что.*(?:балл|бонус))[а-яёa-z]*/i.test(
        text,
      )
    ) {
      return this.requireGrounding('client_loyalty', ['loyalty.own.read']);
    }
    if (
      /(мои\s+запис[а-яёa-z]*|(?:какие|сколько)\s+у\s+меня\s+запис[а-яёa-z]*|когда\s+я\s+записан[а-яёa-z]*|истори[а-яёa-z]*\s+(?:моих\s+)?запис[а-яёa-z]*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('client_appointments', [
        'appointments.own.list',
      ]);
    }
    if (
      /(свободн[а-яёa-z]*\s+(?:окн[а-яёa-z]*|врем[а-яёa-z]*|слот[а-яёa-z]*)|ближайш[а-яёa-z]*\s+(?:окн[а-яёa-z]*|врем[а-яёa-z]*|слот[а-яёa-z]*)|есть\s+ли\s+(?:окн[а-яёa-z]*|мест[а-яёa-z]*|врем[а-яёa-z]*)|когда\s+можно\s+запис)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('booking_availability', [
        'booking.availability.read',
      ]);
    }
    if (
      !/(подписк\w*|тариф\w*|maya|майя)/i.test(text) &&
      /(сколько\s+стоит|цен[а-яёa-z]*|прайс[а-яёa-z]*|какие\s+услуг[а-яёa-z]*|длительн[а-яёa-z]*\s+услуг[а-яёa-z]*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('service_catalog', [
        'catalog.services.read',
      ]);
    }
    if (
      /(кто\s+работает|график[а-яёa-z]*\s+(?:работ|мастер|специалист)|смен[а-яёa-z]*|выходн[а-яёa-z]*)/i.test(
        text,
      ) &&
      factRequest
    ) {
      // Availability is not a work roster, so this remains blocked until a
      // dedicated tenant-scoped schedule tool exists.
      return this.requireGrounding('staff_schedule', ['staff.schedule.read']);
    }
    if (
      /(какие\s+(?:мастер|специалист)[а-яёa-z]*|кто\s+(?:из\s+)?(?:мастер|специалист)[а-яёa-z]*|выбрать\s+(?:мастер|специалист)[а-яёa-z]*)/i.test(
        text,
      ) &&
      !/(лучш[а-яёa-z]*|выруч[а-яёa-z]*|заработ[а-яёa-z]*|эффектив[а-яёa-z]*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('staff_catalog', ['catalog.staff.read']);
    }
    if (/(расход[а-яёa-z]*|затрат[а-яёa-z]*)/i.test(text) && factRequest) {
      return this.requireGrounding('business_expenses', ['expenses.read']);
    }
    if (
      /(сколько\s+(?:у\s+нас\s+)?клиент[а-яёa-z]*|количеств[а-яёa-z]*\s+клиент[а-яёa-z]*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('customer_count', ['customers.count']);
    }
    if (
      ((GROUNDING_ANALYTICS_PATTERN.test(text) ||
        GROUNDING_APPOINTMENT_METRIC_PATTERN.test(text)) &&
        factRequest) ||
      /(сводк[а-яёa-z]*|что\s+у\s+нас\s+сегодня)/i.test(text)
    ) {
      const personal = GROUNDING_PERSONAL_SCOPE_PATTERN.test(text);
      const business = GROUNDING_BUSINESS_SCOPE_PATTERN.test(text);
      if (personal) {
        return this.requireGrounding('personal_analytics', [
          'analytics.employee.read',
        ]);
      }
      if (business) {
        return this.requireGrounding('business_analytics', [
          'analytics.business.read',
        ]);
      }
      if (
        allowedNames.has('analytics.employee.read') &&
        !allowedNames.has('analytics.business.read')
      ) {
        return this.requireGrounding('personal_analytics', [
          'analytics.employee.read',
        ]);
      }
      return this.requireGrounding('business_analytics', [
        'analytics.business.read',
      ]);
    }
    return null;
  }

  private requireGrounding(
    domain: string,
    toolNames: string[],
  ): GroundingRequirement {
    return { domain, toolNames, strictNumbers: true };
  }

  private groundingSatisfied(
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
  ): boolean {
    return (
      !requirement ||
      toolResults.some((result) => requirement.toolNames.includes(result.name))
    );
  }

  private groundingReport(
    requirement: GroundingRequirement | null,
    status: GroundingReport['status'],
    toolResults: AiCoreToolResult[],
  ): GroundingReport {
    return {
      status,
      domain: requirement?.domain ?? null,
      required_tools: requirement?.toolNames ?? [],
      evidence_tools: requirement
        ? [
            ...new Set(
              toolResults
                .map((result) => result.name)
                .filter((name) => requirement.toolNames.includes(name)),
            ),
          ]
        : [],
    };
  }

  private groundingFallback(
    requirement: GroundingRequirement,
    toolResults: AiCoreToolResult[],
    unavailableForCurrentAccess = false,
  ) {
    return {
      reply: unavailableForCurrentAccess
        ? 'Этот запрос недоступен для вашей текущей роли или тарифа. MAYA не покажет чужие или закрытые данные.'
        : 'Не смогла подтвердить данные в защищённом источнике MAYA. Чтобы не показать неверные цифры или факты, попробуйте повторить запрос позже.',
      source: 'safe_fallback' as const,
      action: null,
      grounding: this.groundingReport(requirement, 'blocked', toolResults),
    };
  }

  private deterministicGroundedReply(
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): string | null {
    if (requirement?.domain === 'booking_availability') {
      const evidence = toolResults.find(
        (result) => result.name === 'booking.availability.read',
      );
      if (!evidence) {
        return null;
      }
      const slots = this.record(evidence.result).slots;
      if (!Array.isArray(slots)) {
        return null;
      }
      const dateMatch = userText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      const dateLabel = dateMatch
        ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}`
        : 'выбранную дату';
      if (slots.length === 0) {
        return `На ${dateLabel} свободных окон нет. Проверить другую дату?`;
      }
      return `На ${dateLabel} есть свободные окна: ${slots.length} ${this.pluralize(slots.length, 'вариант', 'варианта', 'вариантов')} времени. Уточните специалиста или услугу, чтобы сузить выбор.`;
    }

    if (requirement?.domain === 'client_loyalty') {
      const evidence = toolResults.find(
        (result) => result.name === 'loyalty.own.read',
      );
      if (!evidence) {
        return null;
      }
      const loyalty = this.record(evidence.result);
      const balance = this.safeMetricNumber(loyalty.balance);
      const balanceLabel = `${this.formatMetricNumber(balance)} ${this.pluralize(balance, 'балл', 'балла', 'баллов')}`;
      const text = userText.toLowerCase().replace(/ё/g, 'е');
      if (!/(потрат|спис|оплат|на\s+что)/i.test(text)) {
        return `Ваш баланс: ${balanceLabel}.`;
      }
      const spend = this.record(loyalty.spend_options);
      const items = Array.isArray(spend.items)
        ? spend.items
            .slice(0, 3)
            .map((entry) => {
              const item = this.record(entry);
              if (typeof item.name !== 'string') {
                return null;
              }
              const points = this.safeMetricNumber(item.points_required);
              return `${item.name} — ${this.formatMetricNumber(points)} ${this.pluralize(points, 'балл', 'балла', 'баллов')}`;
            })
            .filter((entry): entry is string => entry !== null)
        : [];
      return items.length > 0
        ? `Ваш баланс: ${balanceLabel}. Можно рассмотреть: ${items.join('; ')}. Перед списанием MAYA ещё раз проверит сумму и попросит подтверждение.`
        : `Ваш баланс: ${balanceLabel}. Подходящих услуг для списания сейчас нет.`;
    }

    if (requirement?.domain === 'client_appointments') {
      const evidence = toolResults.find(
        (result) => result.name === 'appointments.own.list',
      );
      if (!evidence) {
        return null;
      }
      const appointments = this.record(evidence.result).appointments;
      if (!Array.isArray(appointments) || appointments.length === 0) {
        return 'У вас пока нет записей.';
      }
      const upcoming = appointments.filter((entry) => {
        const item = this.record(entry);
        return item.is_upcoming === true && item.status !== 'canceled';
      }).length;
      const cancelled = appointments.filter(
        (entry) => this.record(entry).status === 'canceled',
      ).length;
      return `В вашей истории ${appointments.length} ${this.pluralize(appointments.length, 'запись', 'записи', 'записей')}. Предстоящих: ${upcoming}, отменённых: ${cancelled}. Подробности доступны в разделе «Записи».`;
    }

    if (
      requirement?.domain !== 'business_analytics' &&
      requirement?.domain !== 'personal_analytics'
    ) {
      return null;
    }
    const toolName =
      requirement.domain === 'personal_analytics'
        ? 'analytics.employee.read'
        : 'analytics.business.read';
    const evidence = toolResults.find((result) => result.name === toolName);
    if (!evidence) {
      return null;
    }
    const data = this.record(evidence.result);
    const finance = this.record(data.finance);
    const payroll = this.record(finance.payroll);
    const text = userText.toLowerCase().replace(/ё/g, 'е');
    const scope =
      requirement.domain === 'personal_analytics' ? 'вашим данным' : 'бизнесу';

    if (/зарплат[а-яa-z]*/i.test(text)) {
      const accrued = this.formatMoneyAmount(payroll.accrued_total);
      if (
        requirement.domain === 'business_analytics' &&
        payroll.status === 'available' &&
        payroll.verified === true &&
        accrued
      ) {
        const paid = this.formatMoneyAmount(payroll.paid_total);
        const balance = this.formatMoneyAmount(payroll.balance_total);
        return [
          `Начислено сотрудникам по данным CRM за выбранный период: ${accrued}.`,
          paid ? `Выплачено: ${paid}.` : null,
          balance ? `Остаток к выплате: ${balance}.` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' ');
      }
      if (payroll.status === 'partial') {
        return 'CRM вернула расчёт зарплаты не по всем сотрудникам, поэтому общую сумму я не называю. Проверьте права финансового доступа в CRM.';
      }
      return 'Подтверждённый расчёт зарплаты за выбранный период недоступен. Я не буду рассчитывать его приблизительно из выручки.';
    }
    if (/валов[а-яa-z]*\s+прибыл[а-яa-z]*/i.test(text)) {
      return 'Валовая прибыль сейчас не рассчитывается: в данных есть выручка и внесённые расходы, но прямые затраты на оказание услуг не выделены отдельно. Я не буду подменять её выручкой или операционным результатом.';
    }
    if (/марж[а-яa-z]*/i.test(text)) {
      return 'Маржа сейчас не рассчитывается отдельным подтверждённым показателем. Нужна классификация прямых затрат, поэтому я не буду выводить её из выручки приблизительно.';
    }
    if (/средн[а-яa-z]*\s+чек/i.test(text)) {
      const averageTicket = this.formatVerifiedMoneyEntries(
        data.average_ticket,
      );
      return averageTicket
        ? `Средний чек по ${scope} за выбранный период: ${averageTicket}.`
        : `Подтверждённый средний чек по ${scope} за выбранный период недоступен. Я не буду выводить его из стоимости записей приблизительно.`;
    }
    if (GROUNDING_APPOINTMENT_METRIC_PATTERN.test(text)) {
      const appointments = this.record(data.appointments);
      const total = this.safeMetricNumber(appointments.total);
      const active = this.safeMetricNumber(appointments.active);
      const cancelled = this.safeMetricNumber(appointments.cancelled);
      return `Записей по ${scope} за выбранный период: ${total}. Активных: ${active}, отменённых: ${cancelled}.`;
    }
    if (/чист[а-яa-z]*\s+прибыл[а-яa-z]*|прибыл[а-яa-z]*/i.test(text)) {
      const net = this.formatVerifiedMoneyEntries(data.net);
      return net
        ? `Операционный результат по ${scope} за выбранный период: ${net}. Это выручка минус внесённые расходы, а не бухгалтерская чистая прибыль.`
        : `Операционный результат по ${scope} за выбранный период недоступен: CRM не передала полный набор подтверждённых расходов. Я не буду подменять прибыль выручкой.`;
    }
    if (
      /выруч[а-яa-z]*|оборот[а-яa-z]*|касс[а-яa-z]*|доход[а-яa-z]*/i.test(text)
    ) {
      const revenue = this.formatVerifiedMoneyEntries(data.revenue);
      if (!revenue) {
        return `Подтверждённые денежные поступления по ${scope} за выбранный период недоступны. Я не буду использовать вместо них стоимость записей.`;
      }
      return finance.source === 'external_crm'
        ? `Подтверждённые поступления по данным CRM за выбранный период: ${revenue}.`
        : `Выручка по ${scope} за выбранный период: ${revenue}.`;
    }
    return null;
  }

  private formatMoneyEntries(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) {
      return '0 ₽';
    }
    const formatted = value
      .map((entry) => {
        const item = this.record(entry);
        const majorUnits =
          typeof item.amount_major_units === 'number'
            ? item.amount_major_units
            : typeof item.amount_kopecks === 'number'
              ? item.amount_kopecks / 100
              : null;
        if (majorUnits === null || !Number.isFinite(majorUnits)) {
          return null;
        }
        const currency =
          typeof item.currency === 'string' ? item.currency.toUpperCase() : '';
        const currencyLabel =
          { RUB: '₽', USD: '$', EUR: '€', KZT: '₸' }[currency] || currency;
        const amount = new Intl.NumberFormat('ru-RU', {
          maximumFractionDigits: 2,
        })
          .format(majorUnits)
          .replace(/\u00a0/g, ' ');
        return `${amount}${currencyLabel ? ` ${currencyLabel}` : ''}`;
      })
      .filter((entry): entry is string => entry !== null);
    return formatted.length > 0 ? formatted.join(', ') : '0 ₽';
  }

  private formatVerifiedMoneyEntries(value: unknown): string | null {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }
    const valid = value.filter((entry) => {
      const item = this.record(entry);
      return (
        (typeof item.amount_major_units === 'number' &&
          Number.isFinite(item.amount_major_units)) ||
        (typeof item.amount_kopecks === 'number' &&
          Number.isFinite(item.amount_kopecks))
      );
    });
    return valid.length > 0 ? this.formatMoneyEntries(valid) : null;
  }

  private formatMoneyAmount(value: unknown): string | null {
    return this.formatVerifiedMoneyEntries([value]);
  }

  private safeMetricNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private formatMetricNumber(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: 2,
    })
      .format(value)
      .replace(/\u00a0/g, ' ');
  }

  private pluralize(
    value: number,
    one: string,
    few: string,
    many: string,
  ): string {
    const remainder10 = Math.abs(value) % 10;
    const remainder100 = Math.abs(value) % 100;
    if (remainder10 === 1 && remainder100 !== 11) {
      return one;
    }
    if (
      remainder10 >= 2 &&
      remainder10 <= 4 &&
      (remainder100 < 12 || remainder100 > 14)
    ) {
      return few;
    }
    return many;
  }

  private latestUserText(messages: AiCoreMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'user' && message.content.trim()) {
        return message.content.trim();
      }
    }
    return '';
  }

  private groundedNumbersMatch(
    reply: string,
    requirement: GroundingRequirement | null,
    toolResults: AiCoreToolResult[],
    userText: string,
  ): boolean {
    if (!requirement?.strictNumbers) {
      return true;
    }
    const claims = this.groundingClaims(reply);
    if (claims.size === 0) {
      return true;
    }
    const allowed = this.groundingNumbers(toolResults);
    for (const value of this.groundingNumbers(userText)) {
      allowed.add(value);
    }
    return [...claims].every((claim) => allowed.has(claim));
  }

  private groundingClaims(value: string): Set<string> {
    const claims = new Set<string>();
    for (const match of value.matchAll(GROUNDING_NUMBER_PATTERN)) {
      const normalized = this.normalizeGroundingNumber(match[0]);
      if (normalized !== null && Math.abs(Number(normalized)) > 10) {
        claims.add(normalized);
      }
    }
    for (const match of value.matchAll(GROUNDING_SMALL_METRIC_PATTERN)) {
      const normalized = this.normalizeGroundingNumber(match.groups?.number);
      if (normalized !== null) {
        claims.add(normalized);
      }
    }
    return claims;
  }

  private groundingNumbers(value: unknown): Set<string> {
    const values = new Set<string>();
    if (Array.isArray(value)) {
      value.forEach((item) => {
        for (const number of this.groundingNumbers(item)) {
          values.add(number);
        }
      });
      return values;
    }
    if (value !== null && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) => {
        for (const number of this.groundingNumbers(item)) {
          values.add(number);
        }
      });
      return values;
    }
    const normalized = this.normalizeGroundingNumber(value);
    if (normalized !== null) {
      values.add(normalized);
      return values;
    }
    if (typeof value === 'string') {
      for (const match of value.matchAll(GROUNDING_NUMBER_PATTERN)) {
        const number = this.normalizeGroundingNumber(match[0]);
        if (number !== null) {
          values.add(number);
        }
      }
    }
    return values;
  }

  private normalizeGroundingNumber(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }
    const normalized = String(value)
      .replace(/[\s\u00a0]/g, '')
      .replace(',', '.');
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
      return null;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Number.isInteger(parsed)
      ? String(parsed)
      : String(parsed).replace(/0+$/, '').replace(/\.$/, '');
  }

  private sanitizeMessages(messages: AiCoreChatDto['messages']): {
    messages: AiCoreMessage[];
    redacted: boolean;
  } {
    let redacted = false;
    const sanitized = messages.map((message) => {
      const sensitive = this.redactSensitiveText(message.content);
      const names = this.redactLikelyProperNames(sensitive.content);
      redacted ||= sensitive.redacted || names.redacted;
      return { role: message.role, content: names.content };
    });
    if (
      Buffer.byteLength(JSON.stringify(sanitized), 'utf8') >
      MAX_CHAT_INPUT_BYTES
    ) {
      throw new BadRequestException({
        message: 'AI chat input is too large.',
        error: { code: 'ai_chat_input_too_large' },
      });
    }
    return { messages: sanitized, redacted };
  }

  private redactSensitiveText(value: string): {
    content: string;
    redacted: boolean;
  } {
    let content = this.stripControlCharacters(value)
      .replace(/\s+/g, ' ')
      .trim();
    const original = content;
    content = content
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, '[secret removed]')
      .replace(
        /\b(?:sk|rk|dk|api)[-_][A-Za-z0-9_-]{16,}\b/gi,
        '[secret removed]',
      )
      .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[email removed]')
      .replace(/https?:\/\/[^\s]+/gi, '[link removed]')
      .replace(/(?<!\d)\+?\d[\d\s().-]{7,}\d(?!\d)/g, (candidate) =>
        /^\d{4}-\d{2}-\d{2}$/.test(candidate.trim())
          ? candidate
          : '[phone removed]',
      )
      .replace(/\b\d(?:[ -]?\d){11,18}\b/g, '[number removed]')
      .replace(
        /(^|[\s,;:])(клиент(?:а|у|ом)?|сотрудник(?:а|у|ом)?|мастер(?:а|у|ом)?|врач(?:а|у|ом)?)\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,40}(?=$|[\s,.;:!?])/giu,
        '$1$2 [name removed]',
      )
      .replace(
        /(^|[\s,;:])(меня|его|её|ее)\s+зовут\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,40}(?=$|[\s,.;:!?])/giu,
        '$1$2 зовут [name removed]',
      );
    return { content, redacted: content !== original };
  }

  private redactLikelyProperNames(value: string): {
    content: string;
    redacted: boolean;
  } {
    const pattern = /[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,40}/gu;
    let content = '';
    let cursor = 0;
    let redacted = false;
    for (const match of value.matchAll(pattern)) {
      const word = match[0];
      const index = match.index ?? cursor;
      content += value.slice(cursor, index);
      const normalized = word.toLowerCase();
      if (COMMON_PERSON_NAME_FORMS.has(normalized)) {
        content += '[name removed]';
        redacted = true;
      } else {
        content += word;
      }
      cursor = index + word.length;
    }
    content += value.slice(cursor);
    return { content, redacted };
  }

  private toolIdempotencyKey(
    tenantId: string,
    userId: string,
    requestId: string,
    step: number,
    toolName: string,
  ): string {
    return `ai-chat-${createHash('sha256')
      .update(`${tenantId}\0${userId}\0${requestId}\0${step}\0${toolName}`)
      .digest('hex')}`;
  }

  private toolSignature(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    return `${toolName}:${this.canonicalJson(args)}`;
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private maxToolSteps(): number {
    const raw = this.configService.get<string>('AI_CORE_MAX_TOOL_STEPS');
    const value = raw ? Number(raw) : 2;
    if (!Number.isInteger(value) || value < 1 || value > 3) {
      throw new Error('ai_core_max_tool_steps_invalid');
    }
    return value;
  }

  private plainReply(value: string): string {
    return this.stripControlCharacters(value)
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, 2_000);
  }

  private stripControlCharacters(value: string): string {
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    }).join('');
  }

  private sanitizeToolResult(value: unknown, depth = 0): unknown {
    if (depth > 8) {
      return null;
    }
    if (typeof value === 'string') {
      return this.redactSensitiveText(value).content;
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, 200)
        .map((item) => this.sanitizeToolResult(item, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
      const blockedKeys = new Set([
        'client_email',
        'client_name',
        'client_phone',
        'customer_email',
        'customer_name',
        'customer_phone',
        'email',
        'encrypted_note',
        'notes',
        'password',
        'phone',
        'provider_payload',
        'secret',
        'token',
      ]);
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !blockedKeys.has(key.toLowerCase()))
          .map(([key, item]) => [
            key,
            this.sanitizeToolResult(item, depth + 1),
          ]),
      );
    }
    return value;
  }

  private addTokenCount(
    current: number | null,
    next: number | null,
  ): number | null {
    return next === null ? current : (current ?? 0) + next;
  }

  private record(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private requireTenant(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException({
        message: 'Tenant membership is required.',
        error: { code: 'tenant_required' },
      });
    }
    return this.tenantContext.assertTenantId(user.tenantId);
  }

  private modelFailure(code: string): never {
    throw new ServiceUnavailableException({
      message: 'MAYA could not safely complete this turn.',
      error: { code },
    });
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof ConflictException) {
      return 'ai_core_conflict';
    }
    if (error instanceof HttpException) {
      const response: unknown = error.getResponse();
      const record = this.record(response);
      const nested = this.record(record.error);
      if (typeof nested.code === 'string' && nested.code.length <= 80) {
        return nested.code;
      }
    }
    return 'ai_core_turn_failed';
  }
}
