/**
 * Часовой пояс салона — один ответ на один вопрос.
 *
 * 🔴 До этого у пояса было ДВА владельца, и они расходились. Бронирование брало
 * `branch?.timezone ?? 'Europe/Moscow'` (двенадцать мест в appointments,
 * половина из них — голая константа), журнал брал `tenant.defaultTimezone`, а
 * синхронизация с CRM обновляла только арендатора. Филиал получал пояс один раз
 * при создании и не обновлялся никогда — в коде нет ни одного `branch.update`.
 *
 * Вред не в том, что на двух экранах разное время. Настенное время брони
 * считается в поясе ФИЛИАЛА и в этом же виде уходит в CRM. Салон в Новосибирске
 * регистрируется без явного пояса (филиал получает московский), подключает CRM
 * (арендатор получает Asia/Novosibirsk) — клиент выбирает 10:00 по салону, а в
 * `records/{company}` уезжает 06:00. Запись садится на неверный час либо
 * отбивается 422. Сопоставление со слотом при этом проходит: обе стороны
 * считаются одним и тем же неверным поясом, поэтому ошибка не видна до самой
 * CRM.
 *
 * Сегодня прод цел ровно потому, что единственный салон в Москве.
 *
 * Порядок разрешения: явный пояс филиала → пояс арендатора → московский.
 * Филиал стоит первым намеренно: у сети салонов филиалы законно живут в разных
 * поясах, и синхронизация с одной компанией CRM не должна их перетирать.
 */
export const DEFAULT_SALON_TIMEZONE = 'Europe/Moscow';

/**
 * Существует ли такая зона.
 *
 * Подсунутая ерунда сломала бы форматирование дат на всех экранах разом,
 * поэтому непригодное значение молча отбрасывается в пользу следующего в
 * очереди, а не превращает страницу в ошибку.
 */
export function isUsableTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

export function resolveSalonTimezone(input: {
  branchTimezone?: string | null;
  tenantTimezone?: string | null;
}): string {
  if (isUsableTimezone(input.branchTimezone)) {
    return input.branchTimezone.trim();
  }

  if (isUsableTimezone(input.tenantTimezone)) {
    return input.tenantTimezone.trim();
  }

  return DEFAULT_SALON_TIMEZONE;
}
