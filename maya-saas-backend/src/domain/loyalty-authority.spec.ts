import {
  LOYALTY_AUTHORITY_VALUES,
  LOYALTY_WARNING,
  loyaltyVerificationRequired,
  resolveAuthoritativeBalance,
} from './loyalty-authority';

/**
 * P5 — LOYALTY BOUNDARY.
 *
 * Правило владельца: автоматически доверять тратимому балансу можно только при
 * `authority = maya` и достаточной свежести. Для `crm` и `legacy_bot` перед
 * операцией, способной изменить баланс, нужна проверка у владельца.
 */
describe('владелец баланса лояльности', () => {
  it('словарь закрыт: три значения', () => {
    expect([...LOYALTY_AUTHORITY_VALUES].sort()).toEqual([
      'crm',
      'legacy_bot',
      'maya',
    ]);
  });

  describe('когда нужна проверка перед тратой', () => {
    it('собственный свежий реестр — доверяем без проверки', () => {
      expect(
        loyaltyVerificationRequired({ authority: 'maya', stale: false }),
      ).toBe(false);
    });

    it('🔴 внешний журнал — проверка обязательна', () => {
      // Именно здесь была ложная гарантия: баланс чужого журнала помечался
      // как собственный, и Maya обещала списание без проверки.
      expect(
        loyaltyVerificationRequired({ authority: 'legacy_bot', stale: false }),
      ).toBe(true);
    });

    it('карта провайдера — проверка обязательна', () => {
      expect(
        loyaltyVerificationRequired({ authority: 'crm', stale: false }),
      ).toBe(true);
    });

    it('устаревший собственный реестр — проверка обязательна', () => {
      expect(
        loyaltyVerificationRequired({ authority: 'maya', stale: true }),
      ).toBe(true);
    });

    it('владелец неизвестен — проверка обязательна', () => {
      expect(
        loyaltyVerificationRequired({ authority: null, stale: false }),
      ).toBe(true);
    });

    it('есть расхождение — проверка обязательна даже для своего реестра', () => {
      expect(
        loyaltyVerificationRequired({
          authority: 'maya',
          stale: false,
          hasDisagreement: true,
        }),
      ).toBe(true);
    });
  });

  describe('политика при расхождении', () => {
    it('журнал операций старше карты по доказательности', () => {
      // Карта — историческое зерно: её остаток импортируется в журнал один
      // раз, а списания её не уменьшают. Поэтому выигрывает журнал.
      expect(
        resolveAuthoritativeBalance({
          legacyBotBalance: 385,
          crmBalance: 1200,
        }),
      ).toEqual({ authority: 'legacy_bot', balance: 385 });
    });

    it('журнала нет — берётся карта', () => {
      expect(
        resolveAuthoritativeBalance({
          legacyBotBalance: null,
          crmBalance: 1200,
        }),
      ).toEqual({ authority: 'crm', balance: 1200 });
    });

    it('🔴 не знаем ничего — не выдумываем ноль', () => {
      expect(
        resolveAuthoritativeBalance({
          legacyBotBalance: null,
          crmBalance: null,
        }),
      ).toEqual({ authority: null, balance: null });
    });

    it('победитель выбирается ЯВНОЙ политикой, а не порядком вызовов', () => {
      // Один и тот же ввод всегда даёт один и тот же ответ.
      const input = { legacyBotBalance: 10, crmBalance: 99 };
      expect(resolveAuthoritativeBalance(input)).toEqual(
        resolveAuthoritativeBalance(input),
      );
    });
  });

  describe('машинные предупреждения', () => {
    it('расхождение имеет машинный код', () => {
      expect(LOYALTY_WARNING.authorityDisagreement).toBe(
        'loyalty_authority_and_external_source_disagree',
      );
    });

    it('🔴 пустой список карт не считается доказанным нулём', () => {
      expect(LOYALTY_WARNING.emptyCardListNotProvenZero).toContain(
        'not_a_proven_zero',
      );
    });

    it('кэш при недоступном владельце помечается', () => {
      expect(LOYALTY_WARNING.servedFromCache).toContain('cache');
    });
  });

  describe('домен не знает транспорта', () => {
    it('🔴 в словаре нет ни localhost, ни sqlite, ни python', () => {
      // `legacy_bot` называет РОЛЬ, а не реализацию. Когда владение переедет,
      // исчезнет значение — не поменяется транспорт.
      const all = [
        ...LOYALTY_AUTHORITY_VALUES,
        ...Object.values(LOYALTY_WARNING),
      ].join(' ');
      expect(all).not.toMatch(/localhost|sqlite|python|127\.0\.0\.1|8080/i);
    });
  });
});
