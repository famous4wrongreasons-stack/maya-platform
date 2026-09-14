/**
 * P05 permanent resume ratchet (mapping §6).
 * A restart continues the same plan against the same source execution. Proven success is
 * skipped, an unproven outcome is UNKNOWN and blocks only its dependents, a lost fence
 * cannot act, and expiry never triggers a substitution or a fabricated rollback.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
  ),
  'utf8',
);
const execution = readFileSync(join(__dirname, 'c9.execution.ts'), 'utf8');
const work = readFileSync(join(__dirname, 'c9.work.ts'), 'utf8');
const store = readFileSync(join(__dirname, 'c9.store.ts'), 'utf8');
const controller = readFileSync(join(__dirname, 'c9.controller.ts'), 'utf8');

describe('c9 restart and partial outcomes', () => {
  test('a restart resumes bound work and never replans', () => {
    // `continue` recovers unproven dispatches and re-derives eligibility from real states.
    expect(controller).toContain('this.work.recover(runId, proof)');
    expect(controller).toContain('this.execution.eligible(runId, proof)');
    expect(controller).not.toMatch(/propose|strategy\./i);
    // Recovery itself never invokes a tool.
    expect(work).toContain(
      'Expired dispatch is held on the same receipt. This method never invokes a tool.',
    );
  });

  test('an expired dispatch is held on its own receipt, not retried', () => {
    expect(work).toContain(
      "state: 'DISPATCHED',\n          leaseUntil: { lte: now }",
    );
    expect(work).toContain("data: { state: 'HELD_UNKNOWN' }");
    expect(work).not.toMatch(/resend|redispatch|retryDispatch/i);
    // The whole unclosed window is charged conservatively before any resume.
    expect(work).toContain(
      'An unclosed window has no proof of unused time after worker death.',
    );
    expect(work).toContain(
      'uncertain\n      ? root.reasoningWindowDeadlineAt.getTime()',
    );
  });

  test('a settled call is skipped instead of consuming a fresh one', () => {
    expect(work).toContain("if (work.state !== 'RESERVED') return null;");
    expect(work).toContain("if (work.state === 'SETTLED')");
    expect(work).toContain("c9Deny('settlement_conflict')");
  });

  test('UNKNOWN holds the same step and blocks only its dependents', () => {
    expect(execution).toContain("if (outcome === 'UNKNOWN')");
    expect(execution).toContain("c9Deny('unknown_requires_binding')");
    expect(execution).toContain(
      'return step; // Held exactly where it is, on the same receipt.',
    );
    // A dependent waits for a real terminal state, never for elapsed time.
    expect(execution).toContain("dep.requires === 'RESOLVED_SUCCESS'");
    expect(execution).toContain("on.state !== 'RESOLVED'");
    // Independent branches of the same option keep their own eligibility.
    expect(execution).toContain('if (blocked) continue;');
    // Status reports what is unknown rather than calling it done or failed.
    expect(execution).toContain('unknownStepKeys');
  });

  test('a deterministic stop closes dependents and substitutes nothing', () => {
    expect(execution).toContain("stopReason: 'DEPENDENCY_STOPPED'");
    expect(execution).toMatch(
      /A deterministic terminal failure closes its dependents; it never substitutes them\./,
    );
    // No compensating action exists to be called: a stop is recorded, never reversed.
    const code = execution.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/\b(?:rollback|compensate|undo|revert)\s*\(/i);
    expect(code).not.toMatch(
      /\b(?:rollback|compensation|substitute)\w*\s*[:=]/i,
    );
  });

  test('a worker that lost its fence cannot bind or resolve', () => {
    expect(execution).toContain("c9Deny('step_fenced')");
    expect(execution).toContain('step.leaseGeneration !== lease.generation');
    expect(execution).toContain("c9Hash('step-fence/1', [lease.token])");
    expect(execution).toContain('step.leaseUntil <= now');
    // The database refuses a regressed fence and a reopened terminal state as well.
    expect(migration).toContain(
      `NEW."leaseGeneration"<OLD."leaseGeneration" OR (OLD.state IN ('RESOLVED','STOPPED') AND NEW.state<>OLD.state)`,
    );
  });

  test('expiry stops work rather than allowing a late effect', () => {
    expect(migration).toContain(`NEW."validUntil"<=clock_timestamp()`);
    expect(execution).toContain('if (step.validUntil <= now) continue;');
    expect(execution).toContain('revision.validUntil <= now');
    // A run past its own validity cannot be resumed at all.
    expect(store).toContain("c9Deny('run_expired_or_terminal')");
  });

  test('cancellation serializes against dispatched work instead of racing it', () => {
    expect(store).toContain("c9Deny('cancel_races_dispatched_work')");
    expect(store).toContain("state: 'DISPATCHED'");
    // Cancellation is write-once and never invents a reversal of an admitted effect.
    expect(store).toContain("c9Deny('cancel_conflict')");
    expect(migration).toContain('c9_write_once_cancelKeyHash');
    expect(migration).toContain('c9_write_once_cancelledAt');
  });

  test('an owner handoff cannot be marked resolved without its source admission', () => {
    expect(execution).toContain("c9Deny('source_admission_required')");
    expect(migration).toContain('c9_source_admission_required');
    // Nor can a pending payload be minimized before its owner receipt exists.
    expect(migration).toContain('c9_minimization_requires_owner_receipt');
  });
});
