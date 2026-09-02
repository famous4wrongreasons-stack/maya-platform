import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260902230000_p4_09_immutable_offer_value_version',
  'migration.sql',
);

describe('P4-09 immutable offer value version schema foundation', () => {
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

  const catalog = modelBlock('TenantCatalogItem');
  const offerVersion = modelBlock('TenantCatalogItemValueVersion');
  const referralProgram = modelBlock('ReferralProgram');
  const referralVersion = modelBlock('ReferralProgramValueVersion');
  const actionExecution = modelBlock('ActionExecution');

  it('keeps internal offer identity separate from externalRef', () => {
    expect(catalog).toMatch(/id\s+String\s+@id/);
    expect(catalog).toMatch(/externalRef\s+String\?/);
    expect(catalog).toMatch(/canonicalTemplateKey\s+String\?/);
    expect(offerVersion).toContain('offerId');
    expect(offerVersion).not.toContain('externalRef');
    expect(migration).toContain(
      "RAISE EXCEPTION 'Canonical offer internal identity, tenant, and kind are immutable'",
    );
    expect(migration).not.toMatch(
      /TenantCatalogItemValueVersion[\s\S]{0,800}externalRef/,
    );
  });

  it('adds append-only contiguous offer and referral value versions', () => {
    expect(offerVersion).toMatch(/previousVersionId\s+String\?/);
    expect(offerVersion).toMatch(/version\s+Int/);
    expect(offerVersion).toMatch(/valueSnapshotHash\s+String/);
    expect(referralVersion).toMatch(/previousVersionId\s+String\?/);
    expect(referralVersion).toMatch(/valueSnapshotHash\s+String/);
    expect(migration).toContain(
      'CREATE TRIGGER "TenantCatalogItemValueVersion_append_only_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ReferralProgramValueVersion_append_only_guard"',
    );
    expect(migration).toContain(
      'previous_row."version" + 1 IS DISTINCT FROM NEW."version"',
    );
  });

  it('binds every version to one exact tenant-qualified ActionExecution', () => {
    expect(offerVersion).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(referralVersion).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(actionExecution).toMatch(
      /tenantCatalogItemValueVersion\s+TenantCatalogItemValueVersion\?/,
    );
    expect(actionExecution).toMatch(
      /referralProgramValueVersion\s+ReferralProgramValueVersion\?/,
    );
    expect(migration).toContain(
      'CREATE FUNCTION "p409_require_owner_approved_execution"',
    );
    expect(migration).toContain(
      'execution_row."approvalDecision"::TEXT <> \'APPROVED\'',
    );
    expect(migration).toContain(
      "\"role\"::TEXT IN ('tenant_owner', 'business_owner')",
    );
  });

  it('requires the version and current projection to commit atomically', () => {
    expect(catalog).toMatch(/currentValueVersionId\s+String\?/);
    expect(referralProgram).toMatch(/currentValueVersionId\s+String\?/);
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "TenantCatalogItemValueVersion_current_guard"',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "ReferralProgramValueVersion_current_guard"',
    );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain(
      "RAISE EXCEPTION 'Canonical offer current pointer may advance only to its direct successor'",
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'Referral policy current pointer may advance only to its direct successor'",
    );
  });

  it('enforces approved one-target monetary and referral caps', () => {
    expect(migration).toContain(
      '"offerKind" = \'membership\'\n        AND "priceKopecks" <= 600000',
    );
    expect(migration).toContain(
      '"offerKind" = \'certificate\'\n        AND "priceKopecks" <= 500000',
    );
    expect(migration).toContain('"inviterRewardKopecks" BETWEEN 1 AND 50000');
    expect(migration).toContain(
      '"inviteeRewardLiabilityCapKopecks" BETWEEN 1 AND 50000',
    );
    expect(migration).toContain(') <= 100000');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TenantCatalogItemValueVersion_actionExecutionId_tenantId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ReferralProgramValueVersion_actionExecutionId_tenantId_key"',
    );
  });

  it('preserves historical compatibility without invented versions', () => {
    expect(migration).toContain('ADD COLUMN "canonicalTemplateKey" TEXT');
    expect(migration).toContain('ADD COLUMN "currentValueVersionId" TEXT');
    expect(migration).not.toMatch(
      /UPDATE\s+"(?:TenantCatalogItem|ReferralProgram)"\s+SET/i,
    );
    expect(migration).not.toMatch(
      /INSERT\s+INTO\s+"(?:TenantCatalogItemValueVersion|ReferralProgramValueVersion)"/i,
    );
  });

  it('does not mutate issued or frozen Package 4 value tables', () => {
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:CustomerSubscription|GiftCertificate|ReferralReward|ReferralRewardIssuance|LoyaltyAccount|LoyaltyTransaction|BillingPayment|Expense)"/,
    );
    expect(migration).not.toMatch(/kopecksPerPoint|pointsPerKopeck/i);
    expect(migration).not.toMatch(/provider|checkout|payment/i);
  });

  it('keeps runtime, Shadow, and provider execution outside the foundation', () => {
    expect(migration).not.toMatch(/CREATE EXTENSION|dblink|http_|net\./i);
    expect(migration).not.toMatch(/ActionAttempt/);
    expect(migration).not.toMatch(/UNKNOWN|providerReference/i);
  });
});
