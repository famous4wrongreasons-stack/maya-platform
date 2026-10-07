import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { ClientAppointmentCreateService } from './client-appointment-create.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PersonalClientContextService } from './personal-client-context.service';

/** Read projections over the existing personal authority and booking owners.
 * A preview grants nothing. There is no execution, reconciliation or new writer. */
@Injectable()
export class PersonalClientReadService {
  constructor(
    private readonly contexts: PersonalClientContextService,
    private readonly creator: ClientAppointmentCreateService,
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
  ) {}

  async preview(
    user: AuthenticatedUser,
    selection: unknown,
    dto: CreateAppointmentDto,
  ) {
    const personalContext = await this.contexts.select(user, selection);
    await this.tenants.assertLiveBookingEnabled(personalContext.tenantId);
    const quote = await this.creator.quoteForAccount(
      personalContext.tenantId,
      personalContext.userId,
      dto,
      { personalContext },
    );
    const services = [...new Set(dto.serviceIds)].map((id) => {
      const matches = quote.services.filter((service) => service.id === id);
      const service = matches.length === 1 ? matches[0] : null;
      if (!service || !service.name?.trim()) this.unavailable();
      return {
        name: service.name.trim(),
        price:
          Number.isFinite(service.price) && service.price >= 0
            ? service.price
            : null,
        currency:
          typeof service.currency === 'string' && service.currency.trim()
            ? service.currency.trim()
            : null,
        durationMinutes:
          Number.isFinite(service.duration_minutes) &&
          service.duration_minutes > 0
            ? service.duration_minutes
            : null,
      };
    });
    if (!quote.staff || quote.staff.id !== dto.staffId) this.unavailable();
    await personalContext.revalidate();
    return {
      contract: 'maya.personal-booking.preview/1' as const,
      services,
      staff: quote.staff.name,
      start: quote.start,
      timezone: quote.timezone,
      source: quote.source,
      asOf: new Date().toISOString(),
      availability: quote.previous
        ? ('existing_request' as const)
        : ('available_at_read' as const),
    };
  }

  async results(user: AuthenticatedUser, selection: unknown) {
    const personal = await this.contexts.select(user, selection);
    // Client-principal executions deliberately have no actorUserId. The
    // immutable personal evidence records the actual account and membership.
    // Do not treat tenant-wide execution access as this account's authority.
    const where: Prisma.ActionExecutionWhereInput = {
      tenantId: personal.tenantId,
      capability: 'crm.appointment.create.v1',
      dryRun: false,
      sourceType: 'authenticated_request',
      sourceRef: `client-channel-link:${personal.linkId}`,
      evidenceRefsJson: {
        array_contains: [
          'personal-context:v1:personal_client',
          `personal-actor-user:v1:${personal.userId}`,
          `personal-actor-membership:v1:${personal.membershipId}`,
          `client-authority:v1:${personal.linkId}`,
        ],
      },
    };
    const records = await this.prisma.actionExecution.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      select: { id: true, createdAt: true },
    });
    const pending = await this.prisma.actionExecution.findFirst({
      where: {
        ...where,
        state: { in: ['PENDING_APPROVAL', 'READY', 'EXECUTING', 'UNKNOWN'] },
      },
      select: { id: true },
    });
    const results = [];
    for (const record of records.slice(0, 20)) {
      const outcome = await this.creator.executionResult(
        personal.tenantId,
        record.id,
      );
      results.push({
        id: record.id,
        recordedAt: record.createdAt.toISOString(),
        state: outcome.state,
      });
    }
    await personal.revalidate();
    return {
      contract: 'maya.personal-booking.results/1' as const,
      results,
      hasMore: records.length > 20,
      hasPending: pending !== null,
    };
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      error: { code: 'personal_booking_facts_unavailable' },
    });
  }
}
