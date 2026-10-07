import { Injectable } from '@nestjs/common';
import {
  normalizeSemanticSlots,
  isSingleDaySemanticValue,
  isExactBookingTime,
  semanticSlotAliases,
} from './semantic-slot-normalization';

import { UserRole } from '../common/domain.enums';
import {
  MAYA_CONVERSATION_INTENTS,
  MAYA_CONVERSATION_TAXONOMY,
} from './conversation-taxonomy';
import { mayaConversationLanguageContract } from './conversation-language-pack';
import {
  MAYA_CONVERSATION_PIPELINE,
  MAYA_CONVERSATION_POLICY_CONTRACT,
} from './conversation-policies';
import type {
  ConversationLanguageContract,
  ConversationEntities,
  ConversationEntityValue,
  ConversationPlanCandidate,
  ConversationPlanCandidateTask,
  ConversationPlannerContract,
  ConversationSemanticPlan,
  ConversationSemanticTask,
  ConversationToolCall,
} from './conversation-intelligence.types';

const MAX_TASKS = 5;
const MAX_ENTITY_KEYS = 24;
const MAX_ENTITY_ARRAY_ITEMS = 20;
const MAX_ENTITY_STRING_CHARS = 240;
const MAX_PARENT_REQUEST_CHARS = 1_500;
const MIN_EXECUTABLE_CONFIDENCE = 0.68;

@Injectable()
export class ConversationIntelligenceService {
  plannerContract(
    role: UserRole,
    availableToolNames: readonly string[],
    businessTimezone = 'Europe/Moscow',
  ): ConversationPlannerContract {
    const available = new Set(availableToolNames);
    return {
      version: 'maya-ci/1',
      principal_role: role,
      pipeline: MAYA_CONVERSATION_PIPELINE,
      intents: MAYA_CONVERSATION_TAXONOMY.map((definition) => ({
        intent: definition.id,
        domain: definition.domain,
        description: definition.description,
        action: definition.action,
        data_class: definition.dataClass,
        readiness: definition.readiness,
        readiness_note: definition.readinessNote,
        allowed_for_role: definition.allowedRoles.includes(role),
        ready_tools:
          definition.readiness === 'planned'
            ? []
            : definition.toolCandidates.filter((tool) => available.has(tool)),
        required_slots: definition.requiredSlots,
        optional_slots: definition.optionalSlots,
        slot_aliases: semanticSlotAliases([
          ...definition.requiredSlots,
          ...definition.optionalSlots,
        ]),
        language_hints: [
          ...definition.synonyms.slice(0, 3),
          ...definition.examples.slice(0, 2),
        ],
      })),
      language: this.compactLanguageContract(businessTimezone),
      policies: MAYA_CONVERSATION_POLICY_CONTRACT,
    };
  }

  plannerInstructions(): string {
    return [
      'CONVERSATION INTELLIGENCE CONTRACT maya-ci/1:',
      'First understand the complete parent request, then decompose it into up to five ordered tasks.',
      'For every task choose exactly one canonical intent from conversation_contract.intents.',
      'Entity keys must use the selected intent required_slots and optional_slots. slot_aliases lists equivalent input keys; always emit the canonical key. A known date/period fills date_or_period, and one service is a one-item services array when those slots are declared.',
      'Semantic entity keys and tool argument keys are different contracts: booking.find_availability uses date_or_period, its tool uses date; booking.create_own uses the semantic date slot. Do not omit known required semantic slots just because the tool arguments contain them.',
      'Carry canonical entity keys from semantic_plan and the conversation, replacing only the corrected values. On booking.find_availability -> booking.create_own, retain services/employee/branch and map a single-day date_or_period to date; a period must be clarified, never narrowed by guessing. History is preference context, not availability, identity, confirmation or permission. Never invent missing values.',
      'Extract flat entities from the current utterance and relevant prior turns. Keep dates, periods, people, services, branches, amounts, percentages and statuses distinct.',
      'Use conversation_contract.language as semantic normalization guidance, never as exact-match routing. Resolve relative time in the tenant business timezone.',
      'Classify the intended business meaning, not the presence or absence of a keyword from examples.',
      'Map unseen paraphrases, slang, inflected words, spelling mistakes and plausible speech-to-text errors to the same canonical intent whenever dialogue context supports that meaning.',
      'Never choose a general intent only because the wording is unfamiliar. Use general intents only when the request is genuinely not represented by a business intent.',
      'Report confidence honestly. Below 0.68, ask one short discriminating question instead of guessing a data source or action.',
      'A short follow-up such as "а завтра?" changes only the mentioned slot and carries the rest of the active context.',
      'A correction such as "нет, не завтра, в пятницу" replaces the previous date.',
      'Set dependencies when a later task uses the result of an earlier task.',
      'When the canonical intent is forbidden for principal_role, keep that intent and return no tool call. Never relabel it to gain access.',
      'Capability readiness is authoritative: ready means fully implemented, partial means use only the exact boundary in readiness_note, and planned means understood but unavailable.',
      'Risk, permission details, clarification rules and response rules are server-owned and are added after semantic planning. Do not invent or override them.',
      'A planned intent always returns no tool call. Never substitute a nearby metric or tool to make it look implemented.',
      'When the intent has no ready_tools, keep that intent and return no tool call. This means understood but unavailable, not misunderstood.',
      'Choose at most one next tool call. On the next planning pass, inspect tool_results and continue the first unsatisfied task.',
      'General questions, writing help and small talk need no tool and remain free-form LLM conversation.',
      'Name mentions may be opaque request-local tokens such as [name removed]@nonce_1. Select the exact token for the employee only when the user means that specialist; self-identification and excluded/negated people are not employee selections. Never invent tokens or reuse tokens from earlier requests. A correction replaces the employee token; history is preference only.',
      'Do not put personal data into semantic entities; input is already redacted and tenant runtime owns identity resolution.',
    ].join('\n');
  }

