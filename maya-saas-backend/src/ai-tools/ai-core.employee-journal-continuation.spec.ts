import { createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type {
  AiCoreModelDecision,
  AiCoreModelInput,
  AiCoreToolDescriptor,
} from './ai-core.types';
import type { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiTypedWidgetTriggerPort } from './ai-typed-widget-trigger.port';
import type { AiCoreChatDto } from './dto/ai-core-chat.dto';
import {
  carryEmployeeJournalCalendarPreference,
  EMPLOYEE_JOURNAL_CALENDAR_CHANGED,
  EMPLOYEE_JOURNAL_DATE_QUESTION,
  EMPLOYEE_JOURNAL_EMPLOYEE_QUESTION,
  type JournalCalendarPreference,
} from './employee-journal-read';

/** Actual CI, parser, chat and semantic-context serializer/restorer. Timeline,
 * C9, source metadata and READ transport below are finite synthetic doubles;
 * these tests do not prove persistence encryption, provider or HTTP behavior. */
type CompletionInput = Parameters<
  AiTypedWidgetTriggerPort['persistAssistantReply']
>[0];
interface CorePrivate {
  complete(...args: unknown[]): Promise<unknown>;
  previousSemanticPlan(
    actor: AuthenticatedUser,
    dto: AiCoreChatDto,
    tools: AiCoreToolDescriptor[],
    role: UserRole,
  ): Promise<ConversationSemanticPlan | null>;
}
const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
// Match the canonical persisted JSON decode. Node structuredClone creates
// foreign-realm objects in Jest; CI intentionally refuses such plain records.
const jsonSnapshot = (value: unknown): unknown =>
  value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as unknown);
