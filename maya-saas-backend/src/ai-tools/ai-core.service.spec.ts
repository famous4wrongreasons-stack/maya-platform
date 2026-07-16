import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision } from './ai-core.types';
import { AiToolRuntimeService } from './ai-tool-runtime.service';

describe('AiCoreService', () => {
  const user: AuthenticatedUser = {
    userId: 'owner-user',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };
  const dto = {
    surface: 'web' as const,
    requestId: 'request_12345678',
    messages: [{ role: 'user' as const, content: 'Покажи показатели' }],
  };

  it('returns a safe fallback without calling tools when no model is configured', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(null);

    const result = await mocks.service.chat(user, dto);

    expect(result.source).toBe('safe_fallback');
    expect(result.action).toBeNull();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(mocks.rateLimit.assertTenant).toHaveBeenCalledWith('ai_chat', {
      tenantId: 'tenant-a',
      identity: 'owner-user',
    });
  });

  it('redacts PII, executes an allowed read tool and synthesizes the reply', async () => {
    const mocks = createService();
    const first = decision({
      reply: 'Проверяю.',
      toolCall: {
        name: 'analytics.business.read',
        arguments: {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-15T00:00:00.000Z',
        },
      },
    });
    const second = decision({
      reply: '<b>Выручка выросла.</b>',
      toolCall: null,
    });
    mocks.model.decide
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-a',
      tool_name: 'analytics.business.read',
      result: {
        revenue: [{ currency: 'RUB', amount_kopecks: 100_000 }],
        client_phone: '+79180000000',
      },
      replayed: false,
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content:
            'Клиент Иван, +7 918 000-00-00, ivan@example.com: покажи выручку',
        },
      ],
    });

    const firstInput = mocks.model.decide.mock.calls[0]?.[0];
    expect(JSON.stringify(firstInput)).not.toContain('Иван');
    expect(JSON.stringify(firstInput)).not.toContain('918 000');
    expect(JSON.stringify(firstInput)).not.toContain('ivan@example.com');
    expect(result).toMatchObject({
      reply: 'Выручка выросла.',
      source: 'deepseek',
      redacted_input: true,
      tools_used: [
        {
          name: 'analytics.business.read',
          status: 'completed',
          execution_id: 'execution-a',
        },
      ],
    });
    expect(mocks.model.decide.mock.calls[1]?.[0].toolResults).toEqual([
      {
        name: 'analytics.business.read',
        result: { revenue: [{ currency: 'RUB', amount_kopecks: 100_000 }] },
      },
    ]);
    expect(
      JSON.stringify(mocks.model.decide.mock.calls[1]?.[0].toolResults),
    ).not.toContain('+79180000000');
  });

  it('stops at the immutable approval instead of letting the model write', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Подготовлю изменение.',
        toolCall: {
          name: 'loyalty.internal.adjust',
          arguments: {
            target_user_id: 'customer_123',
            delta: 100,
            reason: 'Компенсация',
          },
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'approval_required',
      approval: {
        id: 'approval-a',
        payload_hash: 'a'.repeat(64),
        payload_preview: { delta: 100 },
      },
      replayed: false,
    });

    const result = await mocks.service.chat(user, dto);

    expect(result).toMatchObject({
      action: {
        status: 'approval_required',
        approval: { id: 'approval-a' },
      },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    const executeCall = mocks.runtime.execute.mock.calls[0];
    expect(executeCall?.[0]).toBe(user);
    expect(executeCall?.[1]).toBe('loyalty.internal.adjust');
    expect(executeCall?.[2].surface).toBe('web');
    expect(executeCall?.[2].idempotencyKey).toMatch(/^ai-chat-[a-f0-9]{64}$/);
  });

  it('redacts standalone likely names before the external model boundary', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Уточните период.', toolCall: null }),
    );

    await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content: 'Иван записан сегодня. Покажи Ивана в отчёте.',
        },
      ],
    });

    const modelInput = JSON.stringify(mocks.model.decide.mock.calls[0]?.[0]);
    expect(modelInput).not.toContain('Иван');
    expect(modelInput).not.toContain('Ивана');
    expect(modelInput).toContain('[name removed]');
  });

  it('keeps ordinary capitalized words so the model can understand the request', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Показываю.', toolCall: null }),
    );

    await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content: 'Сегодня покажи Записи и Выручку.',
        },
      ],
    });

    const modelInput = JSON.stringify(mocks.model.decide.mock.calls[0]?.[0]);
    expect(modelInput).toContain('Сегодня покажи Записи и Выручку.');
  });

  it('fails closed when the model requests a tool unavailable to the role', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Запускаю.',
        toolCall: { name: 'system.shell.execute', arguments: {} },
      }),
    );

    await expect(
      mocks.service.chat(user, dto),
    ).rejects.toMatchObject<ServiceUnavailableException>({ status: 503 });
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(mocks.auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai.core_turn_failed' }),
    );
  });

  function decision(
    value: Pick<AiCoreModelDecision, 'reply' | 'toolCall'>,
  ): AiCoreModelDecision {
    return {
      ...value,
      provider: 'deepseek',
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  function createService() {
    const config = {
      get: jest.fn((name: string) =>
        name === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
      ),
    };
    const tenantContext = {
      assertTenantId: jest.fn((tenantId: string) => tenantId),
    };
    const assertTenant: jest.MockedFunction<
      AuthRateLimitService['assertTenant']
    > = jest.fn().mockResolvedValue(undefined);
    const rateLimit = { assertTenant };
    const listTools: jest.MockedFunction<AiToolRuntimeService['listTools']> =
      jest.fn();
    listTools.mockResolvedValue({
      tools: [
        {
          name: 'analytics.business.read',
          description: 'Read analytics',
          input_schema: { type: 'object' },
          risk_tier: 'read',
          approval_policy: 'none',
          idempotency: 'none',
          timeout_ms: 8_000,
        },
        {
          name: 'loyalty.internal.adjust',
          description: 'Adjust loyalty',
          input_schema: { type: 'object' },
          risk_tier: 'high_write',
          approval_policy: 'owner',
          idempotency: 'required',
          timeout_ms: 8_000,
        },
      ],
    });
    const execute: jest.MockedFunction<AiToolRuntimeService['execute']> =
      jest.fn();
    const runtime = {
      listTools,
      execute,
    };
    const decide: jest.MockedFunction<AiCoreModelService['decide']> = jest.fn();
    const model = { decide };
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AiCoreService(
      config as unknown as ConfigService,
      tenantContext as unknown as TenantContextService,
      rateLimit as unknown as AuthRateLimitService,
      runtime as unknown as AiToolRuntimeService,
      model as unknown as AiCoreModelService,
      auditLog as unknown as AuditLogService,
    );
    return { auditLog, model, rateLimit, runtime, service };
  }
});
