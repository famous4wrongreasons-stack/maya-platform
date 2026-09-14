import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_04_EXECUTABLE_CAPABILITIES,
  P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
} from './p4-04-referral-reward-executable.contract';

const ROOT = join(__dirname, '..', '..', '..');
const CUTOVER_ENABLED = true;
const LEGACY_OWNER = 'ai администратор/referral.py';
const LEGACY_DATABASE = 'ai администратор/database.py';
const CANONICAL_OWNER =
  'maya-saas-backend/src/referrals/p4-04-referral-reward-executable.service.ts';
const PRODUCTION_MODULE = 'maya-saas-backend/src/referrals/referrals.module.ts';
const DISABLED_MARKER = 'p4_04_legacy_mutation_disabled';

type DirectMutationSubgroup =
  | 'referral_relationship_write'
  | 'referral_resolution_write'
  | 'reward_issue_or_fulfillment_write';

interface Guard {
  file: string;
  entrypoint: string;
  marker: string;
  mutation: string;
}

const SUBGROUP_GUARDS: Readonly<
  Record<DirectMutationSubgroup, readonly Guard[]>
> = {
  referral_relationship_write: [
    {
      file: LEGACY_OWNER,
      entrypoint: 'def handle_referral_visit',
      marker:
        'return _legacy_referral_mutation_disabled("create_customer_referral")',
      mutation: 'database.create_referral',
    },
    {
      file: LEGACY_DATABASE,
      entrypoint: 'def create_referral',
      marker:
        'raise RuntimeError("p4_04_legacy_mutation_disabled:create_customer_referral")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_DATABASE,
      entrypoint: 'def create_ref_code',
      marker:
        'raise RuntimeError("p4_04_legacy_mutation_disabled:issue_referral_link")',
      mutation: 'conn.execute',
    },
  ],
  referral_resolution_write: [
    {
      file: LEGACY_OWNER,
      entrypoint: 'async def run_referral_resolver_job',
      marker: 'return {',
      mutation: 'database.update_referral_status',
    },
    {
      file: LEGACY_DATABASE,
      entrypoint: 'def set_referral_referee_client',
      marker:
        'raise RuntimeError("p4_04_legacy_mutation_disabled:resolve_customer_referral")',
      mutation: 'conn.execute',
    },
    {
      file: LEGACY_DATABASE,
      entrypoint: 'def update_referral_status',
      marker:
        'raise RuntimeError("p4_04_legacy_mutation_disabled:resolve_customer_referral")',
      mutation: 'conn.execute',
    },
  ],
  reward_issue_or_fulfillment_write: [
    {
      file: LEGACY_OWNER,
      entrypoint: 'async def run_referral_resolver_job',
      marker: 'return {',
      mutation: 'database.save_referral_promo',
    },
    {
      file: LEGACY_DATABASE,
      entrypoint: 'def save_referral_promo',
      marker:
        'raise RuntimeError("p4_04_legacy_mutation_disabled:issue_referral_rewards")',
      mutation: 'conn.execute',
    },
  ],
};

type SourceOverrides = ReadonlyMap<string, string>;

function source(path: string, overrides?: SourceOverrides): string {
  return overrides?.get(path) ?? readFileSync(join(ROOT, path), 'utf8');
}

function functionBody(contents: string, entrypoint: string): string {
  const start = contents.indexOf(entrypoint);
  if (start < 0) return '';
  const rest = contents.slice(start + entrypoint.length);
  const nextFunction = rest.search(/\n(?:async )?def /u);
  return nextFunction < 0 ? rest : rest.slice(0, nextFunction);
}

function isFailClosed(guard: Guard, overrides?: SourceOverrides): boolean {
  const body = functionBody(source(guard.file, overrides), guard.entrypoint);
  const marker = body.indexOf(guard.marker);
  const mutation = body.indexOf(guard.mutation);
  return marker >= 0 && mutation >= 0 && marker < mutation;
}

function currentLegacyBypasses(
  overrides?: SourceOverrides,
): DirectMutationSubgroup[] {
  return (
    Object.entries(SUBGROUP_GUARDS) as Array<
      [DirectMutationSubgroup, readonly Guard[]]
    >
  )
    .filter(([, guards]) =>
      guards.some((guard) => !isFailClosed(guard, overrides)),
    )
    .map(([subgroup]) => subgroup);
}

