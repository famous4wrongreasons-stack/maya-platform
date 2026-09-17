// The two entry levels of the one widgets-live harness (plan §4.2, D-13).
//
// GW — gateway, live code. The real `WidgetsModule` over the real store client, with configuration from
//   the platform-ci.yml literals and the global `TenancyModule` (so a submission runs inside the request
//   CLS a live request has). A submission is made the way the route makes it: the body becomes a
//   `SubmitIntentDto` under the global pipe's options, the arguments come from `intentSubmitArgs(dto,
//   actor)` (never a hand-supplied level or carrier), and it runs inside `TenantContextService.run` with
//   `TenantResolverService.bindAuthenticatedUser(actor)` (D-4), the call `TenantAccessGuard` makes.
//
// HTTP — the live route: `http-bootstrap.ts` (kept apart so a gateway-level suite does not load the
//   whole application's module graph).
//
// Both levels bind one provider for the harness itself: the `PrismaService` token resolves to the real
// store client extended with the NW recorder's observing hook (`no-write-recorder.ts`). Nothing else is
// overridden here. A gate suite that needs an owner-port override (G8R's stub owners, G10's corpus, G13's
// recording doubles) adds it itself and says so in the test name.
//
// Fixture writes use a separate context (`bootFixtureContext`) with its own, unrecorded store client and
// the real auth owners, so building a principal never shows up as a write of the system under test.

import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';

import { AuthModule } from '../../../src/auth/auth.module';
import { AuthSessionService } from '../../../src/auth/auth-session.service';
import { JwtStrategy } from '../../../src/auth/jwt.strategy';
import type { AuthenticatedUser } from '../../../src/common/authenticated-user.interface';
import { EncryptionModule } from '../../../src/encryption/encryption.module';
import { EncryptionService } from '../../../src/encryption/encryption.service';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TenancyModule } from '../../../src/tenancy/tenancy.module';
import { TenantContextService } from '../../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../../src/tenancy/tenant-resolver.service';
import { SubmitIntentDto } from '../../../src/widgets/dto/submit-intent.dto';
import { WidgetEmitterService } from '../../../src/widgets/emission/emitter.service';
import { IntentGatewayService } from '../../../src/widgets/intent-gateway.service';
import { intentSubmitArgs } from '../../../src/widgets/intent-submit-args';
import { WidgetStoresService } from '../../../src/widgets/stores/widget-stores.service';
import { WidgetsController } from '../../../src/widgets/widgets.controller';
import { WidgetsModule } from '../../../src/widgets/widgets.module';
import { recordingStoreClient, WriteRecorder } from './no-write-recorder';
import { assertProofDatabase } from './proof-db-guard';

/** The imports of the gateway-level module, exactly (checked by `harness.live-spec.ts`). */
export const GATEWAY_LEVEL_IMPORTS = [
  'ConfigModule',
  'PrismaModule',
  'TenancyModule',
  'WidgetsModule',
] as const;

/** Configuration from the process environment the harness has already scrubbed; no env file. */
const harnessConfig = () =>
  ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true });

type GatewayResult = Awaited<ReturnType<IntentGatewayService['submit']>>;
type ControllerResponse = Awaited<ReturnType<WidgetsController['intent']>>;

/** The route's body, as the global ValidationPipe would admit it (whitelist, forbidNonWhitelisted). */
export async function toSubmitIntentDto(
  body: Record<string, unknown>,
): Promise<SubmitIntentDto> {
  const dto = plainToInstance(SubmitIntentDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0)
    throw new Error(
      `widgets-live: the body would be refused by the global ValidationPipe before the route (${errors
        .map((e) => e.property)
        .join(', ')})`,
    );
  return dto;
}

