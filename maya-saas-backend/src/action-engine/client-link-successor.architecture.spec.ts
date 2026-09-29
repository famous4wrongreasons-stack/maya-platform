import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
describe('SB-1 approved JSON V2 architectural ratchets', () => {
  it('SV2-ARCH no tables/columns/backfill; original V1 lifecycle and link guards remain owners', () => {
    const sql = read(
      'prisma/migrations/20260929190000_client_link_challenge_json_v2/migration.sql',
    );
    expect(sql).not.toMatch(
      /CREATE TABLE|ADD COLUMN|\b(?:UPDATE|DELETE FROM|INSERT INTO) "/,
    );
    expect(sql).not.toMatch(
      /(?:REPLACE|DROP) FUNCTION "guard_client_(?:link_challenge|channel_link)_v1"/,
    );
    for (const field of [
      'mayaUserId',
      'mayaSubjectHash',
      'verificationChannel',
      'predecessorLinkId',
    ])
      expect(sql).toContain(field);
    expect(sql).toContain(
      '(NEW."policyVersion" = 1 AND l."supersedesLinkId" IS NULL)',
    );
    expect(sql).toContain('p."revokedAt" IS NOT NULL');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('s."id" IS DISTINCT FROM NEW."consumedLinkId"');
  });
  it('SV2-ARCH only canonical challenge coordinator calls successor link writer', () => {
    const callers = files(join(root, 'src'))
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))
      .filter((p) =>
        /\.bindSuccessorChallengeInTransaction\s*\(/.test(
          readFileSync(p, 'utf8'),
        ),
      )
      .map((p) => relative(root, p));
    expect(callers).toEqual(['src/crm/client-link-challenge.service.ts']);
    const link = read('src/crm/client-channel-link.service.ts');
    const method = link.slice(
      link.indexOf('async bindSuccessorChallengeInTransaction'),
      link.indexOf('async assertClientEligible'),
    );
    expect(method).toContain('await lockClientChannelIdentity(');
    expect(method).toContain('successors: { none: {} }');
    expect(method).toContain('!tips[0].revokedAt');
    expect(method).toContain('tips[0].clientId !== proof.clientId');
    expect(method).not.toContain('revokeVerified');
    expect(method).toContain('this.bindVerified(proof, undefined, tx)');
  });
  it('SV2-ARCH authenticated tenant routes, strict delivery and serializable consume remain wired', () => {
    const controller = read('src/crm/client-reverification.controller.ts');
    expect(controller).toContain('@TenantScoped()');
    expect(controller).toContain('@CurrentUser()');
    expect(controller).not.toContain('@Public(');
    expect(read('src/crm/crm.module.ts')).toContain(
      'ClientReverificationController,',
    );
    const coordinator = read('src/crm/client-link-challenge.service.ts');
    expect(coordinator).toContain(
      'Prisma.TransactionIsolationLevel.Serializable',
    );
    expect(coordinator).toContain('deliverClientVerificationCode(');
    expect(coordinator).not.toContain('.deliverCode(');
    expect(coordinator).toContain(
      'await deps.candidates.assertCurrentInTransaction(tx, actor, candidate)',
    );
    expect(coordinator).not.toContain('phoneHash');
  });
});
