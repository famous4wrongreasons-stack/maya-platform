import { Injectable } from '@nestjs/common';
import {
  C9PlanStep,
  C9Run,
  C9StepBinding,
  C9StrategyRevision,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { C9Store, C9Tx, c9Insert } from './c9.store';
import {
  C9Object,
  C9Principal,
  C9_SOURCES,
  c9Deny,
  c9Enum,
  c9Hash,
  c9HashValue,
  c9Id,
  c9Nullable,
  c9Object,
  c9Refs,
  c9Shape,
} from './c9.contract';

export type C9StepLease = {
  runId: string;
  stepId: string;
  generation: number;
  token: string;
};
/** An attachment to something an existing owner already admitted. C9 never creates it. */
export const c9Binding = c9Shape({
  bindingKind: c9Enum('APPROVAL', 'EXECUTION', 'OUTCOME', 'ASSIGNMENT'),
  slotKey: c9Id,
  ownerKey: c9Id,
  sourceType: c9Enum(...C9_SOURCES),
  sourceId: c9Id,
  sourceIdentityHash: c9HashValue,
  sourceIntentHash: c9HashValue,
  sourceApprovalHash: c9Nullable(c9HashValue),
  lineage: c9Shape({
    tenantId: c9Id,
    subjectRefs: c9Refs,
    sourceActorRef: c9Nullable(c9Id),
    sourcePolicyRef: c9Nullable(c9Id),
    sourceApprovalRef: c9Nullable(c9Id),
    sourceExecutionRefs: c9Refs,
    ownerRootRef: c9Nullable(c9Id),
  }),
});

/**
 * P05 execution coordination. It advances the reviewed plan and attaches receipts that
 * source owners produced; it performs no effect of its own.
 *
 * Three separations are load-bearing and are enforced here as well as in the database:
 * a coordination review is not a source approval, a lost fence cannot dispatch, and an
 * unproven outcome is UNKNOWN — which blocks its dependents and never invents a rollback,
 * a substitution or a resend.
 */
@Injectable()
export class C9Execution {
  constructor(private readonly store: C9Store) {}

  /**
   * Promote the reviewed option's waiting steps whose dependencies are satisfied.
   * A dependency is satisfied only by a real terminal state of an earlier step in the
   * same option, never by elapsed time or by an assumption about a pending one.
   */
  eligible(runId: string, channelProof?: string) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const { root, revision } = await this.selected(tx, p, runId, now);
      const steps = await tx.c9PlanStep.findMany({
        where: {
          tenantId: p.tenantId,
          revisionId: revision.id,
          optionKey: revision.selectedOptionKey!,
        },
        orderBy: { ordinal: 'asc' },
      });
      if (revision.state === 'ADMITTED')
        await tx.c9StrategyRevision.update({
          where: { id: revision.id },
          data: { state: 'EXECUTING' },
        });
      const byKey = new Map(steps.map((s) => [s.stepKey, s]));
      const promoted: string[] = [];
      for (const step of steps) {
        if (step.state !== 'WAITING') continue;
        if (step.validUntil <= now) continue;
        const blocked = (step.dependenciesJson as C9Object[]).some((dep) => {
          const on = byKey.get(dep.stepKey as string);
          if (!on) return true;
          return dep.requires === 'RESOLVED_SUCCESS'
            ? on.state !== 'RESOLVED'
            : !['BOUND', 'RESOLVED'].includes(on.state);
        });
        if (blocked) continue;
        await tx.c9PlanStep.update({
          where: { id: step.id },
          data: { state: 'ELIGIBLE', updatedAt: now },
        });
        promoted.push(step.stepKey);
      }
      await tx.c9Run.update({
        where: { id: root.id },
        data: {
          state: 'EXECUTING',
          counterVersion: { increment: 1 },
          updatedAt: now,
        },
      });
      return { runId, revisionId: revision.id, promoted };
    });
  }

  /** Fenced claim. A worker that loses this fence can no longer bind or resolve. */
  claim(
    runId: string,
    stepId: string,
    channelProof?: string,
  ): Promise<C9StepLease | null> {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const { revision } = await this.selected(tx, p, runId, now);
      const step = await tx.c9PlanStep.findFirst({
        where: {
          id: c9Id(stepId) as string,
          tenantId: p.tenantId,
          revisionId: revision.id,
        },
      });
      if (!step) c9Deny('step_scope');
      if (step.state !== 'ELIGIBLE') return null;
      const token = randomUUID(),
        generation = step.leaseGeneration + 1;
      await tx.c9PlanStep.update({
        where: { id: step.id },
        data: {
          state: 'CLAIMED',
          leaseGeneration: generation,
          leaseTokenHash: c9Hash('step-fence/1', [token]),
          leaseUntil: new Date(
            Math.min(step.validUntil.getTime(), now.getTime() + 60_000),
          ),
          updatedAt: now,
        },
      });
      return { runId, stepId: step.id, generation, token };
    });
  }

  /**
   * Attach an existing owner receipt under the current fence. The database independently
   * verifies that an EXECUTION attachment names a real, non-dry-run ActionExecution whose
   * fingerprint and input hash match, on an OWNER_HANDOFF step of the accepted option —
   * so a coordination review by itself can never satisfy a source approval.
   */
  bind(lease: C9StepLease, binding: unknown, channelProof?: string) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const step = await this.fenced(tx, p, lease, now);
      const b = c9Binding(binding) as C9Object,
        lineage = c9Object(b.lineage);
      if (lineage.tenantId !== p.tenantId) c9Deny('binding_tenant');
      const bindingHash = c9Hash('binding/1', [
        step.id,
        b.bindingKind,
        b.slotKey,
        b.ownerKey,
        b.sourceType,
        b.sourceId,
        b.sourceIdentityHash,
        b.sourceIntentHash,
        b.sourceApprovalHash,
        lineage,
      ]);
      const existing = await tx.c9StepBinding.findFirst({
        where: {
          tenantId: p.tenantId,
          stepId: step.id,
          bindingKind: b.bindingKind as string,
          slotKey: b.slotKey as string,
        },
      });
      // A retry after an unproven attempt returns the same attachment; it never adds a second.
      if (existing) {
        if (existing.bindingHash !== bindingHash) c9Deny('binding_conflict');
        return existing;
      }
      const row = await c9Insert<C9StepBinding>(tx, 'C9StepBinding', {
        id: randomUUID(),
        tenantId: p.tenantId,
        stepId: step.id,
        bindingKind: b.bindingKind,
        slotKey: b.slotKey,
        ownerKey: b.ownerKey,
        sourceType: b.sourceType,
        sourceId: b.sourceId,
        sourceIdentityHash: b.sourceIdentityHash,
        sourceIntentHash: b.sourceIntentHash,
        sourceApprovalHash: b.sourceApprovalHash,
        bindingHash,
        lineageJson: lineage,
        boundAt: now,
        validUntil: step.validUntil,
        retentionUntil: step.retentionUntil,
      });
      await tx.c9PlanStep.update({
        where: { id: step.id },
        data: { state: 'BOUND', updatedAt: now },
      });
      return row;
    });
  }

  /**
   * Record the outcome the source reports. `UNKNOWN` is not a failure: the step stays
   * bound, its dependents stay blocked, and independent branches of the same option keep
   * their own eligibility. Nothing is resent and no rollback is fabricated.
   */
  resolve(
    lease: C9StepLease,
    outcome: 'RESOLVED' | 'UNKNOWN' | 'STOPPED',
    reason: string | null,
    channelProof?: string,
  ) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const step = await this.fenced(tx, p, lease, now);
      if (outcome === 'UNKNOWN') {
        if (step.state !== 'BOUND') c9Deny('unknown_requires_binding');
        return step; // Held exactly where it is, on the same receipt.
      }
      if (outcome === 'RESOLVED') {
        if (step.kind === 'OWNER_HANDOFF' && step.state !== 'BOUND')
          c9Deny('source_admission_required');
        return tx.c9PlanStep.update({
          where: { id: step.id },
          data: {
            state: 'RESOLVED',
            terminalAt: now,
            stopReason: 'RESOLVED',
            updatedAt: now,
          },
        });
      }
      const stopped = await tx.c9PlanStep.update({
        where: { id: step.id },
        data: {
          state: 'STOPPED',
          terminalAt: now,
          stopReason: (c9Id(reason ?? 'STOPPED') as string).slice(0, 128),
          updatedAt: now,
        },
      });
      // A deterministic terminal failure closes its dependents; it never substitutes them.
      const siblings = await tx.c9PlanStep.findMany({
        where: {
          tenantId: p.tenantId,
          revisionId: step.revisionId,
          optionKey: step.optionKey,
          state: { in: ['WAITING', 'ELIGIBLE'] },
        },
      });
      for (const dependent of siblings)
        if (
          (dependent.dependenciesJson as C9Object[]).some(
            (d) => d.stepKey === step.stepKey,
          )
        )
          await tx.c9PlanStep.update({
            where: { id: dependent.id },
            data: {
              state: 'STOPPED',
              terminalAt: now,
              stopReason: 'DEPENDENCY_STOPPED',
              updatedAt: now,
            },
          });
      return stopped;
    });
  }

  /** Current honest status of the reviewed option, including what is still unknown. */
  status(runId: string, channelProof?: string) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const { revision } = await this.selected(tx, p, runId, now);
      const steps = await tx.c9PlanStep.findMany({
        where: {
          tenantId: p.tenantId,
          revisionId: revision.id,
          optionKey: revision.selectedOptionKey!,
        },
        orderBy: { ordinal: 'asc' },
      });
      const bindings = await tx.c9StepBinding.findMany({
        where: { tenantId: p.tenantId, stepId: { in: steps.map((s) => s.id) } },
        select: {
          stepId: true,
          bindingKind: true,
          slotKey: true,
          sourceType: true,
          ownerKey: true,
        },
      });
      const unknown = steps.filter(
        (s) => s.state === 'BOUND' && s.terminalAt === null,
      );
      return {
        contract: 'maya.c9-execution-status/1',
        runId,
        revisionId: revision.id,
        optionKey: revision.selectedOptionKey,
        steps: steps.map((s) => ({
          stepKey: s.stepKey,
          ordinal: s.ordinal,
          domain: s.domain,
          kind: s.kind,
          state: s.state,
          stopReason: s.stopReason,
        })),
        bindings,
        // Reported as unknown, never as done and never as failed.
        unknownStepKeys: unknown.map((s) => s.stepKey),
        completeness: steps.every((s) => s.state === 'RESOLVED')
          ? 'COMPLETE'
          : unknown.length || steps.some((s) => s.state !== 'STOPPED')
            ? 'PARTIAL'
            : 'UNAVAILABLE',
      };
    });
  }

  private async selected(
    tx: C9Tx,
    p: C9Principal,
    runId: string,
    now: Date,
  ): Promise<{ root: C9Run; revision: C9StrategyRevision }> {
    const root = await this.store.lock(tx, p, runId, true, now);
    const revision = await tx.c9StrategyRevision.findFirst({
      where: {
        tenantId: p.tenantId,
        runId,
        revision: root.currentRevision,
      },
    });
    if (
      !revision ||
      revision.reviewDecision !== 'ACCEPTED' ||
      !revision.selectedOptionKey ||
      revision.validUntil <= now
    )
      c9Deny('reviewed_plan_required');
    return { root, revision };
  }
  private async fenced(
    tx: C9Tx,
    p: C9Principal,
    lease: C9StepLease,
    now: Date,
  ): Promise<C9PlanStep> {
    await this.store.lock(tx, p, lease.runId, true, now);
    const step = await tx.c9PlanStep.findFirst({
      where: { id: lease.stepId, tenantId: p.tenantId },
    });
    if (
      !step ||
      step.leaseGeneration !== lease.generation ||
      step.leaseTokenHash !== c9Hash('step-fence/1', [lease.token]) ||
      !step.leaseUntil ||
      step.leaseUntil <= now
    )
      c9Deny('step_fenced');
    return step;
  }
}
