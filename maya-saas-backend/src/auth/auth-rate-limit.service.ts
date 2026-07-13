import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { isIP } from 'net';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthRateLimitException } from './auth-rate-limit.exception';
import {
  AuthRateLimitRepository,
  AuthRateLimitRuleInput,
} from './auth-rate-limit.repository';

export type AuthRateLimitAction =
  | 'email_start'
  | 'email_verify'
  | 'oauth_complete'
  | 'oauth_start'
  | 'password_login'
  | 'phone_start'
  | 'phone_verify'
  | 'refresh'
  | 'registration'
  | 'ai_onboarding'
  | 'trial_activation'
  | 'trial_signup';

type AuthRateLimitStage = 'preflight' | 'session' | 'tenant';
type AuthRateLimitScope = AuthRateLimitRuleInput['scope'];

type AuthRateLimitPolicy = {
  action: AuthRateLimitAction;
  key: string;
  maxAttempts: number;
  scope: AuthRateLimitScope;
  stage: AuthRateLimitStage;
  windowSeconds: number;
};

const POLICIES: AuthRateLimitPolicy[] = [
  policy('password_login', 'preflight', 'ip', '15m', 50, 900),
  policy('password_login', 'preflight', 'identity', '15m', 12, 900),
  policy('password_login', 'tenant', 'tenant', '15m', 500, 900),
  policy('password_login', 'tenant', 'identity', '15m', 10, 900),
  policy('registration', 'preflight', 'ip', '1h', 20, 3600),
  policy('registration', 'preflight', 'identity', '1h', 5, 3600),
  policy('registration', 'tenant', 'tenant', '1h', 100, 3600),
  policy('registration', 'tenant', 'identity', '1h', 3, 3600),
  policy('ai_onboarding', 'preflight', 'ip', '1h', 120, 3600),
  policy('ai_onboarding', 'preflight', 'identity', '1h', 60, 3600),
  policy('phone_start', 'preflight', 'ip', '10m', 20, 600),
  policy('phone_start', 'preflight', 'identity', '10m', 5, 600),
  policy('phone_start', 'tenant', 'tenant', '10m', 200, 600),
  policy('phone_start', 'tenant', 'identity', '60s', 1, 60),
  policy('phone_start', 'tenant', 'identity', '10m', 5, 600),
  policy('phone_verify', 'preflight', 'ip', '10m', 60, 600),
  policy('phone_verify', 'preflight', 'identity', '10m', 15, 600),
  policy('phone_verify', 'tenant', 'tenant', '10m', 1000, 600),
  policy('phone_verify', 'tenant', 'identity', '10m', 10, 600),
  policy('email_start', 'preflight', 'ip', '10m', 20, 600),
  policy('email_start', 'preflight', 'identity', '10m', 5, 600),
  policy('email_start', 'tenant', 'tenant', '10m', 200, 600),
  policy('email_start', 'tenant', 'identity', '60s', 1, 60),
  policy('email_start', 'tenant', 'identity', '10m', 5, 600),
  policy('email_verify', 'preflight', 'ip', '10m', 60, 600),
  policy('email_verify', 'preflight', 'identity', '10m', 15, 600),
  policy('email_verify', 'tenant', 'tenant', '10m', 1000, 600),
  policy('email_verify', 'tenant', 'identity', '10m', 10, 600),
  policy('oauth_start', 'preflight', 'ip', '10m', 30, 600),
  policy('oauth_start', 'tenant', 'tenant', '10m', 500, 600),
  policy('oauth_complete', 'preflight', 'ip', '10m', 60, 600),
  policy('oauth_complete', 'preflight', 'identity', '10m', 5, 600),
  policy('oauth_complete', 'tenant', 'tenant', '10m', 1000, 600),
  policy('oauth_complete', 'tenant', 'identity', '10m', 3, 600),
  policy('refresh', 'preflight', 'ip', '15m', 240, 900),
  policy('refresh', 'preflight', 'identity', '15m', 6, 900),
  policy('refresh', 'session', 'tenant', '15m', 5000, 900),
  policy('refresh', 'session', 'identity', '15m', 20, 900),
  policy('trial_signup', 'preflight', 'ip', '24h', 10, 86400),
  policy('trial_signup', 'preflight', 'identity', '24h', 3, 86400),
  policy('trial_activation', 'preflight', 'ip', '24h', 20, 86400),
];

