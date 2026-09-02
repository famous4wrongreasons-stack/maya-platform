import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260903010000_p4_09_offer_replacement_lineage',
  'migration.sql',
);

describe('P4-09 offer replacement lineage schema foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  const catalogStart = schema.indexOf('model TenantCatalogItem {');
  const catalogTail = schema.slice(catalogStart);
  const catalog = catalogTail.slice(0, catalogTail.indexOf('\n}') + 2);

  it('adds one immutable tenant-qualified predecessor identity', () => {
    expect(catalog).toMatch(/supersedesOfferId\s+String\?/);
    expect(catalog).toContain(
      '@relation("TenantCatalogItemReplacementLineage", fields: [supersedesOfferId, tenantId], references: [id, tenantId]',
    );
    expect(catalog).toContain('@@unique([supersedesOfferId, tenantId])');
    expect(migration).toContain(
      'CREATE TRIGGER "TenantCatalogItem_lineage_immutable_guard"',
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'Established canonical offer replacement lineage is immutable'",
    );
  });

  it('replaces unconditional template uniqueness with one-live-authority guards', () => {
    expect(catalog).not.toContain(
      '@@unique([tenantId, kind, canonicalTemplateKey])',
    );
    expect(catalog).toContain(
      '@@index([tenantId, kind, canonicalTemplateKey], map: "TenantCatalogItem_tenant_kind_template_idx")',
    );
    expect(migration).toContain(
      'DROP INDEX "TenantCatalogItem_tenantId_kind_canonicalTemplateKey_key"',
    );
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "TenantCatalogItem_replacement_lineage_guard"',
    );
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('version."availabilityState" <> \'RETIRED\'');
    expect(migration).toContain(
      "RAISE EXCEPTION 'Only one non-retired canonical authority may own a tenant offer template'",
    );
  });

  it('serializes first identity and replacement creation by exact template', () => {
    expect(migration).toContain("|| ':p4-09:offer-template:'");
    expect(migration).toContain('|| NEW."offerKind"');
    expect(migration).toContain('|| NEW."templateKey"');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "TenantCatalogItem_supersedesOfferId_tenantId_key"',
    );
  });

  it('requires an exact retired predecessor and starts a new version chain', () => {
    expect(migration).toContain(
      "RAISE EXCEPTION 'Replacement predecessor must be durably retired'",
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'Replacement lineage predecessor is incompatible'",
    );
    expect(migration).toContain(
      "RAISE EXCEPTION 'Replacement internal identity must start a new version chain'",
    );
    expect(migration).toContain('AND "version" = 1');
    expect(migration).toContain('AND "previousVersionId" IS NULL');
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "TenantCatalogItemValueVersion_live_authority_guard"',
    );
  });

  it('keeps external aliases outside canonical identity and lineage', () => {
    expect(catalog).toMatch(/externalRef\s+String\?/);
    expect(migration).not.toMatch(/externalRef/);
    expect(migration).not.toMatch(/provider|checkout|payment/i);
  });

  it('performs no historical backfill or issued-value rewrite', () => {
    expect(migration).not.toMatch(/UPDATE\s+"TenantCatalogItem"\s+SET/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"TenantCatalogItem"/i);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:CustomerSubscription|GiftCertificate|ReferralReward|ReferralRewardIssuance|LoyaltyAccount|LoyaltyTransaction|BillingPayment|Expense)"/,
    );
  });
});
