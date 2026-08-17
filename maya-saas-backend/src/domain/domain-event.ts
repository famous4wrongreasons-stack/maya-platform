import { createHash } from 'node:crypto';

/**
 * Словарь событий Maya.
 *
 * 🔴 Имена принадлежат Maya, а не провайдеру: `appointment.cancelled`, а не
 * `record.delete`. Провайдерская форма заканчивается на границе интеграции —
 * это тот же инвариант, что глава 2 доказала для типов.
 *
 * 🔴 Здесь только то, что РЕАЛЬНО наблюдаемо сегодня (измерено в Phase A по
 * боевому журналу). Событий «на будущее» нет: несуществующий тип невозможно
 * проверить, и он молча закрепляет догадку о провайдере.
 */
export const DOMAIN_EVENT_TYPE = {
  appointmentCreated: 'appointment.created',
  appointmentRescheduled: 'appointment.rescheduled',
  appointmentStaffChanged: 'appointment.staff_changed',
  appointmentServicesChanged: 'appointment.services_changed',
  appointmentCancelled: 'appointment.cancelled',
  appointmentAttendanceRecorded: 'appointment.attendance_recorded',
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENT_TYPE)[keyof typeof DOMAIN_EVENT_TYPE];

export const DOMAIN_EVENT_TYPES: readonly DomainEventType[] =
  Object.values(DOMAIN_EVENT_TYPE);

/**
 * Версия контракта события.
 *
 * 🔴 Механизм ОДИН: имя без номера + отдельное числовое поле. Второй способ
 * (номер внутри имени, `appointment.created.v1`) не вводится — две независимые
 * записи одной и той же вещи однажды разойдутся, и никто не будет знать, какая
 * из них правда.
 */
export const DOMAIN_EVENT_VERSION = 1;

/** Что за сущность изменилась. Идентичность — всегда Maya. */
export type DomainEntityType = 'appointment' | 'client' | 'staff';

/** Как Maya узнала. Не источник, а СПОСОБ: у сверки тот же отпечаток. */
export type IngestionMethod = 'webhook' | 'reconciliation' | 'bootstrap';

/**
 * Что означает наблюдение.
 *
 * При подключении CRM Maya видит уже работающий бизнес. Считать его созданным
 * сегодня — ложь о времени, из которой глава 4 сделает ложные выводы.
 */
export type ObservationOrigin = 'observed_existing' | 'after_watch_started';

/** Состояние обработки. Приём и обработка — разные вещи. */
export type DomainEventStatus =
  /** Факт принят и сохранён. Это уже успех приёма. */
  | 'pending'
  /** Захвачен обработчиком, аренда не истекла. */
  | 'processing'
  /** Обработан. */
  | 'processed'
  /** Обработка не удалась, попытка будет повторена. */
  | 'failed'
  /** Попытки исчерпаны. Факт остаётся, обработка — нет. */
  | 'dead';

/**
 * Исход приёма. 🔴 `duplicate` — это НЕ ошибка и не `failed`.
 *
 * Повторная доставка ожидаема (измерено: до 7 доставок одной пары), а
 * повторный бизнес-эффект — нет. Смешать их значит завести ложную тревогу на
 * штатном поведении провайдера.
 */
export type IngestionOutcome =
  'persisted' | 'duplicate' | 'stale' | 'quarantined';

/**
 * Канонический отпечаток состояния.
 *
 * 🔴 Идентификатора события провайдер не даёт — доказано в Phase A по трём
 * известным форматам его вебхука. Значит дедупликация обязана строиться на
 * СОСТОЯНИИ: два одинаковых чтения дают один отпечаток, изменившееся состояние
 * даёт другой.
 *
 * 🔴 Времени в отпечатке нет намеренно. Один timestamp отпечатком не является:
 * с ним повторная доставка того же факта выглядела бы новым фактом, и вся
 * дедупликация превратилась бы в украшение.
 *
 * Значения приводятся к устойчивому виду: порядок ключей задан, `undefined` и
 * `null` неразличимы, массивы сортируются — иначе один и тот же факт, собранный
 * в другом порядке, дал бы другой ключ.
 */
export function canonicalStateFingerprint(input: {
  source: string;
  entityType: DomainEntityType;
  entityId: string;
  type: DomainEventType;
  state: Record<string, unknown>;
}): string {
  const canonical = JSON.stringify([
    input.source.trim().toLowerCase(),
    input.entityType,
    input.entityId,
    input.type,
    stableValue(input.state),
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function stableValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map(stableValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, stableValue(item)] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}
