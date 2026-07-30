import { HttpException, HttpStatus } from '@nestjs/common';

export class AuthRateLimitException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    const normalizedRetry = Math.max(1, Math.ceil(retryAfterSeconds));
    const message = 'Too many authentication attempts. Try again later.';

    super(
      {
        message,
        error: {
          code: 'auth_rate_limited',
          message,
          retry_after_seconds: normalizedRetry,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = normalizedRetry;
  }
}
