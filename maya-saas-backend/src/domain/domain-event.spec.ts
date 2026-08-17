import {
  DOMAIN_EVENT_TYPE,
  DOMAIN_EVENT_TYPES,
  DOMAIN_EVENT_VERSION,
  canonicalStateFingerprint,
} from './domain-event';

/**
 * 🔴 CYCLE 03 B1 — отпечаток состояния как замена отсутствующему
 * идентификатору события.
 *
 * Провайдер не даёт идентификатора события ни в одном из трёх известных
 * форматов вебхука, и повторяет доставки: за неделю измерено 421 доставка на
 * 148 записей, до семи повторов одной пары. Значит различать «то же самое» и
 * «изменилось» обязан сам отпечаток.
 */

const base = {
  source: 'yclients',
  entityType: 'appointment' as const,
  entityId: 'appointment-maya-1',
  type: DOMAIN_EVENT_TYPE.appointmentCreated,
};

describe('отпечаток канонического состояния', () => {
  it('🔴 повторная доставка того же состояния даёт ТОТ ЖЕ отпечаток', () => {
    const state = {
      staffId: 'staff-1',
      startAt: '2026-08-20T10:00:00.000Z',
      serviceIds: ['svc-1', 'svc-2'],
    };

    expect(canonicalStateFingerprint({ ...base, state })).toBe(
      canonicalStateFingerprint({ ...base, state: { ...state } }),
    );
  });

  it('🔴 изменившееся состояние даёт ДРУГОЙ отпечаток', () => {
    const before = canonicalStateFingerprint({
      ...base,
      state: { staffId: 'staff-1', startAt: '2026-08-20T10:00:00.000Z' },
    });
    const after = canonicalStateFingerprint({
      ...base,
      state: { staffId: 'staff-2', startAt: '2026-08-20T10:00:00.000Z' },
    });

    expect(after).not.toBe(before);
  });

  it('порядок ключей и порядок услуг не меняют отпечаток', () => {
    // Иначе один и тот же факт, собранный другим кодом, выглядел бы новым.
    const left = canonicalStateFingerprint({
      ...base,
      state: { serviceIds: ['b', 'a'], staffId: 'staff-1' },
    });
    const right = canonicalStateFingerprint({
      ...base,
      state: { staffId: 'staff-1', serviceIds: ['a', 'b'] },
    });

    expect(left).toBe(right);
  });

  it('отсутствующее и пустое значение неразличимы', () => {
    const withNull = canonicalStateFingerprint({
      ...base,
      state: { staffId: 'staff-1', notes: null },
    });
    const withUndefined = canonicalStateFingerprint({
      ...base,
      state: { staffId: 'staff-1', notes: undefined },
    });

    expect(withNull).toBe(withUndefined);
  });

  it('🔴 времени в отпечатке нет: иначе дедупликации не существует', () => {
    // Прямая проверка правила «один timestamp не является отпечатком».
    const state = { staffId: 'staff-1' };
    const first = canonicalStateFingerprint({ ...base, state });
    jest.useFakeTimers().setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    const later = canonicalStateFingerprint({ ...base, state });
    jest.useRealTimers();

    expect(later).toBe(first);
  });

  it('разные сущности и разные типы не сталкиваются', () => {
    const asCreated = canonicalStateFingerprint({ ...base, state: {} });
    const asCancelled = canonicalStateFingerprint({
      ...base,
      type: DOMAIN_EVENT_TYPE.appointmentCancelled,
      state: {},
    });
    const otherEntity = canonicalStateFingerprint({
      ...base,
      entityId: 'appointment-maya-2',
      state: {},
    });

    expect(new Set([asCreated, asCancelled, otherEntity]).size).toBe(3);
  });

  it('источник входит в отпечаток: тот же визит из другого источника — другой факт', () => {
    const fromCrm = canonicalStateFingerprint({ ...base, state: {} });
    const fromInternal = canonicalStateFingerprint({
      ...base,
      source: 'internal_calendar',
      state: {},
    });

    expect(fromInternal).not.toBe(fromCrm);
  });
});

describe('словарь событий', () => {
  it('🔴 имена принадлежат Maya, а не провайдеру', () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      // Границы слова важны: `attendance_recorded` — канон Maya, а `record`
      // как отдельное слово — словарь провайдера.
      expect(type).not.toMatch(/\brecord\b|\bresource\b|yclients|alteg/i);
      expect(type).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('🔴 интерпретации в словаре нет — только факты', () => {
    // Граница WATCH: «отменено» — факт, «ценный клиент потерян» — вывод.
    const forbidden = ['lost', 'churn', 'opportunity', 'recovered', 'risk'];
    for (const type of DOMAIN_EVENT_TYPES) {
      for (const word of forbidden) {
        expect(type).not.toContain(word);
      }
    }
  });

  it('версия задана ОДНИМ способом: номер вне имени', () => {
    expect(DOMAIN_EVENT_VERSION).toBe(1);
    for (const type of DOMAIN_EVENT_TYPES) {
      expect(type).not.toMatch(/\.v\d+$/);
    }
  });
});
