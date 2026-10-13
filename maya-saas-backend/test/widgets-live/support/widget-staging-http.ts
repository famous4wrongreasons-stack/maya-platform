import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { configureHttpApp } from '../../../src/bootstrap/configure-http-app';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuthSessionService } from '../../../src/auth/auth-session.service';
import { JwtStrategy } from '../../../src/auth/jwt.strategy';
import { EncryptionService } from '../../../src/encryption/encryption.service';
import { TenantContextService } from '../../../src/tenancy/tenant-context.service';
import { WidgetStoresService } from '../../../src/widgets/stores/widget-stores.service';
import { WidgetEmitterService } from '../../../src/widgets/emission/emitter.service';
import { MAYA_FEATURE_REGISTRY } from '../../../src/common/feature-catalog';
import { Fixtures, type TenantFixture } from './fixtures';
import type { FixtureContext } from './bootstrap';
import {
  loopbackLoginPreflightHashes,
  PASSWORD_LOGIN_IP_PREFLIGHT_POLICY,
} from './login-rate-limit';
import { assertStagingProofDatabase } from './widget-staging-environment';
import { assertNoEnvFiles } from './environment';

/** Whole AppModule, actual guards and DB. No provider/authority override, no widget fixture grant. */
export async function bootStagingHttp() {
  assertStagingProofDatabase(process.env.DATABASE_URL);
  assertNoEnvFiles();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureHttpApp(app);
  await app.listen(0, '127.0.0.1');
  const prisma = app.get(PrismaService);
  const close = async () => {
    await prisma.$disconnect();
    await app.close();
  };
  const db: FixtureContext = {
    moduleRef,
    prisma,
    config: app.get(ConfigService),
    encryption: app.get(EncryptionService),
    tenantContext: app.get(TenantContextService),
    sessions: app.get(AuthSessionService),
    jwt: app.get(JwtService),
    jwtStrategy: app.get(JwtStrategy),
    close,
  };
  const post = (token: string, route: string, body: object) =>
    request(app.getHttpServer())
      .post(route)
      .set('Authorization', 'Bearer ' + token)
      .send(body);
  const http = {
    app,
    close,
    login: async (tenantSlug: string, email: string, password: string) => {
      assertStagingProofDatabase(process.env.DATABASE_URL);
      await prisma.authRateLimitBucket.deleteMany({
        where: {
          policyKey: PASSWORD_LOGIN_IP_PREFLIGHT_POLICY,
          tenantId: null,
          subjectHash: { in: loopbackLoginPreflightHashes(process.env) },
        },
      });
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ tenantSlug, email, password });
      expect(response.status).toBe(201);
      return (response.body as { access_token: string }).access_token;
    },
    executeTool: (
      token: string,
      tool: string,
      body: object,
      requestId: string,
    ) =>
      post(token, '/api/ai/tools/' + tool + '/execute', body).set(
        'X-Request-Id',
        requestId,
      ),
    postIntent: (token: string, body: object) =>
      post(token, '/api/widgets/intent', body),
  };
  const fx = new Fixtures(db, {
    stores: app.get(WidgetStoresService),
    emitter: app.get(WidgetEmitterService),
  });
  return { db, http, fx };
}
/** Only ancillary fixture features. widgets.runtime must always use the real AR-1 writer. */
export async function grantStagingAncillaryFeature(
  db: FixtureContext,
  tenant: TenantFixture,
  key: 'ai.consultant' | 'booking' | 'booking.customer_app' | 'crm.integration',
) {
  assertStagingProofDatabase(process.env.DATABASE_URL);
  if (
    ![
      'ai.consultant',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ].includes(key) ||
    !tenant.slug.startsWith('widgets-live-')
  )
    throw new Error('ancillary synthetic feature boundary');
  const feature = MAYA_FEATURE_REGISTRY[key];
  await db.prisma.feature.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name: feature.name,
      description: feature.description,
      module: feature.module,
      status: feature.status,
    },
  });
  await db.prisma.tenantEntitlement.create({
    data: { tenantId: tenant.id, featureKey: key, enabled: true },
  });
}
