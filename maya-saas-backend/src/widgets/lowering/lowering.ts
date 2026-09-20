// ── Gate 9 — the lowering function ───────────────────────────────────────────────────────────────
//
// §3.9 row 9 (C11:4729): `rendered_utterance = render(utterance_template, server-resolved canonical
// labels)`. This module is that `render`, and nothing else. It is pure, it IMPORTS NOTHING, and it
// is the only place a `LoweredUtterance` can come from — which is the whole point of the brand: no
// other value typechecks as what Gate 9 writes to the transcript.
//
// R3.9.2 (C11:4889-4895): `{{selection}}` is filled from `IntentRecord.selected_labels`; raw client
// bytes are never interpolated. That is why the signature takes `readonly string[]` of labels and
// has NO parameter of the submission's `inputs` type (9.1a, held at the source by T-ARCH-SIG). A
// function that could reach the submission could interpolate it by accident; one that cannot, cannot.
//
// ── What this function does when it CANNOT render (GATES-PLAN-V11 D-11, DS-03 A) ────────────────
//
// It returns a typed RENDER IMPOSSIBILITY. It does not throw, and it invents no refusal code.
//
// DS-03 A (Sheet 03:3-6) has no fault carve-out, and R3.9.3 says only a genuine TRANSPORT fault may
// look like a fault (C11:4902-4903). So every way a frozen widget can fail to render — an absent or
// blank template, a template with braces this function cannot resolve, a slot with a label count
// other than one — is a property of the widget, not a defect of the pipeline. Gate 9 answers each of
// them `superseded` / `handle_stale` with no durable write (U9b maps them; this module only names
// them). AREA-B's "shape defects throw" is NOT carried: a throw would be a 500, and a 500 is the
// pipeline claiming a fault it does not have.
//
// The one thing that IS a defect is `LoweringConstructionDefect`: a required earlier-gate fact or
// the request transaction missing after the pipeline claimed to reach Gate 9. That is an invariant
// of the pipeline's own construction, never a property of the widget, so it throws — no verdict,
// no write.
//
// Class: pure. Its unit matrix is a regression aid, not live proof (§0.5).

/**
 * Gate 9's product: a string only `renderUtterance` may brand. `lowerToUserTurn` accepts nothing
 * else as the turn's text (T-ARCH-WRITER), so the transcript cannot be written from a string that
 * was never lowered.
 *
 * Stated here because this module owns the lowering. `gate.types.ts` re-exports it (IR-9a-1); the
 * brand is byte-identical to the one I-CTX put there, so the two are the same type while both stand.
 */
export type LoweredUtterance = string & {
  readonly __brand: 'LoweredUtterance';
};

/** §3.7 (C11:4543): "`utterance_template: string; // '{{selection}}' is the only slot`" (9.1b). */
export const SELECTION_SLOT = '{{selection}}';

/**
 * Why a render was impossible. These are NAMES, for a log and a test — never refusal codes and never
 * a business classification. Gate 9 maps all of them to one answer, `superseded`/`handle_stale`.
 *
 * Closed on purpose, and closed to exactly D-11's list of this function's share of DS-03 A. The
 * other three members of that list — an erased record, an unresolvable label, and erasure racing the
 * write — are not visible from here: they belong to the slot and the writer (U9b).
 */
export type RenderImpossibilityRule =
  /** The template is null, or nothing but whitespace: there is nothing to render. */
  | 'template_absent'
  /** After the one known slot is removed, the template still carries `{{` or `}}`. */
  | 'unknown_slot'
  /** The template has the slot, and the label count is not exactly 1. */
  | 'slot_cardinality';

/** A render that could not happen, and why. Carries no template and no label bytes. */
export interface RenderImpossibility {
  readonly ok: false;
  readonly rule: RenderImpossibilityRule;
}

/** A render that happened. */
export interface RenderedUtterance {
  readonly ok: true;
  readonly utterance: LoweredUtterance;
}

