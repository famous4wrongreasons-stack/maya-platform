import { UserTurnAuditAdapter } from './user-turn-audit.adapter';
import type { AuditLogService } from '../../audit-log/audit-log.service';
import type { RequestTx } from '../authority/principal-view';

it('TURN-AUDIT-TX uses the canonical audit owner and the exact existing transaction for both operations', async () => {
  const tx = {} as RequestTx;
  const owner = {
    entityEvents: jest
      .fn()
      .mockResolvedValue([{ metadataJson: { correlation: true } }]),
    log: jest.fn().mockResolvedValue(undefined),
  };
  const adapter = new UserTurnAuditAdapter(owner as unknown as AuditLogService);
  await expect(
    adapter.read('tenant', 'actual-actor', 'turn', tx),
  ).resolves.toEqual([{ correlation: true }]);
  expect(owner.entityEvents).toHaveBeenCalledWith(
    {
      tenantId: 'tenant',
      userId: 'actual-actor',
      action: 'chat.user_turn_bound',
      entityType: 'WidgetTimelineTurn',
      entityId: 'turn',
    },
    tx,
  );
  const input = {
    tenantId: 'tenant',
    userId: 'actual-actor',
    action: 'chat.user_turn_bound' as const,
    entityType: 'WidgetTimelineTurn' as const,
    entityId: 'turn',
    metadata: {},
  };
  await adapter.append(input, tx);
  expect(owner.log).toHaveBeenCalledWith(input, tx);
});
