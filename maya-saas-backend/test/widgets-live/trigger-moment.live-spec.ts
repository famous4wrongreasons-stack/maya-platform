import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../src/tenancy/tenant-resolver.service';
import type { SealedEmission } from '../../src/widgets/emission/emitter.service';
import { MomentTriggerService } from '../../src/widgets/composition/moment.trigger';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures } from './support/fixtures';

describe('P-MT3 — canonical K13 moment trigger [GW, PostgreSQL]', () => {
  let gw: GatewayHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;

  beforeAll(async () => {
    gw = await bootGateway();
    ctx = await bootFixtureContext();
    fx = new Fixtures(ctx, gw);
  });
  afterEach(async () => {
    if (fx) await fx.teardown();
    gw?.recorder.clear();
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  const setup = async (marker: string, entitled: boolean) => {
    const tenant = await fx.tenant(marker);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    await fx.staff(tenant, user, marker);
    const actor = await fx.actor(tenant, user);
    if (entitled) await fx.grantFeature(tenant, 'widgets.runtime');
    const now = new Date();
    const input = {
      tenantId: tenant.id,
      runId: randomUUID(),
      occurrenceRef: 'a'.repeat(64),
      occurredAt: new Date(now.getTime() - 60_000).toISOString(),
      admittedAt: new Date(now.getTime() - 30_000).toISOString(),
      expiresAt: new Date(now.getTime() + 600_000).toISOString(),
      recipient: {
        userId: actor.userId,
        role: actor.role,
        title: 'Скоро начало смены',
        bodyText: 'Ваша смена скоро начинается.',
      },
      source: {
        localDate: now.toISOString().slice(0, 10),
        timezone: 'Europe/Moscow',
        scheduledStartAt: new Date(now.getTime() + 1_800_000).toISOString(),
        scheduleEvidenceHash: 'b'.repeat(64),
      },
    } as const;
    return { tenant, user, actor, input, now };
  };

  const trigger = async (
    actor: Awaited<ReturnType<Fixtures['actor']>>,
    input: Awaited<ReturnType<typeof setup>>['input'],
    now: Date,
  ) => {
    const context = gw.moduleRef.get(TenantContextService, { strict: false });
    const resolver = gw.moduleRef.get(TenantResolverService, { strict: false });
    const service = gw.moduleRef.get(MomentTriggerService, { strict: false });
    return context.run(`widgets-live:mt3:${randomUUID()}`, () => {
      resolver.bindAuthenticatedUser(actor);
      return service.afterShiftAdmitted(input, now);
    });
  };

  it('MT3-1 mints one web-push widget, two typed intents and one render receipt', async () => {
    const s = await setup('P-MT3-1', true);
    const minted = (await trigger(s.actor, s.input, s.now)) as SealedEmission;
    expect(minted).toEqual(
      expect.objectContaining({ kind: 'SCHEDULE', a2Limited: false }),
    );
    const emission = await ctx.prisma.widgetEmission.findUniqueOrThrow({
      where: {
        widgetId_tenantId: {
          widgetId: minted.widgetId,
          tenantId: s.tenant.id,
        },
      },
      include: { intentRecords: true, renderReceipts: true },
    });
    expect(emission.deliveryChannel).toBe('web-push');
    expect(emission.intentRecords).toHaveLength(2);
    expect(emission.intentRecords.map((row) => row.effect).sort()).toEqual([
      'CONTROL',
      'NAVIGATE',
    ]);
    expect(
      emission.intentRecords.find((row) => row.effect === 'NAVIGATE'),
    ).toEqual(
      expect.objectContaining({
        capabilitySpace: null,
        capabilityKey: null,
        targetJson: { class: 's', ref: { route: 'shell.root', param: null } },
      }),
    );
    expect(
      emission.intentRecords.find((row) => row.effect === 'CONTROL'),
    ).toEqual(
      expect.objectContaining({
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
        priority: 0,
        singleUse: true,
      }),
    );
    expect(emission.renderReceipts).toHaveLength(1);
  });

  it('MT3-2 a non-entitled tenant creates no Widget row', async () => {
    const s = await setup('P-MT3-2', false);
    await expect(trigger(s.actor, s.input, s.now)).resolves.toBeNull();
    expect(
      await ctx.prisma.widgetEmission.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(0);
    expect(
      await ctx.prisma.widgetTimelineTurn.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(0);
  });

  it("MT3-3 same-tenant foreign principal cannot acquire another recipient's moment", async () => {
    const s = await setup('P-MT3-3', true);
    const foreign = await fx.user(s.tenant, UserRole.ADMINISTRATOR);
    await fx.staff(s.tenant, foreign, 'P-MT3 foreign trigger');
    const foreignActor = await fx.actor(s.tenant, foreign);
    await expect(trigger(foreignActor, s.input, s.now)).resolves.toBeNull();
    expect(
      await ctx.prisma.widgetEmission.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(0);
  });

  it('G3-e a web-push token minted for A is inert when submitted by B', async () => {
    const s = await setup('P-MT3-G3e', true);
    const minted = (await trigger(s.actor, s.input, s.now)) as SealedEmission;
    const foreign = await fx.user(s.tenant, UserRole.ADMINISTRATOR);
    await fx.staff(s.tenant, foreign, 'P-MT3 foreign');
    const foreignActor = await fx.actor(s.tenant, foreign);
    const answer = await gw.submit(
      foreignActor,
      {
        widget_id: minted.widgetId,
        intent_token: minted.intentTokens[0],
      },
      'P-MT3 G3-e',
    );
    expect(answer.ran).toBe(3);
    expect(answer.stoppedAt).toBe('3');
    expect(answer.verdict.outcome).toBe('refuse');
    expect('code' in answer.verdict ? answer.verdict.code : null).toBe(
      'widget_principal_mismatch',
    );
  });
});
