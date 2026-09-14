import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_HABITS_POLICY } from './client-habits.policy';
const root = join(__dirname, '../..');
const migration = readFileSync(
  join(root, 'prisma/migrations/20260904193000_client_habits_v1/migration.sql'),
  'utf8',
);
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
describe('B7 exact approved schema and limits', () => {
  it('adds only the nullable Client habit field without backfill or a new model', () => {
    expect(
      [...migration.matchAll(/ADD COLUMN "(\w+)" TEXT/g)].map((x) => x[1]),
    ).toEqual(['encryptedClientPreferences']);
    expect(schema.match(/^model CustomerProfile \{([\s\S]*?)^\}/m)![1]).toMatch(
      /^\s+encryptedClientPreferences\s+String\?\s*$/m,
    );
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|INSERT INTO|DELETE FROM|TRUNCATE|DROP COLUMN|SET DEFAULT)\b|^\s*UPDATE\s/m,
    );
  });
  it('enforces Client ownership and exact ciphertext byte ceiling', () => {
    expect(migration).toContain('"clientId" IS NOT NULL');
    expect(migration).toContain(
      'octet_length("encryptedClientPreferences") BETWEEN 41 AND 10963',
    );
    expect(migration).not.toContain('DROP CONSTRAINT');
  });
  it('pins all owner-approved V1 limits together', () => {
    expect(CLIENT_HABITS_POLICY).toEqual({
      version: 1,
      maxEntries: 12,
      maxEntryCodePoints: 200,
      maxPlaintextBytes: 8192,
      maxPersistedBytes: 10963,
    });
    expect(Object.isFrozen(CLIENT_HABITS_POLICY)).toBe(true);
  });
});
