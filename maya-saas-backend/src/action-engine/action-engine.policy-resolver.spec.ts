import { ActionPolicyDecision, type PrismaClient } from '@prisma/client';

import { UserRole } from '../common/domain.enums';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../entitlements/entitlements.service';
import {
  ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  CanonicalActionPolicyRegistry,
  CanonicalActionPolicyResolver,
  type ActionPolicyResolutionRequestV1,
  type CanonicalActionPolicyDefinitionV1,
} from './action-engine.policy-resolver';

const NOW = new Date('2026-08-29T12:00:00.000Z');
const NORMALIZED_INPUT_HASH = 'a'.repeat(64);
const ATTESTATION_SECRET = 'package-3-policy-attestation-test-secret-20260829';

const appointmentPolicy: CanonicalActionPolicyDefinitionV1 = {
  capability: 'crm.appointment.create.v1',
  policyProfileKey: 'canonical.crm.appointment.write',
  policyProfileVersion: 1,
  actorPolicy: 'REQUIRED',
  allowedActorRoles: [
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
  ],
  trustedServiceSourceTypes: [],
  requiredFeatures: ['crm.integration'],
  permissionCodes: ['tenant.active', 'membership.active', 'appointment.write'],
  approverPolicyKey: 'none',
  validityMs: 5 * 60 * 1_000,
};

const schedulerPolicy: CanonicalActionPolicyDefinitionV1 = {
  capability: 'communication.appointment-reminders.execute.v1',
  policyProfileKey: 'canonical.communication.reminder-delivery',
  policyProfileVersion: 1,
  actorPolicy: 'OPTIONAL_TRUSTED_SERVICE',
  allowedActorRoles: [],
  trustedServiceSourceTypes: ['scheduler'],
  requiredFeatures: ['notifications.core'],
  permissionCodes: ['tenant.active', 'scheduler.bound', 'notification.deliver'],
  approverPolicyKey: 'none',
  validityMs: 60_000,
};

const baseTenant = () => ({
  id: 'tenant-a',
  status: 'active',
  planId: 'plan-a',
  trialEndsAt: null,
  trialFullAccess: false,
  currentPeriodEnd: new Date('2026-09-29T12:00:00.000Z'),
  pastDueAt: null,
  graceEndsAt: null,
  updatedAt: new Date('2026-08-29T11:30:00.000Z'),
});

const baseMembership = () => ({
  id: 'membership-a',
  userId: 'user-a',
  role: 'tenant_owner',
  status: 'active',
  branchId: 'branch-a',
  updatedAt: new Date('2026-08-29T11:45:00.000Z'),
  user: { status: 'active' },
});

const featureDecision = (
  featureKey: 'crm.integration' | 'notifications.core',
  enabled = true,
): FeatureRequirementDecision => ({
  contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
  tenantId: 'tenant-a',
  planId: 'plan-a',
  requiredFeatures: [{ featureKey, enabled }],
  allowed: enabled,
  evaluatedAt: NOW,
  validUntil: new Date('2026-08-29T12:02:00.000Z'),
});

const baseRequest = (): ActionPolicyResolutionRequestV1 => ({
  contract: ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
  tenantId: 'tenant-a',
  capability: 'crm.appointment.create.v1',
  sourceType: 'authenticated_request',
  sourceRef: 'request-a',
  actorUserId: 'user-a',
  targetRef: 'appointment-a',
  normalizedInputHash: NORMALIZED_INPUT_HASH,
});

function buildResolver(options?: {
  tenant?: ReturnType<typeof baseTenant>;
  membership?: ReturnType<typeof baseMembership> | null;
  entitlementDecision?: FeatureRequirementDecision;
  definitions?: CanonicalActionPolicyDefinitionV1[];
}) {
  const tenantFindUnique = jest
    .fn()
    .mockResolvedValue(options?.tenant ?? baseTenant());
  const membershipFindUnique = jest
    .fn()
    .mockResolvedValue(
      options && 'membership' in options
        ? options.membership
        : baseMembership(),
    );
  const resolveFeatureRequirements = jest
    .fn()
    .mockResolvedValue(
      options?.entitlementDecision ?? featureDecision('crm.integration', true),
    );
  const prisma = {
    tenant: { findUnique: tenantFindUnique },
    membership: { findUnique: membershipFindUnique },
  } as unknown as Pick<PrismaClient, 'tenant' | 'membership'>;
  const entitlements = {
    resolveFeatureRequirements,
  } as unknown as Pick<EntitlementsService, 'resolveFeatureRequirements'>;
  const resolver = new CanonicalActionPolicyResolver(
    prisma,
    entitlements,
    { attestationSecret: ATTESTATION_SECRET, now: () => NOW },
    new CanonicalActionPolicyRegistry(
      options?.definitions ?? [appointmentPolicy, schedulerPolicy],
    ),
  );

  return {
    resolver,
    tenantFindUnique,
    membershipFindUnique,
    resolveFeatureRequirements,
  };
}

