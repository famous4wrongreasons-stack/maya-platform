import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CalendarSource,
  CrmProvider,
  TenantStatus,
} from '../common/domain.enums';
import {
  featureKeysFromFlags,
  normalizeFeatureFlags,
} from '../common/feature-catalog';
import {
  DEFAULT_INDUSTRY_PRESET_ID,
  getIndustryPreset,
} from '../common/industry-presets';
import { asJson } from '../common/json.util';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

type PublicContentPair = [string, string];

type PublicMobileContent = {
  hero_tag: string | null;
  hero_title: string[];
  stats: PublicContentPair[];
  about: string[];
  ratings: PublicContentPair[];
  socials: string[];
};

type PublicBookingMode = 'preview' | 'live';

type BookingModeEvaluation = {
  requestedMode: PublicBookingMode;
  effectiveMode: PublicBookingMode;
  liveEligible: boolean;
  blockers: string[];
};

type InternalCalendarCounts = {
  internalServices?: number;
  internalProviders?: number;
  availabilityRules?: number;
};

const DEFAULT_TRIAL_PERIOD_DAYS = 14;
const PAST_DUE_GRACE_DAYS = 5;
const TENANT_STATUS_TRIAL = 'trial';
const TENANT_STATUS_PAST_DUE = 'past_due';

function isInternalCalendarReady(
  counts: InternalCalendarCounts | null | undefined,
): boolean {
  return (counts?.internalProviders ?? 0) > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asStringList(value: unknown, maxItems?: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => item !== null);

  return typeof maxItems === 'number' ? items.slice(0, maxItems) : items;
}

function asPairList(value: unknown): PublicContentPair[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!Array.isArray(item) || item.length < 2) {
      return [];
    }

    const left = asNonEmptyString(item[0]);
    const right = asNonEmptyString(item[1]);

    return left && right ? [[left, right] satisfies PublicContentPair] : [];
  });
}

function extractPublicMobileContent(
  theme: Record<string, unknown>,
): PublicMobileContent | null {
  const content = asRecord(theme.content);

  if (!content) {
    return null;
  }

  const normalized: PublicMobileContent = {
    hero_tag: asNonEmptyString(content.hero_tag),
    hero_title: asStringList(content.hero_title, 3),
    stats: asPairList(content.stats),
    about: asStringList(content.about),
    ratings: asPairList(content.ratings),
    socials: asStringList(content.socials),
  };

  const hasContent =
    normalized.hero_tag !== null ||
    normalized.hero_title.length > 0 ||
    normalized.stats.length > 0 ||
    normalized.about.length > 0 ||
    normalized.ratings.length > 0 ||
    normalized.socials.length > 0;

  return hasContent ? normalized : null;
}

function resolveRequestedBookingMode(
  theme: Record<string, unknown>,
): PublicBookingMode {
  const booking = asRecord(theme.booking);
  const saas = asRecord(theme.saas);
  const saasBooking = saas ? asRecord(saas.booking) : null;
  const rawMode =
    asNonEmptyString(booking?.mode) ??
    asNonEmptyString(saasBooking?.mode) ??
    asNonEmptyString(saas?.booking_mode);

  return rawMode === 'live' ? 'live' : 'preview';
}

function withBookingModeTheme(
  theme: Record<string, unknown> | null,
  bookingMode: PublicBookingMode,
): Record<string, unknown> {
  const nextTheme = { ...(theme ?? {}) };
  const booking = asRecord(nextTheme.booking);

  nextTheme.booking = {
    ...(booking ?? {}),
    mode: bookingMode,
  };

  return nextTheme;
}

