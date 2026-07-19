import { ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/authenticated-user.interface';
import { TenantStatus, UserRole, UserStatus } from '../common/domain.enums';
import {
  BrandingService,
  UploadedLogoFile,
} from '../branding/branding.service';
import { UpdateBrandingDto } from '../branding/dto/update-branding.dto';
import { CrmService } from '../crm/crm.service';
import { CreateCrmIntegrationDto } from '../crm/dto/create-crm-integration.dto';
import { UpdateCrmIntegrationDto } from '../crm/dto/update-crm-integration.dto';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { QuotaResource } from '../quotas/quota-resource';
import { QuotaService } from '../quotas/quota.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto';
import { UpdateTenantDto } from '../tenants/dto/update-tenant.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly brandingService: BrandingService,
    private readonly crmService: CrmService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditLogService: AuditLogService,
    private readonly tenantContext: TenantContextService,
    private readonly quotas: QuotaService,
  ) {}

  createTenant(dto: CreateTenantDto, actor: AuthenticatedUser) {
    return this.tenantsService.createTenant(dto).then(async (tenant) => {
      await this.tenantContext.runAsSystemTenant(tenant.id, () =>
        this.auditLogService.log({
          tenantId: tenant.id,
          userId: actor.userId,
          action: 'tenant.created',
          entityType: 'tenant',
          entityId: tenant.id,
          metadata: {
            slug: tenant.slug,
          },
        }),
      );

      return tenant;
    });
  }

  listTenants() {
    return this.tenantsService.listTenants();
  }

  listPlans() {
    return this.subscriptionsService.listPlans();
  }

  async getTenant(id: string, actor: AuthenticatedUser) {
    this.ensureTenantCanBeManaged(actor, id);
    return this.tenantsService.serializeTenant(
      await this.tenantsService.getTenantByIdOrThrow(id),
    );
  }

  async updateTenant(
    id: string,
    dto: UpdateTenantDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureTenantCanBeManaged(actor, id);
    this.assertTenantUpdateFieldsAllowed(dto, actor);
    const tenant = await this.tenantsService.updateTenant(id, dto);

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'tenant.updated',
      entityType: 'tenant',
      entityId: id,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return tenant;
  }

  async updateBranding(
    id: string,
    dto: UpdateBrandingDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureTenantCanBeManaged(actor, id);
    await this.quotas.assertCustomBrandingAllowed(id, Object.keys(dto));
    const branding = await this.brandingService.upsertBranding(id, dto);

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'branding.updated',
      entityType: 'branding',
      entityId: branding.id,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return this.serializeBranding(branding);
  }

  async uploadTenantLogo(
    id: string,
    file: UploadedLogoFile | undefined,
    actor: AuthenticatedUser,
  ) {
    this.ensureTenantCanBeManaged(actor, id);
    await this.tenantsService.getTenantByIdOrThrow(id);
    const branding = await this.brandingService.uploadTenantLogo(id, file);

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'branding.logo_uploaded',
      entityType: 'branding',
      entityId: branding.id,
      metadata: {
        logo_url: branding.logoUrl,
      },
    });

    return this.serializeBranding(branding);
  }

  async upsertCrm(
    id: string,
    dto: CreateCrmIntegrationDto | UpdateCrmIntegrationDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureTenantCanBeManaged(actor, id);
    this.assertCrmUpdateFieldsAllowed(dto, actor);
    const integration = await this.crmService.connectAndActivateIntegration(
      id,
      dto,
    );

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'crm.updated',
      entityType: 'crm_integration',
      entityId: integration.id,
      metadata: {
        provider: integration.provider,
      },
    });

    return integration;
  }

  async testCrm(id: string, actor: AuthenticatedUser) {
    this.ensureTenantCanBeManaged(actor, id);
    const result = await this.crmService.testConnection(id);

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'crm.tested',
      entityType: 'crm_integration',
      entityId: id,
      metadata: result,
    });

    return result;
  }

  async createTenantUser(
    id: string,
    dto: CreateTenantUserDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureTenantCanBeManaged(actor, id);
    const role = dto.role ?? UserRole.TENANT_ADMIN;
    this.assertTenantRoleCanBeAssigned(role, actor);
    await this.tenantsService.getTenantByIdOrThrow(id);
    await this.quotas.assertCanCreate(id, QuotaResource.STAFF);

    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(dto.branchId, id);
    }

    await this.usersService.ensureEmailIsAvailable(id, dto.email);

    if (dto.phone) {
      await this.usersService.ensurePhoneIsAvailable(id, dto.phone);
    }

    const temporaryPassword = dto.password?.trim() || this.generatePassword();
    const user = await this.usersService.createUser({
      tenantId: id,
      branchId: dto.branchId ?? null,
      email: dto.email,
      phone: dto.phone ?? null,
      name: dto.name ?? null,
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
      role,
      status: UserStatus.ACTIVE,
    });

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'tenant.user_created',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        role: user.role,
        email: user.email,
        branch_id: user.branchId,
      },
    });

    return {
      user: this.usersService.serializeUser(user),
      temporary_password: dto.password ? null : temporaryPassword,
    };
  }

  async setTenantStatus(
    id: string,
    status: TenantStatus,
    actor: AuthenticatedUser,
  ) {
    const tenant = await this.tenantsService.setTenantStatus(id, status);

    await this.tenantContext.runAsSystemTenant(id, () =>
      this.auditLogService.log({
        tenantId: id,
        userId: actor.userId,
        action: `tenant.${status}`,
        entityType: 'tenant',
        entityId: id,
        metadata: { status },
      }),
    );

    return tenant;
  }

  private generatePassword() {
    return randomBytes(12).toString('base64url');
  }

  private assertTenantRoleCanBeAssigned(
    role: UserRole,
    actor: AuthenticatedUser,
  ) {
    if (
      role === UserRole.TENANT_OWNER &&
      actor.role !== UserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException(
        'Only the platform owner can assign a tenant owner',
      );
    }
  }

  private ensureTenantCanBeManaged(actor: AuthenticatedUser, tenantId: string) {
    if (actor.role === UserRole.PLATFORM_OWNER) {
      return;
    }

    if (actor.role === UserRole.TENANT_ADMIN && actor.tenantId === tenantId) {
      return;
    }

    throw new ForbiddenException('You cannot manage this tenant');
  }

  private serializeBranding(
    branding: Awaited<ReturnType<BrandingService['upsertBranding']>>,
  ) {
    return {
      id: branding.id,
      tenant_id: branding.tenantId,
      logo_url: branding.logoUrl,
      icon_url: branding.iconUrl,
      favicon_url: branding.faviconUrl,
      app_name: branding.appName,
      primary_color: branding.primaryColor,
      secondary_color: branding.secondaryColor,
      accent_color: branding.accentColor,
      background_color: branding.backgroundColor,
      surface_color: branding.surfaceColor,
      text_primary_color: branding.textPrimaryColor,
      text_secondary_color: branding.textSecondaryColor,
      background_image_url: branding.backgroundImageUrl,
      font_family: branding.fontFamily,
      heading_font_family: branding.headingFontFamily,
      button_radius: branding.buttonRadius,
      button_style: branding.buttonStyle,
      theme_mode: branding.themeMode,
      border_radius_json: branding.borderRadiusJson ?? {},
      contact_details_json: branding.contactDetailsJson ?? {},
      social_links_json: branding.socialLinksJson ?? {},
      map_links_json: branding.mapLinksJson ?? {},
      legal_links_json: branding.legalLinksJson ?? {},
      splash_screen_json: branding.splashScreenJson ?? {},
      onboarding_json: branding.onboardingJson ?? {},
      store_listing_json: branding.storeListingJson ?? {},
      email_branding_json: branding.emailBrandingJson ?? {},
      telegram_branding_json: branding.telegramBrandingJson ?? {},
      theme_json: branding.themeJson ?? {},
      created_at: branding.createdAt,
      updated_at: branding.updatedAt,
    };
  }

  private assertTenantUpdateFieldsAllowed(
    dto: UpdateTenantDto,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role === UserRole.PLATFORM_OWNER) {
      return;
    }

    const protectedFields: Array<keyof UpdateTenantDto> = [
      'status',
      'planId',
      'calendarSource',
      'trialEndsAt',
      'currentPeriodStart',
      'currentPeriodEnd',
      'billingMethodId',
    ];
    const attemptedField = protectedFields.find(
      (field) => dto[field] !== undefined,
    );

    if (attemptedField) {
      throw new ForbiddenException(
        `Only the platform billing flow can update ${attemptedField}`,
      );
    }
  }

  private assertCrmUpdateFieldsAllowed(
    dto: CreateCrmIntegrationDto | UpdateCrmIntegrationDto,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role !== UserRole.PLATFORM_OWNER) {
      if (dto.baseUrl !== undefined) {
        throw new ForbiddenException(
          'Only the platform owner can override the CRM base URL',
        );
      }
      if (dto.status !== undefined) {
        throw new ForbiddenException(
          'CRM status is controlled by connection verification',
        );
      }
    }
  }
}
