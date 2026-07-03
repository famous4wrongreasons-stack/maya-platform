import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { asJson } from '../common/json.util';
import { ServiceItem, StaffMember } from '../crm/crm-adapter.interface';
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

interface AppointmentErrorPayload {
  message: string;
  error: {
    code:
      | 'client_name_required'
      | 'client_phone_required'
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
    const clientProfile = this.usersService.serializeUser(client);
    const branch = await this.resolveBranchForBooking(tenantId, dto.branchId);
    const services = await this.crmService.getServices(tenantId);
    this.assertRequestedServicesExist(dto.serviceIds, services);
    const bookingIdentity = this.resolveBookingIdentity(clientProfile, {
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
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
      include: {
        branch: true,
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

    return this.serializeAppointment(appointment, {
      servicesById: new Map(),
      staffById: new Map(),
    });
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

    const client = await this.usersService.getUserOrThrow(clientId);
    const clientProfile = this.usersService.serializeUser(client);
    const branch = await this.resolveBranchForBooking(tenantId, dto.branchId);
    const services = await this.crmService.getServices(tenantId);
    this.assertRequestedServicesExist(dto.serviceIds, services);
    const requestedStart = normalizeRequestedStart(
      dto.start,
      branch?.timezone ?? 'Europe/Moscow',
    );
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
      branch?.timezone ?? 'Europe/Moscow',
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
      include: {
        branch: true,
      },
    });
    const catalog = await this.loadAppointmentCatalog(tenantId);

    return appointments.map((appointment) =>
      this.serializeAppointment(appointment, catalog),
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
      services.length > 0
        ? services.reduce((sum, service) => sum + service.price, 0)
        : null;
    const durationMinutes =
      services.length > 0
        ? services.reduce((sum, service) => sum + service.duration_minutes, 0)
        : null;
    const currency = services[0]?.currency ?? null;
    const isUpcoming = appointment.startAt.getTime() >= Date.now();

    return {
      id: appointment.id,
      tenant_id: appointment.tenantId,
      client_id: appointment.clientId,
      branch_id: appointment.branchId,
      crm_external_id: appointment.crmExternalId,
      staff_external_id: appointment.staffExternalId,
      service_ids: serviceIds,
      start_at: appointment.startAt,
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
