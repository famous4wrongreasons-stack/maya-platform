import {
  BadRequestException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import {
  ACTION_EXECUTION_PREVIEW_CONTRACT,
  ACTION_EXECUTION_RESULT_CONTRACT,
  createStandaloneCanonicalActionEngineRuntime,
} from '../action-engine';
import { CrmProvider } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_APPOINTMENT_BRIDGE_CONTRACT,
  LegacyAppointmentBridgeDto,
} from './dto/legacy-appointment-bridge.dto';
import { LegacyAppointmentBridgeService } from './legacy-appointment-bridge.service';
import { CrmService } from './crm.service';

const UNKNOWN_EXECUTION = {
  contract: ACTION_EXECUTION_RESULT_CONTRACT,
  executionId: 'exec-1',
  state: 'UNKNOWN',
  outcomeCode: 'provider_timeout',
} as const;

function createDto(
  overrides: Partial<LegacyAppointmentBridgeDto> = {},
): LegacyAppointmentBridgeDto {
  return {
    contract: LEGACY_APPOINTMENT_BRIDGE_CONTRACT,
    provider: CrmProvider.YCLIENTS,
    external_company_id: '42',
    origin: 'webhook.chat',
    requester_ref: 'request-1',
    idempotency_key: 'legacy-v1:request-1',
    action_class: 'create_appointment',
    payload: {
      client_id: 'legacy-client-1',
      client_name: 'Client',
      client_phone: '+79990001122',
      branch_id: '42',
      staff_id: '7',
      service_ids: ['1', '2'],
      start: '2026-09-01T09:00:00.000Z',
      notify_by_sms_hours: 3,
    },
    ...overrides,
  };
}

function previewFixture() {
  return {
    contract: ACTION_EXECUTION_PREVIEW_CONTRACT,
    tenantId: 'tenant-1',
    sourceType: 'legacy_bridge',
    capability: 'crm.appointment.create.v1',
    capabilityVersion: 1,
    actionClass: 'create_appointment',
    targetKind: 'appointment',
    targetRef: 'create/opaque',
    normalizedInputHash: 'c'.repeat(64),
    identityFingerprint: 'd'.repeat(64),
    requestIdempotencyKeyHash: 'e'.repeat(64),
    policyKey: 'appointment-policy',
    policyVersion: 1,
    policyDecision: 'ALLOW',
    autonomyLevel: 'L0',
    approvalRequirement: 'NONE',
    executorKey: 'crm.appointment.create',
    executorVersion: 1,
    externalSideEffects: 0,
  } as const;
}

