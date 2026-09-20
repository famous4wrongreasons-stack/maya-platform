// Gate 4 on the live path — slot 4 calls the tenancy owner (GATES-PLAN-V11 U4; D-9; C11:4723).
//
// Gate 4 is the gate that cannot be reached by asking. On a conformant build the record read is
// tenant-scoped (`findRecord`'s WHERE), so another tenant's row is never loaded; and if it somehow
// were, Gate 3 would refuse first, because the principal proof hash covers `tenantId`. Row 4 is
// therefore two different claims, and this file keeps them apart:
//
//   G4-a  the POSITIVE — every admitted submission is asserted against the tenancy owner, with the
//         RECORD's tenant. That is `T4-POS`, and it is an ordinary live positive: it needs no
//         neutraliser, only the wiring.
//   G4-b  the REFUSAL — `REFUSED/tenant_mismatch`. No conformant input produces it, so it is
//         defence in depth (L-T). `T4-INDEP` observes it on the build where the two mechanisms that
//         shadow slot 4 are neutralised (the runner's set `N4`: `findRecord`'s tenant filter, and
//         slot 3's compare). §0.5's E-INDEP.
//
// `T4-INDEP` is written to be TRUE ON EVERY BUILD the runner constructs, and that is the point of
// it. One foreign-tenant submission has exactly three admissible answers, one per world:
//   world      what is neutralised                stop  code
//   conformant nothing                            1     EXPIRED                    (the row is never read)
//   N4-FILTER  the tenant filter alone            3     widget_principal_mismatch  (the hash covers the tenant)
//   N4         the filter and slot 3's compare    4     tenant_mismatch            (slot 4 is the last one left)
// Anything else — a stop at 5, 7 or 8, or a pass — means a foreign tenant's record got PAST slot 4,
// and the test is red. So the mutants that make slot 4 useless (`M4-2`, `M4-3`) are killed by it,
// while the unmutated tree stays green and every other unit in this shared working tree can run.
//
// NOT EVIDENCE YET. The records here are minted by `Fixtures.widget`, the harness's own writer, so
// under D-17 no line of this file may be labelled `[E-MINT]`/`[E-INDEP]` and nothing it proves can
// flip a clause. E1-G4 rewrites these three cases onto records minted by the production trigger
// T-2b (`POST /api/ai/tools/:toolName/execute`), as an HTTP and BIN pair with manifest lines, and
// the integrator flips G4-a and G4-b there.
//
// Two entry levels, as G12-L00 uses them: [GW] the real `WidgetsModule` through its controller, and
// [HTTP] `AppModule` behind all six global guards, where the tenant is bound by `TenantAccessGuard`
// exactly as production binds it.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { c9PrincipalHash } from '../../src/widgets/owner-ports/principal.adapter';
import type { C9Principal } from '../../src/orchestration/c9.contract';
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

/** The three answers a foreign-tenant submission may have, one per build the runner constructs. */
const WORLDS: Readonly<
  Record<
    string,
    {
      readonly outcome: 'expired' | 'refuse';
      readonly code: string | null;
      readonly ran: number;
      readonly why: string;
    }
  >
> = {
  '1': {
    outcome: 'expired',
    code: null,
    ran: 1,
    why: 'conformant: findRecord is tenant-scoped, so the foreign row is never read',
  },
  '3': {
    outcome: 'refuse',
    code: 'widget_principal_mismatch',
    ran: 3,
    why: "N4-FILTER: the row is read, and the principal proof hash covers the record's tenant",
  },
  '4': {
    outcome: 'refuse',
    code: 'tenant_mismatch',
    ran: 4,
    why: 'N4: the row is read and slot 3 is neutralised, so slot 4 is the only stop left',
  },
};

interface Submission {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/**
 * A conformant §3.8 submission for one minted record (P-F88's DTO). Everything here is either
 * server-minted (`intent_token`, `widget_id`) or client-side and advisory (`client_nonce`,
 * `profile_id`): nothing in it names a tenant, and the DTO has no member that could.
 */
const submissionBody = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-gate4',
});