function evaluateBookingMode(params: {
  requestedMode: PublicBookingMode;
  tenantStatus: string;
  calendarSource: string;
  internalCalendarReady: boolean;
  crmStatus?: string | null;
  crmProvider?: string | null;
  bookingFeatureEnabled: boolean;
}): BookingModeEvaluation {
  const blockers: string[] = [];
  const tenantCanGoLive = new Set<string>([
    TenantStatus.ACTIVE,
    TenantStatus.PAST_DUE,
  ]).has(params.tenantStatus);
  const crmConnected = params.crmStatus === 'active';
  const realCrmConnected =
    crmConnected &&
    params.crmProvider !== null &&
    params.crmProvider !== CrmProvider.MOCK;

  if (!tenantCanGoLive) {
    blockers.push('tenant_not_active');
  }

  if (!params.bookingFeatureEnabled) {
    blockers.push('booking_feature_disabled');
  }

  if (params.calendarSource === 'internal') {
    if (!params.internalCalendarReady) {
      blockers.push('internal_calendar_not_ready');
    }
  } else if (!crmConnected) {
    blockers.push('crm_not_active');
  } else if (!realCrmConnected) {
    blockers.push('mock_crm_only');
  }

  const calendarReady =
    params.calendarSource === 'internal'
      ? params.internalCalendarReady
      : realCrmConnected;
  const liveEligible =
    tenantCanGoLive && params.bookingFeatureEnabled && calendarReady;
  const effectiveMode: PublicBookingMode =
    params.requestedMode === 'live' && liveEligible ? 'live' : 'preview';

  return {
    requestedMode: params.requestedMode,
    effectiveMode,
    liveEligible,
    blockers,
  };
}

function normalizeOptionalDateString(value?: string): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  return new Date(normalized);
}

