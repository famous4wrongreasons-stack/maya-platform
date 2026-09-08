import { Prisma } from '@prisma/client';
import type { Package5TeamObjectStore } from '../package5-wave4/package5-team-object-store';
import type {
  RCPayloadStorage,
  RCPayloadTarget,
} from './package5-wave-rc-payloads';
/** AC6 leaf, never a read/upload/cancellation cleanup helper. */
export class Package5TeamPayloadStorage implements RCPayloadStorage {
  constructor(private readonly storage: Package5TeamObjectStore) {}
  async eraseClaimedAttachment(
    tx: Prisma.TransactionClient,
    target: RCPayloadTarget,
  ) {
    if (target.kind !== 'TeamAttachment') return false;
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`SELECT a.id FROM "TeamAttachment" a WHERE a.id=${target.id} AND a."tenantId"=${target.tenantId} AND a."contentSha256"=${target.digest} AND a.state<>'ERASED'
   AND "RC_payload_claim"(a."tenantId",'TeamAttachment',a.id,a."contentSha256",${target.deadline},'purge_team_attachment_payloads','team-lifecycle-retention')
   AND ${target.deadline}=CASE WHEN a.state='BOUND' THEN LEAST(a."mediaExpiresAt",COALESCE((SELECT "withdrawnAt" FROM "TeamMessage" WHERE "attachmentId"=a.id AND "tenantId"=a."tenantId"),a."mediaExpiresAt")) ELSE a."uploadExpiresAt" END
   AND "RC_execution_set_resolved"(a."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=a."tenantId" AND (id=a."reserveExecutionId" OR id=a."finalizeExecutionId" OR id IN(SELECT "sendExecutionId" FROM "TeamMessage" WHERE "attachmentId"=a.id AND "tenantId"=a."tenantId") OR id IN(SELECT "withdrawalExecutionId" FROM "TeamMessage" WHERE "attachmentId"=a.id AND "tenantId"=a."tenantId") OR "teamMessageId" IN(SELECT id FROM "TeamMessage" WHERE "attachmentId"=a.id AND "tenantId"=a."tenantId")))) FOR UPDATE OF a`);
    if (rows.length !== 1) return false;
    const row = await tx.teamAttachment.findUniqueOrThrow({
      where: { id_tenantId: { id: target.id, tenantId: target.tenantId } },
    });
    return this.storage.eraseClaimed({
      objectStoreKey: row.objectStoreKey,
      contentSha256: row.contentSha256,
      declaredSize: Number(row.declaredSize),
      mime: row.mime,
      kind: row.kind,
    });
  }
}
