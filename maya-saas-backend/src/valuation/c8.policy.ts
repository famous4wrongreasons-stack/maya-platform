import { Prisma } from '@prisma/client';
import {
  C8_BASES,
  C8_FEATURE_KEYS,
  C8_TARGETS,
  c8Digest,
  c8Id,
  c8Normalize,
  c8Object,
  C8Object,
} from './c8.contract';
export const C8_POLICY_NAMESPACE = 'c8_valuation' as const;
function list(value: unknown, limit = 40): unknown[] {
  if (!Array.isArray(value) || value.length > limit)
    throw new Error('c8_policy_list_limit');
  return value;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(value))
    throw new Error('c8_policy_name');
  return value;
}
function one(value: unknown, choices: readonly string[]): string {
  if (typeof value !== 'string' || !choices.includes(value))
    throw new Error('c8_policy_value');
  return value;
}
function integer(value: unknown, min = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    throw new Error('c8_policy_integer');
  return value;
}
function ids(value: unknown): string[] {
  const result = list(value, 100).map(c8Id);
  if (new Set(result).size !== result.length)
    throw new Error('c8_duplicate_scope');
  return result.sort();
}
export function c8Window(value: unknown, appointment = false): C8Object {
  const w = c8Object(value, ['unit', 'count'], ['unit']);
  if (w.unit === 'appointment_outcome' && appointment) {
    if (w.count !== undefined)
      throw new Error('c8_appointment_horizon_count_forbidden');
    return { unit: 'appointment_outcome' };
  }
  one(w.unit, ['day', 'calendar_month']);
  integer(w.count);
  return { unit: String(w.unit), count: Number(w.count) };
}
function moneyBasis(row: Record<string, unknown>) {
  one(row.basis, C8_BASES);
  if (row.basis === 'observed_attended_count') {
    if (row.currency !== null) throw new Error('c8_count_currency');
  } else if (
    typeof row.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(row.currency)
  )
    throw new Error('c8_exact_currency');
}
/** A22 inner payload validator; no config writer or quality override lives here. */
export function c8Policy(value: unknown): C8Object {
  const p = c8Object(value, [
    'version',
    'valueMeasures',
    'predictionTargets',
    'dormancyRules',
    'rankingObjectives',
    'minimumEvidence',
    'exclusions',
    'opportunityAdmission',
    'modelUse',
  ]);
  if (p.version !== 1) throw new Error('c8_policy_version');
  const measureNames = new Set<string>();
  const measures = list(p.valueMeasures).map((v) => {
    const r = c8Object(v, [
      'key',
      'basis',
      'currency',
      'window',
      'serviceScope',
    ]);
    const key = name(r.key);
    if (measureNames.has(key)) throw new Error('c8_duplicate_measure');
    measureNames.add(key);
    moneyBasis(r);
    return {
      ...r,
      window: c8Window(r.window),
      serviceScope: ids(r.serviceScope),
    };
  });
  const targetKeys = new Set<string>();
  const targets = list(p.predictionTargets).map((v) => {
    const r = c8Object(v, [
      'targetKey',
      'modelKey',
      'horizon',
      'basis',
      'currency',
      'serviceScope',
    ]);
    const targetKey = one(r.targetKey, C8_TARGETS);
    if (targetKeys.has(targetKey)) throw new Error('c8_duplicate_target');
    targetKeys.add(targetKey);
    c8Id(r.modelKey);
    if (typeof r.basis !== 'string' || !/^[a-z][a-z0-9_]{0,119}$/.test(r.basis))
      throw new Error('c8_target_basis');
    if (
      r.currency !== null &&
      (typeof r.currency !== 'string' || !/^[A-Z]{3}$/.test(r.currency))
    )
      throw new Error('c8_target_currency');
    return {
      ...r,
      horizon: c8Window(r.horizon, targetKey === 'appointment_no_show'),
      serviceScope: ids(r.serviceScope),
    };
  });
  const dormantNames = new Set<string>();
  const dormancy = list(p.dormancyRules).map((v) => {
    const r = c8Object(v, [
      'ruleKey',
      'serviceScope',
      'elapsed',
      'comparison',
      'evidence',
      'minimumCoverage',
    ]);
    name(r.ruleKey);
    if (dormantNames.has(String(r.ruleKey)))
      throw new Error('c8_duplicate_dormancy_rule');
    dormantNames.add(String(r.ruleKey));
    one(r.comparison, ['gt', 'gte']);
    one(r.evidence, ['proven_attendance']);
    one(r.minimumCoverage, ['COMPLETE', 'PARTIAL']);
    return {
      ...r,
      serviceScope: ids(r.serviceScope),
      elapsed: c8Window(r.elapsed),
    };
  });
  const objectiveNames = new Set<string>();
  const ranking = list(p.rankingObjectives).map((v) => {
    const r = c8Object(v, [
      'key',
      'scope',
      'comparators',
      'tieBreak',
      'unknownBucket',
    ]);
    name(r.key);
    if (objectiveNames.has(String(r.key)))
      throw new Error('c8_duplicate_objective');
    objectiveNames.add(String(r.key));
    one(r.scope, ['client']);
    one(r.tieBreak, ['opaque_subject_id']);
    one(r.unknownBucket, ['separate']);
    const comparators = list(r.comparators, 8).map((v) => {
      const c = c8Object(v, ['measureKey', 'direction']);
      if (
        !measureNames.has(String(c.measureKey)) &&
        !targetKeys.has(String(c.measureKey)) &&
        !dormantNames.has(String(c.measureKey))
      )
        throw new Error('c8_unknown_comparator');
      one(c.direction, ['asc', 'desc']);
      return c;
    });
    if (
      !comparators.length ||
      new Set(comparators.map((c) => c.measureKey)).size !== comparators.length
    )
      throw new Error('c8_comparator_identity');
    return { ...r, comparators };
  });
  const evidence = list(p.minimumEvidence).map((v) => {
    const r = c8Object(v, [
      'targetKey',
      'minimumObservedEvents',
      'requiredCoverage',
      'maximumInputAge',
    ]);
    one(r.targetKey, [...C8_TARGETS, ...C8_FEATURE_KEYS]);
    integer(r.minimumObservedEvents, 0);
    one(r.requiredCoverage, ['COMPLETE', 'PARTIAL']);
    return { ...r, maximumInputAge: c8Window(r.maximumInputAge) };
  });
  const x = c8Object(p.exclusions, [
    'serviceScope',
    'branchIds',
    'subjectStates',
    'requiredFeatures',
  ]);
  const exclusions = {
    serviceScope: ids(x.serviceScope),
    branchIds: ids(x.branchIds),
    subjectStates: list(x.subjectStates, 10).map((s) =>
      one(s, ['merged', 'inactive']),
    ),
    requiredFeatures: list(x.requiredFeatures, 100).map((k) =>
      one(k, C8_FEATURE_KEYS),
    ),
  };
  const admission = c8Object(p.opportunityAdmission, ['enabled', 'rules']);
  if (typeof admission.enabled !== 'boolean')
    throw new Error('c8_opportunity_boolean');
  const rules = list(admission.rules).map((v) => {
    const r = c8Object(v, [
      'ruleKey',
      'opportunityType',
      'resultKind',
      'measureKey',
      'comparison',
      'threshold',
      'basis',
      'maximumAge',
      'readDomain',
    ]);
    name(r.ruleKey);
    one(r.opportunityType, [
      'client_reactivation_candidate',
      'business_metric_change',
    ]);
    one(r.resultKind, [
      'OBSERVED_VALUE',
      'POLICY_SIGNAL',
      'PREDICTION',
      'RANKING',
    ]);
    if (
      !measureNames.has(String(r.measureKey)) &&
      !targetKeys.has(String(r.measureKey)) &&
      !dormantNames.has(String(r.measureKey))
    )
      throw new Error('c8_opportunity_measure');
    one(r.comparison, ['gt', 'gte', 'lt', 'lte', 'eq']);
    if (
      typeof r.threshold !== 'string' ||
      !/^(-?(0|[1-9]\d*)(\.\d*[1-9])?)$/.test(r.threshold)
    )
      throw new Error('c8_threshold_decimal');
    if (typeof r.basis !== 'string' || !/^[a-z][a-z0-9_]{0,119}$/.test(r.basis))
      throw new Error('c8_opportunity_basis');
    one(r.readDomain, [
      'client_lifecycle',
      'business_intelligence',
      'occupancy',
    ]);
    return { ...r, maximumAge: c8Window(r.maximumAge) };
  });
  const modelUse = list(p.modelUse).map((v) => {
    const r = c8Object(v, [
      'targetKey',
      'modelVersionId',
      'manifestHash',
      'evaluationRevisionId',
      'evaluationSnapshotHash',
      'requested',
    ]);
    one(r.targetKey, C8_TARGETS);
    c8Id(r.modelVersionId);
    c8Id(r.evaluationRevisionId);
    c8Digest(r.manifestHash);
    c8Digest(r.evaluationSnapshotHash);
    // No numeric activation contract is released in the approved limited-data mode.
    one(r.requested, ['disabled']);
    return r;
  });
  return c8Normalize({
    version: 1,
    valueMeasures: measures,
    predictionTargets: targets,
    dormancyRules: dormancy,
    rankingObjectives: ranking,
    minimumEvidence: evidence,
    exclusions,
    opportunityAdmission: { enabled: admission.enabled, rules },
    modelUse,
  }) as C8Object;
}
/** Independently recheck explicit scope in the existing A22 admission/executor transaction. */
export async function c8PolicyScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  value: unknown,
): Promise<void> {
  const p = c8Policy(value);
  const branches = (p.exclusions as C8Object).branchIds as string[];
  for (const id of branches)
    if (
      !(await tx.branch.findFirst({
        where: { id, tenantId },
        select: { id: true },
      }))
    )
      throw new Error('c8_policy_branch_wrong_tenant');
  // Use existing canonical service/catalog subjects; unbound provider IDs fail closed.
  const services = new Set<string>();
  for (const name of ['valueMeasures', 'predictionTargets', 'dormancyRules'])
    for (const row of p[name] as C8Object[])
      for (const id of row.serviceScope as string[]) services.add(id);
  for (const id of (p.exclusions as C8Object).serviceScope as string[])
    services.add(id);
  for (const id of services) {
    const internal = await tx.internalService.findFirst({
      where: { id, tenantId, active: true },
      select: { id: true },
    });
    const catalog = internal
      ? null
      : await tx.tenantCatalogItem.findFirst({
          where: { id, tenantId, kind: 'service', active: true },
          select: { id: true },
        });
    if (!internal && !catalog)
      throw new Error('c8_policy_service_not_canonically_bound');
  }
}
