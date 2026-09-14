import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260903120000_package5_common_authority_foundation',
  'migration.sql',
);

describe('Package 5 common authority schema foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  const modelBlock = (name: string) => {
    const start = schema.indexOf(`model ${name} {`);
    const tail = schema.slice(start);
    const end = tail.indexOf('\n}');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThanOrEqual(0);
    return tail.slice(0, end + 2);
  };

  it('binds every governed target mutation to one exact execution and generation', () => {
    const block = modelBlock('ActionTargetMutation');

    expect(block).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(block).toContain(
      '@@unique([tenantId, actionExecutionId, mutationKey])',
    );
    expect(block).toContain(
      '@@unique([tenantId, targetKind, targetRef, targetGeneration])',
    );
    expect(migration).toContain('p5_require_governed_execution');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain(
      'ActionTargetMutation generation must be the next contiguous target generation',
    );
    expect(migration).toContain('ActionTargetMutation is append-only');
  });

  it('makes canonical profiles Client-owned without fabricating historical ownership', () => {
    const profile = modelBlock('CustomerProfile');

    expect(profile).toMatch(/clientId\s+String\?/);
    expect(profile).toMatch(/userId\s+String\?/);
    expect(profile).toContain(
      'fields: [clientId, tenantId], references: [id, tenantId]',
    );
    expect(profile).toContain('@@unique([tenantId, clientId])');
    expect(migration).toContain(
      'CHECK ("clientId" IS NOT NULL OR "userId" IS NOT NULL)',
    );
    expect(migration).toContain(
      'Established CustomerProfile tenant and Client owner are immutable',
    );
    expect(migration).not.toMatch(
      /UPDATE\s+"CustomerProfile"\s+SET\s+"clientId"/i,
    );
  });

  it('stores consent as an immutable Client-owned source fact', () => {
    const consent = modelBlock('ClientConsentFact');

    expect(consent).toContain(
      'fields: [clientId, tenantId], references: [id, tenantId]',
    );
    expect(consent).toContain(
      '@@unique([tenantId, sourceType, sourceIdentityHash])',
    );
    expect(consent).toMatch(/actionExecutionId\s+String\?/);
    expect(migration).toContain('ClientConsentFact is append-only');
    expect(migration).toContain('IF NEW."actionExecutionId" IS NOT NULL THEN');
  });

  it('separates operational work authority from inbox presentation', () => {
    const workItem = modelBlock('OperationalWorkItem');
    const inbox = modelBlock('InboxItem');

    expect(workItem).toContain(
      'fields: [createActionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(workItem).toContain(
      'fields: [completeActionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(workItem).toContain('@@unique([tenantId, createActionExecutionId])');
    expect(workItem).toContain(
      '@@unique([tenantId, completeActionExecutionId])',
    );
    expect(inbox).toMatch(/operationalWorkItemId\s+String\?/);
    expect(migration).toContain(
      'OperationalWorkItem allows one OPEN to COMPLETED transition',
    );
    expect(migration).toContain(
      'OperationalWorkItem is not physically deleted',
    );
  });

  it('makes destructive maintenance bounded, versioned and restart-safe', () => {
    const run = modelBlock('MaintenanceRun');
    const claim = modelBlock('MaintenanceItemClaim');

    expect(run).toMatch(/policyVersion\s+Int/);
    expect(run).toMatch(/maxItems\s+Int/);
    expect(run).toMatch(/batchSize\s+Int/);
    expect(run).toMatch(/actionExecutionId\s+String\?/);
    expect(claim).toContain(
      '@@unique([maintenanceRunId, itemKind, itemRefHash])',
    );
    expect(migration).toContain('"maxItems" BETWEEN 1 AND 10000');
    expect(migration).toContain(
      'MaintenanceRun identity, policy, limits and authority are immutable',
    );
    expect(migration).toContain(
      'MaintenanceItemClaim restart must advance exactly one generation',
    );
    expect(migration).toContain('Terminal MaintenanceItemClaim is immutable');
  });

  it('does not fabricate history or reopen Package 4 value ownership', () => {
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+"(?:ActionTargetMutation|OperationalWorkItem|ClientConsentFact|MaintenanceRun|MaintenanceItemClaim)"/i,
    );
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:LoyaltyAccount|LoyaltyTransaction|CustomerSubscription|GiftCertificate|ReferralReward|Expense|BillingPayment|TenantCatalogItemValueVersion)"/,
    );
    expect(migration).not.toMatch(
      /rawCredential|rawToken|rawSecret|providerPayload|phone|email/i,
    );
  });
});
