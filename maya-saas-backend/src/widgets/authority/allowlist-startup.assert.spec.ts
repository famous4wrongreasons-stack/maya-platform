import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { canonicalProductionPolicyDefinitions } from '../../action-engine/action-engine.policy-registry';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  BOOKING,
  CONSENT,
  IDENTITY,
  MARKETING_FANOUT,
  MONEY,
  TENANT_AUTHORITY,
  type AeCommitRuntimeRow,
} from './ae-commit-allowlist.runtime';
import { AE_CAPABILITY_GAP_LEDGER } from './ae-capability-gap-ledger.runtime';
import {
  allowlistStartupProblems,
  assertAllowlistAtRegistryLoad,
  type AllowlistAssertionInput,
} from './allowlist-startup.assert';
import { AE_PROPOSE_PAIRING } from './propose-pairing';

const capabilities = new ActionCapabilityRegistry().list();
const policies = new Set(
  canonicalProductionPolicyDefinitions().map((row) => row.capability),
);

const base = (): AllowlistAssertionInput => ({
  capabilities: capabilities.map((cap) => ({ ...cap })),
  productionPolicyKeys: new Set(policies),
  allowlist: { ...AE_WIDGET_COMMIT_ALLOWLIST },
  gaps: { ...AE_CAPABILITY_GAP_LEDGER },
  pairings: [...AE_PROPOSE_PAIRING],
});

const cap = (
  predicate: (candidate: RegisteredActionCapabilityV1) => boolean,
): RegisteredActionCapabilityV1 => {
  const found = capabilities.find(predicate);
  if (found === undefined) throw new Error('test capability missing');
  return found;
};

const firstRow = (): [string, AeCommitRuntimeRow] => {
  const row = Object.entries(AE_WIDGET_COMMIT_ALLOWLIST)[0];
  if (row === undefined) throw new Error('allowlist unexpectedly empty');
  return row;
};

const withCapability = (
  input: AllowlistAssertionInput,
  key: string,
  change: Partial<RegisteredActionCapabilityV1>,
): AllowlistAssertionInput => ({
  ...input,
  capabilities: input.capabilities.map((candidate) =>
    candidate.capability === key ? { ...candidate, ...change } : candidate,
  ),
});

const expectProblem = (
  input: AllowlistAssertionInput,
  fragment: string,
): void => {
  expect(allowlistStartupProblems(input)).toEqual(
    expect.arrayContaining([expect.stringContaining(fragment)]),
  );
};

