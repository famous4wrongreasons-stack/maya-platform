import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision } from './ai-core.types';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

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

  it('introduces MAYA and lists personal analytics settings without calling a model', async () => {
    const mocks = createService();

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Что ты умеешь?' }],
    });

    expect(result.reply).toContain('Я MAYA, ваша операционная помощница');
    expect(result.reply).toContain('Аналитика бизнеса');
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.listTools).not.toHaveBeenCalled();
  });

  it('enables a named analytics capability directly from chat', async () => {
    const mocks = createService();

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Включи анализ сотрудников' }],
    });

    expect(result.reply).toContain('Включила: Эффективность команды');
    const updateCall = mocks.dashboardPreferences.updateAssistant.mock.calls[0];
    expect(updateCall?.[0]).toBe('tenant-a');
    expect(updateCall?.[1]).toBe('owner-user');
    const enabledCapabilities = (
      updateCall?.[2] as { enabledCapabilities?: string[] } | undefined
    )?.enabledCapabilities;
    expect(enabledCapabilities).toEqual([
      'business_analytics',
      'staff_performance',
    ]);
    expect(mocks.model.decide).not.toHaveBeenCalled();
  });

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

  it('redacts PII, executes an allowed read tool and formats the reply deterministically', async () => {
    const mocks = createService();
    const first = decision({
      reply: 'Проверяю.',
      toolCall: {
        name: 'analytics.business.read',
        arguments: {
          period: 'month_to_date',
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
    expect(firstInput?.requiredToolNames).toEqual(['analytics.business.read']);
    expect(firstInput?.persona).toBe('director');
    expect(result).toMatchObject({
      reply: 'Выручка по бизнесу за выбранный период: 1 000 ₽.',
      source: 'deepseek',
      redacted_input: true,
      grounding: {
        status: 'verified',
        domain: 'business_analytics',
        evidence_tools: ['analytics.business.read'],
      },
      tools_used: [
        {
          name: 'analytics.business.read',
          status: 'completed',
          execution_id: 'execution-a',
        },
      ],
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).not.toContain('+79180000000');
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

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Начисли клиенту 100 баллов компенсации.' },
      ],
    });

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

  it('preserves an ISO booking date while redacting a phone number', async () => {
    const mocks = createService(['booking.availability.read']);
    mocks.model.decide.mockResolvedValue(null);

    await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content:
            'Покажи свободные окна на 2026-07-31. Телефон +7 918 000-00-00.',
        },
      ],
    });

    const firstInput = mocks.model.decide.mock.calls[0]?.[0];
    expect(JSON.stringify(firstInput)).toContain('2026-07-31');
    expect(JSON.stringify(firstInput)).not.toContain('918 000');
  });

  it('returns deterministic availability instead of letting the model contradict slots', async () => {
    const mocks = createService(['booking.availability.read']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю окна.',
        toolCall: {
          name: 'booking.availability.read',
          arguments: { date: '2026-07-31T00:00:00.000Z' },
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-availability',
      result: {
        slots: [
          {
            start: '2026-07-31T07:00:00.000Z',
            end: '2026-07-31T08:00:00.000Z',
          },
          {
            start: '2026-07-31T08:00:00.000Z',
            end: '2026-07-31T09:00:00.000Z',
          },
        ],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content: 'Покажи свободные окна на 2026-07-31.',
        },
      ],
    });

    expect(result).toMatchObject({
      reply:
        'На 31.07.2026 есть свободные окна: 2 варианта времени. Уточните специалиста или услугу, чтобы сузить выбор.',
      grounding: {
        status: 'verified',
        domain: 'booking_availability',
      },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
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
          content: 'Обсудим разделы Записи и Выручка.',
        },
      ],
    });

    const modelInput = JSON.stringify(mocks.model.decide.mock.calls[0]?.[0]);
    expect(modelInput).toContain('Обсудим разделы Записи и Выручка.');
  });

  it('retries once and blocks a factual reply when the model skips its tool', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Выручка составила 999 999 ₽.', toolCall: null }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Покажи выручку за месяц.' }],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: {
        status: 'blocked',
        domain: 'business_analytics',
        required_tools: ['analytics.business.read'],
        evidence_tools: [],
      },
    });
    expect(result.reply).not.toContain('999');
  });

  it('accepts financial figures only when the server tool returned them', async () => {
    const mocks = createService();
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: {
              period: 'custom',
              from: '2026-07-01T00:00:00.000Z',
              to: '2026-07-31T23:59:59.999Z',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({ reply: 'Выручка: 1 000 ₽.', toolCall: null }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-grounded',
      result: {
        revenue: [
          {
            currency: 'RUB',
            amount_kopecks: 100_000,
            amount_major_units: 1_000,
          },
        ],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Покажи выручку за июль.' }],
    });

    expect(result).toMatchObject({
      reply: 'Выручка по бизнесу за выбранный период: 1 000 ₽.',
      source: 'deepseek',
      grounding: { status: 'verified' },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('blocks a figure that differs from the completed tool result', async () => {
    const mocks = createService();
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: {
              period: 'custom',
              from: '2026-07-01T00:00:00.000Z',
              to: '2026-07-31T23:59:59.999Z',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({ reply: 'Выручка: 9 999 ₽.', toolCall: null }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-mismatch',
      result: {
        revenue: [
          {
            currency: 'RUB',
            amount_kopecks: 100_000,
            amount_major_units: 1_000,
          },
        ],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Покажи аналитику за июль.' }],
    });

    expect(result.source).toBe('safe_fallback');
    expect(result.grounding.status).toBe('blocked');
    expect(result.reply).not.toContain('9 999');
  });

  it('fails safely before the model when no authoritative schedule tool exists', async () => {
    const mocks = createService();

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Кто работает сегодня?' }],
    });

    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: { status: 'blocked', domain: 'staff_schedule' },
    });
  });

  it('grounds a customer loyalty balance in the authenticated customer tool', async () => {
    const customer: AuthenticatedUser = {
      ...user,
      userId: 'customer-user',
      role: UserRole.CUSTOMER,
    };
    const mocks = createService(['loyalty.own.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю баланс.',
          toolCall: { name: 'loyalty.own.read', arguments: {} },
        }),
      )
      .mockResolvedValueOnce(
        decision({ reply: 'Ваш баланс: 2 133 балла.', toolCall: null }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-loyalty',
      result: { balance: 2_133, currency: 'RUB', authoritative: true },
    });

    const result = await mocks.service.chat(customer, {
      ...dto,
      messages: [{ role: 'user', content: 'Сколько у меня баллов?' }],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'loyalty.own.read',
    ]);
    expect(mocks.model.decide.mock.calls[0]?.[0].persona).toBe('admin');
    expect(result).toMatchObject({
      reply: 'Ваш баланс: 2 133 балла.',
      grounding: {
        status: 'verified',
        domain: 'client_loyalty',
        evidence_tools: ['loyalty.own.read'],
      },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('grounds a request to spend bonuses before suggesting a service', async () => {
    const customer: AuthenticatedUser = {
      ...user,
      userId: 'customer-user',
      role: UserRole.CUSTOMER,
    };
    const mocks = createService(['loyalty.own.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю варианты.',
          toolCall: { name: 'loyalty.own.read', arguments: {} },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply: 'У вас 2 133 балла. По сумме хватает на SPA за 1 200.',
          toolCall: null,
        }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-loyalty-spend',
      result: {
        balance: 2_133,
        spend_options: {
          verification_required: true,
          items: [{ name: 'SPA', points_required: 1_200 }],
        },
      },
    });

    const result = await mocks.service.chat(customer, {
      surface: 'web',
      messages: [{ role: 'user', content: 'На что я могу потратить бонусы?' }],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'loyalty.own.read',
    ]);
    expect(result).toMatchObject({
      reply:
        'Ваш баланс: 2 133 балла. Можно рассмотреть: SPA — 1 200 баллов. Перед списанием MAYA ещё раз проверит сумму и попросит подтверждение.',
      grounding: { status: 'verified', domain: 'client_loyalty' },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('grounds the authenticated customer appointment history', async () => {
    const customer: AuthenticatedUser = {
      ...user,
      userId: 'customer-user',
      role: UserRole.CUSTOMER,
    };
    const mocks = createService(['appointments.own.list']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю записи.',
        toolCall: { name: 'appointments.own.list', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-appointments',
      result: {
        appointments: [
          { status: 'confirmed', is_upcoming: true },
          { status: 'canceled', is_upcoming: false },
        ],
      },
    });

    const result = await mocks.service.chat(customer, {
      ...dto,
      messages: [{ role: 'user', content: 'Какие у меня записи?' }],
    });

    expect(result).toMatchObject({
      reply:
        'В вашей истории 2 записи. Предстоящих: 1, отменённых: 1. Подробности доступны в разделе «Записи».',
      grounding: {
        status: 'verified',
        domain: 'client_appointments',
        evidence_tools: ['appointments.own.list'],
      },
    });
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'appointments.own.list',
    ]);
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('explains access denial without pretending the protected source is offline', async () => {
    const customer: AuthenticatedUser = {
      ...user,
      userId: 'customer-user',
      role: UserRole.CUSTOMER,
    };
    const mocks = createService(['appointments.own.list']);

    const result = await mocks.service.chat(customer, {
      ...dto,
      messages: [
        { role: 'user', content: 'Какая выручка бизнеса за этот месяц?' },
      ],
    });

    expect(result).toMatchObject({
      reply:
        'Этот запрос недоступен для вашей текущей роли или тарифа. MAYA не покажет чужие или закрытые данные.',
      source: 'safe_fallback',
      grounding: {
        status: 'blocked',
        domain: 'business_analytics',
      },
    });
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('uses employee analytics rather than business totals for staff', async () => {
    const employee: AuthenticatedUser = {
      ...user,
      userId: 'employee-user',
      role: UserRole.EMPLOYEE,
    };
    const mocks = createService(['analytics.employee.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю личные показатели.',
          toolCall: {
            name: 'analytics.employee.read',
            arguments: { period: 'month_to_date' },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({ reply: 'Ваша выручка: 99 400 ₽.', toolCall: null }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-employee',
      result: {
        revenue: [
          {
            currency: 'RUB',
            amount_kopecks: 9_940_000,
            amount_major_units: 99_400,
          },
        ],
      },
    });

    const result = await mocks.service.chat(employee, {
      ...dto,
      messages: [{ role: 'user', content: 'Покажи мою выручку за месяц.' }],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.employee.read',
    ]);
    expect(result).toMatchObject({
      reply: 'Выручка по вашим данным за выбранный период: 99 400 ₽.',
      grounding: {
        status: 'verified',
        domain: 'personal_analytics',
      },
    });
    expect(mocks.runtime.execute.mock.calls[0]?.[1]).toBe(
      'analytics.employee.read',
    );
  });

  it('refuses to label operating data as gross profit', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю.',
        toolCall: {
          name: 'analytics.business.read',
          arguments: { period: 'month_to_date' },
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-profit',
      result: {
        revenue: [
          {
            currency: 'RUB',
            amount_kopecks: 10_000_000,
            amount_major_units: 100_000,
          },
        ],
        net: [
          {
            currency: 'RUB',
            amount_kopecks: 6_000_000,
            amount_major_units: 60_000,
          },
        ],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Какая валовая прибыль бизнеса за месяц?' },
      ],
    });

    expect(result.reply).toContain('Валовая прибыль сейчас не рассчитывается');
    expect(result.reply).not.toContain('100 000');
    expect(result.reply).not.toContain('60 000');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_analytics',
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('returns only the verified CRM payroll aggregate for salary questions', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю.',
        toolCall: {
          name: 'analytics.business.read',
          arguments: { period: 'month_to_date' },
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-payroll',
      result: {
        data_source: 'crm',
        finance: {
          source: 'external_crm',
          payroll: {
            status: 'available',
            verified: true,
            accrued_total: {
              currency: 'RUB',
              amount_kopecks: 56_388_001,
              amount_major_units: 563_880.01,
            },
            paid_total: {
              currency: 'RUB',
              amount_kopecks: 0,
              amount_major_units: 0,
            },
            balance_total: {
              currency: 'RUB',
              amount_kopecks: 56_388_001,
              amount_major_units: 563_880.01,
            },
          },
        },
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Какая зарплата сотрудников за месяц?' },
      ],
    });

    expect(result.reply).toBe(
      'Начислено сотрудникам по данным CRM за выбранный период: 563 880,01 ₽. Выплачено: 0 ₽. Остаток к выплате: 563 880,01 ₽.',
    );
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_analytics',
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('does not turn unavailable CRM revenue into zero', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю.',
        toolCall: {
          name: 'analytics.business.read',
          arguments: { period: 'month_to_date' },
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-revenue-unavailable',
      result: {
        data_source: 'crm',
        revenue: [],
        finance: {
          source: 'external_crm',
          revenue: { status: 'unavailable', verified: false, total: null },
        },
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Какая выручка за месяц?' }],
    });

    expect(result.reply).toContain(
      'Подтверждённые денежные поступления по бизнесу за выбранный период недоступны',
    );
    expect(result.reply).not.toContain('0 ₽');
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('grounds an appointment count in business analytics', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю.',
        toolCall: {
          name: 'analytics.business.read',
          arguments: { period: 'month_to_date' },
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-appointment-count',
      result: {
        appointments: { total: 12, active: 10, cancelled: 2 },
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Сколько записей у бизнеса за месяц?' },
      ],
    });

    expect(result).toMatchObject({
      reply:
        'Записей по бизнесу за выбранный период: 12. Активных: 10, отменённых: 2.',
      grounding: {
        status: 'verified',
        domain: 'business_analytics',
      },
    });
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.business.read',
    ]);
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
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
      mocks.service.chat(user, {
        ...dto,
        messages: [{ role: 'user', content: 'Выполни системную команду.' }],
      }),
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

  function createService(
    toolNames = ['analytics.business.read', 'loyalty.internal.adjust'],
  ) {
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
      tools: toolNames.map((name) => ({
        name,
        description: `Tool ${name}`,
        input_schema: { type: 'object' },
        risk_tier: name === 'loyalty.internal.adjust' ? 'high_write' : 'read',
        approval_policy: name === 'loyalty.internal.adjust' ? 'owner' : 'none',
        idempotency: name === 'loyalty.internal.adjust' ? 'required' : 'none',
        timeout_ms: 8_000,
      })),
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
    const dashboardPreferences = {
      getAssistant: jest.fn().mockResolvedValue({
        config: { enabled_capabilities: ['business_analytics'] },
      }),
      updateAssistant: jest.fn((_: string, __: string, value: object) =>
        Promise.resolve({
          config: {
            enabled_capabilities:
              'enabledCapabilities' in value
                ? (value.enabledCapabilities as string[])
                : ['business_analytics'],
          },
        }),
      ),
    };
    const staffScheduleCommand = {
      tryHandle: jest.fn().mockResolvedValue(null),
    };
    const service = new AiCoreService(
      config as unknown as ConfigService,
      tenantContext as unknown as TenantContextService,
      rateLimit as unknown as AuthRateLimitService,
      runtime as unknown as AiToolRuntimeService,
      model as unknown as AiCoreModelService,
      auditLog as unknown as AuditLogService,
      dashboardPreferences as unknown as DashboardPreferencesService,
      staffScheduleCommand as unknown as StaffScheduleCommandService,
    );
    return {
      auditLog,
      dashboardPreferences,
      model,
      rateLimit,
      runtime,
      service,
      staffScheduleCommand,
    };
  }
});
