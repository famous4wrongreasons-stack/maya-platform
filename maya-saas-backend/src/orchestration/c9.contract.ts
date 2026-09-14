import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { stableActionJson } from '../action-engine/action-engine.identity';

export const C9_DOMAINS = [
  'ADMIN',
  'CLIENT_LIFECYCLE',
  'OCCUPANCY',
  'BUSINESS_INTELLIGENCE',
] as const;
export type C9Domain = (typeof C9_DOMAINS)[number];
export const C9_TASKS = [
  'c9.route',
  'c9.admin',
  'c9.client_lifecycle',
  'c9.occupancy',
  'c9.bi',
  'c9.compose',
] as const;
export const C9_DAY = 86_400_000;
export const C9_RETENTION = 365 * C9_DAY;
export type C9Object = Record<string, unknown>;
export type C9Check = (value: unknown) => unknown;
export function c9Deny(code: string): never {
  throw new BadRequestException(`c9_${code}`);
}
export function c9Object(v: unknown): C9Object {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    c9Deny('object_required');
  return v as C9Object;
}
export function c9String(max: number, min = 1, pattern?: RegExp): C9Check {
  return (v) => {
    if (
      typeof v !== 'string' ||
      v.length < min ||
      v.length > max ||
      Array.from(v).some(
        (c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)),
      ) ||
      (pattern && !pattern.test(v))
    )
      c9Deny('string');
    return v.normalize('NFC');
  };
}
export const c9Id = c9String(128);
export const c9HashValue = c9String(64, 64, /^[a-f0-9]{64}$/);
export const c9Instant: C9Check = (v) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    c9Deny('instant');
  return v;
};
export const c9Boolean: C9Check = (v) =>
  typeof v === 'boolean' ? v : c9Deny('boolean');
export const c9Int =
  (min: number, max: number): C9Check =>
  (v) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
      ? v
      : c9Deny('integer');
export const c9Enum =
  (...values: readonly string[]): C9Check =>
  (v) =>
    typeof v === 'string' && values.includes(v) ? v : c9Deny('enum');
export const c9Nullable =
  (check: C9Check): C9Check =>
  (v) =>
    v === null ? null : check(v);
export const c9Array =
  (check: C9Check, max: number, min = 0): C9Check =>
  (v) => {
    if (!Array.isArray(v) || v.length < min || v.length > max)
      c9Deny('array_bounds');
    return v.map(check); // Never truncate and then claim completeness.
  };
export const c9Shape =
  (
    fields: Record<string, C9Check>,
    optional: readonly string[] = [],
  ): C9Check =>
  (v) => {
    const obj = c9Object(v),
      out: C9Object = {};
    if (Object.keys(obj).some((k) => !Object.hasOwn(fields, k)))
      c9Deny('unknown_field');
    for (const [key, check] of Object.entries(fields)) {
      if (!Object.hasOwn(obj, key) && optional.includes(key)) continue;
      out[key] = check(obj[key]);
    }
    return out;
  };
