import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { MayaBrainService } from '../ai-brain/maya-brain.service';
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

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Привет' }],
    });

    expect(result.source).toBe('safe_fallback');
    expect(result.action).toBeNull();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(mocks.rateLimit.assertTenant).toHaveBeenCalledWith('ai_chat', {
      tenantId: 'tenant-a',
      identity: 'owner-user',
    });
    expect(mocks.brain.recordOutcome).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ blocked: false }),
    );
  });

  it('does not let an active Brain invent a procedural answer without a source', async () => {
    const mocks = createService();
    mocks.brain.prepare.mockResolvedValue({
      active: true,
      sessionId: 'brain-session-knowledge',
      persona: 'director',
      profile: 'maya_os',
      intent: 'knowledge',
      knowledgeRequired: true,
      plan: {
        status: 'active',
        steps: [
          { key: 'retrieve_sources', status: 'pending' },
          { key: 'answer_with_citations', status: 'pending' },
        ],
      },
      promptVersion: 'maya-brain-test',
      profileInstructions: 'Use only retrieved knowledge.',
      preferences: [],
      knowledge: [],
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Как правильно закрыть смену?' }],
    });

    expect(result).toMatchObject({
      source: 'safe_fallback',
      brain: { active: true, intent: 'knowledge' },
    });
    expect(result.reply).toContain('Не нашла подтверждённого ответа');
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.listTools).not.toHaveBeenCalled();
    expect(mocks.brain.recordOutcome).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ blocked: true }),
    );
  });

  it('redacts PII, executes an allowed read tool and lets the model answer from its result', async () => {
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
      reply:
        '<b>Выручка по бизнесу за период выросла, считаю по данным CRM.</b>',
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
    // 152-ФЗ: имя, телефон и почта клиента не пересекают внешнюю границу
    // модели. Это единственный контур, который вообще нельзя обсуждать.
    expect(JSON.stringify(firstInput)).not.toContain('Иван');
    expect(JSON.stringify(firstInput)).not.toContain('918 000');
    expect(JSON.stringify(firstInput)).not.toContain('ivan@example.com');
    expect(firstInput?.requiredToolNames).toEqual(['analytics.business.read']);
    expect(firstInput?.persona).toBe('director');
    const secondInput = mocks.model.decide.mock.calls[1]?.[0];
    // Второй ход опаснее первого: ПД теперь могут прийти «с другой стороны» —
    // из результата инструмента. Телефон обязан быть вырезан и там.
    expect(JSON.stringify(secondInput)).not.toContain('+79180000000');
    // Суть новой схемы: модель пишет ответ, ГЛЯДЯ на цифры инструмента,
    // а не по памяти. Проверяем, что запрошенные ею данные до неё дошли.
    expect(secondInput?.toolResults?.[0]?.name).toBe('analytics.business.read');
    expect(result).toMatchObject({
      reply: 'Выручка по бизнесу за период выросла, считаю по данным CRM.',
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
    // Ход к инструменту + ход с ответом: модель вызывается ровно дважды.
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(result.reply).not.toContain('+79180000000');
    // Разметку из ответа модели по-прежнему вычищаем перед выдачей наружу.
    expect(result.reply).not.toContain('<b>');
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

  it('lets the model describe only the slots the availability tool returned', async () => {
    const mocks = createService(['booking.availability.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю окна.',
          toolCall: {
            name: 'booking.availability.read',
            arguments: { date: '2026-07-31T00:00:00.000Z' },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'На эту дату есть два свободных окна подряд, оба утром. Подсказать ближайшее?',
          toolCall: null,
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

    // Свободное время нельзя выдумать: слоты приходят только из инструмента,
    // и проверяем мы именно то, что они дошли до модели перед ответом.
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe('booking.availability.read');
    expect(result).toMatchObject({
      reply:
        'На эту дату есть два свободных окна подряд, оба утром. Подсказать ближайшее?',
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'booking_availability',
      },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
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

    // Сумма в ответе — ровно та, что вернул инструмент (100 000 копеек),
    // поэтому сторож чисел пропускает текст модели без правок.
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe('analytics.business.read');
    expect(result).toMatchObject({
      reply: 'Выручка: 1 000 ₽.',
      source: 'deepseek',
      grounding: { status: 'verified' },
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
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

    // Клиент ходит только в own-scope инструмент и общается с персоной admin —
    // это защита от чужих балансов, и её смена контракта не касается.
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'loyalty.own.read',
    ]);
    expect(mocks.model.decide.mock.calls[0]?.[0].persona).toBe('admin');
    // 🔴 Баланс — личные данные спрашивающего, поэтому ответ собирает сервер, а
    // результат инструмента во внешнюю модель не уходит вовсе: второго вызова
    // нет. Ради гладкой формулировки контур 152-ФЗ не размениваем.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      reply: 'Ваш баланс: 2 133 балла.',
      source: 'safe_fallback',
      grounding: {
        status: 'verified',
        domain: 'client_loyalty',
        evidence_tools: ['loyalty.own.read'],
      },
    });
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
    // Ни баланс, ни доступные к списанию услуги во внешнюю модель не уезжают.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(mocks.model.decide.mock.calls[0]?.[0].toolResults),
    ).not.toContain('SPA');
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: { status: 'verified', domain: 'client_loyalty' },
    });
    // 🔴 Обещание переподтверждения обязано звучать всегда: без него клиент
    // решит, что баллы уже списаны. Это гарантия сервера, а не добрая воля
    // модели — поэтому проверяем дословно.
    expect(result.reply).toContain(
      'Перед списанием MAYA ещё раз проверит сумму и попросит подтверждение.',
    );
    expect(result.reply).toContain('2 133');
    expect(result.reply).toContain('1 200');
  });

  it('grounds the authenticated customer appointment history', async () => {
    const customer: AuthenticatedUser = {
      ...user,
      userId: 'customer-user',
      role: UserRole.CUSTOMER,
    };
    const mocks = createService(['appointments.own.list']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю записи.',
          toolCall: { name: 'appointments.own.list', arguments: {} },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'Одна запись впереди, ещё одна была отменена. Подробности — в разделе «Записи».',
          toolCall: null,
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
      source: 'safe_fallback',
      grounding: {
        status: 'verified',
        domain: 'client_appointments',
        evidence_tools: ['appointments.own.list'],
      },
    });
    // История записей читается только own-scope инструментом и только персоной
    // admin: клиент не должен получить доступ к чужим визитам ни на одном ходу.
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'appointments.own.list',
    ]);
    expect(mocks.model.decide.mock.calls[0]?.[0].persona).toBe('admin');
    // 🔴 Главное в этом тесте. Набор визитов идентифицирует человека сам по
    // себе — по датам, услугам и суммам, даже без имени и телефона. Поэтому
    // ответ собирает сервер, а во внешнюю модель история НЕ уходит: второго
    // вызова нет, и ни один визит не попадает в её вход.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(mocks.model.decide.mock.calls[0]?.[0].toolResults),
    ).toBe('[]');
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

    // Сотруднику разрешён только его личный срез. Бизнес-итоги не должны
    // появиться ни в требованиях, ни среди фактически вызванных инструментов.
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.employee.read',
    ]);
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe('analytics.employee.read');
    expect(result).toMatchObject({
      reply: 'Ваша выручка: 99 400 ₽.',
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'personal_analytics',
      },
    });
    expect(mocks.runtime.execute.mock.calls.map((call) => call[1])).toEqual([
      'analytics.employee.read',
    ]);
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('loads verified CRM context for an open-ended owner business question', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-open-owner-query',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'none' },
        metrics: {
          revenue_amount_kopecks: 15_000_000,
          appointments_total: 120,
          unique_clients: 80,
        },
        changes: {},
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Сейчас в первую очередь стоит разобрать поток клиентов.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Что сейчас требует моего внимания?' },
      ],
    });

    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'analytics.business.query',
      expect.objectContaining({
        arguments: { period: 'month_to_date', comparison: 'none' },
      }),
    );
    expect(result).toMatchObject({
      grounding: {
        status: 'verified',
        domain: 'business_query',
      },
    });
  });

  it('does not load a CRM report for a simple owner greeting', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Здравствуйте! Чем помочь?', toolCall: null }),
    );

    await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Привет!' }],
    });

    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([]);
  });

  it('blocks a repeated client upsell after the client asks for only a haircut', async () => {
    const client: AuthenticatedUser = {
      ...user,
      userId: 'client-user',
      role: UserRole.CLIENT,
    };
    const mocks = createService([]);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply:
          'Можем добавить моделирование бороды. Добавляем или только стрижка?',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(client, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'assistant',
          content: 'К стрижке можно добавить уход за бородой.',
        },
        { role: 'user', content: 'Только стрижка.' },
      ],
    });

    expect(result.reply).toContain('без дополнительных услуг');
    expect(result.reply).toContain('Продолжаем запись');
    expect(result.reply).not.toContain('моделирование бороды');
  });

  it('does not let a client upsell bypass the verified service catalog', async () => {
    const client: AuthenticatedUser = {
      ...user,
      userId: 'client-user',
      role: UserRole.CLIENT,
    };
    const mocks = createService([]);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Можем добавить моделирование бороды. Добавляем?',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(client, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Хочу мужскую стрижку.' }],
    });

    expect(result.reply).toContain('после проверки каталога');
    expect(result.reply).not.toContain('моделирование бороды');
  });

  it('allows one client upsell after the service catalog is verified', async () => {
    const client: AuthenticatedUser = {
      ...user,
      userId: 'client-user',
      role: UserRole.CLIENT,
    };
    const mocks = createService(['catalog.services.read']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-service-catalog',
      result: {
        services: [
          {
            id: 'service-beard',
            name: 'Моделирование бороды',
            price: 1_000,
            currency: 'RUB',
          },
        ],
      },
    });
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверю каталог.',
          toolCall: { name: 'catalog.services.read', arguments: {} },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'К стрижке можно один раз добавить моделирование бороды. Хотите добавить?',
          toolCall: null,
        }),
      );

    const result = await mocks.service.chat(client, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Что можно добавить к мужской стрижке?' },
      ],
    });

    expect(result.reply).toContain('моделирование бороды');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      client,
      'catalog.services.read',
      expect.any(Object),
    );
  });

  it('preloads verified CRM data and lets the model name the weakest service', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-business-query',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: { appointments_total: 120, unique_clients: 80 },
        changes: {
          unique_clients: {
            current: 80,
            previous: 100,
            delta: -20,
            percent_change: -20,
          },
        },
        current: {
          service_summary: [{ name: 'Мужская стрижка', appointments: 60 }],
        },
        service_changes: [
          {
            name: 'Мужская стрижка',
            current_appointments: 60,
            previous_appointments: 75,
            delta: -15,
            percent_change: -20,
          },
        ],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply:
          'Сильнее всего просела мужская стрижка. Проверьте окна и возврат клиентов.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'Какая услуга просела по сравнению с предыдущим месяцем?',
        },
      ],
    });

    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'analytics.business.query',
      expect.objectContaining({
        surface: 'native',
        arguments: {
          period: 'month_to_date',
          comparison: 'previous_period',
        },
      }),
    );
    // Предзагрузка экономит ход: данные уже на руках, поэтому модель зовётся
    // один раз — сразу с результатом инструмента, а не за ним.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    const first = mocks.model.decide.mock.calls[0]?.[0];
    expect(first?.toolResults?.[0]?.name).toBe('analytics.business.query');
    expect(result).toMatchObject({
      reply:
        'Сильнее всего просела мужская стрижка. Проверьте окна и возврат клиентов.',
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'business_query',
        evidence_tools: ['analytics.business.query'],
      },
    });
  });

  it('answers from verified business data when the model is temporarily unavailable', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-business-fallback',
      result: {
        verified: true,
        source: 'crm',
        period: { timezone: 'Europe/Moscow' },
        freshness: {
          status: 'stale',
          snapshot_at: '2026-08-06T12:00:00.000Z',
          reason: 'ai_tool_timeout_unknown',
        },
        comparison: { mode: 'previous_year_same_period' },
        metrics: { unique_clients: 80 },
        changes: {
          unique_clients: {
            current: 80,
            previous: 100,
            delta: -20,
            percent_change: -20,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(null);

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content:
            'На сколько мы просели по количеству клиентов по сравнению с прошлым годом?',
        },
      ],
    });

    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: {
        status: 'verified',
        domain: 'business_query',
      },
    });
    expect(result.reply).toContain('80');
    expect(result.reply).toContain('100');
    expect(result.reply).toContain('−20');
    expect(result.reply).toContain('последний подтверждённый снимок');
    expect(result.reply).toContain('данные не обнулены');
    expect(result.reply).not.toContain('Не смогла подтвердить');
  });

  it('answers a compound year comparison with a grounded action plan', async () => {
    const mocks = createService([
      'analytics.business.compare_years',
      'analytics.business.query',
    ]);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-business-action-plan',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_year_same_period' },
        metrics: {
          unique_clients: 80,
          cancellation_rate_percent: 5,
        },
        changes: {
          unique_clients: {
            current: 80,
            previous: 100,
            delta: -20,
            percent_change: -20,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(null);

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content:
            'Сравни количество клиентов с прошлым годом с начала года и объясни, что делать.',
        },
      ],
    });

    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'analytics.business.query',
      expect.objectContaining({
        arguments: {
          period: 'year_to_date',
          comparison: 'previous_year_same_period',
        },
      }),
    );
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: { status: 'verified', domain: 'business_query' },
    });
    expect(result.reply).toContain('80');
    expect(result.reply).toContain('100');
    expect(result.reply).toContain('Первое действие');
    expect(result.reply).toContain('уснувших клиентов');
    // Модель недоступна (decide вернул null) — это один из трёх аварийных
    // случаев, когда владелец всё равно получает связный текст из уже
    // подтверждённых цифр вместо извинения. Попытка обратиться к ней была.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(mocks.model.decide.mock.calls[0]?.[0].toolResults?.[0]?.name).toBe(
      'analytics.business.query',
    );
  });

  it('adds a grounded action when an owner asks what to do about a revenue decline', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-revenue-action-plan',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_year_same_period' },
        metrics: {
          revenue_amount_kopecks: 786_526_000,
          unique_clients: 936,
          cancellation_rate_percent: 5,
        },
        changes: {
          revenue_amount_kopecks: {
            current: 786_526_000,
            previous: 868_805_000,
            delta: -82_279_000,
            percent_change: -9.5,
          },
          unique_clients: {
            current: 936,
            previous: 1_211,
            delta: -275,
            percent_change: -22.7,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(null);

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content:
            'Сравни выручку этого года с прошлым за тот же период и скажи, что делать.',
        },
      ],
    });

    // Копейки CRM обязаны превратиться в рубли ровно один раз: 786 526 000
    // копеек — это 7 865 260 ₽, а не 786 526 000 ₽ и не 78 652 600 ₽.
    expect(result.reply).toContain('7 865 260 ₽');
    expect(result.reply).toContain('−822 790 ₽');
    expect(result.reply).toContain('Первое действие');
    expect(result.reply).toContain('уснувших клиентов');
    // Аварийный путь: модель вернула null, поэтому цифры озвучил шаблон.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(mocks.model.decide.mock.calls[0]?.[0].toolResults?.[0]?.name).toBe(
      'analytics.business.query',
    );
  });

  it('explains the strongest verified factor when an owner asks why business declined', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-business-diagnosis',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: {
          revenue_amount_kopecks: 7_000_000,
          appointments_total: 70,
          unique_clients: 50,
          average_ticket_amount_kopecks: 100_000,
        },
        changes: {
          revenue_amount_kopecks: {
            current: 7_000_000,
            previous: 8_000_000,
            delta: -1_000_000,
            percent_change: -12.5,
          },
          appointments_total: {
            current: 70,
            previous: 100,
            delta: -30,
            percent_change: -30,
          },
          unique_clients: {
            current: 50,
            previous: 80,
            delta: -30,
            percent_change: -37.5,
          },
          average_ticket_amount_kopecks: {
            current: 100_000,
            previous: 80_000,
            delta: 20_000,
            percent_change: 25,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(null);

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'Почему бизнес просел по сравнению с прошлым месяцем?',
        },
      ],
    });

    expect(result.reply).toContain('Самое сильное подтверждённое ухудшение');
    expect(result.reply).toContain('число уникальных клиентов: −37,5%');
    expect(result.reply).toContain('средний чек вырос на 25%');
    // Аварийный путь: модель вернула null, объяснение собрал шаблон — но
    // строго по тем же подтверждённым изменениям, что получила бы модель.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(mocks.model.decide.mock.calls[0]?.[0].toolResults?.[0]?.name).toBe(
      'analytics.business.query',
    );
  });

  it('distinguishes a CRM outage from a Maya reasoning failure', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockRejectedValue(new Error('crm_timeout'));

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'Где сейчас у бизнеса слабое место?',
        },
      ],
    });

    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: { status: 'blocked', domain: 'business_query' },
    });
    expect(result.reply).toContain('не отвечает источник бизнес-данных CRM');
    expect(result.reply).not.toContain('не получилось связаться с MAYA');
    expect(mocks.model.decide).not.toHaveBeenCalled();
  });

  it('uses only the current employee query to give a master performance advice', async () => {
    const employee: AuthenticatedUser = {
      ...user,
      userId: 'employee-user',
      role: UserRole.EMPLOYEE,
    };
    const mocks = createService(['analytics.employee.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-employee-query',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'none' },
        metrics: {
          booked_value_amount_kopecks: 3_000_000,
          average_booked_value_amount_kopecks: 150_000,
          appointments_total: 20,
          unique_clients: 15,
        },
        changes: {},
        current: {
          revenue: [{ currency: 'RUB', amount_kopecks: 3_000_000 }],
          average_ticket: [{ currency: 'RUB', amount_kopecks: 150_000 }],
        },
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply:
          'Среднюю стоимость записи лучше поднимать через подходящие уходы, а не давление на клиента.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(employee, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Как мне поднять средний чек за месяц?' },
      ],
    });

    // 🔴 Просьба о совете тянет сравнение с предыдущим периодом. Без него
    // инструмент вернул бы changes={} и service_changes=[], и советовать было
    // бы не из чего — ответ выродился бы в перечень текущих счётчиков.
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      employee,
      'analytics.employee.query',
      expect.objectContaining({
        arguments: { period: 'month_to_date', comparison: 'previous_period' },
      }),
    );
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'employee_query',
      evidence_tools: ['analytics.employee.query'],
    });
    // Совет мастеру пишет модель, но опирается на предзагруженный личный срез:
    // бизнес-итоги сотруднику недоступны, и другой инструмент не вызывался.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    const first = mocks.model.decide.mock.calls[0]?.[0];
    expect(first?.toolResults?.[0]?.name).toBe('analytics.employee.query');
    expect(mocks.runtime.execute.mock.calls.map((call) => call[1])).toEqual([
      'analytics.employee.query',
    ]);
    expect(result).toMatchObject({
      reply:
        'Среднюю стоимость записи лучше поднимать через подходящие уходы, а не давление на клиента.',
      source: 'deepseek',
    });
  });

  it('refuses to label operating data as gross profit', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: { period: 'month_to_date' },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'Валовую прибыль по этим данным посчитать нельзя: в CRM нет прямых затрат на услуги. Могу показать поступления и операционный результат.',
          toolCall: null,
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

    // Операционный результат — не валовая прибыль. Модель видела обе суммы,
    // но назвать их так не имеет права: без прямых затрат показатель ложный.
    expect(result.reply).toContain('Валовую прибыль');
    expect(result.reply).toContain('нет прямых затрат');
    expect(result.reply).not.toContain('100 000');
    expect(result.reply).not.toContain('60 000');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_analytics',
    });
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe('analytics.business.read');
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('returns only the verified CRM payroll aggregate for salary questions', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: { period: 'month_to_date' },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'Начислено сотрудникам за период 563 880,01 ₽, выплачено 0 ₽, остаток к выплате 563 880,01 ₽.',
          toolCall: null,
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
      'Начислено сотрудникам за период 563 880,01 ₽, выплачено 0 ₽, остаток к выплате 563 880,01 ₽.',
    );
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_analytics',
    });
    // По зарплате наружу уходит только агрегат по ФОТ. Разбивки по людям нет
    // и в том, что видит модель, — сумму конкретного мастера ей взять неоткуда,
    // а любое неподтверждённое число сторож всё равно завернёт.
    const second = mocks.model.decide.mock.calls[1]?.[0];
    const payroll = (
      second?.toolResults?.[0]?.result as
        { finance?: { payroll?: Record<string, unknown> } } | undefined
    )?.finance?.payroll;
    expect(Object.keys(payroll ?? {}).sort()).toEqual([
      'accrued_total',
      'balance_total',
      'paid_total',
      'status',
      'verified',
    ]);
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('does not turn unavailable CRM revenue into zero', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: { period: 'month_to_date' },
          },
        }),
      )
      // Модель поддаётся привычному соблазну и подставляет ноль вместо
      // отсутствующих данных. Нуля нет в результате инструмента, поэтому
      // сторож чисел обязан развернуть её на переписывание.
      .mockResolvedValueOnce(
        decision({ reply: 'Выручка за месяц: 0 ₽.', toolCall: null }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'Подтверждённых поступлений за месяц CRM не вернула — это не ноль, а отсутствие данных. Повторите чуть позже.',
          toolCall: null,
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

    // Главная граница: «данных нет» никогда не должно звучать как «ноль».
    expect(result.reply).toContain('это не ноль, а отсутствие данных');
    expect(result.reply).not.toContain('0 ₽');
    expect(result.source).toBe('deepseek');
    // Ретрай выдан по конкретной претензии: ноль не подтверждён инструментом.
    expect(mocks.model.decide).toHaveBeenCalledTimes(3);
    expect(mocks.model.decide.mock.calls[2]?.[0].corrections?.[0]).toContain(
      'tool_results: 0',
    );
  });

  it('grounds an appointment count in business analytics', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: { period: 'month_to_date' },
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply: 'Записей за месяц — 12: активных 10, отменённых 2.',
          toolCall: null,
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
      reply: 'Записей за месяц — 12: активных 10, отменённых 2.',
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'business_analytics',
      },
    });
    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.business.read',
    ]);
    // Счётчик записей модель не считает сама — цифра пришла из инструмента.
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe('analytics.business.read');
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('answers year-over-year questions only from the dedicated comparison tool', async () => {
    const mocks = createService(['analytics.business.compare_years']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.compare_years',
            arguments: {},
          },
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'Поступления за 2026 год — 150 000 ₽ против 100 000 ₽ годом ранее, рост 50%. Показываю последний подтверждённый снимок от 06.08.2026: CRM сейчас не ответила, данные не обнулены.',
          toolCall: null,
        }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-year-comparison',
      result: {
        verified: true,
        timezone: 'Europe/Moscow',
        freshness: {
          status: 'stale',
          snapshot_at: '2026-08-06T12:00:00.000Z',
          reason: 'ai_tool_timeout_unknown',
        },
        periods: {
          current: {
            year: 2026,
            start_day: 1,
            start_month: 1,
            end_day: 6,
            end_month: 8,
          },
          previous: {
            year: 2025,
            start_day: 1,
            start_month: 1,
            end_day: 6,
            end_month: 8,
          },
        },
        revenue: {
          current: {
            currency: 'RUB',
            amount_kopecks: 15_000_000,
            amount_major_units: 150_000,
          },
          previous: {
            currency: 'RUB',
            amount_kopecks: 10_000_000,
            amount_major_units: 100_000,
          },
          delta: {
            currency: 'RUB',
            amount_kopecks: 5_000_000,
            amount_major_units: 50_000,
          },
          percent_change: 50,
        },
        transactions: {
          current: 120,
          previous: 100,
          delta: 20,
          percent_change: 20,
        },
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Сравни этот год с предыдущим' }],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.business.compare_years',
    ]);
    expect(result).toMatchObject({
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'business_year_comparison',
        evidence_tools: ['analytics.business.compare_years'],
      },
    });
    // Устаревший снимок нельзя выдавать за свежие данные. Признак протухания
    // доезжает до модели вместе с цифрами, и она обязана назвать его вслух.
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe(
      'analytics.business.compare_years',
    );
    expect(
      (
        second?.toolResults?.[0]?.result as
          { freshness?: { status?: string } } | undefined
      )?.freshness?.status,
    ).toBe('stale');
    expect(result.reply).toContain('последний подтверждённый снимок');
    expect(result.reply).toContain('06.08.2026');
    expect(result.reply).toContain('данные не обнулены');
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('keeps a customer-count follow-up inside the verified year comparison', async () => {
    const mocks = createService(['analytics.business.compare_years']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю.',
        toolCall: {
          name: 'analytics.business.compare_years',
          arguments: {},
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-customer-year-comparison',
      result: {
        verified: true,
        periods: {
          current: {
            year: 2026,
            start_day: 1,
            start_month: 1,
            end_day: 6,
            end_month: 8,
          },
          previous: {
            year: 2025,
            start_day: 1,
            start_month: 1,
            end_day: 6,
            end_month: 8,
          },
        },
        revenue: {
          current: { currency: 'RUB', amount_kopecks: 15_000_000 },
          previous: { currency: 'RUB', amount_kopecks: 10_000_000 },
          delta: { currency: 'RUB', amount_kopecks: 5_000_000 },
          percent_change: 50,
        },
        transactions: {
          current: 120,
          previous: 100,
          delta: 20,
          percent_change: 20,
        },
        clients: {
          verified: true,
          source: 'crm',
          current: 80,
          previous: 100,
          delta: -20,
          percent_change: -20,
        },
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content:
            'Скажи, на сколько бизнес просел в этом году по сравнению с прошлым',
        },
        {
          role: 'assistant',
          content: 'По выручке есть снижение.',
        },
        { role: 'user', content: 'А по количеству клиентов?' },
      ],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.business.compare_years',
    ]);
    expect(result).toMatchObject({
      reply:
        'Сравнила одинаковые периоды: 01.01.2026–06.08.2026 и 01.01.2025–06.08.2025. Уникальных клиентов с CRM-картой по неотменённым записям: 80 против 100. Изменение: −20 (−20%). Источник — подтверждённый журнал записей CRM.',
      grounding: {
        status: 'verified',
        domain: 'business_year_comparison',
        evidence_tools: ['analytics.business.compare_years'],
      },
    });
  });

  it('recognizes a direct customer decline comparison with the previous year', async () => {
    const mocks = createService(['analytics.business.compare_years']);
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Проверяю.',
        toolCall: {
          name: 'analytics.business.compare_years',
          arguments: {},
        },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-direct-customer-year-comparison',
      result: {
        verified: true,
        periods: {
          current: { year: 2026 },
          previous: { year: 2025 },
        },
        revenue: {
          current: { currency: 'RUB', amount_kopecks: 1 },
          previous: { currency: 'RUB', amount_kopecks: 1 },
          delta: { currency: 'RUB', amount_kopecks: 0 },
        },
        clients: {
          verified: true,
          source: 'crm',
          current: 80,
          previous: 100,
          delta: -20,
          percent_change: -20,
        },
      },
    });

    await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content:
            'Скажи, на сколько мы просели по количеству клиентов по сравнению с прошлым годом',
        },
      ],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].requiredToolNames).toEqual([
      'analytics.business.compare_years',
    ]);
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

  it('asks the model to rewrite an unsourced number and ships the corrected answer', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-number-retry',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'none' },
        metrics: {
          revenue_amount_kopecks: 7_000_000,
          unique_clients: 80,
        },
        changes: {},
        current: {
          revenue: [
            {
              currency: 'RUB',
              amount_kopecks: 7_000_000,
              amount_major_units: 70_000,
            },
          ],
        },
        service_changes: [],
      },
    });
    mocks.model.decide
      // Модель называет сумму, которой нет ни в одном результате инструмента.
      .mockResolvedValueOnce(
        decision({ reply: 'Выручка выросла до 999 999 ₽.', toolCall: null }),
      )
      .mockResolvedValueOnce(
        decision({
          reply:
            'Поступления за период — 70 000 ₽ при 80 уникальных клиентах. Это подтверждённые данные CRM.',
          toolCall: null,
        }),
      );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Что сейчас требует моего внимания?' },
      ],
    });

    // Раньше одно неподтверждённое число молча стирало весь ответ. Теперь
    // модели называют виновную цифру и дают переписать — так живой текст
    // сохраняется, а выдуманная сумма всё равно не доходит до владельца.
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.corrections?.[0]).toContain('999999');
    expect(second?.toolResults?.[0]?.name).toBe('analytics.business.query');
    expect(result).toMatchObject({
      reply:
        'Поступления за период — 70 000 ₽ при 80 уникальных клиентах. Это подтверждённые данные CRM.',
      source: 'deepseek',
      grounding: { status: 'verified', domain: 'business_query' },
    });
    expect(result.reply).not.toContain('999 999');
  });

  it('falls back to the deterministic text when the model repeats an unsourced number', async () => {
    const mocks = createService(['analytics.business.read']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.read',
            arguments: { period: 'month_to_date' },
          },
        }),
      )
      // Модель настаивает на своей цифре и во второй раз — дальше уступок нет.
      .mockResolvedValue(
        decision({ reply: 'Валовая прибыль: 40 000 ₽.', toolCall: null }),
      );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-profit-retry',
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

    // Второе нарушение подряд — это уже не оговорка, а линия поведения:
    // включается детерминированный текст, и он тоже не выдаёт операционные
    // суммы за валовую прибыль.
    expect(mocks.model.decide).toHaveBeenCalledTimes(3);
    expect(mocks.model.decide.mock.calls[2]?.[0].corrections?.[0]).toContain(
      '40000',
    );
    expect(result.source).toBe('safe_fallback');
    expect(result.reply).toContain('Валовая прибыль сейчас не рассчитывается');
    expect(result.reply).not.toContain('40 000');
    expect(result.reply).not.toContain('100 000');
    expect(result.reply).not.toContain('60 000');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_analytics',
    });
  });

  it('lets the model say a decline in words while the server keeps the minus sign', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-negative-percent',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_year_same_period' },
        metrics: { revenue_amount_kopecks: 7_000_000 },
        changes: {
          revenue_amount_kopecks: {
            current: 7_000_000,
            previous: 7_711_000,
            delta: -711_000,
            percent_change: -9.2,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply:
          'Поступления снизились на 9,2% к прошлому году. Это подтверждённая динамика CRM.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'Насколько просела выручка по сравнению с прошлым годом?',
        },
      ],
    });

    // Направление изменения по-русски несут слова, а не знак: сервер отдал
    // −9.2, модель пишет «снизились на 9,2%». Сверка идёт по модулю, иначе
    // сторож ловил бы добросовестные ответы и подменял их шаблоном.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      reply:
        'Поступления снизились на 9,2% к прошлому году. Это подтверждённая динамика CRM.',
      source: 'deepseek',
      grounding: { status: 'verified', domain: 'business_query' },
    });
  });

  it('does not mistake decline wording next to an absolute figure for an error', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-absolute-decline',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: {
          average_ticket_amount_kopecks: 143_617,
          appointments_total: 141,
        },
        changes: {
          average_ticket_amount_kopecks: {
            current: 143_617,
            previous: 150_374,
            delta: -6_757,
            percent_change: -4.5,
          },
          appointments_total: {
            current: 141,
            previous: 171,
            delta: -30,
            percent_change: -17.5,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply:
          'Средний чек просел до 1 436,17 ₽ с 1 503,74 ₽, это −4,5%. Записей стало меньше: 141 против 171.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Че у нас за просадки' }],
    });

    // 🔴 Из-за этого «что у нас за просадки» и отвечалось шаблоном: сторож
    // видел слово «просел» рядом с числом 1436.17 и объявлял его ошибкой
    // направления. Но абсолютная величина направления не несёт — падает не
    // число, а показатель. Проверка направления имеет смысл только для дельт.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('deepseek');
    expect(result.reply).toContain('1 436,17 ₽');
    expect(result.reply).toContain('141 против 171');
  });

  it('catches a decline described as growth even though the figure itself is real', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-direction',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_year_same_period' },
        metrics: { revenue_amount_kopecks: 7_000_000 },
        changes: {
          revenue_amount_kopecks: {
            current: 7_000_000,
            previous: 7_711_000,
            delta: -711_000,
            percent_change: -9.2,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Поступления выросли на 9,2% к прошлому году. Отличный темп.',
          toolCall: null,
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply: 'Поступления снизились на 9,2% к прошлому году.',
          toolCall: null,
        }),
      );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'Насколько просела выручка по сравнению с прошлым годом?',
        },
      ],
    });

    // 🔴 Число 9,2 в данных есть — но со знаком минус. Сверки по модулю мало:
    // «выросли» на падении это не ошибка в цифре, а перевёрнутый смысл, и
    // владелец принял бы решение по несуществующему росту. Ловим по словам
    // рядом с числом и требуем переписать.
    const correction = mocks.model.decide.mock.calls[1]?.[0]?.corrections?.[0];
    expect(correction).toContain('снижение, а не рост');
    expect(result.reply).toContain('снизились на 9,2%');
    expect(result.reply).not.toContain('выросли');
    expect(result.source).toBe('deepseek');
  });

  it('lets the model name a money change in roubles when the server counted it in kopecks', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-kopecks-delta',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: { revenue_amount_kopecks: 20_250_000 },
        changes: {
          // Рублёвого двойника у дельты в changes нет — только копейки.
          revenue_amount_kopecks: {
            current: 20_250_000,
            previous: 21_250_000,
            delta: -1_000_000,
            percent_change: -4.7,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Поступления упали на 10 000 ₽ — это −4,7% к прошлому периоду.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Почему просела выручка?' }],
    });

    // 🔴 Из-за этого разбор просадки и сваливался в шаблон: сервер держит
    // дельту в копейках (−1 000 000), человек говорит «10 000 ₽», и сторож
    // считал верную сумму выдумкой. Та же величина в правильной единице —
    // не выдумка; переписывать ответ незачем.
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('10 000 ₽');
    expect(result.source).toBe('deepseek');
  });

  it('still rejects a money figure that is not in the data at any scale', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-invented-money',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: { revenue_amount_kopecks: 20_250_000 },
        changes: {
          revenue_amount_kopecks: {
            current: 20_250_000,
            previous: 21_250_000,
            delta: -1_000_000,
            percent_change: -4.7,
          },
        },
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Поступления упали примерно на 12 345 ₽.',
          toolCall: null,
        }),
      )
      .mockResolvedValueOnce(
        decision({ reply: 'Поступления упали на 10 000 ₽.', toolCall: null }),
      );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Почему просела выручка?' }],
    });

    // Послабление касается только единиц измерения. Округление «примерно»
    // остаётся выдумкой и по-прежнему отправляется на переписывание.
    expect(mocks.model.decide.mock.calls[1]?.[0]?.corrections?.[0]).toContain(
      '12345',
    );
    expect(result.reply).toContain('10 000 ₽');
  });

  it('does not treat an hour inside a timestamp as a confirmed metric', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-timestamp',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        // 21 здесь встречается только как час в смещении Europe/Moscow.
        period: {
          from: '2026-08-01T21:00:00.000Z',
          to: '2026-08-07T20:59:59.999Z',
          timezone: 'Europe/Moscow',
        },
        metrics: { appointments_total: 40 },
        changes: {},
        current: {},
        service_changes: [],
      },
    });
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({ reply: 'Доля отмен — 21%.', toolCall: null }),
      )
      .mockResolvedValueOnce(
        decision({ reply: 'Записей за период: 40.', toolCall: null }),
      );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Что с записями за неделю?' }],
    });

    // 🔴 Разбирая строки дат на числа, сторож считал бы подтверждёнными часы,
    // минуты и дни месяца — и пропустил бы любой процент от 0 до 59. Из таких
    // строк берём только год.
    expect(mocks.model.decide.mock.calls[1]?.[0]?.corrections?.[0]).toContain(
      '21',
    );
    expect(result.reply).toBe('Записей за период: 40.');
  });

  it('lets a per-master service drop through the number guard by name', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-staff-names',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: { appointments_total: 40 },
        changes: {},
        current: {
          staff_summary: [
            {
              name: 'Анна',
              appointments: 32,
              revenue: [],
              booked_minutes: 960,
              services: [{ name: 'Мужская стрижка', appointments: 32 }],
            },
            {
              name: 'Илья',
              appointments: 19,
              revenue: [],
              booked_minutes: 570,
              services: [{ name: 'Борода', appointments: 19 }],
            },
          ],
        },
        service_changes: [],
        staff_changes: [
          {
            name: 'Илья',
            current_appointments: 19,
            previous_appointments: 31,
            delta: -12,
            percent_change: -38.7,
            // 🔴 Ради этих трёх чисел всё и переделывалось. Без разреза по
            // услугам внутри мастера числа 19/31/−12 нет ни в одном поле
            // результата, сторож бракует ответ целиком, и владелец получает
            // шаблон вместо разбора.
            services: [
              {
                name: 'Борода',
                current_appointments: 19,
                previous_appointments: 31,
                delta: -12,
                percent_change: -38.7,
              },
            ],
          },
        ],
      },
    });
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'У Ильи просела «Борода»: 19 записей против 31, это −12.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'Кто из мастеров просел по сравнению с прошлым месяцем?',
        },
      ],
    });

    // Имя уходит в модель напрямую — иначе назвать мастера она не сможет.
    const modelInput = JSON.stringify(mocks.model.decide.mock.calls[0]?.[0]);
    expect(modelInput).toContain('Илья');
    expect(modelInput).toContain('Борода');
    // Разбор доходит до пользователя дословно: ни сторож чисел, ни подстановка
    // имён его больше не трогают.
    expect(result.reply).toBe(
      'У Ильи просела «Борода»: 19 записей против 31, это −12.',
    );
    expect(result.source).not.toBe('safe_fallback');
    expect(result.grounding).toMatchObject({ status: 'verified' });
  });

  it('rejects a real number pinned to the wrong master and ships the corrected answer', async () => {
    // Без env: сверка привязки включена по умолчанию. Флаг оставлен только как
    // рубильник на случай непонятной формулировки в живом трафике.
    const mocks = createService(['analytics.business.query'], {
      AI_CORE_ATTRIBUTION_GUARD: 'true',
    });
    mocks.runtime.execute.mockResolvedValue(attributionExecution());
    mocks.model.decide
      // 🔴 Каждое число здесь настоящее: «Борода» действительно просела на 12.
      // Ложь ровно одна — просела она у Ильи, а названа у Стаса. Прежний
      // сторож пропускал такую фразу без единой пометки, и владелец шёл
      // разговаривать не с тем человеком.
      .mockResolvedValueOnce(
        decision({
          reply: 'У Стаса «Борода» просела на 12 записей.',
          toolCall: null,
        }),
      )
      .mockResolvedValueOnce(
        decision({
          reply: 'У Ильи «Борода» просела на 12 записей: 19 против 31.',
          toolCall: null,
        }),
      );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Кто из мастеров просел за этот месяц?' },
      ],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    const correction = mocks.model.decide.mock.calls[1]?.[0]?.corrections?.[0];
    expect(correction).toContain('12');
    expect(correction).toContain('Стас');
    expect(result.reply).toBe(
      'У Ильи «Борода» просела на 12 записей: 19 против 31.',
    );
    expect(result.source).not.toBe('safe_fallback');
  });

  it('rejects the salon total presented as one master earnings', async () => {
    const mocks = createService(['analytics.business.query'], {
      AI_CORE_ATTRIBUTION_GUARD: 'true',
    });
    mocks.runtime.execute.mockResolvedValue(attributionExecution());
    mocks.model.decide
      // 104 500 ₽ — выручка всего салона, а не Ильи.
      .mockResolvedValueOnce(
        decision({ reply: 'Илья заработал 104 500 ₽.', toolCall: null }),
      )
      .mockResolvedValueOnce(
        decision({
          reply: 'По салону 104 500 ₽ за период, у Ильи 19 записей.',
          toolCall: null,
        }),
      );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Сколько заработали за месяц?' }],
    });

    expect(mocks.model.decide.mock.calls[1]?.[0]?.corrections?.[0]).toContain(
      '104500',
    );
    expect(result.reply).toBe(
      'По салону 104 500 ₽ за период, у Ильи 19 записей.',
    );
  });

  it('lets a salon-wide sentence without any master name through untouched', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue(attributionExecution());
    // Общие показатели салона названы без имени рядом — придираться не к чему.
    // Ложные тревоги тут дороже пропусков: прошлая проверка направления
    // браковала верные ответы пачками.
    const reply =
      'За период 40 записей и 104 500 ₽ выручки, 33 уникальных клиента. Записи просели на 12 (−23,1%).';
    mocks.model.decide.mockResolvedValue(decision({ reply, toolCall: null }));

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Что у нас по записям за месяц?' }],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe(reply);
    expect(result.source).not.toBe('safe_fallback');
    expect(result.grounding).toMatchObject({ status: 'verified' });
  });

  it('keeps a full three-part answer with per-master detail intact', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.runtime.execute.mockResolvedValue(attributionExecution());
    // Живой ответ директора: имена, их числа, салонный итог отдельной фразой и
    // рекомендация. Каждое число стоит у своего владельца — придираться не к
    // чему, и ни одной пометки быть не должно.
    const reply =
      'У Ильи «Борода» просела: 19 записей против 31, это −12 (−38,7%). У Стаса ровно — 21 запись, как и было. По салону 40 записей и 104 500 ₽, 33 уникальных клиента. Первым делом верните бородачей: обзвон тех, кто был в прошлом месяце.';
    mocks.model.decide.mockResolvedValue(decision({ reply, toolCall: null }));

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Почему просели записи в этом месяце?' },
      ],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe(reply);
    expect(result.source).not.toBe('safe_fallback');
  });

  it('lets the kill switch ship the model answer as is', async () => {
    // Рубильник на живой трафик: если разбор не поймёт чью-то формулировку и
    // начнёт глушить верные ответы, сверку выключают переменной, без выката.
    const mocks = createService(['analytics.business.query'], {
      AI_CORE_ATTRIBUTION_GUARD: 'false',
    });
    mocks.runtime.execute.mockResolvedValue(attributionExecution());
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'У Стаса «Борода» просела на 12 записей.',
        toolCall: null,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Кто из мастеров просел за этот месяц?' },
      ],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('У Стаса «Борода» просела на 12 записей.');
    expect(result.source).not.toBe('safe_fallback');
  });

  it('writes the misattribution reason into the audit trail separately', async () => {
    const mocks = createService(['analytics.business.query'], {
      AI_CORE_ATTRIBUTION_GUARD: 'true',
    });
    mocks.runtime.execute.mockResolvedValue(attributionExecution());
    // Модель повторяет ту же подмену — ответ уходит в детерминированный текст.
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'У Стаса «Борода» просела на 12 записей.',
        toolCall: null,
      }),
    );

    await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        { role: 'user', content: 'Кто из мастеров просел за этот месяц?' },
      ],
    });

    const completed = (
      mocks.auditLog.log.mock.calls as unknown as Array<
        [{ action: string; metadata: Record<string, unknown> }]
      >
    )
      .map((call) => call[0])
      .find((entry) => entry.action === 'ai.core_turn_completed');
    // Причина отказа должна читаться без гадания: число настоящее, ложной была
    // привязка — и это отдельное поле, а не общая свалка с unsourced_numbers.
    expect(completed?.metadata.misattributed_numbers).toEqual([
      '12 (это не данные «Стас → Борода»)',
    ]);
    expect(completed?.metadata.unsourced_numbers).toEqual([]);
  });

  it('leaves the model answer byte-for-byte alone instead of rewriting master labels', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Сегодня в смене master_2.', toolCall: null }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Привет' }],
    });

    // Прежняя схема переписывала этот текст в «Мастер 2». Подстановки больше
    // нет: сервер в готовый ответ не лезет.
    expect(result.reply).toBe('Сегодня в смене master_2.');
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('gives the model the server time instead of letting it guess the calendar', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Здравствуйте! Чем помочь?', toolCall: null }),
    );

    await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Привет!' }],
    });

    // Без серверного «сейчас» модель не знает сегодняшнюю дату, а выдумывать
    // календарь ей запрещено — любой вопрос про динамику стал бы безответным.
    const nowUtc = mocks.model.decide.mock.calls[0]?.[0].nowUtc;
    expect(typeof nowUtc).toBe('string');
    expect(new Date(String(nowUtc)).toISOString()).toBe(nowUtc);
  });

  /**
   * ЗАМЕР сверки привязки: 46 верных ответов против 12 подмен.
   *
   * 🔴 Это не иллюстрация, а приёмка. Сверку включили в прод только после того,
   * как на этом наборе она дала НОЛЬ ложных тревог: прошлый разбор бракова́л 7
   * верных ответов из 31, и каждый пятый разбор владельца подменялся шаблоном —
   * лечение было хуже болезни.
   *
   * Набор писался как живая речь директора, а не под алгоритм: сюда нарочно
   * взяты формулировки, на которых прошлая версия падала (число перед именем,
   * салонный итог рядом с мастером, минуты мастера после названия услуги,
   * перечисление имён), и две подмены, которые сторож заведомо не различает.
   */
  describe('сверка привязки числа к сущности — замер', () => {
    /** Ответы, где каждое число стоит у своего владельца. */
    const grounded = [
      'За июль 268 записей против 291 в июне — минус 23, это −7,9%.',
      'Лидер июля — Стас: 142 записи, было 137, плюс 5.',
      'У Ильи 61 запись за июль против 79 в июне: минус 18, это −22,8%.',
      '61 запись у Ильи и 142 у Стаса — разрыв больше чем вдвое.',
      'У Анны 65 записей за июль, в июне было 75 — минус 10.',
      'По салону 699 616 ₽ выручки за июль.',
      'Стас принёс 372 400 ₽, Илья 174 270 ₽, Анна 152 946 ₽ — вместе это 699 616 ₽ за июль.',
      'Просела «Борода»: 43 записи против 62, минус 19 — это −30,6% по салону.',
      'Главная потеря у Ильи: «Борода» упала с 43 до 24 записей, это −19.',
      'У Стаса «Мужская стрижка» выросла с 88 до 96 записей, плюс 8.',
      '17 записей у Анны по детской стрижке против 13 в июне.',
      'У Ильи 2 745 минут в кресле за июль.',
      'Кресло Стаса занято 4 260 минут, у Анны 1 605.',
      'Отмен за июль 21 против 14 в июне — плюс 7.',
      'Уникальных клиентов 173, было 186 — минус 13 за июль.',
      'Средний чек за июль 2 612 ₽ против 2 489 ₽ — плюс 4,9%.',
      'Камуфляж седины просел с 47 до 34 записей за июль, это −27,7%.',
      'У Анны «Камуфляж седины» рухнул: 7 записей против 17, это минус 10.',
      'Илья: 61 запись, 24 «Бороды», 29 мужских стрижек и 8 детских.',
      'У Стаса 96 записей на мужскую стрижку из 166 по салону.',
      'Детская стрижка — единственная в плюсе: 25 записей против 21, плюс 4.',
      'Мужская стрижка держит салон: 166 записей за июль против 161.',
      'У Ильи «Борода» упала на 44,2%, а по салону эта услуга потеряла 30,6%.',
      'Анна: 65 записей, минус 10 к июню — это −13,3%.',
      'У Стаса плюс 5 записей к июню, у Ильи минус 18, у Анны минус 10.',
      '142 записи у Стаса, 61 у Ильи, 65 у Анны.',
      'За июль у Ильи 24 записи на бороду против 43 в июне.',
      'Загрузка кресел за июль: Стас 4 260 минут, Илья 2 745, Анна 1 605.',
      'Выручка июля 699 616 ₽ — на 24 683 ₽ меньше июньских 724 299 ₽.',
      'У Анны детская стрижка выросла с 13 до 17 записей, плюс 4 — единственный светлый момент июля.',
      'Просадка собралась у Ильи: минус 18 записей из общих минус 23 по салону.',
      'У Стаса камуфляж седины просел с 30 до 27 записей, минус 3.',
      'Илья — 61 запись за июль, было 79.',
      'По услугам за июль: мужская стрижка 166, борода 43, камуфляж седины 34, детская стрижка 25.',
      'У Ильи выручка 174 270 ₽ за июль.',
      'Стас и Анна держат мужскую стрижку: 96 и 41 запись за июль.',
      'Илья и Анна просели оба: минус 18 и минус 10.',
      'У Ильи «Борода» — 24 записи, у Стаса та же услуга ровно: 19.',
      'У Анны 41 запись на мужскую стрижку, было 45.',
      'Из 268 записей июля 142 у Стаса, 61 у Ильи и 65 у Анны.',
      'У Ильи 61 запись и 2 745 минут в кресле за июль.',
      'У Ильи 24 «Бороды» и 2 745 минут в кресле.',
      'Мужская стрижка у Стаса выросла на 8 записей, а у Анны эта же услуга просела на 8,9%.',
      'Июль просел на 23 записи, и главный вклад у Ильи — минус 18.',
      'Стасу июль дал 142 записи, Илье 61, Анне 65.',
      'Илья сделал 61 запись, а средний чек 2 612 ₽ — это уже по всему салону.',
    ];
    /**
     * Подмены: число настоящее, владелец — чужой.
     *
     * `caught: false` стоит там, где привязка неразличима в принципе, и сторож
     * обязан молчать: «19» есть и в строке Стаса, а сумма по паре мастеров не
     * проверяется по строкам вовсе. Прятать такие случаи из набора — значит
     * подгонять замер.
     */
    const swapped = [
      { reply: 'У Анны «Борода» просела на 19 записей за июль.', caught: true },
      { reply: 'Илья заработал за июль 699 616 ₽.', caught: true },
      { reply: 'У Стаса 61 запись за июль.', caught: true },
      { reply: 'У Анны средний чек 2 612 ₽ за июль.', caught: true },
      {
        reply: 'У Ильи «Камуфляж седины» просел на 10 записей за июль.',
        caught: true,
      },
      {
        reply: 'У Стаса «Детская стрижка» выросла на 4 записи за июль.',
        caught: true,
      },
      { reply: 'Анна потеряла 18 записей за июль.', caught: true },
      { reply: 'У Ильи 142 записи за июль.', caught: true },
      { reply: 'У Ильи «Борода» упала на 30,6% за июль.', caught: true },
      { reply: 'Кресло Анны занято 4 260 минут за июль.', caught: true },
      {
        reply: 'Илья и Стас вместе потеряли 18 записей за июль.',
        caught: false,
      },
      { reply: 'У Стаса «Борода» просела на 19 записей.', caught: false },
    ];

    it('на верных ответах не поднимает ни одной ложной тревоги', async () => {
      expect(grounded.length).toBeGreaterThanOrEqual(30);
      const alarms: string[] = [];
      const dirty: string[] = [];
      for (const reply of grounded) {
        const audit = await measureAttribution(reply);
        // Корпус честный: числа взяты из данных, сторож происхождения молчит.
        // Без этой проверки ошибка в наборе выглядела бы как «нет тревог».
        if ((audit.unsourced_numbers as string[]).length > 0) {
          dirty.push(
            `${reply} → ${(audit.unsourced_numbers as string[]).join('; ')}`,
          );
        }
        expect(audit.grounding_status).toBe('verified');
        if ((audit.misattributed_numbers as string[]).length > 0) {
          alarms.push(
            `${reply} → ${(audit.misattributed_numbers as string[]).join('; ')}`,
          );
        }
      }
      expect(dirty).toEqual([]);
      expect(alarms).toEqual([]);
    }, 120_000);

    it('ловит подмену владельца числа', async () => {
      expect(swapped.length).toBeGreaterThanOrEqual(8);
      const caught: string[] = [];
      const missed: string[] = [];
      const dirty: string[] = [];
      for (const sample of swapped) {
        const audit = await measureAttribution(sample.reply);
        // Число подменной фразы обязано быть настоящим, иначе её ловил бы
        // сторож происхождения и замер привязки был бы фиктивным.
        if ((audit.unsourced_numbers as string[]).length > 0) {
          dirty.push(
            `${sample.reply} → ${(audit.unsourced_numbers as string[]).join('; ')}`,
          );
        }
        ((audit.misattributed_numbers as string[]).length > 0
          ? caught
          : missed
        ).push(sample.reply);
      }
      expect(dirty).toEqual([]);
      expect(caught.length).toBeGreaterThanOrEqual(6);
      // Разбор не деградировал: заранее известные пропуски остались пропусками,
      // а всё остальное поймано.
      expect(missed).toEqual(
        swapped
          .filter((sample) => !sample.caught)
          .map((sample) => sample.reply),
      );
    }, 120_000);

    async function measureAttribution(reply: string) {
      // Сверка привязки выключена в проде: независимый ревизор нашёл класс,
      // который этот набор не покрывал (год из даты привязывается к мастеру).
      // Замер живёт дальше и включает её явно.
      const mocks = createService(['analytics.business.query'], {
        AI_CORE_ATTRIBUTION_GUARD: 'true',
      });
      mocks.runtime.execute.mockResolvedValue(measurementExecution());
      mocks.model.decide.mockResolvedValue(decision({ reply, toolCall: null }));
      await mocks.service.chat(user, {
        ...dto,
        surface: 'native',
        messages: [
          { role: 'user', content: 'Кто из мастеров просел за этот месяц?' },
        ],
      });
      const completed = (
        mocks.auditLog.log.mock.calls as unknown as Array<
          [{ action: string; metadata: Record<string, unknown> }]
        >
      )
        .map((call) => call[0])
        .find((entry) => entry.action === 'ai.core_turn_completed');
      return completed?.metadata ?? {};
    }
  });

  /**
   * Реалистичный июль: три мастера, четыре услуги, сравнение с июнем.
   *
   * Суммы сходятся построчно (96+27+19=142, 142+61+65=268, 372 400+174 270+
   * 152 946=699 616), поэтому подменить владельца числа можно только ложью, а
   * не арифметической случайностью.
   */
  function measurementExecution() {
    const money = (major: number) => [
      {
        currency: 'RUB',
        amount_kopecks: major * 100,
        amount_major_units: major,
      },
    ];
    return {
      status: 'completed',
      execution_id: 'execution-measurement',
      result: {
        verified: true,
        source: 'crm',
        period: { from: '2026-07-01', to: '2026-07-31' },
        comparison: { mode: 'previous_period' },
        metrics: {
          appointments_total: 268,
          appointments_cancelled: 21,
          unique_clients: 173,
          average_ticket_amount_kopecks: 261_200,
          booked_minutes: 8_610,
        },
        changes: {
          appointments_total: {
            current: 268,
            previous: 291,
            delta: -23,
            percent_change: -7.9,
          },
          appointments_cancelled: {
            current: 21,
            previous: 14,
            delta: 7,
            percent_change: 50,
          },
          unique_clients: {
            current: 173,
            previous: 186,
            delta: -13,
            percent_change: -7,
          },
          average_ticket_amount_kopecks: {
            current: 261_200,
            previous: 248_900,
            delta: 12_300,
            percent_change: 4.9,
          },
          revenue_amount_kopecks: {
            current: 69_961_600,
            previous: 72_429_900,
            delta: -2_468_300,
            percent_change: -3.4,
          },
        },
        current: {
          revenue: money(699_616),
          staff_summary: [
            {
              name: 'Стас',
              appointments: 142,
              booked_minutes: 4_260,
              revenue: money(372_400),
              services: [
                { name: 'Мужская стрижка', appointments: 96 },
                { name: 'Камуфляж седины', appointments: 27 },
                { name: 'Борода', appointments: 19 },
              ],
            },
            {
              name: 'Илья',
              appointments: 61,
              booked_minutes: 2_745,
              revenue: money(174_270),
              services: [
                { name: 'Борода', appointments: 24 },
                { name: 'Мужская стрижка', appointments: 29 },
                { name: 'Детская стрижка', appointments: 8 },
              ],
            },
            {
              name: 'Анна',
              appointments: 65,
              booked_minutes: 1_605,
              revenue: money(152_946),
              services: [
                { name: 'Мужская стрижка', appointments: 41 },
                { name: 'Детская стрижка', appointments: 17 },
                { name: 'Камуфляж седины', appointments: 7 },
              ],
            },
          ],
          service_summary: [
            { name: 'Мужская стрижка', appointments: 166 },
            { name: 'Борода', appointments: 43 },
            { name: 'Камуфляж седины', appointments: 34 },
            { name: 'Детская стрижка', appointments: 25 },
          ],
        },
        service_changes: [
          {
            name: 'Мужская стрижка',
            current_appointments: 166,
            previous_appointments: 161,
            delta: 5,
            percent_change: 3.1,
          },
          {
            name: 'Борода',
            current_appointments: 43,
            previous_appointments: 62,
            delta: -19,
            percent_change: -30.6,
          },
          {
            name: 'Камуфляж седины',
            current_appointments: 34,
            previous_appointments: 47,
            delta: -13,
            percent_change: -27.7,
          },
          {
            name: 'Детская стрижка',
            current_appointments: 25,
            previous_appointments: 21,
            delta: 4,
            percent_change: 19,
          },
        ],
        staff_changes: [
          {
            name: 'Стас',
            current_appointments: 142,
            previous_appointments: 137,
            delta: 5,
            percent_change: 3.6,
            services: [
              {
                name: 'Мужская стрижка',
                current_appointments: 96,
                previous_appointments: 88,
                delta: 8,
                percent_change: 9.1,
              },
              {
                name: 'Камуфляж седины',
                current_appointments: 27,
                previous_appointments: 30,
                delta: -3,
                percent_change: -10,
              },
              {
                name: 'Борода',
                current_appointments: 19,
                previous_appointments: 19,
                delta: 0,
                percent_change: 0,
              },
            ],
          },
          {
            name: 'Илья',
            current_appointments: 61,
            previous_appointments: 79,
            delta: -18,
            percent_change: -22.8,
            services: [
              {
                name: 'Борода',
                current_appointments: 24,
                previous_appointments: 43,
                delta: -19,
                percent_change: -44.2,
              },
              {
                name: 'Мужская стрижка',
                current_appointments: 29,
                previous_appointments: 28,
                delta: 1,
                percent_change: 3.6,
              },
              {
                name: 'Детская стрижка',
                current_appointments: 8,
                previous_appointments: 8,
                delta: 0,
                percent_change: 0,
              },
            ],
          },
          {
            name: 'Анна',
            current_appointments: 65,
            previous_appointments: 75,
            delta: -10,
            percent_change: -13.3,
            services: [
              {
                name: 'Мужская стрижка',
                current_appointments: 41,
                previous_appointments: 45,
                delta: -4,
                percent_change: -8.9,
              },
              {
                name: 'Детская стрижка',
                current_appointments: 17,
                previous_appointments: 13,
                delta: 4,
                percent_change: 30.8,
              },
              {
                name: 'Камуфляж седины',
                current_appointments: 7,
                previous_appointments: 17,
                delta: -10,
                percent_change: -58.8,
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Салон с двумя мастерами и двумя услугами: просадка только у Ильи.
   *
   * Числа подобраны так, что порознь всё сходится — 12 действительно есть у
   * «Бороды», 104 500 ₽ действительно есть у салона. Отличить верную фразу от
   * ложной можно только по привязке.
   */
  function attributionExecution() {
    return {
      status: 'completed',
      execution_id: 'execution-attribution',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        metrics: { appointments_total: 40, unique_clients: 33 },
        changes: {
          appointments_total: {
            current: 40,
            previous: 52,
            delta: -12,
            percent_change: -23.1,
          },
        },
        current: {
          revenue: [
            {
              currency: 'RUB',
              amount_kopecks: 10_450_000,
              amount_major_units: 104_500,
            },
          ],
          staff_summary: [
            {
              name: 'Стас',
              appointments: 21,
              revenue: [],
              booked_minutes: 630,
              services: [{ name: 'Мужская стрижка', appointments: 21 }],
            },
            {
              name: 'Илья',
              appointments: 19,
              revenue: [],
              booked_minutes: 570,
              services: [{ name: 'Борода', appointments: 19 }],
            },
          ],
          service_summary: [
            { name: 'Мужская стрижка', appointments: 21, booked_value: [] },
            { name: 'Борода', appointments: 19, booked_value: [] },
          ],
        },
        service_changes: [
          {
            name: 'Борода',
            current_appointments: 19,
            previous_appointments: 31,
            delta: -12,
            percent_change: -38.7,
          },
        ],
        staff_changes: [
          {
            name: 'Илья',
            current_appointments: 19,
            previous_appointments: 31,
            delta: -12,
            percent_change: -38.7,
            services: [
              {
                name: 'Борода',
                current_appointments: 19,
                previous_appointments: 31,
                delta: -12,
                percent_change: -38.7,
              },
            ],
          },
          {
            name: 'Стас',
            current_appointments: 21,
            previous_appointments: 21,
            delta: 0,
            percent_change: 0,
            services: [
              {
                name: 'Мужская стрижка',
                current_appointments: 21,
                previous_appointments: 21,
                delta: 0,
                percent_change: 0,
              },
            ],
          },
        ],
      },
    };
  }

  function decision(
    value: Pick<AiCoreModelDecision, 'reply' | 'toolCall'>,
  ): AiCoreModelDecision {
    return {
      ...value,
      citationIds: [],
      provider: 'deepseek',
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  function createService(
    toolNames = ['analytics.business.read', 'loyalty.internal.adjust'],
    // Сверка привязки числа к сущности включена по умолчанию — замер на 58
    // ответах дал ноль ложных тревог. Явный `AI_CORE_ATTRIBUTION_GUARD=false`
    // нужен только тесту рубильника.
    env: Record<string, string> = {},
  ) {
    const config = {
      get: jest.fn((name: string) =>
        name in env
          ? env[name]
          : name === 'AI_CORE_MAX_TOOL_STEPS'
            ? '2'
            : undefined,
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
    const brainContext = {
      active: true,
      sessionId: 'brain-session-a',
      persona: 'director' as const,
      profile: 'maya_os' as const,
      intent: 'general' as const,
      knowledgeRequired: false,
      plan: {
        status: 'active' as const,
        steps: [{ key: 'respond', status: 'pending' as const }],
      },
      promptVersion: 'maya-brain-test',
      profileInstructions: 'Use verified tools.',
      preferences: [],
      knowledge: [],
    };
    const brain = {
      prepare: jest.fn((actor: AuthenticatedUser) =>
        Promise.resolve({
          ...brainContext,
          persona:
            actor.role === UserRole.CLIENT || actor.role === UserRole.CUSTOMER
              ? ('admin' as const)
              : ('director' as const),
        }),
      ),
      citations: jest.fn().mockReturnValue([]),
      recordOutcome: jest.fn().mockResolvedValue(brainContext.plan),
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
      brain as unknown as MayaBrainService,
    );
    return {
      auditLog,
      dashboardPreferences,
      model,
      rateLimit,
      runtime,
      service,
      staffScheduleCommand,
      brain,
    };
  }
});
