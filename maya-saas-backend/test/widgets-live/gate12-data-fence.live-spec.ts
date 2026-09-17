// G12-L00 (G12 §6.2): today no canonical read is reachable through the widget route.
//
// LABEL: a REGRESSION GUARD THAT HOLDS BY ABSENCE — NOT ENFORCEMENT. Slot 8 refuses every submission as
// a pending stub, so no slot that could compose an answer runs; the guard pins that nothing reaches an
// owner meanwhile. It counts toward no Gate 12 clause in `gate-conformance-audit.json`. U12a owns this
// file from its landing and adds G12-L14 and the rest beside it.
//
// Setup (G12 §6.2): tokens minted by the real `WidgetEmitterService` for its five kinds, for client A
// (client setup: an active `client` membership, a `Client`, exactly one verified `maya_user` link created
// by `ClientChannelLinkService.link`, and `booking.customer_app`) and for staff S (a `Staff` row). Each
// principal submits each of its own tokens and each of the other's (Gate 3 refuses those).
//
// Per request: every owner spy at 0; the response carries only the controller's six keys; no write by
// the submission, whose one store operation the recorder did see (`findRecord`). Over the run: no new
// `AiToolExecution` row; no owner byte (the markers seeded into the owner rows) in any response or in any
// `Widget*` row of the tenant. At the HTTP level the route is first shown dark for the tenant (403
// `feature_locked` from FeatureGuard, before any grant) and every owner is shown to be constructed.
//
// Two entry levels:
//   [GW]   runs now: the controller and gateway of the real `WidgetsModule`. The owners are not providers
//          of that module, which the test reports; the prototype spies would still see a call made through
//          any instance a slot constructed for itself.
//   [HTTP] XF (plan §4.3). `AppModule` cannot be constructed with the platform-ci.yml literals: the referral
//          and gift-certificate modules require keys CI does not carry (U0 S3 found `npm run test:http`
//          failing the same way). The XF passes only on that configuration failure. It turns red when the
//          application boots — it then runs the HTTP assertions, reports their result on stderr and returns —
//          and must then become a plain `it`. Any other boot failure also turns it red. (U0 S5 ran it once
//          with scratch-only placeholder keys: the application booted and every HTTP assertion held.)

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import {
  K3_EMITTABLE_KINDS,
  WidgetEmitterService,
  type K3EmittableKind,
} from '../../src/widgets/emission/emitter.service';
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
import { WIDGET_MODELS } from './support/no-write-recorder';
import {
  CANONICAL_READ_OWNERS,
  installOwnerSpies,
  ownersAbsentFrom,
  type OwnerSpies,
} from './support/owner-spies';

/** `widgets.controller.ts`'s response: these six keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'outcome',
  'stopped_at_gate',
];

interface Principal<C> {
  readonly label: string;
  readonly actor: Readonly<AuthenticatedUser>;
  /** What the level submits with: the actor itself (GW) or an access token from the login route (HTTP). */
  readonly credential: C;
  readonly tokens: Record<K3EmittableKind, WidgetFixture>;
}

