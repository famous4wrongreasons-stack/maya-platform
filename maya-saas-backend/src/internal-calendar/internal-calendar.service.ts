import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CalendarSource } from '../common/domain.enums';
import { getIndustryPreset } from '../common/industry-presets';
// 🔴 Внутренний календарь НЕ импортирует границу CRM. Собственные данные Maya
// одевались в типы, форму которых задал адаптер YCLIENTS: `category` и
// `duration_minutes` рождались из `price_min`/`seance_length`, а `rating` — из
// `staff.rating`, из-за чего календарь подставлял чужие заглушки. Канон лежит
// ниже обоих источников — см. `src/domain/catalog.ts`.
import { CANCELED_STATUS_VALUES } from '../domain';
import type { BookableSlot, Practitioner, ServiceOffering } from '../domain';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaResource } from '../quotas/quota-resource';
import { QuotaService } from '../quotas/quota.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { CreateInternalServiceDto } from './dto/create-internal-service.dto';
import { CreateInternalProviderDto } from './dto/create-internal-provider.dto';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import type { ListCalendarJournalDto } from './dto/list-calendar-journal.dto';
import type { WeeklyAvailabilityRuleDto } from './dto/replace-weekly-availability.dto';
import { UpdateInternalProviderDto } from './dto/update-internal-provider.dto';
import { UpdateInternalServiceDto } from './dto/update-internal-service.dto';
import {
  localDateMinuteToUtc,
  localWeekday,
  minuteToTime,
  parseTimeToMinute,
  rangesOverlap,
} from './internal-calendar.utils';

const DEFAULT_WEEKLY_RULES: WeeklyAvailabilityRuleDto[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' }),
);
// Написания «отменено», лежащие В БАЗЕ. Состав менять нельзя — изменится выборка.
const CANCELLED_STATUSES = [...CANCELED_STATUS_VALUES];
const JOURNAL_MAX_RANGE_DAYS = 31;

