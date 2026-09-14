import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { projectLegacyStaffReference } from '../crm/legacy-staff-reference.projection';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { asStaffIdOrNull } from '../domain/staff-identity';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const STAFF_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.STAFF,
];

/** Read-only adapter for existing AC3/A16 authority. The global JWT/session,
 * tenant and role guards run before this controller. The bridge binds only the
 * legacy installation; it cannot create or replace the authenticated User. */
@Controller('internal/legacy/staff-principal')
export class LegacyStaffPrincipalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
  ) {}

  @Post()
  @Roles(...STAFF_ROLES, UserRole.PLATFORM_OWNER)
  async read(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-maya-legacy-bridge') secret: string | undefined,
    @Body() value: unknown,
  ) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'staff_principal_bridge_disabled',
        unauthorized: 'staff_principal_bridge_unauthorized',
      },
    );
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'externalCompanyId,provider'
    )
      throw new BadRequestException('Exact installation envelope required');
    const source = this.bridge.assertBridgeIntegrationBinding(
      value,
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'staff_principal_binding_disabled',
        mismatch: 'staff_principal_source_mismatch',
      },
    );
    const installation = await this.bridge.resolveTenantByIntegration(
      source,
      'staff_principal_tenant_unresolved',
    );
    const platform =
      actor.role === UserRole.PLATFORM_OWNER && actor.tenantId === null;
    if (
      !platform &&
      (actor.tenantId !== installation.tenantId || !actor.membershipId)
    )
      throw new ForbiddenException('Exact current tenant membership required');
    if (!platform && !STAFF_ROLES.includes(actor.role))
      throw new ForbiddenException('Canonical staff authority required');
    return this.context.runAsPublicTenant(installation.tenantId, () =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: actor.userId },
          select: { id: true, status: true, role: true, tenantId: true },
        });
        if (
          !user ||
          user.status !== 'active' ||
          (platform &&
            (user.role !== 'platform_owner' || user.tenantId !== null))
        )
          throw new ForbiddenException('Canonical account is no longer active');
        const session = await tx.authSession.findUnique({
          where: { id: actor.sessionId },
          select: {
            userId: true,
            tenantId: true,
            expiresAt: true,
            revokedAt: true,
          },
        });
        if (
          !session ||
          session.userId !== actor.userId ||
          session.tenantId !== actor.tenantId ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          throw new ForbiddenException('Canonical session is no longer active');
        if (!platform) {
          const membership = await tx.membership.findUnique({
            where: {
              userId_tenantId: {
                userId: actor.userId,
                tenantId: installation.tenantId,
              },
            },
            select: { id: true, role: true, status: true },
          });
          if (
            !membership ||
            membership.id !== actor.membershipId ||
            membership.status !== 'active' ||
            String(membership.role) !== String(actor.role)
          )
            throw new ForbiddenException('Canonical membership changed');
        }
        const access = await tx.crmStaffAccess.findUnique({
          where: {
            tenantId_userId: {
              tenantId: installation.tenantId,
              userId: actor.userId,
            },
          },
          select: {
            id: true,
            role: true,
            status: true,
            staffId: true,
          },
        });
        if (
          access &&
          (access.status !== 'active' ||
            (!platform && String(access.role) !== String(actor.role)))
        )
          throw new ForbiddenException('Canonical staff access changed');
        if (actor.role === UserRole.STAFF && (!access || !access.staffId))
          throw new ForbiddenException('Exact canonical staff access required');
        const staffPresentation = await projectLegacyStaffReference(tx, {
          tenantId: installation.tenantId,
          provider: source.provider,
          staffId: asStaffIdOrNull(access?.staffId),
        });
        const identities = await tx.authIdentity.findMany({
          where: {
            tenantId: installation.tenantId,
            userId: actor.userId,
            provider: 'telegram',
          },
          select: { id: true, providerUserId: true },
          take: 2,
        });
        const telegramId =
          identities.length === 1 &&
          /^[1-9][0-9]{0,19}$/.test(identities[0].providerUserId)
            ? identities[0].providerUserId
            : null;
        return {
          contract: 'maya.canonical-staff-principal/1',
          userId: actor.userId,
          tenantId: installation.tenantId,
          membershipId: platform ? null : actor.membershipId,
          role: actor.role,
          platform,
          telegramId,
          authIdentityId: telegramId ? identities[0].id : null,
          staffId: access?.staffId ?? null,
          ...staffPresentation,
          businessMutations: 0,
        };
      }),
    );
  }
}
