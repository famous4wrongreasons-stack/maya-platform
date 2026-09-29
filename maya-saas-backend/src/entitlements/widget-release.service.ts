import { NO_HANDOFF_PROFILE } from './widget-release-profile.contract';
import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, TenantEntitlement } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetReleasePolicy } from './widget-release-policy.service';
import {
  identifier,
  object,
  RELEASE_AUDIT,
  RELEASE_FEATURE,
  RELEASE_STATE,
  releaseDeny,
  releaseHash,
  type ReleaseReceipt,
} from './widget-release.contract';

type Tx = Prisma.TransactionClient;
export function entitlementVersion(row: TenantEntitlement | null): string {
  return row === null
    ? 'absent'
    : releaseHash({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
      });
}
export async function lockWidgetRelease(tx: Tx, tenantId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'widget-release:tenant:' + tenantId}, 0))::text`;
}
/** The only AR-1 entitlement writer. No provider effects and no tenant role inference. */
@Injectable()
export class WidgetReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: WidgetReleasePolicy,
    private readonly audit: AuditLogService,
  ) {}
  async status(actor: AuthenticatedUser, tenantId: string) {
    identifier(tenantId);
    return this.prisma.$transaction(async (tx) => {
      await this.authority(tx, actor);
      await this.tenant(tx, tenantId, false);
      const row = await tx.tenantEntitlement.findUnique({
        where: {
          tenantId_featureKey: { tenantId, featureKey: RELEASE_FEATURE },
        },
      });
      const now = await this.now(tx);
      const view = row === null ? null : this.policy.view(tenantId, row, now);
      return {
        tenantId,
        featureKey: RELEASE_FEATURE,
        version: entitlementVersion(row),
        enabled: row !== null && row.enabled && view !== null,
        ...(view?.scope === NO_HANDOFF_PROFILE
          ? {
              scope: view.scope,
              certification: 'CERTIFIED_FOR_PROFILE',
              fullContractCertified: false,
            }
          : {}),
        expiresAt: row?.expiresAt?.toISOString() ?? null,
        candidateSha: row?.configJson
          ? (object(row.configJson).candidateSha ?? null)
          : null,
      };
    });
  }
  validate(actor: AuthenticatedUser, tenantId: string, value: unknown) {
    return this.apply(actor, tenantId, value, 'grant', true);
  }
  grant(actor: AuthenticatedUser, tenantId: string, value: unknown) {
    return this.apply(actor, tenantId, value, 'grant', false);
  }
  revoke(actor: AuthenticatedUser, tenantId: string, value: unknown) {
    return this.apply(actor, tenantId, value, 'revoke', false);
  }
  private async apply(
    actor: AuthenticatedUser,
    tenantId: string,
    value: unknown,
    operation: 'grant' | 'revoke',
    dryRun: boolean,
  ) {
    identifier(tenantId);
    // Strictly bounded copy before awaiting: callers cannot change a validated object in flight.
    const serialized = JSON.stringify(value);
    if (!serialized || Buffer.byteLength(serialized) > 128 * 1024)
      releaseDeny('shape');
    const command: unknown = JSON.parse(serialized);
    return this.prisma.$transaction(
      async (tx) => {
        await this.authority(tx, actor);
        await this.tenant(tx, tenantId, operation === 'grant');
        const initial = this.policy.read(
          command,
          tenantId,
          operation,
          actor.userId,
          await this.now(tx),
        );
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'widget-release:authorization:' + initial.a.authorizationId}, 0))::text`;
        await lockWidgetRelease(tx, tenantId);
        await tx.$queryRaw`SELECT id FROM "TenantEntitlement" WHERE "tenantId"=${tenantId} AND "featureKey"=${RELEASE_FEATURE} FOR UPDATE`;
        // Locks may have waited. Session, signature window, candidate and certificate must still hold.
        await this.authority(tx, actor);
        const now = await this.now(tx),
          proof = this.policy.read(
            command,
            tenantId,
            operation,
            actor.userId,
            now,
          ),
          a = proof.a;
        const auditId = 'widget-release:' + releaseHash(a.authorizationId);
        const prior = await tx.auditLog.findUnique({ where: { id: auditId } });
        if (prior) {
          const metadata = object(prior.metadataJson);
          if (
            prior.action !== RELEASE_AUDIT ||
            prior.scope !== 'platform' ||
            prior.userId !== actor.userId ||
            metadata.authorizationHash !== proof.authorizationHash
          )
            throw new ConflictException('widget_release_replay_rebound');
          // Historical receipt only: retry after revoke never applies the old grant again.
          return {
            dryRun,
            replayed: true,
            receipt: metadata.receipt as ReleaseReceipt,
          };
        }
        const row = await tx.tenantEntitlement.findUnique({
          where: {
            tenantId_featureKey: { tenantId, featureKey: RELEASE_FEATURE },
          },
        });
        const previousVersion = entitlementVersion(row);
        if (previousVersion !== a.expectedVersion)
          throw new ConflictException('widget_release_stale_version');
        if (operation === 'revoke') {
          const state = object(row?.configJson);
          if (
            state.contract !== RELEASE_STATE ||
            state.candidateSha !== a.candidateSha ||
            state.certificateDigest !== a.certificateDigest
          )
            releaseDeny('revoke_target');
        }
        if (dryRun)
          return {
            dryRun: true,
            replayed: false,
            tenantId,
            previousVersion,
            candidateSha: a.candidateSha,
            certificateDigest: a.certificateDigest,
          };
        const data = {
          enabled: operation === 'grant',
          expiresAt: operation === 'grant' ? new Date(a.grantExpiresAt!) : null,
          reason: 'AR-1 certified widget release',
          configJson: asJson({
            contract: RELEASE_STATE,
            version: releaseHash(randomUUID()),
            candidateSha: a.candidateSha,
            certificateDigest: a.certificateDigest,
            appliedAt: now.toISOString(),
            command: proof.command,
          }),
        };
        // Row lock + the only approved writer's advisory lock make the fingerprint CAS atomic.
        const updated = row
          ? await tx.tenantEntitlement.update({ where: { id: row.id }, data })
          : await tx.tenantEntitlement.create({
              data: { ...data, tenantId, featureKey: RELEASE_FEATURE },
            });
        const receipt: ReleaseReceipt = {
          contract: 'maya.widget-release-receipt/1',
          authorizationId: a.authorizationId,
          operation,
          tenantId,
          candidateSha: a.candidateSha,
          certificateDigest: a.certificateDigest,
          actorId: actor.userId,
          approverId: a.approverId,
          reviewerId: a.reviewerId,
          rollbackOwnerId: a.rollbackOwnerId,
          previousVersion,
          version: entitlementVersion(updated),
          appliedAt: now.toISOString(),
          expiresAt: updated.expiresAt?.toISOString() ?? null,
          auditId,
        };
        await this.audit.logPlatformAction(
          {
            id: auditId,
            userId: actor.userId,
            action: RELEASE_AUDIT,
            entityType: 'widget_release',
            entityId: tenantId,
            metadata: {
              authorizationHash: proof.authorizationHash,
              receipt,
              sessionIdentityHash: releaseHash({
                userId: actor.userId,
                sessionId: actor.sessionId,
              }),
              before: row
                ? {
                    enabled: row.enabled,
                    expiresAt: row.expiresAt?.toISOString() ?? null,
                    version: previousVersion,
                  }
                : null,
              after: {
                enabled: updated.enabled,
                expiresAt: receipt.expiresAt,
                version: receipt.version,
              },
            },
          },
          tx,
        );
        return { dryRun: false, replayed: false, receipt };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 15000 },
    );
  }
  private async now(tx: Tx) {
    const [row] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
    return row.now;
  }
  private async tenant(tx: Tx, tenantId: string, forGrant: boolean) {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (!tenant || (forGrant && !['active', 'trial'].includes(tenant.status)))
      releaseDeny('tenant');
  }
  private async authority(tx: Tx, actor: AuthenticatedUser) {
    if (
      !actor?.sessionId ||
      actor.tenantId !== null ||
      actor.membershipId !== null ||
      actor.role !== UserRole.PLATFORM_OWNER
    )
      releaseDeny('platform_actor');
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.userId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "AuthSession" WHERE id=${actor.sessionId} FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: actor.userId } }),
      session = await tx.authSession.findUnique({
        where: { id: actor.sessionId },
      }),
      now = await this.now(tx);
    if (
      !user ||
      user.role !== 'platform_owner' ||
      user.status !== 'active' ||
      user.tenantId !== null ||
      !session ||
      session.userId !== user.id ||
      session.tenantId !== null ||
      session.revokedAt ||
      session.expiresAt <= now
    )
      releaseDeny('platform_actor');
  }
}
