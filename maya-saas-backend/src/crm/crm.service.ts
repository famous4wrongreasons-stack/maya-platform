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
  RescheduledAppointment,
} from './crm-adapter.interface';
import {
  getCrmProviderCapability,
  listConnectableCrmProviders,
} from './crm-provider-catalog';
import { CreateCrmIntegrationDto } from './dto/create-crm-integration.dto';
import { UpdateCrmIntegrationDto } from './dto/update-crm-integration.dto';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly adapterFactory: CrmAdapterFactory,
    private readonly tenantContext: TenantContextService,
    private readonly internalCalendarService: InternalCalendarService,
  ) {}

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
    const providerChanged = Boolean(
      existing && String(existing.provider) !== String(provider),
    );
    const settingsJson =
      dto.settingsJson ??
      (existing?.settingsJson as Record<string, unknown> | null) ??
      undefined;

    this.validateProviderConfiguration(provider, settingsJson);

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

    const integration = existing
      ? await this.prisma.crmIntegration.update({
          where: { tenantId: scopedTenantId },
          data: {
            provider,
            encryptedApiToken,
            baseUrl: dto.baseUrl ?? existing.baseUrl,
            status: dto.status ?? existing.status,
            settingsJson: settingsJson ? asJson(settingsJson) : undefined,
          },
        })
      : await this.prisma.crmIntegration.create({
          data: {
            tenantId: scopedTenantId,
            provider,
            encryptedApiToken,
            baseUrl: dto.baseUrl,
            status: dto.status ?? CrmIntegrationStatus.ACTIVE,
            settingsJson: settingsJson ? asJson(settingsJson) : undefined,
          },
        });

    return this.serializeIntegration(integration);
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

    const adapter = await this.getAdapterForTenant(scopedTenantId);
    return adapter.testConnection(scopedTenantId);
  }

  private async getAdapterForTenant(tenantId: string): Promise<CRMAdapter> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId: scopedTenantId },
    });

    if (!integration) {
      throw new NotFoundException(
        'CRM integration is not configured for this tenant',
      );
    }

    this.assertProviderConnectable(integration.provider as CrmProvider);

    return this.adapterFactory.create(integration.provider as CrmProvider, {
      provider: integration.provider as CrmProvider,
      apiToken: this.encryptionService.decrypt(integration.encryptedApiToken),
      baseUrl: integration.baseUrl,
      settings:
        (integration.settingsJson as Record<string, unknown> | null) ??
        undefined,
    });
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
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: integration.id,
      tenant_id: integration.tenantId,
      provider: integration.provider,
      base_url: integration.baseUrl,
      status: integration.status,
      settings_json: integration.settingsJson ?? {},
      created_at: integration.createdAt,
      updated_at: integration.updatedAt,
    };
  }

  private validateProviderConfiguration(
    provider: CrmProvider,
    settingsJson?: Record<string, unknown>,
  ) {
    if (provider !== CrmProvider.YCLIENTS && provider !== CrmProvider.ALTEGIO) {
      return;
    }

    const companyId = settingsJson?.companyId;

    if (companyId === undefined || companyId === null || companyId === '') {
      throw new BadRequestException(
        'YClients/Altegio integration requires settingsJson.companyId',
      );
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
