/**
 * P01 permanent retention ratchet (mapping §12–13).
 * Structural proof that the C9 derived aggregate expires on its own clock,
 * never renews, never reaches a source owner and is only removable through the
 * one approved AC6 class. Database behaviour is proved separately by
 * `scripts/chapter9-foundation-proof.ts` against the owned synthetic cluster.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { C9_DAY, C9_RETENTION } from './c9.contract';
import {
  C9_RETENTION_CLASSES,
  C9_RETENTION_KINDS,
  isC9RetentionClass,
} from '../package5-wave6/chapter9-orchestration-retention';

const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
  ),
  'utf8',
);
const leaf = readFileSync(
  join(__dirname, '../package5-wave6/chapter9-orchestration-retention.ts'),
  'utf8',
);

describe('c9 retention', () => {
  test('derived root retention is exactly 365 days and is fixed at first admission', () => {
    expect(C9_RETENTION).toBe(365 * C9_DAY);
    expect(migration).toContain(
      '"retentionUntil"="admittedAt"+interval \'365 days\'',
    );
    // Nonrenewing is enforced by the database itself: each guard compares OLD/NEW
    // minus an explicit mutable allowlist, and no allowlist contains a deadline.
    const allowlists = [
      ...migration.matchAll(/to_jsonb\(OLD\)-ARRAY\[([^\]]*)\]::text\[\]/g),
    ].map((m) => m[1]);
    expect(allowlists).toHaveLength(5);
    for (const list of allowlists)
      for (const frozen of ['retentionUntil', 'validUntil', 'admittedAt'])
        expect(list).not.toContain(frozen);
  });

  test('validity never exceeds 24h and never outlives its own retention', () => {
    expect(migration).toContain(
      '"validUntil"<="admittedAt"+interval \'24 hours\'',
    );
    for (const model of ['C9StrategyRevision', 'C9PlanStep'])
      expect(migration).toContain(
        `CONSTRAINT "${model}_time_ck" CHECK (("admittedAt"<"validUntil" AND "validUntil"<="retentionUntil" ) IS TRUE)`,
      );
    expect(migration).toContain(
      '("boundAt"<"retentionUntil" AND ("validUntil" IS NULL OR "validUntil"<="retentionUntil")) IS TRUE',
    );
  });

  test('coordination writers never carry a deadline into an update', () => {
    for (const file of ['c9.store.ts', 'c9.work.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      for (const block of source.matchAll(/\.update\(\{([\s\S]{0,900}?)\}\);/g))
        for (const frozen of ['retentionUntil', 'validUntil', 'admittedAt'])
          expect(block[1]).not.toContain(frozen + ':');
    }
  });

  test('a child can never claim a longer life than its root', () => {
    expect(migration).toContain(
      'r."validUntil">root."validUntil" OR r."retentionUntil">root."retentionUntil"',
    );
  });

  test('one approved AC6 class owns the aggregate and nothing else', () => {
    expect(Object.keys(C9_RETENTION_CLASSES)).toEqual([
      'expire_c9_orchestration_runs',
    ]);
    expect(C9_RETENTION_CLASSES.expire_c9_orchestration_runs.policyKey).toBe(
      'chapter9.orchestration-retention',
    );
    expect(isC9RetentionClass('expire_c9_orchestration_runs')).toBe(true);
    expect(isC9RetentionClass('expire_anything_else')).toBe(false);
    expect(migration).toContain("'expire_c9_orchestration_runs'");
    expect(migration).toContain("'chapter9.orchestration-retention'");
  });

  test('deletion order runs leaves first and the request root last', () => {
    expect([...C9_RETENTION_KINDS]).toEqual([
      'C9WorkReceipt',
      'C9StepBinding',
      'C9PlanStep',
      'C9StrategyRevision',
      'C9Run',
    ]);
    // Every C9 relation restricts; nothing disappears through a cascade.
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(11);
    expect(migration).not.toMatch(/ON DELETE CASCADE|ON UPDATE CASCADE/);
  });

  test('purge is scoped, idempotent by identity and needs an exact claim', () => {
    expect(leaf).toContain("throw new Error('c9_exact_retention_scope')");
    // The delete matches the exact claimed row, its deadline, cutoff and digest,
    // so a retried maintenance pass cannot widen into another row.
    for (const guard of [
      'id=${row.id}::uuid',
      '"tenantId"=${plan.tenantId}',
      '"retentionUntil"=${row.expiresAt}',
      '"retentionUntil"<${plan.cutoffAt}',
    ])
      expect(leaf).toContain(guard);
    expect(migration).toContain('c9_exact_ac6_claim_required');
    expect(migration).toContain('"C9_retention_claim"');
  });

  test('purged evidence stops the root instead of reviving reasoning', () => {
    expect(leaf).toContain('UPDATE "C9Run" SET state=\'STOPPED\'');
  });

  test('retention never touches a source owner', () => {
    // The only tables the leaf writes are the five C9 derived tables.
    const written = new Set(
      [
        ...leaf.matchAll(
          /(?:UPDATE|DELETE FROM|INSERT INTO)\s+"([A-Za-z0-9]+)"/g,
        ),
      ].map((m) => m[1]),
    );
    for (const table of written)
      expect(C9_RETENTION_KINDS as readonly string[]).toContain(table);
    expect(leaf).not.toMatch(
      /"(Client|Appointment|ActionExecution|AiToolExecution|MarketingCampaign|CommunicationDelivery|MeasurementRevision|C8ResultRevision|AuditLog)"/,
    );
  });
});
