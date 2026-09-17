// Gate 7 on the live path — §3.9 row 7 (C11:4726). GATES-PLAN-V11 U7a.
//
// WHAT THIS FILE IS, AND WHAT IT IS NOT.
//
// NOT EVIDENCE YET. Every record here is written by the harness's own writers, so under D-17 no line
// may carry an `[E-MINT]`/`[E-HOSTILE]`/`[E-DRIFT]`/`[E-TAMPER:…]`/`[E-INDEP]` label, and nothing it
// proves can flip a clause (§0.5). E1-G7 rewrites these cases onto records minted by the production
// trigger T-2b (`POST /api/ai/tools/:toolName/execute`) as an HTTP and BIN pair with manifest lines,
// and the integrator flips G7-1, G7-2, G7-3 and G7-7 there.
//
// WHAT IT DOES PROVE TODAY, which is the thing row 7 never had: that slot 7 RUNS on a real submission
// and refuses. Before U7a it began `if (!ACTUATING.includes(r.effect)) return pass`, so a `NONE` on a
// notification channel, an effect outside its kind's cell and a `REFINE` carrying no capability all
// passed slot 7 untouched. Each of them stops there now, with `stopped_at_gate: '7'` and no write.
//
// WHICH FIXTURES ARE USED, AND WHY THOSE. A Gate 7 case has to REACH slot 7, so every record below is
// one Gate 6 admits on the certified null-subject branch («Gate 6 in full», C11:4740-4741: "NONE, and
// w/i/s/detail NAVIGATE") or on its CONTROL branch. That is deliberate: it keeps this file's answer
// about slot 7 rather than about whichever Wave-1 state Gate 6 is in. Cases that need an AE subject —
// the whole COMMIT branch — cannot reach slot 7 until U6-L3, are covered at [U] in
// `src/widgets/gates/gate7.spec.ts`, and are BLOCKED-DISCHARGE at E2 regardless (D-4: no COMMIT is
// minted on the proof DB before P-DISCHARGE).
//
// THE TIER CASES MINT ON A NON-`pwa` CHANNEL. `Fixtures.widget` fixes `delivery_channel` to `pwa`, so
// the records for C7 are written through the SAME two writers it uses — `WidgetStoresService.appendTurn`
// and `WidgetEmitterService.emit` — with the channel the case needs. No raw insert, no second writer,
// and the `[HTTP]` half is an integrator request (IR-U7A-1) rather than a copy of the fixture builder.
//
// THE `[HTTP]` BLOCK IS THE MERGE-STEP EXIT (D-18), added by the integrator in U7a's merge commit
// once IR-U7A-1 wired slot 7 and IR-F88-3 closed the bootstrap's §3.8 body. It re-runs the three
// cases the card names — the tier refusal, the escape on push, and the kind rule — through
// `AppModule` behind all six global `APP_GUARD`s, on a tenant entitled by `Fixtures.grantFeature`.
// It is still not evidence: the records are harness-minted, so §0.5 says `false` either way. What it
// adds over the `[GW]` half is that no guard, pipe or interceptor on the real route changes slot 7's
// answer.

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
import {
  Fixtures,
  type TenantFixture,
  type UserFixture,
  type WidgetFixture,
} from './support/fixtures';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';

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

const submissionBody = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-gate7',
});

/** The columns `Fixtures.synthetic` may set. Only these; `deliveryChannel` is the emission's. */
interface SyntheticColumns {
  effect?: string;
  capabilitySpace?: string | null;
  capabilityKey?: string | null;
  handoffSpace?: string | null;
  handoffKey?: string | null;
  targetJson?: Record<string, unknown> | null;
  priority?: number;
}

