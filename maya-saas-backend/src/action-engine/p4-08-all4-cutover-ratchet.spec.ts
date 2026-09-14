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
  tenantsService: string;
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
    /tenant\.update(?:Many)?\(/.test(input.accessState) ||
    /(?:pastDueAt|graceEndsAt)\s*:/.test(
      method(
        input.tenantsService,
        'async updateTenant',
        'async setTenantStatus',
      ),
    ) ||
    /(?:pastDueAt|graceEndsAt)\s*:/.test(
      method(
        input.tenantsService,
        'async getPublicMobileConfig',
        'async listPublicTenants',
      ),
    )
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

function method(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from < 0 ? '' : source.slice(from, to < 0 ? source.length : to);
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

  it('wires all production initiators through the canonical P4-08 owner', () => {
    const controller = source('src/billing/billing.controller.ts');
    const scheduler = source('src/billing/billing-scheduler.service.ts');
    const module = source('src/billing/billing.module.ts');
    expect(controller).not.toContain('P408TenantBillingExecutableService');
    expect(scheduler).not.toContain('P408TenantBillingExecutableService');
    expect(scheduler).toContain('P408TenantBillingCanonicalCutoverService');
    expect(module).toContain('P408TenantBillingExecutableService');
    expect(module).toContain('P408TenantBillingCanonicalCutoverService');
    expect(module).toContain('P408YooKassaPaymentProvider');
    expect(source('src/billing/billing.service.ts')).toContain(
      'P408TenantBillingCanonicalCutoverService',
    );
  });

  it('finds no production-reachable direct payment/value owner after cutover', () => {
    const bypasses = productionBypasses({
      billingService: source('src/billing/billing.service.ts'),
      scheduler: source('src/billing/billing-scheduler.service.ts'),
      accessState: source('src/tenants/tenant-access-state.service.ts'),
      tenantsService: source('src/tenants/tenants.service.ts'),
    });
    expect(bypasses).toEqual([]);
  });

  it('still detects each of the four concrete direct-mutation subgroups', () => {
    const clean = productionBypasses({
      billingService: 'class ReadOnlyBillingProjection {}',
      scheduler: 'class CanonicalFanOutInitiator {}',
      accessState: 'class ReadOnlyAccessGuard {}',
      tenantsService: 'class TenantAdminWithoutBillingWrites {}',
    });
    const rogue = productionBypasses({
      billingService:
        'class Rogue { run() { this.yooKassaClient.createPayment({}); this.applyProviderPaymentIfFinal(); this.billingPayment.update({}); } }',
      scheduler:
        'class RogueScheduler { tick() { return this.billingService.runDueBilling(); } }',
      accessState:
        'class RogueAccess { run() { this.tenant.updateMany({}); } }',
      tenantsService: 'class TenantAdminWithoutBillingWrites {}',
    });
    expect(clean).toEqual([]);
    expect(rogue).toEqual([
      'checkout-and-recurring-owner',
      'payment-outcome-owner',
      'past-due-owner',
      'unbounded-scheduler-owner',
    ]);
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
    expect(source('src/tenants/tenant-access-state.service.ts')).not.toMatch(
      /tenant\.update(?:Many)?\(/,
    );
    const tenantAdmin = source('src/tenants/tenants.service.ts');
    expect(
      method(tenantAdmin, 'async updateTenant', 'async setTenantStatus'),
    ).not.toMatch(
      /(?:planId|currentPeriodStart|currentPeriodEnd|pastDueAt|graceEndsAt|billingMethodId)\s*:/,
    );
    expect(
      method(
        tenantAdmin,
        'async getPublicMobileConfig',
        'async listPublicTenants',
      ),
    ).not.toMatch(/tenant\.update(?:Many)?\(/);
  });
});
