import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  canonicalStateFingerprint,
  compareAppointmentState,
  DOMAIN_EVENT_TYPE,
  fingerprintState,
  mergeAppointmentState,
  type CanonicalAppointmentState,
  type DomainEventType,
  type IngestionMethod,
} from '../domain';
import { EventStoreService } from '../events/event-store.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Наблюдение одного визита у источника, приведённое к канону Maya. */
export interface ObservedAppointment {
  /** Внешний идентификатор записи у провайдера — провенанс, не идентичность. */
  externalId: string;
  state: CanonicalAppointmentState;
  /** Живёт в зеркале, но в сравнение не входит: деньги — глава 4. */
  totalPriceKopecks: number | null;
  currency: string;
}

export type AppointmentApplyOutcome =
  /** Строки не было — зеркало пополнилось. */
  | 'created'
  /** Строка была и изменилась. */
  | 'updated'
  /** Строка была и совпала. Самый частый исход: повтор доставки и проход сверки. */
  | 'unchanged';

export interface AppointmentApplyResult {
  appointmentId: string;
  outcome: AppointmentApplyOutcome;
  /** Типы выпущенных переходов, в порядке контракта. */
  transitions: DomainEventType[];
  /** Сколько фактов реально записано (повторы сюда не попадают). */
  eventsEmitted: number;
  /** Сколько отсечено дедупликацией базы. */
  duplicateEvents: number;
}

export interface ApplyObservationInput {
  tenantId: string;
  provider: string;
  observed: ObservedAppointment;
  /** Способ, которым узнали. На отпечаток НЕ влияет — влияет только состояние. */
  ingestionMethod: Extract<IngestionMethod, 'webhook' | 'reconciliation'>;
  /**
   * Установлена ли базовая линия наблюдения арендатора.
   *
   * 🔴 Без неё `appointment.created` не выпускается вовсе: запись, впервые
   * увиденную при подключении уже работающего салона, нельзя объявлять
   * созданной сегодня.
   */
  baselineEstablished: boolean;
  /** Момент наблюдения. См. пояснение к `occurredAt` ниже. */
  observedAt: Date;
}

/**
 * Применение наблюдения к зеркалу визитов (Cycle 03 B3.3).
 *
 * 🔴 Единственный писатель зеркала на пути обнаружения изменений. Вебхук и
 * сверка — два ТРИГГЕРА этой службы, а не две её копии: правило сравнения,
 * порядок переходов и транзакционная граница у них общие по построению.
 *
 * 🔴 Побочных действий нет ни одного. Ни уведомлений, ни записей в CRM, ни
 * начислений. Событие означает «Maya заметила», а не «Maya среагировала».
 */
@Injectable()
export class AppointmentChangeService {
  private readonly logger = new Logger(AppointmentChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly eventStore: EventStoreService,
  ) {}

