import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE5_WAVE2_REGISTRATIONS } from './package5-wave2-executable.contract';
import { PACKAGE5_WAVE3_REGISTRATIONS } from './package5-wave3-executable.contract';
import { PACKAGE5_WAVE4_REGISTRATIONS } from './package5-wave4-executable.contract';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read(
  'prisma/migrations/20260904110000_ai_confirmation_receipt_v1/migration.sql',
);
const service = read('src/onboarding/ai-confirmation-receipt.service.ts');

describe('Approved AI confirmation receipt V1 schema boundary', () => {
  it('adds exactly the three approved fields to the existing aggregate', () => {
    expect(
      [...migration.matchAll(/ADD COLUMN "([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      'revision',
      'confirmationReceiptJson',
      'confirmationMaterialEncrypted',
    ]);
    expect(migration).not.toMatch(
      /CREATE TABLE|DROP TABLE|DROP COLUMN|INSERT INTO/,
    );
    expect(read('prisma/schema.prisma')).toContain(
      'confirmationMaterialEncrypted String?',
    );
  });
  it('pins only existing A16/A17/A26/A28 class and target combinations', () => {
    const expected = [
      ...PACKAGE5_WAVE2_REGISTRATIONS.filter((r) => r.family !== 'A25'),
      ...PACKAGE5_WAVE3_REGISTRATIONS.filter((r) => r.family === 'A17'),
      ...PACKAGE5_WAVE4_REGISTRATIONS.filter((r) => r.family === 'A28'),
    ]
      .map((r) => `${r.family}/${r.actionClass}/${r.targetKind}`)
      .sort();
    const actual = [
      ...migration.matchAll(/\('(A\d+)','([a-z_]+)','([a-z_]+)'\)/g),
    ]
      .map((m) => `${m[1]}/${m[2]}/${m[3]}`)
      .sort();
    expect(actual).toEqual(expected);
  });
  it('enforces immutable receipt and activation history with database guards', () => {
    for (const marker of [
      'AiOnboardingDraft_confirmation_guard',
      'TrialActivation_ai_confirmation_guard',
      'AiOnboardingDraft_children_guard',
      'DEFERRABLE INITIALLY DEFERRED',
      'Confirmed draft evidence cannot be deleted',
      'Confirmation envelope is immutable; reset forbidden',
      'Receipt activation cannot be reset or rebound',
      'Confirmation requires every exact canonical child outcome',
    ])
      expect(migration).toContain(marker);
  });
  it('requires version CAS and verified claims before receipt creation', () => {
    expect(service).toContain('expectedDraftRevision');
    expect(service).toContain('this.assertToken(input.draftToken');
    expect(service).toContain('this.assertToken(input.activationToken');
    expect(service).toContain('revision: input.expectedDraftRevision');
    expect(service).toContain(
      'confirmationReceiptJson: { equals: Prisma.DbNull }',
    );
    expect(service).toContain('this.encryption.encrypt');
  });
  it('stores no business writes or parallel execution ledger in the receipt service', () => {
    expect(service).not.toMatch(
      /\.(tenant|user|membership|brandingSettings|internalService|internalProvider|internalAvailabilityRule|staff|staffProviderLink|crmStaffAccess|actionExecution)\.(create|update|upsert|delete)/,
    );
    expect(service).toContain('bootstrapper.activate');
    expect(service).toContain('this.prisma.actionExecution.findMany');
    expect(service).toContain(
      'No V1 confirmation receipt; historical replay forbidden',
    );
  });
  it('does not expand central retention', () => {
    const retention = read('src/package5-wave6/package5-wave6.policy.ts');
    expect(retention).not.toMatch(
      /AiOnboardingDraft|TrialActivation|confirmationReceipt/,
    );
  });
});
