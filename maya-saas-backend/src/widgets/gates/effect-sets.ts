// Effect-class sets that more than one gate reads.
//
// A set two gates read belongs to neither gate. Gates 7 and 8-R are separate units that change
// their own files independently, so the set they share is stated here, in a shared gate file,
// rather than exported from one gate and imported by the other. A gate that stops reading it
// removes its import; it does not delete the other gate's input.

import type { EffectClass } from '../../widget-contract/intent';

/**
 * The effects Gate 7 examines and Gate 8-R's spoken-carrier check applies to. Moved unchanged from
 * the former `gate-logic.ts`; frozen because it is now shared. It is the legacy set, `REFINE`
 * included. Which set each gate should read is for those gates' specs to settle; a change to the
 * set itself is made in this file.
 */
export const ACTUATING: readonly string[] = Object.freeze([
  'COMMIT',
  'DRAFT',
  'REQUEST_APPROVAL',
  'REFINE',
  'CONTROL',
] satisfies EffectClass[]);