function fixture(timezone = 'Europe/Moscow') {
  const ci = new ConversationIntelligenceService();
  const parser = Object.create(AiCoreModelService.prototype) as {
    validatePlanningResponse(
      output: string,
      input: AiCoreModelInput,
    ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
  };
  Object.defineProperty(parser, 'conversationIntelligence', { value: ci });
  const actor: AuthenticatedUser = {
    userId: 'owner-current',
    tenantId: 'tenant-current',
    sessionId: 'session-current',
    email: 'owner@example.invalid',
    role: UserRole.TENANT_OWNER,
    branchId: null,
    membershipId: 'membership-current',
    membershipStatus: 'active',
  };
  const branch = {
    id: 'branch-current',
    name: 'Набережная',
    timezone,
    sourceRevision: 'a'.repeat(64),
  };
  const source = {
    provider: 'yclients',
    staffId: 'local-staff',
    externalStaffId: '71',
    branchId: branch.id,
    timezone: branch.timezone,
    sourceHash: 'b'.repeat(64),
  };
  const crm = {
    resolveConfiguredBookingBranch: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...branch })),
    resolveBookingBranchPreference: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...branch })),
    resolveStaffScheduleSource: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...source })),
  };
  const tools: AiCoreToolDescriptor[] = [
    'catalog.staff.read',
    'operations.journal.read',
  ].map((name) => ({
    name,
    description: name,
    input_schema: { type: 'object' },
    risk_tier: 'read',
    approval_policy: 'none',
  }));
  const catalog = {
    staff: [
      { id: '71', name: 'Алексей Первый' },
      { id: '72', name: 'Алексей Второй' },
    ],
  };
  const execute = jest
    .fn<
      ReturnType<AiToolRuntimeService['execute']>,
      Parameters<AiToolRuntimeService['execute']>
    >()
    .mockImplementation((_actor, name, dto) => {
      if (name === 'catalog.staff.read')
        return Promise.resolve({
          status: 'completed',
          execution_id: 'catalog-execution',
          result: catalog,
        });
      if (name === 'operations.journal.read')
        return Promise.resolve({
          status: 'completed',
          execution_id: 'journal-execution',
          result: {
            verified: true,
            pii_redacted: true,
            date: dto.arguments.date,
            timezone: branch.timezone,
            staff_scope: { name: 'Алексей Первый' },
            completeness: { status: 'complete', zero_means_none: true },
            appointments_returned: 0,
            appointments_truncated: false,
            appointments: [],
            read_scope: {
              contract: 'maya.employee-journal-read/1',
              branch_id: branch.id,
              timezone: branch.timezone,
              source_hash: source.sourceHash,
              staff_id: '71',
            },
          },
        });
      throw new Error('unexpected_test_read');
    });
  let entities: Record<string, unknown> = {
    employee: 'Алексей',
    period: 'tomorrow',
    branch: branch.name,
  };
  let dialogueAct = 'request';
  let directJournalProposal = true;
  let context = {
    carried_slots: [] as string[],
    replaced_slots: [] as string[],
    unresolved_references: [] as string[],
  };
  const decide = jest.fn(
    (input: AiCoreModelInput): Promise<AiCoreModelDecision> =>
      Promise.resolve({
        ...parser.validatePlanningResponse(
          JSON.stringify({
            semantic_plan: {
              dialogue_act: dialogueAct,
              tasks: [
                {
                  id: 'journal',
                  intent: 'operations.journal_day',
                  entities,
                  confidence: 1,
                },
              ],
              context,
            },
            tool_call: directJournalProposal
              ? {
                  name: 'operations.journal.read',
                  arguments: { date: '1999-01-01' },
                }
              : null,
          }),
          input,
        ),
        reply: 'UNVERIFIED_SCRIPTED_PLANNER_PROSE',
        provider: 'deepseek',
        model: 'SCRIPTED_VALIDATED_PLAN',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }),
  );
  let projection: unknown = null;
  let turn = 0;
  const persistAssistantReply = jest
    .fn<
      ReturnType<AiTypedWidgetTriggerPort['persistAssistantReply']>,
      Parameters<AiTypedWidgetTriggerPort['persistAssistantReply']>
    >()
    .mockImplementation((input) => {
      projection = jsonSnapshot(input.semanticContext);
      return Promise.resolve();
    });
  const readConversationContext = jest
    .fn<
      Promise<unknown>,
      Parameters<
        NonNullable<AiTypedWidgetTriggerPort['readConversationContext']>
      >
    >()
    .mockImplementation(() => Promise.resolve(jsonSnapshot(projection)));
  const timeline = {
    routeTypedUtterance: jest.fn().mockResolvedValue(null),
    persistTypedTurn: jest.fn().mockImplementation(() =>
      Promise.resolve({
        turnId: `turn-${++turn}`,
        conversationId: 'conversation-current',
      }),
    ),
    persistAssistantReply,
    readConversationContext,
  };
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const orchestrator = {
    conversationDigest: digest,
    conversationRead: jest.fn(
      (
        _turn: unknown,
        _name: unknown,
        _key: unknown,
        _digest: unknown,
        read: () => Promise<unknown>,
      ) => read(),
    ),
    finishConversationReads: jest.fn().mockResolvedValue({
      run_id: 'journal-run',
      scope: 'deterministic_reads',
      state: 'COMPLETED',
    }),
  };
  const service = new AiCoreService(
    {
      get: (key: string) =>
        key === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
    } as never,
    { assertTenantId: (id: string) => id } as never,
    { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
    { listTools: jest.fn().mockResolvedValue({ tools }), execute } as never,
    { decide } as never,
    {
      log: jest.fn().mockResolvedValue(undefined),
      tryLog: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: {
          enabled_capabilities: ['staff_operations', 'schedule_management'],
        },
      }),
    } as never,
    { tryHandle: jest.fn().mockResolvedValue(null) } as never,
    new MayaBrainRouterService(),
    orchestrator as never,
    undefined,
    ci,
    {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      },
    } as never,
    { get: () => timeline } as never,
    crm as never,
  );
  const internals = service as unknown as CorePrivate;
  const complete = jest.spyOn(internals, 'complete');
  const dtos: AiCoreChatDto[] = [];
  const chat = async (text = 'Кто записан к Алексею завтра?') => {
    const dto: AiCoreChatDto = {
      surface: 'web',
      requestId: `journal_continuation_request_${dtos.length}`,
      conversationId: 'conversation-current',
      messages: [{ role: 'user', content: text }],
    };
    dtos.push(dto);
    return service.chat(actor, dto);
  };
  const restore = async (saved: unknown) => {
    projection = saved;
    const dto: AiCoreChatDto = {
      surface: 'web',
      requestId: 'restore_journal_context_123',
      conversationId: 'conversation-current',
      messages: [{ role: 'user', content: 'Алексей Первый' }],
    };
    (
      Reflect.get(service, 'persistedUserTurns') as WeakMap<object, unknown>
    ).set(dto, {
      turnId: 'restore-turn',
      conversationId: 'conversation-current',
    });
    const plan = await internals.previousSemanticPlan(
      actor,
      dto,
      tools,
      actor.role,
    );
    return {
      plan,
      dto,
      calendar: (
        Reflect.get(service, 'journalCalendarPreferences') as WeakMap<
          object,
          JournalCalendarPreference
        >
      ).get(dto),
    };
  };
  const saved = (): CompletionInput => {
    const last = persistAssistantReply.mock.calls.at(-1)?.[0];
    if (!last) throw new Error('missing_test_completion');
    return last;
  };
  const plan = (
    values: Record<string, unknown>,
    act = 'clarification_answer',
    refs: string[] = [],
    replaced: string[] = [],
  ) => {
    const result = ci.validatePlan(
      {
        dialogue_act: act,
        tasks: [
          {
            id: 'journal',
            intent: 'operations.journal_day',
            entities: values,
            confidence: 1,
          },
        ],
        context: {
          carried_slots: [],
          replaced_slots: replaced,
          unresolved_references: refs,
        },
      },
      actor.role,
      tools.map((tool) => tool.name),
    );
    if (!result) throw new Error('missing_test_plan');
    return result;
  };
  return {
    service,
    actor,
    crm,
    branch,
    source,
    tools,
    catalog,
    execute,
    decide,
    orchestrator,
    timeline,
    complete,
    dtos,
    chat,
    restore,
    saved,
    plan,
    proposeJournal: () => {
      directJournalProposal = true;
    },
    setModel: (
      values: Record<string, unknown>,
      act = 'clarification_answer',
      refs: string[] = [],
      replaced: string[] = [],
    ) => {
      entities = values;
      dialogueAct = act;
      context = {
        carried_slots: [],
        replaced_slots: replaced,
        unresolved_references: refs,
      };
    },
    finish: (args: unknown[]) => internals.complete(...args),
    setProjection: (value: unknown) => {
      projection = value;
    },
  };
}

