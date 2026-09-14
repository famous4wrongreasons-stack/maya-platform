import {
  C9Object,
  c9Array,
  c9Boolean,
  c9Deny,
  c9Enum,
  c9Bytes,
  c9Hash,
  c9Id,
  c9Int,
  c9Money,
  c9Nullable,
  c9Object,
  c9SafeText,
  c9Shape,
  c9String,
  C9_ROUTES,
} from './c9.contract';

export const C9_POLICY_NAMESPACE = 'c9_orchestration' as const;
export const C9_TENANT_CONTEXT_CONTRACT = 'maya.c9-tenant-context/1' as const;
export const C9_VERTICALS = [
  'barbershop',
  'beauty',
  'dental',
  'auto_service',
  'service_business',
] as const;
export const C9_REPORT_TYPES = [
  'daily_report',
  'morning_owner',
  'morning_staff',
] as const;

/**
 * A confirmed reference is not access. The owner may record where something lives; only an
 * existing connector adapter can ever read it, and qualification is derived live rather
 * than written here. Credentials never reach this payload — they belong on the existing
 * integration screens, and a URL that carries one is refused outright.
 */
export const c9SafeUrl = (value: unknown): string => {
  const raw = c9String(2000)(value) as string;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return c9Deny('source_url');
  }
  if (!['http:', 'https:'].includes(url.protocol)) c9Deny('source_url_scheme');
  if (url.username || url.password || url.hash) c9Deny('use_secure_surface');
  for (const [key, v] of url.searchParams)
    if (
      /(?:token|secret|password|key|signature|auth|session)/i.test(key) ||
      /^(?:sk|pk|ghp|xox)[-_]/i.test(v)
    )
      c9Deny('use_secure_surface');
  c9SafeText(raw);
  return url.toString();
};

const profile = c9Shape({
  vertical: c9Enum(...C9_VERTICALS),
  staffing: c9Enum('solo', 'team', 'multi_branch'),
  branchRefs: c9Array(c9Id, 100),
  timezoneSourceRef: c9Id,
  serviceCatalogSourceRef: c9Id,
});
const strategyConstraints = c9Shape({
  discounts: c9Enum('forbidden', 'existing_owner_only'),
  allowedObjectiveKeys: c9Array((v) => {
    const key = c9Id(v) as string;
    // An objective that the released router does not know is not a policy the owner can set.
    if (!Object.hasOwn(C9_ROUTES, key)) c9Deny('unregistered_objective');
    return key;
  }, 12),
  valuationPolicyRef: c9Nullable(c9Id),
  businessRuleRefs: c9Array(c9Id, 40),
});
const sourceReference = c9Shape({
  key: c9Id,
  kind: c9Enum('reference_only', 'existing_connector_ref'),
  url: c9Nullable(c9SafeUrl),
  connectorRef: c9Nullable(c9Id),
  purpose: c9Enum('business_context', 'existing_report_source'),
});
const reportPreference = c9Shape({
  reportType: c9Enum(...C9_REPORT_TYPES),
  enabled: c9Boolean,
  localHour: c9Int(0, 23),
  timezoneSourceRef: c9Id,
  scope: c9Enum('existing_eligible_owner', 'existing_eligible_staff'),
});
const resourceLimits = c9Shape({
  domainsMax: c9Int(1, 2),
  toolCallsPerDomainMax: c9Int(1, 6),
  toolCallsMax: c9Int(1, 12),
  modelCallsMax: c9Int(1, 12),
  inputTokensMax: c9Int(1, 96000),
  outputTokensMax: c9Int(1, 48000),
  reasoningMsMax: c9Int(1, 120000),
  aiCost: c9Nullable(
    c9Shape({
      currency: c9String(3, 3, /^[A-Z]{3}$/),
      capMicros: c9Money,
      // A reference to release-verified price evidence, never an owner-authored tariff.
      priceManifestRef: c9String(64, 64, /^[a-f0-9]{64}$/),
    }),
  ),
});
const tenantContext = c9Shape({
  contract: c9Enum(C9_TENANT_CONTEXT_CONTRACT),
  profile,
  strategyConstraints,
  sourceReferences: c9Array(sourceReference, 20),
  reportPreferences: c9Array(reportPreference, 3),
  resourceLimits: c9Nullable(resourceLimits),
  exposurePolicyRefs: c9Shape({
    marketingPolicyRef: c9Nullable(c9Id),
    offerPolicyRefs: c9Array(c9Id, 12),
  }),
});

