import { SERVICE_CATALOG_READ_CONTRACT } from '../crm/service-catalog-read';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const observedLabel = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 240 &&
  !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value);
const title = (value: unknown): value is string =>
  observedLabel(value) && value.trim() === value;
const same = (a: string, b: string) =>
  a.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ') ===
  b.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ');
const quoted = '(?:«([^«»]+)»|“([^“”]+)”|„([^„“]+)“|"([^"]+)")';
const command = new RegExp(
  `^(?:пожалуйста,?\\s+)?(?:переименуй(?:те)?|переименовать)\\s+услугу\\s+(?:${quoted}|№\\s*([1-9]\\d{0,14}))\\s+в\\s+${quoted}(?:\\s+в\\s+YCLIENTS)?[.!]?\\s*$`,
  'iu',
);

export type ServiceRenameChatBinding =
  | { kind: 'resolved'; arguments: { service_id: string; new_title: string } }
  | {
      kind: 'clarify';
      reason:
        | 'exact_request_required'
        | 'source_unavailable'
        | 'exact_service_required';
    };

/** Current literal user intent + current catalog identity; model fields and
 * previous ambiguous commands are never a source of a rename. */
export function bindServiceRenameChat(
  userText: string,
  sourceValue: unknown,
): ServiceRenameChatBinding {
  const match = command.exec(userText.trim());
  if (!match) return { kind: 'clarify', reason: 'exact_request_required' };
  const oldTitle = match.slice(1, 5).find((value) => value !== undefined);
  const requestedId = match[5];
  const newTitle = match.slice(6, 10).find((value) => value !== undefined);
  if (!title(newTitle) || (oldTitle !== undefined && !title(oldTitle)))
    return { kind: 'clarify', reason: 'exact_request_required' };
  const source = object(sourceValue);
  if (
    source.contract !== SERVICE_CATALOG_READ_CONTRACT ||
    source.source !== 'external_crm' ||
    source.stale === true ||
    !Array.isArray(source.services) ||
    source.services.length > 10_000
  )
    return { kind: 'clarify', reason: 'source_unavailable' };
  const services = source.services.map(object);
  if (
    services.some(
      (row) =>
        typeof row.id !== 'string' ||
        !/^[1-9]\d{0,14}$/.test(row.id) ||
        !title(row.name),
    ) ||
    new Set(services.map((row) => row.id)).size !== services.length
  )
    return { kind: 'clarify', reason: 'source_unavailable' };
  const selected = services.filter((row) =>
    requestedId ? row.id === requestedId : same(String(row.name), oldTitle!),
  );
  if (selected.length !== 1)
    return { kind: 'clarify', reason: 'exact_service_required' };
  return {
    kind: 'resolved',
    arguments: { service_id: String(selected[0].id), new_title: newTitle },
  };
}

export function serviceRenameClarification(
  reason: Extract<ServiceRenameChatBinding, { kind: 'clarify' }>['reason'],
): string {
  if (reason === 'source_unavailable')
    return 'Актуальный каталог YCLIENTS не подтверждён. Проект переименования не подготовлен.';
  if (reason === 'exact_service_required')
    return 'В текущем ответе каталога нет одной однозначной услуги. Укажите её точный номер в YCLIENTS и новое название.';
  return 'Укажите одну услугу и точное новое название: «Переименуй услугу „Старое название“ в „Новое название“» или «Переименуй услугу №123 в „Новое название“». Пока можно только проверить проект, без изменения YCLIENTS.';
}

/** Finite READ result only. A reviewed diff is not an approval or a success. */
export function serviceRenameReply(
  value: unknown,
  stale = false,
): { reply: string; status: 'verified' | 'blocked' } {
  const data = object(value);
  const blocked = {
    reply:
      'Проект переименования не подтверждён актуальными данными YCLIENTS. Изменений не выполнено.',
    status: 'blocked' as const,
  };
  if (
    stale ||
    data.stale === true ||
    data.contract !== 'maya.service-rename.preview/1' ||
    data.source !== 'external_crm' ||
    data.scope !== 'single_existing_service_title' ||
    data.preview_only !== true ||
    data.noSideEffects !== true ||
    data.blocked_reason !== 'approval_lane_not_registered' ||
    !observedLabel(data.old_title) ||
    !title(data.new_title) ||
    !observedLabel(data.booking_title) ||
    typeof data.as_of !== 'string' ||
    !Number.isFinite(Date.parse(data.as_of)) ||
    !['service_id', 'company_id'].every(
      (key) =>
        typeof data[key] === 'string' && /^[1-9]\d{0,14}$/.test(data[key]),
    ) ||
    !['source_revision', 'current_revision', 'preserved_fields_hash'].every(
      (key) =>
        typeof data[key] === 'string' && /^[a-f0-9]{64}$/.test(data[key]),
    )
  )
    return blocked;
  return {
    reply: [
      `Проект изменения внутреннего названия услуги №${String(data.service_id)} в компании YCLIENTS №${String(data.company_id)}:`,
      `Сейчас: «${data.old_title}».\nПредлагается: «${data.new_title}».`,
      `Название для онлайн-записи остаётся «${data.booking_title}».`,
      'Цена, длительность и связи с мастерами в проекте сохраняются по прочитанному состоянию CRM.',
      'Влияние внутреннего названия на печатное название услуги пока не подтверждено.',
      `Снимок CRM: ${data.as_of}. Перед будущим применением потребуется новая проверка состояния и прав.`,
      'Это только проверка проекта. Подтверждение и применение этого изменения из чата ещё не подключены. В YCLIENTS ничего не изменено.',
    ].join('\n\n'),
    status: 'verified',
  };
}
