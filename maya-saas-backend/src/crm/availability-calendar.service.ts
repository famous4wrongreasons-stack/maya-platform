import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { nextAppointmentDay } from './appointment-time.utils';
import { isUsableTimezone } from '../tenants/salon-timezone';

/** A finite projection supplied by the CRM module; no provider or mutation operations. */
export interface AvailabilitySourceReads {
  getCalendarSource(tenantId: string): Promise<'internal' | 'external'>;
  readBranchAvailabilityRevision(
    tenantId: string,
    branchId: string,
  ): Promise<string | null>;
  resolveConfiguredBookingBranch(tenantId: string): Promise<{
    id: string;
    name: string;
    timezone: string;
    sourceRevision: string;
  } | null>;
}

/** Read-only calendar identity. This owner exposes no provider or booking operations. */
export async function resolveAvailabilityCalendar(
  prisma: PrismaService,
  context: TenantContextService,
  tenantId: string,
  staffId: string,
) {
  const scopedTenantId = context.assertTenantId(tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: scopedTenantId },
    select: { defaultTimezone: true, calendarSource: true },
  });
  if (!tenant) throw new NotFoundException('Tenant not found');
  const internal = tenant.calendarSource === 'internal';
  const provider = internal
    ? await prisma.internalProvider.findFirst({
        where: { id: staffId, tenantId: scopedTenantId, active: true },
        select: { branch: { select: { id: true, timezone: true } } },
      })
    : null;
  if (internal && !provider)
    throw new NotFoundException('Availability provider not found');
  const timezone = provider?.branch?.timezone ?? tenant.defaultTimezone;
  if (!isUsableTimezone(timezone))
    throw new BadRequestException('Invalid availability timezone');
  return { timezone, branchId: provider?.branch?.id ?? null };
}

@Injectable()
export class AvailabilityCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly source?: AvailabilitySourceReads,
  ) {}

  async getCalendarSource(tenantId: string) {
    this.tenantContext.assertTenantId(tenantId);
    return this.source ? this.source.getCalendarSource(tenantId) : null;
  }

  async readBranchAvailabilityRevision(tenantId: string, branchId: string) {
    this.tenantContext.assertTenantId(tenantId);
    return this.sourceReads().readBranchAvailabilityRevision(
      tenantId,
      branchId,
    );
  }

  async resolveConfiguredBookingBranch(tenantId: string) {
    this.tenantContext.assertTenantId(tenantId);
    return this.sourceReads().resolveConfiguredBookingBranch(tenantId);
  }

  private sourceReads(): AvailabilitySourceReads {
    if (!this.source)
      throw new ServiceUnavailableException({
        error: { code: 'booking_branch_source_unavailable' },
      });
    return this.source;
  }

  async nextAvailabilityDay(tenantId: string, staffId: string, now: Date) {
    const context = await resolveAvailabilityCalendar(
      this.prisma,
      this.tenantContext,
      tenantId,
      staffId,
    );
    return { ...context, date: nextAppointmentDay(now, context.timezone) };
  }
}