/** Closed confirmed configuration. Extra keys and free-form policy prose are refused. */
export function c9TenantContext(value: unknown): C9Object {
  const payload = tenantContext(value) as C9Object;
  const references = payload.sourceReferences as C9Object[];
  if (new Set(references.map((r) => r.key)).size !== references.length)
    c9Deny('duplicate_source_reference');
  for (const reference of references) {
    // A connector reference names an existing integration; a plain reference names none.
    if (reference.kind === 'existing_connector_ref' && !reference.connectorRef)
      c9Deny('connector_reference_required');
    if (reference.kind === 'reference_only' && reference.connectorRef)
      c9Deny('reference_is_not_access');
    if (!reference.url && !reference.connectorRef)
      c9Deny('empty_source_reference');
  }
  const preferences = payload.reportPreferences as C9Object[];
  if (new Set(preferences.map((p) => p.reportType)).size !== preferences.length)
    c9Deny('duplicate_report_preference');
  const profileValue = c9Object(payload.profile);
  if (
    profileValue.staffing === 'solo' &&
    (profileValue.branchRefs as string[]).length > 1
  )
    c9Deny('solo_profile_branches');
  if (
    profileValue.staffing !== 'multi_branch' &&
    (profileValue.branchRefs as string[]).length > 1
  )
    c9Deny('single_branch_profile');
  c9Bytes(payload, 32768);
  return payload;
}

/** Effective coordination ceiling: the owner may tighten a released bound, never raise it. */
export function c9EffectiveLimits(
  released: C9Object,
  confirmed: unknown,
): C9Object {
  if (confirmed === null || confirmed === undefined) return released;
  const limits = resourceLimits(confirmed) as C9Object;
  const out: C9Object = { ...released };
  for (const key of [
    'domainsMax',
    'toolCallsPerDomainMax',
    'toolCallsMax',
    'modelCallsMax',
    'inputTokensMax',
    'outputTokensMax',
    'reasoningMsMax',
  ] as const)
    out[key] = Math.min(released[key] as number, limits[key] as number);
  const releasedCost = released.aiCost as C9Object | null,
    tenantCost = limits.aiCost as C9Object | null;
  // A tenant cannot fund paid work the release has not priced, and cannot raise its cap.
  out.aiCost = !releasedCost
    ? null
    : !tenantCost
      ? null
      : tenantCost.currency !== releasedCost.currency ||
          tenantCost.priceManifestRef !== releasedCost.priceManifestHash
        ? null
        : {
            ...releasedCost,
            capMicros:
              BigInt(tenantCost.capMicros as string) <
              BigInt(releasedCost.capMicros as string)
                ? tenantCost.capMicros
                : releasedCost.capMicros,
          };
  return out;
}

export type C9PolicyDraft = {
  contract: 'maya.c9-policy-draft/1';
  namespace: typeof C9_POLICY_NAMESPACE;
  expectedRevision: number;
  previousRevisionId: string | null;
  content: C9Object;
  contentHash: string;
  /** Exactly what an owner confirmation would change, field by field. */
  changed: readonly string[];
  /** Requested configuration this contract does not support, named rather than discarded. */
  unsupported: readonly string[];
};

/**
 * Turn an extracted conversational proposal into a typed draft plus a material diff.
 * Nothing here writes: the owner confirms on the existing A22 ingress, which remains the
 * single system of record for confirmed configuration. An unsupported request is reported
 * by name, never stuffed into an untyped fallback, and chat alone confirms nothing.
 */
export function c9PolicyDraft(
  current: { revision: number; id: string | null; content: unknown } | null,
  proposal: unknown,
): C9PolicyDraft {
  const base = current?.content ? c9TenantContext(current.content) : null;
  const requested = c9Object(proposal);
  const supported = [
    'contract',
    'profile',
    'strategyConstraints',
    'sourceReferences',
    'reportPreferences',
    'resourceLimits',
    'exposurePolicyRefs',
  ];
  const unsupported = Object.keys(requested)
    .filter((key) => !supported.includes(key))
    .sort();
  const merged: C9Object = {
    contract: C9_TENANT_CONTEXT_CONTRACT,
    ...(base ?? {}),
  };
  for (const key of supported)
    if (key !== 'contract' && Object.hasOwn(requested, key))
      merged[key] = requested[key];
  const content = c9TenantContext(merged);
  const changed = supported
    .filter(
      (key) =>
        key !== 'contract' &&
        c9Hash('policy-field/1', [key, base?.[key] ?? null]) !==
          c9Hash('policy-field/1', [key, content[key] ?? null]),
    )
    .sort();
  return {
    contract: 'maya.c9-policy-draft/1',
    namespace: C9_POLICY_NAMESPACE,
    expectedRevision: current?.revision ?? 0,
    previousRevisionId: current?.id ?? null,
    content,
    contentHash: c9Hash('tenant-context/1', [content]),
    changed,
    unsupported,
  };
}
