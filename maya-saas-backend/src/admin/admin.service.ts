import { ForbiddenException, Injectable } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../common/authenticated-user.interface';
import { TenantStatus, UserRole } from '../common/domain.enums';
import { BrandingService } from '../branding/branding.service';
import { UpdateBrandingDto } from '../branding/dto/update-branding.dto';
import { CrmService } from '../crm/crm.service';
import { CreateCrmIntegrationDto } from '../crm/dto/create-crm-integration.dto';
import { UpdateCrmIntegrationDto } from '../crm/dto/update-crm-integration.dto';
import { TenantsService } from '../tenants/tenants.service';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto';
import { UpdateTenantDto } from '../tenants/dto/update-tenant.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly brandingService: BrandingService,
    private readonly crmService: CrmService,
    private readonly auditLogService: AuditLogService,
  ) {}

  createTenant(dto: CreateTenantDto, actor: AuthenticatedUser) {
    return this.tenantsService.createTenant(dto).then(async (tenant) => {
      await this.auditLogService.log({
        tenantId: tenant.id,
        userId: actor.userId,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenant.id,
        metadata: {
          slug: tenant.slug,
        },
      });

      return tenant;
    });
  }

  listTenants() {
    return this.tenantsService.listTenants();
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
    const branding = await this.brandingService.upsertBranding(id, dto);

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: 'branding.updated',
      entityType: 'branding',
      entityId: branding.id,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return {
      id: branding.id,
      tenant_id: branding.tenantId,
      logo_url: branding.logoUrl,
      app_name: branding.appName,
      primary_color: branding.primaryColor,
      secondary_color: branding.secondaryColor,
      background_image_url: branding.backgroundImageUrl,
      font_family: branding.fontFamily,
      button_radius: branding.buttonRadius,
      theme_json: branding.themeJson ?? {},
      created_at: branding.createdAt,
      updated_at: branding.updatedAt,
    };
  }

  async upsertCrm(
    id: string,
    dto: CreateCrmIntegrationDto | UpdateCrmIntegrationDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureTenantCanBeManaged(actor, id);
    const integration = await this.crmService.createOrUpdateIntegration(
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

  async setTenantStatus(
    id: string,
    status: TenantStatus,
    actor: AuthenticatedUser,
  ) {
    const tenant = await this.tenantsService.setTenantStatus(id, status);

    await this.auditLogService.log({
      tenantId: id,
      userId: actor.userId,
      action: `tenant.${status}`,
      entityType: 'tenant',
      entityId: id,
      metadata: { status },
    });

    return tenant;
  }

  private ensureTenantCanBeManaged(actor: AuthenticatedUser, tenantId: string) {
    if (actor.role === UserRole.TENANT_ADMIN && actor.tenantId === tenantId) {
      return;
    }

    if (actor.role !== UserRole.PLATFORM_OWNER) {
      throw new ForbiddenException('You cannot manage this tenant');
    }
  }
}
