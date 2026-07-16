import { createSign, generateKeyPairSync } from 'crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { SocialAuthService } from './social-auth.service';

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
  phone: string | null;
  encryptedName: string | null;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  tenant: TenantRecord | null;
  branch: BranchRecord | null;
};

type AuthFlowStateRecord = {
  id: string;
  state: string;
  provider: string;
  redirectUri: string;
  codeVerifier: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  tenant: TenantRecord;
};

type FetchResponseShape = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

describe('SocialAuthService', () => {
  const originalFetch = global.fetch;
  const tenant: TenantRecord = {
    id: 'tenant-1',
    slug: 'demo-salon',
    status: 'active',
    allowSelfRegistration: true,
  };

  const baseUser = (): UserRecord => ({
    id: 'user-1',
    tenantId: tenant.id,
    branchId: null,
    email: 'client@example.com',
    phone: '+79990000000',
    encryptedName: 'enc:Client',
    passwordHash: 'hash',
    role: UserRole.CLIENT,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    tenant,
    branch: null,
  });

  const createFetchResponse = (
    body: unknown,
    status = 200,
  ): FetchResponseShape => ({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  });

  const createService = (overrides?: {
    config?: Record<string, string | undefined>;
  }) => {
    const configMap: Record<string, string | undefined> = {
      JWT_SECRET: 'jwt-secret',
      AUTH_FLOW_STATE_TTL_SECONDS: '600',
      OAUTH_PROVIDER_TIMEOUT_MS: '15000',
      YANDEX_LOGIN_ENABLED: 'true',
      YANDEX_CLIENT_ID: 'yandex-client-id',
      YANDEX_CLIENT_SECRET: 'yandex-client-secret',
      TELEGRAM_LOGIN_ENABLED: 'true',
      TELEGRAM_CLIENT_ID: '123456789',
      TELEGRAM_CLIENT_SECRET: 'telegram-client-secret',
      TELEGRAM_JWKS_URL: 'https://oauth.telegram.org/.well-known/jwks.json',
      ...(overrides?.config ?? {}),
    };
    const configGetMock: jest.MockedFunction<
      (key: string) => string | undefined
    > = jest.fn((key: string) => configMap[key]);
    const authFlowStateCreateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const authFlowStateFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<AuthFlowStateRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const authFlowStateUpdateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const authIdentityFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(null);
    const authIdentityCreateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const authIdentityUpdateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const getTenantBySlugOrThrowMock: jest.MockedFunction<
      (slug: string) => Promise<TenantRecord>
    > = jest.fn().mockResolvedValue(tenant);
    const assertBranchBelongsToTenantMock: jest.MockedFunction<
      (branchId: string, tenantId: string) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const findTenantUserByPhoneMock: jest.MockedFunction<
      (tenantId: string, phone: string) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const findTenantUserByEmailMock: jest.MockedFunction<
      (tenantId: string, email: string) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const createUserMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord>
    > = jest.fn().mockResolvedValue(baseUser());
    const serializeUserMock: jest.MockedFunction<
      (user: UserRecord) => Record<string, unknown>
    > = jest.fn((user: UserRecord) => ({
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    }));
    const signAsyncMock: jest.MockedFunction<
      (payload: Record<string, string | null>) => Promise<string>
    > = jest.fn().mockResolvedValue('jwt-token');

    const configService: Pick<ConfigService, 'get'> = {
      get: configGetMock,
    };
    const prisma: Pick<PrismaService, 'authFlowState' | 'authIdentity'> = {
      authFlowState: {
        create: authFlowStateCreateMock,
        findUnique: authFlowStateFindUniqueMock,
        update: authFlowStateUpdateMock,
      } as PrismaService['authFlowState'],
      authIdentity: {
        create: authIdentityCreateMock,
        findUnique: authIdentityFindUniqueMock,
        update: authIdentityUpdateMock,
      } as PrismaService['authIdentity'],
    };
    const tenantsService: Pick<
      TenantsService,
      'assertBranchBelongsToTenant' | 'getTenantBySlugOrThrow'
    > = {
      getTenantBySlugOrThrow: getTenantBySlugOrThrowMock,
      assertBranchBelongsToTenant: assertBranchBelongsToTenantMock,
    };
    const usersService: Pick<
      UsersService,
      | 'createUser'
      | 'findTenantUserByEmail'
      | 'findTenantUserByPhone'
      | 'serializeUser'
    > = {
      createUser: createUserMock,
      findTenantUserByEmail: findTenantUserByEmailMock,
      findTenantUserByPhone: findTenantUserByPhoneMock,
      serializeUser: serializeUserMock,
    };
    const jwtService: Pick<JwtService, 'signAsync'> = {
      signAsync: signAsyncMock,
    };

    return {
      service: new SocialAuthService(
        configService as ConfigService,
        prisma as PrismaService,
        tenantsService as TenantsService,
        usersService as UsersService,
        jwtService as JwtService,
      ),
      mocks: {
        assertBranchBelongsToTenantMock,
        authFlowStateCreateMock,
        authFlowStateFindUniqueMock,
        authFlowStateUpdateMock,
        authIdentityCreateMock,
        authIdentityFindUniqueMock,
        authIdentityUpdateMock,
        createUserMock,
        findTenantUserByEmailMock,
        findTenantUserByPhoneMock,
        getTenantBySlugOrThrowMock,
        serializeUserMock,
        signAsyncMock,
      },
    };
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('starts Yandex login and returns an OAuth URL with PKCE', async () => {
    const {
      service,
      mocks: { authFlowStateCreateMock },
    } = createService();

    const result = await service.startYandexLogin({
      tenantSlug: tenant.slug,
      redirectUri: 'https://malesthetic.pro/app/oauth-callback.html',
    });

    expect(result).toMatchObject({
      ok: true,
      provider: 'yandex',
      tenant_slug: tenant.slug,
    });
    expect(result.auth_url).toContain('https://oauth.yandex.com/authorize');
    expect(result.auth_url).toContain('client_id=yandex-client-id');
    expect(result.auth_url).toContain('code_challenge_method=S256');
    expect(result.auth_url).toContain('optional_scope=login%3Adefault_phone');
    const createArgs = authFlowStateCreateMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };

    expect(createArgs.data.tenantId).toBe(tenant.id);
    expect(createArgs.data.provider).toBe('yandex');
    expect(createArgs.data.redirectUri).toBe(
      'https://malesthetic.pro/app/oauth-callback.html',
    );
    expect(createArgs.data.state).toEqual(expect.stringMatching(/^ya_/));
    expect(createArgs.data.codeVerifier).toEqual(expect.any(String));
    expect(createArgs.data.expiresAt).toBeInstanceOf(Date);
  });

  it('completes Yandex login, creates a new tenant user, and links the identity', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authFlowStateUpdateMock,
        authIdentityCreateMock,
        createUserMock,
        serializeUserMock,
        signAsyncMock,
      },
    } = createService();
    const createdUser = {
      ...baseUser(),
      email: 'ya-client@example.com',
      encryptedName: 'enc:Иван',
      phone: '+79990000000',
    };

    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-1',
      state: 'ya_state_1',
      provider: 'yandex',
      redirectUri: 'https://malesthetic.pro/app/oauth-callback.html',
      codeVerifier: 'code-verifier-1',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    createUserMock.mockResolvedValue(createdUser);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          access_token: 'ya-access-token',
          token_type: 'bearer',
        }),
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 'yandex-user-1',
          default_email: 'ya-client@example.com',
          real_name: 'Иван Клиент',
          default_phone: {
            number: '+7 (999) 000-00-00',
          },
        }),
      );

    const result = await service.completeYandexLogin({
      state: 'ya_state_1',
      code: 'oauth-code-1',
    });

    const createUserArgs = createUserMock.mock.calls[0]?.[0];
    const authIdentityArgs = authIdentityCreateMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    const authFlowUpdateArgs = authFlowStateUpdateMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      where: Record<string, unknown>;
    };

    expect(createUserArgs.tenantId).toBe(tenant.id);
    expect(createUserArgs.branchId).toBeNull();
    expect(createUserArgs.email).toBe('ya-client@example.com');
    expect(createUserArgs.phone).toBe('+79990000000');
    expect(createUserArgs.name).toBe('Иван Клиент');
    expect(createUserArgs.passwordHash).toEqual(expect.any(String));
    expect(createUserArgs.role).toBe(UserRole.CLIENT);
    expect(createUserArgs.status).toBe('active');
    expect(authIdentityArgs.data.tenantId).toBe(tenant.id);
    expect(authIdentityArgs.data.userId).toBe(createdUser.id);
    expect(authIdentityArgs.data.provider).toBe('yandex');
    expect(authIdentityArgs.data.providerUserId).toBe('yandex-user-1');
    expect(authIdentityArgs.data.email).toBe('ya-client@example.com');
    expect(authIdentityArgs.data.phone).toBe('+79990000000');
    expect(authIdentityArgs.data.profileJson).toEqual(expect.any(Object));
    expect(authFlowUpdateArgs.where).toEqual({ id: 'flow-1' });
    expect(authFlowUpdateArgs.data.consumedAt).toEqual(expect.any(Date));
    expect(signAsyncMock).toHaveBeenCalledWith({
      user_id: createdUser.id,
      tenant_id: createdUser.tenantId,
      role: createdUser.role,
    });
    expect(serializeUserMock).toHaveBeenCalledWith(createdUser);
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      is_new_user: true,
      provider: 'yandex',
    });
  });

  it('links Yandex identity to an existing tenant user by phone', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        createUserMock,
        findTenantUserByPhoneMock,
      },
    } = createService();

    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-1',
      state: 'ya_state_1',
      provider: 'yandex',
      redirectUri: 'https://malesthetic.pro/app/oauth-callback.html',
      codeVerifier: 'code-verifier-1',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    findTenantUserByPhoneMock.mockResolvedValue(baseUser());
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          access_token: 'ya-access-token',
          token_type: 'bearer',
        }),
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 'yandex-user-1',
          default_phone: {
            number: '+7 (999) 000-00-00',
          },
          real_name: 'Иван Клиент',
        }),
      );

    const result = await service.completeYandexLogin({
      state: 'ya_state_1',
      code: 'oauth-code-1',
    });

    expect(createUserMock).not.toHaveBeenCalled();
    const authIdentityArgs = authIdentityCreateMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };

    expect(authIdentityArgs.data.tenantId).toBe(tenant.id);
    expect(authIdentityArgs.data.userId).toBe('user-1');
    expect(authIdentityArgs.data.provider).toBe('yandex');
    expect(authIdentityArgs.data.providerUserId).toBe('yandex-user-1');
    expect(authIdentityArgs.data.email).toBeNull();
    expect(authIdentityArgs.data.phone).toBe('+79990000000');
    expect(authIdentityArgs.data.profileJson).toEqual(expect.any(Object));
    expect(result.is_new_user).toBe(false);
  });

  it('completes Telegram login after validating the signed ID token', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        createUserMock,
      },
    } = createService();
    const createdUser = {
      ...baseUser(),
      email: 'telegram-uid@example.com',
      phone: '+79995554433',
      encryptedName: 'enc:John Doe',
    };
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      kid: 'telegram-key-1',
      typ: 'JWT',
    };
    const payload = {
      iss: 'https://oauth.telegram.org',
      aud: '123456789',
      sub: 'tg-subject-1',
      id: 987654321,
      name: 'John Doe',
      phone_number: '79995554433',
      iat: now,
      exp: now + 3600,
    };
    const token = signJwt(privateKey, header, payload);

    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-telegram-1',
      state: 'te_state_1',
      provider: 'telegram',
      redirectUri: 'https://malesthetic.pro/app/oauth-callback.html',
      codeVerifier: 'telegram-code-verifier',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    createUserMock.mockResolvedValue(createdUser);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          access_token: 'telegram-access-token',
          id_token: token,
        }),
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          keys: [
            {
              ...jwk,
              kid: 'telegram-key-1',
              use: 'sig',
              alg: 'RS256',
            },
          ],
        }),
      );

    const result = await service.completeTelegramLogin({
      state: 'te_state_1',
      code: 'telegram-code-1',
    });

    const authIdentityArgs = authIdentityCreateMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };

    expect(authIdentityArgs.data.tenantId).toBe(tenant.id);
    expect(authIdentityArgs.data.userId).toBe(createdUser.id);
    expect(authIdentityArgs.data.provider).toBe('telegram');
    expect(authIdentityArgs.data.providerUserId).toBe('987654321');
    expect(authIdentityArgs.data.email).toBeNull();
    expect(authIdentityArgs.data.phone).toBe('+79995554433');
    expect(authIdentityArgs.data.profileJson).toEqual(expect.any(Object));
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      is_new_user: true,
      provider: 'telegram',
    });
  });
});

function signJwt(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signer = createSign('RSA-SHA256');

  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();

  return `${encodedHeader}.${encodedPayload}.${signer
    .sign(privateKey)
    .toString('base64url')}`;
}
