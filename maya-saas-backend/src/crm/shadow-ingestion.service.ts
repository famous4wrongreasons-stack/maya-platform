import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { DomainEventType, IngestionOutcome } from '../domain';
import { DOMAIN_EVENT_TYPE, canonicalStateFingerprint } from '../domain';
import { EventStoreService } from '../events/event-store.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmService } from './crm.service';
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
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly crmService: CrmService,
    private readonly eventStore: EventStoreService,
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
    // 3. Идентичность Maya. 🔴 Её НЕ выдумывают: если визита у нас нет, значит
    //    события о нём быть не может — ссылаться событию не на что. Это
    //    честный карантин, а не «создадим запись на всякий случай»: создание
    //    визита потребовало бы выдумать ещё и клиента.
    const appointment = await this.prisma.appointment.findFirst({
      where: { tenantId, crmProvider: dto.provider, crmExternalId: externalId },
      select: {
        id: true,
        staffId: true,
        staffExternalId: true,
        startAt: true,
        endAt: true,
        status: true,
      },
    });

    if (!appointment) {
      await this.eventStore.quarantine({
        tenantId,
        source: dto.provider,
        discriminator: this.discriminator(dto),
        fingerprint: fingerprintSeed,
        reason: 'entity_unresolved',
        diagnostic: { ...this.diagnostic(dto), external_id: externalId },
      });
      return { outcome: 'quarantined', reason: 'entity_unresolved' };
    }

    // 4. Истина перечитывается у источника, а не берётся из тела.
    const state = await this.readCanonicalState(tenantId, externalId, kind);
    if (state === 'unreadable') {
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

    const type = this.canonicalType(kind, state, appointment);
    const fingerprint = canonicalStateFingerprint({
      source: dto.provider,
      entityType: 'appointment',
      entityId: appointment.id,
      type,
      state: state.canonical,
    });

    const result = await this.eventStore.append({
      tenantId,
      type,
      entityType: 'appointment',
      entityId: appointment.id,
      occurredAt: state.occurredAt,
      source: dto.provider,
      sourceRef: externalId,
      ingestionMethod: 'webhook',
      observation: 'after_watch_started',
      dedupFingerprint: fingerprint,
      // 🔴 Полезная нагрузка — минимальный факт. Ни имени, ни телефона: у
      // потребителя есть идентичности Maya, остальное он возьмёт сам.
      payload: state.canonical,
    });

    return { outcome: result.outcome, eventId: result.eventId };
  }

  /**
   * Каноническое состояние записи у источника.
   *
   * Удалённая запись — не сбой чтения: её отсутствие и есть доказательство
   * отмены. Это тот же урок, что глава 2 вынесла из отмены визита.
   */
  private async readCanonicalState(
    tenantId: string,
    externalId: string,
    kind: keyof typeof RECORD_EVENT_KIND,
  ): Promise<
    | 'unreadable'
    | {
        deleted: boolean;
        occurredAt: Date;
        canonical: Prisma.InputJsonObject;
      }
  > {
    try {
      const detail = await this.crmService.getAppointmentDetailForSystem(
        tenantId,
        externalId,
      );
      return {
        deleted: false,
        occurredAt: new Date(detail.start_at),
        canonical: {
          staff_external_id: detail.provider?.id ?? null,
          start_at: detail.start_at,
          end_at: detail.end_at,
          service_ids: [...detail.service_ids].sort(),
          attendance: detail.attendance,
          status: detail.status,
        },
      };
    } catch {
      if (kind === 'deleted') {
        // Записи нет — ровно то, чего мы и ждали от удаления.
        return {
          deleted: true,
          occurredAt: new Date(),
          canonical: { deleted: true },
        };
      }
      return 'unreadable';
    }
  }

  /**
   * Канонический тип события.
   *
   * 🔴 Различать «перенос», «смену мастера» и «смену состава» можно только
   * сравнением с известным состоянием. Пока зеркало визита в Maya неполное,
   * `update` даёт общий `appointment.rescheduled` лишь при доказанной смене
   * времени; в остальных случаях — `appointment.attendance_recorded`, если
   * изменилось присутствие, иначе состояние просто фиксируется как изменение
   * состава. Угадывать не станем: отпечаток всё равно различит состояния.
   */
  private canonicalType(
    kind: keyof typeof RECORD_EVENT_KIND,
    state: { deleted: boolean; canonical: Prisma.InputJsonObject },
    appointment: { staffExternalId: string; startAt: Date },
  ): DomainEventType {
    if (kind === 'created') return DOMAIN_EVENT_TYPE.appointmentCreated;
    if (kind === 'deleted' || state.deleted) {
      return DOMAIN_EVENT_TYPE.appointmentCancelled;
    }

    // Значения канона — скаляры; всё прочее к сравнению не допускается, иначе
    // объект молча превратился бы в `[object Object]` и «изменение» перестало
    // бы отличаться от отсутствия изменения.
    const scalar = (value: unknown): string =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';

    const staffChanged =
      scalar(state.canonical.staff_external_id) !== appointment.staffExternalId;
    if (staffChanged) return DOMAIN_EVENT_TYPE.appointmentStaffChanged;

    const startChanged =
      scalar(state.canonical.start_at) !== appointment.startAt.toISOString();
    if (startChanged) return DOMAIN_EVENT_TYPE.appointmentRescheduled;

    return DOMAIN_EVENT_TYPE.appointmentAttendanceRecorded;
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
