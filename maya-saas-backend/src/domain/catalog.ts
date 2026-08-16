/**
 * Каталог салона: что продаём и кто оказывает.
 *
 * 🔴 Почему эти типы живут ЗДЕСЬ, а не в границе CRM. `CrmService.getServices`
 * и `CrmService.getStaff` — фасад над ДВУМЯ источниками: при внутреннем
 * календаре они возвращают `internalCalendarService.listServices/listStaff`, при
 * внешнем — `adapter.getServices/getStaff`. Оба источника обязаны иметь общий
 * тип. Пока этот тип лежал в `crm/crm-adapter.interface.ts`, внутренний
 * календарь был ВЫНУЖДЕН импортировать границу CRM и одевать собственные данные
 * в форму, заданную адаптером YCLIENTS, — ровно то, что запрещено.
 *
 * Шов проходит ниже обоих источников. `src/crm` и `src/internal-calendar`
 * зависят отсюда; обратной зависимости нет и быть не может.
 *
 * 🔴 Форма полей намеренно оставлена как есть (snake_case). `/staff` и
 * `/services` отдают эти объекты на провод ДОСЛОВНО, без DTO
 * (`staff.service.ts` → `staff.controller.ts`), и переименование поля здесь —
 * это изменение публичного API и поломка выпущенного PWA.
 */

/** Услуга каталога. `price` — в мажорных единицах: так она уже на проводе. */
export interface ServiceOffering {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  currency: string;
  category?: string;
}

/**
 * Мастер каталога.
 *
 * `rating` — поле провайдерского происхождения: у YCLIENTS оно приходит из
 * `staff.rating`, а внутренний календарь вынужден подставлять `null`, потому
 * что своего рейтинга у него нет. Поле остаётся в контракте только потому, что
 * его читает выпущенный PWA. Его вынос в презентер CRM — отдельная работа,
 * требующая согласованной правки фронта.
 */
export interface Practitioner {
  id: string;
  name: string;
  title?: string;
  specialization?: string;
  avatar_url?: string | null;
  rating?: number | null;
}

/** Мастер с признаками доступа — то, что показывает центр интеграций. */
export interface PractitionerAccessCandidate extends Practitioner {
  bookable: boolean;
  suggested_role: 'administrator' | 'staff';
}
