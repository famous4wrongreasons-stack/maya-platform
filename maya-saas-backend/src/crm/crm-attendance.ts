import { BadRequestException } from '@nestjs/common';

import type { VisitAttendance } from '../domain';

/**
 * Кодек присутствия: числовой код ↔ канонический исход.
 *
 * 🔴 Почему кодек живёт ЗДЕСЬ, внутри границы CRM, и почему число вообще
 * осталось. Числовая кодировка родом из YCLIENTS, но она уже опубликована как
 * контракт Maya: DTO объявляет `@IsIn([1,0,-1])`, а выпущенный PWA и читает
 * это число, и присылает его обратно. Убрать число с провода в P3 нельзя —
 * это изменение публичного API и согласованная правка фронта.
 *
 * Что P3 делает вместо этого: разрывает цепочку в середине. Число живёт ровно
 * на двух концах — на HTTP-краю (здесь) и внутри адаптера YCLIENTS. Между ними
 * ездит имя исхода, и ни один модуль за пределами `src/crm` больше не обязан
 * знать, что `-1` означает неявку.
 */

const CODE_TO_ATTENDANCE = new Map<number, VisitAttendance>([
  [1, 'arrived'],
  [0, 'awaiting'],
  [-1, 'no_show'],
  [2, 'confirmed_by_client'],
]);

const ATTENDANCE_TO_CODE: Record<VisitAttendance, number> = {
  arrived: 1,
  awaiting: 0,
  no_show: -1,
  confirmed_by_client: 2,
};

/** Коды, которые принимает запись через HTTP. Состав задан выпущенным DTO. */
export const WRITABLE_ATTENDANCE_CODES: readonly number[] = [1, 0, -1];

/**
 * Код источника → канон. Неизвестный код и отсутствие значения читаются как
 * ожидание — ровно так это делал прежний `typeof x === 'number' ? x : 0`.
 */
export function attendanceFromCode(
  code: number | null | undefined,
): VisitAttendance {
  if (typeof code !== 'number') {
    return 'awaiting';
  }
  return CODE_TO_ATTENDANCE.get(code) ?? 'awaiting';
}

/** Канон → код провода. Обратное преобразование полное, без потерь. */
export function attendanceToCode(attendance: VisitAttendance): number {
  return ATTENDANCE_TO_CODE[attendance];
}

/**
 * Код, пришедший запросом на запись, → канон.
 *
 * Проверка состава остаётся здесь: раньше её делал `CrmService` числами, и
 * сообщение об ошибке менять нельзя — его текст и код уже на проводе.
 */
export function attendanceFromWritableCode(code: number): VisitAttendance {
  if (!WRITABLE_ATTENDANCE_CODES.includes(code)) {
    throw badAttendance();
  }
  return attendanceFromCode(code);
}

/**
 * Проверка на стороне сервиса: записать можно только «пришёл», «не пришёл» и
 * «ожидание».
 *
 * 🔴 Почему это НЕ дублирование проверки на HTTP-краю. `CrmService` сознательно
 * не доверяет вызывающему — так было и до P3, и на этом стоит отдельный тест.
 * Кроме HTTP у сервиса есть и другие вызывающие, а `confirmed_by_client`
 * (код `2`) — валидный исход ЧТЕНИЯ, который тем не менее нельзя проставить
 * записью.
 */
export function assertWritableAttendance(
  attendance: VisitAttendance,
): VisitAttendance {
  const code = ATTENDANCE_TO_CODE[attendance] as number | undefined;
  if (code === undefined || !WRITABLE_ATTENDANCE_CODES.includes(code)) {
    throw badAttendance();
  }
  return attendance;
}

function badAttendance(): BadRequestException {
  // Текст и машинный код уже на проводе — менять нельзя.
  return new BadRequestException({
    message: 'CRM attendance must be one of 1, 0, -1.',
    error: { code: 'crm_attendance_invalid' },
  });
}
