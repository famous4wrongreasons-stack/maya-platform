import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import type { CrmService } from '../crm/crm.service';
import {
  EMPLOYEE_JOURNAL_CALENDAR_CHANGED,
  employeeJournalReply,
  employeeJournalTask,
  type JournalCalendarPreference,
  readEmployeeJournal,
} from './employee-journal-read';
import type { StaffScheduleReadScope } from './staff-schedule-read-scope';

/** Actual CI/helper/presenter with finite synthetic CRM/runtime ports. */
function fixture(twoTasks = false) {
  const actor = {
    tenantId: 'tenant-current',
    userId: 'owner-current',
    role: UserRole.TENANT_OWNER,
    sessionId: 'session',
    email: 'owner@example.test',
    branchId: null as string | null,
    membershipId: 'member-current',
    membershipStatus: 'active',
  };
  const branch = {
    id: 'branch-current',
    name: 'Северный',
    timezone: 'Europe/Moscow',
    sourceRevision: 'b'.repeat(64),
  };
  const source = {
    provider: 'yclients',
    branchId: branch.id,
    timezone: branch.timezone,
    staffId: 'local-staff',
    externalStaffId: '71',
    sourceHash: 'a'.repeat(64),
  };
  const ci = new ConversationIntelligenceService();
  const plan = ci.validatePlan(
    {
      dialogue_act: twoTasks ? 'compound_request' : 'request',
      tasks: [
        ...(twoTasks
          ? [
              {
                id: 'catalog',
                intent: 'employees.list_public',
                entities: {},
                confidence: 1,
              },
            ]
          : []),
        {
          id: 'journal',
          intent: 'operations.journal_day',
          entities: { employee: 'Артём', period: 'tomorrow' },
          depends_on: twoTasks ? ['catalog'] : [],
          confidence: 1,
        },
      ],
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      },
    },
    actor.role,
    ['catalog.staff.read', 'operations.journal.read'],
  );
  if (!plan) throw new Error('synthetic_plan_not_validated');
  const task = employeeJournalTask(plan);
  if (!task) throw new Error('synthetic_journal_task_not_selected');
  const crm = {
    resolveConfiguredBookingBranch: jest
      .fn<
        ReturnType<CrmService['resolveConfiguredBookingBranch']>,
        Parameters<CrmService['resolveConfiguredBookingBranch']>
      >()
      .mockResolvedValue(branch),
    resolveBookingBranchPreference: jest
      .fn<
        ReturnType<CrmService['resolveBookingBranchPreference']>,
        Parameters<CrmService['resolveBookingBranchPreference']>
      >()
      .mockResolvedValue(branch),
    resolveStaffScheduleSource: jest
      .fn<
        ReturnType<CrmService['resolveStaffScheduleSource']>,
        Parameters<CrmService['resolveStaffScheduleSource']>
      >()
      .mockResolvedValue(source),
  };
  const catalog = {
    status: 'completed',
    result: { staff: [{ id: '71', name: 'Артём' }] },
  };
  const journal = {
    status: 'completed',
    result: {
      verified: true,
      pii_redacted: true,
      date: '2026-10-11',
      timezone: branch.timezone,
      read_scope: {
        contract: 'maya.employee-journal-read/1',
        branch_id: branch.id,
        timezone: source.timezone,
        source_hash: source.sourceHash,
        staff_id: source.externalStaffId,
      },
      staff_scope: { name: 'Артём' },
      completeness: { status: 'complete', zero_means_none: true },
      appointments_returned: 1,
      appointments_truncated: false,
      appointments: [
        {
          time: '10:00',
          end_time: '10:30',
          services: ['Мужская стрижка'],
          status: 'confirmed',
        },
      ],
    },
  };
  const scope = {
    branchId: branch.id,
    sourceRevision: branch.sourceRevision,
    staffSource: source,
  };
  const read = jest.fn<
    Promise<unknown>,
    [string, Record<string, unknown>, StaffScheduleReadScope]
  >((name) =>
    Promise.resolve(name === 'catalog.staff.read' ? catalog : journal),
  );
  const nameReferences = new Map<string, string>();
  const retainCalendar = jest.fn<void, [JournalCalendarPreference]>();
  return {
    actor,
    branch,
    source,
    scope,
    plan,
    task,
    crm,
    catalog,
    journal,
    read,
    nameReferences,
    retainCalendar,
    run: (
      now = new Date('2026-10-09T22:30:00.000Z'),
      retainedCalendar?: JournalCalendarPreference,
    ) =>
      readEmployeeJournal({
        actor,
        task,
        crm,
        read,
        nameReferences,
        unresolvedReferences: plan.context.unresolved_references,
        now,
        retainCalendar,
        retainedCalendar,
      }),
    present: () =>
      employeeJournalReply({
        execution: journal,
        scope,
        staff: { id: '71', name: 'Артём' },
        branchName: branch.name,
        date: '2026-10-11',
      }),
  };
}

