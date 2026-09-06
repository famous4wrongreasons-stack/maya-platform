import { createHash } from 'node:crypto';

import {
  BadRequestException,
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
import { TenantContextService } from '../tenancy/tenant-context.service';
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService, type AppointmentActionInvocation } from './crm.service';
import { isCanceledOutcome } from '../domain';

type OwnedCancelTarget = {
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

/** B29: HTTP/AI Client cancel initiator. Route/service never own Appointment
 * or provider mutation; verified ClientChannelLink + mayaClientId do, and
 * Action Engine executes the existing cancel_appointment action.
 */
@Injectable()
export class ClientAppointmentCancelService {
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
    return this.executeOwnedCancel(target, userId, invocation);
  }

  private async executeOwnedCancel(
    target: OwnedCancelTarget,
    userId: string,
    invocation: AppointmentActionInvocation,
  ) {
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          target.tenantId,
          target.clientId,
          'cancel',
          target.appointment.id,
        ]),
      )
      .digest('hex');
    const ownedInvocation: AppointmentActionInvocation = {
      sourceType: 'authenticated_request',
      sourceRef: `client-channel-link:${target.linkId}`,
      clientPrincipal: {
        linkId: target.linkId,
        appointmentId: target.appointment.id,
      },
      callerIdempotency: invocation.callerIdempotency ?? {
        scope: 'appointments.http.cancel.v1',
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
    try {
      if (target.appointment.source === 'internal') {
        await this.crm.executeInternalAppointmentCancelWithReceipt(
          target.tenantId,
          target.appointment.id,
          ownedInvocation,
        );
      } else {
        if (!target.appointment.crmExternalId) {
          throw new NotFoundException(
            this.appointmentError(
              'not_found',
              'Appointment not found for the current client.',
            ),
          );
        }
        await this.crm.executeCancelAppointmentWithReceipt(
          target.tenantId,
          target.appointment.crmExternalId,
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
            'Не удалось получить ответ CRM. Отмена могла не примениться — повторите попытку.',
          error: {
            code: 'crm_outcome_unknown',
            message:
              'CRM did not answer in time. The cancellation outcome is unknown.',
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
    return appointment;
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
              'too_late_to_cancel',
              'Appointment can no longer be cancelled because it has already started.',
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

  private appointmentError(
    code: 'not_found' | 'too_late_to_cancel',
    message: string,
  ) {
    return {
      message,
      error: { code, message },
    };
  }
}
