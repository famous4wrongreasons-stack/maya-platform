import { createHash } from 'node:crypto';
import type { ClientChannelLink } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  actionExecutionResultFromError,
  ActionConflictError,
} from '../action-engine';
import { stableActionJson } from '../action-engine/action-engine.identity';
import {
  CLIENT_BOOKING_IDEMPOTENCY_SCOPE,
  CLIENT_BOOKING_INTENT_CONTRACT,
} from '../action-engine/client-booking-intent.contract';
import { canonicalAppointmentInstant } from '../crm/appointment-time.utils';
import { bookingServiceFactsFingerprint } from '../crm/service-catalog-read';
import { ClientChannelLinkService } from '../crm/client-channel-link.service';
import { clientChannelSubjectHash } from '../crm/client-channel-subject';
import {
  CrmService,
  type AppointmentActionInvocation,
} from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { resolveSalonTimezone } from '../tenants/salon-timezone';
import {
  findMatchingSlotByLocalStart,
  normalizeBookingPhone,
  normalizeClientName,
  normalizeRequestedStart,
} from './appointment-preview.utils';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

/** Account and AI are initiators. Only the verified link selects the Client;
 * request contact fields are booking data, never an ownership lookup. */
@Injectable()
export class ClientAppointmentCreateService {
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
  ) {
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: () =>
        Promise.reject(new ForbiddenException('Verified binding required')),
      verifyRevocation: () =>
        Promise.reject(new ForbiddenException('Verified binding required')),
    });
  }

  private async resolveAccount(tenantId: string, userId: string) {
    this.context.assertTenantId(tenantId);
    if (!userId || this.context.get()?.userId !== userId)
      throw new ForbiddenException('Authenticated account required');
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId, userId, status: 'active', user: { status: 'active' } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Active account required');
    const link = await this.links.resolveActive(
      tenantId,
      'maya_user',
      clientChannelSubjectHash(this.encryption, 'maya_user', userId),
    );
    if (link.verificationVersion !== 1 || link.subjectHashVersion !== 1)
      throw new ForbiddenException('client_link_required');
    return link;
  }

  private async resolveSelectedAccount(
    tenantId: string,
    userId: string,
    invocation: AppointmentActionInvocation,
  ) {
    const personal = invocation.personalContext;
    if (this.context.get()?.role === 'tenant_owner' && !personal)
      throw new ForbiddenException('explicit_personal_client_context_required');
    if (personal) {
      if (personal.tenantId !== tenantId || personal.userId !== userId)
        throw new ForbiddenException('personal_client_context_mismatch');
      await personal.revalidate();
    }
    const link = await this.resolveAccount(tenantId, userId);
    if (
      personal &&
      (personal.linkId !== link.id ||
        personal.clientId !== link.clientId ||
        personal.verificationEvidenceHash !== link.verificationEvidenceHash)
    )
      throw new ForbiddenException('personal_client_binding_changed');
    return link;
  }

  async forAccount(
    tenantId: string,
    userId: string,
    dto: CreateAppointmentDto,
    invocation: AppointmentActionInvocation = {},
  ) {
    try {
      return await this.forVerifiedLink(
        tenantId,
        () => this.resolveSelectedAccount(tenantId, userId, invocation),
        dto,
        invocation,
      );
    } catch (error) {
      if (error instanceof ActionConflictError)
        throw new ConflictException({
          error: { code: 'IDEMPOTENCY_CONFLICT' },
        });
      throw error;
    }
  }

  /** U13c narrow read of the canonical execution result; no provider edge. */
  executionResult(tenantId: string, executionId: string) {
    return this.crm.getAppointmentActionExecutionResult(tenantId, executionId);
  }

  /** U-OWN·V11: the read-only half of `forAccount`, for a caller that needs the
   * owner's own quote without actuating. Same resolution, same order, same
   * codes, same CLS check; no Action Engine execution and no write. */
  async quoteForAccount(
    tenantId: string,
    userId: string,
    dto: CreateAppointmentDto,
    invocation: AppointmentActionInvocation = {},
  ) {
    try {
      const quoted = await this.quoteVerifiedLink(
        tenantId,
        () => this.resolveSelectedAccount(tenantId, userId, invocation),
        dto,
        invocation,
      );
      // Public catalogue prose is only presentation evidence. Missing labels
      // must not prevent Gate 11 from reaching a durable execution/UNKNOWN.
      // The shared mutation quote and its idempotency descriptor stay unchanged.
      const staff = await this.crm
        .getStaff(tenantId)
        .then((members) => {
          if (!Array.isArray(members)) return null;
          const matching = members.filter(
            (member) =>
              member && typeof member === 'object' && member.id === dto.staffId,
          );
          const rawName = matching.length === 1 ? matching[0].name : null;
          const name = typeof rawName === 'string' ? rawName.trim() : null;
          return name && name.length <= 160 ? { id: dto.staffId, name } : null;
        })
        .catch(() => null);
      if (
        quoted.branchSourceRevision &&
        dto.branchId &&
        (await this.crm.readBranchAvailabilityRevision(
          tenantId,
          dto.branchId,
        )) !== quoted.branchSourceRevision
      )
        throw new ConflictException({
          error: { code: 'booking_preview_stale' },
        });
      return { ...quoted, staff };
    } catch (error) {
      if (error instanceof ActionConflictError)
        throw new ConflictException({
          error: { code: 'IDEMPOTENCY_CONFLICT' },
        });
      throw error;
    }
  }

  /** Channel authentication stays in the existing channel resolver. No User
   * identity is manufactured for this shared canonical booking initiator. */
  async forVerifiedChannel(
    tenantId: string,
    linkId: string,
    dto: CreateAppointmentDto,
    invocation: AppointmentActionInvocation,
  ) {
    if (!invocation.authorizationCheck)
      throw new ForbiddenException('Authenticated channel required');
    const resolve = async () => {
      this.context.assertTenantId(tenantId);
      await invocation.authorizationCheck!();
      const link = await this.prisma.clientChannelLink.findUnique({
        where: { id_tenantId: { id: linkId, tenantId } },
      });
      if (
        !link ||
        link.revokedAt ||
        link.verificationVersion !== 1 ||
        link.subjectHashVersion !== 1
      )
        throw new ForbiddenException('Verified active Client binding required');
      return link;
    };
    try {
      return await this.forVerifiedLink(
        tenantId,
        resolve,
        dto,
        invocation,
        true,
      );
    } catch (error) {
      if (error instanceof ActionConflictError)
        throw new ConflictException({
          error: { code: 'IDEMPOTENCY_CONFLICT' },
        });
      throw error;
    }
  }

  /** U-OWN·V11 read-only extraction. The prefix of `forVerifiedLink`: the
   * verified-link resolution, the canonical booking target, the bound-replay
   * lookup and the `slot_taken` check. It stops before
   * `executeCanonicalClientCreateWithReceipt` and writes nothing.
   * `forVerifiedLink` calls it, so both paths run one sequence. */
  private async quoteVerifiedLink(
    tenantId: string,
    resolveLink: () => Promise<ClientChannelLink>,
    dto: CreateAppointmentDto,
    invocation: AppointmentActionInvocation,
  ) {
    const link = await resolveLink();
    const client = await this.prisma.client.findUnique({
      where: { id_tenantId: { id: link.clientId, tenantId } },
      select: {
        id: true,
        user: { select: { encryptedName: true, phone: true } },
        crmLinks: {
          where: { unlinkedAt: null },
          select: { provider: true, externalId: true },
        },
      },
    });
    if (!client) throw new ForbiddenException('client_identity_unresolved');
    // Pin the source before reading the target, branch timezone or catalogue.
    // A durable replay may outlive a removed mapping; defer only that known
    // source refusal until the canonical retry lookup has resolved.
    const sourceFailure: { error: ServiceUnavailableException | null } = {
      error: null,
    };
    const initialBranchSourceRevision = dto.branchId
      ? await this.crm
          .readBranchAvailabilityRevision(tenantId, dto.branchId)
          .catch((error: unknown) => {
            const response =
              error instanceof ServiceUnavailableException
                ? error.getResponse()
                : null;
            if (
              error instanceof ServiceUnavailableException &&
              typeof response === 'object' &&
              response !== null &&
              'error' in response &&
              (response.error as { code?: unknown } | null)?.code ===
                'booking_branch_source_unavailable'
            ) {
              sourceFailure.error = error;
              return null;
            }
            throw error;
          })
      : null;
    const calendarTarget =
      await this.crm.canonicalClientBookingTarget(tenantId);
    const source = calendarTarget.source;
    let bound = invocation.callerIdempotency
      ? await this.crm.resolveCanonicalClientBookingRetry(
          tenantId,
          link.clientId,
          invocation.callerIdempotency.key,
        )
      : null;
    const branch = dto.branchId
      ? await this.prisma.branch.findFirst({
          where: { id: dto.branchId, tenantId },
          select: { id: true, timezone: true },
        })
      : null;
    if (dto.branchId && !branch)
      throw new BadRequestException('Branch not found for this tenant');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultTimezone: true },
    });
    const timezone =
      bound && bound.descriptor.branchId === (dto.branchId ?? null)
        ? bound.resolutionContext.timezone
        : source === 'internal' && !branch
          ? (await this.crm.availabilityContext(tenantId, dto.staffId)).timezone
          : resolveSalonTimezone({
              branchTimezone: branch?.timezone,
              tenantTimezone: tenant?.defaultTimezone,
            });
    const localStart = normalizeRequestedStart(dto.start, timezone);
    const start = canonicalAppointmentInstant(localStart, timezone);

    // This is the existing server-derived caller alias, not the intent hash.
    // The kernel fingerprints only the versioned normalized business descriptor.
    const key =
      invocation.callerIdempotency?.key ??
      createHash('sha256')
        .update(
          stableActionJson([
            tenantId,
            link.clientId,
            source,
            dto.branchId ?? null,
            dto.staffId,
            [...new Set(dto.serviceIds)].sort(),
            start,
          ]),
        )
        .digest('hex');
    bound ??= await this.crm.resolveCanonicalClientBookingRetry(
      tenantId,
      link.clientId,
      key,
    );

    let name =
      bound?.descriptor.clientName ??
      (client.user?.encryptedName
        ? this.encryption.decrypt(client.user.encryptedName)
        : '');
    let phone = bound?.descriptor.clientPhone ?? (client.user?.phone || '');
    if (source === 'internal') {
      name = dto.clientName?.trim() || name;
      phone = dto.clientPhone?.trim() || phone;
    }
    // Same exact-link contact resolution as the accepted B19 channel creator.
    // No phone matching or Client/account creation is permitted.
    if ((!name || !phone) && client.crmLinks.length) {
      const registry = await this.crm.getClientRegistry(tenantId);
      const links = client.crmLinks.filter(
        (link) => link.provider === registry.provider,
      );
      if (links.length === 1) {
        const matches = registry.clients.filter(
          (candidate) => candidate.external_id === links[0].externalId,
        );
        if (matches.length === 1) {
          name ||= matches[0].name?.trim() || '';
          phone ||= matches[0].phone?.trim() || '';
        }
      }
    }
    if (source === 'external') {
      if (!name || !phone)
        throw new ForbiddenException(
          'Verified Client booking identity unavailable',
        );
      if (
        !bound &&
        dto.clientPhone &&
        normalizeBookingPhone(dto.clientPhone) !== normalizeBookingPhone(phone)
      )
        throw new ForbiddenException(
          'Booking contact must belong to the verified Client',
        );
    }
    if (bound && source === 'external' && dto.clientPhone)
      phone = dto.clientPhone;
    const bookingIdentity = {
      clientName: normalizeClientName(name),
      clientPhone: normalizeBookingPhone(phone),
    };
    // A replay must reach the durable action even after its slot was consumed.
    const previous =
      bound ??
      (await this.crm.findCanonicalClientCreate(tenantId, {
        ...dto,
        ...bookingIdentity,
        clientId: link.clientId,
        start,
      }));
    if (!previous && sourceFailure.error) throw sourceFailure.error;
    const branchSourceRevision = previous ? null : initialBranchSourceRevision;
    if (
      !previous &&
      dto.branchId &&
      (await this.crm.readBranchAvailabilityRevision(
        tenantId,
        dto.branchId,
      )) !== branchSourceRevision
    )
      throw new ConflictException({ error: { code: 'booking_preview_stale' } });
    if (
      !previous &&
      invocation.branchSourceRevision &&
      invocation.branchSourceRevision !== branchSourceRevision
    )
      throw new ConflictException({ error: { code: 'booking_preview_stale' } });
    const services = await this.crm
      .readBookableServices(tenantId, dto.serviceIds)
      .catch(
        (
          error: unknown,
        ): Awaited<ReturnType<CrmService['readBookableServices']>> => {
          // Alias-bound and historical executions both retain their result path.
          if (previous) return [];
          throw error;
        },
      );
    const factsHash = services.length
      ? bookingServiceFactsFingerprint(
          {
            tenantId,
            clientId: link.clientId,
            calendarTarget,
            branchId: dto.branchId ?? null,
            staffId: dto.staffId,
            start,
            timezone,
            ...(branchSourceRevision ? { branchSourceRevision } : {}),
          },
          services,
        )
      : null;
    if (!previous) {
      const slots = await this.crm.getAvailableSlots(tenantId, {
        date: localStart,
        staffId: dto.staffId,
        serviceIds: dto.serviceIds,
        branchId: dto.branchId,
      });
      const slot = findMatchingSlotByLocalStart(slots, localStart, timezone);
      if (!slot)
        throw new BadRequestException({ error: { code: 'slot_taken' } });
      if (
        new Date(slot.end).getTime() - new Date(slot.start).getTime() !==
        services.reduce((sum, service) => sum + service.duration_minutes, 0) *
          60_000
      )
        throw new ServiceUnavailableException({
          error: { code: 'booking_service_facts_unavailable' },
        });
      if (
        branchSourceRevision &&
        dto.branchId &&
        (await this.crm.readBranchAvailabilityRevision(
          tenantId,
          dto.branchId,
        )) !== branchSourceRevision
      )
        throw new ConflictException({
          error: { code: 'booking_preview_stale' },
        });
    }
    return {
      link,
      calendarTarget,
      source,
      bound,
      branch,
      timezone,
      localStart,
      start,
      key,
      bookingIdentity,
      services,
      factsHash,
      branchSourceRevision,
      previous,
    };
  }

  private async forVerifiedLink(
    tenantId: string,
    resolveLink: () => Promise<ClientChannelLink>,
    dto: CreateAppointmentDto,
    invocation: AppointmentActionInvocation,
    preserveExecutionError = false,
  ) {
    const {
      link,
      calendarTarget,
      source,
      timezone,
      start,
      key,
      bookingIdentity,
      services,
      factsHash,
      branchSourceRevision,
      previous,
    } = await this.quoteVerifiedLink(tenantId, resolveLink, dto, invocation);
    if (
      !previous &&
      ((invocation.personalContext && !invocation.expectedBookingFactsHash) ||
        (invocation.expectedBookingFactsHash &&
          invocation.expectedBookingFactsHash !== factsHash))
    )
      throw new ConflictException({ error: { code: 'booking_preview_stale' } });
    const input = {
      ...dto,
      ...bookingIdentity,
      clientId: link.clientId,
      start,
      creationMode: 'client' as const,
      allowBusy: false,
      notifyBySmsHours: 0,
    };
    const ownedInvocation: AppointmentActionInvocation = {
      ...(invocation.personalContext
        ? { personalContext: invocation.personalContext }
        : {}),
      sourceType: 'authenticated_request',
      sourceRef: `client-channel-link:${link.id}`,
      clientPrincipal: { linkId: link.id },
      callerIdempotency: { scope: CLIENT_BOOKING_IDEMPOTENCY_SCOPE, key },
      bookingIntent: {
        contract: CLIENT_BOOKING_INTENT_CONTRACT,
        calendarTarget,
        timezone,
      },
      ...(!previous && factsHash ? { bookingFactsHash: factsHash } : {}),
      ...(!previous && branchSourceRevision ? { branchSourceRevision } : {}),
      authorizationCheck: async () => {
        const current = await resolveLink();
        if (
          current.id !== link.id ||
          current.clientId !== link.clientId ||
          current.verificationEvidenceHash !== link.verificationEvidenceHash
        )
          throw new ForbiddenException('Verified Client identity changed');
      },
    };
    let externalId: string;
    let execution;
    try {
      const receipt = await this.crm.executeCanonicalClientCreateWithReceipt(
        tenantId,
        input,
        ownedInvocation,
      );
      externalId = receipt.value.external_id;
      execution = receipt.execution;
    } catch (error) {
      if (
        !preserveExecutionError &&
        actionExecutionResultFromError(error)?.state === 'UNKNOWN'
      )
        throw new ServiceUnavailableException({
          error: { code: 'crm_outcome_unknown' },
        });
      throw error;
    }
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        mayaClientId: link.clientId,
        ...(source === 'internal'
          ? { id: externalId }
          : {
              crmProvider: await this.crm.getExternalProviderKey(tenantId),
              crmExternalId: externalId,
            }),
      },
      include: { branch: true },
    });
    if (!appointment)
      throw new ServiceUnavailableException(
        'Canonical Appointment outcome unavailable',
      );
    return { appointment, services, bookingIdentity, timezone, execution };
  }
}
