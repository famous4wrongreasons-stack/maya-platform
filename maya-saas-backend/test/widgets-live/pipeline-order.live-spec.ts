// T-F11 (G8 §4.2) and B-1 (G10 §9.4): the pipeline's order, on the live code path.
//
// Both name F11's one order. The integrator owns the array, so the live half of both lives here, beside
// the fast source-level half (`src/widgets/intent-gateway.order.spec.ts`, which also runs the named order
// mutants).
//
//   (a) The `IntentGatewayService` that the real `WidgetsModule` constructs — the instance the route
//       uses — holds §3.9's fifteen slots in order: its `n` sequence equals the contract's §3.9 table,
//       read from `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md`. So 7 < 8 < 8-R < 9 and index('8') === 7.
//   (b) Where the live path can observe the order, it agrees: persisted records submitted by
//       JwtStrategy-validated principals stop at 0, 1, 3, 5, 7 and 8, and every stop's `ran` is its
//       position in (a). A record past slot 8 cannot be reached today (slot 8 refuses), so 8-R … 14 are
//       held by (a) alone. Slot 2 is a guard-hosted constant pass and slot 4 cannot fire (the record read is
//       tenant-scoped: a foreign tenant's token is never read and stops at 1, shown below).
//   (c) B-1's second half, "only Gate 9 may return the lowering": the J-1 producer map names slot 9 as the
//       only producer of `lowering` and `loweredTurn` (`mergeFacts` enforces it at run time;
//       `gates/facts.architecture.spec.ts` at the source).
//
// Records: 0, 1, 3 and 8 use only what the real writers produce (class LP). 5 and 7 are `[synthetic record]`
// (D-5: labelled, never evidence): 5 has a stored floor that differs from its recomputation, 7 is a DRAFT with
// no subject capability. When U6/U7 change what Gates 5–7 decide, those units update these two expectations.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import type { Gate } from '../../src/widgets/gate.types';
import { FACT_SLOTS } from '../../src/widgets/gates/facts';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures, SYNTHETIC } from './support/fixtures';

const SECTION_3_9 = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '8-R',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
];

/** The `#` column of the contract's §3.9 gate table. */
const contractOrder = (): string[] => {
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'rebuild',
    'MAYA-WIDGET-CONTRACT-V1.md',
  );
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.slice(text.indexOf('\n### 3.9 ')).split('\n');
  const at = lines.findIndex((l) => /^\|\s*#\s*\|\s*Gate\s*\|/.test(l));
  if (at < 0) throw new Error('the contract has no §3.9 gate table');
  const order: string[] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    order.push(line.split('|')[1].trim().replace(/\*/g, ''));
  }
  return order;
};

