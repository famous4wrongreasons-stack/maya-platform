import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

interface CreateTenantAppointmentData {
  clientId: string;
  branchId: string | null;
  crmExternalId: string | null;
  crmProvider: string | null;
  source: string;
  /**
   * 🔴 Идентичность мастера в пространстве Maya. Пишется ВМЕСТЕ с внешним id,
   * а не вместо него: внешний остаётся совместимостью, решения принимает этот.
   *
   * `null` допустим и означает «связь не разрешилась». Подставлять сюда внешний
   * id нельзя — это вернуло бы чужое пространство в собственную колонку, и
   * внешний ключ на `Staff` всё равно отверг бы запись.
   */
  staffId: string | null;
  staffExternalId: string;
  serviceIds: Prisma.InputJsonValue;
  startAt: Date;
  endAt: Date;
  blockedStartAt: Date;
  blockedEndAt: Date;
  status: string;
  notes: string | null;
  totalPriceKopecks: number | null;
  currency: string;
  providerPayload?: Prisma.InputJsonValue;
}

interface UpdateTenantAppointmentData {
  status?: string;
  source?: string;
  /** Меняется вместе со `staffExternalId`: перенос может сменить мастера. */
  staffId?: string | null;
  startAt?: Date;
  endAt?: Date;
  blockedStartAt?: Date;
  blockedEndAt?: Date;
  branchId?: string | null;
  staffExternalId?: string;
  serviceIds?: Prisma.InputJsonValue;
  notes?: string | null;
  totalPriceKopecks?: number | null;
  currency?: string;
  providerPayload?: Prisma.InputJsonValue;
}

@Injectable()
export class TenantAppointmentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async createForClient(data: CreateTenantAppointmentData) {
    const tenantId = this.tenantContext.requireTenantId();

    if (data.crmExternalId && data.crmProvider) {
      const existing = await this.findExternalMirror(
        tenantId,
        data.crmProvider,
        data.crmExternalId,
      );
      if (existing) {
        return this.repairExternalMirror(existing, data);
      }
    }

    try {
      return await this.prisma.appointment.create({
        data: {
          ...data,
          tenantId,
        },
        include: { branch: true },
      });
    } catch (error) {
      if (
        !this.isUniqueConstraintError(error) ||
        !data.crmExternalId ||
        !data.crmProvider
      ) {
        throw error;
      }

      const winner = await this.findExternalMirror(
        tenantId,
        data.crmProvider,
        data.crmExternalId,
      );
      if (!winner) throw error;
      return this.repairExternalMirror(winner, data);
    }
  }

  listForClient(clientId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.appointment.findMany({
      where: { tenantId, clientId },
      orderBy: { startAt: 'asc' },
      include: { branch: true },
    });
  }

  findByCrmExternalIdForClient(
    crmProvider: string,
    crmExternalId: string,
    clientId: string,
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.appointment.findFirst({
      where: {
        tenantId,
        clientId,
        crmProvider,
        crmExternalId,
      },
      include: { branch: true },
    });
  }

  findForClient(appointmentId: string, clientId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
        clientId,
      },
      include: { branch: true },
    });
  }

  updateForClient(
    appointmentId: string,
    clientId: string,
    data: UpdateTenantAppointmentData,
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.appointment.update({
      where: {
        id_tenantId_clientId: {
          id: appointmentId,
          tenantId,
          clientId,
        },
      },
      data,
      include: { branch: true },
    });
  }

  private findExternalMirror(
    tenantId: string,
    crmProvider: string,
    crmExternalId: string,
  ) {
    return this.prisma.appointment.findFirst({
      where: { tenantId, crmProvider, crmExternalId },
      include: { branch: true },
    });
  }

  private repairExternalMirror(
    existing: { id: string; clientId: string | null },
    data: CreateTenantAppointmentData,
  ) {
    if (existing.clientId && existing.clientId !== data.clientId) {
      throw new ConflictException({
        message: 'CRM appointment is already linked to another client.',
        error: { code: 'crm_appointment_client_conflict' },
      });
    }

    return this.prisma.appointment.update({
      where: { id: existing.id },
      data,
      include: { branch: true },
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