/** Fixed versioned tuples are hashed only after their closed typed normalizer. */
export function c9Hash(contract: string, tuple: readonly unknown[]): string {
  return createHash('sha256')
    .update(stableActionJson(['maya.c9-canonical/1', contract, ...tuple]))
    .digest('hex');
}
export function c9Bytes(v: unknown, max: number): void {
  if (Buffer.byteLength(JSON.stringify(v), 'utf8') > max)
    c9Deny('payload_bounds');
}
export const C9_SOURCES = [
  'ActionExecution',
  'AiApprovalRequest',
  'AiToolExecution',
  'MarketingCampaign',
  'OwnerReportRun',
  'TenantBusinessConfigurationRevision',
  'AgentTask',
  'Opportunity',
  'MeasurementRevision',
  'C8ResultRevision',
  'ClientBookingConfirmation',
] as const;
export const c9Evidence = c9Shape({
  sourceType: c9Enum(...C9_SOURCES),
  id: c9Id,
  tenantId: c9Id,
  subjectKind: c9Id,
  subjectRef: c9Id,
  contractVersion: c9Int(1, 1),
  identityHash: c9HashValue,
  inputHash: c9HashValue,
  observedAt: c9Instant,
  validUntil: c9Nullable(c9Instant),
  retentionUntil: c9Nullable(c9Instant),
  status: c9Enum('VERIFIED', 'SOURCE_LABELLED', 'UNAVAILABLE'),
  completeness: c9Enum('COMPLETE', 'PARTIAL', 'UNAVAILABLE', 'NOT_MEASURED'),
  unavailableReason: c9Nullable(c9String(128)),
});
export const c9Refs = c9Array(c9Evidence, 100);
export const c9Period = c9Shape({
  from: c9Instant,
  to: c9Instant,
  timezone: c9String(80),
});
export const c9OneOff = c9Shape({
  discounts: c9Nullable(c9Enum('forbidden', 'existing_owner_only')),
  branchRefs: c9Array(c9Id, 100),
  serviceRefs: c9Array(c9Id, 100),
  requestedPeriod: c9Nullable(c9Period),
});
export const c9Entry = c9Shape({
  opportunityRef: c9Evidence,
  agentTaskRef: c9Nullable(c9Evidence),
});
export const c9Request = c9Shape({
  contract: c9Enum('maya.c9-request/1'),
  eventEnvelopeHash: c9HashValue,
  eventIssuedAt: c9Instant,
  eventExpiresAt: c9Instant,
  objectiveKey: c9Id,
  safeQuestion: c9String(2000),
  period: c9Nullable(c9Period),
  subjectRefs: c9Refs,
  oneOffConstraints: c9OneOff,
  entryRef: c9Nullable(c9Entry),
});
export const c9Principal = c9Shape({
  kind: c9Enum('USER', 'CLIENT_CHANNEL'),
  tenantId: c9Id,
  userId: c9Nullable(c9Id),
  membershipId: c9Nullable(c9Id),
  clientId: c9Nullable(c9Id),
  channelLinkId: c9Nullable(c9Id),
  branchRefs: c9Array(c9Id, 100),
  staffRef: c9Nullable(c9Id),
  proofHash: c9HashValue,
});
export type C9Principal = {
  kind: 'USER' | 'CLIENT_CHANNEL';
  tenantId: string;
  userId: string | null;
  membershipId: string | null;
  clientId: string | null;
  channelLinkId: string | null;
  branchRefs: string[];
  staffRef: string | null;
  proofHash: string;
};
export const c9Money: C9Check = (v) => {
  const s = c9String(19, 1, /^(0|[1-9][0-9]{0,18})$/)(v) as string;
  if (BigInt(s) > 9223372036854775807n) c9Deny('money_overflow');
  return s;
};
/** Traverse only normalized closed contracts, retaining every nested source reference. */
export function c9CollectRefs(value: unknown): C9Object[] {
  if (Array.isArray(value)) return value.flatMap(c9CollectRefs);
  if (value && typeof value === 'object') {
    const obj = value as C9Object;
    if (Object.hasOwn(obj, 'sourceType')) return [c9Evidence(obj) as C9Object];
    return Object.values(obj).flatMap(c9CollectRefs);
  }
  return [];
}

