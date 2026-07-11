import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  PhoneAuthDeliveryResult,
  PhoneAuthDeliveryService,
} from './phone-auth-delivery.service';
import { TenantAuthRepository } from './tenant-auth.repository';

type TenantRecord = {
  id: string;
  slug: string;
  status: string;
  allowSelfRegistration: boolean;
};

type BranchRecord = {
  id: string;
  name: string;
};

type UserRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  phone: string;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  tenant: TenantRecord;
  branch: BranchRecord | null;
};

type PhoneAuthChallenge = {
  id: string;
  tenantId: string;
  phone: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

type CreatePhoneFirstClientUserArgs = {
  tenantId: string;
  tenantSlug: string;
  branchId?: string | null;
  phone: string;
  passwordHash: string;
};

type DeliverPhoneAuthCodeArgs = {
  phone: string;
  code: string;
  clientIp?: string | null;
};

describe('AuthService phone auth', () => {
  const tenant: TenantRecord = {
    id: 'tenant-1',
    slug: 'demo-salon',
    status: 'active',
    allowSelfRegistration: true,
  };
  const phone = '+79990000000';

  const createService = () => {
    const configMap: Record<string, string> = {
      NODE_ENV: 'test',
      PHONE_AUTH_FIXED_CODE: '123456',
      JWT_SECRET: 'jwt-secret',
    };

    const configGetMock: jest.MockedFunction<
      (key: string) => string | undefined
    > = jest.fn((key: string) => configMap[key]);
    const signAsyncMock: jest.MockedFunction<
      (payload: Record<string, string | null>) => Promise<string>
    > = jest.fn().mockResolvedValue('jwt-token');
    const phoneAuthUpsertMock: jest.MockedFunction<
      (args: {
        phone: string;
        codeHash: string;
        expiresAt: Date;
      }) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const phoneAuthFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<PhoneAuthChallenge | null>
    > = jest.fn().mockResolvedValue(null);
    const phoneAuthInvalidAttemptMock: jest.MockedFunction<
      (
        id: string,
        codeHash: string,
        attemptedAt: Date,
        maxAttempts: number,
      ) => Promise<number | null>
    > = jest.fn().mockResolvedValue(1);
    const phoneAuthClaimMock: jest.MockedFunction<
      (id: string, codeHash: string, consumedAt: Date) => Promise<boolean>
    > = jest.fn().mockResolvedValue(true);
    const findTenantUserByPhoneMock: jest.MockedFunction<
      (tenantId: string, userPhone: string) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const findTenantUserByEmailMock: jest.MockedFunction<
      (tenantId: string, email: string) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const findPlatformOwnerByEmailMock: jest.MockedFunction<
      (email: string) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const createPhoneFirstClientUserMock: jest.MockedFunction<
      (args: CreatePhoneFirstClientUserArgs) => Promise<UserRecord>
    > = jest.fn();
    const ensureEmailIsAvailableMock: jest.MockedFunction<
      (tenantId: string | null, email: string) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const ensurePhoneIsAvailableMock: jest.MockedFunction<
      (tenantId: string | null, phone: string) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const createUserMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord>
    > = jest.fn();
    const serializeUserMock: jest.MockedFunction<
      (user: UserRecord) => UserRecord
    > = jest.fn((user: UserRecord) => user);
    const getTenantBySlugOrThrowMock: jest.MockedFunction<
      (slug: string) => Promise<TenantRecord>
    > = jest.fn().mockResolvedValue(tenant);
    const assertBranchBelongsToTenantMock: jest.MockedFunction<
      (branchId: string, tenantId: string) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const deliverCodeMock: jest.MockedFunction<
      (params: DeliverPhoneAuthCodeArgs) => Promise<PhoneAuthDeliveryResult>
    > = jest.fn().mockResolvedValue({
      delivery: 'debug',
      debug_code: '123456',
    });

    const configService: Pick<ConfigService, 'get'> = {
      get: configGetMock,
    };
    const jwtService: Pick<JwtService, 'signAsync'> = {
      signAsync: signAsyncMock,
    };
    const tenantContext = new TenantContextService();
    const authRepository: Pick<
      TenantAuthRepository,
      | 'claimPhoneChallenge'
      | 'findPhoneChallenge'
      | 'recordInvalidPhoneAttempt'
      | 'upsertPhoneChallenge'
    > = {
      claimPhoneChallenge: phoneAuthClaimMock,
      findPhoneChallenge: phoneAuthFindUniqueMock,
      recordInvalidPhoneAttempt: phoneAuthInvalidAttemptMock,
      upsertPhoneChallenge: phoneAuthUpsertMock,
    };
    const usersService: Pick<
      UsersService,
      | 'findTenantUserByPhone'
      | 'findTenantUserByEmail'
      | 'findPlatformOwnerByEmail'
      | 'ensureEmailIsAvailable'
      | 'ensurePhoneIsAvailable'
      | 'createUser'
      | 'createPhoneFirstClientUser'
      | 'serializeUser'
    > = {
      findTenantUserByPhone: findTenantUserByPhoneMock,
      findTenantUserByEmail: findTenantUserByEmailMock,
      findPlatformOwnerByEmail: findPlatformOwnerByEmailMock,
      ensureEmailIsAvailable: ensureEmailIsAvailableMock,
      ensurePhoneIsAvailable: ensurePhoneIsAvailableMock,
      createUser: createUserMock,
      createPhoneFirstClientUser: createPhoneFirstClientUserMock,
      serializeUser: serializeUserMock,
    };
    const tenantsService: Pick<
      TenantsService,
      'getTenantBySlugOrThrow' | 'assertBranchBelongsToTenant'
    > = {
      getTenantBySlugOrThrow: getTenantBySlugOrThrowMock,
      assertBranchBelongsToTenant: assertBranchBelongsToTenantMock,
    };
    const phoneAuthDeliveryService: Pick<
      PhoneAuthDeliveryService,
      'deliverCode'
    > = {
      deliverCode: deliverCodeMock,
    };

    return {
      service: new AuthService(
        configService as ConfigService,
        jwtService as JwtService,
        usersService as UsersService,
        tenantsService as TenantsService,
        phoneAuthDeliveryService as PhoneAuthDeliveryService,
        tenantContext,
        authRepository as TenantAuthRepository,
      ),
      tenantContext,
      mocks: {
        assertBranchBelongsToTenantMock,
        createPhoneFirstClientUserMock,
        createUserMock,
        deliverCodeMock,
        ensureEmailIsAvailableMock,
        ensurePhoneIsAvailableMock,
        findPlatformOwnerByEmailMock,
        findTenantUserByEmailMock,
        findTenantUserByPhoneMock,
        getTenantBySlugOrThrowMock,
        phoneAuthFindUniqueMock,
        phoneAuthClaimMock,
        phoneAuthInvalidAttemptMock,
        phoneAuthUpsertMock,
        serializeUserMock,
        signAsyncMock,
      },
    };
  };

  it('starts phone auth in debug mode and persists a challenge', async () => {
    const {
      service,
      tenantContext,
      mocks: {
        deliverCodeMock,
        findTenantUserByPhoneMock,
        phoneAuthUpsertMock,
      },
    } = createService();

    findTenantUserByPhoneMock.mockResolvedValue(null);
    phoneAuthUpsertMock.mockImplementation(() => {
      expect(tenantContext.requireTenantId()).toBe(tenant.id);
      return Promise.resolve();
    });

    const result = await service.startPhoneAuth({
      tenantSlug: tenant.slug,
      phone: '8 (999) 000-00-00',
    });

    const expectedCodeHash = createHash('sha256')
      .update(`jwt-secret:${tenant.id}:${phone}:123456`)
      .digest('hex');

    expect(result).toMatchObject({
      ok: true,
      tenant_slug: tenant.slug,
      phone,
      delivery: 'debug',
      retry_after_seconds: 60,
      user_exists: false,
      next_step: 'verify_code',
      debug_code: '123456',
    });
    const upsertArgs = phoneAuthUpsertMock.mock.calls[0]?.[0];

    expect(upsertArgs).toBeDefined();
    expect(upsertArgs).toMatchObject({
      phone,
      codeHash: expectedCodeHash,
    });
    expect(upsertArgs?.expiresAt).toBeInstanceOf(Date);
    expect(deliverCodeMock).toHaveBeenCalledWith({
      phone,
      code: '123456',
      clientIp: undefined,
    });
    expect(tenantContext.get()).toBeUndefined();
  });

  it('rejects a body tenant that conflicts with the resolved domain', async () => {
    const {
      service,
      tenantContext,
      mocks: { phoneAuthUpsertMock },
    } = createService();

    await expect(
      tenantContext.run('request-domain', async () => {
        tenantContext.setResolvedTenant({
          tenantId: 'tenant-domain',
          userId: null,
          membershipId: null,
          role: null,
          source: 'custom_domain',
        });

        return service.startPhoneAuth({
          tenantSlug: tenant.slug,
          phone,
        });
      }),
    ).rejects.toThrow('Conflicting tenant resolution signals');
    expect(phoneAuthUpsertMock).not.toHaveBeenCalled();
  });

  it('starts phone auth with sms delivery and does not expose debug_code', async () => {
    const {
      service,
      mocks: { deliverCodeMock, findTenantUserByPhoneMock },
    } = createService();

    deliverCodeMock.mockResolvedValue({
      delivery: 'sms',
    });
    findTenantUserByPhoneMock.mockResolvedValue(null);

    const result = await service.startPhoneAuth(
      {
        tenantSlug: tenant.slug,
        phone: '+7 (999) 000-00-00',
      },
      '203.0.113.15',
    );

    expect(deliverCodeMock).toHaveBeenCalledWith({
      phone,
      code: '123456',
      clientIp: '203.0.113.15',
    });
    expect(result).toMatchObject({
      ok: true,
      tenant_slug: tenant.slug,
      phone,
      delivery: 'sms',
      retry_after_seconds: 60,
      user_exists: false,
      next_step: 'verify_code',
    });
    expect(result).not.toHaveProperty('debug_code');
  });

  it('verifies a correct phone code, creates a client user, and returns a JWT', async () => {
    const {
      service,
      mocks: {
        assertBranchBelongsToTenantMock,
        createPhoneFirstClientUserMock,
        findTenantUserByPhoneMock,
        phoneAuthClaimMock,
        phoneAuthFindUniqueMock,
        serializeUserMock,
        signAsyncMock,
      },
    } = createService();

    const codeHash = createHash('sha256')
      .update(`jwt-secret:${tenant.id}:${phone}:123456`)
      .digest('hex');
    const createdUser: UserRecord = {
      id: 'user-1',
      tenantId: tenant.id,
      branchId: 'branch-1',
      email: 'phone-79990000000@demo-salon.client.local',
      phone,
      passwordHash: 'hash',
      role: 'client',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant,
      branch: { id: 'branch-1', name: 'Main Branch' },
    };

    phoneAuthFindUniqueMock.mockResolvedValue({
      id: 'challenge-1',
      tenantId: tenant.id,
      phone,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    findTenantUserByPhoneMock.mockResolvedValue(null);
    createPhoneFirstClientUserMock.mockResolvedValue(createdUser);

    const result = await service.verifyPhoneAuth({
      tenantSlug: tenant.slug,
      phone,
      code: '123456',
      branchId: 'branch-1',
    });

    expect(assertBranchBelongsToTenantMock).toHaveBeenCalledWith(
      'branch-1',
      tenant.id,
    );
    const createUserArgs = createPhoneFirstClientUserMock.mock.calls[0]?.[0];
    const claimArgs = phoneAuthClaimMock.mock.calls[0];

    expect(createUserArgs).toBeDefined();
    expect(createUserArgs).toMatchObject({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      branchId: 'branch-1',
      phone,
    });
    expect(createUserArgs?.passwordHash).toEqual(expect.any(String));
    expect(claimArgs?.[0]).toBe('challenge-1');
    expect(claimArgs?.[1]).toBe(codeHash);
    expect(claimArgs?.[2]).toBeInstanceOf(Date);
    expect(signAsyncMock).toHaveBeenCalledWith({
      user_id: createdUser.id,
      tenant_id: createdUser.tenantId,
      role: createdUser.role,
    });
    expect(serializeUserMock).toHaveBeenCalledWith(createdUser);
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      user: createdUser,
      is_new_user: true,
    });
  });

  it('atomically records an invalid phone code attempt', async () => {
    const {
      service,
      mocks: {
        phoneAuthFindUniqueMock,
        phoneAuthInvalidAttemptMock,
        phoneAuthClaimMock,
      },
    } = createService();
    const codeHash = createHash('sha256')
      .update(`jwt-secret:${tenant.id}:${phone}:123456`)
      .digest('hex');
    phoneAuthFindUniqueMock.mockResolvedValue({
      id: 'challenge-invalid',
      tenantId: tenant.id,
      phone,
      codeHash,
      attempts: 1,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    phoneAuthInvalidAttemptMock.mockResolvedValue(2);

    await expect(
      service.verifyPhoneAuth({
        tenantSlug: tenant.slug,
        phone,
        code: '000000',
      }),
    ).rejects.toMatchObject<BadRequestException>({
      response: {
        error: {
          code: 'code_invalid',
          remaining_attempts: 3,
        },
      },
    });
    expect(phoneAuthInvalidAttemptMock).toHaveBeenCalledWith(
      'challenge-invalid',
      codeHash,
      expect.any(Date),
      5,
    );
    expect(phoneAuthClaimMock).not.toHaveBeenCalled();
  });

  it('rejects a concurrently consumed phone challenge before user creation', async () => {
    const {
      service,
      mocks: {
        createPhoneFirstClientUserMock,
        phoneAuthClaimMock,
        phoneAuthFindUniqueMock,
        signAsyncMock,
      },
    } = createService();
    const codeHash = createHash('sha256')
      .update(`jwt-secret:${tenant.id}:${phone}:123456`)
      .digest('hex');
    phoneAuthFindUniqueMock.mockResolvedValue({
      id: 'challenge-consumed',
      tenantId: tenant.id,
      phone,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    phoneAuthClaimMock.mockResolvedValue(false);

    await expect(
      service.verifyPhoneAuth({
        tenantSlug: tenant.slug,
        phone,
        code: '123456',
      }),
    ).rejects.toThrow(
      'Start phone auth again to request a new verification code.',
    );
    expect(createPhoneFirstClientUserMock).not.toHaveBeenCalled();
    expect(signAsyncMock).not.toHaveBeenCalled();
  });

  it('allows tenant admin login for a trial tenant', async () => {
    const trialTenant: TenantRecord = {
      ...tenant,
      status: 'trial',
    };
    const password = 'StrongPass123';
    const {
      service,
      mocks: {
        findTenantUserByEmailMock,
        getTenantBySlugOrThrowMock,
        serializeUserMock,
        signAsyncMock,
      },
    } = createService();
    const adminUser: UserRecord = {
      id: 'user-admin-1',
      tenantId: trialTenant.id,
      branchId: null,
      email: 'owner@barhat.ru',
      phone: '+79991111111',
      passwordHash: await bcrypt.hash(password, 4),
      role: UserRole.TENANT_ADMIN,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: trialTenant,
      branch: null,
    };

    getTenantBySlugOrThrowMock.mockResolvedValue(trialTenant);
    findTenantUserByEmailMock.mockResolvedValue(adminUser);

    const result = await service.login({
      tenantSlug: trialTenant.slug,
      email: adminUser.email,
      password,
    });

    expect(findTenantUserByEmailMock).toHaveBeenCalledWith(
      trialTenant.id,
      adminUser.email,
    );
    expect(signAsyncMock).toHaveBeenCalledWith({
      user_id: adminUser.id,
      tenant_id: adminUser.tenantId,
      role: adminUser.role,
    });
    expect(serializeUserMock).toHaveBeenCalledWith(adminUser);
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      user: adminUser,
    });
  });

  it('still blocks client password login for a trial tenant', async () => {
    const trialTenant: TenantRecord = {
      ...tenant,
      status: 'trial',
    };
    const password = 'StrongPass123';
    const {
      service,
      mocks: { findTenantUserByEmailMock, getTenantBySlugOrThrowMock },
    } = createService();
    const clientUser: UserRecord = {
      id: 'user-client-1',
      tenantId: trialTenant.id,
      branchId: null,
      email: 'client@barhat.ru',
      phone: '+79992222222',
      passwordHash: await bcrypt.hash(password, 4),
      role: UserRole.CLIENT,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: trialTenant,
      branch: null,
    };

    getTenantBySlugOrThrowMock.mockResolvedValue(trialTenant);
    findTenantUserByEmailMock.mockResolvedValue(clientUser);

    await expect(
      service.login({
        tenantSlug: trialTenant.slug,
        email: clientUser.email,
        password,
      }),
    ).rejects.toThrow('Tenant is not accepting client access');
  });

  it('blocks client register for a trial tenant with a machine-readable code', async () => {
    const trialTenant: TenantRecord = {
      ...tenant,
      status: 'trial',
    };
    const {
      service,
      mocks: { createUserMock, getTenantBySlugOrThrowMock },
    } = createService();

    getTenantBySlugOrThrowMock.mockResolvedValue(trialTenant);

    await expect(
      service.register({
        tenantSlug: trialTenant.slug,
        email: 'client@barhat.ru',
        password: 'StrongPass123',
      }),
    ).rejects.toMatchObject<ForbiddenException>({
      response: {
        error: {
          code: 'trial_client_registration_disabled',
        },
      },
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('blocks new phone-first client registration for a trial tenant', async () => {
    const trialTenant: TenantRecord = {
      ...tenant,
      status: 'trial',
    };
    const {
      service,
      mocks: {
        findTenantUserByPhoneMock,
        getTenantBySlugOrThrowMock,
        phoneAuthUpsertMock,
      },
    } = createService();

    getTenantBySlugOrThrowMock.mockResolvedValue(trialTenant);
    findTenantUserByPhoneMock.mockResolvedValue(null);

    await expect(
      service.startPhoneAuth({
        tenantSlug: trialTenant.slug,
        phone: '+79990000000',
      }),
    ).rejects.toMatchObject<ForbiddenException>({
      response: {
        error: {
          code: 'trial_client_registration_disabled',
        },
      },
    });
    expect(phoneAuthUpsertMock).not.toHaveBeenCalled();
  });

  it('blocks an existing client from starting phone login in a trial tenant', async () => {
    const trialTenant: TenantRecord = {
      ...tenant,
      status: 'trial',
    };
    const {
      service,
      mocks: {
        findTenantUserByPhoneMock,
        getTenantBySlugOrThrowMock,
        phoneAuthUpsertMock,
      },
    } = createService();
    const clientUser: UserRecord = {
      id: 'trial-client-phone',
      tenantId: trialTenant.id,
      branchId: null,
      email: 'trial-client@demo.local',
      phone,
      passwordHash: 'hash',
      role: UserRole.CLIENT,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: trialTenant,
      branch: null,
    };
    getTenantBySlugOrThrowMock.mockResolvedValue(trialTenant);
    findTenantUserByPhoneMock.mockResolvedValue(clientUser);

    await expect(
      service.startPhoneAuth({ tenantSlug: trialTenant.slug, phone }),
    ).rejects.toThrow('Tenant is not accepting client access');
    expect(phoneAuthUpsertMock).not.toHaveBeenCalled();
  });

  it('blocks a valid phone code if the client tenant changed to trial', async () => {
    const trialTenant: TenantRecord = {
      ...tenant,
      status: 'trial',
    };
    const {
      service,
      mocks: {
        findTenantUserByPhoneMock,
        getTenantBySlugOrThrowMock,
        phoneAuthClaimMock,
        phoneAuthFindUniqueMock,
      },
    } = createService();
    const codeHash = createHash('sha256')
      .update(`jwt-secret:${trialTenant.id}:${phone}:123456`)
      .digest('hex');
    phoneAuthFindUniqueMock.mockResolvedValue({
      id: 'trial-client-challenge',
      tenantId: trialTenant.id,
      phone,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    getTenantBySlugOrThrowMock.mockResolvedValue(trialTenant);
    findTenantUserByPhoneMock.mockResolvedValue({
      id: 'trial-client-phone',
      tenantId: trialTenant.id,
      branchId: null,
      email: 'trial-client@demo.local',
      phone,
      passwordHash: 'hash',
      role: UserRole.CLIENT,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: trialTenant,
      branch: null,
    });

    await expect(
      service.verifyPhoneAuth({
        tenantSlug: trialTenant.slug,
        phone,
        code: '123456',
      }),
    ).rejects.toThrow('Tenant is not accepting client access');
    expect(phoneAuthClaimMock).not.toHaveBeenCalled();
  });
});
