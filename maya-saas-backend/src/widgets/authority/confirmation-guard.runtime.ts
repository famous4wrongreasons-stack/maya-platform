// GENERATED from src/widget-contract/confirmation-guard.ts — do not hand-edit.
// Regenerate: node scripts/widget-contract/emit-confirmation-guard.mjs
//
// §0.13 F72, byte for byte, with its imports rewired to runtime bindings. The lookup is not restated
// here; it is the same text. `--check` fails if the two diverge, so a change to the certified guard
// cannot reach Gate 7 without coming through the generator.
//
// The one behavioural consequence worth naming: `refuseMint` throws `MintRefusal`. At `EP-MINT` that
// aborts a mint; at `EP-INGRESS` Gate 7 catches it and turns it into a closed-vocabulary refusal.
// `wrong_space` and `capability_not_allowlisted` are mint codes and are never ingress codes.
//
// No blanket `eslint-disable`, unlike the floor copy: this body is three statements and lints clean,
// and a directive that suppresses nothing is a warning on every run of `npm run lint`.
import { refuseMint, AE_WIDGET_COMMIT_ALLOWLIST } from './contract-bindings';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { WidgetKind } from '../../widget-contract/kinds';

// --- section 0.13 (contract line 1393) ---
export function requiredConfirmationKind(ref: CapabilityRef): WidgetKind {
  if (ref.space !== 'AE') refuseMint('wrong_space'); // FAIL CLOSED — F21
  const row = AE_WIDGET_COMMIT_ALLOWLIST[ref.key];
  if (row === undefined) refuseMint('capability_not_allowlisted'); // FAIL CLOSED
  return row.confirmation_kind;
}
