import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { UserTurnAuditPort } from './user-turn-audit.port';
import type { RequestTx } from '../authority/principal-view';

@Injectable()
export class UserTurnAuditAdapter implements UserTurnAuditPort {
  constructor(private readonly audit: AuditLogService) {}
  async read(
    tenantId: string,
    userId: string,
    turnId: string,
    tx: RequestTx,
  ): Promise<readonly unknown[]> {
    const rows = await this.audit.entityEvents(
      {
        tenantId,
        userId,
        action: 'chat.user_turn_bound',
        entityType: 'WidgetTimelineTurn',
        entityId: turnId,
      },
      tx,
    );
    return rows.map((row) => row.metadataJson);
  }
  async append(
    input: Parameters<UserTurnAuditPort['append']>[0],
    tx: RequestTx,
  ): Promise<void> {
    await this.audit.log(input, tx);
  }
}
