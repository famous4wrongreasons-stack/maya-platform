import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { CRM_JOURNAL_MAX_WINDOW_DAYS } from './crm-provider-limits';
import { CrmService } from './crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Счётчики прохода. Ни одного поля с персональными данными. */
export interface MirrorBootstrapCounts {
  windows: number;
  fetched: number;
  complete_windows: number;
  truncated_windows: number;
  would_create: number;
  would_update: number;
  unchanged: number;
  client_resolved: number;
  client_unresolved: number;
  staff_resolved: number;
  staff_unresolved: number;
  cancelled_or_deleted: number;
  collisions: number;
}

export interface MirrorBootstrapResult extends MirrorBootstrapCounts {
  applied: boolean;
  from: string;
  to: string;
  /** Полон ли проход целиком. Только полный двигает базовую линию наблюдения. */
  complete: boolean;
}

/**
 * Наполнение зеркала визитов реальными записями CRM.
 *
 * 🔴 Что здесь НЕ происходит.
 *
 * 1. **Доменных событий не создаётся ни одного.** Запись, сделанная в салоне
 *    полгода назад, не может дать `appointment.created` сегодня: это ложь о
 *    времени, из которой глава 4 сделала бы ложные выводы о динамике. Первый
 *    проход — это наблюдение существующего состояния, а не история.
 * 2. **Пользователи и членства не создаются.** Зеркало CRM не заводит аккаунты
 *    Maya: связь с аккаунтом появляется только через доказанный вход клиента.
 * 3. **Клиенты не склеиваются по телефону.** Совпадение номера не является
 *    доказательством тождества — правило владельца с главы 2.
 */
@Injectable()
export class AppointmentMirrorService {
  private readonly logger = new Logger(AppointmentMirrorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly crmService: CrmService,
  ) {}

  /**
   * Проход по окнам.
   *
   * Окно ограничено правилом провайдера (константа границы CRM), поэтому
   * длинный горизонт режется на управляемые куски: полнота каждого куска
   * оценивается отдельно, и один неполный не отменяет остальные.
   */
  async bootstrap(params: {
    tenantId: string;
    from: Date;
    to: Date;
    apply: boolean;
  }): Promise<MirrorBootstrapResult> {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    const counts: MirrorBootstrapCounts = {
      windows: 0,
      fetched: 0,
      complete_windows: 0,
      truncated_windows: 0,
      would_create: 0,
      would_update: 0,
      unchanged: 0,
      client_resolved: 0,
      client_unresolved: 0,
      staff_resolved: 0,
      staff_unresolved: 0,
      cancelled_or_deleted: 0,
      collisions: 0,
    };

    const provider = await this.providerOf(tenantId);
    const windowMs = CRM_JOURNAL_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    for (
      let cursor = params.from.getTime();
      cursor < params.to.getTime();
      cursor += windowMs
    ) {
      const windowFrom = new Date(cursor);
      const windowTo = new Date(
        Math.min(cursor + windowMs, params.to.getTime()),
      );
      counts.windows += 1;

      const journal = await this.crmService.getJournal(
        tenantId,
        { from: windowFrom.toISOString(), to: windowTo.toISOString() },
        // Отменённые нужны: без них отмена выглядела бы исчезновением.
        { includeCanceled: true },
      );

      if (journal.completeness === 'complete') {
        counts.complete_windows += 1;
      } else {
        counts.truncated_windows += 1;
        this.logger.warn(
          `mirror window ${windowFrom.toISOString()}..${windowTo.toISOString()} ` +
            `is ${journal.completeness} (${journal.truncation_reason}); ` +
            'nothing is declared missing from it',
        );
      }

      for (const appointment of journal.appointments) {
        counts.fetched += 1;
        await this.reconcileOne({
          tenantId,
          provider,
          appointment,
          apply: params.apply,
          counts,
        });
      }
    }

    return {
      ...counts,
      applied: params.apply,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      // 🔴 Проход полон, только если полны ВСЕ окна. Иначе выводов об
      // отсутствии по нему делать нельзя, и базовая линия не двигается.
      complete: counts.truncated_windows === 0,
    };
  }

