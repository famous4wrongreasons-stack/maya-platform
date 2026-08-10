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
  CalendarSource,
  CrmIntegrationStatus,
  CrmProvider,
  UserRole,
} from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { asJson } from '../common/json.util';
import { EncryptionService } from '../encryption/encryption.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import {
  CancelledAppointment,
  CRMAdapter,
  CreatedAppointment,
  AppliedStaffScheduleDayChange,
  CrmAdapterConfig,
  CrmAppointmentDetail,
  CrmCompanyProfile,
  CrmClientReturnCandidate,
  CrmClientVisitInsight,
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

type CrmConnectionInput = {
  provider?: CrmProvider;
  apiToken?: string;
  baseUrl?: string;
  settingsJson?: Record<string, unknown>;
};

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly adapterFactory: CrmAdapterFactory,
    private readonly tenantContext: TenantContextService,
    private readonly internalCalendarService: InternalCalendarService,
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

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { defaultTimezone: timezone },
    });
    this.logger.log(`Tenant timezone set from CRM: ${timezone}`);
  }

  async activateIntegration(tenantId: string) {
    const preview = await this.getImportPreview(tenantId);
    const connection = await this.activateVerifiedIntegration(tenantId);
    await this.syncTenantTimezoneFromCrm(
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
      const team = await this.loadTeamMembers(adapter, scopedTenantId);
      await this.reconcileCrmTeamAccess(scopedTenantId, team);

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

  async disconnectIntegration(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const existing = await this.getStoredIntegration(scopedTenantId);

    await this.prisma.crmIntegration.delete({
      where: { tenantId: scopedTenantId },
    });

    return {
      configured: false,
      disconnected_provider: existing.provider,
      connection: null,
      next_action: 'connect',
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
        externalStaffId: true,
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
    params: {
      clientId: string;
      clientName: string;
      clientPhone?: string | null;
      branchId?: string | null;
      staffId: string;
      serviceIds: string[];
      start: string;
      notes?: string | null;
      allowBusy?: boolean;
      durationMinutes?: number;
    },
  ): Promise<CreatedAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.createAppointment({
      tenantId: scopedTenantId,
      ...params,
    });
  }

  async cancelAppointment(
    tenantId: string,
    externalId: string,
  ): Promise<CancelledAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.cancelAppointment({
      tenantId: scopedTenantId,
      externalId,
    });
  }

  async rescheduleAppointment(
    tenantId: string,
    params: {
      externalId: string;
      start: string;
      staffId?: string;
      serviceIds?: string[];
      notes?: string | null;
    },
  ): Promise<RescheduledAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertExternalSource(scopedTenantId);
    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.rescheduleAppointment({
      tenantId: scopedTenantId,
      ...params,
    });
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
      timezone: tenant?.defaultTimezone ?? 'Europe/Moscow',
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

    if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        message: 'CRM journal range must not exceed 31 days.',
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
      timezone: tenant?.defaultTimezone ?? 'Europe/Moscow',
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

    return tenant?.defaultTimezone ?? 'Europe/Moscow';
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
  private async journalStaffBinding(
    tenantId: string,
    actor: AuthenticatedUser,
  ): Promise<string | null> {
    if (CrmService.JOURNAL_FULL_ACCESS_ROLES.has(actor.role)) {
      return null;
    }

    const access = await this.prisma.crmStaffAccess.findFirst({
      where: { tenantId, userId: actor.userId },
      select: { externalStaffId: true, status: true },
    });

    // Нет активной привязки к мастеру в CRM — значит и своих визитов нет.
    if (!access || access.status !== 'active') {
      throw this.journalRecordForbidden();
    }

    return access.externalStaffId;
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

    if (!ownerStaffId || String(ownerStaffId) !== String(boundStaffId)) {
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

    if (
      boundStaffId !== null &&
      String(detail.provider.id) !== String(boundStaffId)
    ) {
      throw this.journalRecordForbidden();
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
    attendance: number,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(scopedTenantId, actor, externalId);

    if (![1, 0, -1].includes(attendance)) {
      throw new BadRequestException({
        message: 'CRM attendance must be one of 1, 0, -1.',
        error: { code: 'crm_attendance_invalid' },
      });
    }

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
  ): Promise<RescheduledAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(
      scopedTenantId,
      actor,
      params.externalId,
    );

    return this.rescheduleAppointment(scopedTenantId, params);
  }

  /** Отмена визита из журнала — под тем же стражем. */
  async cancelJournalAppointment(
    tenantId: string,
    actor: AuthenticatedUser,
    externalId: string,
  ): Promise<CancelledAppointment> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertJournalRecordAccess(scopedTenantId, actor, externalId);

    return this.cancelAppointment(scopedTenantId, externalId);
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

  async getClientVisitHistory(
    tenantId: string,
    clientId: string,
    limit = 50,
  ): Promise<CrmClientVisitInsight[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'getClientVisitHistory',
      'crm_client_history_not_supported',
    );

    return adapter.getClientVisitHistory({
      tenantId: scopedTenantId,
      clientId,
      timezone: await this.tenantTimezone(scopedTenantId),
      limit,
    });
  }

  async getClientReturnCandidates(
    tenantId: string,
    limit = 50,
  ): Promise<CrmClientReturnCandidate[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const adapter = await this.getVisitCapableAdapter(
      scopedTenantId,
      'getClientReturnCandidates',
      'crm_client_return_not_supported',
    );

    return adapter.getClientReturnCandidates({
      tenantId: scopedTenantId,
      timezone: await this.tenantTimezone(scopedTenantId),
      limit,
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

    if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        message: 'CRM finance range must not exceed 31 days.',
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
      timezone: tenant?.defaultTimezone ?? 'Europe/Moscow',
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
      timezone: tenant?.defaultTimezone ?? 'Europe/Moscow',
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
    return adapter.getClientLoyalty({
      tenantId: scopedTenantId,
      phone,
    });
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

    return this.adapterFactory.create(
      integration.provider as CrmProvider,
      this.createAdapterConfig(integration),
    );
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

      const newMembers = team.filter(
        (member) => !knownIds.has(String(member.id)),
      );
      if (newMembers.length) {
        await tx.crmStaffAccess.createMany({
          data: newMembers.map((member) => ({
            tenantId,
            externalStaffId: String(member.id),
            encryptedDisplayName: this.encryptionService.encrypt(member.name),
            title: member.title ?? null,
            role:
              member.suggested_role === 'administrator'
                ? UserRole.ADMINISTRATOR
                : UserRole.STAFF,
            status: 'pending_contact' as const,
          })),
          skipDuplicates: true,
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
