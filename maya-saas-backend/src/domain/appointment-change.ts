import { DOMAIN_EVENT_TYPE, type DomainEventType } from './domain-event';
import type { VisitAttendance } from './visit-attendance';

/**
 * Обнаружение изменений визита (Cycle 03 B3.3).
 *
 * 🔴 Здесь живёт ЕДИНСТВЕННЫЙ компаратор состояния визита. Вебхук и сверка —
 * это два триггера одной и той же функции, а не две реализации одного правила.
 *
 * Почему это принципиально. Два пути видят один и тот же факт: вебхук — потому
 * что провайдер о нём сообщил, сверка — потому что пришло её время. Если бы у
 * них были свои правила сравнения, один и тот же переход давал бы разные
 * события в зависимости от того, кто успел первым, и «одинаковое состояние»
 * перестало бы означать «одинаковые выводы».
 *
 * Модуль намеренно чистый: ни Prisma, ни Nest, ни времени, ни ввода-вывода.
 * Всё, что он делает, — сравнивает два снимка и называет различия.
 */

/**
 * Каноническое состояние визита — ровно то, по чему считается «изменилось».
 *
 * 🔴 Чего здесь НЕТ и почему.
 *
 * `totalPriceKopecks` — зеркало цену хранит, но в сравнение она не входит:
 * закрытие кассы не является изменением визита. Иначе каждый оплаченный визит
 * выглядел бы «изменившимся», а глава 4 получила бы деньги, замаскированные
 * под перенос. Финансовое наблюдение — отдельная семантика.
 *
 * `notes`, сырое тело провайдера, способ приёма, время чтения — провенанс, а
 * не факт. Провенанс в отпечаток не входит: один и тот же факт, увиденный
 * вебхуком и сверкой, обязан дать одинаковый результат.
 */
export interface CanonicalAppointmentState {
  /** Мастер у провайдера. */
  staffExternalId: string;
  /** Мастер в идентичности Maya. `null` — связь не разрешена. */
  staffId: string | null;
  startAt: Date;
  endAt: Date;
  /** Состав услуг. Сравнивается как множество: порядок провайдера не факт. */
  serviceIds: string[];
  status: string;
  /**
   * Присутствие. `null` = доказанного значения нет.
   * 🔴 Это НЕ `awaiting`: см. `compareAppointmentState`.
   */
  attendance: VisitAttendance | null;
  /** Клиент бизнеса, если связь разрешена. */
  mayaClientId: string | null;
}

/** Статус снятой записи. Канон Maya, задан маппером границы CRM. */
export const APPOINTMENT_REMOVED_STATUS = 'canceled';

export interface AppointmentTransition {
  type: DomainEventType;
  /** Минимальный факт. Ни имени, ни телефона: идентичности у потребителя есть. */
  payload: Record<string, unknown>;
}

/**
 * Порядок переходов — ЧАСТЬ КОНТРАКТА, а не деталь реализации.
 *
 * 🔴 Он гарантирует, что вебхук и сверка, увидев одно и то же, выпустят не
 * просто одинаковый набор событий, а одинаковую ПОСЛЕДОВАТЕЛЬНОСТЬ. Без этого
 * `entitySequence` у двух путей разошёлся бы, и потребитель, читающий события
 * по порядку, получал бы разную историю в зависимости от того, кто сработал.
 *
 * `removed` в список не входит: он не встаёт в очередь, а поглощает её (§ниже).
 */
export const APPOINTMENT_TRANSITION_ORDER: readonly DomainEventType[] = [
  DOMAIN_EVENT_TYPE.appointmentRescheduled,
  DOMAIN_EVENT_TYPE.appointmentStaffChanged,
  DOMAIN_EVENT_TYPE.appointmentServicesChanged,
  DOMAIN_EVENT_TYPE.appointmentAttendanceChanged,
];

/**
 * Сравнить прежнее состояние зеркала с текущей истиной источника.
 *
 * Возвращает переходы в детерминированном порядке. Пустой массив означает
 * «наблюдаемых различий нет» — и это законный, частый исход: повторная доставка
 * вебхука и очередной проход сверки обязаны давать именно его.
 */
