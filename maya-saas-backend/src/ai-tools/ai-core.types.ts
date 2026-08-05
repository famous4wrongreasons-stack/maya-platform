import type { AiToolSurface } from './ai-tool.types';
import type { MayaBrainContext } from '../ai-brain/maya-brain.types';

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
  messages: AiCoreMessage[];
  tools: AiCoreToolDescriptor[];
  toolResults: AiCoreToolResult[];
  allowToolCall: boolean;
  requiredToolNames: string[];
  brain: MayaBrainContext;
}

export interface AiCoreModelDecision {
  reply: string;
  citationIds: string[];
  toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  } | null;
  provider: AiCoreProvider;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}
