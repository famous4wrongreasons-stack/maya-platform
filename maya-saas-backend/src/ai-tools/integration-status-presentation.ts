import { sourceInstantText } from '../common/source-instant-text';

type SourceReply = { reply: string; status: 'verified' | 'blocked' };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Prisma Date or its JSON representation. Never parse prose or normalize an invalid day. */
function sourceDate(value: unknown): string | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    return null;
  const date = new Date(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString() === canonical
    ? canonical
    : null;
}

/** Presentation of the existing tenant-scoped stored READ, never a provider probe or authority. */
export function integrationStatusReply(
  value: unknown,
  stale = false,
): SourceReply {
  const data = record(value);
  const connection = record(data.connection);
  const status = new Map([
    ['active', 'активна'],
    ['pending_activation', 'ожидает активации'],
    ['inactive', 'неактивна'],
    ['error', 'ошибка подключения'],
  ]).get(String(connection.status));
  const provider =
    new Map([
      ['yclients', 'YCLIENTS'],
      ['altegio', 'Altegio'],
      ['dikidi', 'DIKIDI'],
      ['whitelines', 'WhiteLines'],
      ['salon_online', 'Salon Online'],
      ['mock', 'тестовый провайдер'],
    ]).get(String(connection.provider)) ?? 'CRM';
  const unavailable = {
    reply:
      'Сохранённый статус интеграции недоступен или неполон. Текущая доступность CRM не подтверждена: проверка соединения не выполнялась. Следующий шаг по этим данным не установлен.',
    status: 'blocked' as const,
  };
  if (
    (data.configured !== true && data.configured !== false) ||
    (data.configured === false && data.connection !== null) ||
    (data.configured === true && !status)
  )
    return unavailable;

  const lines = [
    data.configured === false
      ? 'По сохранённым данным, интеграция CRM не настроена.'
      : `Сохранённый статус интеграции ${provider}: ${status}.`,
  ];
  if (data.calendar_source === 'external')
    lines.push('Источником календаря выбрана внешняя CRM.');
  else if (data.calendar_source === 'internal')
    lines.push('Источником календаря выбран внутренний календарь MAYA.');
  else lines.push('Источник календаря не установлен по этим данным.');

  if (data.configured === true) {
    for (const [key, label] of [
      ['last_checked_at', 'Последняя сохранённая проверка'],
      ['last_sync_at', 'Последняя сохранённая синхронизация'],
    ]) {
      const date = sourceDate(connection[key]);
      lines.push(
        date
          ? `${label}: ${sourceInstantText(date)} (UTC).`
          : `${label}: дата недоступна.`,
      );
    }
    const verifiedAt = sourceDate(connection.verified_at);
    if (connection.verified === true && verifiedAt)
      lines.push(
        `Подключение было подтверждено ${sourceInstantText(verifiedAt)} (UTC); это историческая отметка.`,
      );
  }
  lines.push(
    'Текущая доступность CRM не подтверждена: проверка соединения не выполнялась.',
  );
  if (stale || data.stale === true) {
    lines.push(
      'Источник помечен как устаревший. Следующий шаг по нему не предлагается.',
    );
    return { reply: lines.join('\n\n'), status: 'blocked' };
  }
  // Use only the source-owned next_action. Unknown or absent is never inferred from status.
  const next = new Map([
    ['connect', 'подключить CRM'],
    ['activate', 'активировать интеграцию'],
    ['reconnect', 'переподключить CRM'],
  ]).get(String(data.next_action));
  lines.push(
    next
      ? `Следующий шаг из сохранённого статуса: ${next}.`
      : data.next_action === null
        ? 'Следующий шаг в сохранённом статусе не указан.'
        : 'Следующий шаг по этим данным не установлен.',
  );
  return { reply: lines.join('\n\n'), status: 'verified' };
}
