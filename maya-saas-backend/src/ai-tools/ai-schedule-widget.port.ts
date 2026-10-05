import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiToolSurface } from './ai-tool.types';
export const AI_SCHEDULE_WIDGET = 'AI_SCHEDULE_WIDGET';
export interface AiScheduleWidgetPort {
  mint(input: {
    actor: AuthenticatedUser;
    surface: AiToolSurface;
    approvalId: string;
    payloadHash: string;
    reply: string;
    userTurn: { turnId: string; conversationId: string };
  }): Promise<Readonly<Record<string, unknown>> | null>;
}
