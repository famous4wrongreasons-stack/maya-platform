import {
  CONFIRMED_REVENUE_UNAVAILABLE,
  NET_PROFIT_UNAVAILABLE,
} from './operations-analytics.service';

/**
 * P4 — FINANCIAL TRUTH. Главное правило:
 *
 *   одно число → один смысл → одно основание, одинаково в HTTP, AI и аналитике.
 *
 * Здесь закреплены утверждения, которые обязаны пережить любую последующую
 * правку финансового контура.
 */
describe('финансовая правда', () => {
  describe('словарь причин', () => {
    it('🔴 недостижимая причина удалена', () => {
      // До P4 существовала `crm_returned_cash_revenue_without_confirmation`.
      // Она обещала различать «касса пришла без подтверждения» и «кассы нет»,
      // но первого состояния провайдер породить НЕ МОЖЕТ: признака подтверждения
      // у операции он не отдаёт, а адаптер ставит `available + verified` вместе
      // либо не ставит вовсе.
      const values = Object.values(CONFIRMED_REVENUE_UNAVAILABLE);
      expect(values).not.toContain(
        'crm_returned_cash_revenue_without_confirmation',
      );
    });

    it('её место заняла причина, описывающая достижимое состояние', () => {
      expect(CONFIRMED_REVENUE_UNAVAILABLE.crmRevenueBlockUnavailable).toBe(
        'crm_finance_returned_no_usable_revenue_block_for_this_period',
      );
    });

    it('появилась причина отказа прибыли из-за отброшенных возвратов', () => {
      expect(NET_PROFIT_UNAVAILABLE.discardedNegativeTransactions).toContain(
        'negative_transactions',
      );
    });

    it('🔴 ни одна причина не обещает фискального подтверждения', () => {
      // `till_confirmed` в старых формулировках описывал кассу так, будто у неё
      // есть чек. Чека нет — фискального контура у интеграции не существует.
      const all = [
        ...Object.values(CONFIRMED_REVENUE_UNAVAILABLE),
        ...Object.values(NET_PROFIT_UNAVAILABLE),
      ].join(' ');
      expect(all).not.toMatch(/receipt|fiscal|kkm/i);
    });
  });

  describe('прибыль при отброшенных отрицательных операциях', () => {
    /**
     * Воспроизводит правило, реализованное в `getBusinessProfitability`:
     * выручка валовая (возвраты выброшены агрегатором), поэтому прибыль от неё
     * завышена ровно на их сумму — в ту сторону, про которую соседний
     * комментарий в коде говорит «ошибаться нельзя».
     *
     * Семантику возврата контракт провайдера доказать не позволяет, поэтому мы
     * НЕ вычитаем — мы отказываемся.
     */
    const profitDecision = (discardedNegative: number) =>
      discardedNegative > 0
        ? {
            status: 'unavailable',
            reason: NET_PROFIT_UNAVAILABLE.discardedNegativeTransactions,
          }
        : { status: 'available', reason: null };

    it('есть отброшенные отрицательные — прибыль недоступна с причиной', () => {
      const decision = profitDecision(1);
      expect(decision.status).toBe('unavailable');
      expect(decision.reason).toBe(
        NET_PROFIT_UNAVAILABLE.discardedNegativeTransactions,
      );
    });

    it('нет отброшенных — прибыль считается как раньше', () => {
      expect(profitDecision(0).status).toBe('available');
    });

    it('🔴 лучше отказать, чем завысить', () => {
      // Явная формулировка правила, а не следствие реализации.
      expect(profitDecision(1).status).not.toBe('available');
    });
  });
});
