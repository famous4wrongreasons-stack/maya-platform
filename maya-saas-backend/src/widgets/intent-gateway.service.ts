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

import { Injectable, Logger } from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import type {
  Gate,
  GateContext,
  GateVerdict,
  IntentRecordRow,
  SubmissionShape,
} from './gate.types';
import type { VerificationLevel } from '../widget-contract/envelope';
import type { ChannelId } from '../widget-contract/lifecycle';
import { digestEquals, sha256Hex } from './token.util';
import { mergeFacts, NO_FACTS } from './gates/facts';
import { gate5 } from './gates/gate5';
import { gate6, gateSensitiveDest } from './gates/gate6';
import { gate7 } from './gates/gate7';
import { gate8R } from './gates/gate8r';
import { gate11 } from './gates/gate11';
import { gate12 } from './gates/gate12';
import { gate13 } from './gates/gate13';
import { channelMaxLevel } from './authority/authority-resolver';

/**
 * A gate whose mechanism is not built. It runs, and it REFUSES — "not built yet" and "allowed" must
 * never be the same branch (F5's fail-closed default).
 *
 * Three slots use it: 8, 9 and 10.
 *   - Gate 9, Lowering. The wiring commit replaced it with a function that returned `pass` and
 *     performed nothing, which is worse than a stub: the append of `rendered_utterance` as a USER
 *     turn never happened, so Gate 10 received no utterance to compare on the tap path.
 *   - Gate 8, Input validation. The function that stood here failed open: it passed every non-string
 *     value, and every value on an empty domain (G8 §5.0).
 *   - Gate 10, Divergence audit. The function that stood here read the persisted utterance rather
 *     than this request's lowering, audited into a process-local array, and classified effects with
 *     a mapping the contract does not state (G10 G-1…G-14; integrator decision D-12).
 * A stub that refuses is honest about all three. A function that passed would be counted as a gate.
 */
const pending = (
  n: string,
  name: string,
  host: Gate['host'],
  pendingOn: string,
): Gate => ({
  n,
  name,
  host,
  pendingOn,
  run: () => ({
    outcome: 'refuse' as const,
    code: 'mechanism_absent' as const,
    detail: `gate ${n} (${name}) is NORMATIVE-PENDING on ${pendingOn}`,
  }),
});

@Injectable()
export class IntentGatewayService {
  private readonly log = new Logger(IntentGatewayService.name);

