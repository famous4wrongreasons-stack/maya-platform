import { Injectable } from '@nestjs/common';
import { C9Run, C9WorkReceipt, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { C9Store, C9Tx, c9Insert } from './c9.store';
import {
  C9Domain,
  C9Object,
  C9_TASKS,
  c9Bytes,
  c9Deny,
  c9Hash,
  c9Id,
  c9Refs,
} from './c9.contract';
import { C9_REGISTRY_HASH, c9Capability } from './c9.registry';
import { c9Reservation, c9Usage } from './c9.budget';

export type C9WorkDraft = {
  callKey: string;
  domain: C9Domain | 'ORCHESTRATOR';
  kind: 'MODEL' | 'TOOL_READ' | 'OWNER_HANDOFF';
  taskKey: string;
  inputHash: string;
  evidenceRefs: unknown[];
  reservation: unknown;
  revisionId?: string;
  skillHash?: string;
  providerModelKey?: string;
};
export type C9WorkLease = {
  runId: string;
  workId: string;
  generation: number;
  token: string;
};
async function project(tx: C9Tx, root: C9Run, now: Date, state?: string) {
  const [r] = await tx.$queryRaw<
    { budget: Prisma.InputJsonObject }[]
  >`SELECT "C9_validate_budget"(${root.tenantId},${root.id}::uuid) budget`;
  return tx.c9Run.update({
    where: { id: root.id },
    data: {
      budgetStateJson: r.budget,
      counterVersion: { increment: 1 },
      updatedAt: now,
      ...(state ? { state } : {}),
    },
  });
}
/** Resource receipts do not execute source mutations. All external dispatch is a caller's named existing owner. */
@Injectable()
export class C9WorkService {
  constructor(private readonly store: C9Store) {}
  reserve(runId: string, input: C9WorkDraft, channelProof?: string) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const root = await this.store.lock(tx, p, runId, false, now),
        reservation = c9Reservation(input.reservation) as C9Object,
        refs = c9Refs(input.evidenceRefs) as C9Object[];
      if (input.kind === 'MODEL') {
        if (!C9_TASKS.includes(input.taskKey as (typeof C9_TASKS)[number]))
          c9Deny('unregistered_model_task');
        // No paid activation is inferred from absent release/billing configuration.
        c9Deny('paid_capability_not_activated');
      }
      if (input.domain === 'ORCHESTRATOR')
        c9Deny('tool_requires_registered_domain');
      const cap = c9Capability(input.taskKey, input.domain);
      if (
        (input.kind === 'TOOL_READ' && cap.mode !== 'READ') ||
        (input.kind === 'OWNER_HANDOFF' && cap.mode === 'READ')
      )
        c9Deny('work_capability_mode');
      if (
        reservation.domain !== input.domain ||
        reservation.modelCalls !== 0 ||
        reservation.toolCalls !== 1 ||
        reservation.costMicros !== '0' ||
        reservation.priceHash !== null ||
        reservation.zeroCostEvidenceRef !==
          `local:${cap.toolOrInterface}:no-provider-charge`
      )
        c9Deny('unverified_cost_basis');
      const callKeyHash = c9Hash('call-key/1', [
          p.tenantId,
          runId,
          c9Id(input.callKey),
        ]),
        hash = c9Hash('call-intent/1', [
          input.domain,
          input.kind,
          input.taskKey,
          input.inputHash,
          refs,
          reservation,
          input.revisionId ?? null,
          C9_REGISTRY_HASH,
        ]);
      const existing = await tx.c9WorkReceipt.findFirst({
        where: { tenantId: p.tenantId, runId, callKeyHash },
      });
      if (existing) {
        if (existing.inputHash !== hash) c9Deny('idempotency_conflict');
        return existing;
      }
      await this.store.lock(tx, p, runId, true, now);
      await this.store.validateRefs(tx, p, refs, now);
      const r = await c9Insert<C9WorkReceipt>(tx, 'C9WorkReceipt', {
        id: randomUUID(),
        tenantId: p.tenantId,
        runId,
        revisionId: input.revisionId ?? null,
        callKeyHash,
        domain: input.domain,
        kind: input.kind,
        taskKey: input.taskKey,
        registryHash: C9_REGISTRY_HASH,
        skillHash: input.skillHash ?? null,
        inputHash: hash,
        inputEvidenceRefsJson: refs,
        providerModelKey: input.providerModelKey ?? null,
        priceBasisJson: null,
        reservationJson: reservation,
        usageJson: null,
        state: 'RESERVED',
        resultJson: null,
        resultHash: null,
        startedAt: null,
        settledAt: null,
        admittedAt: now,
        retentionUntil: new Date(
          Math.min(
            root.retentionUntil.getTime(),
            ...refs.flatMap((ref) =>
              [ref.validUntil, ref.retentionUntil]
                .filter((v): v is string => typeof v === 'string')
                .map(Date.parse),
            ),
            ...(input.revisionId
              ? [
                  (
                    await tx.c9StrategyRevision.findFirstOrThrow({
                      where: {
                        id: input.revisionId,
                        tenantId: p.tenantId,
                        runId,
                      },
                    })
                  ).retentionUntil.getTime(),
                ]
              : []),
          ),
        ),
        leaseGeneration: 0,
        leaseTokenHash: null,
        leaseUntil: null,
      });
      await project(tx, root, now);
      return r;
    });
  }
  claim(
    runId: string,
    workId: string,
    channelProof?: string,
  ): Promise<C9WorkLease | null> {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const root = await this.store.lock(tx, p, runId, true, now),
        work = await tx.c9WorkReceipt.findFirst({
          where: { id: workId, tenantId: p.tenantId, runId },
        });
      if (!work) c9Deny('work_scope');
      if (work.state !== 'RESERVED') return null;
      const manifest = root.budgetManifestJson as C9Object;
      if (
        root.reasoningWindowDeadlineAt &&
        root.reasoningWindowDeadlineAt <= now
      ) {
        // An unclosed window has no proof of unused time after worker death.
        const charge =
          root.reasoningWindowDeadlineAt.getTime() -
          root.reasoningWindowStartedAt!.getTime();
        await tx.c9Run.update({
          where: { id: root.id },
          data: {
            state: 'STOPPED',
            reasoningUsedMs: Math.min(120000, root.reasoningUsedMs + charge),
            reasoningWindowStartedAt: null,
            reasoningWindowDeadlineAt: null,
            counterVersion: { increment: 1 },
            updatedAt: now,
          },
        });
        return null;
      }
      const active = await tx.c9WorkReceipt.count({
        where: { tenantId: p.tenantId, runId, state: 'DISPATCHED' },
      });
      if (active >= (manifest.parallelDomainsMax as number)) return null;
      const cap = c9Capability(
        work.taskKey,
        work.domain as C9Domain,
        work.registryHash,
      );
      const remaining =
        (manifest.reasoningMsMax as number) - root.reasoningUsedMs;
      if (remaining <= 0) return null;
      const deadline =
        root.reasoningWindowDeadlineAt ??
        new Date(
          Math.min(now.getTime() + remaining, root.validUntil.getTime()),
        );
      const token = randomUUID(),
        generation = work.leaseGeneration + 1;
      if (!root.reasoningWindowStartedAt)
        await tx.c9Run.update({
          where: { id: root.id },
          data: {
            reasoningWindowStartedAt: now,
            reasoningWindowDeadlineAt: deadline,
            counterVersion: { increment: 1 },
            updatedAt: now,
          },
        });
      await tx.c9WorkReceipt.update({
        where: { id: workId },
        data: {
          state: 'DISPATCHED',
          startedAt: now,
          leaseGeneration: generation,
          leaseTokenHash: c9Hash('work-fence/1', [token]),
          leaseUntil: new Date(
            Math.min(deadline.getTime(), now.getTime() + cap.timeoutMs),
          ),
        },
      });
      return { runId, workId, generation, token };
    });
  }
  settle(
    lease: C9WorkLease,
    result: unknown,
    usage: unknown,
    channelProof?: string,
  ) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const root = await this.store.lock(tx, p, lease.runId, false, now),
        work = await tx.c9WorkReceipt.findFirst({
          where: { id: lease.workId, tenantId: p.tenantId, runId: root.id },
        });
      if (
        !work ||
        work.leaseGeneration !== lease.generation ||
        work.leaseTokenHash !== c9Hash('work-fence/1', [lease.token])
      )
        c9Deny('work_fenced');
      const actual = c9Usage(usage) as C9Object;
      c9Bytes(result, 32768);
      const resultHash = c9Hash('work-result/1', [result]);
      if (work.state === 'SETTLED') {
        if (
          work.resultHash !== resultHash ||
          c9Hash('usage/1', [work.usageJson]) !== c9Hash('usage/1', [actual])
        )
          c9Deny('settlement_conflict');
        return work;
      }
      if (
        work.state !== 'DISPATCHED' ||
        !work.leaseUntil ||
        work.leaseUntil <= now
      )
        c9Deny('work_fenced');
      if (
        actual.costMicros !== '0' ||
        actual.priceHash !== null ||
        actual.completionKind !== 'CONFIRMED'
      )
        c9Deny('unverified_usage');
      await tx.$executeRaw`SELECT set_config('maya.c9_work_fence',${work.leaseTokenHash},true)`;
      const settled = await tx.c9WorkReceipt.update({
        where: { id: work.id },
        data: {
          state: 'SETTLED',
          usageJson: actual as Prisma.InputJsonObject,
          resultJson: result as Prisma.InputJsonValue,
          resultHash,
          settledAt: now,
        },
      });
      const [measured] = await tx.$queryRaw<
        { budget: C9Object }[]
      >`SELECT "C9_validate_budget"(${p.tenantId},${root.id}::uuid,${JSON.stringify(settled)}::jsonb) budget`;
      const tokens = measured.budget.tokens as Record<
          string,
          Record<string, number>
        >,
        limits = root.budgetManifestJson as C9Object;
      const overrun =
        Object.values(tokens.input).reduce((a, b) => a + b, 0) >
          Number(limits.inputTokensMax) ||
        Object.values(tokens.output).reduce((a, b) => a + b, 0) >
          Number(limits.outputTokensMax);
      if (overrun)
        await tx.c9Run.update({
          where: { id: root.id },
          data: {
            state: 'STOPPED',
            counterVersion: { increment: 1 },
            updatedAt: now,
          },
        });
      await this.pauseWhenIdle(tx, root, now, false);
      await project(tx, root, now);
      return settled;
    });
  }
  hold(lease: C9WorkLease, channelProof?: string) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const root = await this.store.lock(tx, p, lease.runId, false, now),
        w = await tx.c9WorkReceipt.findFirst({
          where: { id: lease.workId, tenantId: p.tenantId, runId: root.id },
        });
      if (
        !w ||
        w.leaseGeneration !== lease.generation ||
        w.leaseTokenHash !== c9Hash('work-fence/1', [lease.token])
      )
        c9Deny('work_fenced');
      if (w.state === 'HELD_UNKNOWN' || w.state === 'SETTLED') return w;
      if (w.state !== 'DISPATCHED') c9Deny('work_not_dispatched');
      await tx.$executeRaw`SELECT set_config('maya.c9_work_fence',${w.leaseTokenHash},true)`;
      const result = await tx.c9WorkReceipt.update({
        where: { id: w.id },
        data: { state: 'HELD_UNKNOWN' },
      });
      await this.pauseWhenIdle(
        tx,
        root,
        now,
        !w.leaseUntil || w.leaseUntil <= now,
      );
      await project(tx, root, now);
      return result;
    });
  }
  /** Expired dispatch is held on the same receipt. This method never invokes a tool. */
  recover(runId: string, channelProof?: string) {
    return this.store.transaction(channelProof, async (tx, p, now) => {
      const root = await this.store.lock(tx, p, runId, false, now);
      const expired = await tx.c9WorkReceipt.findMany({
        where: {
          tenantId: p.tenantId,
          runId,
          state: 'DISPATCHED',
          leaseUntil: { lte: now },
        },
        orderBy: { id: 'asc' },
      });
      for (const w of expired) {
        await tx.$executeRaw`SELECT set_config('maya.c9_work_recovery',${w.id},true)`;
        await tx.c9WorkReceipt.update({
          where: { id: w.id },
          data: { state: 'HELD_UNKNOWN' },
        });
      }
      if (expired.length) {
        await this.pauseWhenIdle(tx, root, now, true);
        await project(tx, root, now);
      }
      return tx.c9WorkReceipt.findMany({
        where: { tenantId: p.tenantId, runId },
        select: { id: true, state: true, callKeyHash: true },
        orderBy: { id: 'asc' },
      });
    });
  }
  private async pauseWhenIdle(
    tx: C9Tx,
    root: C9Run,
    now: Date,
    uncertain: boolean,
  ) {
    if (
      !root.reasoningWindowStartedAt ||
      !root.reasoningWindowDeadlineAt ||
      (await tx.c9WorkReceipt.count({
        where: { tenantId: root.tenantId, runId: root.id, state: 'DISPATCHED' },
      }))
    )
      return;
    const end = uncertain
      ? root.reasoningWindowDeadlineAt.getTime()
      : Math.min(now.getTime(), root.reasoningWindowDeadlineAt.getTime());
    const used =
      root.reasoningUsedMs +
      Math.max(0, end - root.reasoningWindowStartedAt.getTime());
    await tx.c9Run.update({
      where: { id: root.id },
      data: {
        reasoningUsedMs: used,
        reasoningWindowStartedAt: null,
        reasoningWindowDeadlineAt: null,
        counterVersion: { increment: 1 },
        updatedAt: now,
        ...(used >= Number((root.budgetManifestJson as C9Object).reasoningMsMax)
          ? { state: 'STOPPED' }
          : {}),
      },
    });
  }
}
