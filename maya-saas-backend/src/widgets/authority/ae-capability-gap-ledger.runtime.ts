// P-23 — the negative half of F31's total classification.
//
// The ledger is generated from the live AE registry after the positive allowlist is closed. Named
// Contract V1.1 classes keep their exact declared gap. Everything else is held under the contract's
// conservative separation-of-duties gap: it has no traced widget approval/owner lane and therefore
// cannot acquire a button merely because a new Action Engine capability was registered.

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { CAPABILITY_GAP_LEDGER_RUNTIME } from '../../widget-contract/capability-gap-ledger.runtime';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  BOOKING,
  CONSENT,
  IDENTITY,
  MARKETING_FANOUT,
  MONEY,
  TENANT_AUTHORITY,
} from './ae-commit-allowlist.runtime';

export type AeCapabilityGapKey = keyof typeof CAPABILITY_GAP_LEDGER_RUNTIME;

const known = (key: string): AeCapabilityGapKey => {
  if (CAPABILITY_GAP_LEDGER_RUNTIME[key] === undefined)
    throw new Error(`P-23 refers to an unregistered capability gap ${key}`);
  return key;
};

export const gapForAeCapability = (
  cap: RegisteredActionCapabilityV1,
): AeCapabilityGapKey => {
  const key = cap.capability;

  if (MARKETING_FANOUT(cap)) return known('GAP-BULK-SEND-DIRECT');
  if (BOOKING(cap)) return known('GAP-APPOINTMENT-DETAIL-COMMIT');
  if (CONSENT(cap)) return known('GAP-CONSENT-PD-GRANT');
  if (IDENTITY(cap)) return known('GAP-IDENTITY-SESSION');

  if (MONEY(cap)) {
    if (key.startsWith('tenant-billing.')) return known('GAP-TENANT-BILLING');
    if (key.startsWith('commerce-credentials.'))
      return known('GAP-COMMERCE-CREDENTIALS');
    if (key.startsWith('value-configuration.'))
      return known('GAP-VALUE-CONFIG');
    if (key.startsWith('customer-subscriptions.'))
      return known('GAP-SUBSCRIPTION');
    if (key.startsWith('referrals.')) return known('GAP-REFERRAL-REWARD');
    if (key.startsWith('cash-declaration.'))
      return known('GAP-CASH-DECLARATION');
    if (key.startsWith('expenses.delete.')) return known('GAP-EXPENSE-DELETE');
    if (key.startsWith('expenses.')) return known('GAP-EXPENSE-COMMIT');
    if (key.startsWith('gift-certificates.')) return known('GAP-COMMERCE-GIFT');
    if (key.startsWith('loyalty.')) return known('GAP-LOYALTY-REDEEM');
    if (key.includes('tip')) return known('GAP-TIPS');
  }

  if (TENANT_AUTHORITY(cap)) return known('GAP-TENANT-ADMIN');

  if (key.startsWith('package5.settings.'))
    return known('GAP-TENANT-CONFIG-COMMIT');

  return known('GAP-SEPARATION-OF-DUTIES');
};

export const AE_CAPABILITY_GAP_LEDGER: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(
      new ActionCapabilityRegistry()
        .list()
        .filter(
          (cap) => AE_WIDGET_COMMIT_ALLOWLIST[cap.capability] === undefined,
        )
        .map((cap) => [cap.capability, gapForAeCapability(cap)]),
    ),
  );
