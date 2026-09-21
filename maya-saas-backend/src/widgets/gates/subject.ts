// The record's subject capability — the one binding every gate reads it through.

import type { IntentRecordRow } from '../gate.types';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { IntentTarget } from '../../widget-contract/intent';
import { subjectCapability } from '../authority/contract-bindings';

/** The five stored members §3.5's one body needs. */
export type SubjectRecord = Pick<
  IntentRecordRow,
  | 'capabilitySpace'
  | 'capabilityKey'
  | 'handoffSpace'
  | 'handoffKey'
  | 'targetJson'
>;

/** The record's subject, in the shape §3.5's one body reads. */
export const subjectOf = (r: SubjectRecord): CapabilityRef | null =>
  subjectCapability({
    capability:
      r.capabilitySpace && r.capabilityKey
        ? ({ space: r.capabilitySpace, key: r.capabilityKey } as CapabilityRef)
        : null,
    handoff_capability_ref:
      r.handoffSpace && r.handoffKey
        ? ({ space: r.handoffSpace, key: r.handoffKey } as CapabilityRef)
        : null,
    target: (r.targetJson ?? null) as IntentTarget | null,
  });
