import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { UserRole } from '../common/domain.enums';
import { MembershipsService } from '../tenancy/memberships.service';
import { UsersService } from '../users/users.service';
import { AuthSessionService } from './auth-session.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy session validation', () => {
  const createStrategy = () => {
    const assertAccessSessionMock = jest.fn().mockResolvedValue({
      id: 'session-a',
    });
    const getUserOrThrowMock = jest.fn().mockResolvedValue({
      id: 'user-a',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      email: 'client@example.test',
      role: UserRole.CLIENT,
      status: 'active',
    });
    const getActiveMembershipMock = jest.fn().mockResolvedValue({
      id: 'membership-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
      status: 'active',
    });
    const strategy = new JwtStrategy(
      {
        get: jest.fn().mockReturnValue('jwt-secret'),
      } as unknown as ConfigService,
      { getUserOrThrow: getUserOrThrowMock } as unknown as UsersService,
      {
        getActiveMembership: getActiveMembershipMock,
      } as unknown as MembershipsService,
      {
        assertAccessSession: assertAccessSessionMock,
      } as unknown as AuthSessionService,
    );

    return {
      strategy,
      mocks: {
        assertAccessSessionMock,
        getActiveMembershipMock,
        getUserOrThrowMock,
      },
    };
  };

  it('requires an active server session before loading the tenant user', async () => {
    const { strategy, mocks } = createStrategy();

    const result = await strategy.validate({
      user_id: 'user-a',
      tenant_id: 'tenant-a',
      role: UserRole.CLIENT,
      session_id: 'session-a',
    });

    expect(mocks.assertAccessSessionMock).toHaveBeenCalledWith(
      'session-a',
      'user-a',
      'tenant-a',
    );
    expect(
      mocks.assertAccessSessionMock.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.getUserOrThrowMock.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({
      userId: 'user-a',
      sessionId: 'session-a',
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
    });
  });

  it('rejects a legacy JWT without a session id', async () => {
    const { strategy, mocks } = createStrategy();

    await expect(
      strategy.validate({
        user_id: 'user-a',
        tenant_id: 'tenant-a',
        role: UserRole.CLIENT,
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocks.getUserOrThrowMock).not.toHaveBeenCalled();
  });

  it('stops before user lookup when the session was revoked', async () => {
    const { strategy, mocks } = createStrategy();
    mocks.assertAccessSessionMock.mockRejectedValue(
      new UnauthorizedException('Session is not active'),
    );

    await expect(
      strategy.validate({
        user_id: 'user-a',
        tenant_id: 'tenant-a',
        role: UserRole.CLIENT,
        session_id: 'session-a',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mocks.getUserOrThrowMock).not.toHaveBeenCalled();
  });

  it('accepts a platform-owner session without a membership', async () => {
    const { strategy, mocks } = createStrategy();
    mocks.getUserOrThrowMock.mockResolvedValue({
      id: 'platform-owner',
      tenantId: null,
      branchId: null,
      email: 'owner@maya.local',
      role: UserRole.PLATFORM_OWNER,
      status: 'active',
    });

    const result = await strategy.validate({
      user_id: 'platform-owner',
      tenant_id: null,
      role: UserRole.PLATFORM_OWNER,
      session_id: 'platform-session',
    });

    expect(result).toMatchObject({
      userId: 'platform-owner',
      sessionId: 'platform-session',
      tenantId: null,
      role: UserRole.PLATFORM_OWNER,
    });
    expect(mocks.getActiveMembershipMock).not.toHaveBeenCalled();
  });
});
