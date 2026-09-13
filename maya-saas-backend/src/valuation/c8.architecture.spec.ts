import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { C8_RETENTION_CLASSES } from '../package5-wave6/chapter8-valuation-retention';
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')
        ? [join(dir, e.name)]
        : [],
  );
}
const migration =
  'prisma/migrations/20260913093000_chapter8_valuation_foundation/migration.sql';
describe('C8 permanent shared owner/security/release ratchets', () => {
  it('freezes three shared models, 94 physical fields, one migration with only Tenant FKs', () => {
    const schema = read('prisma/schema.prisma');
    for (const [name, count] of [
      ['C8ModelVersion', 22],
      ['C8ResultRevision', 41],
      ['C8EvaluationRevision', 31],
    ] as const) {
      const body = schema.split(`model ${name} {`)[1].split('\n}')[0];
      expect(
        body
          .split('\n')
          .filter((l) =>
            /^\s+\w+\s+(?:String|Int|DateTime|Json)\??(?:\s|$)/.test(l),
          ),
      ).toHaveLength(count);
    }
    const sql = read(migration);
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(3);
    expect(sql.match(/ADD CONSTRAINT "C8_.*_ck" CHECK/g)).toHaveLength(24);
    expect(sql.match(/FOREIGN KEY/g)).toHaveLength(3);
    expect(sql.match(/REFERENCES "Tenant"\(id\)/g)).toHaveLength(3);
    expect(sql).not.toMatch(
      /ON DELETE CASCADE|DISABLE TRIGGER|INSERT INTO "(?:Client|Appointment|MeasurementRevision)"/,
    );
  });
  it('no parallel C8 model/result/evaluation writer in any production TS surface', () => {
    const allowed = [
      'src/valuation/c8.store.ts',
      'src/package5-wave6/chapter8-valuation-retention.ts',
    ];
    const offenders = files(join(root, 'src')).filter(
      (f) =>
        !allowed.includes(relative(root, f)) &&
        /c8(?:ModelVersion|ResultRevision|EvaluationRevision)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+"?C8(?:ModelVersion|ResultRevision|EvaluationRevision)\b/i.test(
          readFileSync(f, 'utf8'),
        ),
    );
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
  it('valuation cannot own source/business/provider/delivery effects or call an LLM', () => {
    const source = files(join(root, 'src/valuation'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /(?:client|appointment|clientConsentFact|measurementRevision|actionExecution|communicationDelivery)\.(?:create|update|upsert|delete)\s*\(/,
    );
    expect(source).not.toMatch(
      /(?:sendMessage|sendPush|createAppointment|cancelAppointment|executeAction|registerCapability)\s*\(/,
    );
    expect(source).not.toMatch(
      /from ['"].*(?:openai|anthropic|ai-tools|yclients)[^'"]*['"]/,
    );
    expect(source).not.toMatch(
      /Client\.userId|CustomerProfile\.userId|chat_id|phoneHash/,
    );
  });
  it('A22 remains policy owner; no C8 business action and exact tenant is mandatory', () => {
    expect(read('src/package5-wave1/governed-settings.contract.ts')).toContain(
      "'c8_valuation'",
    );
    const service = read('src/package5-wave1/package5-wave1.service.ts');
    expect(service.match(/await c8PolicyScope\(/g)).toHaveLength(2);
    const store = read('src/valuation/c8.store.ts');
    expect(store).toContain("c.source !== 'system' || c.userId");
    expect(store).not.toMatch(
      /ActionCapabilityRegistry|TrustedActionExecutionRequest/,
    );
  });
  it('SQL permanently fences admission/current source, historical snapshot and unavailable numeric state', () => {
    const sql = read(migration);
    for (const marker of [
      'C8 exact server admission required',
      'C8 result identity/input mismatch',
      'C8 immutable result/history',
      'C8 publication fenced',
      'C8 policy source mismatch',
      'C8 appointment exact Client evidence required',
      'C8 cross-subject measurement evidence',
      'C8 unqualified numeric prediction disabled',
      'C8 unavailable calibration cannot PASS',
      'C8 later label subject/knowledge/coverage mismatch',
      'C8 evaluation series identity mismatch',
    ])
      expect(sql).toContain(marker);
    expect(sql).toContain('FOR SHARE');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql.match(/CREATE TRIGGER "C8_.*_truncate_trg"/g)).toHaveLength(3);
  });
  it('exact AC6 owns three retention leaves and cannot delete canonical sources', () => {
    expect(Object.keys(C8_RETENTION_CLASSES)).toHaveLength(3);
    const leaf = read('src/package5-wave6/chapter8-valuation-retention.ts');
    expect(leaf).toContain('MaintenanceItemClaim');
    expect(leaf).toContain("c.state='CLAIMED'");
    expect(leaf).not.toMatch(
      /DELETE FROM "(?:Client|Appointment|ActionExecution|MeasurementRevision|ClientConsentFact)"/,
    );
    expect(read(migration)).toContain("interval '31536000 seconds'");
    expect(read(migration)).toContain('RC_payload_claim');
  });
  it('mandatory deployment runs all src specifications, not a standalone opt-in test', () => {
    expect(read('package.json')).toContain('.*\\\\.spec\\\\.ts$');
    expect(read('deploy/vps/deploy.sh')).toContain(
      'npm test -- --runInBand --silent',
    );
  });
});
