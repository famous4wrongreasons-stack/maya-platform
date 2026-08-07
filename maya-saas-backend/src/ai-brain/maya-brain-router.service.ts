import { Injectable } from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import type {
  MayaBrainIntent,
  MayaBrainPlan,
  MayaBrainProfile,
  MayaBrainRoute,
} from './maya-brain.types';

const CLIENT_ROLES = new Set<UserRole>([UserRole.CLIENT, UserRole.CUSTOMER]);
const STAFF_ROLES = new Set<UserRole>([
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
]);

const FINANCE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ACCOUNTANT,
]);

@Injectable()
export class MayaBrainRouterService {
  route(role: UserRole, text: string): MayaBrainRoute {
    const intent = this.intent(role, text);
    const profile = this.profile(role, intent);
    return {
      persona: CLIENT_ROLES.has(role) ? 'admin' : 'director',
      profile,
      intent,
      knowledgeRequired: intent === 'knowledge',
      plan: this.plan(intent),
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

  private profile(role: UserRole, intent: MayaBrainIntent): MayaBrainProfile {
    if (CLIENT_ROLES.has(role)) {
      return intent === 'booking' ? 'maya_admin' : 'maya_consult';
    }
    if (intent === 'finance' && FINANCE_ROLES.has(role)) {
      return 'maya_finance';
    }
    if (intent === 'business_analytics') {
      return 'maya_analytics';
    }
    if (intent === 'marketing') {
      return 'maya_marketing';
    }
    if (intent === 'staff_operations') {
      return 'maya_hr';
    }
    if (intent === 'booking' || intent === 'schedule_management') {
      return 'maya_admin';
    }
    if (intent === 'support') {
      return 'maya_assistant';
    }
    return 'maya_os';
  }

  private plan(intent: MayaBrainIntent): MayaBrainPlan {
    const keys: Record<MayaBrainIntent, string[]> = {
      booking: [
        'resolve_service',
        'resolve_staff_preference',
        'resolve_date_time',
        'verify_availability',
        'confirm_booking',
      ],
      schedule_management: [
        'resolve_staff',
        'resolve_date',
        'read_schedule',
        'check_conflicts',
        'request_approval',
      ],
      business_analytics: ['resolve_metric', 'read_source', 'explain_result'],
      finance: ['resolve_period', 'read_finance_source', 'explain_result'],
      staff_operations: ['resolve_staff_scope', 'read_staff_source', 'respond'],
      marketing: ['resolve_audience', 'prepare_draft', 'request_approval'],
      knowledge: ['retrieve_sources', 'answer_with_citations'],
      catalog: ['read_catalog', 'respond'],
      loyalty: ['read_loyalty', 'respond'],
      support: ['identify_problem', 'offer_safe_next_step'],
      general: ['respond'],
    };
    return {
      status: 'active',
      steps: keys[intent].map((key) => ({ key, status: 'pending' })),
    };
  }
}