describe('LegacyAppointmentBridgeService', () => {
  const originalExecutionFlag =
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalExecutionFlag === undefined) {
      delete process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED;
    } else {
      process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED =
        originalExecutionFlag;
    }
  });

  function unitHarness() {
    const bridgeSource = {
      resolveTenantByIntegration: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        slug: 'tenant-one',
        resolvedBy: 'integration',
      }),
      assertBridgeSecret: jest.fn(),
      assertBridgeIntegrationBinding: jest.fn(
        (ref: {
          provider?: string | null;
          externalCompanyId?: string | number | null;
        }) => ({
          provider: String(ref.provider ?? ''),
          externalCompanyId: String(ref.externalCompanyId ?? ''),
        }),
      ),
    };
    const crmService = {
      previewCreateAppointment: jest.fn().mockResolvedValue(previewFixture()),
      previewRescheduleAppointment: jest.fn(),
      previewCancelAppointment: jest.fn(),
      previewPayVisit: jest.fn().mockResolvedValue({
        ...previewFixture(),
        capability: 'crm.visit.payment.v1',
        actionClass: 'pay_visit',
        targetRef: 'appointment/77',
        policyKey: 'provider.yclients.pay_visit.deferred-unsafe',
        policyDecision: 'DENY',
        autonomyLevel: 'L0_PROVIDER_DEFERRED',
        executorKey: 'crm.visit.payment',
      }),
      planResidualAppointmentShadow: jest.fn().mockResolvedValue({
        ...previewFixture(),
        capability: 'crm.appointment.attendance.shadow.v1',
        actionClass: 'set_appointment_attendance',
        targetRef: 'appointment/77',
        policyKey: 'chapter6.residual-appointment-shadow',
        policyDecision: 'SHADOW_ONLY',
        autonomyLevel: 'L2_5_SHADOW',
        executorKey: 'shadow.none',
      }),
      executeCreateAppointmentWithReceipt: jest.fn(),
      executeRescheduleAppointmentWithReceipt: jest.fn(),
      executeCancelAppointmentWithReceipt: jest.fn(),
      executePayVisitWithReceipt: jest.fn(),
      executeResidualAppointmentWithReceipt: jest.fn().mockResolvedValue({
        value: { external_id: '77', duration_minutes: 60 },
        execution: UNKNOWN_EXECUTION,
      }),
      getAppointmentActionExecutionResult: jest.fn(),
    };
    const tenantContext = new TenantContextService();
    const service = new LegacyAppointmentBridgeService(
      bridgeSource as never,
      tenantContext,
      crmService as never,
    );
    return { bridgeSource, crmService, service };
  }

  function productionBodyPipe() {
    return new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });
  }

  it.each(['tenant_id', 'executor', 'policy', 'approval'])(
    'rejects the untrusted top-level control field %s',
    async (field) => {
      const body = { ...createDto(), [field]: 'legacy-controlled-value' };

      await expect(
        productionBodyPipe().transform(body, {
          type: 'body',
          metatype: LegacyAppointmentBridgeDto,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects an unsupported action class at the HTTP DTO boundary', async () => {
    const body = {
      ...createDto(),
      action_class: 'update_attendance',
    };

    await expect(
      productionBodyPipe().transform(body, {
        type: 'body',
        metatype: LegacyAppointmentBridgeDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects the removed generic financial-operation payment action', async () => {
    const body = {
      ...createDto(),
      origin: 'webhook.panel',
      action_class: 'close_appointment_payment',
      payload: {
        external_id: '77',
        amount_kopecks: 200_000,
        payment_method: 'card',
      },
    };

    await expect(
      productionBodyPipe().transform(body, {
        type: 'body',
        metatype: LegacyAppointmentBridgeDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('plans pay_visit as a zero-effect shadow using the canonical payment contract', async () => {
    const { crmService, service } = unitHarness();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const result = await service.shadow(
      createDto({
        origin: 'webhook.panel',
        action_class: 'pay_visit',
        payload: {
          external_id: '77',
          amount_kopecks: 200_000,
          payment_method: 'card',
        },
      }),
    );

    expect(crmService.previewPayVisit).toHaveBeenCalledWith(
      'tenant-1',
      {
        externalId: '77',
        amountKopecks: 200_000,
        paymentMethod: 'card',
      },
      expect.objectContaining({ sourceType: 'legacy_bridge' }),
    );
    expect(crmService.executePayVisitWithReceipt).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: 'shadow',
      bridge_external_side_effects: 0,
      preview: {
        capability: 'crm.visit.payment.v1',
        actionClass: 'pay_visit',
        policyDecision: 'DENY',
        executorKey: 'crm.visit.payment',
      },
    });
  });

  it('rejects pay_visit execution before tenant resolution or executor dispatch', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED = 'true';

    await expect(
      service.execute(
        createDto({
          origin: 'webhook.panel',
          action_class: 'pay_visit',
          payload: {
            external_id: '77',
            amount_kopecks: 200_000,
            payment_method: 'card',
          },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'visit_payment_write_provider_contract_deferred' },
      },
    });

    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(crmService.executePayVisitWithReceipt).not.toHaveBeenCalled();
    expect(crmService.previewPayVisit).not.toHaveBeenCalled();
  });

  it('keeps pay_visit disabled across repeated requests', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED = 'true';
    const request = createDto({
      origin: 'telegram.bot',
      action_class: 'pay_visit',
      payload: {
        external_id: '77',
        amount_kopecks: 200_000,
        payment_method: 'cash',
      },
    });

    await expect(service.execute(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.execute(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(crmService.executePayVisitWithReceipt).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: 'unsupported payment method',
      origin: 'webhook.panel',
      payload: {
        external_id: '77',
        amount_kopecks: 200_000,
        payment_method: 'bank_transfer',
      },
    },
    {
      title: 'zero amount',
      origin: 'webhook.panel',
      payload: {
        external_id: '77',
        amount_kopecks: 0,
        payment_method: 'card',
      },
    },
    {
      title: 'untrusted payload field',
      origin: 'webhook.panel',
      payload: {
        external_id: '77',
        amount_kopecks: 200_000,
        payment_method: 'card',
        provider_transaction_id: 'legacy-operation-2000',
      },
    },
    {
      title: 'unauthorized origin',
      origin: 'webhook.chat',
      payload: {
        external_id: '77',
        amount_kopecks: 200_000,
        payment_method: 'card',
      },
    },
  ])('rejects pay_visit $title before tenant resolution', async (example) => {
    const { bridgeSource, crmService, service } = unitHarness();

    await expect(
      service.shadow(
        createDto({
          origin: example.origin as LegacyAppointmentBridgeDto['origin'],
          action_class: 'pay_visit',
          payload: example.payload,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(crmService.previewPayVisit).not.toHaveBeenCalled();
  });

  it('plans a residual appointment mutation as zero-effect shadow work', async () => {
    const { crmService, service } = unitHarness();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const result = await service.shadow(
      createDto({
        origin: 'legacy.residual_appointment',
        action_class: 'set_appointment_attendance',
        payload: { external_id: '77', attendance_code: 1 },
      }),
    );

    expect(crmService.planResidualAppointmentShadow).toHaveBeenCalledWith(
      'tenant-1',
      'crm.appointment.attendance.shadow.v1',
      'appointment/77',
      { attendanceCode: 1 },
      expect.objectContaining({ sourceType: 'legacy_bridge' }),
    );
    expect(result).toMatchObject({
      accepted: true,
      mode: 'shadow',
      bridge_external_side_effects: 0,
      preview: {
        policyDecision: 'SHADOW_ONLY',
        executorKey: 'shadow.none',
        externalSideEffects: 0,
      },
    });
    expect(
      crmService.executeCreateAppointmentWithReceipt,
    ).not.toHaveBeenCalled();
  });

  it('executes a residual appointment mutation through the canonical Action Engine path', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED = 'true';

    const result = await service.execute(
      createDto({
        origin: 'legacy.residual_appointment',
        action_class: 'set_appointment_duration',
        payload: { external_id: '77', duration_seconds: 3600 },
      }),
    );

    expect(bridgeSource.resolveTenantByIntegration).toHaveBeenCalledTimes(1);
    expect(
      crmService.executeResidualAppointmentWithReceipt,
    ).toHaveBeenCalledWith(
      'tenant-1',
      'set_appointment_duration',
      '77',
      { durationSeconds: 3600 },
      expect.objectContaining({
        sourceType: 'legacy_bridge',
        sourceRef: 'legacy:legacy.residual_appointment:request-1',
        callerIdempotency: {
          scope: 'legacy-appointment:yclients:42:set_appointment_duration',
          key: 'legacy-v1:request-1',
        },
      }),
    );
    expect(crmService.planResidualAppointmentShadow).not.toHaveBeenCalled();
    expect(result.execution).toEqual(UNKNOWN_EXECUTION);
    expect(result.safe_explanation).toContain('Не повторяйте действие');
  });

  it('rejects invalid residual payload before resolving a tenant', async () => {
    const { bridgeSource, crmService, service } = unitHarness();

    await expect(
      service.shadow(
        createDto({
          origin: 'legacy.residual_appointment',
          action_class: 'set_appointment_fields',
          payload: {
            external_id: '77',
            field_kind: 'comment',
            value_ref: 'hmac:comment-ref',
            raw_comment: 'must-not-cross-the-boundary',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(crmService.planResidualAppointmentShadow).not.toHaveBeenCalled();
  });

  it('shadows through canonical preview without executing an action', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const result = await service.shadow(
      createDto({
        legacy_outcome: { success: true, code: 'ok', http_status: 200 },
      }),
    );

    expect(bridgeSource.assertBridgeIntegrationBinding).toHaveBeenCalledWith(
      { provider: CrmProvider.YCLIENTS, externalCompanyId: '42' },
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'legacy_appointment_bridge_source_binding_disabled',
        mismatch: 'legacy_appointment_bridge_source_binding_mismatch',
      },
    );

    expect(bridgeSource.resolveTenantByIntegration).toHaveBeenCalledWith(
      { provider: CrmProvider.YCLIENTS, externalCompanyId: '42' },
      'legacy_appointment_tenant_not_found',
    );
    expect(crmService.previewCreateAppointment).toHaveBeenCalledTimes(1);
    expect(
      crmService.executeCreateAppointmentWithReceipt,
    ).not.toHaveBeenCalled();
    expect(result.bridge_external_side_effects).toBe(0);

    expect(log).toHaveBeenCalledTimes(1);
    const serializedLog = String(log.mock.calls[0]?.[0] ?? '');
    const prefix = 'MAYA_LEGACY_APPOINTMENT_SHADOW_OBSERVATION ';
    expect(serializedLog.startsWith(prefix)).toBe(true);
    const observation = JSON.parse(
      serializedLog.slice(prefix.length),
    ) as Record<string, unknown>;
    expect(observation).toMatchObject({
      event: 'legacy_appointment_shadow_observation',
      contract: 'maya.legacy-appointment-shadow-observation/1',
      mode: 'shadow',
      tenant_resolution: 'integration',
      origin: 'webhook.chat',
      authorization_context: {
        transport_authentication: 'bridge_secret',
        integration_binding: 'verified',
        origin_action_policy: 'allowed',
        tenant_scope: 'system_tenant',
      },
      legacy_action_class: 'create_appointment',
      preview_action_class: 'create_appointment',
      normalized_input_hash: 'c'.repeat(64),
      identity_fingerprint: 'd'.repeat(64),
      request_idempotency_key_hash: 'e'.repeat(64),
      legacy_outcome: { success: true, code: 'ok', http_status: 200 },
      preview_external_side_effects: 0,
      bridge_external_side_effects: 0,
      shadow_side_effects: {
        crm_writes: 0,
        messages: 0,
        campaigns: 0,
      },
    });
    expect(observation.tenant_ref).toMatch(/^[a-f0-9]{64}$/);
    expect(observation.target_ref_hash).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(observation);
    expect(serialized).not.toContain('tenant-1');
    expect(serialized).not.toContain('Client');
    expect(serialized).not.toContain('+79990001122');
  });

  it('rejects an action not allowed for the declared legacy origin', async () => {
    const { bridgeSource, service } = unitHarness();

    await expect(
      service.shadow(
        createDto({
          origin: 'client_record_actions',
          action_class: 'create_appointment',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
  });

  it('rejects unknown action payload fields before tenant resolution', async () => {
    const { bridgeSource, service } = unitHarness();
    const dto = createDto({
      payload: {
        ...createDto().payload,
        executor: 'legacy-python',
      },
    });

    await expect(service.shadow(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
  });

  it('rejects a source assertion that is not bound to the bridge credential', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    bridgeSource.assertBridgeIntegrationBinding.mockImplementation(() => {
      throw new ForbiddenException('source binding mismatch');
    });

    await expect(
      service.shadow(createDto({ external_company_id: 'other-company' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(crmService.previewCreateAppointment).not.toHaveBeenCalled();
  });

  it('rejects a create target outside the authenticated integration', async () => {
    const { bridgeSource, crmService, service } = unitHarness();

    await expect(
      service.shadow(
        createDto({
          payload: { ...createDto().payload, branch_id: '43' },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'legacy_appointment_cross_tenant_target' },
      },
    });
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(crmService.previewCreateAppointment).not.toHaveBeenCalled();
  });

  it('fails closed while execution cutover is disabled', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED = 'false';

    await expect(service.execute(createDto())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(bridgeSource.resolveTenantByIntegration).not.toHaveBeenCalled();
    expect(
      crmService.executeCreateAppointmentWithReceipt,
    ).not.toHaveBeenCalled();
  });

  it('preserves canonical UNKNOWN and explicitly forbids a blind retry', async () => {
    const { crmService, service } = unitHarness();
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED = 'true';
    const error = Object.assign(new Error('unknown'), {
      actionExecutionResult: UNKNOWN_EXECUTION,
    });
    crmService.executeCreateAppointmentWithReceipt.mockRejectedValue(error);

    const result = await service.execute(createDto());

    expect(result.execution).toEqual(UNKNOWN_EXECUTION);
    expect(result.safe_explanation).toContain('Не повторяйте действие');
    expect(result.bridge_external_side_effects).toBe(0);
  });

  it('reads execution status only inside the integration-resolved tenant', async () => {
    const { bridgeSource, crmService, service } = unitHarness();
    crmService.getAppointmentActionExecutionResult.mockResolvedValue(
      UNKNOWN_EXECUTION,
    );

    const result = await service.status({
      provider: CrmProvider.YCLIENTS,
      externalCompanyId: '42',
      executionId: 'exec-1',
    });

    expect(bridgeSource.resolveTenantByIntegration).toHaveBeenCalledWith(
      { provider: CrmProvider.YCLIENTS, externalCompanyId: '42' },
      'legacy_appointment_tenant_not_found',
    );
    expect(crmService.getAppointmentActionExecutionResult).toHaveBeenCalledWith(
      'tenant-1',
      'exec-1',
    );
    expect(result.execution).toEqual(UNKNOWN_EXECUTION);
  });
});

describe('legacy/native appointment identity convergence', () => {
  it('uses one logical identity across native, Python and repeated Python input', async () => {
    const previousProvider =
      process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER;
    const previousCompany =
      process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID;
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER = 'yclients';
    process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID = '42';
    try {
      const secret = 'test-secret-that-is-long-enough-for-action-engine';
      const config = {
        get: jest.fn((key: string) =>
          [
            'CRM_ENCRYPTION_KEY',
            'ACTION_ENGINE_IDENTITY_SECRET',
            'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
          ].includes(key)
            ? secret
            : undefined,
        ),
      } as unknown as ConfigService;
      const encryption = new EncryptionService(config);
      const now = new Date('2026-08-22T08:00:00.000Z');
      const integrations = [
        {
          id: 'integration-1',
          tenantId: 'tenant-1',
          provider: CrmProvider.YCLIENTS,
          encryptedApiToken: encryption.encrypt('token-1'),
          baseUrl: null,
          status: 'active',
          settingsJson: { companyId: '42' },
          updatedAt: now,
          tenant: { slug: 'tenant-one', status: 'active' },
        },
        {
          id: 'integration-2',
          tenantId: 'tenant-2',
          provider: CrmProvider.YCLIENTS,
          encryptedApiToken: encryption.encrypt('token-2'),
          baseUrl: null,
          status: 'active',
          settingsJson: { companyId: '43' },
          updatedAt: now,
          tenant: { slug: 'tenant-two', status: 'active' },
        },
      ];
      const prisma = {
        tenant: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { id: string } }) =>
              Promise.resolve({
                id: where.id,
                calendarSource: 'external',
                status: 'active',
                planId: null,
                trialEndsAt: null,
                trialFullAccess: false,
                currentPeriodEnd: new Date('2026-09-22T08:00:00.000Z'),
                pastDueAt: null,
                graceEndsAt: null,
                updatedAt: now,
              }),
            ),
        },
        membership: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        crmIntegration: {
          findUnique: jest.fn(({ where }: { where: { tenantId: string } }) =>
            Promise.resolve(
              integrations.find((item) => item.tenantId === where.tenantId) ??
                null,
            ),
          ),
          findMany: jest.fn(({ where }: { where: { provider: string } }) =>
            Promise.resolve(
              integrations.filter(
                (item) => String(item.provider) === String(where.provider),
              ),
            ),
          ),
        },
      } as unknown as PrismaService;
      const tenantContext = new TenantContextService();
      const runtime = createStandaloneCanonicalActionEngineRuntime(
        prisma,
        {
          resolveFeatureRequirements: (
            tenantId: string,
            requiredFeatures: readonly never[],
            evaluatedAt: Date,
          ) =>
            Promise.resolve({
              contract: 'maya.feature-requirement-decision/1',
              tenantId,
              planId: null,
              requiredFeatures: requiredFeatures.map((featureKey) => ({
                featureKey,
                enabled: true,
              })),
              allowed: true,
              evaluatedAt,
              validUntil: new Date('2026-09-22T08:00:00.000Z'),
            }),
        } as never,
        {
          identitySecret: secret,
          payloadEncryptionSecret: secret,
          now: () => now,
        },
      );
      const adapterFactory = { create: jest.fn().mockReturnValue({}) };
      const crmService = new CrmService(
        prisma,
        encryption,
        adapterFactory as never,
        tenantContext,
        {} as never,
        {} as never,
        runtime,
      );
      const bridge = new LegacyAppointmentBridgeService(
        new BridgeSourceService(prisma),
        tenantContext,
        crmService,
      );

      const native = await tenantContext.runAsSystemTenant('tenant-1', () =>
        crmService.previewCreateAppointment(
          'tenant-1',
          {
            clientId: 'native-client-id',
            clientName: 'Client',
            clientPhone: '+79990001122',
            branchId: '42',
            staffId: '7',
            serviceIds: ['1', '2'],
            start: '2026-09-01T09:00:00.000Z',
            creationMode: 'client',
            allowBusy: false,
            notifyBySmsHours: 3,
          },
          {
            sourceType: 'authenticated_request',
            sourceRef: 'native/request',
            callerIdempotency: { scope: 'http', key: 'native-alias' },
          },
        ),
      );
      const pythonDto = createDto({
        payload: {
          ...createDto().payload,
          // Python sends salon wall-clock time while native callers send UTC.
          // Both must converge before Action Engine computes the identity.
          start: '2026-09-01T12:00:00',
        },
      });
      const python = (await bridge.shadow(pythonDto)).preview;
      const repeatedPython = (await bridge.shadow(pythonDto)).preview;

      expect(python.identityFingerprint).toBe(native.identityFingerprint);
      expect(python.normalizedInputHash).toBe(native.normalizedInputHash);
      expect(python.targetRef).toBe(native.targetRef);
      expect(repeatedPython.identityFingerprint).toBe(
        python.identityFingerprint,
      );
      expect(python.requestIdempotencyKeyHash).not.toBe(
        native.requestIdempotencyKeyHash,
      );
      await expect(
        bridge.shadow(
          createDto({
            external_company_id: '43',
            idempotency_key: 'legacy-v1:request-tenant-2',
            payload: { ...createDto().payload, branch_id: '43' },
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      if (previousProvider === undefined) {
        delete process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER;
      } else {
        process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER =
          previousProvider;
      }
      if (previousCompany === undefined) {
        delete process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID;
      } else {
        process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID =
          previousCompany;
      }
    }
  });
});
