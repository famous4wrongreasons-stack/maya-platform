import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { TenantStatus } from '../common/domain.enums';
import {
  featureKeysFromFlags,
  normalizeFeatureFlags,
} from '../common/feature-catalog';
import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getTenantBySlugOrThrow(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async getTenantByIdOrThrow(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        brandingSettings: true,
        branches: true,
        _count: {
          select: {
            users: true,
            branches: true,
          },
        },
        crmIntegration: {
          select: {
            id: true,
            provider: true,
            baseUrl: true,
            status: true,
            settingsJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        brandingSettings: true,
        branches: true,
        crmIntegration: {
          select: {
            id: true,
            provider: true,
            baseUrl: true,
            status: true,
            settingsJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: {
          select: {
            users: true,
            branches: true,
          },
        },
      },
    });

    return tenants.map((tenant) => this.serializeTenant(tenant));
  }

  async createTenant(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Tenant slug already exists');
    }

    if (dto.planId) {
      await this.subscriptionsService.getPlanByIdOrThrow(dto.planId);
    }

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          status: dto.status ?? TenantStatus.TRIAL,
          planId: dto.planId,
          allowSelfRegistration: dto.allowSelfRegistration ?? true,
        },
      });

      await tx.brandingSettings.create({
        data: {
          tenantId: created.id,
          appName: dto.name,
          themeJson: asJson({}),
        },
      });

      return created;
    });

    return this.serializeTenant(await this.getTenantByIdOrThrow(tenant.id));
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    await this.getTenantByIdOrThrow(id);

    if (dto.planId) {
      await this.subscriptionsService.getPlanByIdOrThrow(dto.planId);
    }

    if (dto.slug) {
      const existing = await this.prisma.tenant.findFirst({
        where: {
          slug: dto.slug.toLowerCase(),
          NOT: { id },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Tenant slug already exists');
      }
    }

    await this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug?.toLowerCase(),
        status: dto.status,
        planId: dto.planId,
        allowSelfRegistration: dto.allowSelfRegistration,
      },
    });

    return this.serializeTenant(await this.getTenantByIdOrThrow(id));
  }

  async setTenantStatus(id: string, status: TenantStatus) {
    await this.getTenantByIdOrThrow(id);
    await this.prisma.tenant.update({
      where: { id },
      data: { status },
    });

    return this.serializeTenant(await this.getTenantByIdOrThrow(id));
  }

  async getPublicMobileConfig(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
      include: {
        brandingSettings: true,
        branches: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        plan: true,
        crmIntegration: {
          select: {
            provider: true,
            status: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const firstBranch = tenant.branches[0] ?? null;
    const theme =
      (tenant.brandingSettings?.themeJson as Record<string, unknown> | null) ??
      {};
    const asString = (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value : null;
    const activeStatuses = new Set(['trial', 'active', 'past_due']);
    const availableFeatures = normalizeFeatureFlags(tenant.plan?.featuresJson);
    const brand = {
      name: tenant.brandingSettings?.appName ?? tenant.name,
      logo_url: tenant.brandingSettings?.logoUrl ?? null,
      accent_color: tenant.brandingSettings?.primaryColor ?? null,
      secondary_color: tenant.brandingSettings?.secondaryColor ?? null,
      background_image_url: tenant.brandingSettings?.backgroundImageUrl ?? null,
      font_family: tenant.brandingSettings?.fontFamily ?? null,
      city: asString(theme.city),
      address: firstBranch?.address ?? asString(theme.address),
      phone: firstBranch?.phone ?? asString(theme.phone),
      hours: asString(theme.hours),
      tagline: asString(theme.tagline),
    };

    return {
      slug: tenant.slug,
      active: activeStatuses.has(tenant.status),
      brand,
      tenant: {
        slug: tenant.slug,
        status: tenant.status,
      },
      branding: {
        app_name: brand.name,
        logo_url: brand.logo_url,
        primary_color: brand.accent_color,
        accent_color: brand.accent_color,
        secondary_color: brand.secondary_color,
        background_image_url: brand.background_image_url,
        font_family: brand.font_family,
        button_radius: tenant.brandingSettings?.buttonRadius ?? null,
        city: brand.city,
        address: brand.address,
        phone: brand.phone,
        hours: brand.hours,
        tagline: brand.tagline,
        theme_json: theme,
      },
      available_features: availableFeatures,
      available_feature_keys: featureKeysFromFlags(availableFeatures),
      crm: {
        provider: tenant.crmIntegration?.provider ?? null,
        status: tenant.crmIntegration?.status ?? null,
      },
    };
  }

  async assertBranchBelongsToTenant(branchId: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId,
      },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found for this tenant');
    }
  }

  serializeTenant(
    tenant: Awaited<ReturnType<TenantsService['getTenantByIdOrThrow']>>,
  ) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan_id: tenant.planId,
      allow_self_registration: tenant.allowSelfRegistration,
      created_at: tenant.createdAt,
      updated_at: tenant.updatedAt,
      plan: tenant.plan
        ? {
            id: tenant.plan.id,
            name: tenant.plan.name,
            price_monthly: tenant.plan.priceMonthly,
            max_branches: tenant.plan.maxBranches,
            max_staff: tenant.plan.maxStaff,
            features_json: normalizeFeatureFlags(tenant.plan.featuresJson),
            is_white_label_enabled: tenant.plan.isWhiteLabelEnabled,
          }
        : null,
      branding: tenant.brandingSettings
        ? {
            id: tenant.brandingSettings.id,
            logo_url: tenant.brandingSettings.logoUrl,
            app_name: tenant.brandingSettings.appName,
            primary_color: tenant.brandingSettings.primaryColor,
            secondary_color: tenant.brandingSettings.secondaryColor,
            background_image_url: tenant.brandingSettings.backgroundImageUrl,
            font_family: tenant.brandingSettings.fontFamily,
            button_radius: tenant.brandingSettings.buttonRadius,
            theme_json: tenant.brandingSettings.themeJson ?? {},
            created_at: tenant.brandingSettings.createdAt,
            updated_at: tenant.brandingSettings.updatedAt,
          }
        : null,
      crm_integration: tenant.crmIntegration
        ? {
            id: tenant.crmIntegration.id,
            provider: tenant.crmIntegration.provider,
            base_url: tenant.crmIntegration.baseUrl,
            status: tenant.crmIntegration.status,
            settings_json: tenant.crmIntegration.settingsJson ?? {},
            created_at: tenant.crmIntegration.createdAt,
            updated_at: tenant.crmIntegration.updatedAt,
          }
        : null,
      branch_count: tenant._count.branches,
      user_count: tenant._count.users,
      branches: tenant.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        timezone: branch.timezone,
      })),
    };
  }
}
