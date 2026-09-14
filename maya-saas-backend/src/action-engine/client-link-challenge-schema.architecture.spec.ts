import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { CLIENT_LINK_CHALLENGE_POLICY } from '../crm/client-link-challenge.policy';

const root = join(__dirname, '..', '..');
const migration = readFileSync(
  join(
    root,
    'prisma/migrations/20260904100000_a18_client_link_challenge_v1/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const writes = (source: string) =>
  /\.clientLinkChallenge\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(
    source,
  ) ||
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?ClientLinkChallenge/i.test(
    source,
  );

describe('A18 ClientLinkChallenge approved schema/policy boundary', () => {
  it('adds exactly the approved 14 scalar fields and no business backfill', () => {
    const model = schema.match(
      /^model ClientLinkChallenge \{([\s\S]*?)^\}/m,
    )![1];
    const fields = [
      ...model.matchAll(/^\s+(\w+)\s+(?:String|Int|DateTime|Json)\??\s/gm),
    ].map((x) => x[1]);
    expect(fields).toEqual([
      'id',
      'tenantId',
      'clientId',
      'tokenHash',
      'tokenHashVersion',
      'policyVersion',
      'issuedAt',
      'expiresAt',
      'issuanceEvidenceJson',
      'issuanceEvidenceHash',
      'consumedAt',
      'consumedLinkId',
      'consumedProvider',
      'consumedSubjectHash',
    ]);
    expect(migration.match(/^CREATE TABLE /gm)).toHaveLength(1);
    expect(migration).not.toMatch(
      /^\s*(?:INSERT INTO|UPDATE "|DELETE FROM|TRUNCATE )/m,
    );
    expect(model).not.toMatch(
      /\b(?:User|Membership|AuthFlowState)\??\s+@relation/,
    );
  });
  it('pins TTL, immutable issuance and correlated atomic outcome', () => {
    expect(CLIENT_LINK_CHALLENGE_POLICY.ttlSeconds).toBe(600);
    expect(CLIENT_LINK_CHALLENGE_POLICY.version).toBe(1);
    expect(Object.isFrozen(CLIENT_LINK_CHALLENGE_POLICY)).toBe(true);
    expect(migration).toContain("INTERVAL '600 seconds'");
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE');
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(migration).toContain('l."clientId" = NEW."clientId"');
    expect(migration).toContain(
      'l."verificationIdentityHash" = NEW."tokenHash"',
    );
    expect(migration).toContain('server_now >= NEW."expiresAt"');
    expect(migration).toContain(') IS TRUE)');
  });
  it('keeps one challenge owner and one existing link writer', () => {
    const production = files(join(root, 'src')).filter(
      (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'),
    );
    expect(
      production
        .filter((p) => writes(readFileSync(p, 'utf8')))
        .map((p) => relative(root, p)),
    ).toEqual(['src/crm/client-link-challenge.service.ts']);
    const source = readFileSync(
      join(root, 'src/crm/client-link-challenge.service.ts'),
      'utf8',
    );
    expect(source).toContain('this.links.bindChallengeInTransaction(tx,');
    expect(source).not.toMatch(
      /\.clientChannelLink\.(?:create|update|upsert)\s*\(/,
    );
    expect(source).not.toContain('phoneHash');
    expect(source).not.toContain('console.');
    expect(source).toContain('randomBytes(POLICY.tokenBytes)');
    expect(source).toContain('this.encryption.opaqueReference(');
  });
  it.each([
    'tx.clientLinkChallenge.create({data: arbitrary})',
    'db.clientLinkChallenge.updateMany({data: {clientId: other}})',
    'INSERT INTO "ClientLinkChallenge" VALUES (x)',
    'DELETE FROM "ClientLinkChallenge"',
  ])('detects an alternate writer: %s', (source) =>
    expect(writes(source)).toBe(true),
  );
  it('does not broaden the A30 retention allowlist', () => {
    const policy = readFileSync(
      join(root, 'src/package5-wave6/package5-wave6.policy.ts'),
      'utf8',
    );
    expect(policy).not.toContain('ClientLinkChallenge');
    expect(policy).not.toContain('ClientChannelLink');
  });
  it('restricts the transaction-bound link entry to the challenge coordinator', () => {
    const callers = files(join(root, 'src'))
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))
      .filter((p) =>
        /\.bindChallengeInTransaction\s*\(/.test(readFileSync(p, 'utf8')),
      )
      .map((p) => relative(root, p));
    expect(callers).toEqual(['src/crm/client-link-challenge.service.ts']);
  });
});
