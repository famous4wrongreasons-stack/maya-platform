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
import { TenantContextService } from '../tenancy/tenant-context.service';
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService, type AppointmentActionInvocation } from './crm.service';
import { isCanceledOutcome, parseVisitOutcome } from '../domain';

type OwnedCancelTarget = {
  tenantId: string;
  clientId: string;
  linkId: string;
  branchSourceRevision?: string | null;
  appointment: {
    id: string;
    tenantId: string;
    clientId: string | null;
    mayaClientId: string | null;
    branchId: string | null;
    crmExternalId: string | null;
    crmProvider: string | null;
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
    const { target } = await this.readOwnedCancelTarget(
      tenantId,
      userId,
      appointmentId,
    );
    return this.executeOwnedCancel(target, userId, invocation);
  }

  /** U-OWN·V11 read-only extraction: `forAccount` stopping before
   * `executeOwnedCancel`. Same CLS check, same ownership transaction, same
   * codes and order, no write.
   *
   * B-18: the owner admits an appointment that is already cancelled, so the
   * canonical outcome is reported here rather than refused. A caller that must
   * answer `already_cancelled` reads `alreadyCancelled`/`canonicalStatus`; the
   * owner's own cancel behaviour is unchanged. */
  async readOwnedCancelTarget(
    tenantId: string,
    userId: string,
    appointmentId: string,
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
    const canonicalStatus = parseVisitOutcome(target.appointment.status);
    const branchSourceRevision = await this.readSourceRevision(target);
    return {
      target: { ...target, branchSourceRevision },
      storedStatus: target.appointment.status,
      canonicalStatus,
      alreadyCancelled: canonicalStatus === 'canceled',
    };
  }

  /** A provider-local record ID is not a company identity. Native Client
   * cancellation requires the same canonical create origin used by reschedule. */
  private async readSourceRevision(target: OwnedCancelTarget) {
    const row = target.appointment;
    if (row.source === 'internal') return null;
    if (!row.crmProvider)
      throw new ConflictException({
        error: { code: 'booking_appointment_source_unproven' },
      });
    if (!['yclients', 'altegio'].includes(row.crmProvider)) return null;
    if (!row.branchId || !row.crmExternalId)
      throw new ConflictException({
        error: { code: 'booking_appointment_source_unproven' },
      });
    const readRevision = async () => {
      try {
        return await this.crm.readBranchAvailabilityRevision(
          target.tenantId,
          row.branchId!,
        );
      } catch {
        throw new ConflictException({
          error: { code: 'booking_branch_source_stale' },
        });
      }
    };
    const revision = await readRevision();
    if (!revision)
      throw new ConflictException({
        error: { code: 'booking_appointment_source_unproven' },
      });
    await this.crm.assertClientAppointmentBranchOrigin(
      target.tenantId,
      target.clientId,
      row.crmExternalId,
      row.branchId,
      row.crmProvider,
    );
    if ((await readRevision()) !== revision)
      throw new ConflictException({
        error: { code: 'booking_branch_source_stale' },
      });
    return revision;
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
      branchSourceRevision: target.branchSourceRevision ?? undefined,
      clientPrincipal: {
        linkId: target.linkId,
        appointmentId: target.appointment.id,
      },
      callerIdempotency: invocation.callerIdempotency ?? {
        scope: 'appointments.http.cancel.v1',
        key: identity,
      },
      authorizationCheck: async () => {
        const current = await this.resolveOwnedTarget(
          target.tenantId,
          userId,
          target.appointment.id,
        );
        if (
          current.linkId !== target.linkId ||
          current.clientId !== target.clientId
        )
          throw new ForbiddenException('Original Client binding required');
        if (
          current.appointment.source !== target.appointment.source ||
          current.appointment.crmProvider !== target.appointment.crmProvider ||
          current.appointment.crmExternalId !==
            target.appointment.crmExternalId ||
          current.appointment.branchId !== target.appointment.branchId ||
          (await this.readSourceRevision(current)) !==
            (target.branchSourceRevision ?? null)
        )
          throw new ConflictException({
            error: { code: 'booking_branch_source_stale' },
          });
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
            'Результат отмены пока неизвестен. Проверьте актуальное состояние записи перед новым действием.',
          error: {
            code: 'crm_outcome_unknown',
            message:
              'CRM did not answer in time. The cancellation outcome is unknown.',
          },
        });
      }
      throw error;
    }

    // A concurrent waiter or a completed replay can return from AE without
    // executing handlers. Recheck current Client authority before disclosure.
    await ownedInvocation.authorizationCheck?.();
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
