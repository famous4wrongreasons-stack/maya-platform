import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const runtime = () =>
  readdirSync(__dirname)
    .filter(
      (p) =>
        p.startsWith('measurement.outcomes') &&
        p.endsWith('.ts') &&
        !p.endsWith('.spec.ts'),
    )
    .map((p) => read(`src/measurement/${p}`))
    .join('\n');

describe('P03 permanent attribution and owner boundaries', () => {
  it('uses one shared publisher and owns no schema or model', () => {
    expect(runtime()).not.toMatch(
      /measurementRevision\.(?:create|update|upsert|delete)|CREATE TABLE|ALTER TABLE|\$executeRaw/,
    );
    expect(read('scripts/chapter7-outcomes-proof.ts')).toContain(
      'new MeasurementSources(db, undefined, undefined, reader)',
    );
  });
  it('has only read queries, existing verified decoder and no source identity inference', () => {
    expect(runtime()).not.toMatch(
      /\.decrypt\(|createDecipher|new ActionEngine|from ['"].*(?:action-engine|crm-adapter\.interface)/,
    );
    expect(runtime()).not.toMatch(
      /phoneHash|phoneHmac|client\.userId|subjectRef|externalBookingRef/,
    );
    expect(runtime()).not.toMatch(
      /\.(?:create|createMany|update|upsert|delete|claimExecution|finalizeUnknown|sendMessage)\(/,
    );
    expect(runtime()).toContain(
      'readTrustedNormalizedInput(tenantId, e.id, db)',
    );
  });
  it('proves frozen capacity with existing owner reference functions and separates receipt attempts', () => {
    const facts = read('src/measurement/measurement.outcomes.facts.ts');
    expect(facts).toContain('opportunityShadowIntervalRef(');
    expect(facts).toContain("attempt.kind === 'EXECUTION'");
    expect(facts).toContain("'appointments.client.create.v1'");
    expect(facts).toContain('a.id !== `appointment-action:${e.id}`');
  });
  it('source query overflow terminates safely and never truncates a measured cohort', () => {
    expect(runtime()).toContain('OUTCOME_READ_LIMIT + 1');
    expect(runtime()).toContain('error instanceof OutcomeSourceBoundError');
    expect(runtime()).toContain('return unavailable');
    expect(runtime()).not.toMatch(
      /\.slice\(0,\s*(?:1000|OUTCOME_READ_LIMIT)\)/,
    );
  });
  it('PostgreSQL proof is hard-bound before Prisma and routes synthetic mutations through owners', () => {
    const proof = read('scripts/chapter7-outcomes-proof.ts');
    for (const guard of [
      "assert.equal(url.hostname, '127.0.0.1')",
      "assert.equal(url.port, '55517')",
      "assert.equal(url.username, 'maya_c7')",
      "assert.equal(url.pathname, '/maya_c7_replay')",
      "assert.equal(url.search, '')",
    ])
      expect(proof.indexOf(guard)).toBeLessThan(
        proof.indexOf('new PrismaService('),
      );
    expect(proof).toContain('controlledFixtureMode: true');
    expect(proof).not.toMatch(
      /actionExecution\.create|actionAttempt\.create|marketingCampaign\.create|recoveryConversion\.(?:create|update)|DISABLE TRIGGER|TRUNCATE/,
    );
  });
});
