import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    root,
    'prisma/migrations/20260904170000_client_preferences_v1/migration.sql',
  ),
  'utf8',
);

describe('B5/B6 approved Client preference schema V1', () => {
  it('adds exactly three nullable choices with no default or historical backfill', () => {
    expect(
      [...migration.matchAll(/ADD COLUMN "(\w+)" (TEXT|JSONB)/g)].map(
        (x) => x[1],
      ),
    ).toEqual([
      'defaultVisitMood',
      'notificationPreferencesJson',
      'clientVisitMood',
    ]);
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|INSERT INTO|DELETE FROM|TRUNCATE|DROP COLUMN|SET DEFAULT)\b/,
    );
    expect(migration).not.toMatch(/^\s*UPDATE\s/m);
    const profile = schema.match(/^model CustomerProfile \{([\s\S]*?)^\}/m)![1];
    const appointment = schema.match(/^model Appointment \{([\s\S]*?)^\}/m)![1];
    expect(profile).toMatch(/^\s+defaultVisitMood\s+String\?\s*$/m);
    expect(profile).toMatch(/^\s+notificationPreferencesJson\s+Json\?\s*$/m);
    expect(appointment).toMatch(/^\s+clientVisitMood\s+String\?\s*$/m);
  });
  it('retains tenant-qualified Client ownership and separates legal consent', () => {
    expect(migration).toContain(
      'CustomerProfile_client_preference_owner_check',
    );
    expect(migration).toContain('"mayaClientId" IS NOT NULL');
    expect(migration).toContain(
      'NEW."mayaClientId" IS DISTINCT FROM OLD."mayaClientId"',
    );
    expect(migration).toContain(
      'NEW."tenantId" IS DISTINCT FROM OLD."tenantId"',
    );
    expect(migration).toContain('OLD."clientVisitMood" IS NOT NULL');
    expect(migration).not.toContain('ALTER TABLE "ClientConsentFact"');
    expect(migration).not.toContain('DROP CONSTRAINT');
  });
  it('pins exact version, explicit overrides, typed range and null-safe checks', () => {
    expect(migration).toContain("value->'version' IS DISTINCT FROM '1'::jsonb");
    expect(migration).toContain("overrides = '{}'::jsonb");
    expect(migration).toContain('NOT BETWEEN 1 AND 48');
    expect(migration).toContain('NOT BETWEEN 0 AND 23');
    expect(migration).toContain('ELSE RETURN FALSE;');
    expect(migration).toContain('IS TRUE');
  });
});
