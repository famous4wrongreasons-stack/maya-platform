import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    root,
    'prisma/migrations/20260904230000_client_wanted_slot_v1/migration.sql',
  ),
  'utf8',
);

describe('B9 approved wanted-slot schema V1', () => {
  it('adds exactly one Client-owned model with no backfill', () => {
    expect(
      [...migration.matchAll(/CREATE TABLE "(\w+)"/g)].map((x) => x[1]),
    ).toEqual(['ClientWantedSlotInterest']);
    expect(migration).not.toMatch(
      /\b(?:INSERT INTO|TRUNCATE|DROP TABLE)\b|^\s*UPDATE\s/m,
    );
    const model = schema.match(
      /^model ClientWantedSlotInterest \{[\s\S]*?^\}/m,
    )?.[0];
    expect(model).toBeDefined();
    expect(model).toContain('clientId');
    expect(model).toContain('sourceChannelLinkId');
    expect(model).toContain('createdByActionExecutionId');
    expect(model).not.toMatch(/chatId|phone|providerExternalId/);
  });

  it('pins exact time, server expiry, active cap, ordering and fan-out', () => {
    expect(migration).toContain('NEW."expiresAt" := NEW."desiredStartAt"');
    expect(migration).toContain('NEW."matchToleranceMinutes" := 0');
    expect(migration).toContain('active_count >= 10');
    expect(migration).toContain('CLIENT_WANTED_SLOT_LIMIT_EXCEEDED');
    expect(migration).toContain(
      'Wanted slot matching must use earliest eligible ordering',
    );
    expect(migration).toContain('WANTED_SLOT_MATCH_FAN_OUT_EXCEEDED');
    expect(migration).toContain('>= 3');
  });

  it('protects tenant relations, history, lifecycle and physical deletion', () => {
    for (const target of [
      'Client',
      'Branch',
      'Staff',
      'ClientChannelLink',
      'ActionExecution',
    ])
      expect(migration).toContain(`REFERENCES "${target}"`);
    expect(migration).toContain(
      'Wanted slot historical request facts are immutable',
    );
    expect(migration).toContain('Invalid wanted slot lifecycle transition');
    expect(migration).toContain(
      'ClientWantedSlotInterest cannot be physically deleted',
    );
    expect(migration).toContain("status\" = 'ACTIVE'");
  });
});
