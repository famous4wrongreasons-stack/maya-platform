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

function method(contents: string, start: string): string {
  const from = contents.indexOf(start);
  if (from < 0) return '';
  const bodyStart = contents.indexOf('{', from + start.length);
  if (bodyStart < 0) return '';
  let depth = 0;
  for (let index = bodyStart; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1;
    if (contents[index] === '}') depth -= 1;
    if (depth === 0) return contents.slice(from, index + 1);
  }
  return '';
}

function directMutationSubgroups(contents: string): DirectMutationSubgroup[] {
  const sections = {
    'catalog.create': method(contents, 'async createCatalogItem'),
    'catalog.update': method(contents, 'async updateCatalogItem'),
    'catalog.delete': method(contents, 'async deleteCatalogItem'),
    'referral-program.upsert': method(contents, 'async updateReferralProgram'),
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

  it('ratchets all four production value-configuration subgroups to canonical ownership', () => {
    const production = source(
      'src/business-content/business-content.service.ts',
    );
    const cutover = source(
      'src/business-content/p4-09-value-configuration-canonical-cutover.service.ts',
    );
    expect(directMutationSubgroups(production)).toEqual([]);
    expect(production).toContain('canonicalValueConfiguration.createOffer(');
    expect(production).toContain('canonicalValueConfiguration.updateOffer(');
    expect(production).toContain('canonicalValueConfiguration.retireOffer(');
    expect(production).toContain(
      'canonicalValueConfiguration.updateReferralPolicy(',
    );
    expect(cutover).toContain('CanonicalActionIngressService');
    expect(cutover).toContain('P409ValueConfigurationExecutableService');
    expect(cutover).toContain('ActionApprovalDecision.APPROVED');
    expect(cutover).not.toMatch(
      /tenantCatalogItem\.(?:create|update|delete)\(/,
    );
    expect(cutover).not.toMatch(/referralProgram\.(?:create|upsert|update)\(/);
  });

  it('makes future subscription and certificate checkouts resolve canonical offers', () => {
    const subscriptions = source(
      'src/customer-subscriptions/customer-subscription-purchase-shadow.service.ts',
    );
    const certificates = source(
      'src/gift-certificates/gift-certificate-purchase-shadow.service.ts',
    );
    expect(subscriptions).toContain('resolveMembershipOffer(');
    expect(subscriptions).not.toContain(
      'resolveCustomerSubscriptionPurchaseOffer(dto.offer_code)',
    );
    expect(certificates).toContain('resolveCertificateOffer(');
    expect(certificates).not.toContain(
      'resolveGiftCertificatePurchaseOffer(dto.offer_code)',
    );
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
