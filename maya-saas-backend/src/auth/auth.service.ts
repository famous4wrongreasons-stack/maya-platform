import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

import { normalizeRussianPhone } from '../common/phone.util';
import { UserRole, UserStatus } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthClientMetadata } from './auth-client-metadata';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { LoginDto } from './dto/login.dto';
import {
  PhoneAuthDeliveryFailedError,
  PhoneAuthDeliveryService,
  PhoneAuthDeliveryUnavailableError,
} from './phone-auth-delivery.service';
import { RegisterDto } from './dto/register.dto';
import { StartPhoneAuthDto } from './dto/start-phone-auth.dto';
import { VerifyPhoneAuthDto } from './dto/verify-phone-auth.dto';
import { TenantAuthRepository } from './tenant-auth.repository';

type ClientAccessTenant = {
  currentPeriodEnd?: Date | null;
  status: string;
  trialEndsAt?: Date | null;
  trialFullAccess?: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly phoneAuthDeliveryService: PhoneAuthDeliveryService,
    private readonly tenantContext: TenantContextService,
    private readonly authRepository: TenantAuthRepository,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly sessionService: AuthSessionService,
  ) {}

  async login(dto: LoginDto, metadata: Partial<AuthClientMetadata> = {}) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    await this.rateLimitService.assertPreflight('password_login', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint(
        dto.tenantSlug ?? 'platform',
        normalizedEmail,
      ),
    });
    const user = dto.tenantSlug
      ? await this.loginTenantUser(dto, normalizedEmail)
      : await this.loginPlatformOwner(dto);

    if (user.status !== 'active') {
      throw new ForbiddenException('User is not active');
    }

    return {
      ...(await this.sessionService.issueSession(user, metadata)),
      user: this.usersService.serializeUser(user),
    };
  }

  async register(dto: RegisterDto, metadata: Partial<AuthClientMetadata> = {}) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    await this.rateLimitService.assertPreflight('registration', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint(dto.tenantSlug, normalizedEmail),
    });
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug,
    );

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      await this.rateLimitService.assertTenant('registration', {
        tenantId: tenant.id,
        identity: normalizedEmail,
      });
      this.assertTenantAllowsClientAccess(tenant, true);
      this.assertTenantAllowsClientRegistration(tenant);
      this.assertTenantAllowsSelfRegistration(tenant.allowSelfRegistration);

      if (dto.branchId) {
        await this.tenantsService.assertBranchBelongsToTenant(
          dto.branchId,
          tenant.id,
        );
      }

      const normalizedPhone = dto.phone
        ? normalizeRussianPhone(dto.phone)
        : null;

      await this.usersService.ensureEmailIsAvailable(tenant.id, dto.email);

      if (normalizedPhone) {
        await this.usersService.ensurePhoneIsAvailable(
          tenant.id,
          normalizedPhone,
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = await this.usersService.createUser({
        tenantId: tenant.id,
        branchId: dto.branchId ?? null,
        email: dto.email,
        phone: normalizedPhone,
        name: dto.name ?? null,
        passwordHash,
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
      });

      return {
        ...(await this.sessionService.issueSession(user, metadata)),
        user: this.usersService.serializeUser(user),
      };
    });
  }

  async issueSession(
    user: {
      id: string;
      tenantId: string | null;
      role: string;
      status: string;
    },
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    return this.sessionService.issueSession(user, metadata);
  }

  async startPhoneAuth(dto: StartPhoneAuthDto, clientIp?: string | null) {
    const phone = normalizeRussianPhone(dto.phone);
    await this.rateLimitService.assertPreflight('phone_start', {
      clientIp,
      identity: this.buildTenantIdentityHint(dto.tenantSlug, phone),
    });
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug,
    );

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      await this.rateLimitService.assertTenant('phone_start', {
        tenantId: tenant.id,
        identity: phone,
      });
      this.assertTenantAllowsClientAccess(tenant, true);

      const existingUser = await this.usersService.findTenantUserByPhone(
        tenant.id,
        phone,
      );

      if (existingUser) {
        this.assertTenantAllowsClientAccess(
          tenant,
          this.shouldAllowTrialTenantLogin(existingUser.role as UserRole),
        );
      } else {
        this.assertTenantAllowsClientRegistration(tenant);
        this.assertTenantAllowsSelfRegistration(tenant.allowSelfRegistration);
      }

      const code = this.resolvePhoneAuthCode();
      const retryAfterSeconds = this.getPhoneAuthRetryAfterSeconds();
      const expiresAt = new Date(
        Date.now() + this.getPhoneAuthCodeTtlSeconds() * 1000,
      );

      await this.authRepository.upsertPhoneChallenge({
        phone,
        codeHash: this.hashPhoneAuthCode(tenant.id, phone, code),
        expiresAt,
      });

      let deliveryResult;

      try {
        deliveryResult = await this.phoneAuthDeliveryService.deliverCode({
          phone,
          code,
          clientIp,
        });
      } catch (error) {
        if (error instanceof PhoneAuthDeliveryUnavailableError) {
          throw new ServiceUnavailableException(
            this.buildPhoneAuthError('delivery_unavailable', error.message),
          );
        }

        if (error instanceof PhoneAuthDeliveryFailedError) {
          throw new ServiceUnavailableException(
            this.buildPhoneAuthError('delivery_failed', error.message),
          );
        }

        throw error;
      }

      return {
        ok: true,
        tenant_slug: tenant.slug,
        phone,
        delivery: deliveryResult.delivery,
        expires_at: expiresAt,
        retry_after_seconds: retryAfterSeconds,
        user_exists: Boolean(existingUser),
        next_step: 'verify_code',
        ...(deliveryResult.delivery === 'debug'
          ? { debug_code: deliveryResult.debug_code }
          : {}),
      };
    });
  }

  async verifyPhoneAuth(
    dto: VerifyPhoneAuthDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    const phone = normalizeRussianPhone(dto.phone);
    await this.rateLimitService.assertPreflight('phone_verify', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint(dto.tenantSlug, phone),
    });
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug,
    );

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      await this.rateLimitService.assertTenant('phone_verify', {
        tenantId: tenant.id,
        identity: phone,
      });
      this.assertTenantAllowsClientAccess(tenant, true);

      const challenge = await this.authRepository.findPhoneChallenge(phone);

      if (!challenge || challenge.consumedAt) {
        throw new BadRequestException(
          this.buildPhoneAuthError(
            'code_missing',
            'Start phone auth again to request a new verification code.',
            'code',
          ),
        );
      }

      if (challenge.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException(
          this.buildPhoneAuthError(
            'code_expired',
            'Verification code expired. Request a new one and try again.',
            'code',
          ),
        );
      }

      const maxAttempts = this.getPhoneAuthMaxAttempts();

      if (challenge.attempts >= maxAttempts) {
        throw new HttpException(
          this.buildPhoneAuthRateLimitError(),
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const providedHash = this.hashPhoneAuthCode(tenant.id, phone, dto.code);
      const isCodeValid = timingSafeEqual(
        Buffer.from(providedHash),
        Buffer.from(challenge.codeHash),
      );

      if (!isCodeValid) {
        const attempts = await this.authRepository.recordInvalidPhoneAttempt(
          challenge.id,
          challenge.codeHash,
          new Date(),
          maxAttempts,
        );

        if (attempts === null || attempts >= maxAttempts) {
          throw new HttpException(
            this.buildPhoneAuthRateLimitError(),
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        throw new BadRequestException(
          this.buildPhoneAuthError(
            'code_invalid',
            'Invalid verification code.',
            'code',
            {
              remaining_attempts: maxAttempts - attempts,
            },
          ),
        );
      }

      let user = await this.usersService.findTenantUserByPhone(
        tenant.id,
        phone,
      );

      if (user) {
        this.assertTenantAllowsClientAccess(
          tenant,
          this.shouldAllowTrialTenantLogin(user.role as UserRole),
        );

        if (user.status !== 'active') {
          throw new ForbiddenException('User is not active');
        }
      } else {
        this.assertTenantAllowsClientRegistration(tenant);
        this.assertTenantAllowsSelfRegistration(tenant.allowSelfRegistration);

        if (dto.branchId) {
          await this.tenantsService.assertBranchBelongsToTenant(
            dto.branchId,
            tenant.id,
          );
        }
      }

      const challengeClaimed = await this.authRepository.claimPhoneChallenge(
        challenge.id,
        challenge.codeHash,
        new Date(),
      );

      if (!challengeClaimed) {
        throw new BadRequestException(
          this.buildPhoneAuthError(
            'code_missing',
            'Start phone auth again to request a new verification code.',
            'code',
          ),
        );
      }

      let isNewUser = false;

      if (!user) {
        const passwordHash = await bcrypt.hash(
          randomBytes(24).toString('base64url'),
          10,
        );
        user = await this.usersService.createPhoneFirstClientUser({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          branchId: dto.branchId ?? null,
          phone,
          passwordHash,
        });
        isNewUser = true;
      }

      return {
        ...(await this.sessionService.issueSession(user, metadata)),
        user: this.usersService.serializeUser(user),
        is_new_user: isNewUser,
      };
    });
  }

  private async loginTenantUser(dto: LoginDto, normalizedEmail: string) {
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(
      dto.tenantSlug!,
    );

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      await this.rateLimitService.assertTenant('password_login', {
        tenantId: tenant.id,
        identity: normalizedEmail,
      });
      const user = await this.usersService.findTenantUserByEmail(
        tenant.id,
        dto.email,
      );

      if (!user) {
        throw new UnauthorizedException('Invalid email or password');
      }

      this.assertTenantAllowsClientAccess(
        tenant,
        this.shouldAllowTrialTenantLogin(user.role as UserRole),
      );

      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid email or password');
      }

      return user;
    });
  }

  private async loginPlatformOwner(dto: LoginDto) {
    const user = await this.usersService.findPlatformOwnerByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
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
        this.buildClientRegistrationError(
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

  private shouldAllowTrialTenantLogin(role: UserRole): boolean {
    return role !== UserRole.CLIENT;
  }

  private assertTenantAllowsSelfRegistration(
    allowSelfRegistration: boolean,
  ): void {
    if (!allowSelfRegistration) {
      throw new ForbiddenException(
        'Self registration is disabled for this tenant',
      );
    }
  }

  private resolvePhoneAuthCode(): string {
    const fixed = this.configService.get<string>('PHONE_AUTH_FIXED_CODE');

    if (fixed && /^\d{4,8}$/.test(fixed)) {
      return fixed;
    }

    return String(randomInt(100000, 1000000));
  }

  private getPhoneAuthCodeTtlSeconds(): number {
    const raw = Number(this.configService.get<string>('PHONE_AUTH_CODE_TTL'));

    return Number.isFinite(raw) && raw > 0 ? raw : 300;
  }

  private getPhoneAuthRetryAfterSeconds(): number {
    const raw = Number(
      this.configService.get<string>('PHONE_AUTH_RESEND_COOLDOWN_SECONDS'),
    );
    const normalized = Number.isFinite(raw) && raw > 0 ? raw : 60;

    return Math.min(normalized, this.getPhoneAuthCodeTtlSeconds());
  }

  private getPhoneAuthMaxAttempts(): number {
    const raw = Number(
      this.configService.get<string>('PHONE_AUTH_MAX_ATTEMPTS'),
    );

    return Number.isFinite(raw) && raw > 0 ? raw : 5;
  }

  private hashPhoneAuthCode(
    tenantId: string,
    phone: string,
    code: string,
  ): string {
    const secret =
      this.configService.get<string>('PHONE_AUTH_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-phone-auth-secret';

    return createHash('sha256')
      .update(`${secret}:${tenantId}:${phone}:${code}`)
      .digest('hex');
  }

  private buildPhoneAuthError(
    code:
      | 'code_expired'
      | 'code_invalid'
      | 'code_missing'
      | 'delivery_failed'
      | 'delivery_unavailable'
      | 'too_many_attempts',
    message: string,
    field?: string,
    extra?: Record<string, number | string | boolean>,
  ) {
    return {
      message,
      error: {
        code,
        message,
        ...(field ? { field } : {}),
        ...(extra ?? {}),
      },
    };
  }

  private buildPhoneAuthRateLimitError() {
    return this.buildPhoneAuthError(
      'too_many_attempts',
      'Too many invalid code attempts. Start phone auth again.',
      'code',
    );
  }

  private buildClientRegistrationError(
    code: 'subscription_required' | 'trial_client_registration_disabled',
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

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private buildTenantIdentityHint(
    tenantSlug: string,
    identity: string,
  ): string {
    return JSON.stringify([tenantSlug.trim().toLowerCase(), identity.trim()]);
  }
}
