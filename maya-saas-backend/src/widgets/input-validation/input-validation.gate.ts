// ── Gate 8 — input validation: the slot seam ────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX), then U8a. IR-8a-1 is APPLIED: slot 8 calls `InputValidationGate.run`
// and carries no `pendingOn`, so the I-CTX stub `inputValidation` and its `INPUT_VALIDATION_PENDING_ON`
// have no caller and are deleted with that merge (only the integrator deletes, D-18).
//
//   `InputValidationGate`  the BUILT gate: the null-schema lane of row 8 (C11:4727), with the schema
//                          lane held fail-closed (B-01, C11:7188) until U8b builds the codec lane.
//
// The gate is a class, not a function, for one reason: the lane's pass produces the J-1 fact
// `loweringSource`, and that fact is a READ (D-2, plan §2.5). A gate file may not name the store client
// — it is a gate file by `/\.gate\.ts$/`, and `widget-import-graph.architecture.spec.ts`'s GATE-FILE
// rule refuses one that reaches Prisma — so the read arrives as a PORT, `LoweringSourcePort`, and the
// store that implements it lives in `stores/lowering-source.read.ts`.
//
// ORDER IS THE MECHANISM HERE. The decision is taken first, from the record and the submission alone;
// the read happens only on a pass, once, after it. Refusals read nothing. That is what makes "a token
// refused at Gates 1–8 loads no class-C column" a property of the code's shape rather than a habit —
// and it is also R3.9.1's ordering in miniature (INV-24, C11:5356): nothing durable, and now nothing
// conversational either, before the gate that would refuse.
//
// The function that stood in this slot before U0 failed open: it passed every non-string value, and
// every value on an empty domain (G8 §5.0).

import { Inject, Injectable } from '@nestjs/common';

import type { GateContext, GateVerdict } from '../gate.types';
import { refuse } from '../gates/verdict';
import type {
  LoweringSourcePort,
  LoweringSourceRow,
} from '../stores/lowering-source.read';
import { LoweringSourceReader } from '../stores/lowering-source.read';
import { decideForContext } from './input-validation';
import { selectedLabelsFor } from './label-mapping';

/**
 * The built gate, as a function over an explicit port.
 *
 * `reader` is not optional and has no default. A default would be a second answer to "where does the
 * lowering source come from", and an unbound-port default that passed would be the exact failure the
 * whole package exists to prevent — so binding is the caller's duty and the class below is the one
 * caller the pipeline has.
 */
export const runInputValidation = async (
  ctx: GateContext,
  reader: LoweringSourcePort,
): Promise<GateVerdict> => {
  const decision = decideForContext(ctx);
  // The refusal branches return BEFORE the read: a refused submission loads no template, no label and
  // no turn join (D-2). T-HELD and T-READ-ONCE pin that on the live path.
  //
  // Both codes are written as string literals rather than passed through from the decision, so the two
  // refusals row 8 has today are greppable in the gate that answers them and each is checked against
  // §3.9's closed vocabulary where it is written (the `gates/` fence's rule, kept here by hand).
  if (decision.verdict === 'refuse')
    return decision.code === 'selection_out_of_domain'
      ? refuse('selection_out_of_domain', decision.detail)
      : refuse('mechanism_absent', decision.detail);

  // The null-schema lane passed. `validatedInputs` is null — no schema declared a field, so nothing was
  // validated — and `selectedLabels` is the empty selection, never null (R3.9.2; see `label-mapping.ts`).
  const validatedInputs = null;
  const selectedLabels = selectedLabelsFor(validatedInputs);
  const loweringSource: LoweringSourceRow = await reader.read(
    ctx.tenantId,
    ctx.intentTokenHash,
  );

  return {
    outcome: 'pass',
    facts: { validatedInputs, selectedLabels, loweringSource },
  };
};

/**
 * Slot 8's provider (`INPUT_VALIDATION`, `di-tokens.ts`). IR-8a-1 binds it and rewires the slot to
 * `run: (ctx) => this.inputValidation.run(ctx)`.
 */
@Injectable()
export class InputValidationGate {
  /**
   * The DECLARED dependency is the port, and `LoweringSourceReader` appears only as the token that
   * resolves it: the gate is written against what it needs, and the store is what the module binds
   * (IR-8a-1). It is also why a test can hand it a recording port without a cast.
   */
  constructor(
    @Inject(LoweringSourceReader)
    private readonly loweringSource: LoweringSourcePort,
  ) {}

  run(ctx: GateContext): Promise<GateVerdict> {
    return runInputValidation(ctx, this.loweringSource);
  }
}