  validatePlan(
    value: unknown,
    role: UserRole,
    availableToolNames: readonly string[],
    previousPlan?: ConversationSemanticPlan | null,
  ): ConversationSemanticPlan | null {
    if (value === null || value === undefined) {
      return null;
    }
    const candidate = this.plainRecord(
      value,
      'conversation_plan_invalid',
    ) as ConversationPlanCandidate;
    if (!Array.isArray(candidate.tasks) || candidate.tasks.length === 0) {
      throw new Error('conversation_plan_tasks_missing');
    }
    if (candidate.tasks.length > MAX_TASKS) {
      throw new Error('conversation_plan_too_many_tasks');
    }

    const available = new Set(availableToolNames);
    const usedIds = new Set<string>();
    const tasks: ConversationSemanticTask[] = [];
    const carried = new Set<string>();
    const replaced = new Set<string>();
    for (let index = 0; index < candidate.tasks.length; index += 1) {
      const rawTask = this.plainRecord(
        candidate.tasks[index],
        'conversation_plan_task_invalid',
      ) as ConversationPlanCandidateTask;
      const requestedIntent = this.shortString(rawTask.intent, 120);
      const definition = MAYA_CONVERSATION_INTENTS.get(requestedIntent);
      if (!definition) {
        // A hallucinated intent must fail the structured planning stage. Falling
        // back to small talk here can bypass the data and permission contract.
        throw new Error('conversation_intent_unknown');
      }
      const id = this.uniqueTaskId(rawTask.id, index, usedIds);
      usedIds.add(id);
      const allowed = definition.allowedRoles.includes(role);
      const alternatives =
        allowed && definition.readiness !== 'planned'
          ? definition.toolCandidates.filter((tool) => available.has(tool))
          : [];
      const entities = normalizeSemanticSlots(
        this.sanitizeEntities(rawTask.entities),
        [...definition.requiredSlots, ...definition.optionalSlots],
      );
      const previous =
        previousPlan?.tasks.length === 1 && candidate.tasks.length === 1
          ? previousPlan.tasks[0]
          : undefined;
      if (
        previous &&
        [
          'booking.prepare_personal',
          'booking.find_availability',
          'booking.create_own',
        ].includes(previous.intent) &&
        ['booking.find_availability', 'booking.create_own'].includes(
          definition.id,
        )
      ) {
        const dateKey =
          definition.id === 'booking.create_own' ? 'date' : 'date_or_period';
        const oldDateKey =
          previous.intent === 'booking.create_own' ? 'date' : 'date_or_period';
        const timeKey =
          definition.id === 'booking.create_own' ? 'time' : 'time_of_day';
        const oldTimeKey =
          previous.intent === 'booking.create_own' ? 'time' : 'time_of_day';
        for (const key of [
          'services',
          'employee',
          'branch',
          dateKey,
          timeKey,
        ]) {
          const oldKey =
            key === dateKey ? oldDateKey : key === timeKey ? oldTimeKey : key;
          const value = previous.entities[oldKey];
          if (key === 'time' && !isExactBookingTime(value)) continue;
          if (
            key === 'date' &&
            oldKey === 'date_or_period' &&
            !isSingleDaySemanticValue(value)
          )
            continue;
          if (!(key in entities) && oldKey in previous.entities) {
            entities[key] = value;
            carried.add(key);
          } else if (
            oldKey in previous.entities &&
            key in entities &&
            JSON.stringify(value) !== JSON.stringify(entities[key])
          ) {
            replaced.add(key);
          }
        }
      }
      const candidateClarification = rawTask.requires_clarification === true;
      const confidence = this.confidence(rawTask.confidence);
      const missingSlots = definition.requiredSlots.filter(
        (slot) => !(slot in entities),
      );
      // Required slots are a server-side invariant. The model may propose a
      // default, but it may not silently execute or answer an underspecified
      // canonical intent without placing that value in the validated plan.
      const requiresClarification =
        allowed &&
        definition.readiness !== 'planned' &&
        (candidateClarification ||
          missingSlots.length > 0 ||
          (definition.dataClass !== 'A' &&
            confidence < MIN_EXECUTABLE_CONFIDENCE));
      const clarificationQuestion = requiresClarification
        ? (this.nullableString(rawTask.clarification_question, 300) ??
          this.defaultClarification(missingSlots))
        : null;

      tasks.push({
        id,
        domain: definition.domain,
        intent: definition.id,
        sub_intent: definition.subIntent,
        action: definition.action,
        data_class: allowed ? definition.dataClass : 'F',
        risk: definition.risk,
        capability: {
          readiness: definition.readiness,
          note: definition.readinessNote,
        },
        response_rule: definition.responseRule,
        entities,
        depends_on: this.dependencies(rawTask.depends_on, usedIds, id),
        permission: {
          required: definition.permission,
          status: definition.permission
            ? allowed
              ? 'allowed'
              : 'denied'
            : 'not_applicable',
        },
        tool: {
          name: alternatives[0] ?? null,
          alternatives,
          status:
            definition.dataClass === 'A'
              ? 'not_needed'
              : alternatives.length > 0
                ? 'ready'
                : 'not_available',
        },
        confidence,
        requires_clarification: requiresClarification,
        clarification_question: clarificationQuestion,
        requires_confirmation:
          allowed &&
          definition.risk === 'high' &&
          ['write', 'execute'].includes(definition.action),
      });
    }

    const context = this.context(candidate.context, tasks);
    context.carried_slots = [
      ...new Set([...context.carried_slots, ...carried]),
    ].filter((key) => !replaced.has(key));
    context.replaced_slots = [
      ...new Set([...context.replaced_slots, ...replaced]),
    ];
    return {
      version: 'maya-ci/1',
      parent_request: this.shortString(
        candidate.parent_request,
        MAX_PARENT_REQUEST_CHARS,
      ),
      language: this.shortString(candidate.language, 24) || 'ru',
      dialogue_act: this.shortString(candidate.dialogue_act, 64) || 'request',
      tasks,
      context,
    };
  }

