// U10a — `routeUtterance`, THE deterministic router (C11:4805-4810, R3.12.4, §4.7 V1 and V9).
//
// "THE deterministic router of Step 0, R3.12.4 and §4.7 V1: one pure, pre-LLM function shared by
// Gate 10, typed sentences, slash commands and spoken utterances. Escape aliases are matched before
// any other candidate (§4.7 V9). It returns the matched candidate, whose intent_token_hash is «the
// same token», or null." (C11:4807-4810)
//
// WHAT CHANGED, AND WHY THE V1 ROUTER IS GONE.
// This file used to hold the V1 corpus design: a nine-row `SPEECH_ALIASES` table mapping a phrase to
// a capability KEY, plus `resolveCapability` and `assertAliasesResolve`. V1.1 replaced it outright.
// The router no longer answers "which capability did they mean" — it answers "which LIVE INTENT
// RECORD of this principal says exactly this". The difference is the whole of Gate 10: a router that
// returns a capability can only be compared to the record by name, while a router that returns a
// record carries «the same token» (C11:4809), which is what R3.12.4's "three front doors, one
// function" actually promises. The V1 table also mapped `cancel → c9.no_action`, which V1.1 forbids
// twice over: the escape verb "appears in no routing map that reaches a canonical owner" (F60,
// C11:1242), and its effect is `NONE` or `control.widget.dismiss`, never a C9 capability.
//
// D-18 (add-only): `SPEECH_ALIASES`, `resolveCapability` and `normalise` were deleted by the unit,
// because nothing imported them. `assertAliasesResolve` WAS imported — by
// `gates/gate-fixtures.spec-helper.spec.ts` — so it stood as a one-line delegate to the new load
// assertion until IR-U10A-2 removed both in U10a's merge commit. An implementer never
// breaks another file's import.
//
// WHAT THE ROUTER IS NOT.
//   - not fuzzy: exact equality after normalisation, never a substring, never a prefix, never a score.
//     A guessing router would manufacture divergences that are the router's fault, and Gate 10 would
//     then refuse a person's legitimate tap on the router's behalf;
//   - not a model: no network, no LLM, no `MayaBrainRouterService` (which returns a persona, not a
//     candidate). "pre-LLM" is a property of this function, held by B10-2 and B10-3;
//   - not an owner of state: it reads its candidates from its argument and nothing else.
//     `liveCandidates` (U10b) decides WHICH records are candidates and in what order; this function
//     decides which of them the words match, in the order it is given, and never re-orders or
//     privileges one — the tapped record included.
//
// F15 (C11:225-233): the lowered utterance and the candidates' `utterance_template` /
// `selection_domain_labels` are CONVERSATION_CONTENT (class C). Gate 10 is their only reader after
// Gate 9, and this module is where Gate 10 reads them. Nothing here logs, returns or copies a
// template or a label: the function answers with a candidate, and its caller reads only class-A
// members of it.
//
// Class BUILD/U: the router's own matrix is a unit spec and is never live proof (§0.5).

import type { IntentRecordRow } from '../gate.types';
import {
  SELECTION_SLOT,
  isAbsentTemplate,
  isRenderImpossibility,
  renderUtterance,
} from '../lowering/lowering';
import { assertOwnerSetResolves } from './owner-set';

/**
 * §4.7 V9 (C11:6124): "«отмена» / «стоп» / «хватит» are in `speech_aliases` of every `priority: 0`
 * escape intent and are matched before any other candidate." `cancel` is the same door in the other
 * language: F60 (C11:1232) makes the escape "additionally reachable as `/cancel`", and normalisation
 * drops the leading slash, so `/cancel` and `cancel` arrive here as one word.
 *
 * Exported because the shell's `/ai/chat` escape match (SH-19) and K14 must IMPORT this list rather
 * than copy it. A second copy of the escape vocabulary is a door that closes in one channel and not
 * in another, and V9 says the escape is always live.
 */
export const ESCAPE_VERBS: readonly string[] = Object.freeze([
  'отмена',
  'стоп',
  'хватит',
  'cancel',
]);

