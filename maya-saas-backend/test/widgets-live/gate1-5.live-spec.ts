import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { SealService } from '../../src/widgets/emission/seal.service';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { widgetFloorDivergence } from '../../src/widgets/gates/gate5';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import {
  Fixtures,
  type TenantFixture,
  type UserFixture,
  type WidgetFixture,
} from './support/fixtures';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';

const body = (record: WidgetFixture, widgetId = record.widgetId) => ({
  widget_id: widgetId,
  intent_token: record.intentToken,
});

const reseal = async (
  ctx: FixtureContext,
  seal: SealService,
  record: WidgetFixture,
): Promise<void> => {
  const stored = await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
    where: {
      tenantId: record.tenantId,
      intentTokenHash: record.intentTokenHash,
    },
    select: { principalProofHash: true },
  });
  const emission = await ctx.prisma.widgetEmission.findFirstOrThrow({
    where: { tenantId: record.tenantId, widgetId: record.widgetId },
    select: {
      bodyHash: true,
      widgetId: true,
      tenantId: true,
      issuedAt: true,
      expiresAt: true,
    },
  });
  await ctx.prisma.widgetEmission.update({
    where: {
      widgetId_tenantId: {
        widgetId: record.widgetId,
        tenantId: record.tenantId,
      },
    },
    data: {
      envelopeSeal: seal.seal({
        ...emission,
        principalProofHash: stored.principalProofHash,
        profileId: null,
      }),
    },
  });
};

interface Level<C> {
  principal(
    fx: Fixtures,
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<{
    actor: Readonly<AuthenticatedUser>;
    credential: C;
  }>;
  submit(
    credential: C,
    payload: Record<string, unknown>,
    scope: string,
  ): Promise<Record<string, unknown>>;
  writes(scope: string): readonly unknown[];
  seal: SealService;
}

const runCases = <C>(
  label: string,
  fixtureContext: () => FixtureContext,
  fixtures: () => Fixtures,
  level: () => Level<C>,
): void => {
  const setup = async () => {
    const fx = fixtures();
    const l = level();
    const tenant = await fx.tenant(`P-G15a ${label}`);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const principal = await l.principal(fx, tenant, user);
    const record = await fx.widget({
      tenant,
      actor: principal.actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    await reseal(fixtureContext(), l.seal, record);
    return { fx, l, tenant, record, ...principal };
  };

  it(`G15-1 [${label}] a forged token answers code-less EXPIRED and writes nothing`, async () => {
    const x = await setup();
    const scope = `G15-1 ${label}`;
    const answer = await x.l.submit(
      x.credential,
      { ...body(x.record), intent_token: `${x.record.intentToken}forged` },
      scope,
    );
    expect(answer.outcome).toBe('expired');
    expect(answer.code).toBeNull();
    expect(answer.stopped_at_gate).toBe('1');
    expect(x.l.writes(scope)).toEqual([]);
  }, 120_000);

  it(`G15-2 [${label}] tampering with the stored body hash invalidates the seal`, async () => {
    const x = await setup();
    await fixtureContext().prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: x.record.widgetId,
          tenantId: x.record.tenantId,
        },
      },
      data: { bodyHash: 'f'.repeat(64) },
    });
    const scope = `G15-2 ${label}`;
    const answer = await x.l.submit(x.credential, body(x.record), scope);
    expect(answer.outcome).toBe('expired');
    expect(answer.code).toBeNull();
    expect(answer.stopped_at_gate).toBe('1');
    expect(x.l.writes(scope)).toEqual([]);
  }, 120_000);

  it(`G15-3 [${label}] a mismatched widget id answers code-less EXPIRED`, async () => {
    const x = await setup();
    const scope = `G15-3 ${label}`;
    const answer = await x.l.submit(
      x.credential,
      body(x.record, randomUUID()),
      scope,
    );
    expect(answer.outcome).toBe('expired');
    expect(answer.code).toBeNull();
    expect(answer.stopped_at_gate).toBe('1');
    expect(x.l.writes(scope)).toEqual([]);
  }, 120_000);

  it(`G15-4 [${label}] floor drift answers SUPERSEDED, increments only the process metric and writes nothing`, async () => {
    const x = await setup();
    await x.fx.synthetic(
      x.record,
      {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'catalog.services.read',
      },
      'ANONYMOUS',
    );
    widgetFloorDivergence.reset();
    const scope = `G15-4 ${label}`;
    const answer = await x.l.submit(x.credential, body(x.record), scope);
    expect(answer.outcome).toBe('superseded');
    expect(answer.code).toBe('policy_floor_changed');
    expect(answer.stopped_at_gate).toBe('5');
    expect(widgetFloorDivergence.count).toBe(1);
    expect(x.l.writes(scope)).toEqual([]);
  }, 120_000);
};

describe('P-G15a — Gates 1 and 5 on the live PostgreSQL path', () => {
  let ctx: FixtureContext;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  describe('[GW]', () => {
    let gw: GatewayHarness;
    let fx: Fixtures;
    beforeAll(async () => {
      gw = await bootGateway();
      fx = new Fixtures(ctx, gw);
    });
    afterEach(async () => {
      await fx.teardown();
      gw.recorder.clear();
    });
    afterAll(async () => {
      await gw?.close();
    });
    runCases(
      'GW',
      () => ctx,
      () => fx,
      () => ({
        seal: gw.moduleRef.get(SealService),
        principal: async (builder, tenant, user) => {
          const actor = await builder.actor(tenant, user);
          return { actor, credential: actor };
        },
        submit: async (actor, payload, scope) =>
          await gw.intent(actor, payload, scope),
        writes: (scope) => gw.recorder.writes(scope),
      }),
    );
  });

  describe('[HTTP]', () => {
    let http: HttpHarness;
    let fx: Fixtures;
    beforeAll(async () => {
      http = await bootHttp();
      fx = new Fixtures(ctx, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
    });
    afterEach(async () => {
      await fx.teardown();
      http.recorder.clear();
    });
    afterAll(async () => {
      await http?.close();
    });
    runCases(
      'HTTP',
      () => ctx,
      () => fx,
      () => ({
        seal: http.app.get(SealService),
        principal: async (builder, tenant, user) => {
          await builder.grantFeature(tenant, 'widgets.runtime');
          const credential = await http.login(
            tenant.slug,
            user.email,
            user.password,
          );
          return {
            actor: await builder.actorFromAccessToken(credential),
            credential,
          };
        },
        submit: async (credential, payload) => {
          http.recorder.clear();
          return (await http.postIntent(credential, payload)).body as Record<
            string,
            unknown
          >;
        },
        writes: () => http.recorder.writes(GATEWAY_SCOPE),
      }),
    );
  });
});