describe('P4-04 all-4 production cutover ratchet', () => {
  it('registers all four canonical Action Engine owners plus the bounded envelope', () => {
    const registry = new ActionCapabilityRegistry();
    const expected = [
      P4_04_EXECUTABLE_CAPABILITIES.createReferral,
      P4_04_EXECUTABLE_CAPABILITIES.resolveReferral,
      P4_04_EXECUTABLE_CAPABILITIES.issueRewards,
      P4_04_EXECUTABLE_CAPABILITIES.fulfillReward,
    ];
    expect(
      expected.map((capability) => registry.get(capability).executorKey),
    ).toEqual([
      'referrals.customer-referral',
      'referrals.customer-referral',
      'referrals.reward-issuance',
      'referrals.reward-fulfillment',
    ]);
    expect(
      registry.get(P4_04_SCHEDULER_ENVELOPE_CAPABILITY).approvalRequirement,
    ).toBe('REQUIRED');
    expect(
      registry.get(P4_04_EXECUTABLE_CAPABILITIES.issueRewards)
        .approvalRequirement,
    ).toBe('REQUIRED');
  });

  it('wires only the canonical executor behind Action Engine and keeps discount value out of loyalty points', () => {
    const canonical = source(CANONICAL_OWNER);
    const productionModule = source(PRODUCTION_MODULE);
    expect(CUTOVER_ENABLED).toBe(true);
    expect(canonical).toContain('this.actionEngine.executeWithReceipt(');
    expect(canonical).toContain('TransactionIsolationLevel.Serializable');
    expect(canonical).toContain('referralRewardFulfillment.create');
    expect(canonical).not.toContain('loyaltyTransaction.create');
    expect(canonical).not.toContain('loyaltyAccount.update');
    expect(canonical).not.toContain('provider.write');
    expect(productionModule).toContain('P404ReferralRewardExecutableService');
    expect(productionModule).toContain(
      'exports: [P404ReferralRewardExecutableService]',
    );
  });

  it('reduces the one legacy family group and all three mutation subgroups to zero', () => {
    expect(Object.keys(SUBGROUP_GUARDS)).toHaveLength(3);
    expect(currentLegacyBypasses()).toEqual([]);
  });

  it('still detects a real direct owner if an accepted fail-closed guard is removed', () => {
    const unguarded = source(LEGACY_DATABASE).replace(
      'raise RuntimeError("p4_04_legacy_mutation_disabled:create_customer_referral")',
      'pass  # simulated direct owner regression',
    );
    expect(
      currentLegacyBypasses(new Map([[LEGACY_DATABASE, unguarded]])),
    ).toContain('referral_relationship_write');
  });

  it('keeps link issuance read-only and all four completed Shadow paths non-executable', () => {
    const legacy = source(LEGACY_OWNER);
    const linkBody = functionBody(legacy, 'def get_or_create_ref_code');
    const linkGuard =
      'raise RuntimeError("p4_04_legacy_mutation_disabled:issue_referral_link")';
    expect(linkBody).toContain(linkGuard);
    expect(linkBody).toContain('database.create_ref_code');
    expect(linkBody.indexOf(linkGuard)).toBeLessThan(
      linkBody.indexOf('database.create_ref_code'),
    );

    for (const file of [
      'maya-saas-backend/src/referrals/referral-create-shadow.service.ts',
      'maya-saas-backend/src/referrals/referral-resolve-shadow.service.ts',
      'maya-saas-backend/src/referrals/referral-reward-issue-shadow.service.ts',
      'maya-saas-backend/src/referrals/referral-reward-fulfill-shadow.service.ts',
    ]) {
      const contents = source(file);
      expect(contents).toContain('planShadow(');
      expect(contents).not.toContain('executeWithReceipt(');
      expect(contents).not.toContain(DISABLED_MARKER);
    }
  });

  it('does not expose a caller-authoritative raw P4-04 execution endpoint', () => {
    for (const file of [
      'maya-saas-backend/src/referrals/referral-create-shadow.controller.ts',
      'maya-saas-backend/src/referrals/referral-resolve-shadow.controller.ts',
      'maya-saas-backend/src/referrals/referral-reward-issue-shadow.controller.ts',
      'maya-saas-backend/src/referrals/referral-reward-fulfill-shadow.controller.ts',
    ]) {
      const controller = source(file);
      expect(controller).not.toContain('P404ReferralRewardExecutableService');
      expect(controller).not.toContain('.execute.v1');
    }
  });
});
