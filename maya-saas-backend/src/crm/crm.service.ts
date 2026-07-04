import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CrmIntegrationStatus, CrmProvider } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import {
  CancelledAppointment,
  CRMAdapter,
  CreatedAppointment,
} from './crm-adapter.interface';
import { CreateCrmIntegrationDto } from './dto/create-crm-integration.dto';
import { UpdateCrmIntegrationDto } from './dto/update-crm-integration.dto';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly adapterFactory: CrmAdapterFactory,
  ) {}

  async createOrUpdateIntegration(
    tenantId: string,
    dto: CreateCrmIntegrationDto | UpdateCrmIntegrationDto,
  ) {
    const existing = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
    });
    const provider = (dto.provider ??
      existing?.provider ??
      CrmProvider.MOCK) as CrmProvider;
    const settingsJson =
      dto.settingsJson ??
      (existing?.settingsJson as Record<string, unknown> | null) ??
      undefined;

    this.validateProviderConfiguration(provider, settingsJson);

    const resolvedApiToken =
      dto.apiToken ??
      (provider === CrmProvider.MOCK && !existing?.encryptedApiToken
        ? 'mock'
        : undefined);
    const encryptedApiToken = resolvedApiToken
      ? this.encryptionService.encrypt(resolvedApiToken)
      : existing?.encryptedApiToken;

    if (!encryptedApiToken) {
      throw new NotFoundException('CRM API token is required');
    }

    const integration = existing
      ? await this.prisma.crmIntegration.update({
          where: { tenantId },
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
            tenantId,
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
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.getServices(tenantId);
  }

  async getStaff(tenantId: string) {
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.getStaff(tenantId);
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
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.getAvailableSlots({
      tenantId,
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
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.createAppointment({
      tenantId,
      ...params,
    });
  }

  async cancelAppointment(
    tenantId: string,
    externalId: string,
  ): Promise<CancelledAppointment> {
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.cancelAppointment({
      tenantId,
      externalId,
    });
  }

  async getClientAppointments(tenantId: string, clientId: string) {
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.getClientAppointments(clientId);
  }

  async testConnection(tenantId: string) {
    const adapter = await this.getAdapterForTenant(tenantId);
    return adapter.testConnection(tenantId);
  }

  private async getAdapterForTenant(tenantId: string): Promise<CRMAdapter> {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
    });

    if (!integration) {
      throw new NotFoundException(
        'CRM integration is not configured for this tenant',
      );
    }

    return this.adapterFactory.create(integration.provider as CrmProvider, {
      provider: integration.provider as CrmProvider,
      apiToken: this.encryptionService.decrypt(integration.encryptedApiToken),
      baseUrl: integration.baseUrl,
      settings:
        (integration.settingsJson as Record<string, unknown> | null) ??
        undefined,
    });
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
}
