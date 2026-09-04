import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    ROOT,
    'prisma/migrations/20260904090000_a18_client_channel_link_v1/migration.sql',
  ),
  'utf8',
);
function writes(source: string) {
  return (
    /\.clientChannelLink\.(?:create|createMany|upsert|update|updateMany|delete|deleteMany)\s*\(/.test(
      source,
    ) ||
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?ClientChannelLink/i.test(
      source,
    )
  );
}
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
describe('A18 approved single-model ClientChannelLink foundation ratchet', () => {
  it('adds exactly one relation model, without User or transient-auth ownership', () => {
    expect(migration.match(/^CREATE TABLE /gm)).toHaveLength(1);
    const model = schema.match(/^model ClientChannelLink \{[\s\S]*?^\}/m)?.[0];
    expect(model).toBeDefined();
    expect(model).not.toMatch(
      /\b(?:User|Membership|AuthSession|AuthFlowState|PhoneAuthCode)\??\s+@relation/,
    );
    expect(model).toContain(
      'fields: [clientId, tenantId], references: [id, tenantId], onDelete: Restrict',
    );
    expect(migration).not.toMatch(
      /^\s*(?:INSERT INTO|UPDATE "|DELETE FROM|TRUNCATE )/m,
    );
  });
  it('retains active identity uniqueness, tenant identity FK and immutable guarded history', () => {
    expect(migration).toContain('"ClientChannelLink_active_subject_key"');
    expect(migration).toContain('WHERE "revokedAt" IS NULL');
    expect(migration).toContain(
      'FOREIGN KEY ("supersedesLinkId", "tenantId", "provider", "providerSubjectHash")',
    );
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE');
    expect(migration).toContain('historical evidence cannot be deleted');
    expect(migration).toContain(
      '"ClientChannelLink_verification_identity_key"',
    );
    expect(migration).toContain(') IS TRUE)');
  });
  it('allows production writes only in the verifier-bound canonical link service', () => {
    const owners = files(join(ROOT, 'src'))
      .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
      .filter((path) => writes(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path));
    expect(owners).toEqual(['src/crm/client-channel-link.service.ts']);
    const writer = readFileSync(join(ROOT, owners[0]), 'utf8');
    expect(writer).toContain(
      'this.verifier.verifyLink(this.proofToken(request))',
    );
    expect(writer).not.toMatch(/\.client\.(?:create|upsert)\s*\(/);
    expect(writer).not.toContain('phoneHash');
  });
  it.each([
    'db.clientChannelLink.create({data: forged})',
    'tx.clientChannelLink.update({data: {clientId: other}})',
    'INSERT INTO "ClientChannelLink" VALUES (forged)',
    'DELETE FROM "ClientChannelLink"',
  ])('detects direct alternate mutation %s', (source) =>
    expect(writes(source)).toBe(true),
  );
  it('does not extend A30 deletion allowlist or overload account identity', () => {
    const policy = readFileSync(
      join(ROOT, 'src/package5-wave6/package5-wave6.policy.ts'),
      'utf8',
    );
    expect(policy).not.toContain('ClientChannelLink');
    const identity = schema.match(/^model AuthIdentity \{[\s\S]*?^\}/m)?.[0];
    expect(identity).toMatch(/userId\s+String\s/);
    expect(identity).not.toContain('clientId');
  });
});
