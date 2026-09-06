import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  ActionExecutionUncertainError,
  actionExecutionResultFromError,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  isUsableTimezone,
  resolveSalonTimezone,
} from '../tenants/salon-timezone';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  findMatchingSlotByLocalStart,
  normalizeRequestedStart,
} from '../appointments/appointment-preview.utils';
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService, type AppointmentActionInvocation } from './crm.service';
import { isCanceledOutcome } from '../domain';

export type ClientAppointmentRescheduleRequest = {
  start: string;
  staffId?: string;
  serviceIds?: string[];
  branchId?: string;
  notes?: string;
};

type OwnedRescheduleTarget = {
  tenantId: string;
  clientId: string;
  linkId: string;
  appointment: {
    id: string;
    tenantId: string;
    clientId: string | null;
    mayaClientId: string | null;
    branchId: string | null;
    crmExternalId: string | null;
    source: string;
    staffExternalId: string;
    serviceIds: Prisma.JsonValue;
    startAt: Date;
    endAt: Date;
    blockedStartAt: Date;
    blockedEndAt: Date;
    status: string;
    notes: string | null;
    totalPriceKopecks: number | null;
    currency: string;
    providerPayload: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    branch: {
      id: string;
      name: string;
      address: string | null;
      phone: string | null;
      timezone: string | null;
    } | null;
  };
};

/** B30: HTTP/AI Client reschedule initiator. Route/service never own
 * Appointment or provider mutation; verified ClientChannelLink + mayaClientId
 * do, and Action Engine executes the existing reschedule_appointment action.
 */