function normalizeBillingMethodId(value?: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function addDays(date: Date | null, days: number): Date | null {
  if (!date) {
    return null;
  }

  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly entitlementsService?: EntitlementsService,
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
            memberships: true,
            internalServices: { where: { active: true } },
            internalProviders: {
              where: {
                active: true,
                availabilityRules: { some: { active: true } },
                services: {
                  some: { active: true, service: { active: true } },
                },
              },
            },
            availabilityRules: { where: { active: true } },
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
            memberships: true,
            internalServices: { where: { active: true } },
            internalProviders: {
              where: {
                active: true,
                availabilityRules: { some: { active: true } },
                services: {
                  some: { active: true, service: { active: true } },
                },
              },
            },
            availabilityRules: { where: { active: true } },
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

    const billingDates = this.resolveBillingDates({
      status: dto.status ?? TenantStatus.TRIAL,
      trialEndsAt: normalizeOptionalDateString(dto.trialEndsAt),
      currentPeriodStart: normalizeOptionalDateString(dto.currentPeriodStart),
      currentPeriodEnd: normalizeOptionalDateString(dto.currentPeriodEnd),
    });
    const billingMethodId = normalizeBillingMethodId(dto.billingMethodId);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const normalizedBranchName = asNonEmptyString(dto.branchName) ?? dto.name;
      const normalizedBranchTimezone =
        asNonEmptyString(dto.branchTimezone) ?? 'Europe/Moscow';
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          status: dto.status ?? TenantStatus.TRIAL,
          planId: dto.planId,
          industryPresetId: dto.industryPresetId ?? DEFAULT_INDUSTRY_PRESET_ID,
          calendarSource: dto.calendarSource ?? CalendarSource.EXTERNAL,
          defaultCurrency: dto.defaultCurrency ?? 'RUB',
          defaultTimezone: dto.defaultTimezone ?? normalizedBranchTimezone,
          defaultLocale: dto.defaultLocale ?? 'ru-RU',
          customDomain: dto.customDomain?.toLowerCase(),
          subdomain: (dto.subdomain ?? dto.slug).toLowerCase(),
          trialEndsAt: billingDates.trialEndsAt,
          currentPeriodStart: billingDates.currentPeriodStart,
          currentPeriodEnd: billingDates.currentPeriodEnd,
          billingMethodId,
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

      await tx.branch.create({
        data: {
          tenantId: created.id,
          name: normalizedBranchName,
          address: asNonEmptyString(dto.branchAddress),
          phone: asNonEmptyString(dto.branchPhone),
          timezone: normalizedBranchTimezone,
        },
      });

      return created;
    });

    return this.serializeTenant(await this.getTenantByIdOrThrow(tenant.id));
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    const existingTenant = await this.getTenantByIdOrThrow(id);
    const existingThemeJson =
      (existingTenant.brandingSettings?.themeJson as Record<
        string,
        unknown
      > | null) ?? null;

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

    const billingDates = this.resolveBillingDates({
      status: dto.status ?? existingTenant.status,
      trialEndsAt: normalizeOptionalDateString(dto.trialEndsAt),
      currentPeriodStart: normalizeOptionalDateString(dto.currentPeriodStart),
      currentPeriodEnd: normalizeOptionalDateString(dto.currentPeriodEnd),
      existingTrialEndsAt: existingTenant.trialEndsAt,
      existingCurrentPeriodStart: existingTenant.currentPeriodStart,
      existingCurrentPeriodEnd: existingTenant.currentPeriodEnd,
    });
    const billingMethodId = normalizeBillingMethodId(dto.billingMethodId);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug?.toLowerCase(),
          status: dto.status,
          planId: dto.planId,
          industryPresetId: dto.industryPresetId,
          calendarSource: dto.calendarSource,
          defaultCurrency: dto.defaultCurrency,
          defaultTimezone: dto.defaultTimezone,
          defaultLocale: dto.defaultLocale,
          customDomain: dto.customDomain?.toLowerCase(),
          subdomain: dto.subdomain?.toLowerCase(),
          trialEndsAt: billingDates.trialEndsAt,
          currentPeriodStart: billingDates.currentPeriodStart,
          currentPeriodEnd: billingDates.currentPeriodEnd,
          billingMethodId,
          allowSelfRegistration: dto.allowSelfRegistration,
        },
      });

      if (dto.bookingMode) {
        await tx.brandingSettings.upsert({
          where: { tenantId: id },
          create: {
            tenantId: id,
            appName:
              existingTenant.brandingSettings?.appName ?? dto.name ?? null,
            logoUrl: existingTenant.brandingSettings?.logoUrl ?? null,
            primaryColor: existingTenant.brandingSettings?.primaryColor ?? null,
            secondaryColor:
              existingTenant.brandingSettings?.secondaryColor ?? null,
            backgroundImageUrl:
              existingTenant.brandingSettings?.backgroundImageUrl ?? null,
            fontFamily: existingTenant.brandingSettings?.fontFamily ?? null,
            buttonRadius: existingTenant.brandingSettings?.buttonRadius ?? null,
            themeJson: asJson(
              withBookingModeTheme(existingThemeJson, dto.bookingMode),
            ),
          },
          update: {
            themeJson: asJson(
              withBookingModeTheme(existingThemeJson, dto.bookingMode),
            ),
          },
        });
      }
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

  async assertLiveBookingEnabled(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        status: true,
        calendarSource: true,
        plan: {
          select: {
            featuresJson: true,
          },
        },
        brandingSettings: {
          select: {
            themeJson: true,
          },
        },
        crmIntegration: {
          select: {
            provider: true,
            status: true,
          },
        },
        _count: {
          select: {
            internalServices: { where: { active: true } },
            internalProviders: {
              where: {
                active: true,
                availabilityRules: { some: { active: true } },
                services: {
                  some: { active: true, service: { active: true } },
                },
              },
            },
            availabilityRules: { where: { active: true } },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const theme =
      (tenant.brandingSettings?.themeJson as Record<string, unknown> | null) ??
      {};
    const resolvedEntitlements = this.entitlementsService
      ? await this.entitlementsService.getEffectiveEntitlements(id)
      : null;
    const features = resolvedEntitlements?.features
      ? resolvedEntitlements.features
      : normalizeFeatureFlags(tenant.plan?.featuresJson);
    const featureKeys = resolvedEntitlements?.featureKeys
      ? resolvedEntitlements.featureKeys
      : featureKeysFromFlags(features);
    const evaluation = evaluateBookingMode({
      requestedMode: resolveRequestedBookingMode(theme),
      tenantStatus: tenant.status,
      calendarSource: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      internalCalendarReady: isInternalCalendarReady(tenant._count),
      crmStatus: tenant.crmIntegration?.status ?? null,
      crmProvider: tenant.crmIntegration?.provider ?? null,
      bookingFeatureEnabled:
        featureKeys.length === 0 || features.booking === true,
    });

    if (evaluation.effectiveMode !== 'live') {
      throw new ForbiddenException({
        message: 'Live booking is not enabled for this tenant.',
        error: {
          code: 'live_booking_disabled',
          message: 'Live booking is not enabled for this tenant.',
          mode: evaluation.effectiveMode,
        },
      });
    }

    return evaluation;
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
        _count: {
          select: {
            internalServices: { where: { active: true } },
            internalProviders: {
              where: {
                active: true,
                availabilityRules: { some: { active: true } },
                services: {
                  some: { active: true, service: { active: true } },
                },
              },
            },
            availabilityRules: { where: { active: true } },
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
    const content = extractPublicMobileContent(theme);
    const industryPreset = getIndustryPreset(tenant.industryPresetId);
    const activeStatuses = new Set(['trial', 'active', 'past_due']);
    const resolvedEntitlements = this.entitlementsService
      ? await this.entitlementsService.getEffectiveEntitlements(tenant.id)
      : null;
    const availableFeatures = resolvedEntitlements?.features
      ? resolvedEntitlements.features
      : normalizeFeatureFlags(tenant.plan?.featuresJson);
    const availableFeatureKeys = resolvedEntitlements?.featureKeys
      ? resolvedEntitlements.featureKeys
      : featureKeysFromFlags(availableFeatures);
    const bookingFeatureEnabled =
      availableFeatureKeys.length === 0 || availableFeatures.booking === true;
    const clientRegistrationEnabled =
      tenant.allowSelfRegistration &&
      new Set<string>([TenantStatus.ACTIVE, TenantStatus.PAST_DUE]).has(
        tenant.status,
      );
    const bookingEvaluation = evaluateBookingMode({
      requestedMode: resolveRequestedBookingMode(theme),
      tenantStatus: tenant.status,
      calendarSource: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      internalCalendarReady: isInternalCalendarReady(tenant._count),
      crmStatus: tenant.crmIntegration?.status ?? null,
      crmProvider: tenant.crmIntegration?.provider ?? null,
      bookingFeatureEnabled,
    });
    const brand = {
      name: tenant.brandingSettings?.appName ?? tenant.name,
      logo_url: tenant.brandingSettings?.logoUrl ?? null,
      icon_url: tenant.brandingSettings?.iconUrl ?? null,
      favicon_url: tenant.brandingSettings?.faviconUrl ?? null,
      accent_color:
        tenant.brandingSettings?.accentColor ??
        tenant.brandingSettings?.primaryColor ??
        null,
      primary_color: tenant.brandingSettings?.primaryColor ?? null,
      secondary_color: tenant.brandingSettings?.secondaryColor ?? null,
      background_color: tenant.brandingSettings?.backgroundColor ?? null,
      surface_color: tenant.brandingSettings?.surfaceColor ?? null,
      text_primary_color: tenant.brandingSettings?.textPrimaryColor ?? null,
      text_secondary_color: tenant.brandingSettings?.textSecondaryColor ?? null,
      background_image_url: tenant.brandingSettings?.backgroundImageUrl ?? null,
      font_family: tenant.brandingSettings?.fontFamily ?? null,
      heading_font_family: tenant.brandingSettings?.headingFontFamily ?? null,
      city: asNonEmptyString(theme.city),
      address: firstBranch?.address ?? asNonEmptyString(theme.address),
      phone: firstBranch?.phone ?? asNonEmptyString(theme.phone),
      hours: asNonEmptyString(theme.hours),
      tagline: asNonEmptyString(theme.tagline),
    };

    return {
      slug: tenant.slug,
      active: activeStatuses.has(tenant.status),
      tenant_status: tenant.status,
      allow_self_registration: tenant.allowSelfRegistration,
      client_registration_enabled: clientRegistrationEnabled,
      booking_mode: bookingEvaluation.effectiveMode,
      booking_live_enabled: bookingEvaluation.effectiveMode === 'live',
      calendar_source: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      industry_preset: industryPreset,
      brand,
      content,
      tenant: {
        slug: tenant.slug,
        status: tenant.status,
        industry_preset_id: industryPreset.id,
        calendar_source: tenant.calendarSource ?? CalendarSource.EXTERNAL,
        default_currency: tenant.defaultCurrency,
        default_timezone: tenant.defaultTimezone,
        default_locale: tenant.defaultLocale,
      },
      branding: {
        app_name: brand.name,
        logo_url: brand.logo_url,
        icon_url: brand.icon_url,
        favicon_url: brand.favicon_url,
        primary_color: brand.primary_color,
        accent_color: brand.accent_color,
        secondary_color: brand.secondary_color,
        background_color: brand.background_color,
        surface_color: brand.surface_color,
        text_primary_color: brand.text_primary_color,
        text_secondary_color: brand.text_secondary_color,
        background_image_url: brand.background_image_url,
        font_family: brand.font_family,
        heading_font_family: brand.heading_font_family,
        button_radius: tenant.brandingSettings?.buttonRadius ?? null,
        button_style: tenant.brandingSettings?.buttonStyle ?? null,
        theme_mode: tenant.brandingSettings?.themeMode ?? 'system',
        border_radius: tenant.brandingSettings?.borderRadiusJson ?? {},
        contact_details: tenant.brandingSettings?.contactDetailsJson ?? {},
        social_links: tenant.brandingSettings?.socialLinksJson ?? {},
        map_links: tenant.brandingSettings?.mapLinksJson ?? {},
        legal_links: tenant.brandingSettings?.legalLinksJson ?? {},
        splash_screen: tenant.brandingSettings?.splashScreenJson ?? {},
        onboarding_content: tenant.brandingSettings?.onboardingJson ?? {},
        store_listing_content: tenant.brandingSettings?.storeListingJson ?? {},
        email_branding: tenant.brandingSettings?.emailBrandingJson ?? {},
        telegram_branding: tenant.brandingSettings?.telegramBrandingJson ?? {},
        city: brand.city,
        address: brand.address,
        phone: brand.phone,
        hours: brand.hours,
        tagline: brand.tagline,
        theme_json: theme,
      },
      available_features: availableFeatures,
      available_feature_keys: availableFeatureKeys,
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
    const industryPreset = getIndustryPreset(tenant.industryPresetId);

    return {
      ...this.serializeTenantBookingState(tenant),
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan_id: tenant.planId,
      industry_preset_id: industryPreset.id,
      industry_preset: industryPreset,
      calendar_source: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      default_currency: tenant.defaultCurrency,
      default_timezone: tenant.defaultTimezone,
      default_locale: tenant.defaultLocale,
      custom_domain: tenant.customDomain,
      subdomain: tenant.subdomain,
      allow_self_registration: tenant.allowSelfRegistration,
      created_at: tenant.createdAt,
      updated_at: tenant.updatedAt,
      billing: this.serializeTenantBillingState(tenant),
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
            icon_url: tenant.brandingSettings.iconUrl,
            favicon_url: tenant.brandingSettings.faviconUrl,
            app_name: tenant.brandingSettings.appName,
            primary_color: tenant.brandingSettings.primaryColor,
            secondary_color: tenant.brandingSettings.secondaryColor,
            accent_color: tenant.brandingSettings.accentColor,
            background_color: tenant.brandingSettings.backgroundColor,
            surface_color: tenant.brandingSettings.surfaceColor,
            text_primary_color: tenant.brandingSettings.textPrimaryColor,
            text_secondary_color: tenant.brandingSettings.textSecondaryColor,
            background_image_url: tenant.brandingSettings.backgroundImageUrl,
            font_family: tenant.brandingSettings.fontFamily,
            heading_font_family: tenant.brandingSettings.headingFontFamily,
            button_radius: tenant.brandingSettings.buttonRadius,
            button_style: tenant.brandingSettings.buttonStyle,
            theme_mode: tenant.brandingSettings.themeMode,
            border_radius_json: tenant.brandingSettings.borderRadiusJson ?? {},
            contact_details_json:
              tenant.brandingSettings.contactDetailsJson ?? {},
            social_links_json: tenant.brandingSettings.socialLinksJson ?? {},
            map_links_json: tenant.brandingSettings.mapLinksJson ?? {},
            legal_links_json: tenant.brandingSettings.legalLinksJson ?? {},
            splash_screen_json: tenant.brandingSettings.splashScreenJson ?? {},
            onboarding_json: tenant.brandingSettings.onboardingJson ?? {},
            store_listing_json: tenant.brandingSettings.storeListingJson ?? {},
            email_branding_json:
              tenant.brandingSettings.emailBrandingJson ?? {},
            telegram_branding_json:
              tenant.brandingSettings.telegramBrandingJson ?? {},
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
      membership_count: tenant._count.memberships,
      branches: tenant.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        timezone: branch.timezone,
      })),
    };
  }

  private serializeTenantBookingState(
    tenant: Awaited<ReturnType<TenantsService['getTenantByIdOrThrow']>>,
  ) {
    const theme =
      (tenant.brandingSettings?.themeJson as Record<string, unknown> | null) ??
      {};
    const features = normalizeFeatureFlags(tenant.plan?.featuresJson);
    const featureKeys = featureKeysFromFlags(features);
    const bookingFeatureEnabled =
      featureKeys.length === 0 || features.booking === true;
    const evaluation = evaluateBookingMode({
      requestedMode: resolveRequestedBookingMode(theme),
      tenantStatus: tenant.status,
      calendarSource: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      internalCalendarReady: isInternalCalendarReady(tenant._count),
      crmStatus: tenant.crmIntegration?.status ?? null,
      crmProvider: tenant.crmIntegration?.provider ?? null,
      bookingFeatureEnabled,
    });

    return {
      booking_mode_requested: evaluation.requestedMode,
      booking_mode_effective: evaluation.effectiveMode,
      booking_live_enabled: evaluation.effectiveMode === 'live',
      booking_live_eligible: evaluation.liveEligible,
      booking_live_blockers: evaluation.blockers,
    };
  }

  private resolveBillingDates(params: {
    status: string;
    trialEndsAt?: Date | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    existingTrialEndsAt?: Date | null;
    existingCurrentPeriodStart?: Date | null;
    existingCurrentPeriodEnd?: Date | null;
  }) {
    const trialEndsAt =
      params.trialEndsAt !== undefined
        ? params.trialEndsAt
        : String(params.status) === TENANT_STATUS_TRIAL
          ? (params.existingTrialEndsAt ??
            addDays(new Date(), DEFAULT_TRIAL_PERIOD_DAYS))
          : (params.existingTrialEndsAt ?? null);
    const currentPeriodStart =
      params.currentPeriodStart !== undefined
        ? params.currentPeriodStart
        : (params.existingCurrentPeriodStart ?? null);
    const currentPeriodEnd =
      params.currentPeriodEnd !== undefined
        ? params.currentPeriodEnd
        : (params.existingCurrentPeriodEnd ?? null);

    if (
      currentPeriodStart &&
      currentPeriodEnd &&
      currentPeriodStart.getTime() > currentPeriodEnd.getTime()
    ) {
      throw new BadRequestException(
        'Current billing period start must be before current billing period end',
      );
    }

    if (
      String(params.status) === TENANT_STATUS_PAST_DUE &&
      !currentPeriodEnd &&
      !trialEndsAt
    ) {
      throw new BadRequestException(
        'Past-due tenants must keep either a trial end date or a paid period end date',
      );
    }

    return {
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
    };
  }

  private serializeTenantBillingState(
    tenant: Awaited<ReturnType<TenantsService['getTenantByIdOrThrow']>>,
  ) {
    const accessWindowEndsAt =
      tenant.currentPeriodEnd ?? tenant.trialEndsAt ?? null;
    const graceEndsAt =
      String(tenant.status) === TENANT_STATUS_PAST_DUE
        ? addDays(accessWindowEndsAt, PAST_DUE_GRACE_DAYS)
        : null;

    return {
      trial_ends_at: tenant.trialEndsAt,
      current_period_start: tenant.currentPeriodStart,
      current_period_end: tenant.currentPeriodEnd,
      access_window_ends_at: accessWindowEndsAt,
      grace_ends_at: graceEndsAt,
      billing_method_attached: Boolean(tenant.billingMethodId),
      billing_method_id: tenant.billingMethodId ?? null,
    };
  }
}
