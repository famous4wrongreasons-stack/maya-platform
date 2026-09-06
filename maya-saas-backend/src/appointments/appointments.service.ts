import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AppointmentStatus, CalendarSource } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { ServiceItem, StaffMember } from '../crm/crm-adapter.interface';
import {
  CrmService,
  type AppointmentActionInvocation,
} from '../crm/crm.service';
import { AvailableSlotsQueryDto } from '../crm/dto/available-slots-query.dto';
import { InboxService } from '../inbox/inbox.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryService } from '../recovery/recovery.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  DEFAULT_SALON_TIMEZONE,
  isUsableTimezone,
  resolveSalonTimezone,
} from '../tenants/salon-timezone';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import {
  findMatchingSlotByLocalStart,
  normalizeBookingPhone,
  normalizeClientName,
  normalizeRequestedStart,
} from './appointment-preview.utils';
import { AvailableDaysQueryDto } from './dto/available-days-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PreviewAppointmentDto } from './dto/preview-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { ClientAppointmentCancelService } from '../crm/client-appointment-cancel.service';
import { ClientAppointmentReadService } from '../crm/client-appointment-read.service';
import { TenantAppointmentRepository } from './tenant-appointment.repository';
import { isCanceledOutcome, kopecksToMajor, majorToKopecks } from '../domain';

interface AppointmentErrorPayload {
  message: string;
  error: {
    code:
      | 'client_name_required'
      | 'client_phone_required'
      | 'not_found'
      | 'already_cancelled'
      | 'too_late_to_cancel'
      | 'too_late_to_reschedule'
      | 'slot_taken'
      | 'staff_unavailable'
      | 'service_not_found'
      | 'validation';
    message: string;
    field?: string;
  };
}

interface AppointmentCatalog {
  servicesById: Map<string, ServiceItem>;
  staffById: Map<string, StaffMember>;
}

