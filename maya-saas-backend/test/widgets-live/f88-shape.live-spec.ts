// P-F88 — the shape stage on the live route [HTTP]. GATES-PLAN-V11, Wave 1.
//
// `AppModule` with `configureHttpApp`, all six global guards, `FeatureGuard` not overridden, and a
// `widgets.runtime` entitlement granted only through `Fixtures.grantFeature` on the guarded proof
// database. Every body below is posted RAW to `POST /api/widgets/intent` with a real access token from
// the application's own login route — raw, because a harness helper that filled §3.8's required members
// would defeat F88-3, whose whole content is that a member is missing.
//
// What these prove, and what they do not: a refusal here is a 400 PROTOCOL rejection from the global
// validation pipe, before the gate array, so it is never a §3.9 refusal and never evidence that a gate
// enforces anything (GATE MODULE EXISTS ≠ GATE ENFORCED). The control case is therefore the first test:
// a conformant body reaches slot 1 and is refused there, which is what makes each 400 below attributable
// to its own violation rather than to a route that refuses everything.
//
// The exits of the unit card:
//   F88-1  each of the 28 forbidden keys, at depth 0 and at depth 3 → 400 (R3.8.2, F88)
//   F88-2  each F88.2 location, transplanted onto a submission, is still refused: no row of the closed
//          table names `WidgetIntentSubmission`, so the exemptions do not reach the ingress. The
//          positive half — each location accepted at its own path, depth and type — is the table test in
//          `src/widgets/validation/f88-walk.spec.ts`, because no route carries those shapes inbound.
//   F88-3  missing `contract` → 400
//   F88-4  `readback_ack: null` → 400 (was SMOKE-G8R-NULL-ACK; AMB-02c moves it here)
//   F88-5  `spoken_transcript` → 400 (AMB-26c; V5 and §4.4: an affirmation is never logged)
//
// The same five run over the production binary in `scripts/widgets-http-proof/gateP-f88.cases.ts` [BIN].

import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { UserRole } from '../../src/common/domain.enums';
import { F88_FORBIDDEN_KEYS } from '../../src/widget-contract/f88.generated';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { Fixtures, type TenantFixture } from './support/fixtures';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';

interface Issue {
  readonly field: string;
  readonly message: string;
}

const issues = (body: unknown): Issue[] =>
  (body as { error?: { details?: Issue[] } } | null)?.error?.details ?? [];

/** A body that satisfies §3.8 in full, so that one member at a time can be made to fail. */
const conformant = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  contract: 'maya.widget.intent.submission/1',
  widget_id: randomUUID(),
  intent_token: `f88-shape-${randomUUID()}`,
  inputs: null,
  client_nonce: `f88-${randomUUID().slice(0, 8)}`,
  profile_id: 'pwa.default',
  ...overrides,
});

