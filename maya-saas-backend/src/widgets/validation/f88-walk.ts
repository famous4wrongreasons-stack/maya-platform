// P-F88 (GATES-PLAN-V11) — F88's ONE structural validator, at runtime.
//
// F88 (C11:1609-1621): "one structural validator — a total walk over the serialized value — applied to
// `WidgetEnvelope`, `WidgetIntentSubmission`, `ChannelProfile`, `NativeBridgeManifest` and
// `IntentRecord`. **Its only exemptions are the six exact structural locations enumerated in F88.2;
// the validator holds no key-name allowlist and cannot be given one.**" Evaluation points: `EP-MINT`,
// `EP-INGRESS`, `EP-REGISTRY-LOAD`.
//
// This file is that validator. `scripts/widget-contract-check.mjs` runs the same union and the same
// six locations over the DECLARED shapes at build time; this one runs them over a VALUE at runtime.
// Both read the union from the contract (`f88.generated.ts`, `emit-f88.mjs`), and `f88-walk.spec.ts`
// asserts the two lists are equal, so neither can drift (R3.8.2's "what a list maintained in two
// places does").
//
// What the walk is, precisely:
//   - TOTAL. Every own enumerable key of every object reached from the root, at every depth. There is
//     no depth cap: a cap is a hole, and the mutation battery contains the capped variants.
//   - STRUCTURAL. An exemption is a `(shape, path, depth, type)` tuple from F88.2's own table. The key
//     is DERIVED from the path, so no row can name a key without also naming where it sits. There is
//     no member on `F88Exemption` that could express "the key `k` is allowed" (F88.2's prohibition),
//     and `f88-walk.spec.ts` asserts that against this file's own source and the generated table.
//   - FAIL-CLOSED. An unrecognised container (a class instance, a Map) is still walked as an object;
//     a value that is not an object contributes no keys and no exemption.
//
// At `EP-INGRESS` the root is `WidgetIntentSubmission`, and NO row of F88.2 names that shape — so on a
// submission every one of the twenty-eight keys fails at every depth, which is exactly R3.8.2 ("no
// forbidden key at any depth ... and no key the contract does not declare may appear at any depth
// either"; the second half is the DTO's closed shape plus `forbidNonWhitelisted`).
//
// `nested` is the seam `EP-MINT` needs and `EP-INGRESS` does not use: a serialized envelope contains
// other DECLARED shapes (`Cell`, `Lifecycle`, `WidgetIntent`), and F88.2 states each row's path and
// depth INSIDE its own shape. A caller that walks an envelope declares where those shapes begin, and
// the walk restarts path and depth there. With no declaration the walk stays in one shape, which is
// the stricter reading: a nested `role` is then a violation rather than an exemption.

import { BadRequestException } from '@nestjs/common';

import {
  F88_EXEMPTIONS,
  F88_FORBIDDEN_KEYS,
  F88_WALK_ROOTS,
  type F88WalkRoot,
} from '../../widget-contract/f88.generated';

const FORBIDDEN: ReadonlySet<string> = new Set<string>(F88_FORBIDDEN_KEYS);

/** Where a nested DECLARED shape begins inside the value being walked. */
export interface F88NestedShape {
  /**
   * The member the nested shape begins at, in the same path spelling the walk produces. When that
   * member holds an array, each element is one instance of the shape.
   */
  readonly at: string;
  /** The declared shape's name, as F88.2's `shape` column spells it. */
  readonly shape: string;
}

export interface F88Violation {
  /** The declared shape the key was found in — the walk root, or a nested shape the caller declared. */
  readonly shape: string;
  readonly key: string;
  /** The location inside `shape`; array steps are written `[]`. */
  readonly path: string;
  readonly depth: number;
}

/**
 * True when F88.2's closed table admits this occurrence. All four terms are compared; widening any of
 * them is a declared mutant (`gateP-f88.json`).
 */
const admitted = (
  shape: string,
  path: string,
  depth: number,
  value: unknown,
): boolean =>
  F88_EXEMPTIONS.some(
    (e) =>
      e.shape === shape &&
      e.path === path &&
      e.depth === depth &&
      e.accepts(value),
  );

/**
 * Every forbidden-key occurrence F88.2 does not admit, in walk order. An empty array is a pass.
 *
 * `shape` is the declared shape `value` IS. `nested` declares where other declared shapes begin.
 */
