import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

interface CreateTenantAppointmentData {
  clientId: string;
  branchId: string | null;
  crmExternalId: string | null;
  staffExternalId: string;
  serviceIds: Prisma.InputJsonValue;
  startAt: Date;
  status: string;
  notes: string | null;
  providerPayload?: Prisma.InputJsonValue;
}

interface UpdateTenantAppointmentData {
  status?: string;
  startAt?: Date;
  branchId?: string | null;
  staffExternalId?: string;
  serviceIds?: Prisma.InputJsonValue;
  notes?: string | null;
  providerPayload?: Prisma.InputJsonValue;
}

@Injectable()
export class TenantAppointmentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  createForClient(data: CreateTenantAppointmentData) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.appointment.create({
      data: {
        ...data,
        tenantId,
      },
      include: { branch: true },
    });
  }

  listForClient(clientId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.appointment.findMany({
      where: { tenantId, clientId },
      orderBy: { startAt: 'asc' },
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
}
