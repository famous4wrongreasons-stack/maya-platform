import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { asJson } from '../common/json.util';
import { CrmService } from '../crm/crm.service';
import { AvailableSlotsQueryDto } from '../crm/dto/available-slots-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import {
  findMatchingSlotByLocalStart,
  normalizeBookingPhone,
  normalizeClientName,
  normalizeRequestedStart,
} from './appointment-preview.utils';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PreviewAppointmentDto } from './dto/preview-appointment.dto';

interface PreviewErrorPayload {
  message: string;
  error: {
    code:
      'slot_taken' | 'staff_unavailable' | 'service_not_found' | 'validation';
    message: string;
    field?: string;
  };
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createForClient(
    tenantId: string,
    clientId: string,
    dto: CreateAppointmentDto,
  ) {
    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        tenantId,
      );
    }

    const client = await this.usersService.getUserOrThrow(clientId);
    const branch = await this.resolveBranchForBooking(tenantId, dto.branchId);
    const bookingIdentity = this.resolveBookingIdentity(client, {
      clientName: dto.clientName,
      clientPhone: dto.clientPhone ?? client.phone ?? undefined,
    });
    const remoteAppointment = await this.crmService.createAppointment(
      tenantId,
      {
        clientId,
        clientName: bookingIdentity.clientName,
        clientPhone: bookingIdentity.clientPhone,
        branchId: dto.branchId ?? null,
        staffId: dto.staffId,
        serviceIds: dto.serviceIds,
        start: normalizeRequestedStart(
          dto.start,
          branch?.timezone ?? 'Europe/Moscow',
        ),
        notes: dto.notes ?? null,
      },
    );

    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        clientId,
        branchId: dto.branchId ?? null,
        crmExternalId: remoteAppointment.external_id,
        staffExternalId: dto.staffId,
        serviceIds: asJson(dto.serviceIds),
        startAt: new Date(dto.start),
        status: remoteAppointment.status,
        notes: dto.notes ?? null,
        providerPayload: remoteAppointment.raw
          ? asJson(remoteAppointment.raw)
          : undefined,
      },
    });

    await this.auditLogService.log({
      tenantId,
      userId: clientId,
      action: 'appointment.created',
      entityType: 'appointment',
      entityId: appointment.id,
      metadata: {
        crm_external_id: remoteAppointment.external_id,
        start_at: appointment.startAt.toISOString(),
      },
    });

    return this.serializeAppointment(appointment);
  }

  async previewForClient(
    tenantId: string,
    clientId: string,
    dto: PreviewAppointmentDto,
  ) {
    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        tenantId,
      );
    }

    await this.usersService.getUserOrThrow(clientId);
    const branch = await this.resolveBranchForBooking(tenantId, dto.branchId);
    const requestedStart = normalizeRequestedStart(
      dto.start,
      branch?.timezone ?? 'Europe/Moscow',
    );
    const bookingIdentity = this.resolveBookingIdentity(undefined, {
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
    });
    const slots = await this.crmService.getAvailableSlots(tenantId, {
      date: requestedStart,
      staffId: dto.staffId,
      serviceIds: dto.serviceIds,
      branchId: dto.branchId,
    });
    const services = await this.crmService.getServices(tenantId);
    const matchedSlot = findMatchingSlotByLocalStart(
      slots,
      requestedStart,
      branch?.timezone ?? 'Europe/Moscow',
    );

    if (!matchedSlot) {
      throw new BadRequestException(
        this.buildPreviewError(
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
      branch_timezone: branch?.timezone ?? 'Europe/Moscow',
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

  async listClientAppointments(tenantId: string, clientId: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clientId,
      },
      orderBy: { startAt: 'asc' },
    });

    return appointments.map((appointment) =>
      this.serializeAppointment(appointment),
    );
  }

  getAvailableSlots(tenantId: string, query: AvailableSlotsQueryDto) {
    return this.crmService.getAvailableSlots(tenantId, query);
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

  private resolveBookingIdentity(
    client:
      | {
          email: string;
          phone: string | null;
        }
      | undefined,
    input: {
      clientName?: string | null;
      clientPhone?: string | null;
    },
  ) {
    const clientName = normalizeClientName(
      input.clientName || client?.email || '',
    );
    const clientPhone = normalizeBookingPhone(input.clientPhone || '');

    return {
      clientName,
      clientPhone,
    };
  }

  private serializeAppointment(appointment: {
    id: string;
    tenantId: string;
    clientId: string;
    branchId: string | null;
    crmExternalId: string | null;
    staffExternalId: string;
    serviceIds: unknown;
    startAt: Date;
    status: string;
    notes: string | null;
    providerPayload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: appointment.id,
      tenant_id: appointment.tenantId,
      client_id: appointment.clientId,
      branch_id: appointment.branchId,
      crm_external_id: appointment.crmExternalId,
      staff_external_id: appointment.staffExternalId,
      service_ids: appointment.serviceIds,
      start_at: appointment.startAt,
      status: appointment.status,
      notes: appointment.notes,
      provider_payload: appointment.providerPayload ?? {},
      created_at: appointment.createdAt,
      updated_at: appointment.updatedAt,
    };
  }

  private buildPreviewError(
    code: PreviewErrorPayload['error']['code'],
    message: string,
    field?: string,
  ): PreviewErrorPayload {
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
