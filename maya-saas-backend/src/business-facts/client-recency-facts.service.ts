import { Injectable } from '@nestjs/common';

import { CrmService } from '../crm/crm.service';
// 🔴 Единственная существующая реализация «какой сегодня день у арендатора».
// Заводить вторую значило бы начать ровно с того, что этот пакет закрывает.
import { localCalendarDate } from '../owner-reports/owner-reports.time';

/**
 * Давность посещения — измерение, и только измерение.
 *
 * До этого владельца факт «когда клиент был у нас в последний раз» считали
 * четыре разные формулы над одним и тем же полем карточки провайдера, и они
 * расходились по всем осям сразу: одна отдавала при неизвестной дате `null`,
 * соседняя — `0` («был сегодня»), третья превращала неизвестность в 1970 год и
 * роняла безымянные карточки в конец сортировки «по свежести», четвёртая
 * сравнивала с `Date.now()` мимо часового пояса салона.
 *
 * 🔴 Чего здесь НЕТ и не будет: слов «спящий», «потерянный», «ушёл», «риск»,
 * «пора вернуть». Это интерпретация, она живёт выше и стоит на этом измерении,
 * а не внутри него. Храповик держит спека `client-recency.boundary.spec.ts`.
 */

/** Состояние факта. Тот же контракт, что у остальных фактов главы 4. */
export type RecencyFactState =
  'measured' | 'measured_incomplete' | 'not_measured' | 'unavailable';

/** Почему точки отсчёта нет. Машиночитаемо: словами объясняет презентация. */
export const RECENCY_UNKNOWN = {
  providerCardHasNoDate: 'provider_client_card_has_no_last_visit_date',
  providerCardDateIsInTheFuture: 'provider_client_card_date_is_in_the_future',
  noAttendedVisitInWindow: 'no_attended_visit_in_the_observed_window',
  historyUnavailable: 'provider_visit_history_did_not_answer',
  historyNotSupported: 'provider_does_not_expose_client_visit_history',
  identityUnknown: 'client_is_not_identified_at_the_provider',
} as const;

/**
 * Точка отсчёта давности.
 *
 * `attendance_proven` — главное поле строки. Дата карточки провайдера
 * присутствия НЕ доказывает: что за ней стоит — приход, оплата или просто
 * закрытая запись — провайдер не сообщает, и Maya этого не выясняла. Поэтому
 * две точки живут раздельно и никогда не подставляются одна вместо другой.
 */
export interface RecencyPoint {
  readonly state: RecencyFactState;
  /** Местная дата салона. `null`, если состояние не `measured*`. */
  readonly local_date: string | null;
  /** Момент времени — только там, где источник его знает (история визитов). */
  readonly at: string | null;
  readonly basis:
    | 'provider_visit_history_canonical_attendance'
    | 'provider_client_card'
    | null;
  /** Доказано ли присутствие каноном главы 3–4. */
  readonly attendance_proven: boolean;
  readonly reason: string | null;
}

/** Сколько суток прошло. `null` — не измерено; ноль означал бы «сегодня». */
export interface RecencyDistance {
  readonly days: number | null;
  readonly state: RecencyFactState;
  readonly reason: string | null;
}

export interface ClientIdentityScope {
  /**
   * 🔴 Пространство идентичности. Сегодня доступно ровно одно: клиент
   * ПРОВАЙДЕРА. В зеркале записей идентичности бизнес-клиента нет
   * (`mayaClientId` пуст на всех строках), связать строку зеркала с гостем
   * нечем, и по телефону мы не склеиваем.
   */
  readonly space: 'provider_client';
  readonly provider_client_id: string | null;
  readonly maya_client_id: null;
  readonly limitation: string;
}

export interface ClientRecencyFacts {
  readonly identity: ClientIdentityScope;
  readonly as_of: {
    readonly instant: string;
    readonly local_date: string;
    readonly timezone: string;
  };
  readonly last_attended_visit: RecencyPoint;
  readonly days_since_last_attended_visit: RecencyDistance;
  readonly provider_asserted_last_visit: RecencyPoint;
  readonly days_since_provider_asserted_last_visit: RecencyDistance;
  readonly observation: {
    readonly window_days: number | null;
    readonly attended_visits_observed: number | null;
    readonly truncated: boolean;
  };
}

export interface RecencyAsOf {
  /** Явная точка отсчёта. Ни одного `new Date()` внутри потребителей. */
  readonly asOf: Date;
  readonly timezone: string;
}

/** Окно истории визитов у провайдера. Держим рядом с фактом, а не в тексте. */
export const PROVIDER_VISIT_HISTORY_WINDOW_DAYS = 730;

