import { Injectable } from '@nestjs/common';
import { C9Run, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import { EncryptionService } from '../encryption/encryption.service';
import { C9Authority } from './c9.authority';
import { C9RequestIdentity, c9PrincipalHash } from './c9.identity';
import { C9Sources } from './c9.sources';
import { c9OwnerDraft } from './c9.inputs';
import { C9_REGISTRY_HASH, c9Capability } from './c9.registry';
import { c9Budget, c9DefaultBudget, c9EmptyBudget } from './c9.budget';
import {
  C9Domain,
  C9Object,
  C9Principal,
  C9_RETENTION,
  c9Alternative,
  c9Array,
  c9Bytes,
  c9Constraints,
  c9CollectRefs,
  c9Dependencies,
  c9Deny,
  c9Hash,
  c9Id,
  c9Instant,
  c9Objective,
  c9Refs,
  c9Request,
  c9SafeText,
  c9Skills,
  c9StepBudget,
} from './c9.contract';

export type C9Tx = Prisma.TransactionClient;
export type C9Table =
  | 'C9Run'
  | 'C9StrategyRevision'
  | 'C9PlanStep'
  | 'C9StepBinding'
  | 'C9WorkReceipt';
export const C9_TABLES: readonly C9Table[] = [
  'C9Run',
  'C9StrategyRevision',
  'C9PlanStep',
  'C9StepBinding',
  'C9WorkReceipt',
];
export async function c9Insert<T>(
  tx: C9Tx,
  table: C9Table,
  row: C9Object,
): Promise<T> {
  if (!C9_TABLES.includes(table)) c9Deny('table');
  const name = Prisma.raw('"' + table + '"');
  const [result] = await tx.$queryRaw<T[]>(
    Prisma.sql`INSERT INTO ${name} SELECT * FROM jsonb_populate_record(NULL::${name}, ${JSON.stringify(row)}::jsonb) RETURNING *`,
  );
  return result;
}
export async function c9PgHash(tx: C9Tx, tuple: unknown): Promise<string> {
  const [row] = await tx.$queryRaw<
    { hash: string }[]
  >`SELECT encode(sha256(convert_to(${JSON.stringify(tuple)}::jsonb::text,'UTF8')),'hex') hash`;
  return row.hash;
}
function uniqueConflict(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== 'object' || depth > 6) return false;
  const r = e as C9Object;
  return (
    ['23505', 'P2002'].includes(String(r.code ?? r.originalCode)) ||
    [r.cause, r.meta, r.driverAdapterError].some((x) =>
      uniqueConflict(x, depth + 1),
    )
  );
}
export type C9StepDraft = {
  optionKey: string;
  stepKey: string;
  ordinal: number;
  domain: C9Domain;
  kind: 'READ' | 'PROPOSE' | 'OWNER_HANDOFF' | 'NO_ACTION';
  capability: string;
  intentContract: string;
  intent: C9Object | null;
  dependencies: unknown[];
  evidenceRefs: unknown[];
  budgetSlice: unknown;
  validUntil: string;
};
export type C9Proposal = {
  objective: unknown;
  constraints: unknown;
  alternatives: unknown;
  evidenceRefs: unknown[];
  skills: unknown;
  validUntil: string;
  steps: C9StepDraft[];
};
const terminal = ['COMPLETED', 'STOPPED', 'CANCELLED', 'EXPIRED'];