interface Level<C> {
  /** A principal for `user`, established the way this level's requests establish one. */
  principal(
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<{ actor: Readonly<AuthenticatedUser>; credential: C }>;
  /** One submission through the route. */
  submit(
    credential: C,
    record: WidgetFixture,
    scope: string,
  ): Promise<Submission>;
  /** The durable writes the NW recorder attributed to that submission. */
  writes(scope: string): readonly unknown[];
  /** Every store operation attributed to it, as `Model.operation`. */
  operations(scope: string): string[];
  /** Whether the level needs the `widgets.runtime` entitlement (the HTTP route is dark without it). */
  readonly guarded: boolean;
}

/** Tenant A with its actor, tenant B with its actor, and one METRIC record minted in each. */
async function twoTenants<C>(
  fx: Fixtures,
  level: Level<C>,
): Promise<{
  a: {
    actor: Readonly<AuthenticatedUser>;
    credential: C;
    record: WidgetFixture;
  };
  b: {
    actor: Readonly<AuthenticatedUser>;
    credential: C;
    record: WidgetFixture;
  };
}> {
  const build = async (label: string) => {
    const tenant = await fx.tenant(label);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const { actor, credential } = await level.principal(tenant, user);
    if (level.guarded) await fx.grantFeature(tenant, 'widgets.runtime');
    const record = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    return { actor, credential, record };
  };
  // Serially: each builder writes through the real owners, and the HTTP level logs in per user.
  const a = await build('T4 tenant A');
  const b = await build('T4 tenant B');
  expect(a.record.tenantId).not.toBe(b.record.tenantId);
  return { a, b };
}

/** T4-POS: A submits its OWN record. The owner is asked, with the record's tenant, and slot 4 passes. */
async function positive<C>(fx: Fixtures, level: Level<C>): Promise<void> {
  const { a } = await twoTenants(fx, level);
  const assertTenantId = jest.spyOn(
    TenantContextService.prototype,
    'assertTenantId',
  );
  try {
    const scope = 'T4-POS: tenant A submits its own record';
    const { status, body } = await level.submit(a.credential, a.record, scope);

    expect({ scope, status }).toEqual({ scope, status: 200 });
    expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS);
    // Not "stops at 8": the slot after 4 moves as Wave 1 lands. The claim is that slot 4 admitted it.
    expect({ scope, ran: Number(body.gates_run) > 4 }).toEqual({
      scope,
      ran: true,
    });
    expect(['1', '2', '3', '4']).not.toContain(body.stopped_at_gate);
    // G4-a: the tenancy owner was asked, and asked about the RECORD's tenant.
    const asked = assertTenantId.mock.calls.filter(
      (call) => call[0] === a.record.tenantId,
    );
    expect({ scope, asked: asked.length }).toEqual({ scope, asked: 1 });
    expect({ scope, writes: level.writes(scope) }).toEqual({
      scope,
      writes: [],
    });
  } finally {
    assertTenantId.mockRestore();
  }
}

/** T4-INDEP: A submits B's record. One of the three worlds answers, and none of them is a pass. */
async function foreignRecord<C>(fx: Fixtures, level: Level<C>): Promise<void> {
  const { a, b } = await twoTenants(fx, level);
  const scope = "T4-INDEP: tenant A submits tenant B's record";
  const { status, body } = await level.submit(a.credential, b.record, scope);

  expect({ scope, status }).toEqual({ scope, status: 200 });
  expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS);

  const stop = String(body.stopped_at_gate);
  const admissible = Object.keys(WORLDS);
  // Red when the stop is 5, 7, 8 or none of them: a foreign tenant's record got past slot 4.
  expect({
    scope,
    stop,
    admits: admissible.includes(stop) ? stop : admissible.join(' | '),
  }).toEqual({ scope, stop, admits: stop });
  const world = WORLDS[stop];
  expect({
    scope,
    outcome: body.outcome,
    code: body.code,
    ran: body.gates_run,
  }).toEqual({
    scope,
    outcome: world.outcome,
    code: world.code,
    ran: world.ran,
  });
  // NW at every one of the three stops (D-12): nothing durable is written, and the ONE record read is
  // the gateway's. P-PRINCIPAL (D-1) added the principal's own reads inside the same transaction — the
  // K3 exit wording is now "one principal read + one record read" (IR-P-K3) — so the record read is
  // counted on its own rather than as the only operation.
  expect({ scope, writes: level.writes(scope) }).toEqual({ scope, writes: [] });
  expect({
    scope,
    records: level
      .operations(scope)
      .filter((op) => op.startsWith('WidgetIntentRecord')),
  }).toEqual({
    scope,
    records: ['WidgetIntentRecord.findFirst', 'WidgetIntentRecord.findFirst'],
  });
}

