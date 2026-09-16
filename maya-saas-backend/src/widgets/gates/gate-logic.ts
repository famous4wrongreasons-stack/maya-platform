// Gates 5 to 13, as functions the pipeline calls.
//
// The finding that produced this file is worth keeping at the top of it. Ten of the fifteen gates
// were `pending()` stubs that refused everything, and the rules they name were implemented
// correctly in their own modules and called from nowhere:
//
//   the five PII fences  imported by exactly one file, on no admit path
//   assertCommitAdmissible  called only inside its own module
//   subjectCapability       present in the whole widget layer once, in a COMMENT
//
// So the modules were right and the wiring was absent. Nothing below re-implements a rule. Each
// gate calls the module that already owns it, and the owner's permanent rule is the shape of the
// whole file: GATE MODULE EXISTS != GATE ENFORCED.

import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { VerificationLevel } from '../../widget-contract/envelope';
import { VERIFICATION_RANK } from '../authority/ladder';
import {
  subjectCapability,
  actionCapabilityRegistry,
  c9Registry,
  CONSENT,
  IDENTITY,
  MONEY,
  WIDGET_CAPABILITY_POLICY,
  capKey,
} from '../authority/contract-bindings';
import { verificationFloor } from '../authority/verification-floor.runtime';
import { sensitiveDest } from '../authority/floor';
import { isAllowlisted, rowFor } from '../booking/booking-allowlist';
import {
  PII_FENCES,
  clientPreviewFence,
  llmBoundaryFence,
  artifactPiiFence,
  spokenReadbackFence,
  secureSurfaceFence,
} from '../authority/pii-fences';
import {
  resolveCapability,
  effectClassOf,
} from '../routing/deterministic-router';

const pass: GateVerdict = { outcome: 'pass' };
const refuse = (
  code: GateVerdict extends { code: infer C } ? C : never,
  detail: string,
): GateVerdict => ({ outcome: 'refuse', code, detail });

/** The record's subject, in the shape §3.5's one body reads. */
const subjectOf = (r: IntentRecordRow): CapabilityRef | null =>
  subjectCapability({
    capability:
      r.capabilitySpace && r.capabilityKey
        ? ({ space: r.capabilitySpace, key: r.capabilityKey } as CapabilityRef)
        : null,
    handoff_capability_ref:
      r.handoffSpace && r.handoffKey
        ? ({ space: r.handoffSpace, key: r.handoffKey } as CapabilityRef)
        : null,
    target: (r.targetJson ?? null) as never,
  });

/** The floor, recomputed from the live tables over the record's own terms. */
export const recomputeFloor = (r: IntentRecordRow): VerificationLevel =>
  verificationFloor(
    {
      effect: r.effect as never,
      capability:
        r.capabilitySpace && r.capabilityKey
          ? ({
              space: r.capabilitySpace,
              key: r.capabilityKey,
            } as CapabilityRef)
          : null,
      handoff_capability_ref:
        r.handoffSpace && r.handoffKey
          ? ({ space: r.handoffSpace, key: r.handoffKey } as CapabilityRef)
          : null,
      target: (r.targetJson ?? null) as never,
      priority: r.priority,
    },
    r.widgetKind as never,
  );

const meets = (level: VerificationLevel, floor: VerificationLevel): boolean =>
  VERIFICATION_RANK[level] >= VERIFICATION_RANK[floor];

// ── Gate 5 — verification floor ──────────────────────────────────────────────────────────────────
//
// Two comparisons, and the first is the one that was missing entirely.
//
//   1. STORED vs RECOMPUTED. R3.4.2: the gateway compares against its OWN recomputed result, never
//      the stored one, and ANY divergence — raised or lowered — refuses. A floor raised in policy
//      after mint must not let a token already in flight through, and a floor LOWERED after mint
//      must not be honoured either, because that is how a policy change becomes retroactive.
//   2. LEVEL vs FLOOR, per effect (R3.4.5), against the level capped by the carrier.

const STEP_UP_EFFECTS = ['CONTROL', 'DRAFT', 'REQUEST_APPROVAL', 'COMMIT'];

export const gate5 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('policy_floor_changed' as never, 'no record');

  const recomputed = recomputeFloor(r);
  if (recomputed !== r.verificationFloor)
    return refuse(
      'policy_floor_changed' as never,
      `stored ${r.verificationFloor}, recomputed ${recomputed}`,
    );

  // The level this request actually has, capped by what the carrier can establish. A session that
  // claims SESSION_VERIFIED over SMS is still arriving over SMS.
  const effective =
    VERIFICATION_RANK[ctx.verificationLevel] <=
    VERIFICATION_RANK[ctx.channelMaxLevel]
      ? ctx.verificationLevel
      : ctx.channelMaxLevel;

  if (meets(effective, recomputed)) return pass;

  // R3.4.5's branch. A read-shaped effect below its floor is routed to a step-up rather than
  // refused outright; an actuating one is refused, because offering a path would be offering the
  // effect.
  return STEP_UP_EFFECTS.includes(r.effect)
    ? refuse(
        'needs_second_channel' as never,
        `${effective} below ${recomputed}`,
      )
    : refuse('handoff_required' as never, `${effective} below ${recomputed}`);
};

