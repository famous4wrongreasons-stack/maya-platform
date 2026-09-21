// Gate 11 on the live path — row W, the witness lane (GATES-PLAN-V11 U11a; row 11 C11:4731).
//
// WHAT THIS FILE CAN AND CANNOT SHOW TODAY, first, because the gap is the point.
//
// Slot 11 is UNREACHABLE on the live path at this commit: slots 8, 9 and 10 are `pending()` seams that
// refuse the interim slot-8 refusal, so every submission stops at 8. The card therefore declares this unit's
// live exit as `[GW G-SYNTH] G11-N4d [XF→U10b]` — `it.failing` until U8a, U9b and U10b land, red today
// BY CONSTRUCTION and stated rather than hidden. `G11-N4d-CONTROL` below measures exactly where a
// submission does stop, so the `it.failing` is red for that reason and not for another.
//
// NOT EVIDENCE, and it never will be in this form (§0.5, D-17). The records are minted by
// `Fixtures.widget`, the harness's own writer, and the witness column is set by a `[synthetic record]`
// update — so no line here carries an `[E-MINT]`/`[E-INDEP]`/`[E-TAMPER:…]` label, nothing here flips a
// clause, and G-SYNTH is never evidence. E1's Gate 11 task rewrites these cases onto records minted by
// the production trigger T-2b, at HTTP and BIN, with manifest lines the verifier checks.
//
// WHAT ROW W IS. §3.7's `run_ref` is `{ run_id, revision_id | null } | null`. A record whose
// `revision_id` is present carries R3.7.4's witness, and row 11 says the witness is "compared, not
// re-read". The comparison needs the C9 owner's current revision, and that port is U11b's; while it is
// UNBOUND the lane refuses `superseded/handle_stale` with ZERO owner calls — a clause-level fail-closed
// lane (AMB-01a, B-01 C11:7188), never a whole-gate refusal. Its TWIN — the same record with no witness
// — must still pass slot 11, and that pair is what makes the refusal a lane rather than a gate that
// stopped working.
//
// [GW]: the real `WidgetsModule` through its controller, on the guarded proof DB.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures, type WidgetFixture } from './support/fixtures';

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

/**
 * A conformant §3.8 submission for one minted record (P-F88's DTO). Nothing in it names a noun, a
 * handle or a witness — R3.7.3's mechanism is that the submission shape has no member that could.
 */
const submissionBody = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-gate11',
});

