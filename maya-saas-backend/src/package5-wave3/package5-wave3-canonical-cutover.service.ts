import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrmProvider } from '../common/domain.enums';

import { CrmService } from '../crm/crm.service';
import type { ConnectCrmIntegrationDto } from '../crm/dto/connect-crm-integration.dto';
import type { CreateCrmIntegrationDto } from '../crm/dto/create-crm-integration.dto';
import type { UpdateCrmIntegrationDto } from '../crm/dto/update-crm-integration.dto';
import { normalizeCrmProviderSettings } from '../crm/crm-provider-settings';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3Actor,
  type Package5Wave3Command,
  type Package5Wave3ExecutionValue,
  type StaffDaySlot,
} from './package5-wave3.service';
import { Package5Wave3ProductionGatewayService } from './package5-wave3-production-gateway.service';

type CommandWithoutSource = Package5Wave3Command extends infer Command
  ? Command extends Package5Wave3Command
    ? Omit<Command, 'sourceIntentRef'>
    : never
  : never;

const SAFE_OCCURRENCE_ID = /^[A-Za-z0-9._:-]{8,240}$/;

@Injectable()
export class Package5Wave3CanonicalCutoverService {
  constructor(
    private readonly planner: Package5Wave3ShadowService,
    private readonly executor: Package5Wave3ExecutableService,
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
    private readonly gateway: Package5Wave3ProductionGatewayService,
  ) {}

  async execute(
    tenantId: string,
    actor: Package5Wave3Actor,
    command: CommandWithoutSource,
    idempotencyKey?: string,
  ): Promise<Package5Wave3ExecutionValue> {
    const prepared = await this.planner.build(
      tenantId,
      actor,
      { ...command, sourceIntentRef: this.intentRef(idempotencyKey) },
      'execute',
    );
    return prepared.existingExecution
      ? this.executor.resume(prepared)
      : this.executor.execute(prepared);
  }

