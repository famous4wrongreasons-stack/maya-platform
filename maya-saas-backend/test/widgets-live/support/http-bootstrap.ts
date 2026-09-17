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
// by a guard or an interceptor is told apart from a write made by a gate. Both wrappers are call-through,
// and HAR-8 (`harness.live-spec.ts`) proves each returns byte-identical results to the unwrapped call.
//
// Two further harness duties (GATES-PLAN-V11 I-HAR), neither a provider override:
//   - the application's logger is `MintProvenanceSink` (`mint-provenance.ts`), installed before `init`: it
//     captures the server's `WidgetMintProvenance` lines (D-17 (3)) when their call site is the application's
//     `src/`, refuses every other call (the static logger it replaces is reachable from test code too), exposes both
//     through `mintProvenance()` and `refusedMintProvenance()`, and with `WIDGETS_EVIDENCE=1` appends captures and
//     refusals to the evidence directory; routine log output is not printed;
//   - before each login the loopback subject's password-login preflight bucket is reset on the proof database
//     (`login-rate-limit.ts`), inside the recorder scope `harness:login-rate-limit`.

import { ConsoleLogger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../src/app.module';
import { configureHttpApp } from '../../../src/bootstrap/configure-http-app';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { IntentGatewayService } from '../../../src/widgets/intent-gateway.service';
import { assertNoEnvFiles } from './environment';
import { EvidenceWriter } from './evidence';
import { resetLoopbackLoginPreflight } from './login-rate-limit';
import { MintProvenanceSink, type MintProvenanceLine } from './mint-provenance';
import { recordingStoreClient, WriteRecorder } from './no-write-recorder';
import { assertProofDatabase } from './proof-db-guard';
import { submissionDefaults } from './bootstrap';

export const GATEWAY_SCOPE = 'gateway';
export const LOGIN_RATE_LIMIT_SCOPE = 'harness:login-rate-limit';

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
  /** The server's `WidgetMintProvenance` lines captured since boot (D-17). */
  mintProvenance(): readonly MintProvenanceLine[];
  /** Calls of that context whose message did not parse; an HTTP evidence test asserts 0 (the BIN runner fails on any). */
  malformedMintProvenance(): number;
  /** Calls of that context from outside the application's `src/`; an HTTP evidence test asserts 0. */
  refusedMintProvenance(): number;
  close(): Promise<void>;
}

/** Throws — never skips — when the application cannot be constructed; the error names what it needed. */
export async function bootHttp(
  evidence: EvidenceWriter = new EvidenceWriter(),
): Promise<HttpHarness> {
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
      `widgets-live HTTP level: AppModule could not be constructed with the widgets-live literals: ${
        (error as Error).message
      }`,
    );
  }
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  const sink = new MintProvenanceSink(
    new ConsoleLogger(),
    (line) => {
      evidence.mintProvenance('HTTP', [line]);
    },
    (reason) => {
      evidence.mintProvenanceRefused('HTTP', reason);
    },
  );
  app.useLogger(sink);
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
      await recorder.within(LOGIN_RATE_LIMIT_SCOPE, () =>
        resetLoopbackLoginPreflight(app.get(PrismaService)),
      );
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
        // P-F88, IR-F88-3: §3.8's required members, filled for a caller that did not name them. A raw
        // shape-stage body never comes through here — those suites call supertest themselves.
        .send({ ...submissionDefaults(), ...body });
      return { status: res.status, body: res.body as unknown };
    },
    mintProvenance: () => sink.captured(),
    malformedMintProvenance: () => sink.malformed(),
    refusedMintProvenance: () => sink.refused(),
    close: async () => {
      await app.get(PrismaService).$disconnect();
      await app.close();
    },
  };
}