  /**
   * Прочитанная истина → новое состояние зеркала + события о переходах.
   *
   * Всё в ОДНОЙ транзакции. Строка визита берётся под блокировку до вычисления
   * порядкового номера: без этого два одновременных применения к одной записи
   * прочитали бы один и тот же максимум и выдали бы одинаковый
   * `entitySequence`.
   */
  async applyObservation(
    input: ApplyObservationInput,
  ): Promise<AppointmentApplyResult> {
    const tenantId = this.tenantContext.assertTenantId(input.tenantId);
    const { observed, provider } = input;

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.lockExisting(
        tx,
        tenantId,
        provider,
        observed.externalId,
      );

      if (!existing) {
        return this.createMirrorRow(tx, tenantId, input);
      }

      const previous = this.stateOfRow(existing);
      const transitions = compareAppointmentState(previous, observed.state);
      const merged = mergeAppointmentState(previous, observed.state);

      const mirrorChanged =
        this.stateDiffers(previous, merged) ||
        existing.totalPriceKopecks !== observed.totalPriceKopecks;

      if (!mirrorChanged && transitions.length === 0) {
        return {
          appointmentId: existing.id,
          outcome: 'unchanged' as const,
          transitions: [],
          eventsEmitted: 0,
          duplicateEvents: 0,
        };
      }

      await tx.appointment.update({
        where: { id: existing.id },
        data: {
          staffExternalId: merged.staffExternalId,
          staffId: merged.staffId,
          startAt: merged.startAt,
          endAt: merged.endAt,
          serviceIds: merged.serviceIds,
          status: merged.status,
          attendance: merged.attendance,
          mayaClientId: merged.mayaClientId,
          totalPriceKopecks: observed.totalPriceKopecks,
          currency: observed.currency,
        },
      });

      const emitted = await this.emitTransitions(tx, {
        tenantId,
        provider,
        appointmentId: existing.id,
        externalId: observed.externalId,
        state: merged,
        transitions,
        ingestionMethod: input.ingestionMethod,
        observedAt: input.observedAt,
      });

      return {
        appointmentId: existing.id,
        outcome: 'updated' as const,
        transitions: transitions.map((transition) => transition.type),
        ...emitted,
      };
    });
  }

  /**
   * Блокировка строки зеркала на время применения.
   *
   * 🔴 `FOR UPDATE` здесь не про производительность, а про порядок событий.
   * Вебхук и сверка могут сработать по одной записи одновременно; без замка оба
   * прочитали бы одинаковый максимум `entitySequence`, и последовательность,
   * которую мы объявили частью контракта, перестала бы существовать.
   */
  private async lockExisting(
    tx: Prisma.TransactionClient,
    tenantId: string,
    provider: string,
    externalId: string,
  ): Promise<MirrorRow | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Appointment"
      WHERE "tenantId" = ${tenantId}
        AND "crmProvider" = ${provider}
        AND "crmExternalId" = ${externalId}
      FOR UPDATE
    `;

    const id = locked[0]?.id;
    if (!id) return null;

    return tx.appointment.findUnique({
      where: { id },
      select: MIRROR_ROW_SELECT,
    });
  }

  private async createMirrorRow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: ApplyObservationInput,
  ): Promise<AppointmentApplyResult> {
    const { observed } = input;
    const state = observed.state;

    const created = await tx.appointment.create({
      data: {
        tenantId,
        // Аккаунта у записи салона нет и не выдумывается — правило B3.2.
        clientId: null,
        mayaClientId: state.mayaClientId,
        crmProvider: input.provider,
        crmExternalId: observed.externalId,
        source: 'external',
        staffId: state.staffId,
        staffExternalId: state.staffExternalId,
        serviceIds: [...state.serviceIds].sort(),
        startAt: state.startAt,
        endAt: state.endAt,
        // Буферов у внешней записи нет: их вводит внутренний календарь.
        blockedStartAt: state.startAt,
        blockedEndAt: state.endAt,
        status: state.status,
        attendance: state.attendance,
        notes: null,
        totalPriceKopecks: observed.totalPriceKopecks,
        currency: observed.currency || 'RUB',
      },
      select: { id: true },
    });

    /**
     * 🔴 `created` — только после установленной базовой линии.
     *
     * Иначе первый взгляд на уже работающий салон объявил бы созданными
     * сегодня записи, сделанные месяцы назад. Это доказано в B3.2: наполнение
     * зеркала дало 1922 строки и ноль событий.
     */
    if (!input.baselineEstablished) {
      return {
        appointmentId: created.id,
        outcome: 'created',
        transitions: [],
        eventsEmitted: 0,
        duplicateEvents: 0,
      };
    }

    const emitted = await this.emitTransitions(tx, {
      tenantId,
      provider: input.provider,
      appointmentId: created.id,
      externalId: observed.externalId,
      state,
      transitions: [
        {
          type: DOMAIN_EVENT_TYPE.appointmentCreated,
          payload: {
            start_at: state.startAt.toISOString(),
            end_at: state.endAt.toISOString(),
            staff_external_id: state.staffExternalId,
            staff_id: state.staffId,
            service_ids: [...state.serviceIds].sort(),
          },
        },
      ],
      ingestionMethod: input.ingestionMethod,
      observedAt: input.observedAt,
    });

    return {
      appointmentId: created.id,
      outcome: 'created',
      transitions: [DOMAIN_EVENT_TYPE.appointmentCreated],
      ...emitted,
    };
  }

  private async emitTransitions(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      provider: string;
      appointmentId: string;
      externalId: string;
      state: CanonicalAppointmentState;
      transitions: {
        type: DomainEventType;
        payload: Record<string, unknown>;
      }[];
      ingestionMethod: Extract<IngestionMethod, 'webhook' | 'reconciliation'>;
      observedAt: Date;
    },
  ): Promise<{ eventsEmitted: number; duplicateEvents: number }> {
    if (params.transitions.length === 0) {
      return { eventsEmitted: 0, duplicateEvents: 0 };
    }

    const nextSequence = await this.nextEntitySequence(
      tx,
      params.appointmentId,
    );
    const state = fingerprintState(params.state);

    let eventsEmitted = 0;
    let duplicateEvents = 0;

    for (const [index, transition] of params.transitions.entries()) {
      const result = await this.eventStore.append(
        {
          tenantId: params.tenantId,
          type: transition.type,
          entityType: 'appointment',
          // Идентичность MAYA. Внешний идентификатор — только в `sourceRef`.
          entityId: params.appointmentId,
          entitySequence: nextSequence + index,
          /**
           * 🔴 Момент НАБЛЮДЕНИЯ, а не момент изменения.
           *
           * Провайдер отметки об изменении не даёт: в разбираемых полях записи
           * её нет вовсе. Значит точное время изменения нам неизвестно, и
           * честное утверждение здесь одно — «произошло не позже этого
           * момента». Ставить сюда `start_at` было бы хуже: время визита к
           * времени правки отношения не имеет.
           */
          occurredAt: params.observedAt,
          source: params.provider,
          sourceRef: params.externalId,
          ingestionMethod: params.ingestionMethod,
          dedupFingerprint: canonicalStateFingerprint({
            source: params.provider,
            entityType: 'appointment',
            entityId: params.appointmentId,
            type: transition.type,
            state,
          }),
          payload: transition.payload as Prisma.InputJsonValue,
        },
        tx,
      );

      if (result.outcome === 'persisted') eventsEmitted += 1;
      else if (result.outcome === 'duplicate') duplicateEvents += 1;
    }

    return { eventsEmitted, duplicateEvents };
  }

  /**
   * Следующий порядковый номер в пределах визита.
   *
   * Глобального порядка Maya не обещает — только порядок внутри сущности, и
   * ровно он нужен потребителю, читающему историю одной записи.
   */
  private async nextEntitySequence(
    tx: Prisma.TransactionClient,
    appointmentId: string,
  ): Promise<number> {
    const last = await tx.domainEvent.aggregate({
      where: { entityType: 'appointment', entityId: appointmentId },
      _max: { entitySequence: true },
    });
    return (last._max.entitySequence ?? 0) + 1;
  }

  private stateOfRow(row: MirrorRow): CanonicalAppointmentState {
    return {
      staffExternalId: row.staffExternalId,
      staffId: row.staffId,
      startAt: row.startAt,
      endAt: row.endAt,
      serviceIds: readServiceIds(row.serviceIds),
      status: row.status,
      attendance: readAttendance(row.attendance),
      mayaClientId: row.mayaClientId,
    };
  }

  private stateDiffers(
    left: CanonicalAppointmentState,
    right: CanonicalAppointmentState,
  ): boolean {
    return (
      JSON.stringify(fingerprintState(left)) !==
      JSON.stringify(fingerprintState(right))
    );
  }
}

const MIRROR_ROW_SELECT = {
  id: true,
  staffId: true,
  staffExternalId: true,
  startAt: true,
  endAt: true,
  serviceIds: true,
  status: true,
  attendance: true,
  mayaClientId: true,
  totalPriceKopecks: true,
} as const;

interface MirrorRow {
  id: string;
  staffId: string | null;
  staffExternalId: string;
  startAt: Date;
  endAt: Date;
  serviceIds: Prisma.JsonValue;
  status: string;
  attendance: string | null;
  mayaClientId: string | null;
  totalPriceKopecks: number | null;
}

function readServiceIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : ''))
    .filter(Boolean)
    .sort();
}

/**
 * Чтение присутствия из зеркала.
 *
 * Значение вне канона читается как «не наблюдалось»: база его не пропустит
 * (CHECK), но зеркало не имеет права ДОГАДЫВАТЬСЯ, если оно всё же там окажется.
 */
function readAttendance(
  value: string | null,
): CanonicalAppointmentState['attendance'] {
  if (value === null) return null;
  return VALID_ATTENDANCE.has(value)
    ? (value as CanonicalAppointmentState['attendance'])
    : null;
}

const VALID_ATTENDANCE = new Set([
  'awaiting',
  'arrived',
  'no_show',
  'confirmed_by_client',
]);