describe('employee journal existing owners [synthetic component]', () => {
  it.each([
    [
      'Europe/Moscow',
      '2026-10-09T20:59:00.000Z',
      '2026-10-09T21:01:00.000Z',
      '2026-10-10',
    ],
    [
      'Europe/Berlin',
      '2026-03-28T22:59:00.000Z',
      '2026-03-28T23:01:00.000Z',
      '2026-03-29',
    ],
    [
      'Europe/Berlin',
      '2026-10-24T21:59:00.000Z',
      '2026-10-24T22:01:00.000Z',
      '2026-10-25',
    ],
  ])(
    'keeps the requested civil day across employee clarification and midnight in %s',
    async (timezone, before, after, date) => {
      const f = fixture();
      f.branch.timezone = timezone;
      f.source.timezone = timezone;
      f.journal.result.timezone = timezone;
      f.journal.result.read_scope.timezone = timezone;
      f.catalog.result.staff.push({ id: '72', name: 'Артём' });
      const pending = await f.run(new Date(before));
      expect(pending.status).toBe('blocked');
      expect(pending.reply).toContain('полное имя');
      expect(f.read.mock.calls.map(([name]) => name)).toEqual([
        'catalog.staff.read',
      ]);
      expect(f.task.entities.period).toBe(date);
      expect(f.task.entities.branch).toBe(f.branch.name);
      expect(f.retainCalendar).toHaveBeenCalledWith({
        version: 'maya.journal-calendar-preference/1',
        taskId: f.task.id,
        date,
        branchId: f.branch.id,
        timezone,
        sourceRevision: f.branch.sourceRevision,
      });
      f.catalog.result.staff[0].name = 'Артём Иванов';
      f.task.entities.employee = 'Артём Иванов';
      f.journal.result.staff_scope.name = 'Артём Иванов';
      f.journal.result.date = date;
      const answer = await f.run(new Date(after));
      expect(answer.status).toBe('verified');
      expect(f.read).toHaveBeenLastCalledWith(
        'operations.journal.read',
        { date, staff_id: '71' },
        f.scope,
      );
    },
  );
  it.each(['stale', 'failed', 'malformed'])(
    'cannot retain a calendar from a %s catalog',
    async (kind) => {
      const f = fixture();
      if (kind === 'stale') Object.assign(f.catalog, { stale: true });
      if (kind === 'failed') f.catalog.status = 'failed';
      if (kind === 'malformed')
        Object.assign(f.catalog, { result: { staff: null } });
      expect((await f.run()).status).toBe('blocked');
      expect(f.retainCalendar).not.toHaveBeenCalled();
      expect(f.task.entities.period).toBe('tomorrow');
      expect(f.read).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['2026-02-29', '2026-04-31', '2026-11-01\n'])(
    'rejects impossible or malformed calendar date %s before catalog',
    async (date) => {
      const f = fixture();
      f.task.entities.period = date;
      expect((await f.run()).status).toBe('blocked');
      expect(f.read).not.toHaveBeenCalled();
      expect(f.retainCalendar).not.toHaveBeenCalled();
    },
  );
  it.each(['branchId', 'timezone', 'sourceRevision'] as const)(
    'invalidates retained %s before catalog and requires fresh scope',
    async (field) => {
      const f = fixture();
      const calendar: JournalCalendarPreference = {
        version: 'maya.journal-calendar-preference/1',
        taskId: f.task.id,
        date: '2026-10-11',
        branchId: f.branch.id,
        timezone: f.branch.timezone,
        sourceRevision: f.branch.sourceRevision,
        [field]: 'changed',
      };
      const answer = await f.run(undefined, calendar);
      expect(answer).toEqual({
        status: 'blocked',
        reply: EMPLOYEE_JOURNAL_CALENDAR_CHANGED,
      });
      expect(f.task.entities.period).toBeUndefined();
      expect(f.task.entities.branch).toBeUndefined();
      expect(f.read).not.toHaveBeenCalled();
      expect(f.retainCalendar).not.toHaveBeenCalled();
      f.actor.branchId = 'forbidden';
      await expect(f.run(undefined, calendar)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );
  it.each([false, true])(
    'reads exactly current catalog then employee journal in branch timezone (dependency=%s)',
    async (two) => {
      const f = fixture(two);
      const answer = await f.run();
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain('Журнал на 11.10.2026: Артём');
      expect(answer.reply).toContain('10:00–10:30 — Мужская стрижка');
      expect(answer.reply).toContain('Europe/Moscow');
      expect(f.read.mock.calls.map(([name]) => name)).toEqual([
        'catalog.staff.read',
        'operations.journal.read',
      ]);
      expect(f.read).toHaveBeenLastCalledWith(
        'operations.journal.read',
        { date: '2026-10-11', staff_id: '71' },
        f.scope,
      );
      expect(f.task.entities).toEqual({
        employee: 'Артём',
        period: '2026-10-11',
        branch: 'Северный',
      });
      expect(f.crm.resolveStaffScheduleSource).toHaveBeenCalledWith(
        f.actor.tenantId,
        '71',
      );
    },
  );
  it.each(['missing', 'unresolved', 'foreign-preference', 'foreign-member'])(
    'does not default %s branch authority or call provider readers',
    async (kind) => {
      const f = fixture();
      if (kind === 'missing')
        f.crm.resolveConfiguredBookingBranch.mockResolvedValue(null);
      if (kind === 'unresolved')
        f.plan.context.unresolved_references.push('branch');
      if (kind === 'foreign-preference') {
        f.task.entities.branch = 'foreign-id';
        f.crm.resolveBookingBranchPreference.mockResolvedValue(null);
      }
      if (kind === 'foreign-member') {
        f.actor.branchId = 'foreign-id';
        await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException);
      } else expect((await f.run()).status).toBe('blocked');
      expect(f.read).not.toHaveBeenCalled();
      if (kind === 'unresolved')
        expect(f.crm.resolveConfiguredBookingBranch).not.toHaveBeenCalled();
    },
  );
  it('resolves only a current request-local branch mention', async () => {
    const f = fixture();
    f.task.entities.branch = '[name removed]@branch';
    expect((await f.run()).status).toBe('blocked');
    expect(f.read).not.toHaveBeenCalled();
    f.nameReferences.set('[name removed]@branch', 'Северный');
    expect((await f.run()).status).toBe('verified');
    expect(f.crm.resolveBookingBranchPreference).toHaveBeenCalledWith(
      f.actor.tenantId,
      'Северный',
    );
  });
  it.each(['ambiguous', 'missing', 'stale'])(
    'does not guess an employee from %s catalog',
    async (kind) => {
      const f = fixture();
      if (kind === 'ambiguous')
        f.catalog.result.staff.push({ id: '72', name: 'Артём' });
      if (kind === 'missing') f.catalog.result.staff = [];
      if (kind === 'stale') Object.assign(f.catalog, { stale: true });
      const answer = await f.run();
      expect(answer.status).toBe('blocked');
      expect(answer.reply).not.toContain('10:00');
      expect(f.read).toHaveBeenCalledTimes(1);
      expect(f.crm.resolveStaffScheduleSource).not.toHaveBeenCalled();
    },
  );
  it.each(['branchId', 'externalStaffId', 'timezone'])(
    'withholds journal READ on mismatched staff-source %s',
    async (field) => {
      const f = fixture();
      f.crm.resolveStaffScheduleSource.mockResolvedValue({
        ...f.source,
        [field]: 'foreign',
      });
      expect((await f.run()).status).toBe('blocked');
      expect(f.read).toHaveBeenCalledTimes(1);
    },
  );
  it('does not convert a broad period into an invented day', async () => {
    const f = fixture();
    f.task.entities.period = 'next_week';
    const answer = await f.run();
    expect(answer.status).toBe('blocked');
    expect(answer.reply).toContain('одну дату');
    expect(f.read).not.toHaveBeenCalled();
  });
  it('propagates current tenant revocation instead of making an empty journal', async () => {
    const f = fixture();
    f.crm.resolveConfiguredBookingBranch.mockRejectedValue(
      new ForbiddenException('revoked'),
    );
    await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('does not intercept own appointments, mutations, decline or a broken dependency', () => {
    for (const intent of [
      'booking.list_own',
      'schedule.update_employee',
      'schedule.get_team',
    ]) {
      const f = fixture();
      f.task.intent = intent;
      expect(employeeJournalTask(f.plan)).toBeNull();
    }
    const f = fixture();
    f.plan.dialogue_act = 'decline';
    expect(employeeJournalTask(f.plan)).toBeNull();
    const compound = fixture(true);
    compound.task.depends_on = [];
    expect(employeeJournalTask(compound.plan)).toBeNull();
  });
  it.each([
    'permission',
    'action',
    'data-class',
    'tool',
    'extra-entity',
    'extra-task',
  ])('rejects %s outside the exact finite whitelist', (kind) => {
    const f = fixture();
    if (kind === 'permission') f.task.permission.status = 'denied';
    if (kind === 'action') f.task.action = 'write';
    if (kind === 'data-class') f.task.data_class = 'A';
    if (kind === 'tool') f.task.tool.name = 'appointments.own.list';
    if (kind === 'extra-entity') f.task.entities.client_id = 'not-authority';
    if (kind === 'extra-task')
      f.plan.tasks.push({ ...f.task, id: 'extra', intent: 'booking.list_own' });
    expect(employeeJournalTask(f.plan)).toBeNull();
  });
});

describe('employee journal evidence presentation [synthetic source]', () => {
  it('does not echo client/private extras, guessed totals or attendance from the source envelope', () => {
    const f = fixture();
    Object.assign(f.journal.result, {
      revenue: 99999,
      attended: 99998,
      client_names: ['PRIVATE_CLIENT'],
    });
    Object.assign(f.journal.result.appointments[0], {
      client_name: 'PRIVATE_CLIENT',
      phone: 'PRIVATE_PHONE',
      attendance: 'ATTENDANCE_SECRET',
      price: 99997,
    });
    const answer = f.present();
    expect(answer.status).toBe('verified');
    for (const value of [
      'PRIVATE_CLIENT',
      'PRIVATE_PHONE',
      'ATTENDANCE_SECRET',
      '99999',
      '99998',
      '99997',
    ])
      expect(answer.reply).not.toContain(value);
    expect(answer.reply).toContain(
      'присутствие и свободные окна этим ответом не подтверждаются',
    );
  });
  it('labels cached evidence without claiming a new source observation', () => {
    const f = fixture();
    Object.assign(f.journal, { replayed: true });
    expect(f.present().reply).toContain('Сохранённый результат проверки.');
  });
  it.each([true, false])(
    'incomplete empty source never means no bookings (zero_means_none=%s)',
    (zero) => {
      const f = fixture();
      f.journal.result.appointments = [];
      f.journal.result.appointments_returned = 0;
      f.journal.result.completeness = {
        status: 'incomplete',
        zero_means_none: zero,
      };
      const answer = f.present();
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain('Источник прочитан не полностью');
      expect(answer.reply).toContain('это не подтверждает отсутствие записей');
      expect(answer.reply).not.toContain('В подтверждённом срезе записей нет');
    },
  );
  it.each([true, false])(
    'complete empty source honors explicit zero semantics=%s',
    (zero) => {
      const f = fixture();
      f.journal.result.appointments = [];
      f.journal.result.appointments_returned = 0;
      f.journal.result.completeness.zero_means_none = zero;
      const answer = f.present();
      expect(answer.status).toBe('verified');
      if (zero)
        expect(answer.reply).toContain('В подтверждённом срезе записей нет');
      else
        expect(answer.reply).toContain(
          'это не подтверждает отсутствие записей',
        );
    },
  );
  it.each(['source', 'display'])(
    'marks visible truncation from %s without invented total counts',
    (kind) => {
      const f = fixture();
      if (kind === 'source') f.journal.result.appointments_truncated = true;
      else {
        f.journal.result.appointments = Array.from({ length: 13 }, (_, i) => ({
          time: '10:00',
          end_time: '10:30',
          services: [i === 12 ? 'UNSHOWN_THIRTEENTH' : `Услуга ${i + 1}`],
          status: 'confirmed',
        }));
        f.journal.result.appointments_returned = 13;
      }
      const answer = f.present();
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain(
        'Показана только часть полученных записей',
      );
      expect(answer.reply).not.toContain('UNSHOWN_THIRTEENTH');
      expect(answer.reply).not.toContain('Всего');
    },
  );
  it('reports completed only as a CRM status, not proof that a paid-only visit took place', () => {
    const f = fixture();
    f.journal.result.appointments[0].status = 'completed';
    Object.assign(f.journal.result, {
      attendance: { state: 'unavailable', arrived: 0 },
    });
    const answer = f.present();
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('отмечена завершённой в CRM');
    expect(answer.reply).not.toContain('проведена');
  });
  it('does not infer an empty day from an empty truncated projection', () => {
    const f = fixture();
    f.journal.result.appointments = [];
    f.journal.result.appointments_returned = 0;
    f.journal.result.appointments_truncated = true;
    const answer = f.present();
    expect(answer.reply).not.toContain('В подтверждённом срезе записей нет');
    expect(answer.reply).toContain('не подтверждает отсутствие');
  });

  it.each([
    'stale',
    'failed',
    'date',
    'timezone',
    'branch',
    'staff',
    'hash',
    'name',
    'pii',
    'count',
    'status-array',
    'time',
    'services',
    'oversize',
  ])(
    'withholds stale/malformed/wrong-source %s without leaking rows',
    (kind) => {
      const f = fixture();
      const data = f.journal.result;
      if (kind === 'stale') Object.assign(f.journal, { stale: true });
      if (kind === 'failed') f.journal.status = 'failed';
      if (kind === 'date') data.date = '2026-10-10';
      if (kind === 'timezone') data.timezone = 'UTC';
      if (kind === 'branch') data.read_scope.branch_id = 'foreign';
      if (kind === 'staff') data.read_scope.staff_id = '72';
      if (kind === 'hash') data.read_scope.source_hash = 'c'.repeat(64);
      if (kind === 'name') data.staff_scope.name = 'Other employee';
      if (kind === 'pii') data.pii_redacted = false;
      if (kind === 'count') data.appointments_returned = 2;
      if (kind === 'status-array')
        Object.assign(data.completeness, { status: ['complete'] });
      if (kind === 'time') data.appointments[0].time = '25:00';
      if (kind === 'services')
        data.appointments[0].services = ['Injected\nPRIVATE_CLIENT'];
      if (kind === 'oversize') {
        data.appointments = Array.from({ length: 101 }, () => ({
          ...data.appointments[0],
        }));
        data.appointments_returned = 101;
      }
      const answer = f.present();
      expect(answer.status).toBe('blocked');
      expect(answer.reply).not.toContain('10:00');
      expect(answer.reply).not.toContain('PRIVATE_CLIENT');
    },
  );
});