  assertToolCallMatchesPlan(
    toolCall: ConversationToolCall | null,
    plan: ConversationSemanticPlan | null,
  ): ConversationToolCall | null {
    if (!toolCall) {
      return null;
    }
    if (!plan) {
      throw new Error('conversation_plan_missing_for_tool_call');
    }
    const matchingTask = plan.tasks.find(
      (task) =>
        task.permission.status === 'allowed' &&
        !task.requires_clarification &&
        task.tool.alternatives.includes(toolCall.name),
    );
    if (!matchingTask) {
      throw new Error('conversation_tool_plan_mismatch');
    }
    if (toolCall.name === 'reviews.analyze') {
      return {
        ...toolCall,
        arguments: {
          ...toolCall.arguments,
          mode:
            matchingTask.intent === 'reviews.rating_trend' ? 'trend' : 'topics',
        },
      };
    }
    return toolCall;
  }

  hasPendingToolTasks(
    plan: ConversationSemanticPlan | null | undefined,
    completedToolNames: readonly string[],
  ): boolean {
    if (!plan) {
      return false;
    }
    const completed = new Set(completedToolNames);
    return plan.tasks.some(
      (task) =>
        task.permission.status === 'allowed' &&
        !task.requires_clarification &&
        task.tool.status === 'ready' &&
        !task.tool.alternatives.some((tool) => completed.has(tool)),
    );
  }

  summarizeForAudit(plans: readonly ConversationSemanticPlan[]): {
    domains: string[];
    intents: string[];
    task_count: number;
    denied_task_count: number;
    partial_task_count: number;
    planned_task_count: number;
    clarification_required: boolean;
    confirmation_required: boolean;
  } {
    const latest = plans.at(-1);
    const tasks = latest?.tasks ?? [];
    return {
      domains: [...new Set(tasks.map((task) => task.domain))],
      intents: [...new Set(tasks.map((task) => task.intent))],
      task_count: tasks.length,
      denied_task_count: tasks.filter(
        (task) => task.permission.status === 'denied',
      ).length,
      partial_task_count: tasks.filter(
        (task) => task.capability.readiness === 'partial',
      ).length,
      planned_task_count: tasks.filter(
        (task) => task.capability.readiness === 'planned',
      ).length,
      clarification_required: tasks.some((task) => task.requires_clarification),
      confirmation_required: tasks.some((task) => task.requires_confirmation),
    };
  }

