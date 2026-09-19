// ── Gate 6 — authority, computed from scratch (GATES-PLAN-V11 U6-L1) ────────────────────────────
//
// «Gate 6 in full» (C11:4736-4798) is a block, and this file is that block in its order. The subject
// is bound ONCE and the dispatch reads it, never `record.capability` (G6-1, C11:4739); the dispatch is
// scoped BY EFFECT before it is scoped by space, because a HANDOFF resolves the DESTINATION fences and
// nothing else (F54, C11:4743-4747).
//
// What changed from the version this replaces, and why each change is forced by V1.1:
//
//   R3.5.1 LEFT THE SLOT'S FRONT DOOR. `gateSensitiveDest` ran `floor.ts`'s `sensitiveDest` over EVERY
//   effect, so a `REFINE` or `DRAFT` on the booking owner's own keys was refused at slot 6. A1
//   (C11:7090, disposition C11:7169, follow-up C11:7399) makes exactly those intents mintable, and
//   R3.5.1 itself is evaluated at `EP-MINT` by the emission validator and at INV-8' (C11:5349) — at
//   Gate 6 it is evaluated "in its `HANDOFF` destination branch only" (C11:1836). So F48's
//   `SENSITIVE_DEST` now runs HERE, inside the HANDOFF branch, over the generated predicate
//   (`authority/verification-floor.runtime.ts`) rather than over `floor.ts`'s hand-written one.
//   The `gateSensitiveDest` shim that stood in the slot's front door is DELETED with `sensitiveDest`
//   itself, in U6-L1's merge commit (R6-1b; D-18: an implementer adds, the integrator deletes). The
//   fence it stood for is below, in the HANDOFF branch.
//
//   THE `MONEY && !isAllowlisted` CHECK IS GONE. (a) subsumes it: a MONEY key with no
//   `AE_WIDGET_COMMIT_ALLOWLIST` row is refused by the allowlist test itself, and two statements of
//   one rule are two things that can disagree.
//
//   (a)-(e) AND THE CATALOGUE BRANCH ARE STATED. (a), (b) and (c) are decided here now. (d), (e) and
//   C20 are a HELD LANE (AMB-01a) until U6-L3 binds the live principal: they REFUSE, with a detail
//   that says which half is held. "Not built yet" and "allowed" are never the same branch (F5).
//
//   CKPT-W1 CLOSE review fix: this line said "(d) and C20", and the refusal a caller actually reads
//   said "(d)" alone, although the branch holds BOTH (d) the allowedActorRoles test and (e) the
//   EntitlementsService requiredFeatures test. §3.9 lists five conditions for row 6; a reader of the
//   refusal could not tell that the entitlement half was unbuilt too. Nothing was mis-decided — the
//   branch refuses either way — but the wave's disclosure standard was breached in the one place it
//   is read from, so both halves are named in the detail now.
//
//   NO DETAIL / i-CLASS BRANCH. A5 is STOPPED (S6-4, C11:7173) and adds no branch: a `detail`, `w`,
//   `i` or `s` NAVIGATE has a null subject and passes with zero owner calls (C11:4740-4741). The
//   mutant that adds one (M28) is killed by P-NULL-DETAIL.
//
// Every refusal is `insufficient_authority` (C11:4725) — Gate 6 invents no code. The DETAIL is what
// says which fence fired, and the tests name it, because asserting the code alone let a mutant
// through once already (see `gate6.spec.ts`).
//
// A RAISE IS THE REFUSAL (G6-20, C11:4779-4781). The dispatch runs inside one try/catch: a throwing
// accessor is correct at a refusal point. Gate 6 makes no store call and holds no lock, so there is
// nothing here a genuine transport fault could be confused with (NW, D-12).

import { c9Capability } from '../../orchestration/c9.registry';
import { canonicalProductionPolicyDefinitions } from '../../action-engine/action-engine.policy-registry';
import type { UserRole } from '../../common/domain.enums';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  C9_REGISTRY_HASH,
  CONSENT,
  IDENTITY,
  MAYA_AI_TOOL_CATALOG_BY_NAME,
  WIDGET_CAPABILITY_POLICY,
  actionCapabilityRegistry,
  capKey,
} from '../authority/contract-bindings';
import { resolves } from '../authority/registry-binding';
import { SENSITIVE_DEST } from '../authority/verification-floor.runtime';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import { subjectOf } from './subject';
import { pass, refuse } from './verdict';

