import { BadRequestException } from '@nestjs/common';

/**
 * ЕДИНАЯ нормализация телефона для всей платформы.
 *
 * До этого в проекте жили четыре независимые реализации (common/phone.util,
 * yclients-crm.adapter, phone-auth-delivery, social-auth), и они расходились:
 * одна бросала 400 на любой не-российский номер, другая молча возвращала
 * `+<цифры>` для чего угодно. Из-за расхождения владелец, записанный в YClients
 * как `8 (999) …`, не находился по `+7999…`, и соц-вход заводил ему второй
 * client-аккаунт. Вся сверка личности обязана идти через этот модуль.
 */

/** Максимум E.164 — 15 цифр; меньше 8 у реальных номеров не бывает. */
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/** Российские эвристики: 8XXXXXXXXXX → 7XXXXXXXXXX, 10 цифр → 7XXXXXXXXXX. */
function applyRussianHeuristics(digits: string): string {
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  return digits;
}

/**
 * Приводит номер к E.164 (`+<цифры>`) НЕ бросая исключение.
 * Возвращает `null`, если строка не похожа на телефон.
 *
 * Ведущий `+` означает, что код страны уже указан, и российские эвристики к
 * такому номеру не применяются: `+380…` останется украинским, а не станет
 * `+7380…`.
 */
export function normalizePhoneE164(
  phone: string | null | undefined,
): string | null {
  const raw = String(phone ?? '').trim();

  if (!raw) {
    return null;
  }

  const hasExplicitCountryCode = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  const normalized = hasExplicitCountryCode
    ? digits
    : applyRussianHeuristics(digits);

  if (
    normalized.length < E164_MIN_DIGITS ||
    normalized.length > E164_MAX_DIGITS
  ) {
    return null;
  }

  return `+${normalized}`;
}

/**
 * Ключ сопоставления — последние 10 цифр номера.
 *
 * Нужен там, где форматы источников заведомо расходятся: в карточке YClients
 * номер мог быть записан без кода страны, с восьмёркой или с пробелами.
 * Сравнение по хвосту переживает такие расхождения, оставаясь достаточно
 * специфичным, чтобы не склеить разных людей.
 */
export function phoneMatchKey(phone: string | null | undefined): string | null {
  const normalized = normalizePhoneE164(phone);

  if (!normalized) {
    return null;
  }

  const digits = normalized.slice(1);

  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Совпадают ли два номера с точки зрения сверки личности. */
export function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = phoneMatchKey(left);
  const b = phoneMatchKey(right);

  return a !== null && b !== null && a === b;
}

/**
 * Строгий вариант для эндпоинтов, которые обязаны отклонить не-российский
 * номер (SMS-доставка, запись клиента в YClients-салон РФ). Поведение
 * сохранено ровно как было, но правила теперь общие с E.164-ядром.
 */
export function normalizeRussianPhone(phone: string): string {
  const normalized = normalizePhoneE164(phone);
  const digits = normalized ? normalized.slice(1) : '';

  if (digits.length !== 11 || !digits.startsWith('7')) {
    throw new BadRequestException(
      'Client phone must be a valid Russian number',
    );
  }

  return `+${digits}`;
}

export function phoneDigits(phone: string): string {
  return normalizeRussianPhone(phone).slice(1);
}

export function buildPhoneLoginEmail(
  tenantSlug: string,
  phone: string,
): string {
  return `phone-${phoneDigits(phone)}@${tenantSlug.toLowerCase()}.client.local`;
}

export function maskPhone(phone: string): string {
  const normalized = normalizeRussianPhone(phone);

  return `${normalized.slice(0, 2)}***${normalized.slice(-4)}`;
}
