import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ActionExecutionPreviewV1,
  ExecutionResultV1,
} from '../action-engine';
import { actionExecutionResultFromError } from '../action-engine';
import { CrmProvider } from '../common/domain.enums';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  AppointmentActionInvocation,
  CreateAppointmentRequest,
  RescheduleAppointmentRequest,
} from './crm.service';
import { CrmService } from './crm.service';
import {
  type LegacyAppointmentAction,
  type LegacyAppointmentBridgeDto,
  type LegacyAppointmentOrigin,
  type LegacyAppointmentOutcomeDto,
} from './dto/legacy-appointment-bridge.dto';

const LEGACY_APPOINTMENT_BRIDGE_RESULT_CONTRACT =
  'maya.legacy-appointment-bridge-result/1' as const;
const LEGACY_APPOINTMENT_SHADOW_OBSERVATION_CONTRACT =
  'maya.legacy-appointment-shadow-observation/1' as const;

const EXECUTION_ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
const SUPPORTED_PROVIDERS = new Set<string>([
  CrmProvider.YCLIENTS,
  CrmProvider.ALTEGIO,
]);

const ORIGIN_ACTIONS: Record<
  LegacyAppointmentOrigin,
  ReadonlySet<LegacyAppointmentAction>
> = {
  client_record_actions: new Set([
    'reschedule_appointment',
    'cancel_appointment',
  ]),
  'webhook.loyalty': new Set(['create_appointment']),
  'webhook.chat': new Set(['create_appointment']),
  'webhook.panel': new Set([
    'create_appointment',
    'reschedule_appointment',
    'cancel_appointment',
  ]),
  'telegram.bot': new Set(['create_appointment', 'cancel_appointment']),
  claude_ai: new Set(['reschedule_appointment', 'cancel_appointment']),
};

type ParsedAction =
  | { action: 'create_appointment'; params: CreateAppointmentRequest }
  | { action: 'reschedule_appointment'; params: RescheduleAppointmentRequest }
  | { action: 'cancel_appointment'; externalId: string };

export interface LegacyAppointmentBridgeShadowResult {
  contract: typeof LEGACY_APPOINTMENT_BRIDGE_RESULT_CONTRACT;
  accepted: true;
  mode: 'shadow';
  tenant_resolution: 'integration';
  preview: ActionExecutionPreviewV1;
  legacy_outcome?: LegacyAppointmentOutcomeDto;
  bridge_external_side_effects: 0;
}

export interface LegacyAppointmentBridgeExecutionResult {
  contract: typeof LEGACY_APPOINTMENT_BRIDGE_RESULT_CONTRACT;
  accepted: true;
  mode: 'execute' | 'status';
  tenant_resolution: 'integration';
  execution: ExecutionResultV1;
  safe_explanation: string;
  bridge_external_side_effects: 0;
}

function payloadError(message: string, code: string): never {
  throw new BadRequestException({
    message,
    error: { code },
  });
}

function opaqueObservationRef(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertExactKeys(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(payload).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    payloadError(
      `Unsupported appointment payload field: ${unknown[0]}`,
      'legacy_appointment_payload_unknown_field',
    );
  }
}

function requiredString(
  payload: Record<string, unknown>,
  key: string,
  maxLength = 160,
): string {
  const value = payload[key];
  if (typeof value !== 'string') {
    payloadError(
      `Appointment payload field ${key} must be a string.`,
      'legacy_appointment_payload_invalid',
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    payloadError(
      `Appointment payload field ${key} is invalid.`,
      'legacy_appointment_payload_invalid',
    );
  }
  return normalized;
}

function optionalString(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    payloadError(
      `Appointment payload field ${key} must be a string.`,
      'legacy_appointment_payload_invalid',
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    payloadError(
      `Appointment payload field ${key} is invalid.`,
      'legacy_appointment_payload_invalid',
    );
  }
  return normalized;
}

function requiredStringArray(
  payload: Record<string, unknown>,
  key: string,
): string[] {
  const value = payload[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 64 ||
    value.some(
      (item) =>
        typeof item !== 'string' ||
        item.trim().length === 0 ||
        item.trim().length > 128,
    )
  ) {
    payloadError(
      `Appointment payload field ${key} must be a non-empty string array.`,
      'legacy_appointment_payload_invalid',
    );
  }
  return [...new Set(value.map((item) => String(item).trim()))];
}

function optionalStringArray(
  payload: Record<string, unknown>,
  key: string,
): string[] | undefined {
  if (payload[key] === undefined || payload[key] === null) return undefined;
  return requiredStringArray(payload, key);
}

function optionalInteger(
  payload: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    payloadError(
      `Appointment payload field ${key} must be an integer from ${min} to ${max}.`,
      'legacy_appointment_payload_invalid',
    );
  }
  return Number(value);
}