// ── Gate 6 — authority, computed from scratch ────────────────────────────────────────────────────
//
// "May THIS live principal exercise THIS capability." Dispatched on the subject's SPACE, per F54's
// four branches, and fail-closed on every one of them. Nothing here reads a role from the client:
// `ctx.resolvedRoles` is what the server resolved on this request.

export const gate6 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('insufficient_authority' as never, 'no record');

  const subject = subjectOf(r);
  // A null subject means no capability is exercised — NONE, and a w/i/s/detail NAVIGATE. There is
  // nothing to authorise, and refusing here would make the mandatory escape unusable.
  if (subject === null) return pass;

  switch (subject.space) {
    case 'CONTROL':
      // The control registry's keys are closed and each handler performs its own principal and
      // tenant check. Gate 13 routes them; there is no Action Engine edge to authorise.
      return pass;
    case 'TOOL':
      // FAIL CLOSED — no intent may carry a TOOL ref. F24: all 47 catalogue names are also C9
      // keys, so a TOOL-spaced ref is a ref that resolved against the wrong table.
      return refuse(
        'insufficient_authority' as never,
        'a TOOL ref may not be an intent subject',
      );
    case 'C9': {
      const cap = c9Registry.tryGet(subject.key);
      if (!cap)
        return refuse('insufficient_authority' as never, 'unregistered C9 key');
      const row = WIDGET_CAPABILITY_POLICY[capKey(subject)];
      if (!row)
        return refuse('insufficient_authority' as never, 'no policy row');
      return pass;
    }
    case 'AE': {
      const cap = actionCapabilityRegistry.tryGet(subject.key);
      if (!cap)
        return refuse('insufficient_authority' as never, 'unregistered AE key');
      // The three vetoes that admit no exemption in this contract version.
      if (CONSENT(cap))
        return refuse(
          'insufficient_authority' as never,
          'CONSENT capability: the widget layer cannot confer consent',
        );
      if (IDENTITY(cap))
        return refuse(
          'insufficient_authority' as never,
          'IDENTITY capability: not actuable from a widget',
        );
      if (MONEY(cap) && !isAllowlisted(subject.key))
        return refuse(
          'insufficient_authority' as never,
          'MONEY capability is gap-keyed',
        );
      return pass;
    }
    default:
      return refuse(
        'insufficient_authority' as never,
        'unknown capability space',
      );
  }
};

// ── Gate 7 — effect admissibility ────────────────────────────────────────────────────────────────
//
// A COMMIT is admissible only from the allowlist, and only behind the confirmation kind F72's
// lookup gives it — a lookup with NO DEFAULT BRANCH, so an un-allowlisted key resolves to no
// confirmation kind at all and refuses.

const ACTUATING = ['COMMIT', 'DRAFT', 'REQUEST_APPROVAL', 'REFINE', 'CONTROL'];

export const gate7 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('effect_not_admissible' as never, 'no record');
  if (!ACTUATING.includes(r.effect)) return pass;

  const subject = subjectOf(r);
  if (subject === null)
    return refuse(
      'effect_not_admissible' as never,
      `${r.effect} with no subject capability`,
    );

  if (r.effect === 'COMMIT') {
    if (subject.space !== 'AE')
      return refuse(
        'effect_not_admissible' as never,
        'a COMMIT names an AE capability',
      );
    if (!isAllowlisted(subject.key))
      return refuse(
        'effect_not_admissible' as never,
        'capability_not_allowlisted',
      );
    const row = rowFor(subject.key);
    if (!row)
      return refuse('effect_not_admissible' as never, 'no allowlist row');
    // F74: the confirmation this COMMIT names must be of the kind its row pairs with, and it must
    // exist. A COMMIT that names no confirmation is the thing the whole booking flow exists to
    // make impossible.
    if (r.confirmationOfKind !== row.confirmationOfKind || !r.confirmationOfRef)
      return refuse(
        'booking_confirmation_required' as never,
        `expected a ${row.confirmationOfKind} confirmation`,
      );
  }
  return pass;
};

// ── Gate 8 — input validation ────────────────────────────────────────────────────────────────────
//
// Every submitted value must come from the server-declared closed domain. §3.8's shape already
// makes an endpoint or a capability name unrepresentable; this is the remaining half — that the
// VALUES are ones the server offered.

