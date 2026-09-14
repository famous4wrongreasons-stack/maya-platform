import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { IngestionOutcome } from '../domain';
import { EventStoreService } from '../events/event-store.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AppointmentChangeService } from './appointment-change.service';
import { AppointmentObservationService } from './appointment-observation.service';
import type { ShadowDeliveryDto } from './dto/shadow-delivery.dto';

/** Что сделал приёмник с доставкой. Ни один исход не молчит. */
export interface ShadowIngestionResult {
  outcome: IngestionOutcome | 'ignored';
  reason?: string;
  eventId?: string | null;
}

/**
 * Известные типы доставок провайдера → канонический тип Maya.
 *
 * 🔴 Здесь и заканчивается словарь провайдера. Дальше по системе не проходит ни
 * `record.create`, ни `resource`, ни `status` — только имена Maya.
 */
const RECORD_EVENT_KIND = {
  created: ['record.create', 'record.created', 'record_created'],
  updated: ['record.update', 'record.updated', 'record_updated'],
  deleted: ['record.delete', 'record.deleted', 'record_deleted'],
} as const;

@Injectable()
export class ShadowIngestionService {
  private readonly logger = new Logger(ShadowIngestionService.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly eventStore: EventStoreService,
    private readonly observationService: AppointmentObservationService,
    private readonly changeService: AppointmentChangeService,
  ) {}