describe('P-23 F31 — AE commit classification at EP-REGISTRY-LOAD', () => {
  it('AL-0: wires the assertion into the widget module startup path', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'widgets.module.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /onModuleInit\(\): void \{[\s\S]*assertAllowlistAtRegistryLoad\(\)/,
    );
  });

  it('AL-1: classifies all 226 capabilities as exactly 10 rows XOR 216 gaps', () => {
    expect(capabilities).toHaveLength(226);
    expect(Object.keys(AE_WIDGET_COMMIT_ALLOWLIST)).toHaveLength(10);
    expect(Object.keys(AE_CAPABILITY_GAP_LEDGER)).toHaveLength(216);
    expect(allowlistStartupProblems()).toEqual([]);
    expect(() => assertAllowlistAtRegistryLoad()).not.toThrow();

    for (const candidate of capabilities) {
      const row = AE_WIDGET_COMMIT_ALLOWLIST[candidate.capability];
      const gap = AE_CAPABILITY_GAP_LEDGER[candidate.capability];
      expect(Number(row !== undefined) + Number(gap !== undefined)).toBe(1);
    }
  });

  it('AL-1b: maps the named F37 classes to registered capability gaps', () => {
    expect(AE_CAPABILITY_GAP_LEDGER).toMatchObject({
      'crm.appointment.attendance.v1': 'GAP-APPOINTMENT-DETAIL-COMMIT',
      'communication.bulk-campaign.execute.v1': 'GAP-BULK-SEND-DIRECT',
      'expenses.create.execute.v1': 'GAP-EXPENSE-COMMIT',
      'expenses.delete.execute.v1': 'GAP-EXPENSE-DELETE',
      'tenant-billing.checkout.execute.v1': 'GAP-TENANT-BILLING',
      'commerce-credentials.connect.execute.v1': 'GAP-COMMERCE-CREDENTIALS',
      'value-configuration.certificate.create.execute.v1': 'GAP-VALUE-CONFIG',
      'customer-subscriptions.purchase-checkout.execute.v1': 'GAP-SUBSCRIPTION',
      'referrals.referral-reward-issue.execute.v1': 'GAP-REFERRAL-REWARD',
      'cash-declaration.declare.execute.v1': 'GAP-CASH-DECLARATION',
      'package5.wave2.claim-team-owner.execute.v1': 'GAP-TENANT-ADMIN',
      'package5.wave2.revoke-other-session.execute.v1': 'GAP-IDENTITY-SESSION',
    });
  });

  it('AL-1: refuses an unclassified capability, a row+gap collision, unknown rows and unknown gaps', () => {
    const [key, row] = firstRow();
    const missing = base();
    delete (missing.allowlist as Record<string, AeCommitRuntimeRow>)[key];
    expectProblem(missing, 'expected row XOR gap');

    const collision = base();
    (collision.gaps as Record<string, string>)[key] =
      'GAP-SEPARATION-OF-DUTIES';
    expectProblem(collision, 'expected row XOR gap');

    const unknownRow = base();
    (unknownRow.allowlist as Record<string, AeCommitRuntimeRow>).unknown = row;
    expectProblem(unknownRow, 'allowlist row is not registered');

    const unknownGap = base();
    const gapKey = Object.keys(unknownGap.gaps)[0];
    (unknownGap.gaps as Record<string, string>)[gapKey] = 'GAP-NOT-REAL';
    expectProblem(unknownGap, 'is not a registered capability gap');
  });

  it('AL-2: refuses every registry, source, approval, policy and floor veto independently', () => {
    const [key, row] = firstRow();
    expectProblem(
      withCapability(base(), key, { policyDecision: 'SHADOW_ONLY' }),
      'policyDecision is not ALLOW',
    );
    expectProblem(
      withCapability(base(), key, { allowedSourceTypes: ['scheduler'] }),
      'authenticated_request is absent',
    );

    const approval = base();
    (approval.allowlist as Record<string, AeCommitRuntimeRow>)[key] = {
      ...row,
      requires_ae_approval: !row.requires_ae_approval,
    };
    expectProblem(approval, 'approval requirement diverges');

    const policy = base();
    (policy.productionPolicyKeys as Set<string>).delete(key);
    expectProblem(policy, 'canonical policy is absent');

    const floor = base();
    (floor.allowlist as Record<string, AeCommitRuntimeRow>)[key] = {
      ...row,
      min_verification: 'CHANNEL_IDENTITY',
    };
    expectProblem(floor, 'floor is below SESSION_VERIFIED');
  });

  it('AL-2: refuses MONEY, CONSENT, IDENTITY and TENANT_AUTHORITY injected rows', () => {
    const sourceRow = firstRow()[1];
    const cases: Array<
      [string, (candidate: RegisteredActionCapabilityV1) => boolean, string]
    > = [
      ['MONEY', MONEY, 'MONEY veto'],
      ['CONSENT', CONSENT, 'CONSENT/IDENTITY veto'],
      ['IDENTITY', IDENTITY, 'CONSENT/IDENTITY veto'],
      ['TENANT_AUTHORITY', TENANT_AUTHORITY, 'TENANT_AUTHORITY veto'],
    ];

    for (const [, predicate, expected] of cases) {
      const candidate = cap(predicate);
      const input = base();
      delete (input.gaps as Record<string, string>)[candidate.capability];
      (input.allowlist as Record<string, AeCommitRuntimeRow>)[
        candidate.capability
      ] = sourceRow;
      expectProblem(input, expected);
    }
  });

  it('AL-2: pins booking confirmation kind and the single marketing row', () => {
    const booking = cap(
      (candidate) =>
        BOOKING(candidate) &&
        AE_WIDGET_COMMIT_ALLOWLIST[candidate.capability] !== undefined,
    );
    const bookingInput = base();
    (bookingInput.allowlist as Record<string, AeCommitRuntimeRow>)[
      booking.capability
    ] = {
      ...AE_WIDGET_COMMIT_ALLOWLIST[booking.capability],
      confirmation_kind: 'SETTINGS_DRAFT',
    };
    expectProblem(bookingInput, 'BOOKING kind veto');

    const marketing = cap(
      (candidate) =>
        MARKETING_FANOUT(candidate) &&
        AE_WIDGET_COMMIT_ALLOWLIST[candidate.capability] !== undefined,
    );
    const wrongFamily = base();
    (wrongFamily.allowlist as Record<string, AeCommitRuntimeRow>)[
      marketing.capability
    ] = {
      ...AE_WIDGET_COMMIT_ALLOWLIST[marketing.capability],
      family: 'settings',
    };
    expectProblem(wrongFamily, 'marketing family veto');

    const noMarketing = base();
    delete (noMarketing.allowlist as Record<string, AeCommitRuntimeRow>)[
      marketing.capability
    ];
    (noMarketing.gaps as Record<string, string>)[marketing.capability] =
      'GAP-BULK-SEND-DIRECT';
    expectProblem(noMarketing, 'expected one row, got 0');
  });

  it('AL-3: refuses absent, duplicate, wrong-side and mismatched propose pairings', () => {
    const [key, row] = firstRow();
    const absent = base();
    absent.pairings = absent.pairings.filter((pair) => pair.ae.key !== key);
    expectProblem(absent, 'expected exactly one pairing, got 0');

    const duplicate = base();
    const paired = duplicate.pairings.find((pair) => pair.ae.key === key)!;
    duplicate.pairings = [...duplicate.pairings, paired];
    expectProblem(duplicate, 'expected exactly one pairing, got 2');

    const mismatched = base();
    (mismatched.allowlist as Record<string, AeCommitRuntimeRow>)[key] = {
      ...row,
      propose: { space: 'C9', key: 'c9.no_action' },
    };
    expectProblem(mismatched, 'row propose does not equal traced pairing');

    const wrongSpace = base();
    wrongSpace.pairings = wrongSpace.pairings.map((pair) =>
      pair.ae.key === key
        ? { ...pair, ae: { space: 'C9' as const, key: pair.ae.key } }
        : pair,
    );
    expectProblem(wrongSpace, 'ae side is in space C9');
  });

  it('AL-4: derives each family from the live capability', () => {
    const operational = cap(
      (candidate) =>
        AE_WIDGET_COMMIT_ALLOWLIST[candidate.capability]?.family ===
        'operational',
    );
    const input = base();
    (input.allowlist as Record<string, AeCommitRuntimeRow>)[
      operational.capability
    ] = {
      ...AE_WIDGET_COMMIT_ALLOWLIST[operational.capability],
      family: 'settings',
    };
    expectProblem(input, 'family is not derived');
  });
});
import fs from 'node:fs';
import path from 'node:path';
