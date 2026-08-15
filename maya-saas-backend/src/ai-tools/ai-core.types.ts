import type { AiToolSurface } from './ai-tool.types';
import type { UserRole } from '../common/domain.enums';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';

export type AiCoreMessageRole = 'assistant' | 'user';
export type AiCoreProvider = 'deepseek' | 'openai';
export type AiCorePersona = 'director' | 'admin';

export interface AiCoreMessage {
  role: AiCoreMessageRole;
  content: string;
}

export interface AiCoreToolDescriptor {
  name: string;
  description: string;
  input_schema: unknown;
  risk_tier: string;
  approval_policy: string;
}

export interface AiCoreToolResult {
  name: string;
  result: unknown;
}

export interface AiCoreModelInput {
  surface: AiToolSurface;
  persona: AiCorePersona;
  /** Effective tenant role used by the immutable tool runtime for this turn. */
  principalRole?: UserRole;
  messages: AiCoreMessage[];
  tools: AiCoreToolDescriptor[];
  toolResults: AiCoreToolResult[];
  allowToolCall: boolean;
  requiredToolNames: string[];
  /**
   * Серверное «сейчас» в UTC. Без него модель не знает, какой сегодня день, и
   * при этом ей запрещено подставлять календарь самой — любой вопрос про
   * динамику становился неотвечаемым.
   */
  nowUtc?: string;
  /** IANA timezone resolved from the authenticated tenant, never from client input. */
  businessTimezone?: string;
  /**
   * Explicit notes saved by the authenticated user for this tenant. These are
   * untrusted context, never a source of verified financial or CRM figures.
   */
  memoryFacts?: string[];
  /**
   * Замечания предыдущего прохода: числа, которых нет в результатах
   * инструментов. Даём модели переписать ответ вместо того, чтобы молча
   * заменить его шаблоном.
   */
  corrections?: string[];
  /** Validated plan carried between tool iterations of one compound request. */
  conversationPlan?: ConversationSemanticPlan | null;
}

export interface AiCoreModelDecision {
  reply: string;
  toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  } | null;
  /** Server-validated meaning of the request; never an authorization source. */
  semanticPlan?: ConversationSemanticPlan | null;
  provider: AiCoreProvider;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}
