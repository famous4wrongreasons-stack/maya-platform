import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TimelineStore } from '../../src/widgets/stores/timeline.store';
import { UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';

/** Synthetic HTTP + PostgreSQL. Fresh Nest instances test durable replay, not a deployed binary. */
describe('privacy history erasure current HTTP contract [HTTP/PG]', () => {
  let db: FixtureContext;
  let http: HttpHarness;
  let fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterAll(async () => {
    await fx?.teardown();
    await http?.close();
    await db?.close();
  });
  const post = (token: string | null, conversationId: string, body: object) => {
    const pending = request(http.app.getHttpServer()).post(
      `/api/privacy/conversations/${conversationId}/erasure`,
    );
    if (token) pending.set('authorization', `Bearer ${token}`);
    return pending.send(body);
  };
  const scope = async (
    label: string,
    existing?: { tenant: TenantFixture; user: UserFixture },
  ) => {
    const tenant = existing?.tenant ?? (await fx.tenant(label));
    const user =
      existing?.user ?? (await fx.user(tenant, UserRole.TENANT_OWNER));
    const token = await http.login(tenant.slug, user.email, user.password);
    const actor = await fx.actorFromAccessToken(token);
    const principal = await fx.principalProofHash(actor);
    const conversationId = randomUUID();
    const turn = await db.prisma.widgetTimelineTurn.create({
      data: {
        tenantId: tenant.id,
        conversationId,
        turnIndex: 0,
        role: 'user',
        createdAt: new Date(),
        principalProofHash: principal,
        channel: 'pwa',
        textContent: `synthetic ${label}`,
        retentionUntil: new Date(Date.now() + 86400000),
      },
    });
    return { tenant, user, token, principal, conversationId, turn };
  };
  const state = (tenantId: string) =>
    db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
      select: { id: true, textContent: true, erasedAt: true },
    });

  it('refuses unauthenticated, malformed and foreign scope without erasing anything', async () => {
    const own = await scope('privacy-admission');
    const foreign = await scope('privacy-foreign');
    const before = await state(own.tenant.id);
    expect(
      (await post(null, own.conversationId, { requestId: randomUUID() }))
        .status,
    ).toBe(401);
    expect(
      (
        await post(own.token, `{${own.conversationId}}`, {
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(own.token, own.conversationId, {
          requestId: randomUUID(),
          tenantId: foreign.tenant.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(foreign.token, own.conversationId, {
          requestId: randomUUID(),
        })
      ).status,
    ).toBe(404);
    expect(
      (await post(own.token, randomUUID(), { requestId: randomUUID() })).status,
    ).toBe(404);
    expect(await state(own.tenant.id)).toEqual(before);
    expect(
      await db.prisma.widgetErasureTombstone.count({
        where: { tenantId: own.tenant.id },
      }),
    ).toBe(0);
  });

  it('dedupes concurrent requests and replays the immutable completion after a fresh application starts', async () => {
    const own = await scope('privacy-restart');
    const sibling = await scope('privacy-sibling', own);
    const requestId = randomUUID();
    const [one, two] = await Promise.all([
      post(own.token, own.conversationId, { requestId }),
      post(own.token, own.conversationId, { requestId }),
    ]);
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(two.body as unknown).toEqual(one.body as unknown);
    expect(one.body as unknown).toMatchObject({
      contract: 'maya.privacy.history-erasure/1',
      outcome: 'COMPLETED',
      requestId,
      conversationId: own.conversationId,
      erasedAt: expect.any(String) as unknown,
    });
    const tombstones = await db.prisma.widgetErasureTombstone.findMany({
      where: { tenantId: own.tenant.id },
    });
    expect(tombstones).toHaveLength(1);
    expect(
      await db.prisma.widgetTimelineTurn.findUnique({
        where: { id: sibling.turn.id },
      }),
    ).toMatchObject({ textContent: sibling.turn.textContent, erasedAt: null });
    // A later conversation must survive a replay of the old completion.
    const after = await scope('privacy-after-completion', own);
    await http.close();
    http = await bootHttp();
    const freshToken = await http.login(
      own.tenant.slug,
      own.user.email,
      own.user.password,
    );
    const replay = await post(freshToken, own.conversationId.toUpperCase(), {
      requestId: requestId.toUpperCase(),
    });
    expect(replay.status).toBe(200);
    expect(replay.body as unknown).toEqual(one.body as unknown);
    expect(
      await db.prisma.widgetErasureTombstone.findMany({
        where: { tenantId: own.tenant.id },
      }),
    ).toEqual(tombstones);
    expect(
      await db.prisma.widgetTimelineTurn.findUnique({
        where: { id: after.turn.id },
      }),
    ).toMatchObject({ textContent: after.turn.textContent, erasedAt: null });
    expect(
      (await post(freshToken, sibling.conversationId, { requestId })).status,
    ).toBe(409);
    expect(
      (await post(freshToken, own.conversationId, { requestId: randomUUID() }))
        .status,
    ).toBe(404);
  });

  it('refuses historical content-bearing orphans, but accepts reference-only and foreign drafts', async () => {
    const own = await scope('privacy-orphan');
    const legacy = await db.prisma.widgetDraft.create({
      data: {
        tenantId: own.tenant.id,
        draftRef: randomUUID(),
        draftClass: 'task',
        createdAt: new Date(),
        ownerCapabilitySpace: 'C9',
        ownerCapabilityKey: 'c9.booking.propose',
        principalProofHash: own.principal,
        diffJson: { synthetic: 'unlinked legacy copy' },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const requestId = randomUUID();
    expect(
      (await post(own.token, own.conversationId, { requestId })).status,
    ).toBe(409);
    expect(
      await db.prisma.widgetTimelineTurn.findUnique({
        where: { id: own.turn.id },
      }),
    ).toMatchObject({ textContent: own.turn.textContent, erasedAt: null });
    expect(
      await db.prisma.widgetErasureTombstone.count({
        where: { tenantId: own.tenant.id },
      }),
    ).toBe(0);
    // Remove only this synthetic obstacle; no production cleanup/backfill is exercised.
    await db.prisma.widgetDraft.delete({ where: { id: legacy.id } });
    await db.prisma.widgetDraft.create({
      data: {
        tenantId: own.tenant.id,
        draftRef: randomUUID(),
        draftClass: 'task',
        createdAt: new Date(),
        ownerCapabilitySpace: 'C9',
        ownerCapabilityKey: 'c9.booking.propose',
        principalProofHash: own.principal,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.prisma.widgetDraft.create({
      data: {
        tenantId: own.tenant.id,
        draftRef: randomUUID(),
        draftClass: 'task',
        createdAt: new Date(),
        ownerCapabilitySpace: 'C9',
        ownerCapabilityKey: 'c9.booking.propose',
        principalProofHash: 'f'.repeat(64),
        diffJson: { synthetic: 'another principal' },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    expect(
      (await post(own.token, own.conversationId, { requestId })).status,
    ).toBe(200);
  });

  it('rechecks current authority on completed replay and rejects changed proof or revocation', async () => {
    const own = await scope('privacy-current-authority');
    const requestId = randomUUID();
    expect(
      (await post(own.token, own.conversationId, { requestId })).status,
    ).toBe(200);
    const before = await db.prisma.widgetErasureTombstone.findMany({
      where: { tenantId: own.tenant.id },
    });
    await db.prisma.membership.updateMany({
      where: { tenantId: own.tenant.id, userId: own.user.id },
      data: { role: UserRole.BUSINESS_OWNER },
    });
    expect(
      (await post(own.token, own.conversationId, { requestId })).status,
    ).toBe(409);
    await db.prisma.membership.updateMany({
      where: { tenantId: own.tenant.id, userId: own.user.id },
      data: { status: 'suspended' },
    });
    expect([401, 403]).toContain(
      (await post(own.token, own.conversationId, { requestId })).status,
    );
    expect(
      await db.prisma.widgetErasureTombstone.findMany({
        where: { tenantId: own.tenant.id },
      }),
    ).toEqual(before);
  });

  it('revalidates authority after waiting for the conversation lock', async () => {
    const own = await scope('privacy-revoked-while-waiting');
    let unlock!: () => void;
    let identify!: (pid: number) => void;
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const held = new Promise<number>((resolve) => {
      identify = resolve;
    });
    const holder = db.prisma.$transaction(
      async (tx) => {
        await TimelineStore.lockConversation(
          tx,
          own.tenant.id,
          own.conversationId,
        );
        const [{ pid }] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        identify(pid);
        await release;
      },
      { timeout: 15000, isolationLevel: 'ReadCommitted' },
    );
    let pending: Promise<request.Response> | undefined;
    try {
      const pid = await Promise.race([
        held,
        holder.then(() => {
          throw new Error('holder stopped before admission');
        }),
      ]);
      pending = post(own.token, own.conversationId, {
        requestId: randomUUID(),
      }).then((r) => r);
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const [state] = await db.prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted
          AND ${pid}=ANY(pg_blocking_pids(pid))) AS waiting`;
        if (state.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await db.prisma.tenant.update({
        where: { id: own.tenant.id },
        data: { status: 'suspended' },
      });
      unlock();
      await holder;
      expect((await pending).status).toBe(403);
      expect(
        await db.prisma.widgetTimelineTurn.findUnique({
          where: { id: own.turn.id },
        }),
      ).toMatchObject({ textContent: own.turn.textContent, erasedAt: null });
      expect(
        await db.prisma.widgetErasureTombstone.count({
          where: { tenantId: own.tenant.id },
        }),
      ).toBe(0);
    } finally {
      unlock();
      await Promise.allSettled([holder, ...(pending ? [pending] : [])]);
    }
  });
});
