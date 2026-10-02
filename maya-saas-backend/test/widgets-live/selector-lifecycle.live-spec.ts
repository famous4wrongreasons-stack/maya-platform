import { SELECTOR_OBSERVATION_AUDIT } from '../../src/widgets/di-tokens';
import type { SelectorObservationAuditPort } from '../../src/widgets/owner-ports/selector-observation-audit.port';
import { randomUUID } from 'node:crypto';
import { UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import {
  evidence,
  firstOption,
  object,
  observe,
  startBooking,
  submit,
} from './support/release-booking-flow';

describe('L25 literal selector delivery/render lifecycle [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.useRealTimers();
    await fx.teardown();
    http.recorder.clear();
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });
  const state = async (widgetId: unknown) =>
    (
      await db.prisma.widgetEmission.findFirstOrThrow({
        where: { widgetId: String(widgetId) },
        select: { lifecycleState: true },
      })
    ).lifecycleState;
  const audit = (widgetId: unknown) =>
    db.prisma.auditLog.findMany({
      where: {
        entityId: String(widgetId),
        action: { startsWith: 'widget.selector.' },
      },
      orderBy: { createdAt: 'asc' },
    });

  it('L25-OBSERVED: HTTP delivery alone is DELIVERED; tap cannot create LIVE; render then permits canonical successor', async () => {
    const s = await startBooking(fx, http);
    expect(await state(s.envelope.widget_id)).toBe('DELIVERED');
    const missing = await submit(
      http,
      s.token,
      s.envelope,
      'REFINE',
      firstOption(s.envelope),
    );
    expect(missing).toMatchObject({
      outcome: 'refuse',
      code: 'effect_not_admissible',
      stopped_at_gate: '7',
    });
    expect(await state(s.envelope.widget_id)).toBe('DELIVERED');
    expect(
      await db.prisma.widgetIntentReceipt.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(0);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(0);
    await observe(http, s.token, s.envelope);
    expect(await state(s.envelope.widget_id)).toBe('LIVE');
    const rows = await audit(s.envelope.widget_id);
    expect(rows.map((r) => r.action)).toEqual([
      'widget.selector.delivered',
      'widget.selector.rendered',
    ]);
    for (const row of rows) {
      expect(row.userId).toBe(s.user.id);
      expect(row.metadataJson).toMatchObject({
        authority: 'NONE',
        humanAttentionProven: false,
      });
    }
    const next = await submit(
      http,
      s.token,
      s.envelope,
      'REFINE',
      firstOption(s.envelope),
    );
    expect(next.outcome).toBe('terminate');
    expect(object(next.next_envelope).kind).toBe('STAFF_SELECTOR');
    expect(await state(s.envelope.widget_id)).toBe('SUPERSEDED');
    expect(await state(object(next.next_envelope).widget_id)).toBe('DELIVERED');
    const replay = await http.resolveWidgets(s.token, {
      thread_page: { limit: 1 },
      rendered: evidence(s.envelope),
    });
    expect(replay.status).toBe(403);
    expect(await state(object(next.next_envelope).widget_id)).toBe('DELIVERED');
  });

  it('L25-CONCURRENT: repeated and concurrent observations produce exactly one rendered audit and no authority', async () => {
    const s = await startBooking(fx, http);
    await Promise.all(
      Array.from({ length: 8 }, () => observe(http, s.token, s.envelope)),
    );
    await observe(http, s.token, s.envelope);
    expect(await state(s.envelope.widget_id)).toBe('LIVE');
    expect((await audit(s.envelope.widget_id)).length).toBe(2);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: s.tenant.id },
      }),
    ).toBe(0);
    expect(
      await db.prisma.appointment.count({ where: { tenantId: s.tenant.id } }),
    ).toBe(0);
  });

  it('L25-FOREIGN: foreign principal, tenant and forged bytes cannot attest a selector', async () => {
    const s = await startBooking(fx, http);
    const other = await fx.user(s.tenant, UserRole.CLIENT);
    await fx.client(s.tenant, other);
    const otherToken = await http.login(
      s.tenant.slug,
      other.email,
      other.password,
    );
    const foreign = await startBooking(fx, http);
    for (const [token, rendered] of [
      [otherToken, evidence(s.envelope)],
      [foreign.token, evidence(s.envelope)],
      [s.token, { ...evidence(s.envelope), widget_id: randomUUID() }],
      [s.token, { ...evidence(s.envelope), body_hash: 'a'.repeat(64) }],
      [s.token, { ...evidence(s.envelope), envelope_seal: 'b'.repeat(64) }],
    ] as const) {
      expect(
        (
          await http.resolveWidgets(token, {
            thread_page: { limit: 1 },
            rendered,
          })
        ).status,
      ).toBe(403);
      expect(await state(s.envelope.widget_id)).toBe('DELIVERED');
    }
    expect((await audit(s.envelope.widget_id)).map((r) => r.action)).toEqual([
      'widget.selector.delivered',
    ]);
  });
  it('L25-MISSING: missing delivery evidence and legacy LIVE cannot manufacture a render observation', async () => {
    const s = await startBooking(fx, http);
    await db.prisma.auditLog.deleteMany({
      where: {
        tenantId: s.tenant.id,
        entityId: String(s.envelope.widget_id),
        action: 'widget.selector.delivered',
      },
    });
    const ack = { thread_page: { limit: 1 }, rendered: evidence(s.envelope) };
    expect((await http.resolveWidgets(s.token, ack)).status).toBe(403);
    expect(await state(s.envelope.widget_id)).toBe('DELIVERED');
    // Controlled archival-state counterfactual in the proof database only.
    await db.prisma.widgetEmission.updateMany({
      where: { tenantId: s.tenant.id, widgetId: String(s.envelope.widget_id) },
      data: { lifecycleState: 'LIVE' },
    });
    expect((await http.resolveWidgets(s.token, ack)).status).toBe(403);
    expect(await audit(s.envelope.widget_id)).toEqual([]);
    expect(
      (await http.resolveWidgets(s.token, { ...ack, delivered: true })).status,
    ).toBe(400);
  });

  it('L25-EXPIRY: expired or revoked current authority cannot assert LIVE', async () => {
    const s = await startBooking(fx, http);
    const emission = await db.prisma.widgetEmission.findFirstOrThrow({
      where: { tenantId: s.tenant.id, widgetId: String(s.envelope.widget_id) },
    });
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'hrtime',
        'performance',
        'queueMicrotask',
      ],
    });
    jest.setSystemTime(new Date(emission.expiresAt.getTime() + 1));
    expect(
      (
        await http.resolveWidgets(s.token, {
          thread_page: { limit: 1 },
          rendered: evidence(s.envelope),
        })
      ).status,
    ).toBe(403);
    expect(await state(s.envelope.widget_id)).toBe('DELIVERED');
    jest.useRealTimers();
    const active = await startBooking(fx, http);
    await db.prisma.tenantEntitlement.deleteMany({
      where: { tenantId: active.tenant.id, featureKey: 'widgets.runtime' },
    });
    expect(
      (
        await http.resolveWidgets(active.token, {
          thread_page: { limit: 1 },
          rendered: evidence(active.envelope),
        })
      ).status,
    ).toBe(403);
    expect(await state(active.envelope.widget_id)).toBe('DELIVERED');
  });

  it('L25-ATOMIC: audit failure rolls back LIVE and its observation together', async () => {
    const s = await startBooking(fx, http);
    const port = http.app.get<SelectorObservationAuditPort>(
      SELECTOR_OBSERVATION_AUDIT,
    );
    const append = port.append.bind(port);
    const fail = jest
      .spyOn(port, 'append')
      .mockImplementation(async (value, tx) => {
        await append(value, tx);
        if (value.state === 'LIVE')
          throw new Error('L25 controlled post-audit failure');
      });
    try {
      expect(
        (
          await http.resolveWidgets(s.token, {
            thread_page: { limit: 1 },
            rendered: evidence(s.envelope),
          })
        ).status,
      ).toBe(500);
      expect(await state(s.envelope.widget_id)).toBe('DELIVERED');
      expect((await audit(s.envelope.widget_id)).map((r) => r.action)).toEqual([
        'widget.selector.delivered',
      ]);
    } finally {
      fail.mockRestore();
    }
    await observe(http, s.token, s.envelope);
    expect(await state(s.envelope.widget_id)).toBe('LIVE');
    expect((await audit(s.envelope.widget_id)).length).toBe(2);
  });
});