export interface GatewayHarness {
  readonly moduleRef: TestingModule;
  readonly gateway: IntentGatewayService;
  readonly controller: WidgetsController;
  readonly stores: WidgetStoresService;
  readonly emitter: WidgetEmitterService;
  readonly recorder: WriteRecorder;
  /** `IntentGatewayService.submit(intentSubmitArgs(dto, actor))` in the request CLS, inside `scope`. */
  submit(
    actor: Readonly<AuthenticatedUser>,
    body: Record<string, unknown>,
    scope: string,
  ): Promise<GatewayResult>;
  /** `WidgetsController.intent(dto, actor)` in the request CLS, inside `scope`: the route's response. */
  intent(
    actor: Readonly<AuthenticatedUser>,
    body: Record<string, unknown>,
    scope: string,
  ): Promise<ControllerResponse>;
  close(): Promise<void>;
}

export async function bootGateway(): Promise<GatewayHarness> {
  assertProofDatabase(process.env);
  const recorder = new WriteRecorder();
  const moduleRef = await Test.createTestingModule({
    imports: [harnessConfig(), PrismaModule, TenancyModule, WidgetsModule],
  })
    .overrideProvider(PrismaService)
    .useFactory({
      factory: (config: ConfigService) =>
        recordingStoreClient(recorder, config),
      inject: [ConfigService],
    })
    .compile();
  await moduleRef.init();

  const gateway = moduleRef.get(IntentGatewayService);
  const controller = moduleRef.get(WidgetsController);
  const context = moduleRef.get(TenantContextService);
  const resolver = moduleRef.get(TenantResolverService);

  const inRequest = <T>(
    actor: Readonly<AuthenticatedUser>,
    scope: string,
    work: () => Promise<T>,
  ): Promise<T> =>
    context.run(`widgets-live:${randomUUID()}`, () => {
      resolver.bindAuthenticatedUser(actor);
      return recorder.within(scope, work);
    });

  return {
    moduleRef,
    gateway,
    controller,
    stores: moduleRef.get(WidgetStoresService),
    emitter: moduleRef.get(WidgetEmitterService),
    recorder,
    submit: async (actor, body, scope) => {
      const dto = await toSubmitIntentDto(body);
      return inRequest(actor, scope, () =>
        gateway.submit(intentSubmitArgs(dto, actor)),
      );
    },
    intent: async (actor, body, scope) => {
      const dto = await toSubmitIntentDto(body);
      return inRequest(actor, scope, () =>
        controller.intent(dto, actor as AuthenticatedUser),
      );
    },
    close: async () => {
      await moduleRef.get(PrismaService).$disconnect();
      await moduleRef.close();
    },
  };
}

/** The real owners the fixture builders call, over a store client the NW recorder does not see. */
export interface FixtureContext {
  readonly moduleRef: TestingModule;
  readonly prisma: PrismaService;
  readonly config: ConfigService;
  readonly encryption: EncryptionService;
  readonly tenantContext: TenantContextService;
  readonly sessions: AuthSessionService;
  readonly jwt: JwtService;
  readonly jwtStrategy: JwtStrategy;
  close(): Promise<void>;
}

export async function bootFixtureContext(): Promise<FixtureContext> {
  assertProofDatabase(process.env);
  const moduleRef = await Test.createTestingModule({
    imports: [
      harnessConfig(),
      PrismaModule,
      TenancyModule,
      EncryptionModule,
      AuthModule,
    ],
  }).compile();
  await moduleRef.init();
  const prisma = moduleRef.get(PrismaService);
  return {
    moduleRef,
    prisma,
    config: moduleRef.get(ConfigService),
    encryption: moduleRef.get(EncryptionService),
    tenantContext: moduleRef.get(TenantContextService),
    sessions: moduleRef.get(AuthSessionService, { strict: false }),
    jwt: moduleRef.get(JwtService, { strict: false }),
    jwtStrategy: moduleRef.get(JwtStrategy, { strict: false }),
    close: async () => {
      await prisma.$disconnect();
      await moduleRef.close();
    },
  };
}
