import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(__dirname, '../../..');
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(repo, relativePath), 'utf8');

describe('I-MIG2 migration-2 fold', () => {
  const schema = read('maya-saas-backend/prisma/schema.prisma');
  const migration = read(
    'maya-saas-backend/prisma/migrations/20260916120100_widget_layer_runtime/migration.sql',
  );
  const fixture = read(
    'maya-saas-backend/test/widgets-live/support/fixtures.ts',
  );

  it('MIG-1/MIG-2 keeps the frozen additive envelope and exact new constraints', () => {
    const widgetModels = schema.match(/^model Widget\w+\s*\{/gm) ?? [];
    const widgetChecks = migration.match(/_check" CHECK/g) ?? [];
    const widgetFks = migration.match(/FOREIGN KEY/g) ?? [];

    expect(widgetModels).toHaveLength(14);
    // Migration 1 owns five registry checks; this folded runtime migration owns the other 34.
    expect(widgetChecks).toHaveLength(34);
    expect(widgetFks).toHaveLength(18);
    expect(migration).toContain(
      "\"confirmationSubject\" IN ('create', 'reschedule', 'cancel')",
    );
    expect(migration).toContain(
      "\"approvalDecision\" IN ('approve', 'reject')",
    );
    expect(migration).toContain('"refusalCode" IN (\'intent_divergence\')');
    expect(migration).toContain(
      '("resolvedIntentTokenHash" IS NULL) = ("resolvedEffect" IS NULL)',
    );
    expect(migration).not.toMatch(/(?:ALTER|CREATE) TABLE "(?!Widget)/);
    expect(migration).not.toMatch(/\b(?:DROP|RENAME)\b/);
  });

  it('MIG-3 classifies every new field as AUDIT_RETAINED', () => {
    const model = schema.slice(
      schema.indexOf('model WidgetIntentDivergenceAudit {'),
      schema.indexOf(
        '\n}',
        schema.indexOf('model WidgetIntentDivergenceAudit {'),
      ),
    );
    const physical = model
      .split('\n')
      .filter(
        (line) => /^\s{2}\w+\s+\S/.test(line) && !line.includes('@relation'),
      );

    expect(physical).toHaveLength(8);
    expect(physical.every((line) => /\/\/ A(?:\s|$)/.test(line))).toBe(true);
  });

  it('MIG-4 retains exactly two widget migrations in the 98-migration programme', () => {
    const dirs = fs
      .readdirSync(path.join(repo, 'maya-saas-backend/prisma/migrations'), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(dirs).toHaveLength(98);
    expect(dirs.filter((name) => name.includes('widget_layer'))).toEqual([
      '20260916120000_widget_layer_ledgers',
      '20260916120100_widget_layer_runtime',
    ]);
  });

  it('MIG-6 makes only the three approved content columns nullable', () => {
    expect(migration).toContain('"composedEnvelopeJson" JSONB,');
    expect(migration).toContain('"emittedEnvelopeJson" JSONB,');
    expect(migration).toContain('"diffJson" JSONB,');
    expect(migration).not.toContain('"composedEnvelopeJson" JSONB NOT NULL');
    expect(migration).not.toContain('"emittedEnvelopeJson" JSONB NOT NULL');
    expect(migration).not.toContain('"diffJson" JSONB NOT NULL');
  });

  it('MIG-7 deletes divergence rows before their RESTRICT parent', () => {
    const child = fixture.indexOf('widgetIntentDivergenceAudit.deleteMany');
    const parent = fixture.indexOf('widgetIntentRecord.deleteMany');

    expect(child).toBeGreaterThan(-1);
    expect(parent).toBeGreaterThan(child);
  });
});
