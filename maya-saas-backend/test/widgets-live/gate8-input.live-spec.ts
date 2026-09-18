// Gate 8 — the null-schema lane, on the live code path (U8a; row 8 C11:4727; K12 C11:2902).
//
// T-PENDING8 IS RETIRED. It pinned that slot 8's stub refused on the live path and that nothing past it
// ran; U8a builds the lane, so the file now pins what the lane DOES. (Its body also stopped being a
// submission: P-F88 closed the §3.8 DTO, and `{intent_token}` alone is refused at the shape stage.)
//
// UNBOUND. IR-8a-1 is APPLIED: slot 8 is `this.inputValidation.run(ctx)`, the provider is bound in
// `widgets.module.ts`, and the slot carries no `pendingOn`. The `[RI]` binding this file used while the
// seam still held the I-CTX stub is GONE, and with it every `jest.spyOn` on that export — each test now
// runs the gate the pipeline itself calls, so the tags are `[GW]` and `[HTTP]` rather than `[GW]`
// and `[HTTP]`. They are still not EVIDENCE (§0.5: a GW run never counts and the records are
// harness-minted), but they are no longer a rehearsal of a wiring either.
//
// WHAT THE LANE ANSWERS, and what each test holds:
//   T-NULL-NULL    `inputs: null` on a null-schema record → slot 8 passes, and the pipeline stops at 9
//   T-NULL-PASS    `inputs` absent → the §3.8 stage refuses it before a gate runs (P-F88); the gate's own
//                  branch for it is `input-validation.gate.spec.ts` G8a-G2
//   T-NULL-OBJ     `inputs: {a:1}`  → REFUSED / selection_out_of_domain at 8 (K12)
//   T-NULL-EMPTY   `inputs: {}`     → the same refusal, for the same reason: the member was carried
//   T-HELD         a schema-bearing record → REFUSED / mechanism_absent, and the lowering source is NOT read
//   T-READ-ONCE    exactly one lowering-source read, on the pass, and none on any refusal (D-2)
//   T-INV24        zero durable writes on every refusal, and on the pass too (nothing writes before 9)
//   T-F11          the stop MOVES from 8 to 9 when the lane passes — slot 8 stopped being the wall
//
// NOT EVIDENCE. Records here are minted by `Fixtures.widget`, the harness's own writer, so under D-17 no
// line of this file may carry an `[E-…]` label and nothing here flips a clause. E1-G8 rewrites the cases
// onto records minted by the production trigger T-2b, as an HTTP and BIN pair with manifest lines.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import { LoweringSourceReader } from '../../src/widgets/stores/lowering-source.read';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import {
  Fixtures,
  type TenantFixture,
  type WidgetFixture,
} from './support/fixtures';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';
import {
  noWriteBaseline,
  noWriteViolations,
} from './support/no-write-recorder';

/** `widgets.controller.ts`'s response: these seven keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'outcome',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'stopped_at_gate',
];

/** Where the pipeline stops when slot 8 PASSES: Gate 9 is the next unbuilt slot (the 10th run). */
const PAST_8 = { stop: '9', ran: 10 } as const;
/** Where it stops when slot 8 refuses: at 8, the 8th run. */
const AT_8 = { stop: '8', ran: 8 } as const;

/**
 * A conformant §3.8 submission (P-F88's DTO). `inputs` is REQUIRED and NULLABLE there, so every body
 * below states it; `undefined` is a body the shape stage refuses, which is T-NULL-PASS's subject.
 */
const body = (
  record: WidgetFixture,
  inputs: Record<string, unknown> | null,
): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs,
  client_nonce: `g8-${randomUUID()}`,
  profile_id: 'widgets-live-gate8',
});

/** The same body without the member at all: refused at the shape stage, never by a gate. */
/**
 * The submission with `inputs` ABSENT.
 *
 * MERGE FIX (U8a's merge): this used to `delete` the member. P-F88's IR-F88-3 now fills the harness
 * body from `submissionDefaults()` before spreading the caller's, so a deleted member came back as
 * `null` and the case stopped being about absence. An OWN key whose value is `undefined` survives the
 * spread and overrides the default, and over the wire it serialises to an absent member — so both the
 * [GW] and the [HTTP] arm get the body this test is about.
 */
const bodyWithoutInputs = (record: WidgetFixture): Record<string, unknown> => ({
  ...body(record, null),
  inputs: undefined,
});