  async updateExternalStaffScheduleDay(
    tenantId: string,
    actor: Package5Wave3Actor,
    input: {
      externalStaffId: string;
      localDate: string;
      expectedProviderRevision: string;
      slots: StaffDaySlot[];
    },
    idempotencyKey?: string,
  ) {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { provider: true },
    });
    if (!integration) throw new NotFoundException('CRM integration missing');
    const links = await this.prisma.staffProviderLink.findMany({
      where: {
        tenantId,
        provider: integration.provider,
        externalId: input.externalStaffId,
        unlinkedAt: null,
      },
      take: 2,
      select: { staffId: true },
    });
    if (links.length !== 1)
      throw new ConflictException('Exact provider staff identity unresolved');
    const result = await this.execute(
      tenantId,
      { userId: actor.userId },
      {
        operation: 'update_staff_schedule_day',
        staffId: links[0].staffId,
        localDate: input.localDate,
        expectedProviderRevision: input.expectedProviderRevision,
        slots: input.slots,
      },
      idempotencyKey,
    );
    const verified = await this.crm.getStaffScheduleDay(tenantId, {
      staffId: input.externalStaffId,
      date: input.localDate,
    });
    return { result, verified };
  }

  async installCrmCredentials(
    tenantId: string,
    actor: Package5Wave3Actor,
    dto:
      | ConnectCrmIntegrationDto
      | CreateCrmIntegrationDto
      | UpdateCrmIntegrationDto,
    idempotencyKey?: string,
  ) {
    const existing = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
    });
    const provider = (dto.provider ?? existing?.provider) as
      CrmProvider | undefined;
    const providerChanged = Boolean(
      existing && String(existing.provider) !== String(provider),
    );
    const apiToken =
      dto.apiToken?.trim() ||
      (existing && !providerChanged
        ? this.encryption.decrypt(existing.encryptedApiToken)
        : '');
    if (!provider || !apiToken)
      throw new BadRequestException(
        'Exact CRM provider and API token required',
      );
    const previousSettings =
      existing?.settingsJson &&
      typeof existing.settingsJson === 'object' &&
      !Array.isArray(existing.settingsJson)
        ? (existing.settingsJson as Record<string, unknown>)
        : {};
    const settings = normalizeCrmProviderSettings(provider, {
      ...(providerChanged ? {} : previousSettings),
      ...(dto.settingsJson ?? {}),
    });
    const baseUrl =
      ('baseUrl' in dto ? dto.baseUrl : undefined) ??
      (providerChanged ? null : (existing?.baseUrl ?? null));
    const preview = await this.crm.previewCredentials(
      provider,
      apiToken,
      settings,
      baseUrl,
    );
    await this.execute(
      tenantId,
      { userId: actor.userId },
      {
        operation: 'install_crm_credentials',
        provider,
        encryptedApiToken: this.encryption.encrypt(apiToken),
        credentialFingerprint: this.encryption.opaqueReference(
          'package5.wave3.crm-credential',
          `${provider}\0${apiToken}`,
        ),
        baseUrl,
        settingsJson: settings,
      },
      idempotencyKey,
    );
    const status = await this.crm.getIntegrationStatus(tenantId);
    if (!status.connection)
      throw new ConflictException('Canonical CRM credential install missing');
    return { connection: status.connection, preview, next_action: 'activate' };
  }

  async activateCrmIntegration(
    tenantId: string,
    actor: Package5Wave3Actor,
    idempotencyKey?: string,
  ) {
    const base = this.intentRef(idempotencyKey);
    const current = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('CRM integration missing');
    if (current.status === 'pending_activation') {
      await this.execute(
        tenantId,
        { userId: actor.userId },
        { operation: 'activate_crm_integration' },
        `${base}:activate`,
      );
    } else if (current.status !== 'active') {
      throw new ConflictException('CRM integration is not activatable');
    }
    await this.execute(
      tenantId,
      { userId: actor.userId },
      { operation: 'confirm_crm_import' },
      `${base}:confirm`,
    );
    const integration = await this.prisma.crmIntegration.findUniqueOrThrow({
      where: { tenantId },
      select: { settingsJson: true },
    });
    const settings = this.record(integration.settingsJson);
    const snapshotHash = settings.acceptedImportSnapshotHash;
    if (typeof snapshotHash !== 'string')
      throw new ConflictException('Accepted CRM import snapshot missing');
    const projected = await this.gateway.projectConfirmedImport(
      tenantId,
      snapshotHash,
    );
    const status = await this.crm.getIntegrationStatus(tenantId);
    if (!status.connection)
      throw new ConflictException('Canonical CRM activation missing');
    return {
      connection: status.connection,
      preview: projected.preview,
      next_action: null,
    };
  }

  async disconnectCrmIntegration(
    tenantId: string,
    actor: Package5Wave3Actor,
    idempotencyKey?: string,
  ) {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { provider: true },
    });
    if (!integration) throw new NotFoundException('CRM integration missing');
    await this.execute(
      tenantId,
      { userId: actor.userId },
      { operation: 'disconnect_crm_integration' },
      idempotencyKey,
    );
    return { disconnected: true, disconnected_provider: integration.provider };
  }

  async updateClientLocale(
    tenantId: string,
    userId: string,
    clientId: string,
    preferredLocale: string | null,
    idempotencyKey: string,
  ) {
    return this.execute(
      tenantId,
      { userId },
      { operation: 'update_client_profile', clientId, preferredLocale },
      `${this.intentRef(idempotencyKey)}:locale`,
    );
  }

  async recordClientConsent(
    tenantId: string,
    userId: string,
    clientId: string,
    kind: 'privacy' | 'marketing',
    granted: boolean,
    occurredAt: Date,
    idempotencyKey: string,
  ) {
    const source = `${this.intentRef(idempotencyKey)}:consent:${kind}`;
    return this.execute(
      tenantId,
      { userId },
      {
        operation: 'record_client_consent',
        clientId,
        kind,
        decision: granted ? 'grant' : 'revoke',
        occurredAt,
        effectiveAt: occurredAt,
        sourceIdentityHash: this.encryption.opaqueReference(
          'package5.wave3.client-consent',
          `${tenantId}\0${clientId}\0${source}`,
        ),
      },
      source,
    );
  }

  async updateClientNotes(
    tenantId: string,
    actorUserId: string,
    clientId: string,
    notes: string | null,
    idempotencyKey?: string,
  ) {
    const normalized = notes?.trim() || null;
    return this.execute(
      tenantId,
      { userId: actorUserId },
      {
        operation: 'update_client_notes',
        clientId,
        encryptedNotes: normalized ? this.encryption.encrypt(normalized) : null,
        notesFingerprint: this.encryption.opaqueReference(
          'package5.wave3.client-notes',
          normalized ?? '__empty__',
        ),
      },
      idempotencyKey,
    );
  }

  intentRef(value?: string) {
    const normalized =
      value?.trim() || this.tenantContext.get()?.requestId?.trim() || '';
    if (!SAFE_OCCURRENCE_ID.test(normalized))
      throw new BadRequestException(
        'A bounded idempotency identity is required',
      );
    return normalized;
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
