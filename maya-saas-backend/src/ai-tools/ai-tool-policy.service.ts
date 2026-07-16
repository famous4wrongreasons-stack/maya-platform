import { ForbiddenException, Injectable } from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import type { MayaFeatureKey } from '../common/feature-catalog';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import type {
  AiToolDefinition,
  AiToolPrincipal,
  AiToolSurface,
} from './ai-tool.types';

const OWNER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
] as const;

@Injectable()
export class AiToolPolicyService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly entitlements: EntitlementsService,
    private readonly registry: AiToolRegistryService,
  ) {}

  async listAllowed(
    tenantId: string,
    userId: string,
    role: UserRole,
    surface: AiToolSurface,
  ) {
    const principal = this.buildPrincipal(tenantId, userId, role, surface);
    const profileFeature = this.profileFeature(role);
    if (!profileFeature) {
      return [];
    }
    const entitlements = await this.entitlements.getEffectiveEntitlements(
      principal.tenantId,
    );
    if (entitlements.features[profileFeature] !== true) {
      return [];
    }

    return this.registry
      .list()
      .filter(
        (definition) =>
          definition.riskTier !== 'restricted' &&
          definition.allowedRoles.includes(role) &&
          definition.allowedSurfaces.includes(surface) &&
          definition.requiredFeatures.every(
            (feature) => entitlements.features[feature] === true,
          ),
      );
  }

  async assertCanExecute(
    principal: AiToolPrincipal,
    definition: AiToolDefinition,
  ): Promise<void> {
    this.tenantContext.assertTenantId(principal.tenantId);
    if (
      !definition.allowedRoles.includes(principal.role) ||
      !definition.allowedSurfaces.includes(principal.surface) ||
      definition.riskTier === 'restricted'
    ) {
      this.deny();
    }
    const profileFeature = this.profileFeature(principal.role);
    if (!profileFeature) {
      this.deny();
    }
    await this.entitlements.assertFeature(principal.tenantId, profileFeature);
    for (const feature of definition.requiredFeatures) {
      await this.entitlements.assertFeature(principal.tenantId, feature);
    }
  }

  canDecide(
    definition: AiToolDefinition,
    requestedByUserId: string | null,
    principal: AiToolPrincipal,
  ): boolean {
    if (definition.approvalPolicy === 'actor') {
      return requestedByUserId === principal.userId;
    }
    if (definition.approvalPolicy === 'owner') {
      return OWNER_ROLES.includes(
        principal.role as (typeof OWNER_ROLES)[number],
      );
    }
    return false;
  }

  assertCanDecide(
    definition: AiToolDefinition,
    requestedByUserId: string | null,
    principal: AiToolPrincipal,
  ): void {
    this.tenantContext.assertTenantId(principal.tenantId);
    if (!this.canDecide(definition, requestedByUserId, principal)) {
      this.deny();
    }
  }

  buildPrincipal(
    tenantId: string,
    userId: string,
    role: UserRole,
    surface: AiToolSurface,
  ): AiToolPrincipal {
    return {
      tenantId: this.tenantContext.assertTenantId(tenantId),
      userId,
      role,
      surface,
    };
  }

  private profileFeature(role: UserRole): MayaFeatureKey | null {
    if ([UserRole.CLIENT, UserRole.CUSTOMER].includes(role)) {
      return 'ai.consultant';
    }
    if (OWNER_ROLES.includes(role as (typeof OWNER_ROLES)[number])) {
      return 'ai.owner';
    }
    if (
      [
        UserRole.ADMINISTRATOR,
        UserRole.MANAGER,
        UserRole.BRANCH_MANAGER,
        UserRole.PROVIDER,
        UserRole.EMPLOYEE,
        UserRole.STAFF,
        UserRole.ACCOUNTANT,
      ].includes(role)
    ) {
      return 'ai.admin';
    }
    return null;
  }

  private deny(): never {
    throw new ForbiddenException({
      message: 'AI tool is not allowed for this principal.',
      error: { code: 'ai_tool_forbidden' },
    });
  }
}
