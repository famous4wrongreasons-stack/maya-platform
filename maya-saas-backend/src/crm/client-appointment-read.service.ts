import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService } from './crm.service';

type ReadChannel = {
  tenantId: string;
  provider: 'maya_user' | 'telegram';
  providerSubjectHash: string;
};

/** B26: shared account/AI/channel projection. No importer or mutation owner.
 * The account is only a channel subject; its active verified link owns the
 * Client selection. Appointment.clientId (optional User) is never authority.
 */
@Injectable()
export class ClientAppointmentReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
  ) {}

  forAccount(tenantId: string, userId: string) {
    this.context.assertTenantId(tenantId);
    const principal = this.context.get();
    if (!userId || principal?.userId !== userId)
      throw new ForbiddenException('Authenticated account required');
    return this.read(async (tx) => {
      const membership = await tx.membership.findFirst({
        where: {
          tenantId,
          userId,
          status: 'active',
          user: { status: 'active' },
        },
        select: { id: true },
      });
      if (!membership) throw new ForbiddenException('Active account required');
      return {
        tenantId,
        provider: 'maya_user',
        providerSubjectHash: clientChannelSubjectHash(
          this.encryption,
          'maya_user',
          userId,
        ),
      };
    });
  }

  forChannel(channelProof: string) {
    return this.read((tx) => this.channels.authenticate(channelProof, tx));
  }

  private async read(
    authenticate: (tx: Prisma.TransactionClient) => Promise<ReadChannel>,
  ) {
    const snapshot = await this.prisma.$transaction(
      async (tx) => {
        // PostgreSQL enforces this boundary, including future helper changes.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const channel = await authenticate(tx);
        this.context.assertTenantId(channel.tenantId);
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
          links[0].subjectHashVersion !== 1 ||
          links[0].verificationVersion !== 1
        )
          throw new ForbiddenException('client_link_required');
        const client = await tx.client.findUnique({
          where: {
            id_tenantId: { id: links[0].clientId, tenantId: channel.tenantId },
          },
          select: {
            id: true,
            mergedIntoClientId: true,
            crmLinks: {
              where: { unlinkedAt: null },
              select: { provider: true, externalId: true },
            },
          },
        });
        if (!client || client.mergedIntoClientId)
          throw new ForbiddenException('client_identity_unresolved');
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
          throw new ForbiddenException('client_identity_unresolved');

        const appointments = await tx.appointment.findMany({
          where: { tenantId: channel.tenantId, mayaClientId: client.id },
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            tenantId: true,
            clientId: true,
            branchId: true,
            crmExternalId: true,
            source: true,
            staffExternalId: true,
            serviceIds: true,
            startAt: true,
            endAt: true,
            status: true,
            notes: true,
            totalPriceKopecks: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
            branch: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                address: true,
                phone: true,
                timezone: true,
              },
            },
          },
        });
        return { tenantId: channel.tenantId, appointments };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    if (!snapshot.appointments.length) return [];
    // Public catalog labels only. No Client/record lookup or synchronization.
    const [servicesResult, staffResult] = await Promise.allSettled([
      this.crm.getServices(snapshot.tenantId),
      this.crm.getStaff(snapshot.tenantId),
    ]);
    const services =
      servicesResult.status === 'fulfilled' ? servicesResult.value : [];
    const staff = staffResult.status === 'fulfilled' ? staffResult.value : [];
    return snapshot.appointments.map((row) => {
      const ids = Array.isArray(row.serviceIds)
        ? row.serviceIds.filter((id): id is string => typeof id === 'string')
        : [];
      const member = staff.find(
        (candidate) => candidate.id === row.staffExternalId,
      );
      const upcoming = row.startAt.getTime() >= Date.now();
      const branch =
        row.branch?.tenantId === snapshot.tenantId ? row.branch : null;
      return {
        id: row.id,
        tenant_id: row.tenantId,
        client_id: row.clientId,
        branch_id: branch?.id ?? null,
        crm_external_id: row.crmExternalId,
        source: row.source,
        staff_external_id: row.staffExternalId,
        service_ids: ids,
        start_at: row.startAt,
        end_at: row.endAt,
        status: row.status,
        notes: row.notes,
        is_upcoming: upcoming,
        timeline: upcoming ? 'upcoming' : 'past',
        branch: branch
          ? {
              id: branch.id,
              name: branch.name,
              address: branch.address,
              phone: branch.phone,
              timezone: branch.timezone,
            }
          : null,
        staff: member
          ? {
              id: member.id,
              name: member.name,
              title: member.title ?? null,
              specialization: member.specialization ?? null,
              avatar_url: member.avatar_url ?? null,
              rating: member.rating ?? null,
            }
          : { id: row.staffExternalId },
        services: services.filter((service) => ids.includes(service.id)),
        total_price:
          row.totalPriceKopecks === null ? null : row.totalPriceKopecks / 100,
        duration_minutes: Math.round(
          (row.endAt.getTime() - row.startAt.getTime()) / 60000,
        ),
        currency: row.currency,
        // Raw provider data is not an approved Client projection.
        provider_payload: {},
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      };
    });
  }
}
