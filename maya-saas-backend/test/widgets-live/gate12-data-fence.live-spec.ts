// G12-L00 (G12 §6.2): today no canonical read is reachable through the widget route.
//
// LABEL: a REGRESSION GUARD THAT HOLDS BY ABSENCE — NOT ENFORCEMENT. Slot 8 refuses every submission as
// a pending stub, so no slot that could compose an answer runs; the guard pins that nothing reaches an
// owner meanwhile. It counts toward no Gate 12 clause in `gate-conformance-audit.json`.
//
// U12a owns this file from its landing and adds two things to G12-L00, both of them absences:
//   - the PROJECTOR SPIES. `WidgetProjectorService` now exists, and every submission is asserted to
//     reach none of its three entry points. That is what makes "no canonical read" a statement about
//     the projector rather than about a directory that did not exist yet: before U12a the absence was
//     trivial, and a later unit wiring Gate 13's edge would not have been caught here.
//   - the REGISTRY, read live: `PROJECTOR_REGISTRY` is empty and `ROWS_BLOCKED_BY` is not, in the same
//     process that served the requests (ARCH-12-13's live half). The skeleton shipped DARK.
// G12-L14 and the positive compositions are U12b's, on rows that do not exist yet.
//
// §3.8 (P-F88): the bodies below are FULL SUBMISSIONS — `contract`, `widget_id`, `intent_token`,
// `inputs`, `client_nonce` and `profile_id` — and `widget_id` is the record's own, as a conformant
// renderer sends it. This file therefore does NOT depend on IR-F88-3 (the harness fill for callers that
// name only `intent_token`): it names every required member itself, which is also what will make the
// `widget_id` comparison P-G15a builds testable here without touching the harness.
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
//   [GW]   the controller and gateway of the real `WidgetsModule`. The owners are not providers of that
//          module, which the test reports; the prototype spies would still see a call made through any
//          instance a slot constructed for itself.
//   [HTTP] `AppModule` with every global guard (`support/http-bootstrap.ts`). It was an XF while `AppModule`
//          could not be constructed with the platform-ci.yml literals alone; GATES-PLAN-V11 I-HAR (IR-H1)
//          added the declared widgets-live extras (the referral, gift-certificate, loyalty and Action Engine
//          identity keys) to the harness environment, and it is now a plain `it`: a boot failure or a failed
//          assertion is red.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import {
  K3_EMITTABLE_KINDS,
  WidgetEmitterService,
  type K3EmittableKind,
} from '../../src/widgets/emission/emitter.service';
import {
  PROJECTOR_REGISTRY,
  ROWS_BLOCKED_BY,
} from '../../src/widgets/projection/projector.registry';
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
import { WIDGET_MODELS } from './support/no-write-recorder';
import {
  CANONICAL_READ_OWNERS,
  installOwnerSpies,
  ownersAbsentFrom,
  type OwnerSpies,
} from './support/owner-spies';

/** `widgets.controller.ts`'s response: these eleven keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'next_envelope',
  'outcome',
  'owner_decision',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'receipt_outcome',
  'resolved_widget',
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
  /** One submission of a whole §3.8 body; returns the HTTP status and the response body. */
  submit(
    credential: C,
    body: Record<string, unknown>,
    scope: string,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  /** Writes the NW recorder attributes to this submission. */
  writes(scope: string): readonly unknown[];
  /** Every store operation attributed to this submission, as `Model.operation`. */
  operations(scope: string): string[];
}

/**
 * A conformant §3.8 submission of `widget` (P-F88's DTO). `widget_id` is the record's own: a renderer
 * that had to guess it would be a renderer the emission never reached.
 */
const submissionOf = (widget: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: widget.widgetId,
  intent_token: widget.intentToken,
  inputs: null,
  client_nonce: `g12-l00-${randomUUID().slice(0, 8)}`,
  profile_id: 'pwa.default',
});

/**
 * The projector's three entry points, spied on the PROTOTYPE. A prototype spy sees a call made through
 * any instance — including one a slot constructed for itself — so "the projector was not reached" does
 * not depend on the projector being a provider of the module under test (it is not one until the U12a
 * integrator request lands).
 */
