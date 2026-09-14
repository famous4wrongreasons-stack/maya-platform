/**
 * Два исхода обращения к внешней CRM, которые нельзя путать.
 *
 * Это НЕ общая модель состояний действия — она относится к главе 6 и здесь не
 * строится. Классы описывают ровно то, что случилось с ОДНИМ HTTP-запросом к
 * провайдеру, и интерпретирует их сейчас единственный потребитель — отмена
 * записи. Для всех остальных путей поведение прежнее: исключение поднимается
 * как и раньше, сообщение не меняется.
 *
 * Разница, ради которой они заведены:
 *
 *   CrmRecordGoneError      — провайдер ОПРЕДЕЛЁННО сказал, что записи нет.
 *                             Это подтверждённое внешнее состояние, а не сбой.
 *
 *   CrmOutcomeUnknownError  — мы не узнали, чем кончилось: обрыв, таймаут,
 *                             отменённый запрос. Запрос мог дойти и выполниться.
 *                             Считать это провалом — такая же ложь, как считать
 *                             успехом.
 */

/** Провайдер ответил, что записи не существует (HTTP 404). */
export class CrmRecordGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmRecordGoneError';
  }
}

/**
 * Исход неизвестен: ответа не было.
 *
 * 🔴 Раньше такой случай было нечем отличить от отказа. Запрос к CRM уходил
 * вообще без таймаута — единственный `fetch` адаптера не имел ни `signal`, ни
 * `AbortSignal.timeout`, в отличие от биллинга. Потолок давал только undici,
 * около 300 секунд, то есть в двадцать раз больше самого щедрого прикладного
 * таймаута в проекте.
 */
export class CrmOutcomeUnknownError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CrmOutcomeUnknownError';
  }
}

/**
 * Сколько ждём ответа провайдера.
 *
 * Двадцать секунд: журнал и постраничная выгрузка реестра клиентов бывают
 * медленными, но каждый ОТДЕЛЬНЫЙ запрос за это время либо отвечает, либо уже
 * не ответит. Значение сознательно щедрее биллинга — там платёжный шлюз, здесь
 * выгрузка сотен страниц.
 */
export const CRM_REQUEST_TIMEOUT_MS = 20_000;

/** Обрыв, таймаут или отменённый запрос — всё, после чего исход неизвестен. */
export function isUnknownOutcomeCause(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // AbortSignal.timeout даёт TimeoutError, ручная отмена — AbortError,
  // сетевой сбой в undici приходит как TypeError с причиной внутри.
  return (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    error.name === 'TypeError' ||
    error.name === 'FetchError'
  );
}

/**
 * Провайдер НЕ УМЕЕТ эту возможность.
 *
 * 🔴 Зачем понадобился отдельный класс. У опциональных методов контракта
 * механизм отказа был всегда: провайдер просто не объявляет метод, а
 * `CrmService` отвечает понятным кодом `crm_*_not_supported`. У ОБЯЗАТЕЛЬНЫХ
 * девяти методов такого механизма не было вовсе — и провайдеру, который чего-то
 * не умеет, оставалось либо бросить произвольную ошибку, либо соврать.
 *
 * Один из трёх каркасных адаптеров и врал: `getClientAppointments` возвращал
 * пустой массив. Для вызывающего это неотличимо от «запрос выполнен, записей
 * действительно нет».
 *
 * Инвариант, ради которого класс существует:
 *
 *   `[]` означает: возможность поддерживается, запрос выполнен, результатов нет.
 *   «не поддерживаю» — отдельный явный исход, а не пустой успех.
 *
 * Класс не зависит от провайдера: он называет ВОЗМОЖНОСТЬ, а не реализацию.
 */
export class CrmUnsupportedCapabilityError extends Error {
  constructor(
    /** Имя возможности контракта, например `getClientAppointments`. */
    readonly capability: string,
    /** Провайдер, который её не умеет. Для сообщения, не для решения. */
    readonly provider: string,
  ) {
    super(`${provider} does not support ${capability}`);
    this.name = 'CrmUnsupportedCapabilityError';
  }
}

export function isUnsupportedCapability(
  error: unknown,
): error is CrmUnsupportedCapabilityError {
  return error instanceof CrmUnsupportedCapabilityError;
}
