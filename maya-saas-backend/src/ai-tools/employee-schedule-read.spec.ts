// Jest asymmetric string matchers are intentionally used in expectation objects.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import {
  employeeScheduleTask,
  readEmployeeSchedule,
} from './employee-schedule-read';
import type { StaffScheduleReadScope } from './staff-schedule-read-scope';

const actor = {
  tenantId: 'tenant-current',
  userId: 'owner-current',
  role: UserRole.TENANT_OWNER,
  sessionId: 'session',
  email: 'owner@example.test',
  branchId: null as string | null,
  membershipId: 'membership-current',
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
function fixture(twoTasks = false) {
  const ci = new ConversationIntelligenceService();
  const tasks = [
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
      id: 'schedule',
      intent: 'schedule.get_team',
      entities: { employee: 'Артём', date_or_period: 'tomorrow' },
      depends_on: twoTasks ? ['catalog'] : [],
      confidence: 1,
    },
  ];
  const plan = ci.validatePlan(
    {
      dialogue_act: twoTasks ? 'compound_request' : 'request',
      tasks,
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      },
    },
    actor.role,
    ['catalog.staff.read', 'staff.schedule.read'],
  )!;
  const task = employeeScheduleTask(plan)!;
  const crm = {
    resolveConfiguredBookingBranch: jest.fn().mockResolvedValue(branch),
    resolveBookingBranchPreference: jest.fn().mockResolvedValue(branch),
    resolveStaffScheduleSource: jest.fn().mockResolvedValue(source),
  };
  const catalog = {
    status: 'completed',
    result: { staff: [{ id: '71', name: 'Артём' }] },
  };
  const schedule = {
    status: 'completed',
    result: {
      verified: true,
      date: '2026-10-11',
      read_scope: {
        contract: 'maya.staff-schedule-read/1',
        branch_id: branch.id,
        timezone: branch.timezone,
        source_hash: source.sourceHash,
        staff_id: '71',
      },
      staff: [
        {
          id: '71',
          name: 'Артём',
          is_working: true,
          slots: [{ from: '10:00', to: '20:00' }],
        },
      ],
    },
  };
  const read = jest.fn<
    Promise<unknown>,
    [string, Record<string, unknown>, StaffScheduleReadScope]
  >((name) =>
    Promise.resolve(name === 'catalog.staff.read' ? catalog : schedule),
  );
  const nameReferences = new Map<string, string>();
  const run = () =>
    readEmployeeSchedule({
      actor,
      task,
      nameReferences,
      unresolvedReferences: plan.context.unresolved_references,
      crm,
      read,
      now: new Date('2026-10-09T22:30:00.000Z'),
    });
  return { plan, task, crm, catalog, schedule, read, run, nameReferences };
}