describe('Gate 8 — input validation, the null-schema lane [U8a]', () => {
  let ctx: FixtureContext;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  /** `[G-SYNTH]`: the one column no writer produces yet. Never evidence (§0.5). */
  const giveSchema = async (record: WidgetFixture): Promise<string> => {
    const inputSchemaHash = 'a1'.repeat(32);
    await ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: record.intentTokenHash,
          tenantId: record.tenantId,
        },
      },
      data: { inputSchemaHash },
    });
    return inputSchemaHash;
  };

  describe('[GW] the real WidgetsModule over the proof database', () => {
    let gw: GatewayHarness;
    let fx: Fixtures;

    beforeAll(async () => {
      gw = await bootGateway();
      fx = new Fixtures(ctx, gw);
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      await fx.teardown();
      gw.recorder.clear();
    });
    afterAll(async () => {
      await gw?.close();
    });

    const tenantWithRecord = async (
      label: string,
    ): Promise<{
      tenant: TenantFixture;
      actor: Readonly<AuthenticatedUser>;
      record: WidgetFixture;
    }> => {
      const tenant = await fx.tenant(label);
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      const actor = await fx.actor(tenant, user);
      const record = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      return { tenant, actor, record };
    };

    /**
     * The scope's reads OF THE RECORD TABLE, in order.
     *
     * MERGE FIX (U8a's merge): this returned every recorded operation. With P-PRINCIPAL merged, `T`
     * also carries the principal's resolution — `Tenant.findUnique`, two `FOR SHARE` raw reads and
     * `Staff.findMany` — so what the lane's claim needs is counted directly instead: the record read
     * and, on a pass and only on a pass, the one lowering-source read (D-2). `principalReads` keeps
     * the other half honest: those reads take LOCKS and write nothing (D-12).
     */
    const operations = (scope: string): string[] =>
      gw.recorder
        .inScope(scope)
        .map((op) => `${op.model}.${op.operation}`)
        .filter((op) => op.startsWith('WidgetIntentRecord'));

    const principalReads = (
      scope: string,
    ): { locks: number; wrote: boolean } => {
      const recorded = gw.recorder.inScope(scope);
      return {
        locks: recorded.filter((op) => op.lock).length,
        wrote: recorded.some((op) => op.write),
      };
    };

    it('T-NULL-NULL [GW]: `inputs: null` on a null-schema record passes slot 8, reads the lowering source once, and the pipeline stops at 9', async () => {
      const { tenant, actor, record } = await tenantWithRecord('T-NULL-NULL');
      const scope = 'T-NULL-NULL';
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        record.intentTokenHash,
      );

      const result = await gw.submit(actor, body(record, null), scope);

      expect({
        outcome: result.verdict.outcome,
        code: 'code' in result.verdict ? result.verdict.code : null,
        stoppedAt: result.stoppedAt,
        ran: result.ran,
      }).toEqual({
        outcome: 'refuse',
        code: 'mechanism_absent',
        stoppedAt: PAST_8.stop,
        ran: PAST_8.ran,
      });
      // Two reads and no more: `findRecord`, then the one lowering-source read slot 8 performs after
      // its decision (D-2). Nothing else on the path touched the store.
      expect(operations(scope)).toEqual([
        'WidgetIntentRecord.findFirst',
        'WidgetIntentRecord.findFirst',
      ]);
      expect(principalReads(scope)).toEqual({ locks: 2, wrote: false });
      // T-INV24's half for the PASS: the lane writes nothing either. The first durable write is Gate 9's.
      expect(
        await noWriteViolations(
          gw.recorder,
          scope,
          ctx.prisma,
          tenant.id,
          record.intentTokenHash,
          before,
        ),
      ).toEqual({ writes: [], rowDelta: {}, recordChanged: false });
    });

    it('T-NULL-PASS [GW]: an ABSENT `inputs` never reaches the gate — §3.8 makes the member required, so the shape stage refuses it (P-F88)', async () => {
      const { actor, record } = await tenantWithRecord('T-NULL-PASS');
      // The gate's own branch for an absent member is exercised at [U] (`input-validation.gate.spec.ts`
      // G8a-G2): `SubmissionShape.inputs` is optional, and a successor edge could omit it.
      await expect(
        gw.submit(actor, bodyWithoutInputs(record), 'T-NULL-PASS'),
      ).rejects.toThrow(/refused by the global ValidationPipe/);
    });

    it.each([
      ['T-NULL-OBJ', { choice: 'a' }],
      ['T-NULL-EMPTY', {}],
    ])(
      '%s [GW]: a null-schema record carrying `inputs` is REFUSED / selection_out_of_domain at 8, with NO lowering-source read (K12)',
      async (scope, inputs) => {
        const { tenant, actor, record } = await tenantWithRecord(scope);
        const before = await noWriteBaseline(
          gw.recorder,
          ctx.prisma,
          tenant.id,
          record.intentTokenHash,
        );

        const result = await gw.submit(actor, body(record, inputs), scope);

        expect({
          outcome: result.verdict.outcome,
          code: 'code' in result.verdict ? result.verdict.code : null,
          stoppedAt: result.stoppedAt,
          ran: result.ran,
        }).toEqual({
          outcome: 'refuse',
          code: 'selection_out_of_domain',
          stoppedAt: AT_8.stop,
          ran: AT_8.ran,
        });
        // T-READ-ONCE's negative half: the refusal read the record and nothing else.
        expect(operations(scope)).toEqual(['WidgetIntentRecord.findFirst']);
        // T-INV24 (C11:5356): a submission refused at 1–8-R produces zero conversation writes.
        expect(
          await noWriteViolations(
            gw.recorder,
            scope,
            ctx.prisma,
            tenant.id,
            record.intentTokenHash,
            before,
          ),
        ).toEqual({ writes: [], rowDelta: {}, recordChanged: false });
      },
    );

    it('T-HELD [GW, G-SYNTH]: a schema-bearing record refuses `mechanism_absent` at 8, whatever it carries, and reads no lowering source', async () => {
      const { tenant, actor, record } = await tenantWithRecord('T-HELD');
      const inputSchemaHash = await giveSchema(record);
      expect(inputSchemaHash).toHaveLength(64);

      for (const [i, inputs] of [null, {}, { choice: 'a' }].entries()) {
        const scope = `T-HELD#${i}`;
        const before = await noWriteBaseline(
          gw.recorder,
          ctx.prisma,
          tenant.id,
          record.intentTokenHash,
        );
        const result = await gw.submit(actor, body(record, inputs), scope);

        expect({
          scope,
          outcome: result.verdict.outcome,
          code: 'code' in result.verdict ? result.verdict.code : null,
          stoppedAt: result.stoppedAt,
          ran: result.ran,
        }).toEqual({
          scope,
          outcome: 'refuse',
          code: 'mechanism_absent',
          stoppedAt: AT_8.stop,
          ran: AT_8.ran,
        });
        // The held lane is DARK: it decides from the record's `inputSchemaHash` alone and reads nothing.
        expect({ scope, operations: operations(scope) }).toEqual({
          scope,
          operations: ['WidgetIntentRecord.findFirst'],
        });
        expect({
          scope,
          nw: await noWriteViolations(
            gw.recorder,
            scope,
            ctx.prisma,
            tenant.id,
            record.intentTokenHash,
            before,
          ),
        }).toEqual({
          scope,
          nw: { writes: [], rowDelta: {}, recordChanged: false },
        });
      }
    });

    it('T-READ-ONCE [GW]: over a pass and a refusal on the SAME record, the lowering source is read exactly once — on the pass, after the decision', async () => {
      const { actor, record } = await tenantWithRecord('T-READ-ONCE');
      // IR-8a-2: the reader is the module's own singleton, so the spy is a call-through on the
      // prototype rather than on a locally constructed instance. It is what slot 8 actually calls.
      const read = jest.spyOn(LoweringSourceReader.prototype, 'read');

      await gw.submit(
        actor,
        body(record, { choice: 'a' }),
        'T-READ-ONCE/refuse',
      );
      expect(read).toHaveBeenCalledTimes(0);

      await gw.submit(actor, body(record, null), 'T-READ-ONCE/pass');
      expect(read).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledWith(
        record.tenantId,
        record.intentTokenHash,
      );

      // A second pass reads once more: the read is per submission, and it is never cached across one.
      await gw.submit(actor, body(record, null), 'T-READ-ONCE/pass-2');
      expect(read).toHaveBeenCalledTimes(2);
      read.mockRestore();
    });

    it('T-F11 [GW]: slot 8 is the eighth slot, 7 < 8 < 8-R < 9, and the stop MOVES from 8 to 9 exactly when the lane passes', async () => {
      const { actor, record } = await tenantWithRecord('T-F11');
      const order = (
        gw.gateway as unknown as { gates: { n: string }[] }
      ).gates.map((g) => g.n);
      expect(order.indexOf('8')).toBe(7);
      expect(order.indexOf('7')).toBeLessThan(order.indexOf('8'));
      expect(order.indexOf('8')).toBeLessThan(order.indexOf('8-R'));
      expect(order.indexOf('8-R')).toBeLessThan(order.indexOf('9'));

      const refused = await gw.submit(actor, body(record, {}), 'T-F11/refuse');
      const passed = await gw.submit(actor, body(record, null), 'T-F11/pass');
      expect([refused.stoppedAt, refused.ran]).toEqual([AT_8.stop, AT_8.ran]);
      expect([passed.stoppedAt, passed.ran]).toEqual([PAST_8.stop, PAST_8.ran]);
      expect(passed.ran).toBeGreaterThan(refused.ran);
    });

    // The merge-step exit (D-18), flipped in U8a's merge commit: with NOTHING bound by the test, slot 8
    // carries no `pendingOn` and the lane answers. It is the one test in this file that would still be
    // red if IR-8a-1 had been applied by halves.
    it('T-WIRED [GW]: slot 8 carries no `pendingOn` and a null-schema submission passes it', async () => {
      const { actor, record } = await tenantWithRecord('T-WIRED');
      const slot = (
        gw.gateway as unknown as {
          gates: { n: string; pendingOn?: string }[];
        }
      ).gates.find((g) => g.n === '8');
      expect(slot?.pendingOn).toBeUndefined();

      const result = await gw.submit(actor, body(record, null), 'T-WIRED');
      expect([result.stoppedAt, result.ran]).toEqual([PAST_8.stop, PAST_8.ran]);
    });
  });

  describe('[HTTP] AppModule behind all six guards', () => {
    let http: HttpHarness;
    let fx: Fixtures;

    beforeAll(async () => {
      http = await bootHttp();
      // The record is minted through the application's OWN writers, so it is minted for the principal
      // the route will resolve — and the submission then travels the route.
      fx = new Fixtures(ctx, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      await fx.teardown();
      http.recorder.clear();
    });
    afterAll(async () => {
      await http?.close();
    });

    const entitledRecord = async (label: string) => {
      const tenant = await fx.tenant(label);
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      await fx.grantFeature(tenant, 'widgets.runtime');
      // The record is minted for the principal of the LOGIN token, the one `JwtStrategy.validate`
      // hands the route; minting for any other session would stop the submission at slot 3.
      const bearer = await http.login(tenant.slug, user.email, user.password);
      const actor = await fx.actorFromAccessToken(bearer);
      const record = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      http.recorder.clear();
      return { tenant, bearer, record };
    };

    it('SMOKE-G8-SHAPE [HTTP]: the §3.8 stage admits `null`, `{}` and a valued `inputs` and refuses an ABSENT one — so Gate 8’s lanes are reachable at the route, and the absent case never is', async () => {
      const { record, bearer } = await entitledRecord('SMOKE-G8 shape');

      for (const inputs of [null, {}, { choice: 'a' }]) {
        const res = await http.postIntent(bearer, body(record, inputs));
        const answered = res.body as Record<string, unknown>;
        expect({ inputs, status: res.status }).toEqual({ inputs, status: 200 });
        expect(Object.keys(answered).sort()).toEqual(CONTROLLER_KEYS);
        // MERGE FIX (U8a's merge): before IR-8a-1 every one of the three stopped at 8, because the
        // slot answered with the stub. They no longer share a stop — `null` PASSES slot 8 and the
        // pipeline stops at 9 — so what this test can still assert, and what it was always about, is
        // that the ROUTE let each of them through to a gate: a 400 here would make T-NULL-OBJ
        // untestable over HTTP. The lane's own answers are the next test's.
        expect({
          inputs,
          reachedAGate: answered.stopped_at_gate !== '0',
        }).toEqual({ inputs, reachedAGate: true });
        expect({
          inputs,
          stop: answered.stopped_at_gate,
        }).toEqual({ inputs, stop: inputs === null ? PAST_8.stop : AT_8.stop });
        expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
      }

      const absent = await http.postIntent(bearer, bodyWithoutInputs(record));
      expect(absent.status).toBe(400);
    });

    it('SMOKE-G8-NULL-INPUTS [HTTP]: on the wired route, the lane answers `selection_out_of_domain` for `{}` and `{a:1}`, and passes slot 8 for `null`', async () => {
      const { record, bearer } = await entitledRecord('SMOKE-G8 lane');

      for (const inputs of [{}, { choice: 'a' }]) {
        const res = await http.postIntent(bearer, body(record, inputs));
        // IR-REN-1 (P-RENDER): R3.9.3's rendering travels with the refusal. The verdict is asserted
        // exactly and the rendering by its phrase key — the wording belongs to the reason table.
        const { reason_text: reason, ...verdict } = res.body as Record<
          string,
          unknown
        >;
        expect({ inputs, status: res.status, body: verdict }).toEqual({
          inputs,
          status: 200,
          body: {
            contract: 'maya.widget.intent/1',
            outcome: 'refuse',
            code: 'selection_out_of_domain',
            stopped_at_gate: AT_8.stop,
            gates_run: AT_8.ran,
            gates_total: 15,
          },
        });
        expect(
          (reason as { phrase_key?: unknown } | undefined)?.phrase_key,
        ).toBe('widget.refusal.selection_out_of_domain');
      }

      const passed = await http.postIntent(bearer, body(record, null));
      expect(passed.status).toBe(200);
      expect(passed.body).toMatchObject({
        outcome: 'refuse',
        code: 'mechanism_absent',
        stopped_at_gate: PAST_8.stop,
        gates_run: PAST_8.ran,
      });
      // Nothing durable, at either answer: the first write of the sequence is Gate 9's (R3.9.1).
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    });
  });
});