describe('CanonicalActionPolicyResolver', () => {
  it('derives the complete policy attestation from server-owned sources', async () => {
    const { resolver, tenantFindUnique, resolveFeatureRequirements } =
      buildResolver();

    const result = await resolver.resolve(baseRequest());

    expect(result).toMatchObject({
      policyKey: 'production.create_appointment.confirmed-request',
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      policyDecidedBy: 'canonical_action_policy_resolver',
      autonomyLevel: 'L2_CONFIRMED_REQUEST',
      approvalRequirement: 'NONE',
      approverPolicyKey: 'none',
      riskProfileVersion: 1,
      reasonCodes: [],
      policyContextContract: 'maya.action-policy-context/1',
      policyEvaluatedAt: NOW,
      policyValidUntil: new Date('2026-08-29T12:02:00.000Z'),
      approvalBindingExpiresAt: new Date('2026-08-29T12:02:00.000Z'),
    });
    expect(result.policyContextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.approvalBindingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tenantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-a' } }),
    );
    expect(resolveFeatureRequirements).toHaveBeenCalledWith(
      'tenant-a',
      ['crm.integration'],
      NOW,
    );

    const durableEvidence = JSON.stringify(result.policyEvidenceJson);
    expect(durableEvidence).not.toContain('tenant-a');
    expect(durableEvidence).not.toContain('user-a');
    expect(durableEvidence).not.toContain('branch-a');
    expect(durableEvidence).not.toContain('appointment-a');
    expect(durableEvidence).not.toContain('plan-a');
    expect(durableEvidence).toContain('tenant_owner');
    expect(durableEvidence).toContain('crm.integration');
  });

  it('rejects caller-supplied authority before reading server state', async () => {
    const { resolver, tenantFindUnique } = buildResolver();
    const authorityFields = [
      'entitled',
      'entitlements',
      'approved',
      'approvalDecision',
      'approvalRequirement',
      'autonomy',
      'autonomyLevel',
      'policyDecision',
      'role',
      'riskFacets',
      'executor',
      'tenantStatus',
    ];

    for (const field of authorityFields) {
      await expect(
        resolver.resolve({
          ...baseRequest(),
          [field]: field === 'entitled' ? true : 'caller-selected',
        }),
      ).rejects.toThrow(/authority or unknown fields/);
    }
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it('fails closed on tenant, membership, role and entitlement changes', async () => {
    const cases = [
      {
        tenant: { ...baseTenant(), status: 'suspended' },
        membership: baseMembership(),
        entitlement: featureDecision('crm.integration'),
        reason: 'tenant_access_denied',
      },
      {
        tenant: baseTenant(),
        membership: { ...baseMembership(), status: 'suspended' },
        entitlement: featureDecision('crm.integration'),
        reason: 'membership_inactive',
      },
      {
        tenant: baseTenant(),
        membership: { ...baseMembership(), role: 'client' },
        entitlement: featureDecision('crm.integration'),
        reason: 'role_denied',
      },
      {
        tenant: baseTenant(),
        membership: baseMembership(),
        entitlement: featureDecision('crm.integration', false),
        reason: 'entitlement_denied',
      },
    ];

    for (const testCase of cases) {
      const { resolver } = buildResolver({
        tenant: testCase.tenant,
        membership: testCase.membership,
        entitlementDecision: testCase.entitlement,
      });
      const result = await resolver.resolve(baseRequest());
      expect(result.policyDecision).toBe(ActionPolicyDecision.DENY);
      expect(result.reasonCodes).toContain(testCase.reason);
      expect(result.policyContextHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.approvalBindingHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('allows an actorless source only when the server policy registers it', async () => {
    const { resolver, membershipFindUnique } = buildResolver({
      entitlementDecision: featureDecision('notifications.core'),
    });
    const result = await resolver.resolve({
      contract: ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
      tenantId: 'tenant-a',
      capability: 'communication.appointment-reminders.execute.v1',
      sourceType: 'scheduler',
      sourceRef: 'job:appointment-reminders:2026-08-29T12:00Z',
      targetRef: 'recipient-a',
      normalizedInputHash: NORMALIZED_INPUT_HASH,
    });

    expect(result.policyDecision).toBe(ActionPolicyDecision.ALLOW);
    expect(result.reasonCodes).toEqual([]);
    expect(membershipFindUnique).not.toHaveBeenCalled();

    const actorless = { ...baseRequest() };
    delete actorless.actorUserId;
    await expect(resolver.resolve(actorless)).resolves.toMatchObject({
      policyDecision: ActionPolicyDecision.DENY,
      reasonCodes: ['actor_required'],
    });
  });

  it('binds policy and approval hashes to target and membership scope', async () => {
    const first = await buildResolver().resolver.resolve(baseRequest());
    const same = await buildResolver().resolver.resolve(baseRequest());
    const differentTarget = await buildResolver().resolver.resolve({
      ...baseRequest(),
      targetRef: 'appointment-b',
    });
    const differentBranch = await buildResolver({
      membership: { ...baseMembership(), branchId: 'branch-b' },
    }).resolver.resolve(baseRequest());

    expect(same.policyContextHash).toBe(first.policyContextHash);
    expect(same.approvalBindingHash).toBe(first.approvalBindingHash);
    expect(differentTarget.policyContextHash).not.toBe(first.policyContextHash);
    expect(differentTarget.approvalBindingHash).not.toBe(
      first.approvalBindingHash,
    );
    expect(differentBranch.policyContextHash).not.toBe(first.policyContextHash);
    expect(differentBranch.approvalBindingHash).not.toBe(
      first.approvalBindingHash,
    );
  });

  it('fails closed when no server policy profile is registered', async () => {
    const { resolver, tenantFindUnique } = buildResolver({ definitions: [] });

    await expect(resolver.resolve(baseRequest())).rejects.toThrow(
      /Canonical policy profile is not registered/,
    );
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });
});