const MAX_SUBMISSION_BYTES = 16 * 1024;

export const gate8 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('bound_violation' as never, 'no record');

  const raw = JSON.stringify(ctx.submission.inputs ?? {});
  if (Buffer.byteLength(raw, 'utf8') > MAX_SUBMISSION_BYTES)
    return refuse(
      'oversize_submission' as never,
      `${Buffer.byteLength(raw, 'utf8')} bytes`,
    );

  const domain = new Set(
    r.selectionDomain
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!domain.size) return pass; // nothing was offered, so nothing may be selected — and none was

  for (const [, value] of Object.entries(ctx.submission.inputs ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values)
      if (typeof v === 'string' && !domain.has(v))
        return refuse(
          'selection_out_of_domain' as never,
          'a value the server did not offer',
        );
  }
  return pass;
};

// ── Gate 8-R — readback ──────────────────────────────────────────────────────────────────────────
//
// On a spoken carrier, an actuating effect requires the person to have affirmed the SERVER's
// sentence — and the affirmation is checked against the body hash, so affirming a different body
// than the one that was read out does not pass.

const SPOKEN_CARRIERS = ['realtime-voice'];

export const gate8R = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('readback_missing' as never, 'no record');
  if (!SPOKEN_CARRIERS.includes(ctx.carrier)) return pass;
  if (!ACTUATING.includes(r.effect)) return pass;

  const ack = ctx.submission.readback_ack;
  if (!ack)
    return refuse(
      'readback_missing' as never,
      'a spoken actuation requires a readback',
    );
  if (ack.body_hash !== r.bodyHash)
    return refuse(
      'readback_mismatch' as never,
      'the affirmation names a different body',
    );
  return pass;
};

// ── Gate 9 — lowering: NOT HERE ──────────────────────────────────────────────────────────────────
//
// A `gate9` that returned `pass` lived here and was counted as wiring. It performed nothing: §3.9's
// Gate 9 is not a refusal but the first durable write — the tap's rendered utterance appended as a
// USER turn with authority NONE — and no code performs that append. A function that can only pass
// is not a gate. The slot is a refusing NORMATIVE-PENDING stub in the pipeline until the append is
// built; see intent-gateway.service.ts.

// ── Gate 10 — divergence audit, REFUSAL ON EFFECT-CLASS DIVERGENCE ───────────────────────────────
//
// The owner's ruling, applied exactly: a divergence WITHIN one effect class is audited and is not
// on its own grounds for refusal; a divergence that CHANGES the effect class refuses before
// admission. The taxonomy is §3.2's existing eight classes — no new classification was created.
//
// What the rule may never permit, and does not: READ -> WRITE, PREPARE -> COMMIT, one action class
// to a materially different one, a change of canonical owner, an escalation of business effect, or
// a bypass of approval, consent or authority.

export interface DivergenceRecord {
  readonly recordCapability: string | null;
  readonly routerCapability: string | null;
  readonly recordEffectClass: string;
  readonly routerEffectClass: string | null;
  readonly crossed: boolean;
}

export const divergences: DivergenceRecord[] = [];

export const gate10 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return pass;
  if (!r.renderedUtterance) return pass; // nothing was said; there is nothing to compare

  const resolved = resolveCapability(r.renderedUtterance);
  const recordKey = r.capabilityKey;
  if (resolved === null || resolved.key === recordKey) return pass;

  const recordClass = r.effect;
  const routerClass = effectClassOf(resolved);
  const crossed = routerClass !== null && routerClass !== recordClass;

  divergences.push({
    recordCapability: recordKey,
    routerCapability: resolved.key,
    recordEffectClass: recordClass,
    routerEffectClass: routerClass,
    crossed,
  });

  // Same class: audited, not refused. Different class: refused before admission.
  return crossed
    ? refuse(
        'intent_divergence' as never,
        `the tap names ${recordClass}, the words resolve to ${routerClass}`,
      )
    : pass;
};

// ── Gate 11 — noun resolution ────────────────────────────────────────────────────────────────────
//
// The only anti-drift fence between mint and execution. The handles a widget froze are compared
// against a fresh read; a handle that has moved refuses `handle_stale` rather than acting on a
// record that is no longer what was shown.

export type FreshRead = (
  r: IntentRecordRow,
) => Promise<{ bodyHash: string } | null>;

export const gate11 = async (
  ctx: GateContext,
  fresh?: FreshRead,
): Promise<GateVerdict> => {
  const r = ctx.record;
  if (!r) return refuse('handle_stale' as never, 'no record');
  if (!fresh) return pass; // no canonical read is owed for this effect
  const now = await fresh(r);
  if (!now)
    return refuse(
      'handle_stale' as never,
      'the referenced record no longer resolves',
    );
  return now.bodyHash === r.bodyHash
    ? pass
    : refuse(
        'handle_stale' as never,
        'the record changed after the widget was shown',
      );
};