describe('T-F11/B-1 — the pipeline order on the live code path [GW]', () => {
  let gw: GatewayHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;

  beforeAll(async () => {
    gw = await bootGateway();
    ctx = await bootFixtureContext();
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

  it("T-F11/B-1 (a): the gateway the real WidgetsModule constructs holds §3.9's fifteen slots in the contract's order; 7 < 8 < 8-R < 9 and index('8') === 7", () => {
    const order = (gw.gateway as unknown as { gates: Gate[] }).gates.map(
      (g) => g.n,
    );
    expect(contractOrder()).toEqual(SECTION_3_9);
    expect(order).toEqual(SECTION_3_9);
    expect(gw.gateway.gateCount).toBe(15);
    expect(order.indexOf('8')).toBe(7);
    expect(order.indexOf('7')).toBeLessThan(order.indexOf('8'));
    expect(order.indexOf('8')).toBeLessThan(order.indexOf('8-R'));
    expect(order.indexOf('8-R')).toBeLessThan(order.indexOf('9'));
  });

  it(`T-F11/B-1 (b): live stops at 0, 1, 3, 5 ${SYNTHETIC}, 7 ${SYNTHETIC} and 8 each report ran equal to the slot's position, over records the real writers minted for JwtStrategy-validated principals`, async () => {
    const tenant = await fx.tenant('T-F11/B-1');
    const other = await fx.tenant('T-F11/B-1 foreign tenant');
    const a = await fx.actor(
      tenant,
      await fx.user(tenant, UserRole.ADMINISTRATOR),
    );
    const b = await fx.actor(tenant, await fx.user(tenant, UserRole.MANAGER));
    const foreign = await fx.actor(
      other,
      await fx.user(other, UserRole.ADMINISTRATOR),
    );
    const mint = (actor = a, now?: Date, ttlSeconds?: number) =>
      fx.widget({
        tenant: actor === foreign ? other : tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
        now,
        ttlSeconds,
      });

    const valid = await mint();
    const expired = await mint(a, new Date(Date.now() - 120_000), 60);
    const foreignToken = await mint(foreign);
    const floorChanged = await mint();
    await fx.synthetic(floorChanged, {}, 'BOUND_CLIENT');
    const draftWithoutSubject = await mint();
    await fx.synthetic(draftWithoutSubject, { effect: 'DRAFT' });

    const cases: {
      label: string;
      actor: typeof a;
      token: string;
      widgetId: string;
      stop: string;
      code: string | null;
    }[] = [
      // Step 0: a token of only whitespace passes the DTO (16 characters) and is not a token.
      {
        label: 'blank token',
        actor: a,
        token: ' '.repeat(16),
        widgetId: randomUUID(),
        stop: '0',
        code: 'unauthenticated',
      },
      {
        label: 'never minted',
        actor: a,
        token: 'x'.repeat(43),
        widgetId: randomUUID(),
        stop: '1',
        code: null,
      },
      {
        label: 'expired',
        actor: a,
        token: expired.intentToken,
        widgetId: expired.widgetId,
        stop: '1',
        code: null,
      },
      {
        label: "a foreign tenant's token (never read: slot 4 cannot fire)",
        actor: a,
        token: foreignToken.intentToken,
        widgetId: foreignToken.widgetId,
        stop: '1',
        code: null,
      },
      {
        label: "another principal's token",
        actor: b,
        token: valid.intentToken,
        widgetId: valid.widgetId,
        stop: '3',
        code: 'widget_principal_mismatch',
      },
      {
        label: `${SYNTHETIC} stored floor differs from the recomputed floor`,
        actor: a,
        token: floorChanged.intentToken,
        widgetId: floorChanged.widgetId,
        stop: '5',
        code: 'policy_floor_changed',
      },
      {
        label: `${SYNTHETIC} a DRAFT with no subject capability`,
        actor: a,
        token: draftWithoutSubject.intentToken,
        widgetId: draftWithoutSubject.widgetId,
        stop: '7',
        code: 'effect_not_admissible',
      },
      {
        // IR-8a-3 (U8a's merge). This stopped at 8 while slot 8 was the I-CTX stub. Slot 8 is the
        // built null-schema lane now, and the harness body carries `inputs: null` (IR-F88-3's fill of
        // §3.8's required member), which is the lane's PASS — so the first slot that still has no
        // mechanism is 9. The claim the row makes is unchanged: `ran` equals the stopping slot's
        // position in §3.9, and the wall moved by exactly one built gate.
        label: 'valid',
        actor: a,
        token: valid.intentToken,
        widgetId: valid.widgetId,
        stop: '9',
        code: 'mechanism_absent',
      },
    ];

    const observed = [];
    for (const c of cases) {
      const result = await gw.submit(
        c.actor,
        { intent_token: c.token, widget_id: c.widgetId },
        c.label,
      );
      const code = 'code' in result.verdict ? result.verdict.code : null;
      observed.push({
        label: c.label,
        stop: result.stoppedAt,
        ran: result.ran,
        code,
      });
      expect(gw.recorder.writes(c.label)).toEqual([]);
    }

    expect(observed).toEqual(
      cases.map((c) => ({
        label: c.label,
        stop: c.stop,
        ran: c.stop === '0' ? 0 : SECTION_3_9.indexOf(c.stop) + 1,
        code: c.code,
      })),
    );
    const stops = [...new Set(observed.map((o) => o.ran))];
    expect(stops).toEqual([0, 1, 3, 5, 7, 10]);
  });

  it('T-F11/B-1 (c): only slot 9 may produce the lowering facts (J-1 producer map)', () => {
    expect(FACT_SLOTS.lowering.producer).toBe('9');
    expect(FACT_SLOTS.loweredTurn.producer).toBe('9');
  });
});