describe('Gate 11 — the witness lane refuses while it is unbound, and its twin still passes (C11:4731)', () => {
  let ctx: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(ctx, gw);
  });
  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  /**
   * `[synthetic record]`: `run_ref` is a column no writer produces yet, and `support/**` is
   * integrator-only (§2.1), so the one update that sets it is made here rather than in
   * `Fixtures.synthetic`. IR-11a-5 offers to move it there. `verificationFloor` is NOT recomputed and
   * does not need to be: `recomputeFloor` reads the kind, the effect, the priority, the capability and
   * the target, and none of those is touched.
   */
  const freezeWitness = async (record: WidgetFixture): Promise<void> => {
    await ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: record.intentTokenHash,
          tenantId: record.tenantId,
        },
      },
      data: { runId: randomUUID(), revisionId: randomUUID() },
    });
  };

  /** One tenant, one actor, and two identical METRIC records — one witnessed, one not. */
  const twins = async (): Promise<{
    actor: Readonly<AuthenticatedUser>;
    witnessed: WidgetFixture;
    plain: WidgetFixture;
  }> => {
    const tenant = await fx.tenant('G11 witness lane');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const mint = () =>
      fx.widget({ tenant, actor, kind: 'METRIC', body: { value: 1 } });
    const witnessed = await mint();
    const plain = await mint();
    await freezeWitness(witnessed);
    return { actor, witnessed, plain };
  };

  const answer = async (
    actor: Readonly<AuthenticatedUser>,
    record: WidgetFixture,
    scope: string,
  ) =>
    (await gw.intent(
      actor,
      submissionBody(record),
      scope,
    )) as unknown as Record<string, unknown>;

  it('G11-N4d-CONTROL [GW]: today BOTH twins stop stale at slot 9 before Gate 11 is reached', async () => {
    const { actor, witnessed, plain } = await twins();
    for (const [label, record] of [
      ['witnessed', witnessed],
      ['twin', plain],
    ] as const) {
      const scope = `G11-N4d-CONTROL: ${label}`;
      const body = await answer(actor, record, scope);
      expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS);
      // This is the measured reason `G11-N4d` is `it.failing`: not a wrong verdict at 11, but a
      // pipeline that never reaches 11.
      //
      // MERGE FIX (U11a's merge): the wall was slot 8 when the unit measured it. U8a built slot 8's
      // null-schema lane in this same batch, and these bodies carry `inputs: null`, which is that
      // lane's PASS. U9b now applies DS-03 A to the pre-U13 fixture's absent template; U10b and the
      // mint core move the control the rest of the way, and `G11-N4d` remains `[XF→U10b]`.
      expect({ label, stop: body.stopped_at_gate, code: body.code }).toEqual({
        label,
        stop: '9',
        code: 'handle_stale',
      });
    }
  }, 60_000);

  // Merge-step / cross-unit exit (D-18, §1.0): red until slots 8, 9 and 10 stop refusing. The
  // integrator flips `.failing` off in the merge that completes U10b, not in U11a's.
  it.failing(
    'G11-N4d [GW] [G-SYNTH] [XF→U10b]: a witnessed record refuses `superseded/handle_stale` at slot 11 with no owner call, and its twin passes slot 11',
    async () => {
      const { actor, witnessed, plain } = await twins();

      const refused = await answer(actor, witnessed, 'G11-N4d: witnessed');
      expect({
        outcome: refused.outcome,
        code: refused.code,
        stop: refused.stopped_at_gate,
      }).toEqual({
        outcome: 'superseded',
        code: 'handle_stale',
        stop: '11',
      });
      // ZERO owner calls. The witness port is unbound, so there is no owner instance to spy on; what
      // is observable at this level is that the request made no store call other than reading its own
      // record — no canonical owner was consulted before the lane refused.
      expect(
        gw.recorder
          .inScope('G11-N4d: witnessed')
          .map((op) => `${op.model}.${op.operation}`),
      ).toEqual(['WidgetIntentRecord.findFirst']);
      expect(gw.recorder.writes('G11-N4d: witnessed')).toEqual([]);

      // THE TWIN. Same tenant, same actor, same kind, same body — only the witness differs. It must
      // get PAST slot 11, or the refusal above is a gate that stopped working rather than a lane.
      const passed = await answer(actor, plain, 'G11-N4d: twin');
      expect({
        stop: passed.stopped_at_gate,
        past11: Number(passed.gates_run) > 11,
      }).toEqual({ stop: passed.stopped_at_gate, past11: true });
      expect(['11']).not.toContain(passed.stopped_at_gate);
    },
    60_000,
  );

  it('G11-N4d-NW [GW]: neither twin writes anything durable, at whatever slot the pipeline stops', async () => {
    const { actor, witnessed, plain } = await twins();
    for (const [label, record] of [
      ['witnessed', witnessed],
      ['twin', plain],
    ] as const) {
      const scope = `G11-N4d-NW: ${label}`;
      await answer(actor, record, scope);
      // NW (D-12): zero durable writes to every `Widget*` model.
      expect({ label, writes: gw.recorder.writes(scope) }).toEqual({
        label,
        writes: [],
      });
      // MERGE FIX (U11a's merge), the same shape Merge-A applied to T4-NW, T7-NW and PR-12:
      // P-PRINCIPAL's resolution adds `Tenant.findUnique`, two `FOR SHARE` raw reads and
      // `Staff.findMany` inside `T`, and U8a's slot 8 adds ONE lowering-source read after its pass —
      // so "the one store operation is the record read" is no longer the statement to make. The
      // RECORD reads are counted on their own, and the principal's reads by the property that matters:
      // they take LOCKS and write nothing (D-12).
      const recorded = gw.recorder.inScope(scope);
      expect({
        label,
        records: recorded
          .map((op) => `${op.model}.${op.operation}`)
          .filter((op) => op.startsWith('WidgetIntentRecord')),
      }).toEqual({
        label,
        records: [
          'WidgetIntentRecord.findFirst',
          'WidgetIntentRecord.findFirst',
          'WidgetIntentRecord.findFirst',
        ],
      });
      expect({
        label,
        locks: recorded.filter((op) => op.lock).length,
        wrote: recorded.some((op) => op.write),
      }).toEqual({ label, locks: 2, wrote: false });
    }
  }, 60_000);

  it('G11-N4d-SHAPE: the §3.8 body a witnessed record is submitted with carries no noun, handle or witness', async () => {
    const { witnessed } = await twins();
    const body = submissionBody(witnessed);
    // R3.7.3's mechanism is the shape, not a check: there is no member here that could carry one.
    expect(Object.keys(body).sort()).toEqual([
      'client_nonce',
      'contract',
      'inputs',
      'intent_token',
      'profile_id',
      'widget_id',
    ]);
    const serialized = JSON.stringify(body);
    for (const forbidden of ['frozen_nouns', 'revision_id', 'run_id', 'h_'])
      expect({ forbidden, present: serialized.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
  }, 60_000);
});
