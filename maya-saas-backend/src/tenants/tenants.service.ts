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
import { serializePublicCrmSettings } from '../crm/crm-provider-settings';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import {
  addDays,
  evaluateTenantAccessState,
  PAST_DUE_GRACE_DAYS,
} from './tenant-access-state';

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
const TENANT_STATUS_TRIAL = 'trial';
const TENANT_STATUS_PAST_DUE = 'past_due';
const PUBLIC_TENANT_SEARCH_LIMIT = 12;
const PUBLIC_TENANT_SEARCH_CANDIDATE_LIMIT = 100;

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

function normalizePublicSearchText(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : '';

  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

/** Platform shell (maya-os): onboarding/trial UI only — not a bookable salon. */
function isPlatformBootstrapTenant(params: {
  slug?: string | null;
  theme?: Record<string, unknown> | null;
}): boolean {
  if (String(params.slug || '').toLowerCase() === 'maya-os') {
    return true;
  }
  return params.theme?.platform_bootstrap === true;
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
  subscriptionRequired?: boolean;
  trialFullAccess?: boolean;
}): BookingModeEvaluation {
  const blockers: string[] = [];
  const tenantCanGoLive =
    !params.subscriptionRequired &&
    (new Set<string>([TenantStatus.ACTIVE, TenantStatus.PAST_DUE]).has(
      params.tenantStatus,
    ) ||
      (params.tenantStatus === 'trial' && params.trialFullAccess === true));
  const crmConnected = params.crmStatus === 'active';
  const realCrmConnected =
    crmConnected &&
    params.crmProvider !== null &&
    params.crmProvider !== CrmProvider.MOCK;

  if (params.subscriptionRequired) {
    blockers.push('subscription_required');
  } else if (!tenantCanGoLive) {
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

  /**
   * Platform shell tenants (maya-os / platform_bootstrap) are for onboarding UI
   * only — client signup and live booking must fail closed.
   */
  assertClientBookableBusiness(params: {
    slug?: string | null;
    theme?: Record<string, unknown> | null;
    brandingSettings?: { themeJson?: unknown } | null;
  }): void {
    const theme = params.theme ?? asRecord(params.brandingSettings?.themeJson);
    if (!isPlatformBootstrapTenant({ slug: params.slug, theme })) {
      return;
    }

    throw new ForbiddenException({
      message: 'This workspace is the MAYA OS platform shell, not a salon.',
      error: {
        code: 'platform_tenant_not_bookable',
        message:
          'Open a salon link to sign in as a client or create an appointment.',
      },
    });
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
            verifiedAt: true,
            lastCheckedAt: true,
            lastSyncAt: true,
            lastErrorCode: true,
            lastErrorAt: true,
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
            verifiedAt: true,
            lastCheckedAt: true,
            lastSyncAt: true,
            lastErrorCode: true,
            lastErrorAt: true,
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
    const status = dto.status ?? TenantStatus.TRIAL;
    const pastDueAt = status === TenantStatus.PAST_DUE ? new Date() : null;
    const graceEndsAt = addDays(pastDueAt, PAST_DUE_GRACE_DAYS);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const normalizedBranchName = asNonEmptyString(dto.branchName) ?? dto.name;
      const normalizedBranchTimezone =
        asNonEmptyString(dto.branchTimezone) ?? 'Europe/Moscow';
      const created = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug.toLowerCase(),
          status,
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
          pastDueAt,
          graceEndsAt,
          billingMethodId,
          trialFullAccess: dto.trialFullAccess ?? false,
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

  async deleteFailedTrialTenant(id: string) {
    return this.prisma.tenant.deleteMany({
      where: {
        id,
        status: TenantStatus.TRIAL,
        currentPeriodStart: null,
      },
    });
  }

  /**
   * Имена, которые не может занять ни один салон.
   *
   * 🔴 Резолвер определяет тенанта по домену. Салон, забравший себе
   * платформенное имя, увёл бы к себе адресацию всей платформы, а чужие
   * салоны получили бы отказ. Проверка действует и для платформы тоже —
   * от опечатки она защищает так же, как от умысла.
   */
  private static readonly RESERVED_HOST_NAMES = new Set<string>([
    'www',
    'api',
    'app',
    'admin',
    'auth',
    'login',
    'billing',
    'pay',
    'static',
    'assets',
    'cdn',
    'mail',
    'smtp',
    'ftp',
    'ns',
    'ns1',
    'ns2',
    'maya',
    'maya-os',
    'mayaos',
    'platform',
    'system',
    'support',
    'help',
    'status',
    'docs',
    'blog',
    'test',
    'staging',
    'dev',
    'local',
  ]);

  private assertHostNamesAllowed(dto: {
    subdomain?: string | null;
    customDomain?: string | null;
    slug?: string | null;
  }): void {
    const candidates = [dto.subdomain, dto.slug]
      .map((v) =>
        String(v ?? '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    for (const value of candidates) {
      if (TenantsService.RESERVED_HOST_NAMES.has(value)) {
        throw new BadRequestException({
          message: `Имя «${value}» зарезервировано платформой. Выберите другое.`,
          error: { code: 'tenant_host_name_reserved', value },
        });
      }
    }

    const domain = String(dto.customDomain ?? '')
      .trim()
      .toLowerCase();

    if (!domain) {
      return;
    }

    const platformDomain = String(process.env.PLATFORM_BASE_DOMAIN ?? '')
      .trim()
      .toLowerCase();

    // Сам платформенный домен и всё, что под ним, салону не отдаём.
    if (
      platformDomain &&
      (domain === platformDomain || domain.endsWith(`.${platformDomain}`))
    ) {
      throw new BadRequestException({
        message: 'Этот домен принадлежит платформе и не может быть занят.',
        error: { code: 'tenant_domain_reserved', value: domain },
      });
    }
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    this.assertHostNamesAllowed(dto);
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
    const nextStatus = dto.status ?? existingTenant.status;
    const enteringPastDue =
      nextStatus === TENANT_STATUS_PAST_DUE &&
      existingTenant.status !== TENANT_STATUS_PAST_DUE;
    const pastDueAt =
      nextStatus === TENANT_STATUS_PAST_DUE
        ? enteringPastDue
          ? new Date()
          : (existingTenant.pastDueAt ?? new Date())
        : null;
    const graceEndsAt =
      nextStatus === TENANT_STATUS_PAST_DUE
        ? enteringPastDue
          ? addDays(pastDueAt, PAST_DUE_GRACE_DAYS)
          : (existingTenant.graceEndsAt ??
            addDays(pastDueAt, PAST_DUE_GRACE_DAYS))
        : null;

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
          pastDueAt,
          graceEndsAt,
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
    const tenant = await this.getTenantByIdOrThrow(id);
    const enteringPastDue =
      status === TenantStatus.PAST_DUE &&
      tenant.status !== TENANT_STATUS_PAST_DUE;
    const pastDueAt =
      status === TenantStatus.PAST_DUE
        ? enteringPastDue
          ? new Date()
          : (tenant.pastDueAt ?? new Date())
        : null;
    const graceEndsAt =
      status === TenantStatus.PAST_DUE
        ? enteringPastDue
          ? addDays(pastDueAt, PAST_DUE_GRACE_DAYS)
          : (tenant.graceEndsAt ?? addDays(pastDueAt, PAST_DUE_GRACE_DAYS))
        : null;
    await this.prisma.tenant.update({
      where: { id },
      data: { status, pastDueAt, graceEndsAt },
    });

    return this.serializeTenant(await this.getTenantByIdOrThrow(id));
  }

  async assertLiveBookingEnabled(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        slug: true,
        status: true,
        trialEndsAt: true,
        trialFullAccess: true,
        currentPeriodEnd: true,
        pastDueAt: true,
        graceEndsAt: true,
        updatedAt: true,
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
    this.assertClientBookableBusiness({ slug: tenant.slug, theme });
    const resolvedEntitlements = this.entitlementsService
      ? await this.entitlementsService.getEffectiveEntitlements(id)
      : null;
    const features = resolvedEntitlements?.features
      ? resolvedEntitlements.features
      : normalizeFeatureFlags(tenant.plan?.featuresJson);
    const featureKeys = resolvedEntitlements?.featureKeys
      ? resolvedEntitlements.featureKeys
      : featureKeysFromFlags(features);
    const access = evaluateTenantAccessState(tenant);
    const evaluation = evaluateBookingMode({
      requestedMode: resolveRequestedBookingMode(theme),
      tenantStatus: access.tenantStatus,
      calendarSource: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      internalCalendarReady: isInternalCalendarReady(tenant._count),
      crmStatus: tenant.crmIntegration?.status ?? null,
      crmProvider: tenant.crmIntegration?.provider ?? null,
      bookingFeatureEnabled:
        featureKeys.length === 0 || features.booking === true,
      subscriptionRequired: access.subscriptionRequired,
      trialFullAccess: access.trialFullAccess,
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

    const access = evaluateTenantAccessState(tenant);
    const shouldPersistWindow =
      access.tenantStatus === TENANT_STATUS_PAST_DUE &&
      Boolean(access.pastDueAt && access.graceEndsAt) &&
      (!tenant.pastDueAt || !tenant.graceEndsAt);
    if (
      access.shouldMarkPastDue ||
      shouldPersistWindow ||
      (access.subscriptionRequired && tenant.trialFullAccess)
    ) {
      await this.prisma.tenant.updateMany({
        where: {
          id: tenant.id,
          status: tenant.status,
          updatedAt: tenant.updatedAt,
        },
        data: {
          status: TenantStatus.PAST_DUE,
          trialFullAccess: false,
          pastDueAt: access.pastDueAt,
          graceEndsAt: access.graceEndsAt,
        },
      });
    }

    const firstBranch = tenant.branches[0] ?? null;
    const theme =
      (tenant.brandingSettings?.themeJson as Record<string, unknown> | null) ??
      {};
    const content = extractPublicMobileContent(theme);
    const industryPreset = getIndustryPreset(tenant.industryPresetId);
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
      !isPlatformBootstrapTenant({ slug: tenant.slug, theme }) &&
      tenant.allowSelfRegistration &&
      !access.subscriptionRequired &&
      (new Set<string>([TenantStatus.ACTIVE, TenantStatus.PAST_DUE]).has(
        access.tenantStatus,
      ) ||
        (access.tenantStatus === 'trial' && access.trialFullAccess));
    const bookingEvaluation = evaluateBookingMode({
      requestedMode: resolveRequestedBookingMode(theme),
      tenantStatus: access.tenantStatus,
      calendarSource: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      internalCalendarReady: isInternalCalendarReady(tenant._count),
      crmStatus: tenant.crmIntegration?.status ?? null,
      crmProvider: tenant.crmIntegration?.provider ?? null,
      bookingFeatureEnabled,
      subscriptionRequired: access.subscriptionRequired,
      trialFullAccess: access.trialFullAccess,
    });
    const guestAccessReady =
      !isPlatformBootstrapTenant({ slug: tenant.slug, theme }) &&
      clientRegistrationEnabled &&
      bookingEvaluation.liveEligible;
    const guestAccessBlockers = [
      ...bookingEvaluation.blockers,
      ...(clientRegistrationEnabled ? [] : ['client_registration_disabled']),
      ...(isPlatformBootstrapTenant({ slug: tenant.slug, theme })
        ? ['platform_bootstrap']
        : []),
    ].filter((blocker, index, blockers) => blockers.indexOf(blocker) === index);
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
      platform_bootstrap: theme.platform_bootstrap === true,
      active: !new Set(['subscription_required', 'disabled']).has(
        access.accessState,
      ),
      tenant_status: access.tenantStatus,
      access_state: access.accessState,
      subscription_required: access.subscriptionRequired,
      trial_full_access: access.trialFullAccess,
      trial: {
        ends_at: access.trialEndsAt,
        days_remaining: access.daysRemaining,
        full_access: access.trialFullAccess,
      },
      subscription_cta: access.subscriptionRequired
        ? {
            title: 'Пробный период завершен',
            message: 'Выберите подписку, чтобы снова открыть функции MAYA OS.',
            plans_path: '/api/billing/plans',
            checkout_path: `/api/admin/tenants/${tenant.id}/billing/checkout`,
          }
        : null,
      allow_self_registration: tenant.allowSelfRegistration,
      client_registration_enabled: clientRegistrationEnabled,
      guest_access_ready: guestAccessReady,
      guest_access_blockers: guestAccessBlockers,
      booking_mode: bookingEvaluation.effectiveMode,
      booking_live_enabled: bookingEvaluation.effectiveMode === 'live',
      calendar_source: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      industry_preset: industryPreset,
      brand,
      content,
      tenant: {
        slug: tenant.slug,
        status: access.tenantStatus,
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

  async searchPublicMobileConfigs(rawQuery: string, rawCity?: string) {
    const query = normalizePublicSearchText(rawQuery);
    const city = normalizePublicSearchText(rawCity);

    if (query.length < 2 || query.length > 80 || city.length > 80) {
      throw new BadRequestException({
        message: 'Enter at least two characters to find a business.',
        error: {
          code: 'public_business_search_invalid',
          message: 'Enter at least two characters to find a business.',
        },
      });
    }

    const queryTokens = query.split(' ').filter(Boolean).slice(0, 8);
    const cityTokens = city.split(' ').filter(Boolean).slice(0, 4);
    const candidates = await this.prisma.tenant.findMany({
      where: {
        status: {
          in: [TenantStatus.ACTIVE, TenantStatus.TRIAL, TenantStatus.PAST_DUE],
        },
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      take: PUBLIC_TENANT_SEARCH_CANDIDATE_LIMIT,
      select: {
        slug: true,
        name: true,
        brandingSettings: {
          select: {
            appName: true,
            themeJson: true,
          },
        },
        branches: {
          orderBy: { createdAt: 'asc' },
          take: 3,
          select: {
            name: true,
            address: true,
          },
        },
      },
    });

    const matchingSlugs = candidates
      .filter((tenant) => {
        const theme = asRecord(tenant.brandingSettings?.themeJson);
        const cityValue = normalizePublicSearchText(theme?.city);
        const addressValue = tenant.branches
          .map((branch) => branch.address)
          .filter(Boolean)
          .join(' ');
        const haystack = normalizePublicSearchText(
          [
            tenant.name,
            tenant.slug,
            tenant.brandingSettings?.appName,
            cityValue,
            addressValue,
            tenant.branches.map((branch) => branch.name).join(' '),
          ]
            .filter(Boolean)
            .join(' '),
        );

        return (
          queryTokens.every((token) => haystack.includes(token)) &&
          cityTokens.every((token) => haystack.includes(token))
        );
      })
      .slice(0, PUBLIC_TENANT_SEARCH_LIMIT)
      .map((tenant) => tenant.slug);

    const configs = await Promise.all(
      matchingSlugs.map((slug) => this.getPublicMobileConfig(slug)),
    );

    return configs.filter(
      (config) => config.active && config.guest_access_ready === true,
    );
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
    const access = evaluateTenantAccessState(tenant);

    return {
      ...this.serializeTenantBookingState(tenant),
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: access.tenantStatus,
      access_state: access.accessState,
      subscription_required: access.subscriptionRequired,
      trial_full_access: access.trialFullAccess,
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
            has_credentials: true,
            verified: Boolean(tenant.crmIntegration.verifiedAt),
            verified_at: tenant.crmIntegration.verifiedAt,
            last_checked_at: tenant.crmIntegration.lastCheckedAt,
            last_sync_at: tenant.crmIntegration.lastSyncAt,
            last_error_code: tenant.crmIntegration.lastErrorCode,
            last_error_at: tenant.crmIntegration.lastErrorAt,
            settings_json: serializePublicCrmSettings(
              tenant.crmIntegration.provider,
              tenant.crmIntegration.settingsJson,
            ),
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
    const access = evaluateTenantAccessState(tenant);
    const evaluation = evaluateBookingMode({
      requestedMode: resolveRequestedBookingMode(theme),
      tenantStatus: access.tenantStatus,
      calendarSource: tenant.calendarSource ?? CalendarSource.EXTERNAL,
      internalCalendarReady: isInternalCalendarReady(tenant._count),
      crmStatus: tenant.crmIntegration?.status ?? null,
      crmProvider: tenant.crmIntegration?.provider ?? null,
      bookingFeatureEnabled,
      subscriptionRequired: access.subscriptionRequired,
      trialFullAccess: access.trialFullAccess,
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
    const access = evaluateTenantAccessState(tenant);
    const accessWindowEndsAt =
      tenant.currentPeriodEnd ?? tenant.trialEndsAt ?? null;

    return {
      trial_ends_at: tenant.trialEndsAt,
      trial_days_remaining: access.daysRemaining,
      trial_full_access: access.trialFullAccess,
      access_state: access.accessState,
      subscription_required: access.subscriptionRequired,
      current_period_start: tenant.currentPeriodStart,
      current_period_end: tenant.currentPeriodEnd,
      access_window_ends_at: accessWindowEndsAt,
      past_due_at: access.pastDueAt,
      grace_ends_at: access.graceEndsAt,
      grace_days_remaining: access.graceDaysRemaining,
      billing_method_attached: Boolean(tenant.billingMethodId),
      billing_method_id: tenant.billingMethodId ?? null,
    };
  }
}
