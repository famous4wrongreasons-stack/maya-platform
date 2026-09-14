import { ActionPolicyDecision } from '@prisma/client';

import { UserRole } from '../common/domain.enums';
import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import {
  ActionCapabilityRegistry,
  P4_10_EXECUTABLE_CAPABILITIES,
  P4_10_REGISTRATIONS,
  P4_10_SHADOW_CAPABILITIES,
} from './index';

const authority = {
  integrationId: 'commerce_1',
  provider: 'yookassa',
  expectedStateHash: 'state_hash',
  currentCredentialSetFingerprint: null,
  desiredCredentialSetFingerprint: 'desired_hash',
  shopIdFingerprint: 'shop_hash',
  actorMembershipId: 'membership_1',
  actorRole: 'tenant_owner',
  policyVersion: 'p4-10.tenant-commerce-credential-authority.v1',
  policySnapshotHash: 'policy_hash',
  approvalRequirement: 'AUTHORIZED_ACTOR',
  oneTenantCount: 1,
  oneProviderCount: 1,
  bulkMutation: false,
  providerOperation: 'READ_ONLY_CREDENTIAL_VERIFY',
  intendedMutation: 'connect_commerce_credentials',
  credentialWritePerformed: false,
  providerWrites: 0,
};

describe('P4-10 commerce credential contracts', () => {
  it('registers exactly four non-executable Shadows and four local executors', () => {
    const registry = new ActionCapabilityRegistry();
    const shadows = Object.values(P4_10_SHADOW_CAPABILITIES).map((key) =>
      registry.get(key),
    );
    const executors = Object.values(P4_10_EXECUTABLE_CAPABILITIES).map((key) =>
      registry.get(key),
    );
    expect(P4_10_REGISTRATIONS).toHaveLength(4);
    expect(shadows).toHaveLength(4);
    expect(executors).toHaveLength(4);
    expect(
      shadows.every(
        (item) =>
          item.policyDecision === ActionPolicyDecision.SHADOW_ONLY &&
          item.executorKey === 'shadow.none',
      ),
    ).toBe(true);
    expect(
      executors.every(
        (item) =>
          item.policyDecision === ActionPolicyDecision.ALLOW &&
          item.executorKey === 'commerce.canonical-credentials' &&
          item.reconciliation.key.endsWith('provider-read-not-required'),
      ),
    ).toBe(true);
  });

  it('separates connect, replace, recheck, and disconnect transition shapes', () => {
    expect(P4_10_REGISTRATIONS[0].normalizeInput(authority)).toMatchObject({
      currentCredentialSetFingerprint: null,
      desiredCredentialSetFingerprint: 'desired_hash',
      providerOperation: 'READ_ONLY_CREDENTIAL_VERIFY',
    });
    expect(
      P4_10_REGISTRATIONS[1].normalizeInput({
        ...authority,
        currentCredentialSetFingerprint: 'current_hash',
        intendedMutation: 'replace_commerce_credentials',
      }),
    ).toMatchObject({ currentCredentialSetFingerprint: 'current_hash' });
    expect(
      P4_10_REGISTRATIONS[2].normalizeInput({
        ...authority,
        currentCredentialSetFingerprint: 'current_hash',
        desiredCredentialSetFingerprint: null,
        shopIdFingerprint: null,
        intendedMutation: 'recheck_commerce_credentials',
      }),
    ).toMatchObject({ desiredCredentialSetFingerprint: null });
    expect(
      P4_10_REGISTRATIONS[3].normalizeInput({
        ...authority,
        currentCredentialSetFingerprint: 'current_hash',
        desiredCredentialSetFingerprint: null,
        shopIdFingerprint: null,
        providerOperation: 'NONE',
        intendedMutation: 'disconnect_commerce_credentials',
      }),
    ).toMatchObject({ providerOperation: 'NONE' });
  });

  it('rejects raw credentials and caller-forged policy authority', () => {
    for (const forged of [
      { shopId: 'raw-shop' },
      { secretKey: 'raw-secret' },
      { approved: true },
      { policyDecision: 'ALLOW' },
      { bulkMutation: true },
      { oneTenantCount: 2 },
      { provider: 'other' },
    ]) {
      expect(() =>
        P4_10_REGISTRATIONS[0].normalizeInput({ ...authority, ...forged }),
      ).toThrow();
    }
  });

  it('preserves the exact production manager-role boundary without inventing a new feature lock', () => {
    const registry = new ActionCapabilityRegistry();
    const policy = canonicalProductionPolicyDefinitions(registry).find(
      (item) => item.capability === P4_10_EXECUTABLE_CAPABILITIES.connect,
    );
    expect(policy).toMatchObject({
      actorPolicy: 'REQUIRED',
      allowedActorRoles: [
        UserRole.TENANT_OWNER,
        UserRole.BUSINESS_OWNER,
        UserRole.TENANT_ADMIN,
        UserRole.ADMINISTRATOR,
      ],
      requiredFeatures: [],
      approverPolicyKey: 'none',
    });
  });
});
