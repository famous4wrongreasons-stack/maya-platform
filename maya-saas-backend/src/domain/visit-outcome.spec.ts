import {
  CANCELED_STATUS_VALUES,
  isCanceledOutcome,
  isCompletedOutcome,
  isNoShowOutcome,
  parseVisitOutcome,
} from './visit-outcome';

/**
 * Главное, что обязан доказать этот файл: объединение четырёх разрозненных
 * нормализаторов НЕ изменило классификацию.
 *
 * Поэтому здесь воспроизведены прежние реализации всех четырёх мест — ровно
 * так, как они выглядели до P3, — и канон сверяется с ними на общем словаре.
 */

// --- как это выглядело до P3 -------------------------------------------------

const legacyAppointmentsIsCancelled = (status: string): boolean => {
  const normalized = status.trim().toLowerCase();
  return normalized === 'canceled' || normalized === 'cancelled';
};

const legacyAnalyticsIsCancelled = (status: string): boolean =>
  ['canceled', 'cancelled'].includes(status.trim().toLowerCase());

const legacyAnalyticsIsCompleted = (status: string): boolean =>
  ['completed', 'complete', 'done', 'visited'].includes(
    status.trim().toLowerCase(),
  );

const legacyAnalyticsIsNoShow = (status: string): boolean =>
  ['no_show', 'no-show', 'noshow', 'did_not_come'].includes(
    status.trim().toLowerCase(),
  );

const legacyAiToolStatus = (
  value: string,
): 'no_show' | 'canceled' | 'completed' | 'other' => {
  const status = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (status === 'no_show' || status === 'noshow') return 'no_show';
  if (status === 'canceled' || status === 'cancelled') return 'canceled';
  if (status === 'completed' || status === 'done' || status === 'visited') {
    return 'completed';
  }
  return 'other';
};

const currentAiToolStatus = (
  value: string,
): 'no_show' | 'canceled' | 'completed' | 'other' => {
  const outcome = parseVisitOutcome(value);
  return outcome === 'scheduled' || outcome === 'unknown' ? 'other' : outcome;
};

/**
 * Словарь, который система РЕАЛЬНО производит.
 *
 * Адаптер YCLIENTS выпускает `canceled | no_show | completed | confirmed`
 * (`recordStatus`), внутренний календарь пишет `confirmed | canceled`
 * (`AppointmentStatus`). На момент P3 в боевой базе у всех записей ровно один
 * статус — `completed`.
 */
const REACHABLE_STATUSES = [
  'confirmed',
  'completed',
  'canceled',
  'no_show',
  'cancelled',
  'Completed',
  '  canceled  ',
];

describe('канонический исход визита', () => {
  it.each(REACHABLE_STATUSES)(
    'на достижимом значении «%s» классификация не изменилась',
    (status) => {
      expect(isCanceledOutcome(status)).toBe(
        legacyAppointmentsIsCancelled(status),
      );
      expect(isCanceledOutcome(status)).toBe(
        legacyAnalyticsIsCancelled(status),
      );
      expect(isCompletedOutcome(status)).toBe(
        legacyAnalyticsIsCompleted(status),
      );
      expect(isNoShowOutcome(status)).toBe(legacyAnalyticsIsNoShow(status));
      expect(currentAiToolStatus(status)).toBe(legacyAiToolStatus(status));
    },
  );

  it('разбирает написания, ради которых потребители держали свои списки', () => {
    expect(parseVisitOutcome('cancelled')).toBe('canceled');
    expect(parseVisitOutcome('no-show')).toBe('no_show');
    expect(parseVisitOutcome('noshow')).toBe('no_show');
    expect(parseVisitOutcome('did_not_come')).toBe('no_show');
    expect(parseVisitOutcome('visited')).toBe('completed');
    expect(parseVisitOutcome('confirmed')).toBe('scheduled');
  });

  it('незнакомое значение — «не разобрано», а не тихая подстановка', () => {
    expect(parseVisitOutcome('какая-то дичь')).toBe('unknown');
    expect(parseVisitOutcome('')).toBe('unknown');
    expect(parseVisitOutcome(null)).toBe('unknown');
    expect(parseVisitOutcome(undefined)).toBe('unknown');
  });

  it('состав написаний «отменено» для запроса к базе не менялся', () => {
    // 🔴 Это значения ДЛЯ ЗАПРОСА, а не синонимы для разбора: их состав
    // определяет выборку `status: { notIn: ... }` во внутреннем календаре.
    expect([...CANCELED_STATUS_VALUES]).toEqual(['canceled', 'cancelled']);
  });
});
