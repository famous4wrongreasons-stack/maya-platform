// U10a — `ownerSet` and `sameOwner`, exactly «Gate 10 in full» (C11:4816-4817, 4833-4844).
//
// Gate 10's row 6 refuses when the tapped record's subject and the router's match have DIFFERENT
// owners. "Owner" here is not a service instance and not a module: it is §2.4's owner class for a C9
// key, and §0.7 F27's «owner endpoint» cell for a CONTROL key. Two refs share an owner exactly when
// those sets intersect.
//
// THE CONTRACT, TRANSCRIBED (C11:4833-4844):
//
//   ownerSet(ref), by ref.space:
//     C9      → undefined when c9Registry.tryGet(ref.key) is undefined; otherwise
//               { KIND_REGISTRY[k].owner_class : k ∈ WidgetKind,
//                 KIND_REGISTRY[k].owner_class ∉ {'INHERITED', 'NONE'},
//                 ref ∈ ownerClassKeys(k) }
//     AE      → undefined unless exactly one AE_PROPOSE_PAIRING row p has p.ae equal to ref;
//               otherwise ownerSet(p.propose)
//     CONTROL → undefined when ref.key is not a CONTROL_REGISTRY key; otherwise
//               { the §0.7 F27 «owner endpoint» cell of ref.key }
//     TOOL    → undefined
//
//   sameOwner(a, b) := ownerSet(a) ≠ undefined ∧ ownerSet(b) ≠ undefined ∧ ownerSet(a) ∩ ownerSet(b) ≠ ∅
//
// UNDEFINED FAILS CLOSED (C11:4817). `undefined` is not "no opinion": `sameOwner` is false whenever
// either side is undefined, so row 6 REFUSES. That is why every branch below answers `undefined`
// rather than an empty set when it cannot name an owner, and why the empty set — a registered C9 key
// that no kind's owner class names — is a DIFFERENT answer: it is defined, and it intersects nothing,
// so it also refuses, but it says "this key has no owning kind", not "this key is unknown".
//
// ONE IMPLEMENTATION, NOT A COPY (plan D-5). `KIND_OWNER_CLASS` and `ownerClassKeys` are U-TAB's
// runtime tables in `src/widget-contract/owner-classes.ts`, shared with K20's `emittable`, the minter's
// `allowedKinds` and R3.9.4's remedy. `AE_PROPOSE_PAIRING` is P-25's thirteen F38 rows. `c9Registry`
// and `CONTROL_REGISTRY` are the released registries. Gate 10 carries no table of its own: a second
// copy of an owner table is how two gates quietly stop agreeing about who owns a capability.
//
// WHY THE PAIRING TABLE IS A PARAMETER. `ownerSetOverPairing` takes the pairing rows so the AE
// branch's "exactly one" can be shown to refuse: no AE key is the `ae` side of two rows in the real
// table, so a mutant that takes the FIRST of several rows is undetectable over it (M10-8). The
// exported `ownerSet` closes over the real table and nothing else may re-point it.
//
// Class BUILD/U: this module is a pure lookup. Its unit spec is never live proof (§0.5).

import type {
  CapabilityRef,
  ControlKey,
} from '../../widget-contract/capability-ref';
import type { OwnerClass, WidgetKind } from '../../widget-contract/kinds';
import {
  KIND_OWNER_CLASS,
  isOwnerClassKey,
  ownerClassKeys,
} from '../../widget-contract/owner-classes';
import { CONTROL_REGISTRY } from '../../widget-contract/tables';
import { c9Registry } from '../authority/contract-bindings';
import {
  AE_PROPOSE_PAIRING,
  type ProposePairingRow,
} from '../authority/propose-pairing';

/** The two owner classes C11:4836 excludes from the C9 set: neither names an owner of its own. */
const NOT_AN_OWNER: ReadonlySet<OwnerClass> = new Set<OwnerClass>([
  'INHERITED',
  'NONE',
]);

/** Every `WidgetKind`, from U-TAB's table, which is total over the union by its type. */
const KINDS: readonly WidgetKind[] = Object.freeze(
  Object.keys(KIND_OWNER_CLASS) as WidgetKind[],
);

const isControlKey = (key: string): key is ControlKey =>
  Object.prototype.hasOwnProperty.call(CONTROL_REGISTRY, key);

/**
 * `ownerSet` over a given pairing table (C11:4833-4844). `ownerSet` below is this function closed over
 * the real `AE_PROPOSE_PAIRING`; the parameter exists for the FR-6b refusals the real table cannot
 * exhibit (a duplicated `ae` side), and for nothing else.
 */
