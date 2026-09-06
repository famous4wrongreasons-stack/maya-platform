import { verifiedClientChannelCapability } from './client-preferences.contract';
import { clientPrincipalTarget } from './client-action-principal.contract';
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

const EXPENSE_MANAGER_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
];

const EXPENSE_DECLARER_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
];

const TENANT_BILLING_ACTOR_ROLES: readonly UserRole[] = [
  UserRole.PLATFORM_OWNER,
  UserRole.PLATFORM_ADMIN,
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

const VALUE_CONFIGURATION_REQUESTER_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

const COMMERCE_CREDENTIAL_MANAGER_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
];

const RECOVERY_ATTRIBUTION_REQUESTER_ROLES: readonly UserRole[] = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
];

function requiredFeatures(capability: string): readonly MayaFeatureKey[] {
  if (capability.startsWith('crm.')) return ['crm.integration'];
  if (capability.startsWith('communication.')) return ['notifications.core'];
  if (capability.startsWith('loyalty.')) return ['loyalty'];
  if (capability.startsWith('referrals.')) return ['referrals'];
  if (capability.startsWith('expenses.')) return ['expenses.core'];
  if (capability.startsWith('client-lifecycle.')) return ['customers.core'];
  if (capability.startsWith('occupancy.')) return ['calendar.internal'];
  if (capability.startsWith('admin.')) return ['ai.admin'];
  return [];
}

function allowedActorRoles(capability: string): readonly UserRole[] {
  if (
    capability.startsWith('package5.wave5.recovery-attribution-correction.')
  ) {
    return RECOVERY_ATTRIBUTION_REQUESTER_ROLES;
  }
  if (capability.startsWith('commerce-credentials.')) {
    return COMMERCE_CREDENTIAL_MANAGER_ROLES;
  }
  if (capability.startsWith('value-configuration.')) {
    return VALUE_CONFIGURATION_REQUESTER_ROLES;
  }
  if (capability.startsWith('tenant-billing.')) {
    return TENANT_BILLING_ACTOR_ROLES;
  }
  if (capability.startsWith('loyalty.internal-adjust.')) {
    return LOYALTY_ADJUSTMENT_ROLES;
  }
  if (capability === 'loyalty.redemption-grant.consume.execute.v1') {
    return LOYALTY_GRANT_CONSUME_ROLES;
  }
  if (capability.startsWith('expenses.period-declare.')) {
    return EXPENSE_DECLARER_ROLES;
  }
  if (capability.startsWith('expenses.')) return EXPENSE_MANAGER_ROLES;
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
        clientPrincipalTarget: clientPrincipalTarget(capability.capability),
        actorPolicy: verifiedClientChannelCapability(capability.capability)
          ? 'VERIFIED_CLIENT_CHANNEL'
          : trustedServiceSourceTypes.length > 0
            ? 'OPTIONAL_TRUSTED_SERVICE'
            : 'REQUIRED',
        allowedActorRoles: allowedActorRoles(capability.capability),
        trustedServiceSourceTypes,
        requiredFeatures: requiredFeatures(capability.capability),
        permissionCodes: [
          capability.actionClass === 'reactivate_tenant'
            ? 'tenant.recoverable'
            : 'tenant.active',
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
