import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ActionPolicyDecision } from '@prisma/client';

import {
  ActionCapabilityRegistry,
  P4_08_EXECUTABLE_CAPABILITIES,
  P4_08_REGISTRATIONS,
  P4_08_SHADOW_CAPABILITIES,
} from './index';

const root = resolve(__dirname, '..', '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

function productionBypasses(input: {
  billingService: string;
  scheduler: string;
  accessState: string;
}): string[] {
  const groups: string[] = [];
  if (
    /yooKassaClient\.createPayment\(/.test(input.billingService) ||
    /billingPayment\.create\(/.test(input.billingService)
  ) {
    groups.push('checkout-and-recurring-owner');
  }
  if (
    /applyProviderPaymentIfFinal\(/.test(input.billingService) &&
    /billingPayment\.(?:update|updateMany)\(/.test(input.billingService)
  ) {
    groups.push('payment-outcome-owner');
  }
  if (
    /markTenantPastDue\(/.test(input.billingService) ||
    /tenant\.update(?:Many)?\(/.test(input.accessState)
  ) {
    groups.push('past-due-owner');
  }
  if (
    /billingService\.(?:runDueBilling|chargeTenant)\(/.test(input.scheduler)
  ) {
    groups.push('unbounded-scheduler-owner');
  }
  return groups;
}

describe('P4-08 all-four cutover ratchet readiness', () => {
  it('registers four non-executable Shadows and four canonical executors', () => {
    const registry = new ActionCapabilityRegistry();
    const shadows = Object.values(P4_08_SHADOW_CAPABILITIES).map((capability) =>
      registry.get(capability),
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
      Object.values(P4_08_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).actionClass,
      ),
    ).toEqual(P4_08_REGISTRATIONS.map((item) => item.actionClass));
  });

  it('keeps the safe local cycle disconnected from production routes', () => {
    const controller = source('src/billing/billing.controller.ts');
    const scheduler = source('src/billing/billing-scheduler.service.ts');
    const module = source('src/billing/billing.module.ts');
    expect(controller).not.toContain('P408TenantBillingExecutableService');
    expect(scheduler).not.toContain('P408TenantBillingExecutableService');
    expect(module).not.toContain('P408TenantBillingExecutableService');
  });

  it('enumerates the exact pre-cutover owner surfaces instead of hiding them', () => {
    const bypasses = productionBypasses({
      billingService: source('src/billing/billing.service.ts'),
      scheduler: source('src/billing/billing-scheduler.service.ts'),
      accessState: source('src/tenants/tenant-access-state.service.ts'),
    });
    expect(bypasses).toEqual([
      'checkout-and-recurring-owner',
      'payment-outcome-owner',
      'past-due-owner',
      'unbounded-scheduler-owner',
    ]);
  });

  it('detects a newly introduced direct payment/value bypass', () => {
    const clean = productionBypasses({
      billingService: 'class ReadOnlyBillingProjection {}',
      scheduler: 'class CanonicalFanOutInitiator {}',
      accessState: 'class ReadOnlyAccessGuard {}',
    });
    const rogue = productionBypasses({
      billingService:
        'class Rogue { run() { return this.yooKassaClient.createPayment({}); } }',
      scheduler: 'class CanonicalFanOutInitiator {}',
      accessState: 'class ReadOnlyAccessGuard {}',
    });
    expect(clean).toEqual([]);
    expect(rogue).toEqual(['checkout-and-recurring-owner']);
  });

  it('classifies the PostgreSQL proof as disposable and test-only', () => {
    const proof = source('scripts/p4-08-all4-executable-proof.ts');
    expect(proof).toContain("startsWith('maya_c06_p408_all4_')");
    expect(proof).toContain('proof refuses non-disposable databases');
    expect(source('src/billing/billing.module.ts')).not.toContain(
      'p4-08-all4-executable-proof',
    );
  });

  it('keeps payment-derived writes inside the isolated canonical executor', () => {
    const executor = source(
      'src/billing/p4-08-tenant-billing-executable.service.ts',
    );
    expect(executor).toContain('ActionEngineRuntimeService');
    expect(executor).toContain('provider_dispatch_outcome_unknown');
    expect(executor).toContain('reconcileByIdempotencyKey');
    expect(executor).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(executor).toContain('billing_plan_change_contract_required');
  });
});
