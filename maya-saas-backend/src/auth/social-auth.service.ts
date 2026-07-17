import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  createHash,
  createPublicKey,
  createVerify,
  randomBytes,
  type JsonWebKey as CryptoJsonWebKey,
} from 'crypto';

import { UserRole, UserStatus } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { normalizeRussianPhone } from '../common/phone.util';
import {
  resolveAllowedOauthRedirectUri,
  resolveNodeEnvironment,
} from '../config/security-config';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthClientMetadata } from './auth-client-metadata';
import { AuthFlowSystemGateway } from './auth-flow-system.gateway';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { CompleteOauthLoginDto } from './dto/complete-oauth-login.dto';
import { StartOauthLoginDto } from './dto/start-oauth-login.dto';
import { TenantAuthRepository } from './tenant-auth.repository';

type SocialProvider = 'telegram' | 'yandex';

type ClientAccessTenant = {
  currentPeriodEnd?: Date | null;
  status: string;
  trialEndsAt?: Date | null;
  trialFullAccess?: boolean;
};

type TenantAuthContext = ClientAccessTenant & {
  id: string;
  slug: string;
  allowSelfRegistration: boolean;
};

type SocialProfile = {
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatarUrl: string | null;
  raw: Record<string, unknown>;
};

type TelegramTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type TelegramIdTokenClaims = Record<string, unknown> & {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  id?: number;
  iss?: string;
  name?: string;
  phone_number?: string;
  picture?: string;
  preferred_username?: string;
  sub?: string;
};

type YandexTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type JwksResponse = {
  keys?: TelegramJwk[];
};

