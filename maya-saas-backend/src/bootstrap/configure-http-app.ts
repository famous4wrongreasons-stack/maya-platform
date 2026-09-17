import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ValidationError } from 'class-validator';
import { json, urlencoded } from 'express';

import { flattenValidationErrors } from '../common/validation-errors';

const DEFAULT_JSON_BODY_LIMIT = '100kb';
const SPEECH_JSON_BODY_LIMIT = '2mb';

/**
 * The HTTP surface every request meets before a guard runs: the body parsers and their limits, the
 * `api` prefix, and the global validation pipe with its error shape.
 *
 * Extracted unchanged from `main.ts` (U0 item 8) so the production binary and the live-path HTTP
 * harness configure the application the same way and cannot drift. Without the prefix,
 * `/api/widgets/intent` is a 404; without the pipe, `forbidNonWhitelisted` does not hold.
 *
 * The application must be created with `bodyParser: false`, as `main.ts` does, so these parsers are
 * the only ones. Call this before any other `app.use`: Express runs middleware in registration order,
 * and the route-specific parsers must precede the default one.
 */
export const configureHttpApp = (app: NestExpressApplication): void => {
  // Native voice messages are WAV/PCM encoded as base64 JSON. A normal spoken
  // phrase exceeds Express' 100 KB default, so only this route gets a larger
  // parser while every other JSON endpoint keeps the conservative limit.
  app.use('/api/ai/transcribe', json({ limit: SPEECH_JSON_BODY_LIMIT }));
  // Existing 6 MiB team chunks are base64 transport into an admitted private
  // reservation. The owner enforces exact bytes; ordinary endpoints stay small.
  app.use(
    /^\/api\/team-communications\/attachments\/[A-Za-z0-9_.:-]+\/chunks\/[0-9]+$/,
    json({ limit: '9mb' }),
  );
  app.use(json({ limit: DEFAULT_JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: DEFAULT_JSON_BODY_LIMIT }));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = flattenValidationErrors(errors);
        const first = details[0];
        const message = first?.message || 'Validation failed';

        return new BadRequestException({
          message,
          error: {
            code: 'validation',
            message,
            field: first?.field,
            details,
          },
        });
      },
    }),
  );
};
