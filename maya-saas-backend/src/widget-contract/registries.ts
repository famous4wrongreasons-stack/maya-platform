// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     registries
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { ActionCapabilityRegistry } from './ambient';
import { CapabilityRef } from './capability-ref';
import { VerificationLevel } from './envelope';

// --- section 0.7 (contract line 438) ---
export interface AeCommitRow {
  ae_key: string; // must resolve in ActionCapabilityRegistry
  confirmation_kind:
    'BOOKING_CONFIRMATION' | 'SETTINGS_DRAFT' | 'PAYMENT_HANDOFF' | 'APPROVAL'; // the four COMMIT-bearing kinds
  family:
    | 'booking'
    | 'marketing_fanout'
    | 'money'
    | 'consent'
    | 'identity'
    | 'tenant_authority'
    | 'settings'
    | 'operational';
  min_verification: VerificationLevel; // ≥ SESSION_VERIFIED for every row
  requires_ae_approval: boolean; // MUST equal registry.approvalRequirement === 'REQUIRED'
  propose: CapabilityRef; // the C9 propose key; never null
}

export declare const AE_WIDGET_COMMIT_ALLOWLIST: Readonly<
  Record<string, AeCommitRow>
>;
export declare const AE_CAPABILITY_GAP_LEDGER: Readonly<
  Record<string, string /* gap key */>
>;
export declare const AE_PROPOSE_PAIRING: readonly {
  propose: CapabilityRef;
  ae: CapabilityRef;
}[];

// --- section 0.7 (contract line 569) ---
export interface MechanismGap {
  gap_key: `MG-${string}`; // one per prerequisite row: MG-P01 … MG-P32
  p_ref: string; // 'P-01' … 'P-32'
  component: string;
  status: '[ABSENT]' | '[EXISTS]' | '[PARTIAL]' | '[UNENFORCEABLE-TODAY]';
  package: string; // the K-package that builds it
  blocking_rules: string[]; // every clause NORMATIVE-PENDING on this row
}
export declare const MECHANISM_GAP_LEDGER: Readonly<
  Record<string, MechanismGap>
>;
