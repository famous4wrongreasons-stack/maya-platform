import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type {
  ConversationSemanticPlan,
  ConversationSemanticTask,
} from '../conversation-intelligence/conversation-intelligence.types';
import type { CrmService } from '../crm/crm.service';
import type { ServiceCatalogReadItem } from '../crm/service-catalog-read';
import {
  bindBookingServices,
  bindBookingStaff,
} from './booking-catalog-binding';
import type { StaffScheduleReadScope } from './staff-schedule-read-scope';

type Reply = { reply: string; status: 'verified' | 'blocked' };
export const EMPLOYEE_SERVICES_UNAVAILABLE: Reply = {
  reply:
    'Не удалось подтвердить актуальный каталог услуг выбранного мастера. Повторите проверку после обновления источника.',
  status: 'blocked',
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const label = (value: unknown, max = 240): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  [...value].every(
    (char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127,
  );
const amount = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);

/** A validated singleton READ only; not an intent detector or permission grant. */
export function employeeServiceTask(
  plan: ConversationSemanticPlan | null,
): ConversationSemanticTask | null {
  if (
    !plan ||
    plan.tasks.length !== 1 ||
    !['request', 'correction', 'clarification_answer'].includes(
      plan.dialogue_act,
    )
  )
    return null;
  const task = plan.tasks[0];
  return ['services.list', 'services.price'].includes(task.intent) &&
    task.domain === 'services' &&
    task.action === 'read' &&
    task.data_class === 'C' &&
    task.permission.required === 'catalog.services.read' &&
    task.permission.status === 'allowed' &&
    task.tool.status === 'ready' &&
    task.tool.name === 'catalog.services.read' &&
    !task.requires_confirmation &&
    task.depends_on.length === 0 &&
    typeof task.entities.employee === 'string' &&
    task.entities.employee.trim().length > 0 &&
    Object.keys(task.entities).every((key) =>
      ['employee', 'branch', 'service'].includes(key),
    ) &&
    plan.context.unresolved_references.every((key) =>
      ['employee', 'branch', 'service'].includes(key),
    )
    ? task
    : null;
}

function serviceRow(value: unknown): value is ServiceCatalogReadItem {
  const row = record(value);
  if (
    Object.keys(row).length !== 9 ||
    !label(row.id, 128) ||
    !label(row.name) ||
    !amount(row.price) ||
    !amount(row.price_min) ||
    !amount(row.price_max) ||
    !(
      row.duration_minutes === null ||
      (typeof row.duration_minutes === 'number' &&
        Number.isFinite(row.duration_minutes) &&
        row.duration_minutes > 0)
    ) ||
    !(
      row.currency === null ||
      (typeof row.currency === 'string' &&
        row.currency.length === 3 &&
        /^[A-Z]{3}$/.test(row.currency))
    ) ||
    !(row.category === null || label(row.category)) ||
    !Array.isArray(row.limitations) ||
    row.limitations.length > 16 ||
    !row.limitations.every((value: unknown) => label(value, 128))
  )
    return false;
  if ((row.price_min === null) !== (row.price_max === null)) return false;
  if (
    row.price_min !== null &&
    row.price_max !== null &&
    row.price_max < row.price_min
  )
    return false;
  return row.price === null
    ? row.price_min === null || row.price_min !== row.price_max
    : row.price === row.price_min && row.price === row.price_max;
}
const money = (value: number) => String(value).replace('.', ',');
function serviceLine(row: ServiceCatalogReadItem): string {
  const currency =
    row.currency === null ? ' (валюта не указана)' : ` ${row.currency}`;
  const price =
    row.price !== null
      ? `${money(row.price)}${currency}`
      : row.price_min !== null && row.price_max !== null
        ? `${money(row.price_min)}–${money(row.price_max)}${currency}`
        : 'цена не указана';
  const duration =
    row.duration_minutes === null
      ? 'длительность не указана'
      : `${money(row.duration_minutes)} мин`;
  return `• ${row.name}: ${price}; ${duration}.`;
}

/** Exact current source projection only. Unknown amounts and ranges remain readable,
 * but never become booking terms or proof that the public catalog is exhaustive. */
export function employeeServiceReply(input: {
  execution: unknown;
  scope: StaffScheduleReadScope;
  staff: { id: string; name: string };
  service?: unknown;
}): Reply {
  const execution = record(input.execution),
    data = record(execution.result),
    scope = record(data.read_scope);
  const source = input.scope.staffSource;
  if (
    !source ||
    !label(input.staff.name) ||
    execution.status !== 'completed' ||
    (execution.stale !== undefined && execution.stale !== false) ||
    (execution.replayed !== undefined &&
      typeof execution.replayed !== 'boolean') ||
    Object.keys(data).length !== 7 ||
    data.contract !== 'maya.service-catalog.read/1' ||
    data.source !== 'external_crm' ||
    data.scope !== 'public_booking_catalog' ||
    data.catalog_exhaustive !== false ||
    typeof data.as_of !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.as_of) ||
    !Number.isFinite(Date.parse(data.as_of)) ||
    new Date(data.as_of).toISOString() !== data.as_of ||
    Object.keys(scope).length !== 5 ||
    scope.contract !== 'maya.staff-service-catalog.read/1' ||
    scope.branch_id !== input.scope.branchId ||
    scope.source_revision !== input.scope.sourceRevision ||
    scope.source_hash !== source.sourceHash ||
    scope.staff_id !== source.externalStaffId ||
    scope.staff_id !== input.staff.id ||
    !Array.isArray(data.services) ||
    data.services.length > 500 ||
    !data.services.every(serviceRow) ||
    new Set(data.services.map((row) => row.id)).size !== data.services.length
  )
    return EMPLOYEE_SERVICES_UNAVAILABLE;
  const rows = data.services;
  const selected =
    input.service === undefined
      ? null
      : bindBookingServices(data, input.service);
  if (input.service !== undefined && (!selected || selected.length !== 1))
    return {
      reply:
        'Не удалось однозначно найти указанную услугу в прочитанном каталоге выбранного мастера. Уточните её название.',
      status: 'blocked',
    };
  const saved =
    execution.replayed === true ? ['Сохранённый результат проверки.'] : [];
  if (rows.length === 0)
    return {
      reply: [
        ...saved,
        `В прочитанном публичном каталоге CRM для мастера ${input.staff.name} услуги не возвращены. Полнота каталога не подтверждена.`,
      ].join('\n'),
      status: 'verified',
    };
  const shown = selected
    ? rows.filter((row) => row.id === selected[0].id)
    : rows.slice(0, 20);
  return {
    reply: [
      ...saved,
      `Услуги мастера ${input.staff.name} по прочитанному каталогу CRM:`,
      ...shown.map(serviceLine),
      ...(selected
        ? []
        : [
            rows.length > 20
              ? 'Показаны первые 20 полученных услуг. Полнота каталога не подтверждена.'
              : 'Полнота каталога не подтверждена.',
          ]),
    ].join('\n'),
    status: 'verified',
  };
}