// §3.9 gives this gate ONE code, `insufficient_authority` (C11:4725), and every branch below spells
// it as a literal rather than through a constant. That is not repetition for its own sake:
// `gate-files.source.spec.ts` requires the argument of `refuse` to be a plain string literal, so that
// a gate's vocabulary can be read out of its source without executing it — a constant would put one
// indirection between the file and the closed vocabulary, and a mutant could redirect it.

/** An owner port that nothing has bound yet. Its raise becomes this gate's refusal (G6-20). */
export class Gate6OwnerUnbound extends Error {}

/**
 * The owner set slot 6 will be handed by `@Inject(GATE6_OWNERS)` (R6-1), unbound here.
 *
 * D-18 lets an implementer ADD only, so until the integrator injects the port the gateway still calls
 * `gate6(ctx)` with one argument. The default must therefore be SAFE rather than absent: every member
 * raises, and the raise becomes this gate's refusal. It can only be reached once U6-L3 opens the held
 * lane below, and then only on a build where R6-2 has not provided the token.
 *
 * It is declared HERE rather than in the provider file on purpose: `gate6.ts` imports the port as a
 * TYPE, so the gateway's run-time import closure never reaches an owner service through slot 6
 * (H6/B-22, `emission/seal-h6.architecture.spec.ts` SEAL-5).
 */
export const heldGate6Owners: Gate6Owners = Object.freeze({
  assertCanExecute: () =>
    Promise.reject(
      new Gate6OwnerUnbound('GATE6_OWNERS is not bound (R6-1, R6-2)'),
    ),
  grantsRequiredFeatures: () =>
    Promise.reject(
      new Gate6OwnerUnbound('GATE6_OWNERS is not bound (R6-1, R6-2)'),
    ),
});

/** The target's class, as a string or nothing. A target with no readable class is not class `s`. */
const targetClass = (r: IntentRecordRow): string | null => {
  const t = r.targetJson as { class?: unknown } | null | undefined;
  return typeof t?.class === 'string' ? t.class : null;
};

const ACTION_POLICY_BY_CAPABILITY = new Map(
  canonicalProductionPolicyDefinitions().map((row) => [row.capability, row]),
);

/**
 * The HANDOFF destination fences, and ONLY those (G6-6, G6-7; C11:4743-4747).
 *
 * Two of the four fences are Gate 6's: registration in the subject's own space, and F48's
 * `SENSITIVE_DEST`. The other two are named in the same sentence and belong elsewhere —
 * `targetFloor('s')` is Gate 5's term, and the landing surface's own ingress is the landing route's
 * (`EP-FETCH`, R3.8.5; the programme's LANDING-VERIFY dependency, which is why G6-6 stays `false`
 * until it exists). Nothing here resolves `assertCanExecute`, `c9Capability`'s domain/mode admission
 * or the AE commit allowlist, and the certified note says why: applying an execute-admission test to a
 * destination would block a BI run from even OFFERING `a22.configuration` (C11:4790-4798).
 */
const handoffDestination = (
  r: IntentRecordRow,
  ref: CapabilityRef,
): GateVerdict => {
  if (!resolves(ref))
    return refuse(
      'insufficient_authority',
      'HANDOFF destination is not registered in its space',
    );
  // R3.5.1's Gate 6 half: a consent or identity destination admits a class-`s` handoff and nothing
  // else. F48's predicate is total over the four spaces and fails closed (C11:4180-4184).
  if (SENSITIVE_DEST(ref) && targetClass(r) !== 's')
    return refuse(
      'insufficient_authority',
      'a sensitive HANDOFF destination admits a class-s target and nothing else',
    );
  return pass;
};

/**
 * The AE branch: (a)...(e) direct, in the block's order (C11:4749-4758).
 *
 * The TRANSITIONAL `CONSENT`/`IDENTITY` veto runs FIRST and is not one of the five. It is a check the
 * row does not state, kept until P-23 lands F31's start-up vetoes and U6-L2 deletes it (AREA-A §2.1
 * L2; §2.6 constraint 6). Running it first is what makes it observable: a consent key has no
 * allowlist row either, so behind (a) the veto would be invisible and its deletion untestable. Any
 * Gate 6 flip before U6-L2 records it as a deviation (AREA-A's audit note).
 *
 * (d) and (e) are the HELD LANE: both read the live principal, which is U6-L3's.
 */
