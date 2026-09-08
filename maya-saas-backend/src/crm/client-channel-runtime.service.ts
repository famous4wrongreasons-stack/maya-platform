import {
  effectiveClientConsent,
  effectiveClientConsents,
} from './client-effective-consent';
import { resolveVerifiedClientDeliveryEndpoint } from './client-delivery-endpoint';
import { ClientBookingConfirmationService } from './client-booking-confirmation.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ClientAppointmentCreateService } from '../appointments/client-appointment-create.service';
import { Prisma } from '@prisma/client';

import {
  actionExecutionResultFromError,
  type ExecutionResultV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import {
  ClientLinkChallengeService,
  type ClientChallengeIssuerAuthority,
} from './client-link-challenge.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from './client-channel-link.service';
import { EncryptionService } from '../encryption/encryption.service';
import { Package5Wave3CanonicalCutoverService } from '../package5-wave3/package5-wave3-canonical-cutover.service';
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService } from './crm.service';

/** Only an existing verified Client link can authorize this challenge issuer.
 * Missing provenance fails closed; User/Profile rows cannot bootstrap authority.
 */
@Injectable()
export class ClientChannelRuntimeService implements ClientChallengeIssuerAuthority {
  readonly resolverId = 'a18.active-verified-client-channel.v1';
  private readonly challenges: ClientLinkChallengeService;
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
    private readonly consent: Package5Wave3CanonicalCutoverService,
    private readonly crm: CrmService,
    private readonly appointmentCreator: ClientAppointmentCreateService = new ClientAppointmentCreateService(
      prisma,
      context,
      encryption,
      crm,
    ),
  ) {
    const closedVerifier = {
      verifyLink: () =>
        Promise.reject(
          new ForbiddenException('Initial links require ClientLinkChallenge'),
        ),
      verifyRevocation: () =>
        Promise.reject(
          new ForbiddenException('Explicit verified rebind operation required'),
        ),
    };
    this.links = new ClientChannelLinkService(prisma, context, closedVerifier);
    this.challenges = new ClientLinkChallengeService(
      prisma,
      context,
      encryption,
      this.links,
      this,
      channels,
    );
  }

  async resolve(proof: string, tx: Prisma.TransactionClient) {
    const channel = await this.channels.authenticate(proof, tx);
    this.context.assertTenantId(channel.tenantId);
    await lockClientChannelIdentity(
      tx,
      channel.tenantId,
      channel.provider,
      channel.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId: channel.tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (
      links.length !== 1 ||
      current.tenantId !== channel.tenantId ||
      current.provider !== channel.provider ||
      current.providerSubjectHash !== channel.providerSubjectHash ||
      links[0].verificationVersion !== 1 ||
      links[0].subjectHashVersion !== 1
    )
      throw new ForbiddenException(
        'Trusted verified Client resolution required',
      );
    const link = links[0];
    return {
      tenantId: link.tenantId,
      clientId: link.clientId,
      linkId: link.id,
      resolver: this.resolverId,
      resolutionEvidenceRef: `client-channel-link:${link.id}`,
      resolutionEvidenceHash: link.verificationEvidenceHash,
      issuerAuthorityHash: current.channelControlProofHash,
      validUntil: current.validUntil,
    };
  }

  issue(channelProof: string) {
    return this.challenges.issue({ resolutionProof: channelProof });
  }

  consume(channelProof: string, token: string) {
    return this.challenges.consume({ channelProof, token });
  }

  async refreshDeliveryAddress(channelProof: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const first = await this.channels.authenticate(channelProof, tx);
        await lockClientChannelIdentity(
          tx,
          first.tenantId,
          first.provider,
          first.providerSubjectHash,
        );
        const current = await this.channels.authenticate(channelProof, tx);
        if (
          current.tenantId !== first.tenantId ||
          current.provider !== first.provider ||
          current.providerSubjectHash !== first.providerSubjectHash ||
          current.deliveryAddress !== first.deliveryAddress
        )
          throw new ForbiddenException('Authenticated channel changed');
        const links = await tx.clientChannelLink.findMany({
          where: {
            tenantId: current.tenantId,
            provider: current.provider,
            providerSubjectHash: current.providerSubjectHash,
            revokedAt: null,
          },
          take: 2,
        });
        if (links.length !== 1)
          throw new ForbiddenException('client_link_required');
        await this.links.persistDeliveryAddressInTransaction(tx, {
          tenantId: current.tenantId,
          linkId: links[0].id,
          provider: current.provider,
          providerSubjectHash: current.providerSubjectHash,
          deliveryAddressEncrypted: this.encryption.encrypt(
            current.deliveryAddress,
          ),
        });
        return { stored: true, linkId: links[0].id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Server-internal delivery resolution. A caller supplies a canonical Client
   * and exact link reference, never a raw provider recipient. */
  async resolveVerifiedDeliveryEndpoint(clientId: string, linkId: string) {
    return resolveVerifiedClientDeliveryEndpoint(
      this.prisma,
      this.encryption,
      this.links,
      this.context.requireTenantId(),
      clientId,
      linkId,
    );
  }

  async submitConsent(channelProof: string, value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'idempotencyKey,marketing,privacy'
    )
      throw new BadRequestException(
        'Only consent decisions and command identity are accepted',
      );
    const input = value as {
      privacy: boolean;
      marketing: boolean;
      idempotencyKey: string;
    };
    if (
      typeof input.privacy !== 'boolean' ||
      typeof input.marketing !== 'boolean' ||
      typeof input.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey)
    )
      throw new BadRequestException(
        'Explicit consent decisions and stable command identity required',
      );
    const tenantId = this.context.requireTenantId();
    const channel = await this.prisma.$transaction((tx) =>
      this.channels.authenticate(channelProof, tx),
    );
    const recheck = async (tx: Prisma.TransactionClient) => {
      const current = await this.channels.authenticate(channelProof, tx);
      if (
        current.tenantId !== tenantId ||
        current.provider !== channel.provider ||
        current.providerSubjectHash !== channel.providerSubjectHash
      )
        throw new ForbiddenException('Authenticated channel changed');
    };
    const occurredAt = new Date();
    const privacy = await this.consent.recordChannelConsent(
      tenantId,
      channel,
      'privacy',
      input.privacy,
      occurredAt,
      input.idempotencyKey,
      recheck,
    );
    const marketing = await this.consent.recordChannelConsent(
      tenantId,
      channel,
      'marketing',
      input.marketing,
      occurredAt,
      input.idempotencyKey,
      recheck,
    );
    return { privacy, marketing };
  }

  /** Compatibility ingress for native bundles released before e5ec27fd.
   * Only keyed transitions are supported. The route cannot select a Client or
   * bootstrap linkage; existing canonical consent admission owns every effect.
   */
  async submitLegacyNativeConsent(
    channelProof: string,
    value: unknown,
    idempotencyKey?: string,
  ) {
    // This must precede authentication/link/challenge/execution calls. An old
    // keyless request cannot identify a retry versus a post-revoke new grant.
    if (
      typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(idempotencyKey)
    )
      throw new BadRequestException('consent_transition_identity_required');
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'marketingConsent,privacyConsent'
    )
      throw new BadRequestException('Exact legacy consent decision required');
    const input = value as {
      privacyConsent: unknown;
      marketingConsent: unknown;
    };
    if (
      typeof input.privacyConsent !== 'boolean' ||
      typeof input.marketingConsent !== 'boolean'
    )
      throw new BadRequestException('Exact legacy consent decision required');

    return this.submitConsent(channelProof, {
      privacy: input.privacyConsent,
      marketing: input.marketingConsent,
      idempotencyKey,
    });
  }

  async status(channelProof: string) {
    return this.prisma.$transaction(async (tx) => {
      const channel = await this.channels.authenticate(channelProof, tx);
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId: channel.tenantId,
          provider: channel.provider,
          providerSubjectHash: channel.providerSubjectHash,
          revokedAt: null,
        },
        take: 2,
      });
      if (links.length !== 1)
        return {
          linked: false,
          privacy: false,
          marketing: false,
          client_link_required: true,
        };
      const consent = await effectiveClientConsents(
        tx,
        channel.tenantId,
        links[0].clientId,
      );
      return {
        linked: true,
        privacy: consent.privacy.effective,
        marketing: consent.marketing.effective,
        marketing_decided:
          consent.marketing.decided && !consent.marketing.invalidated,
        client_link_required: false,
      };
    });
  }

  /** B21 realtime readiness. The WebSocket transport receives only a bounded
   * authority verdict: no Client id, channel subject, phone, PII or reusable
   * role shortcut leaves the canonical runtime. Every new socket calls this
   * method again, so revoked links/sessions/access cannot be inherited.
   */
  async realtimeAuthority(channelProof: string, value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).join(',') !== 'mode' ||
      !('mode' in value) ||
      !['client', 'staff'].includes(String(value.mode))
    )
      throw new BadRequestException('Exact realtime mode required');
    const mode = String(value.mode) as 'client' | 'staff';
    return this.prisma.$transaction(async (tx) => {
      const channel = await this.channels.authenticate(channelProof, tx);
      if (mode === 'client') {
        const links = await tx.clientChannelLink.findMany({
          where: {
            tenantId: channel.tenantId,
            provider: channel.provider,
            providerSubjectHash: channel.providerSubjectHash,
            revokedAt: null,
            verificationVersion: 1,
            subjectHashVersion: 1,
          },
          select: { clientId: true },
          take: 2,
        });
        if (links.length !== 1)
          throw new ForbiddenException('client_link_required');
        const client = await tx.client.findUnique({
          where: {
            id_tenantId: {
              id: links[0].clientId,
              tenantId: channel.tenantId,
            },
          },
          select: { mergedIntoClientId: true },
        });
        if (!client || client.mergedIntoClientId)
          throw new ForbiddenException('client_link_required');
        const profile = await tx.customerProfile.findUnique({
          where: {
            tenantId_clientId: {
              tenantId: channel.tenantId,
              clientId: links[0].clientId,
            },
          },
          select: { privacyConsentAt: true },
        });
        if (
          !profile?.privacyConsentAt ||
          !(
            await effectiveClientConsent(
              tx,
              channel.tenantId,
              links[0].clientId,
              'privacy',
            )
          ).effective
        )
          throw new ForbiddenException('privacy_consent_required');
        return {
          ready: true,
          authority: 'client' as const,
          role: 'client' as const,
          client_link_verified: true,
          privacy_verified: true,
          durable_history: false,
          business_mutations: 0,
        };
      }

      if (channel.provider !== 'maya_user' || !channel.userId)
        throw new ForbiddenException('canonical_staff_session_required');
      const [identities, membership, accesses] = await Promise.all([
        tx.authIdentity.findMany({
          where: { tenantId: channel.tenantId, userId: channel.userId },
          select: { id: true },
          take: 1,
        }),
        tx.membership.findUnique({
          where: {
            userId_tenantId: {
              userId: channel.userId,
              tenantId: channel.tenantId,
            },
          },
          select: { id: true, role: true, status: true },
        }),
        tx.crmStaffAccess.findMany({
          where: {
            tenantId: channel.tenantId,
            userId: channel.userId,
            status: 'active',
            role: { in: ['administrator', 'staff'] },
          },
          select: { role: true },
          take: 2,
        }),
      ]);
      if (
        identities.length < 1 ||
        !membership ||
        membership.status !== 'active' ||
        accesses.length !== 1 ||
        accesses[0].role !== membership.role
      )
        throw new ForbiddenException('canonical_staff_access_required');
      return {
        ready: true,
        authority: 'staff' as const,
        role: accesses[0].role,
        auth_identity_verified: true,
        membership_verified: true,
        crm_staff_access_verified: true,
        durable_history: false,
        business_mutations: 0,
      };
    });
  }

  /**
   * B16 read-only booking projection. Channel authentication and the exact
   * active ClientChannelLink select the Client before any PII is read. The
   * legacy channel id, phone and caller payload never participate in identity
   * resolution, and this reader creates no Client, link or consent fact.
   */
  async bookingPrefill(channelProof: string) {
    const identity = await this.prisma.$transaction(async (tx) => {
      const channel = await this.channels.authenticate(channelProof, tx);
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId: channel.tenantId,
          provider: channel.provider,
          providerSubjectHash: channel.providerSubjectHash,
          revokedAt: null,
          verificationVersion: 1,
          subjectHashVersion: 1,
        },
        take: 2,
      });
      if (links.length !== 1) return null;

      const client = await tx.client.findUnique({
        where: {
          id_tenantId: {
            id: links[0].clientId,
            tenantId: channel.tenantId,
          },
        },
        select: {
          id: true,
          tenantId: true,
          mergedIntoClientId: true,
          user: {
            select: {
              tenantId: true,
              status: true,
              phone: true,
              encryptedName: true,
            },
          },
          crmLinks: {
            where: { unlinkedAt: null },
            select: { provider: true, externalId: true },
          },
        },
      });
      if (!client || client.mergedIntoClientId) return null;

      const profile = await tx.customerProfile.findUnique({
        where: {
          tenantId_clientId: {
            tenantId: channel.tenantId,
            clientId: client.id,
          },
        },
        select: { privacyConsentAt: true },
      });
      return {
        tenantId: channel.tenantId,
        clientId: client.id,
        privacy:
          Boolean(profile?.privacyConsentAt) &&
          (
            await effectiveClientConsent(
              tx,
              channel.tenantId,
              client.id,
              'privacy',
            )
          ).effective,
        user: client.user,
        crmLinks: client.crmLinks,
      };
    });

    if (!identity)
      return {
        linked: false,
        known: false,
        has_phone: false,
        name: '',
        phone: '',
        client_link_required: true,
      };
    if (!identity.privacy)
      return {
        linked: true,
        known: true,
        needs_consent: true,
        has_phone: false,
        name: '',
        phone: '',
        client_link_required: false,
      };

    let name = '';
    let phone = '';
    if (
      identity.user?.tenantId === identity.tenantId &&
      identity.user.status === 'active'
    ) {
      phone = identity.user.phone?.trim() ?? '';
      if (identity.user.encryptedName) {
        try {
          name = this.encryption.decrypt(identity.user.encryptedName).trim();
        } catch {
          name = '';
        }
      }
    }

    if (!name || !phone) {
      try {
        const registry = await this.crm.getClientRegistry(identity.tenantId);
        const exactLinks = identity.crmLinks.filter(
          (link) => link.provider === registry.provider,
        );
        if (exactLinks.length === 1) {
          const matches = registry.clients.filter(
            (candidate) => candidate.external_id === exactLinks[0].externalId,
          );
          if (matches.length === 1) {
            name ||= matches[0].name?.trim() ?? '';
            phone ||= matches[0].phone?.trim() ?? '';
          }
        }
      } catch {
        // A provider read failure is an unavailable prefill, never a fallback
        // to a legacy channel/phone identity or a reason to expose other PII.
      }
    }

    const phoneDigits = phone.replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 10;
    return {
      linked: true,
      known: true,
      has_phone: hasPhone,
      name,
      phone: hasPhone ? phone : '',
      client_link_required: false,
    };
  }

  /** B20 read-only cabinet projection. The authenticated channel and its one
   * active ClientChannelLink are the only Client selector. All sections are
   * read from canonical Package 4/5 facts; a cabinet read never warms a cache,
   * creates identity, or writes a business/projection fact.
   */
  async cabinetProjection(channelProof: string) {
    const now = new Date();
    const projection = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const channel = await this.channels.authenticate(channelProof, tx);
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId: channel.tenantId,
          provider: channel.provider,
          providerSubjectHash: channel.providerSubjectHash,
          revokedAt: null,
          verificationVersion: 1,
          subjectHashVersion: 1,
        },
        take: 2,
      });
      if (links.length !== 1) return null;

      const client = await tx.client.findUnique({
        where: {
          id_tenantId: {
            id: links[0].clientId,
            tenantId: channel.tenantId,
          },
        },
        select: {
          id: true,
          tenantId: true,
          mergedIntoClientId: true,
          user: {
            select: {
              tenantId: true,
              status: true,
              phone: true,
              encryptedName: true,
            },
          },
          crmLinks: {
            where: { unlinkedAt: null },
            select: { provider: true, externalId: true },
          },
        },
      });
      if (!client || client.mergedIntoClientId) return null;
      if (
        client.crmLinks.length &&
        (await tx.unresolvedClientIdentityHold.findFirst({
          where: {
            tenantId: channel.tenantId,
            resolvedAt: null,
            OR: client.crmLinks,
          },
          select: { id: true },
        }))
      )
        return null;

      const profile = await tx.customerProfile.findUnique({
        where: {
          tenantId_clientId: {
            tenantId: channel.tenantId,
            clientId: client.id,
          },
        },
        select: { privacyConsentAt: true },
      });
      if (
        !profile?.privacyConsentAt ||
        !(
          await effectiveClientConsent(
            tx,
            channel.tenantId,
            client.id,
            'privacy',
          )
        ).effective
      )
        return {
          tenantId: channel.tenantId,
          clientId: client.id,
          privacy: false as const,
          user: client.user,
          crmLinks: client.crmLinks,
          appointments: [],
          loyalty: null,
          subscription: null,
          referrals: [],
        };

      const [appointments, loyalty, subscription, referrals] =
        await Promise.all([
          tx.appointment.findMany({
            where: {
              tenantId: channel.tenantId,
              mayaClientId: client.id,
            },
            orderBy: { startAt: 'desc' },
            take: 200,
            select: {
              id: true,
              crmProvider: true,
              crmExternalId: true,
              staffExternalId: true,
              serviceIds: true,
              startAt: true,
              endAt: true,
              status: true,
              attendance: true,
              totalPriceKopecks: true,
            },
          }),
          tx.loyaltyAccount.findUnique({
            where: {
              tenantId_clientId: {
                tenantId: channel.tenantId,
                clientId: client.id,
              },
            },
            select: { balance: true, source: true },
          }),
          tx.customerSubscription.findFirst({
            where: {
              tenantId: channel.tenantId,
              clientId: client.id,
              status: 'active',
              termEndsAt: { gt: now },
            },
            orderBy: { termStartsAt: 'desc' },
            select: {
              planCode: true,
              visitsIncluded: true,
              termEndsAt: true,
              usages: { select: { units: true } },
            },
          }),
          tx.customerReferral.findMany({
            where: {
              tenantId: channel.tenantId,
              referrerClientId: client.id,
            },
            select: { status: true },
          }),
        ]);

      return {
        tenantId: channel.tenantId,
        clientId: client.id,
        privacy: true as const,
        user: client.user,
        crmLinks: client.crmLinks,
        appointments,
        loyalty,
        subscription,
        referrals,
      };
    });

    if (!projection)
      return {
        linked: false,
        known: false,
        has_phone: false,
        needs_phone: true,
        name: '',
        full_name: '',
        phone_tail: '',
        booking_phone: '',
        client_link_required: true,
        business_mutations: 0,
      };
    if (!projection.privacy)
      return {
        linked: true,
        known: false,
        needs_consent: true,
        has_phone: false,
        needs_phone: true,
        name: '',
        full_name: '',
        phone_tail: '',
        booking_phone: '',
        client_link_required: false,
        business_mutations: 0,
      };

    let name = '';
    let phone = '';
    if (
      projection.user?.tenantId === projection.tenantId &&
      projection.user.status === 'active'
    ) {
      phone = projection.user.phone?.trim() ?? '';
      if (projection.user.encryptedName) {
        try {
          name = this.encryption.decrypt(projection.user.encryptedName).trim();
        } catch {
          name = '';
        }
      }
    }
    if (!name || !phone) {
      try {
        const registry = await this.crm.getClientRegistry(projection.tenantId);
        const exactLinks = projection.crmLinks.filter(
          (link) => link.provider === registry.provider,
        );
        if (exactLinks.length === 1) {
          const matches = registry.clients.filter(
            (candidate) => candidate.external_id === exactLinks[0].externalId,
          );
          if (matches.length === 1) {
            name ||= matches[0].name?.trim() ?? '';
            phone ||= matches[0].phone?.trim() ?? '';
          }
        }
      } catch {
        // Provider reads may make PII temporarily unavailable; they never
        // authorize a legacy chat/session/phone fallback.
      }
    }

    const phoneDigits = phone.replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 10;
    const rows = projection.appointments.map((appointment) => {
      const serviceIds = Array.isArray(appointment.serviceIds)
        ? appointment.serviceIds
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 40)
        : [];
      return {
        record_id: appointment.crmExternalId ?? appointment.id,
        provider: appointment.crmProvider,
        date: appointment.startAt.toISOString(),
        end_at: appointment.endAt.toISOString(),
        services: serviceIds,
        master: appointment.staffExternalId,
        master_id: appointment.staffExternalId,
        cost:
          appointment.totalPriceKopecks === null
            ? null
            : appointment.totalPriceKopecks / 100,
        status: appointment.status,
        attendance: appointment.attendance,
      };
    });
    const upcoming = rows
      .filter(
        (appointment, index) =>
          projection.appointments[index].startAt >= now &&
          !['cancelled', 'canceled'].includes(
            projection.appointments[index].status.toLowerCase(),
          ),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const history = rows.filter(
      (_appointment, index) => projection.appointments[index].startAt < now,
    );
    const lastYear = new Date(now);
    lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
    const visitsLastYear = projection.appointments.filter(
      (appointment) =>
        appointment.startAt >= lastYear && appointment.startAt < now,
    ).length;
    const used =
      projection.subscription?.usages.reduce(
        (total, item) => total + item.units,
        0,
      ) ?? 0;
    const fullName = name;
    const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? '';

    return {
      linked: true,
      known: true,
      has_phone: hasPhone,
      needs_phone: !hasPhone,
      name: firstName,
      full_name: fullName,
      phone_tail: hasPhone ? phoneDigits.slice(-4) : '',
      booking_phone: hasPhone ? phone : '',
      loyalty: {
        balance: projection.loyalty?.balance ?? 0,
        source: projection.loyalty?.source ?? 'unavailable',
        care_services: [],
        affordable_services: [],
        best_service: null,
        next_service: null,
        redemption_rule: 'one_care_service_per_visit',
      },
      visits: {
        total: history.length,
        last_year: visitsLastYear,
        last_visit: history[0] ?? null,
      },
      client_card: null,
      client_note: '',
      usual_master: null,
      upcoming,
      history: history.slice(0, 30),
      subscription: projection.subscription
        ? {
            title: projection.subscription.planCode,
            tier_label: '',
            used,
            total: projection.subscription.visitsIncluded,
            expires_at: projection.subscription.termEndsAt
              .toISOString()
              .slice(0, 10),
            services_included: [],
          }
        : null,
      referral: {
        code: null,
        link: null,
        invited: projection.referrals.filter(
          (referral) => referral.status === 'resolved',
        ).length,
        pending: projection.referrals.filter(
          (referral) => referral.status === 'pending',
        ).length,
      },
      tg_user: {},
      client_link_required: false,
      business_mutations: 0,
    };
  }

  private bookingConfirmations() {
    return new ClientBookingConfirmationService(
      this.prisma,
      this.encryption,
      this.resolve.bind(this),
    );
  }

  acceptBookingConfirmation(channelProof: string, value: unknown) {
    return this.bookingConfirmations().accept(channelProof, value);
  }

  async createConfirmedChatAppointment(channelProof: string, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Durable booking confirmation required');
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).sort().join(',') !==
        'confirmationId,serviceIds,staffId,start' ||
      typeof input.confirmationId !== 'string'
    )
      throw new BadRequestException(
        'Only confirmed chat appointment fields accepted',
      );
    const key = await this.bookingConfirmations().resolveKey(
      channelProof,
      input.confirmationId,
    );
    return this.createClientAppointment(channelProof, {
      idempotencyKey: key,
      staffId: input.staffId,
      serviceIds: input.serviceIds,
      start: input.start,
    });
  }

  /** B19 authenticated Client appointment creation. Chat supplies only the
   * requested slot and a stable intent identity. The verified active channel
   * link selects the canonical Client, while Maya derives provider PII from
   * that Client's exact account/CRM binding. The existing Action Engine
   * create_appointment executor remains the sole provider mutation owner.
   */
  async createClientAppointment(channelProof: string, value: unknown) {
    const input = this.clientAppointmentCreatePayload(value);
    const authority = await this.clientAppointmentCreateAuthority(channelProof);
    const invocation = {
      sourceType: 'authenticated_request' as const,
      sourceRef: authority.resolutionEvidenceRef,
      callerIdempotency: {
        scope: 'appointments.client.create.v1',
        key: input.idempotencyKey,
      },
      authorizationCheck: async () => {
        const current = await this.prisma.$transaction((tx) =>
          this.resolve(channelProof, tx),
        );
        if (
          current.tenantId !== authority.tenantId ||
          current.clientId !== authority.clientId ||
          current.resolutionEvidenceRef !== authority.resolutionEvidenceRef ||
          current.resolutionEvidenceHash !== authority.resolutionEvidenceHash
        )
          throw new ForbiddenException('Verified Client identity changed');
      },
    };
    let execution: ExecutionResultV1;
    try {
      execution = (
        await this.appointmentCreator.forVerifiedChannel(
          authority.tenantId,
          authority.linkId,
          {
            staffId: input.staffId,
            serviceIds: input.serviceIds,
            start: input.start,
          },
          invocation,
        )
      ).execution;
    } catch (error) {
      const canonical = actionExecutionResultFromError(error);
      if (!canonical) throw error;
      execution = canonical;
    }
    return this.clientAppointmentExecutionResponse(execution);
  }

  private clientAppointmentCreatePayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Appointment command payload required');
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).sort().join(',') !==
      'idempotencyKey,serviceIds,staffId,start'
    )
      throw new BadRequestException(
        'Only the exact appointment command fields are accepted',
      );
    if (
      typeof input.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey) ||
      typeof input.staffId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(input.staffId) ||
      !Array.isArray(input.serviceIds) ||
      input.serviceIds.length === 0 ||
      input.serviceIds.length > 64 ||
      !input.serviceIds.every(
        (item: unknown): item is string =>
          typeof item === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(item),
      ) ||
      typeof input.start !== 'string' ||
      input.start.length > 64
    )
      throw new BadRequestException('Exact appointment request required');
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime()))
      throw new BadRequestException('Future appointment datetime required');
    return {
      idempotencyKey: input.idempotencyKey,
      staffId: input.staffId,
      serviceIds: [...new Set(input.serviceIds)],
      start: input.start,
    };
  }

  private async clientAppointmentCreateAuthority(channelProof: string) {
    return this.prisma.$transaction(async (tx) => {
      const verified = await this.resolve(channelProof, tx);
      const client = await tx.client.findUnique({
        where: {
          id_tenantId: {
            id: verified.clientId,
            tenantId: verified.tenantId,
          },
        },
        select: {
          id: true,
          mergedIntoClientId: true,
        },
      });
      if (!client || client.mergedIntoClientId)
        throw new ForbiddenException('Verified active Client required');
      const profile = await tx.customerProfile.findUnique({
        where: {
          tenantId_clientId: {
            tenantId: verified.tenantId,
            clientId: verified.clientId,
          },
        },
        select: { privacyConsentAt: true },
      });
      if (
        !profile?.privacyConsentAt ||
        !(
          await effectiveClientConsent(
            tx,
            verified.tenantId,
            verified.clientId,
            'privacy',
          )
        ).effective
      )
        throw new ForbiddenException('Canonical Client consent required');
      return verified;
    });
  }

  /** B17 authenticated Client appointment mutation boundary. The channel link
   * resolves the Client and the canonical Appointment mirror proves ownership;
   * only the existing Action Engine appointment executor may write the provider.
   */
  async cancelClientAppointment(channelProof: string, value: unknown) {
    const input = this.clientAppointmentPayload(value, false);
    const authority = await this.clientAppointmentAuthority(
      channelProof,
      input.recordId,
    );
    return this.executeClientAppointment(
      'cancel',
      authority,
      input.recordId,
      undefined,
      channelProof,
    );
  }

  async rescheduleClientAppointment(channelProof: string, value: unknown) {
    const input = this.clientAppointmentPayload(value, true);
    const requested = new Date(input.start);
    if (Number.isNaN(requested.getTime()) || requested <= new Date())
      throw new BadRequestException('Future appointment datetime required');
    const authority = await this.clientAppointmentAuthority(
      channelProof,
      input.recordId,
    );
    return this.executeClientAppointment(
      'reschedule',
      authority,
      input.recordId,
      input.start,
      channelProof,
    );
  }

  /** B18 customer-originated service replacement. AI remains an initiator:
   * the verified channel resolves the Client, the canonical Appointment mirror
   * proves ownership, and the existing residual Action Engine executor owns the
   * only provider write and UNKNOWN reconciliation contract.
   */
  async setClientAppointmentServices(channelProof: string, value: unknown) {
    const input = this.clientAppointmentServicesPayload(value);
    const authority = await this.clientAppointmentAuthority(
      channelProof,
      input.recordId,
    );
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          authority.tenantId,
          authority.clientId,
          'set_appointment_services',
          input.recordId,
          input.serviceIds,
        ]),
      )
      .digest('hex');
    const invocation = {
      sourceType: 'authenticated_request' as const,
      sourceRef: authority.resolutionEvidenceRef,
      callerIdempotency: {
        scope: 'client-channel.appointment.services.v1',
        key: identity,
      },
      clientPrincipal: {
        linkId: authority.linkId,
        appointmentId: authority.appointmentId,
      },
      authorizationCheck: async () => {
        await this.clientAppointmentAuthority(channelProof, input.recordId);
      },
    };
    let execution: ExecutionResultV1;
    try {
      execution = (
        await this.crm.executeResidualAppointmentWithReceipt(
          authority.tenantId,
          'set_appointment_services',
          input.recordId,
          { serviceIds: input.serviceIds },
          invocation,
        )
      ).execution;
    } catch (error) {
      const canonical = actionExecutionResultFromError(error);
      if (!canonical) throw error;
      execution = canonical;
    }
    return this.clientAppointmentExecutionResponse(execution);
  }

  private clientAppointmentPayload(value: unknown, reschedule: boolean) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Appointment command payload required');
    const input = value as Record<string, unknown>;
    const expected = reschedule ? 'recordId,start' : 'recordId';
    if (Object.keys(input).sort().join(',') !== expected)
      throw new BadRequestException(
        'Only the exact appointment command fields are accepted',
      );
    if (
      typeof input.recordId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(input.recordId)
    )
      throw new BadRequestException('Exact appointment reference required');
    if (
      reschedule &&
      (typeof input.start !== 'string' || input.start.length > 64)
    )
      throw new BadRequestException('Exact appointment datetime required');
    return {
      recordId: input.recordId,
      start: reschedule ? String(input.start) : '',
    };
  }

  private clientAppointmentServicesPayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Appointment command payload required');
    const input = value as Record<string, unknown>;
    if (Object.keys(input).sort().join(',') !== 'recordId,serviceIds')
      throw new BadRequestException(
        'Only the exact appointment command fields are accepted',
      );
    if (
      typeof input.recordId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(input.recordId)
    )
      throw new BadRequestException('Exact appointment reference required');
    if (
      !Array.isArray(input.serviceIds) ||
      input.serviceIds.length === 0 ||
      input.serviceIds.length > 64 ||
      !input.serviceIds.every(
        (item: unknown): item is string =>
          typeof item === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(item),
      )
    )
      throw new BadRequestException('Exact appointment services required');
    return {
      recordId: input.recordId,
      serviceIds: [...new Set(input.serviceIds)],
    };
  }

  private async clientAppointmentAuthority(
    channelProof: string,
    externalId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await this.resolve(channelProof, tx);
      const client = await tx.client.findUnique({
        where: {
          id_tenantId: {
            id: identity.clientId,
            tenantId: identity.tenantId,
          },
        },
        select: { id: true, mergedIntoClientId: true },
      });
      if (!client || client.mergedIntoClientId)
        throw new ForbiddenException('Verified active Client required');

      const integration = await tx.crmIntegration.findUnique({
        where: { tenantId: identity.tenantId },
        select: { provider: true, status: true },
      });
      if (!integration || integration.status !== 'active')
        throw new ForbiddenException('Active CRM integration required');

      const appointment = await tx.appointment.findUnique({
        where: {
          tenantId_crmProvider_crmExternalId: {
            tenantId: identity.tenantId,
            crmProvider: integration.provider,
            crmExternalId: externalId,
          },
        },
        select: {
          id: true,
          mayaClientId: true,
          startAt: true,
        },
      });
      if (!appointment || appointment.mayaClientId !== identity.clientId)
        throw new ForbiddenException(
          'Appointment does not belong to the verified Client',
        );
      if (appointment.startAt <= new Date())
        throw new BadRequestException('Only a future appointment may change');
      return {
        ...identity,
        provider: integration.provider,
        appointmentId: appointment.id,
      };
    });
  }

  private async executeClientAppointment(
    operation: 'cancel' | 'reschedule',
    authority: {
      tenantId: string;
      clientId: string;
      linkId: string;
      appointmentId: string;
      resolutionEvidenceRef: string;
    },
    externalId: string,
    start: string | undefined,
    channelProof: string,
  ) {
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          authority.tenantId,
          authority.clientId,
          operation,
          externalId,
          start ?? null,
        ]),
      )
      .digest('hex');
    const invocation = {
      sourceType: 'authenticated_request' as const,
      sourceRef: authority.resolutionEvidenceRef,
      callerIdempotency: {
        scope: `client-channel.appointment.${operation}.v1`,
        key: identity,
      },
      clientPrincipal: {
        linkId: authority.linkId,
        appointmentId: authority.appointmentId,
      },
      authorizationCheck: async () => {
        await this.clientAppointmentAuthority(channelProof, externalId);
      },
    };
    let execution: ExecutionResultV1;
    try {
      execution =
        operation === 'cancel'
          ? (
              await this.crm.executeCancelAppointmentWithReceipt(
                authority.tenantId,
                externalId,
                invocation,
              )
            ).execution
          : (
              await this.crm.executeRescheduleAppointmentWithReceipt(
                authority.tenantId,
                { externalId, start: start as string },
                invocation,
              )
            ).execution;
    } catch (error) {
      const canonical = actionExecutionResultFromError(error);
      if (!canonical) throw error;
      execution = canonical;
    }
    return this.clientAppointmentExecutionResponse(execution);
  }

  private clientAppointmentExecutionResponse(execution: ExecutionResultV1) {
    return {
      contract: 'maya.client-appointment-command-result/1' as const,
      accepted: true,
      identity_authority: 'verified_client_channel_link' as const,
      execution_owner: 'action_engine' as const,
      provider_writes_outside_canonical_executor: 0 as const,
      execution,
      safe_explanation:
        execution.state === 'SUCCEEDED'
          ? 'Операция выполнена.'
          : execution.state === 'UNKNOWN'
            ? 'Результат операции уточняется. Не повторяйте действие.'
            : execution.state === 'FAILED' || execution.state === 'NOT_EXECUTED'
              ? 'Операция не выполнена.'
              : 'Операция принята в обработку.',
    };
  }

  /** AC4 delivery reader. Caller must be the configured internal transport;
   * recipient id selects an existing verified link and never creates authority.
   * This is intentionally unavailable as a public channel authentication path.
   */
  async telegramDeliveryConsent(subject: string) {
    if (!/^[1-9][0-9]{0,19}$/.test(subject))
      throw new BadRequestException(
        'Exact Telegram delivery recipient required',
      );
    const tenantId = this.context.requireTenantId();
    const links = await this.prisma.clientChannelLink.findMany({
      where: {
        tenantId,
        provider: 'telegram',
        providerSubjectHash: clientChannelSubjectHash(
          this.encryption,
          'telegram',
          subject,
        ),
        revokedAt: null,
        verificationVersion: 1,
        subjectHashVersion: 1,
      },
      take: 2,
    });
    if (links.length !== 1)
      return { privacy: false, marketing: false, marketing_decided: false };
    const consent = await effectiveClientConsents(
      this.prisma,
      tenantId,
      links[0].clientId,
    );
    return {
      privacy: consent.privacy.effective,
      marketing: consent.marketing.effective,
      marketing_decided:
        consent.marketing.decided && !consent.marketing.invalidated,
    };
  }
}
