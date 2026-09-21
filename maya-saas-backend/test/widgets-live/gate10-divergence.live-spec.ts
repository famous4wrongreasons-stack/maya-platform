// U10b — Gate 10 over the real PostgreSQL stores and the live gateway/HTTP route.

import { randomUUID } from 'node:crypto';
import { UserRole } from '../../src/common/domain.enums';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
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
import { bootHttp, type HttpHarness } from './support/http-bootstrap';

const body = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-gate10',
});

describe('Gate 10 — deterministic divergence and durable audit (U10b)', () => {
  let db: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;

  beforeAll(async () => {
    db = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(db, gw);
  });
  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await gw?.close();
    await db?.close();
  });

  const metric = async (
    fixtures: Fixtures,
    label: string,
    utterance: string,
    now: Date,
  ): Promise<{
    actor: Readonly<AuthenticatedUser>;
    record: WidgetFixture;
    tenant: TenantFixture;
  }> => {
    const tenant = await fixtures.tenant(label);
    const user = await fixtures.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fixtures.actor(tenant, user);
    const record = await fixtures.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
      now,
    });
    await fixtures.synthetic(record, {
      effect: 'REFINE',
      capabilitySpace: 'C9',
      capabilityKey: 'c7.measurement.read',
      utteranceTemplate: utterance,
      singleUse: false,
    });
    return { actor, record, tenant };
  };

  const escapeSibling = async (
    fixtures: Fixtures,
    actor: Readonly<AuthenticatedUser>,
    tenant: TenantFixture,
    now: Date,
  ): Promise<WidgetFixture> => {
    const sibling = await fixtures.widget({
      tenant,
      actor,
      kind: 'LIMITATION',
      body: { control: 'dismiss' },
      now,
    });
    await fixtures.synthetic(sibling, {
      effect: 'CONTROL',
      capabilitySpace: 'CONTROL',
      capabilityKey: 'control.widget.dismiss',
      priority: 0,
      utteranceTemplate: 'unused for the escape candidate',
      singleUse: false,
    });
    return sibling;
  };

  it('T10-R1/T10-CAND [GW] exact subject agreement proceeds without a divergence row', async () => {
    const built = await metric(
      fx,
      'T10-R1',
      'show measurement',
      new Date('2090-09-20T10:00:00.000Z'),
    );
    const result = await gw.submit(built.actor, body(built.record), 'T10-R1');
    expect(result.stoppedAt).not.toBe('10');
    expect(
      await db.prisma.widgetIntentDivergenceAudit.count({
        where: { tenantId: built.record.tenantId },
      }),
    ).toBe(0);
  }, 60_000);

  it('T10-R4/T10-ESC [GW] an escape-first effect divergence refuses and writes exactly one audit', async () => {
    const built = await metric(
      fx,
      'T10-R4',
      'отмена',
      new Date('2090-09-20T10:00:00.000Z'),
    );
    const sibling = await escapeSibling(
      fx,
      built.actor,
      built.tenant,
      new Date('2090-09-20T10:01:00.000Z'),
    );
    const result = await gw.submit(built.actor, body(built.record), 'T10-R4');
    expect(result).toMatchObject({
      stoppedAt: '10',
      verdict: { outcome: 'refuse', code: 'intent_divergence' },
    });
    const audits = await db.prisma.widgetIntentDivergenceAudit.findMany({
      where: { tenantId: built.record.tenantId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      widgetId: built.record.widgetId,
      tappedIntentTokenHash: built.record.intentTokenHash,
      resolvedIntentTokenHash: sibling.intentTokenHash,
      resolvedEffect: 'CONTROL',
      refusalCode: 'intent_divergence',
    });
  }, 60_000);

  it('T10-TX [GW] an audit failure rolls the Gate 9 user turn back with the same request transaction', async () => {
    const built = await metric(
      fx,
      'T10-TX',
      'отмена',
      new Date('2090-09-20T10:00:00.000Z'),
    );
    await escapeSibling(
      fx,
      built.actor,
      built.tenant,
      new Date('2090-09-20T10:01:00.000Z'),
    );
    jest
      .spyOn(WidgetStoresService.prototype, 'recordDivergence')
      .mockRejectedValueOnce(new Error('T10 forced audit failure'));
    await expect(
      gw.submit(built.actor, body(built.record), 'T10-TX'),
    ).rejects.toThrow('T10 forced audit failure');
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: {
          tenantId: built.record.tenantId,
          conversationId: built.record.conversationId,
          role: 'user',
        },
      }),
    ).toBe(0);
    expect(
      await db.prisma.widgetIntentDivergenceAudit.count({
        where: { tenantId: built.record.tenantId },
      }),
    ).toBe(0);
  }, 60_000);

  describe('[HTTP] AppModule behind the production route guards', () => {
    let http: HttpHarness;
    let hfx: Fixtures;

    beforeAll(async () => {
      http = await bootHttp();
      hfx = new Fixtures(db, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
    });
    afterEach(async () => {
      await hfx.teardown();
      http.recorder.clear();
    });
    afterAll(async () => http?.close());

    it('T10-HTTP-1/2 exact agreement proceeds while divergence returns the canonical refusal', async () => {
      const exactTenant = await hfx.tenant('T10-HTTP-1');
      await hfx.grantFeature(exactTenant, 'widgets.runtime');
      const exactLogin = await hfx.user(exactTenant, UserRole.ADMINISTRATOR);
      const exactActor = await hfx.actor(exactTenant, exactLogin);
      const exactRecord = await hfx.widget({
        tenant: exactTenant,
        actor: exactActor,
        kind: 'METRIC',
        body: { value: 1 },
        now: new Date('2090-09-20T11:05:00.000Z'),
      });
      await hfx.synthetic(exactRecord, {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'c7.measurement.read',
        utteranceTemplate: 'show measurement',
        singleUse: false,
      });
      const exactBearer = await http.login(
        exactTenant.slug,
        exactLogin.email,
        exactLogin.password,
      );
      const exactResponse = await http.postIntent(
        exactBearer,
        body(exactRecord),
      );
      expect(exactResponse.status).toBe(200);
      expect(
        (exactResponse.body as Record<string, unknown>).stopped_at_gate,
      ).not.toBe('10');

      const divergentTenant = await hfx.tenant('T10-HTTP-2');
      await hfx.grantFeature(divergentTenant, 'widgets.runtime');
      const divergentLogin = await hfx.user(
        divergentTenant,
        UserRole.ADMINISTRATOR,
      );
      const divergentActor = await hfx.actor(divergentTenant, divergentLogin);
      const divergentRecord = await hfx.widget({
        tenant: divergentTenant,
        actor: divergentActor,
        kind: 'METRIC',
        body: { value: 1 },
        now: new Date('2090-09-20T12:05:00.000Z'),
      });
      await hfx.synthetic(divergentRecord, {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'c7.measurement.read',
        utteranceTemplate: 'отмена',
        singleUse: false,
      });
      await escapeSibling(
        hfx,
        divergentActor,
        divergentTenant,
        new Date('2090-09-20T12:06:00.000Z'),
      );
      const divergentBearer = await http.login(
        divergentTenant.slug,
        divergentLogin.email,
        divergentLogin.password,
      );
      const divergentResponse = await http.postIntent(
        divergentBearer,
        body(divergentRecord),
      );
      expect(divergentResponse.status).toBe(200);
      expect(divergentResponse.body as Record<string, unknown>).toMatchObject({
        outcome: 'refuse',
        code: 'intent_divergence',
        stopped_at_gate: '10',
      });
    }, 60_000);
  });
});
