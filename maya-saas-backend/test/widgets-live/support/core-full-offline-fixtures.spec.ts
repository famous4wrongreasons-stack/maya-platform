/** Pure finite fixture contracts. No application, database, transport or model. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UserRole } from '../../../src/common/domain.enums';
import {
  configureCoreFullOfflineAfterBind,
  coreFullOfflineExternalFacts,
  coreFullOfflineRecipe,
} from './core-full-offline-fixtures';
import type { FixtureContext } from './bootstrap';
import type { CandidateSource, CorpusCase } from './current-candidate-sources';
import { assertProofDatabase } from './proof-db-guard';

// Exercise setup against finite in-memory delegates. The actual proof DB guard
// has its own tests; no URL is read and no connection is opened by this suite.
jest.mock('./proof-db-guard', () => ({ assertProofDatabase: jest.fn() }));

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

function setupFixture(caseId: string) {
  const current = source(caseId);
  const branch = {
    id: current.branchId,
    tenantId: current.tenant.id,
    name: 'Synthetic authorized branch',
    timezone: 'Europe/Moscow',
  };
  const integration = {
    id: 'integration-own',
    tenantId: current.tenant.id,
    provider: 'yclients',
    status: 'active',
    settingsJson: {
      companyId: current.company,
      branchBinding: {
        contract: 'maya.crm-branch-binding/1',
        companyId: Number(current.company),
        branchId: current.branchId,
      },
    } as Record<string, unknown>,
  };
  const db = {
    encryption: {
      encrypt: jest.fn((name: string) => `synthetic-encrypted:${name}`),
    },
    prisma: {
      branch: {
        findFirstOrThrow: jest.fn().mockResolvedValue(branch),
        update: jest.fn().mockResolvedValue(branch),
        create: jest.fn().mockResolvedValue({ id: 'branch-other' }),
      },
      crmIntegration: { findUnique: jest.fn().mockResolvedValue(integration) },
      staff: { create: jest.fn().mockResolvedValue({ id: 'staff-new' }) },
      staffProviderLink: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'link-new' }),
      },
      internalProvider: {
        findFirstOrThrow: jest.fn(
          ({ where }: { where: { displayName: string } }) =>
            Promise.resolve({
              id:
                where.displayName === 'Артём' ? 'internal-one' : 'internal-two',
            }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      internalService: {
        findFirstOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'internal-service' }),
        update: jest.fn().mockResolvedValue({}),
      },
      internalProviderService: { count: jest.fn().mockResolvedValue(2) },
    },
  };
  return {
    current,
    branch,
    integration,
    db,
    run: () =>
      configureCoreFullOfflineAfterBind(
        db as unknown as FixtureContext,
        current,
      ),
  };
}

describe('two-case schedule source fixture enrichment (in-memory delegates only)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['followup-owner-topic-switch', 'Артём', 'основной филиал'],
    ['mt-topic_switch_and_return-17', 'Елена', 'северный филиал'],
  ])(
    'binds %s to its current roster without changing the input recipe',
    async (id, name, branchName) => {
      const f = setupFixture(id);
      const original = structuredClone(f.current.item);
      const result = await f.run();
      expect(assertProofDatabase).toHaveBeenCalledTimes(1);
      expect(f.db.prisma.crmIntegration.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-own' },
        select: {
          id: true,
          tenantId: true,
          provider: true,
          status: true,
          settingsJson: true,
        },
      });
      expect(f.db.prisma.staffProviderLink.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-own',
          provider: 'yclients',
          externalId: '71',
        },
        select: { id: true },
        take: 2,
      });
      expect(f.db.prisma.staff.create).toHaveBeenCalledTimes(1);
      expect(f.db.prisma.staff.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-own',
          branchId: 'branch-own',
          active: true,
          encryptedDisplayName: `synthetic-encrypted:${name}`,
        },
      });
      expect(f.db.prisma.staffProviderLink.create).toHaveBeenCalledTimes(1);
      expect(f.db.prisma.staffProviderLink.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-own',
          staffId: 'staff-new',
          provider: 'yclients',
          externalId: '71',
        },
      });
      expect(result).toEqual({
        branchId: 'branch-own',
        branchName,
        primaryStaffId: 'staff-new',
        secondaryStaffId: null,
        otherBranchId: null,
        serviceIds: [],
      });
      expect(f.current.sourceRefs).toEqual([
        {
          owner: 'OFFLINE_SCHEDULE_BRANCH_BINDING',
          id: 'integration-own',
          status: 'EXISTING_COMPANY_BRANCH_PAIR_VERIFIED',
        },
        {
          owner: 'OFFLINE_SCHEDULE_STAFF',
          id: 'staff-new',
          status: 'ADDED_ACTIVE_IN_BOUND_BRANCH_FROM_CURRENT_ROSTER',
        },
        {
          owner: 'OFFLINE_SCHEDULE_STAFF_PROVIDER_LINK',
          id: 'link-new',
          status: 'ADDED_UNIQUE_YCLIENTS_71',
        },
      ]);
      expect(f.current.privateValues).toEqual(['staff-new', 'link-new']);
      expect(f.current.item).toEqual(original);
      expect(f.db.encryption.encrypt).toHaveBeenCalledWith(name);
      await expect(f.run()).rejects.toThrow('core_full_offline_configure_once');
      expect(f.db.prisma.staff.create).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'missing-integration',
    'foreign-integration',
    'provider',
    'inactive',
    'missing-binding',
    'wrong-company',
    'wrong-branch',
    'foreign-branch',
    'branch-timezone',
    'existing-link',
    'duplicate-links',
  ])(
    'refuses %s without repairing metadata or creating a staff identity',
    async (kind) => {
      const f = setupFixture('followup-owner-topic-switch');
      if (kind === 'missing-integration')
        f.db.prisma.crmIntegration.findUnique.mockResolvedValue(null);
      if (kind === 'foreign-integration')
        f.integration.tenantId = 'tenant-foreign';
      if (kind === 'provider') f.integration.provider = 'altegio';
      if (kind === 'inactive') f.integration.status = 'disabled';
      if (kind === 'missing-binding')
        delete f.integration.settingsJson.branchBinding;
      if (kind === 'wrong-company')
        f.integration.settingsJson.companyId = '88101';
      if (kind === 'wrong-branch')
        f.integration.settingsJson.branchBinding = {
          contract: 'maya.crm-branch-binding/1',
          companyId: 88100,
          branchId: 'branch-foreign',
        };
      if (kind === 'foreign-branch') f.branch.tenantId = 'tenant-foreign';
      if (kind === 'branch-timezone') f.branch.timezone = 'UTC';
      if (kind === 'existing-link')
        f.db.prisma.staffProviderLink.findMany.mockResolvedValue([
          { id: 'existing' },
        ]);
      if (kind === 'duplicate-links')
        f.db.prisma.staffProviderLink.findMany.mockResolvedValue([
          { id: 'one' },
          { id: 'two' },
        ]);
      await expect(f.run()).rejects.toThrow();
      expect(f.db.prisma.branch.update).not.toHaveBeenCalled();
      expect(f.db.prisma.staff.create).not.toHaveBeenCalled();
      expect(f.db.prisma.staffProviderLink.create).not.toHaveBeenCalled();
      expect(f.current.sourceRefs).toEqual([]);
      expect(f.current.privateValues).toEqual([]);
    },
  );

  it('does not add source metadata or employee links to any of the other 46 cases', async () => {
    const untouched = rows.filter(
      (row) =>
        ![
          'followup-owner-topic-switch',
          'mt-topic_switch_and_return-17',
        ].includes(row.id),
    );
    expect(untouched).toHaveLength(46);
    for (const row of untouched) {
      const f = setupFixture(row.id);
      const original = structuredClone(f.current.item);
      await f.run();
      expect(f.db.prisma.crmIntegration.findUnique).not.toHaveBeenCalled();
      expect(f.db.prisma.staffProviderLink.findMany).not.toHaveBeenCalled();
      expect(f.db.prisma.staff.create).not.toHaveBeenCalled();
      expect(f.db.prisma.staffProviderLink.create).not.toHaveBeenCalled();
      expect(
        f.current.sourceRefs.some((ref) =>
          ref.owner.startsWith('OFFLINE_SCHEDULE_'),
        ),
      ).toBe(false);
      expect(f.current.item).toEqual(original);
      if (row.id === 'mt-ambiguous_entity_resolution-15') {
        expect(
          coreFullOfflineExternalFacts(f.current).getStaff(f.current.tenant.id),
        ).toEqual([
          { id: '71', name: 'Саша' },
          { id: '72', name: 'Саша' },
        ]);
        expect(f.current.sourceRefs).toEqual([
          {
            owner: 'OFFLINE_BRANCH_LABEL_ONLY',
            id: 'branch-other',
            status:
              'STAFF_TO_BRANCH_MAPPING_NOT_PROVEN_BY_PRACTITIONER_CONTRACT',
          },
        ]);
      }
    }
  });

  it('keeps the proof database guard ahead of every fake delegate', async () => {
    const f = setupFixture('followup-owner-topic-switch');
    jest.mocked(assertProofDatabase).mockImplementationOnce(() => {
      throw new Error('synthetic-proof-db-refused');
    });
    await expect(f.run()).rejects.toThrow('synthetic-proof-db-refused');
    expect(f.db.prisma.branch.findFirstOrThrow).not.toHaveBeenCalled();
    expect(f.db.prisma.staff.create).not.toHaveBeenCalled();
  });
});
