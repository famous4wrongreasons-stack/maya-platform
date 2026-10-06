import { PROFILE_REGISTRY } from './widget-release-profile.registry';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  WidgetReleasePolicy,
  type VerifiedReleaseView,
} from './widget-release-policy.service';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
  PROFILE_MANIFEST,
  PROFILE_REGISTRY_DIGEST,
} from './widget-release-profile.contract';
import { object, releaseDeny, releaseHash } from './widget-release.contract';

export interface ReleaseIntentFacts {
  readonly tenantId: string;
  readonly widgetId: string;
  readonly intentTokenHash: string;
  readonly effect: string;
  readonly widgetKind: string;
  readonly bodyHash: string;
  readonly principalProofHash: string;
  readonly capabilitySpace: string | null;
  readonly capabilityKey: string | null;
  readonly sourceCapabilitySpace: string | null;
  readonly sourceCapabilityKey: string | null;
  readonly targetJson: unknown;
  readonly inputSchemaHash: string | null;
  readonly selectionDomain: string;
}
export interface MintReleaseFacts {
  readonly template: string;
  readonly record: ReleaseIntentFacts;
}
const AUDIT_ACTION = 'widget.release.emission_binding';
const bindingHash = (r: ReleaseIntentFacts) =>
  releaseHash({
    tenantId: r.tenantId,
    widgetId: r.widgetId,
    intentTokenHash: r.intentTokenHash,
    effect: r.effect,
    widgetKind: r.widgetKind,
    bodyHash: r.bodyHash,
    principalProofHash: r.principalProofHash,
    capabilitySpace: r.capabilitySpace,
    capabilityKey: r.capabilityKey,
    sourceCapabilitySpace: r.sourceCapabilitySpace,
    sourceCapabilityKey: r.sourceCapabilityKey,
    targetJson: r.targetJson,
    inputSchemaHash: r.inputSchemaHash,
    selectionDomain: r.selectionDomain,
  });

/** Existing release-policy decision, serialized with the AR-1 writer; no additional authority. */
@Injectable()
export class WidgetReleaseAccessService {
  constructor(
    private readonly policy: WidgetReleasePolicy,
    private readonly audit: AuditLogService,
  ) {}