describe('P-F88 — the §3.8 submission and F88’s walk, at the shape stage [HTTP]', () => {
  let http: HttpHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;
  let tenant: TenantFixture;
  let token: string;

  const post = (body: unknown) =>
    request(http.app.getHttpServer())
      .post('/api/widgets/intent')
      .set('authorization', `Bearer ${token}`)
      .send(body as object);

  beforeAll(async () => {
    http = await bootHttp();
    ctx = await bootFixtureContext();
    // No widget writers: nothing here mints a record, and a builder that cannot write one cannot be
    // mistaken for the source of a body the route refused.
    fx = new Fixtures(ctx, null);
    tenant = await fx.tenant('P-F88');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    await fx.grantFeature(tenant, 'widgets.runtime');
    token = await http.login(tenant.slug, user.email, user.password);
  });
  afterEach(() => {
    http.recorder.clear();
  });
  afterAll(async () => {
    await fx?.teardown();
    await http?.close();
    await ctx?.close();
  });

  it('F88-0 [HTTP] control: a conformant §3.8 body passes the shape stage and is refused at slot 1, so a 400 below is about its own violation', async () => {
    const res = await post(conformant());
    expect({ status: res.status, body: res.body as unknown }).toEqual({
      status: 200,
      body: {
        contract: 'maya.widget.intent/1',
        outcome: 'expired',
        code: null,
        next_envelope: null,
        owner_decision: null,
        receipt_outcome: null,
        resolved_widget: null,
        // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, minted from the code's own row. Written out
        // rather than matched loosely, so a member added to this response later fails here too.
        reason_text: {
          phrase_key: 'widget.refusal.expired',
          rendered: expect.any(String) as unknown,
        },
        stopped_at_gate: '1',
        gates_run: 1,
        gates_total: expect.any(Number) as unknown,
      },
    });
  });

  it('F88-1 [HTTP] every one of the 28 forbidden keys is refused at depth 0 and at depth 3, with the location named', async () => {
    expect(F88_FORBIDDEN_KEYS).toHaveLength(28);
    for (const key of F88_FORBIDDEN_KEYS) {
      const root = await post(conformant({ [key]: 'x' }));
      expect({ key, status: root.status }).toEqual({ key, status: 400 });
      expect(issues(root.body)).toContainEqual({
        field: key,
        message: `F88: forbidden key \`${key}\` at WidgetIntentSubmission.${key} (depth 0); F88.2's closed table admits it at no location`,
      });

      const deep = await post(
        conformant({ inputs: { a: { b: { [key]: 'x' } } } }),
      );
      expect({ key, status: deep.status }).toEqual({ key, status: 400 });
      expect(issues(deep.body)).toContainEqual({
        field: `inputs.a.b.${key}`,
        message: `F88: forbidden key \`${key}\` at WidgetIntentSubmission.inputs.a.b.${key} (depth 3); F88.2's closed table admits it at no location`,
      });
      // No gate ran: the pipe answered before the handler, so the gateway scope is empty.
      expect(http.recorder.inScope(GATEWAY_SCOPE)).toEqual([]);
    }
  });

  it('F88-2 [HTTP] no F88.2 location reaches the ingress: each of the six, transplanted onto a submission at its own path and depth, is still refused', async () => {
    // The table is (shape, path, depth, type). A submission is none of the six shapes, so the path and
    // the type being right changes nothing — which is the property that makes the table a fence rather
    // than a list of admitted key names.
    const transplanted: { at: string; body: Record<string, unknown> }[] = [
      { at: 'state', body: conformant({ state: 'KNOWN' }) }, // row 1, Cell.state, right type
      { at: 'state', body: conformant({ state: 'MINTED' }) }, // row 2, Lifecycle.state, right type
      { at: 'tenant_id', body: conformant({ tenant_id: tenant.id }) }, // rows 3 and 4, right type
      { at: 'role', body: conformant({ role: 'primary' }) }, // row 5, a declared member value
      {
        at: 'inputs.intents_withheld[].role', // row 6, its exact path and depth
        body: conformant({
          inputs: { intents_withheld: [{ role: 'primary' }] },
        }),
      },
    ];
    for (const { at, body } of transplanted) {
      const res = await post(body);
      expect({ at, status: res.status }).toEqual({ at, status: 400 });
      expect(
        issues(res.body).some(
          (i) => i.field === at && i.message.startsWith('F88: forbidden key'),
        ),
      ).toBe(true);
    }
  });

  it('F88-3 [HTTP] a body without `contract` is not a submission', async () => {
    const body = conformant();
    delete body.contract;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(issues(res.body).map((i) => i.field)).toContain('contract');
    expect(http.recorder.inScope(GATEWAY_SCOPE)).toEqual([]);
  });

  it('F88-4 [HTTP] `readback_ack: null` is refused at the shape stage, not as `readback_mismatch` (AMB-02c)', async () => {
    const res = await post(conformant({ readback_ack: null }));
    expect(res.status).toBe(400);
    expect(
      issues(res.body).some((i) => i.message.includes('a null ack is neither')),
    ).toBe(true);
    // The Gate 8-R lane never saw it: the answer is a protocol rejection, with none of the six members
    // a gate answer carries, so it cannot be mistaken for a §3.9 refusal (AMB-02c's whole point).
    expect(Object.keys(res.body as object).sort()).toEqual([
      'error',
      'message',
    ]);
    expect(http.recorder.inScope(GATEWAY_SCOPE)).toEqual([]);
  });

  it('F88-5 [HTTP] `spoken_transcript` is refused at the shape stage on this carrier, and the value is not echoed back', async () => {
    const res = await post(
      conformant({ spoken_transcript: 'yes I confirm the appointment' }),
    );
    expect(res.status).toBe(400);
    expect(
      issues(res.body).some((i) => i.message.includes('`spoken_transcript`')),
    ).toBe(true);
    // R-7 / §4.4: a data subject's affirmation is never logged, and it is not written back into the
    // refusal either.
    expect(JSON.stringify(res.body)).not.toContain('I confirm');
    expect(http.recorder.inScope(GATEWAY_SCOPE)).toEqual([]);
  });

  it('F88-6 [HTTP] the other §3.8 members are enforced as declared: required-nullable `inputs`, a UUID `widget_id`, a non-null `readback_ack` shape', async () => {
    const missingInputs = conformant();
    delete missingInputs.inputs;
    for (const [what, body] of [
      ['inputs omitted', missingInputs],
      ['inputs not a flat map', conformant({ inputs: { a: { b: 1 } } })],
      ['widget_id not a uuid', conformant({ widget_id: 'w-1' })],
      ['client_nonce too short', conformant({ client_nonce: 'n' })],
      ['profile_id empty', conformant({ profile_id: '' })],
      [
        'readback_ack missing a member',
        conformant({ readback_ack: { readback_ref: 'r', body_hash: 'h' } }),
      ],
    ] as const) {
      const res = await post(body);
      expect({ what, status: res.status }).toEqual({ what, status: 400 });
    }
    // And the admitted forms pass the shape stage, reaching slot 1 as the control does.
    for (const body of [
      conformant({ inputs: { choice: 'a', n: 1, ok: true, tags: ['x'] } }),
      conformant({
        readback_ack: {
          readback_ref: 'rb-1',
          body_hash: 'h'.repeat(64),
          affirmation: 'да',
        },
      }),
      conformant({ client_emitted_at: new Date().toISOString() }),
    ]) {
      const res = await post(body);
      expect({
        status: res.status,
        gate: (res.body as { stopped_at_gate?: unknown }).stopped_at_gate,
      }).toEqual({
        status: 200,
        gate: '1',
      });
    }
  });
});
