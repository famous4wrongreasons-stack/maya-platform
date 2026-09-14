import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { QuotaResource } from './quota-resource';

const STAFF_MEMBERSHIP_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.ACCOUNTANT,
  UserRole.TENANT_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.STAFF,
];

const BASIC_BRANDING_FIELDS = new Set(['appName', 'logoUrl']);

export interface TenantQuotaUsage {
  tenantId: string;
  plan: string;
  branches: { current: number; limit: number };
  staff: { current: number; limit: number };
  isWhiteLabelEnabled: boolean;
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getUsage(tenantId: string): Promise<TenantQuotaUsage> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scopedTenantId },
      select: {
        id: true,
        status: true,
        trialFullAccess: true,
        trialEndsAt: true,
        plan: {
          select: {
            name: true,
            maxBranches: true,
            maxStaff: true,
            isWhiteLabelEnabled: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (!tenant.plan) {
      throw new ConflictException({
        message: 'A subscription plan is required before creating resources.',
        error: { code: 'subscription_plan_required' },
      });
    }

    const [branches, membershipStaff, independentProviders, pendingCrmStaff] =
      await Promise.all([
        this.prisma.branch.count({ where: { tenantId: scopedTenantId } }),
        this.prisma.membership.count({
          where: {
            tenantId: scopedTenantId,
            status: 'active',
            role: { in: STAFF_MEMBERSHIP_ROLES },
          },
        }),
        this.prisma.internalProvider.count({
          where: {
            tenantId: scopedTenantId,
            active: true,
            userId: null,
          },
        }),
        this.prisma.crmStaffAccess.count({
          where: {
            tenantId: scopedTenantId,
            status: 'pending_contact',
            userId: null,
          },
        }),
      ]);

    return {
      tenantId: tenant.id,
      plan: tenant.plan.name,
      branches: { current: branches, limit: tenant.plan.maxBranches },
      staff: {
        current: membershipStaff + independentProviders + pendingCrmStaff,
        limit: tenant.plan.maxStaff,
      },
      isWhiteLabelEnabled:
        tenant.plan.isWhiteLabelEnabled || this.isFullAccessTrial(tenant),
    };
  }

  async assertCanCreate(
    tenantId: string,
    resource: QuotaResource,
    amount = 1,
  ): Promise<void> {
    const usage = await this.getUsage(tenantId);
    const quota = usage[resource];

    if (amount > 0 && quota.current + amount <= quota.limit) {
      return;
    }

    throw new ConflictException({
      message: `The ${resource} limit for this subscription plan has been reached.`,
      error: {
        code: 'quota_exceeded',
        resource,
        current: quota.current,
        requested: amount,
        limit: quota.limit,
        plan: usage.plan,
        upgrade_required: true,
      },
    });
  }

  async assertCustomBrandingAllowed(
    tenantId: string,
    fields: readonly string[],
  ): Promise<void> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (fields.every((field) => BASIC_BRANDING_FIELDS.has(field))) {
      return;
    }

    const usage = await this.getUsage(scopedTenantId);
    if (usage.isWhiteLabelEnabled) {
      return;
    }

    throw new ForbiddenException({
      message: 'Custom white-label branding requires business_plus.',
      error: {
        code: 'white_label_locked',
        plan: usage.plan,
        required_plan: 'business_plus',
      },
    });
  }

  private isFullAccessTrial(tenant: {
    status: string;
    trialFullAccess: boolean;
    trialEndsAt: Date | null;
  }): boolean {
    return (
      tenant.status === 'trial' &&
      tenant.trialFullAccess &&
      Boolean(tenant.trialEndsAt) &&
      tenant.trialEndsAt!.getTime() > Date.now()
    );
  }
}
