import { createSign, generateKeyPairSync } from 'crypto';

import { ConfigService } from '@nestjs/config';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthFlowSystemGateway } from './auth-flow-system.gateway';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { SocialAuthService } from './social-auth.service';
import { TenantAuthRepository } from './tenant-auth.repository';

type TenantRecord = {
  id: string;
  slug: string;
  status: string;
  allowSelfRegistration: boolean;
  trialFullAccess?: boolean;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  calendarSource?: string | null;
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

/** Ответ UsersService.findTenantIdentityByPhone — лукап личности без фильтра по статусу. */
type TenantIdentityLookup = {
  user: { id: string; phone: string };
  membershipRole: UserRole | null;
  membershipStatus: string | null;
  crmStaffAccess: { id: string; externalStaffId: string } | null;
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
      // Окружение всегда есть в бою: ConfigModule не поднимет приложение без
      // NODE_ENV. Мок обязан это отражать, иначе он проверяет несуществующее
      // состояние.
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt-secret',
      AUTH_FLOW_STATE_TTL_SECONDS: '600',
      OAUTH_PROVIDER_TIMEOUT_MS: '15000',
      OAUTH_ALLOWED_REDIRECT_URIS:
        'https://maya.example/oauth-callback.html,https://maya.example/api/auth/oauth/native/callback',
      OAUTH_NATIVE_REDIRECT_URI:
        'https://maya.example/api/auth/oauth/native/callback',
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
      (id: string, provider: string, consumedAt: Date) => Promise<boolean>
    > = jest.fn().mockResolvedValue(true);
    const authIdentityFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(null);
    const authIdentityCreateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const authIdentityUpdateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const authIdentityReassignMock: jest.MockedFunction<
      (id: string, args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const authIdentityListMock = jest.fn().mockResolvedValue([]);
    const getTenantBySlugOrThrowMock: jest.MockedFunction<
      (slug: string) => Promise<TenantRecord>
    > = jest.fn().mockResolvedValue(tenant);
    const getTenantByIdOrThrowMock: jest.MockedFunction<
      (id: string) => Promise<TenantRecord>
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
    // Лукап личности, игнорирующий статус membership: по умолчанию «в тенанте
    // такого номера нет», отдельные тесты подменяют на подавленного мастера.
    const findTenantIdentityByPhoneMock: jest.MockedFunction<
      (tenantId: string, phone: string) => Promise<TenantIdentityLookup | null>
    > = jest.fn().mockResolvedValue(null);
    const createUserMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord>
    > = jest.fn().mockResolvedValue(baseUser());
    const getTenantUserOrThrowMock = jest.fn().mockResolvedValue(baseUser());
    const serializeUserMock: jest.MockedFunction<
      (user: UserRecord) => Record<string, unknown>
    > = jest.fn((user: UserRecord) => ({
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    }));
    const serializeCurrentUserMock = jest.fn((user: UserRecord) =>
      Promise.resolve({
        ...serializeUserMock(user),
        staff_profile: { linked: false, source: null, title: null },
      }),
    );
    const attachVerifiedSocialPhoneMock = jest.fn(
      (_userId: string, _tenantId: string, phone: string) =>
        Promise.resolve({
          ...baseUser(),
          phone,
        }),
    );
    const issueSessionMock = jest.fn().mockResolvedValue({
      access_token: 'jwt-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_expires_at: new Date('2026-08-10T12:00:00.000Z'),
      session: { id: 'session-1' },
    });
    const rateLimitPreflightMock = jest.fn().mockResolvedValue(undefined);
    const rateLimitTenantMock = jest.fn().mockResolvedValue(undefined);

    const configService: Pick<ConfigService, 'get'> = {
      get: configGetMock,
    };
    const tenantContext = new TenantContextService();
    const authRepository = {
      createFlowState: authFlowStateCreateMock,
      claimFlowState: authFlowStateUpdateMock,
      createIdentity: authIdentityCreateMock,
      findIdentity: authIdentityFindUniqueMock,
      listIdentityProvidersForUser: authIdentityListMock,
      reassignIdentity: authIdentityReassignMock,
      updateIdentity: authIdentityUpdateMock,
    } as unknown as TenantAuthRepository;
    const flowSystemGateway = {
      findByState: authFlowStateFindUniqueMock,
    } as unknown as AuthFlowSystemGateway;
    const tenantsService: Pick<
      TenantsService,
      | 'assertBranchBelongsToTenant'
      | 'assertClientBookableBusiness'
      | 'getTenantByIdOrThrow'
      | 'getTenantBySlugOrThrow'
    > = {
      getTenantBySlugOrThrow: getTenantBySlugOrThrowMock,
      getTenantByIdOrThrow: getTenantByIdOrThrowMock,
      assertBranchBelongsToTenant: assertBranchBelongsToTenantMock,
      assertClientBookableBusiness: jest.fn(),
    };
    const usersService: Pick<
      UsersService,
      | 'createUser'
      | 'findTenantIdentityByPhone'
      | 'findTenantUserByEmail'
      | 'findTenantUserByPhone'
      | 'getTenantUserOrThrow'
      | 'attachVerifiedSocialPhone'
      | 'serializeCurrentUser'
      | 'serializeUser'
    > = {
      createUser: createUserMock,
      findTenantIdentityByPhone:
        findTenantIdentityByPhoneMock as unknown as UsersService['findTenantIdentityByPhone'],
      findTenantUserByEmail: findTenantUserByEmailMock,
      findTenantUserByPhone: findTenantUserByPhoneMock,
      getTenantUserOrThrow: getTenantUserOrThrowMock,
      attachVerifiedSocialPhone: attachVerifiedSocialPhoneMock,
      serializeCurrentUser: serializeCurrentUserMock,
      serializeUser: serializeUserMock,
    };
    return {
      service: new SocialAuthService(
        configService as ConfigService,
        tenantsService as TenantsService,
        usersService as UsersService,
        tenantContext,
        authRepository,
        flowSystemGateway,
        {
          assertPreflight: rateLimitPreflightMock,
          assertTenant: rateLimitTenantMock,
        } as unknown as AuthRateLimitService,
        { issueSession: issueSessionMock } as unknown as AuthSessionService,
      ),
      tenantContext,
      mocks: {
        assertBranchBelongsToTenantMock,
        authFlowStateCreateMock,
        authFlowStateFindUniqueMock,
        authFlowStateUpdateMock,
        authIdentityCreateMock,
        authIdentityFindUniqueMock,
        authIdentityListMock,
        authIdentityReassignMock,
        authIdentityUpdateMock,
        attachVerifiedSocialPhoneMock,
        createUserMock,
        findTenantIdentityByPhoneMock,
        findTenantUserByEmailMock,
        findTenantUserByPhoneMock,
        getTenantByIdOrThrowMock,
        getTenantBySlugOrThrowMock,
        getTenantUserOrThrowMock,
        rateLimitPreflightMock,
        rateLimitTenantMock,
        serializeUserMock,
        serializeCurrentUserMock,
        issueSessionMock,
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
      tenantContext,
      mocks: {
        authFlowStateCreateMock,
        rateLimitPreflightMock,
        rateLimitTenantMock,
      },
    } = createService();
    authFlowStateCreateMock.mockImplementation(() => {
      expect(tenantContext.requireTenantId()).toBe(tenant.id);
      return Promise.resolve();
    });

    const result = await service.startYandexLogin({
      tenantSlug: tenant.slug,
      redirectUri: 'https://maya.example/oauth-callback.html',
      platform: 'web',
    });

    expect(result).toMatchObject({
      ok: true,
      provider: 'yandex',
      tenant_slug: tenant.slug,
    });
    expect(result.auth_url).toContain('https://oauth.yandex.com/authorize');
    expect(result.auth_url).toContain('client_id=yandex-client-id');
    expect(result.auth_url).toContain('code_challenge_method=S256');
    expect(result.auth_url).toContain(
      'scope=login%3Ainfo+login%3Aemail+login%3Adefault_phone',
    );
    expect(result.auth_url).not.toContain('optional_scope=');
    const createArgs = authFlowStateCreateMock.mock.calls[0]?.[0];

    expect(createArgs.provider).toBe('yandex');
    expect(createArgs.redirectUri).toBe(
      'https://maya.example/oauth-callback.html',
    );
    expect(createArgs.state).toEqual(expect.stringMatching(/^ya_/));
    expect(createArgs.codeVerifier).toEqual(expect.any(String));
    expect(createArgs.expiresAt).toBeInstanceOf(Date);
    expect(rateLimitPreflightMock).toHaveBeenCalledWith('oauth_start', {
      clientIp: undefined,
    });
    expect(rateLimitTenantMock).toHaveBeenCalledWith('oauth_start', {
      tenantId: tenant.id,
    });
    expect(tenantContext.get()).toBeUndefined();
  });

  it('rejects an unlisted OAuth redirect before persisting flow state', async () => {
    const { service, mocks } = createService({
      config: {
        OAUTH_ALLOWED_REDIRECT_URIS: 'https://maya.example/oauth-callback.html',
      },
    });

    await expect(
      service.startYandexLogin({
        tenantSlug: tenant.slug,
        redirectUri: 'https://attacker.example/oauth-callback.html',
        platform: 'web',
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'social_redirect_invalid' },
      },
    });
    expect(mocks.authFlowStateCreateMock).not.toHaveBeenCalled();
    expect(mocks.rateLimitTenantMock).not.toHaveBeenCalled();
  });

  it('uses the server-owned neutral callback for native iOS login', async () => {
    const { service, mocks } = createService();

    const result = await service.startYandexLogin({
      tenantSlug: tenant.slug,
      platform: 'ios',
    });

    expect(result.auth_url).toContain(
      encodeURIComponent('https://maya.example/api/auth/oauth/native/callback'),
    );
    expect(mocks.authFlowStateCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'https://maya.example/api/auth/oauth/native/callback',
      }),
    );
  });

  it('fails closed when native social login has no neutral callback', async () => {
    const { service, mocks } = createService({
      config: {
        OAUTH_NATIVE_REDIRECT_URI: '',
      },
    });

    await expect(
      service.startYandexLogin({
        tenantSlug: tenant.slug,
        platform: 'ios',
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'social_native_callback_unavailable' },
      },
    });
    expect(mocks.authFlowStateCreateMock).not.toHaveBeenCalled();
  });

  it('returns only validated one-time provider fields to the native app', () => {
    const { service } = createService();

    expect(
      service.buildNativeCallbackUrl({
        code: 'one-time-code',
        state: 'ya_state_12345678',
      }),
    ).toBe(
      'mayaos://oauth-callback?state=ya_state_12345678&code=one-time-code',
    );
    expect(() =>
      service.buildNativeCallbackUrl({
        code: 'one-time-code',
        state: 'foreign_state',
      }),
    ).toThrow('The native social login callback is invalid');
  });

  it('allows an unlisted loopback redirect only in development', async () => {
    const { service, mocks } = createService({
      config: {
        NODE_ENV: 'development',
        OAUTH_ALLOWED_REDIRECT_URIS: '',
      },
    });

    await expect(
      service.startYandexLogin({
        tenantSlug: tenant.slug,
        redirectUri: 'http://127.0.0.1:8787/oauth-callback.html',
        platform: 'web',
      }),
    ).resolves.toMatchObject({
      ok: true,
      provider: 'yandex',
    });
    expect(mocks.authFlowStateCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'http://127.0.0.1:8787/oauth-callback.html',
      }),
    );
  });

  it('completes Yandex login, creates a new tenant user, and links the identity', async () => {
    const {
      service,
      tenantContext,
      mocks: {
        authFlowStateFindUniqueMock,
        authFlowStateUpdateMock,
        authIdentityCreateMock,
        createUserMock,
        rateLimitPreflightMock,
        rateLimitTenantMock,
        serializeUserMock,
        issueSessionMock,
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
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'code-verifier-1',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    authIdentityCreateMock.mockImplementation(() => {
      expect(tenantContext.requireTenantId()).toBe(tenant.id);
      return Promise.resolve();
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
    const authIdentityArgs = authIdentityCreateMock.mock.calls[0]?.[0];
    const authFlowUpdateArgs = authFlowStateUpdateMock.mock.calls[0];

    expect(createUserArgs.tenantId).toBe(tenant.id);
    expect(createUserArgs.branchId).toBeNull();
    expect(createUserArgs.email).toBe('ya-client@example.com');
    expect(createUserArgs.phone).toBe('+79990000000');
    expect(createUserArgs.name).toBe('Иван Клиент');
    expect(createUserArgs.passwordHash).toEqual(expect.any(String));
    expect(createUserArgs.role).toBe(UserRole.CLIENT);
    expect(createUserArgs.status).toBe('active');
    expect(authIdentityArgs.userId).toBe(createdUser.id);
    expect(authIdentityArgs.provider).toBe('yandex');
    expect(authIdentityArgs.providerUserId).toBe('yandex-user-1');
    expect(authIdentityArgs.email).toBe('ya-client@example.com');
    expect(authIdentityArgs.phone).toBe('+79990000000');
    expect(authIdentityArgs.profileJson).toEqual(expect.any(Object));
    expect(authFlowUpdateArgs?.[0]).toBe('flow-1');
    expect(authFlowUpdateArgs?.[1]).toBe('yandex');
    expect(authFlowUpdateArgs?.[2]).toBeInstanceOf(Date);
    expect(issueSessionMock).toHaveBeenCalledWith(createdUser, {});
    expect(rateLimitPreflightMock).toHaveBeenCalledWith('oauth_complete', {
      clientIp: undefined,
      identity: 'ya_state_1',
    });
    expect(rateLimitTenantMock).toHaveBeenCalledWith('oauth_complete', {
      tenantId: tenant.id,
      identity: 'ya_state_1',
    });
    expect(serializeUserMock).toHaveBeenCalledWith(createdUser);
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      is_new_user: true,
      provider: 'yandex',
    });
  });

  it.each<[string, TenantIdentityLookup]>([
    [
      'подавленного сверкой с CRM мастера',
      {
        user: { id: 'staff-1', phone: '+79990000000' },
        membershipRole: UserRole.STAFF,
        membershipStatus: 'suspended',
        crmStaffAccess: null,
      },
    ],
    [
      'сотрудника, у которого membership ещё не активирован',
      {
        user: { id: 'staff-2', phone: '+79990000000' },
        membershipRole: null,
        membershipStatus: 'invited',
        crmStaffAccess: { id: 'crm-1', externalStaffId: '4242' },
      },
    ],
  ])(
    'НЕ создаёт клиентский дубль для %s и отдаёт понятную ошибку',
    async (_label, identity) => {
      const {
        service,
        mocks: {
          authFlowStateFindUniqueMock,
          authIdentityCreateMock,
          createUserMock,
          findTenantIdentityByPhoneMock,
        },
      } = createService();

      // Активного membership нет → старый код проваливался в ветку создания и
      // заводил второй, параллельный client-аккаунт на тот же телефон.
      findTenantIdentityByPhoneMock.mockResolvedValue(identity);

      authFlowStateFindUniqueMock.mockResolvedValue({
        id: 'flow-1',
        state: 'ya_state_1',
        provider: 'yandex',
        redirectUri: 'https://maya.example/oauth-callback.html',
        codeVerifier: 'code-verifier-1',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        consumedAt: null,
        tenant,
      });
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
            real_name: 'Иван Мастер',
            // тот же номер, записанный в другом формате — сверка идёт по
            // phoneMatchKey, поэтому формат значения не имеет
            default_phone: { number: '8 (999) 000-00-00' },
          }),
        );

      await expect(
        service.completeYandexLogin({
          state: 'ya_state_1',
          code: 'oauth-code-1',
        }),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'social_business_access_suspended' },
        },
      });

      expect(createUserMock).not.toHaveBeenCalled();
      expect(authIdentityCreateMock).not.toHaveBeenCalled();
    },
  );

  const yandexFlow = () => ({
    id: 'flow-1',
    state: 'ya_state_1',
    provider: 'yandex',
    redirectUri: 'https://maya.example/oauth-callback.html',
    codeVerifier: 'code-verifier-1',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumedAt: null,
    tenant,
  });

  const yandexProfileFetch = (profile: Record<string, unknown>) =>
    jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({
          access_token: 'ya-access-token',
          token_type: 'bearer',
        }),
      )
      .mockResolvedValueOnce(createFetchResponse(profile));

  it('пускает владельца в свежий рабочий аккаунт по совпадению телефона', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        authIdentityListMock,
        findTenantUserByPhoneMock,
        findTenantUserByEmailMock,
      },
    } = createService();

    // Только что созданный бизнес: привязанных провайдеров ещё нет, а запасные
    // входы (код на почту/SMS) в окружении могут быть выключены. Запрет на
    // заявку по телефону здесь запирал бы самого владельца — рубеж стоит
    // дальше, на аккаунте с уже привязанным провайдером.
    findTenantUserByPhoneMock.mockResolvedValue({
      ...baseUser(),
      id: 'owner-1',
      role: UserRole.TENANT_ADMIN,
    });
    findTenantUserByEmailMock.mockResolvedValue(null);
    authIdentityListMock.mockResolvedValue([]);

    authFlowStateFindUniqueMock.mockResolvedValue(yandexFlow());
    global.fetch = yandexProfileFetch({
      id: 'yandex-owner',
      default_phone: { number: '8 (999) 000-00-00' },
      real_name: 'Владелец',
    });

    await service.completeYandexLogin({
      state: 'ya_state_1',
      code: 'oauth-code-1',
    });

    expect(authIdentityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', provider: 'yandex' }),
    );
  });

  it('НЕ отдаёт по телефону аккаунт, у которого провайдер уже привязан', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        authIdentityListMock,
        findTenantUserByPhoneMock,
        findTenantUserByEmailMock,
      },
    } = createService();

    findTenantUserByPhoneMock.mockResolvedValue({
      ...baseUser(),
      id: 'owner-1',
      role: UserRole.TENANT_ADMIN,
    });
    findTenantUserByEmailMock.mockResolvedValue(null);
    authIdentityListMock.mockResolvedValue([
      { provider: 'telegram', createdAt: new Date(), updatedAt: new Date() },
    ]);

    authFlowStateFindUniqueMock.mockResolvedValue(yandexFlow());
    global.fetch = yandexProfileFetch({
      id: 'yandex-stranger',
      default_phone: { number: '+7 (999) 000-00-00' },
      real_name: 'Чужой Человек',
    });

    await expect(
      service.completeYandexLogin({
        state: 'ya_state_1',
        code: 'oauth-code-1',
      }),
    ).rejects.toMatchObject({
      response: { error: { code: 'social_business_link_required' } },
    });

    expect(authIdentityCreateMock).not.toHaveBeenCalled();
  });

  it('пускает владельца в рабочий аккаунт по подтверждённой провайдером почте', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        authIdentityListMock,
        findTenantUserByPhoneMock,
        findTenantUserByEmailMock,
      },
    } = createService();

    // Почту подтверждает сам провайдер, и владелец обязан контролировать ящик
    // бизнеса — такой вход остаётся разрешённым.
    const owner = {
      ...baseUser(),
      id: 'owner-1',
      role: UserRole.TENANT_ADMIN,
    };
    findTenantUserByPhoneMock.mockResolvedValue(owner);
    findTenantUserByEmailMock.mockResolvedValue(owner);
    authIdentityListMock.mockResolvedValue([]);

    authFlowStateFindUniqueMock.mockResolvedValue(yandexFlow());
    global.fetch = yandexProfileFetch({
      id: 'yandex-owner',
      default_email: 'owner@salon.example',
      default_phone: { number: '8 (999) 000-00-00' },
      real_name: 'Владелец',
    });

    await service.completeYandexLogin({
      state: 'ya_state_1',
      code: 'oauth-code-1',
    });

    expect(authIdentityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', provider: 'yandex' }),
    );
  });

  it('не отдаёт по почте аккаунт, у которого провайдер уже привязан', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        authIdentityListMock,
        findTenantUserByPhoneMock,
        findTenantUserByEmailMock,
      },
    } = createService();

    const owner = {
      ...baseUser(),
      id: 'owner-1',
      role: UserRole.TENANT_ADMIN,
    };
    findTenantUserByPhoneMock.mockResolvedValue(owner);
    findTenantUserByEmailMock.mockResolvedValue(owner);
    authIdentityListMock.mockResolvedValue([
      { provider: 'telegram', createdAt: new Date(), updatedAt: new Date() },
    ]);

    authFlowStateFindUniqueMock.mockResolvedValue(yandexFlow());
    global.fetch = yandexProfileFetch({
      id: 'yandex-other',
      default_email: 'owner@salon.example',
      default_phone: { number: '8 (999) 000-00-00' },
      real_name: 'Кто-то ещё',
    });

    await expect(
      service.completeYandexLogin({
        state: 'ya_state_1',
        code: 'oauth-code-1',
      }),
    ).rejects.toMatchObject({
      response: { error: { code: 'social_business_link_required' } },
    });

    expect(authIdentityCreateMock).not.toHaveBeenCalled();
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
      redirectUri: 'https://maya.example/oauth-callback.html',
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
    const authIdentityArgs = authIdentityCreateMock.mock.calls[0]?.[0];

    expect(authIdentityArgs.userId).toBe('user-1');
    expect(authIdentityArgs.provider).toBe('yandex');
    expect(authIdentityArgs.providerUserId).toBe('yandex-user-1');
    expect(authIdentityArgs.email).toBeNull();
    expect(authIdentityArgs.phone).toBe('+79990000000');
    expect(authIdentityArgs.profileJson).toEqual(expect.any(Object));
    expect(result.is_new_user).toBe(false);
  });

  it('restores a business role when the social identity was previously linked to a client', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityFindUniqueMock,
        authIdentityReassignMock,
        findTenantUserByPhoneMock,
        getTenantUserOrThrowMock,
        issueSessionMock,
      },
    } = createService();
    const oldClient = { ...baseUser(), id: 'old-client-1' };
    const owner = {
      ...baseUser(),
      id: 'owner-1',
      email: 'owner@example.com',
      role: UserRole.TENANT_OWNER,
    };

    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-owner-restore',
      state: 'ya_owner_restore',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'owner-restore-verifier',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    authIdentityFindUniqueMock.mockResolvedValue({
      id: 'identity-old-client',
      user: oldClient,
    });
    getTenantUserOrThrowMock.mockResolvedValue(oldClient);
    findTenantUserByPhoneMock.mockResolvedValue(owner);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({ access_token: 'ya-owner-access' }),
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 'yandex-owner-1',
          default_phone: { number: '+7 (999) 000-00-00' },
          real_name: 'Владелец',
        }),
      );

    const result = await service.completeYandexLogin({
      state: 'ya_owner_restore',
      code: 'oauth-owner-restore',
    });

    expect(authIdentityReassignMock).toHaveBeenCalledWith(
      'identity-old-client',
      expect.objectContaining({
        userId: owner.id,
        phone: '+79990000000',
      }),
    );
    expect(issueSessionMock).toHaveBeenCalledWith(owner, {});
    expect(result).toMatchObject({
      is_new_user: false,
      user: { id: owner.id, role: UserRole.TENANT_OWNER },
    });
  });

  it('links Yandex explicitly to the authenticated owner account', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        getTenantUserOrThrowMock,
        issueSessionMock,
      },
    } = createService();
    const owner = { ...baseUser(), id: 'owner-1', role: UserRole.TENANT_OWNER };
    const principal: AuthenticatedUser = {
      userId: owner.id,
      sessionId: 'session-owner',
      tenantId: tenant.id,
      role: UserRole.TENANT_OWNER,
      email: owner.email,
      branchId: null,
      membershipId: 'membership-owner',
      membershipStatus: 'active',
    };

    getTenantUserOrThrowMock.mockResolvedValue(owner);
    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-owner-link',
      state: 'ya_owner_link',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'owner-link-verifier',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({ access_token: 'ya-owner-access' }),
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 'yandex-owner-1',
          default_phone: { number: '+7 (999) 111-22-33' },
          real_name: 'Владелец',
        }),
      );

    const result = await service.completeYandexLink(
      { state: 'ya_owner_link', code: 'owner-link-code' },
      principal,
    );

    expect(authIdentityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: owner.id,
        provider: 'yandex',
        providerUserId: 'yandex-owner-1',
      }),
    );
    expect(issueSessionMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      linked: true,
      provider: 'yandex',
      transferred_from_client: false,
      user: { id: owner.id, role: UserRole.TENANT_OWNER },
    });
  });

  it('moves a social identity from a client profile to its authenticated owner', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        authIdentityFindUniqueMock,
        authIdentityReassignMock,
        getTenantUserOrThrowMock,
      },
    } = createService();
    const owner = { ...baseUser(), id: 'owner-1', role: UserRole.TENANT_OWNER };
    const oldClient = { ...baseUser(), id: 'old-client-1' };
    const principal: AuthenticatedUser = {
      userId: owner.id,
      sessionId: 'session-owner',
      tenantId: tenant.id,
      role: UserRole.TENANT_OWNER,
      email: owner.email,
      branchId: null,
      membershipId: 'membership-owner',
      membershipStatus: 'active',
    };

    getTenantUserOrThrowMock.mockResolvedValue(owner);
    authIdentityFindUniqueMock.mockResolvedValue({
      id: 'identity-client',
      user: oldClient,
    });
    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-owner-transfer',
      state: 'ya_owner_transfer',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'owner-transfer-verifier',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({ access_token: 'ya-owner-access' }),
      )
      .mockResolvedValueOnce(
        createFetchResponse({
          id: 'yandex-owner-1',
          default_phone: { number: '+7 (999) 111-22-33' },
        }),
      );

    const result = await service.completeYandexLink(
      { state: 'ya_owner_transfer', code: 'owner-transfer-code' },
      principal,
    );

    expect(authIdentityReassignMock).toHaveBeenCalledWith(
      'identity-client',
      expect.objectContaining({ userId: owner.id }),
    );
    expect(authIdentityCreateMock).not.toHaveBeenCalled();
    expect(result.transferred_from_client).toBe(true);
  });

  it('does not take a social identity away from another staff account', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityFindUniqueMock,
        authIdentityReassignMock,
        getTenantUserOrThrowMock,
      },
    } = createService();
    const owner = { ...baseUser(), id: 'owner-1', role: UserRole.TENANT_OWNER };
    const otherStaff = { ...baseUser(), id: 'staff-2', role: UserRole.STAFF };
    const principal: AuthenticatedUser = {
      userId: owner.id,
      sessionId: 'session-owner',
      tenantId: tenant.id,
      role: UserRole.TENANT_OWNER,
      email: owner.email,
      branchId: null,
      membershipId: 'membership-owner',
      membershipStatus: 'active',
    };

    getTenantUserOrThrowMock.mockResolvedValue(owner);
    authIdentityFindUniqueMock.mockResolvedValue({
      id: 'identity-staff',
      user: otherStaff,
    });
    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-owner-conflict',
      state: 'ya_owner_conflict',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'owner-conflict-verifier',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse({ access_token: 'ya-owner-access' }),
      )
      .mockResolvedValueOnce(createFetchResponse({ id: 'yandex-owner-1' }));

    await expect(
      service.completeYandexLink(
        { state: 'ya_owner_conflict', code: 'owner-conflict-code' },
        principal,
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'social_identity_conflict' } },
    });
    expect(authIdentityReassignMock).not.toHaveBeenCalled();
  });

  it('does not open a CRM client account without a provider-verified phone', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authIdentityCreateMock,
        createUserMock,
        findTenantUserByEmailMock,
        issueSessionMock,
      },
    } = createService();

    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-without-phone',
      state: 'ya_without_phone',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'code-verifier-without-phone',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    findTenantUserByEmailMock.mockResolvedValue(baseUser());
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
          id: 'yandex-user-without-phone',
          default_email: 'client@example.com',
          real_name: 'Иван Клиент',
        }),
      );

    await expect(
      service.completeYandexLogin({
        state: 'ya_without_phone',
        code: 'oauth-code-without-phone',
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'social_phone_required' },
      },
    });
    expect(authIdentityCreateMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(issueSessionMock).not.toHaveBeenCalled();
  });

  it('rejects a replayed OAuth state before provider exchange', async () => {
    const {
      service,
      mocks: {
        authFlowStateFindUniqueMock,
        authFlowStateUpdateMock,
        authIdentityCreateMock,
      },
    } = createService();
    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-replayed',
      state: 'ya_replayed',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'code-verifier-replayed',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    authFlowStateUpdateMock.mockResolvedValue(false);
    global.fetch = jest.fn();

    await expect(
      service.completeYandexLogin({
        state: 'ya_replayed',
        code: 'oauth-code-replayed',
      }),
    ).rejects.toThrow('This social login request is no longer valid');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(authIdentityCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an OAuth state for a tenant conflicting with the domain', async () => {
    const {
      service,
      tenantContext,
      mocks: { authFlowStateFindUniqueMock, authFlowStateUpdateMock },
    } = createService();
    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-foreign-domain',
      state: 'ya_foreign_domain',
      provider: 'yandex',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'code-verifier-domain',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    global.fetch = jest.fn();

    await expect(
      tenantContext.run('request-domain', async () => {
        tenantContext.setResolvedTenant({
          tenantId: 'tenant-domain',
          userId: null,
          membershipId: null,
          role: null,
          source: 'custom_domain',
        });

        return service.completeYandexLogin({
          state: 'ya_foreign_domain',
          code: 'oauth-code-domain',
        });
      }),
    ).rejects.toThrow('Conflicting tenant resolution signals');
    expect(authFlowStateUpdateMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
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
      redirectUri: 'https://maya.example/oauth-callback.html',
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

    const authIdentityArgs = authIdentityCreateMock.mock.calls[0]?.[0];

    expect(authIdentityArgs.userId).toBe(createdUser.id);
    expect(authIdentityArgs.provider).toBe('telegram');
    expect(authIdentityArgs.providerUserId).toBe('987654321');
    expect(authIdentityArgs.email).toBeNull();
    expect(authIdentityArgs.phone).toBe('+79995554433');
    expect(authIdentityArgs.profileJson).toEqual(expect.any(Object));
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      is_new_user: true,
      provider: 'telegram',
    });
  });

  it('returns a controlled unavailable error when Telegram cannot be reached', async () => {
    const {
      service,
      mocks: { authFlowStateFindUniqueMock },
    } = createService();

    authFlowStateFindUniqueMock.mockResolvedValue({
      id: 'flow-telegram-network',
      state: 'te_network_failure',
      provider: 'telegram',
      redirectUri: 'https://maya.example/oauth-callback.html',
      codeVerifier: 'telegram-code-verifier',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      tenant,
    });
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      service.completeTelegramLogin({
        state: 'te_network_failure',
        code: 'telegram-code-network',
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        error: {
          code: 'social_provider_unavailable',
        },
      },
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