const ESCAPE_VERB_SET: ReadonlySet<string> = new Set(ESCAPE_VERBS);

/**
 * The one normalisation, shared by every front door (R3.12.4). Trim, lowercase, drop ONE leading
 * slash (a slash command is the same sentence), collapse internal whitespace.
 *
 * Deliberately no more than that: no transliteration, no stemming, no punctuation stripping, no
 * Unicode folding. Every one of those would make two different sentences equal, and "equal" here
 * decides whether a tap is routed to a different live intent of the same principal.
 */
export const normaliseUtterance = (utterance: string): string =>
  utterance.trim().toLowerCase().replace(/^\//, '').trim().replace(/\s+/g, ' ');

/**
 * What the router reads off a candidate record.
 *
 * The class-A members are `IntentRecordRow`'s own, by `Pick`, so U10b's `liveCandidates` rows satisfy
 * this type without a second declaration of the same columns. The three members below are what
 * `IntentRecordRow` deliberately does NOT carry (S-ROW): `erasedAt` and the two class-C columns, read
 * here and nowhere else in the pipeline (F15).
 */
export type RoutingCandidate = Pick<
  IntentRecordRow,
  | 'intentTokenHash'
  | 'effect'
  | 'priority'
  | 'capabilitySpace'
  | 'capabilityKey'
  | 'issuedAt'
> & {
  /** RT6's erasure stamp. Non-null means the conversation content of this record is gone. */
  readonly erasedAt: Date | null;
  /** §3.7 `utterance_template`; `'{{selection}}'` is its only slot (C11:4543). */
  readonly utteranceTemplate: string | null;
  /** §3.7 `selection_domain_labels`: `Record<field, Record<optionId, label>>` (AMB-17, B-09). */
  readonly selectionDomainLabelsJson: unknown;
};

/**
 * The escape candidate (F60, C11:1228-1240): `priority: 0`, effect `CONTROL`, capability
 * `control.widget.dismiss`. The `RICH_INTERACTIVE` form of the escape has effect `NONE` and a null
 * token, so it is no candidate at all — it never became a record (INV-21).
 *
 * It reads the CAPABILITY column only, never `handoff*` (AMB-09, B10-10): an escape carries no
 * handoff and no target, and on a `CONTROL` effect §3.1 makes `capability` non-null, so the subject
 * of an escape IS its capability. `erasedAt` is not consulted, because this branch reads no content:
 * V9's "the escape verb is always live" would otherwise stop being true the moment RT6 erased the
 * conversation it belongs to.
 */
const isEscapeCandidate = (c: RoutingCandidate): boolean =>
  c.priority === 0 &&
  c.effect === 'CONTROL' &&
  c.capabilitySpace === 'CONTROL' &&
  c.capabilityKey === 'control.widget.dismiss';

/**
 * The labels of `selection_domain_labels`, in stored order, de-duplicated.
 *
 * Shape-tolerant on purpose: this column is class C, RT6 can erase it to SQL null between the mint
 * and the tap, and a row whose JSON is not the declared object shape must make the candidate
 * unroutable rather than make the router throw. A throw here would become a 500 on a submission whose
 * own record is fine (R3.9.3: only a genuine transport fault may look like a fault).
 */
const labelsOf = (json: unknown): readonly string[] => {
  if (json === null || typeof json !== 'object' || Array.isArray(json))
    return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const field of Object.values(json as Record<string, unknown>)) {
    if (field === null || typeof field !== 'object' || Array.isArray(field))
      continue;
    for (const label of Object.values(field as Record<string, unknown>))
      if (typeof label === 'string' && !seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
  }
  return labels;
};

/**
 * Every sentence this candidate could have been rendered as: the template verbatim when it has no
 * slot, or the template once per label of its selection domain when it has one.
 *
 * It renders through Gate 9's OWN `renderUtterance` (U9a), never a second renderer. R3.12.4's duty —
 * "a tap's own lowered utterance must route to its own record" — is only true if the router and Gate 9
 * produce the same bytes from the same template, and two renderers are two chances to disagree.
 *
 * A candidate that cannot render contributes nothing and is skipped: an erased record, an absent or
 * blank template, a template with braces the renderer cannot resolve, and a slotted template whose
 * label count is not one all answer with a render impossibility rather than an exception (U9a, D-11).
 */
const renderingsOf = (c: RoutingCandidate): readonly string[] => {
  if (c.erasedAt !== null) return [];
  const template = c.utteranceTemplate;
  if (template === null || isAbsentTemplate(template)) return [];
  const labelSets: readonly (readonly string[])[] = template.includes(
    SELECTION_SLOT,
  )
    ? labelsOf(c.selectionDomainLabelsJson).map((label) => [label])
    : [[]];
  const rendered: string[] = [];
  for (const labels of labelSets) {
    const outcome = renderUtterance(template, labels);
    if (!isRenderImpossibility(outcome)) rendered.push(outcome.utterance);
  }
  return rendered;
};

/** Whether this candidate's own words, normalised, are exactly the words that were said. */
const saysExactly = (c: RoutingCandidate, normalised: string): boolean =>
  renderingsOf(c).some(
    (rendering) => normaliseUtterance(rendering) === normalised,
  );

/**
 * `routeUtterance(utterance, candidates)` — C11:4805-4810.
 *
 * 1. Normalise. An utterance that normalises to nothing matches nothing: null.
 * 2. If the words are an escape verb, answer the first escape candidate, when the candidates hold one
 *    (§4.7 V9: "matched before any other candidate"). If they hold none, fall through — the escape
 *    vocabulary does not swallow a sentence some live intent genuinely renders as.
 * 3. Otherwise answer the first candidate, IN THE ORDER GIVEN, whose own rendering equals the words.
 *    Order is `liveCandidates`' business (U10b: `issuedAt DESC, intentTokenHash ASC`, the tapped
 *    record not privileged); this function neither sorts nor prefers.
 * 4. Otherwise null. Null is "nothing was said that matches", which Gate 10 reads as no comparison —
 *    rows 2 and 3 decide what that means, not this function.
 *
 * Generic in the candidate type so a caller gets ITS row back, with the class-A members Gate 10 needs
 * (`intent_token_hash`, `effect`), and never a copy this module built.
 */
export const routeUtterance = <C extends RoutingCandidate>(
  utterance: string,
  candidates: readonly C[],
): C | null => {
  const said = normaliseUtterance(utterance);
  if (said === '') return null;
  if (ESCAPE_VERB_SET.has(said)) {
    const escape = candidates.find(isEscapeCandidate);
    if (escape !== undefined) return escape;
  }
  return candidates.find((c) => saysExactly(c, said)) ?? null;
};

/**
 * The routing layer's `EP-REGISTRY-LOAD` assertion (U10a). Throws unless:
 *   - every escape verb is a non-empty word that survives its own normalisation (a verb that
 *     normalised to something else could never match, and V9's door would be shut in silence);
 *   - the escape vocabulary holds no duplicate;
 *   - every owner-class key resolves in its own space (`assertOwnerSetResolves`, C11:4833-4844).
 *
 * `widgets.module.ts` calls it from `onModuleInit` (IR-U10A-1), so a registry that cannot answer
 * Gate 10 stops the process at boot rather than at a person's tap.
 */
export const assertRoutingResolves = (): void => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const verb of ESCAPE_VERBS) {
    if (verb.trim() === '') problems.push('an escape verb is blank');
    else if (normaliseUtterance(verb) !== verb)
      problems.push(
        `escape verb "${verb}" is not in normalised form, so no utterance can equal it`,
      );
    if (seen.has(verb)) problems.push(`escape verb "${verb}" is listed twice`);
    seen.add(verb);
  }
  if (problems.length)
    throw new Error(
      `Gate 10's escape vocabulary does not resolve (§4.7 V9):\n  ${problems.join('\n  ')}`,
    );
  assertOwnerSetResolves();
};
