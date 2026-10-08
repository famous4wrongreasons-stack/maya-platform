import { sourceInstantText } from '../common/source-instant-text';
import { localCalendarDate } from '../owner-reports/owner-reports.time';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const instant = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  instant(`${value}T00:00:00.000Z`);
const body = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
const label = (value: string) => {
  const clean = value
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean;
};

/** One source-owned READ reply. Private task bodies never need a final model turn. */
export function ownTasksReply(
  value: unknown,
  stale = false,
): { reply: string; status: 'verified' | 'blocked' } {
  const data = record(value);
  const filters = record(data.filters);
  const unavailable = {
    reply:
      'Актуальный список ваших задач не подтверждён. По этим данным нельзя считать, что задач нет или что они выполнены.',
    status: 'blocked' as const,
  };
  if (
    stale ||
    data.stale === true ||
    data.contract !== 'maya.own-operational-tasks/1' ||
    data.source !== 'OperationalWorkItem' ||
    data.scope !== 'authenticated_user' ||
    typeof data.timezone !== 'string' ||
    !instant(data.as_of) ||
    !date(data.as_of_date) ||
    !['active', 'all'].includes(String(filters.status)) ||
    !['today', 'overdue', 'all'].includes(String(filters.period)) ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.historical_tasks) ||
    data.tasks.length > 100 ||
    data.historical_tasks.length > 100 ||
    data.count !== data.tasks.length ||
    data.historical_count !== data.historical_tasks.length ||
    data.historical_scope !== 'unfiltered_retained_history' ||
    typeof data.canonical_truncated !== 'boolean' ||
    typeof data.historical_truncated !== 'boolean' ||
    data.truncated !== (data.canonical_truncated || data.historical_truncated)
  )
    return unavailable;
  const tasks = data.tasks.map(record);
  const historical = data.historical_tasks.map(record);
  try {
    if (
      localCalendarDate(data.timezone, new Date(data.as_of)) !==
        data.as_of_date ||
      tasks.some(
        (task) =>
          task.canonical !== true ||
          !body(task.task) ||
          typeof task.content_truncated !== 'boolean' ||
          !['active', 'completed'].includes(String(task.status)) ||
          (filters.status === 'active' && task.status !== 'active') ||
          !instant(task.created_at) ||
          (task.due_at === null
            ? task.due_date !== null
            : !instant(task.due_at) ||
              !date(task.due_date) ||
              localCalendarDate(
                data.timezone as string,
                new Date(task.due_at),
              ) !== task.due_date) ||
          (filters.period === 'today' && task.due_date !== data.as_of_date) ||
          (filters.period === 'overdue' &&
            (!date(task.due_date) || task.due_date >= String(data.as_of_date))),
      ) ||
      historical.some(
        (task) =>
          task.canonical !== false ||
          task.read_only !== true ||
          task.status !== 'unverified' ||
          !body(task.task) ||
          typeof task.content_truncated !== 'boolean' ||
          !instant(task.created_at) ||
          ![null, 'active', 'completed'].includes(
            task.recorded_status as string | null,
          ) ||
          (task.due_date !== null && !date(task.due_date)),
      )
    )
      return unavailable;
  } catch {
    return unavailable;
  }
  const period =
    filters.period === 'today'
      ? `со сроком на сегодня, ${data.as_of_date}`
      : filters.period === 'overdue'
        ? `со сроком до ${data.as_of_date}`
        : 'за все сроки';
  const scope =
    filters.status === 'active' ? 'активные' : 'активные и выполненные';
  const lines = [
    `Ваши задачи: ${scope}, ${period}.`,
    `Данные на ${sourceInstantText(data.as_of)} (UTC). Сроки указаны по часовому поясу ${data.timezone}.`,
    tasks.length
      ? tasks
          .slice(0, 10)
          .map(
            (task) =>
              `• «${label(String(task.task))}» — ${task.status === 'completed' ? 'выполнена' : 'активна'}; ${typeof task.due_date === 'string' ? `срок ${task.due_date}` : 'срок не указан'}.`,
          )
          .join('\n')
      : 'Задач с подтверждённым текущим статусом по этим фильтрам нет.',
  ];
  if (data.canonical_truncated || tasks.length > 10)
    lines.push(
      'Показана часть задач. Полный список в этот ответ не поместился.',
    );
  if (historical.length) {
    lines.push(
      'Исторические записи — текущий статус не подтверждён. Они показаны отдельно, без фильтра по статусу и сроку.',
      historical
        .slice(0, 5)
        .map(
          (task) =>
            `• «${label(String(task.task))}»${typeof task.due_date === 'string' ? `; сохранённый срок ${task.due_date}` : ''}.`,
        )
        .join('\n'),
    );
  }
  if (data.historical_truncated || historical.length > 5)
    lines.push('Показана часть исторических записей.');
  if (
    [...tasks.slice(0, 10), ...historical.slice(0, 5)].some(
      (task) =>
        task.content_truncated === true || String(task.task).length > 240,
    )
  )
    lines.push('Длинные описания сокращены.');
  return { reply: lines.join('\n\n'), status: 'verified' };
}
