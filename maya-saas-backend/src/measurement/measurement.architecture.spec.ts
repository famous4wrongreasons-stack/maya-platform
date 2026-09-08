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
      .filter((l) =>
        /^\s+\w+\s+(?:String|Int|DateTime|Json)\??(?:\s|$)/.test(l),
      );
    expect(scalar).toHaveLength(37);
    expect(schema).not.toMatch(
      /model (FinancialMeasurement|AttributionMeasurement|ReputationMeasurement|GoalMeasurement|PeriodMeasurement)\b/,
    );
    expect(body.match(/onDelete: Restrict/g)).toHaveLength(8);
  });
  it('derived FK never pins the mutable Appointment Client association', () => {
    const schema = read('prisma/schema.prisma');
    const relation = schema
      .split('appointment Appointment? @relation("C7AppointmentMeasurement"')[1]
      .split('\n')[0];
    expect(relation).toContain(
      'fields: [appointmentId, tenantId], references: [id, tenantId]',
    );
    expect(relation).not.toContain('mayaClientId');
    const sql = read(
      'prisma/migrations/20260908153000_chapter7_measurement_foundation/migration.sql',
    );
    const fk = sql
      .split('ADD CONSTRAINT "C7_measurement_appointment_fk"')[1]
      .split(';')[0];
    expect(fk).toContain(
      'FOREIGN KEY ("appointmentId", "tenantId") REFERENCES "Appointment" ("id", "tenantId")',
    );
    expect(fk).not.toContain('mayaClientId');
  });
  it('admission locks and verifies the exact current canonical Client', () => {
    const sql = read(
      'prisma/migrations/20260908153000_chapter7_measurement_foundation/migration.sql',
    );
    const admission = sql
      .split('CREATE FUNCTION "C7_measurement_admission_guard"')[1]
      .split('CREATE TRIGGER')[0];
    expect(admission).toContain('AND "mayaClientId"=NEW."clientId" FOR SHARE');
    expect(admission).toContain('C7 admission Appointment Client mismatch');
    const service = read('src/measurement/measurement.service.ts');
    expect(
      service.split('async admit(')[1].split('async resume(')[0],
    ).toContain('this.sources.authorize(tenantId, intent)');
  });
  it('publication holds source lock through reading and closes changed Client unavailable', () => {
    const service = read('src/measurement/measurement.service.ts')
      .split('async compute(')[1]
      .split('async current(')[0];
    expect(service).toContain('FOR SHARE');
    expect(service.indexOf('FOR SHARE')).toBeLessThan(
      service.indexOf('this.sources.read'),
    );
    expect(service).toContain('source.mayaClientId === intent.clientId');
    expect(service).toContain("reasons: ['source_subject_changed']");
    expect(service).toContain("completeness: 'UNAVAILABLE'");
    expect(service).toContain('this.sources.read(tenantId, intent, tx)');
    expect(service.split('data: {')[1]).not.toMatch(/clientId:|appointmentId:/);
  });
  it('SQL forbids stale publication and in-place historical Client rebind', () => {
    const sql = read(
      'prisma/migrations/20260908153000_chapter7_measurement_foundation/migration.sql',
    );
    expect(sql).toContain('source_client IS DISTINCT FROM NEW."clientId"');
    expect(sql).toContain('C7 changed source requires unavailable outcome');
    expect(sql).toContain(
      `NEW."valuesJson"='{"version":1,"metrics":[]}'::jsonb`,
    );
    expect(sql).toContain('C7 admitted intent immutable');
    expect(sql).toContain(
      "IF OLD.state='PUBLISHED' THEN RAISE EXCEPTION 'C7 snapshot immutable'",
    );
  });
  it('receipt read does not silently turn the old Client snapshot into current facts', () => {
    const service = read('src/measurement/measurement.service.ts');
    expect(service.split('async current(')[1]).toContain(
      'published?.clientId === intent.clientId',
    );
    expect(service.split('async current(')[1]).toContain(
      'this.sources.authorize(tenantId, intent)',
    );
    const proof = read('scripts/chapter7-source-owner-compatibility-proof.ts');
    expect(proof).toContain('new AppointmentChangeService');
    expect(proof).toContain('new AppointmentObservationService');
    expect(proof).toContain('waitForBlocked(2)');
    expect(proof).toContain(
      'published historical Client cannot be changed in place',
    );
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
