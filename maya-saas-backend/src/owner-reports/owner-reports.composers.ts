import type {
  BriefCount,
  BriefFacts,
  MasterBriefFacts,
} from './owner-reports.facts';
import { displayDayRu, formatRubFromKopecks } from './owner-reports.time';

/**
 * Тексты сводок владельца и мастера.
 *
 * 🔴 Cycle 04 P4. Здесь ПРЕЗЕНТАЦИЯ и только она: выбрать факты, назвать их
 * по-русски, собрать строку. Ни одного вычисления бизнес-факта — ни суммы, ни
 * доли, ни среднего, ни разбора «пришёл или нет».
 *
 * Главное правило текста: `null` — это не ноль. Раньше числа добирались из
 * сырого обзора через `?? 0`, и «журнал прочитан не целиком» превращалось в
 * «отменено 0», а «касса не ответила» — в «касса пустая». Теперь неизвестное
 * доезжает сюда как `null` и обязано быть названо словами.
 */

/** Число к печати. Неизвестное называется, а не превращается в ноль. */
function count(value: BriefCount): string {
  return value === null ? 'не измерено' : String(value);
}

/** Пометка о неполноте источника — одна на все три сводки. */
function incompleteNote(facts: {
  sourceComplete: boolean;
  incompleteReason: string | null;
}): string | null {
  if (facts.sourceComplete) return null;
  return '⚠️ Журнал за этот период прочитан НЕ целиком: числа ниже — нижняя граница, и ноль в них означает «не измерено», а не «ничего не было».';
}

/** Состояние источника для полезной нагрузки карточки. Всегда заполнено. */
function completenessPayload(facts: {
  sourceComplete: boolean;
  incompleteReason: string | null;
}): {
  appointments_source_complete: boolean;
  appointments_incomplete_reason: string | null;
} {
  return {
    appointments_source_complete: facts.sourceComplete,
    appointments_incomplete_reason: facts.sourceComplete
      ? null
      : (facts.incompleteReason ?? 'unknown'),
  };
}

/**
 * Строка присутствия — только из канонического наблюдения.
 *
 * `null` возвращается, когда говорить не о чем: присутствие не сверено. Молчать
 * честнее, чем взять провайдерский статус и назвать его неявкой.
 */
function attendanceLine(facts: BriefFacts, always: boolean): string | null {
  if (!facts.attendance.measured) {
    if (!always) return null;
    /**
     * 🔴 Три разных ответа, а не два. «Сверки не было» — повод посмотреть на
     * планировщик; «сверка не покрыла часть записей» — повод подождать догон;
     * и говорить одно вместо другого значит отправить владельца чинить
     * работающее.
     */
    return facts.attendance.partial
      ? 'Присутствие сверено НЕ по всем записям дня — числа по приходам называть рано.'
      : 'Присутствие за день ещё не сверено — о неявках сказать нечего.';
  }
  const arrived = facts.attendance.arrived;
  const noShow = facts.attendance.noShow;
  if (arrived === null || noShow === null) return null;
  if (!always && arrived === 0 && noShow === 0) return null;
  return `Присутствие: пришли ${arrived}, неявок ${noShow}.`;
}