export function compareAppointmentState(
  previous: CanonicalAppointmentState,
  next: CanonicalAppointmentState,
): AppointmentTransition[] {
  /**
   * 🔴 Снятие поглощает остальные переходы.
   *
   * У записи, которой больше нет, «перенос» и «смена мастера» смысла не имеют:
   * это описание судьбы того, что уже не состоится. Выпустив их вместе с
   * `removed`, мы бы сообщили потребителю о двух разных вещах — что визит
   * переехал И что его нет, — и он был бы вправе среагировать на первое.
   */
  const removedNow =
    next.status === APPOINTMENT_REMOVED_STATUS &&
    previous.status !== APPOINTMENT_REMOVED_STATUS;

  if (removedNow) {
    return [
      {
        type: DOMAIN_EVENT_TYPE.appointmentRemoved,
        payload: { previous_status: previous.status },
      },
    ];
  }

  const transitions: AppointmentTransition[] = [];

  const movedStart = previous.startAt.getTime() !== next.startAt.getTime();
  const movedEnd = previous.endAt.getTime() !== next.endAt.getTime();
  if (movedStart || movedEnd) {
    transitions.push({
      type: DOMAIN_EVENT_TYPE.appointmentRescheduled,
      payload: {
        from: {
          start_at: previous.startAt.toISOString(),
          end_at: previous.endAt.toISOString(),
        },
        to: {
          start_at: next.startAt.toISOString(),
          end_at: next.endAt.toISOString(),
        },
      },
    });
  }

  if (previous.staffExternalId !== next.staffExternalId) {
    transitions.push({
      type: DOMAIN_EVENT_TYPE.appointmentStaffChanged,
      payload: {
        from_staff_external_id: previous.staffExternalId,
        to_staff_external_id: next.staffExternalId,
        // Идентичность Maya — отдельным полем: она может быть не разрешена,
        // и это состояние тоже факт, а не повод промолчать.
        from_staff_id: previous.staffId,
        to_staff_id: next.staffId,
      },
    });
  }

  const previousServices = sortedServices(previous.serviceIds);
  const nextServices = sortedServices(next.serviceIds);
  if (!sameServices(previousServices, nextServices)) {
    transitions.push({
      type: DOMAIN_EVENT_TYPE.appointmentServicesChanged,
      payload: { from: previousServices, to: nextServices },
    });
  }

  /**
   * 🔴 Присутствие: событие рождает только переход между двумя ДОКАЗАННЫМИ
   * значениями.
   *
   * `NULL → arrived` — это первое наблюдение, а не изменение: мы не видели
   * «было так, стало иначе», мы впервые посмотрели. Считать его событием
   * значило бы утверждать, что в момент нашего первого взгляда что-то
   * произошло, — ложь о времени, из которой глава 4 сделает ложные выводы о
   * динамике. Тот же принцип уже доказан наполнением зеркала: 1922 строки,
   * ноль событий.
   *
   * `arrived → NULL` событием тоже не является: провайдер перестал отдавать
   * поле, а не отменил приход клиента. Такое «изменение» — про нас, а не про
   * бизнес; зеркало доказанное значение в этом случае не теряет (см. писателя).
   */
  const attendanceChanged =
    previous.attendance !== null &&
    next.attendance !== null &&
    previous.attendance !== next.attendance;

  if (attendanceChanged) {
    transitions.push({
      type: DOMAIN_EVENT_TYPE.appointmentAttendanceChanged,
      payload: { from: previous.attendance, to: next.attendance },
    });
  }

  return transitions;
}

/**
 * Новое состояние зеркала.
 *
 * 🔴 Доказанное значение не затирается отсутствием. Если провайдер перестал
 * присылать присутствие или не разрешился клиент — зеркало сохраняет то, что
 * уже знает. Правило то же, что для связи клиента с B3.2: «не сказали» никогда
 * не отменяет «сказали раньше».
 */
export function mergeAppointmentState(
  previous: CanonicalAppointmentState,
  next: CanonicalAppointmentState,
): CanonicalAppointmentState {
  return {
    staffExternalId: next.staffExternalId,
    staffId: next.staffId ?? previous.staffId,
    startAt: next.startAt,
    endAt: next.endAt,
    serviceIds: sortedServices(next.serviceIds),
    status: next.status,
    attendance: next.attendance ?? previous.attendance,
    mayaClientId: next.mayaClientId ?? previous.mayaClientId,
  };
}

/**
 * Состояние для отпечатка дедупликации.
 *
 * Времени в отпечатке нет; даты приводятся к ISO, чтобы два объекта `Date` с
 * одним моментом дали один ключ.
 */
export function fingerprintState(
  state: CanonicalAppointmentState,
): Record<string, unknown> {
  return {
    staff_external_id: state.staffExternalId,
    staff_id: state.staffId,
    start_at: state.startAt.toISOString(),
    end_at: state.endAt.toISOString(),
    service_ids: sortedServices(state.serviceIds),
    status: state.status,
    attendance: state.attendance,
    maya_client_id: state.mayaClientId,
  };
}

function sortedServices(serviceIds: readonly string[]): string[] {
  return [...serviceIds].filter((id) => typeof id === 'string').sort();
}

function sameServices(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
