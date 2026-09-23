import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { SuccessorMinterService } from '../../src/widgets/emission/successor-minter.service';
import { widgetFloorDivergence } from '../../src/widgets/gates/gate5';
import { Gate6OwnersAdapter } from '../../src/widgets/owner-ports/gate6.owners.provider';
import { WidgetProjectorService } from '../../src/widgets/projection/widget-projector.service';
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
import type { RecordedOperation } from './support/no-write-recorder';

const body = (record: WidgetFixture, widgetId = record.widgetId) => ({
  widget_id: widgetId,
  intent_token: record.intentToken,
});

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

interface SuccessorLevel<C> extends Level<C> {
  readonly successor: SuccessorMinterService;
  writes(scope: string): readonly RecordedOperation[];
  operations(scope: string): readonly RecordedOperation[];
}

const successorEnvelope = (answer: Record<string, unknown>) => {
  const envelope = answer.next_envelope;
  if (envelope === null || typeof envelope !== 'object')
    throw new Error('expected one successor envelope');
  const value = envelope as {
    widget_id: string;
    kind: string;
    presentation: { text_equivalent: Record<string, unknown> };
    intents: Array<{
      intent_token: string;
      role: string;
      effect: string;
      capability: { space: string; key: string };
    }>;
  };
  expect(value.intents).toHaveLength(1);
  expect(value.intents[0]).toEqual(
    expect.objectContaining({
      role: 'remedy',
      effect: 'REFINE',
    }),
  );
  return value;
};