const aeSubject = async (
  ctx: GateContext,
  ref: CapabilityRef,
  owners: Gate6Owners,
): Promise<GateVerdict> => {
  if (!resolves(ref))
    return refuse('insufficient_authority', 'unregistered AE key');
  // `get`, as the row spells it (C11:4751). It raises on an unregistered key; the raise is the
  // refusal, and `resolves` above has already given that case its own detail.
  const cap = actionCapabilityRegistry.get(ref.key);

  if (CONSENT(cap))
    return refuse(
      'insufficient_authority',
      'TRANSITIONAL veto: CONSENT capability - the widget layer cannot confer consent',
    );
  if (IDENTITY(cap))
    return refuse(
      'insufficient_authority',
      'TRANSITIONAL veto: IDENTITY capability - not actuable from a widget',
    );

  // (a) the AE key has a row in AE_WIDGET_COMMIT_ALLOWLIST. This subsumes the MONEY gap-key check
  // the previous version carried beside it: a MONEY key with no row is refused right here.
  if (AE_WIDGET_COMMIT_ALLOWLIST[ref.key] === undefined)
    return refuse(
      'insufficient_authority',
      '(a) no AE_WIDGET_COMMIT_ALLOWLIST row',
    );
  // (b) ActionCapabilityRegistry.get(key).policyDecision === 'ALLOW'
  if (cap.policyDecision !== 'ALLOW')
    return refuse(
      'insufficient_authority',
      `(b) policyDecision is ${String(cap.policyDecision)}, not ALLOW`,
    );
  // (c) allowedSourceTypes includes 'authenticated_request' - F33's only source type (C11:557-573).
  if (!cap.allowedSourceTypes.includes('authenticated_request'))
    return refuse(
      'insufficient_authority',
      "(c) allowedSourceTypes does not include 'authenticated_request'",
    );

  // (d) reads the role already resolved inside T. A second membership read here could disagree with
  // the principal Gate 3 bound, and the JWT role is not the canonical membership role (D-2).
  if (ctx.principal?.role === null || ctx.principal === null)
    return refuse('insufficient_authority', '(d) no live principal role');
  const policy = ACTION_POLICY_BY_CAPABILITY.get(ref.key);
  if (policy === undefined)
    return refuse('insufficient_authority', '(d) no canonical action policy');
  if (!policy.allowedActorRoles.includes(ctx.principal.role as UserRole))
    return refuse(
      'insufficient_authority',
      `(d) role ${ctx.principal.role} is not admitted`,
    );

  // (e) asks the entitlement owner for the conjunction. No feature list supplied by the caller is
  // consulted; the list is the canonical action policy's.
  if (
    !(await owners.grantsRequiredFeatures(
      ctx.tenantId,
      policy.requiredFeatures,
    ))
  )
    return refuse('insufficient_authority', '(e) required feature is absent');
  return pass;
};

/**
 * The C9 branch (C11:4760-4769).
 *
 * The 47 go to `AiToolPolicyService.assertCanExecute` - C20, the HELD LANE, because that call takes
 * the live principal. The nine (24 once F36a registers) take their `WIDGET_CAPABILITY_POLICY` row
 * and, on a RUN-BEARING mint path only, `c9Capability`'s own admission.
 *
 * The row test is a build-time totality restatement, not a second runtime check: the table is total
 * over all 56 keys and a missing row fails the build, so for a registered ref this refusal can never
 * fire at runtime (C11:4792-4795). It is stated because the block states it, and G6-15's evidence is
 * that totality plus a positive - never a runtime refusal.
 *
 * `c9Capability` is CALLED, not re-implemented. It refuses an unregistered key, a registry-hash
 * mismatch, a domain mismatch and a non-`READ` mode under `BUSINESS_INTELLIGENCE` (C11:4764-4768),
 * and it does so by raising - which is the refusal. Restating its `BUSINESS_INTELLIGENCE` arm here
 * would be a second copy of one rule, free to disagree with the registry the rule lives in.
 */
