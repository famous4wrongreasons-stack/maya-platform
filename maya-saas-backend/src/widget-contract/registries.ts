// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     registries
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { ActionCapabilityRegistry, C9Domain, C9_CAPABILITIES } from './ambient';
import type { C9Capability } from '../orchestration/c9.registry';
import { CapabilityRef } from './capability-ref';
import { VerificationLevel } from './envelope';

// --- section 0.7 (contract line 459) ---
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

// --- section 0.7 (contract line 590) ---
export interface MechanismGap {
  gap_key: `MG-${string}`; // one per prerequisite row: MG-P01 … MG-P34
  p_ref: string; // 'P-01' … 'P-34'
  component: string;
  status: '[ABSENT]' | '[EXISTS]' | '[PARTIAL]' | '[UNENFORCEABLE-TODAY]';
  package: string; // the K-package that builds it
  blocking_rules: string[]; // every clause NORMATIVE-PENDING on this row
}
export declare const MECHANISM_GAP_LEDGER: Readonly<
  Record<string, MechanismGap>
>;

// --- section 0.7 (contract line 635) ---
// The R-01 read set. Every row is a C9Capability whose members are the READ defaults of
// c9.registry.ts's entry() except those named in the row.
export type R01ReadRow = {
  domains: readonly C9Domain[];
  ownerKey: string; // an existing canonical owner
  ownerReads: readonly string[]; // existing owner methods; the only calls its projector makes
  principalKinds: readonly ('USER' | 'CLIENT_CHANNEL')[];
  featureRefs: readonly string[];
};
export declare const R01_READ_SET: Readonly<Record<string, R01ReadRow>>; // exactly the fifteen rows below
export declare const C9_REGISTRY_HASH_R01: string;
// the digest of the C9_CAPABILITIES array with R01_READ_SET registered, recorded as a
// literal by the registry pin test in the commit that registers the set
