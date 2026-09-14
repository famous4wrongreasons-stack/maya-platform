import { BadRequestException } from '@nestjs/common';

import {
  attendanceFromCode,
  attendanceFromWritableCode,
  attendanceToCode,
} from './crm-attendance';

/**
 * Что доказывает этот файл: перевод присутствия в канон не изменил ни одного
 * байта на проводе. Кабинет присылает и читает те же числа, что и до P3.
 */
describe('кодек присутствия', () => {
  it.each([1, 0, -1, 2])(
    'код %s переживает круг «код → канон → код» без потерь',
    (code) => {
      expect(attendanceToCode(attendanceFromCode(code))).toBe(code);
    },
  );

  it('читает коды провайдера так же, как прежний разбор', () => {
    expect(attendanceFromCode(1)).toBe('arrived');
    expect(attendanceFromCode(-1)).toBe('no_show');
    expect(attendanceFromCode(0)).toBe('awaiting');
    expect(attendanceFromCode(2)).toBe('confirmed_by_client');
  });

  it('отсутствие и незнакомый код читаются как ожидание', () => {
    // Прежнее поведение: `typeof x === 'number' ? x : 0`.
    expect(attendanceFromCode(null)).toBe('awaiting');
    expect(attendanceFromCode(undefined)).toBe('awaiting');
    expect(attendanceFromCode(77)).toBe('awaiting');
  });

  it.each([1, 0, -1])('запись принимает код %s', (code) => {
    expect(attendanceToCode(attendanceFromWritableCode(code))).toBe(code);
  });

  it('на записи отвергает всё, кроме 1, 0 и -1 — тем же кодом ошибки', () => {
    // 🔴 Текст и код ошибки уже на проводе: их менять нельзя.
    expect(() => attendanceFromWritableCode(2)).toThrow(BadRequestException);
    try {
      attendanceFromWritableCode(5);
      fail('ожидалась ошибка');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'CRM attendance must be one of 1, 0, -1.',
        error: { code: 'crm_attendance_invalid' },
      });
    }
  });
});