/** T4-NW: neither an admitted nor a refused submission writes anything durable. */
async function noWrites<C>(fx: Fixtures, level: Level<C>): Promise<void> {
  const { a, b } = await twoTenants(fx, level);
  for (const [label, record] of [
    ['own', a.record],
    ['foreign', b.record],
  ] as const) {
    const scope = `T4-NW: tenant A submits the ${label} record`;
    await level.submit(a.credential, record, scope);
    expect({ scope, writes: level.writes(scope) }).toEqual({
      scope,
      writes: [],
    });
    // As above: the principal's reads are the resolver's (P-PRINCIPAL, D-1); the record read is one.
    //
    // MERGE FIX (U8a's merge): the `own` record is ADMITTED past slot 4 and now reaches slot 8, whose
    // null-schema lane performs ONE lowering-source read after its pass (D-2). That read is on the
    // same model, so the count is stated per outcome instead of as a single literal: a record that is
    // refused reads once, and an admitted one reads twice — the record, then the lowering source. NW
    // is untouched, and it is the clause's own property; neither read writes.
    expect({
      scope,
      records: level
        .operations(scope)
        .filter((op) => op.startsWith('WidgetIntentRecord')),
    }).toEqual({
      scope,
      records:
        label === 'foreign'
          ? ['WidgetIntentRecord.findFirst', 'WidgetIntentRecord.findFirst']
          : [
              'WidgetIntentRecord.findFirst',
              'WidgetIntentRecord.findFirst',
              'WidgetIntentRecord.findFirst',
            ],
    });
  }
}

describe('Gate 4 — the tenant scope is the owner’s answer, not the widget layer’s (C11:4723)', () => {
  let ctx: FixtureContext;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it("T4-INDEP-3 (control): the principal proof hash covers `tenantId`, which is why a readable foreign record stops at slot 3 and not at slot 4 — slot 4's refusal needs slot 3 neutralised too", () => {
    // P-PRINCIPAL: the digest Gate 3 compares is K3's `c9PrincipalHash` over the principal
    // `C9Authority.current(T)` resolved (C11:2544-2546), not the layer's old sha256 over JWT fields.
    // The claim is the same and is now made against the function the gate actually uses.
    const principal: C9Principal = {
      kind: 'USER',
      tenantId: 'tenant-a',
      userId: 'u1',
      membershipId: 'm1',
      clientId: null,
      channelLinkId: null,
      branchRefs: [],
      staffRef: null,
      proofHash: 'irrelevant-to-the-digest-below',
    };
    expect(c9PrincipalHash(principal)).not.toBe(
      c9PrincipalHash({ ...principal, tenantId: 'tenant-b' }),
    );
  });

  describe('[GW] the real WidgetsModule, through its controller', () => {
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

    const level = (): Level<Readonly<AuthenticatedUser>> => ({
      guarded: false,
      principal: async (tenant, user) => {
        const actor = await fx.actor(tenant, user);
        return { actor, credential: actor };
      },
      submit: async (actor, record, scope) => ({
        status: 200,
        body: (await gw.intent(
          actor,
          submissionBody(record),
          scope,
        )) as unknown as Record<string, unknown>,
      }),
      writes: (scope) => gw.recorder.writes(scope),
      operations: (scope) =>
        gw.recorder.inScope(scope).map((op) => `${op.model}.${op.operation}`),
    });

    // Merge-step exit (D-18), flipped by the integrator in U4's merge commit (IR4-4): IR4-1 injects
    // `TENANT_SCOPE` into the gateway and IR4-2 provides it at the boundary, so the owner is asked.
    it('T4-POS [GW]: an own-tenant record is asserted against `TenantContextService.assertTenantId` exactly once, with the record’s tenant, and passes slot 4', async () => {
      await positive(fx, level());
    }, 60_000);

    it("T4-INDEP [GW]: tenant A submitting tenant B's record never gets past slot 4 — it stops at 1 (never read), at 3 (the hash covers the tenant) or at 4 (`tenant_mismatch`), each with no write", async () => {
      await foreignRecord(fx, level());
    }, 60_000);

    it('T4-NW [GW]: neither the admitted nor the foreign submission writes anything durable; the one store operation is the record read', async () => {
      await noWrites(fx, level());
    }, 60_000);
  });

  describe('[HTTP] AppModule behind all six global guards', () => {
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

    const level = (): Level<string> => ({
      guarded: true,
      principal: async (tenant, user) => {
        const token = await http.login(tenant.slug, user.email, user.password);
        return {
          actor: await fx.actorFromAccessToken(token),
          credential: token,
        };
      },
      submit: async (token, record) => {
        http.recorder.clear();
        const res = await http.postIntent(token, submissionBody(record));
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
    });

    it('T4-POS [HTTP]: behind every global guard, an own-tenant record is asserted against the tenancy owner with the record’s tenant and passes slot 4', async () => {
      await positive(fx, level());
    }, 120_000);

    it("T4-INDEP [HTTP]: behind every global guard, tenant A submitting tenant B's record never gets past slot 4 — stop 1, 3 or 4, each with no write", async () => {
      await foreignRecord(fx, level());
    }, 120_000);

    it('T4-NW [HTTP]: neither submission writes anything durable; the one store operation is the record read', async () => {
      await noWrites(fx, level());
    }, 120_000);
  });
});
