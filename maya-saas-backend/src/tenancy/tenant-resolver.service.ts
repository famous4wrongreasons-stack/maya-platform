import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantStatus as PrismaTenantStatus } from '@prisma/client';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantContextService,
  TenantResolutionSource,
} from './tenant-context.service';

const PUBLIC_TENANT_STATUSES: PrismaTenantStatus[] = [
  'trial',
  'active',
  'past_due',
];
const PUBLIC_CONFIG_PATH = /\/(?:api\/)?mobile\/config\/([^/?#]+)/;

interface ResolvedPublicTenant {
  tenantId: string;
  source: TenantResolutionSource;
}

@Injectable()
export class TenantResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async resolvePublicRequest(
    request: Pick<Request, 'hostname' | 'originalUrl' | 'url'>,
  ): Promise<ResolvedPublicTenant | null> {
    const routeTenant = await this.resolveRouteSlug(
      request.originalUrl || request.url,
    );
    const domainTenant = await this.resolveDomain(request.hostname);

    if (
      routeTenant &&
      domainTenant &&
      routeTenant.tenantId !== domainTenant.tenantId
    ) {
      throw new ForbiddenException('Conflicting tenant resolution signals');
    }

    return routeTenant ?? domainTenant;
  }

  bindAuthenticatedUser(
    user: AuthenticatedUser,
    requestedTenantId?: string,
  ): void {
    if (!user.tenantId || !user.membershipId) {
      throw new ForbiddenException('Active tenant membership is required');
    }

    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }

    this.assertNoConflictingResolvedTenant(user.tenantId);

    this.tenantContext.setResolvedTenant({
      tenantId: user.tenantId,
      userId: user.userId,
      membershipId: user.membershipId,
      role: user.role,
      source: 'membership',
    });
  }

  async bindPlatformTenant(
    user: AuthenticatedUser,
    tenantId: string,
  ): Promise<void> {
    if (user.role !== UserRole.PLATFORM_OWNER) {
      throw new ForbiddenException('Platform tenant selection is not allowed');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    this.assertNoConflictingResolvedTenant(tenant.id);

    this.tenantContext.setResolvedTenant({
      tenantId: tenant.id,
      userId: user.userId,
      membershipId: null,
      role: user.role,
      source: 'platform',
    });
  }

  private async resolveRouteSlug(
    url: string,
  ): Promise<ResolvedPublicTenant | null> {
    const matchedSlug = PUBLIC_CONFIG_PATH.exec(url)?.[1];

    if (!matchedSlug) {
      return null;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: decodeURIComponent(matchedSlug).toLowerCase(),
        status: { in: PUBLIC_TENANT_STATUSES },
      },
      select: { id: true },
    });

    return tenant ? { tenantId: tenant.id, source: 'route_slug' } : null;
  }

  private assertNoConflictingResolvedTenant(tenantId: string): void {
    const resolvedTenantId = this.tenantContext.get()?.tenantId;

    if (resolvedTenantId && resolvedTenantId !== tenantId) {
      throw new ForbiddenException('Conflicting tenant resolution signals');
    }
  }

  private async resolveDomain(
    rawHostname: string,
  ): Promise<ResolvedPublicTenant | null> {
    const hostname = rawHostname.toLowerCase().replace(/\.$/, '');

    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
      return null;
    }

    const customDomainTenant = await this.prisma.tenant.findFirst({
      where: {
        customDomain: hostname,
        status: { in: PUBLIC_TENANT_STATUSES },
      },
      select: { id: true },
    });

    if (customDomainTenant) {
      return {
        tenantId: customDomainTenant.id,
        source: 'custom_domain',
      };
    }

    const baseDomain = this.configService
      .get<string>('TENANT_BASE_DOMAIN')
      ?.trim()
      .toLowerCase();

    if (!baseDomain || !hostname.endsWith(`.${baseDomain}`)) {
      return null;
    }

    const subdomain = hostname.slice(0, -(baseDomain.length + 1));

    if (!subdomain || subdomain.includes('.')) {
      return null;
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        subdomain,
        status: { in: PUBLIC_TENANT_STATUSES },
      },
      select: { id: true },
    });

    return tenant ? { tenantId: tenant.id, source: 'subdomain' } : null;
  }
}