interface Level<C> {
  /** A principal for `user`, established the way this level's requests establish one. */
  principal(
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<{ actor: Readonly<AuthenticatedUser>; credential: C }>;
  /** One submission; returns the HTTP status and the response body. */
  submit(
    credential: C,
    intentToken: string,
    scope: string,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  /** Writes the NW recorder attributes to this submission. */
  writes(scope: string): readonly unknown[];
  /** Every store operation attributed to this submission, as `Model.operation`. */
  operations(scope: string): string[];
}

/** Each principal's own tokens stop at slot 8; the other principal's are refused at Gate 3. */
const expectedStop = (own: boolean) =>
  own
    ? { stopped_at_gate: '8', gates_run: 8, code: 'mechanism_absent' }
    : { stopped_at_gate: '3', gates_run: 3, code: 'widget_principal_mismatch' };

/** Every tenant-scoped `Widget*` row of the tenant, serialised, read through the unrecorded client. */
async function widgetRowsText(
  ctx: FixtureContext,
  tenantId: string,
): Promise<string> {
  const rows: unknown[] = [];
  for (const model of WIDGET_MODELS) {
    const delegate = (
      ctx.prisma as unknown as Record<
        string,
        { findMany: (args: unknown) => Promise<unknown[]> }
      >
    )[model.charAt(0).toLowerCase() + model.slice(1)];
    if (
      ![
        'WidgetCapabilityGap',
        'WidgetMechanismGap',
        'WidgetCapabilityPolicy',
      ].includes(model)
    )
      rows.push(...(await delegate.findMany({ where: { tenantId } })));
  }
  return JSON.stringify(rows);
}

async function runL00<C>(
  ctx: FixtureContext,
  fx: Fixtures,
  level: Level<C>,
  spies: OwnerSpies,
  grantRuntime: boolean,
): Promise<void> {
  const tenant = await fx.tenant('G12-L00');
  const stamp = tenant.slug.slice(-12);
  const clientMarker = `l00markerclient${stamp}`;
  const staffMarker = `l00markerstaff${stamp}`;

  const clientUser = await fx.user(tenant, UserRole.CLIENT, clientMarker);
  await fx.client(tenant, clientUser);
  await fx.grantFeature(tenant, 'booking.customer_app');
  const staffUser = await fx.user(tenant, UserRole.STAFF);
  await fx.staff(tenant, staffUser, staffMarker);

  const principal = async (
    label: string,
    user: UserFixture,
  ): Promise<Principal<C>> => {
    const { actor, credential } = await level.principal(tenant, user);
    const tokens = {} as Record<K3EmittableKind, WidgetFixture>;
    for (const kind of K3_EMITTABLE_KINDS)
      tokens[kind] = await fx.widget({
        tenant,
        actor,
        kind,
        body: { kind, note: 'G12-L00 body' },
      });
    return { label, actor, credential, tokens };
  };
  const a = await principal('client A', clientUser);
  const s = await principal('staff S', staffUser);
  expect(a.actor.role).toBe(UserRole.CLIENT);
  expect(s.actor.role).toBe(UserRole.STAFF);

  if (grantRuntime) {
    // The route is dark until the tenant holds `widgets.runtime`: FeatureGuard refuses before the gateway.
    const dark = await level.submit(
      a.credential,
      a.tokens.METRIC.intentToken,
      'G12-L00: before the widgets.runtime grant',
    );
    expect(dark.status).toBe(403);
    expect(dark.body).toMatchObject({ error: { code: 'feature_locked' } });
    expect(spies.called()).toEqual([]);
    await fx.grantFeature(tenant, 'widgets.runtime');
  }

  const aiToolExecutionsBefore = await ctx.prisma.aiToolExecution.count({
    where: { tenantId: tenant.id },
  });

  let requests = 0;
  for (const submitter of [a, s])
    for (const owner of [a, s])
      for (const kind of K3_EMITTABLE_KINDS) {
        const scope = `G12-L00: ${submitter.label} submits ${owner.label}'s ${kind}`;
        const { status, body } = await level.submit(
          submitter.credential,
          owner.tokens[kind].intentToken,
          scope,
        );
        requests += 1;

        expect({ scope, status }).toEqual({ scope, status: 200 });
        expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS);
        expect(body).toMatchObject({
          contract: 'maya.widget.intent/1',
          outcome: 'refuse',
          gates_total: 15,
          ...expectedStop(submitter === owner),
        });
        expect({ scope, ownerCalls: spies.called() }).toEqual({
          scope,
          ownerCalls: [],
        });
        expect({ scope, writes: level.writes(scope) }).toEqual({
          scope,
          writes: [],
        });
        // The recorder did see this submission: its one read is `findRecord`, so "no write" is not silence.
        expect({ scope, operations: level.operations(scope) }).toEqual({
          scope,
          operations: ['WidgetIntentRecord.findFirst'],
        });
        const text = JSON.stringify(body);
        expect(text).not.toContain(clientMarker);
        expect(text).not.toContain(staffMarker);
      }

  expect(requests).toBe(20);
  expect(
    await ctx.prisma.aiToolExecution.count({ where: { tenantId: tenant.id } }),
  ).toBe(aiToolExecutionsBefore);
  const widgetText = await widgetRowsText(ctx, tenant.id);
  expect(widgetText).not.toContain(clientMarker);
  expect(widgetText).not.toContain(staffMarker);
}

describe('G12-L00 — no canonical read is reachable through the widget route (regression guard; holds by absence, not enforcement)', () => {
  let ctx: FixtureContext;
  let spies: OwnerSpies;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
  });
  beforeEach(() => {
    spies = installOwnerSpies();
  });
  afterEach(() => {
    spies.restore();
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

    it("G12-L00 [GW] holds by absence: client A's and staff S's tokens for the emitter's five kinds reach no owner read, answer with the controller's six keys only, add no AiToolExecution row, carry no owner byte and write nothing", async () => {
      // Unreachable by construction at this level: the gateway's module holds none of the owners.
      expect(ownersAbsentFrom(gw.moduleRef).sort()).toEqual(
        [...new Set(CANONICAL_READ_OWNERS.map((m) => m.owner.name))].sort(),
      );
      let mark = 0;
      const level: Level<Readonly<AuthenticatedUser>> = {
        principal: async (tenant, user) => {
          const actor = await fx.actor(tenant, user);
          return { actor, credential: actor };
        },
        submit: async (actor, intentToken, scope) => {
          mark = gw.recorder.mark();
          const body = await gw.intent(
            actor,
            { intent_token: intentToken },
            scope,
          );
          return {
            status: 200,
            body: body as unknown as Record<string, unknown>,
          };
        },
        // In scope, or anywhere after the submission began: nothing else uses the recorded client here.
        writes: (scope) => [
          ...new Set([
            ...gw.recorder.writes(scope),
            ...gw.recorder.since(mark).filter((op) => op.write),
          ]),
        ],
        operations: (scope) =>
          gw.recorder.inScope(scope).map((op) => `${op.model}.${op.operation}`),
      };
      await runL00(ctx, fx, level, spies, false);
    });
  });