export const c9Exposure: C9Check = (value) => {
  const row = c9Shape({
    maxActions: c9Int(0, 12),
    maxRecipients: c9Int(0, Number.MAX_SAFE_INTEGER),
    maxMessages: c9Int(0, Number.MAX_SAFE_INTEGER),
    providerCost: c9Nullable(
      c9Shape({
        currency: c9String(3, 3, /^[A-Z]{3}$/),
        maxMinorUnits: c9Money,
        quoteRef: c9Evidence,
      }),
    ),
    verifiedZeroCost: c9Nullable(c9Evidence),
    offerRef: c9Nullable(c9Evidence),
    maxDiscountMinorUnits: c9Nullable(c9Money),
    maxDiscountBps: c9Nullable(c9Int(0, 10000)),
  })(value) as C9Object;
  if (row.providerCost !== null && row.verifiedZeroCost !== null)
    c9Deny('exposure_cost_basis');
  if (row.maxDiscountMinorUnits !== null && row.maxDiscountBps !== null)
    c9Deny('exposure_discount_basis');
  return row;
};
export const c9Constraints = c9Shape({
  scopeRefs: c9Refs,
  oneOff: c9OneOff,
  sourcePolicyRefs: c9Refs,
  budgetManifestHash: c9HashValue,
  exposure: c9Exposure,
  requiredApprovalAdapters: c9Array(c9Id, 12),
});
export const c9Objective = c9Shape({
  key: c9Id,
  safeDescription: c9String(1000),
  subjectScopeHash: c9HashValue,
  successCriteria: c9Array(
    c9Shape({
      metricKey: c9Id,
      sourceCapability: c9Id,
      comparison: c9Nullable(c9Enum('AT_LEAST', 'AT_MOST', 'EQUAL')),
      target: c9Nullable(c9Money),
      basis: c9Id,
      currency: c9Nullable(c9String(3, 3, /^[A-Z]{3}$/)),
    }),
    8,
  ),
});
export const c9Alternative = c9Shape({
  key: c9Id,
  title: c9String(120),
  kind: c9Enum('ACTION_PLAN', 'NO_ACTION'),
  why: c9String(1500),
  evidenceRefs: c9Array(c9Evidence, 20),
  scopeHash: c9HashValue,
  knownBenefit: c9Shape({
    factRefs: c9Array(c9Evidence, 20),
    proposalText: c9String(1000, 0),
  }),
  unknowns: c9Array(c9String(400), 20),
  risks: c9Array(c9String(400), 20),
  costSummary: c9Shape({
    reservationRefs: c9Array(c9Id, 12),
    sourceQuoteRefs: c9Refs,
    unavailableReasons: c9Array(c9String(128), 20),
  }),
  approvalAdapterRefs: c9Array(c9Id, 12),
  recommended: c9Boolean,
});
export const c9Skills = c9Array(
  c9Shape({
    taskKey: c9Enum(...C9_TASKS),
    skillHash: c9HashValue,
    promptHash: c9HashValue,
    modelConfigHash: c9HashValue,
    evaluationManifestHash: c9HashValue,
  }),
  6,
);
export const c9Dependencies = c9Array(
  c9Shape({
    stepKey: c9Id,
    requires: c9Enum('RESOLVED_SUCCESS', 'QUALIFIED_READ'),
  }),
  12,
);
export const c9StepBudget = c9Shape({
  callReservationKey: c9Nullable(c9Id),
  exposure: c9Exposure,
  sourcePreviewRefs: c9Refs,
});
export const c9Completeness = c9Shape({
  status: c9Enum('COMPLETE', 'PARTIAL', 'UNAVAILABLE'),
  requestedScopeHash: c9HashValue,
  returnedCount: c9Int(0, 1000000000),
  totalCount: c9Nullable(c9Int(0, 1000000000)),
  hasMore: c9Boolean,
  cursorRef: c9Nullable(c9Id),
  truncated: c9Boolean,
  reasonCodes: c9Array(c9String(128), 20),
});
/** Untrusted human/provider strings never become source facts. This is minimization, not an authority check. */
export function c9SafeText(value: unknown, max = 2000): string {
  const text = c9String(max, 0)(value) as string;
  if (
    /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[ ()-]*){10,}|Bearer\s|sk-[a-zA-Z0-9]|-----BEGIN|(?:password|secret|token|api[_ -]?key)\s*[:=])/iu.test(
      text,
    )
  )
    c9Deny('use_secure_surface');
  return text;
}
const handle = c9String(80, 1, /^h_[a-f0-9]{32,64}$/);
const handles = c9Array(handle, 100);
const resultSchema = c9Shape(
  {
    contract: c9Enum('AgentResult@1'),
    agent_id: c9Enum(...C9_DOMAINS),
    intent: c9Id,
    findings: c9Array(
      c9Shape({
        statement: (v) => c9SafeText(v, 800),
        evidence_refs: c9Array(handle, 8),
      }),
      20,
    ),
    facts_used: c9Array(
      c9Shape(
        {
          capability: c9Id,
          status: c9Enum(
            'measured',
            'measured_incomplete',
            'not_measured',
            'unavailable',
          ),
          as_of: c9Instant,
          evidence_refs: handles,
          completeness: c9Completeness,
          basis: c9Id,
          currency: c9Nullable(c9String(3, 3, /^[A-Z]{3}$/)),
        },
        ['basis', 'currency'],
      ),
      100,
    ),
    confidence: c9Enum('high', 'medium', 'low'),
    limitations: c9Array((v) => c9SafeText(v, 400), 20),
    recommended_next_capability: c9Id,
    proposed_action_intents: c9Array(
      c9Shape({
        capability: c9Id,
        argumentHandles: handles,
        risk: c9Enum('low_write', 'medium_write', 'high_write', 'restricted'),
        approval: c9Enum('actor', 'owner', 'none'),
        reversibility: c9Enum('SOURCE_DEFINED'),
        rationale: (v) => c9SafeText(v, 800),
        audience_size: c9Nullable(c9Int(0, 1000000)),
      }),
      12,
    ),
    presentation_hint: (v) => c9SafeText(v, 400),
    completeness: c9Completeness,
    evidence_refs: handles,
  },
  ['recommended_next_capability', 'presentation_hint'],
);
export function c9AgentResult(
  value: unknown,
  permittedEvidence: ReadonlySet<string>,
  permittedCapabilities: ReadonlySet<string>,
): C9Object {
  c9Bytes(value, 32768);
  const r = resultSchema(value) as C9Object;
  const checkRefs = (refs: unknown) => {
    for (const id of refs as string[])
      if (!permittedEvidence.has(id)) c9Deny('unqualified_result_evidence');
  };
  checkRefs(r.evidence_refs);
  for (const f of r.findings as C9Object[]) {
    checkRefs(f.evidence_refs);
    if (!(f.evidence_refs as string[]).length) c9Deny('ungrounded_finding');
  }
  let incomplete = false;
  for (const f of r.facts_used as C9Object[]) {
    if (!permittedCapabilities.has(f.capability as string))
      c9Deny('result_capability');
    checkRefs(f.evidence_refs);
    if (
      f.status !== 'measured' ||
      c9Object(f.completeness).status !== 'COMPLETE'
    )
      incomplete = true;
    if (f.status === 'measured' && !(f.evidence_refs as string[]).length)
      c9Deny('measured_without_evidence');
  }
  for (const a of r.proposed_action_intents as C9Object[]) {
    if (!permittedCapabilities.has(a.capability as string))
      c9Deny('result_action');
    checkRefs(a.argumentHandles);
  }
  if (
    r.agent_id === 'BUSINESS_INTELLIGENCE' &&
    (r.proposed_action_intents as unknown[]).length
  )
    c9Deny('bi_read_only');
  if (
    r.recommended_next_capability &&
    !permittedCapabilities.has(r.recommended_next_capability as string)
  )
    c9Deny('result_recommendation');
  const c = c9Object(r.completeness);
  if (
    (c.hasMore || c.truncated || c.totalCount === null || incomplete) &&
    c.status === 'COMPLETE'
  )
    c9Deny('false_completeness');
  if (
    c.totalCount !== null &&
    (c.returnedCount as number) > (c.totalCount as number)
  )
    c9Deny('completeness_count');
  if (
    (incomplete || c.status !== 'COMPLETE') &&
    (r.confidence !== 'low' || !(r.limitations as unknown[]).length)
  )
    c9Deny('missingness_required');
  return r;
}
