import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { resolveAuthTrustedProxies } from './auth/auth-client-metadata';
import {
  isCorsOriginAllowed,
  isSwaggerEnabled,
  resolveCorsAllowlist,
  resolveNodeEnvironment,
} from './config/security-config';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.disable('x-powered-by');
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
        const details = errors.flatMap((error) =>
          Object.values(error.constraints || {}).map((message) => ({
            field: error.property,
            message,
          })),
        );
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