export function composeMorningBrief(input: { facts: BriefFacts }): {
  title: string;
  bodyText: string;
  payload: Record<string, unknown>;
} {
  const facts = input.facts;
  const bookedValue = facts.bookedValue.amountKopecks;
  const average = facts.bookedValue.averageKopecks;
  /**
   * 🔴 «Ожидаемо» — это стоимость ЗАПИСАННОГО по ценам журнала, а не деньги.
   * Средняя рядом — тоже цена записи, а не средний чек: средний чек стоит на
   * кассе, и до конца дня его не существует.
   */
  const expected =
    bookedValue !== null && bookedValue > 0
      ? `, ожидаемо ~${formatRubFromKopecks(bookedValue)}` +
        (average !== null && average > 0
          ? ` (средняя стоимость записи ${formatRubFromKopecks(average)})`
          : '')
      : '';
  const underused = facts.staff
    .filter((row) => (row.appointments ?? 0) <= 1)
    .map((row) => (row.name ?? '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const morningNote = incompleteNote(facts);
  const lines = [
    'Доброе утро! Посмотрела салон на сегодня 👇',
    '',
    // 🔴 Оговорка стоит ПЕРЕД числами, которые описывает: «числа ниже —
    // нижняя граница» внизу сообщения читатель находит уже после того, как
    // сделал вывод по нулям.
    ...(morningNote ? [morningNote, ''] : []),
    `📅 Сегодня в CRM: всего ${count(facts.counts.total)} записей${expected}.`,
    `Статусы: ожидают ${count(facts.counts.scheduled)}, завершено ${count(
      facts.counts.completed,
    )}, отменено ${count(facts.counts.cancelled)}.`,
  ];
  // Утром присутствие обычно ещё не наблюдалось: строка появляется, только
  // когда наблюдение уже есть и в нём что-то произошло.
  const attendance = attendanceLine(facts, false);
  if (attendance) lines.push(attendance);
  if (underused.length) {
    const minutes = facts.counts.bookedMinutes;
    lines.push(
      `🪑 Недозагружены: ${underused.join(', ')}` +
        (minutes !== null && minutes > 0 ? ` — занято ${minutes} мин.` : '.'),
    );
  } else if (facts.staff.length > 0) {
    lines.push('🪑 Загрузка мастеров выглядит ровной на утро.');
  }
  // 🔴 Разреза по мастерам нет вовсе — и тогда о загрузке не говорится ничего.
  // Вывод о благополучии из отсутствия измерения — та же подмена, что и ноль
  // вместо «не знаю».

  lines.push(
    '',
    'Откройте чат MAYA, если нужно закрыть окна или скорректировать план.',
  );

  return {
    title: `MAYA · утренний план · ${displayDayRu(facts.localDate)}`,
    bodyText: lines.join('\n'),
    payload: {
      kind: 'morning_brief',
      local_date: facts.localDate,
      booked: facts.counts.total,
      scheduled: facts.counts.scheduled,
      completed: facts.counts.completed,
      cancelled: facts.counts.cancelled,
      // Присутствие — каноническое; `null` означает «не сверено».
      attendance_arrived: facts.attendance.arrived,
      attendance_no_show: facts.attendance.noShow,
      booked_value_kopecks: bookedValue,
      booked_value_basis: facts.bookedValue.basis,
      average_booked_value_kopecks: average,
      underused,
      ...completenessPayload(facts),
    },
  };
}

export function composeMasterMorningBrief(input: { facts: MasterBriefFacts }): {
  title: string;
  bodyText: string;
  payload: Record<string, unknown>;
} {
  const facts = input.facts;
  const title = `MAYA · ваш день · ${displayDayRu(facts.localDate)}`;
  const greeting = facts.masterName?.trim()
    ? `Доброе утро, ${facts.masterName.trim()}!`
    : 'Доброе утро!';

  /**
   * 🔴 Календарь не сопоставлен с профилем — о дне этого человека НЕ ИЗВЕСТНО
   * НИЧЕГО. До миграции сюда приходили нули и совет «проверьте свободные окна»:
   * промах сопоставления выдавался мастеру за пустой день.
   */
  if (facts.presence === 'identity_unresolved') {
    return {
      title,
      bodyText: [
        `${greeting} План на сегодня собрать не смогла.`,
        '',
        'Ваш календарь пока не сопоставлен с профилем в MAYA, поэтому записей за вами я не вижу — это не значит, что их нет.',
        'Попросите администратора связать профиль с календарём, и план начнёт приходить.',
      ].join('\n'),
      payload: {
        kind: 'master_morning_brief',
        local_date: facts.localDate,
        identity_resolved: false,
        total: null,
        scheduled: null,
        completed: null,
        cancelled: null,
        booked_minutes: null,
        ...completenessPayload(facts),
      },
    };
  }

  const total = facts.counts.total;
  const minutes = facts.counts.bookedMinutes;
  const masterNote = incompleteNote(facts);
  const lines = [
    `${greeting} Вот ваш план на сегодня.`,
    '',
    ...(masterNote ? [masterNote, ''] : []),
    `Записей: ${count(total)}; ожидают визита ${count(
      facts.counts.scheduled,
    )}; завершено ${count(facts.counts.completed)}; отменено ${count(
      facts.counts.cancelled,
    )}.`,
    minutes !== null && minutes > 0
      ? `Занято в календаре: ${minutes} мин.`
      : minutes === null
        ? 'Занятость календаря за сегодня не измерена.'
        : 'Календарь пока свободен.',
  ];

  if (total === null) {
    // Числа нет — и совета «на пустой день» тоже быть не может.
    lines.push(
      'Совет MAYA: как только журнал прочитается целиком, я пришлю точный план.',
    );
  } else if (total === 0) {
    lines.push(
      'Совет MAYA: проверьте свободные окна с администратором и предложите их клиентам, которым уже подходит срок следующего визита.',
    );
  } else if ((facts.counts.cancelled ?? 0) > 0) {
    lines.push(
      'Совет MAYA: подтвердите ближайшие визиты и сразу передайте освободившиеся окна администратору для точечного заполнения.',
    );
  } else {
    lines.push(
      'Совет MAYA: перед первым визитом посмотрите историю услуг клиента, а после работы предложите только один действительно подходящий уход.',
    );
  }
  lines.push('', 'План сохранён в чате MAYA.');

  return {
    title,
    bodyText: lines.join('\n'),
    payload: {
      kind: 'master_morning_brief',
      local_date: facts.localDate,
      identity_resolved: true,
      total,
      scheduled: facts.counts.scheduled,
      completed: facts.counts.completed,
      cancelled: facts.counts.cancelled,
      booked_minutes: minutes,
      ...completenessPayload(facts),
    },
  };
}

export function composeDailyReport(input: { facts: BriefFacts }): {
  title: string;
  bodyText: string;
  payload: Record<string, unknown>;
} {
  const facts = input.facts;
  const day = displayDayRu(facts.localDate);
  const revenue = facts.revenue;
  const dailyNote = incompleteNote(facts);
  const lines = [
    `📊 Отчёт за ${day} готов`,
    '',
    ...(dailyNote ? [dailyNote, ''] : []),
  ];

  const accrued = facts.payroll.accruedTotalKopecks;
  if (facts.payroll.rows.length > 0) {
    lines.push('Зарплаты (смена):');
    const shown = facts.payroll.rows.slice(0, 12);
    for (const row of shown) {
      /**
       * 🔴 Три разных строки, а не одна отфильтрованная.
       *
       * «Не посчитано» — это не «ноль», и мастер, по которому CRM не отдала
       * расчёт, обязан остаться видимым: иначе список зарплат выглядит полным,
       * а сумма строк не сходится с итогом без единого слова объяснения.
       */
      lines.push(
        row.measured
          ? `• ${row.name}: ${formatRubFromKopecks(row.accruedKopecks ?? 0)}`
          : `• ${row.name}: расчёт не пришёл из CRM — сумма неизвестна`,
      );
    }
    // Обрезка списка обязана быть видимой: молча укороченная команда выглядит
    // как команда, которой ничего не начислили.
    if (facts.payroll.rows.length > shown.length) {
      lines.push(
        `…и ещё ${facts.payroll.rows.length - shown.length} мастеров — список сокращён.`,
      );
    }
    if (accrued !== null) {
      lines.push(`Итого начислено за смену: ${formatRubFromKopecks(accrued)}`);
    }
    lines.push('');
  } else if (accrued !== null) {
    lines.push(
      `Зарплаты (смена): начислено ${formatRubFromKopecks(accrued)}, разбивки по мастерам CRM не дала.`,
      '',
    );
  } else if (facts.payroll.status !== null) {
    // 🔴 «Расчёт не пришёл» и «за смену начислено ноль» — разные новости, и
    // молчание отчёта стирало между ними разницу.
    lines.push('Расчёт зарплаты за смену из CRM не пришёл.', '');
  }

  lines.push('Оплаты за день:');
  /**
   * 🔴 Три разных случая, которые до миграции печатались одной фразой
   * «пока пустая или недоступна»: касса измерена и пуста, касса не измерена,
   * касса есть. Ноль и незнание — не одно и то же, и владелец имеет право
   * знать, какое из двух.
   */
  if (revenue.amountKopecks === null && revenue.basis === 'booked_prices') {
    /**
     * 🔴 У арендатора на СОБСТВЕННОМ календаре кассового контура не существует
     * как понятия — обвинять его в молчании нельзя.
     *
     * Первая версия смотрела только на «число пустое» и каждый вечер сообщала
     * владельцу о поломке интеграции, которой у него нет. Основание факта
     * различает эти случаи, и текст обязан их различать.
     */
    lines.push(
      'Подтверждённой кассы у собственного календаря нет: деньги здесь — цены записей, а не проведённые оплаты.',
    );
  } else if (revenue.amountKopecks === null) {
    lines.push(
      'Подтверждённая касса за день недоступна: финансовый контур не ответил, поэтому сказать «выручки не было» я не могу.',
    );
  } else if (revenue.amountKopecks === 0) {
    lines.push('Подтверждённая касса за день пустая: оплат не проходило.');
  } else {
    if (revenue.cashKopecks !== null || revenue.cashlessKopecks !== null) {
      lines.push(
        `💵 Наличные — ${formatRubFromKopecks(revenue.cashKopecks ?? 0)}`,
      );
      lines.push(
        `💳 Карта — ${formatRubFromKopecks(revenue.cashlessKopecks ?? 0)}`,
      );
      if ((revenue.unclassifiedKopecks ?? 0) > 0) {
        lines.push(
          `Ещё ${formatRubFromKopecks(revenue.unclassifiedKopecks)} провайдер не отнёс ни к наличным, ни к безналу.`,
        );
      }
    }
    lines.push(
      `Выручка за день: ${formatRubFromKopecks(revenue.amountKopecks)}`,
    );
  }
  lines.push(`Записей за день: ${count(facts.counts.total)}`);
  lines.push(
    `Статусы: завершено ${count(facts.counts.completed)}, ожидают ${count(
      facts.counts.scheduled,
    )}, отменено ${count(facts.counts.cancelled)}.`,
  );
  // Вечером присутствие уместно всегда: день закончился, и «не сверено» —
  // это тоже ответ.
  const attendance = attendanceLine(facts, true);
  if (attendance) lines.push(attendance);
  lines.push(
    '',
    'Сообщение сохранено в чате MAYA и не исчезнет после закрытия приложения.',
  );

  return {
    title: `Отчёт за ${day}`,
    bodyText: lines.join('\n'),
    payload: {
      kind: 'daily_report',
      local_date: facts.localDate,
      visits: facts.counts.total,
      scheduled: facts.counts.scheduled,
      completed: facts.counts.completed,
      cancelled: facts.counts.cancelled,
      attendance_arrived: facts.attendance.arrived,
      attendance_no_show: facts.attendance.noShow,
      revenue_total_kopecks: revenue.amountKopecks,
      revenue_basis: revenue.basis,
      cash_kopecks: revenue.cashKopecks,
      card_kopecks: revenue.cashlessKopecks,
      ...completenessPayload(facts),
    },
  };
}
