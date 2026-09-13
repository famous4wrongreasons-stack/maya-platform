import { C8ResultRevision } from '@prisma/client';
import {
  OpportunityEvidenceV1,
  OpportunityV1,
  OPPORTUNITY_CONTRACT,
} from '../opportunities/opportunity.contract';
import { canonicalFingerprint } from '../opportunities/opportunity.engine';
import { C8Object, c8Digest, c8Hash, c8Id } from './c8.contract';
import { c8CompareScalar } from './c8.deterministic';
import { c8ShiftWindow } from './c8.time';

export function c8OpportunityRef(row: C8ResultRevision): string {
  if (!row.snapshotHash) throw new Error('c8_snapshot_required');
  return (
    'c8.v1.' +
    Buffer.from(
      JSON.stringify([
        row.id,
        row.snapshotHash,
        row.policyRevisionId,
        row.policyContentHash,
        row.modelManifestHash,
      ]),
    ).toString('base64url')
  );
}
export function c8ParseOpportunityRef(value: string) {
  if (!value.startsWith('c8.v1.') || value.length > 1200)
    throw new Error('c8_opportunity_ref');
  const decoded: unknown = JSON.parse(
    Buffer.from(value.slice(6), 'base64url').toString('utf8'),
  );
  if (
    !Array.isArray(decoded) ||
    decoded.length !== 5 ||
    'c8.v1.' + Buffer.from(JSON.stringify(decoded)).toString('base64url') !==
      value
  )
    throw new Error('c8_opportunity_ref');
  const [id, hash, policyId, policyHash, modelHash] = decoded as unknown[];
  c8Id(id);
  c8Digest(hash);
  c8Id(policyId);
  c8Digest(policyHash);
  if (modelHash !== null) c8Digest(modelHash);
  return {
    id: String(id),
    hash: String(hash),
    policyId: String(policyId),
    policyHash: String(policyHash),
    modelHash: modelHash as string | null,
  };
}
export function c8OpportunityEvidence(
  row: C8ResultRevision,
): OpportunityEvidenceV1 {
  return {
    owner: 'c8_result',
    capability: 'valuation_result_v1',
    factRef: c8OpportunityRef(row),
    version: 1,
    observedAt: row.publishedAt!.toISOString(),
    asOf: row.t0.toISOString(),
    completeness: row.completeness === 'COMPLETE' ? 'complete' : 'partial',
    basis: row.basis,
  };
}
export function c8AssertOpportunityBranch(opportunity: OpportunityV1) {
  if (!opportunity.evidence.some((e) => e.owner === 'c8_result')) return;
  if (
    opportunity.outcome !== 'inform_only' ||
    opportunity.proposedActionIntent ||
    opportunity.allowedNextCapabilities.some(
      (c) => c !== 'read_valuation_result',
    )
  )
    throw new Error('c8_opportunity_no_execution');
  for (const e of opportunity.evidence) {
    if (
      e.owner !== 'c8_result' ||
      e.capability !== 'valuation_result_v1' ||
      e.version !== 1 ||
      !e.factRef
    )
      throw new Error('c8_typed_evidence_required');
    c8ParseOpportunityRef(e.factRef);
  }
}
function scalar(row: C8ResultRevision, key: string): string | boolean | null {
  const output = row.valuesJson as unknown as {
    values?: Array<{ key: string; value: unknown }>;
  } | null;
  const v = output?.values?.find((v) => v.key === key)?.value;
  return typeof v === 'string' || typeof v === 'boolean' ? v : null;
}
function sameScope(a: C8ResultRevision, b: C8ResultRevision) {
  const left = a.scopeJson as C8Object,
    right = b.scopeJson as C8Object;
  return (
    c8Hash([left.branchIds, left.serviceScope]) ===
    c8Hash([right.branchIds, right.serviceScope])
  );
}
/** Pure projection of server-verified result references. No source facts, strategy or execution is created. */
export function c8OpportunityProjection(
  primary: C8ResultRevision,
  candidates: C8ResultRevision[],
  rule: C8Object,
  policyRevision: number,
  now: Date,
): OpportunityV1 | null {
  for (const key of [
    'ruleKey',
    'measureKey',
    'threshold',
    'comparison',
    'readDomain',
  ])
    if (typeof rule[key] !== 'string')
      throw new Error('c8_named_opportunity_rule_required');
  if (
    primary.state !== 'PUBLISHED' ||
    primary.eligibility !== 'ELIGIBLE' ||
    primary.kind !== rule.resultKind ||
    primary.basis !== rule.basis ||
    primary.modelVersionId ||
    primary.expiresAt <= now
  )
    return null;
  const ageDeadline = c8ShiftWindow(
    primary.t0,
    rule.maximumAge,
    primary.timezone,
    1,
  );
  if (ageDeadline <= now) return null;
  const value = scalar(primary, rule.measureKey as string);
  if (value === null) return null;
  const comparison = c8CompareScalar(
    typeof value === 'boolean' ? (value ? '1' : '0') : value,
    rule.threshold as string,
  );
  if (
    !(
      {
        gt: comparison > 0,
        gte: comparison >= 0,
        lt: comparison < 0,
        lte: comparison <= 0,
        eq: comparison === 0,
      } as Record<string, boolean>
    )[rule.comparison as string]
  )
    return null;
  const evidence = [primary];
  const eligible = candidates.filter(
    (c) =>
      c.tenantId === primary.tenantId &&
      c.subjectId === primary.subjectId &&
      c.subjectKind === primary.subjectKind &&
      c.policyRevisionId === primary.policyRevisionId &&
      c.policyContentHash === primary.policyContentHash &&
      sameScope(primary, c) &&
      c.state === 'PUBLISHED' &&
      c.eligibility === 'ELIGIBLE' &&
      !c.modelVersionId &&
      c.expiresAt > now &&
      c8ShiftWindow(c.t0, rule.maximumAge, c.timezone, 1) > now,
  );
  if (rule.opportunityType === 'client_reactivation_candidate') {
    if (
      primary.subjectKind !== 'client' ||
      rule.readDomain !== 'client_lifecycle'
    )
      return null;
    const dormantCandidates = eligible.filter(
      (c) => c.kind === 'POLICY_SIGNAL' && c.ruleKey.startsWith('c8.dormancy/'),
    );
    const dormantKeys = new Set(dormantCandidates.map((c) => c.ruleKey));
    const dormant =
      primary.kind === 'POLICY_SIGNAL'
        ? primary
        : dormantKeys.size === 1
          ? dormantCandidates[0]
          : undefined;
    if (!dormant || scalar(dormant, dormant.ruleKey.slice(12)) !== true)
      return null;
    const historical = eligible.find(
      (c) => c.kind === 'OBSERVED_VALUE' && c.ruleKey.startsWith('c8.value/'),
    );
    if (!dormant || !historical) return null;
    evidence.push(dormant, historical);
  } else if (
    rule.opportunityType !== 'business_metric_change' ||
    !['tenant', 'branch', 'staff'].includes(primary.subjectKind) ||
    !['business_intelligence', 'occupancy'].includes(rule.readDomain as string)
  )
    return null;
  const rows = [...new Map(evidence.map((r) => [r.id, r])).values()].sort(
    (a, b) => a.id.localeCompare(b.id),
  );
  const refs = rows.map(c8OpportunityEvidence),
    scope = primary.scopeJson as C8Object;
  const policyKey = 'c8_' + (rule.ruleKey as string);
  const semanticKey = canonicalFingerprint('opportunity', [
    primary.tenantId,
    rule.opportunityType,
    primary.subjectKind,
    primary.subjectId,
    policyKey,
    scope.branchIds,
    scope.serviceScope,
  ]);
  const evidenceFingerprint = canonicalFingerprint('evidence', [refs]);
  const identityFingerprint = canonicalFingerprint('opportunity-identity', [
    semanticKey,
    evidenceFingerprint,
    policyRevision,
  ]);
  return {
    contract: OPPORTUNITY_CONTRACT,
    identityVersion: 1,
    semanticKey,
    identityFingerprint,
    evidenceFingerprint,
    policyKey,
    policyVersion: policyRevision,
    opportunityKey: identityFingerprint,
    tenantId: primary.tenantId,
    type: rule.opportunityType as OpportunityV1['type'],
    affectedEntity: {
      kind: primary.subjectKind as 'client' | 'tenant' | 'branch' | 'staff',
      ref: primary.subjectId,
    },
    evidence: refs,
    observedAt: new Date(
      Math.max(...rows.map((r) => r.publishedAt!.getTime())),
    ).toISOString(),
    expiresAt: new Date(
      Math.min(
        ...rows.map((r) =>
          Math.min(
            r.expiresAt.getTime(),
            c8ShiftWindow(r.t0, rule.maximumAge, r.timezone, 1).getTime(),
          ),
        ),
      ),
    ).toISOString(),
    outcome: 'inform_only',
    recommendedAgentDomain:
      rule.readDomain as OpportunityV1['recommendedAgentDomain'],
    allowedNextCapabilities: ['read_valuation_result'],
    limitations: [
      'c8_qualified_result_not_strategy_or_execution',
      'value_is_not_consent',
      'ranking_is_not_contact_permission',
      ...(rows.some((r) => r.completeness !== 'COMPLETE')
        ? ['known_source_coverage_partial']
        : []),
    ],
  };
}
