import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiToolSurface, ValidatedAiToolArguments } from './ai-tool.types';

export const AI_READ_WIDGET_TRIGGER = 'AI_READ_WIDGET_TRIGGER';

export interface AiReadWidgetResolution {
  readonly matched: true;
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly dismiss_widget_id: string | null;
}

export interface AiReadWidgetTriggerPort {
  afterCompletedRead(input: {
    readonly actor: Readonly<AuthenticatedUser>;
    readonly toolName: string;
    readonly surface: AiToolSurface;
    readonly arguments: ValidatedAiToolArguments;
    readonly inputHash: string;
    readonly executionId: string;
    readonly conversationId: string;
    readonly result: unknown;
    readonly replayed: boolean;
    readonly trigger: 'T-2a' | 'T-2b';
    readonly requestId: string | null;
  }): Promise<AiReadWidgetResolution | null>;
}
