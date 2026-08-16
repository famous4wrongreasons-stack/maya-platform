import { kopecksToMajor, majorToKopecks, moneyFromMajor } from './money';

/**
 * Что доказывает этот файл: перевод трёх разрозненных конверсий на одного
 * владельца не изменил ни одной суммы на достижимых значениях.
 *
 * До P3 в `appointments.service` жили ТРИ разных выражения: `totalPrice * 100`
 * без округления в двух местах и `Math.round(remote.total_price * 100)` в
 * третьем. Округление добавлено везде: на целых и половинных ценах оно
 * тождественно, а на значениях, которые двоичная дробь не представляет точно,
 * единственное спасает от дробных копеек в целочисленной колонке.
 */

const REACHABLE_PRICES = [0, 1, 100, 1500, 2500.5, 999.5, 12345];

describe('канонические деньги', () => {
  it.each(REACHABLE_PRICES)(
    'на достижимой цене %s округление ничего не изменило',
    (price) => {
      expect(majorToKopecks(price)).toBe(price * 100);
    },
  );

  it('дробных копеек больше не бывает', () => {
    // 🔴 Прежнее `0.1 + 0.2` дало бы 30.000000000000004 копейки в колонке,
    // объявленной целым числом.
    expect(majorToKopecks(0.1 + 0.2)).toBe(30);
    expect(Number.isInteger(majorToKopecks(1234.567))).toBe(true);
  });

  it('обратная конверсия совпадает с прежним делением', () => {
    expect(kopecksToMajor(150000)).toBe(150000 / 100);
    expect(kopecksToMajor(1)).toBe(0.01);
  });

  it('отсутствие суммы остаётся отсутствием, а не нулём', () => {
    expect(moneyFromMajor(null)).toBeNull();
    expect(moneyFromMajor(undefined)).toBeNull();
    expect(moneyFromMajor(0)).toEqual({ currency: 'RUB', amountKopecks: 0 });
  });
});
