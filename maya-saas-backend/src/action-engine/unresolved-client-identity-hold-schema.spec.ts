import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260831110000_unresolved_client_identity_hold',
  'migration.sql',
);

describe('Cycle 06 Package 4 P4-03 unresolved identity hold foundation', () => {
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
  const hold = modelBlock('UnresolvedClientIdentityHold');

  it('represents only the approved tenant/provider collision hold', () => {
    expect(migration).toContain('CREATE TABLE "UnresolvedClientIdentityHold"');
    expect(hold).toMatch(/tenantId\s+String\n/);
    expect(hold).toMatch(/provider\s+String\n/);
    expect(hold).toMatch(/externalId\s+String\n/);
    expect(hold).toMatch(/unresolvedPrincipalCount\s+Int\n/);
    expect(hold).toMatch(
      /@@unique\(\[tenantId, provider, externalId\], map: "UnresolvedClientIdentityHold_tenant_provider_external_key"\)/,
    );
    expect(migration).toContain('"unresolvedPrincipalCount" >= 2');
  });

  it('stores an evidence digest rather than raw principal or loyalty data', () => {
    expect(hold).toMatch(/sourceNamespace\s+String\n/);
    expect(hold).toMatch(/sourceEvidenceHash\s+String\n/);
    expect(migration).toContain('"sourceEvidenceHash" ~ \'^[0-9a-f]{64}$\'');
    expect(hold).not.toMatch(
      /^\s*(?:phone|fullName|firstName|lastName|bearer|balance|points|ledger)\w*\s+/im,
    );
    expect(migration).not.toMatch(
      /"(?:phone|name|bearer|balance|points|ledger)[^"]*"/i,
    );
  });

  it('is tenant-qualified and resolves only through a tenant-qualified execution', () => {
    expect(hold).toContain(
      'fields: [resolutionActionExecutionId, tenantId], references: [id, tenantId]',
    );
    expect(migration).toContain('FOREIGN KEY ("tenantId")');
    expect(migration).toContain(
      'FOREIGN KEY ("resolutionActionExecutionId", "tenantId")',
    );
    expect(migration).toContain(
      'REFERENCES "ActionExecution"("id", "tenantId")',
    );
  });

  it('creates an active hold and permits only a one-way resolution', () => {
    expect(migration).toContain(
      'UnresolvedClientIdentityHold must be created active',
    );
    expect(migration).toContain(
      'UnresolvedClientIdentityHold resolution is one-way',
    );
    expect(migration).toContain(
      '("resolvedAt" IS NULL) = ("resolutionActionExecutionId" IS NULL)',
    );
  });

  it('keeps collision identity and evidence immutable', () => {
    for (const column of [
      'tenantId',
      'provider',
      'externalId',
      'reasonCode',
      'sourceNamespace',
      'sourceEvidenceHash',
      'unresolvedPrincipalCount',
      'createdAt',
    ]) {
      expect(migration).toContain(
        `NEW."${column}" IS DISTINCT FROM OLD."${column}"`,
      );
    }
    expect(migration).toContain(
      'Active UnresolvedClientIdentityHold cannot be deleted',
    );
  });

  it('uses the exact fail-closed reason without a generic workflow', () => {
    expect(migration).toContain(
      '"reasonCode" = \'loyalty_identity_unresolved\'',
    );
    expect(migration).not.toMatch(/status|assignee|workflow|payload/i);
  });

  it('contains no identity, loyalty, provider, or historical data writes', () => {
    expect(migration).not.toMatch(/\bINSERT INTO\b/);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[A-Za-z]+"?\s+SET\b/);
    expect(migration).not.toMatch(/\bDELETE FROM\b/);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:Client|CrmClientLink|LoyaltyAccount|LoyaltyTransaction)"/,
    );

    const createdTables = [
      ...migration.matchAll(/CREATE TABLE "([^"]+)"/g),
    ].map(([, name]) => name);
    expect(createdTables).toEqual(['UnresolvedClientIdentityHold']);
  });
});
