// Gate 8-R on the live path — the duty is the record's (GATES-PLAN-V11 U8R; row 8-R C11:4728).
//
// NOT EVIDENCE. Every record here is written by the harness (`Fixtures.widget`) or by this file's own
// `[synthetic record]` writer, so under §0.5 and D-17 nothing in this file may flip a clause and no
// test in it carries an evidence label. E1-G8R rewrites R-0, R-1, R-6 and R-7 onto records minted by
// the production trigger T-2b, as an HTTP and BIN pair with manifest lines the verifier checks.
//
// THREE LANES, and the difference between them is the whole honesty of the file:
//
//   [GW]   the real `WidgetsModule` through its controller: the submission walks the pipeline.
//   [HTTP] `AppModule` behind all six global guards: the same claims, where the route really lives.
//   [RI]   the real record row, read through the gateway's OWN projection, handed to `gate8R` as the
//          slot hands it. It reaches branches the pipeline cannot: a COMMIT stops at Gate 6 or 7 long
//          before 8-R this cycle, and no conformant minter produces a SPOKEN COMMIT at all (PKT:471).
//          An [RI] test is never evidence for anything — §0.5 says so in those words — but it is what
//          keeps the required branch from being code nobody has ever run.
//
// THE TWO WORLDS. Slot 8 is still `mechanism_absent` until U8a lands the null-schema lane, so in this
// tree a submission stops at 8 and slot 8-R never runs. The [GW] and [HTTP] tests are written to be
// TRUE IN EITHER WORLD and to say which one they are in:
//
//   world           slot 8            what a Gate 8-R case asserts
//   slot-8-pending  mechanism_absent  the answer is EXACTLY the control's — carrying a readback ack
//                                     changes nothing at slots 1…8 — and the 8-R claim is not proven
//   slot-8-built    passes            the ruled 8-R outcome, code, stop and `gates_run`
//
// A third answer is red in both worlds. The file therefore needs no edit when U8a merges: the
// integrator re-runs it in U8R's merge commit (the merge order is U8a → U8R, §2.4) and the same tests
// assert the 8-R half. `G8R-WORLD` prints which world the run was in, so a green log can never be
// mistaken for a proof it did not make.

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  GateContext,
  IntentRecordRow,
} from '../../src/widgets/gate.types';
import {
  GATE_8R_OWNERS_UNRULED,
  type Gate8ROwners,
} from '../../src/widgets/gates/gate-8r.owners';
import { gate8R } from '../../src/widgets/gates/gate8r';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
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

/** `widgets.controller.ts`'s response: these eleven keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'outcome',
  'next_envelope',
  'owner_decision',
  'receipt_outcome',
  'resolved_widget',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'stopped_at_gate',
];

const REF = 'R-8r-live';
const OTHER_REF = 'R-8r-other';
/** 8-R is the ninth slot, so a run that reached it ran at least nine gates. */
const READBACK_SLOT_INDEX = 9;

type Answer = Record<string, unknown>;

/** A conformant §3.8 submission (P-F88's DTO). No member of it names a duty, a carrier or a tenant. */
const body = (
  record: WidgetFixture,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: `g8r-${randomUUID().slice(0, 8)}`,
  profile_id: 'widgets-live-gate8r',
  ...over,
});

const ack = (record: WidgetFixture, over: Record<string, unknown> = {}) => ({
  readback_ref: REF,
  body_hash: record.bodyHash,
  affirmation: 'да',
  ...over,
});

const ran = (answer: Answer): number => Number(answer.gates_run);
const reachedReadback = (answer: Answer): boolean =>
  ran(answer) >= READBACK_SLOT_INDEX;

/**
 * What a case must see. In `slot-8-built` it is the ruled 8-R answer; in `slot-8-pending` it is the
 * control's own answer, unchanged — which is itself a claim worth making: nothing about a readback
 * ack may move a submission at slots 1…8.
 */
const expectedRefusal = (
  control: Answer,
  code: 'readback_mismatch' | 'readback_missing',
): Answer =>
  reachedReadback(control)
    ? {
        outcome: 'refuse',
        code,
        stopped_at_gate: '8-R',
        gates_run: READBACK_SLOT_INDEX,
      }
    : {
        outcome: control.outcome,
        code: control.code,
        stopped_at_gate: control.stopped_at_gate,
        gates_run: control.gates_run,
      };

