import { MAYA_AI_TOOL_CATALOG } from '../ai-tools/ai-tool.catalog';
import { C9Domain, C9Principal, c9Deny, c9Hash } from './c9.contract';
const domains: Record<string, readonly C9Domain[]> = {
  'catalog.services.read': ['OCCUPANCY', 'ADMIN'],
  'booking.availability.read': ['OCCUPANCY'],
  'booking.group-availability.read': ['OCCUPANCY'],
  'appointments.own.list': ['ADMIN'],
  'loyalty.own.read': ['CLIENT_LIFECYCLE'],
  'analytics.employee.query': ['BUSINESS_INTELLIGENCE'],
  'analytics.business.query': ['BUSINESS_INTELLIGENCE'],
  'analytics.business.profit': ['BUSINESS_INTELLIGENCE'],
  'analytics.revenue.forecast': ['BUSINESS_INTELLIGENCE'],
  'analytics.team-kpi.read': ['BUSINESS_INTELLIGENCE'],
  'analytics.branches.compare': ['BUSINESS_INTELLIGENCE'],
  'reports.recovered': ['BUSINESS_INTELLIGENCE'],
  'catalog.staff.read': ['OCCUPANCY', 'ADMIN'],
  'inventory.stock.read': ['BUSINESS_INTELLIGENCE'],
  'commerce.certificates.read': ['ADMIN'],
  'commerce.memberships.read': ['ADMIN'],
  'referrals.status.read': ['ADMIN'],
  'reviews.list.read': ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
  'reviews.analyze': ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
  'customers.count': ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
  'clients.dormant.list': ['CLIENT_LIFECYCLE'],
  'valuations.read': ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
  'clients.retention.scan': ['CLIENT_LIFECYCLE'],
  'clients.dossier.read': ['CLIENT_LIFECYCLE'],
  'clients.high-value.read': ['CLIENT_LIFECYCLE'],
  'clients.no-show-risk.read': ['CLIENT_LIFECYCLE', 'OCCUPANCY'],
  'expenses.read': ['BUSINESS_INTELLIGENCE'],
  'appointments.own.cancel': ['ADMIN'],
  'appointments.own.create': ['ADMIN'],
  'appointments.own.reschedule': ['ADMIN'],
  'staff.schedule.read': ['OCCUPANCY'],
  'staff.schedule.own.read': ['OCCUPANCY'],
  'operations.journal.read': ['OCCUPANCY'],
  'staff.schedule.update': ['OCCUPANCY'],
  'loyalty.internal.adjust': ['ADMIN'],
  'expenses.create': ['ADMIN'],
  'expenses.period.complete': ['ADMIN'],
  'company.business-hours.read': ['OCCUPANCY'],
  'settings.read': ['ADMIN'],
  'settings.update': ['ADMIN'],
  'tasks.list': ['ADMIN'],
  'tasks.create': ['ADMIN'],
  'tasks.complete': ['ADMIN'],
  'notifications.appointments.read': ['ADMIN'],
  'notifications.appointments.update': ['ADMIN'],
  'support.integration-status.read': ['ADMIN'],
  'support.contact-admin.request': ['ADMIN'],
};
export type C9Capability = {
  capabilityKey: string;
  contractVersion: 1;
  domains: readonly C9Domain[];
  mode: 'READ' | 'PROPOSE_ONLY' | 'OWNER_HANDOFF';
  toolOrInterface: string;
  ownerKey: string;
  inputContract: string;
  outputContract: string;
  principalKinds: readonly C9Principal['kind'][];
  scopeResolver: string;
  featureRefs: readonly string[];
  providerAvailabilityResolver: string;
  sourcePolicyResolver: string;
  approvalAdapter: string;
  idempotencyAdapter: string;
  resourceClass: 'LOCAL' | 'SOURCE_READ' | 'SOURCE_HANDOFF';
  timeoutMs: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  evidencePolicy: string;
  taskBundleRef: string;
};
function entry(
  key: string,
  agentDomains: readonly C9Domain[],
  owner: string,
  mode: C9Capability['mode'],
  features: readonly string[] = [],
  timeoutMs = 15000,
): C9Capability {
  return {
    capabilityKey: key,
    contractVersion: 1,
    domains: agentDomains,
    mode,
    toolOrInterface: key,
    ownerKey: owner,
    inputContract: `${key}:input/1`,
    outputContract: `${key}:output/1`,
    principalKinds: ['USER'],
    scopeResolver: 'current_source_scope',
    featureRefs: features,
    providerAvailabilityResolver: 'current_source_readiness',
    sourcePolicyResolver: 'current_source_policy',
    approvalAdapter: mode === 'READ' ? 'NONE' : 'exact_source_confirmation',
    idempotencyAdapter:
      mode === 'READ' ? 'c9_work_receipt' : 'existing_source_receipt',
    resourceClass: mode === 'READ' ? 'SOURCE_READ' : 'SOURCE_HANDOFF',
    timeoutMs,
    maxInputBytes: 16384,
    maxOutputBytes: 32768,
    evidencePolicy: 'qualified_current_reference',
    taskBundleRef: 'c9.skills/1',
  };
}
const catalog: C9Capability[] = MAYA_AI_TOOL_CATALOG.map((tool) => {
  if (!domains[tool.name]) c9Deny('unmapped_catalog_tool');
  return entry(
    tool.name,
    domains[tool.name],
    `existing.ai-tool:${tool.name}`,
    tool.riskTier === 'read' ? 'READ' : 'PROPOSE_ONLY',
    tool.requiredFeatures,
    tool.timeoutMs,
  );
});
const extra: C9Capability[] = [
  entry(
    'c7.measurement.read',
    ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
    'MeasurementReadService',
    'READ',
  ),
  entry(
    'c8.result.read',
    ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE', 'OCCUPANCY'],
    'C8ReadService',
    'READ',
  ),
  entry(
    'b35.preview',
    ['CLIENT_LIFECYCLE'],
    'CanonicalBulkService',
    'PROPOSE_ONLY',
  ),
  entry('b35.status', ['CLIENT_LIFECYCLE'], 'CanonicalBulkService', 'READ'),
  entry(
    'b35.confirm',
    ['CLIENT_LIFECYCLE'],
    'CanonicalBulkService',
    'OWNER_HANDOFF',
  ),
  entry(
    'a22.configuration',
    ['ADMIN'],
    'tenant_business_configuration',
    'OWNER_HANDOFF',
  ),
  entry(
    'owner_report.status',
    ['ADMIN', 'BUSINESS_INTELLIGENCE'],
    'OwnerReportRun',
    'READ',
  ),
  entry(
    'owner_report.download',
    ['ADMIN', 'BUSINESS_INTELLIGENCE'],
    'OwnerReportRun',
    'READ',
  ),
  {
    ...entry(
      'c9.no_action',
      ['ADMIN', 'CLIENT_LIFECYCLE', 'OCCUPANCY', 'BUSINESS_INTELLIGENCE'],
      'C9Run',
      'READ',
    ),
    resourceClass: 'LOCAL',
    principalKinds: ['USER', 'CLIENT_CHANNEL'],
  },
];
export const C9_CAPABILITIES: readonly C9Capability[] = Object.freeze(
  [...catalog, ...extra].map((x) => Object.freeze(x)),
);
export const C9_REGISTRY_HASH = c9Hash('registry/1', C9_CAPABILITIES);
export function c9Capability(
  key: string,
  domain: C9Domain,
  registryHash = C9_REGISTRY_HASH,
): C9Capability {
  if (registryHash !== C9_REGISTRY_HASH) c9Deny('registry_version_unavailable');
  const def = C9_CAPABILITIES.find((x) => x.capabilityKey === key);
  if (
    !def ||
    !def.domains.includes(domain) ||
    (domain === 'BUSINESS_INTELLIGENCE' && def.mode !== 'READ')
  )
    c9Deny('capability_not_registered');
  return def;
}
/** Each predicate is evaluated by the trusted source adapter, never model-authored flags.
 * Unknown is a denial. The registry by itself supplies no permission. */
export async function c9Available(
  def: C9Capability,
  principal: C9Principal,
  source: {
    authority(): Promise<boolean | null>;
    entitlement(): Promise<boolean | null>;
    policy(): Promise<boolean | null>;
    provider(): Promise<boolean | null>;
    budget(): Promise<boolean | null>;
  },
): Promise<boolean> {
  if (!def.principalKinds.includes(principal.kind)) return false;
  for (const key of [
    'authority',
    'entitlement',
    'policy',
    'provider',
    'budget',
  ] as const)
    if ((await source[key]()) !== true) return false;
  return true;
}
