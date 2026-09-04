import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    ROOT,
    'prisma/migrations/20260905010000_client_channel_delivery_address_v1/migration.sql',
  ),
  'utf8',
);

describe('B9 verified Client delivery endpoint Option A ratchet', () => {
  it('adds one nullable encrypted field and no model or historical backfill', () => {
    const model = schema.match(/^model ClientChannelLink \{[\s\S]*?^\}/m)?.[0];
    expect(model).toContain('deliveryAddressEncrypted String?');
    expect(migration).not.toMatch(/^CREATE TABLE /m);
    expect(migration).not.toMatch(
      /^\s*(?:INSERT INTO|UPDATE "ClientChannelLink"|DELETE FROM|TRUNCATE )/m,
    );
    expect(migration).toContain('ADD COLUMN "deliveryAddressEncrypted" TEXT');
  });

  it('never adds plaintext address or a parallel identity authority', () => {
    expect(schema).not.toMatch(
      /deliveryAddressPlain|telegramChatId|providerSubjectEncrypted/,
    );
    expect(migration).not.toMatch(/chat_id|phone|telephone/i);
    expect(migration).toContain('verified_delivery_hash');
    expect(migration).toContain('OLD."providerSubjectHash"');
  });

  it('keeps original evidence immutable and permits endpoint rotation only for a matching active link', () => {
    expect(migration).toContain(
      "current_setting('maya.client_channel_delivery_subject_hash', true)",
    );
    expect(migration).toContain('OLD."revokedAt" IS NOT NULL');
    expect(migration).toContain('NEW."deliveryAddressEncrypted" IS NULL');
    expect(migration).toContain('original evidence is immutable');
  });
});
