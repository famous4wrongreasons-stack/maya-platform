import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiToolSurface } from './ai-tool.types';

/** P-TYPED's owner-side seam. The AI layer can ask; only the widget gateway may decide. */
export const AI_TYPED_WIDGET_TRIGGER = 'AI_TYPED_WIDGET_TRIGGER';

export interface AiTypedWidgetResult {
  readonly reply: string;
  readonly userTurn?: {
    readonly turnId: string;
    readonly conversationId: string;
  };
  readonly action: Readonly<Record<string, unknown>> | null;
}

export interface AiTypedWidgetTriggerPort {
  /** Historical text only. No restored intent, approval, or business authority. */
  readCurrentConversation(actor: Readonly<AuthenticatedUser>): Promise<{
    contract: 'maya.conversation-history/1';
    conversationId: string | null;
    truncated: boolean;
    interrupted: boolean;
    turns: Array<{
      id: string;
      role: 'user' | 'assistant';
      text: string;
      createdAt: string;
      completed: boolean;
    }>;
  }>;
  /** Internal, erasable semantic context only; never restored action authority. */
  readConversationContext?(
    actor: Readonly<AuthenticatedUser>,
    conversationId: string,
    beforeTurnId: string,
  ): Promise<unknown>;
  persistAssistantReply(input: {
    readonly actor: Readonly<AuthenticatedUser>;
    readonly userTurn: {
      readonly turnId: string;
      readonly conversationId: string;
    };
    readonly reply: string;
    readonly completionHash: string;
    readonly semanticContext?: unknown;
  }): Promise<void>;
  persistTypedTurn(input: {
    readonly actor: Readonly<AuthenticatedUser>;
    readonly surface: AiToolSurface;
    readonly utterance: string;
    readonly requestId: string;
    readonly conversationId?: string;
  }): Promise<{
    readonly turnId: string;
    readonly conversationId: string;
  } | null>;
  routeTypedUtterance(input: {
    readonly actor: Readonly<AuthenticatedUser>;
    readonly surface: AiToolSurface;
    readonly utterance: string;
    readonly requestId: string;
    readonly conversationId?: string;
  }): Promise<AiTypedWidgetResult | null>;
}
