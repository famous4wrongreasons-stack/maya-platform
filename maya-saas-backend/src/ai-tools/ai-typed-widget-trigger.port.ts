import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiToolSurface } from './ai-tool.types';

/** P-TYPED's owner-side seam. The AI layer can ask; only the widget gateway may decide. */
export const AI_TYPED_WIDGET_TRIGGER = 'AI_TYPED_WIDGET_TRIGGER';

export interface AiTypedWidgetResult {
  readonly reply: string;
  readonly action: Readonly<Record<string, unknown>> | null;
}

export interface AiTypedWidgetTriggerPort {
  routeTypedUtterance(input: {
    readonly actor: Readonly<AuthenticatedUser>;
    readonly surface: AiToolSurface;
    readonly utterance: string;
    readonly requestId: string;
  }): Promise<AiTypedWidgetResult | null>;
}
