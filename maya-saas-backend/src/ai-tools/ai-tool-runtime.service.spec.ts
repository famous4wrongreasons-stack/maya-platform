import { canonicalReceiptFixture } from '../../test/fixtures/ai-tool-receipt.fixture';
import { ConflictException, ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { PersonalClientContextService } from '../appointments/personal-client-context.service';
import type { AiReadWidgetTriggerPort } from './ai-read-widget-trigger.port';

const IDEMPOTENCY_KEY = '59f04d18-c04a-4f1d-a529-345fe6f2a65d';

describe('AiToolRuntimeService', () => {
  const customer: AuthenticatedUser = {
    userId: 'customer_12345678',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.CUSTOMER,
    email: 'redacted@example.invalid',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  describe.each(['appointments.own.list', 'loyalty.own.read'])(
    'current verified personal READ context: %s',
    (toolName) => {
      function personalHarness(widgetTrigger?: AiReadWidgetTriggerPort) {
        const harness = createHarness(widgetTrigger);
        let saved: Record<string, unknown> | null = null;
        harness.executionFindUnique.mockImplementation(() =>
          Promise.resolve(saved),
        );
        harness.executionCreate.mockImplementation((input: unknown) => {
          saved = { ...record(record(input).data), id: 'personal-execution' };
          return Promise.resolve(saved);
        });
        harness.executionUpdate.mockImplementation((input: unknown) => {
          saved = { ...saved, ...record(record(input).data) };
          return Promise.resolve(saved);
        });
        harness.handlerExecute.mockResolvedValue({
          appointments: [{ id: 'private-appointment' }],
        });
        const dto = {
          surface: 'web' as const,
          arguments: {},
          idempotencyKey: IDEMPOTENCY_KEY,
        };
        const actor = { ...customer, role: UserRole.TENANT_OWNER };
        const run = (replay = false, suppressWidgetTrigger = true) =>
          harness.tenantContext.runAsSystemTenant('tenant-a', () =>
            replay
              ? harness.runtime.replayCompletedRead(
                  actor,
                  toolName,
                  dto,
                  'personal-execution',
                  { suppressWidgetTrigger },
                )
              : harness.runtime.execute(actor, toolName, dto, {
                  suppressWidgetTrigger,
                }),
          );
        return { ...harness, actor, run };
      }
      it.each([false, true])(
        'refuses revoked verified linkage before cached payload on replay=%s even without Client.userId',
        async (replay) => {
          const h = personalHarness();
          await expect(h.run()).resolves.toMatchObject({ status: 'completed' });
          h.personalSelect.mockRejectedValue(
            new ForbiddenException('new_verified_maya_user_binding_required'),
          );
          await expect(h.run(replay)).rejects.toThrow(
            'new_verified_maya_user_binding_required',
          );
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
          expect(h.personalSelect).toHaveBeenCalledWith(
            h.actor,
            'personal_client',
          );
        },
      );
      it('keeps the business actor and binds the read to the server-selected Client', async () => {
        const h = personalHarness();
        await expect(h.run()).resolves.toMatchObject({ status: 'completed' });
        expect(h.personalSelect).toHaveBeenCalledWith(
          h.actor,
          'personal_client',
        );
        expect(h.clientFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { tenantId: 'tenant-a', id: 'verified-client' },
          }),
        );
        expect(h.handlerExecute).toHaveBeenCalledWith(
          toolName,
          expect.objectContaining({
            role: UserRole.TENANT_OWNER,
            userId: h.actor.userId,
          }),
          {},
          IDEMPOTENCY_KEY,
        );
        expect(h.personalRevalidate).toHaveBeenCalledTimes(1);
      });
      it('refuses a changed verified Client episode instead of replaying the previous personal result', async () => {
        const h = personalHarness();
        await h.run();
        h.personalSelect.mockResolvedValue({
          ...h.personal,
          linkId: 'successor-link',
          clientId: 'other-verified-client',
        });
        await expect(h.run(true)).rejects.toBeInstanceOf(ConflictException);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      });
      it.each([false, true])(
        'withholds personal data when linkage changes in flight, replay=%s',
        async (replay) => {
          const h = personalHarness();
          if (replay) await h.run();
          h.personalRevalidate.mockRejectedValue(
            new ForbiddenException('personal_client_context_changed'),
          );
          await expect(h.run(replay)).rejects.toThrow(
            'personal_client_context_changed',
          );
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        },
      );
      it('fails closed if the verified personal context owner is not wired', async () => {
        const h = createHarness(undefined, false);
        await expect(
          h.tenantContext.runAsSystemTenant('tenant-a', () =>
            h.runtime.execute(customer, toolName, {
              surface: 'web',
              arguments: {},
            }),
          ),
        ).rejects.toThrow('verified_personal_read_context_required');
        expect(h.handlerExecute).not.toHaveBeenCalled();
        expect(h.executionFindUnique).not.toHaveBeenCalled();
      });
      it('revalidates again after asynchronous widget projection before returning personal data', async () => {
        const afterCompletedRead = jest.fn().mockResolvedValue(null);
        const h = personalHarness({ afterCompletedRead });
        afterCompletedRead.mockImplementation(() => {
          h.personalRevalidate.mockRejectedValue(
            new ForbiddenException('personal_client_context_changed'),
          );
          return Promise.resolve(null);
        });
        await expect(h.run(false, false)).rejects.toThrow(
          'personal_client_context_changed',
        );
        expect(afterCompletedRead).toHaveBeenCalledTimes(1);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('executes read-only tools directly and stores only encrypted results', async () => {
    const harness = createHarness();
    harness.handlerExecute.mockResolvedValue({ services: [] });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-a' });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'catalog.services.read',
          { arguments: {}, surface: 'web' },
        ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      execution_id: 'execution-a',
      result: { services: [] },
      replayed: false,
    });
    expect(harness.approvalCreate).not.toHaveBeenCalled();
    const executionUpdateInput = harness.getExecutionUpdateInput();
    const executionUpdateData = record(record(executionUpdateInput).data);
    expect(executionUpdateData.status).toBe('completed');
    expect(executionUpdateData.encryptedResult).toEqual(
      expect.stringMatching(/^encrypted:/),
    );
    expect(JSON.stringify(executionUpdateData)).not.toContain('customer_count');
  });

  it('SH-19 attaches the authorized widget resolution to a completed model-free read', async () => {
    const afterCompletedRead: jest.MockedFunction<
      AiReadWidgetTriggerPort['afterCompletedRead']
    > = jest.fn().mockResolvedValue({
      matched: true,
      receipt: { widget_id: 'widget-a' },
      dismiss_widget_id: null,
    });
    const trigger = {
      afterCompletedRead,
    } as unknown as AiReadWidgetTriggerPort;
    const harness = createHarness(trigger);
    harness.handlerExecute.mockResolvedValue({ services: [] });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-a' });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'catalog.services.read',
          { arguments: {}, surface: 'web' },
        ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      resolution: {
        matched: true,
        receipt: { widget_id: 'widget-a' },
      },
    });
    expect(afterCompletedRead).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'catalog.services.read',
        executionId: 'execution-a',
        trigger: 'T-2b',
        requestId: 'system:tenant-a',
      }),
    );
    const completedReadCall = afterCompletedRead.mock.calls[0]?.[0];
    expect(completedReadCall).toEqual(expect.any(Object));
    const conversationId = (completedReadCall as Record<string, unknown>)[
      'conversationId'
    ];
    expect(typeof conversationId).toBe('string');
    expect(conversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('D-17 binds a T-2b mint to the current server request trace when the caller supplies no internal trace', async () => {
    const afterCompletedRead = jest.fn().mockResolvedValue(null);
    const harness = createHarness({ afterCompletedRead });
    harness.handlerExecute.mockResolvedValue({ services: [] });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-traced' });

    await harness.tenantContext.run('request-d17', () =>
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'catalog.services.read',
          { arguments: {}, surface: 'web' },
        ),
      ),
    );

    expect(afterCompletedRead).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'T-2b',
        requestId: 'request-d17',
      }),
    );
  });

  it('returns the latest verified analytics snapshot when the CRM read fails', async () => {
    const afterCompletedRead = jest.fn();
    const harness = createHarness({ afterCompletedRead });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-failed' });
    harness.handlerExecute.mockRejectedValue(new Error('crm timeout'));
    harness.executionFindFirst.mockResolvedValue({
      id: 'execution-snapshot',
      encryptedResult: encryptFixture({
        verified: true,
        period: { timezone: 'Europe/Moscow' },
        metrics: { unique_clients: 41 },
      }),
      completedAt: new Date('2026-08-06T12:00:00.000Z'),
    });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'analytics.business.query',
          {
            arguments: {
              period: 'month_to_date',
              comparison: 'previous_period',
            },
            surface: 'native',
          },
        ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      execution_id: 'execution-snapshot',
      replayed: true,
      stale: true,
      result: {
        verified: true,
        metrics: { unique_clients: 41 },
        freshness: {
          status: 'stale',
          snapshot_at: '2026-08-06T12:00:00.000Z',
          reason: 'ai_tool_execution_failed',
        },
      },
    });
    expect(harness.getLastAuditLogInput()).toEqual(
      expect.objectContaining({
        action: 'ai.tool_execution_stale_replayed',
        entityId: 'execution-failed',
      }),
    );
    expect(afterCompletedRead).not.toHaveBeenCalled();
  });

  it('creates an approval without executing a write tool', async () => {
    const harness = createHarness();
    let capturedApprovalData: Record<string, unknown> = {};
    harness.approvalFindUnique.mockResolvedValue(null);
    harness.approvalCreate.mockImplementation((input: unknown) => {
      capturedApprovalData = record(record(input).data);
      return Promise.resolve(approvalRecord(capturedApprovalData));
    });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_12345678' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
    );

    expect(result).toMatchObject({
      status: 'approval_required',
      approval: {
        id: 'approval-a',
        tool_name: 'appointments.own.cancel',
        payload_preview: {
          action: 'cancel_appointment',
          appointment_id: 'appointment_12345678',
        },
      },
      replayed: false,
    });
    expect(harness.handlerExecute).not.toHaveBeenCalled();
    expect(harness.executionCreate).not.toHaveBeenCalled();
    expect(capturedApprovalData.encryptedArguments).toEqual(
      expect.stringMatching(/^encrypted:/),
    );
    expect(capturedApprovalData.payloadHash).toEqual(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('executes an actor-approved write exactly once', async () => {
    const harness = createHarness();
    let createdApproval = approvalRecord({});
    harness.approvalFindUnique
      .mockResolvedValueOnce(null)
      .mockImplementation(() => Promise.resolve(createdApproval));
    harness.approvalCreate.mockImplementation((input: unknown) => {
      createdApproval = approvalRecord(record(record(input).data));
      return Promise.resolve(createdApproval);
    });
    harness.approvalUpdateMany.mockResolvedValue({ count: 1 });
    harness.approvalFindUniqueOrThrow.mockImplementation(() =>
      Promise.resolve({ ...createdApproval, status: 'approved' }),
    );
    harness.membershipFindUnique.mockResolvedValue({
      role: UserRole.CUSTOMER,
      status: 'active',
      user: {
        id: customer.userId,
        status: 'active',
      },
    });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-approved' });
    harness.handlerExecute.mockResolvedValue({
      id: 'appointment_12345678',
      status: 'canceled',
    });

    const request = (await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_12345678' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
    )) as { approval: { payload_hash: string } };
    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.approve(customer, createdApproval.id, {
          payloadHash: request.approval.payload_hash,
        }),
    );

    expect(result).toMatchObject({
      status: 'completed',
      execution_id: 'execution-approved',
      result: { id: 'appointment_12345678', status: 'canceled' },
    });
    expect(harness.handlerExecute).toHaveBeenCalledTimes(1);
    expect(harness.policyAssertCanDecide).toHaveBeenCalledTimes(1);
    const approvalUpdateInput = harness.getApprovalUpdateInput();
    expect(record(record(approvalUpdateInput).data).status).toBe('completed');
  });

  it('blocks approval when the immutable payload hash is changed', async () => {
    const harness = createHarness();
    const approval = approvalRecord({ payloadHash: 'a'.repeat(64) });
    harness.approvalFindUnique.mockResolvedValue(approval);

    await expect(
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.approve(customer, approval.id, {
          payloadHash: 'b'.repeat(64),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.approvalUpdateMany).not.toHaveBeenCalled();
    expect(harness.handlerExecute).not.toHaveBeenCalled();
  });

  it('rejects reusing an approval key for a different payload', async () => {
    const harness = createHarness();
    harness.approvalFindUnique.mockResolvedValue(
      approvalRecord({
        payloadHash: 'a'.repeat(64),
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    );

    await expect(
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_87654321' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.approvalCreate).not.toHaveBeenCalled();
    expect(harness.handlerExecute).not.toHaveBeenCalled();
  });

  it('replays a completed approved result without a second domain call', async () => {
    const harness = createHarness();
    let createdApproval = approvalRecord({});
    harness.approvalFindUnique.mockResolvedValue(null);
    harness.approvalCreate.mockImplementation((input: unknown) => {
      createdApproval = approvalRecord(record(record(input).data));
      return Promise.resolve(createdApproval);
    });

    await harness.tenantContext.runAsSystemTenant('tenant-a', () =>
      harness.runtime.execute(customer, 'appointments.own.cancel', {
        arguments: { appointment_id: 'appointment_12345678' },
        surface: 'native',
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    );
    harness.approvalFindUnique.mockResolvedValue({
      ...createdApproval,
      status: 'completed',
    });
    harness.executionFindUnique.mockResolvedValue({
      id: 'execution-replay',
      toolName: 'appointments.own.cancel',
      encryptedResult: encryptFixture({
        id: 'appointment_12345678',
        status: 'canceled',
      }),
    });

    const replay = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_12345678' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
    );

    expect(replay).toMatchObject({
      status: 'completed',
      execution_id: 'execution-replay',
      replayed: true,
      result: { id: 'appointment_12345678', status: 'canceled' },
    });
    expect(harness.handlerExecute).not.toHaveBeenCalled();
    expect(harness.executionCreate).not.toHaveBeenCalled();
  });

  it('fails closed on cross-tenant principals before policy or handlers', async () => {
    const harness = createHarness();

    await expect(
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.execute(
          { ...customer, tenantId: 'tenant-b' },
          'appointments.own.list',
          { arguments: {}, surface: 'web' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.policyAssertCanExecute).not.toHaveBeenCalled();
    expect(harness.handlerExecute).not.toHaveBeenCalled();
  });
});

function createHarness(
  widgetTrigger?: AiReadWidgetTriggerPort,
  withPersonalContext = true,
) {
  const approvalFindUnique = jest.fn();
  const approvalCreate =
    jest.fn<(input: unknown) => Promise<Record<string, unknown>>>();
  const approvalUpdateMany = jest.fn();
  const approvalFindUniqueOrThrow = jest.fn();
  let approvalUpdateInput: unknown;
  const approvalUpdate = jest.fn<
    (input: unknown) => Promise<Record<string, unknown>>
  >((input) => {
    approvalUpdateInput = input;
    return Promise.resolve({});
  });
  const executionFindUnique = jest.fn();
  const executionFindFirst = jest.fn();
  const executionCreate = jest.fn();
  let executionUpdateInput: unknown;
  const executionUpdate = jest.fn<
    (input: unknown) => Promise<Record<string, unknown>>
  >((input) => {
    executionUpdateInput = input;
    return Promise.resolve({});
  });
  const membershipFindUnique = jest.fn();
  const clientFindMany = jest.fn().mockResolvedValue([]);
  const personalRevalidate = jest.fn().mockResolvedValue(undefined);
  const personal = {
    kind: 'personal_client',
    clientId: 'verified-client',
    linkId: 'verified-link',
    verificationEvidenceHash: 'a'.repeat(64),
    revalidate: personalRevalidate,
  };
  const personalSelect = jest.fn().mockResolvedValue(personal);
  const prisma = {
    aiApprovalRequest: {
      findUnique: approvalFindUnique,
      create: approvalCreate,
      updateMany: approvalUpdateMany,
      findUniqueOrThrow: approvalFindUniqueOrThrow,
      update: approvalUpdate,
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiToolExecution: {
      findUnique: executionFindUnique,
      findFirst: executionFindFirst,
      create: executionCreate,
      update: executionUpdate,
    },
    membership: { findUnique: membershipFindUnique },
    staff: { findMany: jest.fn().mockResolvedValue([]) },
    crmStaffAccess: { findMany: jest.fn().mockResolvedValue([]) },
    client: { findMany: clientFindMany },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;
  const tenantContext = new TenantContextService();
  const policyBuildPrincipal = jest.fn(
    (
      tenantId: string,
      userId: string,
      role: UserRole,
      surface: 'native' | 'web' | 'telegram' | 'voice',
    ) => ({ tenantId, userId, role, surface }),
  );
  const policyAssertCanExecute = jest.fn().mockResolvedValue(undefined);
  const policyAssertCanDecide = jest.fn();
  const policy = {
    buildPrincipal: policyBuildPrincipal,
    assertCanExecute: policyAssertCanExecute,
    assertCanDecide: policyAssertCanDecide,
    canDecide: jest.fn().mockReturnValue(false),
    listAllowed: jest.fn().mockResolvedValue([]),
  } as unknown as AiToolPolicyService;
  const handlerExecute = jest.fn();
  const handler = {
    execute: handlerExecute,
    // Доводка аргументов и обогащение карточки — тождественные для всего,
    // кроме записи расхода; настоящее поведение проверяется в её собственных
    // прогонах, здесь важно только что рантайм их зовёт.
    normalizeArguments: jest.fn(
      (_toolName: string, _principal: unknown, args: unknown) =>
        Promise.resolve(args),
    ),
    enrichApprovalPreview: jest.fn(
      (
        _toolName: string,
        _principal: unknown,
        _args: unknown,
        payload: unknown,
      ) => Promise.resolve(payload),
    ),
  } as unknown as AiToolHandlerService;
  const encryption = {
    encrypt: jest.fn(
      (value: string) =>
        `encrypted:${Buffer.from(value, 'utf8').toString('base64url')}`,
    ),
    decrypt: jest.fn((value: string) =>
      Buffer.from(value.slice('encrypted:'.length), 'base64url').toString(
        'utf8',
      ),
    ),
  } as unknown as EncryptionService;
  let lastAuditLogInput: unknown;
  const auditLogLog = jest.fn((input: unknown): Promise<{ id: string }> => {
    lastAuditLogInput = input;
    return Promise.resolve({ id: 'audit-a' });
  });
  const auditLog = { log: auditLogLog } as unknown as AuditLogService;

  return {
    runtime: new AiToolRuntimeService(
      prisma,
      tenantContext,
      new AiToolRegistryService(),
      policy,
      handler,
      encryption,
      auditLog,
      canonicalReceiptFixture(prisma, encryption),
      widgetTrigger === undefined
        ? undefined
        : ({ get: jest.fn().mockReturnValue(widgetTrigger) } as never),
      withPersonalContext
        ? ({
            select: personalSelect,
          } as unknown as PersonalClientContextService)
        : undefined,
    ),
    tenantContext,
    approvalFindUnique,
    approvalCreate,
    approvalUpdateMany,
    approvalFindUniqueOrThrow,
    approvalUpdate,
    executionFindUnique,
    executionFindFirst,
    executionCreate,
    executionUpdate,
    membershipFindUnique,
    clientFindMany,
    personalSelect,
    personalRevalidate,
    personal,
    handlerExecute,
    policyAssertCanExecute,
    policyAssertCanDecide,
    getLastAuditLogInput: () => lastAuditLogInput,
    getApprovalUpdateInput: () => approvalUpdateInput,
    getExecutionUpdateInput: () => executionUpdateInput,
  };
}

function approvalRecord(overrides: Record<string, unknown>) {
  const now = new Date('2026-07-15T12:00:00.000Z');
  return {
    id: 'approval-a',
    tenantId: 'tenant-a',
    requestedByUserId: 'customer_12345678',
    requestedByTenantId: 'tenant-a',
    decidedByUserId: null,
    decidedByTenantId: null,
    toolName: 'appointments.own.cancel',
    surface: 'native',
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    status: 'pending',
    summary: 'Cancel the selected appointment.',
    payloadHash: 'a'.repeat(64),
    payloadPreviewJson: {
      action: 'cancel_appointment',
      appointment_id: 'appointment_12345678',
    },
    encryptedArguments:
      'encrypted:eyJhcHBvaW50bWVudF9pZCI6ImFwcG9pbnRtZW50XzEyMzQ1Njc4In0',
    idempotencyKey: IDEMPOTENCY_KEY,
    expiresAt: new Date(Date.now() + 60_000),
    decidedAt: null,
    executedAt: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function encryptFixture(value: unknown): string {
  return `encrypted:${Buffer.from(JSON.stringify(value), 'utf8').toString(
    'base64url',
  )}`;
}
