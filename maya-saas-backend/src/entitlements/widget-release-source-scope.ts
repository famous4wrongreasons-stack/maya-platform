import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  NO_HANDOFF_PROFILE,
  NO_PRICE_GOODS_PROFILE,
  PRICE_GOODS_OPERATIONS,
} from './widget-release-profile.contract';
import {
  object,
  RELEASE_AUTH,
  RELEASE_STATE,
  releaseDeny,
} from './widget-release.contract';

/** Denial only, never authority. The existing owners must still verify every
 * role, source, proposal and effect. Keep the restriction after expiry/revoke:
 * ineffective widget access must not reopen a direct business API. A subsequent
 * broader grant requires the unchanged signed AR-1 writer and its CAS/audit.
 * Use the owner's existing transaction at proposal admission and immediately before provider dispatch
 * so the AR-1 exclusive tenant lock serializes a profile change with the effect.
 * AE receipt admission finishes before the owner acquires the dispatch lock;
 * this avoids nested shared locks behind a queued writer. */
export async function assertPriceGoodsScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operation: string,
): Promise<void> {
  if (!PRICE_GOODS_OPERATIONS.includes(operation)) return;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'widget-release:tenant:' + tenantId}, 0))::text`;
  await readPriceGoodsScope(tx, tenantId, operation);
}

/** Read within an existing AE transaction. The canonical CRM effect owner acquires
 * its shared lock immediately before provider dispatch, after AE admission;
 * this read cannot substitute for that final owner fence. This read is also a deny fence for
 * direct/replayed AE admission. */
export async function readPriceGoodsScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  operation: string,
): Promise<void> {
  if (!PRICE_GOODS_OPERATIONS.includes(operation)) return;
  const row = await tx.tenantEntitlement.findUnique({
    where: { tenantId_featureKey: { tenantId, featureKey: 'widgets.runtime' } },
  });
  // No new permissions: pre-existing non-widget owners still decide this case.
  if (!row?.configJson) return;
  const state = object(row.configJson);
  if (state.contract !== RELEASE_STATE) releaseDeny('source_scope');
  const command = object(state.command);
  const authorization = object(object(command.authorization).payload);
  const raw = command.certificate;
  const cert = raw == null ? null : object(raw);
  const scope = cert
    ? object(cert.payload ?? cert).scope
    : authorization.profileId;
  if (
    scope === NO_PRICE_GOODS_PROFILE ||
    authorization.profileId === NO_PRICE_GOODS_PROFILE
  )
    releaseDeny('source_scope');
  if (scope === NO_HANDOFF_PROFILE || scope === 'full165.closed-input') return;
  // Preserve historical full-scope V1 revoke semantics; new profiles are not
  // admitted via that authorization version (enforced by WidgetReleasePolicy).
  if (
    scope === undefined &&
    authorization.contract === RELEASE_AUTH &&
    authorization.operation === 'revoke'
  )
    return;
  releaseDeny('source_scope');
}

/** Short read boundary. State-changing owners call assertPriceGoodsScope again
 * in their own transaction; this preflight cannot substitute for that lock. */
export async function checkPriceGoodsScope(
  prisma: PrismaService,
  tenantId: string,
  operation: string,
): Promise<void> {
  if (!PRICE_GOODS_OPERATIONS.includes(operation)) return;
  await prisma.$transaction((tx) =>
    assertPriceGoodsScope(tx, tenantId, operation),
  );
}