const AVAILABLE_DAYS_MAX_RANGE = 31;
const AVAILABLE_DAYS_BATCH_SIZE = 4;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly appointmentRepository: TenantAppointmentRepository,
    private readonly crmService: CrmService,
    private readonly internalCalendarService: InternalCalendarService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly inboxService: InboxService,
    private readonly recoveryService?: RecoveryService,
    private readonly clientAppointmentReader?: ClientAppointmentReadService,
    private readonly clientAppointmentCanceler?: ClientAppointmentCancelService,
  ) {}

  async createForClient(
    tenantId: string,
    clientId: string,
    dto: CreateAppointmentDto,
    invocation: AppointmentActionInvocation = {},
  ) {
    this.tenantContext.assertTenantId(tenantId);
    await this.tenantsService.assertLiveBookingEnabled(tenantId);

    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        tenantId,
      );
    }

    const client = await this.usersService.getTenantUserOrThrow(
      clientId,
      tenantId,
    );
    const clientProfile = this.usersService.serializeUser(client);
    const branch = await this.resolveBranchForBooking(tenantId, dto.branchId);
    const timezone = await this.resolveBookingTimezone(tenantId, branch);
    const services = await this.crmService.getServices(tenantId);
    this.assertRequestedServicesExist(dto.serviceIds, services);
    const selectedServices = services.filter((service) =>
      dto.serviceIds.includes(service.id),
    );
    const totalPrice = selectedServices.reduce(
      (sum, service) => sum + service.price,
      0,
    );
    const currency = selectedServices[0]?.currency ?? 'RUB';
    const requestedStart = normalizeRequestedStart(dto.start, timezone);
    const slots = await this.crmService.getAvailableSlots(tenantId, {
      date: requestedStart,
      staffId: dto.staffId,
      serviceIds: dto.serviceIds,
      branchId: dto.branchId,
    });
    const matchedSlot = findMatchingSlotByLocalStart(
      slots,
      requestedStart,
      timezone,
    );

    if (!matchedSlot) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'slot_taken',
          'Selected slot is no longer available. Refresh times and try again.',
          'start',
        ),
      );
    }

    const bookingIdentity = this.resolveBookingIdentity(clientProfile, {
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
    });
    const calendarSource = await this.crmService.getCalendarSource(tenantId);
    const crmProvider =
      calendarSource === CalendarSource.EXTERNAL
        ? await this.crmService.getExternalProviderKey(tenantId)
        : null;
    const timing =
      calendarSource === CalendarSource.INTERNAL
        ? await this.internalCalendarService.getServiceTiming(
            tenantId,
            dto.staffId,
            dto.serviceIds,
          )
        : {
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
          };
    const startAt = new Date(matchedSlot.start);
    const endAt = new Date(matchedSlot.end);
    const blockedStartAt = new Date(
      startAt.getTime() - timing.bufferBeforeMinutes * 60 * 1000,
    );
    const blockedEndAt = new Date(
      endAt.getTime() + timing.bufferAfterMinutes * 60 * 1000,
    );
    const remoteAppointment =
      calendarSource === CalendarSource.EXTERNAL
        ? await this.crmService.createAppointment(
            tenantId,
            {
              clientId,
              clientName: bookingIdentity.clientName,
              clientPhone: bookingIdentity.clientPhone,
              branchId: dto.branchId ?? null,
              staffId: dto.staffId,
              serviceIds: dto.serviceIds,
              start: requestedStart,
              notes: dto.notes ?? null,
            },
            invocation,
          )
        : null;
    let appointment: Awaited<
      ReturnType<TenantAppointmentRepository['createForClient']>
    >;

    try {
      appointment = await this.appointmentRepository.createForClient({
        clientId,
        branchId: dto.branchId ?? matchedSlot.branch_id ?? null,
        crmExternalId: remoteAppointment?.external_id ?? null,
        crmProvider,
        source: calendarSource,
        // 🔴 Разрешается ТО ЖЕ значение, что ложится в совместимую колонку:
        // иначе два поля описывали бы разных мастеров.
        staffId: await this.crmService.resolveStaffIdForBooking(
          tenantId,
          dto.staffId,
        ),
        staffExternalId: dto.staffId,
        serviceIds: asJson(dto.serviceIds),
        startAt,
        endAt,
        blockedStartAt,
        blockedEndAt,
        status: remoteAppointment?.status ?? AppointmentStatus.CONFIRMED,
        notes: dto.notes ?? null,
        totalPriceKopecks: majorToKopecks(totalPrice),
        currency,
        providerPayload: asJson(
          remoteAppointment?.raw ?? { provider: CalendarSource.INTERNAL },
        ),
      });
    } catch (error) {
      if (
        calendarSource === CalendarSource.INTERNAL &&
        this.isInternalSlotConstraintError(error)
      ) {
        throw new ConflictException(
          this.buildAppointmentError(
            'slot_taken',
            'Selected slot was just booked. Choose another time.',
            'start',
          ),
        );
      }

      throw error;
    }

    await this.auditLogService.log({
      tenantId,
      userId: clientId,
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: {
        source: calendarSource,
        crm_external_id: remoteAppointment?.external_id ?? null,
        start_at: appointment.startAt.toISOString(),
      },
    });

    // EXTERNAL/YClients: Python webhook dual-writes inbox. Nest publishes
    // only when Nest calendar is the source of truth (avoid duplicate cards).
    if (calendarSource === CalendarSource.INTERNAL) {
      void this.publishNewAppointmentInbox({
        tenantId,
        appointmentId: appointment.id,
        staffExternalId: dto.staffId,
        clientName: bookingIdentity.clientName,
        serviceTitles: selectedServices.map((service) => service.name),
        startAt: appointment.startAt,
        timezone: timezone,
        totalPrice,
        currency,
      }).catch((error) => {
        this.logger.warn(
          `new_appointment inbox failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
    }

    try {
      await this.recoveryService?.recordBooking({
        tenantId,
        phone: bookingIdentity.clientPhone,
        externalBookingRef: appointment.id,
        crmExternalId: remoteAppointment?.external_id ?? null,
        bookedAt: appointment.createdAt,
        visitAt: appointment.startAt,
        bookedValueKopecks: appointment.totalPriceKopecks,
        currency: appointment.currency,
      });
    } catch (error) {
      this.logger.warn(
        `recovery attribution failed for booking ${appointment.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }

    return this.serializeAppointment(appointment, {
      servicesById: new Map(services.map((service) => [service.id, service])),
      staffById: new Map(),
    });
  }

  async previewForClient(
    tenantId: string,
    clientId: string,
    dto: PreviewAppointmentDto,
  ) {
    this.tenantContext.assertTenantId(tenantId);

    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        tenantId,
      );
    }

    const client = await this.usersService.getTenantUserOrThrow(
      clientId,
      tenantId,
    );
    const clientProfile = this.usersService.serializeUser(client);
    const branch = await this.resolveBranchForBooking(tenantId, dto.branchId);
    const timezone = await this.resolveBookingTimezone(tenantId, branch);
    const services = await this.crmService.getServices(tenantId);
    this.assertRequestedServicesExist(dto.serviceIds, services);
    const requestedStart = normalizeRequestedStart(dto.start, timezone);
    const bookingIdentity = this.resolveBookingIdentity(clientProfile, {
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
    });
    const slots = await this.crmService.getAvailableSlots(tenantId, {
      date: requestedStart,
      staffId: dto.staffId,
      serviceIds: dto.serviceIds,
      branchId: dto.branchId,
    });
    const matchedSlot = findMatchingSlotByLocalStart(
      slots,
      requestedStart,
      timezone,
    );

    if (!matchedSlot) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'slot_taken',
          'Selected slot is no longer available. Refresh times and try again.',
          'start',
        ),
      );
    }

    const selectedServices = services.filter((service) =>
      dto.serviceIds.includes(service.id),
    );
    const totalPrice = selectedServices.reduce(
      (sum, service) => sum + service.price,
      0,
    );
    const durationMinutes = selectedServices.reduce(
      (sum, service) => sum + service.duration_minutes,
      0,
    );
    const primaryCurrency =
      selectedServices[0]?.currency ??
      services.find((service) => service.currency)?.currency ??
      'RUB';

    await this.auditLogService.log({
      tenantId,
      userId: clientId,
      action: 'appointment.previewed',
      entityType: 'appointment_preview',
      entityId: matchedSlot.start,
      metadata: {
        branch_id: branch?.id ?? null,
        staff_id: dto.staffId,
        service_ids: dto.serviceIds,
        requested_start: requestedStart,
      },
    });

    return {
      ok: true,
      preview: true,
      mode: 'preview',
      branch_id: branch?.id ?? dto.branchId ?? null,
      branch_timezone: timezone,
      client_name: bookingIdentity.clientName,
      client_phone: bookingIdentity.clientPhone,
      staff_id: dto.staffId,
      service_ids: dto.serviceIds,
      requested_start: requestedStart,
      matched_slot_start: matchedSlot.start,
      slot: {
        start: matchedSlot.start,
        end: matchedSlot.end,
        staff_id: matchedSlot.staff_id,
        branch_id: matchedSlot.branch_id ?? branch?.id ?? dto.branchId ?? null,
      },
      total_price: totalPrice,
      duration_minutes: durationMinutes,
      currency: primaryCurrency,
      notes: dto.notes ?? null,
      warnings: [],
    };
  }

  listClientAppointments(tenantId: string, userId: string) {
    if (!this.clientAppointmentReader)
      throw new ServiceUnavailableException(
        'Verified Client appointment reader unavailable',
      );
    return this.clientAppointmentReader.forAccount(tenantId, userId);
  }

  async cancelForClient(
    tenantId: string,
    userId: string,
    appointmentId: string,
    invocation: AppointmentActionInvocation = {},
  ) {
    if (!this.clientAppointmentCanceler)
      throw new ServiceUnavailableException(
        'Verified Client appointment canceler unavailable',
      );
    this.tenantContext.assertTenantId(tenantId);
    const appointment = await this.clientAppointmentCanceler.forAccount(
      tenantId,
      userId,
      appointmentId,
      invocation,
    );
    const catalog = await this.loadAppointmentCatalog(tenantId);
    const appointmentSource =
      appointment.source === 'internal'
        ? CalendarSource.INTERNAL
        : CalendarSource.EXTERNAL;
    const cancelTimezoneHint = isUsableTimezone(appointment.branch?.timezone)
      ? appointment.branch?.timezone
      : (
          await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { defaultTimezone: true },
          })
        )?.defaultTimezone;

    await this.auditLogService.log({
      tenantId,
      userId,
      action: 'appointment.cancelled',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: {
        source: appointmentSource,
        crm_external_id: appointment.crmExternalId,
        cancelled_at: appointment.updatedAt.toISOString(),
        execution_owner: 'action_engine',
      },
    });

    try {
      await this.recoveryService?.markBookingStatus(
        tenantId,
        appointment.id,
        'canceled',
      );
    } catch (error) {
      this.logger.warn(
        `recovery attribution cancellation failed for booking ${appointment.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }

    if (appointmentSource === CalendarSource.INTERNAL) {
      const clientProfile = this.usersService.serializeUser(
        await this.usersService.getTenantUserOrThrow(userId, tenantId),
      );
      void this.publishAppointmentLifecycleInbox({
        tenantId,
        type: 'appointment_cancelled',
        sourceEventId: `appointment_cancelled:nest:${appointment.id}`,
        title: 'Запись отменена клиентом',
        bodyText: [
          'Запись отменена клиентом',
          '',
          `Клиент: ${clientProfile.name || '—'}`,
          `Было время: ${this.formatInboxWhen(
            appointment.startAt,
            resolveSalonTimezone({
              branchTimezone: appointment.branch?.timezone,
              tenantTimezone: cancelTimezoneHint,
            }),
          )}`,
        ].join('\n'),
        staffExternalId: appointment.staffExternalId,
        payload: {
          appointment_id: appointment.id,
          event: 'appointment.cancelled',
          by_client: true,
        },
      }).catch((error) => {
        this.logger.warn(
          `appointment_cancelled inbox failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
    }

    return {
      ok: true,
      appointment: this.serializeAppointment(appointment, catalog),
    };
  }

  async rescheduleForClient(
    tenantId: string,
    clientId: string,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    invocation: AppointmentActionInvocation = {},
  ) {
    this.tenantContext.assertTenantId(tenantId);
    const appointment = await this.appointmentRepository.findForClient(
      appointmentId,
      clientId,
    );

    if (!appointment) {
      throw new NotFoundException(
        this.buildAppointmentError(
          'not_found',
          'Appointment not found for the current client.',
        ),
      );
    }

    if (this.isCancelledStatus(appointment.status)) {
      throw new ConflictException(
        this.buildAppointmentError(
          'already_cancelled',
          'Appointment is already cancelled.',
        ),
      );
    }

    if (appointment.startAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'too_late_to_reschedule',
          'Appointment can no longer be rescheduled because it has already started.',
        ),
      );
    }

    const appointmentSource =
      appointment.source === 'internal'
        ? CalendarSource.INTERNAL
        : CalendarSource.EXTERNAL;

    if (
      appointmentSource === CalendarSource.EXTERNAL &&
      !appointment.crmExternalId
    ) {
      throw new NotFoundException(
        this.buildAppointmentError(
          'not_found',
          'Appointment not found for the current client.',
        ),
      );
    }

    const branchId = dto.branchId ?? appointment.branchId ?? undefined;

    if (branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(branchId, tenantId);
    }

    const branch = branchId
      ? await this.resolveBranchForBooking(tenantId, branchId)
      : (appointment.branch ?? null);
    const timezone = await this.resolveBookingTimezone(tenantId, branch);
    const serviceIds =
      dto.serviceIds && dto.serviceIds.length > 0
        ? dto.serviceIds
        : this.normalizeServiceIds(appointment.serviceIds);

    if (serviceIds.length === 0) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'validation',
          'Appointment must keep at least one service when rescheduling.',
          'serviceIds',
        ),
      );
    }

    const services = await this.crmService.getServices(tenantId);
    this.assertRequestedServicesExist(serviceIds, services);
    const selectedServices = services.filter((service) =>
      serviceIds.includes(service.id),
    );
    const totalPrice = selectedServices.reduce(
      (sum, service) => sum + service.price,
      0,
    );
    const currency = selectedServices[0]?.currency ?? appointment.currency;

    const staffId = dto.staffId ?? appointment.staffExternalId;
    const requestedStart = normalizeRequestedStart(dto.start, timezone);
    const slots = await this.crmService.getAvailableSlots(tenantId, {
      date: requestedStart,
      staffId,
      serviceIds,
      branchId,
    });
    const matchedSlot = findMatchingSlotByLocalStart(
      slots,
      requestedStart,
      timezone,
    );

    if (!matchedSlot) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'slot_taken',
          'Selected slot is no longer available. Refresh times and try again.',
          'start',
        ),
      );
    }

    const timing =
      appointmentSource === CalendarSource.INTERNAL
        ? await this.internalCalendarService.getServiceTiming(
            tenantId,
            staffId,
            serviceIds,
          )
        : {
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
          };
    const startAt = new Date(matchedSlot.start);
    const endAt = new Date(matchedSlot.end);
    const blockedStartAt = new Date(
      startAt.getTime() - timing.bufferBeforeMinutes * 60 * 1000,
    );
    const blockedEndAt = new Date(
      endAt.getTime() + timing.bufferAfterMinutes * 60 * 1000,
    );
    const remoteAppointment =
      appointmentSource === CalendarSource.EXTERNAL
        ? await this.crmService.rescheduleAppointment(
            tenantId,
            {
              externalId: appointment.crmExternalId!,
              start: requestedStart,
              staffId,
              serviceIds,
              notes: dto.notes ?? appointment.notes,
            },
            invocation,
          )
        : null;
    let updatedAppointment: Awaited<
      ReturnType<TenantAppointmentRepository['updateForClient']>
    >;

    try {
      updatedAppointment = await this.appointmentRepository.updateForClient(
        appointment.id,
        clientId,
        {
          branchId: branchId ?? matchedSlot.branch_id ?? null,
          source: appointmentSource,
          // Перенос может сменить мастера — значит меняются ОБА поля.
          staffId: await this.crmService.resolveStaffIdForBooking(
            tenantId,
            remoteAppointment?.staff_id ?? staffId,
          ),
          staffExternalId: remoteAppointment?.staff_id ?? staffId,
          serviceIds: asJson(remoteAppointment?.service_ids ?? serviceIds),
          startAt,
          endAt,
          blockedStartAt,
          blockedEndAt,
          status: remoteAppointment?.status ?? AppointmentStatus.CONFIRMED,
          notes: dto.notes ?? appointment.notes,
          totalPriceKopecks: majorToKopecks(totalPrice),
          currency,
          providerPayload: asJson(
            remoteAppointment?.raw ?? { provider: CalendarSource.INTERNAL },
          ),
        },
      );
    } catch (error) {
      if (
        appointmentSource === CalendarSource.INTERNAL &&
        this.isInternalSlotConstraintError(error)
      ) {
        throw new ConflictException(
          this.buildAppointmentError(
            'slot_taken',
            'Selected slot was just booked. Choose another time.',
            'start',
          ),
        );
      }

      throw error;
    }
    const catalog = await this.loadAppointmentCatalog(tenantId);

    await this.auditLogService.log({
      tenantId,
      userId: clientId,
      action: 'appointment.rescheduled',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: {
        source: appointmentSource,
        crm_external_id: appointment.crmExternalId,
        previous_start_at: appointment.startAt.toISOString(),
        requested_start: requestedStart,
        matched_slot_start: matchedSlot.start,
      },
    });

    if (appointmentSource === CalendarSource.INTERNAL) {
      const clientProfile = this.usersService.serializeUser(
        await this.usersService.getTenantUserOrThrow(clientId, tenantId),
      );
      void this.publishAppointmentLifecycleInbox({
        tenantId,
        type: 'appointment_rescheduled',
        sourceEventId: `appointment_rescheduled:nest:${appointment.id}:${matchedSlot.start}`,
        title: 'Клиент перенёс запись',
        bodyText: [
          'Клиент перенёс свою запись сам',
          '',
          `Клиент: ${clientProfile.name || '—'}`,
          `Было: ${this.formatInboxWhen(appointment.startAt, timezone)}`,
          `Стало: ${this.formatInboxWhen(new Date(matchedSlot.start), timezone)}`,
        ].join('\n'),
        staffExternalId: dto.staffId ?? appointment.staffExternalId,
        payload: {
          appointment_id: appointment.id,
          event: 'appointment.rescheduled',
        },
      }).catch((error) => {
        this.logger.warn(
          `appointment_rescheduled inbox failed: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
    }

    return {
      ok: true,
      previous_start_at: appointment.startAt,
      appointment: this.serializeAppointment(updatedAppointment, catalog),
    };
  }

  getAvailableSlots(tenantId: string, query: AvailableSlotsQueryDto) {
    this.tenantContext.assertTenantId(tenantId);
    return this.crmService.getAvailableSlots(tenantId, query);
  }

  async getAvailableDays(tenantId: string, query: AvailableDaysQueryDto) {
    this.tenantContext.assertTenantId(tenantId);
    if (query.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        query.branchId,
        tenantId,
      );
    }

    const serviceIds =
      query.serviceIds && query.serviceIds.length > 0
        ? query.serviceIds
        : undefined;

    if (serviceIds) {
      const services = await this.crmService.getServices(tenantId);
      this.assertRequestedServicesExist(serviceIds, services);
    }

    const days = this.buildAvailableDaysRange(query.from, query.to);
    const availableDays: string[] = [];

    for (
      let index = 0;
      index < days.length;
      index += AVAILABLE_DAYS_BATCH_SIZE
    ) {
      const batch = days.slice(index, index + AVAILABLE_DAYS_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (day) => {
          try {
            const slots = await this.crmService.getAvailableSlots(tenantId, {
              date: day,
              staffId: query.staffId,
              serviceIds,
              branchId: query.branchId,
            });

            return slots.length > 0 ? day : null;
          } catch {
            // One bad CRM day must not fail the whole calendar probe.
            return null;
          }
        }),
      );

      availableDays.push(
        ...results.filter((day): day is string => day !== null),
      );
    }

    return {
      days: availableDays,
    };
  }

  private formatInboxWhen(at: Date, timezone: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone || DEFAULT_SALON_TIMEZONE,
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
  }

  private async publishAppointmentLifecycleInbox(input: {
    tenantId: string;
    type:
      | 'appointment_cancelled'
      | 'appointment_deleted'
      | 'appointment_rescheduled'
      | 'appointment_reassigned';
    sourceEventId: string;
    title: string;
    bodyText: string;
    staffExternalId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const staffUserIds: string[] = [];
    const staffLink = await this.prisma.crmStaffAccess.findFirst({
      where: {
        tenantId: input.tenantId,
        externalStaffId: String(input.staffExternalId),
        userId: { not: null },
        status: 'active',
      },
      select: { userId: true },
    });
    if (staffLink?.userId) staffUserIds.push(staffLink.userId);

    await this.inboxService.publishForTenant(input.tenantId, {
      type: input.type,
      sourceEventId: input.sourceEventId,
      title: input.title,
      bodyText: input.bodyText,
      deepLink: '/app/?panel=schedule',
      userIds: staffUserIds,
      fanoutOwners: true,
      payload: input.payload,
    });
  }

  private async publishNewAppointmentInbox(input: {
    tenantId: string;
    appointmentId: string;
    staffExternalId: string;
    clientName: string;
    serviceTitles: string[];
    startAt: Date;
    timezone: string;
    totalPrice: number;
    currency: string;
  }): Promise<void> {
    const when = this.formatInboxWhen(
      input.startAt,
      input.timezone || DEFAULT_SALON_TIMEZONE,
    );
    const servicesLine =
      input.serviceTitles.filter(Boolean).join(', ') || 'услуга';
    const priceLine =
      Number.isFinite(input.totalPrice) && input.totalPrice > 0
        ? `\nСумма: ${Math.round(input.totalPrice)} ${input.currency || 'RUB'}`
        : '';
    const bodyText = [
      `Новая запись — ${when}`,
      '',
      `Клиент: ${input.clientName || '—'}`,
      `Услуги: ${servicesLine}${priceLine}`,
    ].join('\n');

    const staffUserIds: string[] = [];
    const staffLink = await this.prisma.crmStaffAccess.findFirst({
      where: {
        tenantId: input.tenantId,
        externalStaffId: String(input.staffExternalId),
        userId: { not: null },
        status: 'active',
      },
      select: { userId: true },
    });
    if (staffLink?.userId) staffUserIds.push(staffLink.userId);

    await this.inboxService.publishForTenant(input.tenantId, {
      type: 'new_appointment',
      sourceEventId: `new_appointment:nest:${input.appointmentId}`,
      title: 'Новая запись',
      bodyText,
      deepLink: '/app/?panel=schedule',
      userIds: staffUserIds,
      fanoutOwners: true,
      payload: {
        appointment_id: input.appointmentId,
        staff_id: input.staffExternalId,
        event: 'appointment.created',
      },
    });
  }

  private async resolveBranchForBooking(
    tenantId: string,
    branchId?: string | null,
  ) {
    if (branchId) {
      return this.prisma.branch.findFirst({
        where: {
          id: branchId,
          tenantId,
        },
      });
    }

    return this.prisma.branch.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Пояс, в котором салон живёт: филиал, иначе арендатор, иначе московский.
   *
   * 🔴 Раньше здесь стояло `timezone`, и пояс,
   * который CRM синхронизирует В АРЕНДАТОРА, до брони не доходил вовсе.
   * Настенное время считается именно этим поясом и в этом же виде уходит в
   * CRM, поэтому расхождение садило запись на неверный час.
   */
  private async resolveBookingTimezone(
    tenantId: string,
    branch: { timezone: string | null } | null,
  ): Promise<string> {
    if (isUsableTimezone(branch?.timezone)) {
      return resolveSalonTimezone({ branchTimezone: branch?.timezone });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });

    return resolveSalonTimezone({
      branchTimezone: branch?.timezone,
      tenantTimezone: tenant?.defaultTimezone,
    });
  }

  private resolveBookingIdentity(
    client:
      | {
          name: string | null;
          phone: string | null;
        }
      | undefined,
    input: {
      clientName?: string | null;
      clientPhone?: string | null;
    },
  ) {
    const rawClientName = this.pickFirstNonEmptyString(
      input.clientName,
      client?.name,
    );

    if (!rawClientName) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'client_name_required',
          'Client profile name is required before booking.',
          'clientName',
        ),
      );
    }

    const rawClientPhone = this.pickFirstNonEmptyString(
      input.clientPhone,
      client?.phone,
    );

    if (!rawClientPhone) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'client_phone_required',
          'Client phone is required before booking.',
          'clientPhone',
        ),
      );
    }

    return {
      clientName: normalizeClientName(rawClientName),
      clientPhone: normalizeBookingPhone(rawClientPhone),
    };
  }

  private async loadAppointmentCatalog(
    tenantId: string,
  ): Promise<AppointmentCatalog> {
    try {
      const [services, staff] = await Promise.all([
        this.crmService.getServices(tenantId),
        this.crmService.getStaff(tenantId),
      ]);

      return {
        servicesById: new Map(services.map((service) => [service.id, service])),
        staffById: new Map(staff.map((member) => [member.id, member])),
      };
    } catch {
      return {
        servicesById: new Map(),
        staffById: new Map(),
      };
    }
  }

  private serializeAppointment(
    appointment: {
      id: string;
      tenantId: string;
      /**
       * 🔴 Аккаунт, а не клиент бизнеса, и он необязателен: у записи салона,
       * сделанной по телефону или с виджета, аккаунта Maya нет.
       */
      clientId: string | null;
      branchId: string | null;
      crmExternalId: string | null;
      source?: string;
      staffExternalId: string;
      serviceIds: unknown;
      startAt: Date;
      endAt?: Date;
      blockedStartAt?: Date;
      blockedEndAt?: Date;
      status: string;
      notes: string | null;
      totalPriceKopecks?: number | null;
      currency?: string;
      providerPayload: unknown;
      createdAt: Date;
      updatedAt: Date;
      branch?: {
        id: string;
        name: string;
        address: string | null;
        phone: string | null;
        timezone: string | null;
      } | null;
    },
    catalog: AppointmentCatalog,
  ) {
    const serviceIds = this.normalizeServiceIds(appointment.serviceIds);
    const services = serviceIds
      .map((serviceId) => catalog.servicesById.get(serviceId))
      .filter((service): service is ServiceItem => Boolean(service));
    const staff = catalog.staffById.get(appointment.staffExternalId) ?? null;
    const totalPrice =
      (appointment.totalPriceKopecks === undefined ||
      appointment.totalPriceKopecks === null
        ? null
        : kopecksToMajor(appointment.totalPriceKopecks)) ??
      (services.length > 0
        ? services.reduce((sum, service) => sum + service.price, 0)
        : null);
    const catalogDurationMinutes =
      services.length > 0
        ? services.reduce((sum, service) => sum + service.duration_minutes, 0)
        : 0;
    const storedDurationMinutes = appointment.endAt
      ? Math.round(
          (appointment.endAt.getTime() - appointment.startAt.getTime()) /
            60_000,
        )
      : 0;
    const durationMinutes =
      catalogDurationMinutes > 0
        ? catalogDurationMinutes
        : storedDurationMinutes > 0
          ? storedDurationMinutes
          : null;
    const currency = appointment.currency ?? services[0]?.currency ?? null;
    const isUpcoming = appointment.startAt.getTime() >= Date.now();

    return {
      id: appointment.id,
      tenant_id: appointment.tenantId,
      client_id: appointment.clientId,
      branch_id: appointment.branchId,
      crm_external_id: appointment.crmExternalId,
      source: appointment.source ?? CalendarSource.EXTERNAL,
      staff_external_id: appointment.staffExternalId,
      service_ids: serviceIds,
      start_at: appointment.startAt,
      end_at: appointment.endAt ?? null,
      status: appointment.status,
      notes: appointment.notes,
      is_upcoming: isUpcoming,
      timeline: isUpcoming ? 'upcoming' : 'past',
      branch: appointment.branch
        ? {
            id: appointment.branch.id,
            name: appointment.branch.name,
            address: appointment.branch.address,
            phone: appointment.branch.phone,
            timezone: appointment.branch.timezone,
          }
        : null,
      staff: staff
        ? {
            id: staff.id,
            name: staff.name,
            title: staff.title ?? null,
            specialization: staff.specialization ?? null,
            avatar_url: staff.avatar_url ?? null,
            rating: staff.rating ?? null,
          }
        : appointment.staffExternalId
          ? {
              id: appointment.staffExternalId,
            }
          : null,
      services,
      total_price: totalPrice,
      duration_minutes: durationMinutes,
      currency,
      provider_payload: appointment.providerPayload ?? {},
      created_at: appointment.createdAt,
      updated_at: appointment.updatedAt,
    };
  }

  private normalizeServiceIds(serviceIds: unknown): string[] {
    if (!Array.isArray(serviceIds)) {
      return [];
    }

    return serviceIds.filter(
      (serviceId): serviceId is string => typeof serviceId === 'string',
    );
  }

  private isCancelledStatus(status: string): boolean {
    return isCanceledOutcome(status);
  }

  private pickFirstNonEmptyString(
    ...values: Array<string | null | undefined>
  ): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private buildAvailableDaysRange(from: string, to: string): string[] {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'validation',
          'Invalid available-days date range.',
        ),
      );
    }

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'validation',
          '`from` must be before or equal to `to`.',
          'from',
        ),
      );
    }

    const days: string[] = [];

    for (
      let cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      days.push(cursor.toISOString().slice(0, 10));
    }

    if (days.length > AVAILABLE_DAYS_MAX_RANGE) {
      throw new BadRequestException(
        this.buildAppointmentError(
          'validation',
          `Available-days range must not exceed ${AVAILABLE_DAYS_MAX_RANGE} days.`,
          'to',
        ),
      );
    }

    return days;
  }

  private assertRequestedServicesExist(
    requestedServiceIds: string[],
    services: ServiceItem[],
  ): void {
    const existingServiceIds = new Set(services.map((service) => service.id));
    const missingServiceIds = requestedServiceIds.filter(
      (serviceId) => !existingServiceIds.has(serviceId),
    );

    if (missingServiceIds.length === 0) {
      return;
    }

    throw new BadRequestException(
      this.buildAppointmentError(
        'service_not_found',
        'One or more selected services are no longer available.',
        'serviceIds',
      ),
    );
  }

  private isInternalSlotConstraintError(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2004')
    ) {
      return true;
    }

    return (
      error instanceof Error &&
      error.message.includes('Appointment_internal_no_overlap')
    );
  }

  private buildAppointmentError(
    code: AppointmentErrorPayload['error']['code'],
    message: string,
    field?: string,
  ): AppointmentErrorPayload {
    return {
      message,
      error: {
        code,
        message,
        ...(field ? { field } : {}),
      },
    };
  }
}
