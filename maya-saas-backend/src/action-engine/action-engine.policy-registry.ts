import { UserRole } from '../common/domain.enums';
import type { MayaFeatureKey } from '../common/feature-catalog';
import {
  CanonicalActionPolicyRegistry,
  type CanonicalActionPolicyDefinitionV1,
} from './action-engine.policy-resolver';
import { ActionCapabilityRegistry } from './action-engine.registry';

const TENANT_ACTION_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
  UserRole.CLIENT,
  UserRole.CUSTOMER,
  UserRole.INTEGRATION_SERVICE,
];

const LOYALTY_ADJUSTMENT_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

const LOYALTY_GRANT_CONSUME_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
];

function requiredFeatures(capability: string): readonly MayaFeatureKey[] {
  if (capability.startsWith('crm.')) return ['crm.integration'];
  if (capability.startsWith('communication.')) return ['notifications.core'];
  if (capability.startsWith('loyalty.')) return ['loyalty'];
  if (capability.startsWith('referrals.')) return ['referrals'];
  if (capability.startsWith('client-lifecycle.')) return ['customers.core'];
  if (capability.startsWith('occupancy.')) return ['calendar.internal'];
  if (capability.startsWith('admin.')) return ['ai.admin'];
  return [];
}

function allowedActorRoles(capability: string): readonly UserRole[] {
  if (capability.startsWith('loyalty.internal-adjust.')) {
    return LOYALTY_ADJUSTMENT_ROLES;
  }
  if (capability === 'loyalty.redemption-grant.consume.execute.v1') {
    return LOYALTY_GRANT_CONSUME_ROLES;
  }
  return TENANT_ACTION_ROLES;
}

export function canonicalProductionPolicyDefinitions(
  capabilityRegistry = new ActionCapabilityRegistry(),
): readonly CanonicalActionPolicyDefinitionV1[] {
  return capabilityRegistry
    .list()
    .filter((capability) => !capability.capability.startsWith('kernel.test.'))
    .map((capability) => {
      const trustedServiceSourceTypes = capability.allowedSourceTypes.filter(
        (sourceType) =>
          sourceType !== 'authenticated_request' &&
          sourceType !== 'synthetic_shadow',
      );
      return {
        capability: capability.capability,
        policyProfileKey: `canonical.${capability.actionClass}`,
        policyProfileVersion: 1,
        actorPolicy:
          trustedServiceSourceTypes.length > 0
            ? 'OPTIONAL_TRUSTED_SERVICE'
            : 'REQUIRED',
        allowedActorRoles: allowedActorRoles(capability.capability),
        trustedServiceSourceTypes,
        requiredFeatures: requiredFeatures(capability.capability),
        permissionCodes: [
          'tenant.active',
          'principal.server-derived',
          `${capability.actionClass}.request`,
        ],
        approverPolicyKey:
          capability.approvalRequirement === 'REQUIRED'
            ? 'tenant-owner'
            : 'none',
        validityMs: 60_000,
      } satisfies CanonicalActionPolicyDefinitionV1;
    });
}

export function createCanonicalProductionPolicyRegistry(
  capabilityRegistry = new ActionCapabilityRegistry(),
): CanonicalActionPolicyRegistry {
  return new CanonicalActionPolicyRegistry(
    canonicalProductionPolicyDefinitions(capabilityRegistry),
  );
}
