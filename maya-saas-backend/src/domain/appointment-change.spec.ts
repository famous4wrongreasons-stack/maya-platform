import {
  APPOINTMENT_TRANSITION_ORDER,
  compareAppointmentState,
  mergeAppointmentState,
  fingerprintState,
  type CanonicalAppointmentState,
} from './appointment-change';
import { DOMAIN_EVENT_TYPE } from './domain-event';

/**
 * Обнаружение изменений визита — правила переходов (Cycle 03 B3.3).
 *
 * Главное, что здесь закрепляется: событие означает ДОКАЗАННОЕ изменение.
 * Первое наблюдение изменением не является, молчание провайдера — тем более.
 */

const base = (
  over: Partial<CanonicalAppointmentState> = {},
): CanonicalAppointmentState => ({
  staffExternalId: '1461615',
  staffId: 'staff-maya-1',
  startAt: new Date('2026-08-20T10:00:00.000Z'),
  endAt: new Date('2026-08-20T11:00:00.000Z'),
  serviceIds: ['svc-1', 'svc-2'],
  status: 'confirmed',
  attendance: null,
  mayaClientId: null,
  ...over,
});

const types = (
  state: CanonicalAppointmentState,
  next: CanonicalAppointmentState,
) => compareAppointmentState(state, next).map((transition) => transition.type);

describe('переходы визита', () => {
  it('одинаковое состояние переходов не даёт', () => {
    expect(types(base(), base())).toEqual([]);
  });

  // ── присутствие ───────────────────────────────────────────────────────────

  it('🔴 первое наблюдение присутствия событием НЕ является', () => {
    // Существующая строка зеркала: присутствие ещё не наблюдалось.
    const previous = base({ attendance: null });
    const next = base({ attendance: 'awaiting' });

    expect(types(previous, next)).toEqual([]);
  });

  it('переход между двумя доказанными значениями даёт событие', () => {
    const previous = base({ attendance: 'awaiting' });
    const next = base({ attendance: 'arrived' });

    const transitions = compareAppointmentState(previous, next);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].type).toBe(
      DOMAIN_EVENT_TYPE.appointmentAttendanceChanged,
    );
    expect(transitions[0].payload).toEqual({ from: 'awaiting', to: 'arrived' });
  });

  it('🔴 замолчавший провайдер не отменяет уже доказанное присутствие', () => {
    const previous = base({ attendance: 'arrived' });
    const next = base({ attendance: null });

    // Событие не возникает: это про нас, а не про бизнес.
    expect(types(previous, next)).toEqual([]);
    // И значение в зеркале не теряется.
    expect(mergeAppointmentState(previous, next).attendance).toBe('arrived');
  });

  // ── одиночные изменения ───────────────────────────────────────────────────

  it('только перенос', () => {
    const next = base({
      startAt: new Date('2026-08-20T14:00:00.000Z'),
      endAt: new Date('2026-08-20T15:00:00.000Z'),
    });
    expect(types(base(), next)).toEqual([
      DOMAIN_EVENT_TYPE.appointmentRescheduled,
    ]);
  });

  it('только смена мастера', () => {
    const next = base({ staffExternalId: '1460233', staffId: 'staff-maya-2' });
    expect(types(base(), next)).toEqual([
      DOMAIN_EVENT_TYPE.appointmentStaffChanged,
    ]);
  });

  it('только смена состава услуг', () => {
    const next = base({ serviceIds: ['svc-1', 'svc-3'] });
    expect(types(base(), next)).toEqual([
      DOMAIN_EVENT_TYPE.appointmentServicesChanged,
    ]);
  });

  it('перестановка тех же услуг изменением не считается', () => {
    const next = base({ serviceIds: ['svc-2', 'svc-1'] });
    expect(types(base(), next)).toEqual([]);
  });

  // ── порядок ───────────────────────────────────────────────────────────────

  it('🔴 несколько изменений дают несколько событий В ЗАФИКСИРОВАННОМ порядке', () => {
    const previous = base({ attendance: 'awaiting' });
    const next = base({
      startAt: new Date('2026-08-20T14:00:00.000Z'),
      endAt: new Date('2026-08-20T15:00:00.000Z'),
      staffExternalId: '1460233',
      staffId: 'staff-maya-2',
      serviceIds: ['svc-9'],
      attendance: 'arrived',
    });

    expect(types(previous, next)).toEqual([
      DOMAIN_EVENT_TYPE.appointmentRescheduled,
      DOMAIN_EVENT_TYPE.appointmentStaffChanged,
      DOMAIN_EVENT_TYPE.appointmentServicesChanged,
      DOMAIN_EVENT_TYPE.appointmentAttendanceChanged,
    ]);
  });

  it('порядок совпадает с объявленным контрактом', () => {
    const previous = base({ attendance: 'awaiting' });
    const next = base({
      startAt: new Date('2026-08-20T14:00:00.000Z'),
      endAt: new Date('2026-08-20T15:00:00.000Z'),
      staffExternalId: '1460233',
      serviceIds: ['svc-9'],
      attendance: 'arrived',
    });

    expect(types(previous, next)).toEqual([...APPOINTMENT_TRANSITION_ORDER]);
  });

  // ── снятие ────────────────────────────────────────────────────────────────

  it('🔴 снятие ПОГЛОЩАЕТ остальные изменения', () => {
    const previous = base({ attendance: 'awaiting' });
    const next = base({
      status: 'canceled',
      startAt: new Date('2026-08-20T14:00:00.000Z'),
      endAt: new Date('2026-08-20T15:00:00.000Z'),
      staffExternalId: '1460233',
      serviceIds: ['svc-9'],
      attendance: 'no_show',
    });

    const transitions = compareAppointmentState(previous, next);
    expect(transitions.map((t) => t.type)).toEqual([
      DOMAIN_EVENT_TYPE.appointmentRemoved,
    ]);
    expect(transitions[0].payload).toEqual({ previous_status: 'confirmed' });
  });

  it('уже снятая запись снимается только один раз', () => {
    const previous = base({ status: 'canceled' });
    const next = base({ status: 'canceled' });
    expect(types(previous, next)).toEqual([]);
  });

  // ── деньги ────────────────────────────────────────────────────────────────

  it('🔴 состояние для отпечатка не содержит денег', () => {
    // Закрытие кассы не должно маскироваться под изменение визита.
    expect(Object.keys(fingerprintState(base()))).not.toContain(
      'total_price_kopecks',
    );
    expect(JSON.stringify(fingerprintState(base()))).not.toMatch(/price|paid/i);
  });

  it('один и тот же факт даёт один отпечаток независимо от порядка услуг', () => {
    const left = fingerprintState(base({ serviceIds: ['b', 'a'] }));
    const right = fingerprintState(base({ serviceIds: ['a', 'b'] }));
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });

  // ── слияние ───────────────────────────────────────────────────────────────

  it('неразрешённый клиент не стирает уже разрешённого', () => {
    const previous = base({ mayaClientId: 'client-1' });
    const next = base({ mayaClientId: null });
    expect(mergeAppointmentState(previous, next).mayaClientId).toBe('client-1');
  });

  it('неразрешённый мастер не стирает уже разрешённого', () => {
    const previous = base({ staffId: 'staff-maya-1' });
    const next = base({ staffId: null });
    expect(mergeAppointmentState(previous, next).staffId).toBe('staff-maya-1');
  });
});
