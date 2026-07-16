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
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiCoreModelService } from './ai-core-model.service';
import type {
  AiCoreMessage,
  AiCoreModelDecision,
  AiCoreToolDescriptor,
  AiCoreToolResult,
} from './ai-core.types';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';

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

const GROUNDING_FACT_PATTERN =
  /(сколько|какая|какой|какие|покажи|показать|дай|посчитай|есть\s+ли|когда|кто|мои|моя|мой|у\s+меня|за\s+сегодня|за\s+вчера|за\s+недел\w*|за\s+месяц\w*|сегодня|завтра)/i;
const GROUNDING_ANALYTICS_PATTERN =
  /(выруч\w*|оборот\w*|касс\w*|доход\w*|зарплат\w*|средн\w*\s+чек|прибыл\w*|марж\w*|аналитик\w*|статистик\w*|показател\w*|цифр\w*)/i;
const GROUNDING_PERSONAL_SCOPE_PATTERN =
  /(моя|мой|мои|личн\w*|у\s+меня|сколько\s+я|я\s+заработ)/i;
const GROUNDING_BUSINESS_SCOPE_PATTERN =
  /(бизнес\w*|компан\w*|по\s+всем|все\s+сотрудник\w*|все\s+специалист\w*|общ\w*\s+(?:выруч|касс|статист)|мы\s+заработ)/i;
const GROUNDING_NUMBER_PATTERN =
  /(?<![\p{L}\p{N}_-])-?(?:\d{1,3}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_-])/gu;
const GROUNDING_SMALL_METRIC_PATTERN =
  /(?<number>\d{1,3}(?:[\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:₽|руб\w*|%|балл\w*|бонус\w*|визит\w*|клиент\w*|запис\w*|минут\w*|час\w*|специалист\w*)/giu;

@Injectable()
export class AiCoreService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly runtime: AiToolRuntimeService,
    private readonly model: AiCoreModelService,
    private readonly auditLog: AuditLogService,
  ) {}

  async chat(user: AuthenticatedUser, dto: AiCoreChatDto) {
    const tenantId = this.requireTenant(user);
    await this.rateLimit.assertTenant('ai_chat', {
      tenantId,
      identity: user.userId,
    });
    const sanitized = this.sanitizeMessages(dto.messages);
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
          sanitized.redacted,
          toolsUsed,
          decisions,
          this.groundingFallback(requirement, toolResults),
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
            sanitized.redacted,
            toolsUsed,
            decisions,
            this.groundingFallback(requirement, toolResults),
          );
        }
        const decision = await this.model.decide({
          surface: dto.surface,
          messages: sanitized.messages,
          tools,
          toolResults: [...toolResults],
          allowToolCall: step < maxToolSteps,
          requiredToolNames:
            requirement && !requirementSatisfied ? requiredToolNames : [],
        });
        if (!decision) {
          return this.complete(
            user,
            dto,
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
              sanitized.redacted,
              toolsUsed,
              decisions,
              this.groundingFallback(requirement, toolResults),
            );
          }
          return this.complete(
            user,
            dto,
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

  private async complete(
    user: AuthenticatedUser,
    dto: AiCoreChatDto,
    redacted: boolean,
    toolsUsed: ToolUsage[],
    decisions: AiCoreModelDecision[],
    response: {
      reply: string;
      source: 'deepseek' | 'openai' | 'safe_fallback';
      action: Record<string, unknown> | null;
      grounding?: GroundingReport;
    },
  ) {
    const grounding =
      response.grounding ?? this.groundingReport(null, 'not_required', []);
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
    await this.auditLog.log({
      tenantId: this.requireTenant(user),
      userId: user.userId,
      action: 'ai.core_turn_completed',
      entityType: 'ai_core_turn',
      entityId: dto.requestId,
      metadata: {
        surface: dto.surface,
        source: response.source,
        models: [...new Set(decisions.map((decision) => decision.model))],
        model_calls: decisions.length,
        tools_used: toolsUsed.map((tool) => tool.name),
        outcome: response.action ? 'approval_required' : 'reply',
        grounding_status: grounding.status,
        grounding_domain: grounding.domain,
        grounding_evidence_tools: grounding.evidence_tools,
        redacted_input: redacted,
        ...usage,
      },
    });
    return {
      request_id: dto.requestId,
      reply: response.reply,
      source: response.source,
      redacted_input: redacted,
      action: response.action,
      tools_used: toolsUsed,
      grounding,
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
      /(баланс\w*|сколько\s+.*(?:балл|бонус)|мои\s+(?:балл|бонус))\w*/i.test(
        text,
      )
    ) {
      return this.requireGrounding('client_loyalty', ['loyalty.own.read']);
    }
    if (
      /(мои\s+запис\w*|когда\s+я\s+записан\w*|истори\w*\s+(?:моих\s+)?запис\w*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('client_appointments', [
        'appointments.own.list',
      ]);
    }
    if (
      /(свободн\w*\s+(?:окн\w*|врем\w*|слот\w*)|ближайш\w*\s+(?:окн\w*|врем\w*|слот\w*)|есть\s+ли\s+(?:окн\w*|мест\w*|врем\w*)|когда\s+можно\s+запис)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('booking_availability', [
        'booking.availability.read',
      ]);
    }
    if (
      !/(подписк\w*|тариф\w*|maya|майя)/i.test(text) &&
      /(сколько\s+стоит|цен\w*|прайс\w*|какие\s+услуг\w*|длительн\w*\s+услуг\w*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('service_catalog', [
        'catalog.services.read',
      ]);
    }
    if (
      /(кто\s+работает|график\w*\s+(?:работ|мастер|специалист)|смен\w*|выходн\w*)/i.test(
        text,
      ) &&
      factRequest
    ) {
      // Availability is not a work roster, so this remains blocked until a
      // dedicated tenant-scoped schedule tool exists.
      return this.requireGrounding('staff_schedule', ['staff.schedule.read']);
    }
    if (
      /(какие\s+(?:мастер|специалист)\w*|кто\s+(?:из\s+)?(?:мастер|специалист)\w*|выбрать\s+(?:мастер|специалист)\w*)/i.test(
        text,
      ) &&
      !/(лучш\w*|выруч\w*|заработ\w*|эффектив\w*)/i.test(text)
    ) {
      return this.requireGrounding('staff_catalog', ['catalog.staff.read']);
    }
    if (/(расход\w*|затрат\w*)/i.test(text) && factRequest) {
      return this.requireGrounding('business_expenses', ['expenses.read']);
    }
    if (
      /(сколько\s+(?:у\s+нас\s+)?клиент\w*|количеств\w*\s+клиент\w*)/i.test(
        text,
      )
    ) {
      return this.requireGrounding('customer_count', ['customers.count']);
    }
    if (
      (GROUNDING_ANALYTICS_PATTERN.test(text) && factRequest) ||
      /(сводк\w*|что\s+у\s+нас\s+сегодня)/i.test(text)
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
  ) {
    return {
      reply:
        'Не смогла подтвердить данные в защищённом источнике MAYA. Чтобы не показать неверные цифры или факты, попробуйте повторить запрос позже.',
      source: 'safe_fallback' as const,
      action: null,
      grounding: this.groundingReport(requirement, 'blocked', toolResults),
    };
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
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone removed]')
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