const c9Subject = async (
  ctx: GateContext,
  r: IntentRecordRow,
  ref: CapabilityRef,
  owners: Gate6Owners,
): Promise<GateVerdict> => {
  if (!resolves(ref))
    return refuse('insufficient_authority', 'unregistered C9 key');

  const def = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key);
  if (def !== undefined) {
    if (ctx.principal?.role === null || ctx.principal === null)
      return refuse('insufficient_authority', 'C20 no live principal role');
    if (
      ctx.principal.authority.kind !== 'USER' ||
      ctx.principal.authority.userId === null
    )
      return refuse('insufficient_authority', 'C20 principal is not a user');
    await owners.assertCanExecute(
      ctx.tenantId,
      ctx.principal.authority.userId,
      ctx.principal.role,
      def,
    );
    return pass;
  }

  if (WIDGET_CAPABILITY_POLICY[capKey(ref)] === undefined)
    return refuse('insufficient_authority', 'no WIDGET_CAPABILITY_POLICY row');

  // R3.7.1: on a run-less mint path `record.c9_domain` is null and this half is NOT applied
  // (C11:4768-4769). The guard is the record's own column, never a re-derivation from the subject.
  if (r.c9Domain !== null) c9Capability(ref.key, r.c9Domain, C9_REGISTRY_HASH);
  return pass;
};

/** The block, in its order. Every path returns a verdict; there is no fall-through that passes. */
const dispatch = async (
  ctx: GateContext,
  r: IntentRecordRow,
  ref: CapabilityRef,
  owners: Gate6Owners,
): Promise<GateVerdict> => {
  // G6-19, before the effect scope: "no intent OF ANY EFFECT CLASS may carry a TOOL ref" (R3.2.2,
  // C11:4775-4776). F24 makes the 47 catalogue names C9 keys by spelling, so a TOOL-spaced ref is a
  // ref that resolved against the wrong table - including one that arrived as a handoff destination.
  if (ref.space === 'TOOL')
    return refuse(
      'insufficient_authority',
      'a TOOL ref may not be an intent subject',
    );

  // F54 scopes Gate 6 BY EFFECT before it scopes by space.
  if (r.effect === 'HANDOFF') return handoffDestination(r, ref);

  switch (ref.space) {
    case 'C9':
      return c9Subject(ctx, r, ref, owners);
    case 'AE':
      return aeSubject(ctx, ref, owners);
    case 'CONTROL':
      // G6-18 (C11:4771-4773). `CONTROL_FLOOR[ref.key]` was applied at Gate 5, Gate 3 bound the
      // principal and Gate 4 asserted the tenant; the one registered handler then performs its OWN
      // principal and tenant check (R3.2.4, C11:3852-3861), which Gate 13 is where it is proven.
      // There is NO execute-admission test here, and adding one would be the mutant.
      return resolves(ref)
        ? pass
        : refuse('insufficient_authority', 'unregistered CONTROL key');
    default:
      // FAIL CLOSED. `Space` is closed at four, so this is unreachable by type; a ref whose space is
      // not one of them is not a ref that may inherit somebody else's branch.
      return refuse('insufficient_authority', 'unknown capability space');
  }
};

// `async` although U6-L1 awaits nothing: slot 6's signature is settled here so that U6-L3 can bind
// the held lane — `await owners.assertCanExecute(principal, def)` for C20 and the (e) entitlement
// read — without the gateway's array, an integrator-only file, changing shape a second time. The
// runner already awaits every gate (`gate.run(ctx)`), so the promise costs nothing today.
export const gate6 = async (
  ctx: GateContext,
  owners: Gate6Owners,
): Promise<GateVerdict> => {
  const r = ctx.record;
  if (!r) return refuse('insufficient_authority', 'no record');

  // G6-1: bound ONCE, and every branch below reads THIS binding. Binding it twice is how a gate
  // starts authorising one capability and admitting another.
  const ref = subjectOf(r);

  // G6-5: `if (ref === null)` -> no capability is exercised; Gate 6 has nothing to check and the
  // intent proceeds (C11:4740-4741). NONE, and a `w`/`i`/`s`/`detail` NAVIGATE. Refusing here would
  // make the mandatory escape unusable, and calling an owner here is M28.
  if (ref === null) return pass;

  try {
    return await dispatch(ctx, r, ref, owners);
  } catch (error) {
    // G6-20: a raise IS the refusal (C11:4779-4781). The message is kept for the log, never widened
    // into a different code.
    return refuse(
      'insufficient_authority',
      `owner raised: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
