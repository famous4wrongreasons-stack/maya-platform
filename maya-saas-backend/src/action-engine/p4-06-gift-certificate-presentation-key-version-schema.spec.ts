import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260902150000_gift_certificate_presentation_key_version',
  'migration.sql',
);
const FOUNDATION_MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260830001000_gift_certificate',
  'migration.sql',
);

describe('P4-06 gift certificate presentation key version foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  const foundation = readFileSync(FOUNDATION_MIGRATION, 'utf8');
  const modelBlock = (name: string) => {
    const start = schema.indexOf(`model ${name} {`);
    const block = schema.slice(start);
    const end = block.indexOf('\n}');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThanOrEqual(0);
    return block.slice(0, end + 2);
  };

  const certificate = modelBlock('GiftCertificate');

  it('adds only a nullable non-secret presentation key version', () => {
    expect(certificate).toMatch(/presentationKeyVersion\s+String\?/);
    expect(migration).toContain('ADD COLUMN "presentationKeyVersion" TEXT');
    expect(migration).not.toContain(
      'ADD COLUMN "presentationKeyVersion" TEXT NOT NULL',
    );
    expect(migration).toContain(
      'CONSTRAINT "GiftCertificate_presentation_key_version_check"',
    );
    expect(certificate).not.toMatch(
      /\n\s+(?:rawCode|bearer|secret|keyMaterial)\s/,
    );
    expect(migration).not.toMatch(
      /ADD COLUMN "(?:rawCode|bearer|secret|keyMaterial)"/i,
    );
  });

  it('requires a version only for new canonical issuance', () => {
    expect(migration).toContain(
      'CREATE TRIGGER "GiftCertificate_presentation_version_insert_guard"',
    );
    expect(migration).toContain('NEW."issueExecutionId" IS NOT NULL');
    expect(migration).toContain('NEW."presentationKeyVersion" IS NULL');
  });

  it('allows historical null and performs no fake backfill', () => {
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"GiftCertificate"\s+SET\b/);
    expect(migration).not.toMatch(/DEFAULT\s+['"][^'"]+['"]/);
  });

  it('makes an established version immutable while allowing one historical establishment', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION "guard_gift_certificate_immutable_facts"',
    );
    expect(migration).toContain('OLD."presentationKeyVersion" IS NOT NULL');
    expect(migration).toContain(
      'NEW."presentationKeyVersion" IS DISTINCT FROM OLD."presentationKeyVersion"',
    );
    expect(migration).not.toMatch(
      /DROP TRIGGER "GiftCertificate_immutable_facts_guard"/,
    );
  });

  it('preserves tenant-qualified issuance and redemption bindings', () => {
    expect(certificate).toContain(
      'fields: [issueExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(foundation).toContain(
      'FOREIGN KEY ("issueExecutionId", "tenantId")',
    );
    expect(foundation).toContain('FOREIGN KEY ("certificateId", "tenantId")');
  });

  it('keeps restart convergence on existing issuance claims', () => {
    expect(certificate).toMatch(
      /@@unique\(\[tenantId, issuanceIdentityHash\]\)/,
    );
    expect(certificate).toMatch(/@@unique\(\[issueExecutionId, tenantId\]\)/);
    expect(certificate).toMatch(/@@unique\(\[tenantId, codeHash\]\)/);
    expect(migration).not.toMatch(/CREATE TABLE/);
  });

  it('does not change runtime or any other value domain', () => {
    const alteredTables = [...migration.matchAll(/ALTER TABLE "([^"]+)"/g)].map(
      ([, name]) => name,
    );
    expect(new Set(alteredTables)).toEqual(new Set(['GiftCertificate']));
    expect(migration).not.toMatch(
      /LoyaltyAccount|LoyaltyTransaction|CustomerSubscription|ReferralReward|BillingPayment/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