export const f88Violations = (
  shape: string,
  value: unknown,
  nested: readonly F88NestedShape[] = [],
): readonly F88Violation[] => {
  const violations: F88Violation[] = [];
  // Only a true cycle is skipped (ancestors, not "seen"): a value that legitimately appears twice must
  // be walked twice, or a fence could be evaded by sharing a reference.
  const ancestors = new Set<object>();

  const visit = (
    node: unknown,
    currentShape: string,
    path: string,
    depth: number,
  ): void => {
    if (typeof node !== 'object' || node === null) return;
    if (ancestors.has(node)) return;
    ancestors.add(node);
    if (Array.isArray(node)) {
      // An array step is part of the location (`intents_withheld[]`) and adds no depth: F88.2 row 6
      // puts `intents_withheld[].role` at depth 1, one object level below the root. An array AT the
      // root of a shape carries no step of its own: its elements ARE that shape (the `nested` case,
      // where a declared shape begins at a repeated member).
      const elementPath = path === '' ? '' : `${path}[]`;
      for (const element of node)
        visit(element, currentShape, elementPath, depth);
    } else {
      for (const key of Object.keys(node)) {
        const here = path === '' ? key : `${path}.${key}`;
        const child = (node as Record<string, unknown>)[key];
        const begins = nested.find((n) => n.at === here);
        // A certified nested-shape boundary owns the value at this exact path.
        // The static contract checker already admits the declared member there;
        // restart the runtime walk at that shape instead of treating the member
        // name itself as an untyped payload key. Any forbidden key *inside* the
        // nested value is still checked against that shape's closed F88.2 row.
        if (
          FORBIDDEN.has(key) &&
          begins === undefined &&
          !admitted(currentShape, here, depth, child)
        )
          violations.push({ shape: currentShape, key, path: here, depth });
        if (begins) visit(child, begins.shape, '', 0);
        else visit(child, currentShape, here, depth + 1);
      }
    }
    ancestors.delete(node);
  };

  visit(value, shape, '', 0);
  return violations;
};

/** One violation, as a sentence that names the location rather than only the key. */
export const describeF88Violation = (v: F88Violation): string =>
  `F88: forbidden key \`${v.key}\` at ${v.shape}.${v.path} (depth ${v.depth}); F88.2's closed table admits it at no location`;

/** One issue of the shape stage, in the body shape `configure-http-app.ts` gives every 400. */
export interface ShapeStageIssue {
  readonly field: string;
  readonly message: string;
}

/**
 * The shape-stage refusal: a protocol rejection (400), never a §3.9 refusal code.
 *
 * It carries ONE DETAIL PER ISSUE, each naming its own location. That matters: a single merged message
 * on the member the check happens to hang off would tell a caller that `contract` is wrong when the
 * violation is at `inputs.a.b.url`, and the location is the whole content of F88.2's fence.
 */
export class SubmissionShapeRejection extends BadRequestException {
  constructor(readonly issues: readonly ShapeStageIssue[]) {
    const message = issues[0]?.message ?? '§3.8: the submission was refused';
    super({
      message,
      error: {
        code: 'validation',
        message,
        field: issues[0]?.field,
        details: issues.map((i) => ({ field: i.field, message: i.message })),
      },
    });
  }
}

/** The same refusal, built from the walk's own violations. */
export class F88ForbiddenKeyException extends SubmissionShapeRejection {
  constructor(readonly violations: readonly F88Violation[]) {
    super(
      violations.map((v) => ({
        field: v.path,
        message: describeF88Violation(v),
      })),
    );
  }
}

/**
 * Throws `F88ForbiddenKeyException` when the value carries a forbidden key F88.2 does not admit.
 *
 * This is the function every evaluation point calls: the `EP-INGRESS` pipe below, the DTO's own
 * shape constraint (`submit-intent.dto.ts`), and — when it is built — the minter at `EP-MINT`.
 */
export const assertNoForbiddenKeys = (
  shape: string,
  value: unknown,
  nested: readonly F88NestedShape[] = [],
): void => {
  const violations = f88Violations(shape, value, nested);
  if (violations.length > 0) throw new F88ForbiddenKeyException(violations);
};

/** F88's walk roots, re-exported so a caller cannot invent a sixth one by writing a string. */
export const f88WalkRoots: readonly F88WalkRoot[] = F88_WALK_ROOTS;

/**
 * `EP-INGRESS` as a pipe, for the controller scope (IR-F88-1).
 *
 * The walk already runs inside the global `ValidationPipe`, through the DTO's own shape constraint
 * (`submit-intent.dto.ts`), which is what makes the F88 exits runnable before this pipe is wired.
 * Binding this pipe on `POST /api/widgets/intent` puts the same single function on the argument the
 * handler receives — one validator, two call sites, no second list — so a body that reached the
 * handler by any route other than the global pipe is refused too. It is call-through: it returns the
 * value unchanged and its only effect is the 400.
 */
export class F88SubmissionPipe {
  transform(value: unknown): unknown {
    assertNoForbiddenKeys('WidgetIntentSubmission', value);
    return value;
  }
}