  constructor(private readonly prisma: PrismaService) {}

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
  private readonly gates: readonly Gate[] = [
    {
      n: '1',
      name: 'Token integrity',
      host: 'IntentGateway',
      run: (ctx) => {
        const r = ctx.record;
        if (!r)
          return {
            outcome: 'refuse',
            code: 'EXPIRED',
            detail: 'no record for this token',
          };
        if (r.supersededByWidgetId !== null)
          return {
            outcome: 'superseded',
            code: 'SUPERSEDED',
            detail: 'a newer envelope replaced this one',
          };
        if (r.expiresAt.getTime() <= ctx.now.getTime())
          return {
            outcome: 'refuse',
            code: 'EXPIRED',
            detail: 'token expired',
          };
        // Single use is what makes a replayed tap find a consumed row instead of a second effect.
        if (r.singleUse && r.consumedAt !== null)
          return {
            outcome: 'refuse',
            code: 'EXPIRED',
            detail: 'token already consumed',
          };
        return { outcome: 'pass' };
      },
    },
    {
      n: '2',
      name: 'Transport auth',
      host: 'HTTP middleware',
      // Already enforced: JwtAuthGuard is global, and no credential comes from the widget.
      run: () => ({ outcome: 'pass' }),
    },
    {
      n: '3',
      name: 'Principal binding',
      host: 'IntentGateway',
      run: (ctx) => {
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
      run: (ctx) => {
        const r = ctx.record;
        if (!r)
          return {
            outcome: 'refuse',
            code: 'tenant_mismatch',
            detail: 'no record',
          };
        // The global guard has already bound the tenant; this compares the RECORD's tenant against
        // it, which the guard cannot do because the guard never saw the record.
        return r.tenantId === ctx.tenantId
          ? { outcome: 'pass' }
          : { outcome: 'refuse', code: 'tenant_mismatch' };
      },
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
      // capability, and splitting it out would put one rule in two places.
      run: (ctx) => {
        const sensitive = gateSensitiveDest(ctx);
        return sensitive.outcome === 'pass' ? gate6(ctx) : sensitive;
      },
    },
    {
      n: '7',
      name: 'Effect admissibility',
      host: 'IntentGateway',
      run: (ctx) => gate7(ctx),
    },
    // NOT BUILT. Closed-domain membership, cardinality, bounds re-read from `bounds_source`,
    // normalizers and `c9SafeText` need the schema source, the codec and the registries, and several
    // of their refusals need owner rulings before a code may be chosen (AMB-01, AMB-02a).
    pending(
      '8',
      'Input validation',
      'IntentGateway',
      'the input-validation mechanism (schema retrieval, closed-domain codec, bounds and normalizer registries) and the owner rulings on its refusal codes',
    ),
    {
      n: '8-R',
      name: 'Readback',
      host: 'IntentGateway',
      run: (ctx) => gate8R(ctx),
    },
    // NOT BUILT. §3.9: rendered_utterance = render(utterance_template, server-resolved canonical
    // labels) is appended as a USER turn with authority NONE — the first durable write. Nothing
    // performs that append, and §3.9 defines no refusal for a lowering that cannot render (an erased
    // or absent template), so building it needs a ruling rather than an invented refusal code.
    pending(
      '9',
      'Lowering',
      'chat ingress',
      'the USER-turn append of rendered_utterance, and a ruling on the refusal when it cannot render',
    ),
    // NOT BUILT. The router runs over THIS request's lowering (Gate 9's fact), and a divergence is
    // written to a durable audit record. What the router resolves against, what "canonical owner"
    // means, a null result and the audit record's store are owner rulings (AMB-29 … AMB-32, AMB-09).
    pending(
      '10',
      'Divergence audit',
      'intent router',
      "the deterministic router over Gate 9's lowered utterance, a durable divergence audit record, and the owner rulings on the router, the canonical owner, a null resolution and the audit store",
    ),
    {
      n: '11',
      name: 'Noun resolution',
      host: 'IntentGateway + capability owner',
      run: (ctx) => gate11(ctx),
    },
    {
      n: '12',
      name: 'Data fence',
      host: 'Projector',
      run: (ctx) => gate12(ctx),
    },
    {
      n: '13',
      name: 'Effect routing',
      host: 'effect router',
      run: (ctx) => gate13(ctx),
    },
    // Gate 14 stays with the Action Engine, which enforces it on its own ingress — on-path and
    // correct. Moving it here for a tidier count would move a fence away from its owner.
    //
    // The slot is kept so the array is §3.9's fifteen and not a subset, but it is NOT a
    // `pending()` stub: `pending` means "a later package builds this", and this one is built. It
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
    return this.gates.filter((g) => !g.pendingOn).length;
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
    principalProofHash: string;
    submission: SubmissionShape;
    now?: Date;
    /**
     * `v`, derived by the AuthorityResolver on THIS request. Required, not optional: a default
     * here would be a floor comparison against a value nobody established, and the whole finding
     * that produced this wiring was a floor with nothing to compare against.
     */
    verificationLevel: VerificationLevel;
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
    const record = await this.findRecord(intentTokenHash, args.tenantId);

    let ctx: GateContext = {
      intentTokenHash,
      tenantId: args.tenantId,
      actor: args.actor,
      principalProofHash: args.principalProofHash,
      now: args.now ?? new Date(),
      record,
      submission: args.submission,
      verificationLevel: args.verificationLevel,
      channelMaxLevel: channelMaxLevel(args.carrier),
      carrier: args.carrier,
      facts: NO_FACTS,
    };

    let ran = 0;
    for (const gate of this.gates) {
      ran += 1;
      const verdict = await gate.run(ctx);
      if (verdict.outcome !== 'pass') {
        this.log.debug(`gate ${gate.n} (${gate.name}) -> ${verdict.outcome}`);
        return { verdict: this.normalise(verdict), stoppedAt: gate.n, ran };
      }
      // J-1: a later gate sees what an earlier one established only through a NEW context, and only
      // what `mergeFacts` admits — each fact from its one producer slot, once. It throws otherwise.
      if (verdict.facts)
        ctx = { ...ctx, facts: mergeFacts(ctx.facts, verdict.facts, gate.n) };
    }
    return { verdict: { outcome: 'pass' }, stoppedAt: null, ran };
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
    if (v.outcome === 'refuse' || v.outcome === 'superseded')
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
    intentTokenHash: string,
    tenantId: string,
  ): Promise<IntentRecordRow | null> {
    const row = await this.prisma.widgetIntentRecord.findFirst({
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
