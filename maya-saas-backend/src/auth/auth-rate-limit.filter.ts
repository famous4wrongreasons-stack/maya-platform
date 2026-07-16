import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { AuthRateLimitException } from './auth-rate-limit.exception';

@Catch(AuthRateLimitException)
export class AuthRateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: AuthRateLimitException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
