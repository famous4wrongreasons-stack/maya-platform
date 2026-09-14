/**
 * Ключ записи, пришедшей из внешней CRM.
 *
 * 🔴 Зачем это понадобилось. Формат `crm-<externalId>` собирал адаптер
 * (`yclients-crm.adapter.ts`), а разбирал — потребитель за границей CRM, своим
 * `startsWith('crm-') ? slice(4)` в службе уведомлений. Владельца у формата не
 * было: два места знали одну и ту же строковую договорённость, и изменение
 * одного молча ломало второе.
 *
 * Здесь этот формат получает единственного владельца. Сама строка не меняется —
 * она уже уехала в базу и на провод.
 */

export const CRM_APPOINTMENT_KEY_PREFIX = 'crm-';

/** Внешний id записи → доменный ключ визита. */
export function encodeCrmAppointmentKey(externalId: string): string {
  return `${CRM_APPOINTMENT_KEY_PREFIX}${externalId}`;
}

/**
 * Доменный ключ визита → внешний id записи.
 *
 * Ключ без префикса возвращается как есть: у записи внутреннего календаря
 * внешнего id нет, и её собственный идентификатор — это и есть ключ.
 */
export function decodeCrmAppointmentKey(key: string): string {
  return key.startsWith(CRM_APPOINTMENT_KEY_PREFIX)
    ? key.slice(CRM_APPOINTMENT_KEY_PREFIX.length)
    : key;
}

export function isCrmAppointmentKey(key: string): boolean {
  return key.startsWith(CRM_APPOINTMENT_KEY_PREFIX);
}
