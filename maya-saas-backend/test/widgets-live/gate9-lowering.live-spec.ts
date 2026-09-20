import { randomUUID } from 'node:crypto';
import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { SealService } from '../../src/widgets/emission/seal.service';
import { TimelineStore } from '../../src/widgets/stores/timeline.store';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import type { LoweredUtterance } from '../../src/widgets/lowering/lowering';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures, type WidgetFixture } from './support/fixtures';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';

const body = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-gate9',
});

describe('Gate 9 — canonical lowering and atomic timeline append (U9b)', () => {
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

  const record = async (
    label: string,
  ): Promise<{
    actor: Readonly<AuthenticatedUser>;
    record: WidgetFixture;
  }> => {
    const tenant = await fx.tenant(label);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const minted = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    const stored = await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: minted.tenantId,
        intentTokenHash: minted.intentTokenHash,
      },
      select: { principalProofHash: true },
    });
    const emission = await ctx.prisma.widgetEmission.findFirstOrThrow({
      where: { tenantId: minted.tenantId, widgetId: minted.widgetId },
      select: {
        bodyHash: true,
        widgetId: true,
        tenantId: true,
        issuedAt: true,
        expiresAt: true,
      },
    });
    const seal = gw.moduleRef.get(SealService);
    await ctx.prisma.widgetEmission.update({
      where: {
        widgetId_tenantId: {
          widgetId: minted.widgetId,
          tenantId: minted.tenantId,
        },
      },
      data: {
        envelopeSeal: seal.seal({
          ...emission,
          principalProofHash: stored.principalProofHash,
          profileId: null,
        }),
      },
    });
    await ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: minted.intentTokenHash,
          tenantId: minted.tenantId,
        },
      },
      data: { utteranceTemplate: 'Покажи показатели' },
    });
    return { actor, record: minted };
  };

  it('T9-POS-5 [GW] appends the lowered USER turn and hands Gate 10 byte-identical content', async () => {
    const built = await record('T9-POS-5');
    const result = await gw.submit(built.actor, body(built.record), 'T9-POS-5');

    expect({ outcome: result.verdict.outcome, stop: result.stoppedAt }).toEqual(
      {
        outcome: 'refuse',
        stop: '10',
      },
    );
    const turns = await ctx.prisma.widgetTimelineTurn.findMany({
      where: {
        tenantId: built.record.tenantId,
        conversationId: built.record.conversationId,
      },
      orderBy: { turnIndex: 'asc' },
    });
    expect(
      turns.map((turn) => [turn.turnIndex, turn.role, turn.textContent]),
    ).toEqual([
      [0, 'assistant', null],
      [1, 'user', 'Покажи показатели'],
    ]);
    const stored = await ctx.prisma.widgetIntentRecord.findUniqueOrThrow({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: built.record.intentTokenHash,
          tenantId: built.record.tenantId,
        },
      },
      select: { renderedUtterance: true },
    });
    expect(stored.renderedUtterance).toBe('Покажи показатели');
  }, 60_000);

  it('T9-NEG-8 [GW] an erased source returns handle_stale and writes no turn', async () => {
    const built = await record('T9-NEG-8');
    await ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: built.record.intentTokenHash,
          tenantId: built.record.tenantId,
        },
      },
      data: { erasedAt: new Date(), utteranceTemplate: null },
    });

    const result = await gw.submit(built.actor, body(built.record), 'T9-NEG-8');
    expect(result).toMatchObject({
      stoppedAt: '9',
      verdict: { outcome: 'superseded', code: 'handle_stale' },
    });
    expect(
      await ctx.prisma.widgetTimelineTurn.count({
        where: {
          tenantId: built.record.tenantId,
          conversationId: built.record.conversationId,
        },
      }),
    ).toBe(1);
    expect(gw.recorder.writes('T9-NEG-8')).toEqual([]);
  }, 60_000);

  it.each([
    ['T9-NEG-1', null],
    ['T9-NEG-2', '   '],
    ['T9-NEG-3', '{{unknown}}'],
  ])(
    '%s [GW] an unrenderable template returns stale and appends no turn',
    async (_id, utteranceTemplate) => {
      const built = await record(_id);
      await ctx.prisma.widgetIntentRecord.update({
        where: {
          intentTokenHash_tenantId: {
            intentTokenHash: built.record.intentTokenHash,
            tenantId: built.record.tenantId,
          },
        },
        data: { utteranceTemplate },
      });
      gw.recorder.clear();
      const result = await gw.submit(built.actor, body(built.record), _id);
      expect(result).toMatchObject({
        stoppedAt: '9',
        verdict: { outcome: 'superseded', code: 'handle_stale' },
      });
      expect(
        await ctx.prisma.widgetTimelineTurn.count({
          where: {
            tenantId: built.record.tenantId,
            conversationId: built.record.conversationId,
          },
        }),
      ).toBe(1);
      expect(gw.recorder.writes(_id)).toEqual([]);
    },
    60_000,
  );

  it('T9-CONC-1 [GW] serialises concurrent appends and allocates distinct ordered indices', async () => {
    const built = await record('T9-CONC-1');
    const [first, second] = await Promise.all([
      gw.submit(built.actor, body(built.record), 'T9-CONC-1:a'),
      gw.submit(built.actor, body(built.record), 'T9-CONC-1:b'),
    ]);
    expect([first.stoppedAt, second.stoppedAt]).toEqual(['10', '10']);
    const turns = await ctx.prisma.widgetTimelineTurn.findMany({
      where: {
        tenantId: built.record.tenantId,
        conversationId: built.record.conversationId,
      },
      orderBy: { turnIndex: 'asc' },
      select: { turnIndex: true },
    });
    expect(turns.map((turn) => turn.turnIndex)).toEqual([0, 1, 2]);
  }, 60_000);

  describe('[HTTP] AppModule behind all six guards', () => {
    let http: HttpHarness;
    let hfx: Fixtures;

    beforeAll(async () => {
      http = await bootHttp();
      hfx = new Fixtures(ctx, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
    });
    afterEach(async () => {
      await hfx.teardown();
      http.recorder.clear();
    });
    afterAll(async () => {
      await http?.close();
    });

    const admitted = async (label: string) => {
      const tenant = await hfx.tenant(label);
      const user = await hfx.user(tenant, UserRole.ADMINISTRATOR);
      await hfx.grantFeature(tenant, 'widgets.runtime');
      const bearer = await http.login(tenant.slug, user.email, user.password);
      const actor = await hfx.actorFromAccessToken(bearer);
      const record = await hfx.widget({
        tenant,
        actor,
        kind: 'METRIC',
        body: { value: 1 },
      });
      await ctx.prisma.widgetIntentRecord.update({
        where: {
          intentTokenHash_tenantId: {
            intentTokenHash: record.intentTokenHash,
            tenantId: record.tenantId,
          },
        },
        data: { utteranceTemplate: 'Покажи показатели' },
      });
      http.recorder.clear();
      return { tenant, bearer, record };
    };

    const timeline = (record: WidgetFixture) =>
      ctx.prisma.widgetTimelineTurn.findMany({
        where: {
          tenantId: record.tenantId,
          conversationId: record.conversationId,
        },
        orderBy: { turnIndex: 'asc' },
        select: { turnIndex: true, role: true, textContent: true },
      });

    it('T9-HTTP-1 lowers through the guarded route and appends the USER turn', async () => {
      const built = await admitted('T9-HTTP-1');
      const result = await http.postIntent(built.bearer, body(built.record));
      expect(result).toMatchObject({
        status: 200,
        body: { stopped_at_gate: '10', gates_run: 11 },
      });
      expect(await timeline(built.record)).toEqual([
        { turnIndex: 0, role: 'assistant', textContent: null },
        { turnIndex: 1, role: 'user', textContent: 'Покажи показатели' },
      ]);
      expect(
        http.recorder
          .writes(GATEWAY_SCOPE)
          .map((write) => `${write.model}.${write.operation}`),
      ).toEqual(
        expect.arrayContaining([
          'WidgetIntentRecord.updateMany',
          'WidgetTimelineTurn.create',
        ]),
      );
    }, 120_000);

    it('T9-HTTP-2 an absent template fails stale and appends no turn', async () => {
      const built = await admitted('T9-HTTP-2');
      await ctx.prisma.widgetIntentRecord.update({
        where: {
          intentTokenHash_tenantId: {
            intentTokenHash: built.record.intentTokenHash,
            tenantId: built.record.tenantId,
          },
        },
        data: { utteranceTemplate: null },
      });
      http.recorder.clear();
      const result = await http.postIntent(built.bearer, body(built.record));
      expect(result).toMatchObject({
        status: 200,
        body: {
          outcome: 'superseded',
          code: 'handle_stale',
          stopped_at_gate: '9',
        },
      });
      expect(await timeline(built.record)).toHaveLength(1);
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    }, 120_000);

    it('T9-HTTP-3 an erased source fails stale and appends no turn', async () => {
      const built = await admitted('T9-HTTP-3');
      await ctx.prisma.widgetIntentRecord.update({
        where: {
          intentTokenHash_tenantId: {
            intentTokenHash: built.record.intentTokenHash,
            tenantId: built.record.tenantId,
          },
        },
        data: { erasedAt: new Date(), utteranceTemplate: null },
      });
      http.recorder.clear();
      const result = await http.postIntent(built.bearer, body(built.record));
      expect(result).toMatchObject({
        status: 200,
        body: {
          outcome: 'superseded',
          code: 'handle_stale',
          stopped_at_gate: '9',
        },
      });
      expect(await timeline(built.record)).toHaveLength(1);
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    }, 120_000);

    it('T9-HTTP-4 a different principal is refused before Gate 9 and cannot write', async () => {
      const built = await admitted('T9-HTTP-4');
      const other = await hfx.user(
        built.tenant,
        UserRole.ADMINISTRATOR,
        'other-principal',
      );
      const otherBearer = await http.login(
        built.tenant.slug,
        other.email,
        other.password,
      );
      http.recorder.clear();
      const result = await http.postIntent(otherBearer, body(built.record));
      expect(result).toMatchObject({
        status: 200,
        body: {
          outcome: 'refuse',
          code: 'widget_principal_mismatch',
          stopped_at_gate: '3',
        },
      });
      expect(await timeline(built.record)).toHaveLength(1);
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    }, 120_000);
  });

  it('T9-ATOM-1 [GW] a writer failure rolls the record update and turn append back together', async () => {
    const built = await record('T9-ATOM-1');
    await expect(
      ctx.prisma.$transaction(async (tx) => {
        jest
          .spyOn(tx.widgetTimelineTurn, 'create')
          .mockRejectedValueOnce(new Error('synthetic insert fault'));
        return TimelineStore.lowerToUserTurn(
          {
            tenantId: built.record.tenantId,
            intentTokenHash: built.record.intentTokenHash,
            conversationId: built.record.conversationId,
            principalProofHash: 'a'.repeat(64),
            channel: 'pwa',
            renderedUtterance: 'Покажи показатели' as LoweredUtterance,
          },
          tx,
        );
      }),
    ).rejects.toThrow('synthetic insert fault');

    const state = await ctx.prisma.widgetIntentRecord.findUniqueOrThrow({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: built.record.intentTokenHash,
          tenantId: built.record.tenantId,
        },
      },
      select: { renderedUtterance: true },
    });
    expect(state.renderedUtterance).toBeNull();
  }, 60_000);
});
