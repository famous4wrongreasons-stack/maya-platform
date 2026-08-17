import {
  basisForCalendarSource,
  isEvidencedBasis,
  REVENUE_BASIS_VALUES,
} from './revenue-basis';

/**
 * Главное правило P4:
 *
 *   одно число → один смысл → одно основание, одинаково в HTTP, AI и аналитике.
 *
 * Здесь закреплён сам словарь. Проверки сквозных путей — в соседних наборах.
 */
describe('основание денежного числа', () => {
  it('доказательным считается только отчёт кассового эндпоинта провайдера', () => {
    expect(isEvidencedBasis('provider_transactions')).toBe(true);
    expect(isEvidencedBasis('booked_prices')).toBe(false);
    expect(isEvidencedBasis('unavailable')).toBe(false);
  });

  it('🔴 цена записи НИКОГДА не становится доказанной выручкой', () => {
    // Запись существует — значит кто-то записался, а не значит, что заплатил.
    expect(isEvidencedBasis('booked_prices')).toBe(false);
  });

  it('внутренний календарь не может дать ничего, кроме цен журнала', () => {
    expect(basisForCalendarSource('internal')).toBe('booked_prices');
  });

  it('операционный обзор внешней CRM — тоже цены журнала, а не касса', () => {
    // Касса живёт в отдельном финансовом контуре и приходит другим запросом.
    expect(basisForCalendarSource('external')).toBe('booked_prices');
  });

  it('словарь закрыт: три значения, ни больше ни меньше', () => {
    expect([...REVENUE_BASIS_VALUES].sort()).toEqual([
      'booked_prices',
      'provider_transactions',
      'unavailable',
    ]);
  });

  it('🔴 в словаре нет имени, обещающего фискальное подтверждение', () => {
    // Напрашивалось `till_confirmed`, но ни чека, ни ККМ, ни кассовой смены
    // провайдер не отдаёт: в модели транзакции нет даже поля статуса.
    // Имя не должно обещать больше, чем даёт источник.
    const values = REVENUE_BASIS_VALUES as readonly string[];
    for (const forbidden of ['till_confirmed', 'fiscal', 'receipt', 'kkm']) {
      expect(values).not.toContain(forbidden);
    }
  });

  it('каждое значение словаря имеет однозначный ответ о доказательности', () => {
    for (const basis of REVENUE_BASIS_VALUES) {
      expect(typeof isEvidencedBasis(basis)).toBe('boolean');
    }
  });
});
