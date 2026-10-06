import { AiCoreService } from './ai-core.service';
import { StaffScheduleCommandService } from './staff-schedule-command.service';
import { AI_SCHEDULE_WIDGET } from './ai-schedule-widget.port';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';
import { staffScheduleRevision } from '../crm/staff-schedule.utils';
import type { C9Orchestrator } from '../orchestration/c9.orchestrator';

// Real chat/router/schedule parser + scripted model and synthetic source/owner ports.
// No provider, HTTP, database, approval commit or real-model acceptance proof.
const actor: AuthenticatedUser = {
  userId: 'integration-owner',
  sessionId: 'session',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
  email: 'synthetic@example.test',
  branchId: 'branch-a',
  membershipId: 'membership-a',
  membershipStatus: 'active',
};
const modelDecision = (toolCall: unknown = null, reply = 'Здравствуйте.') => ({
  provider: 'safe',
  model: 'SCRIPTED_SYNTHETIC',
  reply,
  toolCall,
  semanticPlan: null,
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
});
function fixture() {
  let serial = 0;
  const config = {
    get: (key: string) => (key === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined),
  };
  const current = {
    staff_id: 'staff-a',
    date: '2035-05-10',
    is_working: true,
    slots: [{ from: '10:00', to: '20:00' }],
    revision: staffScheduleRevision('staff-a', '2035-05-10', [
      { from: '10:00', to: '20:00' },
    ]),
  };
  const crm = {
    getStaff: jest
      .fn()
      .mockResolvedValue([{ id: 'staff-a', name: 'Антон Тестовый' }]),
    getStaffScheduleDay: jest.fn().mockResolvedValue(current),
    previewStaffScheduleDayChange: jest.fn().mockResolvedValue({
      current,
      proposed: { ...current, slots: [], is_working: false },
      conflict_times: [],
    }),
  };
  const names = [
    'catalog.services.read',
    'catalog.service.price.update',
    'staff.schedule.update',
    'booking.availability.read',
  ];
  const runtime = {
    listTools: jest.fn().mockResolvedValue({
      tools: names.map((name) => ({
        name,
        risk_tier: name.endsWith('update') ? 'high_write' : 'read',
        approval_policy: name.endsWith('update') ? 'owner' : 'none',
        input_schema: {},
      })),
    }),
    execute: jest.fn((_actor: unknown, name: string) =>
      Promise.resolve(
        name === 'catalog.services.read'
          ? {
              status: 'completed',
              result: { services: [{ id: '42', name: 'Стрижка' }] },
            }
          : {
              status: 'approval_required',
              approval: {
                id:
                  name === 'staff.schedule.update'
                    ? 'schedule-approval'
                    : 'price-approval',
                payload_hash: 'f'.repeat(64),
                summary: 'SYNTHETIC: требуется подтверждение цены.',
              },
            },
      ),
    ),
  };
  const timeline = {
    routeTypedUtterance: jest.fn().mockResolvedValue(null),
    persistTypedTurn: jest.fn(() =>
      Promise.resolve({
        turnId: `turn-${++serial}`,
        conversationId: 'same-conversation',
      }),
    ),
    persistAssistantReply: jest.fn().mockResolvedValue(undefined),
  };
  const scheduleWidget = {
    mint: jest.fn().mockResolvedValue({
      matched: true,
      receipt: {
        widget_id: 'schedule-widget',
        envelope_seal: 'synthetic',
        envelope: { kind: 'SETTINGS_DRAFT' },
      },
      dismiss_widget_id: null,
    }),
  };
  const c9 = {
    conversationDigest: jest.fn().mockReturnValue('a'.repeat(64)),
    conversationRead: jest.fn(
      (...args: Parameters<C9Orchestrator['conversationRead']>) => args[4](),
    ),
    finishConversationReads: jest.fn().mockResolvedValue(null),
    checkCancellationWindows: jest.fn().mockResolvedValue({
      reply: 'SYNTHETIC: окно проверено, без действий.',
      coordination: {
        run_id: 'occupancy-run',
        scope: 'explicit_occupancy',
        state: 'PROPOSED',
        revision: 1,
      },
      recommendation: { noSideEffects: true, executionAuthority: false },
    }),
  };
  const model = { decide: jest.fn().mockResolvedValue(modelDecision()) };
  const schedule = new StaffScheduleCommandService(
    config as never,
    crm as never,
    {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
    } as never,
    runtime as never,
  );
  const service = new AiCoreService(
    config as never,
    { assertTenantId: (id: string) => id } as never,
    { assertTenant: jest.fn() } as never,
    runtime as never,
    model as never,
    { log: jest.fn(), tryLog: jest.fn() } as never,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: { enabled_capabilities: ['business_analytics'] },
      }),
    } as never,
    schedule,
    new MayaBrainRouterService(),
    c9 as never,
    undefined,
    undefined,
    undefined,
    {
      get: (token: string) =>
        token === AI_SCHEDULE_WIDGET ? scheduleWidget : timeline,
    } as never,
  );
  const dto = (
    content: string,
    messages?: AiCoreChatDto['messages'],
  ): AiCoreChatDto => ({
    surface: 'web',
    requestId: `integration-request-${serial + 1}`,
    messages: messages ?? [{ role: 'user', content }],
  });
  return { service, runtime, crm, model, c9, timeline, scheduleWidget, dto };
}