@Injectable()
export class ClientAppointmentRescheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
  ) {}

  async forAccount(
    tenantId: string,
    userId: string,
    appointmentId: string,
    dto: ClientAppointmentRescheduleRequest,
    invocation: AppointmentActionInvocation = {},
  ) {
    this.context.assertTenantId(tenantId);
    const principal = this.context.get();
    if (!userId || principal?.userId !== userId)
      throw new ForbiddenException('Authenticated account required');
    const target = await this.resolveOwnedTarget(
      tenantId,
      userId,
      appointmentId,
    );
    const prepared = await this.prepareOwnedReschedule(target, dto);
    return this.executeOwnedReschedule(target, userId, prepared, invocation);
  }

  private async prepareOwnedReschedule(
    target: OwnedRescheduleTarget,
    dto: ClientAppointmentRescheduleRequest,
  ) {
    if (isCanceledOutcome(target.appointment.status)) {
      throw new ConflictException(
        this.appointmentError(
          'already_cancelled',
          'Appointment is already cancelled.',
        ),
      );
    }
    if (
      target.appointment.source !== 'internal' &&
      !target.appointment.crmExternalId
    ) {
      throw new NotFoundException(
        this.appointmentError(
          'not_found',
          'Appointment not found for the current client.',
        ),
      );
    }
    const branchId = dto.branchId ?? target.appointment.branchId ?? undefined;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: target.tenantId },
        select: { id: true, timezone: true },
      });
      if (!branch)
        throw new NotFoundException('Branch not found for this tenant');
    }
    const timezone = await this.resolveTimezone(target, branchId);
    const serviceIds =
      dto.serviceIds && dto.serviceIds.length > 0
        ? dto.serviceIds
        : this.normalizeServiceIds(target.appointment.serviceIds);
    if (serviceIds.length === 0) {
      throw new BadRequestException(
        this.appointmentError(
          'validation',
          'Appointment must keep at least one service when rescheduling.',
          'serviceIds',
        ),
      );
    }
    const services = await this.crm.getServices(target.tenantId);
    const missing = serviceIds.some(
      (serviceId) => !services.some((service) => service.id === serviceId),
    );
    if (missing) {
      throw new BadRequestException(
        this.appointmentError(
          'service_not_found',
          'One or more selected services are no longer available.',
          'serviceIds',
        ),
      );
    }
    const staffId = dto.staffId ?? target.appointment.staffExternalId;
    const requestedStart = normalizeRequestedStart(dto.start, timezone);
    const slots = await this.crm.getAvailableSlots(target.tenantId, {
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
        this.appointmentError(
          'slot_taken',
          'Selected slot is no longer available. Refresh times and try again.',
          'start',
        ),
      );
    }
    return {
      start: new Date(matchedSlot.start).toISOString(),
      requestedStart,
      matchedSlotStart: matchedSlot.start,
      timezone,
      staffId,
      serviceIds,
      notes: dto.notes ?? target.appointment.notes ?? undefined,
      branchId: branchId ?? matchedSlot.branch_id ?? undefined,
    };
  }

  private async executeOwnedReschedule(
    target: OwnedRescheduleTarget,
    userId: string,
    prepared: {
      start: string;
      requestedStart: string;
      matchedSlotStart: string;
      timezone: string;
      staffId: string;
      serviceIds: string[];
      notes?: string | null;
    },
    invocation: AppointmentActionInvocation,
  ) {
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          target.tenantId,
          target.clientId,
          'reschedule',
          target.appointment.id,
          prepared.start,
          prepared.staffId,
          prepared.serviceIds,
          prepared.notes ?? null,
        ]),
      )
      .digest('hex');
    const ownedInvocation: AppointmentActionInvocation = {
      sourceType: 'authenticated_request',
      sourceRef: `client-channel-link:${target.linkId}`,
      callerIdempotency: invocation.callerIdempotency ?? {
        scope: 'appointments.http.reschedule.v1',
        key: identity,
      },
      authorizationCheck: async () => {
        await this.resolveOwnedTarget(
          target.tenantId,
          userId,
          target.appointment.id,
        );
      },
    };
    const params = {
      externalId:
        target.appointment.source === 'internal'
          ? target.appointment.id
          : target.appointment.crmExternalId!,
      start: prepared.requestedStart,
      staffId: prepared.staffId,
      serviceIds: prepared.serviceIds,
      notes: prepared.notes ?? undefined,
    };
    try {
      if (target.appointment.source === 'internal') {
        await this.crm.executeInternalAppointmentRescheduleWithReceipt(
          target.tenantId,
          { ...params, start: prepared.start },
          ownedInvocation,
        );
      } else {
        await this.crm.executeRescheduleAppointmentWithReceipt(
          target.tenantId,
          params,
          ownedInvocation,
        );
      }
    } catch (error) {
      if (
        error instanceof ActionExecutionUncertainError ||
        actionExecutionResultFromError(error)?.state === 'UNKNOWN'
      ) {
        throw new ServiceUnavailableException({
          message:
            'Не удалось получить ответ CRM. Перенос мог не примениться — повторите попытку.',
          error: {
            code: 'crm_outcome_unknown',
            message:
              'CRM did not answer in time. The reschedule outcome is unknown.',
          },
        });
      }
      throw error;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: target.appointment.id,
        tenantId: target.tenantId,
        mayaClientId: target.clientId,
      },
      include: { branch: true },
    });
    if (!appointment) {
      throw new NotFoundException(
        this.appointmentError(
          'not_found',
          'Appointment not found for the current client.',
        ),
      );
    }
    return {
      appointment,
      previousStartAt: target.appointment.startAt,
      matchedSlotStart: prepared.matchedSlotStart,
      timezone: prepared.timezone,
    };
  }

  private resolveOwnedTarget(
    tenantId: string,
    userId: string,
    appointmentId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const membership = await tx.membership.findFirst({
          where: {
            tenantId,
            userId,
            status: 'active',
            user: { status: 'active' },
          },
          select: { id: true },
        });
        if (!membership)
          throw new ForbiddenException('Active account required');
        const links = await tx.clientChannelLink.findMany({
          where: {
            tenantId,
            provider: 'maya_user',
            providerSubjectHash: clientChannelSubjectHash(
              this.encryption,
              'maya_user',
              userId,
            ),
            revokedAt: null,
          },
          take: 2,
        });
        if (
          links.length !== 1 ||
          links[0].subjectHashVersion !== 1 ||
          links[0].verificationVersion !== 1
        )
          throw new ForbiddenException('client_link_required');
        const client = await tx.client.findUnique({
          where: {
            id_tenantId: { id: links[0].clientId, tenantId },
          },
          select: {
            id: true,
            mergedIntoClientId: true,
            userId: true,
          },
        });
        if (!client || client.mergedIntoClientId)
          throw new ForbiddenException('client_identity_unresolved');

        const appointment = await tx.appointment.findFirst({
          where: {
            id: appointmentId,
            tenantId,
            mayaClientId: client.id,
          },
          include: { branch: true },
        });
        if (!appointment) {
          throw new NotFoundException(
            this.appointmentError(
              'not_found',
              'Appointment not found for the current client.',
            ),
          );
        }
        if (
          !isCanceledOutcome(appointment.status) &&
          appointment.startAt.getTime() <= Date.now()
        ) {
          throw new BadRequestException(
            this.appointmentError(
              'too_late_to_reschedule',
              'Appointment can no longer be rescheduled because it has already started.',
            ),
          );
        }
        return {
          tenantId,
          clientId: client.id,
          linkId: links[0].id,
          appointment,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async resolveTimezone(
    target: OwnedRescheduleTarget,
    branchId?: string,
  ) {
    if (isUsableTimezone(target.appointment.branch?.timezone)) {
      return resolveSalonTimezone({
        branchTimezone: target.appointment.branch?.timezone,
      });
    }
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: target.tenantId },
        select: { timezone: true },
      });
      if (isUsableTimezone(branch?.timezone)) {
        return resolveSalonTimezone({ branchTimezone: branch?.timezone });
      }
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: target.tenantId },
      select: { defaultTimezone: true },
    });
    return resolveSalonTimezone({
      branchTimezone: target.appointment.branch?.timezone,
      tenantTimezone: tenant?.defaultTimezone,
    });
  }

  private normalizeServiceIds(serviceIds: Prisma.JsonValue): string[] {
    if (!Array.isArray(serviceIds)) return [];
    return serviceIds.filter(
      (serviceId): serviceId is string => typeof serviceId === 'string',
    );
  }

  private appointmentError(
    code:
      | 'not_found'
      | 'too_late_to_reschedule'
      | 'already_cancelled'
      | 'slot_taken'
      | 'validation'
      | 'service_not_found',
    message: string,
    field?: string,
  ) {
    return {
      message,
      error: { code, message, ...(field ? { field } : {}) },
    };
  }
}
