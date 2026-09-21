// Gate 8's canonical labels. The function receives only validated option ids and the server-held
// field-keyed label projection; it has no access to the submitted bytes.

import type { AdmissionFacts } from '../gate.types';
import {
  decodeSelectionDomainLabels,
  type SelectionDomainLabels,
} from '../input-schema/codec';

export type ValidatedInputs = NonNullable<AdmissionFacts['validatedInputs']>;
export const NO_SELECTION: readonly string[] = Object.freeze([]);

/** A missing/invalid label map is a render impossibility, represented by null for Gate 9. */
export const selectedLabelsFor = (
  validatedInputs: ValidatedInputs | null,
  labelsJson?: unknown,
): readonly string[] | null => {
  if (validatedInputs === null) return NO_SELECTION;
  const decoded = decodeSelectionDomainLabels(labelsJson);
  if (!decoded.ok) return null;
  return labelsFor(decoded.value, validatedInputs);
};

const labelsFor = (
  labels: SelectionDomainLabels,
  validatedInputs: ValidatedInputs,
): readonly string[] | null => {
  const out: string[] = [];
  for (const [field, selected] of validatedInputs.closed) {
    const fieldLabels = labels.get(field);
    if (!fieldLabels) return null;
    for (const id of selected) {
      const label = fieldLabels.get(id);
      if (!label) return null;
      out.push(label);
    }
  }
  return Object.freeze(out);
};
