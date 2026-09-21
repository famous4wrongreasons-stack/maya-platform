// K3 — the IntentGateway. Step 0 plus the gates, in the one order §3.9 fixes.
//
// The whole package turns on a single structural claim: BUTTON -> ENDPOINT must be UNREPRESENTABLE,
// not merely unused. Nothing here enforces that by checking; it holds because the wire format has
// no field that could carry an endpoint (see SubmissionShape) and because a submission carries an
// opaque token the client did not author. A check could be bypassed; an absent field cannot be.
//
// The second claim is this file's own shape: the pipeline is ONE ORDERED ARRAY. There is no branch
// that skips a gate, because there is no branch at all — the runner walks the array in order and
// stops at the first non-pass verdict.

import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type {
  Gate,
  GateContext,
  GateVerdict,
  IntentRecordRow,
  SubmissionShape,
} from './gate.types';
import type { ChannelId } from '../widget-contract/lifecycle';
import {
  GATE10_STORE,
  GATE6_OWNERS,
  GATE_8R_OWNERS,
  INPUT_VALIDATION,
  NOUN_RESOLUTION_PORTS,
  PRINCIPAL_RESOLVER,
  SEAL_VERIFIER,
  TENANT_SCOPE,
} from './di-tokens';
import type { PrincipalResolver, RequestTx } from './authority/principal-view';
import type { ProducingRecordRow } from './authority/commit-guard';
import type { TenantScopePort } from './owner-ports/tenant-scope.provider';
// R6-1: `import type`, never a value import. A value import would put `AiToolPolicyService` and
// `EntitlementsService` in the gateway's run-time closure through slot 6 and break P-SEAL's SEAL-5.
import type { Gate6Owners } from './owner-ports/gate6.owners.provider';
import type { SealVerifier } from './emission/seal-verifier.service';
import { digestEquals, sha256Hex } from './token.util';
import { mergeFacts, NO_FACTS } from './gates/facts';
import { gate1 } from './gates/gate1';
import { gate4 } from './gates/gate4';
import { gate5 } from './gates/gate5';
import { gate6 } from './gates/gate6';
import { gate7 } from './gates/gate7';
import type { InputValidationGate } from './input-validation/input-validation.gate';
import { gate8R } from './gates/gate8r';
import type { Gate8ROwners } from './gates/gate-8r.owners';
import { lower } from './lowering/lowering.gate';
import { gate10, type Gate10Store } from './gates/gate10';
import { gate11 } from './gates/gate11';
import {
  gate11ApplicabilityOf,
  nounActor,
  nounResolverInput,
} from './noun-resolution/noun-resolution';
import type { NounResolutionPorts } from './noun-resolution/noun-resolution.ports';
import { pass } from './gates/verdict';
import { gate13 } from './gates/gate13';
import { EffectRouterService } from './routing/effect-router.service';
import { channelMaxLevel } from './authority/authority-resolver';

/** Request-transaction binding of Gate 10's store seam, implemented by WidgetStoresService. */
interface TransactionalGate10Store {
  liveCandidates(
    record: IntentRecordRow,
    now: Date,
    tx: RequestTx,
  ): ReturnType<Gate10Store['liveCandidates']>;
  recordDivergence(
    input: Parameters<Gate10Store['recordDivergence']>[0],
    tx: RequestTx,
  ): ReturnType<Gate10Store['recordDivergence']>;
}

// Slot seams (GATES-PLAN-V11 D-18, I-CTX). Slots 1, 4, 8, 9 and 10 each call one file, and that file's
// body is what the slot ran before: the inline checks of Gates 1 and 4 and the former fail-closed
// seams of Gates 8, 9 and 10. A unit builds a gate in its seam file rather than changing the runner.

/**
 * The pass verdict, as one value rather than a literal per slot.
 *
 * Slot 2 answers with it (D-16), and a slot that answers with a SHARED value cannot be mistaken for the
 * constant pass it used to be: `run: () => ({ outcome: 'pass' })` said, in its own text, that nothing
 * was evaluated. G2-IN reads exactly that.
 */