export async function readEmployeeServices(input: {
  actor: AuthenticatedUser;
  task: ConversationSemanticTask;
  nameReferences: ReadonlyMap<string, string>;
  unresolvedReferences: readonly string[];
  crm: Pick<
    CrmService,
    | 'resolveConfiguredBookingBranch'
    | 'resolveBookingBranchPreference'
    | 'resolveStaffScheduleSource'
  >;
  read: (
    name: 'catalog.staff.read' | 'catalog.services.read',
    args: Record<string, unknown>,
    scope: StaffScheduleReadScope,
  ) => Promise<unknown>;
}): Promise<Reply> {
  const entities = input.task.entities;
  if (
    input.task.requires_clarification ||
    input.unresolvedReferences.length > 0 ||
    (input.task.intent === 'services.price' && !label(entities.service))
  )
    return {
      reply:
        'Уточните мастера, филиал и одну услугу, цену которой нужно проверить.',
      status: 'blocked',
    };
  const resolveMention = (value: unknown) =>
    typeof value === 'string' && value.startsWith('[name removed]')
      ? input.nameReferences.get(value)
      : value;
  const service = Object.hasOwn(entities, 'service')
    ? resolveMention(entities.service)
    : undefined;
  if (Object.hasOwn(entities, 'service') && !label(service))
    return EMPLOYEE_SERVICES_UNAVAILABLE;
  const tenantId = input.actor.tenantId!;
  const branch = await input.crm.resolveConfiguredBookingBranch(tenantId);
  if (!branch) return EMPLOYEE_SERVICES_UNAVAILABLE;
  if (input.actor.branchId && input.actor.branchId !== branch.id)
    throw new ForbiddenException('staff_services_branch_forbidden');
  if (Object.hasOwn(entities, 'branch')) {
    const name = resolveMention(entities.branch);
    if (!label(name)) return EMPLOYEE_SERVICES_UNAVAILABLE;
    const selected = await input.crm.resolveBookingBranchPreference(
      tenantId,
      name,
    );
    if (
      !selected ||
      selected.id !== branch.id ||
      selected.timezone !== branch.timezone
    )
      return EMPLOYEE_SERVICES_UNAVAILABLE;
  }
  const catalogScope = {
    branchId: branch.id,
    sourceRevision: branch.sourceRevision,
  };
  const catalog = record(
    await input.read('catalog.staff.read', {}, catalogScope),
  );
  const bound = bindBookingStaff({
    staffSource:
      catalog.status === 'completed' &&
      (catalog.stale === undefined || catalog.stale === false)
        ? catalog.result
        : null,
    employee: entities.employee,
    nameReferences: input.nameReferences,
  });
  if (bound.kind !== 'resolved')
    return bound.reason === 'staff_ambiguous_or_missing'
      ? {
          reply:
            'Не удалось однозначно выбрать мастера в текущем каталоге филиала. Уточните его полное имя.',
          status: 'blocked',
        }
      : EMPLOYEE_SERVICES_UNAVAILABLE;
  const source = await input.crm.resolveStaffScheduleSource(
    tenantId,
    bound.staff.id,
  );
  if (
    source.externalStaffId !== bound.staff.id ||
    source.branchId !== branch.id ||
    source.timezone !== branch.timezone
  )
    return EMPLOYEE_SERVICES_UNAVAILABLE;
  const scope = { ...catalogScope, staffSource: source };
  const execution = await input.read('catalog.services.read', {}, scope);
  // Runtime performs the final current authority/source guard, including cached reads.
  // No additional metadata await may widen that gap before completion.
  const reply = employeeServiceReply({
    execution,
    scope,
    staff: bound.staff,
    service,
  });
  if (reply.status === 'verified') {
    entities.employee = bound.staff.name;
    entities.branch = branch.name;
  }
  return reply;
}