  /** Включён ли теневой приём. Выкат и включение — разные события. */
  enabled(): boolean {
    const raw = String(process.env.CRM_SHADOW_INGESTION_ENABLED || '')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
  }

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'shadow_ingestion_disabled',
      unauthorized: 'shadow_ingestion_unauthorized',
    });
  }

  /**
   * Принять теневую доставку.
   *
   * 🔴 Ни одного побочного действия: ни уведомлений, ни записи в CRM, ни
   * изменения визита. Приёмник только замечает. Легаси остаётся обработчиком.
   *
   * 🔴 Тело доставки НЕ считается доказательством — ровно как в уже работающем
   * приёме платежей: там статус перезапрашивается у провайдера, здесь
   * перечитывается сама запись. Провайдер не подписывает доставку, а её
   * содержимое можно подделать; состояние у источника — нельзя.
   */
  async ingest(dto: ShadowDeliveryDto): Promise<ShadowIngestionResult> {
    if (!this.enabled()) {
      return { outcome: 'ignored', reason: 'shadow_disabled' };
    }

    const fingerprintSeed = this.deliveryFingerprintSeed(dto);

    // 1. Арендатор — только через утверждённую границу. Слаг из тела не
    //    принимается вовсе: у доставки его и не бывает.
    let tenantId: string;
    try {
      const resolved = await this.bridgeSource.resolveTenant(
        {
          provider: dto.provider,
          externalCompanyId: dto.external_company_id,
        },
        'shadow_tenant_not_found',
      );
      tenantId = resolved.tenantId;
    } catch {
      await this.eventStore.quarantine({
        source: dto.provider,
        discriminator: this.discriminator(dto),
        fingerprint: fingerprintSeed,
        reason: 'tenant_unresolved',
        diagnostic: this.diagnostic(dto),
      });
      return { outcome: 'quarantined', reason: 'tenant_unresolved' };
    }

    // 2. Классификация. Неизвестное НЕ угадывается: у него нет канонического
    //    имени, а значит и доменного события из него не возникает.
    const kind = this.classify(dto.event);
    if (!kind) {
      await this.eventStore.quarantine({
        tenantId,
        source: dto.provider,
        discriminator: this.discriminator(dto),
        fingerprint: fingerprintSeed,
        reason: 'unknown_discriminator',
        diagnostic: this.diagnostic(dto),
      });
      return { outcome: 'quarantined', reason: 'unknown_discriminator' };
    }

    const externalId = String(dto.external_id ?? '').trim();
    if (!externalId) {
      await this.eventStore.quarantine({
        tenantId,
        source: dto.provider,
        discriminator: this.discriminator(dto),
        fingerprint: fingerprintSeed,
        reason: 'malformed',
        diagnostic: this.diagnostic(dto),
      });
      return { outcome: 'quarantined', reason: 'malformed' };
    }

    return this.tenantContext.runAsSystemTenant(tenantId, () =>
      this.ingestRecordEvent(tenantId, dto, kind, externalId, fingerprintSeed),
    );
  }

  private async ingestRecordEvent(
    tenantId: string,
    dto: ShadowDeliveryDto,
    kind: keyof typeof RECORD_EVENT_KIND,
    externalId: string,
    fingerprintSeed: string,
  ): Promise<ShadowIngestionResult> {
    // 3. Истина перечитывается у источника, а не берётся из тела доставки.
    const observed = await this.observationService.observe({
      tenantId,
      provider: dto.provider,
      externalId,
      // Провайдер сказал «удалено» — это его собственное доказательство, а не
      // вывод из отсутствия записи в выборке. Разница принципиальна: вывод из
      // отсутствия запрещён (см. правило полноты B3.0), доказательство — нет.
      expectRemoved: kind === 'deleted',
    });

    if (observed === 'unreadable') {
      await this.eventStore.quarantine({
        tenantId,
        source: dto.provider,
        discriminator: this.discriminator(dto),
        fingerprint: fingerprintSeed,
        reason: 'source_unreadable',
        diagnostic: { ...this.diagnostic(dto), external_id: externalId },
      });
      return { outcome: 'quarantined', reason: 'source_unreadable' };
    }

    /**
     * 4. Применение — ОБЩИМ компаратором, тем же, что у сверки.
     *
     * 🔴 Своей классификации у приёмника больше нет. Прежняя версия решала,
     * что изменилось, собственным сравнением по трём полям; сверка решала бы
     * это иначе, и один и тот же переход давал бы разные события в зависимости
     * от того, кто успел первым. Теперь путь один: прочитать истину → сравнить
     * с зеркалом → применить в одной транзакции.
     */
    const applied = await this.changeService.applyObservation({
      tenantId,
      provider: dto.provider,
      observed,
      ingestionMethod: 'webhook',
      baselineEstablished:
        await this.observationService.baselineEstablished(tenantId),
      observedAt: new Date(),
    });

    if (applied.transitions.length === 0) {
      // Не карантин: доставка понята, арендатор и запись найдены. Просто
      // наблюдаемого изменения в ней нет — самый частый исход при повторной
      // доставке и при касании записи без изменения сути.
      return { outcome: 'stale', reason: 'no_observable_change' };
    }

    return {
      outcome: applied.eventsEmitted > 0 ? 'persisted' : 'duplicate',
      eventId: null,
    };
  }

  private classify(
    event: string | null | undefined,
  ): keyof typeof RECORD_EVENT_KIND | null {
    const normalized = String(event ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    for (const [kind, names] of Object.entries(RECORD_EVENT_KIND)) {
      if ((names as readonly string[]).includes(normalized)) {
        return kind as keyof typeof RECORD_EVENT_KIND;
      }
    }
    return null;
  }

  /**
   * Отпечаток самой доставки — для карантина.
   *
   * Считается по различителю и внешнему идентификатору, без тела: повтор одной
   * и той же непонятой доставки не должен плодить строки, а 221 такая доставка
   * за неделю превратилась бы в 221 запись.
   */
  private deliveryFingerprintSeed(dto: ShadowDeliveryDto): string {
    return [
      String(dto.provider ?? '').toLowerCase(),
      String(dto.external_company_id ?? ''),
      String(dto.event ?? ''),
      String(dto.resource ?? ''),
      String(dto.status ?? ''),
      String(dto.external_id ?? ''),
    ].join('|');
  }

  private discriminator(dto: ShadowDeliveryDto): string {
    const parts = [dto.resource, dto.status, dto.event].filter(Boolean);
    return parts.join('/').slice(0, 120) || 'unknown';
  }

  /**
   * Диагностика без ПД.
   *
   * 🔴 Ни значений полей, ни тела: только ИМЕНА ключей верхнего уровня и уже
   * известные неперсональные скаляры. Контур 152-ФЗ не ослабляется ради
   * удобства разбора — иначе карантин станет тем же логом с ПД в веб-корне,
   * который уже найден у PHP-реле.
   */
  private diagnostic(dto: ShadowDeliveryDto): Prisma.InputJsonObject {
    return {
      payload_keys: Array.isArray(dto.payload_keys)
        ? dto.payload_keys.slice(0, 40)
        : [],
      resource: dto.resource ?? null,
      status: dto.status ?? null,
      event: dto.event ?? null,
    };
  }
}