const PASS: GateVerdict = Object.freeze({ outcome: 'pass' });

/** The last slot that runs inside `T` (D-1). Slots 11–13 run after the commit. */
const LAST_TRANSACTIONAL_SLOT = '10';

/**
 * `T`'s options (D-1): interactive, `ReadCommitted`, with an EXPLICIT timeout.
 *
 * The isolation level is spelled as the literal the store client's own union admits, so the widget layer
 * gains no second import of the database client's package (D-6, FR-1).
 */
const REQUEST_TX_OPTIONS = {
  isolationLevel: 'ReadCommitted',
  maxWait: 5_000,
  timeout: 15_000,
} as const;

/**
 * A slot, as the GATEWAY holds it: `Gate` plus the one thing D-1 gives a slot that no gate file may
 * ever name — the request transaction `T`.
 *
 * CKPT-W1 review fix (finding 4). D-1 puts slots 1–10 inside `T`, and `submit()` does open it and
 * hand `tx` to `findRecord`. But the two OTHER store reads those slots perform ran on `this.prisma`:
 * Gate 7's C5a producing-record loader and Gate 8's lowering-source read. `LoweringSourceReader.read`
 * even carries a `client` parameter whose documented purpose is "how the integrator can pass `T` here
 * without this file naming a transaction type", and slot 8's wiring never passed it. Two consequences,
 * both real: F74's C5a decided "the producing record was consumed" from a different snapshot and a
 * different connection than the transaction that would consume the submitted record; and an
 * interactive transaction issued nested queries on separate pool connections, which is a
 * pool-exhaustion and deadlock hazard on the very path D-1 exists to keep single-connection.
 *
 * `tx` is a SECOND parameter of the slot's own runner rather than a member of `GateContext`, and that
 * is deliberate: `GateContext` is what a gate file reads, `gate.types.ts` is what every gate file
 * imports, and a store client on either would be exactly the FR-1/D-6 breach the import fences exist
 * to prevent. A slot may pass `T` on; a gate may not see it. Slots after the commit are handed `null`,
 * because there is no transaction left to run in — `T` has committed by then (D-1, PR-9b).
 */
interface Slot extends Omit<Gate, 'run'> {
  run(
    ctx: GateContext,
    tx: RequestTx | null,
  ): Promise<GateVerdict> | GateVerdict;
}

/** What one contiguous range of the pipeline answered, and the context it left behind. */
interface SlotRun {
  readonly ctx: GateContext;
  readonly verdict: GateVerdict;
  readonly stoppedAt: string | null;
  readonly ran: number;
}

/**
 * D-16 — "did a transport session reach the gateway at all?".
 *
 * Row 2 (C11:4721) is the TRANSPORT chain: the six global `APP_GUARD`s the typed route runs. When that
 * chain admits a caller, slot 2 has nothing left to decide, and a principal the chain admitted but
 * `C9Authority.current` denied is slot 3's refusal, never slot 2's. Slot 2 refuses in-array only in the
 * world where the guard was neutralised and no session arrived — defence in depth (G2-IN, E-INDEP on `N2`).
 */
const transportSessionPresent = (
  actor: Readonly<AuthenticatedUser> | null | undefined,
): boolean =>
  typeof actor?.userId === 'string' &&
  actor.userId.length > 0 &&
  typeof actor?.sessionId === 'string' &&
  actor.sessionId.length > 0;

