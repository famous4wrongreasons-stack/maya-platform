import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATION_NAME = '20260903020000_enable_core_notifications';
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  MIGRATION_NAME,
  'migration.sql',
);
const BASELINE = join(ROOT, 'prisma', 'historical-migration-baseline.json');
const PRODUCTION_CHECKSUM =
  '6f94dfa6335f11dd61bf13a7514606a2efa65baccbdbe2a45942c7af0094bf6a';

describe('core notifications production migration provenance', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const historicalBaseline = readFileSync(BASELINE, 'utf8');

  it('preserves the exact production and source artifact checksum', () => {
    expect(createHash('sha256').update(sql).digest('hex')).toBe(
      PRODUCTION_CHECKSUM,
    );
  });

  it('keeps the recovered artifact in repository history, not the lost baseline', () => {
    expect(historicalBaseline).not.toContain(MIGRATION_NAME);
  });

  it('is a bounded entitlement upsert with no schema or destructive operation', () => {
    expect(sql).toContain('INSERT INTO "PlanEntitlement"');
    expect(sql).toContain("'notifications.core'");
    expect(sql).toContain(
      "WHERE plan.\"name\" IN ('solo', 'business', 'business_plus')",
    );
    expect(sql).toContain('ON CONFLICT ("planId", "featureKey") DO UPDATE');
    expect(sql).not.toMatch(/\b(?:ALTER|CREATE|DROP|TRUNCATE|DELETE)\b/i);
  });

  it('does not touch P4-09 offer lineage or ActionExecution', () => {
    expect(sql).not.toMatch(
      /TenantCatalogItem|ValueVersion|ReferralProgram|ActionExecution|supersedesOfferId/,
    );
  });
});
