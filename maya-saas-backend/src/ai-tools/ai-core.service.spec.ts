import type { C9Orchestrator } from '../orchestration/c9.orchestrator';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import { AiCoreController } from './ai-core.controller';
import { staffScheduleRevision } from '../crm/staff-schedule.utils';
import { AiMemoryService } from './ai-memory.service';
import type { AiCoreModelDecision, AiCoreModelInput } from './ai-core.types';
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

  it('a stale history replay cannot append UNKNOWN after the original request saved SUCCEEDED', async () => {
    const mocks = createService();
    let release!: () => void;
    let observed!: () => void;
    const read = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let latest = 'pre-UNKNOWN';
    const timeline = {
      routeTypedUtterance: jest.fn().mockImplementation(async () => {
        const reply = latest;
        observed();
        await wait;
        return {
          reply,
          historyReplay: true,
          userTurn: { turnId: 'turn', conversationId: 'conversation' },
          action: { status: 'terminate', code: null, stopped_at_gate: '13' },
        };
      }),
      persistAssistantReply: jest
        .fn()
        .mockImplementation(({ reply }: { reply: string }) => {
          latest = reply;
        }),
    };
    Object.defineProperty(mocks.service, 'moduleRef', {
      value: { get: () => timeline },
    });
    const pending = mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Подтвердить приход' }],
    });
    await read;
    latest = 'SUCCEEDED exact immutable facts';
    release();
    const response = await pending;
    expect(response).toMatchObject({
      reply: 'pre-UNKNOWN',
      user_turn: { turnId: 'turn', conversationId: 'conversation' },
    });
    expect(timeline.persistAssistantReply).not.toHaveBeenCalled();
    expect(latest).toBe('SUCCEEDED exact immutable facts');
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it.each(['native', 'web'] as const)(
    'routes a %s conversation through the real schedule preview owner',
    async (surface) => {
      const mocks = createService(['staff.schedule.update']);
      const current = {
        staff_id: 'synthetic-staff',
        date: '2026-10-06',
        is_working: true,
        slots: [{ from: '10:00', to: '20:00' }],
        revision: staffScheduleRevision('synthetic-staff', '2026-10-06', [
          { from: '10:00', to: '20:00' },
        ]),
      };
      const crm = {
        getStaff: jest
          .fn()
          .mockResolvedValue([
            { id: 'synthetic-staff', name: 'Антон Тестовый' },
          ]),
        getStaffScheduleDay: jest.fn().mockResolvedValue(current),
        previewStaffScheduleDayChange: jest.fn().mockResolvedValue({
          current,
          proposed: { ...current, slots: [], is_working: false },
          conflict_times: [],
        }),
      };
      const command = new StaffScheduleCommandService(
        { get: () => undefined } as never,
        crm as never,
        {
          tenant: {
            findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
          },
        } as never,
        mocks.runtime as never,
      );
      mocks.staffScheduleCommand.tryHandle.mockImplementation((actor, input) =>
        command.tryHandle(actor, input),
      );
      mocks.runtime.execute.mockResolvedValue({
        status: 'approval_required',
        approval: { id: 'approval-synthetic', payload_hash: 'f'.repeat(64) },
      });
      const controller = new AiCoreController(mocks.service, {} as never);
      const result = await controller.chat(user, {
        surface,
        requestId: 'schedule-route-1234',
        messages: [
          { role: 'user', content: 'Сделай Антону 2026-10-06 выходной' },
        ],
      });
      expect(result).toMatchObject({
        action: {
          status: 'approval_required',
          approval: { id: 'approval-synthetic' },
        },
      });
      expect(crm.getStaff).toHaveBeenCalledWith(user.tenantId);
      expect(mocks.runtime.execute).toHaveBeenCalledWith(
        user,
        'staff.schedule.update',
        expect.objectContaining({
          surface,
          arguments: expect.objectContaining({
            staff_id: 'synthetic-staff',
            current_revision: current.revision,
            slots: [],
          }) as unknown,
        }),
      );
      expect(mocks.model.decide).not.toHaveBeenCalled();
    },
  );

  it('uses client authority for schedule commands in a client audience even for the owner', async () => {
    const mocks = createService();
    mocks.staffScheduleCommand.tryHandle.mockResolvedValue({
      reply: 'denied',
      action: null,
      toolUsage: null,
    });
    await mocks.service.chat(user, {
      ...dto,
      audience: 'client',
      messages: [{ role: 'user', content: 'Закрой Антону завтра' }],
    });
    expect(mocks.staffScheduleCommand.tryHandle).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.CLIENT }),
      expect.anything(),
    );
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('renders canonical dormancy signals without legacy contacts or inferred activity', () => {
    const { service } = createService();
    const render = (value: unknown) =>
      service['deterministicDormantClientsReply'](value);
    const item = {
      handle: 'result_1',
      kind: 'POLICY_SIGNAL',
      current: true,
      available: true,
      rule: { key: 'c8.dormancy/cadence', version: 2 },
      values: [{ key: 'cadence', value: true }],
      asOf: '2026-10-05T10:00:00.000Z',
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
    };
    const payload = {
      contract: 'c8.valuation.ai/1',
      configured: true,
      items: [item],
      moreAvailable: true,
    };
    const reply = render(payload);
    expect(reply).toContain('Оценка 1:');
    expect(reply).toContain('05.10.2026, 10:00 (UTC)');
    expect(reply).toContain('Исходные данные неполные');
    expect(reply).toContain('не список уникальных клиентов');
    expect(reply).not.toMatch(/c8.dormancy|result_1|PARTIAL/);
    expect(reply).toContain('не разрешение на контакт');
    expect(reply).toContain('не весь список');
    for (const unavailable of [
      { ...payload, configured: false, items: [] },
      { ...payload, items: [] },
      { ...payload, items: [{ ...item, available: false }] },
      { ...payload, items: [{ ...item, current: false }] },
      { ...payload, items: [{ ...item, qualification: 'UNVERIFIED' }] },
      { ...payload, items: [{ ...item, qualification: undefined }] },
      { ...payload, items: [{ ...item, completeness: 'UNKNOWN' }] },
      { ...payload, items: [{ ...item, asOf: 'unknown' }] },
      { ...payload, items: [{ ...item, rule: null }] },
      { ...payload, items: [{ ...item, rule: 'unknown' }] },
      { ...payload, items: [{ ...item, rule: [] }] },
      { ...payload, items: [{ ...item, rule: { ...item.rule, version: 0 } }] },
      {
        ...payload,
        items: [{ ...item, values: [...item.values, ...item.values] }],
      },
      {
        ...payload,
        items: [
          {
            ...item,
            values: [...item.values, { key: 'cadence', value: false }],
          },
        ],
      },
    ]) {
      expect(render(unavailable)).toContain('недоступ');
      expect(render(unavailable)).not.toContain('база активна');
    }
    expect(
      render({
        ...payload,
        items: [{ ...item, values: [{ key: 'cadence', value: false }] }],
      }),
    ).toContain('не выполнено');
    expect(
      render({
        inactive_days: 30,
        clients: [{ name: 'PRIVATE_NAME', phone: 'PRIVATE_PHONE' }],
      }),
    ).toBeNull();
  });

  it('returns C8 unavailability through chat after the selected dormancy read when model continuation fails', async () => {
    const mocks = createService(['clients.dormant.list']);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'dormancy-read',
      result: { contract: 'c8.valuation.ai/1', configured: false, items: [] },
    });
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: null,
          toolCall: { name: 'clients.dormant.list', arguments: {} },
        }),
      )
      .mockResolvedValue(null);
    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Кто давно не приходил?' }],
    });
    expect(mocks.runtime.execute).toHaveBeenCalled();
    expect(result.reply).toContain(
      'Подтверждённые результаты давности сейчас недоступны',
    );
    expect(result.reply).not.toContain('30 дней');
  });

  it.each([
    'На сегодня на 16:30 к Стасу',
    'Нет, лучше завтра к другому мастеру',
    'Хочу на стрижку в пятницу вечером',
    'Давай вместо завтра послезавтра',
  ])(
    'plans user booking turns before heuristic data preloads without exporting assistant history: %s',
    async (text) => {
      const toolNames = ['analytics.business.query', 'catalog.services.read'];
      const mocks = createService(toolNames);
      const semanticPlan = new ConversationIntelligenceService().validatePlan(
        {
          parent_request: 'Я хочу записаться как клиент',
          tasks: [
            {
              intent: 'booking.create_own',
              confidence: 0.98,
              entities: { service: 'стрижка', date: 'tomorrow', time: '16:30' },
            },
          ],
        },
        user.role,
        toolNames,
      );
      mocks.model.decide.mockResolvedValue(
        decision({
          reply: 'Для личной записи нужен подтверждённый клиентский доступ.',
          toolCall: null,
          semanticPlan,
        }),
      );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        result: { appointments_count: 13 },
      });
      const messages = [
        { role: 'user' as const, content: 'Я хочу записаться как клиент' },
        { role: 'assistant' as const, content: 'На какой день и время?' },
        { role: 'user' as const, content: text },
      ];
      const result = await mocks.service.chat(user, { ...dto, messages });
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      const forwarded = mocks.model.decide.mock.calls[0]?.[0].messages;
      expect(
        forwarded?.map((message) => ({
          ...message,
          content: message.content.replace(
            /\[name removed\]@[a-f0-9]{32}_\d+/g,
            'Стасу',
          ),
        })),
      ).toEqual(messages.filter((message) => message.role === 'user'));
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
      expect(result.reply).toContain('подтверждённый клиентский доступ');
    },
  );

  it.each([
    'ready',
    'empty',
    'malformed',
    'stale',
    'no-resolution',
    'refused-resolution',
    'wrong-source',
    'no-navigation',
  ])(
    'personal preparation announces a form only for a fresh actually minted catalog entry: %s',
    async (caseName) => {
      const mocks = createService(['catalog.services.read']);
      const semanticPlan = new ConversationIntelligenceService().validatePlan(
        {
          parent_request: 'Хочу записаться',
          tasks: [
            { intent: 'booking.prepare_personal', entities: {}, confidence: 1 },
          ],
        },
        user.role,
        ['catalog.services.read'],
      );
      mocks.model.decide.mockResolvedValue(
        decision({
          reply: '',
          toolCall: { name: 'catalog.services.read', arguments: {} },
          semanticPlan,
        }),
      );
      const result =
        caseName === 'empty'
          ? { services: [] }
          : caseName === 'malformed'
            ? {}
            : { services: [{ id: 'service', name: 'Service' }] };
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        stale: caseName === 'stale',
        result,
        ...(caseName === 'no-resolution'
          ? {}
          : {
              resolution: {
                matched: caseName !== 'refused-resolution',
                receipt: {
                  envelope: {
                    kind: 'SERVICE_SELECTOR',
                    provenance: {
                      source_capability:
                        caseName === 'wrong-source'
                          ? 'foreign.read'
                          : 'catalog.services.read',
                    },
                    intents:
                      caseName === 'no-navigation'
                        ? []
                        : [
                            {
                              effect: 'NAVIGATE',
                              target: { class: 'detail', ref: 'fs.booking' },
                            },
                          ],
                  },
                },
              },
            }),
      });
      const answer = await mocks.service.chat(user, {
        ...dto,
        messages: [{ role: 'user', content: 'Хочу записаться' }],
      });
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      expect(mocks.runtime.execute).toHaveBeenCalledTimes(1);
      expect(answer.grounding?.status).toBe(
        caseName === 'ready' ? 'verified' : 'blocked',
      );
      if (caseName === 'ready')
        expect(answer.reply).toContain('Записаться для себя');
      else {
        expect(answer.reply).toContain('не удалось открыть');
        expect(answer.reply).not.toContain('Показываю');
      }
    },
  );

  it('does not substitute a heuristic analytics read when semantic planning is unavailable', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.model.decide.mockRejectedValue(
      new ServiceUnavailableException({
        error: { code: 'ai_model_unavailable' },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      result: { appointments_count: 13 },
    });
    await expect(
      mocks.service.chat(user, {
        ...dto,
        messages: [
          { role: 'user', content: 'Я хочу записаться как клиент' },
          { role: 'assistant', content: 'На какой день и время?' },
          { role: 'user', content: 'На сегодня на 16:30 к Стасу' },
        ],
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('persists an explicit REMEMBER command without invoking the model', async () => {
    const mocks = createService();
    mocks.memory.handleExplicitCommand.mockResolvedValue({
      kind: 'remembered',
      reply: 'Запомнила: отвечать кратко.',
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'ЗАПОМНИ отвечать кратко' }],
    });

    expect(result.reply).toBe('Запомнила: отвечать кратко.');
    expect(mocks.memory.handleExplicitCommand).toHaveBeenCalledWith(
      'tenant-a',
      'owner-user',
      'ЗАПОМНИ отвечать кратко',
    );
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.listTools).not.toHaveBeenCalled();
  });

  it('passes tenant-scoped remembered notes to the model', async () => {
    const mocks = createService([]);
    mocks.memory.listForModel.mockResolvedValue([
      'предпочитает короткие ответы',
    ]);
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Поняла, отвечу коротко.', toolCall: null }),
    );

    await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Привет' }],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0].memoryFacts).toEqual([
      'предпочитает короткие ответы',
    ]);
  });

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
    // Персона считается роутером на месте, без флагов и без записи в базу.
    expect(result.brain).toEqual({ persona: 'director', intent: 'general' });
  });

  it('redacts PII, executes an allowed read tool and lets the model answer from its result', async () => {
    const mocks = createService();
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(
      decision({
        reply:
          '<b>Выручка по бизнесу за период выросла, считаю по данным CRM.</b>',
        toolCall: null,
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-a',
      tool_name: 'analytics.business.query',
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

    const modelInput = mocks.model.decide.mock.calls[1]?.[0];
    // 152-ФЗ: имя, телефон и почта клиента не пересекают внешнюю границу
    // модели. Это единственный контур, который вообще нельзя обсуждать.
    expect(JSON.stringify(modelInput)).not.toContain('Иван');
    expect(JSON.stringify(modelInput)).not.toContain('918 000');
    expect(JSON.stringify(modelInput)).not.toContain('ivan@example.com');
    expect(modelInput?.persona).toBe('director');
    // ПД могут прийти и «с другой стороны» — из результата инструмента.
    // Телефон обязан быть вырезан и там.
    expect(JSON.stringify(modelInput)).not.toContain('+79180000000');
    // Суть схемы: модель пишет ответ, ГЛЯДЯ на цифры инструмента, а не по
    // памяти. Данные поступают после явного выбора инструмента планировщиком.
    expect(modelInput?.toolResults?.[0]?.name).toBe('analytics.business.query');
    expect(result).toMatchObject({
      reply: 'Выручка по бизнесу за период выросла, считаю по данным CRM.',
      source: 'deepseek',
      redacted_input: true,
      grounding: {
        status: 'verified',
        domain: 'business_query',
        evidence_tools: ['analytics.business.query'],
      },
      tools_used: [
        {
          name: 'analytics.business.query',
          status: 'completed',
          execution_id: 'execution-a',
        },
      ],
    });
    // Сначала выбор инструмента, затем ответ на основе его результата.
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

  it.each([
    [
      {
        role: 'user' as const,
        content: 'Установи цену услуги Стрижка 1900 рублей',
      },
    ],
    [
      {
        role: 'user' as const,
        content: 'Установи цену услуги Стрижка 1800 рублей',
      },
      {
        role: 'assistant' as const,
        content: 'Модель предлагает Борода 9999 рублей',
      },
      { role: 'user' as const, content: 'Нет, 1900 рублей' },
    ],
  ])(
    'binds a pricing proposal to user text and catalog instead of model numbers',
    async (...messages) => {
      const mocks = createService([
        'catalog.services.read',
        'catalog.service.price.update',
      ]);
      mocks.model.decide.mockResolvedValue(
        decision({
          reply: '',
          toolCall: {
            name: 'catalog.service.price.update',
            arguments: {
              service_id: '43',
              price_rubles: 9999,
              company_id: 'foreign',
            },
          },
        }),
      );
      const previewSummary =
        'Изменить цену услуги «Стрижка» в YCLIENTS: 1 700 ₽ → 1 900 ₽ (RUB). Требуется ваше подтверждение.';
      const resolution = {
        matched: true,
        receipt: {
          widget_id: 'source-fixture-approval',
          envelope_seal: 'source-fixture-seal',
          envelope: { kind: 'APPROVAL' },
        },
        dismiss_widget_id: null,
      };
      mocks.runtime.execute.mockImplementation((_actor, name) =>
        Promise.resolve(
          name === 'catalog.services.read'
            ? {
                status: 'completed',
                result: {
                  services: [
                    { id: '42', name: 'Стрижка' },
                    { id: '43', name: 'Борода' },
                  ],
                },
              }
            : {
                status: 'approval_required',
                approval: { id: 'price-approval', summary: previewSummary },
                resolution,
              },
        ),
      );
      const result = await mocks.service.chat(user, { ...dto, messages });
      expect(result.reply).toBe(previewSummary);
      expect(result.resolution).toBe(resolution);
      expect(
        mocks.runtime.execute.mock.calls.find(
          (call) => call[1] === 'catalog.service.price.update',
        )?.[2].arguments,
      ).toEqual({ service_id: '42', price_rubles: 1900 });
      expect(result).toMatchObject({
        action: {
          status: 'approval_required',
          approval: { id: 'price-approval' },
        },
      });
    },
  );

  it.each([
    ['Установи цену Стрижка на 10%', false],
    ['Установи цену Массаж 1900', false],
    ['Установи цену Стрижка 1900', true],
  ] as const)(
    'does not prepare pricing from ambiguous intent or stale catalog: %s',
    async (content, stale) => {
      const mocks = createService([
        'catalog.services.read',
        'catalog.service.price.update',
      ]);
      mocks.model.decide.mockResolvedValue(
        decision({
          reply: '',
          toolCall: {
            name: 'catalog.service.price.update',
            arguments: { service_id: '42', price_rubles: 1900 },
          },
        }),
      );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        stale,
        result: { services: [{ id: '42', name: 'Стрижка' }] },
      });
      const result = await mocks.service.chat(user, {
        ...dto,
        messages: [{ role: 'user', content }],
      });
      expect(
        mocks.runtime.execute.mock.calls.some(
          (call) => call[1] === 'catalog.service.price.update',
        ),
      ).toBe(false);
      expect(result.action).toBeNull();
    },
  );

  it('withholds owner pricing from the client audience even if the owner is signed in', async () => {
    const mocks = createService(['catalog.service.price.update']);
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Уточните услугу.', toolCall: null }),
    );
    await mocks.service.chat(user, {
      ...dto,
      audience: 'client',
      messages: [{ role: 'user', content: 'Привет' }],
    });
    expect(mocks.model.decide.mock.calls[0]?.[0].tools).toEqual([]);
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('redacts standalone likely names before the external model boundary', async () => {
    const mocks = createService();
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-redaction',
      result: { verified: true, metrics: {}, changes: {}, current: {} },
    });
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
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-capitalized',
      result: { verified: true, metrics: {}, changes: {}, current: {} },
    });
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
    // Справочник услуг сервер заранее не грузит: цену модель обязана взять
    // сама, вызовом инструмента. Здесь она этого не делает и называет число.
    const mocks = createService(['catalog.services.read']);
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Стрижка стоит 999 999 ₽.', toolCall: null }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Сколько стоит стрижка?' }],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: {
        status: 'blocked',
        domain: 'service_catalog',
        required_tools: ['catalog.services.read'],
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
            name: 'analytics.business.query',
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
    expect(second?.toolResults?.[0]?.name).toBe('analytics.business.query');
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
            name: 'analytics.business.query',
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

  it('never substitutes business analytics for an unavailable staff schedule', async () => {
    const mocks = createService(['analytics.business.query']);

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'web',
      messages: [{ role: 'user', content: 'Кто работает сегодня?' }],
    });

    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: {
        status: 'blocked',
        domain: 'staff_schedule',
        required_tools: [],
        evidence_tools: [],
      },
    });
    expect(result.reply).not.toContain('аналитик');
  });

  // 🔴 Живой случай из прода: «Че ты как?» с телефона. Планировщик верно
  // пометил ход как small_talk, модель ответила по-человечески, а сторож
  // источника — поставленный РАНЬШЕ, по регулярке, где есть «че как», но нет
  // «че ТЫ как» — забраковал ответ и подменил заготовкой. Вердикт умного слоя
  // должен быть старше совпадения с шаблоном.
  it('не требует источник, когда смысловой план назвал ход болтовнёй', async () => {
    const toolNames = ['analytics.business.query'];
    const semanticPlan = new ConversationIntelligenceService().validatePlan(
      {
        parent_request: 'Че ты как?',
        tasks: [
          {
            intent: 'small_talk.free_form',
            entities: {},
            confidence: 0.94,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      toolNames,
    );
    if (!semanticPlan) {
      throw new Error('Expected a validated semantic plan');
    }
    const mocks = createService(toolNames);
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: 'Всё бодро. Салон под присмотром — спрашивайте, что нужно.',
        toolCall: null,
        semanticPlan,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Че ты как?' }],
    });

    expect(result.reply).toBe(
      'Всё бодро. Салон под присмотром — спрашивайте, что нужно.',
    );
    expect(result.source).not.toBe('safe_fallback');
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('routes an unseen owner paraphrase through semantic planning instead of a monthly-summary default', async () => {
    const toolNames = ['analytics.business.query', 'staff.schedule.read'];
    const semanticPlan = new ConversationIntelligenceService().validatePlan(
      {
        parent_request: 'Кто из ребят завтра в строю?',
        tasks: [
          {
            intent: 'schedule.get_team',
            entities: { date_or_period: 'tomorrow' },
            confidence: 0.96,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      toolNames,
    );
    if (!semanticPlan) {
      throw new Error('Expected a validated semantic plan');
    }
    const mocks = createService(toolNames);
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: 'Проверяю данные.',
        toolCall: {
          name: 'staff.schedule.read',
          arguments: { date: '2026-08-15' },
        },
        semanticPlan,
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-semantic-schedule',
      result: {
        verified: true,
        source: 'crm',
        date: '2026-08-15',
        staff: [
          {
            id: 'staff-1',
            name: 'Илья',
            title: 'Барбер',
            is_working: true,
            slots: [{ from: '10:00', to: '20:00' }],
          },
        ],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Кто из ребят завтра в строю?' }],
    });

    expect(mocks.model.decide.mock.calls[0]?.[0]).toMatchObject({
      requiredToolNames: toolNames,
      toolResults: [],
    });
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.read',
      expect.objectContaining({ arguments: { date: '2026-08-15' } }),
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
    );
    expect(mocks.runtime.execute).not.toHaveBeenCalledWith(
      user,
      'analytics.business.query',
      expect.anything(),
      expect.anything(),
    );
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: {
        status: 'verified',
        evidence_tools: ['staff.schedule.read'],
      },
    });
    expect(result.reply).toContain('Илья — 10:00–20:00');
  });

  it('asks one semantic clarification and executes no tool when meaning is uncertain', async () => {
    const toolNames = ['analytics.business.query', 'staff.schedule.read'];
    const semanticPlan = new ConversationIntelligenceService().validatePlan(
      {
        parent_request: 'Кто там завтра на точке?',
        tasks: [
          {
            intent: 'schedule.get_team',
            entities: { date_or_period: 'tomorrow' },
            confidence: 0.51,
            clarification_question:
              'Вы хотите узнать, кто из команды работает завтра?',
          },
        ],
      },
      UserRole.TENANT_OWNER,
      toolNames,
    );
    if (!semanticPlan) {
      throw new Error('Expected a validated semantic plan');
    }
    const mocks = createService(toolNames);
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: semanticPlan.tasks[0]?.clarification_question ?? '',
        toolCall: null,
        semanticPlan,
      }),
    );

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Кто там завтра на точке?' }],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reply: 'Вы хотите узнать, кто из команды работает завтра?',
      source: 'safe_fallback',
      grounding: { status: 'not_required' },
    });
  });

  it.each([
    [
      'Какие у вас мастера?',
      false,
      { staff: [{ name: 'Тестовый мастер', title: 'Барбер' }] },
      'verified',
    ],
    [
      'Какие у вас мастера?',
      true,
      { staff: [{ name: 'Тестовый мастер' }] },
      'blocked',
    ],
    ['Какие у вас мастера?', false, { staff: null }, 'blocked'],
  ] as const)(
    'composes semantic public staff consultation: %s',
    async (message, stale, result, status) => {
      const mocks = createService([
        'catalog.staff.read',
        'analytics.business.query',
      ]);
      mocks.model.decide.mockResolvedValueOnce(
        decision({
          reply: null,
          toolCall: { name: 'catalog.staff.read', arguments: {} },
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [
                {
                  intent: 'employees.list_public',
                  entities: {},
                  confidence: 0.99,
                },
              ],
            },
            user.role,
            ['catalog.staff.read'],
          ),
        }),
      );
      mocks.runtime.execute.mockResolvedValueOnce({
        status: 'completed',
        execution_id: 'public-source-read',
        stale,
        result,
      });
      const out = await mocks.service.chat(user, {
        ...dto,
        messages: [{ role: 'user', content: message }],
      });
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      expect(mocks.runtime.execute).toHaveBeenCalledTimes(1);
      expect(mocks.runtime.execute.mock.calls[0]?.[3]).toMatchObject({
        suppressWidgetTrigger: true,
      });
      expect(out).toMatchObject({
        action: null,
        source: 'safe_fallback',
        grounding: {
          status,
          domain: 'staff_catalog',
          evidence_tools: ['catalog.staff.read'],
        },
      });
      if (status === 'verified')
        expect(out.reply).toContain('Тестовый мастер — Барбер');
      else expect(out.reply).not.toContain('Тестовый мастер');
    },
  );

  it('keeps a compound public catalog plan in its existing continuation', async () => {
    const mocks = createService([
      'catalog.staff.read',
      'analytics.business.query',
    ]);
    const semanticPlan = new ConversationIntelligenceService().validatePlan(
      {
        dialogue_act: 'request',
        tasks: [
          { intent: 'employees.list_public', entities: {}, confidence: 0.99 },
          { intent: 'company.public_info', entities: {}, confidence: 0.99 },
        ],
      },
      user.role,
      ['catalog.staff.read'],
    );
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        semanticPlan,
        toolCall: { name: 'catalog.staff.read', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: 'Сведения о салоне и команде получены.',
        semanticPlan,
        toolCall: null,
      }),
    );
    mocks.runtime.execute.mockResolvedValueOnce({
      status: 'completed',
      execution_id: 'compound-public-read',
      result: { salon: {}, staff: [] },
    });
    await mocks.service.chat(user, {
      ...dto,
      audience: 'client',
      messages: [{ role: 'user', content: 'Расскажи о барбершопе' }],
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(mocks.runtime.execute.mock.calls[0]?.[3]).not.toHaveProperty(
      'suppressWidgetTrigger',
    );
  });

  it('keeps owner in client audience on salon story without business analytics', async () => {
    const mocks = createService([
      'analytics.business.query',
      'catalog.staff.read',
      'catalog.services.read',
    ]);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'catalog.staff.read', arguments: {} },
        semanticPlan: new ConversationIntelligenceService().validatePlan(
          {
            dialogue_act: 'request',
            tasks: [
              { intent: 'company.public_info', entities: {}, confidence: 0.99 },
            ],
          },
          UserRole.CUSTOMER,
          ['catalog.staff.read'],
        ),
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-staff-catalog',
      result: {
        salon: {
          name: 'Мужская Эстетика',
          about: ['Премиальный барбершоп в Ставрополе.'],
          founded_hint: 'около 2020 (более 6 лет)',
        },
        staff: [
          { id: '1', name: 'Илья', title: 'Барбер', specialization: null },
        ],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      audience: 'client',
      messages: [{ role: 'user', content: 'Расскажи о барбершопе' }],
    });

    expect(mocks.runtime.listTools).toHaveBeenCalled();
    const firstModelInput = mocks.model.decide.mock.calls[0]?.[0];
    expect(firstModelInput?.persona).toBe('admin');
    expect(
      firstModelInput?.tools?.map((tool: { name: string }) => tool.name),
    ).toEqual(expect.not.arrayContaining(['analytics.business.query']));
    expect(
      firstModelInput?.tools?.map((tool: { name: string }) => tool.name),
    ).toEqual(expect.arrayContaining(['catalog.staff.read']));
    expect(
      firstModelInput?.tools?.map((tool: { name: string }) => tool.name),
    ).not.toContain('booking.upsell.suggest');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'catalog.staff.read',
      expect.objectContaining({
        arguments: {},
      }),
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
    );
    expect(mocks.runtime.execute).not.toHaveBeenCalledWith(
      user,
      'analytics.business.query',
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    expect(result.reply).toContain('Из сохранённого описания салона');
    expect(result.reply).not.toContain('более 6 лет');
    expect(result.brain).toMatchObject({ persona: 'admin' });
    expect(result.widget).toBeUndefined();
    expect(result.reply).not.toMatch(/выручк|прибыл|загрузк|аналитик/i);
  });

  it('🔴 баланс чужого журнала произносится с оговоркой, а не как факт Maya', async () => {
    // P7.1. Поверхность чата — та же поверхность лояльности. Раньше здесь
    // звучало голое число даже тогда, когда оно отдано из кэша, потому что
    // владелец не ответил. Maya не ведёт этот реестр и обещать за него не может.
    const customer: AuthenticatedUser = {
      ...user,
      userId: 'customer-user',
      role: UserRole.CUSTOMER,
    };
    const mocks = createService(['loyalty.own.read']);
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: 'Проверяю баланс.',
        toolCall: { name: 'loyalty.own.read', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-loyalty-stale',
      result: {
        balance: 385,
        currency: 'RUB',
        authority: 'legacy_bot',
        authority_scope: 'resolved',
        stale: true,
        verification_required: true,
      },
    });

    const result = await mocks.service.chat(customer, {
      ...dto,
      messages: [{ role: 'user', content: 'Сколько у меня баллов?' }],
    });

    expect(result.reply).toContain('385');
    expect(result.reply).toContain('последнее известное значение');
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
      // Свой свежий реестр — единственный случай, когда оговорка не нужна.
      result: {
        balance: 2_133,
        currency: 'RUB',
        authority: 'maya',
        authoritative: true,
        stale: false,
        verification_required: false,
      },
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
          {
            status: 'confirmed',
            is_upcoming: true,
            start_at: '2099-07-20T10:00:00.000Z',
            branch: { timezone: 'Europe/Moscow' },
          },
          { status: 'canceled', is_upcoming: false },
        ],
      },
    });

    const result = await mocks.service.chat(customer, {
      ...dto,
      messages: [{ role: 'user', content: 'Какие у меня записи?' }],
    });

    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: {
        status: 'verified',
        domain: 'client_appointments',
        evidence_tools: ['appointments.own.list'],
      },
    });
    expect(result.reply).toContain('Предстоящих: 1, отменённых: 1.');
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

  describe('personal appointment details in the canonical chat', () => {
    const tool = 'appointments.own.list';
    const client = { ...user, role: UserRole.CLIENT };
    beforeEach(() =>
      jest.useFakeTimers().setSystemTime(new Date('2026-10-06T12:00:00Z')),
    );
    afterEach(() => jest.useRealTimers());
    const appointment = (changes: Record<string, unknown> = {}) => ({
      id: 'private-appointment',
      status: 'confirmed',
      is_upcoming: true,
      start_at: '2026-10-07T09:00:00.000Z',
      end_at: '2026-10-07T10:00:00.000Z',
      branch: { name: 'Тестовый филиал', timezone: 'Asia/Novosibirsk' },
      services: [{ name: 'Стрижка' }],
      ...changes,
    });
    function fixture(result: unknown, stale = false) {
      const mocks = createService([tool]);
      mocks.model.decide.mockResolvedValue(
        decision({ reply: null, toolCall: { name: tool, arguments: {} } }),
      );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        execution_id: 'personal-read',
        result,
        stale,
      });
      return mocks;
    }
    const ask = (mocks: ReturnType<typeof fixture>) =>
      mocks.service.chat(client, {
        ...dto,
        messages: [{ role: 'user', content: 'Когда я записан?' }],
      });
    it('describes an empty available list without denying history hidden by the source setting', async () => {
      const reply = await ask(fixture({ appointments: [] }));
      expect(reply.grounding.status).toBe('verified');
      expect(reply.reply).toBe(
        'В доступном списке нет записей. Источник: ваши записи в MAYA.',
      );
    });
    it('answers the next appointment at its branch time without exposing history to another model call', async () => {
      const mocks = fixture({ appointments: [appointment()] });
      const reply = await ask(mocks);
      expect(reply.reply).toContain('07.10.2026');
      expect(reply.reply).toContain('16:00');
      expect(reply.reply).toContain('Asia/Novosibirsk');
      expect(reply.reply).toContain('Стрижка');
      expect(reply.reply).not.toMatch(/private-appointment|раздел «Записи»/);
      expect(reply.grounding.status).toBe('verified');
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      expect(mocks.model.decide.mock.calls[0][0].toolResults).toEqual([]);
    });
    it.each(['same conversation', 'restored conversation'])(
      'does not export a prior personal reply through %s model input',
      async (mode) => {
        const mocks = fixture({
          appointments: [
            appointment({
              branch: {
                name: 'PRIVATE_BRANCH_MARKER',
                timezone: 'Asia/Novosibirsk',
              },
              services: [{ name: 'PRIVATE_VISIT_SERVICE_MARKER' }],
            }),
          ],
        });
        const first = await ask(mocks);
        expect(first.reply).toContain('PRIVATE_VISIT_SERVICE_MARKER');
        const followUp = {
          ...dto,
          requestId: 'personal-followup-1234',
          messages: [
            { role: 'user' as const, content: 'Когда я записан?' },
            { role: 'assistant' as const, content: first.reply },
            { role: 'user' as const, content: 'А теперь?' },
          ],
        };
        // A new server instance has no in-memory knowledge of the prior reply.
        const receiver =
          mode === 'restored conversation'
            ? fixture({ appointments: [] })
            : mocks;
        await receiver.service.chat(client, followUp);
        const input = JSON.stringify(
          receiver.model.decide.mock.calls.at(-1)?.[0],
        );
        expect(input).not.toMatch(
          /PRIVATE_VISIT_SERVICE_MARKER|PRIVATE_BRANCH_MARKER|Asia\/Novosibirsk|16:00|Предстоящих: 1/,
        );
        expect(input).toContain('А теперь?');
        await receiver.service.chat(client, {
          ...followUp,
          requestId: 'personal-followup-5678',
          messages: [
            { role: 'assistant', content: first.reply.slice(25, 170) },
            { role: 'user', content: 'Проверь ещё раз' },
          ],
        });
        expect(
          JSON.stringify(receiver.model.decide.mock.calls.at(-1)?.[0]),
        ).not.toMatch(
          /PRIVATE_VISIT_SERVICE_MARKER|PRIVATE_BRANCH_MARKER|16:00|Предстоящих: 1/,
        );
      },
    );
    it('counts the complete raw list and displays only three earliest upcoming appointments', async () => {
      const rows = Array.from({ length: 45 }, (_, i) =>
        appointment({
          id: `private-${i}`,
          start_at: new Date(Date.UTC(2026, 9, 7 + i, 9)).toISOString(),
          end_at: new Date(Date.UTC(2026, 9, 7 + i, 10)).toISOString(),
        }),
      ).reverse();
      const reply = await ask(fixture({ appointments: rows }));
      expect(reply.reply).toContain('45');
      expect(reply.reply).toContain('07.10.2026');
      expect(reply.reply).toContain('09.10.2026');
      expect(reply.reply).not.toContain('10.10.2026');
      expect(reply.reply).not.toContain('В вашей истории 40');
    });
    it('withholds private history in the actual serialized next model request, including a refused personal reread', async () => {
      const mocks = fixture({
        appointments: [
          appointment({ services: [{ name: 'PRIVATE_SERIALIZED_VISIT' }] }),
        ],
      });
      const wire: string[] = [];
      const realModel = new AiCoreModelService(
        new ConfigService({
          AI_CORE_PROVIDER: 'openai',
          OPENAI_API_KEY: 'synthetic-transport-no-credential',
        }),
      );
      const transport = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((url, init) => {
          expect(url).toBe('https://api.openai.com/v1/responses');
          expect(init?.method).toBe('POST');
          if (typeof init?.body !== 'string')
            throw new Error('Expected serialized provider request body');
          const serialized = init.body;
          wire.push(serialized);
          // The real provider serializer runs; no socket/provider is used.
          return Promise.resolve(
            new Response(
              JSON.stringify({
                output: [
                  {
                    content: [
                      {
                        type: 'output_text',
                        text: JSON.stringify({
                          semantic_plan: {
                            parent_request: 'Покажи мои записи',
                            language: 'ru',
                            dialogue_act: 'question',
                            tasks: [
                              {
                                id: 'own',
                                intent: 'booking.list_own',
                                entities_json: '{}',
                                depends_on: [],
                                confidence: 1,
                                requires_clarification: false,
                                clarification_question: null,
                              },
                            ],
                            context: {
                              carried_slots: [],
                              replaced_slots: [],
                              unresolved_references: [],
                            },
                          },
                          tool_call: {
                            name: 'appointments.own.list',
                            arguments_json: '{}',
                          },
                        }),
                      },
                    ],
                  },
                ],
                usage: {},
              }),
              { status: 200 },
            ),
          );
        });
      mocks.model.decide.mockImplementation((input) => realModel.decide(input));
      try {
        const first = await ask(mocks);
        expect(first.reply).toContain('PRIVATE_SERIALIZED_VISIT');
        for (const denied of [false, true]) {
          if (denied)
            mocks.runtime.execute.mockRejectedValueOnce(
              new ForbiddenException('synthetic revoked personal link'),
            );
          const next = mocks.service.chat(client, {
            ...dto,
            requestId: denied ? 'wire-revoked-1234' : 'wire-followup-1234',
            messages: [
              { role: 'user', content: 'Когда я записан?' },
              { role: 'assistant', content: first.reply },
              { role: 'user', content: 'Покажи мои записи' },
            ],
          });
          if (denied)
            await expect(next).rejects.toBeInstanceOf(ForbiddenException);
          else await next;
          expect(wire.at(-1)).not.toMatch(
            /PRIVATE_SERIALIZED_VISIT|Asia\/Novosibirsk|16:00|Предстоящих: 1/,
          );
          const body = JSON.parse(wire.at(-1)!) as { input: string };
          expect(body.input).toContain('Покажи мои записи');
        }
        expect(wire).toHaveLength(3);
      } finally {
        transport.mockRestore();
      }
    });
    it('does not offer a canceled future appointment as the next visit', async () => {
      const reply = await ask(
        fixture({ appointments: [appointment({ status: 'canceled' })] }),
      );
      expect(reply.reply).toContain('Предстоящих: 0');
      expect(reply.reply).not.toMatch(/16:00|Стрижка/);
    });
    it('does not offer a cached upcoming flag after its actual instant has passed', async () => {
      const reply = await ask(
        fixture({
          appointments: [appointment({ start_at: '2026-10-06T09:00:00Z' })],
        }),
      );
      expect(reply.grounding.status).toBe('verified');
      expect(reply.reply).toContain('Предстоящих: 0');
      expect(reply.reply).not.toContain('Стрижка');
    });
    it.each([
      new Date('2026-10-07T09:00:00Z'),
      '2026-10-07T09:00:00Z',
      '2026-10-07T09:00:00.1Z',
    ])('accepts canonical reader/persisted instant %s', async (start) => {
      const reply = await ask(
        fixture({ appointments: [appointment({ start_at: start })] }),
      );
      expect(reply.grounding.status).toBe('verified');
      expect(reply.reply).toContain('07.10.2026, 16:00');
    });
    it.each([
      ['missing list', {}],
      ['null list', { appointments: null }],
      ['malformed entry', { appointments: [null] }],
      [
        'missing upcoming time',
        { appointments: [appointment({ start_at: null })] },
      ],
      [
        'normalized invalid calendar date',
        { appointments: [appointment({ start_at: '2027-02-30T09:00:00Z' })] },
      ],
      [
        'timezone-free datetime',
        { appointments: [appointment({ start_at: '2026-10-07T09:00:00' })] },
      ],
      [
        'missing branch timezone',
        { appointments: [appointment({ branch: { name: 'Филиал' } })] },
      ],
      [
        'unknown status',
        { appointments: [appointment({ status: 'unknown' })] },
      ],
      [
        'invalid timezone',
        {
          appointments: [appointment({ branch: { timezone: 'Mars/Olympus' } })],
        },
      ],
    ])(
      'does not turn %s into a verified empty history or invented date',
      async (_label, data) => {
        const reply = await ask(fixture(data));
        expect(reply.grounding.status).toBe('blocked');
        expect(reply.reply).not.toMatch(
          /У вас пока нет записей|В доступном списке нет записей|16:00|07.10.2026/,
        );
      },
    );
    it('refuses stale appointment times instead of claiming the snapshot is current', async () => {
      const reply = await ask(fixture({ appointments: [appointment()] }, true));
      expect(reply.grounding.status).toBe('blocked');
      expect(reply.reply).not.toContain('16:00');
    });
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
        domain: 'business_query',
      },
    });
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  // Пустой список инструментов означает ровно одно: политика не выдала
  // профильную возможность, то есть ассистента нет в тарифе. Раньше это звучало
  // так же, как «не ваша роль», и владелец читал тарифное ограничение как
  // поломку. Тариф надо назвать вслух.
  it('names the plan when the assistant is not part of it at all', async () => {
    const mocks = createService([]);

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Какая выручка бизнеса за этот месяц?' },
      ],
    });

    expect(result).toMatchObject({
      reply:
        'MAYA не входит в ваш текущий тариф, поэтому я не могу открыть данные бизнеса. Ассистент включён в тариф Business+ — после перехода все ответы по вашей CRM станут доступны сразу, ничего настраивать не нужно.',
      source: 'safe_fallback',
      grounding: { status: 'blocked' },
    });
    expect(mocks.model.decide).not.toHaveBeenCalled();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  // 🔴 Живой случай из прода. Мастер спросил «Сколько у меня ещё записей
  // сегодня» и получил «Этот запрос недоступен для вашей текущей роли или
  // тарифа» — при том, что его собственный день лежал в личной аналитике,
  // которая ему выдана. Подсказка называла только журнал команды, мастеру не
  // положенный, поэтому вся семья считалась закрытой. Отказ в СВОИХ данных —
  // всегда дефект, а не защита.
  it.each(['Сколько у меня ещё записей сегодня', 'Какой у меня график завтра'])(
    'не отказывает мастеру в его собственных данных: %s',
    async (question) => {
      const master: AuthenticatedUser = {
        ...user,
        userId: 'master-user',
        role: UserRole.EMPLOYEE,
      };
      const mocks = createService([
        'analytics.employee.query',
        'staff.schedule.own.read',
        'appointments.own.list',
      ]);
      mocks.model.decide.mockResolvedValue(
        decision({ reply: 'Смотрю твой день.', toolCall: null }),
      );

      const result = await mocks.service.chat(master, {
        ...dto,
        messages: [{ role: 'user', content: question }],
      });

      // Единственное, что тут важно и не хрупко: человеку не говорят, что его
      // собственные данные ему не положены. Каким путём MAYA доберётся до ответа
      // — моделью или серверным разбором своих записей, — дело десятое.
      expect(result.reply).not.toContain('недоступен для вашей текущей роли');
      expect(result.reply).not.toContain('чужие или закрытые данные');
    },
  );

  describe('stored Admin integration status [scripted selection only]', () => {
    const tool = 'support.integration-status.read';
    const payload = {
      configured: true,
      calendar_source: 'external',
      next_action: 'reconnect',
      connection: {
        provider: 'yclients',
        status: 'error',
        verified: true,
        verified_at: '2026-10-05T08:00:00.000Z',
        last_checked_at: '2026-10-06T09:00:00.000Z',
        last_sync_at: null,
      },
    };
    function fixture(stale = false, result: unknown = payload) {
      const mocks = createService([tool]);
      mocks.model.decide
        .mockResolvedValueOnce(
          decision({
            reply: null,
            toolCall: { name: tool, arguments: {} },
          }),
        )
        .mockResolvedValue(
          decision({ reply: 'MODEL: CRM работает сейчас.', toolCall: null }),
        );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        execution_id: 'stored-admin-status',
        stale,
        result,
      });
      return mocks;
    }
    it.each(['native', 'web'] as const)(
      'answers the selected READ on %s with one model selection and unchanged actor',
      async (surface) => {
        const mocks = fixture();
        const output = await mocks.service.chat(user, {
          ...dto,
          surface,
          messages: [{ role: 'user', content: 'Как состояние подключения?' }],
        });
        expect(output.reply).toContain(
          'Сохранённый статус интеграции YCLIENTS: ошибка подключения',
        );
        expect(output.reply).toContain('06.10.2026, 09:00 (UTC)');
        expect(output.reply).toContain(
          'Текущая доступность CRM не подтверждена',
        );
        expect(output.reply).toContain('переподключить CRM');
        expect(output.reply).not.toContain('MODEL');
        expect(output).toMatchObject({
          action: null,
          grounding: {
            status: 'verified',
            domain: 'integration_status',
            evidence_tools: [tool],
          },
        });
        expect(mocks.model.decide).toHaveBeenCalledTimes(1);
        expect(mocks.runtime.execute).toHaveBeenCalledTimes(1);
        expect(mocks.runtime.execute.mock.calls[0]?.[0]).toEqual(user);
        expect(mocks.runtime.execute.mock.calls[0]?.[1]).toBe(tool);
      },
    );
    it.each([
      ['stale', true, payload],
      ['incomplete', false, {}],
    ] as const)(
      'keeps %s source blocked without a recovery recommendation',
      async (_label, stale, result) => {
        const mocks = fixture(stale, result);
        const output = await mocks.service.chat(user, {
          ...dto,
          messages: [{ role: 'user', content: 'Как состояние подключения?' }],
        });
        expect(output.grounding.status).toBe('blocked');
        expect(output.reply).not.toMatch(/переподключить CRM|MODEL/);
        expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      },
    );
    it('does not reuse a successful status after source access is revoked', async () => {
      const mocks = fixture();
      const first = await mocks.service.chat(user, {
        ...dto,
        messages: [{ role: 'user', content: 'Как состояние подключения?' }],
      });
      mocks.model.decide.mockResolvedValue(
        decision({ reply: null, toolCall: { name: tool, arguments: {} } }),
      );
      mocks.runtime.execute.mockRejectedValue(
        new ForbiddenException('feature revoked'),
      );
      await expect(
        mocks.service.chat(user, {
          ...dto,
          requestId: 'admin-revoked-next',
          messages: [
            { role: 'assistant', content: first.reply },
            { role: 'user', content: 'А теперь?' },
          ],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // Scripted tool selection and source fixtures: no model/provider acceptance.
  describe('public company profile consultation', () => {
    const tool = 'company.business-hours.read';
    const profile = {
      verified: true,
      source: 'external_crm',
      title: 'Synthetic salon',
      address: 'Тестовая улица, 7',
      timezone: 'Europe/Moscow',
      schedule: 'Пн–Пт 10:00–20:00; Сб–Вс 11:00–18:00',
      schedule_available: true,
    };
    const client = { ...user, role: UserRole.CLIENT };
    function fixture(result: unknown) {
      const mocks = createService([tool]);
      mocks.model.decide
        .mockResolvedValue(
          decision({
            reply: 'MODEL: Мы открыты сейчас и есть свободное место.',
            toolCall: null,
          }),
        )
        .mockResolvedValueOnce(
          decision({ reply: null, toolCall: { name: tool, arguments: {} } }),
        );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        execution_id: 'profile-read',
        result,
      });
      return mocks;
    }
    it('answers the client address and hours from the public CRM profile without another model call', async () => {
      const mocks = fixture(profile);
      const result = await mocks.service.chat(client, {
        ...dto,
        messages: [
          {
            role: 'user',
            content: 'Где вы находитесь и во сколько открываетесь?',
          },
        ],
      });
      expect(result.reply).toContain(profile.address);
      expect(result.reply).toContain(profile.schedule);
      expect(result.reply).toContain('Europe/Moscow');
      expect(result.reply).toContain('Источник: CRM салона');
      expect(result.reply).not.toMatch(/MODEL|открыты сейчас|свободное место/);
      expect(result).toMatchObject({
        source: 'safe_fallback',
        action: null,
        grounding: {
          status: 'verified',
          domain: 'company_profile',
          evidence_tools: [tool],
        },
      });
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      // Public hours are not a timed SCHEDULE body. The actual browser proof
      // exposed its raw JSON fallback beside the complete server answer.
      expect(mocks.runtime.execute.mock.calls[0]?.[3]).toMatchObject({
        suppressWidgetTrigger: true,
        widgetTrigger: 'T-2a',
      });
    });
    it('preserves an address when discovery has no hours instead of inventing them', async () => {
      const mocks = fixture({
        ...profile,
        schedule: null,
        timezone: null,
        schedule_available: false,
      });
      const result = await mocks.service.chat(client, {
        ...dto,
        messages: [
          { role: 'user', content: 'Какой у вас график работы и адрес?' },
        ],
      });
      expect(result.reply).toContain(profile.address);
      expect(result.reply).toContain('График работы не указан');
      expect(result.reply).not.toMatch(/10:00|20:00|MODEL|открыты сейчас/);
      expect(result.grounding.status).toBe('blocked');
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    });
    it.each([
      ['unverified', { verified: false }],
      ['wrong source', { source: 'model' }],
      ['stale', { stale: true }],
      ['contradictory availability', { schedule_available: false }],
      ['missing hours', { schedule: undefined }],
      ['unbounded hours', { schedule: 'x'.repeat(1500) }],
    ])(
      'does not claim company profile facts from %s',
      async (_label, changes) => {
        const mocks = fixture({ ...profile, ...changes });
        const result = await mocks.service.chat(client, {
          ...dto,
          messages: [{ role: 'user', content: 'Во сколько вы открываетесь?' }],
        });
        expect(result.grounding.status).toBe('blocked');
        expect(result.reply).toContain('Не удалось подтвердить');
        expect(result.reply).not.toMatch(/10:00|20:00|MODEL/);
        expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      },
    );
    it('keeps known hours but marks a missing address instead of substituting the salon name', async () => {
      const mocks = fixture({ ...profile, address: null });
      const result = await mocks.service.chat(client, {
        ...dto,
        messages: [{ role: 'user', content: 'Как к вам добраться?' }],
      });
      expect(result.reply).toContain('Адрес не указан в CRM');
      expect(result.reply).toContain(profile.schedule);
      expect(result.reply).not.toContain('Synthetic salon');
      expect(result.grounding.status).toBe('blocked');
    });
    it('rereads current public facts for a short address follow-up without carrying old hours', async () => {
      const mocks = fixture(profile);
      const first = await mocks.service.chat(client, {
        ...dto,
        messages: [{ role: 'user', content: 'Во сколько вы открываетесь?' }],
      });
      mocks.model.decide.mockResolvedValueOnce(
        decision({ reply: null, toolCall: { name: tool, arguments: {} } }),
      );
      mocks.runtime.execute.mockResolvedValueOnce({
        status: 'completed',
        execution_id: 'profile-read-2',
        result: {
          ...profile,
          address: 'Новая улица, 8',
          schedule: null,
          schedule_available: false,
        },
      });
      const second = await mocks.service.chat(client, {
        ...dto,
        requestId: 'profile_followup_123',
        messages: [
          { role: 'user', content: 'Во сколько вы открываетесь?' },
          { role: 'assistant', content: first.reply },
          { role: 'user', content: 'А адрес?' },
        ],
      });
      expect(second.reply).toContain('Новая улица, 8');
      expect(second.reply).toContain('График работы не указан');
      expect(second.reply).not.toContain(profile.schedule);
      expect(second.reply).not.toContain(profile.address);
      expect(mocks.model.decide).toHaveBeenCalledTimes(2);
      expect(mocks.runtime.execute).toHaveBeenCalledTimes(2);
    });
    it('refuses a model-only public address answer before a current source read', async () => {
      const mocks = createService([tool]);
      mocks.model.decide.mockResolvedValue(
        decision({
          reply: 'Мы на Выдуманной улице, 99, работаем круглосуточно.',
          toolCall: null,
        }),
      );
      const result = await mocks.service.chat(client, {
        ...dto,
        messages: [{ role: 'user', content: 'Где вы находитесь?' }],
      });
      expect(result.grounding.status).toBe('blocked');
      expect(result.reply).not.toContain('Выдуманной');
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
    });
    it.each([
      'Как изменить email-адрес?',
      'Что такое IP-адрес?',
      'Какой у вас адрес электронной почты?',
      'Какой ваш адрес сайта?',
      'Где находится настройка уведомлений?',
      'Когда открывается запись на ноябрь?',
    ])(
      'does not require the salon profile for another domain: %s',
      async (content) => {
        const mocks = createService([tool, 'catalog.services.read']);
        mocks.model.decide.mockResolvedValue(
          decision({ reply: 'Уточните вопрос.', toolCall: null }),
        );
        const result = await mocks.service.chat(client, {
          ...dto,
          messages: [{ role: 'user', content }],
        });
        expect(result.grounding.required_tools).not.toEqual([tool]);
        expect(result.grounding.domain).not.toBe('company_profile');
        expect(mocks.runtime.execute).not.toHaveBeenCalled();
      },
    );
    it('keeps a client dossier address question in the existing dossier domain', async () => {
      const mocks = createService([tool, 'clients.dossier.read']);
      mocks.model.decide.mockResolvedValue(
        decision({ reply: 'Уточните гостя.', toolCall: null }),
      );
      const result = await mocks.service.chat(user, {
        ...dto,
        messages: [
          { role: 'user', content: 'Покажи досье клиента и его адрес' },
        ],
      });
      expect(result.grounding.required_tools).toEqual(['clients.dossier.read']);
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
    });
  });

  describe('own schedule', () => {
    beforeEach(() =>
      jest.useFakeTimers().setSystemTime(new Date('2026-10-06T12:00:00Z')),
    );
    afterEach(() => jest.useRealTimers());
    it.each([
      {
        is_working: true,
        slots: [
          { from: '09:00', to: '12:00' },
          { from: '13:00', to: '18:00' },
        ],
        reply:
          'Ваш график на 07.10.2026: 09:00–12:00, 13:00–18:00. Источник: YClients.',
      },
      {
        is_working: false,
        slots: [],
        reply: 'По графику на 07.10.2026 у вас выходной. Источник: YClients.',
      },
    ])(
      'composes own schedule from the current source: $is_working',
      async (day) => {
        const mocks = createService(['staff.schedule.own.read']);
        const employee = { ...user, role: UserRole.EMPLOYEE };
        mocks.model.decide
          .mockResolvedValue(
            decision({
              reply: 'MODEL MUST NOT COMPOSE THE SHIFT',
              toolCall: null,
            }),
          )
          .mockResolvedValueOnce(
            decision({
              reply: null,
              toolCall: {
                name: 'staff.schedule.own.read',
                arguments: { date: '2026-10-07' },
              },
            }),
          );
        mocks.runtime.execute.mockResolvedValue({
          status: 'completed',
          execution_id: 'own-schedule-read',
          result: {
            available: true,
            verified: true,
            source: 'external_crm',
            date: '2026-10-07',
            is_working: day.is_working,
            slots: day.slots,
          },
        });
        const result = await mocks.service.chat(employee, {
          ...dto,
          messages: [{ role: 'user', content: 'Какой у меня график завтра?' }],
        });
        expect(result).toMatchObject({
          reply: day.reply,
          source: 'safe_fallback',
          action: null,
          grounding: {
            status: 'verified',
            domain: 'staff_schedule',
            evidence_tools: ['staff.schedule.own.read'],
          },
        });
        expect(mocks.model.decide).toHaveBeenCalledTimes(1);
        expect(mocks.runtime.execute).toHaveBeenCalledWith(
          employee,
          'staff.schedule.own.read',
          expect.objectContaining({ arguments: { date: '2026-10-07' } }),
          expect.anything(),
        );
      },
    );

    it.each([
      [
        'unlinked',
        {
          available: false,
          reason: 'employee_is_not_linked_to_active_crm_staff',
          date: '2026-10-07',
        },
      ],
      ['working without intervals', { is_working: true, slots: [] }],
      ['missing work status', { is_working: undefined }],
      ['unverified', { verified: false }],
      ['stale', { stale: true }],
      ['wrong source', { source: 'model' }],
      ['wrong date', { date: '2026-10-08' }],
      ['broken interval', { slots: [{ from: '18:00', to: '09:00' }] }],
      ['contradictory day off', { is_working: false }],
    ])('refuses to invent an own schedule when %s', async (label, changes) => {
      const mocks = createService(['staff.schedule.own.read']);
      mocks.model.decide
        .mockResolvedValue(
          decision({ reply: 'MODEL INVENTED A DAY OFF', toolCall: null }),
        )
        .mockResolvedValueOnce(
          decision({
            reply: null,
            toolCall: {
              name: 'staff.schedule.own.read',
              arguments: { date: '2026-10-07' },
            },
          }),
        );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        execution_id: 'own-schedule-read',
        result: {
          available: true,
          verified: true,
          source: 'external_crm',
          date: '2026-10-07',
          is_working: true,
          slots: [{ from: '09:00', to: '18:00' }],
          ...changes,
        },
      });
      const result = await mocks.service.chat(
        { ...user, role: UserRole.EMPLOYEE },
        {
          ...dto,
          messages: [{ role: 'user', content: 'Какой у меня график завтра?' }],
        },
      );
      expect(result).toMatchObject({
        source: 'safe_fallback',
        action: null,
        grounding: { status: 'blocked' },
      });
      expect(result.reply).not.toMatch(/выходной|09:00|18:00|MODEL/);
      expect(result.reply).toContain(
        label === 'unlinked' ? 'привязк' : 'подтвердить',
      );
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      expect(mocks.runtime.execute).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['Завтра я работаю?', '2026-10-07'],
      ['А послезавтра?', '2026-10-08'],
      ['Сегодня я работаю?', '2026-10-06'],
      ['Мой график 2026-10-02', '2026-10-02'],
      ['Мой график 02.10.2026', '2026-10-02'],
      ['Мой график 02.10.26.', '2026-10-02'],
    ])(
      'binds own schedule date to the current request: %s',
      async (text, date) => {
        const mocks = createService(['staff.schedule.own.read']);
        mocks.model.decide.mockResolvedValueOnce(
          decision({
            reply: null,
            toolCall: {
              name: 'staff.schedule.own.read',
              arguments: { date: '2099-01-01' },
            },
          }),
        );
        mocks.runtime.execute.mockResolvedValue({
          status: 'completed',
          result: {
            available: true,
            verified: true,
            source: 'external_crm',
            date,
            is_working: false,
            slots: [],
          },
        });
        const result = await mocks.service.chat(
          { ...user, role: UserRole.EMPLOYEE },
          {
            ...dto,
            messages: [{ role: 'user', content: text }],
          },
        );
        expect(mocks.runtime.execute).toHaveBeenCalledWith(
          expect.anything(),
          'staff.schedule.own.read',
          expect.objectContaining({ arguments: { date } }),
          expect.anything(),
        );
        expect(result.grounding.status).toBe('verified');
        expect(result.reply).not.toContain('2099');
      },
    );

    it.each([
      ['Europe/Moscow', '2026-10-08'],
      ['America/Los_Angeles', '2026-10-07'],
    ])(
      'binds own schedule tomorrow across local midnight in %s',
      async (timezone, expectedDate) => {
        // Moscow has already entered October 7; UTC is still October 6.
        jest.setSystemTime(new Date('2026-10-06T21:30:00Z'));
        const mocks = createService(['staff.schedule.own.read'], {}, timezone);
        mocks.model.decide.mockResolvedValueOnce(
          decision({
            reply: null,
            toolCall: {
              name: 'staff.schedule.own.read',
              arguments: { date: '2026-10-07' },
            },
          }),
        );
        mocks.runtime.execute.mockResolvedValue({
          status: 'completed',
          result: {
            available: true,
            verified: true,
            source: 'external_crm',
            date: expectedDate,
            is_working: false,
            slots: [],
          },
        });
        const result = await mocks.service.chat(
          { ...user, role: UserRole.EMPLOYEE },
          {
            ...dto,
            messages: [{ role: 'user', content: 'Я завтра работаю?' }],
          },
        );
        expect(mocks.runtime.execute).toHaveBeenCalledWith(
          expect.anything(),
          'staff.schedule.own.read',
          expect.objectContaining({ arguments: { date: expectedDate } }),
          expect.anything(),
        );
        expect(result.grounding.status).toBe('verified');
        expect(mocks.tenantRead).toHaveBeenCalledWith({
          where: { id: user.tenantId },
          select: { defaultTimezone: true },
        });
      },
    );

    it.each([
      'Мой график',
      'Сегодня или завтра?',
      'На 31.02.2026',
      'Мой график 07.10.026',
      'Мой график 07.10.326',
      'Мой график не завтра, а в пятницу',
      'С 07.10 до пятницы',
      'Не на завтра, а на следующий день',
      'Завтра и в пятницу',
    ])(
      'clarifies an own schedule date without trusting model args: %s',
      async (text) => {
        const mocks = createService(['staff.schedule.own.read']);
        mocks.model.decide.mockResolvedValueOnce(
          decision({
            reply: null,
            toolCall: {
              name: 'staff.schedule.own.read',
              arguments: { date: '2026-10-07' },
            },
          }),
        );
        const result = await mocks.service.chat(
          { ...user, role: UserRole.EMPLOYEE },
          {
            ...dto,
            messages: [{ role: 'user', content: text }],
          },
        );
        expect(result.reply).toContain('На какую дату');
        expect(result.grounding.status).toBe('blocked');
        expect(mocks.runtime.execute).not.toHaveBeenCalled();
        expect(mocks.model.decide).toHaveBeenCalledTimes(1);
      },
    );

    it('refuses an own schedule that would be truncated by result sanitization', async () => {
      const mocks = createService(['staff.schedule.own.read']);
      mocks.model.decide.mockResolvedValueOnce(
        decision({
          reply: null,
          toolCall: {
            name: 'staff.schedule.own.read',
            arguments: { date: '2026-10-07' },
          },
        }),
      );
      const minute = (n: number) =>
        `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        result: {
          available: true,
          verified: true,
          source: 'external_crm',
          date: '2026-10-07',
          is_working: true,
          slots: Array.from({ length: 201 }, (_, i) => ({
            from: minute(i * 2),
            to: minute(i * 2 + 1),
          })),
        },
      });
      const result = await mocks.service.chat(
        { ...user, role: UserRole.EMPLOYEE },
        {
          ...dto,
          messages: [{ role: 'user', content: 'Я завтра работаю?' }],
        },
      );
      expect(result.grounding.status).toBe('blocked');
      expect(result.reply).toContain('Не удалось подтвердить');
      expect(result.reply).not.toContain('00:00');
      expect(mocks.model.decide).toHaveBeenCalledTimes(1);
    });

    it('does not expose the staff own schedule in an owner client audience', async () => {
      const mocks = createService([
        'staff.schedule.own.read',
        'catalog.services.read',
      ]);
      const result = await mocks.service.chat(user, {
        ...dto,
        audience: 'client',
        messages: [{ role: 'user', content: 'Мой рабочий график на завтра' }],
      });
      expect(result.grounding.status).toBe('blocked');
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
      for (const [input] of mocks.model.decide.mock.calls)
        expect(input.tools.map((tool) => tool.name)).not.toContain(
          'staff.schedule.own.read',
        );
    });

    it('rereads the own schedule for a short next-day follow-up instead of reusing the prior shift', async () => {
      const mocks = createService(['staff.schedule.own.read']);
      const employee = { ...user, role: UserRole.EMPLOYEE };
      const ci = new ConversationIntelligenceService();
      const messages = [
        { role: 'user' as const, content: 'Я завтра работаю?' },
      ];
      for (const [date, isWorking] of [
        ['2026-10-07', true],
        ['2026-10-08', false],
      ] as const) {
        mocks.model.decide.mockResolvedValueOnce(
          decision({
            reply: null,
            semanticPlan: ci.validatePlan(
              {
                dialogue_act: isWorking ? 'request' : 'follow_up',
                tasks: [
                  {
                    intent: 'schedule.get_own',
                    entities: { period: date },
                    confidence: 0.99,
                  },
                ],
              },
              employee.role,
              ['staff.schedule.own.read'],
            ),
            toolCall: { name: 'staff.schedule.own.read', arguments: { date } },
          }),
        );
        mocks.runtime.execute.mockResolvedValueOnce({
          status: 'completed',
          execution_id: `own-read-${date}`,
          result: {
            available: true,
            verified: true,
            source: 'external_crm',
            date,
            is_working: isWorking,
            slots: isWorking ? [{ from: '09:00', to: '18:00' }] : [],
          },
        });
      }
      const first = await mocks.service.chat(employee, { ...dto, messages });
      const next = await mocks.service.chat(employee, {
        ...dto,
        requestId: 'followup_12345678',
        messages: [
          ...messages,
          { role: 'assistant', content: first.reply },
          { role: 'user', content: 'А послезавтра?' },
        ],
      });
      expect(first.reply).toContain('07.10.2026: 09:00–18:00');
      expect(next.reply).toContain('08.10.2026 у вас выходной');
      expect(next.reply).not.toContain('09:00');
      expect(next.grounding).toMatchObject({
        status: 'verified',
        domain: 'staff_schedule',
        evidence_tools: ['staff.schedule.own.read'],
      });
      expect(
        mocks.runtime.execute.mock.calls.map(([, name, input]) => [
          name,
          input.arguments,
        ]),
      ).toEqual([
        ['staff.schedule.own.read', { date: '2026-10-07' }],
        ['staff.schedule.own.read', { date: '2026-10-08' }],
      ]);
      expect(mocks.model.decide).toHaveBeenCalledTimes(2);
      expect(next.action).toBeNull();
    });
  });

  it('uses employee analytics rather than business totals for staff', async () => {
    const employee: AuthenticatedUser = {
      ...user,
      userId: 'employee-user',
      role: UserRole.EMPLOYEE,
    };
    const mocks = createService(['analytics.employee.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.employee.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(
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
    // появиться среди фактически вызванных инструментов.
    const modelInput = mocks.model.decide.mock.calls[1]?.[0];
    expect(modelInput?.toolResults?.[0]?.name).toBe('analytics.employee.query');
    expect(result).toMatchObject({
      reply: 'Ваша выручка: 99 400 ₽.',
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'employee_query',
      },
    });
    expect(mocks.runtime.execute.mock.calls.map((call) => call[1])).toEqual([
      'analytics.employee.query',
    ]);
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('loads verified CRM context for an open-ended owner business question', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
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
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
    );
  });

  it('lets the native model explain a weakest-service query from verified data', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
    );
    expect(mocks.model.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'native',
        toolResults: [
          expect.objectContaining({ name: 'analytics.business.query' }),
        ],
      }),
    );
    expect(result).toMatchObject({
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'business_query',
        evidence_tools: ['analytics.business.query'],
      },
    });
    expect(result.reply.toLocaleLowerCase('ru-RU')).toContain(
      'мужская стрижка',
    );
    expect(result.reply).toContain('возврат клиентов');
  });

  it('answers from verified business data when the model is temporarily unavailable', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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

  it('keeps a weak-spots follow-up comprehensive when the model is unavailable', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-business-full-review',
      result: {
        verified: true,
        source: 'crm',
        comparison: { mode: 'previous_period' },
        resolved_period: { label_ru: 'этот месяц по сегодня' },
        metrics: {
          revenue_amount_kopecks: 38_375_000,
          appointments_total: 202,
          unique_clients: 170,
          average_ticket_amount_kopecks: 149_300,
          repeat_clients_in_period: 146,
          repeat_client_rate_percent: 85.88,
          appointments_cancelled: 8,
          cancellation_rate_percent: 3.96,
          booked_minutes: 11_400,
        },
        changes: {
          revenue_amount_kopecks: { percent_change: 2.5 },
          appointments_total: { percent_change: -6 },
          unique_clients: { percent_change: -10 },
          average_ticket_amount_kopecks: { percent_change: 3 },
          booked_minutes: { percent_change: -8 },
        },
        current: {
          revenue: [{ currency: 'RUB', amount_kopecks: 38_375_000 }],
        },
        service_changes: [
          {
            name: 'Моделирование бороды',
            current_appointments: 12,
            previous_appointments: 16,
            delta: -4,
            percent_change: -25,
          },
        ],
      },
    });
    mocks.model.decide.mockResolvedValue(null);

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [
        {
          role: 'user',
          content: 'На что стоит обратить внимание? Где у нас слабые места',
        },
        { role: 'assistant', content: 'Дала короткую сводку.' },
        { role: 'user', content: 'Ты по максимуму должна срез дать' },
      ],
    });

    expect(mocks.runtime.execute.mock.calls[0]?.[2].arguments).toMatchObject({
      period: 'month_to_date',
      comparison: 'previous_period',
    });
    expect(result.source).toBe('safe_fallback');
    expect(result.reply).toContain('Полный срез');
    expect(result.reply).toContain('Слабые места');
    expect(result.reply).toContain('−10%');
    expect(result.reply).toContain('Моделирование бороды');
    expect(result.reply).not.toContain('Первое действие');
    expect(result.reply).not.toContain('аренд');
    expect(mocks.model.decide).toHaveBeenCalled();
  });

  it('answers a compound year comparison without bypassing canonical opportunities', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
    );
    expect(result).toMatchObject({
      source: 'safe_fallback',
      grounding: { status: 'verified', domain: 'business_query' },
    });
    expect(result.reply).toContain('80');
    expect(result.reply).toContain('100');
    expect(result.reply).not.toContain('Первое действие');
    expect(result.reply).not.toContain('уснувших клиентов');
    expect(mocks.model.decide).toHaveBeenCalled();
  });

  it('does not invent an action when an owner asks what to do about a revenue decline', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
    expect(result.reply).not.toContain('Первое действие');
    expect(result.reply).not.toContain('уснувших клиентов');
    expect(mocks.model.decide).toHaveBeenCalled();
  });

  it('explains the strongest verified factor when an owner asks why business declined', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
    expect(mocks.model.decide).toHaveBeenCalled();
  });

  it('distinguishes a CRM outage from a Maya reasoning failure', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('uses only the current employee query to give a master performance advice', async () => {
    const employee: AuthenticatedUser = {
      ...user,
      userId: 'employee-user',
      role: UserRole.EMPLOYEE,
    };
    const mocks = createService(['analytics.employee.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.employee.query', arguments: {} },
      }),
    );
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
      expect.objectContaining({ widgetTrigger: 'T-2a' }),
    );
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'employee_query',
      evidence_tools: ['analytics.employee.query'],
    });
    // Модель получает только личный срез сотрудника и не может запросить
    // командную финансовую аналитику вне серверных прав.
    expect(mocks.model.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        principalRole: UserRole.EMPLOYEE,
        toolResults: [
          expect.objectContaining({ name: 'analytics.employee.query' }),
        ],
      }),
    );
    expect(mocks.runtime.execute.mock.calls.map((call) => call[1])).toEqual([
      'analytics.employee.query',
    ]);
    expect(result.source).toBe('deepseek');
    expect(result.reply).toContain('поднимать через подходящие уходы');
  });

  it('refuses to label operating data as gross profit', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.query',
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
      domain: 'business_query',
    });
    const second = mocks.model.decide.mock.calls[1]?.[0];
    expect(second?.toolResults?.[0]?.name).toBe('analytics.business.query');
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  it('returns only the verified CRM payroll aggregate for salary questions', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.query',
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
      domain: 'business_query',
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

  it('returns verified payroll by master when the model is unavailable', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(null);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-payroll-by-master',
      result: {
        verified: true,
        source: 'crm',
        resolved_period: { label_ru: 'сегодня, 10 августа' },
        metrics: { revenue_amount_kopecks: 5_580_000 },
        changes: {},
        current: {
          staff_summary: [
            {
              name: 'Илья',
              appointments: 9,
              salary: {
                status: 'available',
                accrued: {
                  currency: 'RUB',
                  amount_kopecks: 905_000,
                  amount_major_units: 9_050,
                },
              },
            },
            {
              name: 'Стас',
              appointments: 7,
              salary: {
                status: 'available',
                accrued: {
                  currency: 'RUB',
                  amount_kopecks: 725_000,
                  amount_major_units: 7_250,
                },
              },
            },
          ],
        },
        service_changes: [],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        {
          role: 'user',
          content: 'Скажи сколько каждый из мастеров заработал',
        },
      ],
    });

    expect(result.source).toBe('safe_fallback');
    expect(result.reply).toContain('Илья — 9 050 ₽');
    expect(result.reply).toContain('Стас — 7 250 ₽');
    expect(result.reply).toContain('начисленная зарплата');
    expect(result.reply).not.toContain('55 800');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_query',
    });
  });

  it('never substitutes payroll for money brought in by each master', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(null);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-staff-contribution',
      result: {
        verified: true,
        source: 'crm',
        resolved_period: { label_ru: 'сегодня, 10 августа' },
        metrics: { revenue_amount_kopecks: 5_580_000 },
        changes: {},
        current: {
          staff_summary: [
            {
              name: 'Илья',
              appointments: 9,
              confirmed_revenue: { status: 'unavailable', amount: null },
              salary: {
                status: 'available',
                accrued: {
                  currency: 'RUB',
                  amount_kopecks: 905_000,
                  amount_major_units: 9_050,
                },
              },
            },
            {
              name: 'Стас',
              appointments: 7,
              confirmed_revenue: { status: 'unavailable', amount: null },
              salary: {
                status: 'available',
                accrued: {
                  currency: 'RUB',
                  amount_kopecks: 725_000,
                  amount_major_units: 7_250,
                },
              },
            },
          ],
        },
        service_changes: [],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Давай скажи кто сколько принес' }],
    });

    expect(result.source).toBe('safe_fallback');
    expect(result.reply).toContain(
      'Подтверждённую кассовую выручку по каждому мастеру',
    );
    expect(result.reply).toContain('Илья — 9 записей');
    expect(result.reply).toContain('Стас — 7 записей');
    expect(result.reply).not.toContain('9 050');
    expect(result.reply).not.toContain('7 250');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_query',
    });
  });

  it('does not turn unavailable CRM revenue into zero', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.query',
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

  it('answers exact appointment statuses without asking the model to recalculate', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-appointment-count',
      result: {
        verified: true,
        source: 'crm',
        resolved_period: { label_ru: 'сегодня' },
        comparison: { mode: 'none' },
        changes: {},
        metrics: {
          appointments_total: 21,
          appointments_active: 18,
          appointments_scheduled: 7,
          appointments_completed: 9,
          appointments_cancelled: 3,
          appointments_no_show: 2,
        },
        current: { daily: [] },
        service_changes: [],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Сколько всего записей у бизнеса сегодня?' },
      ],
    });

    expect(result.reply).toContain('Всего записей: 21');
    expect(result.reply).toContain('завершённых 9');
    expect(result.reply).toContain('ожидают визита 7');
    expect(result.reply).toContain('отменённых 3');
    // 🔴 Cycle 04 P5. Статусная корзина провайдера называется своим именем:
    // «не пришёл» — это состояние ЗАПИСИ, а неявка как наблюдение приходит из
    // канонического присутствия и отвечает на другой вопрос.
    expect(result.reply).toContain('со статусом «не пришёл» 2');
    expect(result.reply).not.toMatch(/неявок 2/);
    expect(result.source).toBe('safe_fallback');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_query',
    });
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  it('answers a daily breakdown from exact CRM status buckets', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-daily-breakdown',
      result: {
        verified: true,
        source: 'crm',
        resolved_period: { label_ru: 'этот месяц' },
        comparison: { mode: 'none' },
        changes: {},
        metrics: {
          appointments_total: 18,
          appointments_active: 15,
          appointments_scheduled: 6,
          appointments_completed: 7,
          appointments_cancelled: 3,
          appointments_no_show: 2,
        },
        current: {
          daily: [
            {
              date: '2026-08-11',
              appointments: 8,
              total: 10,
              active: 8,
              scheduled: 2,
              completed: 5,
              cancelled: 2,
              no_show: 1,
              revenue: [],
            },
            {
              date: '2026-08-12',
              appointments: 7,
              total: 8,
              active: 7,
              scheduled: 4,
              completed: 2,
              cancelled: 1,
              no_show: 1,
              revenue: [],
            },
          ],
        },
        service_changes: [],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [
        { role: 'user', content: 'Покажи сводку по дням за этот месяц' },
      ],
    });

    expect(result.reply).toContain('11.08: всего 10');
    expect(result.reply).toContain('завершено 5');
    expect(result.reply).toContain('12.08: всего 8');
    expect(result.reply).toContain('ожидают 4');
    expect(result.source).toBe('safe_fallback');
    expect(mocks.model.decide).toHaveBeenCalledTimes(1);
  });

  /**
   * 🔴 Год к году отвечает та же универсальная аналитика.
   *
   * Отдельный `analytics.business.compare_years` убран: он отдавал ровно три
   * числа — выручку, число операций и клиентов, — и по ним нельзя было ни
   * объяснить причину, ни назвать мастера. Сервер сам ставит окно
   * `year_to_date` и режим сравнения `previous_year_same_period`.
   */
  it('answers a year-over-year question from the universal business query', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(
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
        freshness: {
          status: 'stale',
          snapshot_at: '2026-08-06T12:00:00.000Z',
          reason: 'ai_tool_timeout_unknown',
        },
        comparison: { mode: 'previous_year_same_period' },
        metrics: { revenue_amount_kopecks: 15_000_000 },
        changes: {
          revenue_amount_kopecks: {
            current: 15_000_000,
            previous: 10_000_000,
            delta: 5_000_000,
            percent_change: 50,
          },
        },
        current: {},
        service_changes: [],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      messages: [{ role: 'user', content: 'Сравни этот год с предыдущим' }],
    });

    // Оба параметра окна ставит сервер, а не модель.
    expect(mocks.runtime.execute.mock.calls[0]?.[2].arguments).toMatchObject({
      period: 'year_to_date',
      comparison: 'previous_year_same_period',
    });
    expect(result).toMatchObject({
      source: 'deepseek',
      grounding: {
        status: 'verified',
        domain: 'business_query',
        evidence_tools: ['analytics.business.query'],
      },
    });
    // Устаревший снимок нельзя выдавать за свежие данные. Признак протухания
    // доезжает до модели вместе с цифрами, и она обязана назвать его вслух.
    const modelInput = mocks.model.decide.mock.calls[1]?.[0];
    expect(modelInput?.toolResults?.[0]?.name).toBe('analytics.business.query');
    expect(
      (
        modelInput?.toolResults?.[0]?.result as
          { freshness?: { status?: string } } | undefined
      )?.freshness?.status,
    ).toBe('stale');
    expect(result.reply).toContain('последний подтверждённый снимок');
    expect(result.reply).toContain('06.08.2026');
    expect(result.reply).toContain('данные не обнулены');
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
  });

  /**
   * 🔴 Деньги в общей сводке идут со сравнением.
   *
   * Пока год к году считал отдельный инструмент, его шаблон называл сумму
   * прошлого года сам. Инструмент убран — и без этой строки ответ на «сравни
   * этот год с прошлым» терял ровно то число, ради которого вопрос задавали.
   */
  it('names last year revenue in the deterministic year-over-year summary', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    // Провайдер молчит: текст собирает сервер, и проверяется именно он.
    mocks.model.decide.mockResolvedValue(null);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-year-money',
      result: {
        verified: true,
        comparison: { mode: 'previous_year_same_period' },
        metrics: { revenue_amount_kopecks: 120_000_000 },
        changes: {
          revenue_amount_kopecks: {
            current: 120_000_000,
            previous: 100_000_000,
            delta: 20_000_000,
            percent_change: 20,
          },
        },
        current: {
          revenue: [{ currency: 'RUB', amount_kopecks: 120_000_000 }],
        },
        service_changes: [],
      },
    });

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'native',
      messages: [{ role: 'user', content: 'Сравни этот год с прошлым' }],
    });

    expect(result.source).toBe('safe_fallback');
    expect(result.reply).toContain('1 200 000 ₽ против 1 000 000 ₽');
    expect(result.reply).toContain('аналогичным периодом прошлого года');
    expect(result.grounding).toMatchObject({
      status: 'verified',
      domain: 'business_query',
    });
  });

  it('keeps a customer-count follow-up inside the same year-over-year window', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(
      decision({
        reply: 'Уникальных клиентов 80 против 100 годом ранее: −20 (−20%).',
        toolCall: null,
      }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-customer-year-comparison',
      result: {
        verified: true,
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

    // 🔴 Короткое «а по клиентам?» обязано остаться в ТОМ ЖЕ окне: сменить
    // период молча — значит сравнить несравнимое.
    expect(mocks.runtime.execute.mock.calls[0]?.[2].arguments).toMatchObject({
      period: 'year_to_date',
      comparison: 'previous_year_same_period',
    });
    expect(result).toMatchObject({
      grounding: {
        status: 'verified',
        domain: 'business_query',
        evidence_tools: ['analytics.business.query'],
      },
    });
  });

  it('recognizes a direct customer decline comparison with the previous year', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Клиентов 80 против 100.', toolCall: null }),
    );
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'execution-direct-customer-year-comparison',
      result: {
        verified: true,
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

    expect(mocks.runtime.execute.mock.calls[0]?.[2].arguments).toMatchObject({
      period: 'year_to_date',
      comparison: 'previous_year_same_period',
    });
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
        // Приветствие нарочно: на нём сервер ничего не предзагружает, и
        // единственным обращением к инструменту остаётся выдумка модели.
        messages: [{ role: 'user', content: 'Привет' }],
      }),
    ).rejects.toMatchObject<ServiceUnavailableException>({ status: 503 });
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
    // Мягкая запись: мы внутри catch, и падение аудита подменило бы исходное
    // исключение. Сам факт записи по-прежнему обязателен.
    expect(mocks.auditLog.tryLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai.core_turn_failed' }),
    );
  });

  it('asks the model to rewrite an unsourced number and ships the corrected answer', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
      messages: [
        { role: 'user', content: 'Что сейчас требует моего внимания?' },
      ],
    });

    // Раньше одно неподтверждённое число молча стирало весь ответ. Теперь
    // модели называют виновную цифру и дают переписать — так живой текст
    // сохраняется, а выдуманная сумма всё равно не доходит до владельца.
    expect(mocks.model.decide).toHaveBeenCalledTimes(3);
    const second = mocks.model.decide.mock.calls[2]?.[0];
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

  it.each([false, true])(
    'treats conversation as context, with explicit user scenario=%s, not assistant numeric evidence',
    async (explicitUserScenario) => {
      const mocks = createService(['analytics.business.query']);
      // Explicit planner choice: no data source may run before this decision.
      mocks.model.decide.mockResolvedValueOnce(
        decision({
          reply: null,
          toolCall: { name: 'analytics.business.query', arguments: {} },
        }),
      );
      mocks.runtime.execute.mockResolvedValue({
        status: 'completed',
        execution_id: 'execution-history-grounding',
        result: {
          verified: true,
          source: 'crm',
          comparison: { mode: 'none' },
          metrics: { revenue_amount_kopecks: 7_000_000 },
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
      const earlierAssistant = 'Ранее выручка составила 999999 ₽.';
      mocks.model.decide
        .mockResolvedValueOnce(
          decision({
            reply: explicitUserScenario
              ? 'Ваш план — 999999 ₽. Поступления по CRM — 70 000 ₽.'
              : 'Выручка — 999999 ₽.',
            toolCall: null,
          }),
        )
        .mockResolvedValueOnce(
          decision({
            reply: 'Поступления по CRM — 70 000 ₽.',
            toolCall: null,
          }),
        );
      const result = await mocks.service.chat(user, {
        ...dto,
        messages: [
          {
            role: 'user',
            content: explicitUserScenario
              ? 'Если мой план 999999 ₽, что проверить?'
              : 'Покажи выручку.',
          },
          { role: 'assistant', content: earlierAssistant },
          { role: 'user', content: 'Что сейчас требует моего внимания?' },
        ],
      });
      // User preferences remain context; unclassified assistant prose cannot
      // become external model context or a substitute for current source facts.
      expect(mocks.model.decide.mock.calls[1]?.[0].messages).not.toContainEqual(
        {
          role: 'assistant',
          content: earlierAssistant,
        },
      );
      expect(mocks.model.decide).toHaveBeenCalledTimes(
        explicitUserScenario ? 2 : 3,
      );
      if (explicitUserScenario) {
        expect(result.reply).toContain('Ваш план — 999999 ₽');
      } else {
        expect(
          mocks.model.decide.mock.calls[2]?.[0].corrections?.[0],
        ).toContain('999999');
        expect(result.reply).not.toContain('999999');
      }
      expect(result.reply).toContain('70 000 ₽');
    },
  );

  it('falls back to the deterministic text when the model repeats an unsourced number', async () => {
    const mocks = createService(['analytics.business.query']);
    mocks.model.decide
      .mockResolvedValueOnce(
        decision({
          reply: 'Проверяю.',
          toolCall: {
            name: 'analytics.business.query',
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
      domain: 'business_query',
    });
  });

  it('lets the model say a decline in words while the server keeps the minus sign', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
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
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      reply:
        'Поступления снизились на 9,2% к прошлому году. Это подтверждённая динамика CRM.',
      source: 'deepseek',
      grounding: { status: 'verified', domain: 'business_query' },
    });
  });

  it('does not mistake decline wording next to an absolute figure for an error', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
      messages: [{ role: 'user', content: 'Че у нас за просадки' }],
    });

    // 🔴 Из-за этого «что у нас за просадки» и отвечалось шаблоном: сторож
    // видел слово «просел» рядом с числом 1436.17 и объявлял его ошибкой
    // направления. Но абсолютная величина направления не несёт — падает не
    // число, а показатель. Проверка направления имеет смысл только для дельт.
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('deepseek');
    expect(result.reply).toContain('1 436,17 ₽');
    expect(result.reply).toContain('141 против 171');
  });

  it('catches a decline described as growth even though the figure itself is real', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
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
    const correction = mocks.model.decide.mock.calls[2]?.[0]?.corrections?.[0];
    expect(correction).toContain('снижение, а не рост');
    expect(result.reply).toContain('снизились на 9,2%');
    expect(result.reply).not.toContain('выросли');
    expect(result.source).toBe('deepseek');
  });

  it('lets the model name a money change in roubles when the server counted it in kopecks', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
      messages: [{ role: 'user', content: 'Почему просела выручка?' }],
    });

    // 🔴 Из-за этого разбор просадки и сваливался в шаблон: сервер держит
    // дельту в копейках (−1 000 000), человек говорит «10 000 ₽», и сторож
    // считал верную сумму выдумкой. Та же величина в правильной единице —
    // не выдумка; переписывать ответ незачем.
    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(result.reply).toContain('10 000 ₽');
    expect(result.source).toBe('deepseek');
  });

  it('still rejects a money figure that is not in the data at any scale', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
      messages: [{ role: 'user', content: 'Почему просела выручка?' }],
    });

    // Послабление касается только единиц измерения. Округление «примерно»
    // остаётся выдумкой и по-прежнему отправляется на переписывание.
    expect(mocks.model.decide.mock.calls[2]?.[0]?.corrections?.[0]).toContain(
      '12345',
    );
    expect(result.reply).toContain('10 000 ₽');
  });

  it('does not treat an hour inside a timestamp as a confirmed metric', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
      messages: [{ role: 'user', content: 'Что с записями за неделю?' }],
    });

    // 🔴 Разбирая строки дат на числа, сторож считал бы подтверждёнными часы,
    // минуты и дни месяца — и пропустил бы любой процент от 0 до 59. Из таких
    // строк берём только год.
    expect(mocks.model.decide.mock.calls[2]?.[0]?.corrections?.[0]).toContain(
      '21',
    );
    expect(result.reply).toBe('Записей за период: 40.');
  });

  it('lets a per-master service drop through the number guard by name', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
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
      surface: 'web',
      messages: [
        {
          role: 'user',
          content: 'Кто из мастеров просел по сравнению с прошлым месяцем?',
        },
      ],
    });

    // Model sees request-local mentions; presentation resolves labels on the server.
    const modelInput = JSON.stringify(mocks.model.decide.mock.calls[1]?.[0]);
    expect(modelInput).not.toContain('Илья');
    expect(modelInput).toContain('[name removed]@');
    expect(modelInput).toContain('Борода');
    // Разбор доходит до пользователя дословно: ни сторож чисел, ни подстановка
    // имён его больше не трогают.
    expect(result.reply).toBe(
      'У Ильи просела «Борода»: 19 записей против 31, это −12.',
    );
    expect(result.source).not.toBe('safe_fallback');
    expect(result.grounding).toMatchObject({ status: 'verified' });
  });

  it('projects actual serialized model requests through read, correction and server label presentation', async () => {
    const mocks = createService(['analytics.business.query']);
    const provider = new AiCoreModelService(
      new ConfigService({
        AI_CORE_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'offline-placeholder',
        DEEPSEEK_BASE_URL: 'https://model.example.invalid',
      }),
    );
    mocks.model.decide.mockImplementation((input) => provider.decide(input));
    mocks.memory.listForModel.mockResolvedValue([
      'Мастер Илья предпочитает утро',
    ]);
    mocks.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'private-execution-id',
      result: {
        verified: true,
        metrics: { appointments_total: 40 },
        changes: {},
        staff_scope: { name: 'Рустам Ахметов', title: 'Мастер' },
        current: {
          staff_summary: [
            {
              id: 'private-staff-id',
              name: 'Рустам Ахметов',
              appointments: 40,
            },
          ],
        },
      },
    });
    const bodies: string[] = [];
    const transport = jest
      .spyOn(global, 'fetch')
      .mockImplementation((_url, init) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected serialized body');
        const body = init.body;
        bodies.push(body);
        const envelope = JSON.parse(body) as {
          messages: { content: string }[];
        };
        const input = JSON.parse(envelope.messages.at(-1)!.content) as {
          tool_results: {
            result: { current: { staff_summary: { name: string }[] } };
          }[];
        };
        let content: string;
        if (bodies.length === 1) {
          content = JSON.stringify({
            semantic_plan: {
              parent_request: 'Анализ записей',
              language: 'ru',
              dialogue_act: 'request',
              tasks: [
                {
                  id: 't1',
                  intent: 'analytics.business_summary',
                  entities: {},
                  confidence: 0.99,
                },
              ],
            },
            tool_call: {
              name: 'analytics.business.query',
              arguments_json: '{}',
            },
          });
        } else {
          const alias =
            input.tool_results[0].result.current.staff_summary[0].name;
          content =
            bodies.length === 2
              ? `${alias}: 999 записей.`
              : `${alias}: 40 записей.`;
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ finish_reason: 'stop', message: { content } }],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            }),
            { status: 200 },
          ),
        );
      });
    try {
      const result = await mocks.service.chat(user, {
        ...dto,
        messages: [
          {
            role: 'user',
            content: 'Кто из мастеров просел по сравнению с прошлым месяцем?',
          },
        ],
      });
      expect(bodies.length).toBe(3);
      expect(bodies[2]).toContain('grounding_corrections');
      for (const body of bodies) {
        const data = JSON.stringify(
          (
            JSON.parse(body) as { messages: { role: string }[] }
          ).messages.filter((m) => m.role !== 'system'),
        );
        expect(
          /Илья|Ильи|Рустам|Ахметов|private-staff-id|private-execution-id/.test(
            data,
          ),
        ).toBe(false);
      }
      expect(bodies[1]).toContain('[name removed]@');
      expect(bodies[1]).toContain('[reference removed]@');
      expect(result.reply).toBe('Рустам Ахметов: 40 записей.');
      expect(result.grounding.status).toBe('verified');
    } finally {
      transport.mockRestore();
    }
  });

  it('keeps nonnumeric catalog service IDs out of serialized resumed semantic context', async () => {
    const { service } = createService();
    const provider = new AiCoreModelService(
      new ConfigService({
        AI_CORE_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'offline-placeholder',
        DEEPSEEK_BASE_URL: 'https://model.example.invalid',
      }),
    );
    const first = service['sanitizeMessages']([
      { role: 'user', content: 'Хочу эту услугу' },
    ]);
    const catalog = first.project(
      [
        {
          name: 'catalog.services.read',
          result: {
            services: [{ id: 'svc-standard-private', name: 'Борода' }],
          },
        },
      ],
      true,
    );
    const alias = catalog[0].result.services[0].id;
    const bodies: string[] = [];
    const transport = jest
      .spyOn(global, 'fetch')
      .mockImplementation((_url, init) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected serialized body');
        bodies.push(init.body);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content: JSON.stringify({
                      semantic_plan: {
                        parent_request: 'Выбрать время',
                        language: 'ru',
                        dialogue_act: 'request',
                        tasks: [
                          {
                            id: 't1',
                            intent: 'booking.find_availability',
                            confidence: 0.99,
                            entities: {
                              services: [
                                bodies.length === 1 ? alias : 'Борода',
                              ],
                            },
                          },
                        ],
                      },
                      tool_call: null,
                    }),
                  },
                },
              ],
            }),
            { status: 200 },
          ),
        );
      });
    const input: AiCoreModelInput = {
      surface: 'web',
      persona: 'admin',
      principalRole: UserRole.CLIENT,
      messages: first.messages,
      tools: [
        {
          name: 'booking.availability.read',
          description: 'Read availability',
          input_schema: { type: 'object' },
          risk_tier: 'read',
          approval_policy: 'none',
        },
      ],
      toolResults: catalog,
      allowToolCall: true,
      requiredToolNames: [],
    };
    try {
      const selected = await provider.decide(input);
      const retained = first.resolveReferences(selected!.semanticPlan!, true);
      expect(retained.tasks[0].entities.services).toEqual(['Борода']);
      expect(first.resolveReferences({ service_ids: [alias] })).toEqual({
        service_ids: ['svc-standard-private'],
      });
      const resumed = service['sanitizeMessages']([
        { role: 'user', content: 'А завтра?' },
      ]);
      await provider.decide({
        ...input,
        messages: resumed.messages,
        toolResults: [],
        conversationPlan: resumed.project(retained),
      });
      expect(bodies.length).toBe(2);
      for (const body of bodies)
        expect(body.includes('svc-standard-private')).toBe(false);
      expect(bodies[1]).toContain('Борода');
      expect(bodies[1]).not.toContain(alias);
    } finally {
      transport.mockRestore();
    }
  });

  it('lets a salon-wide sentence without any master name through untouched', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue(perMasterExecution());
    // Общие показатели салона названы без имени рядом — придираться не к чему.
    // Ложные тревоги тут дороже пропусков: прошлая проверка направления
    // браковала верные ответы пачками.
    const reply =
      'За период 40 записей и 104 500 ₽ выручки, 33 уникальных клиента. Записи просели на 12 (−23,1%).';
    mocks.model.decide.mockResolvedValue(decision({ reply, toolCall: null }));

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'web',
      messages: [{ role: 'user', content: 'Что у нас по записям за месяц?' }],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(result.reply).toBe(reply);
    expect(result.source).not.toBe('safe_fallback');
    expect(result.grounding).toMatchObject({ status: 'verified' });
  });

  it('keeps a full three-part answer with per-master detail intact', async () => {
    const mocks = createService(['analytics.business.query']);
    // Explicit planner choice: no data source may run before this decision.
    mocks.model.decide.mockResolvedValueOnce(
      decision({
        reply: null,
        toolCall: { name: 'analytics.business.query', arguments: {} },
      }),
    );
    mocks.runtime.execute.mockResolvedValue(perMasterExecution());
    // Живой ответ директора: имена, их числа, салонный итог отдельной фразой и
    // рекомендация. Каждое число стоит у своего владельца — придираться не к
    // чему, и ни одной пометки быть не должно.
    const reply =
      'У Ильи «Борода» просела: 19 записей против 31, это −12 (−38,7%). У Стаса ровно — 21 запись, как и было. По салону 40 записей и 104 500 ₽, 33 уникальных клиента. Первым делом верните бородачей: обзвон тех, кто был в прошлом месяце.';
    mocks.model.decide.mockResolvedValue(decision({ reply, toolCall: null }));

    const result = await mocks.service.chat(user, {
      ...dto,
      surface: 'web',
      messages: [
        { role: 'user', content: 'Почему просели записи в этом месяце?' },
      ],
    });

    expect(mocks.model.decide).toHaveBeenCalledTimes(2);
    expect(result.reply).toBe(reply);
    expect(result.source).not.toBe('safe_fallback');
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

  it('trims a long conversation instead of refusing to answer it', async () => {
    const mocks = createService();
    mocks.model.decide.mockResolvedValue(
      decision({ reply: 'Отвечаю по последнему вопросу.', toolCall: null }),
    );
    // 🔴 Ровно тот разговор, который положил чат в проде: 12 реплик по 2000
    // знаков кириллицей — это ~48 КБ при пороге 16. Раньше сюда прилетал отказ
    // 400 ДО обработчика: владелец видел молчание, в логах пусто, в аудите ни
    // строки. Содержательный разговор — не ошибка ввода.
    const long = 'а'.repeat(2_000);
    const messages = [
      ...Array.from({ length: 11 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: long,
      })),
      // Последняя реплика — пользовательская и намеренно не про данные:
      // проверяем обрезку разговора, а не работу аналитики.
      { role: 'user' as const, content: 'Привет!' },
    ];

    const result = await mocks.service.chat(user, { ...dto, messages });

    expect(result.reply).toBe('Отвечаю по последнему вопросу.');
    const sent = mocks.model.decide.mock.calls[0]?.[0]?.messages ?? [];
    // Старое отрезано, последний вопрос на месте — отвечаем именно на него.
    expect(sent.length).toBeLessThan(12);
    expect(sent.at(-1)?.content).toBe('Привет!');
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
   * Салон с двумя мастерами и двумя услугами: просадка только у Ильи.
   *
   * Разрез по мастерам и услугам нужен, чтобы сторож чисел проверялся на живом
   * ответе директора, а не на одной строке итога.
   */
  function perMasterExecution() {
    return {
      status: 'completed',
      execution_id: 'execution-per-master',
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
    value: Pick<AiCoreModelDecision, 'reply' | 'toolCall'> &
      Partial<Pick<AiCoreModelDecision, 'semanticPlan'>>,
  ): AiCoreModelDecision {
    return {
      ...value,
      provider: 'deepseek',
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }

  function createService(
    toolNames = ['analytics.business.query', 'loyalty.internal.adjust'],
    env: Record<string, string> = {},
    businessTimezone?: string,
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
    const auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
      tryLog: jest.fn().mockResolvedValue(undefined),
    };
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
    const scheduleDateOwner = new StaffScheduleCommandService(
      config as unknown as ConfigService,
      {} as never,
      {} as never,
      runtime as unknown as AiToolRuntimeService,
    );
    const staffScheduleCommand = {
      resolveReadDate:
        scheduleDateOwner.resolveReadDate.bind(scheduleDateOwner),
      tryHandle: jest
        .fn<StaffScheduleCommandService['tryHandle']>()
        .mockResolvedValue(null),
    };
    const memory = {
      handleExplicitCommand: jest.fn().mockResolvedValue(null),
      listForModel: jest.fn().mockResolvedValue([]),
    };
    // Роутер настоящий: он чистый, детерминированный и без конфигурации.
    // Подменять его макетом значило бы проверять маршрутизацию, которой нет.
    const brain = new MayaBrainRouterService();
    const tenantRead = jest
      .fn()
      .mockResolvedValue({ defaultTimezone: businessTimezone });
    const service = new AiCoreService(
      config as unknown as ConfigService,
      tenantContext as unknown as TenantContextService,
      rateLimit as unknown as AuthRateLimitService,
      runtime as unknown as AiToolRuntimeService,
      model as unknown as AiCoreModelService,
      auditLog as unknown as AuditLogService,
      dashboardPreferences as unknown as DashboardPreferencesService,
      staffScheduleCommand as unknown as StaffScheduleCommandService,
      brain,
      {} as C9Orchestrator,
      memory as unknown as AiMemoryService,
      undefined,
      businessTimezone
        ? ({ tenant: { findUnique: tenantRead } } as never)
        : undefined,
    );
    return {
      auditLog,
      dashboardPreferences,
      model,
      rateLimit,
      runtime,
      service,
      staffScheduleCommand,
      tenantRead,
      brain,
      memory,
    };
  }
});