describe('AiCore journal calendar continuation [actual parser, synthetic owners]', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-10-09T22:30:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('persists branch-local tomorrow and only the finite employee question after an ambiguous catalog', async () => {
    const f = fixture();
    const answer = await f.chat();
    expect(answer.reply).toBe(EMPLOYEE_JOURNAL_EMPLOYEE_QUESTION);
    expect(answer.action).toBeNull();
    expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
      'catalog.staff.read',
    ]);
    const saved = f.saved();
    expect(saved.semanticContext).toHaveProperty('timezone', 'UTC');
    expect(saved.semanticContext).toHaveProperty(
      'plan.tasks.0.entities.period',
      '2026-10-11',
    );
    expect(saved.semanticContext).toHaveProperty(
      'plan.tasks.0.clarification_question',
      EMPLOYEE_JOURNAL_EMPLOYEE_QUESTION,
    );
    expect(obj(saved.semanticContext).journalCalendar).toEqual({
      version: 'maya.journal-calendar-preference/1',
      taskId: 'journal',
      date: '2026-10-11',
      branchId: f.branch.id,
      timezone: 'Europe/Moscow',
      sourceRevision: f.branch.sourceRevision,
    });
    expect(f.decide).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      zone: 'Europe/Moscow',
      first: '2026-10-09T22:30:00.000Z',
      later: '2026-10-10T22:31:00.000Z',
      date: '2026-10-11',
    },
    {
      zone: 'America/New_York',
      first: '2026-11-01T03:30:00.000Z',
      later: '2026-11-02T04:30:00.000Z',
      date: '2026-11-01',
    },
  ])(
    'retains the original branch day across midnight/DST: $zone',
    async ({ zone, first, later, date }) => {
      jest.setSystemTime(new Date(first));
      const f = fixture(zone);
      await f.chat();
      jest.setSystemTime(new Date(later));
      f.setModel({ employee: 'Алексей Первый' });
      const response = await f.chat('Алексей Первый');
      expect(response.grounding.status).toBe('verified');
      expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
        'catalog.staff.read',
        'catalog.staff.read',
        'operations.journal.read',
      ]);
      expect(f.execute.mock.calls.at(-1)?.[2].arguments).toEqual({
        date,
        staff_id: '71',
      });
      const modelInput = f.decide.mock.calls[1][0];
      expect(modelInput.conversationPlan).toHaveProperty(
        'tasks.0.entities.period',
        date,
      );
      expect(JSON.stringify(modelInput)).not.toMatch(
        /journalCalendar|maya\.journal-calendar-preference|sourceRevision|branch-current/,
      );
      expect(JSON.stringify(modelInput)).not.toContain('a'.repeat(64));
      expect(f.decide).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['revision', 'branch', 'timezone', 'name', 'unavailable'])(
    'clears the saved branch/day on current %s mismatch before a new source READ',
    async (kind) => {
      const f = fixture();
      await f.chat();
      const saved = jsonSnapshot(f.saved().semanticContext);
      if (kind === 'revision') f.branch.sourceRevision = 'c'.repeat(64);
      if (kind === 'branch') f.branch.id = 'another-branch';
      if (kind === 'timezone') f.branch.timezone = 'Asia/Tokyo';
      if (kind === 'name') f.branch.name = 'Переименованный';
      if (kind === 'unavailable')
        f.crm.resolveConfiguredBookingBranch.mockResolvedValue(null);
      const restored = await f.restore(saved);
      expect(restored.calendar).toBeUndefined();
      expect(restored.plan?.tasks[0].entities).not.toHaveProperty('period');
      expect(restored.plan?.tasks[0].entities).not.toHaveProperty('branch');
      expect(restored.plan?.tasks[0].clarification_question).toBe(
        EMPLOYEE_JOURNAL_CALENDAR_CHANGED,
      );
      expect(restored.plan?.context.unresolved_references).toEqual(
        expect.arrayContaining(['period', 'branch']),
      );
      f.setProjection(saved);
      f.setModel({ employee: 'Алексей Первый' });
      const response = await f.chat('Алексей Первый');
      expect(response.reply).toBe(EMPLOYEE_JOURNAL_CALENDAR_CHANGED);
      expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
        'catalog.staff.read',
      ]);
    },
  );

  it('propagates foreign/revoked current source authority without using retained context', async () => {
    const f = fixture();
    await f.chat();
    f.crm.resolveConfiguredBookingBranch.mockRejectedValue(
      new ForbiddenException('foreign_tenant'),
    );
    await expect(f.restore(f.saved().semanticContext)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    'impossible-date',
    'new-version',
    'extra-epoch',
    'bad-revision',
    'newline-revision',
    'wrong-task',
    'foreign-branch',
    'invalid-zone',
  ])('does not restore malformed marker %s', async (kind) => {
    const f = fixture();
    await f.chat();
    const context = obj(jsonSnapshot(f.saved().semanticContext));
    const marker = obj(context.journalCalendar);
    if (kind === 'impossible-date') {
      marker.date = '2026-02-30';
      const tasks = obj(context.plan).tasks as unknown[];
      obj(obj(tasks[0]).entities).period = '2026-02-30';
    }
    if (kind === 'new-version')
      marker.version = 'maya.journal-calendar-preference/2';
    if (kind === 'extra-epoch') marker.epoch = 2;
    if (kind === 'bad-revision') marker.sourceRevision = 'invalid';
    if (kind === 'newline-revision')
      marker.sourceRevision = 'a'.repeat(64) + '\n';
    if (kind === 'wrong-task') marker.taskId = 'other';
    if (kind === 'foreign-branch') marker.branchId = 'foreign-branch';
    if (kind === 'invalid-zone') marker.timezone = 'Not/A_Timezone';
    const restored = await f.restore(context);
    expect(restored.calendar).toBeUndefined();
    expect(restored.plan?.tasks[0].entities).not.toHaveProperty('period');
    expect(restored.plan?.tasks[0].clarification_question).toBe(
      EMPLOYEE_JOURNAL_CALENDAR_CHANGED,
    );
  });

  it('removes a legacy relative period without a trusted branch-day anchor', async () => {
    const f = fixture();
    await f.chat();
    const context = obj(jsonSnapshot(f.saved().semanticContext));
    delete context.journalCalendar;
    const tasks = obj(context.plan).tasks as unknown[];
    obj(obj(tasks[0]).entities).period = 'tomorrow';
    const restored = await f.restore(context);
    expect(restored.calendar).toBeUndefined();
    expect(restored.plan?.tasks[0].entities).not.toHaveProperty('period');
    expect(restored.plan?.tasks[0].clarification_question).toBe(
      EMPLOYEE_JOURNAL_DATE_QUESTION,
    );
  });

  it.each(['null', 'erased', 'foreign', 'stop'])(
    'does not search past a timeline %s barrier',
    async (kind) => {
      const f = fixture();
      await f.chat();
      const original = f.saved().semanticContext;
      const first =
        kind === 'stop'
          ? {
              version: 'maya.chat-semantic-context/1',
              savedAt: new Date().toISOString(),
              timezone: 'UTC',
              plan: null,
            }
          : null;
      f.crm.resolveConfiguredBookingBranch.mockClear();
      const restored = await f.restore({
        version: 'maya.chat-context-window/1',
        contexts: [first, original],
      });
      expect(restored.plan).toBeNull();
      expect(restored.calendar).toBeUndefined();
      expect(f.crm.resolveConfiguredBookingBranch).not.toHaveBeenCalled();
      // Null means the canonical timeline withheld/erased the context; the mock
      // does not itself prove timeline tenant or erasure authorization.
    },
  );

  it('a real STOP completion stores a null context and blocks the old journal preference', async () => {
    const f = fixture();
    await f.chat();
    const before = f.decide.mock.calls.length;
    await f.chat('Стоп');
    expect(f.saved().semanticContext).toBeNull();
    expect(f.decide).toHaveBeenCalledTimes(before);
    const restored = await f.restore(f.saved().semanticContext);
    expect(restored.plan).toBeNull();
    expect(restored.calendar).toBeUndefined();
  });

  it.each(['period', 'branch'])(
    'lets fresh explicit %s win while retaining only the matching branch source fence',
    async (key) => {
      const f = fixture();
      await f.chat();
      const restored = await f.restore(f.saved().semanticContext);
      const value = key === 'period' ? '2026-10-15' : 'Другой филиал';
      const current = f.plan(
        { employee: 'Алексей Первый', [key]: value },
        'correction',
      );
      expect(
        carryEmployeeJournalCalendarPreference(
          current,
          restored.plan,
          restored.calendar,
        ),
      ).toBe(key === 'period');
      expect(current.tasks[0].entities[key]).toBe(value);
      expect(
        current.tasks[0].entities[key === 'period' ? 'branch' : 'period'],
      ).toBe(key === 'period' ? 'Набережная' : '2026-10-11');
    },
  );

  it.each(['period', 'branch'])(
    'does not re-carry explicitly replaced or unresolved %s without a concrete value',
    async (key) => {
      const f = fixture();
      await f.chat();
      const restored = await f.restore(f.saved().semanticContext);
      for (const missing of ['unresolved', 'replaced']) {
        const current = f.plan(
          { employee: 'Алексей Первый' },
          'clarification_answer',
          missing === 'unresolved' ? [key] : [],
          missing === 'replaced' ? [key] : [],
        );
        expect(
          carryEmployeeJournalCalendarPreference(
            current,
            restored.plan,
            restored.calendar,
          ),
        ).toBe(false);
        expect(current.tasks[0].entities).not.toHaveProperty(key);
        expect(current.context.unresolved_references).toContain(key);
      }
    },
  );

  it('a date-only correction with a direct journal proposal cannot widen the pending employee selection to the whole team', async () => {
    const f = fixture();
    await f.chat();
    f.setModel({ period: '2026-10-15' }, 'correction');
    f.proposeJournal();
    const response = await f.chat('Нет, на 15 октября');
    expect(response.reply).toBe(EMPLOYEE_JOURNAL_EMPLOYEE_QUESTION);
    expect(response.grounding.status).toBe('blocked');
    expect(response.action).toBeNull();
    expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
      'catalog.staff.read',
      'catalog.staff.read',
    ]);
    expect(f.saved().semanticContext).toHaveProperty(
      'plan.tasks.0.entities.period',
      '2026-10-15',
    );
    expect(f.saved().semanticContext).toHaveProperty(
      'plan.tasks.0.entities.branch',
      'Набережная',
    );
    expect(f.saved().semanticContext).not.toHaveProperty(
      'plan.tasks.0.entities.employee',
    );
    expect(f.saved().semanticContext).toHaveProperty(
      'journalCalendar.date',
      '2026-10-15',
    );
    expect(f.saved().semanticContext).toHaveProperty(
      'plan.tasks.0.clarification_question',
      EMPLOYEE_JOURNAL_EMPLOYEE_QUESTION,
    );
    expect(f.decide).toHaveBeenCalledTimes(2);
    expect(f.crm.resolveStaffScheduleSource).not.toHaveBeenCalled();
  });

  it('a date-only answer to the server date question cannot dispatch a whole-team journal without an employee', async () => {
    const f = fixture();
    f.setModel(
      { employee: 'Алексей', period: '2026-02-30', branch: 'Набережная' },
      'request',
    );
    const first = await f.chat('Кто записан к Алексею 30 февраля?');
    expect(first.reply).toBe(EMPLOYEE_JOURNAL_DATE_QUESTION);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.saved().semanticContext).toHaveProperty(
      'plan.tasks.0.clarification_question',
      EMPLOYEE_JOURNAL_DATE_QUESTION,
    );
    expect(f.saved().semanticContext).not.toHaveProperty('journalCalendar');
    f.setModel({ period: '2026-10-15' }, 'clarification_answer');
    f.proposeJournal();
    const response = await f.chat('На 15 октября');
    expect(response.reply).toBe(EMPLOYEE_JOURNAL_EMPLOYEE_QUESTION);
    expect(response.grounding.status).toBe('blocked');
    expect(response.action).toBeNull();
    expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
      'catalog.staff.read',
    ]);
    expect(f.saved().semanticContext).toHaveProperty(
      'plan.tasks.0.entities.period',
      '2026-10-15',
    );
    expect(f.saved().semanticContext).not.toHaveProperty(
      'plan.tasks.0.entities.employee',
    );
    expect(f.saved().semanticContext).toHaveProperty(
      'journalCalendar.date',
      '2026-10-15',
    );
    expect(f.crm.resolveStaffScheduleSource).not.toHaveBeenCalled();
    expect(f.decide).toHaveBeenCalledTimes(2);
  });

  it('retains the old source fence for a date-only correction if the source changes while planning', async () => {
    const f = fixture();
    await f.chat();
    f.setModel(
      { employee: 'Алексей Первый', period: '2026-10-15' },
      'correction',
    );
    const original = f.decide.getMockImplementation();
    if (!original) throw new Error('missing_scripted_planner');
    f.decide.mockImplementationOnce((input) => {
      const decision = original(input);
      f.branch.sourceRevision = 'e'.repeat(64);
      return decision;
    });
    const response = await f.chat('Алексей Первый, на 15 октября');
    expect(response.reply).toBe(EMPLOYEE_JOURNAL_CALENDAR_CHANGED);
    expect(response.grounding.status).toBe('blocked');
    expect(f.execute.mock.calls.map((call) => call[1])).toEqual([
      'catalog.staff.read',
    ]);
    expect(f.saved().semanticContext).not.toHaveProperty('journalCalendar');
  });

  it('changes the completion fingerprint for a changed marker revision while plan/reply remain identical', async () => {
    const f = fixture();
    await f.chat();
    const first = f.saved();
    const args = f.complete.mock.calls[0];
    const dto = f.dtos[0];
    const marker = obj(first.semanticContext)
      .journalCalendar as JournalCalendarPreference;
    (
      Reflect.get(f.service, 'journalCalendarPreferences') as WeakMap<
        object,
        JournalCalendarPreference
      >
    ).set(dto, { ...marker, sourceRevision: 'd'.repeat(64) });
    await f.finish(args);
    const second = f.saved();
    expect(second.reply).toBe(first.reply);
    expect(obj(second.semanticContext).plan).toEqual(
      obj(first.semanticContext).plan,
    );
    expect(second.completionHash).not.toBe(first.completionHash);
    expect(obj(second.semanticContext).journalCalendar).toEqual({
      ...marker,
      sourceRevision: 'd'.repeat(64),
    });
  });
});