function requiredIsoDate(
  payload: Record<string, unknown>,
  key: string,
): string {
  const value = requiredString(payload, key, 64);
  if (!Number.isFinite(Date.parse(value))) {
    payloadError(
      `Appointment payload field ${key} must be an ISO date.`,
      'legacy_appointment_payload_invalid',
    );
  }
  return value;
}

@Injectable()
export class LegacyAppointmentBridgeService {
  private readonly logger = new Logger(LegacyAppointmentBridgeService.name);

  constructor(
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly crmService: CrmService,
  ) {}

  assertSecret(token: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(
      token,
      'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
      {
        disabled: 'legacy_appointment_bridge_disabled',
        unauthorized: 'legacy_appointment_bridge_unauthorized',
      },
    );
  }

  executionEnabled(): boolean {
    return EXECUTION_ENABLED_VALUES.has(
      String(process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED || '')
        .trim()
        .toLowerCase(),
    );
  }

  async shadow(
    dto: LegacyAppointmentBridgeDto,
  ): Promise<LegacyAppointmentBridgeShadowResult> {
    const context = await this.resolve(dto);
    const preview = await this.tenantContext.runAsSystemTenant(
      context.tenantId,
      () => this.preview(context.tenantId, context.parsed, context.invocation),
    );

    this.logShadowObservation({
      tenantId: context.tenantId,
      dto,
      preview,
    });

    return {
      contract: LEGACY_APPOINTMENT_BRIDGE_RESULT_CONTRACT,
      accepted: true,
      mode: 'shadow',
      tenant_resolution: 'integration',
      preview,
      ...(dto.legacy_outcome
        ? { legacy_outcome: { ...dto.legacy_outcome } }
        : {}),
      bridge_external_side_effects: 0,
    };
  }

  async execute(
    dto: LegacyAppointmentBridgeDto,
  ): Promise<LegacyAppointmentBridgeExecutionResult> {
    if (!this.executionEnabled()) {
      throw new ServiceUnavailableException({
        message: 'Legacy appointment bridge execution is disabled.',
        error: { code: 'legacy_appointment_bridge_execution_disabled' },
      });
    }

    const context = await this.resolve(dto);
    let execution: ExecutionResultV1;
    try {
      execution = await this.tenantContext.runAsSystemTenant(
        context.tenantId,
        async () =>
          (
            await this.executeAction(
              context.tenantId,
              context.parsed,
              context.invocation,
            )
          ).execution,
      );
    } catch (error) {
      const canonical = actionExecutionResultFromError(error);
      if (!canonical) throw error;
      execution = canonical;
    }

    return this.executionResponse('execute', execution);
  }