/** Sole derived coordination writer. Transactions contain DB work only, never a provider call. */
@Injectable()
export class C9Store {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: C9Authority,
    private readonly identity: C9RequestIdentity,
    private readonly encryption: EncryptionService,
    private readonly sources: C9Sources,
  ) {}
  async transaction<T>(
    channelProof: string | undefined,
    work: (tx: C9Tx, p: C9Principal, now: Date) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++)
      try {
        return await canonicalUtcTransaction(this.db, async (tx) => {
          const p = await this.authority.current(tx, channelProof);
          const [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() now`;
          return work(tx, p, clock.now);
        });
      } catch (e) {
        if (
          attempt >= 7 ||
          !(isPostgresSerializationConflict(e) || uniqueConflict(e))
        )
          throw e;
      }
  }
  validateRefs(tx: C9Tx, p: C9Principal, refs: readonly unknown[], now: Date) {
    return this.sources.all(tx, p, refs, now);
  }
  async lock(
    tx: C9Tx,
    p: C9Principal,
    id: string,
    live = false,
    now = new Date(),
  ): Promise<C9Run> {
    c9Id(id);
    const [r] = await tx.$queryRaw<
      C9Run[]
    >`SELECT * FROM "C9Run" WHERE id=${id}::uuid AND "tenantId"=${p.tenantId} FOR UPDATE`;
    if (!r || r.authorityHash !== c9PrincipalHash(p)) c9Deny('run_authority');
    if (r.retentionUntil <= now) c9Deny('run_retention_expired');
    if (live && (terminal.includes(r.state) || r.validUntil <= now))
      c9Deny('run_expired_or_terminal');
    return r;
  }
  event(channelProof?: string) {
    return this.transaction(channelProof, (_tx, p, now) =>
      Promise.resolve({
        eventToken: this.identity.issue(p, now),
      }),
    );
  }
  admit(eventToken: string, request: unknown, channelProof?: string) {
    return this.transaction(channelProof, async (tx, p, now) => {
      const event = this.identity.verify(eventToken, p, now),
        requestInput = c9Request(request) as C9Object;
      c9SafeText(requestInput.safeQuestion);
      if (
        requestInput.eventEnvelopeHash !== event.hash ||
        requestInput.eventIssuedAt !== event.envelope.issuedAt ||
        requestInput.eventExpiresAt !== event.envelope.expiresAt
      )
        c9Deny('request_event_mismatch');
      c9Bytes(requestInput, 16384);
      const budget = c9Budget(c9DefaultBudget()) as C9Object; // P01 admits the released deterministic/no-paid foundation.
      const material = c9Hash('request-intent/1', [p, requestInput]);
      const existing = await tx.c9Run.findFirst({
        where: { tenantId: p.tenantId, requestKeyHash: event.keyHash },
      });
      if (existing) {
        if (
          existing.requestHash !== material ||
          existing.authorityHash !== c9PrincipalHash(p)
        )
          c9Deny('idempotency_conflict');
        return existing;
      }
      await this.sources.all(tx, p, requestInput.subjectRefs as unknown[], now);
      const entry = requestInput.entryRef as C9Object | null;
      if (entry) {
        const op = await this.sources.check(tx, p, entry.opportunityRef, now);
        if ((entry.opportunityRef as C9Object).sourceType !== 'Opportunity')
          c9Deny('selected_opportunity');
        if (entry.agentTaskRef) {
          const task = await this.sources.check(tx, p, entry.agentTaskRef, now);
          if (task.opportunityId !== op.id) c9Deny('assignment_mismatch');
        }
      }
      return c9Insert<C9Run>(tx, 'C9Run', {
        id: randomUUID(),
        tenantId: p.tenantId,
        contractVersion: 1,
        principalJson: p,
        authorityHash: c9PrincipalHash(p),
        requestKeyHash: event.keyHash,
        requestHash: material,
        requestIntentJson: requestInput,
        entryKind: entry ? 'SELECTED_OPPORTUNITY' : 'EXPLICIT_REQUEST',
        entryRefJson: entry,
        admittedAt: now,
        validUntil: new Date(
          Math.min(
            Date.parse(event.envelope.expiresAt),
            ...c9CollectRefs(requestInput).map((ref) =>
              ref.validUntil ? Date.parse(ref.validUntil as string) : Infinity,
            ),
          ),
        ),
        retentionUntil: new Date(now.getTime() + C9_RETENTION),
        state: 'DRAFT',
        currentRevision: 0,
        counterVersion: 0,
        budgetManifestHash: c9Hash('budget/1', [budget]),
        budgetManifestJson: budget,
        budgetStateJson: c9EmptyBudget(),
        reasoningUsedMs: 0,
        reasoningWindowStartedAt: null,
        reasoningWindowDeadlineAt: null,
        leaseTokenHash: null,
        leaseUntil: null,
        leaseGeneration: 0,
        cancelKeyHash: null,
        cancelledAt: null,
        updatedAt: now,
      });
    });
  }
  revision(
    runId: string,
    editKey: string,
    draft: C9Proposal,
    channelProof?: string,
  ) {
    return this.transaction(channelProof, async (tx, p, now) => {
      const root = await this.lock(tx, p, runId, false, now),
        editKeyHash = c9Hash('edit-key/1', [p.tenantId, runId, c9Id(editKey)]);
      const objective = c9Objective(draft.objective) as C9Object,
        constraints = c9Constraints(draft.constraints) as C9Object,
        alternatives = c9Array(
          c9Alternative,
          3,
          1,
        )(draft.alternatives) as C9Object[],
        refs = c9Refs(draft.evidenceRefs) as C9Object[],
        skills = c9Skills(draft.skills);
      if (constraints.budgetManifestHash !== root.budgetManifestHash)
        c9Deny('proposal_budget_changed');
      const validUntil = c9Instant(draft.validUntil) as string;
      if (Date.parse(validUntil) > root.validUntil.getTime())
        c9Deny('proposal_validity_expanded');
      if (
        new Set(alternatives.map((a) => a.key)).size !== alternatives.length ||
        alternatives.filter((a) => a.recommended).length > 1
      )
        c9Deny('alternatives');
      if (!Array.isArray(draft.steps) || draft.steps.length > 36)
        c9Deny('step_bounds');
      const steps = draft.steps
        .map((raw) => {
          const allowed = [
            'optionKey',
            'stepKey',
            'ordinal',
            'domain',
            'kind',
            'capability',
            'intentContract',
            'intent',
            'dependencies',
            'evidenceRefs',
            'budgetSlice',
            'validUntil',
          ];
          if (Object.keys(raw).some((k) => !allowed.includes(k)))
            c9Deny('step_fields');
          const cap = c9Capability(raw.capability, raw.domain);
          c9Id(raw.optionKey);
          c9Id(raw.stepKey);
          c9Id(raw.intentContract);
          c9Instant(raw.validUntil);
          if (
            !Number.isInteger(raw.ordinal) ||
            raw.ordinal < 1 ||
            raw.ordinal > 12 ||
            !alternatives.some((a) => a.key === raw.optionKey)
          )
            c9Deny('step_order');
          if (
            Date.parse(raw.validUntil) > Date.parse(validUntil) ||
            !['READ', 'PROPOSE', 'OWNER_HANDOFF', 'NO_ACTION'].includes(
              raw.kind,
            )
          )
            c9Deny('step_contract');
          if (
            (raw.kind === 'OWNER_HANDOFF' && cap.mode === 'READ') ||
            (raw.kind === 'NO_ACTION' &&
              cap.capabilityKey !== 'c9.no_action') ||
            (raw.kind === 'READ' && cap.mode !== 'READ')
          )
            c9Deny('step_capability_mode');
          c9Bytes(raw.intent, 16384);
          const intent = c9OwnerDraft(cap, raw.intentContract, raw.intent);
          return {
            ...raw,
            intent,
            dependencies: c9Dependencies(raw.dependencies) as C9Object[],
            evidenceRefs: c9Refs(raw.evidenceRefs) as C9Object[],
            budgetSlice: c9StepBudget(raw.budgetSlice),
            intentHash: c9Hash('owner-intent/1', [raw.intentContract, intent]),
          };
        })
        .sort(
          (a, b) =>
            Buffer.compare(
              Buffer.from(a.optionKey),
              Buffer.from(b.optionKey),
            ) || a.ordinal - b.ordinal,
        );
      const graph = steps.map((s) => [
        s.optionKey,
        s.stepKey,
        s.ordinal,
        s.domain,
        s.kind,
        s.capability,
        C9_REGISTRY_HASH,
        s.intentContract,
        s.intentHash,
        s.dependencies,
        s.evidenceRefs,
        s.budgetSlice,
        s.validUntil,
      ]);
      const snapshotTuple = [
        'maya.c9-snapshot/1',
        'maya.c9-strategy/1',
        C9_REGISTRY_HASH,
        skills,
        objective,
        constraints,
        alternatives,
        refs,
        validUntil,
        graph,
      ];
      c9Bytes(snapshotTuple, 65536);
      const snapshotHash = await c9PgHash(tx, snapshotTuple),
        inputHash = c9Hash('revision-input/1', [snapshotTuple]);
      const existing = await tx.c9StrategyRevision.findFirst({
        where: { tenantId: p.tenantId, runId, editKeyHash },
      });
      if (existing) {
        if (existing.inputHash !== inputHash) c9Deny('idempotency_conflict');
        return existing;
      }
      if (
        terminal.includes(root.state) ||
        root.validUntil <= now ||
        Date.parse(validUntil) <= now.getTime()
      )
        c9Deny('run_expired_or_terminal');
      for (const s of steps)
        for (const dep of s.dependencies)
          if (
            !steps.some(
              (v) =>
                v.optionKey === s.optionKey &&
                v.stepKey === dep.stepKey &&
                v.ordinal < s.ordinal,
            )
          )
            c9Deny('invalid_dependency');
      const allRefs = c9CollectRefs(snapshotTuple);
      await this.sources.all(tx, p, allRefs, now);
      const parent = await tx.c9StrategyRevision.findFirst({
        where: { tenantId: p.tenantId, runId },
        orderBy: { revision: 'desc' },
      });
      const retentionUntil = new Date(
        Math.min(
          root.retentionUntil.getTime(),
          parent?.retentionUntil.getTime() ?? Infinity,
          ...allRefs.map((ref) =>
            ref.retentionUntil
              ? Date.parse(ref.retentionUntil as string)
              : Infinity,
          ),
        ),
      );
      if (retentionUntil.getTime() < Date.parse(validUntil))
        c9Deny('source_retention_before_validity');
      const id = randomUUID();
      await c9Insert(tx, 'C9StrategyRevision', {
        id,
        tenantId: p.tenantId,
        runId,
        revision: (parent?.revision ?? 0) + 1,
        parentRevisionId: parent?.id ?? null,
        editKeyHash,
        inputHash,
        snapshotHash,
        state: 'PROPOSED',
        proposalContract: 'maya.c9-strategy/1',
        registryHash: C9_REGISTRY_HASH,
        skillVersionsJson: skills,
        objectiveJson: objective,
        constraintsJson: constraints,
        alternativesJson: alternatives,
        evidenceRefsJson: refs,
        selectedOptionKey: null,
        reviewKeyHash: null,
        reviewHash: null,
        reviewActorJson: null,
        reviewedAt: null,
        reviewDecision: null,
        admittedAt: now,
        validUntil,
        retentionUntil,
        terminalReason: null,
        terminalAt: null,
      });
      for (const s of steps)
        await c9Insert(tx, 'C9PlanStep', {
          id: randomUUID(),
          tenantId: p.tenantId,
          revisionId: id,
          optionKey: s.optionKey,
          stepKey: s.stepKey,
          ordinal: s.ordinal,
          domain: s.domain,
          kind: s.kind,
          capability: s.capability,
          registryHash: C9_REGISTRY_HASH,
          intentContract: s.intentContract,
          intentHash: s.intentHash,
          intentEncrypted:
            s.intent === null
              ? null
              : this.encryption.encrypt(JSON.stringify(s.intent)),
          dependenciesJson: s.dependencies,
          evidenceRefsJson: s.evidenceRefs,
          budgetSliceJson: s.budgetSlice,
          state: 'WAITING',
          leaseGeneration: 0,
          leaseTokenHash: null,
          leaseUntil: null,
          admittedAt: now,
          validUntil: s.validUntil,
          retentionUntil,
          terminalAt: null,
          stopReason: null,
          updatedAt: now,
        });
      if (
        parent &&
        ![
          'COMPLETED',
          'STOPPED',
          'CANCELLED',
          'EXPIRED',
          'SUPERSEDED',
        ].includes(parent.state)
      )
        await tx.c9StrategyRevision.update({
          where: { id: parent.id },
          data: {
            state: 'SUPERSEDED',
            terminalAt: now,
            terminalReason: 'MATERIAL_REVISION',
          },
        });
      await tx.c9Run.update({
        where: { id: root.id },
        data: {
          state: 'OPEN',
          currentRevision: (parent?.revision ?? 0) + 1,
          counterVersion: { increment: 1 },
          updatedAt: now,
        },
      });
      return tx.c9StrategyRevision.update({
        where: { id },
        data: { state: 'VALIDATED' },
      });
    });
  }
  review(
    runId: string,
    revisionId: string,
    eventKey: string,
    snapshotHash: string,
    optionKey: string,
    accept: boolean,
    channelProof?: string,
  ) {
    return this.transaction(channelProof, async (tx, p, now) => {
      const root = await this.lock(tx, p, runId, false, now),
        r = await tx.c9StrategyRevision.findFirst({
          where: { id: revisionId, tenantId: p.tenantId, runId },
        });
      if (!r || r.snapshotHash !== snapshotHash) c9Deny('review_snapshot');
      const key = c9Hash('review-key/1', [p.tenantId, c9Id(eventKey)]),
        hash = c9Hash('review/1', [
          p,
          r.snapshotHash,
          optionKey,
          accept,
          r.validUntil.toISOString(),
        ]);
      if (r.reviewedAt) {
        if (r.reviewKeyHash !== key || r.reviewHash !== hash)
          c9Deny('review_conflict');
        return r;
      }
      if (
        root.currentRevision !== r.revision ||
        terminal.includes(root.state) ||
        root.validUntil <= now ||
        r.validUntil <= now ||
        r.state !== 'VALIDATED'
      )
        c9Deny('review_stale');
      const nodes = await tx.c9PlanStep.findMany({
        where: { tenantId: p.tenantId, revisionId: r.id },
      });
      await this.sources.all(
        tx,
        p,
        c9CollectRefs([
          r.objectiveJson,
          r.constraintsJson,
          r.alternativesJson,
          r.evidenceRefsJson,
          ...nodes.map((n) => [n.evidenceRefsJson, n.budgetSliceJson]),
        ]),
        now,
      );
      return tx.c9StrategyRevision.update({
        where: { id: r.id },
        data: {
          state: accept ? 'ADMITTED' : 'STOPPED',
          selectedOptionKey: optionKey,
          reviewKeyHash: key,
          reviewHash: hash,
          reviewActorJson: p,
          reviewedAt: now,
          reviewDecision: accept ? 'ACCEPTED' : 'DECLINED',
          ...(accept ? {} : { terminalAt: now, terminalReason: 'DECLINED' }),
        },
      });
    });
  }
  snapshot(runId: string, channelProof?: string) {
    return this.transaction(channelProof, async (tx, p, now) => {
      const r = await this.lock(tx, p, runId, false, now);
      return {
        run: r,
        revisions: await tx.c9StrategyRevision.findMany({
          where: { tenantId: p.tenantId, runId, retentionUntil: { gt: now } },
          orderBy: { revision: 'asc' },
        }),
        steps: await tx.c9PlanStep.findMany({
          where: { tenantId: p.tenantId, strategyRevision: { runId } },
          orderBy: [{ optionKey: 'asc' }, { ordinal: 'asc' }],
          select: {
            id: true,
            revisionId: true,
            optionKey: true,
            stepKey: true,
            state: true,
            stopReason: true,
          },
        }),
      };
    });
  }
}
