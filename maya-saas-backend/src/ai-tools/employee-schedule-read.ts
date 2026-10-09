import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type {
  ConversationSemanticPlan,
  ConversationSemanticTask,
} from '../conversation-intelligence/conversation-intelligence.types';
import type { CrmService } from '../crm/crm.service';
import { normalizeScheduleSlots } from '../crm/staff-schedule.utils';
import {
  bindBookingStaff,
  bookingPreferenceDate,
} from './booking-catalog-binding';
import type { StaffScheduleReadScope } from './staff-schedule-read-scope';

/** Exact existing schedule task, optionally preceded by its public catalog READ.
 * This consumes a validated plan; it does not detect intent or grant access. */
export function employeeScheduleTask(
  plan: ConversationSemanticPlan | null,
): ConversationSemanticTask | null {
  if (
    !plan ||
    ![
      'request',
      'compound_request',
      'correction',
      'clarification_answer',
    ].includes(plan.dialogue_act)
  )
    return null;
  if (plan.tasks.length < 1 || plan.tasks.length > 2) return null;
  const task = plan.tasks.at(-1)!;
  if (
    task.intent !== 'schedule.get_team' ||
    task.domain !== 'schedule' ||
    task.action !== 'read' ||
    task.data_class !== 'C' ||
    task.permission.required !== 'schedule.team.read' ||
    task.permission.status !== 'allowed' ||
    task.tool.status !== 'ready' ||
    task.tool.name !== 'staff.schedule.read' ||
    task.requires_confirmation ||
    typeof task.entities.employee !== 'string' ||
    !task.entities.employee.trim() ||
    Object.keys(task.entities).some(
      (key) => !['employee', 'date_or_period', 'branch'].includes(key),
    ) ||
    plan.context.unresolved_references.some(
      (key) => !['employee', 'date_or_period', 'branch'].includes(key),
    )
  )
    return null;
  if (plan.tasks.length === 1)
    return task.depends_on.length === 0 ? task : null;
  const catalog = plan.tasks[0];
  return catalog.intent === 'employees.list_public' &&
    catalog.action === 'read' &&
    catalog.permission.status === 'allowed' &&
    catalog.tool.status === 'ready' &&
    catalog.tool.name === 'catalog.staff.read' &&
    !catalog.requires_confirmation &&
    !catalog.requires_clarification &&
    Object.keys(catalog.entities).length === 0 &&
    catalog.depends_on.length === 0 &&
    task.depends_on.length === 1 &&
    task.depends_on[0] === catalog.id &&
    task.id !== catalog.id
    ? task
    : null;
}

