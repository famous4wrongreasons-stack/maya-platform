import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ActionPolicyDecision } from '@prisma/client';

import {
  ActionCapabilityRegistry,
  P4_10_EXECUTABLE_CAPABILITIES,
  P4_10_REGISTRATIONS,
  P4_10_SHADOW_CAPABILITIES,
} from '../action-engine';

const root = resolve(__dirname, '..', '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

function productionBypasses(service: string): string[] {
  const groups: string[] = [];
  if (/commerceIntegration\.upsert\(/.test(service)) {
    groups.push('initial-connect-owner', 'credential-replacement-owner');
  }
  if (/commerceIntegration\.update\(/.test(service)) {
    groups.push('credential-recheck-owner');
  }
  if (/commerceIntegration\.delete\(/.test(service)) {
    groups.push('credential-disconnect-owner');
  }
  return groups;
}

describe('P4-10 all-four cutover ratchet readiness', () => {
  it('registers four non-executable Shadows and four canonical executors', () => {
    const registry = new ActionCapabilityRegistry();
    const shadows = Object.values(P4_10_SHADOW_CAPABILITIES).map((key) =>
      registry.get(key),
    );
    expect(shadows).toHaveLength(4);
    expect(
      shadows.every(
        (item) =>
          item.policyDecision === ActionPolicyDecision.SHADOW_ONLY &&
          item.executorKey === 'shadow.none',
      ),
    ).toBe(true);
    expect(
      Object.values(P4_10_EXECUTABLE_CAPABILITIES).map(
        (key) => registry.get(key).actionClass,
      ),
    ).toEqual(P4_10_REGISTRATIONS.map((item) => item.actionClass));
  });

  it('wires all four production mutations through the canonical owner', () => {
    const module = source('src/commerce/commerce.module.ts');
    const controller = source(
      'src/commerce/commerce-integration.controller.ts',
    );
    const service = source('src/commerce/commerce-integration.service.ts');
    const canonical = source(
      'src/commerce/p4-10-commerce-credential-canonical-cutover.service.ts',
    );
    expect(module).toContain('ActionEngineModule');
    expect(module).toContain('P410CommerceCredentialExecutableService');
    expect(module).toContain('P410CommerceCredentialCanonicalCutoverService');
    expect(controller).toContain("@Headers('idempotency-key')");
    expect(service).toContain('this.canonicalCutover.setCredentials(');
    expect(service).toContain('this.canonicalCutover.recheck(');
    expect(service).toContain('this.canonicalCutover.disconnect(');
    expect(canonical).toContain('this.executor.execute(');
    expect(canonical).toContain('this.executor.resume(');
  });

  it('ratchets the one owner group and four direct subgroups to zero', () => {
    expect(
      productionBypasses(
        source('src/commerce/commerce-integration.service.ts'),
      ),
    ).toEqual([]);
  });

  it('still detects every new direct credential-mutation bypass', () => {
    expect(productionBypasses('class ReadOnlyCommerceProjection {}')).toEqual(
      [],
    );
    expect(
      productionBypasses(
        'class Rogue { x() { this.commerceIntegration.upsert({}); this.commerceIntegration.update({}); this.commerceIntegration.delete({}); } }',
      ),
    ).toEqual([
      'initial-connect-owner',
      'credential-replacement-owner',
      'credential-recheck-owner',
      'credential-disconnect-owner',
    ]);
  });

  it('classifies the PostgreSQL proof as disposable and test-only', () => {
    const proof = source('scripts/p4-10-all4-executable-proof.ts');
    expect(proof).toContain("startsWith('maya_c06_p410_all4_')");
    expect(proof).toContain('proof refuses non-disposable databases');
    expect(source('src/commerce/commerce.module.ts')).not.toContain(
      'p4-10-all4-executable-proof',
    );
  });

  it('keeps provider access read-only and raw authority out of action evidence', () => {
    const provider = source(
      'src/commerce/p4-10-yookassa-credential-verifier.ts',
    );
    const shadow = source(
      'src/commerce/p4-10-commerce-credential-shadow.service.ts',
    );
    const executor = source(
      'src/commerce/p4-10-commerce-credential-executable.service.ts',
    );
    expect(provider).toContain("method: 'GET'");
    expect(provider).not.toMatch(/createPayment|method:\s*['"]POST['"]/);
    expect(shadow).toMatch(
      /opaqueReference\(\s*'p4-10\.yookassa-credential-set'/,
    );
    expect(executor).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(executor).toContain('unknownApplicable: false');
    expect(executor).not.toContain('encryptedShopId: input');
    expect(executor).not.toContain('encryptedSecretKey: input');
  });

  it('keeps direct mutation ownership out of the facade and adapter', () => {
    const surfaces = [
      source('src/commerce/commerce-integration.service.ts'),
      source(
        'src/commerce/p4-10-commerce-credential-canonical-cutover.service.ts',
      ),
    ].join('\n');
    expect(productionBypasses(surfaces)).toEqual([]);
    expect(surfaces).not.toMatch(
      /commerceIntegration\.(create|upsert|update|delete)\(/,
    );
  });
});
