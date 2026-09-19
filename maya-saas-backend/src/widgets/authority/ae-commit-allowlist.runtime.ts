// P-23 — the one executable AE commit allowlist and its family derivation.
//
// No row is inferred from a capability name. The positive set starts with P-25's traced
// AE_PROPOSE_PAIRING rows and keeps only rows which survive every F31 veto. That is the polarity
// rule of Contract V1.1: predicates may remove a traced row; they may never create one.

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { MONEY_FACETS, MONEY_TARGET_KINDS } from '../../widget-contract/tables';
import type { VerificationLevel } from '../../widget-contract/envelope';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { AeCommitRow } from '../../widget-contract/registries';
import {
  isConsentCapability,
  isIdentityCapability,
} from '../consent/data-subject-acts';
import { AE_PROPOSE_PAIRING } from './propose-pairing';

export type AeCommitFamily = AeCommitRow['family'];

export interface AeCommitRuntimeRow {
  readonly confirmation_kind: AeCommitRow['confirmation_kind'];
  readonly family: AeCommitFamily;
  readonly min_verification: VerificationLevel;
  readonly requires_ae_approval: boolean;
  readonly propose: CapabilityRef;
}

export const BOOKING = (cap: RegisteredActionCapabilityV1): boolean =>
  cap.targetKind === 'appointment';

export const CONSENT = isConsentCapability;
export const IDENTITY = isIdentityCapability;

const MARKETING_ACTION_CLASSES = new Set([
  'deliver_bulk_campaign',
  'send_bulk_campaign',
]);
const MARKETING_TARGET_KINDS = new Set([
  'marketing_campaign',
  'marketing_client_recipient',
  'audience',
]);

export const MARKETING_FANOUT = (cap: RegisteredActionCapabilityV1): boolean =>
  MARKETING_ACTION_CLASSES.has(cap.actionClass) ||
  MARKETING_TARGET_KINDS.has(cap.targetKind);

const TENANT_TARGET_KINDS = new Set([
  'tenant',
  'tenant_user',
  'internal_provider_user',
  'staff_access',
  'branch',
  'tenant_branding',
]);

export const TENANT_AUTHORITY = (cap: RegisteredActionCapabilityV1): boolean =>
  TENANT_TARGET_KINDS.has(cap.targetKind) ||
  cap.riskFacets.includes('tenant_wide');

const MONEY_FACET_SET = new Set<string>(MONEY_FACETS as readonly string[]);
const MONEY_TARGET_SET = new Set<string>(
  MONEY_TARGET_KINDS as readonly string[],
);

export const MONEY = (cap: RegisteredActionCapabilityV1): boolean =>
  cap.riskFacets.some((facet) => MONEY_FACET_SET.has(facet)) ||
  MONEY_TARGET_SET.has(cap.targetKind);

/**
 * F31's family column is derived from the live capability, never copied from a second table.
 * The last two branches are the only non-vetoed families in P-25 beyond booking and marketing.
 */
export const deriveAeFamily = (
  cap: RegisteredActionCapabilityV1,
): AeCommitFamily => {
  if (BOOKING(cap)) return 'booking';
  if (MARKETING_FANOUT(cap)) return 'marketing_fanout';
  if (MONEY(cap)) return 'money';
  if (CONSENT(cap)) return 'consent';
  if (IDENTITY(cap)) return 'identity';
  if (TENANT_AUTHORITY(cap)) return 'tenant_authority';
  if (cap.targetKind === 'operational_work_item') return 'operational';
  return 'settings';
};

export const confirmationKindFor = (
  family: AeCommitFamily,
): AeCommitRow['confirmation_kind'] => {
  if (family === 'booking') return 'BOOKING_CONFIRMATION';
  if (family === 'marketing_fanout') return 'APPROVAL';
  if (family === 'money') return 'PAYMENT_HANDOFF';
  return 'SETTINGS_DRAFT';
};

const registry = new ActionCapabilityRegistry();
const capByKey = new Map(registry.list().map((cap) => [cap.capability, cap]));

const admittedPairingRows = AE_PROPOSE_PAIRING.flatMap((pair) => {
  const cap = capByKey.get(pair.ae.key);
  if (cap === undefined) return [];
  const family = deriveAeFamily(cap);

  // These are vetoes, never positive selectors.
  if (
    cap.policyDecision !== 'ALLOW' ||
    !cap.allowedSourceTypes.includes('authenticated_request') ||
    MONEY(cap) ||
    CONSENT(cap) ||
    IDENTITY(cap) ||
    TENANT_AUTHORITY(cap)
  )
    return [];

  return [
    [
      cap.capability,
      Object.freeze({
        confirmation_kind: confirmationKindFor(family),
        family,
        min_verification: 'SESSION_VERIFIED' as const,
        requires_ae_approval: cap.approvalRequirement === 'REQUIRED',
        propose: Object.freeze({ ...pair.propose }),
      }),
    ] as const,
  ];
});

export const AE_WIDGET_COMMIT_ALLOWLIST: Readonly<
  Record<string, AeCommitRuntimeRow>
> = Object.freeze(Object.fromEntries(admittedPairingRows));
