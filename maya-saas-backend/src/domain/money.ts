/**
 * Деньги Maya. Единица измерения — В ТИПЕ, а не в комментарии.
 *
 * 🔴 Зачем это понадобилось. До P3 в одном файле границы CRM уживались два
 * представления денег: `CrmMoneyAmount { currency, amount_kopecks }` у
 * финансового контура и безымянные `total_price` / `price` / `balance` /
 * `sold_amount` в рублях у записей и лояльности. Единицу домысливал
 * потребитель, и делал это по-разному: `totalPrice * 100` без округления в
 * двух местах и `Math.round(remote.total_price * 100)` в третьем.
 *
 * Канон один: копейки, целое число. Рубли остаются только на проводе — там,
 * где формат ответа уже опубликован и менять его нельзя.
 */

export const DEFAULT_CURRENCY = 'RUB';

/** Каноническая денежная величина. Всегда целое число копеек. */
export interface Money {
  currency: string;
  amountKopecks: number;
}

/**
 * Мажорные единицы (рубли) → копейки.
 *
 * 🔴 Округление обязательно. На целых и «половинных» ценах оно тождественно
 * (`Math.round(1500 * 100) === 150000`), а на значениях, которые двоичная
 * дробь не представляет точно, оно единственное спасает от дробных копеек в
 * колонке `totalPriceKopecks`.
 */
export function majorToKopecks(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

/** Копейки → мажорные единицы. Только для провода и текста человеку. */
export function kopecksToMajor(amountKopecks: number): number {
  return amountKopecks / 100;
}

export function money(
  amountKopecks: number,
  currency: string = DEFAULT_CURRENCY,
): Money {
  return { currency, amountKopecks };
}

/** Сумма в мажорных единицах → канон. `null` остаётся `null`. */
export function moneyFromMajor(
  amountMajor: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): Money | null {
  if (amountMajor === null || amountMajor === undefined) {
    return null;
  }
  return money(majorToKopecks(amountMajor), currency);
}
