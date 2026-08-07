import type { AiCorePersona } from '../ai-tools/ai-core.types';

export type MayaBrainIntent =
  | 'booking'
  | 'schedule_management'
  | 'business_analytics'
  | 'finance'
  | 'staff_operations'
  | 'marketing'
  | 'knowledge'
  | 'catalog'
  | 'loyalty'
  | 'support'
  | 'general';

/**
 * Всё, что мозг MAYA решает до обращения к модели.
 *
 * 🔴 Ровно два поля, и оба меняют ответ по-настоящему. `persona` разводит
 * директора и администратора — это 216 строк разницы в промпте. `intent`
 * определяет, поедет ли вопрос в аналитику. Профили, план со статусами, память
 * предпочтений и база знаний из этой структуры убраны: прогон показал, что все
 * восемь профилей давали разницу во входе модели в две строки из 17 443, план
 * никто не читал, а память и база знаний стояли пустыми.
 */
export interface MayaBrainRoute {
  persona: AiCorePersona;
  intent: MayaBrainIntent;
}
