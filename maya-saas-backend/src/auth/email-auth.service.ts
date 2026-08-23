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
import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthClientMetadata } from './auth-client-metadata';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSessionService } from './auth-session.service';
import { StartEmailAuthDto } from './dto/start-email-auth.dto';
import { VerifyEmailAuthDto } from './dto/verify-email-auth.dto';
import {
  EmailAuthDeliveryResult,
  EmailAuthDeliveryFailedError,
  EmailAuthDeliveryService,
  EmailAuthDeliveryUnavailableError,
} from './email-auth-delivery.service';
import { TenantAuthRepository } from './tenant-auth.repository';

type EmailLoginTenant = {
  currentPeriodEnd?: Date | null;
  id: string;
  name: string;
  slug: string;
  status: string;
  trialEndsAt?: Date | null;
  trialFullAccess?: boolean;
};

type EmailLoginUser = {
  email: string;
  id: string;
  role: string;
  status: string;
  tenant?: EmailLoginTenant | null;
  tenantId: string | null;
};

@Injectable()
export class EmailAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly deliveryService: EmailAuthDeliveryService,
    private readonly tenantContext: TenantContextService,
    private readonly authRepository: TenantAuthRepository,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly sessionService: AuthSessionService,
  ) {}

  async start(
    dto: StartEmailAuthDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertEnabled();
    const email = this.normalizeEmail(dto.email);
    const tenantSlug = dto.tenantSlug?.trim();

    if (!tenantSlug) {
      return this.startAcrossTenants(email, metadata);
    }

    await this.rateLimitService.assertPreflight('email_start', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint(tenantSlug, email),
    });
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(tenantSlug);

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      await this.rateLimitService.assertTenant('email_start', {
        tenantId: tenant.id,
        identity: email,
      });
      const code = this.resolveCode();
      const ttlSeconds = this.getCodeTtlSeconds();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);

      await this.authRepository.upsertEmailChallenge({
        email,
        codeHash: this.hashCode(tenant.id, email, code),
        expiresAt,
      });

      const user = await this.usersService.findTenantUserByEmail(
        tenant.id,
        email,
      );
      let deliveryResult:
        { delivery: 'debug'; debug_code: string } | { delivery: 'email' };

      try {
        const deliveryType = this.deliveryService.getDeliveryType();
        if (
          deliveryType === 'debug' ||
          (user && this.canUserLogIn(tenant, user))
        ) {
          deliveryResult = await this.deliveryService.deliverCode({
            email,
            code,
            expiresInMinutes: Math.ceil(ttlSeconds / 60),
            shadowContexts: [
              {
                tenantId: tenant.id,
                logicalRef: `email-auth:${tenant.id}:${expiresAt.toISOString()}`,
                expiresAt,
                internalUserId: user?.id,
              },
            ],
          });
        } else {
          // Keep the public response uniform without turning this endpoint
          // into an SMTP relay for arbitrary unregistered addresses.
          deliveryResult = { delivery: 'email' };
        }
      } catch (error) {
        if (error instanceof EmailAuthDeliveryUnavailableError) {
          throw new ServiceUnavailableException(
            this.buildError('email_delivery_unavailable', error.message),
          );
        }
        if (error instanceof EmailAuthDeliveryFailedError) {
          throw new ServiceUnavailableException(
            this.buildError('email_delivery_failed', error.message),
          );
        }
        throw error;
      }

      return {
        ok: true,
        tenant_slug: tenant.slug,
        email,
        delivery: deliveryResult.delivery,
        expires_at: expiresAt,
        retry_after_seconds: this.getRetryAfterSeconds(),
        next_step: 'verify_email_code',
        ...(deliveryResult.delivery === 'debug'
          ? { debug_code: deliveryResult.debug_code }
          : {}),
      };
    });
  }

  async verify(
    dto: VerifyEmailAuthDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertEnabled();
    const email = this.normalizeEmail(dto.email);
    const tenantSlug = dto.tenantSlug?.trim();

    if (!tenantSlug) {
      return this.verifyAcrossTenants(email, dto.code, metadata);
    }

    await this.rateLimitService.assertPreflight('email_verify', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint(tenantSlug, email),
    });
    const tenant = await this.tenantsService.getTenantBySlugOrThrow(tenantSlug);

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      await this.rateLimitService.assertTenant('email_verify', {
        tenantId: tenant.id,
        identity: email,
      });
      const challenge = await this.authRepository.findEmailChallenge(email);

      if (!challenge || challenge.consumedAt) {
        throw new BadRequestException(
          this.buildError(
            'email_code_missing',
            'Request a new email verification code and try again.',
            'code',
          ),
        );
      }
      if (challenge.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException(
          this.buildError(
            'email_code_expired',
            'The email verification code has expired.',
            'code',
          ),
        );
      }

      const maxAttempts = this.getMaxAttempts();
      if (challenge.attempts >= maxAttempts) {
        throw new HttpException(
          this.buildTooManyAttemptsError(),
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const providedHash = this.hashCode(tenant.id, email, dto.code);
      const providedBuffer = Buffer.from(providedHash);
      const expectedBuffer = Buffer.from(challenge.codeHash);
      const codeValid =
        providedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(providedBuffer, expectedBuffer);

      if (!codeValid) {
        const attempts = await this.authRepository.recordInvalidEmailAttempt(
          challenge.id,
          challenge.codeHash,
          new Date(),
          maxAttempts,
        );

        if (attempts === null || attempts >= maxAttempts) {
          throw new HttpException(
            this.buildTooManyAttemptsError(),
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        throw new BadRequestException(
          this.buildError(
            'email_code_invalid',
            'Invalid email verification code.',
            'code',
            { remaining_attempts: maxAttempts - attempts },
          ),
        );
      }

      const challengeClaimed = await this.authRepository.claimEmailChallenge(
        challenge.id,
        challenge.codeHash,
        new Date(),
      );
      if (!challengeClaimed) {
        throw new BadRequestException(
          this.buildError(
            'email_code_missing',
            'Request a new email verification code and try again.',
            'code',
          ),
        );
      }

      const user = await this.usersService.findTenantUserByEmail(
        tenant.id,
        email,
      );
      if (!user) {
        throw new UnauthorizedException(
          this.buildError(
            'email_login_invalid',
            'This email is not linked to a user in this business.',
            'email',
          ),
        );
      }
      if (user.status !== 'active') {
        throw new ForbiddenException('User is not active');
      }

      this.assertUserCanLogIn(tenant, user);

      return {
        ...(await this.sessionService.issueSession(user, metadata)),
        tenant: this.serializeLoginTenant(tenant),
        user: this.usersService.serializeUser(user),
      };
    });
  }

  private async startAcrossTenants(
    email: string,
    metadata: Partial<AuthClientMetadata>,
  ) {
    await this.rateLimitService.assertPreflight('email_start', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint('*', email),
    });

    const candidates = await this.findEligibleEmailCandidates(email);
    const code = this.resolveCode();
    const ttlSeconds = this.getCodeTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);

    for (const candidate of candidates) {
      const tenant = candidate.tenant!;
      await this.tenantContext.runAsPublicTenant(tenant.id, async () => {
        await this.rateLimitService.assertTenant('email_start', {
          tenantId: tenant.id,
          identity: email,
        });
        await this.authRepository.upsertEmailChallenge({
          email,
          codeHash: this.hashCode(tenant.id, email, code),
          expiresAt,
        });
      });
    }

    let deliveryResult: EmailAuthDeliveryResult = { delivery: 'email' };
    try {
      const deliveryType = this.deliveryService.getDeliveryType();
      if (deliveryType === 'debug' || candidates.length > 0) {
        deliveryResult = await this.deliveryService.deliverCode({
          email,
          code,
          expiresInMinutes: Math.ceil(ttlSeconds / 60),
          shadowContexts: candidates.map((candidate) => ({
            tenantId: candidate.tenant!.id,
            logicalRef: `email-auth:${candidate.tenant!.id}:${expiresAt.toISOString()}`,
            expiresAt,
            internalUserId: candidate.id,
          })),
        });
      }
    } catch (error) {
      if (error instanceof EmailAuthDeliveryUnavailableError) {
        throw new ServiceUnavailableException(
          this.buildError('email_delivery_unavailable', error.message),
        );
      }
      if (error instanceof EmailAuthDeliveryFailedError) {
        throw new ServiceUnavailableException(
          this.buildError('email_delivery_failed', error.message),
        );
      }
      throw error;
    }

    return {
      ok: true,
      email,
      delivery: deliveryResult.delivery,
      expires_at: expiresAt,
      retry_after_seconds: this.getRetryAfterSeconds(),
      next_step: 'verify_email_code',
      ...(deliveryResult.delivery === 'debug'
        ? { debug_code: deliveryResult.debug_code }
        : {}),
    };
  }

  private async verifyAcrossTenants(
    email: string,
    code: string,
    metadata: Partial<AuthClientMetadata>,
  ) {
    await this.rateLimitService.assertPreflight('email_verify', {
      clientIp: metadata.clientIp,
      identity: this.buildTenantIdentityHint('*', email),
    });

    const candidates = await this.findEligibleEmailCandidates(email);
    if (!candidates.length) {
      throw new BadRequestException(
        this.buildError(
          'email_code_invalid',
          'Invalid email verification code.',
          'code',
        ),
      );
    }

    const maxAttempts = this.getMaxAttempts();
    const inspected = [];

    for (const candidate of candidates) {
      const tenant = candidate.tenant!;
      const result = await this.tenantContext.runAsPublicTenant(
        tenant.id,
        async () => {
          await this.rateLimitService.assertTenant('email_verify', {
            tenantId: tenant.id,
            identity: email,
          });
          const challenge = await this.authRepository.findEmailChallenge(email);

          if (!challenge || challenge.consumedAt) {
            return { status: 'missing' as const };
          }
          if (challenge.expiresAt.getTime() < Date.now()) {
            return { status: 'expired' as const };
          }
          if (challenge.attempts >= maxAttempts) {
            return { status: 'too_many' as const };
          }

          const providedHash = this.hashCode(tenant.id, email, code);
          const providedBuffer = Buffer.from(providedHash);
          const expectedBuffer = Buffer.from(challenge.codeHash);
          const codeValid =
            providedBuffer.length === expectedBuffer.length &&
            timingSafeEqual(providedBuffer, expectedBuffer);

          if (!codeValid) {
            const attempts =
              await this.authRepository.recordInvalidEmailAttempt(
                challenge.id,
                challenge.codeHash,
                new Date(),
                maxAttempts,
              );

            return attempts === null || attempts >= maxAttempts
              ? { status: 'too_many' as const }
              : {
                  status: 'invalid' as const,
                  remainingAttempts: maxAttempts - attempts,
                };
          }

          return {
            status: 'valid' as const,
            candidate,
            challenge,
          };
        },
      );
      inspected.push(result);
    }

    const valid = inspected.filter((result) => result.status === 'valid');
    if (!valid.length) {
      if (inspected.some((result) => result.status === 'too_many')) {
        throw new HttpException(
          this.buildTooManyAttemptsError(),
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const invalid = inspected.filter((result) => result.status === 'invalid');
      if (invalid.length) {
        const remainingAttempts = Math.min(
          ...invalid.map((result) => result.remainingAttempts),
        );
        throw new BadRequestException(
          this.buildError(
            'email_code_invalid',
            'Invalid email verification code.',
            'code',
            { remaining_attempts: remainingAttempts },
          ),
        );
      }
      if (inspected.some((result) => result.status === 'expired')) {
        throw new BadRequestException(
          this.buildError(
            'email_code_expired',
            'The email verification code has expired.',
            'code',
          ),
        );
      }
      throw new BadRequestException(
        this.buildError(
          'email_code_missing',
          'Request a new email verification code and try again.',
          'code',
        ),
      );
    }

    if (valid.length > 1) {
      return {
        ok: true,
        next_step: 'select_business',
        businesses: valid.map(({ candidate }) => ({
          name: candidate.tenant!.name,
          role: candidate.role,
          slug: candidate.tenant!.slug,
        })),
      };
    }

    const selected = valid[0];
    const candidate = selected.candidate;
    const challenge = selected.challenge;
    const tenant = candidate.tenant!;

    return this.tenantContext.runAsPublicTenant(tenant.id, async () => {
      const challengeClaimed = await this.authRepository.claimEmailChallenge(
        challenge.id,
        challenge.codeHash,
        new Date(),
      );
      if (!challengeClaimed) {
        throw new BadRequestException(
          this.buildError(
            'email_code_missing',
            'Request a new email verification code and try again.',
            'code',
          ),
        );
      }

      return {
        ...(await this.sessionService.issueSession(candidate, metadata)),
        tenant: this.serializeLoginTenant(tenant),
        user: this.usersService.serializeUser(candidate),
      };
    });
  }

  private async findEligibleEmailCandidates(email: string) {
    const candidates = await this.usersService.findEmailLoginCandidates(email);
    const unique = new Map<string, (typeof candidates)[number]>();

    for (const candidate of candidates) {
      const tenant = candidate.tenant;
      if (!candidate.tenantId || !tenant || unique.has(tenant.id)) continue;
      if (!this.canUserLogIn(tenant, candidate)) continue;
      unique.set(tenant.id, candidate);
    }

    return [...unique.values()];
  }

  private serializeLoginTenant(tenant: EmailLoginTenant) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    };
  }

  private assertEnabled(): void {
    if (this.configService.get<string>('EMAIL_LOGIN_ENABLED') !== 'true') {
      throw new ServiceUnavailableException(
        this.buildError(
          'email_login_unavailable',
          'Email code login is not enabled.',
        ),
      );
    }
  }

  private canUserLogIn(
    tenant: EmailLoginTenant,
    user: EmailLoginUser,
  ): boolean {
    if (user.status !== 'active') return false;

    try {
      this.assertUserCanLogIn(tenant, user);
      return true;
    } catch {
      return false;
    }
  }

  private assertUserCanLogIn(
    tenant: EmailLoginTenant,
    user: EmailLoginUser,
  ): void {
    const isClient = user.role === 'client' || user.role === 'customer';
    const fullTrialActive =
      tenant.status === 'trial' &&
      tenant.trialFullAccess === true &&
      Boolean(tenant.trialEndsAt) &&
      tenant.trialEndsAt!.getTime() > Date.now();
    const allowed = new Set(['active', 'past_due']);

    if (isClient && this.isUnpaidExpiredTrial(tenant)) {
      throw new ForbiddenException('Tenant is not accepting client access');
    }
    if (!isClient || fullTrialActive) allowed.add('trial');
    if (!allowed.has(tenant.status)) {
      throw new ForbiddenException('Tenant is not accepting user access');
    }
  }

  private isUnpaidExpiredTrial(tenant: EmailLoginTenant): boolean {
    return (
      new Set(['trial', 'past_due']).has(tenant.status) &&
      Boolean(tenant.trialEndsAt) &&
      tenant.trialEndsAt!.getTime() <= Date.now() &&
      !tenant.currentPeriodEnd
    );
  }

  private resolveCode(): string {
    const fixed = this.configService.get<string>('EMAIL_AUTH_FIXED_CODE');
    if (fixed && /^\d{4,8}$/u.test(fixed)) return fixed;
    return String(randomInt(100_000, 1_000_000));
  }

  private getCodeTtlSeconds(): number {
    const value = Number(this.configService.get<string>('EMAIL_AUTH_CODE_TTL'));
    return Number.isInteger(value) && value >= 60 && value <= 900 ? value : 300;
  }

  private getRetryAfterSeconds(): number {
    const value = Number(
      this.configService.get<string>('EMAIL_AUTH_RESEND_COOLDOWN_SECONDS'),
    );
    const normalized =
      Number.isInteger(value) && value >= 1 && value <= 900 ? value : 60;
    return Math.min(normalized, this.getCodeTtlSeconds());
  }

  private getMaxAttempts(): number {
    const value = Number(
      this.configService.get<string>('EMAIL_AUTH_MAX_ATTEMPTS'),
    );
    return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 5;
  }

  private hashCode(tenantId: string, email: string, code: string): string {
    const secret =
      this.configService.get<string>('EMAIL_AUTH_SECRET') ||
      this.configService.get<string>('PHONE_AUTH_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-email-auth-secret';

    return createHmac('sha256', secret)
      .update([tenantId, email, code].join('\0'))
      .digest('hex');
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private buildTenantIdentityHint(
    tenantSlug: string,
    identity: string,
  ): string {
    return JSON.stringify([tenantSlug.trim().toLowerCase(), identity]);
  }

  private buildTooManyAttemptsError() {
    return this.buildError(
      'email_too_many_attempts',
      'Too many invalid email code attempts. Request a new code.',
      'code',
    );
  }

  private buildError(
    code:
      | 'email_code_expired'
      | 'email_code_invalid'
      | 'email_code_missing'
      | 'email_delivery_failed'
      | 'email_delivery_unavailable'
      | 'email_login_invalid'
      | 'email_login_unavailable'
      | 'email_too_many_attempts',
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
}
