import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p: string) =>
  readFileSync(resolve(__dirname, '../..', p), 'utf8');
describe('C8 P04/P05 permanent lifecycle ratchets', () => {
  it('typed Opportunity branch preserves facts-only guard and delegates persistence', () => {
    const bridge = read('src/valuation/c8.opportunity.ts');
    expect(bridge).toContain('this.lifecycle.persistOpportunity');
    expect(bridge).toContain('verifyEvidence');
    expect(bridge).toContain('this.lifecycle.resolveCurrent');
    expect(bridge).not.toMatch(
      /opportunity\.(?:create|update|delete|upsert)\(/,
    );
    expect(read('src/opportunities/opportunity.lifecycle.ts')).toContain(
      'c8_opportunity_verifier_required',
    );
    const engine = read('src/opportunities/opportunity.engine.ts');
    expect(engine).toContain('assertNoInventedValuation');
    expect(engine).toContain('c8AssertOpportunityBranch');
  });
  it('exact later labels are neither fuzzy identity nor failed delivery relabelled as negative', () => {
    const labels = read('src/valuation/c8.labels.ts');
    for (const text of [
      'appointment_cancelled_reassigned_or_rescheduled',
      'complete_absence_coverage_unavailable',
      'outcome_not_mature',
      'C8_validate_refs',
      'c8C7Snapshot',
    ])
      expect(labels).toContain(text);
    expect(labels).not.toMatch(
      /phone|email|chat_id|legacy|sendMessage|\.userId/,
    );
  });
  it('evaluation cannot train, activate, claim calibration PASS or publish guessed metrics', () => {
    const evaluator = read('src/valuation/c8.evaluation.ts');
    expect(evaluator).toContain('publishUnavailable');
    expect(evaluator).toContain('real_world_calibration_unavailable');
    expect(evaluator).not.toMatch(
      /outcome:\s*['"]PASS|\.fit\(|\.train\(|requested:\s*['"]enabled|calibration:\s*['"]PASS/,
    );
    expect(read('src/valuation/c8.store.ts')).toContain(
      'c8_evaluation_same_evidence',
    );
  });
  it('existing worker resumes both owners without a new daemon or side effect', () => {
    const worker = read('src/valuation/c8.worker.ts');
    expect(worker).toContain('this.evaluation.tickTenant');
    expect(worker).toContain('this.opportunities.refresh');
    expect(worker).not.toMatch(/setInterval|sendMessage|sendPush|fetch\(/);
  });
});
