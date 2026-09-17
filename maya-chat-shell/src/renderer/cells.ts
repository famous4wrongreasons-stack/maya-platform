// K5 — the leaves: Cell, Measure, Phrase (and Narrative, a phrase-class leaf). WC §1.2–§1.4.
//
// Every user-visible string a structured widget carries is one of these, minted server-side, so
// drawing one is copying one: Cell.label, Measure.formatted, Phrase.rendered. Nothing here composes
// a word (R-3).
//
// The five Cell branches are explicit and total. A state is data on the leaf, so a non-KNOWN value
// is stated in words — its label — and never in colour alone (A-7). A string that is not one of the
// five states is not guessed at: it makes the envelope unreadable, and the renderer falls back to
// prose rather than drawing a state it cannot name.

import type { Cell, CellState, Measure } from '../contract.ts';
import type { LeafNode } from './nodes.ts';

/** Thrown inside a structured branch; the renderer catches it and draws the prose branch instead. */
export class UnreadableEnvelope extends Error {}

/**
 * The five branches. KNOWN draws the value's formatted form; the four non-KNOWN states draw the
 * label, because for them the label IS the statement («не измерено», «источник не подключён»).
 */
export const stateOf = (state: unknown): CellState => {
  switch (state) {
    case 'KNOWN':
      return 'KNOWN';
    case 'PARTIAL':
      return 'PARTIAL';
    case 'NOT_MEASURED':
      return 'NOT_MEASURED';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'PENDING':
      return 'PENDING';
    default:
      throw new UnreadableEnvelope('a Cell state outside the five');
  }
};

const text = (value: unknown): string => {
  if (typeof value !== 'string') throw new UnreadableEnvelope('a minted string is missing');
  return value;
};

/** A Cell leaf: its label, and its state as data. */
export const cellLeaf = (cell: Cell<unknown>): LeafNode => ({
  t: 'leaf',
  source: 'cell',
  state: stateOf(cell.state),
  text: text(cell.label),
  detail: null,
});

/** A Measure leaf: `formatted` when KNOWN, the label otherwise; `basis` as the detail. */
export const measureLeaf = (measure: Measure): LeafNode => {
  const state = stateOf(measure.state);
  return {
    t: 'leaf',
    source: 'measure',
    state,
    text: state === 'KNOWN' ? text(measure.formatted) : text(measure.label),
    detail: text(measure.basis),
  };
};

/** A Phrase or Narrative leaf: `rendered`, the only user-visible bytes either carries. */
export const phraseLeaf = (phrase: { readonly rendered: string }): LeafNode => ({
  t: 'leaf',
  source: 'phrase',
  state: null,
  text: text(phrase.rendered),
  detail: null,
});

/** A Cell or a Measure (a Measure is a Cell with a `formatted` member). */
export const valueLeaf = (value: Cell<unknown> | Measure): LeafNode =>
  'formatted' in value ? measureLeaf(value) : cellLeaf(value);

/** The leaves of a list of nullable values, nulls skipped. */
export const leaves = <T>(values: readonly (T | null)[], draw: (value: T) => LeafNode): LeafNode[] => {
  const out: LeafNode[] = [];
  for (const v of values) if (v !== null) out.push(draw(v));
  return out;
};

/** True when a Cell<boolean> says the control may be used: KNOWN and true. Anything else explains. */
export const isUsable = (cell: Cell<boolean>): boolean => stateOf(cell.state) === 'KNOWN' && cell.value === true;

const CELL_STATES: ReadonlySet<unknown> = new Set(['KNOWN', 'PARTIAL', 'NOT_MEASURED', 'UNAVAILABLE', 'PENDING']);

/**
 * Every non-KNOWN Cell or Measure anywhere in a value, in document order, as leaves (A-21's "every
 * non-KNOWN Cell is stated with its label"). A Cell is recognised by its own members: a five-state
 * `state`, a string `label` and a `reason_code` member.
 */
export const unknownLeaves = (value: unknown): LeafNode[] => {
  const out: LeafNode[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    if ('state' in v && 'label' in v && 'reason_code' in v && CELL_STATES.has(v.state) && v.state !== 'KNOWN' && typeof v.label === 'string') {
      const basis = 'basis' in v && typeof v.basis === 'string' ? v.basis : null;
      out.push({ t: 'leaf', source: 'formatted' in v ? 'measure' : 'cell', state: stateOf(v.state), text: v.label, detail: 'formatted' in v ? basis : null });
    }
    for (const member of Object.values(v)) walk(member);
  };
  walk(value);
  return out;
};