interface InternalServiceTiming {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

@Injectable()
export class InternalCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly usersService: UsersService,
    private readonly quotas: QuotaService,
  ) {}

  async ensureProviderForUser(
    tenantId: string,
    userId: string,
    options: { displayName?: string | null; branchId?: string | null } = {},
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    const user = await this.usersService.getTenantUserOrThrow(
      userId,
      scopedTenantId,
    );
    const branchId =
      options.branchId ??
      user.branchId ??
      (await this.findFirstBranchId(scopedTenantId));
    const displayName =
      options.displayName?.trim() ||
      this.usersService.getUserName(user) ||
      user.email.split('@')[0] ||
      'Специалист';
    const provider = await this.prisma.internalProvider.upsert({
      where: {
        tenantId_userId: {
          tenantId: scopedTenantId,
          userId,
        },
      },
      update: {
        branchId,
        displayName,
        active: true,
      },
      create: {
        tenantId: scopedTenantId,
        userId,
        branchId,
        displayName,
        title: 'Специалист',
      },
    });

    const [ruleCount, services] = await Promise.all([
      this.prisma.internalAvailabilityRule.count({
        where: { tenantId: scopedTenantId, providerId: provider.id },
      }),
      this.prisma.internalService.findMany({
        where: { tenantId: scopedTenantId, active: true },
        select: { id: true },
      }),
    ]);

    if (ruleCount === 0) {
      await this.prisma.internalAvailabilityRule.createMany({
        data: DEFAULT_WEEKLY_RULES.map((rule) => ({
          tenantId: scopedTenantId,
          providerId: provider.id,
          weekday: rule.weekday,
          startMinute: parseTimeToMinute(rule.startTime),
          endMinute: parseTimeToMinute(rule.endTime),
        })),
      });
    }

    if (services.length > 0) {
      await this.prisma.internalProviderService.createMany({
        data: services.map((service) => ({
          tenantId: scopedTenantId,
          providerId: provider.id,
          serviceId: service.id,
        })),
        skipDuplicates: true,
      });
    }

    return this.getProvider(scopedTenantId, provider.id);
  }

  async getSetup(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    const [services, providers, rules, exceptions, ready] = await Promise.all([
      this.prisma.internalService.findMany({
        where: { tenantId: scopedTenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.internalProvider.findMany({
        where: { tenantId: scopedTenantId },
        orderBy: { createdAt: 'asc' },
        include: { branch: true },
      }),
      this.prisma.internalAvailabilityRule.findMany({
        where: { tenantId: scopedTenantId, active: true },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.internalAvailabilityException.findMany({
        where: { tenantId: scopedTenantId, endAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
      }),
      this.isReady(scopedTenantId),
    ]);

    return {
      calendar_source: CalendarSource.INTERNAL,
      ready,
      services: services.map((service) => this.serializeService(service)),
      providers: providers.map((provider) => this.serializeProvider(provider)),
      weekly_rules: rules.map((rule) => ({
        id: rule.id,
        provider_id: rule.providerId,
        weekday: rule.weekday,
        start_time: minuteToTime(rule.startMinute),
        end_time: minuteToTime(rule.endMinute),
      })),
      time_off: exceptions.map((exception) => ({
        id: exception.id,
        provider_id: exception.providerId,
        start_at: exception.startAt,
        end_at: exception.endAt,
        note: exception.note,
      })),
    };
  }

  async getJournal(tenantId: string, query: ListCalendarJournalDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new BadRequestException({
        message: 'Calendar range is invalid.',
        error: { code: 'calendar_range_invalid' },
      });
    }

    if (
      to.getTime() - from.getTime() >
      JOURNAL_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException({
        message: `Calendar range must not exceed ${JOURNAL_MAX_RANGE_DAYS} days.`,
        error: { code: 'calendar_range_too_large' },
      });
    }

    await this.assertInternalSource(scopedTenantId);
    const [tenant, appointments, services, providers] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: scopedTenantId },
        select: { defaultTimezone: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId: scopedTenantId,
          source: CalendarSource.INTERNAL,
          startAt: { lt: to },
          endAt: { gt: from },
          ...(query.providerId ? { staffExternalId: query.providerId } : {}),
        },
        orderBy: { startAt: 'asc' },
        include: {
          branch: true,
          client: {
            select: { id: true, encryptedName: true },
          },
        },
      }),
      this.prisma.internalService.findMany({
        where: { tenantId: scopedTenantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.internalProvider.findMany({
        where: { tenantId: scopedTenantId },
        include: { branch: true },
      }),
    ]);

    const servicesById = new Map(
      services.map((service) => [service.id, this.serializeService(service)]),
    );
    const providersById = new Map(
      providers.map((provider) => [
        provider.id,
        this.serializeProvider(provider),
      ]),
    );
    const items = appointments.map((appointment) => {
      const serviceIds = Array.isArray(appointment.serviceIds)
        ? appointment.serviceIds.filter(
            (serviceId): serviceId is string => typeof serviceId === 'string',
          )
        : [];
      const appointmentServices = serviceIds.flatMap((serviceId) => {
        const service = servicesById.get(serviceId);
        return service ? [service] : [];
      });

      return {
        id: appointment.id,
        client: {
          // 🔴 Аккаунт стал необязательным (B3.1). Во внутреннем календаре он
          // всегда есть — запись создаётся зарегистрированным клиентом, — но
          // тип это больше не гарантирует, и падать на чужой записи журнал не
          // должен.
          id: appointment.client?.id ?? null,
          name: appointment.client
            ? (this.usersService.getUserName(appointment.client) ?? 'Клиент')
            : 'Клиент',
        },
        provider:
          providersById.get(appointment.staffExternalId) ??
          ({ id: appointment.staffExternalId } as const),
        branch: appointment.branch
          ? {
              id: appointment.branch.id,
              name: appointment.branch.name,
              timezone: appointment.branch.timezone,
            }
          : null,
        service_ids: serviceIds,
        services: appointmentServices,
        start_at: appointment.startAt,
        end_at: appointment.endAt,
        status: appointment.status,
        notes: appointment.notes,
        total_price:
          appointmentServices.length > 0
            ? appointmentServices.reduce(
                (total, service) => total + service.price,
                0,
              )
            : null,
        currency: appointmentServices[0]?.currency ?? null,
      };
    });

    return {
      calendar_source: CalendarSource.INTERNAL,
      timezone: tenant?.defaultTimezone ?? 'Europe/Moscow',
      range: { from: from.toISOString(), to: to.toISOString() },
      provider_id: query.providerId ?? null,
      count: items.length,
      appointments: items,
    };
  }

  async listServices(tenantId: string): Promise<ServiceOffering[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const services = await this.prisma.internalService.findMany({
      where: { tenantId: scopedTenantId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return services.map((service) => this.serializeService(service));
  }

  async createService(tenantId: string, dto: CreateInternalServiceDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    const providerIds = await this.prisma.internalProvider.findMany({
      where: { tenantId: scopedTenantId, active: true },
      select: { id: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const service = await tx.internalService.create({
        data: {
          tenantId: scopedTenantId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          price: dto.price,
          currency: dto.currency ?? 'RUB',
          durationMinutes: dto.durationMinutes,
          bufferBeforeMinutes: dto.bufferBeforeMinutes ?? 0,
          bufferAfterMinutes: dto.bufferAfterMinutes ?? 0,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      if (providerIds.length > 0) {
        await tx.internalProviderService.createMany({
          data: providerIds.map((provider) => ({
            tenantId: scopedTenantId,
            providerId: provider.id,
            serviceId: service.id,
          })),
        });
      }

      return service;
    });

    return this.serializeService(created);
  }

  async updateService(
    tenantId: string,
    serviceId: string,
    dto: UpdateInternalServiceDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    const result = await this.prisma.internalService.updateMany({
      where: { id: serviceId, tenantId: scopedTenantId },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description.trim() || null,
        price: dto.price,
        currency: dto.currency,
        durationMinutes: dto.durationMinutes,
        bufferBeforeMinutes: dto.bufferBeforeMinutes,
        bufferAfterMinutes: dto.bufferAfterMinutes,
        sortOrder: dto.sortOrder,
        active: dto.active,
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Internal service not found');
    }

    const service = await this.prisma.internalService.findFirstOrThrow({
      where: { id: serviceId, tenantId: scopedTenantId },
    });
    return this.serializeService(service);
  }

  async deactivateService(tenantId: string, serviceId: string) {
    return this.updateService(tenantId, serviceId, { active: false });
  }

  async listStaff(tenantId: string): Promise<Practitioner[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const providers = await this.prisma.internalProvider.findMany({
      where: { tenantId: scopedTenantId, active: true },
      orderBy: { createdAt: 'asc' },
      include: { branch: true },
    });

    return providers.map((provider) => this.serializeProvider(provider));
  }

  async createProvider(tenantId: string, dto: CreateInternalProviderDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    await this.quotas.assertCanCreate(scopedTenantId, QuotaResource.STAFF);
    const branchId =
      dto.branchId ?? (await this.findFirstBranchId(scopedTenantId));

    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: scopedTenantId },
        select: { id: true },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found for this tenant');
      }
    }

    const services = await this.prisma.internalService.findMany({
      where: { tenantId: scopedTenantId, active: true },
      select: { id: true },
    });
    const provider = await this.prisma.$transaction(async (tx) => {
      const created = await tx.internalProvider.create({
        data: {
          tenantId: scopedTenantId,
          userId: null,
          branchId,
          displayName: dto.displayName.trim(),
          title: dto.title?.trim() || 'Специалист',
          specialization: dto.specialization?.trim() || null,
          avatarUrl: dto.avatarUrl,
          slotIntervalMinutes: dto.slotIntervalMinutes ?? 30,
        },
      });

      await tx.internalAvailabilityRule.createMany({
        data: DEFAULT_WEEKLY_RULES.map((rule) => ({
          tenantId: scopedTenantId,
          providerId: created.id,
          weekday: rule.weekday,
          startMinute: parseTimeToMinute(rule.startTime),
          endMinute: parseTimeToMinute(rule.endTime),
        })),
      });

      if (services.length > 0) {
        await tx.internalProviderService.createMany({
          data: services.map((service) => ({
            tenantId: scopedTenantId,
            providerId: created.id,
            serviceId: service.id,
          })),
        });
      }

      return created;
    });

    return this.getProvider(scopedTenantId, provider.id);
  }

  async updateProvider(
    tenantId: string,
    providerId: string,
    dto: UpdateInternalProviderDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);

    if (dto.active === true) {
      const existing = await this.prisma.internalProvider.findFirst({
        where: { id: providerId, tenantId: scopedTenantId },
        select: { active: true, userId: true },
      });

      if (!existing) {
        throw new NotFoundException('Internal provider not found');
      }
      if (!existing.active && existing.userId === null) {
        await this.quotas.assertCanCreate(scopedTenantId, QuotaResource.STAFF);
      }
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId: scopedTenantId },
        select: { id: true },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found for this tenant');
      }
    }

    const result = await this.prisma.internalProvider.updateMany({
      where: { id: providerId, tenantId: scopedTenantId },
      data: {
        displayName: dto.displayName?.trim(),
        title: dto.title === undefined ? undefined : dto.title.trim() || null,
        specialization:
          dto.specialization === undefined
            ? undefined
            : dto.specialization.trim() || null,
        avatarUrl: dto.avatarUrl,
        branchId: dto.branchId,
        slotIntervalMinutes: dto.slotIntervalMinutes,
        active: dto.active,
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Internal provider not found');
    }

    return this.getProvider(scopedTenantId, providerId);
  }

  async getProviderSchedule(tenantId: string, providerId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.getProvider(scopedTenantId, providerId);
    const [rules, exceptions] = await Promise.all([
      this.prisma.internalAvailabilityRule.findMany({
        where: { tenantId: scopedTenantId, providerId, active: true },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.internalAvailabilityException.findMany({
        where: {
          tenantId: scopedTenantId,
          providerId,
          endAt: { gte: new Date() },
        },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    return {
      provider_id: providerId,
      rules: rules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        start_time: minuteToTime(rule.startMinute),
        end_time: minuteToTime(rule.endMinute),
      })),
      time_off: exceptions.map((exception) => ({
        id: exception.id,
        start_at: exception.startAt,
        end_at: exception.endAt,
        note: exception.note,
      })),
    };
  }

  async replaceWeeklyAvailability(
    tenantId: string,
    providerId: string,
    rules: WeeklyAvailabilityRuleDto[],
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    await this.getProvider(scopedTenantId, providerId);
    const normalizedRules = rules.map((rule) => ({
      tenantId: scopedTenantId,
      providerId,
      weekday: rule.weekday,
      startMinute: parseTimeToMinute(rule.startTime),
      endMinute: parseTimeToMinute(rule.endTime),
    }));

    this.assertValidWeeklyRules(normalizedRules);
    await this.prisma.$transaction(async (tx) => {
      await tx.internalAvailabilityRule.deleteMany({
        where: { tenantId: scopedTenantId, providerId },
      });

      if (normalizedRules.length > 0) {
        await tx.internalAvailabilityRule.createMany({ data: normalizedRules });
      }
    });

    return this.getProviderSchedule(scopedTenantId, providerId);
  }

  async createTimeOff(
    tenantId: string,
    providerId: string,
    dto: CreateTimeOffDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    await this.getProvider(scopedTenantId, providerId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (startAt.getTime() >= endAt.getTime()) {
      throw new BadRequestException('Time off end must be after start');
    }

    const created = await this.prisma.internalAvailabilityException.create({
      data: {
        tenantId: scopedTenantId,
        providerId,
        startAt,
        endAt,
        note: dto.note?.trim() || null,
      },
    });

    return {
      id: created.id,
      provider_id: created.providerId,
      start_at: created.startAt,
      end_at: created.endAt,
      note: created.note,
    };
  }

  async deleteTimeOff(
    tenantId: string,
    providerId: string,
    exceptionId: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.assertInternalSource(scopedTenantId);
    const result = await this.prisma.internalAvailabilityException.deleteMany({
      where: { id: exceptionId, tenantId: scopedTenantId, providerId },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Time off entry not found');
    }

    return { ok: true };
  }

  async getServiceTiming(
    tenantId: string,
    providerId: string,
    serviceIds: string[],
  ): Promise<InternalServiceTiming> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    if (serviceIds.length === 0) {
      throw new BadRequestException('At least one service is required');
    }

    const services = await this.prisma.internalService.findMany({
      where: {
        tenantId: scopedTenantId,
        id: { in: serviceIds },
        active: true,
        providers: {
          some: {
            tenantId: scopedTenantId,
            providerId,
            active: true,
          },
        },
      },
    });

    if (services.length !== new Set(serviceIds).size) {
      throw new BadRequestException('Service is unavailable for this provider');
    }

    const servicesById = new Map(
      services.map((service) => [service.id, service]),
    );
    const ordered = serviceIds.map((serviceId) => servicesById.get(serviceId)!);

    return {
      durationMinutes: ordered.reduce(
        (total, service) => total + service.durationMinutes,
        0,
      ),
      bufferBeforeMinutes: ordered[0]?.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: ordered.at(-1)?.bufferAfterMinutes ?? 0,
    };
  }

  async getAvailableSlots(params: {
    tenantId: string;
    date: string;
    staffId?: string;
    serviceIds?: string[];
    branchId?: string;
  }): Promise<BookableSlot[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(params.tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: {
        industryPresetId: true,
        defaultTimezone: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const localDate = params.date.slice(0, 10);
    const weekday = localWeekday(localDate);
    const providers = await this.prisma.internalProvider.findMany({
      where: {
        tenantId: scopedTenantId,
        active: true,
        ...(params.staffId ? { id: params.staffId } : {}),
        ...(params.branchId ? { branchId: params.branchId } : {}),
      },
      include: {
        branch: true,
        services: {
          where: { active: true },
          select: { serviceId: true },
        },
        availabilityRules: {
          where: { weekday, active: true },
          orderBy: { startMinute: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const selectedServiceIds = params.serviceIds ?? [];
    const slots: BookableSlot[] = [];
    const minimumNoticeMs =
      getIndustryPreset(tenant.industryPresetId).defaultBookingSettings
        .minimumNoticeMinutes *
      60 *
      1000;

    for (const provider of providers) {
      const supportedServices = new Set(
        provider.services.map((service) => service.serviceId),
      );

      if (
        selectedServiceIds.some(
          (serviceId) => !supportedServices.has(serviceId),
        )
      ) {
        continue;
      }

      const timing =
        selectedServiceIds.length > 0
          ? await this.getServiceTiming(
              scopedTenantId,
              provider.id,
              selectedServiceIds,
            )
          : {
              durationMinutes: getIndustryPreset(tenant.industryPresetId)
                .defaultBookingSettings.defaultDurationMinutes,
              bufferBeforeMinutes: 0,
              bufferAfterMinutes: 0,
            };
      const timeZone = provider.branch?.timezone ?? tenant.defaultTimezone;
      const dayStart = localDateMinuteToUtc(localDate, 0, timeZone);
      const dayEnd = localDateMinuteToUtc(localDate, 24 * 60, timeZone);
      const [appointments, exceptions] = await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            tenantId: scopedTenantId,
            source: CalendarSource.INTERNAL,
            staffExternalId: provider.id,
            status: { notIn: CANCELLED_STATUSES },
            blockedStartAt: { lt: dayEnd },
            blockedEndAt: { gt: dayStart },
          },
          select: { blockedStartAt: true, blockedEndAt: true },
        }),
        this.prisma.internalAvailabilityException.findMany({
          where: {
            tenantId: scopedTenantId,
            providerId: provider.id,
            kind: 'unavailable',
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
          select: { startAt: true, endAt: true },
        }),
      ]);

      for (const rule of provider.availabilityRules) {
        const ruleStart = localDateMinuteToUtc(
          localDate,
          rule.startMinute,
          timeZone,
        );
        const ruleEnd = localDateMinuteToUtc(
          localDate,
          rule.endMinute,
          timeZone,
        );

        for (
          let candidateMinute = rule.startMinute;
          candidateMinute + timing.durationMinutes <= rule.endMinute;
          candidateMinute += provider.slotIntervalMinutes
        ) {
          const start = localDateMinuteToUtc(
            localDate,
            candidateMinute,
            timeZone,
          );
          const end = new Date(
            start.getTime() + timing.durationMinutes * 60 * 1000,
          );
          const blockedStart = new Date(
            start.getTime() - timing.bufferBeforeMinutes * 60 * 1000,
          );
          const blockedEnd = new Date(
            end.getTime() + timing.bufferAfterMinutes * 60 * 1000,
          );

          if (
            start.getTime() < Date.now() + minimumNoticeMs ||
            blockedStart.getTime() < ruleStart.getTime() ||
            blockedEnd.getTime() > ruleEnd.getTime()
          ) {
            continue;
          }

          const busy = appointments.some((appointment) =>
            rangesOverlap(
              blockedStart,
              blockedEnd,
              appointment.blockedStartAt,
              appointment.blockedEndAt,
            ),
          );
          const unavailable = exceptions.some((exception) =>
            rangesOverlap(
              blockedStart,
              blockedEnd,
              exception.startAt,
              exception.endAt,
            ),
          );

          if (!busy && !unavailable) {
            slots.push({
              start: start.toISOString(),
              end: end.toISOString(),
              staff_id: provider.id,
              branch_id: provider.branchId,
            });
          }
        }
      }
    }

    return slots.sort((left, right) => left.start.localeCompare(right.start));
  }

  async isReady(tenantId: string): Promise<boolean> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const readyProviders = await this.prisma.internalProvider.count({
      where: {
        tenantId: scopedTenantId,
        active: true,
        availabilityRules: { some: { active: true } },
        services: {
          some: { active: true, service: { active: true } },
        },
      },
    });

    return readyProviders > 0;
  }

  async assertInternalSource(tenantId: string): Promise<void> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: { calendarSource: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.calendarSource !== 'internal') {
      throw new ConflictException({
        message: 'This tenant uses an external CRM calendar.',
        error: { code: 'internal_calendar_disabled' },
      });
    }
  }

  private async getProvider(tenantId: string, providerId: string) {
    const provider = await this.prisma.internalProvider.findFirst({
      where: { id: providerId, tenantId },
      include: { branch: true },
    });

    if (!provider) {
      throw new NotFoundException('Internal provider not found');
    }

    return this.serializeProvider(provider);
  }

  private async findFirstBranchId(tenantId: string): Promise<string | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    return branch?.id ?? null;
  }

  private assertValidWeeklyRules(
    rules: Array<{
      weekday: number;
      startMinute: number;
      endMinute: number;
    }>,
  ): void {
    for (const rule of rules) {
      if (rule.startMinute >= rule.endMinute) {
        throw new BadRequestException('Availability end must be after start');
      }
    }

    for (const weekday of new Set(rules.map((rule) => rule.weekday))) {
      const dayRules = rules
        .filter((rule) => rule.weekday === weekday)
        .sort((left, right) => left.startMinute - right.startMinute);

      for (let index = 1; index < dayRules.length; index += 1) {
        if (dayRules[index].startMinute < dayRules[index - 1].endMinute) {
          throw new BadRequestException(
            'Availability intervals must not overlap',
          );
        }
      }
    }
  }

  private serializeService(service: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    active: boolean;
    sortOrder: number;
  }) {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      duration_minutes: service.durationMinutes,
      buffer_before_minutes: service.bufferBeforeMinutes,
      buffer_after_minutes: service.bufferAfterMinutes,
      currency: service.currency,
      category: 'Услуги',
      active: service.active,
      sort_order: service.sortOrder,
    };
  }

  private serializeProvider(provider: {
    id: string;
    userId: string | null;
    branchId: string | null;
    displayName: string;
    title: string | null;
    specialization: string | null;
    avatarUrl: string | null;
    active: boolean;
    slotIntervalMinutes: number;
    branch?: {
      id: string;
      name: string;
      timezone: string | null;
    } | null;
  }) {
    return {
      id: provider.id,
      user_id: provider.userId,
      branch_id: provider.branchId,
      name: provider.displayName,
      title: provider.title ?? undefined,
      specialization: provider.specialization ?? undefined,
      avatar_url: provider.avatarUrl,
      rating: null,
      active: provider.active,
      slot_interval_minutes: provider.slotIntervalMinutes,
      branch: provider.branch
        ? {
            id: provider.branch.id,
            name: provider.branch.name,
            timezone: provider.branch.timezone,
          }
        : null,
    };
  }
}
