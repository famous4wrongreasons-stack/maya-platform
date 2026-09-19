// P-23 — F31 at EP-REGISTRY-LOAD.

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { canonicalProductionPolicyDefinitions } from '../../action-engine/action-engine.policy-registry';
import { CAPABILITY_GAP_LEDGER_RUNTIME } from '../../widget-contract/capability-gap-ledger.runtime';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import { VERIFICATION_RANK } from './ladder';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  BOOKING,
  CONSENT,
  deriveAeFamily,
  IDENTITY,
  MARKETING_FANOUT,
  MONEY,
  TENANT_AUTHORITY,
  type AeCommitRuntimeRow,
} from './ae-commit-allowlist.runtime';
import { AE_CAPABILITY_GAP_LEDGER } from './ae-capability-gap-ledger.runtime';
import {
  AE_PROPOSE_PAIRING,
  checkProposePairing,
  type ProposePairingRow,
} from './propose-pairing';

export interface AllowlistAssertionInput {
  readonly capabilities: readonly RegisteredActionCapabilityV1[];
  readonly productionPolicyKeys: ReadonlySet<string>;
  readonly allowlist: Readonly<Record<string, AeCommitRuntimeRow>>;
  readonly gaps: Readonly<Record<string, string>>;
  readonly pairings: readonly ProposePairingRow[];
}

const shipped = (): AllowlistAssertionInput => {
  const capabilities = new ActionCapabilityRegistry().list();
  return {
    capabilities,
    productionPolicyKeys: new Set(
      canonicalProductionPolicyDefinitions().map((row) => row.capability),
    ),
    allowlist: AE_WIDGET_COMMIT_ALLOWLIST,
    gaps: AE_CAPABILITY_GAP_LEDGER,
    pairings: AE_PROPOSE_PAIRING,
  };
};

const refEquals = (left: CapabilityRef, right: CapabilityRef): boolean =>
  left.space === right.space && left.key === right.key;

export const allowlistStartupProblems = (
  input: AllowlistAssertionInput = shipped(),
): readonly string[] => {
  const problems: string[] = [];
  const byKey = new Map(input.capabilities.map((cap) => [cap.capability, cap]));

  for (const cap of input.capabilities) {
    const row = input.allowlist[cap.capability];
    const gap = input.gaps[cap.capability];
    if ((row === undefined) === (gap === undefined))
      problems.push(
        `AL-1 ${cap.capability}: expected row XOR gap, got row=${String(row !== undefined)} gap=${String(gap !== undefined)}`,
      );
    if (row === undefined) continue;

    if (cap.policyDecision !== 'ALLOW')
      problems.push(`AL-2 ${cap.capability}: policyDecision is not ALLOW`);
    if (!cap.allowedSourceTypes.includes('authenticated_request'))
      problems.push(`AL-2 ${cap.capability}: authenticated_request is absent`);
    if (row.requires_ae_approval !== (cap.approvalRequirement === 'REQUIRED'))
      problems.push(`AL-2 ${cap.capability}: approval requirement diverges`);
    if (!input.productionPolicyKeys.has(cap.capability))
      problems.push(`AL-2 ${cap.capability}: canonical policy is absent`);
    if (
      VERIFICATION_RANK[row.min_verification] <
      VERIFICATION_RANK.SESSION_VERIFIED
    )
      problems.push(`AL-2 ${cap.capability}: floor is below SESSION_VERIFIED`);

    const pairs = input.pairings.filter(
      (pair) => pair.ae.key === cap.capability,
    );
    if (pairs.length !== 1)
      problems.push(
        `AL-3 ${cap.capability}: expected exactly one pairing, got ${pairs.length}`,
      );
    else if (!refEquals(row.propose, pairs[0].propose))
      problems.push(
        `AL-3 ${cap.capability}: row propose does not equal traced pairing`,
      );

    if (MONEY(cap)) problems.push(`AL-2 ${cap.capability}: MONEY veto`);
    if (BOOKING(cap) && row.confirmation_kind !== 'BOOKING_CONFIRMATION')
      problems.push(`AL-2 ${cap.capability}: BOOKING kind veto`);
    if (MARKETING_FANOUT(cap) && row.family !== 'marketing_fanout')
      problems.push(`AL-2 ${cap.capability}: marketing family veto`);
    if (CONSENT(cap) || IDENTITY(cap))
      problems.push(`AL-2 ${cap.capability}: CONSENT/IDENTITY veto`);
    if (TENANT_AUTHORITY(cap))
      problems.push(`AL-2 ${cap.capability}: TENANT_AUTHORITY veto`);
    if (row.family !== deriveAeFamily(cap))
      problems.push(`AL-4 ${cap.capability}: family is not derived`);
  }

  for (const key of Object.keys(input.allowlist))
    if (!byKey.has(key))
      problems.push(`AL-1 ${key}: allowlist row is not registered`);
  for (const key of Object.keys(input.gaps))
    if (!byKey.has(key))
      problems.push(`AL-1 ${key}: gap row is not registered`);
    else if (CAPABILITY_GAP_LEDGER_RUNTIME[input.gaps[key]] === undefined)
      problems.push(
        `AL-1 ${key}: gap ${input.gaps[key]} is not a registered capability gap`,
      );

  const marketingRows = input.capabilities.filter(
    (cap) =>
      MARKETING_FANOUT(cap) && input.allowlist[cap.capability] !== undefined,
  );
  if (marketingRows.length !== 1)
    problems.push(
      `AL-2 MARKETING_FANOUT: expected one row, got ${marketingRows.length}`,
    );

  problems.push(...checkProposePairing(input.pairings).map((p) => `AL-3 ${p}`));
  return problems;
};

export class AllowlistStartupAssertionError extends Error {}

export const assertAllowlistAtRegistryLoad = (): void => {
  const problems = allowlistStartupProblems();
  if (problems.length)
    throw new AllowlistStartupAssertionError(
      `AE commit classification is not whole: ${problems.join('; ')}`,
    );
};