interface ProjectorSpies {
  called(): string[];
  restore(): void;
}

const installProjectorSpies = (): ProjectorSpies => {
  const called: string[] = [];
  const methods = [
    'compose',
    'composeFromOwnerResponse',
    'composeNavigate',
  ] as const;
  const spies = methods.map((method) => {
    // Captured BEFORE the spy replaces it, so the wrapper calls through to the real method rather
    // than to itself: a call-through observation wrapper, which the §3.2 allowlist admits.
    const original = WidgetProjectorService.prototype[method] as unknown as (
      ...a: unknown[]
    ) => unknown;
    return jest
      .spyOn(WidgetProjectorService.prototype, method)
      .mockImplementation(function (this: WidgetProjectorService, ...args) {
        called.push(method);
        return original.apply(this, args) as never;
      });
  });
  return {
    called: () => [...called],
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
};

/**
 * Each principal's own pre-U13 tokens stop stale at slot 9; the other principal's are refused at Gate 3.
 *
 * MERGE FIX (U12a's merge): the own-token stop was slot 8 while slot 8 was the I-CTX stub. U8a built
 * its null-schema lane earlier in this batch and these bodies carry `inputs: null`, which is that
 * lane's PASS, so U9b applies DS-03 A to the absent template at slot 9. The claim the guard makes is unchanged and
 * is not about WHICH slot stops: it is that no owner is read, no `AiToolExecution` row appears, no
 * owner byte comes back and nothing is written, wherever the pipeline stops.
 */
const expectedStop = (own: boolean) =>
  own
    ? { stopped_at_gate: '9', gates_run: 10, code: 'handle_stale' }
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
  projector: ProjectorSpies,
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
      submissionOf(a.tokens.METRIC),
      'G12-L00: before the widgets.runtime grant',
    );
    expect(dark.status).toBe(403);
    expect(dark.body).toMatchObject({ error: { code: 'feature_locked' } });
    expect(spies.called()).toEqual([]);
    expect(projector.called()).toEqual([]);
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
          submissionOf(owner.tokens[kind]),
          scope,
        );
        requests += 1;

        expect({ scope, status }).toEqual({ scope, status: 200 });
        expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS);
        expect(body).toMatchObject({
          contract: 'maya.widget.intent/1',
          outcome: submitter === owner ? 'superseded' : 'refuse',
          gates_total: 15,
          ...expectedStop(submitter === owner),
        });
        expect({ scope, ownerCalls: spies.called() }).toEqual({
          scope,
          ownerCalls: [],
        });
        // U12a: the projector exists and no edge reaches it. Slot 12 is a pointer that reads nothing
        // (ARCH-12-10) and Gate 13's REFINE/NAVIGATE edges are U13's, so a composition here would be a
        // caller the pipeline does not have.
        expect({ scope, projectorCalls: projector.called() }).toEqual({
          scope,
          projectorCalls: [],
        });
        expect({ scope, writes: level.writes(scope) }).toEqual({
          scope,
          writes: [],
        });
        // The recorder did see this submission, so "no write" is not silence.
        //
        // MERGE FIX (U12a's merge), the same correction Merge-A applied to T4-INDEP/T4-NW/PR-12 and
        // this batch applied to T7-NW, G11-N4d-NW and the Gate 8 lane: the scope's operations are no
        // longer one. P-PRINCIPAL resolves the principal inside `T` (`Tenant.findUnique`, two
        // `FOR SHARE` raw reads, `Staff.findMany`) and U8a's slot 8 performs ONE lowering-source read
        // after its pass. So the RECORD-table reads are counted on their own — one for a refusal at
        // Gate 3, two once slot 8 passes — and the rest by the property that matters: no owner model
        // is touched at all, which is this guard's whole subject. P-G15a adds the first read: Gate 1
        // derives the seal from transaction-scoped stored terms before the gateway's union record read.
        const ops = level.operations(scope);
        expect({
          scope,
          records: ops.filter((op) => op.startsWith('WidgetIntentRecord')),
        }).toEqual({
          scope,
          records:
            submitter === owner
              ? [
                  'WidgetIntentRecord.findFirst',
                  'WidgetIntentRecord.findFirst',
                  'WidgetIntentRecord.findFirst',
                ]
              : [
                  'WidgetIntentRecord.findFirst',
                  'WidgetIntentRecord.findFirst',
                ],
        });
        // No OWNER model is read at any point: only the widget layer's own record table, the
        // principal's tenancy/staff reads inside `T`, and the raw `FOR SHARE` statements.
        expect({
          scope,
          foreign: ops.filter(
            (op) =>
              !op.startsWith('WidgetIntentRecord') &&
              ![
                'Tenant.findUnique',
                'Staff.findMany',
                'WidgetEmission.findFirst',
                'WidgetRenderReceipt.findFirst',
                'null.$queryRaw',
              ].includes(op),
          ),
        }).toEqual({ scope, foreign: [] });
        const text = JSON.stringify(body);
        expect(text).not.toContain(clientMarker);
        expect(text).not.toContain(staffMarker);
      }

  expect(requests).toBe(20);
  // ARCH-12-13's live half, on the process that just served twenty submissions: the skeleton is dark,
  // and it says why. A row registered before its blocker was lifted would be visible right here.
  expect(PROJECTOR_REGISTRY).toEqual([]);
  expect(ROWS_BLOCKED_BY.length).toBeGreaterThan(0);
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
  let projector: ProjectorSpies;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
  });
  beforeEach(() => {
    spies = installOwnerSpies();
    projector = installProjectorSpies();
  });
  afterEach(() => {
    spies.restore();
    projector.restore();
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
      // MERGE FIX (U12a's merge) — the claim is RE-BASED, not relaxed, and Merge-A's report predicted
      // exactly this. It used to read "the gateway's module holds NONE of the owners", which rested
      // on module absence. P-PRINCIPAL binds `PRINCIPAL_RESOLVER` through `C9Module` (D-6 imports
      // owners as MODULES, which is the plan's own instruction), and `C9Module` imports `CrmModule`,
      // `MeasurementModule`, `C8Module` and `Package5Wave1Module` — so five of the six owners are now
      // RESOLVABLE from the gateway's injector. §1.3 schedules `C9Module` for U12b/U13b anyway, so
      // this was always going to move.
      //
      // What still holds by absence is the IMPORT GRAPH: only files under `owner-ports/**` may import
      // a non-widget service, and only the five enumerated ones, each with a narrow `only`
      // (`widget-import-graph.architecture.spec.ts` D6-SERVICE/D6-CLOSED, k3 check 9). What carries
      // this guard is the RUNTIME half below, which is unaffected: with the owners resolvable, every
      // one of them is spied on a REAL instance and called ZERO times.
      const resolvable = [
        ...new Set(CANONICAL_READ_OWNERS.map((m) => m.owner.name)),
      ].sort();
      const absent = ownersAbsentFrom(gw.moduleRef).sort();
      expect(absent.every((name) => resolvable.includes(name))).toBe(true);
      // Not vacuous: at least one owner IS resolvable, so the zero-call assertion below is measured
      // against instances that exist rather than against a module that could not have called them.
      expect(resolvable.length).toBeGreaterThan(absent.length);
      let mark = 0;
      const level: Level<Readonly<AuthenticatedUser>> = {
        principal: async (tenant, user) => {
          const actor = await fx.actor(tenant, user);
          return { actor, credential: actor };
        },
        submit: async (actor, submission, scope) => {
          mark = gw.recorder.mark();
          const body = await gw.intent(actor, submission, scope);
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
      await runL00(ctx, fx, level, spies, projector, false);
    });
  });

  describe('[HTTP]', () => {
    it("G12-L00 [HTTP] holds by absence: behind every global guard, the route is dark until widgets.runtime is granted; then client A's and staff S's tokens reach no owner read, answer with the controller's six keys only, add no AiToolExecution row, carry no owner byte and write nothing", async () => {
      const http: HttpHarness = await bootHttp();
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
          submit: async (token, submission) => {
            http.recorder.clear();
            const res = await http.postIntent(token, submission);
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
        await runL00(ctx, fx, level, spies, projector, true);
      } finally {
        await fx.teardown();
        await http.close();
      }
    });
  });
});