// ── Gate 12 — the data fence ─────────────────────────────────────────────────────────────────────
//
// All five PII fences, on the path. They were correct and called from nowhere; this is the call.
// Each fires independently — a submission that trips any one of them is refused, and the K4 suite
// already proves that removing any one leaves the other four firing.

export interface DataFenceSubject {
  /** The principal the data belongs to, as a proof hash. */
  readonly subjectPrincipalProofHash: string | null;
  readonly subjectTenantId: string | null;
  readonly piiClass: 'none' | 'business_aggregate' | 'client_identified';
  readonly carrier: string;
}

/** The highest PII class each carrier may carry. An artefact above its ceiling is refused. */
export const CARRIER_PII_CEILING: Readonly<
  Record<string, DataFenceSubject['piiClass']>
> = Object.freeze({
  pwa: 'client_identified',
  native: 'client_identified',
  'telegram-bot': 'business_aggregate',
  'web-push': 'none',
  sms: 'none',
  email: 'business_aggregate',
  'realtime-voice': 'business_aggregate',
});

const PII_RANK: Readonly<Record<string, number>> = Object.freeze({
  none: 0,
  business_aggregate: 1,
  client_identified: 2,
});

export const gate12 = (
  ctx: GateContext,
  subject?: DataFenceSubject,
): GateVerdict => {
  if (!subject) return pass; // this submission carries no subject data
  const r = ctx.record;
  if (!r) return refuse('use_secure_surface' as never, 'no record');

  // CROSS-TENANT: refused before anything else, because a tenant mismatch is not a presentation
  // question and must never reach a fence that could be reasoned around.
  if (
    subject.subjectTenantId !== null &&
    subject.subjectTenantId !== ctx.tenantId
  )
    return refuse('use_secure_surface' as never, 'cross-tenant personal data');

  // CROSS-PRINCIPAL identified PII: the data belongs to someone who is not the caller.
  if (
    subject.piiClass === 'client_identified' &&
    subject.subjectPrincipalProofHash !== null &&
    subject.subjectPrincipalProofHash !== ctx.principalProofHash
  )
    return refuse(
      'use_secure_surface' as never,
      'identified personal data of another principal',
    );

  // ABOVE THE CARRIER CEILING: a carrier that cannot hold this class does not get it.
  const ceiling = CARRIER_PII_CEILING[subject.carrier] ?? 'none';
  if (PII_RANK[subject.piiClass] > PII_RANK[ceiling])
    return refuse(
      'use_secure_surface' as never,
      `${subject.piiClass} above the ${subject.carrier} ceiling`,
    );

  return pass;
};

/** The five fences, named, so the count is the contract's and not a subset of it. */
export const DATA_FENCES = PII_FENCES;
export const FENCE_FUNCTIONS = [
  clientPreviewFence,
  llmBoundaryFence,
  artifactPiiFence,
  spokenReadbackFence,
  secureSurfaceFence,
];

// ── Gate 13 — effect routing ─────────────────────────────────────────────────────────────────────
//
// The router has no default case and no edge from a control key to the Action Engine, and no
// `NONE`-class intent appears in any routing map. A subject that resolves to none of the four
// destinations terminates rather than falling through.

export const gate13 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('effect_not_admissible' as never, 'no record');

  const subject = subjectOf(r);
  if (r.effect === 'NONE')
    return { outcome: 'terminate', why: 'NONE has no route by design' };
  if (subject === null)
    return {
      outcome: 'terminate',
      why: 'a NAVIGATE with no capability routes in the shell',
    };

  switch (subject.space) {
    case 'CONTROL':
      return {
        outcome: 'terminate',
        why: 'routed to the one registered control handler',
      };
    case 'AE':
      return {
        outcome: 'terminate',
        why: 'routed to the canonical action ingress (Gate 14)',
      };
    case 'C9':
      return { outcome: 'terminate', why: 'routed to the orchestrator' };
    default:
      // No default admission. A space the router does not know is refused, not passed.
      return refuse(
        'effect_not_admissible' as never,
        'no route for this capability space',
      );
  }
};

/** A sensitive destination admits a class-`s` HANDOFF and nothing else — R3.5.1, on the path. */
export const gateSensitiveDest = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return pass;
  const subject = subjectOf(r);
  if (subject === null) return pass;
  if (!sensitiveDest(subject)) return pass;
  const target = r.targetJson as { class?: string } | null | undefined;
  if (r.effect !== 'HANDOFF' || target?.class !== 's')
    return refuse(
      'insufficient_authority' as never,
      'a consent or identity subject admits a class-s HANDOFF and nothing else',
    );
  return pass;
};
