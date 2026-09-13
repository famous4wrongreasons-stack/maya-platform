import {
  isC8RetentionClass,
  selectC8Retention,
  c8RetentionItem,
  purgeC8Revision,
} from './chapter8-valuation-retention';
import {
  C7_MEASUREMENT_RETENTION_CLASS,
  selectMeasurementRetention,
  measurementRetentionItem,
  purgeMeasurementRevision,
} from './chapter7-measurement-retention';
import {
  isRCPayloadClass,
  rcPayloadItem,
  rcPayloadKinds,
  selectRCPayloads,
  purgeRCPayload,
  type RCPayloadStorage,
  type RCPayloadVerifier,
} from './package5-wave-rc-payloads';
import { randomUUID } from 'node:crypto';

import { MaintenanceRun, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  WAVE6_CLASSES,
  WAVE6_LEASE_MS,
  WAVE6_POLICY_VERSION,
  Wave6Class,
  Wave6Rule,
  wave6Hash,
  wave6Request,
} from './package5-wave6.policy';

type Tx = Prisma.TransactionClient;
type Target = { id: string; stamp: Date };
type Item = { itemKind: string; itemRefHash: string };
type Plan = {
  actionClass: Wave6Class;
  rule: Wave6Rule;
  tenantId: string | null;
  scope: 'tenant' | 'platform';
  cutoffAt: Date;
  evaluatedAt: Date;
  batchSize: number;
  fingerprint: string;
};
export type Wave6Lease = { runId: string; token: string };
export type Wave6Result = {
  runId: string;
  state: string;
  deleted: number;
  skipped: number;
  byKind: Record<string, number>;
};

/** AC6 internal coordinator. There is deliberately no HTTP/AI command endpoint.
 * Scope and time come only from the server context/clock, never request data.
 * The clock dependency is a trusted construction-time seam for deterministic proof.
 */
