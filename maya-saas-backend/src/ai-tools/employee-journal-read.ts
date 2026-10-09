import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type {
  ConversationSemanticPlan,
  ConversationSemanticTask,
} from '../conversation-intelligence/conversation-intelligence.types';
import type { CrmService } from '../crm/crm.service';
import {
  bindBookingStaff,
  bookingPreferenceDate,
} from './booking-catalog-binding';
import type { StaffScheduleReadScope } from './staff-schedule-read-scope';

/** Exact existing employee journal task, optionally preceded by its public catalog READ.
 * This consumes a validated plan; it does not detect intent or grant access. */
export function employeeJournalTask(
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
    task.intent !== 'operations.journal_day' ||
    task.domain !== 'schedule' ||
    task.action !== 'read' ||
    task.data_class !== 'C' ||
    task.permission.required !== 'operations.journal.read' ||
    task.permission.status !== 'allowed' ||
    task.tool.status !== 'ready' ||
    task.tool.name !== 'operations.journal.read' ||
    task.requires_confirmation ||
    typeof task.entities.employee !== 'string' ||
    !task.entities.employee.trim() ||
    Object.keys(task.entities).some(
      (key) => !['employee', 'period', 'branch'].includes(key),
    ) ||
    plan.context.unresolved_references.some(
      (key) => !['employee', 'period', 'branch'].includes(key),
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
    'Не удалось подтвердить актуальную связь сотрудника с филиалом и его журнал записей. Уточните сотрудника и филиал или повторите проверку после обновления источника.',
  status: 'blocked' as const,
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Present only the exact PII-free source projection. No recomputation of totals,
 * attendance, money or availability; partial source/visible truncation stays explicit. */
export function employeeJournalReply(input: {
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
  const completeness = record(data.completeness);
  const appointments = data.appointments;
  const statuses: Record<string, string> = {
    scheduled: 'запланирована',
    confirmed: 'подтверждена',
    completed: 'отмечена завершённой в CRM',
    cancelled: 'отменена',
    canceled: 'отменена',
    no_show: 'неявка по статусу записи',
    pending: 'ожидает подтверждения',
    unknown: 'статус не уточнён',
  };
  const clock = (v: unknown) =>
    typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  const text = (v: unknown) =>
    typeof v === 'string' &&
    v.trim().length > 0 &&
    v.length <= 300 &&
    [...v].every(
      (character) =>
        character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
    );
  if (
    !source ||
    execution.status !== 'completed' ||
    execution.stale === true ||
    data.verified !== true ||
    data.pii_redacted !== true ||
    data.date !== input.date ||
    data.timezone !== source.timezone ||
    scope.contract !== 'maya.employee-journal-read/1' ||
    scope.branch_id !== input.scope.branchId ||
    scope.timezone !== source.timezone ||
    scope.source_hash !== source.sourceHash ||
    scope.staff_id !== input.staff.id ||
    record(data.staff_scope).name !== input.staff.name ||
    typeof completeness.status !== 'string' ||
    !['complete', 'incomplete'].includes(completeness.status) ||
    typeof completeness.zero_means_none !== 'boolean' ||
    typeof data.appointments_truncated !== 'boolean' ||
    !Array.isArray(appointments) ||
    appointments.length > 100 ||
    data.appointments_returned !== appointments.length ||
    appointments.some((item: unknown) => {
      const row = record(item);
      return (
        !clock(row.time) ||
        !clock(row.end_time) ||
        typeof row.status !== 'string' ||
        !Object.hasOwn(statuses, row.status) ||
        !Array.isArray(row.services) ||
        row.services.length > 32 ||
        row.services.some((service: unknown) => !text(service))
      );
    })
  )
    return unavailable;
  const [year, month, day] = input.date.split('-');
  const visible = appointments.slice(0, 12).map((item: unknown) => {
    const row = record(item);
    return `${row.time as string}–${row.end_time as string} — ${(row.services as string[]).join(', ') || 'услуга не указана'} (${statuses[row.status as string]})`;
  });
  const partial = completeness.status !== 'complete';
  return {
    status: 'verified',
    reply: [
      `${execution.replayed === true ? 'Сохранённый результат проверки. ' : ''}Журнал на ${day}.${month}.${year}: ${input.staff.name}.`,
      `Филиал: ${input.branchName}. Часовой пояс: ${source.timezone}.`,
      partial
        ? 'Источник прочитан не полностью; отсутствие других записей не подтверждено.'
        : '',
      visible.length
        ? `Записи из полученного среза: ${visible.join('; ')}.`
        : !partial &&
            !data.appointments_truncated &&
            completeness.zero_means_none
          ? 'В подтверждённом срезе записей нет.'
          : 'В полученном срезе записи не показаны; это не подтверждает отсутствие записей.',
      data.appointments_truncated || appointments.length > 12
        ? 'Показана только часть полученных записей.'
        : '',
      'Источник: прочитанный журнал CRM. Имена и контакты клиентов не раскрываются; присутствие и свободные окна этим ответом не подтверждаются.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Two bounded existing C9 READs for the PII-free employee journal. Source metadata comes from CRM, never names,
 * membership, model IDs, or the fact that a tenant has only one branch. */
export async function readEmployeeJournal(input: {
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
    name: 'catalog.staff.read' | 'operations.journal.read',
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
      reply: 'Уточните филиал, для которого проверить журнал сотрудника.',
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
    input.task.entities.period,
    branch.timezone,
    input.now,
  );
  if (!date)
    return {
      reply: 'На какую одну дату показать журнал выбранного сотрудника?',
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
          ? 'Не удалось однозначно выбрать сотрудника в текущем каталоге филиала. Уточните его полное имя; журнал пока не подтверждён.'
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
    'operations.journal.read',
    { date, staff_id: bound.staff.id },
    scope,
  );
  // The scoped runtime rechecks this exact source and current policy after the
  // provider/cache awaits. Do not add metadata awaits after its final guard.
  const reply = employeeJournalReply({
    execution,
    scope,
    staff: bound.staff,
    branchName: branch.name,
    date,
  });
  if (reply.status === 'verified') {
    input.task.entities.employee = bound.staff.name;
    input.task.entities.branch = branch.name;
    input.task.entities.period = date;
  }
  return reply;
}
