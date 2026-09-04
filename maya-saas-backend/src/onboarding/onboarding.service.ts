import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthClientMetadata } from '../auth/auth-client-metadata';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { CreateTrialSignupDto } from './dto/create-trial-signup.dto';
import { CanonicalTrialOnboardingService } from './canonical-trial-onboarding.service';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly canonicalTrial: CanonicalTrialOnboardingService,
  ) {}

  async createTrialSignup(
    dto: CreateTrialSignupDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertSelfServeTrialSignupEnabled();
    await this.rateLimitService.assertPreflight('trial_signup', {
      clientIp: metadata.clientIp,
      identity: dto.ownerEmail.trim().toLowerCase(),
    });
    const result = await this.canonicalTrial.activate(dto);
    return {
      ...(await this.canonicalTrial.ownerSession(
        result.tenantId,
        result.ownerUserId,
        metadata,
      )),
      trial_activation: {
        activation_id: result.activationId,
        status: 'completed',
        counted_as_connected_business: true,
      },
    };
  }

  private assertSelfServeTrialSignupEnabled() {
    if (this.configService.get<string>('SELF_SERVE_TRIAL_SIGNUP') === 'true') {
      return;
    }

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      return;
    }

    // Машиночитаемый код и человеческий текст: в это сообщение упирается ЧУЖОЙ
    // салон, который дошёл до регистрации. Английская строка без кода не
    // объясняла ему ничего и выглядела как поломка.
    throw new ForbiddenException({
      message:
        'Регистрация новых салонов сейчас закрыта. Напишите нам — откроем доступ.',
      error: { code: 'self_serve_signup_disabled' },
    });
  }
}
