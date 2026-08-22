import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  ActionExecutionTerminalError,
  ActionExecutionUncertainError,
  stableActionJson,
  type ActionExecutionPreviewV1,
  type ActionFailureClassification,
  type ActionRuntimeHandlers,
  type ActionRuntimeReceipt,
  type ActionSourceType,
  type ExecutionResultV1,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CalendarSource,
  CrmIntegrationStatus,
  CrmProvider,
  UserRole,
} from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { asJson } from '../common/json.util';
import { phoneMatchKey } from '../common/phone.util';
import { EncryptionService } from '../encryption/encryption.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSalonTimezone } from '../tenants/salon-timezone';
import { ClientIdentityService } from './client-identity.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import {
  CRM_FINANCE_MAX_WINDOW_MS,
  CRM_JOURNAL_MAX_WINDOW_DAYS,
  CRM_JOURNAL_MAX_WINDOW_MS,
} from './crm-provider-limits';
import {
  CancelledAppointment,
  CRMAdapter,
  CreatedAppointment,
  AppliedStaffScheduleDayChange,
  CrmAdapterConfig,
  CrmAppointmentDetail,
  CrmAppointmentRevenueSnapshot,
  CrmCompanyProfile,
  CrmFinancialSummary,
  CrmRevenueSummary,
  CrmTeamMember,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
  StaffScheduleChangePreview,
  StaffScheduleDay,
  StaffScheduleSlot,
} from './crm-adapter.interface';
import {
  getCrmProviderCapability,
  listConnectableCrmProviders,
} from './crm-provider-catalog';
import { CreateCrmIntegrationDto } from './dto/create-crm-integration.dto';
import { ConnectCrmIntegrationDto } from './dto/connect-crm-integration.dto';
import { UpdateCrmIntegrationDto } from './dto/update-crm-integration.dto';
import { DiscoverCrmCompaniesDto } from './dto/discover-crm-companies.dto';
import { ListCrmJournalDto } from './dto/list-crm-journal.dto';
import {
  normalizeCrmProviderSettings,
  serializePublicCrmSettings,
} from './crm-provider-settings';
import type { StaffId, VisitAttendance } from '../domain';
import { asStaffId, asStaffIdOrNull } from '../domain';
import { assertWritableAttendance } from './crm-attendance';
import {
  CrmOutcomeUnknownError,
  CrmRecordGoneError,
} from './crm-request.errors';

type CrmConnectionInput = {
  provider?: CrmProvider;
  apiToken?: string;
  baseUrl?: string;
  settingsJson?: Record<string, unknown>;
};

export type AppointmentActionInvocation = {
  callerIdempotency?: {
    scope: string;
    key: string;
  };
  sourceType?: ActionSourceType;
  agentTaskId?: string;
  sourceRef?: string;
};

type CreateAppointmentInput = {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  branchId?: string;
  staffId: string;
  serviceIds: string[];
  start: string;
  notes?: string;
  creationMode: 'client' | 'admin';
  allowBusy: boolean;
  durationMinutes?: number;
  notifyBySmsHours?: number;
};

export type CreateAppointmentRequest = {
  clientId: string;
  clientName: string;
  clientPhone?: string | null;
  branchId?: string | null;
  staffId: string;
  serviceIds: string[];
  start: string;
  notes?: string | null;
  creationMode?: 'client' | 'admin';
  allowBusy?: boolean;
  durationMinutes?: number;
  notifyBySmsHours?: number;
};

export type RescheduleAppointmentRequest = {
  externalId: string;
  start: string;
  staffId?: string;
  serviceIds?: string[];
  notes?: string | null;
};

type AppointmentActionPlan<T> = {
  request: TrustedActionExecutionRequestV1;
  handlers: ActionRuntimeHandlers<T>;
};

type RescheduleAppointmentInput = {
  externalId: string;
  start: string;
  staffId?: string;
  serviceIds?: string[];
  notes?: string;
};

