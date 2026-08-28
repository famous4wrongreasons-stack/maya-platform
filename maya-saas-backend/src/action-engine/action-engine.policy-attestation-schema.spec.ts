import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma');
const MIGRATION = join(
  ROOT,
  'prisma',
  'migrations',
  '20260829120000_action_execution_policy_attestation',
  'migration.sql',
);

const attestationFields = [
  'policyContextContract',
  'policyContextHash',
  'policyEvidenceJson',
  'policyEvaluatedAt',
  'policyValidUntil',
  'approvalBindingHash',
] as const;

describe('Cycle 06 Package 3 policy-attestation schema foundation', () => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');

  it('adds only nullable rollout fields to ActionExecution', () => {
    expect(schema).toMatch(/policyContextContract\s+String\?/);
    expect(schema).toMatch(/policyContextHash\s+String\?/);
    expect(schema).toMatch(/policyEvidenceJson\s+Json\?/);
    expect(schema).toMatch(/policyEvaluatedAt\s+DateTime\?/);
    expect(schema).toMatch(/policyValidUntil\s+DateTime\?/);
    expect(schema).toMatch(/approvalBindingHash\s+String\?/);

    for (const field of attestationFields) {
      expect(migration).toContain(`ADD COLUMN "${field}"`);
    }
  });

  it('keeps legacy rows compatible but rejects partial attestations', () => {
    for (const field of attestationFields) {
      expect(migration).toContain(`"${field}" IS NULL`);
      expect(migration).toContain(`"${field}" IS NOT NULL`);
    }

    expect(migration).toContain(
      'CONSTRAINT "ActionExecution_policy_attestation_shape_check"',
    );
    expect(migration).toContain(
      `jsonb_typeof("policyEvidenceJson") = 'object'`,
    );
    expect(migration).toContain(`"policyValidUntil" > "policyEvaluatedAt"`);
  });

  it('is additive and does not mutate existing or legacy AI rows', () => {
    expect(migration).toMatch(/ALTER TABLE "ActionExecution"/);
    expect(migration).not.toMatch(
      /\b(?:CREATE TABLE|DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/,
    );
    expect(migration).not.toMatch(/AiApprovalRequest|AiToolExecution/);
  });
});