const runSuccessorCases = <C>(
  label: string,
  fixtureContext: () => FixtureContext,
  fixtures: () => Fixtures,
  level: () => SuccessorLevel<C>,
): void => {
  const setup = async (options?: {
    readonly kind?: 'METRIC' | 'SOURCE_STATUS';
    readonly expired?: boolean;
  }) => {
    const fx = fixtures();
    const l = level();
    const tenant = await fx.tenant(`P-G15b ${label}`);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    await fx.staff(tenant, user, `P-G15b ${label}`);
    const principal = await l.principal(fx, tenant, user);
    const record = await fx.widget({
      tenant,
      actor: principal.actor,
      kind: options?.kind ?? 'METRIC',
      body: { value: 1 },
      ...(options?.expired
        ? { ttlSeconds: 1, now: new Date(Date.now() - 10_000) }
        : {}),
    });
    const textEquivalent = {
      headline: `Frozen ${record.widgetId}`,
      body: 'Stored widget-layer text',
    };
    await fixtureContext().prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: record.widgetId,
          tenantId: tenant.id,
        },
      },
      data: { lifecycleState: 'LIVE', textEquivalentJson: textEquivalent },
    });
    return { fx, l, tenant, user, record, textEquivalent, ...principal };
  };

  it(`G15-7 [${label}] own expired returns one stored-text remedy whose tap passes Gates 1–13`, async () => {
    const x = await setup({ expired: true });
    const scope = `G15-7 ${label}`;
    const answer = await x.l.submit(x.credential, body(x.record), scope);
    expect(answer).toEqual(
      expect.objectContaining({
        outcome: 'expired',
        code: null,
        stopped_at_gate: '1',
      }),
    );
    const envelope = successorEnvelope(answer);
    expect(envelope).toEqual(
      expect.objectContaining({
        kind: 'METRIC',
        presentation: { text_equivalent: x.textEquivalent },
      }),
    );
    expect(envelope.intents[0]?.capability).toEqual({
      space: 'C9',
      key: 'c7.measurement.read',
    });
    expect(
      x.l.writes(scope).filter((entry) => entry.model === 'WidgetTimelineTurn'),
    ).toEqual([]);

    const tapped = await x.l.submit(
      x.credential,
      {
        widget_id: envelope.widget_id,
        intent_token: envelope.intents[0].intent_token,
      },
      `${scope}:tap`,
    );
    // P-G15b proves the successor can traverse the complete admission path to
    // the current fail-closed Gate 13 boundary. U12b, the next canonical unit,
    // owns the projector/route registration that turns this into a terminal
    // read. Do not smuggle that later owner into the successor minter.
    expect(tapped).toEqual(
      expect.objectContaining({
        outcome: 'refuse',
        code: 'effect_not_admissible',
        stopped_at_gate: '13',
        gates_run: 14,
      }),
    );
  }, 120_000);

  it(`G15-8 [${label}] own superseded returns the already linked successor without minting another`, async () => {
    const x = await setup();
    const principal = await x.fx.principalView(x.actor);
    const first = await x.l.successor.mint({
      tenantId: x.tenant.id,
      predecessorWidgetId: x.record.widgetId,
      predecessorIntentTokenHash: x.record.intentTokenHash,
      principal,
    });
    expect(first).not.toBeNull();
    const before = await fixtureContext().prisma.widgetEmission.count({
      where: { tenantId: x.tenant.id },
    });
    const scope = `G15-8 ${label}`;
    const answer = await x.l.submit(x.credential, body(x.record), scope);
    expect(answer).toEqual(
      expect.objectContaining({
        outcome: 'superseded',
        code: null,
        stopped_at_gate: '1',
      }),
    );
    expect(successorEnvelope(answer).widget_id).toBe(first!.widgetId);
    expect(
      await fixtureContext().prisma.widgetEmission.count({
        where: { tenantId: x.tenant.id },
      }),
    ).toBe(before);
    expect(x.l.writes(scope)).toEqual([]);
  }, 120_000);

  it(`G15-9 [${label}] a foreign principal receives code alone`, async () => {
    const x = await setup({ expired: true });
    const foreign = await x.fx.user(x.tenant, UserRole.ADMINISTRATOR);
    await x.fx.staff(x.tenant, foreign, `P-G15b foreign ${label}`);
    const foreignPrincipal = await x.l.principal(x.fx, x.tenant, foreign);
    const scope = `G15-9 ${label}`;
    const answer = await x.l.submit(
      foreignPrincipal.credential,
      body(x.record),
      scope,
    );
    expect(answer).toEqual(
      expect.objectContaining({
        outcome: 'expired',
        next_envelope: null,
      }),
    );
    const foreignView = await x.fx.principalView(foreignPrincipal.actor);
    expect(
      await x.l.successor.mint({
        tenantId: x.tenant.id,
        predecessorWidgetId: x.record.widgetId,
        predecessorIntentTokenHash: x.record.intentTokenHash,
        principal: foreignView,
      }),
    ).toBeNull();
    expect(x.l.writes(scope)).toEqual([]);
  }, 120_000);

  it(`G15-10/G15-11 [${label}] unreadable text and a non-REFINE kind return code alone`, async () => {
    const unreadable = await setup({ expired: true });
    await fixtureContext().prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: unreadable.record.widgetId,
          tenantId: unreadable.tenant.id,
        },
      },
      data: { textEquivalentJson: undefined },
    });
    await fixtureContext().prisma.$executeRaw`
      UPDATE "WidgetEmission"
      SET "textEquivalentJson" = NULL
      WHERE "tenantId" = ${unreadable.tenant.id}
        AND "widgetId" = ${unreadable.record.widgetId}::uuid
    `;
    const unreadableScope = `G15-10 ${label}`;
    const unreadableAnswer = await unreadable.l.submit(
      unreadable.credential,
      body(unreadable.record),
      unreadableScope,
    );
    expect(unreadableAnswer.next_envelope).toBeNull();
    expect(unreadable.l.writes(unreadableScope)).toEqual([]);

    const noRefine = await setup({ kind: 'SOURCE_STATUS', expired: true });
    const noRefineScope = `G15-11 ${label}`;
    const noRefineAnswer = await noRefine.l.submit(
      noRefine.credential,
      body(noRefine.record),
      noRefineScope,
    );
    expect(noRefineAnswer.next_envelope).toBeNull();
    expect(noRefine.l.writes(noRefineScope)).toEqual([]);
  }, 120_000);

  it(`G15-11b [${label}] unregistered and wrong-owner source capabilities return code alone`, async () => {
    for (const [caseName, sourceCapability, inheritedKind] of [
      ['unregistered', 'not.registered', true],
      ['wrong-owner', 'catalog.services.read', false],
    ] as const) {
      const x = await setup({ expired: true });
      if (inheritedKind)
        await fixtureContext().prisma.widgetEmission.update({
          where: {
            widgetId_tenantId: {
              widgetId: x.record.widgetId,
              tenantId: x.tenant.id,
            },
          },
          data: { kind: 'CHOICE' },
        });
      await fixtureContext().prisma.widgetRenderReceipt.updateMany({
        where: { tenantId: x.tenant.id, widgetId: x.record.widgetId },
        data: {
          composedEnvelopeJson: {
            provenance: { source_capability: sourceCapability },
          },
        },
      });
      const scope = `G15-11b-${caseName} ${label}`;
      const answer = await x.l.submit(x.credential, body(x.record), scope);
      expect(answer.next_envelope).toBeNull();
      expect(x.l.writes(scope)).toEqual([]);
    }
  }, 120_000);

  it(`G15-12 [${label}] policy-floor drift returns one remedy`, async () => {
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
    const scope = `G15-12 ${label}`;
    const answer = await x.l.submit(x.credential, body(x.record), scope);
    expect(answer).toEqual(
      expect.objectContaining({
        outcome: 'superseded',
        code: 'policy_floor_changed',
        stopped_at_gate: '5',
      }),
    );
    expect(successorEnvelope(answer).intents[0]?.capability).toEqual({
      space: 'C9',
      key: 'c7.measurement.read',
    });
    expect(
      x.l.writes(scope).filter((entry) => entry.model === 'WidgetTimelineTurn'),
    ).toEqual([]);
  }, 120_000);

  it(`G15-14 [${label}] code-alone branches execute an equal store-operation class`, async () => {
    const signatures: string[][] = [];

    const unreadable = await setup({ expired: true });
    await fixtureContext().prisma.$executeRaw`
      UPDATE "WidgetEmission"
      SET "textEquivalentJson" = NULL
      WHERE "tenantId" = ${unreadable.tenant.id}
        AND "widgetId" = ${unreadable.record.widgetId}::uuid
    `;
    const unreadableScope = `G15-14-unreadable ${label}`;
    const unreadableAnswer = await unreadable.l.submit(
      unreadable.credential,
      body(unreadable.record),
      unreadableScope,
    );
    expect(unreadableAnswer.next_envelope).toBeNull();
    signatures.push(
      unreadable.l
        .operations(unreadableScope)
        .map((entry) => `${entry.model ?? 'raw'}.${entry.operation}`),
    );

    const noRefine = await setup({ kind: 'SOURCE_STATUS', expired: true });
    const noRefineScope = `G15-14-no-refine ${label}`;
    const noRefineAnswer = await noRefine.l.submit(
      noRefine.credential,
      body(noRefine.record),
      noRefineScope,
    );
    expect(noRefineAnswer.next_envelope).toBeNull();
    signatures.push(
      noRefine.l
        .operations(noRefineScope)
        .map((entry) => `${entry.model ?? 'raw'}.${entry.operation}`),
    );

    expect(signatures[0]).toEqual(signatures[1]);
  }, 120_000);
};