type AppointmentStateEvidence = {
  externalId: string;
  status: string;
  start: string;
  staffId: string;
  serviceIds: string[];
};

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Invalid durable ${label}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid durable ${label}`);
  }
  return value as string[];
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizedServiceIds(serviceIds: readonly string[]): string[] {
  return [...new Set(serviceIds)].sort();
}

function sameServiceIds(left: readonly string[], right: readonly string[]) {
  return (
    stableActionJson(normalizedServiceIds(left)) ===
    stableActionJson(normalizedServiceIds(right))
  );
}

function sameInstant(left: string, right: string): boolean {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime === rightTime
  );
}

function isCanceledStatus(status: string): boolean {
  return ['cancelled', 'canceled', 'deleted'].includes(status.toLowerCase());
}

type StoredCrmIntegration = {
  id: string;
  tenantId: string;
  provider: string;
  encryptedApiToken: string;
  baseUrl: string | null;
  status: string;
  settingsJson: unknown;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  lastSyncAt: Date | null;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrmImportPreview = {
  provider: CrmProvider;
  company_id: number | string | null;
  company: CrmCompanyProfile | null;
  services: {
    count: number;
    items: ServiceItem[];
  };
  staff: {
    count: number;
    items: StaffMember[];
  };
  team: {
    count: number;
    items: CrmTeamMember[];
  };
  warnings: string[];
};

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);
  private readonly adapterCache = new Map<
    string,
    {
      signature: string;
      expiresAt: number;
      adapter: CRMAdapter;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly adapterFactory: CrmAdapterFactory,
    private readonly tenantContext: TenantContextService,
    private readonly internalCalendarService: InternalCalendarService,
    private readonly clientIdentityService: ClientIdentityService,
    private readonly actionEngineRuntime: ActionEngineRuntimeService,
  ) {}

  async discoverCompanies(tenantId: string, dto: DiscoverCrmCompaniesDto) {
    this.tenantContext.assertTenantId(tenantId);
    return this.discoverCompaniesForCredential(dto);
  }

  async discoverCompaniesForCredential(dto: DiscoverCrmCompaniesDto) {
    this.assertProviderCanBeTenantConnected(dto.provider);

    const apiToken = dto.apiToken.trim();
    if (!apiToken) {
      throw new BadRequestException({
        message: 'CRM API token is required',
        error: { code: 'crm_token_required', provider: dto.provider },
      });
    }

    const adapter = this.adapterFactory.create(dto.provider, {
      provider: dto.provider,
      apiToken,
      settings: {},
    });

    if (!adapter.discoverCompanies) {
      throw new BadRequestException({
        message: 'CRM company discovery is not supported for this provider',
        error: {
          code: 'crm_company_discovery_not_supported',
          provider: dto.provider,
        },
      });
    }

    try {
      return {
        provider: dto.provider,
        companies: await adapter.discoverCompanies(),
      };
    } catch (error) {
      throw this.toSafeConnectionException(dto.provider, error);
    }
  }

  async previewCredentials(
    provider: CrmProvider,
    apiToken: string,
    settingsJson: Record<string, unknown>,
  ): Promise<CrmImportPreview> {
    this.assertProviderCanBeTenantConnected(provider);
    const normalizedToken = apiToken.trim();

    if (!normalizedToken) {
      throw new BadRequestException({
        message: 'CRM API token is required',
        error: { code: 'crm_token_required', provider },
      });
    }

    const settings = normalizeCrmProviderSettings(provider, settingsJson);

    try {
      return await this.loadConnectionPreview('onboarding-preview', provider, {
        provider,
        apiToken: normalizedToken,
        settings,
      });
    } catch (error) {
      throw this.toSafeConnectionException(provider, error);
    }
  }

  async createOrUpdateIntegration(
    tenantId: string,
    dto: CreateCrmIntegrationDto | UpdateCrmIntegrationDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const existing = await this.prisma.crmIntegration.findUnique({
      where: { tenantId: scopedTenantId },
    });
    const provider = (dto.provider ??
      existing?.provider ??
      CrmProvider.MOCK) as CrmProvider;
    this.assertProviderConnectable(provider);

    if (provider !== CrmProvider.MOCK) {
      return this.connectAndActivateIntegration(scopedTenantId, dto);
    }

    const providerChanged = Boolean(
      existing && String(existing.provider) !== String(provider),
    );
    const settingsJson = normalizeCrmProviderSettings(
      provider,
      dto.settingsJson ?? existing?.settingsJson,
    );

    const resolvedApiToken =
      dto.apiToken ??
      (provider === CrmProvider.MOCK && (!existing || providerChanged)
        ? 'mock'
        : undefined);
    const encryptedApiToken = resolvedApiToken
      ? this.encryptionService.encrypt(resolvedApiToken)
      : providerChanged
        ? undefined
        : existing?.encryptedApiToken;

    if (!encryptedApiToken) {
      throw new NotFoundException('CRM API token is required');
    }

    const checkedAt = new Date();
    const integration = existing
      ? await this.prisma.crmIntegration.update({
          where: { tenantId: scopedTenantId },
          data: {
            provider,
            encryptedApiToken,
            baseUrl: dto.baseUrl ?? existing.baseUrl,
            status: dto.status ?? existing.status,
            settingsJson: settingsJson ? asJson(settingsJson) : undefined,
            verifiedAt: checkedAt,
            lastCheckedAt: checkedAt,
            lastSyncAt: checkedAt,
            lastErrorCode: null,
            lastErrorAt: null,
          },
        })
      : await this.prisma.crmIntegration.create({
          data: {
            tenantId: scopedTenantId,
            provider,
            encryptedApiToken,
            baseUrl: dto.baseUrl,
            status: dto.status ?? CrmIntegrationStatus.ACTIVE,
            settingsJson: asJson(settingsJson),
            verifiedAt: checkedAt,
            lastCheckedAt: checkedAt,
            lastSyncAt: checkedAt,
          },
        });

    return this.serializeIntegration(integration);
  }

  async stageIntegration(
    tenantId: string,
    dto: ConnectCrmIntegrationDto | CrmConnectionInput,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const existing = (await this.prisma.crmIntegration.findUnique({
      where: { tenantId: scopedTenantId },
    })) as StoredCrmIntegration | null;
    const provider = (dto.provider ?? existing?.provider) as
      CrmProvider | undefined;

    if (!provider) {
      throw new BadRequestException('CRM provider is required');
    }

    this.assertProviderCanBeTenantConnected(provider);
    const providerChanged = Boolean(
      existing && existing.provider !== String(provider),
    );
    const previousSettings =
      existing && !providerChanged
        ? ((existing.settingsJson as Record<string, unknown> | null) ?? {})
        : {};
    const settings = normalizeCrmProviderSettings(provider, {
      ...previousSettings,
      ...(dto.settingsJson ?? {}),
    });
    const suppliedToken = dto.apiToken?.trim();
    const apiToken = suppliedToken
      ? suppliedToken
      : existing && !providerChanged
        ? this.encryptionService.decrypt(existing.encryptedApiToken)
        : provider === CrmProvider.MOCK
          ? 'mock'
          : null;

    if (!apiToken) {
      throw new BadRequestException({
        message: 'CRM API token is required',
        error: { code: 'crm_token_required', provider },
      });
    }

    const requestedBaseUrl = 'baseUrl' in dto ? dto.baseUrl : undefined;
    const baseUrl =
      requestedBaseUrl ??
      (existing && !providerChanged ? existing.baseUrl : null);
    const adapterConfig = {
      provider,
      apiToken,
      baseUrl,
      settings,
    };
    let preview: CrmImportPreview;

    try {
      preview = await this.loadConnectionPreview(
        scopedTenantId,
        provider,
        adapterConfig,
      );
    } catch (error) {
      throw this.toSafeConnectionException(provider, error);
    }

    const checkedAt = new Date();
    const encryptedApiToken = this.encryptionService.encrypt(apiToken);
    const integration = await this.prisma.crmIntegration.upsert({
      where: { tenantId: scopedTenantId },
      create: {
        tenantId: scopedTenantId,
        provider,
        encryptedApiToken,
        baseUrl,
        status: CrmIntegrationStatus.PENDING_ACTIVATION,
        settingsJson: asJson(settings),
        verifiedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastSyncAt: checkedAt,
      },
      update: {
        provider,
        encryptedApiToken,
        baseUrl,
        status: CrmIntegrationStatus.PENDING_ACTIVATION,
        settingsJson: asJson(settings),
        verifiedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastSyncAt: checkedAt,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });

    return {
      connection: this.serializeIntegration(integration),
      preview,
      next_action: 'activate',
    };
  }

  async connectAndActivateIntegration(
    tenantId: string,
    dto: CrmConnectionInput,
  ) {
    const staged = await this.stageIntegration(tenantId, dto);
    const connection = await this.activateVerifiedIntegration(tenantId);
    await this.syncTenantPresentationFromCrm(
      this.tenantContext.assertTenantId(tenantId),
      staged.preview.company,
    );

    return {
      ...connection,
      preview: staged.preview,
      next_action: null,
    };
  }

  async getIntegrationStatus(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const [tenant, integration] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: scopedTenantId },
        select: { calendarSource: true },
      }),
      this.prisma.crmIntegration.findUnique({
        where: { tenantId: scopedTenantId },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!integration) {
      return {
        configured: false,
        calendar_source: tenant.calendarSource,
        connection: null,
        next_action: tenant.calendarSource === 'external' ? 'connect' : null,
      };
    }

    return {
      configured: true,
      calendar_source: tenant.calendarSource,
      connection: this.serializeIntegration(integration),
      next_action: this.resolveNextAction(integration.status),
    };
  }

  /**
   * Public company profile from the active tenant CRM connection.
   *
   * This method deliberately returns only the provider public profile. Tokens,
   * adapter settings and integration records never leave CrmService.
   */
  async getCompanyProfile(tenantId: string): Promise<CrmCompanyProfile> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    if (!adapter.getCompanyProfile) {
      throw new ConflictException({
        message: 'CRM company profile is not available for this provider.',
        error: { code: 'crm_company_profile_not_supported' },
      });
    }
    const profile = await adapter.getCompanyProfile();
    if (!profile) {
      throw new ConflictException({
        message: 'CRM company profile is unavailable.',
        error: { code: 'crm_company_profile_unavailable' },
      });
    }
    return profile;
  }

  async getImportPreview(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.getStoredIntegration(scopedTenantId);
    const provider = integration.provider as CrmProvider;
    let preview: CrmImportPreview;

    try {
      preview = await this.loadConnectionPreview(
        scopedTenantId,
        provider,
        this.createAdapterConfig(integration),
      );
    } catch (error) {
      await this.recordStoredConnectionFailure(scopedTenantId, error);
      throw this.toSafeConnectionException(provider, error);
    }

    await this.reconcileCrmTeamAccess(scopedTenantId, preview.team.items);

    const checkedAt = new Date();
    const status =
      integration.status === 'active'
        ? CrmIntegrationStatus.ACTIVE
        : CrmIntegrationStatus.PENDING_ACTIVATION;
    const updated = await this.prisma.crmIntegration.update({
      where: { tenantId: scopedTenantId },
      data: {
        status,
        verifiedAt: integration.verifiedAt ?? checkedAt,
        lastCheckedAt: checkedAt,
        lastSyncAt: checkedAt,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });

    return {
      connection: this.serializeIntegration(updated),
      preview,
      next_action: this.resolveNextAction(updated.status),
    };
  }

  /**
   * Часовой пояс салона — из его же CRM.
   *
   * 🔴 Пояс тенанта задавался только при создании и оставался московским. Для
   * салона в Новосибирске или Калининграде это означало пустую сетку
   * расписания: границы дня уезжали мимо рабочих часов, и владелец видел
   * «нет записей» при полном дне. CRM — источник истины про локаль салона.
   */
  private async syncTenantTimezoneFromCrm(
    tenantId: string,
    profile: CrmCompanyProfile | null,
  ): Promise<void> {
    const timezone = profile?.timezone?.trim();

    if (!timezone) {
      return;
    }

    // Проверяем, что зона вообще существует: подсунутая ерунда сломала бы
    // форматирование дат на всех экранах разом.
    try {
      new Intl.DateTimeFormat('ru-RU', { timeZone: timezone });
    } catch {
      this.logger.warn(`CRM returned an unknown timezone: ${timezone}`);
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });

    if (tenant?.defaultTimezone === timezone) {
      return;
    }

    const previousTimezone = tenant?.defaultTimezone ?? null;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { defaultTimezone: timezone },
    });

    // 🔴 Филиалы раньше не обновлялись НИКОГДА — во всём коде нет ни одного
    // `branch.update`. Пояс присваивался один раз при создании арендатора и
    // навсегда оставался московским, а бронирование считает настенное время
    // именно поясом филиала и в этом виде отправляет его в CRM. Салон вне
    // Москвы записывал клиента не на тот час.
    //
    // Обновляем только те филиалы, которые ШЛИ ЗА арендатором: их пояс совпадал
    // с прежним значением по умолчанию либо не задан вовсе. Филиал с собственным
    // поясом — законный случай для сети в разных регионах, и синхронизация с
    // одной компанией CRM не имеет права его перетирать.
    const followers = await this.prisma.branch.updateMany({
      where: {
        tenantId,
        OR: [
          { timezone: null },
          ...(previousTimezone ? [{ timezone: previousTimezone }] : []),
        ],
      },
      data: { timezone },
    });

    this.logger.log(
      `Tenant timezone set from CRM: ${timezone} (branches updated: ${followers.count})`,
    );
  }

  private safeRemoteLogoUrl(value: string | null | undefined): string | null {
    if (!value) return null;

    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  private isTenantUploadedLogo(value: string | null | undefined): boolean {
    if (!value) return false;

    try {
      const url = new URL(value, 'https://maya.invalid');
      return url.pathname.startsWith('/api/public/uploads/tenant-logos/');
    } catch {
      return false;
    }
  }

  private async syncTenantBrandingFromCrm(
    tenantId: string,
    profile: CrmCompanyProfile | null,
  ): Promise<void> {
    const logoUrl = this.safeRemoteLogoUrl(profile?.logo_url);
    if (!logoUrl) return;

    const current = await this.prisma.brandingSettings.findUnique({
      where: { tenantId },
      select: { logoUrl: true },
    });

    // A logo uploaded explicitly in MAYA always wins over the CRM copy.
    if (this.isTenantUploadedLogo(current?.logoUrl)) return;

    await this.prisma.brandingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        appName: profile?.title?.trim() || undefined,
        logoUrl,
      },
      update: { logoUrl },
    });
  }

  private async loadCompanyProfileForRefresh(
    adapter: CRMAdapter,
    tenantId: string,
  ): Promise<CrmCompanyProfile | null> {
    if (!adapter.getCompanyProfile) return null;

    try {
      return await adapter.getCompanyProfile();
    } catch (error) {
      this.logger.warn(
        `CRM company profile refresh deferred tenant=${tenantId}: ${this.safeErrorCode(error)}`,
      );
      return null;
    }
  }

  private async syncTenantPresentationFromCrm(
    tenantId: string,
    profile: CrmCompanyProfile | null,
  ): Promise<void> {
    if (!profile) return;

    try {
      await Promise.all([
        this.syncTenantTimezoneFromCrm(tenantId, profile),
        this.syncTenantBrandingFromCrm(tenantId, profile),
      ]);
    } catch (error) {
      // Presentation refresh must never invalidate an otherwise healthy CRM.
      this.logger.warn(
        `CRM tenant presentation refresh deferred tenant=${tenantId}: ${this.safeErrorCode(error)}`,
      );
    }
  }

  async activateIntegration(tenantId: string) {
    const preview = await this.getImportPreview(tenantId);
    const connection = await this.activateVerifiedIntegration(tenantId);
    await this.syncTenantPresentationFromCrm(
      this.tenantContext.assertTenantId(tenantId),
      preview.preview.company,
    );

    return {
      connection,
      preview: preview.preview,
      next_action: null,
    };
  }

  async recheckIntegration(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.getStoredIntegration(scopedTenantId);
    const provider = integration.provider as CrmProvider;
    try {
      const adapter = this.adapterFactory.create(
        provider,
        this.createAdapterConfig(integration),
      );
      const result = await adapter.testConnection(scopedTenantId);
      if (!result.ok) {
        throw new Error('CRM connection check failed');
      }
      const [team, company] = await Promise.all([
        this.loadTeamMembers(adapter, scopedTenantId),
        this.loadCompanyProfileForRefresh(adapter, scopedTenantId),
      ]);
      await this.reconcileCrmTeamAccess(scopedTenantId, team);
      await this.syncTenantPresentationFromCrm(scopedTenantId, company);

      const checkedAt = new Date();
      const status =
        integration.status === 'active'
          ? CrmIntegrationStatus.ACTIVE
          : CrmIntegrationStatus.PENDING_ACTIVATION;
      const updated = await this.prisma.crmIntegration.update({
        where: { tenantId: scopedTenantId },
        data: {
          status,
          verifiedAt: integration.verifiedAt ?? checkedAt,
          lastCheckedAt: checkedAt,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });

      return {
        ok: true,
        provider,
        message: 'CRM connection is valid',
        connection: this.serializeIntegration(updated),
        next_action: this.resolveNextAction(updated.status),
      };
    } catch (error) {
      await this.recordStoredConnectionFailure(scopedTenantId, error);
      throw this.toSafeConnectionException(provider, error);
    }
  }

  /**
   * Отключение CRM — это граница безопасности, а не просто удаление строки.
   *
   * 🔴 До cutover удалялась ТОЛЬКО `CrmIntegration`: гранты, роли и живые сессии
   * продолжали существовать со старыми внешними id. Отключённая CRM оставляла
   * активный доступ, выданный этой же CRM.
   *
   * 🔴 Роли владельца и администратора НЕ отзываются: они происходят из
   * членства и платформенной авторизации, а не из CRM. Иначе отключение
   * интеграции запирало бы владельца снаружи собственного кабинета.
   */
  async disconnectIntegration(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const existing = await this.getStoredIntegration(scopedTenantId);
    const now = new Date();

    const revoked = await this.prisma.$transaction(async (tx) => {
      await tx.staffProviderLink.updateMany({
        where: {
          tenantId: scopedTenantId,
          provider: existing.provider,
          unlinkedAt: null,
        },
        data: { unlinkedAt: now },
      });

      const derived = await tx.crmStaffAccess.findMany({
        where: { tenantId: scopedTenantId, status: { not: 'disabled' } },
        select: { id: true, userId: true, role: true },
      });
      const provisioned = derived.filter(
        (access) => !this.isOwnerAccessRole(access.role),
      );

      if (provisioned.length > 0) {
        await tx.crmStaffAccess.updateMany({
          where: { id: { in: provisioned.map((access) => access.id) } },
          data: { status: 'disabled' },
        });
      }

      const userIds = provisioned
        .map((access) => access.userId)
        .filter((userId): userId is string => Boolean(userId));

      if (userIds.length === 0) return 0;

      const result = await tx.authSession.updateMany({
        where: {
          tenantId: scopedTenantId,
          userId: { in: userIds },
          revokedAt: null,
        },
        data: { revokedAt: now, revokeReason: 'crm_disconnected' },
      });
      return result.count;
    });

    await this.prisma.crmIntegration.delete({
      where: { tenantId: scopedTenantId },
    });

    return {
      configured: false,
      disconnected_provider: existing.provider,
      connection: null,
      next_action: 'connect',
      revoked_sessions: revoked,
    };
  }

  async synchronizeCrmTeamAccess(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    try {
      const integration = await this.getStoredIntegration(scopedTenantId);
      const adapter = this.adapterFactory.create(
        integration.provider as CrmProvider,
        this.createAdapterConfig(integration),
      );
      const team = await this.loadTeamMembers(adapter, scopedTenantId);
      await this.reconcileCrmTeamAccess(scopedTenantId, team);

      return { synced: true, active_crm_team: team.length };
    } catch (error) {
      const errorCode = this.safeErrorCode(error);
      this.logger.warn(
        `CRM team access synchronization deferred tenant=${scopedTenantId}: ${errorCode}`,
      );
      return { synced: false, active_crm_team: null, error_code: errorCode };
    }
  }

  async assertCrmStaffAccessActive(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const access = await this.prisma.crmStaffAccess.findFirst({
      where: { tenantId: scopedTenantId, userId },
      select: {
        role: true,
        status: true,
      },
    });

    if (!access || this.isOwnerAccessRole(access.role)) return;

    const synchronization = await this.synchronizeCrmTeamAccess(scopedTenantId);
    if (!synchronization.synced) {
      if (access.status === 'disabled') {
        throw this.crmStaffAccessDisabled();
      }
      return;
    }

    const current = await this.prisma.crmStaffAccess.findFirst({
      where: { tenantId: scopedTenantId, userId },
      select: { status: true },
    });
    if (!current || current.status !== 'active') {
      throw this.crmStaffAccessDisabled();
    }
  }

  async getServices(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return this.internalCalendarService.listServices(scopedTenantId);
    }

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.getServices(scopedTenantId);
  }

  async getStaff(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return this.internalCalendarService.listStaff(scopedTenantId);
    }

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.getStaff(scopedTenantId);
  }

  async getTeamMembers(tenantId: string): Promise<CrmTeamMember[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return (await this.internalCalendarService.listStaff(scopedTenantId)).map(
        (member) => ({
          ...member,
          bookable: true,
          suggested_role: 'staff' as const,
        }),
      );
    }

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return this.loadTeamMembers(adapter, scopedTenantId);
  }

  async getAvailableSlots(
    tenantId: string,
    query: {
      date: string;
      staffId?: string;
      serviceIds?: string[];
      branchId?: string;
    },
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return this.internalCalendarService.getAvailableSlots({
        tenantId: scopedTenantId,
        ...query,
      });
    }

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.getAvailableSlots({
      tenantId: scopedTenantId,
      ...query,
    });
  }

  async previewStaffScheduleDayChange(
    tenantId: string,
    params: { staffId: string; date: string; slots: StaffScheduleSlot[] },
  ): Promise<StaffScheduleChangePreview> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getScheduleCapableAdapter(
      scopedTenantId,
      'previewStaffScheduleDayChange',
    );
    return adapter.previewStaffScheduleDayChange({
      tenantId: scopedTenantId,
      ...params,
      timezone: await this.tenantTimezone(scopedTenantId),
    });
  }

  async getStaffScheduleDay(
    tenantId: string,
    params: { staffId: string; date: string },
  ): Promise<StaffScheduleDay> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getScheduleCapableAdapter(
      scopedTenantId,
      'getStaffScheduleDay',
    );
    return adapter.getStaffScheduleDay({
      tenantId: scopedTenantId,
      ...params,
    });
  }

  async applyStaffScheduleDayChange(
    tenantId: string,
    params: {
      staffId: string;
      date: string;
      slots: StaffScheduleSlot[];
      expectedRevision: string;
    },
  ): Promise<AppliedStaffScheduleDayChange> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getScheduleCapableAdapter(
      scopedTenantId,
      'applyStaffScheduleDayChange',
    );
    return adapter.applyStaffScheduleDayChange({
      tenantId: scopedTenantId,
      ...params,
      timezone: await this.tenantTimezone(scopedTenantId),
    });
  }

  async createAppointment(
    tenantId: string,
    params: CreateAppointmentRequest,
    invocation: AppointmentActionInvocation = {},
  ): Promise<CreatedAppointment> {
    try {
      return (
        await this.executeCreateAppointmentWithReceipt(
          tenantId,
          params,
          invocation,
        )
      ).value;
    } catch (error) {
      return this.throwAppointmentActionError(error);
    }
  }

  async previewCreateAppointment(
    tenantId: string,
    params: CreateAppointmentRequest,
    invocation: AppointmentActionInvocation = {},
  ): Promise<ActionExecutionPreviewV1> {
    const plan = await this.createAppointmentActionPlan(
      tenantId,
      params,
      invocation,
    );
    return this.actionEngineRuntime.preview(plan.request);
  }

  async executeCreateAppointmentWithReceipt(
    tenantId: string,
    params: CreateAppointmentRequest,
    invocation: AppointmentActionInvocation = {},
  ): Promise<ActionRuntimeReceipt<CreatedAppointment>> {
    const plan = await this.createAppointmentActionPlan(
      tenantId,
      params,
      invocation,
    );
    return this.actionEngineRuntime.executeWithReceipt(
      plan.request,
      plan.handlers,
    );
  }

  private async createAppointmentActionPlan(
    tenantId: string,
    params: CreateAppointmentRequest,
    invocation: AppointmentActionInvocation,
  ): Promise<AppointmentActionPlan<CreatedAppointment>> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    const actionInput: CreateAppointmentRequest = {
      ...params,
      clientId: this.appointmentClientIdentity(
        params.clientId,
        params.clientPhone,
      ),
      clientPhone: params.clientPhone || undefined,
      branchId: params.branchId || undefined,
      notes: params.notes || undefined,
      creationMode:
        params.creationMode ?? (params.allowBusy === true ? 'admin' : 'client'),
      allowBusy: params.allowBusy === true,
      notifyBySmsHours:
        (params.creationMode ??
          (params.allowBusy === true ? 'admin' : 'client')) === 'admin'
          ? 0
          : this.normalizeNotifyBySmsHours(params.notifyBySmsHours),
    };
    const targetRef = `create/${this.appointmentFingerprint({
      clientId: actionInput.clientId,
      start: actionInput.start,
      staffId: actionInput.staffId,
      serviceIds: normalizedServiceIds(actionInput.serviceIds),
    })}`;

    return {
      request: this.appointmentActionRequest({
        tenantId: scopedTenantId,
        capability: 'crm.appointment.create.v1',
        targetRef,
        input: actionInput,
        invocation,
      }),
      handlers: {
        dispatch: async (input) => {
          const durable = this.createAppointmentInput(input);
          const value = await adapter.createAppointment({
            tenantId: scopedTenantId,
            ...durable,
          });
          return { value, safeResult: this.createdAppointmentSafe(value) };
        },
        reconcile: async (input) => {
          const durable = this.createAppointmentInput(input);
          if (!durable.clientPhone) return { outcome: 'STILL_UNKNOWN' };
          const candidates = await adapter.getClientAppointments({
            tenantId: scopedTenantId,
            phone: durable.clientPhone,
            timezone: await this.tenantTimezone(scopedTenantId),
          });
          const matches = candidates.filter(
            (candidate) =>
              !isCanceledStatus(candidate.status) &&
              sameInstant(candidate.start, durable.start) &&
              candidate.staff_id === durable.staffId &&
              sameServiceIds(candidate.service_ids, durable.serviceIds),
          );
          if (matches.length === 0) return { outcome: 'PROVEN_NOT_EXECUTED' };
          if (matches.length !== 1) return { outcome: 'STILL_UNKNOWN' };
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: this.createdAppointmentSafe(matches[0]),
          };
        },
        restore: (safe) => this.restoreCreatedAppointment(safe),
        classifyError: (error, phase) =>
          this.classifyAppointmentActionError(error, phase),
      },
    };
  }

  async cancelAppointment(
    tenantId: string,
    externalId: string,
    invocation: AppointmentActionInvocation = {},
  ): Promise<CancelledAppointment> {
    try {
      return (
        await this.executeCancelAppointmentWithReceipt(
          tenantId,
          externalId,
          invocation,
        )
      ).value;
    } catch (error) {
      return this.throwAppointmentActionError(error);
    }
  }

  async previewCancelAppointment(
    tenantId: string,
    externalId: string,
    invocation: AppointmentActionInvocation = {},
  ): Promise<ActionExecutionPreviewV1> {
    const plan = await this.cancelAppointmentActionPlan(
      tenantId,
      externalId,
      invocation,
    );
    return this.actionEngineRuntime.preview(plan.request);
  }

  async executeCancelAppointmentWithReceipt(
    tenantId: string,
    externalId: string,
    invocation: AppointmentActionInvocation = {},
  ): Promise<ActionRuntimeReceipt<CancelledAppointment>> {
    const plan = await this.cancelAppointmentActionPlan(
      tenantId,
      externalId,
      invocation,
    );
    return this.actionEngineRuntime.executeWithReceipt(
      plan.request,
      plan.handlers,
    );
  }

  private async cancelAppointmentActionPlan(
    tenantId: string,
    externalId: string,
    invocation: AppointmentActionInvocation,
  ): Promise<AppointmentActionPlan<CancelledAppointment>> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return {
      request: this.appointmentActionRequest({
        tenantId: scopedTenantId,
        capability: 'crm.appointment.cancel.v1',
        targetRef: `appointment/${externalId}`,
        input: { externalId },
        invocation,
      }),
      handlers: {
        dispatch: async (input) => {
          const durableExternalId = requireString(
            input.externalId,
            'externalId',
          );
          try {
            const value = await adapter.cancelAppointment({
              tenantId: scopedTenantId,
              externalId: durableExternalId,
            });
            return { value, safeResult: this.cancelledAppointmentSafe(value) };
          } catch (error) {
            if (!(error instanceof CrmRecordGoneError)) throw error;
            const value = {
              external_id: durableExternalId,
              status: 'canceled',
            };
            return { value, safeResult: this.cancelledAppointmentSafe(value) };
          }
        },
        reconcile: async (input) => {
          const durableExternalId = requireString(
            input.externalId,
            'externalId',
          );
          try {
            const detail = await this.loadAppointmentDetail(
              scopedTenantId,
              durableExternalId,
            );
            if (!isCanceledStatus(detail.status)) {
              return { outcome: 'PROVEN_NOT_EXECUTED' };
            }
          } catch (error) {
            if (!(error instanceof CrmRecordGoneError)) throw error;
          }
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: this.cancelledAppointmentSafe({
              external_id: durableExternalId,
              status: 'canceled',
            }),
          };
        },
        restore: (safe) => this.restoreCancelledAppointment(safe),
        classifyError: (error, phase) =>
          this.classifyAppointmentActionError(error, phase),
      },
    };
  }

  async rescheduleAppointment(
    tenantId: string,
    params: RescheduleAppointmentRequest,
    invocation: AppointmentActionInvocation = {},
  ): Promise<RescheduledAppointment> {
    try {
      return (
        await this.executeRescheduleAppointmentWithReceipt(
          tenantId,
          params,
          invocation,
        )
      ).value;
    } catch (error) {
      return this.throwAppointmentActionError(error);
    }
  }

  async previewRescheduleAppointment(
    tenantId: string,
    params: RescheduleAppointmentRequest,
    invocation: AppointmentActionInvocation = {},
  ): Promise<ActionExecutionPreviewV1> {
    const plan = await this.rescheduleAppointmentActionPlan(
      tenantId,
      params,
      invocation,
    );
    return this.actionEngineRuntime.preview(plan.request);
  }

  async executeRescheduleAppointmentWithReceipt(
    tenantId: string,
    params: RescheduleAppointmentRequest,
    invocation: AppointmentActionInvocation = {},
  ): Promise<ActionRuntimeReceipt<RescheduledAppointment>> {
    const plan = await this.rescheduleAppointmentActionPlan(
      tenantId,
      params,
      invocation,
    );
    return this.actionEngineRuntime.executeWithReceipt(
      plan.request,
      plan.handlers,
    );
  }

  private async rescheduleAppointmentActionPlan(
    tenantId: string,
    params: RescheduleAppointmentRequest,
    invocation: AppointmentActionInvocation,
  ): Promise<AppointmentActionPlan<RescheduledAppointment>> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return {
      request: this.appointmentActionRequest({
        tenantId: scopedTenantId,
        capability: 'crm.appointment.reschedule.v1',
        targetRef: `appointment/${params.externalId}`,
        input: params,
        invocation,
      }),
      handlers: {
        prepare: async (input) => {
          const durable = this.rescheduleAppointmentInput(input);
          const detail = await this.loadAppointmentDetail(
            scopedTenantId,
            durable.externalId,
          );
          return {
            externalId: durable.externalId,
            status: detail.status,
            start: detail.start_at,
            staffId: String(detail.provider.id),
            serviceIds: normalizedServiceIds(detail.service_ids),
          } satisfies AppointmentStateEvidence;
        },
        dispatch: async (input) => {
          const durable = this.rescheduleAppointmentInput(input);
          const value = await adapter.rescheduleAppointment({
            tenantId: scopedTenantId,
            ...durable,
          });
          return { value, safeResult: this.rescheduledAppointmentSafe(value) };
        },
        reconcile: async (input, previous) => {
          const durable = this.rescheduleAppointmentInput(input);
          const detail = await this.loadAppointmentDetail(
            scopedTenantId,
            durable.externalId,
          );
          const current = this.appointmentEvidence(detail);
          if (this.matchesDesiredAppointment(current, durable)) {
            return {
              outcome: 'PROVEN_SUCCEEDED',
              safeResult: this.rescheduledAppointmentSafe({
                external_id: current.externalId,
                status: current.status,
                start: current.start,
                staff_id: current.staffId,
                service_ids: current.serviceIds,
              }),
            };
          }
          if (previous && this.sameAppointmentEvidence(current, previous)) {
            return { outcome: 'PROVEN_NOT_EXECUTED' };
          }
          return { outcome: 'STILL_UNKNOWN' };
        },
        restore: (safe) => this.restoreRescheduledAppointment(safe),
        classifyError: (error, phase) =>
          this.classifyAppointmentActionError(error, phase),
      },
    };
  }

  private appointmentFingerprint(value: unknown): string {
    return createHash('sha256')
      .update(stableActionJson(value))
      .digest('hex')
      .slice(0, 48);
  }

  private appointmentClientIdentity(
    clientId: string,
    clientPhone?: string | null,
  ): string {
    const phoneKey = phoneMatchKey(clientPhone);
    const identity = phoneKey ? `phone:${phoneKey}` : `client:${clientId}`;
    return `client/${this.encryptionService.opaqueReference(
      'appointment-client-v1',
      identity,
    )}`;
  }

  private normalizeNotifyBySmsHours(value: number | undefined): number {
    if (value === undefined) return 3;
    if (!Number.isFinite(value)) return 3;
    return Math.max(0, Math.min(48, Math.trunc(value)));
  }

  private appointmentActionRequest(input: {
    tenantId: string;
    capability:
      | 'crm.appointment.create.v1'
      | 'crm.appointment.reschedule.v1'
      | 'crm.appointment.cancel.v1';
    targetRef: string;
    input: unknown;
    invocation: AppointmentActionInvocation;
  }): TrustedActionExecutionRequestV1 {
    const context = this.tenantContext.get();
    const sourceType = input.invocation.sourceType ?? 'authenticated_request';
    const sourceRef =
      input.invocation.sourceRef ??
      (sourceType === 'agent_task'
        ? input.invocation.agentTaskId
        : context?.requestId);

    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: input.capability,
      source: {
        type: sourceType,
        occurrenceScope: `appointment-mutation:${input.capability}:v1`,
        ...(sourceRef ? { sourceRef } : {}),
        ...(sourceType === 'agent_task' && input.invocation.agentTaskId
          ? { agentTaskId: input.invocation.agentTaskId }
          : {}),
        ...(context?.userId && context.membershipId
          ? { actorUserId: context.userId }
          : {}),
      },
      targetRef: input.targetRef,
      input: input.input,
      evidenceRefs: [],
      callerIdempotency: input.invocation.callerIdempotency,
    };
  }

  async getAppointmentActionExecutionResult(
    tenantId: string,
    executionId: string,
  ): Promise<ExecutionResultV1> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    return this.actionEngineRuntime.getExecutionResult(
      scopedTenantId,
      executionId,
    );
  }

  private throwAppointmentActionError(error: unknown): never {
    if (error instanceof ActionExecutionUncertainError) {
      throw new CrmOutcomeUnknownError(error.message, error);
    }
    if (error instanceof ActionExecutionTerminalError) {
      throw new ConflictException({
        message: error.message,
        error: { code: error.code.toLowerCase() },
      });
    }
    throw error;
  }

  private createAppointmentInput(
    input: Record<string, unknown>,
  ): CreateAppointmentInput {
    return {
      clientId: requireString(input.clientId, 'clientId'),
      clientName: requireString(input.clientName, 'clientName'),
      clientPhone: optionalString(input.clientPhone),
      branchId: optionalString(input.branchId),
      staffId: requireString(input.staffId, 'staffId'),
      serviceIds: requireStringArray(input.serviceIds, 'serviceIds'),
      start: requireString(input.start, 'start'),
      notes: optionalString(input.notes),
      creationMode: input.creationMode === 'admin' ? 'admin' : 'client',
      allowBusy: input.allowBusy === true,
      durationMinutes: optionalNumber(input.durationMinutes),
      notifyBySmsHours: optionalNumber(input.notifyBySmsHours),
    };
  }

  private rescheduleAppointmentInput(
    input: Record<string, unknown>,
  ): RescheduleAppointmentInput {
    const rawServices = input.serviceIds;
    return {
      externalId: requireString(input.externalId, 'externalId'),
      start: requireString(input.start, 'start'),
      staffId: optionalString(input.staffId),
      serviceIds:
        rawServices === undefined
          ? undefined
          : requireStringArray(rawServices, 'serviceIds'),
      notes: optionalString(input.notes),
    };
  }

  private createdAppointmentSafe(
    value: CreatedAppointment,
  ): Record<string, unknown> {
    return {
      externalId: value.external_id,
      status: value.status,
      start: value.start,
      ...(value.end ? { end: value.end } : {}),
      staffId: value.staff_id,
      serviceIds: normalizedServiceIds(value.service_ids),
      ...(value.branch_id ? { branchId: value.branch_id } : {}),
      ...(typeof value.total_price === 'number'
        ? { totalPrice: value.total_price }
        : {}),
      ...(value.currency ? { currency: value.currency } : {}),
    };
  }

  private restoreCreatedAppointment(
    safe: Record<string, unknown>,
  ): CreatedAppointment {
    return {
      external_id: requireString(safe.externalId, 'externalId'),
      status: requireString(safe.status, 'status'),
      start: requireString(safe.start, 'start'),
      end: optionalString(safe.end),
      staff_id: requireString(safe.staffId, 'staffId'),
      service_ids: requireStringArray(safe.serviceIds, 'serviceIds'),
      branch_id: optionalString(safe.branchId) ?? null,
      total_price: optionalNumber(safe.totalPrice) ?? null,
      currency: optionalString(safe.currency),
    };
  }

  private cancelledAppointmentSafe(
    value: CancelledAppointment,
  ): Record<string, unknown> {
    return {
      externalId: value.external_id,
      status: value.status,
    };
  }

  private restoreCancelledAppointment(
    safe: Record<string, unknown>,
  ): CancelledAppointment {
    return {
      external_id: requireString(safe.externalId, 'externalId'),
      status: requireString(safe.status, 'status'),
    };
  }

  private rescheduledAppointmentSafe(
    value: RescheduledAppointment,
  ): Record<string, unknown> {
    return {
      externalId: value.external_id,
      status: value.status,
      start: value.start,
      staffId: value.staff_id,
      serviceIds: normalizedServiceIds(value.service_ids),
    };
  }

  private restoreRescheduledAppointment(
    safe: Record<string, unknown>,
  ): RescheduledAppointment {
    return {
      external_id: requireString(safe.externalId, 'externalId'),
      status: requireString(safe.status, 'status'),
      start: requireString(safe.start, 'start'),
      staff_id: requireString(safe.staffId, 'staffId'),
      service_ids: requireStringArray(safe.serviceIds, 'serviceIds'),
    };
  }

  private appointmentEvidence(
    detail: CrmAppointmentDetail,
  ): AppointmentStateEvidence {
    return {
      externalId: detail.id,
      status: detail.status,
      start: detail.start_at,
      staffId: String(detail.provider.id),
      serviceIds: normalizedServiceIds(detail.service_ids),
    };
  }

  private matchesDesiredAppointment(
    current: AppointmentStateEvidence,
    desired: RescheduleAppointmentInput,
  ): boolean {
    return (
      sameInstant(current.start, desired.start) &&
      (desired.staffId === undefined || current.staffId === desired.staffId) &&
      (desired.serviceIds === undefined ||
        sameServiceIds(current.serviceIds, desired.serviceIds))
    );
  }

  private sameAppointmentEvidence(
    current: AppointmentStateEvidence,
    previous: Record<string, unknown>,
  ): boolean {
    const previousServices = requireStringArray(
      previous.serviceIds,
      'serviceIds',
    );
    return (
      current.externalId === requireString(previous.externalId, 'externalId') &&
      current.status === requireString(previous.status, 'status') &&
      sameInstant(current.start, requireString(previous.start, 'start')) &&
      current.staffId === requireString(previous.staffId, 'staffId') &&
      sameServiceIds(current.serviceIds, previousServices)
    );
  }

  private classifyAppointmentActionError(
    error: unknown,
    phase: 'prepare' | 'dispatch',
  ): ActionFailureClassification {
    if (error instanceof CrmOutcomeUnknownError) {
      return phase === 'prepare'
        ? {
            kind: 'definitive',
            outcomeCode: 'crm_read_unavailable_before_dispatch',
            errorClass: 'crm_transient_before_dispatch',
          }
        : {
            kind: 'unknown',
            outcomeCode: 'crm_provider_outcome_unknown',
            errorClass: 'crm_outcome_unknown',
          };
    }

    return {
      kind: 'definitive',
      outcomeCode: 'crm_provider_rejected',
      errorClass: 'crm_provider_rejected',
    };
  }

  async getClientAppointments(tenantId: string, phone: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return [];
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { defaultTimezone: true },
    });
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.getClientAppointments({
      tenantId: scopedTenantId,
      phone,
      timezone: resolveSalonTimezone({
        tenantTimezone: tenant?.defaultTimezone,
      }),
    });
  }

  /**
   * @param options.includeCanceled — отдать отменённые визиты. Намеренно НЕ в
   * DTO: тогда флаг стал бы частью HTTP-контракта журнала, а его ответом
   * рисуется сетка расписания — отменённая запись нарисовала бы карточку
   * поверх времени, которое салон уже перепродал. Просят его только изнутри,
   * из аналитики.
   */
  async getJournal(
    tenantId: string,
    query: ListCrmJournalDto,
    options?: { includeCanceled?: boolean },
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new BadRequestException({
        message: 'CRM journal range is invalid.',
        error: { code: 'crm_journal_range_invalid' },
      });
    }

    // 🔴 Правило провайдера живёт константой в границе CRM (глава 2 P3.6).
    // Литерал здесь означал, что при смене лимита разойдутся два числа.
    if (to.getTime() - from.getTime() > CRM_JOURNAL_MAX_WINDOW_MS) {
      throw new BadRequestException({
        message: `CRM journal range must not exceed ${CRM_JOURNAL_MAX_WINDOW_DAYS} days.`,
        error: { code: 'crm_journal_range_too_large' },
      });
    }

    const [tenant, adapter] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: scopedTenantId },
        select: { defaultTimezone: true },
      }),
      this.getAdapterForTenant(scopedTenantId),
    ]);

    if (!adapter.getJournal) {
      throw new ConflictException({
        message: 'CRM journal is not available for this provider.',
        error: { code: 'crm_journal_not_supported' },
      });
    }

    return adapter.getJournal({
      tenantId: scopedTenantId,
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: resolveSalonTimezone({
        tenantTimezone: tenant?.defaultTimezone,
      }),
      providerId: query.providerId,
      includeCanceled: options?.includeCanceled === true,
    });
  }

  /**
   * Операции над визитом из сетки расписания.
   *
   * Провайдер может их не уметь — метод в адаптере тогда просто не объявлен.
   * Отдаём 409 с кодом, по которому кабинет прячет кнопку, а не падает.
   */
  private async getVisitCapableAdapter<TMethod extends keyof CRMAdapter>(
    tenantId: string,
    method: TMethod,
    code: string,
  ): Promise<CRMAdapter & Required<Pick<CRMAdapter, TMethod>>> {
    await this.assertExternalSource(tenantId);
    const adapter = await this.getAdapterForTenant(tenantId);

    if (typeof adapter[method] !== 'function') {
      throw new ConflictException({
        message: 'CRM visit operation is not available for this provider.',
        error: { code },
      });
    }

    return adapter as CRMAdapter & Required<Pick<CRMAdapter, TMethod>>;
  }

  private async getScheduleCapableAdapter<
    TMethod extends
      | 'getStaffScheduleDay'
      | 'previewStaffScheduleDayChange'
      | 'applyStaffScheduleDayChange',
  >(
    tenantId: string,
    method: TMethod,
  ): Promise<CRMAdapter & Required<Pick<CRMAdapter, TMethod>>> {
    await this.assertExternalSource(tenantId);
    const adapter = await this.getAdapterForTenant(tenantId);
    if (typeof adapter[method] !== 'function') {
      throw new ConflictException({
        message: 'CRM schedule operation is not available for this provider.',
        error: { code: 'crm_schedule_update_not_supported' },
      });
    }
    return adapter as CRMAdapter & Required<Pick<CRMAdapter, TMethod>>;
  }

  private async tenantTimezone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });

    return resolveSalonTimezone({ tenantTimezone: tenant?.defaultTimezone });
  }

  /**
   * Кому журнал открыт целиком: владелец, управляющий, администратор.
   * Остальные — только собственные визиты (см. assertJournalRecordAccess).
   */
  private static readonly JOURNAL_FULL_ACCESS_ROLES = new Set<string>([
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
    UserRole.MANAGER,
    UserRole.BRANCH_MANAGER,
  ]);

  /**
   * Кому видны телефоны клиентов. Уже — чем доступ к журналу: телефон это ПД
   * (152-ФЗ), и в легаси-кабинете его видел только владелец. Управляющий ведёт
   * записи всего салона, но номера ему не показываются.
   */
  private static readonly CLIENT_PHONE_ROLES = new Set<string>([
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
  ]);

  private journalRecordForbidden(): ForbiddenException {
    return new ForbiddenException({
      message: 'Эта запись не из вашего расписания.',
      error: { code: 'crm_record_forbidden' },
    });
  }

  /**
   * 🔴 BOLA-страж журнальных операций.
   *
   * Внешний идентификатор записи в CRM перебираем. Без этой проверки мастер,
   * подставив чужой id, читал бы карточку любого визита салона вместе с ПД
   * клиента и мог бы его отменить, перенести или переписать. Ровно эту границу
   * держит легаси-кабинет (_panel_record_guard).
   *
   * Возвращает уже загруженную карточку, если ради проверки её пришлось
   * прочитать — чтобы не ходить в CRM дважды.
   */
  /**
   * 🔴 ЕДИНСТВЕННОЕ место, где внешний идентификатор провайдера превращается в
   * идентичность Maya. Граница интеграции:
   *
   *     provider + externalId → StaffProviderLink → StaffId
   *
   * Отвязанные связи (`unlinkedAt`) намеренно не разрешаются: карточка, которую
   * провайдер убрал из состава команды, не даёт доступа.
   */
  /** Провайдер, подключённый у арендатора. Единственный источник квалификации. */
  private async providerOfTenant(tenantId: string): Promise<string> {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { provider: true },
    });
    if (!integration) {
      throw new ConflictException({
        message: 'CRM integration is not configured for this tenant.',
        error: { code: 'crm_not_configured' },
      });
    }
    return integration.provider;
  }

  private async resolveStaffIdByExternal(
    tenantId: string,
    externalId: string,
  ): Promise<StaffId | null> {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { provider: true },
    });
    if (!integration) return null;

    const link = await this.prisma.staffProviderLink.findFirst({
      where: {
        tenantId,
        provider: integration.provider,
        externalId,
        unlinkedAt: null,
      },
      select: { staffId: true },
    });

    return asStaffIdOrNull(link?.staffId);
  }

  /**
   * Кто этот мастер в идентичности Maya — для ЗАПИСИ визита.
   *
   * 🔴 Зачем понадобился публичный резолвер. Колонка `Appointment.staffId`
   * появилась в фазе A и была залита разово; писателя у неё не завелось, и
   * каждая новая запись получала `NULL`. То есть идентичность мастера у визита
   * снова держалась на внешнем id — ровно на том, от чего уходили.
   *
   * Два пространства и ОДИН ответ:
   *
   * - внешняя CRM: `provider + externalId → StaffProviderLink → StaffId`;
   * - внутренний календарь: идентификатор мастера УЖЕ является `Staff.id`
   *   (backfill сохранил `InternalProvider.id` дословно), поэтому связь не
   *   нужна — нужна проверка существования.
   *
   * 🔴 Возвращает `null`, а НЕ внешний id. Подстановка внешнего id сделала бы
   * колонку носителем чужого пространства, а внешний ключ на `Staff` всё равно
   * отверг бы такую запись и сломал бронь.
   *
   * Проверка существования в внутренней ветке не формальность: без неё в
   * колонку уехал бы `InternalProvider.id`, у которого строки `Staff` ещё нет,
   * и внешний ключ уронил бы создание визита целиком.
   */
  async resolveStaffIdForBooking(
    tenantId: string,
    staffRef: string | null | undefined,
  ): Promise<StaffId | null> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const reference = String(staffRef ?? '').trim();
    if (!reference) return null;

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: reference, tenantId: scopedTenantId },
        select: { id: true },
      });
      return asStaffIdOrNull(staff?.id);
    }

    return this.resolveStaffIdByExternal(scopedTenantId, reference);
  }

  /**
   * Чей это мастер — в идентичности Maya.
   *
   * 🔴 До cutover отдавался `externalStaffId`, и всё право читать чужой визит
   * держалось на строковом равенстве идентификаторов ЧУЖОЙ системы. Теперь
   * возвращается `StaffId`, а значения со стороны CRM разрешаются через связь.
   *
   * Отсутствие `staffId` — ОТКАЗ, а не откат на внешний id. Откат означал бы,
   * что старый путь остаётся рабочим обходом инварианта.
   */
  private async journalStaffBinding(
    tenantId: string,
    actor: AuthenticatedUser,
  ): Promise<StaffId | null> {
    if (CrmService.JOURNAL_FULL_ACCESS_ROLES.has(actor.role)) {
      return null;
    }

    const access = await this.prisma.crmStaffAccess.findFirst({
      where: { tenantId, userId: actor.userId },
      select: { staffId: true, status: true },
    });

    // Нет активной привязки к мастеру — значит и своих визитов нет.
    if (!access || access.status !== 'active' || !access.staffId) {
      throw this.journalRecordForbidden();
    }

    return asStaffId(access.staffId);
  }

  /**
   * 🔴 Вторая половина того же стража: в ЧЬЁ расписание разрешено писать.
   *
   * `assertJournalRecordAccess` закрывает существующую запись, но создание
   * записи закрывать было нечем — там ещё нет externalId. В результате мастер с
   * активной привязкой мог отправить `staff_id` ЧУЖОГО мастера, и визит садился
   * в чужую сетку (`allowBusy: true`), хотя прочитать или отменить чужой визит
   * тот же модуль ему запрещал. Тот же зазор был у переноса: проверялась
   * исходная запись, а целевой мастер — нет, поэтому своей записью можно было
   * занять чужое кресло.
   *
   * Роли с полным доступом (владелец, управляющий, администратор) ведут
   * расписание всего салона — для них ограничения нет.
   */
  async assertJournalStaffWritable(
    tenantId: string,
    actor: AuthenticatedUser,
    staffId: string | undefined,
  ): Promise<void> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const boundStaffId = await this.journalStaffBinding(scopedTenantId, actor);

    if (boundStaffId === null || staffId === undefined) {
      return;
    }

    // Значение пришло из запроса в пространстве провайдера — разрешаем его в
    // идентичность Maya и только потом сравниваем. Связи нет ⇒ отказ.
    const target = await this.resolveStaffIdByExternal(
      scopedTenantId,
      String(staffId),
    );

    if (target === null || target !== boundStaffId) {
      throw this.journalRecordForbidden();
    }
  }

  private async assertJournalRecordAccess(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
  ): Promise<void> {
    const boundStaffId = await this.journalStaffBinding(tenantId, actor);

    if (boundStaffId === null) {
      return;
    }

    const adapter = await this.getVisitCapableAdapter(
      tenantId,
      'getAppointmentStaffId',
      'crm_appointment_detail_not_supported',
    );
    const ownerStaffId = await adapter.getAppointmentStaffId({
      tenantId,
      externalId,
    });

    const ownerStaff = ownerStaffId
      ? await this.resolveStaffIdByExternal(tenantId, String(ownerStaffId))
      : null;

    if (ownerStaff === null || ownerStaff !== boundStaffId) {
      throw this.journalRecordForbidden();
    }
  }

  private async loadAppointmentDetail(
    tenantId: string,
    externalId: string,
  ): Promise<CrmAppointmentDetail> {
    const adapter = await this.getVisitCapableAdapter(
      tenantId,
      'getAppointmentDetail',
      'crm_appointment_detail_not_supported',
    );

    return adapter.getAppointmentDetail({
      tenantId,
      externalId,
      timezone: await this.tenantTimezone(tenantId),
    });
  }

  /**
   * Internal scheduler access to the CRM phone attached to one appointment.
   * This method is intentionally available only as an in-process service call:
   * no controller exposes it and tenant context is still mandatory.
   */
  async getAppointmentDetailForSystem(
    tenantId: string,
    externalId: string,
  ): Promise<CrmAppointmentDetail> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    return this.loadAppointmentDetail(scopedTenantId, externalId);
  }

  async getAppointmentDetail(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
  ): Promise<CrmAppointmentDetail> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    // Здесь карточку всё равно грузим — проверяем владельца по ней, без
    // отдельного запроса в CRM.
    const boundStaffId = await this.journalStaffBinding(scopedTenantId, actor);
    const detail = await this.loadAppointmentDetail(scopedTenantId, externalId);

    if (boundStaffId !== null) {
      const detailStaff = await this.resolveStaffIdByExternal(
        scopedTenantId,
        String(detail.provider.id),
      );
      if (detailStaff === null || detailStaff !== boundStaffId) {
        throw this.journalRecordForbidden();
      }
    }

    if (CrmService.CLIENT_PHONE_ROLES.has(actor.role)) {
      return detail;
    }

    // Телефон вырезаем на выходе, а не полагаемся на то, что фронт его не
    // покажет: ответ API читается и в обход интерфейса.
    return { ...detail, client_phone: null };
  }

  async markAppointmentAttendance(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
    attendance: VisitAttendance,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(scopedTenantId, actor, externalId);
    // Сервис не доверяет вызывающему: HTTP-край не единственный вход.
    assertWritableAttendance(attendance);

    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'markAppointmentAttendance',
      'crm_attendance_not_supported',
    );

    return adapter.markAppointmentAttendance({
      tenantId: scopedTenantId,
      externalId,
      attendance,
    });
  }

  async setAppointmentDuration(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
    durationMinutes: number,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(scopedTenantId, actor, externalId);

    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 5 ||
      durationMinutes > 720
    ) {
      throw new BadRequestException({
        message: 'CRM visit duration must be between 5 and 720 minutes.',
        error: { code: 'crm_duration_invalid' },
      });
    }

    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'setAppointmentDuration',
      'crm_duration_not_supported',
    );

    return adapter.setAppointmentDuration({
      tenantId: scopedTenantId,
      externalId,
      durationMinutes: Math.round(durationMinutes),
    });
  }

  async setAppointmentServices(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
    serviceIds: string[],
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(scopedTenantId, actor, externalId);

    // Пустой состав стёр бы цену визита — в журнале это всегда ошибка ввода.
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      throw new BadRequestException({
        message: 'CRM visit must keep at least one service.',
        error: { code: 'crm_services_empty' },
      });
    }

    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'setAppointmentServices',
      'crm_services_not_supported',
    );

    return adapter.setAppointmentServices({
      tenantId: scopedTenantId,
      externalId,
      serviceIds,
    });
  }

  /** Перенос визита из журнала — под тем же стражем, что и правки. */
  async rescheduleJournalAppointment(
    tenantId: string,
    actor: AuthenticatedUser,
    params: {
      externalId: string;
      start: string;
      staffId?: string;
      serviceIds?: string[];
    },
    invocation: AppointmentActionInvocation = {},
  ): Promise<RescheduledAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(
      scopedTenantId,
      actor,
      params.externalId,
    );
    // Своей записью нельзя занять чужое кресло: страж выше проверяет ИСХОДНУЮ
    // запись, а целевой мастер до этого не проверялся вовсе.
    await this.assertJournalStaffWritable(
      scopedTenantId,
      actor,
      params.staffId,
    );

    return this.rescheduleAppointment(scopedTenantId, params, invocation);
  }

  /** Отмена визита из журнала — под тем же стражем. */
  async cancelJournalAppointment(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
    invocation: AppointmentActionInvocation = {},
  ): Promise<CancelledAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(scopedTenantId, actor, externalId);

    return this.cancelAppointment(scopedTenantId, externalId, invocation);
  }

  async searchClients(tenantId: string, query: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'searchClients',
      'crm_client_search_not_supported',
    );

    return adapter.searchClients({ tenantId: scopedTenantId, query });
  }

  async getClientRegistry(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'getClientRegistry',
      'crm_client_registry_not_supported',
    );

    return adapter.getClientRegistry({ tenantId: scopedTenantId });
  }

  async getClientVisitHistory(
    tenantId: string,
    clientId: string,
    limit = 30,
    timezone?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'getClientVisitHistory',
      'crm_client_history_not_supported',
    );

    return adapter.getClientVisitHistory({
      tenantId: scopedTenantId,
      clientId,
      limit,
      // Пояс салона, а не пояс автора кода: без него провайдерское «14:00»
      // невозможно превратить в момент времени, не выдумав смещение.
      timezone: timezone?.trim() || (await this.tenantTimezone(scopedTenantId)),
    });
  }

  async getFinancialSummary(
    tenantId: string,
    query: { from: string; to: string },
  ): Promise<CrmFinancialSummary> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new BadRequestException({
        message: 'CRM finance range is invalid.',
        error: { code: 'crm_finance_range_invalid' },
      });
    }

    if (to.getTime() - from.getTime() > CRM_FINANCE_MAX_WINDOW_MS) {
      throw new BadRequestException({
        message: `CRM finance range must not exceed ${CRM_JOURNAL_MAX_WINDOW_DAYS} days.`,
        error: { code: 'crm_finance_range_too_large' },
      });
    }

    const [tenant, adapter] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: scopedTenantId },
        select: { defaultTimezone: true },
      }),
      this.getAdapterForTenant(scopedTenantId),
    ]);

    if (!adapter.getFinancialSummary) {
      throw new ConflictException({
        message: 'CRM financial analytics is not available for this provider.',
        error: { code: 'crm_finance_not_supported' },
      });
    }

    return adapter.getFinancialSummary({
      tenantId: scopedTenantId,
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: resolveSalonTimezone({
        tenantTimezone: tenant?.defaultTimezone,
      }),
    });
  }

  async getRevenueSummary(
    tenantId: string,
    query: { from: string; to: string },
  ): Promise<CrmRevenueSummary> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new BadRequestException({
        message: 'CRM revenue range is invalid.',
        error: { code: 'crm_revenue_range_invalid' },
      });
    }

    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        message: 'CRM revenue range must not exceed 366 days.',
        error: { code: 'crm_revenue_range_too_large' },
      });
    }

    const [tenant, adapter] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: scopedTenantId },
        select: { defaultTimezone: true },
      }),
      this.getAdapterForTenant(scopedTenantId),
    ]);

    if (!adapter.getRevenueSummary) {
      throw new ConflictException({
        message: 'CRM revenue analytics is not available for this provider.',
        error: { code: 'crm_revenue_not_supported' },
      });
    }

    return adapter.getRevenueSummary({
      tenantId: scopedTenantId,
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: resolveSalonTimezone({
        tenantTimezone: tenant?.defaultTimezone,
      }),
    });
  }

  async getAppointmentRevenue(
    tenantId: string,
    query: { from: string; to: string; externalIds: string[] },
  ): Promise<CrmAppointmentRevenueSnapshot> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);
    const externalIds = [
      ...new Set(
        query.externalIds
          .map((value) => String(value).trim())
          .filter((value) => value.length > 0),
      ),
    ];

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new BadRequestException({
        message: 'CRM appointment revenue range is invalid.',
        error: { code: 'crm_appointment_revenue_range_invalid' },
      });
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        message: 'CRM appointment revenue range must not exceed 366 days.',
        error: { code: 'crm_appointment_revenue_range_too_large' },
      });
    }
    if (externalIds.length > 2_000) {
      throw new BadRequestException({
        message: 'Too many CRM appointments requested for one report.',
        error: { code: 'crm_appointment_revenue_limit_exceeded' },
      });
    }

    const [tenant, adapter] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: scopedTenantId },
        select: { defaultTimezone: true },
      }),
      this.getAdapterForTenant(scopedTenantId),
    ]);
    if (!adapter.getAppointmentRevenue) {
      throw new ConflictException({
        message: 'CRM appointment revenue attribution is not available.',
        error: { code: 'crm_appointment_revenue_not_supported' },
      });
    }

    return adapter.getAppointmentRevenue({
      tenantId: scopedTenantId,
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: resolveSalonTimezone({
        tenantTimezone: tenant?.defaultTimezone,
      }),
      externalIds,
    });
  }

  async getClientLoyalty(tenantId: string, phone: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return null;
    }

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    const loyalty = await adapter.getClientLoyalty({
      tenantId: scopedTenantId,
      phone,
    });

    // Теневая регистрация личности: единственное место, где Maya вообще видит
    // внешний идентификатор клиента. Раньше он вычислялся и выбрасывался.
    // Запись строго побочная — ответ не меняется и от её сбоя не зависит.
    if (loyalty?.external_client_id) {
      await this.clientIdentityService.tryRegisterCrmClient({
        tenantId: scopedTenantId,
        provider: loyalty.provider,
        externalId: loyalty.external_client_id,
        phone,
      });
    }

    return loyalty;
  }

  async testConnection(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      const ready = await this.internalCalendarService.isReady(scopedTenantId);
      return {
        ok: ready,
        provider: CalendarSource.INTERNAL,
        message: ready
          ? 'Maya internal calendar is ready'
          : 'Maya internal calendar requires a service and weekly availability',
      };
    }

    return this.recheckIntegration(scopedTenantId);
  }

  private async getAdapterForTenant(tenantId: string): Promise<CRMAdapter> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.getStoredIntegration(scopedTenantId);

    this.assertProviderConnectable(integration.provider as CrmProvider);

    if (integration.status !== 'active') {
      throw new ConflictException({
        message: 'CRM integration is not active',
        error: {
          code: 'crm_integration_not_active',
          status: integration.status,
          next_action: this.resolveNextAction(integration.status),
        },
      });
    }

    const signature = [
      integration.id,
      integration.provider,
      integration.updatedAt instanceof Date
        ? integration.updatedAt.getTime()
        : String(integration.updatedAt ?? ''),
    ].join('|');
    const cached = this.adapterCache.get(scopedTenantId);
    if (
      cached &&
      cached.signature === signature &&
      cached.expiresAt > Date.now()
    ) {
      return cached.adapter;
    }

    const adapter = this.adapterFactory.create(
      integration.provider as CrmProvider,
      this.createAdapterConfig(integration),
    );
    this.adapterCache.set(scopedTenantId, {
      signature,
      expiresAt: Date.now() + 5 * 60 * 1_000,
      adapter,
    });
    return adapter;
  }

  async getCalendarSource(tenantId: string): Promise<CalendarSource> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { calendarSource: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant.calendarSource === 'internal'
      ? CalendarSource.INTERNAL
      : CalendarSource.EXTERNAL;
  }

  async getExternalProviderKey(tenantId: string): Promise<string> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    return this.providerOfTenant(scopedTenantId);
  }

  private async assertExternalSource(tenantId: string): Promise<void> {
    if ((await this.getCalendarSource(tenantId)) === CalendarSource.EXTERNAL) {
      return;
    }

    throw new ConflictException(
      'External CRM operations are disabled for an internal Maya calendar',
    );
  }

  private serializeIntegration(integration: {
    id: string;
    tenantId: string;
    provider: string;
    baseUrl: string | null;
    status: string;
    settingsJson: unknown;
    verifiedAt?: Date | null;
    lastCheckedAt?: Date | null;
    lastSyncAt?: Date | null;
    lastErrorCode?: string | null;
    lastErrorAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: integration.id,
      tenant_id: integration.tenantId,
      provider: integration.provider,
      base_url: integration.baseUrl,
      status: integration.status,
      has_credentials: true,
      verified: Boolean(integration.verifiedAt),
      verified_at: integration.verifiedAt ?? null,
      last_checked_at: integration.lastCheckedAt ?? null,
      last_sync_at: integration.lastSyncAt ?? null,
      last_error_code: integration.lastErrorCode ?? null,
      last_error_at: integration.lastErrorAt ?? null,
      settings_json: serializePublicCrmSettings(
        integration.provider,
        integration.settingsJson,
      ),
      created_at: integration.createdAt,
      updated_at: integration.updatedAt,
    };
  }

  private async getStoredIntegration(
    tenantId: string,
  ): Promise<StoredCrmIntegration> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId: scopedTenantId },
    });

    if (!integration) {
      throw new NotFoundException({
        message: 'CRM integration is not configured for this tenant',
        error: { code: 'crm_integration_not_configured' },
      });
    }

    return integration;
  }

  private createAdapterConfig(
    integration: StoredCrmIntegration,
  ): CrmAdapterConfig {
    return {
      provider: integration.provider as CrmProvider,
      apiToken: this.encryptionService.decrypt(integration.encryptedApiToken),
      baseUrl: integration.baseUrl,
      settings:
        (integration.settingsJson as Record<string, unknown> | null) ??
        undefined,
    };
  }

  private async loadConnectionPreview(
    tenantId: string,
    provider: CrmProvider,
    config: CrmAdapterConfig,
  ): Promise<CrmImportPreview> {
    const adapter = this.adapterFactory.create(provider, config);
    const check = await this.loadPreviewPart(provider, 'connection_check', () =>
      adapter.testConnection(tenantId),
    );

    if (!check.ok) {
      throw new Error('CRM connection check failed');
    }

    const [services, staff, team, company] = await Promise.all([
      this.loadPreviewPart(provider, 'services', () =>
        adapter.getServices(tenantId),
      ),
      this.loadPreviewPart(provider, 'staff', () => adapter.getStaff(tenantId)),
      this.loadPreviewPart(provider, 'team', () =>
        this.loadTeamMembers(adapter, tenantId),
      ),
      adapter.getCompanyProfile
        ? this.loadPreviewPart(provider, 'company_profile', () =>
            adapter.getCompanyProfile!(),
          )
        : Promise.resolve(null),
    ]);
    const settings = config.settings ?? {};
    const warnings: string[] = [];

    if (services.length === 0) {
      warnings.push('no_services_found');
    }
    if (staff.length === 0) {
      warnings.push('no_staff_found');
    }

    return {
      provider,
      company_id:
        typeof settings.companyId === 'number' ||
        typeof settings.companyId === 'string'
          ? settings.companyId
          : null,
      company,
      services: {
        count: services.length,
        items: services.slice(0, 30),
      },
      staff: {
        count: staff.length,
        items: staff.slice(0, 30),
      },
      team: {
        count: team.length,
        items: team.slice(0, 50),
      },
      warnings,
    };
  }

  private async loadTeamMembers(
    adapter: CRMAdapter,
    tenantId: string,
  ): Promise<CrmTeamMember[]> {
    if (adapter.getTeamMembers) {
      return adapter.getTeamMembers(tenantId);
    }

    return (await adapter.getStaff(tenantId)).map((member) => ({
      ...member,
      bookable: true,
      suggested_role: 'staff',
    }));
  }

  private async reconcileCrmTeamAccess(
    tenantId: string,
    team: CrmTeamMember[],
  ): Promise<void> {
    const accesses = await this.prisma.crmStaffAccess.findMany({
      where: { tenantId },
      select: {
        id: true,
        externalStaffId: true,
        userId: true,
        role: true,
        status: true,
        encryptedDisplayName: true,
        title: true,
      },
    });

    const teamById = new Map(team.map((member) => [String(member.id), member]));
    const activeIds = new Set(teamById.keys());
    const knownIds = new Set(accesses.map((access) => access.externalStaffId));

    // 🔴 Сопоставление идёт по паре (провайдер, внешний id), а не по голой
    // строке. Именно голое равенство позволяло при смене CRM отдать права
    // нового человека старому — достаточно было совпадения числового id.
    const provider = await this.providerOfTenant(tenantId);
    const links = await this.prisma.staffProviderLink.findMany({
      where: { tenantId, provider },
      select: { id: true, staffId: true, externalId: true, unlinkedAt: true },
    });
    const linkByExternal = new Map(
      links.map((link) => [link.externalId, link]),
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const access of accesses) {
        const member = teamById.get(access.externalStaffId);
        if (this.isOwnerAccessRole(access.role)) {
          if (member && access.title !== (member.title ?? null)) {
            await tx.crmStaffAccess.update({
              where: { id: access.id },
              data: { title: member.title ?? null },
            });
          }
          continue;
        }

        const present = activeIds.has(access.externalStaffId);
        const nextStatus = present
          ? access.userId
            ? 'active'
            : 'pending_contact'
          : 'disabled';

        if (
          access.status !== nextStatus ||
          (member && access.title !== (member.title ?? null))
        ) {
          await tx.crmStaffAccess.update({
            where: { id: access.id },
            data: {
              status: nextStatus,
              ...(member ? { title: member.title ?? null } : {}),
            },
          });
        }

        if (!access.userId) continue;
        if (present) {
          // Reactivate only an account that this CRM fence disabled earlier.
          // An unrelated manual membership suspension must remain in force.
          if (access.status !== 'disabled') continue;
          await tx.membership.updateMany({
            where: { tenantId, userId: access.userId, status: 'suspended' },
            data: { status: 'active' },
          });
          continue;
        }

        await tx.membership.updateMany({
          where: { tenantId, userId: access.userId, status: 'active' },
          data: { status: 'suspended' },
        });
        await tx.authSession.updateMany({
          where: {
            tenantId,
            userId: access.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokeReason: 'crm_staff_inactive',
          },
        });
      }

      // Связь, помеченную отвязанной, НЕ активируем молча: карточку с тем же
      // внешним id провайдер мог отдать другому человеку.
      for (const [externalId, link] of linkByExternal) {
        if (link.unlinkedAt === null && activeIds.has(externalId)) {
          await tx.staffProviderLink.update({
            where: { id: link.id },
            data: { syncedAt: now },
          });
        }
        if (link.unlinkedAt === null && !activeIds.has(externalId)) {
          await tx.staffProviderLink.update({
            where: { id: link.id },
            data: { unlinkedAt: now },
          });
        }
      }

      const newMembers = team.filter(
        (member) => !knownIds.has(String(member.id)),
      );
      for (const member of newMembers) {
        const externalId = String(member.id);
        const encryptedDisplayName = this.encryptionService.encrypt(
          member.name,
        );
        // 🔴 Порядок обязателен: идентичность → связь → грант. Грант без
        // staffId после cutover означает мастера, который не сможет войти.
        const existing = linkByExternal.get(externalId);
        const staffId =
          existing?.staffId ??
          (
            await tx.staff.create({
              data: {
                tenantId,
                encryptedDisplayName,
                title: member.title ?? null,
              },
              select: { id: true },
            })
          ).id;

        if (!existing) {
          await tx.staffProviderLink.create({
            data: { tenantId, staffId, provider, externalId },
          });
        }

        await tx.crmStaffAccess.create({
          data: {
            tenantId,
            staffId,
            externalStaffId: externalId,
            encryptedDisplayName,
            title: member.title ?? null,
            role:
              member.suggested_role === 'administrator'
                ? UserRole.ADMINISTRATOR
                : UserRole.STAFF,
            status: 'pending_contact' as const,
          },
        });
      }
    });
  }

  private isOwnerAccessRole(role: string): boolean {
    return new Set<string>([
      UserRole.TENANT_ADMIN,
      UserRole.TENANT_OWNER,
      UserRole.BUSINESS_OWNER,
    ]).has(role);
  }

  private crmStaffAccessDisabled(): UnauthorizedException {
    return new UnauthorizedException({
      message: 'CRM staff access is no longer active.',
      error: {
        code: 'crm_staff_access_disabled',
        message:
          '\u0414\u043e\u0441\u0442\u0443\u043f \u043a MAYA \u043e\u0442\u043a\u043b\u044e\u0447\u0451\u043d: \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0435 \u0430\u043a\u0442\u0438\u0432\u0435\u043d \u0432 CRM.',
      },
    });
  }

  private safeErrorCode(error: unknown): string {
    if (!error || typeof error !== 'object') return 'unknown';
    const candidate = error as {
      code?: unknown;
      response?: { error?: { code?: unknown } };
    };
    const value = candidate.response?.error?.code ?? candidate.code;
    return typeof value === 'string' ? value.slice(0, 64) : 'unavailable';
  }

  private async loadPreviewPart<T>(
    provider: CrmProvider,
    operation: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    try {
      return await loader();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = message.match(/\bstatus\s+(\d{3})\b/i)?.[1] ?? 'unknown';
      this.logger.warn(
        `CRM preview failed provider=${provider} operation=${operation} status=${status}`,
      );
      throw error;
    }
  }

  private async activateVerifiedIntegration(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const existing = await this.getStoredIntegration(scopedTenantId);

    if (!existing.verifiedAt) {
      throw new ConflictException({
        message: 'CRM credentials must be verified before activation',
        error: { code: 'crm_verification_required' },
      });
    }

    const integration = await this.prisma.$transaction(async (tx) => {
      const activated = await tx.crmIntegration.update({
        where: { tenantId: scopedTenantId },
        data: {
          status: CrmIntegrationStatus.ACTIVE,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      await tx.tenant.update({
        where: { id: scopedTenantId },
        data: { calendarSource: CalendarSource.EXTERNAL },
      });
      if ((existing.provider as CrmProvider) !== CrmProvider.MOCK) {
        const branding = await tx.brandingSettings.findUnique({
          where: { tenantId: scopedTenantId },
          select: { themeJson: true },
        });
        await tx.brandingSettings.upsert({
          where: { tenantId: scopedTenantId },
          create: {
            tenantId: scopedTenantId,
            themeJson: this.withRequestedBookingMode(
              branding?.themeJson,
              'live',
            ),
          },
          update: {
            themeJson: this.withRequestedBookingMode(
              branding?.themeJson,
              'live',
            ),
          },
        });
      }
      return activated;
    });

    return this.serializeIntegration(integration);
  }

  private withRequestedBookingMode(
    themeJson: unknown,
    mode: 'live' | 'preview',
  ) {
    const theme =
      themeJson && typeof themeJson === 'object' && !Array.isArray(themeJson)
        ? (themeJson as Record<string, unknown>)
        : {};
    const booking =
      theme.booking &&
      typeof theme.booking === 'object' &&
      !Array.isArray(theme.booking)
        ? (theme.booking as Record<string, unknown>)
        : {};

    return asJson({
      ...theme,
      booking: {
        ...booking,
        mode,
      },
    });
  }

  private async recordStoredConnectionFailure(
    tenantId: string,
    error: unknown,
  ): Promise<void> {
    const errorCode = this.classifyConnectionError(error);
    await this.prisma.crmIntegration
      .update({
        where: { tenantId },
        data: {
          status: CrmIntegrationStatus.ERROR,
          lastCheckedAt: new Date(),
          lastErrorCode: errorCode,
          lastErrorAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  private toSafeConnectionException(
    provider: CrmProvider,
    error: unknown,
  ): BadRequestException {
    const code = this.classifyConnectionError(error);
    const messages: Record<string, string> = {
      crm_credentials_rejected:
        'CRM отклонила данные доступа. Проверьте токен и права на филиал.',
      crm_company_not_found:
        'Филиал CRM не найден или недоступен для этого токена.',
      crm_provider_unreachable:
        'CRM временно недоступна. Попробуйте повторить подключение позже.',
      crm_platform_configuration_error:
        'Подключение CRM временно не настроено на стороне MAYA.',
      crm_connection_failed:
        'Не удалось проверить подключение к CRM. Данные не были сохранены.',
    };

    // 🔴 Причину пишем в лог. Раньше она молча превращалась в общий текст, и
    // когда салон говорил «CRM отклонила токен», в логах не было НИЧЕГО —
    // диагностировать было нечем. Токен сюда не попадает: логируем только
    // сообщение провайдера и класс ошибки.
    let detail = 'unknown';
    if (error instanceof Error) {
      detail = error.message;
    } else if (typeof error === 'string') {
      detail = error;
    } else if (error !== null && error !== undefined) {
      try {
        detail = JSON.stringify(error) || 'unknown';
      } catch {
        detail = 'unserializable_error';
      }
    }
    this.logger.warn(
      `CRM connection failed provider=${provider} code=${code} detail=${detail.slice(0, 300)}`,
    );

    return new BadRequestException({
      message: messages[code],
      error: { code, provider },
    });
  }

  private classifyConnectionError(error: unknown): string {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    const normalized = message.toLowerCase();

    if (/partner.?token|not configured|configuration/.test(normalized)) {
      return 'crm_platform_configuration_error';
    }
    if (
      /\b(401|403)\b|unauthor|forbidden|credential|token|авторизац|доступ|недостаточно прав/.test(
        normalized,
      )
    ) {
      return 'crm_credentials_rejected';
    }
    if (/\b404\b|company|branch|филиал|компани/.test(normalized)) {
      return 'crm_company_not_found';
    }
    if (
      /timeout|timed out|network|fetch failed|econn|недоступ/.test(normalized)
    ) {
      return 'crm_provider_unreachable';
    }

    return 'crm_connection_failed';
  }

  private resolveNextAction(status: string): string | null {
    if (status === 'active') {
      return null;
    }
    if (status === 'pending_activation') {
      return 'activate';
    }

    return 'reconnect';
  }

  private assertProviderCanBeTenantConnected(provider: CrmProvider): void {
    this.assertProviderConnectable(provider);
    const capability = getCrmProviderCapability(provider);

    if (
      process.env.NODE_ENV === 'production' &&
      capability.productionReady !== true
    ) {
      throw new BadRequestException({
        message: `${capability.name} cannot be connected in production`,
        error: {
          code: 'crm_provider_not_production_ready',
          provider,
        },
      });
    }
  }

  private assertProviderConnectable(provider: CrmProvider): void {
    const capability = getCrmProviderCapability(provider);

    if (capability?.connectable) {
      return;
    }

    throw new BadRequestException({
      message: capability
        ? `${capability.name} integration is not available yet`
        : 'Unknown CRM provider',
      error: {
        code: 'crm_provider_not_available',
        provider,
        implementation_status: capability?.implementationStatus ?? 'unknown',
        selectable_provider_keys: listConnectableCrmProviders(),
      },
    });
  }
}