const answerOf = (a: Answer): Answer => ({
  outcome: a.outcome,
  code: a.code,
  stopped_at_gate: a.stopped_at_gate,
  gates_run: a.gates_run,
});

const world = (control: Answer): string =>
  reachedReadback(control) ? 'slot-8-built' : 'slot-8-pending';

describe('Gate 8-R — readback, on the live path', () => {
  let ctx: FixtureContext;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  /**
   * `[synthetic record]` — the columns no writer produces today (G6 §7.2's recipe, extended to the
   * confirmation and to the envelope's channel). `confirmationJson` and `WidgetEmission.deliveryChannel`
   * are not floor terms, so `verificationFloor` is untouched; where an EFFECT changes, the change goes
   * through `Fixtures.synthetic`, which recomputes the floor from the updated row.
   *
   * Every record built this way is contract-INVALID: no minter may write a `confirmationJson` on a
   * REFINE (I1/I2), and no minter fits a COMMIT for a spoken tier this cycle. They exercise ingress
   * wiring, and they are never evidence that a spoken COMMIT is protected.
   */
  const syntheticConfirmation = async (
    record: WidgetFixture,
    confirmation: Record<string, unknown> | null,
  ): Promise<void> => {
    await ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: record.intentTokenHash,
          tenantId: record.tenantId,
        },
      },
      data: {
        confirmationJson:
          confirmation === null
            ? Prisma.DbNull
            : (confirmation as Prisma.InputJsonObject),
      },
    });
  };

  const syntheticChannel = async (
    record: WidgetFixture,
    deliveryChannel: string,
  ): Promise<void> => {
    await ctx.prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: record.widgetId,
          tenantId: record.tenantId,
        },
      },
      data: { deliveryChannel },
    });
  };

  // ── [GW] the real WidgetsModule, through its controller ──────────────────────────────────────
  describe('[GW] the real WidgetsModule, through its controller', () => {
    let gw: GatewayHarness;
    let fx: Fixtures;
    let tenant: TenantFixture;
    let actor: Readonly<AuthenticatedUser>;
    let control: Answer;

    const mint = async (
      confirmation?: Record<string, unknown> | null,
    ): Promise<WidgetFixture> => {
      const record = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      if (confirmation !== undefined)
        await syntheticConfirmation(record, confirmation);
      return record;
    };

    const send = async (
      record: WidgetFixture,
      over: Record<string, unknown>,
      scope: string,
    ): Promise<Answer> => gw.intent(actor, body(record, over), scope);

    beforeAll(async () => {
      gw = await bootGateway();
      fx = new Fixtures(ctx, gw);
      tenant = await fx.tenant('U8R');
      actor = await fx.actor(
        tenant,
        await fx.user(tenant, UserRole.ADMINISTRATOR),
      );
      const first = await mint();
      control = await send(first, {}, 'G8R-WORLD: the control submission');
    }, 120_000);
    afterEach(() => {
      gw.recorder.clear();
    });
    afterAll(async () => {
      await fx?.teardown();
      await gw?.close();
    });

    it('G8R-WORLD: the control — a minted record with no ack reaches at least slot 8, and this run’s world is recorded in the assertion', () => {
      // Printed, not just asserted: a green run of this file proves different things in the two
      // worlds, and the log is where the integrator reads which one it got (D-18 merge step).
      process.stdout.write(
        `\nG8R-WORLD: ${world(control)} — control answer ${JSON.stringify(answerOf(control))}\n`,
      );
      expect(Object.keys(control).sort()).toEqual(CONTROLLER_KEYS);
      // Red if the pipeline never got as far as the slot before 8-R: then nothing below says anything.
      expect({
        world: world(control),
        reachedSlot8: ran(control) >= 8,
        answer: answerOf(control),
      }).toEqual({
        world: world(control),
        reachedSlot8: true,
        answer: answerOf(control),
      });
    }, 60_000);

    it('T3 (R-0/R-1): an unrequired record with no ack is not held by 8-R', async () => {
      const record = await mint();
      const scope = 'T3';
      const answer = await send(record, {}, scope);
      expect({ scope, stop: answer.stopped_at_gate }).not.toEqual({
        scope,
        stop: '8-R',
      });
      expect({ scope, answer: answerOf(answer) }).toEqual({
        scope,
        answer: answerOf(control),
      });
      expect({ scope, writes: gw.recorder.writes(scope) }).toEqual({
        scope,
        writes: [],
      });
    }, 60_000);

    it('T3d (R-1): a stored `requires_readback: "true"` is a string, not the boolean true, so the record requires nothing and nothing diverges', async () => {
      for (const stored of [
        { requires_readback: 'true', readback_ref: REF },
        { requires_readback: 1, readback_ref: REF },
        { readback_ref: REF },
      ]) {
        const record = await mint(stored);
        const scope = `T3d ${JSON.stringify(stored)}`;
        const answer = await send(record, {}, scope);
        expect({ scope, answer: answerOf(answer) }).toEqual({
          scope,
          answer: answerOf(control),
        });
      }
    }, 120_000);

    it('T10 (R-6): an object ack on a record whose confirmation is NULL is refused, and writes nothing', async () => {
      const record = await mint();
      const scope = 'T10';
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        record.intentTokenHash,
      );
      const answer = await send(record, { readback_ack: ack(record) }, scope);
      expect({ scope, answer: answerOf(answer) }).toEqual({
        scope,
        answer: expectedRefusal(control, 'readback_mismatch'),
      });
      // T14: NW at 8-R, on the record and on every Widget* model (R3.9.1, INV-24).
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
    }, 60_000);

    it('T11-today (R-6): an object ack on a record whose stored `requires_readback` is FALSE is refused, and writes nothing', async () => {
      const record = await mint({
        requires_readback: false,
        readback_ref: null,
        idempotency_key: randomUUID(),
      });
      const scope = 'T11-today';
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        record.intentTokenHash,
      );
      const answer = await send(record, { readback_ack: ack(record) }, scope);
      expect({ scope, answer: answerOf(answer) }).toEqual({
        scope,
        answer: expectedRefusal(control, 'readback_mismatch'),
      });
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
    }, 60_000);

    it('T-DIV-1 (R-1a): a record that is not a SPOKEN COMMIT but carries a stored duty DIVERGES from the recompute and is refused, with no ack sent at all', async () => {
      const record = await mint({
        requires_readback: true,
        readback_ref: REF,
        readback_text: 'the server sentence',
        idempotency_key: randomUUID(),
      });
      const scope = 'T-DIV-1';
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        record.intentTokenHash,
      );
      const answer = await send(record, {}, scope);
      expect({ scope, answer: answerOf(answer) }).toEqual({
        scope,
        answer: expectedRefusal(control, 'readback_mismatch'),
      });
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
    }, 60_000);

    it('T15 (R-7): a marker affirmation reaches no log line, no response member and no verdict detail', async () => {
      const marker = `MARKER-${randomUUID()}`;
      // Both surfaces a log line can leave by: Nest's own logger, and the console it writes through.
      const spies = [
        ...(['log', 'debug', 'warn', 'error', 'verbose'] as const).map(
          (level) =>
            jest.spyOn(Logger.prototype, level).mockImplementation(() => {}),
        ),
        ...(['log', 'debug', 'warn', 'error', 'info'] as const).map((level) =>
          jest.spyOn(console, level).mockImplementation(() => {}),
        ),
      ];
      try {
        const record = await mint();
        const scope = 'T15';
        const answer = await send(
          record,
          { readback_ack: ack(record, { affirmation: marker }) },
          scope,
        );
        expect(JSON.stringify(answer)).not.toContain(marker);
        const logged = spies.flatMap((spy) =>
          spy.mock.calls.map((call) => JSON.stringify(call)),
        );
        expect(logged.filter((line) => line.includes(marker))).toEqual([]);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    }, 60_000);

    it('T16 (E15/INV-30): a claimed render profile changes nothing — the answer is byte-identical whatever `profile_id` says', async () => {
      const record = await mint();
      const answers: string[] = [];
      for (const profile of ['pwa.v1', 'realtime-voice.v1', 'sms.v1']) {
        const scope = `T16 ${profile}`;
        answers.push(
          JSON.stringify(
            answerOf(
              await send(
                record,
                { profile_id: profile, readback_ack: ack(record) },
                scope,
              ),
            ),
          ),
        );
      }
      expect(new Set(answers).size).toBe(1);
      expect(JSON.parse(answers[0]) as Answer).toEqual(
        expectedRefusal(control, 'readback_mismatch'),
      );
    }, 120_000);
  });

  // ── [RI] the real row, the real projection, the gate as the slot calls it ────────────────────
  describe('[RI] the real record row and the real projection — never evidence (§0.5)', () => {
    let gw: GatewayHarness;
    let fx: Fixtures;
    let tenant: TenantFixture;
    let actor: Readonly<AuthenticatedUser>;
    /** A real SPOKEN COMMIT row with the duty stored and a ref: the required branch's subject. */
    let requiredRow: IntentRecordRow;
    /** The same, with `readback_ref` stored as null (it violates I1's iff on purpose). */
    let nullRefRow: IntentRecordRow;
    /** A real SPOKEN COMMIT with the duty ERASED from the row: B-17's divergence, the other way. */
    let erasedDutyRow: IntentRecordRow;
    /** A real record as the emitter writes one: no confirmation column at all. */
    let plainRow: IntentRecordRow;
    /** The same, with `requires_readback` stored as the STRING "true" (F-DEF-COERCE). */
    let coercedRow: IntentRecordRow;

    /**
     * The gateway's own `findRecord`, so the row under test is the row a gate would be handed.
     *
     * MERGE FIX (U8R's merge): P-PRINCIPAL gave `findRecord` a first parameter, the request
     * transaction `T` (D-1), and this called it with two arguments — so `tx.widgetIntentRecord` was
     * `undefined` and every [RI] case threw. The store client is handed in explicitly now, which is
     * what the gateway does inside `T`: the projection under test is the same one, read through the
     * same client.
     */
    const project = async (record: WidgetFixture): Promise<IntentRecordRow> => {
      const gateway = gw.gateway as unknown as {
        findRecord(
          tx: unknown,
          intentTokenHash: string,
          tenantId: string,
        ): Promise<IntentRecordRow | null>;
      };
      const row = await gateway.findRecord(
        gw.moduleRef.get(PrismaService),
        record.intentTokenHash,
        record.tenantId,
      );
      if (!row) throw new Error('the record just written did not read back');
      return row;
    };

    /**
     * The context the slot passes, with the real row in it. Every other member is irrelevant by
     * construction, and `gate8r.spec.ts` proves that over all eleven carriers.
     */
    const context = (
      row: IntentRecordRow,
      submission: Record<string, unknown>,
    ): GateContext => ({
      intentTokenHash: row.intentTokenHash,
      tenantId: row.tenantId,
      actor,
      principal: null,
      principalProofHash: row.principalProofHash,
      now: new Date(),
      record: row,
      submission: { intent_token: 'live', ...submission },
      verificationLevel: 'SESSION_VERIFIED',
      channelMaxLevel: 'SESSION_VERIFIED',
      carrier: 'pwa',
      facts: {},
    });

    /** A test double, not a vocabulary: it records the bytes it was handed and admits one string. */
    const stub = (): Gate8ROwners & { calls: string[] } => {
      const calls: string[] = [];
      return {
        calls,
        isReadbackAffirmation: (input) => {
          calls.push(input.affirmation);
          return input.affirmation === 'stub-affirm';
        },
      };
    };

    const refusal = (
      row: IntentRecordRow,
      submission: Record<string, unknown>,
      owners: Gate8ROwners,
    ): { outcome: string; code?: string } =>
      gate8R(context(row, submission), owners);

    const goodAck = (row: IntentRecordRow) => ({
      readback_ref: REF,
      body_hash: row.bodyHash,
      affirmation: 'stub-affirm',
    });

    /** `[synthetic record]` F-SPOKEN-COMMIT: a COMMIT fitted for the one SPOKEN channel. */
    const spokenCommit = async (
      confirmation: Record<string, unknown> | null,
    ): Promise<IntentRecordRow> => {
      const record = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      await fx.synthetic(record, {
        effect: 'COMMIT',
        capabilitySpace: 'AE',
        capabilityKey: 'crm.appointment.create.v1',
      });
      await syntheticChannel(record, 'realtime-voice');
      await syntheticConfirmation(record, confirmation);
      return project(record);
    };

    beforeAll(async () => {
      gw = await bootGateway();
      fx = new Fixtures(ctx, gw);
      tenant = await fx.tenant('U8R-RI');
      actor = await fx.actor(
        tenant,
        await fx.user(tenant, UserRole.ADMINISTRATOR),
      );
      requiredRow = await spokenCommit({
        requires_readback: true,
        readback_ref: REF,
        idempotency_key: randomUUID(),
      });
      nullRefRow = await spokenCommit({
        requires_readback: true,
        readback_ref: null,
        idempotency_key: randomUUID(),
      });
      erasedDutyRow = await spokenCommit({
        requires_readback: false,
        readback_ref: null,
        idempotency_key: randomUUID(),
      });
      plainRow = await project(
        await fx.widget({ tenant, actor, kind: 'METRIC', body: { value: 1 } }),
      );
      const coerced = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      await syntheticConfirmation(coerced, {
        requires_readback: 'true',
        readback_ref: REF,
      });
      coercedRow = await project(coerced);
    }, 180_000);
    afterAll(async () => {
      await fx?.teardown();
      await gw?.close();
    });

    it('T3-ri (R-1): a real record with NO confirmation column and no ack passes 8-R', () => {
      expect(
        gate8R(context(plainRow, {}), GATE_8R_OWNERS_UNRULED).outcome,
      ).toBe('pass');
      expect(plainRow.confirmation).toBeNull();
    });

    it('T3d-ri (R-1): a stored `requires_readback: "true"` is a string, so the record requires nothing and nothing diverges', () => {
      expect(coercedRow.confirmation).toEqual({
        requires_readback: 'true',
        readback_ref: REF,
      });
      expect(
        gate8R(context(coercedRow, {}), GATE_8R_OWNERS_UNRULED).outcome,
      ).toBe('pass');
    });

    it('T10-ri (R-6): an object ack on a real record whose confirmation is null is refused', () => {
      expect(
        refusal(
          plainRow,
          {
            readback_ack: {
              readback_ref: REF,
              body_hash: plainRow.bodyHash,
              affirmation: 'да',
            },
          },
          GATE_8R_OWNERS_UNRULED,
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    });

    it('T15-ri (R-7): the gate itself writes no log line carrying the affirmation, on either branch', () => {
      const marker = `MARKER-${randomUUID()}`;
      const spies = [
        ...(['log', 'debug', 'warn', 'error', 'verbose'] as const).map(
          (level) =>
            jest.spyOn(Logger.prototype, level).mockImplementation(() => {}),
        ),
        ...(['log', 'debug', 'warn', 'error', 'info'] as const).map((level) =>
          jest.spyOn(console, level).mockImplementation(() => {}),
        ),
      ];
      try {
        for (const row of [requiredRow, plainRow])
          refusal(
            row,
            {
              readback_ack: {
                readback_ref: REF,
                body_hash: row.bodyHash,
                affirmation: marker,
              },
            },
            GATE_8R_OWNERS_UNRULED,
          );
        const logged = spies.flatMap((spy) =>
          spy.mock.calls.map((call) => JSON.stringify(call)),
        );
        expect(logged.filter((line) => line.includes(marker))).toEqual([]);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });

    it('RI-PROJ (D-3): the stored confirmation reaches the gate as exactly two members — `readback_text` and `idempotency_key` never do', async () => {
      const row = await spokenCommit({
        requires_readback: true,
        readback_ref: REF,
        readback_text: 'the server sentence',
        idempotency_key: randomUUID(),
        approval_policy: 'none',
      });
      expect(row.confirmation).toEqual({
        requires_readback: true,
        readback_ref: REF,
      });
      expect(Object.keys(row)).not.toContain('confirmationJson');
      expect(JSON.stringify(row)).not.toContain('the server sentence');
      expect([row.effect, row.deliveryChannel]).toEqual([
        'COMMIT',
        'realtime-voice',
      ]);
    }, 120_000);

    it('T5 (R-2): on a real SPOKEN COMMIT that requires a readback, an absent ack refuses `readback_missing`', () => {
      expect(refusal(requiredRow, {}, GATE_8R_OWNERS_UNRULED)).toMatchObject({
        outcome: 'refuse',
        code: 'readback_missing',
      });
    });

    it('T-DEF3 (R-5): a correct ref and a correct body hash still refuse while the production vocabulary owner is null — fail closed, not fail open', () => {
      expect(
        refusal(
          requiredRow,
          {
            readback_ack: {
              readback_ref: REF,
              body_hash: requiredRow.bodyHash,
              affirmation: 'да',
            },
          },
          GATE_8R_OWNERS_UNRULED,
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    });

    it('T1-stub (R-3, R-4, R-5): the correct ref, the record’s own body hash and an owner-accepted affirmation pass, and the owner is asked exactly once', () => {
      const owners = stub();
      expect(
        refusal(requiredRow, { readback_ack: goodAck(requiredRow) }, owners)
          .outcome,
      ).toBe('pass');
      expect(owners.calls).toEqual(['stub-affirm']);
    });

    it('T6-stub (R-3): a foreign `readback_ref` refuses', () => {
      expect(
        refusal(
          requiredRow,
          {
            readback_ack: {
              ...goodAck(requiredRow),
              readback_ref: OTHER_REF,
            },
          },
          stub(),
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    });

    it('T7-stub (R-4): a `body_hash` that is not this record’s refuses — affirming a body other than the one read out does not pass', () => {
      expect(
        refusal(
          requiredRow,
          {
            readback_ack: {
              ...goodAck(requiredRow),
              body_hash: 'd'.repeat(64),
            },
          },
          stub(),
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    });

    it('T9-stub (R-5, R-7): the affirmation reaches the owner VERBATIM — no trim, no case fold, no normalisation', () => {
      const owners = stub();
      expect(
        refusal(
          requiredRow,
          {
            readback_ack: {
              ...goodAck(requiredRow),
              affirmation: ' Stub-Affirm.',
            },
          },
          owners,
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
      expect(owners.calls).toEqual([' Stub-Affirm.']);
    });

    it('T13a (R-7): an object ack whose members are wrongly typed refuses, and never throws', () => {
      expect(() =>
        refusal(
          requiredRow,
          { readback_ack: { readback_ref: 1, body_hash: [], affirmation: {} } },
          stub(),
        ),
      ).not.toThrow();
      expect(
        refusal(
          requiredRow,
          { readback_ack: { readback_ref: 1, body_hash: [], affirmation: {} } },
          stub(),
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    });

    it('T13b-direct (R-7): a non-object ack that reaches the gate below the route refuses, and never throws', () => {
      for (const value of ['да', ['да'], 7]) {
        expect(() =>
          refusal(requiredRow, { readback_ack: value }, stub()),
        ).not.toThrow();
        expect(
          refusal(requiredRow, { readback_ack: value }, stub()),
        ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
      }
    });

    it('T13d (R-7): a NULL ack on a record that requires a readback refuses rather than throwing (`null.readback_ref` would be a 500)', () => {
      expect(() =>
        refusal(requiredRow, { readback_ack: null }, stub()),
      ).not.toThrow();
      expect(
        refusal(requiredRow, { readback_ack: null }, stub()),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
    });

    it('T13c-stub (R-3): a null `readback_ref` on BOTH sides is not a match, and the owner is never asked', () => {
      const owners = stub();
      expect(
        refusal(
          nullRefRow,
          {
            readback_ack: {
              readback_ref: null,
              body_hash: nullRefRow.bodyHash,
              affirmation: 'stub-affirm',
            },
          },
          owners,
        ),
      ).toMatchObject({ outcome: 'refuse', code: 'readback_mismatch' });
      expect(owners.calls).toEqual([]);
    });

    it('T-DIV-2 (R-1a): a real COMMIT fitted for the SPOKEN tier with the duty ERASED from its row is refused — the recompute is the second half of the antecedent', () => {
      expect(refusal(erasedDutyRow, {}, GATE_8R_OWNERS_UNRULED)).toMatchObject({
        outcome: 'refuse',
        code: 'readback_mismatch',
      });
    });
  });

  // ── [HTTP] AppModule behind all six global guards ────────────────────────────────────────────
  describe('[HTTP] AppModule behind all six global guards', () => {
    let http: HttpHarness;
    let fx: Fixtures;
    let tenant: TenantFixture;
    let actor: Readonly<AuthenticatedUser>;
    let bearer: string;
    let control: Answer;

    const mint = async (
      confirmation?: Record<string, unknown> | null,
    ): Promise<WidgetFixture> => {
      const record = await fx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      if (confirmation !== undefined)
        await syntheticConfirmation(record, confirmation);
      return record;
    };

    const post = async (
      record: WidgetFixture,
      over: Record<string, unknown>,
    ): Promise<{ status: number; body: Answer }> => {
      http.recorder.clear();
      const res = await http.postIntent(bearer, body(record, over));
      return { status: res.status, body: res.body as Answer };
    };

    beforeAll(async () => {
      http = await bootHttp();
      fx = new Fixtures(ctx, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
      tenant = await fx.tenant('U8R-HTTP');
      const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      await fx.grantFeature(tenant, 'widgets.runtime');
      bearer = await http.login(tenant.slug, user.email, user.password);
      actor = await fx.actorFromAccessToken(bearer);
      control = (await post(await mint(), {})).body;
    }, 180_000);
    afterAll(async () => {
      await fx?.teardown();
      await http?.close();
    });

    it('SMOKE-G8R-UNREQUIRED-ACK (R-6, R-7): behind every guard, an OBJECT ack on a record whose confirmation is null and on one whose `requires_readback` is false is refused, and neither writes', async () => {
      expect(Object.keys(control).sort()).toEqual(CONTROLLER_KEYS);
      for (const [label, confirmation] of [
        ['a null confirmation', null],
        [
          'a confirmation that requires no readback',
          { requires_readback: false, readback_ref: null },
        ],
      ] as ReadonlyArray<readonly [string, Record<string, unknown> | null]>) {
        const record = await mint(confirmation);
        const before = await noWriteBaseline(
          http.recorder,
          ctx.prisma,
          tenant.id,
          record.intentTokenHash,
        );
        const res = await post(record, { readback_ack: ack(record) });
        expect({ label, status: res.status }).toEqual({ label, status: 200 });
        expect({ label, answer: answerOf(res.body) }).toEqual({
          label,
          answer: expectedRefusal(control, 'readback_mismatch'),
        });
        expect({
          label,
          nw: await noWriteViolations(
            http.recorder,
            GATEWAY_SCOPE,
            ctx.prisma,
            tenant.id,
            record.intentTokenHash,
            before,
          ),
        }).toEqual({
          label,
          nw: { writes: [], rowDelta: {}, recordChanged: false },
        });
      }
    }, 180_000);

    it('T-DIV-1-http (R-1a): behind every guard, a record that is not a SPOKEN COMMIT but carries a stored readback duty is refused for the DIVERGENCE alone, with no ack sent at all, and writes nothing', async () => {
      const record = await mint({
        requires_readback: true,
        readback_ref: REF,
        readback_text: 'the server sentence',
        idempotency_key: randomUUID(),
      });
      const before = await noWriteBaseline(
        http.recorder,
        ctx.prisma,
        tenant.id,
        record.intentTokenHash,
      );
      const res = await post(record, {});
      expect(res.status).toBe(200);
      expect(answerOf(res.body)).toEqual(
        expectedRefusal(control, 'readback_mismatch'),
      );
      expect(
        await noWriteViolations(
          http.recorder,
          GATEWAY_SCOPE,
          ctx.prisma,
          tenant.id,
          record.intentTokenHash,
          before,
        ),
      ).toEqual({ writes: [], rowDelta: {}, recordChanged: false });
    }, 180_000);

    it('T13b-http / T12-http (AMB-02c, §3.8): a non-object ack and a NULL ack are 400s at the shape stage, never a §3.9 readback code — and the record is untouched', async () => {
      const record = await mint();
      for (const value of ['да', ['да'], 7, null, { readback_ref: 'r' }]) {
        const res = await post(record, { readback_ack: value });
        const label = JSON.stringify(value);
        expect({ label, status: res.status }).toEqual({ label, status: 400 });
        // A shape-stage refusal carries NONE of the six members a gate answer carries (P-F88 F88-4),
        // so it can never be read as a §3.9 verdict — whatever its prose says about one.
        expect({
          label,
          gateMembers: CONTROLLER_KEYS.filter((k) =>
            Object.prototype.hasOwnProperty.call(res.body, k),
          ),
        }).toEqual({ label, gateMembers: [] });
      }
      const row = await ctx.prisma.widgetIntentRecord.findFirst({
        where: {
          intentTokenHash: record.intentTokenHash,
          tenantId: tenant.id,
        },
        select: { consumedAt: true },
      });
      expect(row?.consumedAt).toBeNull();
    }, 180_000);

    it('T16-http (E15/INV-30, C3): a claimed render-profile HEADER and a claimed `profile_id` change nothing about the answer', async () => {
      const record = await mint();
      const plain = await post(record, { readback_ack: ack(record) });
      http.recorder.clear();
      const claimed = await http.postIntent(
        bearer,
        body(record, {
          profile_id: 'realtime-voice.v1',
          readback_ack: ack(record),
        }),
      );
      expect(answerOf(claimed.body as Answer)).toEqual(answerOf(plain.body));
      expect(answerOf(plain.body)).toEqual(
        expectedRefusal(control, 'readback_mismatch'),
      );
    }, 180_000);
  });
});