@Injectable()
export class AuthRateLimitService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly repository: AuthRateLimitRepository,
  ) {}

  assertPreflight(
    action: AuthRateLimitAction,
    params: { clientIp?: string | null; identity?: string | null },
  ): Promise<void> {
    return this.enforce(action, 'preflight', {
      clientIp: params.clientIp,
      identity: params.identity,
      tenantId: null,
    });
  }

  assertTenant(
    action: AuthRateLimitAction,
    params: { identity?: string | null; tenantId: string },
  ): Promise<void> {
    this.tenantContext.assertTenantId(params.tenantId);

    return this.enforce(action, 'tenant', {
      identity: params.identity,
      tenantId: params.tenantId,
    });
  }

  assertSession(
    action: AuthRateLimitAction,
    params: {
      identity: string;
      tenantId: string | null;
      userId: string;
    },
  ): Promise<void> {
    this.tenantContext.assertAuthPrincipal(params.userId, params.tenantId);

    return this.enforce(action, 'session', {
      identity: params.identity,
      tenantId: params.tenantId,
    });
  }

  private async enforce(
    action: AuthRateLimitAction,
    stage: AuthRateLimitStage,
    params: {
      clientIp?: string | null;
      identity?: string | null;
      tenantId: string | null;
    },
  ): Promise<void> {
    const rules = POLICIES.filter(
      (candidate) => candidate.action === action && candidate.stage === stage,
    ).flatMap((candidate) => {
      const subject = this.resolveSubject(candidate.scope, params);

      if (!subject) {
        return [];
      }

      const tenantId =
        candidate.scope === 'ip' || stage === 'preflight'
          ? null
          : params.tenantId;

      return [
        {
          action,
          maxAttempts: candidate.maxAttempts,
          policyKey: candidate.key,
          scope: candidate.scope,
          subjectHash: this.hashSubject(candidate.key, tenantId, subject),
          tenantId,
          windowSeconds: candidate.windowSeconds,
        },
      ];
    });

    if (rules.length === 0) {
      return;
    }

    const result = await this.repository.consume(rules, new Date());

    if (!result.allowed) {
      throw new AuthRateLimitException(result.retryAfterSeconds);
    }
  }

  private resolveSubject(
    scope: AuthRateLimitScope,
    params: {
      clientIp?: string | null;
      identity?: string | null;
      tenantId: string | null;
    },
  ): string | null {
    if (scope === 'tenant') {
      return params.tenantId;
    }

    if (scope === 'ip') {
      return this.normalizeIp(params.clientIp);
    }

    return params.identity?.trim() || null;
  }

  private normalizeIp(value?: string | null): string | null {
    const normalized = value?.trim().toLowerCase();

    if (!normalized) {
      return null;
    }

    const unwrapped = normalized.startsWith('::ffff:')
      ? normalized.slice('::ffff:'.length)
      : normalized;

    return isIP(unwrapped) ? unwrapped : 'invalid-ip';
  }

  private hashSubject(
    policyKey: string,
    tenantId: string | null,
    subject: string,
  ): string {
    return createHmac('sha256', this.getSecret())
      .update(`v1\0${policyKey}\0${tenantId ?? 'global'}\0${subject}`)
      .digest('hex');
  }

  private getSecret(): string {
    const secret =
      this.configService.get<string>('AUTH_RATE_LIMIT_SECRET') ||
      this.configService.get<string>('AUTH_SESSION_METADATA_SECRET') ||
      this.configService.get<string>('AUTH_REFRESH_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new InternalServerErrorException(
        'AUTH_RATE_LIMIT_SECRET is not configured',
      );
    }

    return secret;
  }
}

function policy(
  action: AuthRateLimitAction,
  stage: AuthRateLimitStage,
  scope: AuthRateLimitScope,
  windowName: string,
  maxAttempts: number,
  windowSeconds: number,
): AuthRateLimitPolicy {
  return {
    action,
    key: `auth.${action}.${stage}.${scope}.${windowName}`,
    maxAttempts,
    scope,
    stage,
    windowSeconds,
  };
}
