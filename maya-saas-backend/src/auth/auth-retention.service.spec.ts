import { ConfigService } from '@nestjs/config';

import { AuthRetentionRepository } from './auth-retention.repository';
import { AuthRetentionService } from './auth-retention.service';

describe('AuthRetentionService', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  const createService = (config: Record<string, string> = {}) => {
    const runMock = jest.fn().mockResolvedValue({});
    const service = new AuthRetentionService(
      {
        get: jest.fn((key: string) => config[key]),
      } as unknown as ConfigService,
      { run: runMock } as unknown as AuthRetentionRepository,
    );

    return { runMock, service };
  };

  it('defaults to dry-run with conservative retention windows', async () => {
    const { runMock, service } = createService();

    await service.run({}, now);

    expect(runMock).toHaveBeenCalledWith({
      batchSize: 1_000,
      dryRun: true,
      now,
      cutoffs: {
        sessionInactiveBefore: new Date('2026-06-11T12:00:00.000Z'),
        authChallengeBefore: new Date('2026-07-10T12:00:00.000Z'),
        rateLimitBefore: new Date('2026-07-10T12:00:00.000Z'),
      },
    });
  });

  it('applies bounded configuration and explicit execute mode', async () => {
    const { runMock, service } = createService({
      AUTH_RETENTION_SESSION_DAYS: '14',
      AUTH_RETENTION_CHALLENGE_HOURS: '48',
      AUTH_RETENTION_RATE_LIMIT_HOURS: '72',
      AUTH_RETENTION_BATCH_SIZE: '250',
    });

    await service.run({ dryRun: false, batchSize: 50_000 }, now);

    expect(runMock).toHaveBeenCalledWith({
      batchSize: 10_000,
      dryRun: false,
      now,
      cutoffs: {
        sessionInactiveBefore: new Date('2026-06-27T12:00:00.000Z'),
        authChallengeBefore: new Date('2026-07-09T12:00:00.000Z'),
        rateLimitBefore: new Date('2026-07-08T12:00:00.000Z'),
      },
    });
  });

  it('falls back instead of accepting destructive retention configuration', async () => {
    const { runMock, service } = createService({
      AUTH_RETENTION_SESSION_DAYS: '0',
      AUTH_RETENTION_CHALLENGE_HOURS: '-1',
      AUTH_RETENTION_RATE_LIMIT_HOURS: '999999',
      AUTH_RETENTION_BATCH_SIZE: '0',
    });

    await service.run({}, now);

    expect(runMock).toHaveBeenCalledWith({
      batchSize: 1_000,
      dryRun: true,
      now,
      cutoffs: {
        sessionInactiveBefore: new Date('2026-06-11T12:00:00.000Z'),
        authChallengeBefore: new Date('2026-07-10T12:00:00.000Z'),
        rateLimitBefore: new Date('2026-07-10T12:00:00.000Z'),
      },
    });
  });

  it('rejects an invalid reference time before touching persistence', () => {
    const { runMock, service } = createService();

    expect(() => service.run({}, new Date('invalid'))).toThrow(
      'Auth retention requires a valid current time',
    );
    expect(runMock).not.toHaveBeenCalled();
  });
});