describe('unified development candidate: routes and authority stay isolated', () => {
  it('does not expose a fallback approval when the schedule editor card is unavailable', async () => {
    const f = fixture();
    f.scheduleWidget.mint.mockResolvedValue(null);
    const result = await f.service.chat(
      actor,
      f.dto('Сделай Антону 2035-05-10 выходной'),
    );
    expect(result.action).toBeNull();
    expect(result.resolution).toBeUndefined();
    expect(result.reply).toContain(
      'Подтверждение изменения графика недоступно',
    );
    expect(result.reply).toContain('Изменение не выполнено');
  });
  it.each(['График Антона', 'Добрый день'])(
    'does not treat the new request %s as the missing staff name',
    async (content) => {
      const f = fixture();
      const result = await f.service.chat(
        actor,
        f.dto('', [
          { role: 'user', content: 'Сделай 2035-05-10 выходной' },
          { role: 'assistant', content: 'Какому мастеру изменить график?' },
          { role: 'user', content },
        ]),
      );
      expect(result.action).toBeNull();
      expect(result.reply).not.toMatch(
        /На какую дату изменить график|Какому мастеру изменить график|Подтвердите изменение графика/,
      );
      expect(f.runtime.execute).not.toHaveBeenCalled();
      expect(f.crm.getStaffScheduleDay).not.toHaveBeenCalled();
      expect(f.scheduleWidget.mint).not.toHaveBeenCalled();
      expect(f.c9.checkCancellationWindows).not.toHaveBeenCalled();
    },
  );
  it('uses one conversation across general chat, Occupancy, pricing and schedule without leaking a previous purpose', async () => {
    const f = fixture();
    const history: AiCoreChatDto['messages'] = [];
    async function turn(content: string) {
      history.push({ role: 'user', content });
      const result = await f.service.chat(actor, f.dto(content, [...history]));
      history.push({ role: 'assistant', content: result.reply });
      return result;
    }
    await turn('Здравствуйте');
    expect(f.runtime.execute).not.toHaveBeenCalled();
    const occupancy = await turn('Проверь окна после отмен');
    expect(occupancy).toMatchObject({
      action: null,
      recommendation: { executionAuthority: false },
    });
    expect(f.model.decide).toHaveBeenCalledTimes(1);
    expect(f.crm.getStaff).not.toHaveBeenCalled();
    expect(f.scheduleWidget.mint).not.toHaveBeenCalled();

    f.model.decide.mockResolvedValue(
      modelDecision(
        {
          name: 'catalog.service.price.update',
          arguments: { service_id: 'foreign-service', price_rubles: 9999 },
        },
        '',
      ),
    );
    const price = await turn('Установи цену Стрижка 1900 рублей');
    expect(price.action).toMatchObject({
      status: 'approval_required',
      approval: { id: 'price-approval' },
    });
    expect(f.runtime.execute).toHaveBeenLastCalledWith(
      actor,
      'catalog.service.price.update',
      expect.objectContaining({
        arguments: { service_id: '42', price_rubles: 1900 },
      }),
      expect.anything(),
    );
    expect(f.scheduleWidget.mint).not.toHaveBeenCalled();
    expect(f.c9.checkCancellationWindows).toHaveBeenCalledTimes(1);

    const schedule = await turn('Сделай Антону 2035-05-10 выходной');
    expect(schedule.action).toBeNull();
    expect(schedule.resolution).toMatchObject({
      receipt: { widget_id: 'schedule-widget' },
    });
    expect(f.runtime.execute).toHaveBeenLastCalledWith(
      actor,
      'staff.schedule.update',
      expect.objectContaining({
        arguments: expect.objectContaining({
          staff_id: 'staff-a',
          slots: [],
          date: '2035-05-10',
        }) as unknown,
      }),
    );
    expect(f.scheduleWidget.mint).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        approvalId: 'schedule-approval',
        userTurn: { turnId: 'turn-4', conversationId: 'same-conversation' },
      }),
    );
    expect(f.crm.getStaff).toHaveBeenCalledWith(actor.tenantId);
    expect(f.c9.checkCancellationWindows).toHaveBeenCalledTimes(1);
    expect(f.timeline.persistAssistantReply).toHaveBeenCalledTimes(4);
    expect(f.timeline.persistTypedTurn.mock.calls).toHaveLength(4);
    expect(f.runtime.execute.mock.calls.map((call) => call[1])).toEqual([
      'catalog.services.read',
      'catalog.service.price.update',
      'staff.schedule.update',
    ]);
  });

  it.each([
    'Проверь окна после отмен',
    'Установи цену Стрижка 1900 рублей',
    'Сделай Антону 2035-05-10 выходной',
  ])(
    'does not grant owner business authority from client audience: %s',
    async (content) => {
      const f = fixture();
      await f.service.chat(actor, { ...f.dto(content), audience: 'client' });
      expect(f.runtime.execute).not.toHaveBeenCalled();
      expect(f.crm.getStaff).not.toHaveBeenCalled();
      expect(f.c9.checkCancellationWindows).not.toHaveBeenCalled();
      expect(f.scheduleWidget.mint).not.toHaveBeenCalled();
    },
  );

  it('cannot turn stale schedule clarification history into a pricing or general-chat mutation', async () => {
    const f = fixture();
    const history: AiCoreChatDto['messages'] = [
      { role: 'user', content: 'Сделай Антону выходной' },
      { role: 'assistant', content: 'На какую дату изменить график?' },
      { role: 'user', content: 'Установи цену Стрижка 1900 рублей' },
      { role: 'assistant', content: 'Требуется подтверждение цены.' },
      { role: 'user', content: 'Здравствуйте' },
    ];
    await f.service.chat(actor, f.dto('', history));
    expect(f.runtime.execute).not.toHaveBeenCalled();
    expect(f.scheduleWidget.mint).not.toHaveBeenCalled();
    expect(f.c9.checkCancellationWindows).not.toHaveBeenCalled();
  });

  it.each([
    ['Установи цену Стрижка 1900 рублей', 'pricing'],
    ['Установи цену Стрижка 1900 рублей на 2035-05-10', 'pricing_ambiguous'],
    ['Проверь окна после отмен', 'occupancy'],
    ['Здравствуйте', 'general'],
  ])(
    'leaves an unfinished schedule clarification for the new request: %s',
    async (content, lane) => {
      const f = fixture();
      if (lane.startsWith('pricing'))
        f.model.decide.mockResolvedValue(
          modelDecision(
            {
              name: 'catalog.service.price.update',
              arguments: { service_id: '42', price_rubles: 1900 },
            },
            '',
          ),
        );
      const result = await f.service.chat(
        actor,
        f.dto('', [
          { role: 'user', content: 'Сделай Антону выходной' },
          { role: 'assistant', content: 'На какую дату изменить график?' },
          { role: 'user', content },
        ]),
      );
      expect(f.scheduleWidget.mint).not.toHaveBeenCalled();
      expect(f.crm.getStaff).not.toHaveBeenCalled();
      expect(
        f.runtime.execute.mock.calls.some(
          (call) => call[1] === 'staff.schedule.update',
        ),
      ).toBe(false);
      if (lane === 'pricing')
        expect(result.action).toMatchObject({
          approval: { id: 'price-approval' },
        });
      if (lane === 'pricing_ambiguous') {
        expect(f.model.decide).toHaveBeenCalled();
        expect(result.action).toBeNull();
        expect(
          f.runtime.execute.mock.calls.some(
            (call) => call[1] === 'catalog.service.price.update',
          ),
        ).toBe(false);
      }
      if (lane === 'occupancy')
        expect(f.c9.checkCancellationWindows).toHaveBeenCalledTimes(1);
      if (lane === 'general') expect(f.model.decide).toHaveBeenCalledTimes(1);
    },
  );
});