describe('P-G15b — R3.9.4 successor on the live PostgreSQL path', () => {
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
    runSuccessorCases(
      'GW',
      () => ctx,
      () => fx,
      () => ({
        successor: gw.successor,
        principal: async (builder, tenant, user) => {
          const actor = await builder.actor(tenant, user);
          return { actor, credential: actor };
        },
        submit: async (actor, payload, scope) =>
          await gw.intent(actor, payload, scope),
        writes: (scope) => gw.recorder.writes(scope),
        operations: (scope) => gw.recorder.inScope(scope),
      }),
    );

    it('G15-13 [GW] successor and code-alone refusal branches call no projector or canonical owner', async () => {
      const projector = jest.spyOn(WidgetProjectorService.prototype, 'compose');
      const ownerExecute = jest.spyOn(
        Gate6OwnersAdapter.prototype,
        'assertCanExecute',
      );
      const ownerEntitlements = jest.spyOn(
        Gate6OwnersAdapter.prototype,
        'grantsRequiredFeatures',
      );

      const tenant = await fx.tenant('P-G15b G15-13');
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      await fx.staff(tenant, user, 'P-G15b G15-13');
      const actor = await fx.actor(tenant, user);
      for (const [index, readable] of [true, false].entries()) {
        const record = await fx.widget({
          tenant,
          actor,
          kind: 'METRIC',
          body: { index },
          ttlSeconds: 1,
          now: new Date(Date.now() - 10_000),
        });
        await ctx.prisma.widgetEmission.update({
          where: {
            widgetId_tenantId: {
              widgetId: record.widgetId,
              tenantId: tenant.id,
            },
          },
          data: {
            lifecycleState: 'LIVE',
            textEquivalentJson: readable ? { body: 'stored' } : undefined,
          },
        });
        if (!readable)
          await ctx.prisma.$executeRaw`
            UPDATE "WidgetEmission"
            SET "textEquivalentJson" = NULL
            WHERE "tenantId" = ${tenant.id}
              AND "widgetId" = ${record.widgetId}::uuid
          `;
        await gw.intent(actor, body(record), `G15-13:${index}`);
        expect({
          projector: projector.mock.calls.length,
          ownerExecute: ownerExecute.mock.calls.length,
          ownerEntitlements: ownerEntitlements.mock.calls.length,
        }).toEqual({ projector: 0, ownerExecute: 0, ownerEntitlements: 0 });
      }
    }, 120_000);
  });

  describe('[HTTP]', () => {
    let http: HttpHarness;
    let fx: Fixtures;
    const granted = new Set<string>();
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
    runSuccessorCases(
      'HTTP',
      () => ctx,
      () => fx,
      () => ({
        successor: http.app.get(SuccessorMinterService),
        principal: async (builder, tenant, user) => {
          if (!granted.has(tenant.id)) {
            await builder.grantFeature(tenant, 'widgets.runtime');
            granted.add(tenant.id);
          }
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
        operations: () => http.recorder.inScope(GATEWAY_SCOPE),
      }),
    );
  });
});