export const ownerSetOverPairing = (
  pairing: readonly ProposePairingRow[],
  ref: CapabilityRef | null | undefined,
): ReadonlySet<string> | undefined => {
  if (ref === null || ref === undefined) return undefined; // FAIL CLOSED — no ref, no owner
  switch (ref.space) {
    case 'C9': {
      // "undefined when c9Registry.tryGet(ref.key) is undefined" — an unregistered key has no owner,
      // and that is refused, not treated as "owned by nobody in particular".
      if (c9Registry.tryGet(ref.key) === undefined) return undefined;
      const owners = new Set<string>();
      for (const kind of KINDS) {
        const ownerClass = KIND_OWNER_CLASS[kind];
        if (NOT_AN_OWNER.has(ownerClass)) continue;
        if (isOwnerClassKey(kind, ref)) owners.add(ownerClass);
      }
      return owners;
    }
    case 'AE': {
      // "unless EXACTLY ONE AE_PROPOSE_PAIRING row p has p.ae equal to ref". Zero rows (a GAP, F37)
      // and two rows (FR-6b broken) are both undefined: a COMMIT whose authority is resolved through
      // two different propose keys has no decidable owner.
      const rows = pairing.filter(
        (p) => p.ae.space === 'AE' && p.ae.key === ref.key,
      );
      if (rows.length !== 1) return undefined;
      return ownerSetOverPairing(pairing, rows[0].propose);
    }
    case 'CONTROL':
      // "the §0.7 F27 «owner endpoint» cell" — `control.widget.dismiss` and `control.delivery.resolve`
      // are both owned by the widget layer itself; `control.run.cancel` by the orchestration endpoint.
      return isControlKey(ref.key)
        ? new Set<string>([CONTROL_REGISTRY[ref.key].ownerEndpoint])
        : undefined;
    case 'TOOL':
      // "TOOL → undefined". A tool name is not a capability with an owner; it is a model-facing name.
      return undefined;
    default:
      return undefined; // FAIL CLOSED — a space this contract version does not declare
  }
};

/** `ownerSet(ref)` (C11:4816-4817, 4833-4842) over the real F38 pairing. `undefined` fails closed. */
export const ownerSet = (
  ref: CapabilityRef | null | undefined,
): ReadonlySet<string> | undefined =>
  ownerSetOverPairing(AE_PROPOSE_PAIRING, ref);

/**
 * `sameOwner(a, b)` (C11:4844): both defined and intersecting.
 *
 * Nullable on purpose. Gate 10 reaches row 6 only with a non-null `s` and `q` (rows 3 and 5 answer
 * NULL first), but a predicate that threw on null would make a caller's mistake a 500 instead of a
 * refusal, and the fail-closed answer is the honest one.
 */
export const sameOwner = (
  a: CapabilityRef | null | undefined,
  b: CapabilityRef | null | undefined,
): boolean => {
  const left = ownerSet(a);
  if (left === undefined) return false;
  const right = ownerSet(b);
  if (right === undefined) return false;
  for (const owner of left) if (right.has(owner)) return true;
  return false;
};

/**
 * The owner half of the routing load assertion (U10a: "every `ownerClassKeys` member resolves in its
 * space"). U-TAB's own `assertOwnerClassesResolve` checks the same keys against K20's `REGISTERED_KEYS`
 * set; this one checks them through the readers `ownerSet` ACTUALLY uses — `c9Registry.tryGet` for a C9
 * key and F38's propose side for an AE key — because a key that resolves in one reader and not in the
 * other is exactly the drift Gate 10 would otherwise discover on a live submission.
 *
 * Throws, naming every failure at once. `widgets.module.ts` runs it from `onModuleInit` through
 * `assertRoutingResolves` (IR-U10A-1).
 */
export const assertOwnerSetResolves = (): void => {
  const problems: string[] = [];
  for (const kind of KINDS) {
    const ownerClass = KIND_OWNER_CLASS[kind];
    if (NOT_AN_OWNER.has(ownerClass)) continue;
    for (const ref of ownerClassKeys(kind)) {
      if (ref.space === 'C9' && c9Registry.tryGet(ref.key) === undefined)
        problems.push(
          `${kind}: ${ownerClass} names C9:${ref.key}, which c9Registry does not resolve`,
        );
      if (ref.space !== 'C9' && ref.space !== 'AE')
        problems.push(
          `${kind}: ${ownerClass} names ${ref.space}:${ref.key}, and an owner class resolves only in C9 or AE (§2.4)`,
        );
    }
  }
  for (const [at, p] of AE_PROPOSE_PAIRING.entries()) {
    if (
      p.propose.space !== 'C9' ||
      c9Registry.tryGet(p.propose.key) === undefined
    )
      problems.push(
        `AE_PROPOSE_PAIRING row ${at}: propose side ${p.propose.space}:${p.propose.key} does not resolve in the C9 registry, so ownerSet(AE:${p.ae.key}) cannot reach an owner`,
      );
  }
  for (const [key, cell] of Object.entries(CONTROL_REGISTRY))
    if (cell.ownerEndpoint.trim() === '')
      problems.push(
        `CONTROL_REGISTRY ${key}: the F27 owner endpoint cell is blank`,
      );
  if (problems.length)
    throw new Error(
      `Gate 10's owner sets do not resolve (C11:4833-4844):\n  ${problems.join('\n  ')}`,
    );
};
