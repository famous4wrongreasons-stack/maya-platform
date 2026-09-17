// HTTP — the live route (plan §4.2). `AppModule` with `configureHttpApp(app)`, created with
// `bodyParser: false` as `main.ts` creates it: the six APP_GUARDs (JWT → Roles → TenantAccess →
// SubscriptionAccess → Feature → Quota), both interceptors and `TenantResolutionMiddleware` are all
// present, and NONE is overridden. `FeatureGuard` in particular is never replaced: `widgets.runtime`
// reaches a tenant only through a `TenantEntitlement` seeded in the guarded proof database
// (`fixtures.grantFeature`). Access tokens come from the application's own login route.
//
// The one provider bound for the harness is the store client with the NW recorder's observing hook
// (see `bootstrap.ts`). Every call of `IntentGatewayService.submit` is additionally run inside the
// recorder's `gateway` scope, by a spy that calls the real method, so a write made during the request
// by a guard or an interceptor is told apart from a write made by a gate.

import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../src/app.module';
import { configureHttpApp } from '../../../src/bootstrap/configure-http-app';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { IntentGatewayService } from '../../../src/widgets/intent-gateway.service';
import { assertNoEnvFiles } from './environment';
import { recordingStoreClient, WriteRecorder } from './no-write-recorder';
import { assertProofDatabase } from './proof-db-guard';

export const GATEWAY_SCOPE = 'gateway';

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface HttpHarness {
  readonly app: NestExpressApplication;
  readonly recorder: WriteRecorder;
  /** `POST /api/auth/login` for a tenant user; returns the access token. */
  login(tenantSlug: string, email: string, password: string): Promise<string>;
  /** `POST /api/widgets/intent` with a bearer token. */
  postIntent(
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<HttpResponse>;
  close(): Promise<void>;
}

/** Throws — never skips — when the application cannot be constructed; the error names what it needed. */
export async function bootHttp(): Promise<HttpHarness> {
  assertProofDatabase(process.env);
  assertNoEnvFiles();
  const recorder = new WriteRecorder();
  let moduleRef: TestingModule;
  try {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useFactory({
        factory: (config: ConfigService) =>
          recordingStoreClient(recorder, config),
        inject: [ConfigService],
      })
      .compile();
  } catch (error) {
    throw new Error(
      `widgets-live HTTP level: AppModule could not be constructed with the platform-ci.yml literals: ${
        (error as Error).message
      }`,
    );
  }
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureHttpApp(app);
  await app.init();

  const gateway = app.get(IntentGatewayService);
  const submit = gateway.submit.bind(gateway);
  jest
    .spyOn(gateway, 'submit')
    .mockImplementation((args) =>
      recorder.within(GATEWAY_SCOPE, () => submit(args)),
    );

  const server = app.getHttpServer() as Parameters<typeof request>[0];
  return {
    app,
    recorder,
    login: async (tenantSlug, email, password) => {
      const res = await request(server)
        .post('/api/auth/login')
        .send({ tenantSlug, email, password });
      const token = (res.body as { access_token?: unknown }).access_token;
      if (res.status !== 200 && res.status !== 201)
        throw new Error(`widgets-live login refused: HTTP ${res.status}`);
      if (typeof token !== 'string')
        throw new Error('widgets-live login returned no access_token');
      return token;
    },
    postIntent: async (accessToken, body) => {
      const res = await request(server)
        .post('/api/widgets/intent')
        .set('authorization', `Bearer ${accessToken}`)
        .send(body);
      return { status: res.status, body: res.body as unknown };
    },
    close: async () => {
      await app.get(PrismaService).$disconnect();
      await app.close();
    },
  };
}