  describe('[HTTP]', () => {
    /**
     * The one failure this XF stands for: a required MAYA_* key the platform-ci.yml literals lack, reported
     * by its own boot-time validator. Only these keys and these validators' exact messages
     * (`referrals.module.ts`, `gift-certificates.module.ts`, `loyalty.module.ts`); any other key — e.g.
     * `DATABASE_URL is not configured` or an Action Engine `… is not configured` — turns the XF red.
     */
    const CONFIGURATION_BLOCKER = new RegExp(
      '^widgets-live HTTP level: AppModule could not be constructed with the platform-ci\\.yml literals: (?:' +
        [
          '(?:MAYA_REFERRAL_REWARD_PRESENTATION_KEY|MAYA_REFERRAL_REWARD_CLAIM_SECRET|MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY|MAYA_GIFT_CERTIFICATE_CLAIM_SECRET) must contain from 32 to 256 characters',
          '(?:MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION|MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION) is invalid',
          'MAYA_LOYALTY_REDEMPTION_CODE_PEPPER must contain at least 32 characters',
        ].join('|') +
        ')$',
    );
    const blockerMessage = (reason: string) =>
      `widgets-live HTTP level: AppModule could not be constructed with the platform-ci.yml literals: ${reason}`;

    it.each([
      [
        'MAYA_REFERRAL_REWARD_PRESENTATION_KEY must contain from 32 to 256 characters',
        true,
      ],
      [
        'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET must contain from 32 to 256 characters',
        true,
      ],
      ['MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION is invalid', true],
      [
        'MAYA_LOYALTY_REDEMPTION_CODE_PEPPER must contain at least 32 characters',
        true,
      ],
      ['DATABASE_URL is not configured', false],
      ['ACTION_ENGINE_IDENTITY_SECRET is not configured', false],
      [
        'CLIENT_IDENTITY_HASH_SECRET must contain from 32 to 256 characters',
        false,
      ],
      ['MAYA_UNKNOWN_KEY is not configured', false],
      [
        'MAYA_REFERRAL_REWARD_PRESENTATION_KEY must contain from 32 to 256 characters; and more',
        false,
      ],
    ])('the XF blocker pattern: %j → %s', (reason, blocker) => {
      expect(CONFIGURATION_BLOCKER.test(blockerMessage(reason))).toBe(blocker);
    });

    it.failing(
      'XF G12-L00 [HTTP]: blocked — AppModule cannot be constructed with the platform-ci.yml literals (a required MAYA_* key is absent); red once the application boots, then convert to a plain it',
      async () => {
        let http: HttpHarness;
        try {
          http = await bootHttp();
        } catch (error) {
          const message = (error as Error).message;
          if (CONFIGURATION_BLOCKER.test(message)) throw error; // the documented blocker: XF passes
          process.stderr.write(
            `G12-L00 [HTTP] unexpected boot failure: ${message}\n`,
          );
          return; // any other failure turns the XF red
        }

        const fx = new Fixtures(ctx, {
          stores: http.app.get(WidgetStoresService),
          emitter: http.app.get(WidgetEmitterService),
        });
        try {
          // At this level the application constructs every owner, so the spies watch live instances.
          expect(ownersAbsentFrom(http.app)).toEqual([]);
          const level: Level<string> = {
            principal: async (tenant, user) => {
              const token = await http.login(
                tenant.slug,
                user.email,
                user.password,
              );
              return {
                actor: await fx.actorFromAccessToken(token),
                credential: token,
              };
            },
            submit: async (token, intentToken) => {
              http.recorder.clear();
              const res = await http.postIntent(token, {
                intent_token: intentToken,
              });
              return {
                status: res.status,
                body: res.body as Record<string, unknown>,
              };
            },
            writes: () => http.recorder.writes(GATEWAY_SCOPE),
            operations: () =>
              http.recorder
                .inScope(GATEWAY_SCOPE)
                .map((op) => `${op.model}.${op.operation}`),
          };
          await runL00(ctx, fx, level, spies, true);
          process.stderr.write(
            'G12-L00 [HTTP] booted and its assertions held: convert this XF to it\n',
          );
        } catch (error) {
          process.stderr.write(
            `G12-L00 [HTTP] booted and its assertions FAILED: ${(error as Error).message}\n`,
          );
        } finally {
          await fx.teardown();
          await http.close();
        }
        // Reaching here, the application booted: the XF is red by construction.
      },
    );
  });
});
