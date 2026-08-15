import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from './conversation-intelligence.service';

describe('ConversationIntelligenceService', () => {
  const service = new ConversationIntelligenceService();

  it('publishes one complete versioned policy contract to the planner', () => {
    const contract = service.plannerContract(UserRole.TENANT_OWNER, [
      'analytics.business.query',
    ]);

    expect(contract.pipeline).toEqual([
      'intent',
      'entities',
      'context',
      'permission',
      'tool',
      'reasoning',
      'response',
    ]);
    expect(contract.policies).toMatchObject({
      version: 'maya-ci-policy/1',
      data_classes: {
        A: { tool_requirement: 'not_required' },
        E: { tool_requirement: 'confirmed_action' },
        F: { tool_requirement: 'forbidden' },
      },
      risk_levels: {
        low: { confirmation: 'not_required' },
        high: { confirmation: 'required_before_side_effect' },
      },
    });
    expect(contract.policies.routing.map((rule) => rule.id)).toContain(
      'permission_before_tool',
    );
    expect(contract.policies.privacy.map((rule) => rule.id)).toContain(
      'no_raw_pii_in_model_context',
    );
  });

  it('builds a role-aware contract without hiding forbidden meanings', () => {
    const contract = service.plannerContract(
      UserRole.CLIENT,
      ['catalog.services.read', 'appointments.own.create'],
      'Asia/Yekaterinburg',
    );

    expect(contract.version).toBe('maya-ci/1');
    expect(contract.language.locale).toBe('ru-RU');
    expect(contract.language.business_timezone).toBe('Asia/Yekaterinburg');
    expect(contract.language.temporal_rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonical: 'rolling_30_days' }),
        expect.objectContaining({ canonical: 'last_month' }),
      ]),
    );
    const servicePrice = contract.intents.find(
      (item) => item.intent === 'services.price',
    );
    expect(servicePrice).toMatchObject({
      allowed_for_role: true,
      ready_tools: ['catalog.services.read'],
    });
    expect(servicePrice?.language_hints).toContain('сколько стоит');
    expect(
      contract.intents.find((item) => item.intent === 'finance.revenue'),
    ).toMatchObject({
      allowed_for_role: false,
      ready_tools: [],
    });
  });

  it('keeps the runtime planner contract compact while retaining every intent', () => {
    const contract = service.plannerContract(UserRole.TENANT_OWNER, [
      'analytics.business.query',
      'catalog.services.read',
      'booking.availability.read',
    ]);
    const encoded = JSON.stringify(contract);

    // 87, а не 85: заведены интенты для operations.journal.read и
    // notifications.appointments.read — без них планировщик отклонял вызов
    // инструмента, который каталог и обработчик поддерживают.
    expect(contract.intents).toHaveLength(87);
    expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThan(60_000);
    expect(contract.intents[0]).not.toHaveProperty('permission');
    expect(contract.intents[0]).not.toHaveProperty('response_rule');
  });

  it('server-clamps a forbidden finance request instead of trusting the model', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Сколько салон заработал сегодня?',
        language: 'ru',
        dialogue_act: 'question',
        tasks: [
          {
            id: 'money',
            intent: 'finance.revenue',
            entities: { period: 'today' },
            confidence: 0.99,
          },
        ],
      },
      UserRole.CLIENT,
      ['analytics.business.query'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      domain: 'finance',
      intent: 'finance.revenue',
      data_class: 'F',
      permission: {
        required: 'analytics.business.finance.read',
        status: 'denied',
      },
      tool: { name: null, alternatives: [], status: 'not_available' },
    });
  });

  it('routes an understood reviews request through the configured registry', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Покажи последние плохие отзывы',
        tasks: [
          {
            intent: 'reviews.list_recent',
            entities: { rating: 'low' },
            confidence: 0.94,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query', 'reviews.list.read'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      intent: 'reviews.list_recent',
      capability: { readiness: 'ready' },
      permission: { status: 'allowed' },
      tool: {
        name: 'reviews.list.read',
        alternatives: ['reviews.list.read'],
        status: 'ready',
      },
    });
  });

  it('server-locks review analysis mode to the validated semantic intent', () => {
    const topicsPlan = service.validatePlan(
      {
        parent_request: 'На что жалуются клиенты?',
        tasks: [
          {
            intent: 'reviews.analyze_topics',
            entities: { period: 'last_30_days' },
            confidence: 0.97,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['reviews.analyze'],
    );
    const trendPlan = service.validatePlan(
      {
        parent_request: 'Рейтинг стал лучше или хуже?',
        tasks: [
          {
            intent: 'reviews.rating_trend',
            entities: { period: 'last_30_days' },
            confidence: 0.98,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['reviews.analyze'],
    );

    expect(
      service.assertToolCallMatchesPlan(
        {
          name: 'reviews.analyze',
          arguments: { mode: 'trend', days: 30 },
        },
        topicsPlan,
      ),
    ).toEqual({
      name: 'reviews.analyze',
      arguments: { mode: 'topics', days: 30 },
    });
    expect(
      service.assertToolCallMatchesPlan(
        {
          name: 'reviews.analyze',
          arguments: { mode: 'topics', days: 30 },
        },
        trendPlan,
      ),
    ).toEqual({
      name: 'reviews.analyze',
      arguments: { mode: 'trend', days: 30 },
    });
  });

  it('never routes a ready forecast through an undeclared nearby analytics tool', () => {
    const contract = service.plannerContract(UserRole.TENANT_OWNER, [
      'analytics.business.query',
    ]);
    expect(
      contract.intents.find(
        (item) => item.intent === 'finance.revenue_forecast',
      ),
    ).toMatchObject({
      readiness: 'ready',
      ready_tools: [],
    });

    const plan = service.validatePlan(
      {
        parent_request: 'Сколько будет выручки к концу месяца?',
        tasks: [
          {
            intent: 'finance.revenue_forecast',
            entities: { target_period: 'this_month' },
            confidence: 0.97,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      capability: { readiness: 'ready' },
      tool: { name: null, alternatives: [], status: 'not_available' },
      requires_clarification: false,
    });
    expect(() =>
      service.assertToolCallMatchesPlan(
        { name: 'analytics.business.query', arguments: {} },
        plan,
      ),
    ).toThrow('conversation_tool_plan_mismatch');
  });

  it('does not interrogate the actor for slots after permission was denied', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Покажи выручку',
        tasks: [
          {
            intent: 'finance.revenue',
            entities: {},
            requires_clarification: true,
            clarification_question: 'За какой период?',
          },
        ],
      },
      UserRole.CLIENT,
      ['analytics.business.query'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      permission: { status: 'denied' },
      requires_clarification: false,
      clarification_question: null,
    });
  });

  it('exposes exact boundaries for a ready aggregate churn capability', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Кого из постоянных клиентов мы сейчас теряем?',
        tasks: [
          {
            intent: 'clients.at_risk',
            entities: {},
            confidence: 0.95,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['clients.retention.scan'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      capability: { readiness: 'ready' },
      tool: {
        name: 'clients.retention.scan',
        alternatives: ['clients.retention.scan'],
        status: 'ready',
      },
    });
    expect(plan?.tasks[0]?.capability.note).toBeNull();
  });

  it('rejects a hallucinated intent instead of silently treating it as small talk', () => {
    expect(() =>
      service.validatePlan(
        {
          parent_request: 'Покажи секретную выручку клиента',
          tasks: [
            {
              intent: 'finance.read_everything_without_permission',
              entities: { period: 'today' },
              confidence: 0.99,
            },
          ],
        },
        UserRole.CLIENT,
        ['analytics.business.query'],
      ),
    ).toThrow('conversation_intent_unknown');
  });

  it('requires one clarification whenever a canonical required slot is missing', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Есть свободное окно?',
        tasks: [
          {
            intent: 'booking.find_availability',
            entities: {},
            confidence: 0.99,
            requires_clarification: false,
          },
        ],
      },
      UserRole.CLIENT,
      ['booking.availability.read'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      requires_clarification: true,
      tool: { status: 'ready' },
    });
    expect(plan?.tasks[0]?.clarification_question).toContain('date_or_period');
    expect(() =>
      service.assertToolCallMatchesPlan(
        { name: 'booking.availability.read', arguments: {} },
        plan,
      ),
    ).toThrow('conversation_tool_plan_mismatch');
  });

  it('keeps free-form LLM conversation outside the tool pipeline', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Помоги придумать спокойную акцию на будний день',
        tasks: [
          {
            intent: 'general.strategy_advice',
            entities: {},
            confidence: 0.96,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      data_class: 'A',
      tool: { name: null, alternatives: [], status: 'not_needed' },
      requires_confirmation: false,
    });
  });

  it('routes a novel team-schedule paraphrase to the verified YClients tool', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Кто из ребят завтра в строю?',
        tasks: [
          {
            intent: 'schedule.get_team',
            entities: { date_or_period: 'tomorrow' },
            confidence: 0.94,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['staff.schedule.read'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      intent: 'schedule.get_team',
      requires_clarification: false,
      tool: {
        name: 'staff.schedule.read',
        alternatives: ['staff.schedule.read'],
        status: 'ready',
      },
    });
    expect(
      service.assertToolCallMatchesPlan(
        {
          name: 'staff.schedule.read',
          arguments: { period: 'tomorrow' },
        },
        plan,
      ),
    ).toEqual({
      name: 'staff.schedule.read',
      arguments: { period: 'tomorrow' },
    });
  });

  it('asks one question instead of guessing when semantic confidence is low', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Кто там завтра на точке?',
        tasks: [
          {
            intent: 'schedule.get_team',
            entities: { date_or_period: 'tomorrow' },
            confidence: 0.51,
            requires_clarification: false,
            clarification_question:
              'Вы хотите узнать, кто из команды работает завтра?',
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['staff.schedule.read'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      confidence: 0.51,
      requires_clarification: true,
      clarification_question:
        'Вы хотите узнать, кто из команды работает завтра?',
    });
    expect(() =>
      service.assertToolCallMatchesPlan(
        {
          name: 'staff.schedule.read',
          arguments: { period: 'tomorrow' },
        },
        plan,
      ),
    ).toThrow('conversation_tool_plan_mismatch');
  });

  it('does not interrogate low-confidence free-form conversation', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Накидай идей на дождливый вторник',
        tasks: [
          {
            intent: 'general.strategy_advice',
            entities: {},
            confidence: 0.42,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query'],
    );

    expect(plan?.tasks[0]).toMatchObject({
      data_class: 'A',
      requires_clarification: false,
      tool: { status: 'not_needed' },
    });
  });

  it('keeps compound dependencies and requires clarification for unsafe gaps', () => {
    const plan = service.validatePlan(
      {
        parent_request:
          'Покажи окна Артёма завтра и запиши туда постоянного клиента',
        tasks: [
          {
            id: 'find',
            intent: 'booking.find_availability',
            entities: { employee: 'Артём', date_or_period: 'tomorrow' },
            confidence: 0.93,
          },
          {
            id: 'book',
            intent: 'booking.create_own',
            entities: { employee: 'Артём', date: 'tomorrow' },
            depends_on: ['find', 'unknown'],
            confidence: 0.75,
          },
        ],
        context: {
          carried_slots: ['employee'],
          replaced_slots: ['date'],
          unresolved_references: ['туда'],
        },
      },
      UserRole.CLIENT,
      ['booking.availability.read', 'appointments.own.create'],
    );

    expect(plan?.tasks).toHaveLength(2);
    expect(plan?.tasks[1]).toMatchObject({
      depends_on: ['find'],
      requires_clarification: true,
      requires_confirmation: true,
    });
    expect(plan?.tasks[1]?.clarification_question).toContain('services');
    expect(plan?.context).toEqual({
      carried_slots: ['employee'],
      replaced_slots: ['date'],
      unresolved_references: ['туда'],
    });
  });

  it('rejects a tool call that does not belong to the semantic plan', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Сколько стоит стрижка?',
        tasks: [
          {
            intent: 'services.price',
            entities: { service: 'стрижка' },
            confidence: 0.98,
          },
        ],
      },
      UserRole.CLIENT,
      ['catalog.services.read', 'analytics.business.query'],
    );

    expect(() =>
      service.assertToolCallMatchesPlan(
        { name: 'analytics.business.query', arguments: {} },
        plan,
      ),
    ).toThrow('conversation_tool_plan_mismatch');
    expect(
      service.assertToolCallMatchesPlan(
        { name: 'catalog.services.read', arguments: {} },
        plan,
      ),
    ).toEqual({ name: 'catalog.services.read', arguments: {} });
  });

  it('rejects every tool call that has no validated semantic plan', () => {
    expect(() =>
      service.assertToolCallMatchesPlan(
        { name: 'analytics.business.query', arguments: { period: 'today' } },
        null,
      ),
    ).toThrow('conversation_plan_missing_for_tool_call');
  });

  it('finds the next unsatisfied tool task in a compound plan', () => {
    const plan = service.validatePlan(
      {
        parent_request: 'Сравни выручку и скажи, кого вернуть',
        tasks: [
          {
            id: 'finance',
            intent: 'finance.compare_periods',
            entities: {
              period: 'this_week',
              comparison_period: 'last_week',
            },
            confidence: 0.96,
          },
          {
            id: 'retention',
            intent: 'clients.at_risk',
            entities: {},
            depends_on: ['finance'],
            confidence: 0.93,
          },
        ],
      },
      UserRole.TENANT_OWNER,
      ['analytics.business.query', 'clients.retention.scan'],
    );

    expect(service.hasPendingToolTasks(plan, [])).toBe(true);
    expect(
      service.hasPendingToolTasks(plan, ['analytics.business.query']),
    ).toBe(true);
    expect(
      service.hasPendingToolTasks(plan, [
        'analytics.business.query',
        'clients.retention.scan',
      ]),
    ).toBe(false);
  });
});
