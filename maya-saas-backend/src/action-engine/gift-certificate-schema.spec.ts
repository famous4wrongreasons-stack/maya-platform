import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260830001000_gift_certificate',
  'migration.sql',
);

describe('Cycle 06 Package 4 gift certificate schema foundation', () => {
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
  const certificate = modelBlock('GiftCertificate');
  const redemption = modelBlock('GiftCertificateRedemption');

  it('separates one-to-one issuance from one-to-one redemption', () => {
    expect(certificate).toMatch(/issueExecutionId\s+String\?/);
    expect(certificate).toMatch(/@@unique\(\[issueExecutionId, tenantId\]\)/);
    expect(certificate).toMatch(/redemption\s+GiftCertificateRedemption\?/);
    expect(redemption).toMatch(/actionExecutionId\s+String\?/);
    expect(redemption).toMatch(/@@unique\(\[actionExecutionId, tenantId\]\)/);
  });

  it('makes certificate redemption an atomic one-time claim', () => {
    expect(redemption).toMatch(/@@unique\(\[certificateId, tenantId\]\)/);
    expect(migration).toContain(
      'CREATE TRIGGER "GiftCertificateRedemption_one_time_guard"',
    );
    expect(migration).toContain('FOR UPDATE;');
  });

  it('stores immutable nominal, subject, offer, expiry, and provider facts', () => {
    for (const field of [
      'issuanceIdentityHash',
      'recipientSubjectHash',
      'offerSnapshotHash',
      'nominalAmountKopecks',
      'currency',
      'providerPaymentRefHash',
      'expiresAt',
    ]) {
      expect(certificate).toContain(field);
    }
    expect(migration).toContain(
      'CREATE TRIGGER "GiftCertificate_immutable_facts_guard"',
    );
  });

  it('stores no raw bearer code or provider payment reference', () => {
    expect(certificate).toMatch(/codeHash\s+String/);
    expect(certificate).not.toMatch(/\n\s+code\s+String/);
    expect(certificate).not.toMatch(/providerPaymentRef\s+String/);
    expect(redemption).toMatch(/targetRefHash\s+String/);
    expect(redemption).not.toMatch(/\n\s+targetRef\s+String/);
  });

  it('uses tenant-qualified certificate and action relations', () => {
    expect(certificate).toContain(
      'fields: [issueExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(redemption).toContain(
      'fields: [certificateId, tenantId], references: [id, tenantId]',
    );
    expect(redemption).toContain(
      'fields: [actionExecutionId, tenantId], references: [id, tenantId]',
    );
  });

  it('keeps historical bindings nullable and performs no backfill', () => {
    for (const field of ['issueExecutionId', 'actionExecutionId']) {
      expect(migration).toContain(`"${field}" TEXT`);
      expect(migration).not.toContain(`"${field}" TEXT NOT NULL`);
    }
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
  });

  it('creates only the gift-certificate aggregate models', () => {
    const createdTables = [
      ...migration.matchAll(/CREATE TABLE "([^"]+)"/g),
    ].map(([, name]) => name);
    expect(createdTables).toEqual([
      'GiftCertificate',
      'GiftCertificateRedemption',
    ]);
    expect(migration).not.toMatch(
      /BillingPayment|CustomerSubscription|LoyaltyTransaction|ReferralReward/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "ActionExecution"/);
  });
});
