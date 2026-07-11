import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthRetentionRepository,
  AuthRetentionRunResult,
} from './auth-retention.repository';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

@Injectable()
export class AuthRetentionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly repository: AuthRetentionRepository,
  ) {}

  run(
    options: { batchSize?: number; dryRun?: boolean } = {},
    now = new Date(),
  ): Promise<AuthRetentionRunResult> {
    if (!Number.isFinite(now.getTime())) {
      throw new Error('Auth retention requires a valid current time');
    }

    const sessionDays = this.getBoundedConfig(
      'AUTH_RETENTION_SESSION_DAYS',
      30,
      7,
      365,
    );
    const challengeHours = this.getBoundedConfig(
      'AUTH_RETENTION_CHALLENGE_HOURS',
      24,
      1,
      168,
    );
    const rateLimitHours = this.getBoundedConfig(
      'AUTH_RETENTION_RATE_LIMIT_HOURS',
      24,
      1,
      720,
    );
    const configuredBatchSize = this.getBoundedConfig(
      'AUTH_RETENTION_BATCH_SIZE',
      1_000,
      1,
      10_000,
    );
    const batchSize = this.normalizeBatchSize(
      options.batchSize,
      configuredBatchSize,
    );

    return this.repository.run({
      batchSize,
      dryRun: options.dryRun !== false,
      now,
      cutoffs: {
        sessionInactiveBefore: new Date(now.getTime() - sessionDays * DAY_MS),
        authChallengeBefore: new Date(now.getTime() - challengeHours * HOUR_MS),
        rateLimitBefore: new Date(now.getTime() - rateLimitHours * HOUR_MS),
      },
    });
  }

  private normalizeBatchSize(
    requested: number | undefined,
    fallback: number,
  ): number {
    if (requested === undefined || !Number.isInteger(requested)) {
      return fallback;
    }

    return Math.min(10_000, Math.max(1, requested));
  }

  private getBoundedConfig(
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.configService.get<string>(name));

    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      return fallback;
    }

    return value;
  }
}
