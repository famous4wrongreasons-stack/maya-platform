import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import { projectLegacyStaffReference } from '../crm/legacy-staff-reference.projection';
import { Public } from '../decorators/public.decorator';
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

/**
 * Read-only Telegram update adapter for the existing AuthIdentity + A16 staff
 * authority. The bridge credential identifies the bot installation; the
 * provider subject can only select the exact canonical identity inside that
 * installation's tenant. It never creates an account, role, or binding.
 */
@Controller('internal/legacy/telegram-staff-principal')
export class TelegramStaffPrincipalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeSourceService,
    private readonly context: TenantContextService,
  ) {}

  @Public()
  @Post()
  async read(
    @Headers('x-maya-legacy-bridge') secret: string | undefined,
    @Body() value: unknown,
  ) {
    this.bridge.assertBridgeSecret(
      secret,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'telegram_staff_principal_bridge_disabled',
        unauthorized: 'telegram_staff_principal_bridge_unauthorized',
      },
    );
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !==
        'externalCompanyId,provider,providerUserId'
    )
      throw new BadRequestException('Exact Telegram channel envelope required');
    const body = value as Record<string, unknown>;
    const providerUserId = String(body.providerUserId ?? '').trim();
    if (!/^[1-9][0-9]{0,19}$/.test(providerUserId))
      throw new BadRequestException('Valid Telegram provider subject required');
    const source = this.bridge.assertBridgeIntegrationBinding(
      body,
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'telegram_staff_principal_binding_disabled',
        mismatch: 'telegram_staff_principal_source_mismatch',
      },
    );
    const installation = await this.bridge.resolveTenantByIntegration(
      source,
      'telegram_staff_principal_tenant_unresolved',
    );
    return this.context.runAsPublicTenant(installation.tenantId, () =>
      this.prisma.$transaction(async (tx) => {
        const identity = await tx.authIdentity.findUnique({
          where: {
            tenantId_provider_providerUserId: {
              tenantId: installation.tenantId,
              provider: 'telegram',
              providerUserId,
            },
          },
          select: { id: true, userId: true },
        });
        if (!identity) return this.unlinked();
        const user = await tx.user.findUnique({
          where: { id: identity.userId },
          select: { id: true, status: true },
        });
        const membership = await tx.membership.findUnique({
          where: {
            userId_tenantId: {
              userId: identity.userId,
              tenantId: installation.tenantId,
            },
          },
          select: { id: true, role: true, status: true },
        });
        if (
          !user ||
          user.status !== 'active' ||
          !membership ||
          membership.status !== 'active' ||
          !STAFF_ROLES.includes(membership.role)
        )
          return this.unlinked();
        const access = await tx.crmStaffAccess.findUnique({
          where: {
            tenantId_userId: {
              tenantId: installation.tenantId,
              userId: identity.userId,
            },
          },
          select: { id: true, role: true, status: true, staffId: true },
        });
        if (
          access &&
          (access.status !== 'active' ||
            String(access.role) !== String(membership.role))
        )
          return this.unlinked();
        if (membership.role === UserRole.STAFF && (!access || !access.staffId))
          return this.unlinked();
        const staffPresentation = await projectLegacyStaffReference(tx, {
          tenantId: installation.tenantId,
          provider: source.provider,
          staffId: asStaffIdOrNull(access?.staffId),
        });
        return {
          contract: 'maya.canonical-telegram-staff-principal/1',
          userId: identity.userId,
          tenantId: installation.tenantId,
          membershipId: membership.id,
          role: membership.role,
          platform: false,
          telegramId: providerUserId,
          authIdentityId: identity.id,
          staffId: access?.staffId ?? null,
          ...staffPresentation,
          businessMutations: 0,
        };
      }),
    );
  }

  private unlinked() {
    return {
      contract: 'maya.canonical-telegram-staff-principal/1',
      principal: null,
      businessMutations: 0,
    };
  }
}
