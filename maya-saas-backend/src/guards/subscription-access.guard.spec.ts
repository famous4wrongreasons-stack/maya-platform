import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantAccessStateService } from '../tenants/tenant-access-state.service';
import { SubscriptionAccessGuard } from './subscription-access.guard';

describe('SubscriptionAccessGuard', () => {
  const user: AuthenticatedUser = {
    userId: 'owner-1',
    sessionId: 'session-1',
    tenantId: 'tenant-1',
    role: UserRole.TENANT_ADMIN,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-1',
    membershipStatus: 'active',
  };

  function createContext(): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => createContext,
      getClass: () => SubscriptionAccessGuard,
    } as unknown as ExecutionContext;
  }

  it('returns a machine-readable 402 after grace expiry', async () => {
    const tenantContext = new TenantContextService();
    const accessStateService = {
      getAndSync: jest.fn().mockResolvedValue({
        subscriptionRequired: true,
        trialEndsAt: new Date('2026-07-23T12:00:00.000Z'),
        pastDueAt: new Date('2026-07-23T12:00:00.000Z'),
        graceEndsAt: new Date('2026-07-26T12:00:00.000Z'),
      }),
    };
    const guard = new SubscriptionAccessGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector,
      tenantContext,
      accessStateService as unknown as TenantAccessStateService,
    );

    const promise = tenantContext.runAsSystemTenant('tenant-1', () =>
      guard.canActivate(createContext()),
    );

    await expect(promise).rejects.toMatchObject<HttpException>({
      status: 402,
      response: {
        error: {
          code: 'subscription_required',
          past_due_at: new Date('2026-07-23T12:00:00.000Z'),
          grace_ended_at: new Date('2026-07-26T12:00:00.000Z'),
          plans_path: '/api/billing/plans',
        },
      },
    });
  });

  it('allows commercial routes while the grace window is active', async () => {
    const tenantContext = new TenantContextService();
    const guard = new SubscriptionAccessGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector,
      tenantContext,
      {
        getAndSync: jest.fn().mockResolvedValue({
          accessState: 'past_due_grace',
          subscriptionRequired: false,
          pastDueAt: new Date('2026-07-23T12:00:00.000Z'),
          graceEndsAt: new Date('2026-07-26T12:00:00.000Z'),
        }),
      } as unknown as TenantAccessStateService,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        guard.canActivate(createContext()),
      ),
    ).resolves.toBe(true);
  });

  it('allows explicitly marked billing routes through the paywall fence', async () => {
    const tenantContext = new TenantContextService();
    const guard = new SubscriptionAccessGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(true),
      } as unknown as Reflector,
      tenantContext,
      {
        getAndSync: jest.fn().mockResolvedValue({
          subscriptionRequired: true,
          trialEndsAt: new Date(),
        }),
      } as unknown as TenantAccessStateService,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        guard.canActivate(createContext()),
      ),
    ).resolves.toBe(true);
  });
});