type TelegramJwk = CryptoJsonWebKey & {
  alg?: string;
  kid?: string;
  kty?: string;
  use?: string;
};

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);
  private telegramJwksCache: {
    fetchedAt: number;
    keys: TelegramJwk[];
  } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContextService,
    private readonly authRepository: TenantAuthRepository,
    private readonly flowSystemGateway: AuthFlowSystemGateway,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly sessionService: AuthSessionService,
  ) {}

  async startYandexLogin(
    dto: StartOauthLoginDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertProviderEnabled('yandex');
    await this.rateLimitService.assertPreflight('oauth_start', {
      clientIp: metadata.clientIp,
    });

    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug,
    );
    this.assertTenantAllowsClientAccess(tenant, true);

    const clientId = this.getRequiredConfig(
      'YANDEX_CLIENT_ID',
      'Yandex ID login is not configured.',
    );
    const redirectUri = this.normalizeRedirectUri(dto.redirectUri);
    const flow = await this.tenantContext.runAsPublicTenant(
      tenant.id,
      async () => {
        await this.rateLimitService.assertTenant('oauth_start', {
          tenantId: tenant.id,
        });

        return this.createAuthFlowState({
          provider: 'yandex',
          redirectUri,
        });
      },
    );
    const authUrl = new URL('https://oauth.yandex.com/authorize');

    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', flow.state);
    authUrl.searchParams.set('scope', 'login:info login:email');
    authUrl.searchParams.set('optional_scope', 'login:default_phone');
    authUrl.searchParams.set('code_challenge', flow.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return {
      ok: true,
      provider: 'yandex',
      tenant_slug: tenant.slug,
      auth_url: authUrl.toString(),
      expires_at: flow.expiresAt,
      state: flow.state,
    };
  }

  async completeYandexLogin(
    dto: CompleteOauthLoginDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertProviderEnabled('yandex');
    await this.rateLimitService.assertPreflight('oauth_complete', {
      clientIp: metadata.clientIp,
      identity: dto.state,
    });

    const flow = await this.getValidAuthFlowState(dto.state, 'yandex');
    return this.tenantContext.runAsPublicTenant(flow.tenant.id, async () => {
      await this.rateLimitService.assertTenant('oauth_complete', {
        tenantId: flow.tenant.id,
        identity: dto.state,
      });
      await this.claimAuthFlowStateOrThrow(flow.id, 'yandex');
      const profile = await this.exchangeYandexCode(flow, dto.code);
      const result = await this.resolveOrCreateUser({
        branchId: dto.branchId,
        profile,
        tenant: flow.tenant,
      });

      return {
        ...(await this.sessionService.issueSession(result.user, metadata)),
        user: this.usersService.serializeUser(result.user),
        is_new_user: result.isNewUser,
        provider: 'yandex',
      };
    });
  }

  async startTelegramLogin(
    dto: StartOauthLoginDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertProviderEnabled('telegram');
    await this.rateLimitService.assertPreflight('oauth_start', {
      clientIp: metadata.clientIp,
    });

    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug,
    );
    this.assertTenantAllowsClientAccess(tenant, true);

    const clientId = this.getRequiredConfig(
      'TELEGRAM_CLIENT_ID',
      'Telegram login is not configured.',
    );
    const redirectUri = this.normalizeRedirectUri(dto.redirectUri);
    const flow = await this.tenantContext.runAsPublicTenant(
      tenant.id,
      async () => {
        await this.rateLimitService.assertTenant('oauth_start', {
          tenantId: tenant.id,
        });

        return this.createAuthFlowState({
          provider: 'telegram',
          redirectUri,
        });
      },
    );
    const authUrl = new URL('https://oauth.telegram.org/auth');

    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile phone');
    authUrl.searchParams.set('state', flow.state);
    authUrl.searchParams.set('code_challenge', flow.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return {
      ok: true,
      provider: 'telegram',
      tenant_slug: tenant.slug,
      auth_url: authUrl.toString(),
      expires_at: flow.expiresAt,
      state: flow.state,
    };
  }

  async completeTelegramLogin(
    dto: CompleteOauthLoginDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertProviderEnabled('telegram');
    await this.rateLimitService.assertPreflight('oauth_complete', {
      clientIp: metadata.clientIp,
      identity: dto.state,
    });

    const flow = await this.getValidAuthFlowState(dto.state, 'telegram');
    return this.tenantContext.runAsPublicTenant(flow.tenant.id, async () => {
      await this.rateLimitService.assertTenant('oauth_complete', {
        tenantId: flow.tenant.id,
        identity: dto.state,
      });
      await this.claimAuthFlowStateOrThrow(flow.id, 'telegram');
      const profile = await this.exchangeTelegramCode(flow, dto.code);
      const result = await this.resolveOrCreateUser({
        branchId: dto.branchId,
        profile,
        tenant: flow.tenant,
      });

      return {
        ...(await this.sessionService.issueSession(result.user, metadata)),
        user: this.usersService.serializeUser(result.user),
        is_new_user: result.isNewUser,
        provider: 'telegram',
      };
    });
  }

  private async resolveOrCreateUser(params: {
    branchId?: string;
    profile: SocialProfile;
    tenant: TenantAuthContext;
  }) {
    this.tenantContext.assertTenantId(params.tenant.id);
    const existingIdentity = await this.authRepository.findIdentity(
      params.profile.provider,
      params.profile.providerUserId,
    );

    if (existingIdentity) {
      const user = await this.usersService.getTenantUserOrThrow(
        existingIdentity.user.id,
        params.tenant.id,
      );
      this.assertUserCanLogin(user);
      await this.updateIdentityRecord(existingIdentity.id, params.profile);

      return {
        user,
        isNewUser: false,
      };
    }

    const byPhone = params.profile.phone
      ? await this.usersService.findTenantUserByPhone(
          params.tenant.id,
          params.profile.phone,
        )
      : null;
    const byEmail = params.profile.email
      ? await this.usersService.findTenantUserByEmail(
          params.tenant.id,
          params.profile.email,
        )
      : null;

    if (byPhone && byEmail && byPhone.id !== byEmail.id) {
      throw new ConflictException(
        this.buildSocialAuthError(
          'social_identity_conflict',
          'Social login matched multiple tenant users. Resolve the duplicate account first.',
        ),
      );
    }

    const matchedUser = byPhone ?? byEmail;

    if (matchedUser) {
      this.assertUserCanLogin(matchedUser);

      await this.authRepository.createIdentity({
        userId: matchedUser.id,
        provider: params.profile.provider,
        providerUserId: params.profile.providerUserId,
        email: params.profile.email,
        phone: params.profile.phone,
        profileJson: asJson(params.profile.raw),
      });

      return {
        user: matchedUser,
        isNewUser: false,
      };
    }

    this.assertTenantAllowsClientRegistration(params.tenant);
    this.assertTenantAllowsSelfRegistration(
      params.tenant.allowSelfRegistration,
    );

    if (params.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        params.branchId,
        params.tenant.id,
      );
    }

    const passwordHash = await bcrypt.hash(
      randomBytes(24).toString('base64url'),
      10,
    );
    const email = this.buildNewUserEmail(
      params.tenant.slug,
      params.profile.provider,
      params.profile.providerUserId,
      params.profile.email,
    );
    const createdUser = await this.usersService.createUser({
      tenantId: params.tenant.id,
      branchId: params.branchId ?? null,
      email,
      phone: params.profile.phone,
      name: params.profile.name,
      passwordHash,
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
    });

    await this.authRepository.createIdentity({
      userId: createdUser.id,
      provider: params.profile.provider,
      providerUserId: params.profile.providerUserId,
      email: params.profile.email,
      phone: params.profile.phone,
      profileJson: asJson(params.profile.raw),
    });

    return {
      user: createdUser,
      isNewUser: true,
    };
  }

  private async exchangeYandexCode(
    flow: Awaited<ReturnType<SocialAuthService['getValidAuthFlowState']>>,
    code: string,
  ): Promise<SocialProfile> {
    const clientId = this.getRequiredConfig(
      'YANDEX_CLIENT_ID',
      'Yandex ID login is not configured.',
    );
    const clientSecret =
      this.configService.get<string>('YANDEX_CLIENT_SECRET')?.trim() || '';
    const tokenPayload = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
    });

    if (flow.codeVerifier) {
      tokenPayload.set('code_verifier', flow.codeVerifier);
    }

    if (clientSecret) {
      tokenPayload.set('client_secret', clientSecret);
    }

    const tokenResponse = await fetch('https://oauth.yandex.com/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: tokenPayload,
      signal: AbortSignal.timeout(this.getOauthTimeoutMs()),
    });
    const tokenJson =
      await this.parseJsonResponse<YandexTokenResponse>(tokenResponse);

    if (!tokenResponse.ok || !tokenJson.access_token) {
      this.logger.warn(
        `Yandex OAuth exchange failed for tenant ${flow.tenant.slug}: ${tokenJson.error || tokenResponse.status}`,
      );
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_exchange_failed',
          tokenJson.error_description ||
            tokenJson.error ||
            'Yandex ID did not return an access token.',
        ),
      );
    }

    const userInfoResponse = await fetch(
      'https://login.yandex.ru/info?format=json',
      {
        headers: {
          Accept: 'application/json',
          Authorization: `OAuth ${tokenJson.access_token}`,
        },
        signal: AbortSignal.timeout(this.getOauthTimeoutMs()),
      },
    );
    const userInfo =
      await this.parseJsonResponse<Record<string, unknown>>(userInfoResponse);
    const providerUserId = this.asTrimmedString(
      userInfo.id ?? userInfo.uid ?? null,
    );

    if (!userInfoResponse.ok || !providerUserId) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_exchange_failed',
          'Yandex ID did not return a stable user identifier.',
        ),
      );
    }

    const email =
      this.normalizeEmail(
        this.asTrimmedString(
          userInfo.default_email ??
            userInfo.email ??
            this.firstArrayValue(userInfo.emails),
        ),
      ) ?? null;
    const rawPhone = userInfo.default_phone;
    const phoneValue =
      rawPhone && typeof rawPhone === 'object' && !Array.isArray(rawPhone)
        ? this.asTrimmedString((rawPhone as Record<string, unknown>).number)
        : this.asTrimmedString(rawPhone ?? null);
    const name =
      this.asTrimmedString(
        userInfo.real_name ??
          userInfo.display_name ??
          this.joinName(
            this.asTrimmedString(userInfo.first_name ?? null),
            this.asTrimmedString(userInfo.last_name ?? null),
          ) ??
          email ??
          userInfo.login ??
          null,
      ) ?? null;
    const avatarUrl =
      this.asTrimmedString(userInfo.default_avatar_id ?? null) &&
      userInfo.is_avatar_empty !== true
        ? `https://avatars.yandex.net/get-yapic/${this.asTrimmedString(userInfo.default_avatar_id ?? null)}/islands-200`
        : null;

    return {
      provider: 'yandex',
      providerUserId,
      email,
      phone: this.normalizeProviderPhone(phoneValue),
      name,
      avatarUrl,
      raw: userInfo,
    };
  }

  private async exchangeTelegramCode(
    flow: Awaited<ReturnType<SocialAuthService['getValidAuthFlowState']>>,
    code: string,
  ): Promise<SocialProfile> {
    const clientId = this.getRequiredConfig(
      'TELEGRAM_CLIENT_ID',
      'Telegram login is not configured.',
    );
    const clientSecret = this.getRequiredConfig(
      'TELEGRAM_CLIENT_SECRET',
      'Telegram login is not configured.',
    );
    const tokenPayload = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: flow.redirectUri,
      client_id: clientId,
      code_verifier: flow.codeVerifier || '',
    });
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );
    const tokenResponse = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: tokenPayload,
      signal: AbortSignal.timeout(this.getOauthTimeoutMs()),
    });
    const tokenJson =
      await this.parseJsonResponse<TelegramTokenResponse>(tokenResponse);

    if (!tokenResponse.ok || !tokenJson.id_token) {
      this.logger.warn(
        `Telegram OAuth exchange failed for tenant ${flow.tenant.slug}: ${tokenJson.error || tokenResponse.status}`,
      );
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_exchange_failed',
          tokenJson.error_description ||
            tokenJson.error ||
            'Telegram did not return an ID token.',
        ),
      );
    }

    const claims = await this.verifyTelegramIdToken(tokenJson.id_token);
    const providerUserId =
      this.asTrimmedString(claims.id ?? claims.sub ?? null) ?? null;

    if (!providerUserId) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram did not return a stable user identifier.',
        ),
      );
    }

    return {
      provider: 'telegram',
      providerUserId,
      email: null,
      phone: this.normalizeProviderPhone(
        this.asTrimmedString(claims.phone_number ?? null),
      ),
      name:
        this.asTrimmedString(claims.name ?? null) ??
        this.asTrimmedString(claims.preferred_username ?? null) ??
        null,
      avatarUrl: this.asTrimmedString(claims.picture ?? null),
      raw: claims,
    };
  }

  private async verifyTelegramIdToken(
    idToken: string,
  ): Promise<TelegramIdTokenClaims> {
    const [headerSegment, payloadSegment, signatureSegment] =
      idToken.split('.');

    if (!headerSegment || !payloadSegment || !signatureSegment) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram returned a malformed ID token.',
        ),
      );
    }

    const header =
      this.decodeJwtSegment<Record<string, unknown>>(headerSegment);
    const payload =
      this.decodeJwtSegment<TelegramIdTokenClaims>(payloadSegment);
    const alg = this.asTrimmedString(header.alg ?? null);
    const kid = this.asTrimmedString(header.kid ?? null);

    if (alg !== 'RS256' || !kid) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram returned an unsupported token signature.',
        ),
      );
    }

    const jwks = await this.getTelegramJwks();
    const jwk = jwks.find((item) => item.kid === kid && item.kty === 'RSA');

    if (!jwk) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram signing key was not found.',
        ),
      );
    }

    const publicKey = createPublicKey({
      key: jwk,
      format: 'jwk',
    });
    const verifier = createVerify('RSA-SHA256');

    verifier.update(`${headerSegment}.${payloadSegment}`);
    verifier.end();

    const isValid = verifier.verify(
      publicKey,
      Buffer.from(signatureSegment, 'base64url'),
    );

    if (!isValid) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram token signature verification failed.',
        ),
      );
    }

    const expectedAudience = this.getRequiredConfig(
      'TELEGRAM_CLIENT_ID',
      'Telegram login is not configured.',
    );
    const audience = payload.aud;
    const isAudienceValid = Array.isArray(audience)
      ? audience.includes(expectedAudience)
      : audience === expectedAudience;

    if (payload.iss !== 'https://oauth.telegram.org' || !isAudienceValid) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram token claims do not match this application.',
        ),
      );
    }

    const expiresAt = Number(payload.exp || 0);

    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_token_invalid',
          'Telegram token has expired.',
        ),
      );
    }

    return payload;
  }

  private async getTelegramJwks(): Promise<TelegramJwk[]> {
    const maxAgeMs = 5 * 60 * 1000;

    if (
      this.telegramJwksCache &&
      Date.now() - this.telegramJwksCache.fetchedAt < maxAgeMs
    ) {
      return this.telegramJwksCache.keys;
    }

    const response = await fetch(
      this.configService.get<string>('TELEGRAM_JWKS_URL')?.trim() ||
        'https://oauth.telegram.org/.well-known/jwks.json',
      {
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.getOauthTimeoutMs()),
      },
    );
    const json = await this.parseJsonResponse<JwksResponse>(response);
    const keys = Array.isArray(json.keys) ? json.keys : [];

    if (!response.ok || keys.length === 0) {
      throw new ServiceUnavailableException(
        this.buildSocialAuthError(
          'social_provider_unavailable',
          'Telegram signing keys are unavailable right now.',
        ),
      );
    }

    this.telegramJwksCache = {
      fetchedAt: Date.now(),
      keys,
    };

    return keys;
  }

  private async parseJsonResponse<TPayload>(
    response: Response,
  ): Promise<TPayload> {
    const raw = await response.text();

    if (raw.trim().length === 0) {
      return {} as TPayload;
    }

    return JSON.parse(raw) as TPayload;
  }

  private async createAuthFlowState(params: {
    provider: SocialProvider;
    redirectUri: string;
  }) {
    const codeVerifier = this.generateCodeVerifier();
    const expiresAt = new Date(
      Date.now() + this.getAuthFlowStateTtlSeconds() * 1000,
    );
    const state = `${params.provider.slice(0, 2)}_${randomBytes(24).toString(
      'base64url',
    )}`;

    await this.authRepository.createFlowState({
      provider: params.provider,
      state,
      redirectUri: params.redirectUri,
      codeVerifier,
      expiresAt,
    });

    return {
      state,
      expiresAt,
      codeChallenge: this.toCodeChallenge(codeVerifier),
    };
  }

  private async getValidAuthFlowState(
    state: string,
    provider: SocialProvider,
  ): Promise<{
    codeVerifier: string | null;
    id: string;
    redirectUri: string;
    tenant: TenantAuthContext;
  }> {
    const flow = await this.flowSystemGateway.findByState(state);

    if (!flow || flow.provider !== provider || flow.consumedAt) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_state_invalid',
          'This social login request is no longer valid. Start again.',
        ),
      );
    }

    if (flow.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_state_invalid',
          'This social login request expired. Start again.',
        ),
      );
    }

    this.assertTenantAllowsClientAccess(flow.tenant, true);

    return {
      id: flow.id,
      tenant: flow.tenant,
      redirectUri: flow.redirectUri,
      codeVerifier: flow.codeVerifier,
    };
  }

  private async updateIdentityRecord(id: string, profile: SocialProfile) {
    await this.authRepository.updateIdentity(id, {
      email: profile.email,
      phone: profile.phone,
      profileJson: asJson(profile.raw),
    });
  }

  private async claimAuthFlowStateOrThrow(
    id: string,
    provider: SocialProvider,
  ) {
    const claimed = await this.authRepository.claimFlowState(
      id,
      provider,
      new Date(),
    );

    if (!claimed) {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_state_invalid',
          'This social login request is no longer valid. Start again.',
        ),
      );
    }
  }

  private assertUserCanLogin(user: {
    role: string;
    status: string;
    tenant?: ClientAccessTenant | null;
  }) {
    if (user.status !== 'active') {
      throw new ForbiddenException('User is not active');
    }

    this.assertTenantAllowsClientAccess(
      user.tenant ?? { status: 'active' },
      this.shouldAllowTrialTenantLogin(user.role as UserRole),
    );
  }

  private assertTenantAllowsClientAccess(
    tenant: ClientAccessTenant,
    allowTrial: boolean,
  ): void {
    if (this.isUnpaidExpiredTrial(tenant) && !allowTrial) {
      throw new ForbiddenException('Tenant is not accepting client access');
    }

    const allowed = new Set<string>(['active', 'past_due']);

    if (allowTrial || this.isFullTrialActive(tenant)) {
      allowed.add('trial');
    }

    if (!allowed.has(tenant.status)) {
      throw new ForbiddenException('Tenant is not accepting client access');
    }
  }

  private assertTenantAllowsClientRegistration(
    tenant: ClientAccessTenant,
  ): void {
    const expired = this.isUnpaidExpiredTrial(tenant);
    if (
      expired ||
      (tenant.status === 'trial' && !this.isFullTrialActive(tenant))
    ) {
      throw new ForbiddenException(
        this.buildSocialAuthError(
          expired
            ? 'subscription_required'
            : 'trial_client_registration_disabled',
          expired
            ? 'The trial has ended. A subscription is required.'
            : 'Client registration is disabled while this business is still in trial.',
        ),
      );
    }
  }

  private isUnpaidExpiredTrial(tenant: ClientAccessTenant): boolean {
    return (
      new Set(['trial', 'past_due']).has(tenant.status) &&
      Boolean(tenant.trialEndsAt) &&
      tenant.trialEndsAt!.getTime() <= Date.now() &&
      !tenant.currentPeriodEnd
    );
  }

  private isFullTrialActive(tenant: ClientAccessTenant): boolean {
    return (
      tenant.status === 'trial' &&
      tenant.trialFullAccess === true &&
      Boolean(tenant.trialEndsAt) &&
      tenant.trialEndsAt!.getTime() > Date.now()
    );
  }

  private assertTenantAllowsSelfRegistration(
    allowSelfRegistration: boolean,
  ): void {
    if (!allowSelfRegistration) {
      throw new ForbiddenException(
        this.buildSocialAuthError(
          'self_registration_disabled',
          'Self registration is disabled for this tenant.',
        ),
      );
    }
  }

  private shouldAllowTrialTenantLogin(role: UserRole): boolean {
    return role !== UserRole.CLIENT;
  }

  private assertProviderEnabled(provider: SocialProvider) {
    const key =
      provider === 'yandex' ? 'YANDEX_LOGIN_ENABLED' : 'TELEGRAM_LOGIN_ENABLED';

    if (this.configService.get<string>(key) !== 'true') {
      throw new ServiceUnavailableException(
        this.buildSocialAuthError(
          'social_provider_unavailable',
          `${provider} login is disabled in this environment.`,
        ),
      );
    }
  }

  private buildNewUserEmail(
    tenantSlug: string,
    provider: SocialProvider,
    providerUserId: string,
    suggestedEmail: string | null,
  ): string {
    const normalizedEmail = this.normalizeEmail(suggestedEmail);

    if (normalizedEmail) {
      return normalizedEmail;
    }

    const digest = createHash('sha256')
      .update(`${provider}:${providerUserId}`)
      .digest('hex')
      .slice(0, 20);

    return `${provider}-${digest}@${tenantSlug.toLowerCase()}.client.local`;
  }

  private normalizeRedirectUri(redirectUri: string): string {
    try {
      return resolveAllowedOauthRedirectUri(
        redirectUri,
        this.configService.get<string>('OAUTH_ALLOWED_REDIRECT_URIS'),
        resolveNodeEnvironment(this.configService.get<string>('NODE_ENV')),
      );
    } catch {
      throw new BadRequestException(
        this.buildSocialAuthError(
          'social_redirect_invalid',
          'The social login redirect URI is not allowed.',
        ),
      );
    }
  }

  private normalizeEmail(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toLowerCase();

    return normalized.includes('@') ? normalized : null;
  }

  private normalizeProviderPhone(value: string | null): string | null {
    if (!value) {
      return null;
    }

    try {
      return normalizeRussianPhone(value);
    } catch {
      return null;
    }
  }

  private generateCodeVerifier(): string {
    return randomBytes(48).toString('base64url');
  }

  private toCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  private getOauthTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>('OAUTH_PROVIDER_TIMEOUT_MS'),
    );

    return Number.isFinite(raw) && raw > 0 ? raw : 15000;
  }

  private getAuthFlowStateTtlSeconds(): number {
    const raw = Number(
      this.configService.get<string>('AUTH_FLOW_STATE_TTL_SECONDS'),
    );

    return Number.isFinite(raw) && raw > 0 ? raw : 600;
  }

  private getRequiredConfig(name: string, message: string): string {
    const value = this.configService.get<string>(name)?.trim();

    if (!value) {
      throw new ServiceUnavailableException(
        this.buildSocialAuthError('social_provider_unavailable', message),
      );
    }

    return value;
  }

  private decodeJwtSegment<TPayload>(segment: string): TPayload {
    return JSON.parse(
      Buffer.from(segment, 'base64url').toString('utf8'),
    ) as TPayload;
  }

  private firstArrayValue(value: unknown): string | null {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }

    return this.asTrimmedString(value[0]);
  }

  private joinName(
    firstName: string | null,
    lastName: string | null,
  ): string | null {
    const joined = [firstName, lastName].filter(Boolean).join(' ').trim();

    return joined.length > 0 ? joined : null;
  }

  private asTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    const normalized = String(value).trim();

    return normalized.length > 0 ? normalized : null;
  }

  private buildSocialAuthError(
    code:
      | 'self_registration_disabled'
      | 'social_exchange_failed'
      | 'social_identity_conflict'
      | 'social_provider_unavailable'
      | 'social_redirect_invalid'
      | 'social_state_invalid'
      | 'social_token_invalid'
      | 'subscription_required'
      | 'trial_client_registration_disabled',
    message: string,
  ) {
    return {
      message,
      error: {
        code,
        message,
      },
    };
  }
}
