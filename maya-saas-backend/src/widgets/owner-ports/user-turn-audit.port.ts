import type { RequestTx } from '../authority/principal-view';

/** Audit correlation only: no business or principal owner is reachable through this port. */
export interface UserTurnAuditPort {
  read(
    tenantId: string,
    userId: string,
    turnId: string,
    tx: RequestTx,
  ): Promise<readonly unknown[]>;
  append(
    input: {
      tenantId: string;
      userId: string;
      action: 'chat.user_turn_bound';
      entityType: 'WidgetTimelineTurn';
      entityId: string;
      metadata: Record<string, unknown>;
    },
    tx: RequestTx,
  ): Promise<void>;
}