  private compactLanguageContract(
    businessTimezone: string,
  ): ConversationLanguageContract {
    const contract = mayaConversationLanguageContract(businessTimezone);
    return {
      ...contract,
      domain_terms: this.compactTermDictionary(contract.domain_terms, 4),
      entity_terms: this.compactTermDictionary(contract.entity_terms, 4),
      temporal_rules: contract.temporal_rules.map((rule) => ({
        ...rule,
        examples: rule.examples.slice(0, 3),
      })),
      number_rules: contract.number_rules.map((rule) => ({
        ...rule,
        examples: rule.examples.slice(0, 3),
      })),
    };
  }

  private compactTermDictionary<T extends string>(
    dictionary: Record<T, readonly string[]>,
    limit: number,
  ): Record<T, readonly string[]> {
    return Object.fromEntries(
      Object.entries<readonly string[]>(dictionary).map(([key, values]) => [
        key,
        values.slice(0, limit),
      ]),
    ) as unknown as Record<T, readonly string[]>;
  }

  defaultRoleForPersona(persona: 'director' | 'admin'): UserRole {
    return persona === 'director' ? UserRole.TENANT_OWNER : UserRole.CLIENT;
  }

  private sanitizeEntities(value: unknown): ConversationEntities {
    if (value === null || value === undefined) {
      return {};
    }
    const record = this.plainRecord(value, 'conversation_entities_invalid');
    const entries: Array<[string, ConversationEntityValue]> = [];
    for (const [key, item] of Object.entries(record)) {
      if (entries.length >= MAX_ENTITY_KEYS) {
        break;
      }
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
        continue;
      }
      const sanitized = this.entityValue(item);
      if (sanitized !== undefined) {
        entries.push([key, sanitized]);
      }
    }
    return Object.fromEntries(entries);
  }

  private entityValue(value: unknown): ConversationEntityValue | undefined {
    if (value === null || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return value.trim().slice(0, MAX_ENTITY_STRING_CHARS);
    }
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ENTITY_ARRAY_ITEMS);
      if (items.every((item) => typeof item === 'string')) {
        return items.map((item) =>
          item.trim().slice(0, MAX_ENTITY_STRING_CHARS),
        );
      }
      if (
        items.every((item) => typeof item === 'number' && Number.isFinite(item))
      ) {
        return items as number[];
      }
    }
    return undefined;
  }

  private context(
    value: unknown,
    tasks: ConversationSemanticTask[],
  ): ConversationSemanticPlan['context'] {
    if (value === null || value === undefined) {
      return {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      };
    }
    const record = this.plainRecord(value, 'conversation_context_invalid');
    const slots = tasks.flatMap((task) => {
      const d = MAYA_CONVERSATION_INTENTS.get(task.intent)!;
      return [...d.requiredSlots, ...d.optionalSlots];
    });
    const aliases = semanticSlotAliases(slots);
    const canonicalKeys = (input: unknown) =>
      this.stringArray(input).map(
        (key) =>
          Object.entries(aliases).find(([, names]) =>
            names.includes(key),
          )?.[0] ?? key,
      );
    return {
      carried_slots: canonicalKeys(record.carried_slots),
      replaced_slots: canonicalKeys(record.replaced_slots),
      unresolved_references: this.stringArray(record.unresolved_references),
    };
  }

  private dependencies(
    value: unknown,
    knownIds: ReadonlySet<string>,
    ownId: string,
  ): string[] {
    return this.stringArray(value).filter(
      (dependency) => dependency !== ownId && knownIds.has(dependency),
    );
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 120))
          .filter(Boolean),
      ),
    ].slice(0, 20);
  }

  private uniqueTaskId(
    value: unknown,
    index: number,
    usedIds: ReadonlySet<string>,
  ): string {
    const requested = this.shortString(value, 64).replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    );
    const base = requested || `task_${index + 1}`;
    if (!usedIds.has(base)) {
      return base;
    }
    return `task_${index + 1}`;
  }

  private confidence(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0.5;
    }
    return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
  }

  private defaultClarification(missingSlots: readonly string[]): string {
    if (missingSlots.length === 0) {
      return 'Уточните, пожалуйста, какой вариант вы имеете в виду?';
    }
    return `Уточните, пожалуйста: ${missingSlots.join(', ')}.`;
  }

  private shortString(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  private nullableString(value: unknown, maxLength: number): string | null {
    const normalized = this.shortString(value, maxLength);
    return normalized || null;
  }

  private plainRecord(
    value: unknown,
    errorCode: string,
  ): Record<string, unknown> {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw new Error(errorCode);
    }
    return value as Record<string, unknown>;
  }
}
