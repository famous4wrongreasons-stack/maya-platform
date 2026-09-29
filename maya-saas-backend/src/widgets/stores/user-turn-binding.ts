import { TimelineStore } from './timeline.store';
import { ConflictException } from '@nestjs/common';
import { stableActionJson } from '../../action-engine/action-engine.identity';
import { sha256Hex } from '../token.util';
import type { RequestTx } from '../authority/principal-view';
import type { UserTurnAuditPort } from '../owner-ports/user-turn-audit.port';

export interface UserTurnCorrelation {
  readonly kind: 'chat' | 'widget';
  readonly requestId: string;
  readonly actorUserId: string;
}
export interface UserTurnReference {
  readonly turnId: string;
  readonly conversationId: string;
}
export interface UserTurnBinding extends UserTurnReference {
  readonly contract: 'maya.user-turn-binding/1';
  readonly principalProofHash: string;
  readonly intentTokenHash: string | null;
}
export const TURN_BINDING_ACTION = 'chat.user_turn_bound';

/** Correlation, never authority; the authenticated actor and tenant are resolved by the ingress. */
export function userTurnId(
  tenantId: string,
  correlation: UserTurnCorrelation,
): string {
  const h = sha256Hex(
    stableActionJson([
      'maya.user-turn/1',
      tenantId,
      correlation.actorUserId,
      correlation.kind,
      correlation.requestId,
    ]),
  );
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The lock is held only while persisting the turn and its A-class correlation; never over model/owner I/O. */
export async function lockUserTurn(
  tx: RequestTx,
  tenantId: string,
  correlation: UserTurnCorrelation,
): Promise<string> {
  const id = userTurnId(tenantId, correlation);
  await TimelineStore.lockUserTurnIdentity(tx, tenantId, id);
  return id;
}

export async function readUserTurnBinding(
  tx: RequestTx,
  tenantId: string,
  correlation: UserTurnCorrelation,
  principalProofHash: string,
  audit: UserTurnAuditPort,
): Promise<UserTurnBinding | null> {
  const turnId = userTurnId(tenantId, correlation);
  const rows = await audit.read(tenantId, correlation.actorUserId, turnId, tx);
  if (rows.length === 0) return null;
  if (rows.length !== 1)
    throw new ConflictException('user_turn_binding_conflict');
  const m = rows[0];
  if (m === null || typeof m !== 'object' || Array.isArray(m))
    throw new ConflictException('user_turn_binding_conflict');
  const b = m as Record<string, unknown>;
  if (
    Object.keys(b).sort().join('|') !==
      'contract|conversationId|intentTokenHash|principalProofHash|turnId' ||
    b.contract !== 'maya.user-turn-binding/1' ||
    b.turnId !== turnId ||
    b.principalProofHash !== principalProofHash ||
    typeof b.conversationId !== 'string' ||
    (b.intentTokenHash !== null &&
      (typeof b.intentTokenHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(b.intentTokenHash)))
  )
    throw new ConflictException('user_turn_binding_conflict');
  return b as unknown as UserTurnBinding;
}

/** Only opaque A-class references. No text, text hash, caller role or retained authority decision. */
export async function writeUserTurnBinding(
  audit: UserTurnAuditPort,
  tx: RequestTx,
  tenantId: string,
  correlation: UserTurnCorrelation,
  binding: UserTurnBinding,
): Promise<void> {
  await audit.append(
    {
      tenantId,
      userId: correlation.actorUserId,
      action: TURN_BINDING_ACTION,
      entityType: 'WidgetTimelineTurn',
      entityId: binding.turnId,
      metadata: { ...binding },
    },
    tx,
  );
}
