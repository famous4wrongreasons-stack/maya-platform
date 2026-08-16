/**
 * Расписание: свободные окна и рабочий день мастера.
 *
 * Те же основания, что и у каталога: `CrmService.getAvailableSlots` — фасад над
 * внутренним календарём и внешним адаптером, поэтому общий тип обязан лежать
 * ниже обоих. Форма полей не меняется — она уже на проводе.
 */

/** Свободное окно записи. `start`/`end` — ISO-мгновения в UTC. */
export interface BookableSlot {
  start: string;
  end: string;
  staff_id: string;
  branch_id?: string | null;
}

/** Интервал смены. «ЧЧ:ММ» в часовом поясе филиала. */
export interface WorkInterval {
  from: string;
  to: string;
}

/**
 * Рабочий день мастера.
 *
 * `revision` — метка версии для оптимистичной блокировки: правка дня
 * применяется только если график в источнике с тех пор не изменился.
 */
export interface WorkDay {
  staff_id: string;
  date: string;
  is_working: boolean;
  slots: WorkInterval[];
  revision: string;
}

export interface WorkDayChangePreview {
  current: WorkDay;
  proposed: WorkDay;
  conflict_times: string[];
}

export interface AppliedWorkDayChange {
  staff_id: string;
  date: string;
  is_working: boolean;
  slots: WorkInterval[];
  /** Источник подтвердил запись перечитыванием, а не только кодом ответа. */
  verified: boolean;
}
