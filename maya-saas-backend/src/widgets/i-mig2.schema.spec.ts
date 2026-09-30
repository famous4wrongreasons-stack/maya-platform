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
    // Migration 1 owns five registry checks; the runtime migration owns 34 base checks plus the
    // owner-approved, tightly scoped journal-date check.
    expect(widgetChecks).toHaveLength(35);
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

  it('MIG-4 retains the baseline migrations plus exact approved SB-1 JSON V2 and NS-1 CHECK extensions', () => {
    const dirs = fs
      .readdirSync(path.join(repo, 'maya-saas-backend/prisma/migrations'), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const successor = '20260929190000_client_link_challenge_json_v2';
    expect(dirs.filter((name) => name === successor)).toEqual([successor]);
    const navigation = '20260930120000_journal_detail_retained_date';
    expect(dirs.filter((name) => name === navigation)).toEqual([navigation]);
    expect(
      dirs.filter((name) => name !== successor && name !== navigation),
    ).toHaveLength(99);
    const nav = read(
      `maya-saas-backend/prisma/migrations/${navigation}/migration.sql`,
    );
    expect(nav).not.toMatch(/CREATE TABLE|ADD COLUMN|DROP TABLE|DROP COLUMN/);
    expect(nav.match(/ALTER TABLE/g)).toHaveLength(2);
    expect(nav).toContain('WidgetIntentRecord_journal_date_scope_check');
    expect(nav).toContain('fs.calendar');
    expect(nav).toContain('operations.journal.read');
    const extension = read(
      `maya-saas-backend/prisma/migrations/${successor}/migration.sql`,
    );
    expect(extension).not.toMatch(
      /CREATE TABLE|ADD COLUMN|(?:ALTER|CREATE) TABLE "Widget/,
    );
    expect(dirs.filter((name) => name.includes('widget_layer'))).toEqual([
      '20260916120000_widget_layer_ledgers',
      '20260916120100_widget_layer_runtime',
      '20260925150000_widget_layer_source_capability',
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
