/** Pure finite fixture contracts. No application, database, transport or model. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UserRole } from '../../../src/common/domain.enums';
import {
  coreFullOfflineExternalFacts,
  coreFullOfflineRecipe,
} from './core-full-offline-fixtures';
import type { CandidateSource, CorpusCase } from './current-candidate-sources';

const dataset = (file: string) =>
  JSON.parse(
    readFileSync(
      path.resolve(
        __dirname,
        '../../../datasets/conversation-intelligence',
        file,
      ),
      'utf8',
    ),
  ) as { cases: CorpusCase[] };
const rows = dataset('core-offline-48-20261009.json').cases;
function source(caseId = 'followup-owner-compound'): CandidateSource {
  return {
    item: coreFullOfflineRecipe(caseId).binding,
    tenant: { id: 'tenant-own', slug: 'widgets-live-pure-test' },
    user: {
      id: 'actor-own',
      email: 'synthetic@example.invalid',
      password: 'not-used',
      role: UserRole.TENANT_OWNER,
    },
    token: 'not-used',
    company: '88100',
    branchId: 'branch-own',
    features: [],
    sourceRefs: [],
    privateValues: [],
    reads: [],
    occupied: false,
    startsAt: '2026-10-10T17:00:00+03:00',
    endsAt: '2026-10-10T17:30:00+03:00',
    clockBinding: { tomorrow: '2026-10-10', businessTimezone: 'Europe/Moscow' },
  };
}
const query = {
  tenantId: 'tenant-own',
  timezone: 'Europe/Moscow',
  date: '2026-10-10',
  staffId: '71',
  serviceIds: ['81'],
  branchId: 'branch-own',
};

describe('full offline finite fixture contracts (synthetic, no I/O)', () => {
  it('maps all 48 cases and 81 exact user turns without substituting role for setup', () => {
    expect(rows).toHaveLength(48);
    expect(rows.reduce((n, row) => n + row.userTurns.length, 0)).toBe(81);
    for (const row of rows) {
      const recipe = coreFullOfflineRecipe(row.id);
      expect(recipe.binding.id).toBe(row.id);
      expect(recipe.binding.role).toBe(row.role);
      expect(recipe.binding.userTurns).toEqual(row.userTurns);
      expect(recipe.runtimeRole).toBe(
        row.role === 'owner'
          ? UserRole.TENANT_OWNER
          : row.role === 'admin'
            ? UserRole.ADMINISTRATOR
            : UserRole.CLIENT,
      );
      expect(recipe.expectedBoundary.businessEffectsAllowed).toBe(false);
    }
    expect(() => coreFullOfflineRecipe('unknown')).toThrow(
      'core_full_offline_case_unknown',
    );
  });
  it('retains all 15 current authored rows, including negative variants and clock metadata', () => {
    const current = dataset(
      'current-candidate-development-20261007.json',
    ).cases;
    const selected = rows.filter((row) => row.id.startsWith('current-'));
    expect(selected).toHaveLength(15);
    for (const row of selected)
      expect(coreFullOfflineRecipe(row.id).binding).toEqual(
        current.find((old) => old.id === row.id),
      );
    expect(
      coreFullOfflineRecipe('current-lifecycle-negative').expectedBoundary
        .httpStatuses,
    ).toEqual([401]);
    expect(
      coreFullOfflineRecipe('current-personal-negative').binding.group,
    ).toBe('personal');
    expect(coreFullOfflineRecipe('current-bi-negative').binding.variant).toBe(
      'negative',
    );
  });
  it('returns independent recipe copies and only the two exact feature extensions', () => {
    const first = coreFullOfflineRecipe('mt-booking_carry_over-12');
    first.binding.userTurns[0] = 'changed';
    expect(
      coreFullOfflineRecipe('mt-booking_carry_over-12').binding.userTurns,
    ).not.toEqual(first.binding.userTurns);
    expect(
      coreFullOfflineRecipe('utt-reviews.list_recent-062').requiredFeatures,
    ).toEqual(['reviews.core']);
    expect(
      coreFullOfflineRecipe('utt-inventory.stock-074').requiredFeatures,
    ).toEqual(['commerce.store']);
    expect(
      coreFullOfflineRecipe('current-lifecycle-negative').requiredFeatures,
    ).toEqual([]);
  });
  it('preserves exact named catalog setups without expanding internal availability', () => {
    expect(
      coreFullOfflineRecipe('mt-booking_carry_over-18').setup.internalCatalog,
    ).toEqual({
      primaryStaff: 'Никита',
      secondaryStaff: 'Ольга',
      service: 'детская стрижка',
    });
    expect(
      coreFullOfflineRecipe('mt-topic_switch_and_return-17').setup,
    ).toEqual({ branchName: 'северный филиал', externalPrimaryStaff: 'Елена' });
    expect(() =>
      coreFullOfflineExternalFacts(source('current-personal-ordinary')),
    ).toThrow('core_full_offline_internal_owner_required');
  });
  it('returns only the exact current external tuple and reacts to actual occupied state', () => {
    const current = source();
    const facts = coreFullOfflineExternalFacts(current);
    expect(facts.getAvailableSlots(query)).toEqual([
      {
        start: current.startsAt,
        end: current.endsAt,
        staff_id: '71',
        branch_id: current.branchId,
      },
    ]);
    expect(
      facts.getAvailableSlots({ ...query, date: current.startsAt }),
    ).toHaveLength(1);
    current.occupied = true;
    expect(facts.getAvailableSlots(query)).toEqual([]);
  });
  it.each([
    { tenantId: 'foreign' },
    { timezone: 'UTC' },
    { staffId: 'unknown' },
    { staffId: undefined },
    { serviceIds: ['unknown'] },
    { serviceIds: ['81', '82'] },
    { serviceIds: undefined },
    { branchId: 'foreign' },
    { date: '2026-10-11' },
    { date: '2026-10-10T19:00:00+03:00' },
    { date: '' },
  ])('refuses availability outside declared source bounds: %j', (delta) => {
    expect(() =>
      coreFullOfflineExternalFacts(source()).getAvailableSlots({
        ...query,
        ...delta,
      }),
    ).toThrow();
  });
  it('refuses changed source clock and unknown schedule, with no caller tuple echo', () => {
    const current = source();
    const facts = coreFullOfflineExternalFacts(current);
    expect(
      facts.getStaffScheduleDay({
        tenantId: current.tenant.id,
        staffId: '71',
        date: '2026-10-10',
      }),
    ).toMatchObject({
      staff_id: '71',
      date: '2026-10-10',
      slots: [{ from: '10:00', to: '20:00' }],
    });
    expect(() =>
      facts.getStaffScheduleDay({
        tenantId: current.tenant.id,
        staffId: '72',
        date: '2026-10-10',
      }),
    ).toThrow();
    expect(() =>
      facts.getStaffScheduleDay({
        tenantId: 'foreign',
        staffId: '71',
        date: '2026-10-10',
      }),
    ).toThrow();
    expect(() =>
      facts.getStaffScheduleDay({
        tenantId: current.tenant.id,
        staffId: '71',
        date: '2026-10-11',
      }),
    ).toThrow();
    current.clockBinding.businessTimezone = 'UTC';
    expect(() => facts.getAvailableSlots(query)).toThrow(
      'core_full_offline_timezone_changed',
    );
  });
  it('preserves ambiguous identities and catalog ownership without inventing staff branch mapping', () => {
    const current = source('mt-ambiguous_entity_resolution-15');
    const facts = coreFullOfflineExternalFacts(current);
    expect(facts.getStaff(current.tenant.id)).toEqual([
      { id: '71', name: 'Саша' },
      { id: '72', name: 'Саша' },
    ]);
    const services = facts.getServices(current.tenant.id);
    services[0].name = 'changed';
    expect(facts.getServices(current.tenant.id)[0].name).toBe(
      'Мужская стрижка',
    );
    expect(() => facts.getServices('foreign')).toThrow();
    expect(() => facts.getServices(current.tenant.id, 'unknown')).toThrow();
    expect(() =>
      facts.getAvailableSlots({ ...query, staffId: '72' }),
    ).toThrow();
  });
  it('limits exact goods and fixed-price source reads without authorizing writes', () => {
    const current = source('current-goods-correction');
    const facts = coreFullOfflineExternalFacts(current);
    expect(facts.readGoodsItem(current.tenant.id, '123')).toBeDefined();
    expect(() => facts.readGoodsItem(current.tenant.id, '124')).toThrow();
    expect(() => facts.readGoodsItem('foreign', '123')).toThrow();
    expect(() => facts.getServicePriceSnapshot('81')).toThrow();
    const price = coreFullOfflineExternalFacts(
      source('current-staff_config-correction'),
    );
    expect(price.getServicePriceSnapshot('81')).toBeDefined();
    expect(() => price.getServicePriceSnapshot('82')).toThrow();
    expect(
      Object.keys(price).some((name) =>
        /update|create|delete|write/i.test(name),
      ),
    ).toBe(false);
    expect(
      coreFullOfflineRecipe('current-staff_config-correction').expectedBoundary
        .kind,
    ).toBe('CLARIFICATION_OR_EXPLICIT_LIMITATION');
  });
});
