import { ActionExecutionState } from '@prisma/client';
import {
  assertCrmConfiguration,
  crmConfigurationVersion,
  crmExpectedVersion,
  crmOperationRequestId,
} from '../crm/crm-configuration-version';
import type { QualifiedConnectCrmIntegrationDto } from '../crm/dto/crm-operation.dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrmProvider } from '../common/domain.enums';

import type { Prisma } from '@prisma/client';
import { clientChannelSubjectHash } from '../crm/client-channel-subject';
import type { CurrentClientChannel } from '../crm/client-channel-authenticator.service';
import { CrmService } from '../crm/crm.service';
import { normalizeScheduleSlots } from '../crm/staff-schedule.utils';
import type { ConnectCrmIntegrationDto } from '../crm/dto/connect-crm-integration.dto';
import type { CreateCrmIntegrationDto } from '../crm/dto/create-crm-integration.dto';
import type { UpdateCrmIntegrationDto } from '../crm/dto/update-crm-integration.dto';
import {
  normalizeCrmBranchBinding,
  normalizeCrmProviderSettings,
} from '../crm/crm-provider-settings';
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

  /** Exact READ of the existing AE occurrence. Never builds or resumes an action. */
  async crmOperationStatus(
    tenantId: string,
    actor: Package5Wave3Actor,
    operation: 'install' | 'activate',
    requestIdValue: string,
  ) {
    const requestId = crmOperationRequestId(requestIdValue);
    if (operation !== 'install' && operation !== 'activate')
      throw new BadRequestException('CRM operation invalid');
    type Observation = Awaited<
      ReturnType<Package5Wave3ShadowService['readCrmOperation']>
    >;
    let first: Observation = null;
    let confirm: Observation = null;
    let unavailable = false;
    try {
      first = await this.planner.readCrmOperation(
        tenantId,
        actor,
        operation === 'install'
          ? 'install_crm_credentials'
          : 'activate_crm_integration',
        operation === 'install' ? requestId : `${requestId}:activate`,
      );
      if (operation === 'activate')
        confirm = await this.planner.readCrmOperation(
          tenantId,
          actor,
          'confirm_crm_import',
          `${requestId}:confirm`,
        );
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      unavailable = true;
    }
    const observed = confirm ?? first;
    const phase = observed ? (confirm ? 'confirm' : operation) : null;
    let status: 'NOT_OBSERVED' | 'READY' | 'SUCCEEDED' | 'UNAVAILABLE' =
      unavailable ? 'UNAVAILABLE' : observed ? 'READY' : 'NOT_OBSERVED';
    let reason: string | null = unavailable
      ? 'crm_operation_evidence_unavailable'
      : null;
    let receipt: {
      contract: 'maya.crm-operation-receipt/1';
      operation: 'install' | 'activate';
      requestId: string;
      phase: 'installed' | 'activated' | 'import_confirmed';
      configVersion: string;
      executionId: string;
      atomicProjection: boolean;
    } | null = null;
    if (observed && !unavailable) {
      const { execution, input } = observed;
      const safe = this.record(execution.safeResultSummaryJson);
      const committed = this.record(safe.crmCommit);
      const expectedPhase = confirm
        ? 'import_confirmed'
        : operation === 'install'
          ? 'installed'
          : 'activated';
      const qualified =
        typeof input.sourceIdentityHash === 'string' &&
        /^[a-f0-9]{64}$/.test(input.sourceIdentityHash);
      if (!qualified) {
        status = 'UNAVAILABLE';
        reason = 'crm_operation_unqualified';
      } else if (execution.state === ActionExecutionState.SUCCEEDED) {
        if (
          safe.actionExecutionId !== execution.id ||
          committed.contract !== 'maya.crm-config-commit/1' ||
          committed.phase !== expectedPhase ||
          typeof committed.configVersion !== 'string' ||
          !/^[a-f0-9]{64}$/.test(committed.configVersion) ||
          committed.atomicProjection !== Boolean(confirm)
        ) {
          status = 'UNAVAILABLE';
          reason = 'crm_operation_unqualified';
        } else {
          receipt = {
            contract: 'maya.crm-operation-receipt/1',
            operation,
            requestId,
            phase: expectedPhase,
            configVersion: committed.configVersion,
            executionId: execution.id,
            atomicProjection: Boolean(confirm),
          };
          status = operation === 'install' || confirm ? 'SUCCEEDED' : 'READY';
          reason =
            status === 'READY' ? 'crm_import_confirmation_pending' : null;
        }
      } else if (execution.state !== ActionExecutionState.READY) {
        status = 'UNAVAILABLE';
        reason = 'crm_operation_not_resumable';
      }
    }
    // Resolve current authority once more after every awaited receipt/current read.
    const currentIntegration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
    });
    await this.planner.assertCrmOperationActor(tenantId, actor);
    const configVersion = crmConfigurationVersion(currentIntegration);
    return {
      contract: 'maya.crm-operation-status/1' as const,
      operation,
      requestId,
      status,
      phase,
      receipt,
      current: {
        configVersion,
        matchesCurrentVersion:
          receipt !== null && receipt.configVersion === configVersion,
      },
      reason,
    };
  }

  async installQualifiedCrmCredentials(
    tenantId: string,
    actor: Package5Wave3Actor,
    dto: QualifiedConnectCrmIntegrationDto,
    idempotencyKey?: string,
  ) {
    const requestId = crmOperationRequestId(idempotencyKey);
    const expectedVersion = crmExpectedVersion(dto.expectedVersion, true);
    const token = dto.apiToken?.trim();
    if (!token)
      throw new BadRequestException({
        message: 'Explicit credential required for installation',
        error: { code: 'crm_credential_required' },
      });
    // Qualified request material is self-contained, never merged with a later connection.
    const settings = normalizeCrmProviderSettings(
      dto.provider,
      dto.settingsJson ?? {},
    );
    const command: Package5Wave3Command = {
      operation: 'install_crm_credentials',
      sourceIntentRef: requestId,
      expectedVersion,
      provider: dto.provider,
      encryptedApiToken: this.encryption.encrypt(token),
      credentialFingerprint: this.encryption.opaqueReference(
        'package5.wave3.crm-credential',
        `${dto.provider}\0${token}`,
      ),
      baseUrl: null,
      settingsJson: settings,
    };
    let prepared = await this.planner.build(
      tenantId,
      actor,
      command,
      'execute',
    );
    if (prepared.existingExecution?.state !== ActionExecutionState.SUCCEEDED) {
      // Provider observation is ephemeral and occurs before AE admission. Failure
      // here intentionally remains NOT_OBSERVED; recovery never invents a receipt.
      await this.crm.previewCredentials(dto.provider, token, settings, null);
      const current = await this.prisma.crmIntegration.findUnique({
        where: { tenantId },
      });
      if (crmConfigurationVersion(current) !== expectedVersion) {
        // A same-key caller may have committed while this original preview was
        // awaiting transport. Re-read exactly that owner receipt once; changed
        // actor/material/expired payload still refuse in the existing planner.
        const observed = await this.planner.build(
          tenantId,
          actor,
          command,
          'execute',
        );
        if (
          observed.existingExecution?.state !== ActionExecutionState.SUCCEEDED
        )
          assertCrmConfiguration(current, expectedVersion);
        prepared = observed;
      }
    }
    await this.executor.execute(prepared);
    const outcome = await this.crmOperationStatus(
      tenantId,
      actor,
      'install',
      requestId,
    );
    const current = await this.crm.getIntegrationStatus(tenantId);
    await this.planner.assertCrmOperationActor(tenantId, actor);
    const configVersion = current.connection?.configVersion ?? null;
    return {
      ...outcome,
      configured: current.configured,
      connection: current.connection,
      current: {
        configVersion,
        matchesCurrentVersion:
          outcome.receipt !== null &&
          outcome.receipt.configVersion === configVersion,
      },
    };
  }

  async activateQualifiedCrmIntegration(
    tenantId: string,
    actor: Package5Wave3Actor,
    expectedVersionValue: string,
    idempotencyKey?: string,
  ) {
    const requestId = crmOperationRequestId(idempotencyKey);
    const expectedVersion = crmExpectedVersion(expectedVersionValue)!;
    const first = await this.planner.readCrmOperation(
      tenantId,
      actor,
      'activate_crm_integration',
      `${requestId}:activate`,
    );
    const confirmed = await this.planner.readCrmOperation(
      tenantId,
      actor,
      'confirm_crm_import',
      `${requestId}:confirm`,
    );
    for (const observed of [first, confirmed])
      if (observed && observed.input.sourceIdentityHash !== expectedVersion)
        throw new ConflictException({
          message: 'Operation configuration version differs',
          error: { code: 'crm_config_version_changed' },
        });
    if (confirmed?.execution.state !== ActionExecutionState.SUCCEEDED) {
      assertCrmConfiguration(
        await this.prisma.crmIntegration.findUnique({ where: { tenantId } }),
        expectedVersion,
      );
      await this.execute(
        tenantId,
        actor,
        { operation: 'activate_crm_integration', expectedVersion },
        `${requestId}:activate`,
      );
      await this.execute(
        tenantId,
        actor,
        { operation: 'confirm_crm_import', expectedVersion },
        `${requestId}:confirm`,
      );
    }
    const outcome = await this.crmOperationStatus(
      tenantId,
      actor,
      'activate',
      requestId,
    );
    const current = await this.crm.getIntegrationStatus(tenantId);
    await this.planner.assertCrmOperationActor(tenantId, actor);
    const configVersion = current.connection?.configVersion ?? null;
    return {
      ...outcome,
      configured: current.configured,
      connection: current.connection,
      current: {
        configVersion,
        matchesCurrentVersion:
          outcome.receipt !== null &&
          outcome.receipt.configVersion === configVersion,
      },
    };
  }

  async updateExternalStaffScheduleDay(
    tenantId: string,
    actor: Package5Wave3Actor,
    input: {
      externalStaffId: string;
      /** Original local identity from the immutable server-owned approval. */
      localStaffId?: string;
      sourceHash?: string;
      localDate: string;
      expectedProviderRevision: string;
      slots: StaffDaySlot[];
    },
    idempotencyKey?: string,
  ) {
    const { externalStaffId, localDate } = input;
    const commandSlots = input.slots.map((slot) => ({ ...slot }));
    let staffId = input.localStaffId;
    if (staffId === undefined) {
      // Compatibility for historical unqualified callers only. A qualified
      // retry must reach the existing durable owner before current CRM lookup.
      const integration = await this.prisma.crmIntegration.findUnique({
        where: { tenantId },
        select: { provider: true },
      });
      if (!integration) throw new NotFoundException('CRM integration missing');
      const links = await this.prisma.staffProviderLink.findMany({
        where: {
          tenantId,
          provider: integration.provider,
          externalId: externalStaffId,
          unlinkedAt: null,
        },
        take: 2,
        select: { staffId: true },
      });
      if (links.length !== 1)
        throw new ConflictException('Exact provider staff identity unresolved');
      staffId = links[0].staffId;
    } else if (
      typeof staffId !== 'string' ||
      staffId.length < 1 ||
      staffId.length > 128 ||
      /[^A-Za-z0-9_-]/.test(staffId)
    ) {
      throw new BadRequestException('Exact local staff identity required');
    }
    const result = await this.execute(
      tenantId,
      { userId: actor.userId },
      {
        operation: 'update_staff_schedule_day',
        staffId,
        localDate,
        expectedProviderRevision: input.expectedProviderRevision,
        slots: commandSlots,
        ...(input.sourceHash !== undefined
          ? { sourceIdentityHash: input.sourceHash }
          : {}),
      },
      idempotencyKey,
    );
    // The executor resolves only a canonical successful receipt; its planner
    // checks exact request material on replay. This is the confirmed command,
    // not a fresh observation of a potentially different CRM configuration.
    const slots = normalizeScheduleSlots(commandSlots);
    const verified = {
      date: localDate,
      is_working: slots.length > 0,
      slots,
      verification_basis: 'confirmed_execution' as const,
    };
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
    const binding = normalizeCrmBranchBinding(
      settings.branchBinding,
      settings.companyId,
    );
    if (
      binding &&
      !(await this.prisma.branch.findFirst({
        where: { id: binding.branchId, tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('CRM branch binding target not found');
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
    const subjectHash = clientChannelSubjectHash(
      this.encryption,
      'maya_user',
      userId,
    );
    const link = await this.prisma.clientChannelLink.findFirst({
      where: {
        tenantId,
        provider: 'maya_user',
        providerSubjectHash: subjectHash,
        revokedAt: null,
      },
    });
    if (!link || link.clientId !== clientId)
      throw new ForbiddenException('Verified Client binding required');
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { user: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active'
    )
      throw new ForbiddenException('Current Maya account required');
    return this.recordChannelConsent(
      tenantId,
      { userId, provider: 'maya_user', providerSubjectHash: subjectHash },
      kind,
      granted,
      occurredAt,
      idempotencyKey,
    );
  }

  async recordChannelConsent(
    tenantId: string,
    channel: Pick<
      CurrentClientChannel,
      'userId' | 'provider' | 'providerSubjectHash'
    >,
    kind: 'privacy' | 'marketing',
    granted: boolean,
    occurredAt: Date,
    idempotencyKey: string,
    recheckChannel?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    this.tenantContext.assertTenantId(tenantId);
    const links = await this.prisma.clientChannelLink.findMany({
      where: {
        tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (links.length !== 1)
      throw new ForbiddenException('client_link_required');
    const link = links[0];
    const source = `${this.intentRef(idempotencyKey)}:consent:${kind}`;
    return this.execute(
      tenantId,
      {
        userId: channel.userId,
        consentChannel: {
          linkId: link.id,
          provider: channel.provider,
          providerSubjectHash: link.providerSubjectHash,
          verificationEvidenceHash: link.verificationEvidenceHash,
        },
        recheckChannel,
      },
      {
        operation: 'record_client_consent',
        clientId: link.clientId,
        kind,
        decision: granted ? 'grant' : 'revoke',
        occurredAt,
        effectiveAt: occurredAt,
        sourceIdentityHash: this.encryption.opaqueReference(
          'package5.wave3.client-consent',
          `${tenantId}\0${link.clientId}\0${source}`,
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
