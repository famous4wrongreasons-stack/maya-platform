// The two verdict helpers every gate file in this directory uses.
//
// The finding that produced the gate files is worth keeping at the top of them. Ten of the fifteen
// gates were `pending()` stubs that refused everything, and the rules they name were implemented
// correctly in their own modules and called from nowhere:
//
//   the five PII fences  imported by exactly one file, on no admit path
//   assertCommitAdmissible  called only inside its own module
//   subjectCapability       present in the whole widget layer once, in a COMMENT
//
// So the modules were right and the wiring was absent. Nothing in a gate file re-implements a rule.
// Each gate calls the module that already owns it, and the owner's permanent rule is the shape of
// every one of them: GATE MODULE EXISTS != GATE ENFORCED.
//
// `refuse` takes a `RefusalCode`, not a type derived from `GateVerdict`. The derived form resolved
// to `never` (a non-distributive conditional over a union whose `pass` member has no `code`), so
// every call needed a cast, and the cast switched the vocabulary check off. Typed this way, a code
// outside §3.9's closed vocabulary does not compile, and no cast is needed or permitted
// (`gate-files.source.spec.ts`).

import type { GateVerdict, RefusalCode } from '../gate.types';

export const pass: GateVerdict = { outcome: 'pass' };

export const refuse = (code: RefusalCode, detail: string): GateVerdict => ({
  outcome: 'refuse',
  code,
  detail,
});

// `superseded` is the same helper for the `superseded` outcome, typed and fenced exactly as `refuse`
// is. It lets a gate file return that outcome without an object literal that carries a code, which the
// fence forbids outside this file. Added by GATES-PLAN-V11 I-CTX for Gate 1's seam, `gates/gate1.ts`.
export const superseded = (code: RefusalCode, detail: string): GateVerdict => ({
  outcome: 'superseded',
  code,
  detail,
});

/** L8 response outcome: an expired token carries no refusal code. */
export const expired = (): GateVerdict => ({ outcome: 'expired' });

/** L8 response outcome: a replaced envelope carries no refusal code. */
export const replaced = (): GateVerdict => ({ outcome: 'superseded' });
