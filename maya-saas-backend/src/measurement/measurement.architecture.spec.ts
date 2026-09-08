import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
const root = resolve(__dirname, '../..');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')
        ? [join(dir, e.name)]
        : [],
  );
}
const read = (path: string) => readFileSync(join(root, path), 'utf8');
describe('C7 permanent shared measurement boundaries', () => {
  it('one shared model / exactly 37 columns / only approved source relations', () => {
    const schema = read('prisma/schema.prisma');
    const body = schema.split('model MeasurementRevision {')[1].split('\n}')[0];
    const scalar = body
      .split('\n')
      .filter((l) => /^\s+\w+\s+(?:String|Int|DateTime|Json)\??\s/.test(l));
    expect(scalar).toHaveLength(37);
    expect(schema).not.toMatch(
      /model (FinancialMeasurement|AttributionMeasurement|ReputationMeasurement|GoalMeasurement|PeriodMeasurement)\b/,
    );
    expect(body.match(/onDelete: Restrict/g)).toHaveLength(8);
  });
  it('only the canonical measurement service writes revisions', () => {
    const offenders = files(join(root, 'src')).filter(
      (f) =>
        /measurementRevision\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(
          readFileSync(f, 'utf8'),
        ) && !f.endsWith('/measurement/measurement.service.ts'),
    );
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
  it('raw SQL cannot install a parallel revision writer', () => {
    const allowed = [
      'src/measurement/measurement.service.ts',
      'src/package5-wave6/chapter7-measurement-retention.ts',
    ];
    const offenders = files(join(root, 'src')).filter(
      (f) =>
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+["'\\]*MeasurementRevision\b/i.test(
          readFileSync(f, 'utf8'),
        ) && !allowed.includes(relative(root, f)),
    );
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
  it('measurement cannot execute business effects, delivery or LLM calls', () => {
    const source = files(join(root, 'src/measurement'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /(?:createAppointment|cancelAppointment|rescheduleAppointment|sendMessage|sendDocument|sendPush|executeAction|claimExecution)\s*\(/,
    );
    expect(source).not.toMatch(
      /from ['"].*(?:openai|anthropic|ai-tools|communication-delivery|action-engine|yclients)[^'"]*['"]/,
    );
    expect(source).not.toMatch(
      /(?:client|appointment|clientConsentFact|recoveryConversion)\.(?:create|update|upsert|delete)\s*\(/,
    );
  });
  it('no client legacy authority / runtime SQL deletion bypass', () => {
    const source = read('src/measurement/measurement.sources.ts');
    expect(source).not.toMatch(
      /(?:phoneHash|customerProfile|chat_id|client\.userId)/,
    );
    expect(
      files(join(root, 'src/measurement'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n'),
    ).not.toMatch(/DELETE FROM|TRUNCATE|DISABLE TRIGGER/);
  });
  it('cleanup has one AC6 leaf with exact receipt; no source delete', () => {
    const leaf = read('src/package5-wave6/chapter7-measurement-retention.ts');
    expect(leaf).toContain('DELETE FROM "MeasurementRevision"');
    expect(leaf).not.toMatch(
      /DELETE FROM "(?:Client|Appointment|ActionExecution|ClientConsentFact|BusinessReview)"/,
    );
    expect(read('src/package5-wave6/package5-wave6.service.ts')).toContain(
      'measurementRetentionItem',
    );
  });
  it('immutable and 365-day schema guards remain mandatory', () => {
    const sql = read(
      'prisma/migrations/20260908153000_chapter7_measurement_foundation/migration.sql',
    );
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(1);
    expect(sql.match(/CREATE FUNCTION /g)).toHaveLength(4);
    expect(sql.match(/CREATE TRIGGER /g)).toHaveLength(4);
    expect(sql).toContain("interval '31536000 seconds'");
    expect(sql).toContain('C7 snapshot immutable');
    expect(sql).toContain('RC_payload_claim');
    expect(sql).not.toMatch(
      /\b(?:UPDATE|DELETE FROM|INSERT INTO)\s+"(?:Client|Appointment|ActionExecution|RecoveryConversion)"/,
    );
  });
  it('dates/retention claims use an explicit UTC boundary', () => {
    expect(read('src/measurement/measurement.service.ts')).toContain(
      "SET LOCAL TIME ZONE 'UTC'",
    );
    expect(read('src/package5-wave6/package5-wave6.service.ts')).toContain(
      'C7_MEASUREMENT_RETENTION_CLASS',
    );
  });
  it('no new business action registration', () => {
    const source = files(join(root, 'src/measurement'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /registerCapability|ActionCapabilityRegistry|TrustedActionExecutionRequest/,
    );
  });
});