export class Package5Wave6MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context?: TenantContextService,
    private readonly clock: () => Date = () => new Date(),
    private readonly payloadStorage?: RCPayloadStorage,
    private readonly payloadVerifier?: RCPayloadVerifier,
  ) {}

  private authority(): {
    scope: 'tenant' | 'platform';
    tenantId: string | null;
  } {
    const ctx = this.context?.get();
    if (!ctx) return { scope: 'platform', tenantId: null };
    if (ctx.source === 'system' && ctx.tenantId && !ctx.userId) {
      return { scope: 'tenant', tenantId: ctx.tenantId };
    }
    throw new Error('maintenance_system_authority_required');
  }

  private now(): Date {
    const now = this.clock();
    if (!Number.isFinite(now.getTime()))
      throw new Error('maintenance_clock_invalid');
    return now;
  }

  private plan(request: unknown): Plan {
    const { actionClass, batchSize } = wave6Request(request);
    const authority = this.authority();
    if (
      (isC8RetentionClass(actionClass) ||
        isRCPayloadClass(actionClass) ||
        actionClass === C7_MEASUREMENT_RETENTION_CLASS) &&
      authority.scope !== 'tenant'
    )
      throw new Error('maintenance_payload_requires_exact_system_tenant');
    // One deterministic server minute window; retries resume the frozen run id.
    const evaluatedAt = new Date(
      Math.floor(this.now().getTime() / 60_000) * 60_000,
    );
    const rule = WAVE6_CLASSES[actionClass];
    const cutoffAt = new Date(evaluatedAt.getTime() - rule.retentionMs);
    return this.identity({
      ...authority,
      actionClass,
      rule,
      batchSize,
      evaluatedAt,
      cutoffAt,
    });
  }

  private identity(plan: Omit<Plan, 'fingerprint'>): Plan {
    return {
      ...plan,
      fingerprint: wave6Hash(
        JSON.stringify([
          'package5.wave6.run/1',
          plan.actionClass,
          plan.rule.policyKey,
          WAVE6_POLICY_VERSION,
          plan.scope,
          plan.tenantId,
          plan.evaluatedAt.toISOString(),
          plan.cutoffAt.toISOString(),
          plan.batchSize,
        ]),
      ),
    };
  }

  private restored(run: MaintenanceRun): Plan {
    const { actionClass, batchSize } = wave6Request({
      actionClass: run.maintenanceKind,
      batchSize: run.batchSize,
    });
    const authority = this.authority();
    if (run.scope !== authority.scope || run.tenantId !== authority.tenantId) {
      throw new Error('maintenance_scope_mismatch');
    }
    const rule = WAVE6_CLASSES[actionClass];
    const evaluatedAt = new Date(run.cutoffAt.getTime() + rule.retentionMs);
    const plan = this.identity({
      ...authority,
      actionClass,
      rule,
      batchSize,
      evaluatedAt,
      cutoffAt: run.cutoffAt,
    });
    if (
      run.policyVersion !== WAVE6_POLICY_VERSION ||
      run.runIdentityVersion !== 1 ||
      run.policyKey !== rule.policyKey ||
      run.subjectClass !== rule.table ||
      run.maxItems !== batchSize ||
      run.authorityType !== 'SYSTEM_POLICY' ||
      run.requestedByUserId ||
      run.approvedByUserId ||
      run.actionExecutionId ||
      run.approvalBindingHash ||
      evaluatedAt.getTime() % 60_000 !== 0 ||
      evaluatedAt > this.now() ||
      run.runIdentityFingerprint !== plan.fingerprint
    ) {
      throw new Error('maintenance_policy_evidence_mismatch');
    }
    return plan;
  }

  private table(name: string): Prisma.Sql {
    // All callers use constants from the closed policy, never initiator identifiers.
    const allowed = [
      ...Object.values(WAVE6_CLASSES).map((r) => r.table),
      'AuthRefreshToken',
    ];
    if (!allowed.includes(name))
      throw new Error('maintenance_table_not_allowlisted');
    return Prisma.raw(`"${name}"`);
  }

  private scope(plan: Plan): Prisma.Sql {
    return plan.scope === 'platform'
      ? Prisma.sql`TRUE`
      : Prisma.sql`t."tenantId" = ${plan.tenantId}`;
  }

  private eligible(plan: Plan): Prisma.Sql {
    const expiry = Prisma.raw(`t."${plan.rule.expiry}"`);
    const first = Prisma.sql`${expiry} < ${plan.cutoffAt}`;
    if (!plan.rule.terminal) return first;
    const terminal = Prisma.raw(`t."${plan.rule.terminal}"`);
    return Prisma.sql`(${first} OR ${terminal} < ${plan.cutoffAt})`;
  }

  private item(plan: Plan, kind: string, row: Target): Item {
    return {
      itemKind: kind,
      itemRefHash: wave6Hash(
        `${plan.fingerprint}/${kind}/${row.id}/${row.stamp.getTime()}`,
      ),
    };
  }

  private manifestHash(items: Item[]): string {
    return wave6Hash(
      JSON.stringify(
        items
          .map((i) => [i.itemKind, i.itemRefHash])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    );
  }

  private async lockClass(tx: Tx, actionClass: string): Promise<void> {
    // Same class lock across platform/tenant runs avoids lock-order inversions.
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`package5.wave6/${actionClass}`}, 0))::text AS lock`,
    );
  }

  private async selection(tx: Tx, plan: Plan, lock: boolean): Promise<Item[]> {
    if (isC8RetentionClass(plan.actionClass)) {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return (await selectC8Retention(tx, plan, lock)).map((row) =>
        c8RetentionItem(plan, row),
      );
    }
    if (plan.actionClass === C7_MEASUREMENT_RETENTION_CLASS) {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return (await selectMeasurementRetention(tx, plan, lock)).map((row) =>
        measurementRetentionItem(plan, row),
      );
    }
    if (isRCPayloadClass(plan.actionClass)) {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return (
        await selectRCPayloads(tx, plan, lock, undefined, this.payloadVerifier)
      ).map((target) => rcPayloadItem(plan, target));
    }
    const rows = await tx.$queryRaw<Target[]>(Prisma.sql`
      SELECT t."id", ${Prisma.raw(`t."${plan.rule.stamp}"`)} AS stamp
      FROM ${this.table(plan.rule.table)} t
      WHERE ${this.scope(plan)} AND ${this.eligible(plan)}
      ORDER BY t."id" LIMIT ${plan.batchSize}
      ${lock ? Prisma.sql`FOR UPDATE OF t` : Prisma.empty}
    `);
    const items: Item[] = [];
    for (const row of rows) {
      const parent = this.item(plan, plan.rule.table, row);
      if (plan.rule.table !== 'AuthSession') {
        items.push(parent);
        continue;
      }
      const tokens = await tx.$queryRaw<Target[]>(Prisma.sql`
        SELECT "id", "createdAt" AS stamp FROM "AuthRefreshToken"
        WHERE "sessionId" = ${row.id} ORDER BY "id" LIMIT ${plan.batchSize + 1}
        ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
      `);
      if (tokens.length + 1 > plan.batchSize) {
        throw new Error('maintenance_session_fanout_exceeds_cap');
      }
      if (items.length + tokens.length + 1 > plan.batchSize) break;
      items.push(
        parent,
        ...tokens.map((token) => this.item(plan, 'AuthRefreshToken', token)),
      );
    }
    return items;
  }

  private async existingRun(
    tx: Tx,
    plan: Plan,
  ): Promise<MaintenanceRun | null> {
    const exact = await tx.maintenanceRun.findUnique({
      where: { runIdentityFingerprint: plan.fingerprint },
    });
    const run =
      exact ??
      (await tx.maintenanceRun.findFirst({
        where: {
          scope: plan.scope,
          tenantId: plan.tenantId,
          maintenanceKind: plan.actionClass,
          state: { in: ['PLANNED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'asc' },
      }));
    if (run) {
      this.restored(run);
      if (run.batchSize !== plan.batchSize)
        throw new Error('maintenance_existing_run_limits_frozen');
    }
    return run;
  }

  async shadow(request: unknown) {
    const plan = this.plan(request);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const existing = await this.existingRun(tx, plan);
        const resolved = existing ? this.restored(existing) : plan;
        const items = existing
          ? await tx.maintenanceItemClaim.findMany({
              where: { maintenanceRunId: existing.id },
              select: { itemKind: true, itemRefHash: true },
            })
          : await this.selection(tx, plan, false);
        if (existing && this.manifestHash(items) !== existing.cursorHash)
          throw new Error('maintenance_manifest_mismatch');
        return {
          actionClass: resolved.actionClass,
          policyKey: resolved.rule.policyKey,
          policyVersion: WAVE6_POLICY_VERSION,
          runIdentity: resolved.fingerprint,
          cutoffAt: resolved.cutoffAt,
          evaluatedAt: resolved.evaluatedAt,
          manifestHash: this.manifestHash(items),
          items,
          mutations: 0 as const,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async prepare(request: unknown): Promise<string> {
    const plan = this.plan(request);
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockClass(tx, plan.actionClass);
        const existing = await this.existingRun(tx, plan);
        if (existing) {
          this.restored(existing);
          return existing.id;
        }
        const items = await this.selection(tx, plan, true);
        const run = await tx.maintenanceRun.create({
          data: {
            scope: plan.scope,
            tenantId: plan.tenantId,
            runIdentityVersion: 1,
            runIdentityFingerprint: plan.fingerprint,
            maintenanceKind: plan.actionClass,
            subjectClass: plan.rule.table,
            policyKey: plan.rule.policyKey,
            policyVersion: WAVE6_POLICY_VERSION,
            cutoffAt: plan.cutoffAt,
            maxItems: plan.batchSize,
            batchSize: plan.batchSize,
            cursorHash: this.manifestHash(items),
            authorityType: 'SYSTEM_POLICY',
          },
        });
        if (items.length)
          await tx.maintenanceItemClaim.createMany({
            data: items.map((item) => ({ ...item, maintenanceRunId: run.id })),
          });
        return run.id;
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
  }

  private async lockedRun(tx: Tx, id: string): Promise<MaintenanceRun> {
    const rows = await tx.$queryRaw<MaintenanceRun[]>(Prisma.sql`
      SELECT * FROM "MaintenanceRun" WHERE "id" = ${id} FOR UPDATE
    `);
    if (!rows[0]) throw new Error('maintenance_run_missing');
    this.restored(rows[0]);
    return rows[0];
  }

  /** Internal worker claim. The random fencing token is never an authority override. */
  async claim(runId: string): Promise<Wave6Lease | null> {
    return this.prisma.$transaction(async (tx) => {
      const run = await this.lockedRun(tx, runId);
      if (run.state === 'SUCCEEDED') return null;
      const now = this.now();
      if (
        run.state === 'RUNNING' &&
        run.leaseExpiresAt &&
        run.leaseExpiresAt > now
      )
        return null;
      if (!['PLANNED', 'RUNNING'].includes(run.state))
        throw new Error('maintenance_run_terminal');
      const token = randomUUID();
      if (run.state === 'RUNNING')
        await tx.maintenanceItemClaim.updateMany({
          where: { maintenanceRunId: run.id, state: 'CLAIMED' },
          data: { claimGeneration: { increment: 1 } },
        });
      await tx.maintenanceRun.update({
        where: { id: run.id },
        data: {
          state: 'RUNNING',
          startedAt: run.startedAt ?? now,
          leaseOwner: 'package5.wave6.coordinator',
          leaseTokenHash: wave6Hash(token),
          leaseExpiresAt: new Date(now.getTime() + WAVE6_LEASE_MS),
        },
      });
      return { runId: run.id, token };
    });
  }

  async result(runId: string): Promise<Wave6Result> {
    const run = await this.prisma.maintenanceRun.findUniqueOrThrow({
      where: { id: runId },
    });
    this.restored(run);
    const claims = await this.prisma.maintenanceItemClaim.findMany({
      where: { maintenanceRunId: runId },
    });
    const byKind: Record<string, number> = {};
    for (const claim of claims)
      if (claim.state === 'SUCCEEDED') {
        byKind[claim.itemKind] = (byKind[claim.itemKind] ?? 0) + 1;
      }
    return {
      runId,
      state: run.state,
      deleted: run.succeededCount,
      skipped: claims.filter((c) => c.state === 'SKIPPED').length,
      byKind,
    };
  }

  async execute(runId: string): Promise<Wave6Result & { replayed: boolean }> {
    const lease = await this.claim(runId);
    if (lease) await this.commit(lease);
    return { ...(await this.result(runId)), replayed: lease === null };
  }

  /** Local deletion + all terminal claims + run finalization commit atomically. */
  async commit(lease: Wave6Lease): Promise<void> {
    // Read-only lookup only chooses the fixed lock key; authority is checked under lock.
    const initial = await this.prisma.maintenanceRun.findUniqueOrThrow({
      where: { id: lease.runId },
    });
    const initialPlan = this.restored(initial);
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockClass(tx, initialPlan.actionClass);
        const run = await this.lockedRun(tx, lease.runId);
        const plan = this.restored(run);
        const now = this.now();
        if (
          run.state !== 'RUNNING' ||
          run.leaseTokenHash !== wave6Hash(lease.token) ||
          !run.leaseExpiresAt ||
          run.leaseExpiresAt <= now
        )
          throw new Error('maintenance_lease_fenced');
        const claims = await tx.maintenanceItemClaim.findMany({
          where: { maintenanceRunId: run.id },
        });
        const payload = isRCPayloadClass(plan.actionClass);
        if (
          payload ||
          isC8RetentionClass(plan.actionClass) ||
          plan.actionClass === C7_MEASUREMENT_RETENTION_CLASS
        )
          await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        const allowedKinds: string[] = payload
          ? rcPayloadKinds(plan.actionClass)
          : [plan.rule.table];
        if (plan.rule.table === 'AuthSession')
          allowedKinds.push('AuthRefreshToken');
        if (
          claims.length > run.maxItems ||
          claims.some(
            (c) => c.state !== 'CLAIMED' || !allowedKinds.includes(c.itemKind),
          ) ||
          this.manifestHash(claims) !== run.cursorHash
        )
          throw new Error('maintenance_manifest_mismatch');
        const deleted = new Set<string>();
        if (isC8RetentionClass(plan.actionClass)) {
          for (const target of await selectC8Retention(tx, plan, true, run.id))
            if (await purgeC8Revision(tx, plan, target))
              deleted.add(c8RetentionItem(plan, target).itemRefHash);
        } else if (plan.actionClass === C7_MEASUREMENT_RETENTION_CLASS) {
          for (const target of await selectMeasurementRetention(
            tx,
            plan,
            true,
            run.id,
          ))
            if (await purgeMeasurementRevision(tx, plan, target))
              deleted.add(measurementRetentionItem(plan, target).itemRefHash);
        } else if (payload) {
          const targets = await selectRCPayloads(
            tx,
            plan,
            true,
            run.id,
            this.payloadVerifier,
          );
          for (const target of targets)
            if (await purgeRCPayload(tx, plan, target, this.payloadStorage))
              deleted.add(rcPayloadItem(plan, target).itemRefHash);
        } else {
          const stamp = Prisma.raw(`t."${plan.rule.stamp}"`);
          const prefix = `${plan.fingerprint}/${plan.rule.table}/`;
          const targets = await tx.$queryRaw<Target[]>(Prisma.sql`
        SELECT t."id", ${stamp} AS stamp FROM ${this.table(plan.rule.table)} t
        JOIN "MaintenanceItemClaim" c ON c."maintenanceRunId" = ${run.id}
          AND c."itemKind" = ${plan.rule.table}
          AND c."itemRefHash" = encode(sha256(convert_to(${prefix} || t."id" || '/' ||
            floor(extract(epoch FROM ${stamp}) * 1000)::bigint::text, 'UTF8')), 'hex')
        WHERE ${this.scope(plan)} AND ${this.eligible(plan)}
        ORDER BY t."id" LIMIT ${run.maxItems} FOR UPDATE OF t
      `);
          const claimed = new Set(claims.map((c) => c.itemRefHash));
          for (const target of targets) {
            const cascade: Item[] = [];
            if (plan.rule.table === 'AuthSession') {
              const tokens = await tx.$queryRaw<Target[]>(Prisma.sql`
            SELECT "id", "createdAt" AS stamp FROM "AuthRefreshToken"
            WHERE "sessionId" = ${target.id} ORDER BY "id" LIMIT ${run.maxItems + 1} FOR UPDATE
          `);
              cascade.push(
                ...tokens.map((t) => this.item(plan, 'AuthRefreshToken', t)),
              );
              if (
                cascade.some((i) => !claimed.has(i.itemRefHash)) ||
                cascade.length + 1 > run.maxItems
              ) {
                throw new Error('maintenance_unclaimed_cascade_forbidden');
              }
            }
            const removed = await tx.$queryRaw<
              Array<{ id: string }>
            >(Prisma.sql`
          DELETE FROM ${this.table(plan.rule.table)} t
          WHERE t."id" = ${target.id} AND ${this.scope(plan)} AND ${this.eligible(plan)} RETURNING t."id"
        `);
            if (removed.length === 1) {
              deleted.add(this.item(plan, plan.rule.table, target).itemRefHash);
              for (const item of cascade) deleted.add(item.itemRefHash);
            }
          }
        }
        for (const claim of claims) {
          const success = deleted.has(claim.itemRefHash);
          await tx.maintenanceItemClaim.update({
            where: { id: claim.id },
            data: {
              state: success ? 'SUCCEEDED' : 'SKIPPED',
              outcomeCode: success
                ? payload
                  ? 'approved_payload_purged'
                  : 'approved_retention_deleted'
                : 'absent_or_no_longer_eligible',
              finishedAt: now,
            },
          });
        }
        await tx.maintenanceRun.update({
          where: { id: run.id },
          data: {
            state: 'SUCCEEDED',
            attemptedCount: claims.length,
            succeededCount: deleted.size,
            finishedAt: now,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
          },
        });
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
  }
}
