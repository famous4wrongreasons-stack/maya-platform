import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(__dirname, '../../..');
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(repo, relativePath), 'utf8');

describe('I-MIG3 Contract V1.2 source-capability evidence', () => {
  const schema = read('maya-saas-backend/prisma/schema.prisma');
  const migration = read(
    'maya-saas-backend/prisma/migrations/20260925150000_widget_layer_source_capability/migration.sql',
  );

  it('adds exactly the approved nullable audit fields', () => {
    expect(schema).toMatch(/sourceCapabilitySpace\s+String\?\s+\/\/ A/);
    expect(schema).toMatch(/sourceCapabilityKey\s+String\?\s+\/\/ A/);
    expect(migration.match(/ADD COLUMN/g)).toHaveLength(2);
    expect(migration).toContain('ADD COLUMN "sourceCapabilitySpace" TEXT');
    expect(migration).toContain('ADD COLUMN "sourceCapabilityKey" TEXT');
  });

  it('is additive, prospective and touches only WidgetIntentRecord', () => {
    expect(migration).toMatch(/^ALTER TABLE "WidgetIntentRecord"/m);
    expect(migration).not.toMatch(
      /(?:INSERT|UPDATE|DELETE|DROP|RENAME|TRUNCATE)\b/,
    );
    expect(migration).not.toMatch(/ALTER TABLE "(?!WidgetIntentRecord")/);
    expect(migration).not.toMatch(/CREATE TABLE/);
  });

  it('enforces pair, C9 value and exact NAVIGATE detail/w scope', () => {
    expect(migration).toContain(
      '("sourceCapabilitySpace" IS NULL) = ("sourceCapabilityKey" IS NULL)',
    );
    expect(migration).toContain('"sourceCapabilitySpace" = \'C9\'');
    expect(migration).toContain(
      '("sourceCapabilitySpace" IS NOT NULL) = COALESCE(',
    );
    expect(migration).toContain('"effect" = \'NAVIGATE\'');
    expect(migration).toContain(
      "(\"targetJson\" ->> 'class') IN ('detail', 'w')",
    );
  });

  it('does not add a business FK, model, index or backfill mechanism', () => {
    expect(migration).not.toMatch(
      /FOREIGN KEY|CREATE INDEX|CREATE UNIQUE INDEX/,
    );
    expect(schema.match(/^model Widget\w+\s*\{/gm)).toHaveLength(14);
  });
});
