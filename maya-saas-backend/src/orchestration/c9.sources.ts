import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MeasurementReadService } from '../measurement/measurement.read.service';
import { measurementForAi } from '../measurement/measurement.presentation';
import { C8ReadService } from '../valuation/c8.read';
import {
  C9Object,
  C9Principal,
  C9_SOURCES,
  c9Deny,
  c9Evidence,
  c9Hash,
} from './c9.contract';

const identityFields: Record<
  (typeof C9_SOURCES)[number],
  readonly [string | null, string]
> = {
  ActionExecution: ['identityFingerprint', 'normalizedInputHash'],
  AiApprovalRequest: [null, 'payloadHash'],
  AiToolExecution: [null, 'inputHash'],
  MarketingCampaign: [null, 'bulkIntentHash'],
  OwnerReportRun: ['identityHash', 'intentHash'],
  TenantBusinessConfigurationRevision: [null, 'contentHash'],
  AgentTask: ['taskFingerprint', 'taskFingerprint'],
  Opportunity: ['identityFingerprint', 'evidenceFingerprint'],
  MeasurementRevision: ['identityHash', 'intentHash'],
  C8ResultRevision: ['identityHash', 'intentHash'],
  ClientBookingConfirmation: [null, 'intentHash'],
};

/** C5 owns namespaced fingerprints; C9's existing wire carries 64-hex hashes.
 * Hash the complete native value (including its namespace), never change C5 or
 * strip the prefix and pretend it was the same source identity.
 */