const IDENTITY_LIMITATION =
  'recency is computed in provider client identity space: the appointment mirror has no business client identity, so this is not the recency of a Maya client';

/**
 * Сутки между двумя местными датами салона.
 *
 * Обе стороны — календарные ключи `YYYY-MM-DD` местного дня, поэтому смещение
 * пояса сокращается, а переход на летнее время не добавляет и не съедает сутки.
 */
export function daysBetweenLocalDates(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function unknownPoint(
  reason: string,
  basis: RecencyPoint['basis'],
  state: RecencyFactState = 'not_measured',
): RecencyPoint {
  return {
    state,
    local_date: null,
    at: null,
    basis,
    attendance_proven: false,
    reason,
  };
}

function unknownDistance(
  reason: string,
  state: RecencyFactState = 'not_measured',
): RecencyDistance {
  return { days: null, state, reason };
}

/**
 * Расстояние от точки до точки отсчёта.
 *
 * Дата в будущем — не ноль дней и не «сегодня»: это значит, что источник
 * назвал посещением то, что ещё не произошло, и измерять тут нечего.
 */
export function distanceFrom(
  point: RecencyPoint,
  asOfLocalDate: string,
): RecencyDistance {
  if (point.state !== 'measured' && point.state !== 'measured_incomplete') {
    return unknownDistance(
      point.reason ?? RECENCY_UNKNOWN.providerCardHasNoDate,
      point.state,
    );
  }
  const days = point.local_date
    ? daysBetweenLocalDates(point.local_date, asOfLocalDate)
    : null;
  if (days === null) {
    return unknownDistance(RECENCY_UNKNOWN.providerCardHasNoDate);
  }
  if (days < 0) {
    return unknownDistance(RECENCY_UNKNOWN.providerCardDateIsInTheFuture);
  }
  return { days, state: point.state, reason: null };
}

/**
 * Дата последнего визита ПО КАРТОЧКЕ ПРОВАЙДЕРА.
 *
 * Присутствия не доказывает — и поэтому никогда не называется посещением.
 * Чистая функция: списки на весь реестр считают её без единого сетевого вызова.
 */
export function providerAssertedLastVisit(
  lastVisitDate: unknown,
  asOfLocalDate: string,
): { point: RecencyPoint; distance: RecencyDistance } {
  const raw =
    typeof lastVisitDate === 'string' ? lastVisitDate.slice(0, 10) : '';
  if (!DATE_KEY.test(raw)) {
    const point = unknownPoint(
      RECENCY_UNKNOWN.providerCardHasNoDate,
      'provider_client_card',
    );
    return { point, distance: distanceFrom(point, asOfLocalDate) };
  }
  const point: RecencyPoint = {
    state: 'measured',
    local_date: raw,
    at: null,
    basis: 'provider_client_card',
    // 🔴 Ровно то, ради чего заведено поле: карточка утверждает дату, но не
    // доказывает приход. Раньше это число публиковалось как «последний визит».
    attendance_proven: false,
    reason: null,
  };
  return { point, distance: distanceFrom(point, asOfLocalDate) };
}

@Injectable()
export class ClientRecencyFactsService {
  constructor(private readonly crmService: CrmService) {}

  /** Местный день салона для точки отсчёта. Один на все поверхности. */
  localDate(when: RecencyAsOf): string {
    return localCalendarDate(when.timezone, when.asOf);
  }

  /**
   * Давность по карточке провайдера — без обращения к сети.
   *
   * Списки на весь реестр (кто давно не приходил, рейтинг клиентов) другого
   * источника не имеют: истории визитов по каждому из сотен гостей не
   * запросить. Поэтому они получают ЭТОТ факт — и он честно помечен.
   */
  fromProviderCard(
    card: { last_visit_date?: string | null; external_id?: string | null },
    when: RecencyAsOf,
  ): {
    identity: ClientIdentityScope;
    point: RecencyPoint;
    distance: RecencyDistance;
    as_of_local_date: string;
  } {
    const asOfLocalDate = this.localDate(when);
    const { point, distance } = providerAssertedLastVisit(
      card.last_visit_date ?? null,
      asOfLocalDate,
    );
    return {
      identity: this.identity(card.external_id ?? null),
      point,
      distance,
      as_of_local_date: asOfLocalDate,
    };
  }

  /**
   * Полные факты давности по одному гостю провайдера.
   *
   * Доказанное посещение берётся ТОЛЬКО из истории визитов, где провайдерский
   * ответ уже отфильтрован каноническим присутствием `arrived`: `awaiting`,
   * `no_show`, удалённые и просто `completed` посещением не являются.
   * Будущая запись посещением не становится ни при каких условиях.
   */
  async forProviderClient(
    tenantId: string,
    input: {
      providerClientId: string | null;
      card?: { last_visit_date?: string | null } | null;
      /**
       * Уже прочитанная история визитов. Досье читает её ради услуг и ритма —
       * второй запрос за теми же строками был бы лишним походом к провайдеру.
       */
      history?: ReadonlyArray<{ start: string; attendance: string | null }>;
      historyLimit?: number;
    },
    when: RecencyAsOf,
  ): Promise<ClientRecencyFacts> {
    const asOfLocalDate = this.localDate(when);
    const asserted = providerAssertedLastVisit(
      input.card?.last_visit_date ?? null,
      asOfLocalDate,
    );

    if (!input.providerClientId) {
      const point = unknownPoint(
        RECENCY_UNKNOWN.identityUnknown,
        null,
        'not_measured',
      );
      return this.compose(null, when, asOfLocalDate, point, asserted, {
        window_days: null,
        attended_visits_observed: null,
        truncated: false,
      });
    }

    const limit = input.historyLimit ?? 50;
    let history: ReadonlyArray<{ start: string; attendance: string | null }> =
      input.history ?? [];
    let failure: string | null = null;
    try {
      if (!input.history) {
        history = await this.crmService.getClientVisitHistory(
          tenantId,
          input.providerClientId,
          limit,
          // Пояс салона — часть семантики: провайдер отдаёт время записи без
          // смещения, и сутки визита зависят от того, чьей полночью их мерить.
          when.timezone,
        );
      }
    } catch (error) {
      failure =
        error instanceof Error && /not_supported/.test(error.message)
          ? RECENCY_UNKNOWN.historyNotSupported
          : RECENCY_UNKNOWN.historyUnavailable;
    }

    if (failure) {
      return this.compose(
        input.providerClientId,
        when,
        asOfLocalDate,
        unknownPoint(
          failure,
          'provider_visit_history_canonical_attendance',
          'unavailable',
        ),
        asserted,
        {
          window_days: PROVIDER_VISIT_HISTORY_WINDOW_DAYS,
          attended_visits_observed: null,
          truncated: false,
        },
      );
    }

    const asOfInstant = when.asOf.getTime();
    const attended = history
      .filter((visit) => visit.attendance === 'arrived')
      .map((visit) => ({ at: visit.start, time: Date.parse(visit.start) }))
      .filter((visit) => Number.isFinite(visit.time))
      // 🔴 Будущее посещением не бывает. Запись на завтра — это план, и назвать
      // её последним визитом значило бы обнулить давность у того, кто не пришёл.
      .filter((visit) => visit.time <= asOfInstant)
      .sort((left, right) => right.time - left.time);

    const observation = {
      window_days: PROVIDER_VISIT_HISTORY_WINDOW_DAYS,
      attended_visits_observed: attended.length,
      truncated: history.length >= limit,
    };

    if (attended.length === 0) {
      return this.compose(
        input.providerClientId,
        when,
        asOfLocalDate,
        unknownPoint(
          RECENCY_UNKNOWN.noAttendedVisitInWindow,
          'provider_visit_history_canonical_attendance',
        ),
        asserted,
        observation,
      );
    }

    const latest = attended[0];
    const point: RecencyPoint = {
      // Окно истории конечно, поэтому даже найденный визит — наблюдение в
      // пределах окна, а не вся история гостя.
      state: 'measured_incomplete',
      local_date: localCalendarDate(when.timezone, new Date(latest.time)),
      at: new Date(latest.time).toISOString(),
      basis: 'provider_visit_history_canonical_attendance',
      attendance_proven: true,
      reason: null,
    };
    return this.compose(
      input.providerClientId,
      when,
      asOfLocalDate,
      point,
      asserted,
      observation,
    );
  }

  private identity(providerClientId: string | null): ClientIdentityScope {
    return {
      space: 'provider_client',
      provider_client_id: providerClientId,
      maya_client_id: null,
      limitation: IDENTITY_LIMITATION,
    };
  }

  private compose(
    providerClientId: string | null,
    when: RecencyAsOf,
    asOfLocalDate: string,
    attendedPoint: RecencyPoint,
    asserted: { point: RecencyPoint; distance: RecencyDistance },
    observation: ClientRecencyFacts['observation'],
  ): ClientRecencyFacts {
    return {
      identity: this.identity(providerClientId),
      as_of: {
        instant: when.asOf.toISOString(),
        local_date: asOfLocalDate,
        timezone: when.timezone,
      },
      last_attended_visit: attendedPoint,
      days_since_last_attended_visit: distanceFrom(
        attendedPoint,
        asOfLocalDate,
      ),
      provider_asserted_last_visit: asserted.point,
      days_since_provider_asserted_last_visit: asserted.distance,
      observation,
    };
  }
}
