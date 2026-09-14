import { readFileSync, readdirSync } from 'node:fs';
import { MEASUREMENT_SOURCE_KINDS } from './measurement.contract';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (name: string) => readFileSync(join(root, name), 'utf8');
const runtime = () =>
  readdirSync(__dirname)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => readFileSync(join(__dirname, name), 'utf8'))
    .join('\n');

describe('C7 Wave 2 shared publication and source-owner ratchets', () => {
  it('remote observations are prepared before publication, then reauthorized under the same claim', () => {
    const compute = read('src/measurement/measurement.service.ts')
      .split('async compute(')[1]
      .split('async current(')[0];
    expect(compute.indexOf('this.sources.prepare')).toBeGreaterThan(
      compute.indexOf('measurement_lease_fenced'),
    );
    expect(compute.indexOf('this.sources.prepare')).toBeLessThan(
      compute.indexOf('return this.prisma.$transaction'),
    );
    expect(compute.indexOf('this.sources.assertPreparedCurrent')).toBeLessThan(
      compute.indexOf('measurementRevision.updateMany'),
    );
    expect(compute).toContain('leaseGeneration: lease.generation');
    expect(compute).toContain('leaseExpiresAt: { gt: now }');
    expect(compute).toContain('expiresAt: { gt: now }');
    const finance = read('src/measurement/measurement.finance.ts').split(
      'async assertPreparedCurrent(',
    )[1];
    expect(finance).toContain('FOR SHARE');
    expect(finance).toContain('measurement_prepared_authority_changed');
  });

  it('package readers cannot write canonical source facts or publish independent revisions', () => {
    const source = runtime();
    expect(source).not.toMatch(
      /(?:expense|expensePeriodDeclaration|businessReview|nativeFeedbackRequest|nativeFeedbackRevision|loyaltyAccount|loyaltyTransaction|crmClientLink|crmIntegration)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    );
    expect(source).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(?:Expense|BusinessReview|NativeFeedbackRequest|NativeFeedbackRevision|LoyaltyAccount|LoyaltyTransaction|CrmClientLink|CrmIntegration)"/i,
    );
    for (const file of [
      'measurement.finance.ts',
      'measurement.reputation.ts',
      'measurement.value.ts',
    ]) {
      expect(read(`src/measurement/${file}`)).not.toMatch(
        /measurementRevision\.(?:create|update|upsert|delete)|registerCapability|executeAction/,
      );
    }
  });

  it('the same foundation installs both readers without package schema or retention owners', () => {
    const module = read('src/measurement/measurement.module.ts');
    expect(module).toContain('MeasurementFinanceReader');
    expect(module).toContain('MeasurementReputationReader');
    expect(module).toContain('MeasurementService');
    const schema = read('prisma/schema.prisma');
    expect(schema).not.toMatch(
      /model (?:FinancialMeasurement|ReputationMeasurement|PeriodMeasurement|FinancialRevision|ReputationRevision)\b/,
    );
    expect(runtime()).not.toMatch(/setInterval|@Cron\(|@Interval\(/);
  });

  it('safe source kinds are a closed family-specific allowlist', () => {
    const contract = read('src/measurement/measurement.contract.ts');
    expect(contract).toContain(
      'MEASUREMENT_SOURCE_KINDS.get(s.owner)?.includes(s.kind)',
    );
    expect(MEASUREMENT_SOURCE_KINDS.get('ClientLoyaltySnapshot')).toEqual([
      'canonical_value_card_query',
    ]);
    expect(MEASUREMENT_SOURCE_KINDS.get('NativeFeedbackRequest')).toEqual([
      'reputation_native_query',
    ]);
    expect(contract).not.toMatch(
      /MEASUREMENT_SOURCE_KINDS.*Record<string,\s*any>/,
    );
  });
});
