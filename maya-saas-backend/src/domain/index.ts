/**
 * Канонический словарь Maya — единственная точка импорта: `from '../domain'`.
 *
 * 🔴 Правило направления зависимостей (проверяется линтом и `boundary.spec.ts`):
 *
 *   src/domain              → не зависит НИ ОТ ЧЕГО в src/**, кроме себя,
 *                             и не знает ни Nest, ни Prisma;
 *   src/crm                 → зависит от src/domain. ОБРАТНО — НИКОГДА;
 *   src/internal-calendar   → зависит от src/domain. От src/crm — НИКОГДА;
 *   остальные потребители   → зависят от src/domain,
 *                             а не от src/crm/crm-adapter.interface.
 *
 * Смысл правила: провайдерская специфика обязана заканчиваться внутри границы
 * CRM. Пока общий словарь лежал в файле границы, это было невозможно
 * технически — любой, кому нужен тип услуги, тянул за собой контракт адаптера.
 */

export * from './appointment-key';
export * from './catalog';
export * from './domain-event';
export * from './fetch-completeness';
export * from './loyalty-authority';
export * from './money';
export * from './revenue-basis';
export * from './scheduling';
export * from './staff-identity';
export * from './visit-attendance';
export * from './visit-outcome';
