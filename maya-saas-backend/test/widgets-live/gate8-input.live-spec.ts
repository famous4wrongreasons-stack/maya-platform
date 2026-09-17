// Gate 8 — input validation, on the live code path (G8 §4.2).
//
// Today slot 8 is a refusing `pending()` stub (U0 item 5, G8 §5.0), so the one Gate 8 test that can run
// is T-PENDING8. It is replaced by T1 when U8a lands the null-schema lane; U8a owns this file from then
// on and adds its own cases (T4, T5, T-INV24 …) beside it.
//
// T-PENDING8, class LP (G8 §4.2's legend; plan §4.3 G-SYNTH does not apply: no column is set by hand):
//   - the record is written by the real emitter (`WidgetEmitterService.emit`) over a turn appended by the
//     real timeline store, for a principal whose actor is the value `JwtStrategy.validate` returns for a
//     session `AuthSessionService` issued;
//   - it is submitted through the real `WidgetsModule`'s `IntentGatewayService` with `intentSubmitArgs`,
//     inside the request CLS bound by `TenantResolverService.bindAuthenticatedUser`;
//   - it stops at '8' with `mechanism_absent`, `ran === 8`, and NW holds: no write on any model, no
//     `Widget*` row delta, the record's columns unchanged, and the one store operation is `findRecord`.
// It is NOT evidence that Gate 8 enforces anything: a stub that refuses is not a gate (GATE MODULE EXISTS
// ≠ GATE ENFORCED). It pins that the stub refuses on the live path and that nothing past it runs.

import fs from 'node:fs';
import path from 'node:path';

import { UserRole } from '../../src/common/domain.enums';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures } from './support/fixtures';
import {
  noWriteBaseline,
  noWriteViolations,
} from './support/no-write-recorder';

describe('Gate 8 — live path [GW]', () => {
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

  it('T-PENDING8 [GW, LP]: interim — a record the real emitter minted, submitted by its JwtStrategy-validated principal, stops at 8 with mechanism_absent, ran 8, and writes nothing (NW)', async () => {
    const tenant = await fx.tenant('T-PENDING8');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    expect(actor).toMatchObject({
      userId: user.id,
      tenantId: tenant.id,
      membershipStatus: 'active',
    });
    const widget = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });

    // The token alone, then the same token carrying the other two DTO members: none of them reaches a
    // mechanism past slot 8, and none changes where the pipeline stops.
    const bodies: Record<string, unknown>[] = [
      { intent_token: widget.intentToken },
      { intent_token: widget.intentToken, inputs: { choice: 'a' } },
      {
        intent_token: widget.intentToken,
        inputs: {},
        readback_ack: {
          readback_ref: 'rb-1',
          body_hash: widget.bodyHash,
          affirmation: 'yes',
        },
      },
    ];

    for (const [i, body] of bodies.entries()) {
      const scope = `T-PENDING8#${i}`;
      const before = await noWriteBaseline(
        gw.recorder,
        ctx.prisma,
        tenant.id,
        widget.intentTokenHash,
      );

      const result = await gw.submit(actor, body, scope);

      expect(result).toEqual({
        verdict: {
          outcome: 'refuse',
          code: 'mechanism_absent',
          detail: expect.stringMatching(
            /^gate 8 \(Input validation\) is NORMATIVE-PENDING on /,
          ) as unknown,
        },
        stoppedAt: '8',
        ran: 8,
      });

      const nw = await noWriteViolations(
        gw.recorder,
        scope,
        ctx.prisma,
        tenant.id,
        widget.intentTokenHash,
        before,
      );
      expect(nw).toEqual({ writes: [], rowDelta: {}, recordChanged: false });
      // The one read of the submission is `findRecord` (D-2: no lowering source is read before slot 8
      // passes, and slot 8 does not pass).
      expect(
        gw.recorder.inScope(scope).map((op) => `${op.model}.${op.operation}`),
      ).toEqual(['WidgetIntentRecord.findFirst']);
    }
  });

  it('T-PENDING8 [source half]: no legacy gate8 or MAX_SUBMISSION_BYTES is declared under src/widgets, and slot 8 is the pending stub', () => {
    const root = path.join(__dirname, '..', '..', 'src', 'widgets');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
          files.push(full);
      }
    };
    walk(root);
    const legacy = files.filter((file) =>
      /\b(?:const|function|let|var)\s+(?:gate8|MAX_SUBMISSION_BYTES)\b/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(legacy).toEqual([]);
    expect(fs.existsSync(path.join(root, 'gates', 'gate8.ts'))).toBe(false);

    const slot8 = (
      gw.gateway as unknown as {
        gates: { n: string; pendingOn?: string }[];
      }
    ).gates.find((g) => g.n === '8');
    expect(slot8?.pendingOn).toEqual(expect.any(String));
  });
});