  async status(input: {
    provider: string;
    externalCompanyId: string;
    executionId: string;
  }): Promise<LegacyAppointmentBridgeExecutionResult> {
    const assertedProvider = this.normalizedProvider(input.provider);
    const assertedCompanyId = this.externalCompanyId(input.externalCompanyId);
    const { provider, externalCompanyId } = this.boundIntegrationSource(
      assertedProvider,
      assertedCompanyId,
    );
    const executionId = this.opaqueExecutionId(input.executionId);
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      { provider, externalCompanyId },
      'legacy_appointment_tenant_not_found',
    );
    const execution = await this.tenantContext.runAsSystemTenant(
      tenant.tenantId,
      () =>
        this.crmService.getAppointmentActionExecutionResult(
          tenant.tenantId,
          executionId,
        ),
    );
    return this.executionResponse('status', execution);
  }

  private async resolve(dto: LegacyAppointmentBridgeDto) {
    const assertedProvider = this.normalizedProvider(dto.provider);
    const assertedCompanyId = this.externalCompanyId(dto.external_company_id);
    this.assertOriginAction(dto.origin, dto.action_class);
    const { provider, externalCompanyId } = this.boundIntegrationSource(
      assertedProvider,
      assertedCompanyId,
    );
    const parsed = this.parseAction(
      dto.action_class,
      dto.payload,
      dto.origin,
      externalCompanyId,
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      { provider, externalCompanyId },
      'legacy_appointment_tenant_not_found',
    );

    const invocation: AppointmentActionInvocation = {
      sourceType: 'legacy_bridge',
      sourceRef: `legacy:${dto.origin}:${dto.requester_ref ?? dto.action_class}`,
      callerIdempotency: {
        scope: `legacy-appointment:${provider}:${externalCompanyId}:${dto.action_class}`,
        key: dto.idempotency_key,
      },
    };

    return { tenantId: tenant.tenantId, parsed, invocation };
  }

  private boundIntegrationSource(provider: string, externalCompanyId: string) {
    return this.bridgeSource.assertBridgeIntegrationBinding(
      { provider, externalCompanyId },
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'legacy_appointment_bridge_source_binding_disabled',
        mismatch: 'legacy_appointment_bridge_source_binding_mismatch',
      },
    );
  }

  private normalizedProvider(value: string): string {
    const provider = String(value || '')
      .trim()
      .toLowerCase();
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      payloadError(
        'CRM provider is not supported by the legacy appointment bridge.',
        'legacy_appointment_provider_unsupported',
      );
    }
    return provider;
  }

  private externalCompanyId(value: string): string {
    const companyId = String(value || '').trim();
    if (!companyId || companyId.length > 64) {
      payloadError(
        'CRM external company id is invalid.',
        'legacy_appointment_company_invalid',
      );
    }
    return companyId;
  }

  private opaqueExecutionId(value: string): string {
    const executionId = String(value || '').trim();
    if (
      !executionId ||
      executionId.length > 96 ||
      !/^[a-zA-Z0-9._:-]+$/.test(executionId)
    ) {
      payloadError(
        'Action execution reference is invalid.',
        'legacy_appointment_execution_reference_invalid',
      );
    }
    return executionId;
  }

  private assertOriginAction(
    origin: LegacyAppointmentOrigin,
    action: LegacyAppointmentAction,
  ): void {
    if (!ORIGIN_ACTIONS[origin]?.has(action)) {
      payloadError(
        'Legacy origin is not allowed to request this appointment action.',
        'legacy_appointment_origin_action_forbidden',
      );
    }
  }

  private parseAction(
    action: LegacyAppointmentAction,
    payload: Record<string, unknown>,
    origin: LegacyAppointmentOrigin,
    trustedCompanyId: string,
  ): ParsedAction {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      payloadError(
        'Appointment payload must be an object.',
        'legacy_appointment_payload_invalid',
      );
    }

    if (action === 'create_appointment') {
      assertExactKeys(payload, [
        'client_id',
        'client_name',
        'client_phone',
        'branch_id',
        'staff_id',
        'service_ids',
        'start',
        'notes',
        'duration_minutes',
        'notify_by_sms_hours',
      ]);
      const assertedBranchId = optionalString(payload, 'branch_id', 128);
      if (
        assertedBranchId !== undefined &&
        assertedBranchId !== trustedCompanyId
      ) {
        payloadError(
          'Appointment branch does not match the authenticated integration.',
          'legacy_appointment_cross_tenant_target',
        );
      }

      return {
        action,
        params: {
          clientId: requiredString(payload, 'client_id', 160),
          clientName: requiredString(payload, 'client_name', 160),
          clientPhone: optionalString(payload, 'client_phone', 40),
          branchId: trustedCompanyId,
          staffId: requiredString(payload, 'staff_id', 128),
          serviceIds: requiredStringArray(payload, 'service_ids'),
          start: requiredIsoDate(payload, 'start'),
          notes: optionalString(payload, 'notes', 2_000),
          durationMinutes: optionalInteger(payload, 'duration_minutes', 5, 720),
          notifyBySmsHours: optionalInteger(
            payload,
            'notify_by_sms_hours',
            0,
            48,
          ),
          // The panel used the administrative provider route but explicitly
          // rejected busy slots. Route selection and permission must remain
          // separate; neither is accepted from the untrusted payload.
          creationMode: origin === 'webhook.panel' ? 'admin' : 'client',
          allowBusy: false,
        },
      };
    }

    if (action === 'reschedule_appointment') {
      assertExactKeys(payload, [
        'external_id',
        'start',
        'staff_id',
        'service_ids',
        'notes',
      ]);
      return {
        action,
        params: {
          externalId: requiredString(payload, 'external_id', 128),
          start: requiredIsoDate(payload, 'start'),
          staffId: optionalString(payload, 'staff_id', 128),
          serviceIds: optionalStringArray(payload, 'service_ids'),
          notes: optionalString(payload, 'notes', 2_000),
        },
      };
    }

    assertExactKeys(payload, ['external_id']);
    return {
      action: 'cancel_appointment',
      externalId: requiredString(payload, 'external_id', 128),
    };
  }

  private preview(
    tenantId: string,
    parsed: ParsedAction,
    invocation: AppointmentActionInvocation,
  ): Promise<ActionExecutionPreviewV1> {
    if (parsed.action === 'create_appointment') {
      return this.crmService.previewCreateAppointment(
        tenantId,
        parsed.params,
        invocation,
      );
    }
    if (parsed.action === 'reschedule_appointment') {
      return this.crmService.previewRescheduleAppointment(
        tenantId,
        parsed.params,
        invocation,
      );
    }
    return this.crmService.previewCancelAppointment(
      tenantId,
      parsed.externalId,
      invocation,
    );
  }

  private executeAction(
    tenantId: string,
    parsed: ParsedAction,
    invocation: AppointmentActionInvocation,
  ) {
    if (parsed.action === 'create_appointment') {
      return this.crmService.executeCreateAppointmentWithReceipt(
        tenantId,
        parsed.params,
        invocation,
      );
    }
    if (parsed.action === 'reschedule_appointment') {
      return this.crmService.executeRescheduleAppointmentWithReceipt(
        tenantId,
        parsed.params,
        invocation,
      );
    }
    return this.crmService.executeCancelAppointmentWithReceipt(
      tenantId,
      parsed.externalId,
      invocation,
    );
  }

  private logShadowObservation(input: {
    tenantId: string;
    dto: LegacyAppointmentBridgeDto;
    preview: ActionExecutionPreviewV1;
  }): void {
    const { tenantId, dto, preview } = input;
    this.logger.log({
      event: 'legacy_appointment_shadow_observation',
      contract: LEGACY_APPOINTMENT_SHADOW_OBSERVATION_CONTRACT,
      mode: 'shadow',
      tenant_ref: opaqueObservationRef(tenantId),
      origin: dto.origin,
      legacy_action_class: dto.action_class,
      preview_action_class: preview.actionClass,
      capability: preview.capability,
      capability_version: preview.capabilityVersion,
      target_kind: preview.targetKind,
      target_ref_hash: opaqueObservationRef(preview.targetRef),
      normalized_input_hash: preview.normalizedInputHash,
      identity_fingerprint: preview.identityFingerprint,
      request_idempotency_key_hash: preview.requestIdempotencyKeyHash,
      policy_key: preview.policyKey,
      policy_version: preview.policyVersion,
      policy_decision: preview.policyDecision,
      autonomy_level: preview.autonomyLevel,
      approval_requirement: preview.approvalRequirement,
      executor_key: preview.executorKey,
      executor_version: preview.executorVersion,
      legacy_outcome: dto.legacy_outcome
        ? {
            success: dto.legacy_outcome.success,
            ...(dto.legacy_outcome.code
              ? { code: dto.legacy_outcome.code }
              : {}),
            ...(dto.legacy_outcome.http_status
              ? { http_status: dto.legacy_outcome.http_status }
              : {}),
            ...(dto.legacy_outcome.unknown === true ? { unknown: true } : {}),
          }
        : undefined,
      bridge_external_side_effects: 0,
    });
  }

  private executionResponse(
    mode: 'execute' | 'status',
    execution: ExecutionResultV1,
  ): LegacyAppointmentBridgeExecutionResult {
    return {
      contract: LEGACY_APPOINTMENT_BRIDGE_RESULT_CONTRACT,
      accepted: true,
      mode,
      tenant_resolution: 'integration',
      execution,
      safe_explanation: this.safeExplanation(execution),
      bridge_external_side_effects: 0,
    };
  }

  private safeExplanation(execution: ExecutionResultV1): string {
    if (execution.state === 'UNKNOWN') {
      return 'Результат операции уточняется. Не повторяйте действие.';
    }
    if (execution.state === 'SUCCEEDED') return 'Операция выполнена.';
    if (execution.state === 'FAILED' || execution.state === 'NOT_EXECUTED') {
      return 'Операция не выполнена.';
    }
    return 'Операция принята в обработку.';
  }
}
