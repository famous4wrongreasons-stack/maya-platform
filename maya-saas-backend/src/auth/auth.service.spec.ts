import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/domain.enums';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

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

type PhoneAuthUpsertArgs = {
  where: {
    tenantId_phone: {
      tenantId: string;
      phone: string;
    };
  };
  update: {
    codeHash: string;
    attempts: number;
    expiresAt: Date;
    consumedAt: Date | null;
  };
  create: {
    tenantId: string;
    phone: string;
    codeHash: string;
    expiresAt: Date;
  };
};

type PhoneAuthUpdateArgs = {
  where: {
    id: string;
  };
  data: {
    attempts?: number;
    consumedAt?: Date;
  };
};

type CreatePhoneFirstClientUserArgs = {
  tenantId: string;
  tenantSlug: string;
  branchId?: string | null;
  phone: string;
  passwordHash: string;
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
      (args: PhoneAuthUpsertArgs) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const phoneAuthFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<PhoneAuthChallenge | null>
    > = jest.fn().mockResolvedValue(null);
    const phoneAuthUpdateMock: jest.MockedFunction<
      (args: PhoneAuthUpdateArgs) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
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

    const configService: Pick<ConfigService, 'get'> = {
      get: configGetMock,
    };
    const jwtService: Pick<JwtService, 'signAsync'> = {
      signAsync: signAsyncMock,
    };
    const prisma: Pick<PrismaService, 'phoneAuthCode'> = {
      phoneAuthCode: {
        upsert: phoneAuthUpsertMock,
        findUnique: phoneAuthFindUniqueMock,
        update: phoneAuthUpdateMock,
      } as PrismaService['phoneAuthCode'],
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

    return {
      service: new AuthService(
        configService as ConfigService,
        jwtService as JwtService,
        prisma as PrismaService,
        usersService as UsersService,
        tenantsService as TenantsService,
      ),
      mocks: {
        assertBranchBelongsToTenantMock,
        createPhoneFirstClientUserMock,
        createUserMock,
        ensureEmailIsAvailableMock,
        ensurePhoneIsAvailableMock,
        findPlatformOwnerByEmailMock,
        findTenantUserByEmailMock,
        findTenantUserByPhoneMock,
        getTenantBySlugOrThrowMock,
        phoneAuthFindUniqueMock,
        phoneAuthUpdateMock,
        phoneAuthUpsertMock,
        serializeUserMock,
        signAsyncMock,
      },
    };
  };

  it('starts phone auth in debug mode and persists a challenge', async () => {
    const {
      service,
      mocks: { findTenantUserByPhoneMock, phoneAuthUpsertMock },
    } = createService();

    findTenantUserByPhoneMock.mockResolvedValue(null);

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
    expect(upsertArgs?.where).toEqual({
      tenantId_phone: {
        tenantId: tenant.id,
        phone,
      },
    });
    expect(upsertArgs?.update.codeHash).toBe(expectedCodeHash);
    expect(upsertArgs?.update.attempts).toBe(0);
    expect(upsertArgs?.update.consumedAt).toBeNull();
    expect(upsertArgs?.update.expiresAt).toBeInstanceOf(Date);
    expect(upsertArgs?.create).toMatchObject({
      tenantId: tenant.id,
      phone,
      codeHash: expectedCodeHash,
    });
    expect(upsertArgs?.create.expiresAt).toBeInstanceOf(Date);
  });

  it('verifies a correct phone code, creates a client user, and returns a JWT', async () => {
    const {
      service,
      mocks: {
        assertBranchBelongsToTenantMock,
        createPhoneFirstClientUserMock,
        findTenantUserByPhoneMock,
        phoneAuthFindUniqueMock,
        phoneAuthUpdateMock,
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
    const updateArgs = phoneAuthUpdateMock.mock.calls[0]?.[0];

    expect(createUserArgs).toBeDefined();
    expect(createUserArgs).toMatchObject({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      branchId: 'branch-1',
      phone,
    });
    expect(createUserArgs?.passwordHash).toEqual(expect.any(String));
    expect(updateArgs).toBeDefined();
    expect(updateArgs?.where).toEqual({ id: 'challenge-1' });
    expect(updateArgs?.data.consumedAt).toBeInstanceOf(Date);
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
});
