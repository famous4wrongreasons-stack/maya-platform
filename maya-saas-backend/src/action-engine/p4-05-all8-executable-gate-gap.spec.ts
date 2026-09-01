import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const source = (...parts: string[]): string =>
  readFileSync(join(ROOT, ...parts), 'utf8');

describe('P4-05 all-8 executable proof contract ratchet', () => {
  const executable = source(
    'src',
    'customer-subscriptions',
    'p4-05-customer-subscription-executable.service.ts',
  );
  const contract = source(
    'src',
    'action-engine',
    'p4-05-customer-subscription-executable.contract.ts',
  );
  const schema = source('prisma', 'schema.prisma');
  const registry = source('src', 'action-engine', 'action-engine.registry.ts');

  it('keeps checkout creation separate from value activation', () => {
    expect(executable).toContain('executeCheckout(');
    expect(executable).toContain('executeActivation(');
    expect(executable).toContain('providerState: payment.status');
    expect(executable).toContain('subscriptionMutations: 0');
    expect(executable).toContain(
      'PENDING checkout cannot activate subscription value',
    );
    expect(executable).toContain(
      'UNKNOWN checkout cannot activate subscription value',
    );
  });

  it('uses durable provider identity, UNKNOWN reconciliation, and no blind new key', () => {
    expect(executable).toContain('transportKey');
    expect(executable).toContain('persistProviderReference(');
    expect(executable).toContain('reconcileByIdempotencyKey(');
    expect(executable).toContain("outcome: 'STILL_UNKNOWN'");
    expect(executable).not.toContain('randomUUID');
    expect(registry).toContain('reconcile-before-retry');
    expect(registry).toContain('retryAfterProvenNonExecution: true');
  });

  it('creates every value fact inside a serializable PostgreSQL transaction', () => {
    expect(
      executable.match(/TransactionIsolationLevel\.Serializable/g),
    ).toHaveLength(3);
    expect(executable).toContain('customerSubscription.create');
    expect(executable).toContain('customerSubscriptionUsage.create');
    expect(executable).toContain('endExecutionId: executionId');
    expect(schema).toContain('activationExecutionId');
    expect(schema).toContain('previousSubscriptionId');
    expect(schema).toContain('usageIdentityHash');
  });

  it('preserves predecessor terms and makes renewal one-time', () => {
    expect(executable).toContain('previousSubscriptionId');
    expect(executable).toContain('Renewal predecessor changed before commit');
    expect(executable).not.toMatch(
      /customerSubscription\.update\([\s\S]{0,200}previousSubscriptionId/,
    );
    expect(schema).toContain('@@unique([previousSubscriptionId, tenantId])');
  });

  it('uses immutable exact usage claims rather than a mutable counter', () => {
    expect(executable).toContain("targetKind: 'provider_visit_service'");
    expect(executable).toContain('usageIdentityHash');
    expect(executable).toContain('Usage allowance changed before the claim');
    expect(executable).not.toContain('visitsUsed');
    expect(schema).toContain(
      '@@unique([subscriptionId, tenantId, usageIdentityHash])',
    );
  });

  it('gives expire/cancel/revoke one shared terminal DB claim', () => {
    expect(executable).toContain('Subscription already has a terminal winner');
    expect(executable).toContain("? 'expired'");
    expect(executable).toContain("? 'canceled'");
    expect(executable).toContain("'revoked'");
    expect(schema).toContain('@@unique([endExecutionId, tenantId])');
  });

  it('keeps unresolved identities, tenant boundaries, and actor authority fail closed', () => {
    expect(executable).toContain('unresolvedClientIdentityHold.findFirst');
    expect(executable).toContain('client_identity_unresolved');
    expect(executable).toContain('id_tenantId');
    expect(executable).toContain(
      'Terminal mutation requires an active canonical actor',
    );
    expect(executable).toContain('Requester authority is not server-derived');
  });

  it('bounds scheduler fan-out without making it a payment owner', () => {
    expect(contract).toContain('maxTermsPerEnvelope: 25');
    expect(contract).toContain("fanOutMode: 'BOUNDED_PER_TERM_EXECUTIONS'");
    expect(contract).toContain('providerPaymentExecutionOwner: false');
    expect(contract).toContain(
      'remainingCustomerSubscriptionSchedulerChildren',
    );
  });
});
