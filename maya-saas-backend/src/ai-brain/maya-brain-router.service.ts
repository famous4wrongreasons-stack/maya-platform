import { Injectable } from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import type { MayaBrainIntent, MayaBrainRoute } from './maya-brain.types';

const CLIENT_ROLES = new Set<UserRole>([UserRole.CLIENT, UserRole.CUSTOMER]);
const STAFF_ROLES = new Set<UserRole>([
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
]);

/**
 * Единственная часть мозга MAYA, которая работает ВСЕГДА — без флагов,
 * поверхностей и списка арендаторов.
 *
 * 🔴 Гейт активации убран намеренно. Он выключал маршрутизацию по умолчанию, и
 * персона клиента доставалась владельцу: разница между «директором» и
 * «администратором» — 216 строк промпта, и это единственное, что в мозге
 * действительно меняло ответ.
 */
@Injectable()
export class MayaBrainRouterService {
  route(role: UserRole, text: string): MayaBrainRoute {
    return {
      persona: CLIENT_ROLES.has(role) ? 'admin' : 'director',
      intent: this.intent(role, text),
    };
  }

  private intent(role: UserRole, raw: string): MayaBrainIntent {
    const text = raw.toLowerCase().replace(/ё/g, 'е');
    const client = CLIENT_ROLES.has(role);
    if (
      /(записат|запиши|перенес|отмен[а-яa-z]*\s+запис|свободн[а-яa-z]*\s+(?:окн|слот|врем))/i.test(
        text,
      )
    ) {
      return 'booking';
    }
    if (
      /(?:закрой|закрыть|постав[а-яa-z]*.{0,32}перерыв|сдела[а-яa-z]*.{0,32}перерыв|сократ[а-яa-z]*.{0,32}(?:день|смен[ауеы]?)|(?:измени|поменяй|установи|поставь).{0,32}(?:график|смен[ауеы]?)|(?:график|смен[ауеы]?).{0,32}(?:измени|поменяй|установи|поставь)|рабоч[а-яa-z]*\s+день.{0,32}(?:сократ|измен|закрой))/i.test(
        text,
      )
    ) {
      return 'schedule_management';
    }
    if (
      /(?:сравн[а-яa-z]*.{0,96}(?:год|месяц|недел|период).{0,96}(?:прошл|предыдущ)|(?:год|месяц|недел|период)\s+к\s+(?:году|месяцу|неделе|периоду)|динамик|тренд|просад|просел|вырос|рост|снизил|упал|потерял)/i.test(
        text,
      )
    ) {
      return 'business_analytics';
    }
    if (
      /(выруч|оборот|касс|доход|расход|прибыл|марж|средн[а-яa-z]*\s+чек|зарплат)/i.test(
        text,
      )
    ) {
      return 'finance';
    }
    if (
      /(аналитик|показател|статистик|прогноз|загруз|сколько\s+(?:клиент|запис)|отмен[а-яa-z]*|повторн[а-яa-z]*\s+клиент|популярн[а-яa-z]*\s+услуг|лучш[а-яa-z]*\s+услуг|как[ая]\s+услуг[а-яa-z]*\s+(?:лучш|хуж|просел))/i.test(
        text,
      )
    ) {
      return 'business_analytics';
    }
    if (
      !client &&
      (/(по\s+базе\s+знаний|найди\s+в\s+базе|инструкц|регламент|процедур)/i.test(
        text,
      ) ||
        (STAFF_ROLES.has(role) &&
          /(как|совет|техник|правильно).{0,64}(стрич|стриж|фейд|fade|кроп|сайд|окантов|тушев|градуир|ножниц|машинк|бород)/i.test(
            text,
          )))
    ) {
      return 'knowledge';
    }
    if (
      /(сотрудник|мастер|команд|персонал|опоздан|задач[ауи]|kpi|эффективност)/i.test(
        text,
      )
    ) {
      return 'staff_operations';
    }
    if (
      /(рассыл|маркет|акци[яию]|возврат[а-яa-z]*\s+клиент|промо)/i.test(text)
    ) {
      return 'marketing';
    }
    if (/(балл|бонус|лояльност)/i.test(text)) {
      return 'loyalty';
    }
    if (/(услуг|цен[аы]|прайс|абонемент|сертификат|кто\s+стриж)/i.test(text)) {
      return 'catalog';
    }
    if (/(ошибк|не\s+работает|проблем|помоги|поддержк)/i.test(text)) {
      return 'support';
    }
    return 'general';
  }
}
