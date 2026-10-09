/** Fixed authored development cases, never a general synthetic CRM fallback.
 * These recipes do not grant authority, publish C7/C8 or execute business work.
 * bindCandidateSource remains the sole existing source/setup owner. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UserRole } from '../../../src/common/domain.enums';
import type { CRMAdapter } from '../../../src/crm/crm-adapter.interface';
import type { Practitioner, ServiceOffering, WorkDay } from '../../../src/domain';
import type { FixtureContext } from './bootstrap';
import type { CandidateSource, CorpusCase } from './current-candidate-sources';
import { assertProofDatabase } from './proof-db-guard';

type SelectedCase = {
  id: string;
  role: 'client' | 'owner' | 'admin';
  group: string;
  userTurns: string[];
  sourceRowSha256: string;
};
type OriginalCase = CorpusCase & { runtimeRole?: string; audience?: string };
export type FullOfflineSetup = {
  branchName?: string;
  internalCatalog?: {
    primaryStaff: string;
    secondaryStaff: string;
    service: string;
  };
  externalPrimaryStaff?: string;
  ambiguousStaff?: true;
};
export type FullOfflineBoundary = {
  kind:
    | 'CURRENT_SOURCE_READ_OR_PREVIEW'
    | 'CURRENT_AUTHORIZATION_REFUSAL'
    | 'CLARIFICATION_OR_EXPLICIT_LIMITATION'
    | 'SOURCE_UNAVAILABLE_NO_ESTIMATE'
    | 'PRIVACY_REFUSAL'
    | 'GENERAL_NO_SOURCE_REQUIRED';
  httpStatuses: readonly number[];
  qualification: string;
  businessEffectsAllowed: false;
};
export type FullOfflineRecipe = {
  binding: CorpusCase;
  runtimeRole: UserRole;
  audience: 'client' | 'owner';
  setup: FullOfflineSetup;
  expectedBoundary: FullOfflineBoundary;
};

function readCases<T>(name: string, sha: string): T[] {
  const bytes = readFileSync(path.resolve(__dirname, '../../../datasets/conversation-intelligence', name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, 'core_full_offline_dataset_changed');
  return (JSON.parse(bytes.toString('utf8')) as { cases: T[] }).cases;
}
const selected = readCases<SelectedCase>('core-offline-48-20261009.json', '9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b');
const union = readCases<OriginalCase>('core-union-20261009.json', '2832b5837a1b01a4d0fe6e58f8c8811f318a7402ab2e7052ebb8a8a6f7b9c4ca');
const current = readCases<OriginalCase>('current-candidate-development-20261007.json', '6913f69c29a33cf42c1a9c03ea5dfde6bd7dd2f7ee1e1142977f55fbfc6ea996');
assert.equal(selected.length, 48, 'core_full_offline_case_count');
assert.equal(new Set(selected.map((row) => row.id)).size, 48, 'core_full_offline_duplicate_case');

const newGroups: Readonly<Record<string, string>> = Object.freeze({
  'mt-booking_carry_over-12': 'booking',
  'mt-booking_carry_over-18': 'booking',
  'mt-finance_follow_up-7': 'bi',
  'mt-finance_follow_up-10': 'bi',
  'mt-retention_drill_down-0': 'lifecycle',
  'mt-retention_drill_down-15': 'lifecycle',
  'mt-ambiguous_entity_resolution-15': 'admin',
  'mt-high_risk_confirmation-10-booking-v1': 'booking',
  'mt-cancel_pending_action-15': 'personal',
  'mt-topic_switch_and_return-17': 'occupancy',
  'utt-services.price-062': 'staff_config',
  'utt-services.price-067': 'admin',
  'utt-company.public_info-037': 'booking',
  'utt-company.public_info-041': 'booking',
  'utt-support.integration_status-002': 'admin',
  'utt-support.integration_status-007': 'staff_config',
  'utt-finance.profit-050': 'admin',
  'utt-finance.profit-055': 'bi',
  'utt-inventory.stock-074': 'admin',
  'utt-inventory.stock-079': 'goods',
  'utt-general.explain_term-002': 'staff_config',
  'utt-general.explain_term-007': 'admin',
  'utt-reviews.list_recent-062': 'admin',
  'utt-reviews.list_recent-067': 'staff_config',
});
assert.equal(Object.keys(newGroups).length, 24);

function setupFor(id: string): FullOfflineSetup {
  switch (id) {
    case 'followup-client-carry-over':
      return { internalCatalog: { primaryStaff: 'Елена', secondaryStaff: 'Никита', service: 'комплекс стрижка и борода' } };
    case 'mt-booking_carry_over-12':
      return { internalCatalog: { primaryStaff: 'Илья', secondaryStaff: 'Александр', service: 'комплекс стрижка и борода' } };
    case 'mt-booking_carry_over-18':
      return { internalCatalog: { primaryStaff: 'Никита', secondaryStaff: 'Ольга', service: 'детская стрижка' } };
    case 'followup-owner-topic-switch':
    case 'utt-company.public_info-037':
    case 'utt-company.public_info-041':
    case 'utt-inventory.stock-074':
    case 'utt-inventory.stock-079':
      return { branchName: 'основной филиал' };
    case 'mt-topic_switch_and_return-17':
      return { branchName: 'северный филиал', externalPrimaryStaff: 'Елена' };
    case 'mt-ambiguous_entity_resolution-15':
      return { branchName: 'основной филиал', externalPrimaryStaff: 'Саша', ambiguousStaff: true };
    case 'utt-services.price-062':
    case 'utt-services.price-067':
      return { externalPrimaryStaff: 'Марина' };
    default:
      return {};
  }
}
function boundaryFor(id: string): FullOfflineBoundary {
  const base = { businessEffectsAllowed: false as const, httpStatuses: [201] };
  if (id === 'current-lifecycle-negative')
    return { ...base, kind: 'CURRENT_AUTHORIZATION_REFUSAL', httpStatuses: [401], qualification: 'Existing lifecycle negative publishes C8 then suspends current membership. No model/read or restored authority is expected; this is an auth control, not a generated-language success.' };
  if (id === 'core-admin-private-data-refusal')
    return { ...base, kind: 'PRIVACY_REFUSAL', qualification: 'Never reveal a credential/private contact; a scope clarification states no integration fact and needs no source READ.' };
  if (id === 'current-booking-negative')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Preserve the negative recipe. Base bind does not seed literal foreign-staff in another tenant: without a separate actual foreign fixture this proves unknown-reference refusal only, not foreign-tenant isolation.' };
  if (id === 'current-staff_config-negative')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Existing membership branch and outside branch remain unchanged. Public-read denial for an owner is unproven; never claim it from the authored label.' };
  if (id === 'current-personal-negative')
    return { ...base, kind: 'CURRENT_SOURCE_READ_OR_PREVIEW', qualification: 'Own upcoming list is actually empty; another client has an appointment. Do not expose that appointment or turn empty into source unavailable.' };
  if (id === 'current-bi-negative')
    return { ...base, kind: 'SOURCE_UNAVAILABLE_NO_ESTIMATE', qualification: 'Existing negative omits C7 publication. Missing October data permits no revenue estimate.' };
  if (id === 'mt-finance_follow_up-7' || id === 'mt-finance_follow_up-10')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Existing C7 seed covers an explicitly published October 2026 snapshot. Year/week/current-vs-previous comparison and causal explanation are not established by this fixture; preserve requested periods rather than substituting October.' };
  if (id === 'mt-retention_drill_down-0' || id === 'mt-retention_drill_down-15')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Existing C8 rule is >30 days with attendance 40 days ago. It does not prove >2 months, regularity, priority, value, contact permission or an audience list.' };
  if (id === 'mt-ambiguous_entity_resolution-15')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Two current synthetic staff share Саша. Clarify before selection; the external Practitioner contract has no staff-to-branch field and this setup does not qualify branch disambiguation or a client journal response.' };
  if (id === 'mt-cancel_pending_action-15')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Existing personal owner/other-client appointments are preserved. No free-text reschedule COMMIT; 20:00 is outside seeded 17:00–20:00 half-hour start slots. Stop must not move/cancel/create.' };
  if (id === 'mt-topic_switch_and_return-17' || id === 'followup-owner-topic-switch')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Named branch and tomorrow staff schedule are finite source facts; no invented branch financial measurement or diagnosis. Tenant-wide historical C7 cannot be relabeled as current branch analytics.' };
  if (id === 'utt-finance.profit-050' || id === 'utt-finance.profit-055')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Net profit is not revenue. No complete expense/cost basis is seeded. ADMIN keeps its existing finance restrictions; no added analytics entitlement or role upgrade.' };
  if (id === 'utt-inventory.stock-074' || id === 'utt-inventory.stock-079')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'inventory.stock.read is registered with the existing BusinessContent owner and requires commerce.store. A selected goods item is not a branch-wide low-stock scan. This unwired recipe does not yet establish an actual inventory read or replenishment threshold; do not fake a stock list.' };
  if (id === 'utt-reviews.list_recent-062' || id === 'utt-reviews.list_recent-067')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'reviews.list.read is registered with the existing Measurement/BusinessContent owners and requires reviews.core. This unwired recipe has not enabled that feature or read its registry. Preserve last-month scope; distinguish capability refusal from a verified empty registry only after an actual owner read.' };
  if (id === 'utt-general.explain_term-002' || id === 'utt-general.explain_term-007' || id === 'followup-admin-general-chat')
    return { ...base, kind: 'GENERAL_NO_SOURCE_REQUIRED', qualification: 'General explanation/small talk requires no tenant READ and gives no measured tenant LTV or forecast.' };
  if (id === 'current-occupancy-negative')
    return { ...base, kind: 'CLARIFICATION_OR_EXPLICIT_LIMITATION', qualification: 'Existing negative marks the window occupied; no available slot, discount audience or outbound dispatch may be invented.' };
  if (id === 'current-occupancy-correction')
    return { ...base, kind: 'CURRENT_SOURCE_READ_OR_PREVIEW', qualification: 'Second turn requires an actual controlled source drift by the probe. Request wording alone is not evidence that the appointment changed.' };
  if (id === 'current-goods-correction')
    return { ...base, kind: 'CURRENT_SOURCE_READ_OR_PREVIEW', qualification: 'Reuse exact item 123 data from the existing goods owner fixture. Sale, purchase and per-write-off-unit costs are distinct; no stock-unit inference.' };
  return { ...base, kind: 'CURRENT_SOURCE_READ_OR_PREVIEW', qualification: 'Only actual current owner READ/preview or an honest source limitation counts. Text confirmation is never COMMIT; source periods, units and current authority remain explicit.' };
}

export function coreFullOfflineRecipe(caseId: string): FullOfflineRecipe {
  const row = selected.find((entry) => entry.id === caseId);
  if (!row) throw new Error('core_full_offline_case_unknown');
  let binding: CorpusCase;
  const oldUnion = union.find((entry) => entry.id === caseId);
  const oldCurrent = current.find((entry) => entry.id === caseId);
  if (oldUnion) {
    binding = {
      ...structuredClone(oldUnion),
      group: oldUnion.group === 'owner_review' ? 'occupancy' : oldUnion.group === 'authority' ? 'admin' : oldUnion.group,
      variant: caseId === 'followup-owner-topic-switch' ? 'finance_schedule_only' : 'ordinary',
      fixture: { clock: 'ACTUAL_EXECUTION_CLOCK_BOUND_ONCE' },
    };
  } else if (oldCurrent) {
    // Preserve every existing metadata member, especially negative variants and
    // authored clock; bindCandidateSource separately records its real clock.
    binding = structuredClone(oldCurrent);
  } else {
    const group = newGroups[caseId];
    if (!group) throw new Error('core_full_offline_recipe_missing');
    binding = {
      id: row.id, role: row.role, group,
      variant: caseId === 'mt-topic_switch_and_return-17' ? 'finance_schedule_only' : 'ordinary',
      userTurns: [...row.userTurns],
      fixture: { clock: 'ACTUAL_EXECUTION_CLOCK_BOUND_ONCE' },
    };
  }
  assert.equal(binding.role, row.role, 'core_full_offline_role_changed');
  assert.deepEqual(binding.userTurns, row.userTurns, 'core_full_offline_turns_changed');
  return {
    binding,
    runtimeRole: { client: UserRole.CLIENT, owner: UserRole.TENANT_OWNER, admin: UserRole.ADMINISTRATOR }[row.role],
    audience: row.role === 'client' ? 'client' : 'owner',
    setup: setupFor(caseId),
    expectedBoundary: boundaryFor(caseId),
  };
}

type ConfiguredSource = {
  branchId: string;
  branchName: string;
  otherBranchId: string | null;
  primaryStaffId: string | null;
  secondaryStaffId: string | null;
  serviceIds: string[];
};
const configured = new WeakMap<CandidateSource, ConfiguredSource>();
export async function configureCoreFullOfflineAfterBind(
  db: FixtureContext,
  source: CandidateSource,
): Promise<ConfiguredSource> {
  assertProofDatabase();
  const recipe = coreFullOfflineRecipe(source.item.id);
  assert.ok(source.tenant.slug.startsWith('widgets-live-'), 'core_full_offline_owned_tenant_required');
  for (const key of ['role', 'group', 'variant'] as const)
    assert.equal(source.item[key], recipe.binding[key], 'core_full_offline_bound_recipe_changed');
  assert.deepEqual(source.item.userTurns, recipe.binding.userTurns, 'core_full_offline_bound_turns_changed');
  assert.ok(!configured.has(source), 'core_full_offline_configure_once');
  const tenantId = source.tenant.id;
  const branch = await db.prisma.branch.findFirstOrThrow({ where: { id: source.branchId, tenantId } });
  const branchName = recipe.setup.branchName ?? branch.name;
  if (branchName !== branch.name)
    await db.prisma.branch.update({ where: { id: branch.id, tenantId }, data: { name: branchName } });
  const result: ConfiguredSource = {
    branchId: branch.id, branchName, otherBranchId: null,
    primaryStaffId: null, secondaryStaffId: null, serviceIds: [],
  };
  if (['booking', 'personal'].includes(recipe.binding.group)) {
    const catalog = recipe.setup.internalCatalog ?? {
      primaryStaff: 'Артём', secondaryStaff: 'Максим', service: 'Мужская стрижка',
    };
    const primary = await db.prisma.internalProvider.findFirstOrThrow({ where: { tenantId, displayName: 'Артём', active: true } });
    const secondary = await db.prisma.internalProvider.findFirstOrThrow({ where: { tenantId, displayName: 'Максим', active: true } });
    const service = await db.prisma.internalService.findFirstOrThrow({ where: { tenantId, name: 'Мужская стрижка', active: true } });
    assert.notEqual(primary.id, secondary.id);
    assert.equal(await db.prisma.internalProviderService.count({ where: { tenantId, serviceId: service.id, providerId: { in: [primary.id, secondary.id] }, active: true } }), 2, 'core_full_offline_catalog_links_required');
    await db.prisma.internalService.update({ where: { id: service.id, tenantId }, data: { name: catalog.service } });
    for (const [id, displayName] of [[primary.id, catalog.primaryStaff], [secondary.id, catalog.secondaryStaff]])
      await db.prisma.internalProvider.update({ where: { id, tenantId }, data: { displayName, branchId: branch.id } });
    result.primaryStaffId = primary.id;
    result.secondaryStaffId = secondary.id;
    result.serviceIds = [service.id];
  }
  if (recipe.setup.ambiguousStaff) {
    const other = await db.prisma.branch.create({ data: { tenantId, name: 'другой филиал', timezone: 'Europe/Moscow' } });
    result.otherBranchId = other.id;
    source.privateValues.push(other.id);
    source.sourceRefs.push({ owner: 'OFFLINE_BRANCH_LABEL_ONLY', id: other.id, status: 'STAFF_TO_BRANCH_MAPPING_NOT_PROVEN_BY_PRACTITIONER_CONTRACT' });
  }
  configured.set(source, structuredClone(result));
  return structuredClone(result);
}

export function coreFullOfflineExternalFacts(source: CandidateSource) {
  const recipe = coreFullOfflineRecipe(source.item.id);
  if (['booking', 'personal', 'bi', 'lifecycle'].includes(recipe.binding.group))
    throw new Error('core_full_offline_internal_owner_required');
  const primaryName = recipe.setup.externalPrimaryStaff ?? 'Артём';
  const staff: Practitioner[] = [{ id: '71', name: primaryName }];
  if (recipe.setup.ambiguousStaff) staff.push({ id: '72', name: 'Саша' });
  const services: ServiceOffering[] = [{ id: '81', name: 'Мужская стрижка', price: 2000, duration_minutes: 30, currency: 'RUB' }];
  const tenant = (tenantId: string) => assert.equal(tenantId, source.tenant.id, 'core_full_offline_foreign_tenant_refused');
  const day = () => {
    const tomorrow = source.clockBinding.tomorrow;
    assert.ok(typeof tomorrow === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tomorrow), 'core_full_offline_clock_required');
    assert.equal(source.clockBinding.businessTimezone, 'Europe/Moscow', 'core_full_offline_timezone_changed');
    return tomorrow;
  };
  return {
    getServices(tenantId: string, staffId?: string) {
      tenant(tenantId);
      if (staffId !== undefined && !staff.some((entry) => entry.id === staffId))
        throw new Error('core_full_offline_service_staff_source_unavailable');
      return structuredClone(services);
    },
    getStaff(tenantId: string) {
      tenant(tenantId);
      return structuredClone(staff);
    },
    getAvailableSlots(params: Parameters<CRMAdapter['getAvailableSlots']>[0]) {
      tenant(params.tenantId);
      if (
        params.timezone !== 'Europe/Moscow' ||
        ![day(), source.startsAt].includes(params.date) ||
        params.staffId !== '71' ||
        JSON.stringify(params.serviceIds) !== JSON.stringify(['81']) ||
        (params.branchId !== undefined && params.branchId !== source.branchId)
      ) throw new Error('core_full_offline_availability_source_unavailable');
      assert.equal(source.startsAt, day() + 'T17:00:00+03:00', 'core_full_offline_slot_changed');
      assert.equal(source.endsAt, day() + 'T17:30:00+03:00', 'core_full_offline_slot_changed');
      return source.occupied ? [] : [{ start: source.startsAt, end: source.endsAt, staff_id: '71', branch_id: source.branchId }];
    },
    getStaffScheduleDay(params: { tenantId: string; staffId: string; date: string }): WorkDay {
      tenant(params.tenantId);
      if (params.staffId !== '71' || params.date !== day())
        throw new Error('core_full_offline_schedule_source_unavailable');
      return { staff_id: '71', date: day(), is_working: true, slots: [{ from: '10:00', to: '20:00' }], revision: 'synthetic-core-full-tomorrow-only' };
    },
  };
}
