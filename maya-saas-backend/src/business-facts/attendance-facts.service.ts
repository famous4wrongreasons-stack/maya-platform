import { Injectable } from '@nestjs/common';

import type { BusinessFact, BusinessPeriod, FactObservation } from '../domain';
import {
  CANCELED_STATUS_VALUES,
  FACT_INCOMPLETE_REASON,
  FACT_UNAVAILABLE_REASON,
  completeObservation,
  incompleteObservation,
  measuredFact,
  notMeasuredFact,
  unavailableFact,
} from '../domain';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Покрыт ли период доказанным чтением зеркала. */
export interface MirrorCoverage {
  covered: boolean;
  /** `finishedAt` последнего ПОЛНОГО прогона, окно которого накрывает период. */
  observedThrough: string | null;
}

export interface AttendanceFacts {
  /** Клиент пришёл — доказанное присутствие, а не статус визита. */
  arrived: BusinessFact;
  /** Клиент не пришёл. */
  noShow: BusinessFact;
  /** Отметки ещё нет либо клиент подтвердил визит. */
  awaiting: BusinessFact;
  /** Присутствие НЕ наблюдалось. Это не ноль и не «ожидание». */
  notObserved: BusinessFact;
  /** Всего строк зеркала в периоде. */
  records: BusinessFact;
  coverage: MirrorCoverage;
}

export interface AttendanceScope {
  branchId?: string | null;
  staffExternalId?: string | null;
  /**
   * 🔴 Ведёт ли источник календаря присутствие вообще.
   *
   * У внутреннего календаря такого понятия нет: отметку о приходе там никто
   * не ставит, и колонка пуста НЕ потому, что мы не смотрели, а потому что
   * измерять нечего. Это `not_measured`, а не «неполно» — разные состояния,
   * и путать их значит обещать, что когда-нибудь досмотрим.
   */
  attendanceSupported?: boolean;
  now?: Date;
}

/**
 * Присутствие клиентов за период — из канонического зеркала главы 3.
 *
 * 🔴 Почему источник именно зеркало, а не журнал. Присутствие в форме периода
 * не существует больше нигде: журнал отдаёт его записью за записью, а
 * `Appointment.attendance` — единственная колонка, где оно хранится вместе с
 * различением «не наблюдалось» и «отметки нет». Это и есть выполнение правила
 * §5: источник выбран доказательством, а не по умолчанию.
 *
 * 🔴 Почему НЕ из статуса. `completed` у провайдера выводится из «отмечен
 * приход ИЛИ оплачено» (`recordStatus`). На боевых данных есть строка
 * `completed / awaiting`: визит помечен проведённым, а провайдер прямо
 * утверждает, что отметки о приходе нет. Считать такую запись пришедшей —
 * значит подменить один бизнес-факт другим.
 *
 * 🔴 Почему полнота обязательна. 1330 из 1950 боевых визитов лежат вне
 * контуров сверки, и присутствие у них не наблюдалось ни разу. Без полноты
 * «пришло 552» читалось бы как измерение, хотя это нижняя граница.
 */
