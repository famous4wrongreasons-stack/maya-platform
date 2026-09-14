import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260831130000_client_owned_loyalty_account',
  'migration.sql',
);

describe('Cycle 06 Package 4 P4-03 client-owned loyalty-account foundation', () => {
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
  const loyaltyAccount = modelBlock('LoyaltyAccount');
  const client = modelBlock('Client');

  it('makes tenant plus Client the optional transition-time ownership binding', () => {
    expect(loyaltyAccount).toMatch(/clientId\s+String\?/);
    expect(loyaltyAccount).toMatch(/userId\s+String\?/);
    expect(loyaltyAccount).toContain(
      '@relation(fields: [clientId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)',
    );
    expect(loyaltyAccount).toContain('@@unique([tenantId, clientId])');
    expect(client).toMatch(/loyaltyAccounts\s+LoyaltyAccount\[\]/);
  });

  it('supports a guest account without manufacturing User or Membership', () => {
    expect(loyaltyAccount).toMatch(/user\s+User\?/);
    expect(loyaltyAccount).toMatch(/membership\s+Membership\?/);
    expect(loyaltyAccount).toMatch(/balance\s+Int\s+@default\(0\)/);
    expect(migration).toContain('ALTER COLUMN "userId" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN "clientId" TEXT');
  });

  it('rejects cross-tenant ownership and duplicate accounts per Client', () => {
    expect(migration).toContain('FOREIGN KEY ("clientId", "tenantId")');
    expect(migration).toContain('REFERENCES "Client"("id", "tenantId")');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE RESTRICT');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "LoyaltyAccount_tenantId_clientId_key"',
    );
  });

  it('permits only the initial historical NULL to exact Client transition', () => {
    expect(migration).toContain(
      'CREATE FUNCTION "guard_loyalty_account_client_binding"()',
    );
    expect(migration).toContain('OLD."clientId" IS NOT NULL');
    expect(migration).toContain(
      'NEW."clientId" IS DISTINCT FROM OLD."clientId"',
    );
    expect(migration).toContain(
      'NEW."tenantId" IS DISTINCT FROM OLD."tenantId"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "LoyaltyAccount_client_binding_guard"',
    );
  });

  it('preserves the existing control account and historical value untouched', () => {
    expect(loyaltyAccount).toContain('@@unique([userId, tenantId])');
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bDELETE FROM\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(/ALTER COLUMN "balance"|SET DEFAULT/);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:LoyaltyTransaction|UnresolvedClientIdentityHold|Client|CrmClientLink)"/,
    );
  });

  it('does not create accounts, fake identities, ledger rows, or value workflows', () => {
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|TRUNCATE|ActionExecution|LoyaltyTransaction|CrmClientLink|AuthIdentity)\b/,
    );
    expect(migration).not.toMatch(/balance\s*=|delta|points|grant|redemption/i);
  });
});
