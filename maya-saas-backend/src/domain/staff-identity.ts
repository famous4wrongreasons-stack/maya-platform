/**
 * Идентичность мастера внутри Maya.
 *
 * 🔴 Зачем брендированный тип, а не просто `string`. До cutover право читать и
 * менять визит держалось на строковом равенстве ВНЕШНИХ идентификаторов
 * провайдера: `journalStaffBinding` отдавал `CrmStaffAccess.externalStaffId`, а
 * страж сравнивал его с `staff_id` из запроса. Оба — обычные строки, поэтому
 * подмена одного пространства идентификаторов другим не вызывала ни ошибки
 * компиляции, ни падения теста — только неверное решение о доступе.
 *
 * Бренд делает эту подмену невозможной: внешний id провайдера не присваивается
 * в переменную привязки, потому что у него другой тип. Соглашение превращается
 * в проверку компилятора.
 *
 * Единственный законный способ получить `StaffId` из внешнего идентификатора —
 * пройти через границу интеграции:
 *
 *     provider + externalId → StaffProviderLink → StaffId
 */

declare const STAFF_ID_BRAND: unique symbol;

export type StaffId = string & { readonly [STAFF_ID_BRAND]: 'StaffId' };

/**
 * Пометить строку как идентичность мастера Maya.
 *
 * 🔴 Вызывать только там, где значение ДОКАЗАННО пришло из `Staff.id`:
 * из колонки `staffId`, из результата разрешения связи провайдера или из самой
 * таблицы `Staff`. Никогда — из ответа CRM, из тела HTTP-запроса или из URL.
 */
export function asStaffId(value: string): StaffId {
  return value as StaffId;
}

export function asStaffIdOrNull(
  value: string | null | undefined,
): StaffId | null {
  return typeof value === 'string' && value.length > 0
    ? asStaffId(value)
    : null;
}
