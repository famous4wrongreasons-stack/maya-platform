import type { C9Domain } from './c9.contract';

export const C9_WIDGET_TRIGGER = 'C9_WIDGET_TRIGGER';

/** Optional dark widget hook. C9 owns the run; the widget layer only projects the supplied state. */
export interface C9WidgetTriggerPort {
  afterRun(
    input: Readonly<{
      runId: string;
      revisionId: string;
      domain: C9Domain;
      state: 'queued' | 'running' | 'done' | 'cancelled';
    }>,
  ): Promise<unknown>;
}