/** What `renderUtterance` answers. Exhaustive: `ok` discriminates it. */
export type RenderOutcome = RenderedUtterance | RenderImpossibility;

/** Narrows a `RenderOutcome` to the impossibility half, so a caller cannot forget to check `ok`. */
export const isRenderImpossibility = (
  outcome: RenderOutcome,
): outcome is RenderImpossibility => !outcome.ok;

/**
 * The pipeline's own construction is broken: a fact Gate 8 declares itself the producer of is
 * missing after Gate 8 passed (J-1), or the transactional slot was invoked without T. It is not a
 * verdict and not a refusal — it propagates out of `submit()`, so nothing is written and no outcome
 * is returned.
 *
 * The message names the missing fact and nothing else: no template, no label, no transcript byte
 * ever reaches a log through this class.
 */
export class LoweringConstructionDefect extends Error {
  constructor(
    readonly missing:
      'loweringSource' | 'selectedLabels' | 'requestTransaction',
  ) {
    super(
      missing === 'requestTransaction'
        ? 'lowering construction defect: missing requestTransaction'
        : `lowering construction defect: gate 8 passed without ${missing} (J-1)`,
    );
    this.name = 'LoweringConstructionDefect';
  }
}

/**
 * "Template absent" in DS-03 A's sense: null, or nothing but whitespace. A template of spaces would
 * append an empty user turn, which is the same nothing as no template at all.
 *
 * Returns a plain boolean rather than a type predicate: `'  '` is absent and is not `''`, and a
 * predicate saying otherwise would be a lie the compiler then trusts. `renderUtterance` accepts
 * `string | null`, so no caller needs the narrowing.
 */
export const isAbsentTemplate = (template: string | null): boolean =>
  template === null || template.trim() === '';

/**
 * The negation of `isAbsentTemplate`, as a narrowing. This one IS sound: a template that is not
 * absent is a string. Kept private — `renderUtterance` is the only caller that needs it.
 */
const isRenderableTemplate = (template: string | null): template is string =>
  !isAbsentTemplate(template);

/**
 * Render the utterance §3.9 row 9 names.
 *
 * Two parameters, and neither is the submission (9.1a). `selectedLabels` are the server-resolved
 * canonical labels Gate 8 decoded — never raw client bytes, and never a label this function guessed
 * (DS-03 A: no guessed or LLM-reconstructed label).
 *
 * The rules, in order:
 *   - absent or blank template → `template_absent`;
 *   - braces left after the one known slot is removed → `unknown_slot`. The TEMPLATE is scanned,
 *     never the result, so a server-minted label that itself contains `{{` is not mistaken for a
 *     second slot;
 *   - slot present and `selectedLabels.length !== 1` → `slot_cardinality`. A slotted template is
 *     minted only for one closed field of cardinality exactly 1 (MINT-11), and Gate 8 enforces that
 *     cardinality, so any other count means the widget and its template disagree;
 *   - no slot → the template verbatim, whatever the label count;
 *   - slot → the template with the slot replaced by the one label.
 *
 * `split`/`join`, never `String.prototype.replace`: `replace` rewrites `$&`, `$1` and `$$` inside the
 * replacement, so a canonical label containing them would reach the transcript as different bytes
 * than the ones the server resolved.
 */
export const renderUtterance = (
  template: string | null,
  selectedLabels: readonly string[],
): RenderOutcome => {
  if (!isRenderableTemplate(template))
    return { ok: false, rule: 'template_absent' };

  const withoutSlot = template.split(SELECTION_SLOT).join('');
  if (withoutSlot.includes('{{') || withoutSlot.includes('}}'))
    return { ok: false, rule: 'unknown_slot' };

  if (!template.includes(SELECTION_SLOT))
    return { ok: true, utterance: template as LoweredUtterance };

  if (selectedLabels.length !== 1)
    return { ok: false, rule: 'slot_cardinality' };

  return {
    ok: true,
    utterance: template
      .split(SELECTION_SLOT)
      .join(selectedLabels[0]) as LoweredUtterance,
  };
};