@Injectable()
export class AttendanceFactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Покрыт ли период доказанным чтением.
   *
   * Ответ выводится из `ReconciliationRun`, а не из предположения: годится
   * только ЗАВЕРШЁННЫЙ и ПОЛНЫЙ прогон, окно которого накрывает период
   * целиком. Упавший прогон, усечённый прогон и прогон по соседнему окну
   * покрытием не являются.
   */
  async coverage(
    tenantId: string,
    period: BusinessPeriod,
  ): Promise<MirrorCoverage> {
    if (typeof this.prisma.reconciliationRun?.findFirst !== 'function') {
      return { covered: false, observedThrough: null };
    }
    const run = await this.prisma.reconciliationRun.findFirst({
      where: {
        tenantId,
        completeness: 'complete',
        failureCode: null,
        finishedAt: { not: null },
        windowFrom: { lte: new Date(period.from) },
        windowTo: { gte: new Date(period.to) },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });
    if (!run?.finishedAt) {
      return { covered: false, observedThrough: null };
    }
    /**
     * 🔴 Cycle 04 closure A. Покрыт период только ДО момента наблюдения.
     *
     * Окно прогона — это то, что у провайдера ЗАПРОСИЛИ, а не то, что успело
     * произойти: ближний контур просит ±7 суток от «сейчас», поэтому строка
     * легально накрывает завтрашний день. Наблюдение при этом закончилось в
     * `finishedAt`, и всё, что позже него, не наблюдалось никем.
     *
     * Без этой проверки «пришли 0, неявок 0» за завтра публиковалось с
     * `state: measured` и `zero_means_none: true` — доказанный ноль там, где
     * день ещё не наступил.
     */
    const observedThrough = run.finishedAt.toISOString();
    /**
     * Покрыт период, который УСПЕЛ НАЧАТЬСЯ до момента наблюдения.
     *
     * Первая версия этой правки сравнивала с концом периода — и вынесла вместе
     * с завтрашним днём сегодняшний: у суток конец в 23:59, у «месяца к дате»
     * конец это «сейчас», а прогон сверки всегда завершился раньше. Владелец
     * переставал получать число «сколько пришло сегодня» вовсе, а причиной
     * неполноты ему называли «период уходит за момент наблюдения» вместо
     * настоящей — «у части записей нет отметки».
     *
     * Различие проходит по НАЧАЛУ: период, который ещё не начинался к моменту
     * наблюдения, не наблюдался никак, и «пришли 0» за него — выдумка. Период,
     * который уже идёт, наблюдён по состоянию на `observed_through`, и этот
     * момент публикуется вместе с фактом.
     */
    const covered = new Date(period.from).getTime() <= run.finishedAt.getTime();
    return { covered, observedThrough };
  }

  async periodAttendance(
    tenantId: string,
    period: BusinessPeriod,
    scope: AttendanceScope = {},
  ): Promise<AttendanceFacts> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const calculatedAt = scope.now ?? new Date();

    if (scope.attendanceSupported === false) {
      return this.notMeasured(scopedTenantId, period, calculatedAt);
    }

    if (typeof this.prisma.appointment?.groupBy !== 'function') {
      return this.unavailable(scopedTenantId, period, calculatedAt);
    }

    const [coverage, grouped] = await Promise.all([
      this.coverage(scopedTenantId, period),
      this.prisma.appointment.groupBy({
        by: ['attendance'],
        where: {
          tenantId: scopedTenantId,
          startAt: { gte: new Date(period.from), lte: new Date(period.to) },
          // 🔴 Удалённая запись из присутствия исключена.
          //
          // Провайдер сообщает только факт удаления, и это самое сильное его
          // утверждение о записи: визита периода больше нет. Отметка о приходе
          // на такой строке — след прошлого состояния, а не заявление о том,
          // что визит состоялся. Считать её и отменой, и присутствием значит
          // засчитать одно событие дважды.
          status: { notIn: [...CANCELED_STATUS_VALUES] },
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          ...(scope.staffExternalId
            ? { staffExternalId: scope.staffExternalId }
            : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const row of grouped) {
      const key = row.attendance ?? NOT_OBSERVED;
      counts.set(key, (counts.get(key) ?? 0) + (row._count?._all ?? 0));
    }

    const arrived = counts.get('arrived') ?? 0;
    const noShow = counts.get('no_show') ?? 0;
    // `confirmed_by_client` — это тоже «ещё не пришёл»: клиент подтвердил
    // намерение, а не факт визита. Отдельной корзины он не заслуживает, но и
    // к присутствию отнесён быть не может.
    const awaiting =
      (counts.get('awaiting') ?? 0) + (counts.get('confirmed_by_client') ?? 0);
    const notObserved = counts.get(NOT_OBSERVED) ?? 0;
    const records = arrived + noShow + awaiting + notObserved;

    // Наблюдение за ПОКРЫТИЕМ: сколько строк лежит в зеркале за период — это
    // измерено полностью ровно тогда, когда период кем-то перечитан.
    const coverageObservation: FactObservation = coverage.covered
      ? completeObservation({
          source: 'canonical_mirror',
          observedThrough: coverage.observedThrough,
        })
      : incompleteObservation({
          source: 'canonical_mirror',
          // Наблюдения не было вовсе — или период уходит за его момент.
          reason: coverage.observedThrough
            ? FACT_INCOMPLETE_REASON.periodExtendsPastObservation
            : FACT_INCOMPLETE_REASON.periodOutsideObservedRange,
          observedThrough: coverage.observedThrough,
        });

    // Наблюдение за ПРИСУТСТВИЕМ строже: даже полностью перечитанный период
    // не даёт измерения, пока хоть у одной записи присутствие не наблюдалось.
    const attendanceObservation: FactObservation =
      coverage.covered && notObserved === 0
        ? coverageObservation
        : incompleteObservation({
            source: 'canonical_mirror',
            reason: coverage.covered
              ? FACT_INCOMPLETE_REASON.attendanceNotObservedForEveryRecord
              : coverage.observedThrough
                ? FACT_INCOMPLETE_REASON.periodExtendsPastObservation
                : FACT_INCOMPLETE_REASON.periodOutsideObservedRange,
            observedThrough: coverage.observedThrough,
          });

    const fact = (
      key: string,
      value: number,
      observation: FactObservation,
      basis: 'observed_attendance' | 'canonical_mirror_records',
    ): BusinessFact =>
      measuredFact({
        key,
        tenantId: scopedTenantId,
        period,
        value,
        unit: 'count',
        basis,
        observation,
        calculatedAt,
      });

    return {
      arrived: fact(
        'attendance.arrived',
        arrived,
        attendanceObservation,
        'observed_attendance',
      ),
      noShow: fact(
        'attendance.no_show',
        noShow,
        attendanceObservation,
        'observed_attendance',
      ),
      awaiting: fact(
        'attendance.awaiting',
        awaiting,
        attendanceObservation,
        'observed_attendance',
      ),
      // Сколько записей мы НЕ смотрели — измерено полностью, как только период
      // перечитан: это свойство самого зеркала, а не провайдера.
      notObserved: fact(
        'attendance.not_observed',
        notObserved,
        coverageObservation,
        'canonical_mirror_records',
      ),
      records: fact(
        'attendance.records',
        records,
        coverageObservation,
        'canonical_mirror_records',
      ),
      coverage,
    };
  }

  /**
   * Источник присутствия не ведёт. Значения не будет никогда, а не «пока».
   */
  private notMeasured(
    tenantId: string,
    period: BusinessPeriod,
    calculatedAt: Date,
  ): AttendanceFacts {
    const observation = completeObservation({ source: 'canonical_mirror' });
    const missing = (key: string) =>
      notMeasuredFact({
        key,
        tenantId,
        period,
        unit: 'count',
        basis: 'observed_attendance',
        observation,
        reason: FACT_UNAVAILABLE_REASON.notMeasuredBySource,
        calculatedAt,
      });
    return {
      arrived: missing('attendance.arrived'),
      noShow: missing('attendance.no_show'),
      awaiting: missing('attendance.awaiting'),
      notObserved: missing('attendance.not_observed'),
      records: missing('attendance.records'),
      coverage: { covered: false, observedThrough: null },
    };
  }

  private unavailable(
    tenantId: string,
    period: BusinessPeriod,
    calculatedAt: Date,
  ): AttendanceFacts {
    const observation = incompleteObservation({
      source: 'canonical_mirror',
      reason: FACT_INCOMPLETE_REASON.periodOutsideObservedRange,
    });
    const missing = (key: string) =>
      unavailableFact({
        key,
        tenantId,
        period,
        unit: 'count',
        basis: 'observed_attendance',
        observation,
        reason: FACT_UNAVAILABLE_REASON.sourceDidNotAnswer,
        calculatedAt,
      });
    return {
      arrived: missing('attendance.arrived'),
      noShow: missing('attendance.no_show'),
      awaiting: missing('attendance.awaiting'),
      notObserved: missing('attendance.not_observed'),
      records: missing('attendance.records'),
      coverage: { covered: false, observedThrough: null },
    };
  }
}

const NOT_OBSERVED = '__not_observed__';
