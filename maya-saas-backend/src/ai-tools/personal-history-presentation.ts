import { AppointmentStatus } from '../common/domain.enums';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Read projection includes the existing CRM journal terminal states. These
 * values do not widen the writable AppointmentStatus or establish attendance. */
export function isPersonalAppointmentReadStatus(value: unknown): boolean {
  return (
    Object.values(AppointmentStatus).includes(value as AppointmentStatus) ||
    value === 'completed' ||
    value === 'no_show'
  );
}

/** Server-only presentation of the existing authorized B26 read. No source
 * calls, import, identity resolution, action handles or model continuation.
 * A synchronized record is not proof of an all-time complete CRM history;
 * appointment completion/payment is not proof that the person attended.
 */
export function personalHistoryReply(
  result: unknown,
  stale: boolean,
  period: 'past' | 'last_visit',
): { reply: string; status: 'verified' | 'blocked' } {
  const data = record(result),
    scope = record(data.history_scope);
  const unavailable = {
    reply:
      'Сейчас не получилось проверить вашу историю визитов. Попробуйте чуть позже.',
    status: 'blocked' as const,
  };
  if (
    stale ||
    data.stale === true ||
    !Array.isArray(data.appointments) ||
    scope.source !== 'maya_canonical' ||
    scope.coverage !== 'last_synchronized'
  )
    return unavailable;
  if (scope.enabled === false)
    return {
      reply:
        'Салон пока не открыл просмотр прошлых визитов в Maya. Ближайшие записи можно проверить отдельно.',
      status: 'blocked',
    };
  if (scope.enabled !== true) return unavailable;

  const rows: Array<{ time: number; text: string }> = [];
  const label = (value: unknown) =>
    typeof value === 'string' && value.trim() && value.length <= 120
      ? value.replace(/\s+/g, ' ').trim()
      : null;
  const now = Date.now();
  try {
    for (const value of data.appointments) {
      const item = record(value);
      if (
        !isPersonalAppointmentReadStatus(item.status) ||
        typeof item.is_upcoming !== 'boolean'
      )
        return unavailable;
      const start =
        item.start_at instanceof Date
          ? item.start_at
          : typeof item.start_at === 'string' &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
                item.start_at,
              )
            ? new Date(item.start_at)
            : null;
      if (
        !start ||
        !Number.isFinite(start.getTime()) ||
        (typeof item.start_at === 'string' &&
          start.toISOString() !== item.start_at)
      )
        return unavailable;
      if (start.getTime() >= now || item.is_upcoming) continue;
      if (
        item.attendance !== null &&
        !['arrived', 'no_show', 'awaiting', 'confirmed_by_client'].includes(
          item.attendance as string,
        )
      )
        return unavailable;
      if (
        period === 'last_visit' &&
        (item.attendance !== 'arrived' ||
          item.status === AppointmentStatus.CANCELED ||
          item.status === 'no_show')
      )
        continue;
      const branch = record(item.branch);
      const fallback =
        item.branch === null && item.timezone_source === 'tenant_default';
      const timezone =
        typeof branch.timezone === 'string' && branch.timezone.trim()
          ? branch.timezone
          : fallback && typeof item.timezone === 'string'
            ? item.timezone
            : null;
      if (!timezone?.trim()) return unavailable;
      const time = new Intl.DateTimeFormat('ru-RU', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(start);
      const services = Array.isArray(item.services)
        ? item.services
            .slice(0, 3)
            .map((service) => label(record(service).name))
            .filter(Boolean)
        : [];
      const outcome =
        item.status === AppointmentStatus.CANCELED
          ? 'запись отменена'
          : item.status === 'no_show' || item.attendance === 'no_show'
            ? 'отмечена неявка'
            : item.attendance === 'arrived'
              ? 'визит состоялся'
              : 'посещение не подтверждено';
      rows.push({
        time: start.getTime(),
        text: [
          `${time} (${timezone})`,
          label(branch.name),
          fallback ? 'время по настройке салона; филиал не указан' : null,
          services.length ? services.join(', ') : null,
          outcome,
        ]
          .filter(Boolean)
          .join(' — '),
      });
    }
  } catch {
    return unavailable;
  }
  rows.sort((a, b) => b.time - a.time || a.text.localeCompare(b.text));
  const limit = period === 'last_visit' ? 1 : 5;
  return {
    reply: [
      rows.length
        ? period === 'last_visit'
          ? 'Последний подтверждённый визит в сохранённой истории:'
          : 'Вот последние записи из вашей сохранённой истории:'
        : period === 'last_visit'
          ? 'В сохранённой истории пока нет подтверждённых состоявшихся визитов.'
          : 'В сохранённой истории пока нет прошлых записей.',
      ...rows.slice(0, limit).map((row) => row.text),
      'Это записи, уже загруженные в Maya. Более ранние или ещё не загруженные визиты здесь могут отсутствовать.',
    ].join('\n'),
    status: 'verified',
  };
}
