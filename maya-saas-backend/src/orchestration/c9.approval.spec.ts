/**
 * P05 permanent approval ratchet (mapping §7).
 * A coordination review is not a source approval. An effect attaches to a receipt its own
 * owner already admitted, a compound bulk root covers only its own fixed plan, and a
 * material edit cannot inherit the permission granted to what it replaced.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { c9Binding } from './c9.execution';
import { C9Strategy } from './c9.strategy';
import { C9_CAPABILITIES } from './c9.registry';

const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
  ),
  'utf8',
);
const execution = readFileSync(join(__dirname, 'c9.execution.ts'), 'utf8');
const store = readFileSync(join(__dirname, 'c9.store.ts'), 'utf8');
const strategy = new C9Strategy();
const hash = 'a'.repeat(64);
const lineage = {
  tenantId: 'tenant-1',
  subjectRefs: [],
  sourceActorRef: null,
  sourcePolicyRef: null,
  sourceApprovalRef: null,
  sourceExecutionRefs: [],
  ownerRootRef: null,
};

describe('c9 approval and source binding', () => {
  test('a coordination review cannot by itself satisfy a source approval', () => {
    // The database, not the caller, decides that an effect attachment is legitimate.
    expect(migration).toContain('c9_effect_binding_requires_reviewed_handoff');
    expect(migration).toContain(
      `NEW."bindingKind"='EXECUTION' AND (NEW."sourceType"<>'ActionExecution' OR node.kind<>'OWNER_HANDOFF' OR rev."reviewDecision" IS DISTINCT FROM 'ACCEPTED' OR rev."selectedOptionKey"<>node."optionKey")`,
    );
    // An accepted review admits the coordination plan only; each effect still needs its owner.
    expect(store).toContain("state: accept ? 'ADMITTED' : 'STOPPED'");
    expect(store).toContain("reviewDecision: accept ? 'ACCEPTED' : 'DECLINED'");
  });

  test('an effect must name a real, non-dry-run receipt with matching identity', () => {
    expect(migration).toContain(
      "source IS NULL THEN RAISE EXCEPTION 'c9_exact_source_required'",
    );
    expect(migration).toContain(
      `source->>'identityFingerprint' IS DISTINCT FROM NEW."sourceIdentityHash"`,
    );
    expect(migration).toContain(
      `source->>'normalizedInputHash' IS DISTINCT FROM NEW."sourceIntentHash"`,
    );
    expect(migration).toContain(`source->>'dryRun' IS DISTINCT FROM 'false'`);
    expect(migration).toContain(
      `source->>'capability' IS DISTINCT FROM NEW."ownerKey"`,
    );
    expect(migration).toContain('c9_tool_approval_mismatch');
    // C9 attaches; it never creates the receipt it attaches to.
    expect(execution).not.toMatch(
      /\.(?:actionExecution|aiApprovalRequest|aiToolExecution|marketingCampaign)\.(?:create|update|upsert)/,
    );
  });

  test('one canonical execution carries one owning C9 attachment', () => {
    expect(migration).toContain(
      `CREATE UNIQUE INDEX "C9StepBinding_one_execution_idx" ON "C9StepBinding"("tenantId","sourceType","sourceId") WHERE "bindingKind"='EXECUTION'`,
    );
    // A retry returns the same attachment instead of adding a second one.
    expect(execution).toContain("c9Deny('binding_conflict')");
    expect(execution).toContain('if (existing)');
  });

  test('an attachment is immutable once written', () => {
    expect(migration).toContain("RAISE EXCEPTION 'c9_binding_immutable'");
    expect(migration).toContain('c9_immutable_C9StepBinding');
    // Only an exact AC6 claim may ever remove one.
    expect(migration).toContain('c9_exact_ac6_claim_required');
  });

  test('the binding contract admits only registered owners and closed kinds', () => {
    const valid = {
      bindingKind: 'ASSIGNMENT',
      slotKey: 'slot-1',
      ownerKey: 'tenant_business_configuration',
      sourceType: 'TenantBusinessConfigurationRevision',
      sourceId: 'revision-1',
      sourceIdentityHash: hash,
      sourceIntentHash: hash,
      sourceApprovalHash: null,
      lineage,
    };
    expect(c9Binding(valid)).toMatchObject({ bindingKind: 'ASSIGNMENT' });
    expect(() => c9Binding({ ...valid, sourceType: 'SomeOtherTable' })).toThrow(
      'c9_enum',
    );
    expect(() => c9Binding({ ...valid, bindingKind: 'ANYTHING' })).toThrow(
      'c9_enum',
    );
    expect(() => c9Binding({ ...valid, extra: true })).toThrow(
      'c9_unknown_field',
    );
    expect(migration).toContain('c9_unregistered_source');
  });

  test('a material edit supersedes the reviewed plan instead of inheriting it', () => {
    // A new revision supersedes its parent and the root pointer moves with it, so the
    // previously accepted option is no longer the current selected option.
    expect(store).toContain("state: 'SUPERSEDED'");
    expect(store).toContain("terminalReason: 'MATERIAL_REVISION'");
    expect(store).toContain('currentRevision: (parent?.revision ?? 0) + 1');
    // Eligibility is checked against the current revision, so old work cannot proceed.
    expect(migration).toContain(`root."currentRevision"<>rev.revision`);
    expect(execution).toContain("c9Deny('reviewed_plan_required')");
    // A material change of what was reviewed is detectable without re-rendering text.
    const base = {
      objectiveKey: 'c9.operations_support',
      safeDescription: 'x',
      budgetManifestHash: hash,
      validUntil: '2026-09-15T10:00:00.000Z',
      options: [],
    };
    const first = strategy.propose(base);
    expect(strategy.materialHash(first)).toBe(
      strategy.materialHash(strategy.propose(base)),
    );
    expect(strategy.materialHash(first)).not.toBe(
      strategy.materialHash(
        strategy.propose({ ...base, objectiveKey: 'c9.client_return' }),
      ),
    );
  });

  test('a review cannot be replayed under a different decision', () => {
    expect(store).toContain("c9Deny('review_conflict')");
    expect(store).toContain("c9Deny('review_stale')");
    expect(store).toContain("r.state !== 'VALIDATED'");
    // The reviewed snapshot is pinned, so a re-rendered plan cannot be accepted in its place.
    expect(store).toContain("c9Deny('review_snapshot')");
  });

  test('BI has no owner-handoff path at any layer', () => {
    for (const cap of C9_CAPABILITIES.filter((c) =>
      c.domains.includes('BUSINESS_INTELLIGENCE'),
    ))
      expect(cap.mode).toBe('READ');
    // Both the plan step and the work receipt refuse the combination outright.
    expect(
      migration.match(/BUSINESS_INTELLIGENCE' AND kind='OWNER_HANDOFF'/g),
    ).toHaveLength(2);
  });
});
