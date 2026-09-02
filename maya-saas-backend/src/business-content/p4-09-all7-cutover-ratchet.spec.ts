import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ActionPolicyDecision } from '@prisma/client';

import {
  ActionCapabilityRegistry,
  P4_09_EXECUTABLE_CAPABILITIES,
  P4_09_REGISTRATIONS,
  P4_09_SHADOW_CAPABILITIES,
} from '../action-engine';

const root = resolve(__dirname, '..', '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

type DirectMutationSubgroup =
  | 'catalog.create'
  | 'catalog.update'
  | 'catalog.delete'
  | 'referral-program.upsert';

function method(contents: string, start: string, end: string): string {
  const from = contents.indexOf(start);
  const finish = contents.indexOf(end, from + start.length);
  return from < 0
    ? ''
    : contents.slice(from, finish < 0 ? contents.length : finish);
}

function directMutationSubgroups(contents: string): DirectMutationSubgroup[] {
  const sections = {
    'catalog.create': method(
      contents,
      'async createCatalogItem',
      'async updateCatalogItem',
    ),
    'catalog.update': method(
      contents,
      'async updateCatalogItem',
      'async deleteCatalogItem',
    ),
    'catalog.delete': method(
      contents,
      'async deleteCatalogItem',
      'async getReferralProgram',
    ),
    'referral-program.upsert': method(
      contents,
      'async updateReferralProgram',
      'async ingestReview',
    ),
  } as const;
  const patterns: Readonly<Record<DirectMutationSubgroup, RegExp>> = {
    'catalog.create': /tenantCatalogItem\.create\(/,
    'catalog.update': /tenantCatalogItem\.update\(/,
    'catalog.delete': /tenantCatalogItem\.delete\(/,
    'referral-program.upsert': /referralProgram\.upsert\(/,
  };
  return (Object.keys(sections) as DirectMutationSubgroup[]).filter((key) =>
    patterns[key].test(sections[key]),
  );
}

describe('P4-09 all-seven cutover ratchet readiness', () => {
  it('registers seven non-executable Shadows and seven owner-approved executors', () => {
    const registry = new ActionCapabilityRegistry();
    const shadows = Object.values(P4_09_SHADOW_CAPABILITIES).map((capability) =>
      registry.get(capability),
    );
    const executors = Object.values(P4_09_EXECUTABLE_CAPABILITIES).map(
      (capability) => registry.get(capability),
    );
    expect(P4_09_REGISTRATIONS).toHaveLength(7);
    expect(shadows).toHaveLength(7);
    expect(executors).toHaveLength(7);
    expect(
      shadows.every(
        (item) =>
          item.policyDecision === ActionPolicyDecision.SHADOW_ONLY &&
          item.executorKey === 'shadow.none',
      ),
    ).toBe(true);
    expect(
      executors.every(
        (item) =>
          item.policyDecision === ActionPolicyDecision.ALLOW &&
          item.approvalRequirement === 'REQUIRED' &&
          item.executorKey === 'business-content.canonical-value',
      ),
    ).toBe(true);
  });

  it('keeps the Shadows physically non-executable', () => {
    const shadow = source(
      'src/business-content/p4-09-value-configuration-shadow.service.ts',
    );
    expect(shadow).toContain('this.actionEngine.planShadow(');
    expect(shadow).not.toMatch(/tenantCatalogItem\.(?:create|update|delete)\(/);
    expect(shadow).not.toMatch(/referralProgram\.(?:create|upsert|update)\(/);
    expect(shadow).not.toContain('P409ValueConfigurationExecutableService');
  });

  it('keeps local value mutation, audit, and execution finalization atomic', () => {
    const executable = source(
      'src/business-content/p4-09-value-configuration-executable.service.ts',
    );
    expect(executable).toContain('CanonicalActionIngressService');
    expect(executable).toContain('pg_advisory_xact_lock');
    expect(executable).toContain(
      'Prisma.TransactionIsolationLevel.Serializable',
    );
    expect(executable).toContain(
      'externalDispatchState: ExternalDispatchState.NOT_CROSSED',
    );
    expect(executable).not.toContain('ActionExecutionState.UNKNOWN');
    expect(executable).not.toMatch(/provider\.(?:create|send|dispatch)\(/);
  });

  it('stages exact canonical offer resolution without static price fallback', () => {
    const authority = source(
      'src/business-content/p4-09-canonical-offer-authority.service.ts',
    );
    expect(authority).toContain('id_tenantId');
    expect(authority).toContain("version.availabilityState !== 'ACTIVE'");
    expect(authority).toContain('nominalAmountKopecks: authority.priceKopecks');
    expect(authority).not.toContain('externalRef:');
    expect(authority).not.toContain('CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS[');
    expect(authority).not.toContain('GIFT_CERTIFICATE_PURCHASE_OFFERS[');
  });

  it('pins the exact pre-cutover bypass baseline for one group and four subgroups', () => {
    const legacy = source('src/business-content/business-content.service.ts');
    expect(directMutationSubgroups(legacy)).toEqual([
      'catalog.create',
      'catalog.update',
      'catalog.delete',
      'referral-program.upsert',
    ]);
  });

  it('still detects each genuine direct mutation instead of excluding the directory', () => {
    expect(
      directMutationSubgroups(`
        async createCatalogItem() { this.tenantCatalogItem.create({}); }
        async updateCatalogItem() { this.tenantCatalogItem.update({}); }
        async deleteCatalogItem() { this.tenantCatalogItem.delete({}); }
        async getReferralProgram() {}
        async updateReferralProgram() { this.referralProgram.upsert({}); }
        async ingestReview() {}
      `),
    ).toEqual([
      'catalog.create',
      'catalog.update',
      'catalog.delete',
      'referral-program.upsert',
    ]);
    expect(
      directMutationSubgroups(`
        async createCatalogItem() { return this.canonical.create(); }
        async updateCatalogItem() { return this.canonical.update(); }
        async deleteCatalogItem() { return this.canonical.retire(); }
        async getReferralProgram() {}
        async updateReferralProgram() { return this.canonical.referral(); }
        async ingestReview() {}
      `),
    ).toEqual([]);
  });

  it('classifies the PostgreSQL proof as disposable and test-only', () => {
    const proof = source('scripts/p4-09-all7-executable-proof.ts');
    expect(proof).toContain("startsWith('maya_c06_p409_all7_')");
    expect(proof).toContain('proof refuses non-disposable databases');
    expect(
      source('src/business-content/business-content.module.ts'),
    ).not.toContain('p4-09-all7-executable-proof');
  });
});
