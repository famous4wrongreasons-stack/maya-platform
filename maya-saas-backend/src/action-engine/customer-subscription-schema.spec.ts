import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829235900_customer_subscription',
  'migration.sql',
);

describe('Cycle 06 Package 4 customer subscription schema foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  const modelBlock = (name: string) => {
    const start = schema.indexOf(`model ${name} {`);
    const block = schema.slice(start);
    const end = block.indexOf('\n}');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThanOrEqual(0);
    return block.slice(0, end + 2);
  };
  const subscription = modelBlock('CustomerSubscription');
  const usage = modelBlock('CustomerSubscriptionUsage');

  it('binds activation and terminal lifecycle mutations separately', () => {
    expect(subscription).toMatch(/activationExecutionId\s+String\?/);
    expect(subscription).toMatch(/endExecutionId\s+String\?/);
    expect(subscription).toMatch(
      /@@unique\(\[activationExecutionId, tenantId\]\)/,
    );
    expect(subscription).toMatch(/@@unique\(\[endExecutionId, tenantId\]\)/);
  });

  it('represents renewal as a new one-to-one successor term', () => {
    expect(subscription).toMatch(/previousSubscriptionId\s+String\?/);
    expect(subscription).toMatch(
      /@@unique\(\[previousSubscriptionId, tenantId\]\)/,
    );
    expect(subscription).toContain(
      'fields: [previousSubscriptionId, tenantId], references: [id, tenantId]',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "CustomerSubscription_renewal_guard"',
    );
  });

  it('keeps plan, price, service scope, term, and provider facts immutable', () => {
    for (const field of [
      'termIdentityHash',
      'planSnapshotHash',
      'serviceScopeHash',
      'priceKopecks',
      'currency',
      'visitsIncluded',
      'providerPaymentRefHash',
      'termStartsAt',
      'termEndsAt',
    ]) {
      expect(subscription).toContain(field);
    }
    expect(migration).toContain(
      'CREATE TRIGGER "CustomerSubscription_immutable_facts_guard"',
    );
    expect(subscription).not.toMatch(/providerPaymentRef\s+String/);
  });

  it('models usage as one sync execution to many immutable claims', () => {
    expect(usage).toMatch(/actionExecutionId\s+String\?/);
    expect(usage).toMatch(
      /@@unique\(\[subscriptionId, tenantId, usageIdentityHash\]\)/,
    );
    expect(usage).toMatch(/@@index\(\[actionExecutionId, tenantId\]\)/);
    expect(usage).not.toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
    expect(migration).toContain(
      'CREATE TRIGGER "CustomerSubscriptionUsage_capacity_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "CustomerSubscriptionUsage_immutable_guard"',
    );
  });

  it('uses tenant-qualified customer, predecessor, subscription, and action relations', () => {
    expect(subscription).toContain(
      'fields: [clientId, tenantId], references: [id, tenantId]',
    );
    expect(subscription).toContain(
      'fields: [activationExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(subscription).toContain(
      'fields: [endExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(usage).toContain(
      'fields: [subscriptionId, tenantId], references: [id, tenantId]',
    );
    expect(usage).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
  });

  it('keeps historical bindings nullable and performs no backfill', () => {
    for (const field of [
      'activationExecutionId',
      'endExecutionId',
      'actionExecutionId',
    ]) {
      expect(migration).toContain(`"${field}" TEXT`);
      expect(migration).not.toContain(`"${field}" TEXT NOT NULL`);
    }
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
  });

  it('creates only the customer-subscription aggregate models', () => {
    const createdTables = [
      ...migration.matchAll(/CREATE TABLE "([^"]+)"/g),
    ].map(([, name]) => name);
    expect(createdTables).toEqual([
      'CustomerSubscription',
      'CustomerSubscriptionUsage',
    ]);
    expect(migration).not.toMatch(
      /GiftCertificate|BillingPayment|LoyaltyTransaction|ReferralReward/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
