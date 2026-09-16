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

import { PrismaService } from '../prisma/prisma.service';
import type {
  Gate,
  GateContext,
  GateVerdict,
  IntentRecordRow,
  SubmissionShape,
} from './gate.types';
import type { VerificationLevel } from '../widget-contract/envelope';
import { digestEquals, sha256Hex } from './token.util';
import {
  gate5,
  gate6,
  gate7,
  gate8,
  gate8R,
  gate9,
  gate10,
  gate11,
  gate12,
  gate13,
  gateSensitiveDest,
} from './gates/gate-logic';
import { channelMaxLevel } from './authority/authority-resolver';

/** A gate whose mechanism a later package builds. It runs, and it refuses. */
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
    {
      n: '8',
      name: 'Input validation',
      host: 'IntentGateway',
      run: (ctx) => gate8(ctx),
    },
    {
      n: '8-R',
      name: 'Readback',
      host: 'IntentGateway',
      run: (ctx) => gate8R(ctx),
    },
    { n: '9', name: 'Lowering', host: 'chat ingress', run: () => gate9() },
    {
      n: '10',
      name: 'Divergence audit',
      host: 'intent router',
      run: (ctx) => gate10(ctx),
    },
    {
      n: '11',
      name: 'Noun resolution',
      host: 'IntentGateway',
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
    principalProofHash: string;
    submission: SubmissionShape;
    now?: Date;
    /**
     * `v`, derived by the AuthorityResolver on THIS request. Required, not optional: a default
     * here would be a floor comparison against a value nobody established, and the whole finding
     * that produced this wiring was a floor with nothing to compare against.
     */
    verificationLevel: VerificationLevel;
    carrier: string;
    resolvedRoles: readonly string[];
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

    const ctx: GateContext = {
      intentTokenHash,
      tenantId: args.tenantId,
      principalProofHash: args.principalProofHash,
      now: args.now ?? new Date(),
      record,
      submission: args.submission,
      verificationLevel: args.verificationLevel,
      channelMaxLevel: channelMaxLevel(args.carrier),
      carrier: args.carrier,
      resolvedRoles: args.resolvedRoles,
    };

    let ran = 0;
    for (const gate of this.gates) {
      ran += 1;
      const verdict = await gate.run(ctx);
      if (verdict.outcome !== 'pass') {
        this.log.debug(`gate ${gate.n} (${gate.name}) -> ${verdict.outcome}`);
        return { verdict: this.normalise(verdict), stoppedAt: gate.n, ran };
      }
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
        renderedUtterance: true,
        // Supersession is a property of the ENVELOPE, not of the record: a record points at a
        // widgetId, and WidgetEmission.supersededByWidgetId is where a newer envelope replacing an
        // older one is written. Reading it here rather than duplicating it onto the record keeps
        // one answer to "was this superseded" instead of two that can disagree.
        emission: { select: { supersededByWidgetId: true } },
      },
    });
    if (!row) return null;
    const { emission, ...rest } = row as typeof row & {
      emission: { supersededByWidgetId: string | null } | null;
    };
    return {
      ...(rest as Omit<IntentRecordRow, 'supersededByWidgetId'>),
      supersededByWidgetId: emission?.supersededByWidgetId ?? null,
    };
  }
}
