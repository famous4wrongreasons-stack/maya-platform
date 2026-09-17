// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     confirmation-guard
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { refuseMint } from './ambient';
import { CapabilityRef } from './capability-ref';
import { WidgetKind } from './kinds';
import { AE_WIDGET_COMMIT_ALLOWLIST } from './registries';

// --- section 0.13 (contract line 1393) ---
export function requiredConfirmationKind(ref: CapabilityRef): WidgetKind {
  if (ref.space !== 'AE') refuseMint('wrong_space'); // FAIL CLOSED — F21
  const row = AE_WIDGET_COMMIT_ALLOWLIST[ref.key];
  if (row === undefined) refuseMint('capability_not_allowlisted'); // FAIL CLOSED
  return row.confirmation_kind;
}

// --- section 0.13 (contract line 1417) ---
// [MEMBER FRAGMENT] confirmation_of_ref: { kind: 'draft' | 'record' | 'approval'; ref: string };  // NON-NULL iff effect === 'COMMIT'
// [MEMBER FRAGMENT] produced_by_intent_token_hash: string | null;   // AUDIT_RETAINED

// --- section 0.14 (contract line 1516) ---
export type DraftClass =
  'settings' | 'notification_pref' | 'task' | 'schedule_rule' | 'audience';
