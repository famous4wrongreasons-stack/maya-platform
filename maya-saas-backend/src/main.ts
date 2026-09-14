import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import type { ValidationError } from 'class-validator';

import { AppModule } from './app.module';
import { resolveAuthTrustedProxies } from './auth/auth-client-metadata';
import { flattenValidationErrors } from './common/validation-errors';
import {
  isCorsOriginAllowed,
  isSwaggerEnabled,
  resolveCorsAllowlist,
  resolveNodeEnvironment,
} from './config/security-config';
import { PrismaService } from './prisma/prisma.service';

const DEFAULT_JSON_BODY_LIMIT = '100kb';
const SPEECH_JSON_BODY_LIMIT = '2mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);

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

  app.disable('x-powered-by');
  app.enableShutdownHooks();
  app.set(
    'trust proxy',
    resolveAuthTrustedProxies(configService.get<string>('AUTH_TRUST_PROXY')),
  );
  app.setGlobalPrefix('api');
  const environment = resolveNodeEnvironment(
    configService.get<string>('NODE_ENV'),
  );
  const corsAllowlist = resolveCorsAllowlist(
    configService.get<string>('CORS_ALLOWED_ORIGINS'),
    environment,
  );

  app.enableCors({
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-ID',
    ],
    credentials: false,
    exposedHeaders: ['Retry-After'],
    maxAge: 600,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: (origin, callback) => {
      callback(null, isCorsOriginAllowed(origin, corsAllowlist, environment));
    },
  });
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

  if (
    isSwaggerEnabled(configService.get<string>('SWAGGER_ENABLED'), environment)
  ) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Maya SaaS Backend')
      .setDescription('Multi-tenant white-label backend for Maya App')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  app.get(PrismaService).enableShutdownHooks(app);
  const port = configService.get<number>('PORT') ?? 3000;
  const host = configService.get<string>('HOST')?.trim();

  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
}
void bootstrap();