  private async reconcileOne(input: {
    tenantId: string;
    provider: string;
    appointment: {
      id: string;
      client: { id: string | null; name: string };
      provider: { id: string };
      service_ids: string[];
      start_at: string;
      end_at: string;
      status: string;
      notes: string | null;
      total_price: number | null;
      currency: string;
    };
    apply: boolean;
    counts: MirrorBootstrapCounts;
  }): Promise<void> {
    const { tenantId, provider, appointment, counts } = input;
    const externalId = this.externalIdOf(appointment.id);
    if (!externalId) {
      counts.collisions += 1;
      return;
    }

    if (appointment.status === 'canceled') {
      counts.cancelled_or_deleted += 1;
    }

    const staffId = await this.crmService.resolveStaffIdForBooking(
      tenantId,
      appointment.provider.id,
    );
    if (staffId) counts.staff_resolved += 1;
    else counts.staff_unresolved += 1;

    const mayaClientId = await this.resolveClient(
      tenantId,
      provider,
      appointment.client.id,
    );
    if (mayaClientId) counts.client_resolved += 1;
    else counts.client_unresolved += 1;

    const existing = await this.prisma.appointment.findFirst({
      where: { tenantId, crmProvider: provider, crmExternalId: externalId },
      select: {
        id: true,
        staffId: true,
        staffExternalId: true,
        startAt: true,
        endAt: true,
        status: true,
        serviceIds: true,
        mayaClientId: true,
        totalPriceKopecks: true,
      },
    });

    const startAt = new Date(appointment.start_at);
    const endAt = new Date(appointment.end_at);
    const totalPriceKopecks =
      appointment.total_price === null
        ? null
        : Math.round(appointment.total_price * 100);
    const serviceIds = [...appointment.service_ids].sort();

    if (!existing) {
      counts.would_create += 1;
      if (!input.apply) return;

      await this.prisma.appointment.create({
        data: {
          tenantId,
          // 🔴 Аккаунта нет и не выдумывается: это запись салона, а не бронь
          // из кабинета. Пользователей зеркало не создаёт.
          clientId: null,
          mayaClientId,
          crmProvider: provider,
          crmExternalId: externalId,
          source: 'external',
          staffId,
          staffExternalId: appointment.provider.id,
          serviceIds: serviceIds,
          startAt,
          endAt,
          // Буферов у внешней записи нет: их вводит внутренний календарь.
          blockedStartAt: startAt,
          blockedEndAt: endAt,
          status: appointment.status,
          notes: null,
          totalPriceKopecks,
          currency: appointment.currency || 'RUB',
        },
      });
      return;
    }

    const changed = this.differs(existing, {
      staffId,
      staffExternalId: appointment.provider.id,
      startAt,
      endAt,
      status: appointment.status,
      serviceIds,
      mayaClientId,
      totalPriceKopecks,
    });

    if (!changed) {
      counts.unchanged += 1;
      return;
    }

    counts.would_update += 1;
    if (!input.apply) return;

    await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        staffId,
        staffExternalId: appointment.provider.id,
        startAt,
        endAt,
        status: appointment.status,
        serviceIds: serviceIds,
        // Уже установленную связь с клиентом не стираем: разрешение могло
        // появиться позже и не должно теряться от того, что провайдер не
        // отдал идентификатор в этой выборке.
        ...(mayaClientId ? { mayaClientId } : {}),
        totalPriceKopecks,
      },
    });
  }

  /**
   * Каноническое состояние, по которому зеркало понимает «изменилось».
   *
   * 🔴 Сравниваются ровно те поля, которые зеркало хранит, — и ничего больше.
   * Сырое тело провайдера отпечатком не является: любое несущественное касание
   * записи выглядело бы изменением.
   */
  private differs(
    existing: {
      staffId: string | null;
      staffExternalId: string;
      startAt: Date;
      endAt: Date;
      status: string;
      serviceIds: Prisma.JsonValue;
      mayaClientId: string | null;
      totalPriceKopecks: number | null;
    },
    fresh: {
      staffId: string | null;
      staffExternalId: string;
      startAt: Date;
      endAt: Date;
      status: string;
      serviceIds: string[];
      mayaClientId: string | null;
      totalPriceKopecks: number | null;
    },
  ): boolean {
    const knownServices = Array.isArray(existing.serviceIds)
      ? (existing.serviceIds as unknown[])
          .map((value) => (typeof value === 'string' ? value : ''))
          .filter(Boolean)
          .sort()
      : [];

    return (
      existing.staffId !== fresh.staffId ||
      existing.staffExternalId !== fresh.staffExternalId ||
      existing.startAt.getTime() !== fresh.startAt.getTime() ||
      existing.endAt.getTime() !== fresh.endAt.getTime() ||
      existing.status !== fresh.status ||
      existing.totalPriceKopecks !== fresh.totalPriceKopecks ||
      JSON.stringify(knownServices) !== JSON.stringify(fresh.serviceIds) ||
      (fresh.mayaClientId !== null &&
        existing.mayaClientId !== fresh.mayaClientId)
    );
  }

  /**
   * Клиент бизнеса — только через доказанную связь.
   *
   * 🔴 По телефону не склеиваем. Совпадение номера доказательством тождества
   * не является: у салона бывают однофамильцы, перепроданные номера и общие
   * семейные телефоны.
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

  /** Внешний идентификатор записи из канонического ключа Maya. */
  private externalIdOf(appointmentKey: string): string | null {
    const raw = appointmentKey.startsWith('crm-')
      ? appointmentKey.slice(4)
      : appointmentKey;
    return raw.trim() || null;
  }

  private async providerOf(tenantId: string): Promise<string> {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
      select: { provider: true },
    });
    if (!integration) {
      throw new Error(`tenant ${tenantId} has no CRM integration`);
    }
    return integration.provider;
  }
}
