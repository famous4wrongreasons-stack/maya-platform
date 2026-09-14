import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_03_BULK_ENVELOPE_CAPABILITIES,
  P4_03_BULK_POLICY_PROFILES,
  P4_03_EXECUTABLE_CAPABILITIES,
  p403GrantConsumeExecutableNormalizer,
} from './p4-03-legacy-loyalty-executable.contract';

const ROOT = join(__dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const revocationMigration = readFileSync(
  join(
    ROOT,
    'prisma',
    'migrations',
    '20260830100000_loyalty_redemption_grant_revocation',
    'migration.sql',
  ),
  'utf8',
);

function validConsumeExecutableInput(): Record<string, unknown> {
  return {
    provider: 'yclients',
    canonicalGrantId: 'grant-8',
    grantIdentityHash: 'a'.repeat(64),
    issueExecutionIdentityHash: 'b'.repeat(64),
    canonicalClientId: 'client-8',
    requesterIdentityHash: 'c'.repeat(64),
    requesterRole: 'business_owner',
    requesterAuthority: 'administrative_role',
    loyaltyAccountIdentityHash: 'd'.repeat(64),
    serviceRef: 'yclients:service-spa',
    serviceIdentityHash: 'e'.repeat(64),
    grantPoints: 1200,
    availableBalancePoints: 1500,
    consumeDecision: 'consume',
    consumePolicy: 'legacy-one-time-grant-consume.v1',
    codeHashContract: 'hmac-sha256-normalized-bearer.v1',
    perRedemptionCapPoints: 2000,
    expiryDecision: 'unexpired',
    balanceDecision: 'sufficient',
    capDecision: 'within_cap',
    existingRedemptionDecision: 'none',
    providerProjectionDecision: 'local_only_no_provider_write',
    authorizationEvidence: 'server_resolved_cashier_or_admin',
    legacyClaimedPoints: 1200,
    legacyClaimedBalancePoints: 1500,
    legacyClaimedUsedDecision: 'none',
    legacyClaimedExpiredDecision: 'unexpired',
    divergenceCodes: [],
  };
}

describe('P4-03 all-8 executable proof contract closure', () => {
  it('has a durable append-only revocation fact and symmetric terminal guards', () => {
    expect(schema).toContain('model LoyaltyRedemptionGrantRevocation');
    expect(revocationMigration).toContain(
      'LoyaltyRedemptionGrantRevocation_append_only_guard',
    );
    expect(revocationMigration).toContain(
      'LoyaltyRedemption_non_revoked_claim_guard',
    );
    expect(revocationMigration.match(/FOR UPDATE;/g)).toHaveLength(2);
  });

  it('keeps consume local-only without provider dispatch identity or writes', () => {
    expect(
      p403GrantConsumeExecutableNormalizer(validConsumeExecutableInput()),
    ).toMatchObject({
      providerProjectionDecision: 'local_only_no_provider_write',
      providerWritesPermitted: false,
    });
    expect(() =>
      p403GrantConsumeExecutableNormalizer({
        ...validConsumeExecutableInput(),
        providerProjectionDecision: 'deferred_attempt',
      }),
    ).toThrow('local-only');
    expect(() =>
      p403GrantConsumeExecutableNormalizer({
        ...validConsumeExecutableInput(),
        providerRecordIdentityHash: 'f'.repeat(64),
      }),
    ).toThrow('Unexpected action input');
  });

  it('registers exactly eight executable loyalty actions while preserving all shadows', () => {
    const registry = new ActionCapabilityRegistry();
    const executable = Object.values(P4_03_EXECUTABLE_CAPABILITIES);
    const shadow = [
      'loyalty.legacy-earn.shadow.v1',
      'loyalty.legacy-expire.shadow.v1',
      'loyalty.legacy-redeem.shadow.v1',
      'loyalty.legacy-refund.shadow.v1',
      'loyalty.legacy-import.shadow.v1',
      'loyalty.legacy-backfill.shadow.v1',
      'loyalty.redemption-grant.issue.shadow.v1',
      'loyalty.redemption-grant.consume.shadow.v1',
    ];
    expect(executable).toHaveLength(8);
    for (const capabilityKey of executable) {
      expect(registry.get(capabilityKey)).toMatchObject({
        policyDecision: ActionPolicyDecision.ALLOW,
        autonomyLevel: 'L3_CANONICAL',
      });
      expect(registry.get(capabilityKey).executorKey).not.toBe('shadow.none');
    }
    for (const capabilityKey of shadow) {
      expect(registry.get(capabilityKey)).toMatchObject({
        policyDecision: ActionPolicyDecision.SHADOW_ONLY,
        autonomyLevel: 'L2_5_SHADOW',
        executorKey: 'shadow.none',
      });
    }
  });

  it('binds separate accepted bulk profiles to owner-approved envelopes', () => {
    const registry = new ActionCapabilityRegistry();
    expect(P4_03_BULK_POLICY_PROFILES).toEqual({
      expire_legacy_loyalty: {
        policyVersion: 'legacy-loyalty-expiry.v1',
        maxRecipients: 25,
        maxPerClientAbsolutePoints: 5000,
        maxAggregateAbsolutePoints: 25000,
        approvalTtlMs: 900000,
      },
      backfill_legacy_loyalty: {
        policyVersion: 'legacy-loyalty-backfill.v1',
        maxRecipients: 25,
        maxPerClientAbsolutePoints: 1000,
        maxAggregateAbsolutePoints: 10000,
        approvalTtlMs: 900000,
      },
      import_legacy_loyalty_balance: {
        policyVersion: 'legacy-loyalty-import.v1',
        maxRecipients: 10,
        maxPerClientAbsolutePoints: 5000,
        maxAggregateAbsolutePoints: 20000,
        approvalTtlMs: 900000,
      },
    });
    for (const capability of Object.values(P4_03_BULK_ENVELOPE_CAPABILITIES)) {
      expect(registry.get(capability)).toMatchObject({
        policyDecision: ActionPolicyDecision.ALLOW,
        autonomyLevel: 'L3_OWNER_APPROVED',
        approvalRequirement: 'REQUIRED',
        executorKey: 'loyalty.legacy-bulk-envelope',
      });
    }
  });
});