describe('Gate 7 — effect admissibility runs on the live path and refuses (C11:4726)', () => {
  let ctx: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;
  let tenant: TenantFixture;
  let user: UserFixture;
  let actor: Readonly<AuthenticatedUser>;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(ctx, gw);
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });
  beforeEach(async () => {
    tenant = await fx.tenant('U7a');
    user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    actor = await fx.actor(tenant, user);
  });
  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
  });

  /**
   * One record, minted through the harness's real writers, on the channel the case names.
   *
   * `Fixtures.widget` is used unchanged for `pwa`. For any other channel the same two writers are
   * called directly with that `delivery_channel` — the tier clause is keyed on the EMISSION's minted
   * channel (CH2, C11:5899), so a fixture that could only mint `pwa` could not exercise it at all.
   */
  const mint = async (
    kind: 'METRIC' | 'SCHEDULE' | 'SOURCE_STATUS' | 'PROGRESS' | 'LIMITATION',
    deliveryChannel: string,
    columns?: SyntheticColumns,
  ): Promise<WidgetFixture> => {
    let widget: WidgetFixture;
    if (deliveryChannel === 'pwa') {
      widget = await fx.widget({ tenant, actor, kind, body: { value: 1 } });
    } else {
      const conversationId = randomUUID();
      const proof = await fx.principalProofHash(actor);
      const turn = await gw.stores.appendTurn({
        tenantId: tenant.id,
        conversationId,
        turnIndex: 0,
        role: 'assistant',
        principalProofHash: proof,
        channel: 'pwa',
      });
      const sealed = await gw.emitter.emit({
        tenantId: tenant.id,
        conversationId,
        turnId: turn.id,
        kind,
        principalProofHash: proof,
        deliveryChannel,
        body: { value: 1 },
        ttlSeconds: 600,
        freshnessClass: 'live',
      });
      widget = {
        ...sealed,
        tenantId: tenant.id,
        kind,
        conversationId,
        turnId: turn.id,
      };
    }
    if (columns) await fx.synthetic(widget, columns);
    return widget;
  };

  interface Answer {
    readonly stop: string;
    readonly ran: number;
    readonly code: string | undefined;
    readonly outcome: string;
    readonly writes: readonly unknown[];
    readonly operations: readonly string[];
    /** The reads of the SUBMITTED record alone (see `refusedAtSeven`). */
    readonly recordOperations: readonly string[];
    /** How many recorded operations took a lock, and whether any wrote. */
    readonly locks: number;
    readonly wrote: boolean;
  }

  const submit = async (
    scope: string,
    record: WidgetFixture,
  ): Promise<Answer> => {
    const body = (await gw.intent(
      actor,
      submissionBody(record),
      scope,
    )) as unknown as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(CONTROLLER_KEYS);
    const recorded = gw.recorder.inScope(scope);
    const operations = recorded.map((op) => `${op.model}.${op.operation}`);
    return {
      stop: String(body.stopped_at_gate),
      ran: Number(body.gates_run),
      code: body.code as string | undefined,
      outcome: String(body.outcome),
      writes: gw.recorder.writes(scope),
      operations,
      recordOperations: operations.filter((op) =>
        op.startsWith('WidgetIntentRecord'),
      ),
      locks: recorded.filter((op) => op.lock).length,
      wrote: recorded.some((op) => op.write),
    };
  };

  /** Every Gate 7 refusal: stop 7, the row's code, and NW (AMB-08; INV-24 C11:5356). */
  const refusedAtSeven = (scope: string, a: Answer, code: string): void => {
    expect({ scope, stop: a.stop, outcome: a.outcome, code: a.code }).toEqual({
      scope,
      stop: '7',
      outcome: 'refuse',
      code,
    });
    expect({ scope, ran: a.ran }).toEqual({ scope, ran: 7 });
    expect({ scope, writes: a.writes }).toEqual({ scope, writes: [] });
    // MERGE FIX (U7a's merge). This counted ALL recorded operations and expected exactly one. With
    // P-PRINCIPAL merged, `T` also carries the principal's resolution — `Tenant.findUnique`, two
    // `FOR SHARE` raw reads (K1's and B-02's) and `Staff.findMany` — so the property the clause
    // actually needs is counted directly instead: exactly one read of the SUBMITTED record, and the
    // principal's reads take LOCKS and write nothing (D-12). This is the same correction Merge-A
    // applied to T4-INDEP, T4-NW and PR-12.
    expect({ scope, recordOperations: a.recordOperations }).toEqual({
      scope,
      recordOperations: ['WidgetIntentRecord.findFirst'],
    });
    expect({ scope, locks: a.locks, wrote: a.wrote }).toEqual({
      scope,
      locks: 2,
      wrote: false,
    });
  };

  // ── positives: slot 7 admits what the row admits ──────────────────────────────────────────────

  it('T7-POS-NONE [GW]: the record the emitter mints — `NONE` on `METRIC`, delivered to `pwa` — passes slot 7 on all four of C1, C2, C3 and C7', async () => {
    const scope = 'T7-POS-NONE';
    const a = await submit(scope, await mint('METRIC', 'pwa'));
    // Not "stops at 8": the slot after 7 moves as Wave 1 lands. The claim is that slot 7 admitted it.
    expect({ scope, past7: a.ran > 7, stop: a.stop }).toEqual({
      scope,
      past7: true,
      stop: a.stop,
    });
    expect(['1', '2', '3', '4', '5', '6', '7']).not.toContain(a.stop);
    expect({ scope, writes: a.writes }).toEqual({ scope, writes: [] });
  }, 60_000);

  it('T7-POS-ESCAPE [GW]: the one F60 escape passes on `web-push` — CH1 admits it on every tier whose cell does not reach CONTROL, `ANNOUNCEMENT` included (AMB-11 reverses G7’s A1 interim)', async () => {
    const scope = 'T7-POS-ESCAPE';
    const record = await mint('METRIC', 'web-push', {
      effect: 'CONTROL',
      capabilitySpace: 'CONTROL',
      capabilityKey: 'control.widget.dismiss',
      priority: 0,
    });
    const a = await submit(scope, record);
    // The claim is about slot 7 alone: whatever answers, it is not slot 7 and not a Gate 7 code.
    expect({ scope, stop: a.stop, code: a.code }).toEqual({
      scope,
      stop: a.stop,
      code: a.code,
    });
    expect({
      scope,
      refusedAt7: a.stop === '7',
      sevenRan: a.ran >= 7,
    }).toEqual({ scope, refusedAt7: false, sevenRan: true });
  }, 60_000);

  // ── refusals: each of row 7's built clauses, on a real submission ─────────────────────────────

  it('T7-C7 [GW]: a `NONE` record whose envelope was minted for `web-push` is refused at slot 7 — `NONE` is carried by `RICH_INTERACTIVE` alone (R3.2.3), and before U7a this passed', async () => {
    const scope = 'T7-C7';
    const a = await submit(scope, await mint('METRIC', 'web-push'));
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C7-TIER [GW]: the same clause over three more tiers — `sms` (TEXT_ONLY), `guest-chat` (ANONYMOUS_CHAT) and `web-public` (PUBLIC_READ) each refuse a `NONE`', async () => {
    for (const channel of ['sms', 'guest-chat', 'web-public']) {
      const scope = `T7-C7-TIER ${channel}`;
      const a = await submit(scope, await mint('METRIC', channel));
      refusedAtSeven(scope, a, 'effect_not_admissible');
      gw.recorder.clear();
    }
  }, 120_000);

  it('T7-C7-CARRIER [GW]: the refusal is keyed on the EMISSION’s minted channel, not on the submitting carrier — the route hard-codes `carrier: pwa` and `web-push` still refuses', async () => {
    // `intentSubmitArgs` derives the carrier from the route, which is `pwa`; if C7 read that instead
    // of `record.deliveryChannel`, this record would pass. It does not.
    const scope = 'T7-C7-CARRIER';
    const a = await submit(scope, await mint('SCHEDULE', 'web-push'));
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C7-ALLOWLIST [GW]: `ANONYMOUS_CHAT` carries `REFINE` and `HANDOFF`; a `NAVIGATE` on `guest-chat` is refused, although every richer tier carries it — the cell is an ALLOWLIST, not an ordered ceiling (CH1)', async () => {
    const scope = 'T7-C7-ALLOWLIST';
    // A `w`-class NAVIGATE has a null subject, so Gate 6's certified branch admits it and the answer
    // is slot 7's. An ordered-ceiling reading of §4.5.3 would admit this record.
    const a = await submit(
      scope,
      await mint('METRIC', 'guest-chat', {
        effect: 'NAVIGATE',
        targetJson: { class: 'w', route: 'shell.home' },
      }),
    );
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C7-ESC-P1 [GW]: the F60 escape is ONE intent — `control.widget.dismiss` at priority 0. The same key at priority 1 is refused on `web-push`', async () => {
    const scope = 'T7-C7-ESC-P1';
    const a = await submit(
      scope,
      await mint('METRIC', 'web-push', {
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
        priority: 1,
      }),
    );
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C1 [GW]: an effect outside the kind’s cell is refused — `DRAFT` on `METRIC`, whose cell is `NONE, NAVIGATE, REFINE, CONTROL`', async () => {
    const scope = 'T7-C1';
    // No capability at all, so the subject is null and Gate 6's certified null-subject branch admits
    // it: the answer is slot 7's, not slot 6's.
    const a = await submit(
      scope,
      await mint('METRIC', 'pwa', { effect: 'DRAFT' }),
    );
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C1-MEMBERSHIP [GW]: the cell is an ALLOWLIST, not an ordered rank — `REFINE` is refused on `LIMITATION`, whose cell lists the off-order `HANDOFF` above it', async () => {
    const scope = 'T7-C1-MEMBERSHIP';
    const a = await submit(
      scope,
      await mint('LIMITATION', 'pwa', { effect: 'REFINE' }),
    );
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C2 [GW]: a `REFINE` that names no capability is refused — F69 gives REFINE a `C9` ref, and "names nothing" is not one of its cells', async () => {
    const scope = 'T7-C2';
    const a = await submit(
      scope,
      await mint('METRIC', 'pwa', {
        effect: 'REFINE',
        capabilitySpace: null,
        capabilityKey: null,
      }),
    );
    refusedAtSeven(scope, a, 'effect_not_admissible');
  }, 60_000);

  it('T7-C2-NONE [GW]: a `NONE` that names a capability never gets past slot 7 — F69’s first row is "nothing (`capability: null`)", and Gate 6 SHADOWS this shape because the subject is non-null', async () => {
    // Written as the three admissible worlds rather than as "stop 7", because it is true on every
    // build of Gate 6 this wave produces and false the moment the record actuates:
    //   stop 6  the subject is non-null, so Gate 6 dispatches on it and refuses first
    //   stop 7  Gate 6 admits the key, and C2 is the fence
    // Anything past 7 means a `NONE` carrying a capability reached the input gates. The clause's own
    // direction is proven at [U] (`gate7.spec.ts`) and by the `M7-4` mutant, which this cannot kill.
    const scope = 'T7-C2-NONE';
    const a = await submit(
      scope,
      await mint('METRIC', 'pwa', {
        effect: 'NONE',
        capabilitySpace: 'C9',
        capabilityKey: 'catalog.services.read',
      }),
    );
    expect({ scope, outcome: a.outcome, past7: a.ran > 7 }).toEqual({
      scope,
      outcome: 'refuse',
      past7: false,
    });
    expect(['6', '7']).toContain(a.stop);
    expect({ scope, writes: a.writes }).toEqual({ scope, writes: [] });
  }, 60_000);

  it('T7-NW [GW]: neither the admitted nor the refused submission writes anything durable; the one store operation is the record read', async () => {
    const admitted = await submit(
      'T7-NW admitted',
      await mint('METRIC', 'pwa'),
    );
    // MERGE FIX (U7a's merge), for the reason given at `refusedAtSeven`: the record read is counted
    // on its own, and the principal's in-`T` reads by the property that matters — locks, no writes.
    expect({
      writes: admitted.writes,
      recordOperations: admitted.recordOperations,
      wrote: admitted.wrote,
    }).toEqual({
      writes: [],
      recordOperations: ['WidgetIntentRecord.findFirst'],
      wrote: false,
    });
    gw.recorder.clear();
    const refused = await submit(
      'T7-NW refused',
      await mint('METRIC', 'web-push'),
    );
    expect({
      writes: refused.writes,
      recordOperations: refused.recordOperations,
      wrote: refused.wrote,
    }).toEqual({
      writes: [],
      recordOperations: ['WidgetIntentRecord.findFirst'],
      wrote: false,
    });
  }, 120_000);

  // ── [HTTP] the same three rules, on `AppModule` behind all six global guards ───────────────────
  //
  // Merge-step exit (D-18), run by the integrator in U7a's merge commit. Same mint path as the [GW]
  // half — `WidgetStoresService.appendTurn` + `WidgetEmitterService.emit`, resolved out of the HTTP
  // application — so nothing here is evidence (§0.5); what it proves is that the route answers
  // exactly what the gateway answers.
  describe('[HTTP] the route, behind every global guard', () => {
    let http: HttpHarness;
    let hfx: Fixtures;
    let htenant: TenantFixture;
    let hactor: Readonly<AuthenticatedUser>;
    let htoken: string;

    beforeAll(async () => {
      http = await bootHttp();
      hfx = new Fixtures(ctx, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
      htenant = await hfx.tenant('U7a HTTP');
      await hfx.grantFeature(htenant, 'widgets.runtime');
      const hu = await hfx.user(htenant, UserRole.ADMINISTRATOR, 'g7');
      htoken = await http.login(htenant.slug, hu.email, hu.password);
      hactor = await hfx.actorFromAccessToken(htoken);
    }, 180_000);
    afterEach(() => {
      http.recorder.clear();
    });
    afterAll(async () => {
      await hfx?.teardown();
      await http?.close();
    });

    /** The same two writers the [GW] half uses, on the HTTP application's instances. */
    const mintHttp = async (
      kind: 'METRIC' | 'SCHEDULE' | 'SOURCE_STATUS' | 'PROGRESS' | 'LIMITATION',
      deliveryChannel: string,
      columns?: SyntheticColumns,
    ): Promise<WidgetFixture> => {
      const conversationId = randomUUID();
      const proof = await hfx.principalProofHash(hactor);
      const turn = await http.app.get(WidgetStoresService).appendTurn({
        tenantId: htenant.id,
        conversationId,
        turnIndex: 0,
        role: 'assistant',
        principalProofHash: proof,
        channel: 'pwa',
      });
      const sealed = await http.app.get(WidgetEmitterService).emit({
        tenantId: htenant.id,
        conversationId,
        turnId: turn.id,
        kind,
        principalProofHash: proof,
        deliveryChannel,
        body: { value: 1 },
        ttlSeconds: 600,
        freshnessClass: 'live',
      });
      const widget: WidgetFixture = {
        ...sealed,
        tenantId: htenant.id,
        kind,
        conversationId,
        turnId: turn.id,
      };
      if (columns) await hfx.synthetic(widget, columns);
      return widget;
    };

    /** The route's verdict, with `reason_text` read by phrase key rather than by wording. */
    const answerOf = async (
      record: WidgetFixture,
    ): Promise<{
      status: number;
      verdict: Record<string, unknown>;
      phraseKey: unknown;
    }> => {
      http.recorder.clear();
      const res = await http.postIntent(htoken, submissionBody(record));
      expect(Object.keys(res.body as object).sort()).toEqual(CONTROLLER_KEYS);
      const { reason_text: reason, ...verdict } = res.body as Record<
        string,
        unknown
      >;
      return {
        status: res.status,
        verdict,
        phraseKey: (reason as { phrase_key?: unknown } | undefined)?.phrase_key,
      };
    };

    const refusedAtSevenHttp = (
      a: {
        status: number;
        verdict: Record<string, unknown>;
        phraseKey: unknown;
      },
      code: string,
    ): void => {
      expect({ status: a.status, body: a.verdict }).toEqual({
        status: 200,
        body: {
          contract: 'maya.widget.intent/1',
          outcome: 'refuse',
          code,
          stopped_at_gate: '7',
          gates_run: 7,
          gates_total: 15,
        },
      });
      expect(a.phraseKey).toBe(`widget.refusal.${code}`);
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    };

    it('SMOKE-G7-TIER [HTTP]: the tier rule on the real route — a `NONE` minted for `web-push` stops at slot 7, with no write', async () => {
      refusedAtSevenHttp(
        await answerOf(await mintHttp('METRIC', 'web-push')),
        'effect_not_admissible',
      );
    }, 180_000);

    it('SMOKE-G7-ESCAPE [HTTP]: the F60 escape is admitted on `web-push` — `control.widget.dismiss` at priority 0 passes slot 7', async () => {
      const a = await answerOf(
        await mintHttp('METRIC', 'web-push', {
          effect: 'CONTROL',
          capabilitySpace: 'CONTROL',
          capabilityKey: 'control.widget.dismiss',
          priority: 0,
        }),
      );
      // Not "stops at 8": the slot after 7 moves as Wave 1 lands. The claim is that slot 7 admitted it.
      expect(a.status).toBe(200);
      expect(Number(a.verdict.gates_run)).toBeGreaterThan(7);
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    }, 180_000);

    it('SMOKE-G7-KIND [HTTP]: the kind rule on the real route — `DRAFT` on `METRIC` stops at slot 7', async () => {
      refusedAtSevenHttp(
        // No capability at all, so the subject is null and Gate 6's certified null-subject branch
        // admits it: the answer is slot 7's, not slot 6's — exactly as in the [GW] twin, T7-C1.
        await answerOf(await mintHttp('METRIC', 'pwa', { effect: 'DRAFT' })),
        'effect_not_admissible',
      );
    }, 180_000);
  });
});
