import { Injectable } from '@nestjs/common';

import type { CanonicalAppointmentState, VisitAttendance } from '../domain';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ObservedAppointment } from './appointment-change.service';
import { CrmService } from './crm.service';
import { APPOINTMENT_REMOVED_STATUS } from '../domain';

/** Каноническая форма записи, приходящая из журнала или из карточки визита. */
export interface SourceAppointmentShape {
  /** Ключ Maya (`crm-<externalId>`) либо голый внешний идентификатор. */
  id: string;
  client: { id: string | null };
  provider: { id: string };
  service_ids: string[];
  start_at: string;
  end_at: string;
  status: string;
  attendance?: VisitAttendance | null;
  total_price: number | null;
  currency: string;
}

/**
 * Сборка наблюдения: запись у источника → каноническое состояние Maya.
 *
 * 🔴 Один сборщик на оба пути. Вебхук читает одну карточку, сверка — окно
 * журнала, но приводят они прочитанное к состоянию ОДИНАКОВО. Иначе «одно и то
 * же состояние» у двух путей означало бы разные вещи, и сравнивать их было бы
 * не с чем.
 *
 * Разрешение идентичностей (мастер, клиент бизнеса) живёт здесь же: это часть
 * приведения к канону, а не деталь применения.
 */
@Injectable()
export class AppointmentObservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly crmService: CrmService,
  ) {}

  /**
   * Прочитать истину по одной записи.
   *
   * `unreadable` означает «источник не ответил», а не «записи нет»: разница
   * решает, карантинить доставку или считать её доказательством удаления.
   */
  async observe(params: {
    tenantId: string;
    provider: string;
    externalId: string;
    /** Доставка утверждает удаление. Проверяем чтением, а не верим на слово. */
    expectRemoved: boolean;
  }): Promise<ObservedAppointment | 'unreadable'> {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);

    try {
      const detail = await this.crmService.getAppointmentDetailForSystem(
        tenantId,
        params.externalId,
      );
      return this.toObserved(tenantId, params.provider, detail);
    } catch {
      if (!params.expectRemoved) {
        return 'unreadable';
      }

      /**
       * 🔴 Запись не читается, И провайдер сказал «удалена».
       *
       * Только в этом сочетании отсутствие становится доказательством. Само по
       * себе «не нашли» не означает ничего: выборка могла быть неполной, а
       * запрос — не дойти. Прежнее состояние берём из зеркала и меняем ровно
       * одно поле — статус: остальное сочинять не из чего.
       */
      const mirrored = await this.mirrorState(
        tenantId,
        params.provider,
        params.externalId,
      );
      if (!mirrored) return 'unreadable';

      return {
        externalId: params.externalId,
        state: { ...mirrored.state, status: APPOINTMENT_REMOVED_STATUS },
        totalPriceKopecks: mirrored.totalPriceKopecks,
        currency: mirrored.currency,
      };
    }
  }

  /**
   * Привести запись журнала к каноническому наблюдению.
   *
   * Отдельный вход для сверки: она уже прочитала окно целиком, и перечитывать
   * каждую запись карточкой значило бы сделать сотни лишних запросов к
   * провайдеру ради данных, которые уже на руках.
   */
  async fromSourceShape(
    tenantId: string,
    provider: string,
    appointment: SourceAppointmentShape,
  ): Promise<ObservedAppointment | null> {
    const externalId = this.externalIdOf(appointment.id);
    if (!externalId) return null;
    return this.toObserved(tenantId, provider, appointment, externalId);
  }

  /**
   * Установлена ли базовая линия наблюдения арендатора.
   *
   * До неё `appointment.created` не выпускается: первый взгляд на уже
   * работающий салон не делает его записи созданными сегодня.
   */
  async baselineEstablished(tenantId: string): Promise<boolean> {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { watchStartedAt: true },
    });
    return Boolean(integration?.watchStartedAt);
  }

  private async toObserved(
    tenantId: string,
    provider: string,
    appointment: SourceAppointmentShape,
    knownExternalId?: string,
  ): Promise<ObservedAppointment> {
    const externalId =
      knownExternalId ?? this.externalIdOf(appointment.id) ?? appointment.id;

    const [staffId, mayaClientId] = await Promise.all([
      this.crmService.resolveStaffIdForBooking(
        tenantId,
        appointment.provider.id,
      ),
      this.resolveClient(tenantId, provider, appointment.client.id),
    ]);

    const state: CanonicalAppointmentState = {
      staffExternalId: appointment.provider.id,
      staffId,
      startAt: new Date(appointment.start_at),
      endAt: new Date(appointment.end_at),
      serviceIds: [...appointment.service_ids].sort(),
      status: appointment.status,
      // `undefined` и `null` здесь одно и то же: провайдер ничего не сказал.
      attendance: appointment.attendance ?? null,
      mayaClientId,
    };

    return {
      externalId,
      state,
      totalPriceKopecks:
        appointment.total_price === null ||
        appointment.total_price === undefined
          ? null
          : Math.round(appointment.total_price * 100),
      currency: appointment.currency || 'RUB',
    };
  }

  private async mirrorState(
    tenantId: string,
    provider: string,
    externalId: string,
  ): Promise<{
    state: CanonicalAppointmentState;
    totalPriceKopecks: number | null;
    currency: string;
  } | null> {
    const row = await this.prisma.appointment.findFirst({
      where: { tenantId, crmProvider: provider, crmExternalId: externalId },
      select: {
        staffId: true,
        staffExternalId: true,
        startAt: true,
        endAt: true,
        serviceIds: true,
        status: true,
        attendance: true,
        mayaClientId: true,
        totalPriceKopecks: true,
        currency: true,
      },
    });
    if (!row) return null;

    return {
      state: {
        staffExternalId: row.staffExternalId,
        staffId: row.staffId,
        startAt: row.startAt,
        endAt: row.endAt,
        serviceIds: Array.isArray(row.serviceIds)
          ? (row.serviceIds as unknown[])
              .map((item) => (typeof item === 'string' ? item : ''))
              .filter(Boolean)
              .sort()
          : [],
        status: row.status,
        attendance: (row.attendance as VisitAttendance | null) ?? null,
        mayaClientId: row.mayaClientId,
      },
      totalPriceKopecks: row.totalPriceKopecks,
      currency: row.currency,
    };
  }

  /**
   * Клиент бизнеса — только через доказанную связь провайдера.
   *
   * 🔴 По телефону НЕ склеиваем: совпадение номера доказательством тождества не
   * является. Правило владельца с главы 2.
   */
  private async resolveClient(
    tenantId: string,
    provider: string,
    externalClientId: string | null,
  ): Promise<string | null> {
    if (!externalClientId) return null;
    const link = await this.prisma.crmClientLink.findFirst({
      where: { tenantId, provider, externalId: externalClientId },
      select: { clientId: true },
    });
    return link?.clientId ?? null;
  }

  /** Внешний идентификатор из канонического ключа Maya. */
  private externalIdOf(appointmentKey: string): string | null {
    const raw = appointmentKey.startsWith('crm-')
      ? appointmentKey.slice(4)
      : appointmentKey;
    return raw.trim() || null;
  }
}