describe('employee schedule through existing CRM owner [synthetic component]', () => {
  it.each([false, true])(
    'binds current staff and branch before exact local-day READ (catalog dependency=%s)',
    async (two) => {
      const f = fixture(two);
      expect(f.task).not.toBeNull();
      await expect(f.run()).resolves.toMatchObject({
        status: 'verified',
        reply: expect.stringContaining('11.10.2026: Артём — 10:00–20:00'),
      });
      expect(f.read.mock.calls.map(([name]) => name)).toEqual([
        'catalog.staff.read',
        'staff.schedule.read',
      ]);
      expect(f.read).toHaveBeenLastCalledWith(
        'staff.schedule.read',
        { date: '2026-10-11', staff_id: '71' },
        {
          branchId: branch.id,
          sourceRevision: branch.sourceRevision,
          staffSource: source,
        },
      );
      expect(f.task.entities).toEqual({
        employee: 'Артём',
        date_or_period: '2026-10-11',
        branch: 'Северный',
      });
      expect(f.crm.resolveStaffScheduleSource).toHaveBeenCalledWith(
        actor.tenantId,
        '71',
      );
      expect(f.crm.resolveConfiguredBookingBranch).toHaveBeenCalledTimes(1);
    },
  );
  it('does not infer a branch from a singleton tenant or read provider without explicit configured mapping', async () => {
    const f = fixture();
    f.crm.resolveConfiguredBookingBranch.mockResolvedValue(null);
    await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    expect(f.read).not.toHaveBeenCalled();
  });
  it('resolves an explicit semantic branch through the existing tenant owner', async () => {
    const f = fixture();
    f.task.entities.branch = 'Северный';
    await expect(f.run()).resolves.toMatchObject({ status: 'verified' });
    expect(f.crm.resolveBookingBranchPreference).toHaveBeenCalledWith(
      actor.tenantId,
      'Северный',
    );
  });
  it('does not substitute the configured branch for an unmatched requested branch', async () => {
    const f = fixture();
    f.task.entities.branch = 'Другой';
    f.crm.resolveBookingBranchPreference.mockResolvedValue(null);
    await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    expect(f.read).not.toHaveBeenCalled();
  });
  it('preserves tenant-owner rejection and never turns it into an empty schedule', async () => {
    const f = fixture();
    f.crm.resolveConfiguredBookingBranch.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('refuses branch outside the authenticated membership', async () => {
    const f = fixture();
    actor.branchId = 'foreign-branch';
    try {
      await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      actor.branchId = null;
    }
    expect(f.read).not.toHaveBeenCalled();
  });
  it('asks for one date without silently changing a week into a day', async () => {
    const f = fixture();
    f.task.entities.date_or_period = 'next_week';
    await expect(f.run()).resolves.toMatchObject({
      status: 'blocked',
      reply: expect.stringContaining('одну дату'),
    });
    expect(f.read).not.toHaveBeenCalled();
  });
  it('never picks the first duplicate employee', async () => {
    const f = fixture();
    f.catalog.result.staff.push({ id: '72', name: 'Артём' });
    await expect(f.run()).resolves.toMatchObject({
      status: 'blocked',
      reply: expect.stringContaining('полное имя'),
    });
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.crm.resolveStaffScheduleSource).not.toHaveBeenCalled();
  });
  it('withholds a catalog from a stale READ', async () => {
    const f = fixture();
    Object.assign(f.catalog, { stale: true });
    await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('requires the selected staff to belong to the same branch', async () => {
    const f = fixture();
    f.crm.resolveStaffScheduleSource.mockResolvedValue({
      ...source,
      branchId: 'other-branch',
    });
    await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it('keeps the branch unresolved when the plan has no explicit branch value', async () => {
    const f = fixture();
    f.plan.context.unresolved_references.push('branch');
    await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    expect(f.read).not.toHaveBeenCalled();
    expect(f.crm.resolveConfiguredBookingBranch).not.toHaveBeenCalled();
  });
  it('binds only a request-local opaque branch mention', async () => {
    const f = fixture();
    f.task.entities.branch = '[name removed]@current';
    f.nameReferences.set('[name removed]@current', 'Северный');
    await expect(f.run()).resolves.toMatchObject({ status: 'verified' });
    expect(f.crm.resolveBookingBranchPreference).toHaveBeenCalledWith(
      actor.tenantId,
      'Северный',
    );
  });
  it('does not resolve an old opaque branch mention from a model-selected value', async () => {
    const f = fixture();
    f.task.entities.branch = '[name removed]@old';
    await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    expect(f.crm.resolveBookingBranchPreference).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it('labels an idempotent saved READ without claiming another provider observation', async () => {
    const f = fixture();
    Object.assign(f.schedule, { replayed: true });
    await expect(f.run()).resolves.toMatchObject({
      status: 'verified',
      reply: expect.stringContaining('Сохранённый результат проверки.'),
    });
  });
  it.each(['stale', 'date', 'staff', 'timezone', 'hash', 'working', 'slots'])(
    'blocks malformed or wrong-source schedule: %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'stale') Object.assign(f.schedule, { stale: true });
      if (kind === 'date') f.schedule.result.date = '2026-10-10';
      if (kind === 'staff') f.schedule.result.staff[0].id = '72';
      if (kind === 'timezone') f.schedule.result.read_scope.timezone = 'UTC';
      if (kind === 'hash')
        f.schedule.result.read_scope.source_hash = 'c'.repeat(64);
      if (kind === 'working') f.schedule.result.staff[0].is_working = false;
      if (kind === 'slots') f.schedule.result.staff[0].slots[0].to = 'bad';
      await expect(f.run()).resolves.toMatchObject({ status: 'blocked' });
    },
  );
  it('does not intercept own appointments, mutations, mixed tasks or a decline', () => {
    for (const intent of [
      'booking.list_own',
      'schedule.update_employee',
      'operations.journal_day',
    ]) {
      const f = fixture();
      f.plan.tasks[0].intent = intent;
      expect(employeeScheduleTask(f.plan)).toBeNull();
    }
    const f = fixture();
    f.plan.dialogue_act = 'decline';
    expect(employeeScheduleTask(f.plan)).toBeNull();
    const compound = fixture(true);
    compound.plan.tasks[1].depends_on = [];
    expect(employeeScheduleTask(compound.plan)).toBeNull();
  });
});
