import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { WAVE6_CLASSES } from '../package5-wave6/package5-wave6.policy';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const coordinator = 'src/package5-wave6/package5-wave6.service.ts';
const sourceFiles = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
const production = (path: string) =>
  path.endsWith('.ts') &&
  !path.endsWith('.spec.ts') &&
  path !== 'scripts/package5-wave6-all6-executable-proof.ts';
const forbiddenWrite = (code: string) =>
  /(?:authSession|authRefreshToken|phoneAuthCode|emailAuthCode|authFlowState|authRateLimitBucket|ingestionQuarantine)\s*(?:\.\s*(?:delete|deleteMany)|\[\s*['"]delete(?:Many)?['"]\s*\])\s*\(/.test(
    code,
  ) ||
  /DELETE\s+FROM\s+["'`]?(?:AuthSession|AuthRefreshToken|PhoneAuthCode|EmailAuthCode|AuthFlowState|AuthRateLimitBucket|IngestionQuarantine)\b/i.test(
    code,
  );

describe('Wave 6 exact AC6 owner / final narrowed family coverage', () => {
  it('has no direct allowlisted deletion outside the one canonical coordinator', () => {
    const violations = [...sourceFiles('src'), ...sourceFiles('scripts')]
      .filter(production)
      .filter((file) => file !== coordinator && forbiddenWrite(read(file)));
    expect(violations).toEqual([]);
    const owner = read(coordinator);
    expect(forbiddenWrite(owner)).toBe(false);
    expect(owner.match(/DELETE FROM/g)).toHaveLength(1);
    expect(owner).toContain('this.table(plan.rule.table)');
    expect(owner).toContain('this.scope(plan)');
    expect(owner).toContain('this.eligible(plan)');
    expect(owner).toContain('maintenance_unclaimed_cascade_forbidden');
    expect(owner).toContain('maintenance_manifest_mismatch');
    expect(owner).toContain('maintenance_lease_fenced');
    expect(owner).not.toMatch(
      /\$queryRawUnsafe|\$executeRawUnsafe|provider|fetch\(/,
    );
  });
  it('routes both production initiators through canonical prepare/execute without hidden read mutation', () => {
    const auth = read('src/auth/auth-retention.repository.ts');
    const event = read('src/events/event-store.service.ts');
    for (const code of [
      auth,
      event.slice(event.indexOf('async purgeExpiredQuarantine')),
    ]) {
      expect(code).toContain('coordinator.prepare');
      expect(code).toContain('coordinator.execute');
      expect(forbiddenWrite(code)).toBe(false);
    }
    expect(auth).toContain('coordinator.shadow(request)');
    expect(read('src/auth/auth-retention.service.ts')).not.toMatch(
      /ConfigService|AUTH_RETENTION_|new Date/,
    );
    expect(
      event.slice(event.indexOf('async countExpiredQuarantine')),
    ).not.toMatch(/\.prepare\(|\.execute\(|\.delete/);
    const shadow = read(coordinator)
      .split('async shadow(')[1]
      .split('async prepare(')[0];
    expect(shadow).toContain('SET TRANSACTION READ ONLY');
    expect(shadow).not.toMatch(
      /\.create|\.update|\.delete|\.execute\(|\.prepare\(/,
    );
  });
  it('removes disallowed AI maintenance writes and both Python anonymization implementations', () => {
    const ai = read('scripts/ai-runtime-maintenance.ts');
    expect(ai).toContain('package5_a30_ai_cleanup_not_allowlisted');
    expect(ai).not.toMatch(
      /\.(update|updateMany|delete|deleteMany|create|upsert)\s*\(/,
    );
    for (const file of [
      '../ai администратор/database.py',
      '../ai администратор/saas_blueprint/pg/db_pg_full.py',
    ]) {
      const source = read(file);
      const body = source.split('def rotate_old_pii(')[1].split('\n\n#')[0];
      expect(body).toContain(
        'raise RuntimeError("package5_a30_legacy_pii_cleanup_not_allowlisted")',
      );
      expect(body).not.toMatch(/\.execute\(|UPDATE|DELETE|_db\(/);
    }
  });
  it('rejects added business deletes including test-named production helpers', () => {
    for (const mutation of [
      'await prisma.authSession.deleteMany({});',
      'await prisma.authRefreshToken.delete({});',
      'await tx.ingestionQuarantine["deleteMany"]({});',
      'DELETE FROM "EmailAuthCode" WHERE true',
      'DELETE FROM AuthRefreshToken',
    ])
      expect(forbiddenWrite(mutation)).toBe(true);
    expect(
      forbiddenWrite('createHash("sha256").update(value).digest("hex")'),
    ).toBe(false);
    expect(production('src/test/retention-helper.ts')).toBe(true);
    expect(production('src/auth/retention.spec-helper.ts')).toBe(true);
    expect(production('src/auth/retention.spec.ts')).toBe(false);
    expect(production('scripts/retention-proof.ts')).toBe(true);
    const proof = read('scripts/package5-wave6-all6-executable-proof.ts');
    expect(proof).toContain("url.hostname !== '127.0.0.1'");
    expect(proof).toContain("url.port !== '55486'");
    expect(proof).toContain("url.pathname.startsWith('/maya_c06_p5_wave6_')");
  });
  it('matches all 13 Entry Gate families to the six approved waves, with no seventh wave', () => {
    const entry = read(
      '../docs/rebuild/CYCLE-06-BLOCKING-PACKAGE-5-ENTRY-REMAINDER-GATE.md',
    );
    const families = [...entry.matchAll(/^\| (A\d+) \|/gm)]
      .map((m) => m[1])
      .sort();
    const waveFamilies = [
      ['A22', 'A23'],
      ['A16', 'A25', 'A26'],
      ['A15', 'A17', 'A18'],
      ['A27', 'A28'],
      ['A29', 'A31'],
      ['A30'],
    ];
    expect(waveFamilies.flat().sort()).toEqual(families);
    expect(new Set(families).size).toBe(13);
    expect(Object.keys(WAVE6_CLASSES).sort()).toEqual(
      [
        'purge_auth_sessions',
        'purge_phone_auth_codes',
        'purge_email_auth_codes',
        'purge_auth_flow_states',
        'purge_auth_rate_limit_buckets',
        'purge_ingestion_quarantine',
        'purge_operational_alert_payloads',
        'purge_native_feedback_payloads',
        'purge_public_community_payloads',
        'purge_superseded_business_configuration_payloads',
        'purge_team_message_payloads',
        'purge_team_attachment_payloads',
        'purge_expense_reminder_payloads',
        'purge_cash_declaration_reason_payloads',
        'expire_measurement_revisions',
        'expire_c8_result_revisions',
        'expire_c8_evaluation_revisions',
        'expire_c8_model_versions',
      ].sort(),
    );
  });
});