export function c9C5Fingerprint(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(identity|evidence|task)_[a-f0-9]{64}$/.test(value)
  )
    c9Deny('source_qualification');
  return c9Hash('c5-source-fingerprint/1', [value]);
}
/** Live qualified references. No FK/cleanup or write into independent source owners. */
@Injectable()
export class C9Sources {
  constructor(
    private readonly measurement: MeasurementReadService,
    private readonly valuation: C8ReadService,
  ) {}
  async contextProjection(
    tx: Prisma.TransactionClient,
    p: C9Principal,
    ref: C9Object,
    now: Date,
  ): Promise<C9Object> {
    await this.check(tx, p, ref, now);
    if (!p.userId) c9Deny('source_requires_supported_reader');
    if (ref.sourceType === 'MeasurementRevision') {
      const v = measurementForAi(
        await this.measurement.snapshot(p.tenantId, p.userId, ref.id as string),
      );
      return {
        sourceContract: v.contract,
        kind: v.kind,
        asOf: v.asOf,
        period: v.period,
        rule: v.rule,
        completeness: v.completeness,
        qualification: v.qualification,
        attribution: v.attribution,
        metrics: v.metrics,
        limitations: v.limitations,
      };
    }
    if (ref.sourceType === 'C8ResultRevision') {
      const v = await this.valuation.snapshot(
        p.tenantId,
        p.userId,
        ref.id as string,
      );
      return {
        sourceContract: v.contract,
        kind: v.kind,
        current: v.current,
        available: v.available,
        basis: v.basis,
        currency: v.currency,
        asOf: v.asOf,
        period: v.period,
        horizonEnd: v.horizonEnd,
        completeness: v.completeness,
        qualification: v.qualification,
        values: v.values,
        reasons: v.reasons,
        rule: v.rule,
        numericPrediction: v.numericPrediction,
        calibration: v.calibration,
        activation: v.activation,
        boundaries: v.boundaries,
        // Population coverage is retained even when the invocation does not request individual members.
        ranking: v.ranking
          ? {
              objectiveKey: v.ranking.objectiveKey,
              coverage: v.ranking.coverage,
              total: v.ranking.total,
              excludedCount: v.ranking.excludedCount,
              membersIncluded: false,
              contactPermission: false,
              actionAuthority: false,
            }
          : null,
      };
    }
    return c9Deny('context_fact_source_unavailable');
  }
  async check(
    tx: Prisma.TransactionClient,
    p: C9Principal,
    value: unknown,
    now: Date,
  ): Promise<C9Object> {
    const ref = c9Evidence(value) as C9Object;
    if (
      ref.tenantId !== p.tenantId ||
      ref.status !== 'VERIFIED' ||
      Date.parse(ref.observedAt as string) > now.getTime()
    )
      c9Deny('source_qualification');
    for (const key of ['validUntil', 'retentionUntil'])
      if (ref[key] && Date.parse(ref[key] as string) <= now.getTime())
        c9Deny('source_expired');
    const type = ref.sourceType as (typeof C9_SOURCES)[number];
    const [row] = await tx.$queryRaw<C9Object[]>(
      Prisma.sql`SELECT to_jsonb(s) AS data FROM ${Prisma.raw('"' + type + '"')} s WHERE s.id::text=${ref.id} AND s."tenantId"=${p.tenantId} FOR SHARE`,
    );
    if (!row) c9Deny('source_missing');
    const s = row.data as C9Object,
      [identity, input] = identityFields[type];
    let expectedIdentity = identity
      ? s[identity]
      : c9Hash('source-identity/1', [type, p.tenantId, ref.id]);
    let expectedInput = s[input];
    if (type === 'Opportunity' || type === 'AgentTask') {
      expectedIdentity = c9C5Fingerprint(expectedIdentity);
      expectedInput = c9C5Fingerprint(expectedInput);
    }
    if (
      expectedIdentity !== ref.identityHash ||
      expectedInput !== ref.inputHash
    )
      c9Deny('source_changed');
    const rawExpiry = s.expiresAt ?? s.validUntil ?? s.intentExpiresAt;
    // Prisma DateTime columns are UTC timestamp WITHOUT time zone. PostgreSQL
    // to_jsonb omits the zone; Date.parse must not interpret that value in the
    // host's local timezone and shorten/extend the source's actual validity.
    let expiry: number | null = null;
    if (rawExpiry !== undefined && rawExpiry !== null) {
      if (typeof rawExpiry !== 'string') c9Deny('source_qualification');
      expiry = Date.parse(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(rawExpiry)
          ? `${rawExpiry}Z`
          : rawExpiry,
      );
      if (!Number.isFinite(expiry)) c9Deny('source_qualification');
    }
    if (expiry !== null && expiry <= now.getTime()) c9Deny('source_expired');
    if (
      expiry !== null &&
      (!ref.validUntil || Date.parse(ref.validUntil as string) > expiry)
    )
      c9Deny('source_validity_expanded');
    if (type === 'MeasurementRevision' || type === 'C8ResultRevision') {
      if (!p.userId) c9Deny('source_requires_supported_reader');
      if (s.state !== 'PUBLISHED') c9Deny('source_not_published');
      if (type === 'MeasurementRevision')
        await this.measurement.snapshot(p.tenantId, p.userId, ref.id as string);
      else
        await this.valuation.snapshot(p.tenantId, p.userId, ref.id as string);
    } else {
      const membership = p.membershipId
        ? await tx.membership.findFirst({
            where: {
              tenantId: p.tenantId,
              id: p.membershipId,
              status: 'active',
            },
          })
        : null;
      const ownActor =
        p.userId &&
        (s.actorUserId === p.userId || s.requestedByUserId === p.userId);
      const tenantOwner =
        membership &&
        ['tenant_owner', 'business_owner'].includes(membership.role) &&
        !membership.branchId;
      if (!ownActor && !tenantOwner) c9Deny('source_reader_authority');
      if (type === 'AgentTask' && (s.status !== 'current' || !s.opportunityId))
        c9Deny('assignment_unavailable');
      if (type === 'Opportunity' && s.status !== 'active')
        c9Deny('opportunity_unavailable');
    }
    const subject =
      s.clientId ??
      s.subjectId ??
      s.targetRef ??
      s.affectedEntityRef ??
      s.userId ??
      s.id;
    if (ref.subjectRef !== subject) c9Deny('source_subject');
    return s;
  }
  async all(
    tx: Prisma.TransactionClient,
    p: C9Principal,
    refs: readonly unknown[],
    now: Date,
  ): Promise<void> {
    for (const ref of refs) await this.check(tx, p, ref, now);
  }
}
