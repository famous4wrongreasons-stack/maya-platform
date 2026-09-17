// J-1 — the one admission interface between gates.
//
// A gate that passes may hand later gates a FACT (`AdmissionFacts`). It does not write the context:
// its `pass` verdict carries the fact, and the runner builds a new context through `mergeFacts`. That
// keeps `GateContext` immutable, and it makes two properties checkable instead of hoped for:
//   - write-once: a fact set by one slot cannot be replaced by a later one;
//   - producer-checked: each fact has exactly one slot that may produce it. A lowering produced
//     anywhere but Gate 9 is not a lowering, and it throws here rather than being believed.
// A throw is a server fault: no verdict is returned and nothing is written.
//
// Readers are declared beside producers. They cannot be checked at run time, because a read is not
// an event; `facts.architecture.spec.ts` (T-ARCH-FACTS) holds them at the source.

import type { AdmissionFacts } from '../gate.types';

export type FactName = keyof AdmissionFacts;

export interface FactSlots {
  /**
   * The one slot (§3.9 `n`) whose `pass` may carry this fact. `null`: no slot produces it yet, and
   * `mergeFacts` refuses it from every slot.
   */
  readonly producer: string | null;
  /** The slots whose code may read this fact. */
  readonly readers: readonly string[];
}

const slots = (producer: string | null, readers: string[]): FactSlots =>
  Object.freeze({ producer, readers: Object.freeze(readers) });

/** The integration plan's §2.2 table. Every member of `AdmissionFacts` has exactly one row. */
export const FACT_SLOTS: { readonly [K in FactName]: FactSlots } =
  Object.freeze({
    // The principal slot is P-PRINCIPAL's to fix (Gate 3, or a principal-resolving slot of its own
    // spec). Until then no slot may produce the principal, and none does.
    authority: slots(null, ['6', '11', '12', '13']),
    validatedInputs: slots('8', ['12', '13']),
    selectedLabels: slots('8', ['9']),
    loweringSource: slots('8', ['9']),
    lowering: slots('9', ['10']),
    loweredTurn: slots('9', ['13']),
    resolvedNouns: slots('11', ['12', '13']),
  });

const isFactName = (k: string): k is FactName =>
  Object.prototype.hasOwnProperty.call(FACT_SLOTS, k);

/** The context's facts before any slot has run. */
export const NO_FACTS: Readonly<Partial<AdmissionFacts>> = Object.freeze({});

/**
 * Merge the facts one slot's `pass` carried into a new, frozen set. Throws — never merges partially —
 * on a name `AdmissionFacts` does not declare, a fact the slot does not produce, a fact already set,
 * or an `undefined` value (a fact is produced with a value; `null` is one).
 */
export const mergeFacts = (
  current: Readonly<Partial<AdmissionFacts>>,
  incoming: Readonly<Partial<AdmissionFacts>>,
  slot: string,
): Readonly<Partial<AdmissionFacts>> => {
  for (const key of Reflect.ownKeys(incoming)) {
    if (typeof key !== 'string' || !isFactName(key))
      throw new Error(
        `J-1: slot ${slot} produced ${String(key)}, which is not an admission fact`,
      );
    const { producer } = FACT_SLOTS[key];
    if (producer !== slot)
      throw new Error(
        `J-1: slot ${slot} produced ${key}, whose producer is ${producer === null ? 'not yet fixed' : `slot ${producer}`}`,
      );
    if (Object.prototype.hasOwnProperty.call(current, key))
      throw new Error(`J-1: ${key} is already set; a fact is written once`);
    if (incoming[key] === undefined)
      throw new Error(`J-1: slot ${slot} produced ${key} without a value`);
  }
  return Object.freeze({ ...current, ...incoming });
};
