import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CalendarSource,
  CrmIntegrationStatus,
  CrmProvider,
} from '../common/domain.enums';
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
  CrmAdapterConfig,
  CrmCompanyProfile,
  RescheduledAppointment,
  ServiceItem,
  StaffMember,
} from './crm-adapter.interface';
import {
  getCrmProviderCapability,
  listConnectableCrmProviders,
} from './crm-provider-catalog';
import { CreateCrmIntegrationDto } from './dto/create-crm-integration.dto';
import { ConnectCrmIntegrationDto } from './dto/connect-crm-integration.dto';
import { UpdateCrmIntegrationDto } from './dto/update-crm-integration.dto';
import { DiscoverCrmCompaniesDto } from './dto/discover-crm-companies.dto';
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
  warnings: string[];
};

@Injectable()
export class CrmService {
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

  async activateIntegration(tenantId: string) {
    const preview = await this.getImportPreview(tenantId);
    const connection = await this.activateVerifiedIntegration(tenantId);

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

  async getClientAppointments(tenantId: string, clientId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (
      (await this.getCalendarSource(scopedTenantId)) === CalendarSource.INTERNAL
    ) {
      return [];
    }

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.getClientAppointments(clientId);
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
    const check = await adapter.testConnection(tenantId);

    if (!check.ok) {
      throw new Error('CRM connection check failed');
    }

    const [services, staff, company] = await Promise.all([
      adapter.getServices(tenantId),
      adapter.getStaff(tenantId),
      adapter.getCompanyProfile
        ? adapter.getCompanyProfile()
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
      warnings,
    };
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
      return activated;
    });

    return this.serializeIntegration(integration);
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
