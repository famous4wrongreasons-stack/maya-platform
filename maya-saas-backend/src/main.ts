import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { resolveAuthTrustedProxies } from './auth/auth-client-metadata';
import { configureHttpApp } from './bootstrap/configure-http-app';
import {
  isCorsOriginAllowed,
  isSwaggerEnabled,
  resolveCorsAllowlist,
  resolveNodeEnvironment,
} from './config/security-config';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);

  // Body parsers and their limits, the `api` prefix and the global validation pipe, shared with the
  // live-path HTTP harness so the two cannot drift. It registers the parsers first, so they still
  // precede every other middleware below (CORS included), exactly as when they were inline here.
  configureHttpApp(app);

  app.disable('x-powered-by');
  app.enableShutdownHooks();
  app.set(
    'trust proxy',
    resolveAuthTrustedProxies(configService.get<string>('AUTH_TRUST_PROXY')),
  );
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