  async current(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<VerifiedReleaseView | null> {
    await tx.$queryRaw`SELECT /* widget release admission */ pg_advisory_xact_lock_shared(hashtextextended(${'widget-release:tenant:' + tenantId}, 0))::text`;
    const [clock] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
    const row = await tx.tenantEntitlement.findUnique({
      where: {
        tenantId_featureKey: { tenantId, featureKey: 'widgets.runtime' },
      },
    });
    return row === null ||
      !row.enabled ||
      (row.expiresAt !== null && row.expiresAt <= clock.now)
      ? null
      : this.policy.view(tenantId, row, clock.now);
  }

  /** Called in the SAME transaction as emission/record/receipt insertion. Failure rolls back all. */
  async bindMint(
    tenantId: string,
    rows: readonly MintReleaseFacts[],
    registryDigest: string,
    tx: Prisma.TransactionClient,
    widgetKind: string,
  ): Promise<void> {
    const view = await this.current(tenantId, tx);
    if (view === null) releaseDeny('admission');
    if (view.scope !== NO_HANDOFF_PROFILE) return;
    if (registryDigest !== PROFILE_REGISTRY_DIGEST)
      releaseDeny('registry_binding');
    // Envelope-level refusal also covers zero/all-NONE intents (no records).
    if (PROFILE_MANIFEST.unavailableKinds.includes(widgetKind))
      releaseDeny('profile_unavailable');
    for (const row of rows) {
      if (
        row.record.tenantId !== tenantId ||
        row.record.widgetKind !== widgetKind ||
        !this.allowed(row.template, row.record)
      )
        releaseDeny('profile_unavailable');
      await this.audit.log(
        {
          tenantId,
          action: AUDIT_ACTION,
          entityType: 'WidgetIntentRecord',
          entityId: row.record.intentTokenHash,
          metadata: {
            contract: 'maya.widget-release-emission-binding/1',
            ...view,
            template: row.template,
            factsDigest: bindingHash(row.record),
          },
        },
        tx,
      );
    }
  }

  async admits(
    tenantId: string,
    record: ReleaseIntentFacts,
    registryDigest: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const view = await this.current(tenantId, tx);
    if (view === null || tenantId !== record.tenantId) return false;
    if (view.scope !== NO_HANDOFF_PROFILE) return true;
    if (
      registryDigest !== PROFILE_REGISTRY_DIGEST ||
      record.effect === 'HANDOFF' ||
      PROFILE_MANIFEST.unavailableKinds.includes(record.widgetKind)
    )
      return false;
    const rows = await tx.auditLog.findMany({
      where: {
        scope: 'tenant',
        tenantId,
        action: AUDIT_ACTION,
        entityType: 'WidgetIntentRecord',
        entityId: record.intentTokenHash,
      },
      take: 2,
      select: { metadataJson: true },
    });
    if (rows.length !== 1) return false;
    try {
      const b = object(rows[0].metadataJson);
      return (
        b.contract === 'maya.widget-release-emission-binding/1' &&
        b.scope === NO_HANDOFF_PROFILE &&
        b.profileDigest === PROFILE_DIGEST &&
        b.version === view.version &&
        b.certificateDigest === view.certificateDigest &&
        b.factsDigest === bindingHash(record) &&
        typeof b.template === 'string' &&
        this.allowed(b.template, record)
      );
    } catch {
      return false;
    }
  }

  private allowed(template: string, record: ReleaseIntentFacts): boolean {
    if (
      !PROFILE_MANIFEST.templates.includes(template) ||
      record.effect === 'HANDOFF' ||
      PROFILE_MANIFEST.unavailableKinds.includes(record.widgetKind)
    )
      return false;
    const tuple =
      PROFILE_REGISTRY.tuples[template as keyof typeof PROFILE_REGISTRY.tuples];
    if (
      !tuple ||
      tuple.effect !== record.effect ||
      !(tuple.kinds as readonly string[]).includes(record.widgetKind) ||
      tuple.inputSchemaHash !== record.inputSchemaHash ||
      !this.targetAllowed(template, tuple.target, record)
    )
      return false;
    if (
      template === 'navigate.journal.detail@1' ||
      template === 'navigate.journal.parent@1'
    )
      if (
        record.sourceCapabilitySpace !== 'C9' ||
        record.sourceCapabilityKey !== 'operations.journal.read'
      )
        return false;
    if (tuple.sourceSubject)
      return (
        record.capabilitySpace === 'C9' &&
        typeof record.capabilityKey === 'string' &&
        (PROFILE_REGISTRY.successorCapabilities as readonly string[]).includes(
          record.capabilityKey,
        )
      );
    return (
      (tuple.subject?.space ?? null) === record.capabilitySpace &&
      (tuple.subject?.key ?? null) === record.capabilityKey
    );
  }

  private targetAllowed(
    template: string,
    target: unknown,
    record: ReleaseIntentFacts,
  ): boolean {
    if (template !== 'navigate.journal.parent@1')
      return releaseHash(target) === releaseHash(record.targetJson);
    // Only this fixed template binds a server-resolved retained parent. The exact ref is
    // included in the immutable grant-generation emission binding, never a caller exclusion.
    const value = record.targetJson as {
      class?: unknown;
      ref?: unknown;
    } | null;
    return (
      value !== null &&
      typeof value === 'object' &&
      Object.keys(value).sort().join(',') === 'class,ref' &&
      value.class === 'w' &&
      typeof value.ref === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value.ref,
      ) &&
      value.ref !== record.widgetId
    );
  }
}