@Injectable()
export class IntentGatewayService {
  private readonly log = new Logger(IntentGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRINCIPAL_RESOLVER)
    private readonly principals: PrincipalResolver,
    @Inject(SEAL_VERIFIER)
    private readonly sealVerifier: SealVerifier,
    @Inject(TENANT_SCOPE)
    private readonly tenantScope: TenantScopePort,
    @Inject(GATE6_OWNERS)
    private readonly gate6Owners: Gate6Owners,
    @Inject(INPUT_VALIDATION)
    private readonly inputValidation: InputValidationGate,
    @Inject(GATE_8R_OWNERS)
    private readonly gate8ROwners: Gate8ROwners,
    @Inject(NOUN_RESOLUTION_PORTS)
    private readonly nounPorts: NounResolutionPorts,
    private readonly effectRouter: EffectRouterService,
    @Inject(GATE10_STORE)
    private readonly gate10Store: TransactionalGate10Store,
  ) {}

  /**
   * D-1 — `T`'s commit and rollback counts, the only thing this service says about the transaction.
   *
   * It is an OBSERVABLE, not a gate input: no slot reads it, and nothing branches on it. PR-9a reads the
   * delta across one submission, because "the transaction commits at the first non-pass verdict ≤ slot 10
   * and rolls back on a throw" is otherwise a claim with nothing to measure.
   */
  readonly transactions: { committed: number; rolledBack: number } = {
    committed: 0,
    rolledBack: 0,
  };

  /**
   * §3.9 Step 0 — carrier decode. Every channel converges on one token: the rendered model's token
   * in a browser, `callback_query.data` in Telegram, `event.action` in web push, a deterministic
   * alias match for voice. K3 receives the token already decoded by the carrier, and its job here
   * is only to refuse to invent one: a submission without a token is not a submission.
   */
  private step0(submission: SubmissionShape): string | null {
    const raw =
      typeof submission?.intent_token === 'string'
        ? submission.intent_token.trim()
        : '';
    return raw.length > 0 ? raw : null;
  }

  /**
   * The pipeline. Order is the contract; the array is the mechanism.
   *
   * Gates 2 and 4 are marked as hosted elsewhere and pass here because they have ALREADY run by the
   * time a request reaches this service — Gate 2 is the JWT/membership guard and Gate 4 is the
   * tenant guard, both global. They are kept in the array rather than dropped so the order stays
   * readable against §3.9 and so the count is the contract's count, not a subset of it.
   */
  private readonly gates: readonly Slot[] = [
    {
      n: '1',
      name: 'Token integrity',
      host: 'IntentGateway',
      // Seam: `gates/gate1.ts` (P-G15a).
      run: (ctx, tx) => {
        if (tx === null)
          throw new Error('Gate 1 requires the request transaction');
        return gate1(ctx, {
          verify: (recordHash, scope) =>
            this.sealVerifier.verify(recordHash, scope, tx),
        });
      },
    },
    {
      n: '2',
      name: 'Transport auth',
      host: 'HTTP middleware',
      // D-16: the transport session chain the typed route uses — the same six global `APP_GUARD`s, with
      // no `@Public`, on `/api/ai/chat` and `/api/widgets/intent` alike. It is not a second principal
      // resolution: `C9Authority.current(T)` is, and its denial is refused at slot 3.
      run: (ctx) =>
        transportSessionPresent(ctx.actor)
          ? PASS
          : {
              outcome: 'refuse',
              code: 'unauthenticated',
              detail: 'no transport session reached the gateway',
            },
    },
    {
      n: '3',
      name: 'Principal binding',
      host: 'IntentGateway',
      run: (ctx) => {
        // D-16: the chain admitted a session and `C9Authority.current` denied it a live principal — a
        // staff-class role without exactly one active Staff row, or a tenant, membership or user that
        // went inactive after the guard ran. With no live principal there is no live proof hash, so row 3
        // ("equals the live principal's proof hash", C11:4722) has nothing equal to compare.
        if (ctx.principal === null)
          return {
            outcome: 'refuse',
            code: 'widget_principal_mismatch',
            detail: 'no live principal',
          };
        const r = ctx.record;
        if (!r)
          return {
            outcome: 'refuse',
            code: 'widget_principal_mismatch',
            detail: 'no record',
          };
        // A token minted for A and replayed by B fails here. A forwarded Telegram message and a
        // shared push are inert for the same reason, and an unlink invalidates every outstanding
        // envelope retroactively because the proof hash changes.
        // Constant-time. A `===` here would return faster the earlier the two hashes diverge, and
        // §3 requires a foreign-principal token refused at latency indistinguishable from a forged
        // or expired one — which a short-circuiting compare measurably is not.
        return digestEquals(r.principalProofHash, ctx.principalProofHash)
          ? { outcome: 'pass' }
          : { outcome: 'refuse', code: 'widget_principal_mismatch' };
      },
    },
    {
      n: '4',
      name: 'Tenant scope',
      host: 'TenantResolver',
      // Seam: `gates/gate4.ts` (U4). Row 4 (C11:4723) NAMES `TenantContextService.assertTenantId`,
      // and the port is how the slot reaches it without naming the service (D-6).
      run: (ctx) => gate4(ctx, this.tenantScope),
    },
    {
      n: '5',
      name: 'Verification floor',
      host: 'ChannelProfileRegistry + AuthorityResolver',
      run: (ctx) => gate5(ctx),
    },
    {
      n: '6',
      name: 'Authority, computed from scratch',
      host: 'AuthorityResolver',
      // R3.5.1 runs with Gate 6 rather than as a sixteenth gate: it is a property OF the subject
      // capability, and splitting it out would put one rule in two places. V1.1 A1 (C11:7090, 7169,
      // 7399) and C11:1836 place that evaluation "in its HANDOFF destination branch only", which is
      // where `gate6` runs F48's generated predicate — so the front-door call this slot used to make
      // over EVERY effect is gone with `gateSensitiveDest` itself (R6-1b).
      run: (ctx) => gate6(ctx, this.gate6Owners),
    },
    {
      n: '7',
      name: 'Effect admissibility',
      host: 'IntentGateway',
      // R7-1 (IR-U7A-1): C5a (F74) names a PRODUCING record, so slot 7 is handed a loader for it
      // rather than a second store client. The loader closes over THIS request's tenant, and its
      // query is tenant-scoped in its own `where` — a filter applied after the read would have read
      // the foreign row first. `gate7`'s default is `UNWIRED_PRODUCING_RECORDS`, which resolves
      // nothing and therefore refuses every non-draft COMMIT; T7-WIRED is what stops that interim
      // becoming the live path by omission.
      // CKPT-W1 review fix (finding 4): the loader reads through `T`. C5a asks whether the PRODUCING
      // record has been consumed, and the transaction that will consume the SUBMITTED one is this one
      // — answering from a second connection's snapshot is answering about a different world.
      run: (ctx, tx) =>
        gate7(ctx, (hash) => this.findProducingRecord(hash, ctx.tenantId, tx)),
    },
    // BUILT in both lanes after U8b. The NULL-SCHEMA lane is row 8's: a record whose
    // `input_schema_hash` is null passes with the submission's `inputs` absent or `null`, and refuses
    // `selection_out_of_domain` on anything else — `{}` included, because "an empty object" is not
    // "nothing was submitted". The SCHEMA lane verifies the exact emitted schema and validates its
    // closed domains and bounds before the first lowering-source read.
    {
      n: '8',
      name: 'Input validation',
      host: 'IntentGateway',
      // Seam: `input-validation/input-validation.gate.ts` (U8a, then U8b).
      // CKPT-W1 review fix (finding 4): the lane's one store read goes through `T`, like the record
      // read above it. D-1 puts this slot inside the transaction; a read on a second connection was
      // not in it.
      run: (ctx, tx) => this.inputValidation.run(ctx, tx),
    },
    {
      n: '8-R',
      name: 'Readback',
      host: 'IntentGateway',
      // R8R-1: the owner set is INJECTED, not read from the gate file's own default. The bound value
      // is `GATE_8R_OWNERS_UNRULED` — the affirmation vocabulary has no owner in production until
      // A1/A2 are ruled (PKT:471), so every REQUIRED readback refuses. A null owner that refuses is
      // the mechanism being complete against its interface, not the mechanism being absent.
      run: (ctx) => gate8R(ctx, this.gate8ROwners),
    },
    {
      n: '9',
      name: 'Lowering',
      host: 'chat ingress',
      // Seam: `lowering/lowering.gate.ts` (U9b).
      run: (ctx, tx) => lower(ctx, tx),
    },
    {
      n: '10',
      name: 'Divergence audit',
      host: 'intent router',
      run: (ctx, tx) => {
        if (tx === null)
          throw new Error('Gate 10 requires the request transaction');
        return gate10(ctx, {
          liveCandidates: (record, now) =>
            this.gate10Store.liveCandidates(record, now, tx),
          recordDivergence: (input) =>
            this.gate10Store.recordDivergence(input, tx),
        });
      },
    },
    {
      n: '11',
      name: 'Noun resolution',
      host: 'IntentGateway + capability owner',
      // IR-11a-1: the slot PROJECTS three views and hands them over, rather than handing the whole
      // context to the gate. Gate 11 decides applicability and divergence; what a record IS — its
      // resolver input, its applicability row, its actor — is the projection's answer, and a gate that
      // could read `ctx.record` could read a column its row does not admit.
      run: (ctx) =>
        gate11(
          nounResolverInput(ctx.record),
          gate11ApplicabilityOf(ctx.record),
          nounActor(ctx.actor),
          this.nounPorts,
        ),
    },
    {
      n: '12',
      name: 'Data fence',
      host: 'Projector',
      // D-7, G12 §5.2: a POINTER. The data fence runs in `WidgetProjectorService`, which Gate 13
      // calls on its REFINE/NAVIGATE edges. This slot reads nothing, routes nothing and refuses
      // nothing, and `liveGateCount` excludes it (k3 check 4; ARCH-12-9 and ARCH-12-10).
      run: () => pass,
    },
    {
      n: '13',
      name: 'Effect routing',
      host: 'effect router',
      run: (ctx) => gate13(ctx, this.effectRouter),
    },
    // Gate 14 stays with the Action Engine, which enforces it on its own ingress — on-path and
    // correct. Moving it here for a tidier count would move a fence away from its owner.
    //
    // The slot is kept so the array is §3.9's fifteen and not a subset, but it carries no
    // `pendingOn`: that means "a later package builds this", and this one is built. It
    // is also unreachable — Gate 13 terminates by routing — so the honest thing for it to say is
    // where the enforcement actually is.
    {
      n: '14',
      name: 'Canonical action',
      host: 'CanonicalActionIngressService',
      run: () => ({
        outcome: 'terminate',
        why: 'enforced at action-engine.ingress.ts:71 — assertNoCallerAuthority, before any effect',
      }),
    },
  ];

  /** The contract's count, asserted here so the array cannot quietly lose a gate. */
  get gateCount(): number {
    return this.gates.length;
  }

  get liveGateCount(): number {
    return this.gates.filter((g) => !g.pendingOn && g.n !== '12').length;
  }

  /**
   * Run the pipeline. Returns the first non-pass verdict, or a pass once every gate has run.
   *
   * There is no early exit other than a verdict, and no gate is conditional on another's outcome
   * beyond the stop — which is what "no branch that skips a gate" means operationally.
   */
  async submit(args: {
    intentToken: string;
    tenantId: string;
    /** The JWT-validated user from `@CurrentUser()` (D-9). No role or principal is built from it. */
    actor: Readonly<AuthenticatedUser>;
    submission: SubmissionShape;
    now?: Date;
    carrier: ChannelId;
  }): Promise<{ verdict: GateVerdict; stoppedAt: string | null; ran: number }> {
    const token = this.step0(args.submission);
    if (!token)
      return {
        verdict: this.normalise({
          outcome: 'refuse',
          code: 'unauthenticated',
          detail: 'no intent token in submission',
        }),
        stoppedAt: '0',
        ran: 0,
      };

    const intentTokenHash = sha256Hex(token);
    // The array is walked in two CONTIGUOUS ranges that cover it exactly, and the only thing between
    // them is `T`'s commit. There is still no branch that skips a gate: every slot of both ranges runs.
    const lastInTx = this.gates.findIndex(
      (gate) => gate.n === LAST_TRANSACTIONAL_SLOT,
    );
    const inTransactionSlots = this.gates.slice(0, lastInTx + 1);
    const afterCommitSlots = this.gates.slice(lastInTx + 1);

    // D-1 — ONE request transaction `T`. It opens before the principal read and the record read, the
    // principal adapter and the tenancy owner's Membership read run in it, slots 9 and 10 write only
    // through it, and it commits when a slot ≤ 10 returns a non-pass verdict or when slot 10 returns.
    // Returning from the callback commits; throwing rolls back. Slots 11–13 run after the commit, so no
    // row lock and no advisory lock is held while an owner runs (PR-9b).
    let inTransaction: SlotRun;
    try {
      inTransaction = await this.prisma.$transaction(async (tx) => {
        // K1 (C11:2536-2539): both live rungs are resolved inside `T`, through the owner's resolver.
        // A denial is `null` and is refused at slot 3 (D-16); a fault is re-thrown and rolls `T` back.
        const principal = await this.principals.resolve(tx);
        const record = await this.findRecord(
          tx,
          intentTokenHash,
          args.tenantId,
        );

        const ctx: GateContext = {
          intentTokenHash,
          tenantId: args.tenantId,
          actor: args.actor,
          // D-2: the live principal is a base member, resolved once, before the array runs — Gate 1's
          // R3.9.4 issuance and Gate 3 both read it, and a fact produced at slot 2 or later could not
          // be read at slot 1 (J-1).
          principal,
          // K3/K4 (C11:2544-2546): what Gate 3 compares is the owner's own digest for the LIVE
          // principal. With no live principal there is no hash, and slot 3 refuses before the compare.
          principalProofHash: principal?.proofHash ?? '',
          now: args.now ?? new Date(),
          record,
          submission: args.submission,
          // `v` is the live principal's level (K1), never sent by a client and never read from the
          // record. No principal is `ANONYMOUS`, which is rank 0 and passes no floor above it.
          verificationLevel: principal?.verificationLevel ?? 'ANONYMOUS',
          channelMaxLevel: channelMaxLevel(args.carrier),
          carrier: args.carrier,
          facts: NO_FACTS,
        };

        return this.runSlots(ctx, inTransactionSlots, 0, tx);
      }, REQUEST_TX_OPTIONS);
    } catch (error) {
      this.transactions.rolledBack += 1;
      throw error;
    }
    this.transactions.committed += 1;

    if (inTransaction.stoppedAt !== null)
      return {
        verdict: this.normalise(inTransaction.verdict),
        stoppedAt: inTransaction.stoppedAt,
        ran: inTransaction.ran,
      };

    const afterCommit = await this.runSlots(
      inTransaction.ctx,
      afterCommitSlots,
      inTransaction.ran,
      // `T` has committed: there is nothing left for a slot to read through, and saying so is the
      // point. Slots 11-13 run after the commit so no row lock is held while an owner runs (D-1).
      null,
    );
    return {
      verdict: this.normalise(afterCommit.verdict),
      stoppedAt: afterCommit.stoppedAt,
      ran: afterCommit.ran,
    };
  }

  /**
   * The runner, over a CONTIGUOUS RANGE of the one ordered array.
   *
   * The range is the only thing D-1 added, and it is not a branch: `submit()` cuts `this.gates` into
   * two slices that cover it exactly, in order, and calls this back to back with nothing between them
   * but `T`'s commit. Inside, the walk is what it always was — every slot runs, in order, and the first
   * non-pass verdict stops it. There is no index, no `continue` and no condition on a gate's identity.
   */
  private async runSlots(
    start: GateContext,
    slots: readonly Slot[],
    already: number,
    tx: RequestTx | null,
  ): Promise<SlotRun> {
    let ctx = start;
    let ran = already;
    for (const gate of slots) {
      ran += 1;
      const verdict = await gate.run(ctx, tx);
      if (verdict.outcome !== 'pass') {
        this.log.debug(`gate ${gate.n} (${gate.name}) -> ${verdict.outcome}`);
        return { ctx, verdict, stoppedAt: gate.n, ran };
      }
      // J-1: a later gate sees what an earlier one established only through a NEW context, and only
      // what `mergeFacts` admits — each fact from its one producer slot, once. It throws otherwise.
      if (verdict.facts)
        ctx = { ...ctx, facts: mergeFacts(ctx.facts, verdict.facts, gate.n) };
    }
    return { ctx, verdict: PASS, stoppedAt: null, ran };
  }

  /**
   * Every refusal leaves this service with the SAME KEYS, whichever gate produced it.
   *
   * Found by K3's own exit test: gates that supplied a `detail` and gates that did not returned
   * objects of different shape, so the response structure itself said which gate had refused. The
   * codes are meant to differ — §3.9 assigns one per gate, and the caller is already authenticated
   * — but the shape is not, and normalising it here is structural rather than a rule each of the
   * fifteen gates has to remember.
   */
  private normalise(v: GateVerdict): GateVerdict {
    if (v.outcome === 'refuse')
      return { outcome: v.outcome, code: v.code, detail: v.detail ?? '' };
    if (v.outcome === 'superseded' && v.code !== undefined)
      return { outcome: v.outcome, code: v.code, detail: v.detail ?? '' };
    return v;
  }

  /**
   * The record lookup is tenant-scoped in the query itself rather than filtered afterwards, so a
   * cross-tenant token cannot be read and then rejected — it is never read.
   *
   * ONE read serves every gate: the union select of the plan's §2.4. Every column in it is
   * AUDIT_RETAINED (class A). No conversation content is loaded here: the lowering source is read
   * lazily, inside slot 8, once validation has passed (D-2), so a token refused at Gates 1–8 never
   * brings a template or a label into memory.
   */
  private async findRecord(
    tx: RequestTx,
    intentTokenHash: string,
    tenantId: string,
  ): Promise<IntentRecordRow | null> {
    const row = await tx.widgetIntentRecord.findFirst({
      where: { intentTokenHash, tenantId },
      select: {
        intentTokenHash: true,
        tenantId: true,
        widgetId: true,
        widgetKind: true,
        effect: true,
        principalProofHash: true,
        verificationFloor: true,
        singleUse: true,
        consumedAt: true,
        issuedAt: true,
        expiresAt: true,
        // F42's terms. Every one already existed as a column and none was selected, so Gate 5 had
        // nothing to recompute a floor FROM. Widening the select was the fix; weakening the
        // comparison would have been the other one.
        priority: true,
        capabilitySpace: true,
        capabilityKey: true,
        handoffSpace: true,
        handoffKey: true,
        targetJson: true,
        bodyHash: true,
        selectionDomain: true,
        inputSchemaHash: true,
        confirmationOfKind: true,
        confirmationOfRef: true,
        producedByIntentTokenHash: true,
        // §2.4's additions, each named by the gate that reads it: Gate 6 (c9Domain), Gates 11–13
        // (frozen nouns, requested scope, run and revision, the approval ref), and Gates 8-R and 13
        // through the confirmation projection below.
        c9Domain: true,
        requestedScopeHash: true,
        runId: true,
        revisionId: true,
        approvalOfIntentRef: true,
        frozenNounsJson: true,
        confirmationSubject: true,
        approvalDecision: true,
        // Selected so it can be PROJECTED (D-3). The object itself never leaves this method.
        confirmationJson: true,
        // Supersession is a property of the ENVELOPE, not of the record: a record points at a
        // widgetId, and WidgetEmission.supersededByWidgetId is where a newer envelope replacing an
        // older one is written. Reading it here rather than duplicating it onto the record keeps
        // one answer to "was this superseded" instead of two that can disagree. The delivery channel
        // (Gate 7) and the lifecycle state (Gates 12–13) are the envelope's too.
        emission: {
          select: {
            supersededByWidgetId: true,
            deliveryChannel: true,
            lifecycleState: true,
          },
        },
      },
    });
    if (!row) return null;
    const { emission, confirmationJson, ...rest } = row as typeof row & {
      emission: {
        supersededByWidgetId: string | null;
        deliveryChannel: string;
        lifecycleState: string;
      } | null;
    };
    // `WidgetIntentRecord_2_fkey` makes the envelope mandatory. A record without one is a store that
    // has stopped meaning what the schema says, which is a fault to raise, not a channel to guess.
    if (!emission)
      throw new Error(
        'invariant: a WidgetIntentRecord was read without its WidgetEmission',
      );
    return {
      ...(rest as Omit<
        IntentRecordRow,
        | 'supersededByWidgetId'
        | 'deliveryChannel'
        | 'emissionLifecycleState'
        | 'confirmation'
        | 'confirmationIdempotencyKey'
      >),
      supersededByWidgetId: emission.supersededByWidgetId,
      // CHECK over the eleven ChannelIds (migration `WidgetEmission` deliveryChannel CHECK).
      deliveryChannel: emission.deliveryChannel as ChannelId,
      emissionLifecycleState: emission.lifecycleState,
      ...projectConfirmation(confirmationJson),
    };
  }

  /**
   * Gate 7's C5a (F74): the record a non-draft COMMIT names in `confirmation_of_ref`.
   *
   * Tenant-scoped IN THE QUERY for the same reason `findRecord` is, and selecting exactly the four
   * AUDIT_RETAINED columns the identity reads (§4.4.3, C11:5766-5776). Slot 7 calls it only for a
   * non-draft COMMIT, so every other submission still performs exactly one read of ITS OWN record;
   * a read of a different row is not a second read of the submitted one, which is what the one-read
   * assertions count.
   */
  private findProducingRecord(
    intentTokenHash: string,
    tenantId: string,
    tx: RequestTx | null,
  ): Promise<ProducingRecordRow | null> {
    return (tx ?? this.prisma).widgetIntentRecord.findFirst({
      where: { intentTokenHash, tenantId },
      select: {
        effect: true,
        capabilitySpace: true,
        capabilityKey: true,
        consumedAt: true,
      },
    });
  }
}

type ConfirmationProjection = Pick<
  IntentRecordRow,
  'confirmation' | 'confirmationIdempotencyKey'
>;

/**
 * D-3. The stored `confirmationJson` reduced to what gates may read: `requires_readback` and
 * `readback_ref` (Gate 8-R) and `idempotency_key` (Gate 13). Each is copied as stored — an own member
 * of the stored object, with no coercion — so a `'true'` stays a string and a missing member stays
 * missing. A column that holds no plain object projects to `null`, which Gate 8-R's
 * `isPlainObject(c) && c.requires_readback === true` reads exactly as it would read that column.
 */
const projectConfirmation = (stored: unknown): ConfirmationProjection => {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored))
    return { confirmation: null, confirmationIdempotencyKey: null };
  const own = (member: string): unknown =>
    Object.prototype.hasOwnProperty.call(stored, member)
      ? (stored as Record<string, unknown>)[member]
      : undefined;
  return {
    confirmation: {
      requires_readback: own('requires_readback'),
      readback_ref: own('readback_ref'),
    },
    confirmationIdempotencyKey: own('idempotency_key'),
  };
};