const unavailable = {
  reply:
    'Не удалось подтвердить актуальную связь сотрудника с филиалом и его график. Уточните сотрудника и филиал или повторите проверку после обновления источника.',
  status: 'blocked' as const,
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function employeeScheduleReply(input: {
  execution: unknown;
  scope: StaffScheduleReadScope;
  staff: { id: string; name: string };
  branchName: string;
  date: string;
}): { reply: string; status: 'verified' | 'blocked' } {
  const execution = record(input.execution);
  const data = record(execution.result);
  const scope = record(data.read_scope);
  const source = input.scope.staffSource;
  const staff =
    Array.isArray(data.staff) && data.staff.length === 1
      ? record(data.staff[0])
      : {};
  if (
    !source ||
    execution.status !== 'completed' ||
    execution.stale === true ||
    data.verified !== true ||
    data.date !== input.date ||
    scope.contract !== 'maya.staff-schedule-read/1' ||
    scope.branch_id !== input.scope.branchId ||
    scope.timezone !== source.timezone ||
    scope.source_hash !== source.sourceHash ||
    scope.staff_id !== input.staff.id ||
    staff.id !== input.staff.id ||
    staff.name !== input.staff.name ||
    typeof staff.is_working !== 'boolean' ||
    !Array.isArray(staff.slots) ||
    staff.slots.length > 96 ||
    staff.slots.some((slot: unknown) => {
      const value = record(slot);
      return typeof value.from !== 'string' || typeof value.to !== 'string';
    })
  )
    return unavailable;
  try {
    const slots = normalizeScheduleSlots(
      staff.slots as { from: string; to: string }[],
    );
    if (staff.is_working !== slots.length > 0) return unavailable;
    const [year, month, day] = input.date.split('-');
    return {
      reply: `${execution.replayed === true ? 'Сохранённый результат проверки. ' : ''}График на ${day}.${month}.${year}: ${input.staff.name} — ${staff.is_working ? slots.map((slot) => `${slot.from}–${slot.to}`).join(', ') : 'выходной'}.\nФилиал: ${input.branchName}. Часовой пояс: ${source.timezone}. Источник: прочитанный график CRM. Свободные окна этим чтением не проверялись.`,
      status: 'verified',
    };
  } catch {
    return unavailable;
  }
}

/** Two bounded existing C9 READs. Source metadata comes from CRM, never names,
 * membership, model IDs, or the fact that a tenant has only one branch. */
export async function readEmployeeSchedule(input: {
  actor: AuthenticatedUser;
  task: ConversationSemanticTask;
  nameReferences: ReadonlyMap<string, string>;
  unresolvedReferences?: readonly string[];
  crm: Pick<
    CrmService,
    | 'resolveConfiguredBookingBranch'
    | 'resolveBookingBranchPreference'
    | 'resolveStaffScheduleSource'
  >;
  read: (
    name: 'catalog.staff.read' | 'staff.schedule.read',
    args: Record<string, unknown>,
    scope: StaffScheduleReadScope,
  ) => Promise<unknown>;
  now?: Date;
}): Promise<{ reply: string; status: 'verified' | 'blocked' }> {
  const tenantId = input.actor.tenantId!;
  if (
    input.unresolvedReferences?.includes('branch') &&
    !input.task.entities.branch
  )
    return {
      reply: 'Уточните филиал, для которого проверить график сотрудника.',
      status: 'blocked',
    };
  const branch = await input.crm.resolveConfiguredBookingBranch(tenantId);
  if (!branch) return unavailable;
  if (input.actor.branchId && input.actor.branchId !== branch.id)
    throw new ForbiddenException('staff_schedule_branch_forbidden');
  if (Object.hasOwn(input.task.entities, 'branch')) {
    const preference = input.task.entities.branch;
    if (typeof preference !== 'string' || !preference.trim())
      return unavailable;
    const name = preference.startsWith('[name removed]')
      ? input.nameReferences.get(preference)
      : preference;
    if (!name) return unavailable;
    const selected = await input.crm.resolveBookingBranchPreference(
      tenantId,
      name,
    );
    if (
      !selected ||
      selected.id !== branch.id ||
      selected.timezone !== branch.timezone
    )
      return unavailable;
  }
  const date = bookingPreferenceDate(
    input.task.entities.date_or_period,
    branch.timezone,
    input.now,
  );
  if (!date)
    return {
      reply: 'На какую одну дату показать график выбранного сотрудника?',
      status: 'blocked',
    };
  const catalogScope = {
    branchId: branch.id,
    sourceRevision: branch.sourceRevision,
  };
  const catalog = record(
    await input.read('catalog.staff.read', {}, catalogScope),
  );
  const bound = bindBookingStaff({
    staffSource:
      catalog.status === 'completed' && catalog.stale !== true
        ? catalog.result
        : null,
    employee: input.task.entities.employee,
    nameReferences: input.nameReferences,
  });
  if (bound.kind !== 'resolved')
    return {
      reply:
        bound.reason === 'staff_ambiguous_or_missing'
          ? 'Не удалось однозначно выбрать сотрудника в текущем каталоге филиала. Уточните его полное имя; график пока не подтверждён.'
          : unavailable.reply,
      status: 'blocked',
    };
  const source = await input.crm.resolveStaffScheduleSource(
    tenantId,
    bound.staff.id,
  );
  if (
    source.externalStaffId !== bound.staff.id ||
    source.branchId !== branch.id ||
    source.timezone !== branch.timezone
  )
    return unavailable;
  const scope = { ...catalogScope, staffSource: source };
  const execution = await input.read(
    'staff.schedule.read',
    { date, staff_id: bound.staff.id },
    scope,
  );
  // The scoped runtime rechecks this exact source and current policy after the
  // provider/cache awaits. Do not add metadata awaits after its final guard.
  const reply = employeeScheduleReply({
    execution,
    scope,
    staff: bound.staff,
    branchName: branch.name,
    date,
  });
  if (reply.status === 'verified') {
    input.task.entities.employee = bound.staff.name;
    input.task.entities.branch = branch.name;
    input.task.entities.date_or_period = date;
  }
  return reply;
}
