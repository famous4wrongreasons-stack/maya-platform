import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import {
  assertNoEnvFiles,
  widgetsLiveChildEnvironment,
} from './support/environment';

const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('expected object');
  return v as Record<string, unknown>;
};

async function binary() {
  assertNoEnvFiles();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('loopback port');
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const { env } = widgetsLiveChildEnvironment(process.env, {
    HOST: '127.0.0.1',
    PORT: String(address.port),
    NODE_ENV: 'test',
    SWAGGER_ENABLED: 'false',
    AI_CORE_PROVIDER: 'safe',
  });
  const child = spawn(process.execPath, ['dist/src/main'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (value: Buffer) => {
    output += value.toString();
  });
  child.stderr.on('data', (value: Buffer) => {
    output += value.toString();
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  };
  const base = `http://127.0.0.1:${address.port}/api`;
  try {
    const deadline = Date.now() + 20_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('binary exited');
      try {
        ready = (await fetch(base + '/health')).ok;
      } catch {
        /* process starting */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) throw new Error('binary health timeout');
    return {
      stop,
      output: () => output,
      post: async (path: string, token: string, body: unknown) => {
        const r = await fetch(base + path, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: (await r.json()) as unknown };
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

describe('9.6 canonical USER identity [BIN] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
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
  it('TURN-WIDGET persists ordinary, typed widget and native tap identities across two unmodified production processes', async () => {
    const tenant = await fx.tenant('TURN binary', CalendarSource.INTERNAL);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of ['ai.owner', 'booking', 'widgets.runtime'] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const one = await binary();
    let two: Awaited<ReturnType<typeof binary>> | undefined;
    try {
      two = await binary();
      const id = randomUUID();
      const body = {
        surface: 'web',
        requestId: id,
        messages: [{ role: 'user', content: 'что ты умеешь' }],
      };
      const ordinary = await Promise.all([
        one.post('/ai/chat', token, body),
        two.post('/ai/chat', token, body),
      ]);
      for (const answer of ordinary) expect(answer.status).toBe(201);
      expect(obj(ordinary[0].body).user_turn).toEqual(
        obj(ordinary[1].body).user_turn,
      );
      expect(
        await db.prisma.widgetTimelineTurn.count({
          where: { tenantId: tenant.id, role: 'user' },
        }),
      ).toBe(1);
      const source = await one.post(
        '/ai/tools/operations.journal.read/execute',
        token,
        { surface: 'web', arguments: { date: '2026-09-24' } },
      );
      expect(source.status).toBe(201);
      const envelope = obj(
        obj(obj(obj(source.body).resolution).receipt).envelope,
      );
      const record = await db.prisma.widgetIntentRecord.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          widgetId: String(envelope.widget_id),
          effect: 'CONTROL',
        },
      });
      const typed = {
        surface: 'web',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: record.utteranceTemplate }],
      };
      const first = await one.post('/ai/chat', token, typed);
      expect(first.status).toBe(201);
      const ref = obj(obj(first.body).user_turn);
      const retry = await two.post('/ai/chat', token, typed);
      expect(retry.status).toBe(201);
      expect(obj(retry.body).user_turn).toEqual(ref);
      const row = await db.prisma.widgetTimelineTurn.findUniqueOrThrow({
        where: { id: String(ref.turnId) },
      });
      expect(row).toMatchObject({
        role: 'user',
        textContent: record.utteranceTemplate,
        principalProofHash: record.principalProofHash,
      });
      expect(
        await db.prisma.auditLog.count({
          where: {
            tenantId: tenant.id,
            action: 'chat.user_turn_bound',
            entityId: row.id,
            userId: user.id,
          },
        }),
      ).toBe(1);
      const next = await two.post(
        '/ai/tools/operations.journal.read/execute',
        token,
        { surface: 'web', arguments: { date: '2026-09-25' } },
      );
      expect(next.status).toBe(201);
      const nextEnvelope = obj(
        obj(obj(obj(next.body).resolution).receipt).envelope,
      );
      const control = (nextEnvelope.intents as unknown[])
        .map(obj)
        .find((intent) => intent.effect === 'CONTROL')!;
      const tap = {
        contract: 'maya.widget.intent.submission/1',
        widget_id: nextEnvelope.widget_id,
        intent_token: control.intent_token,
        inputs: null,
        client_nonce: randomUUID(),
        profile_id: 'pwa.v1',
      };
      for (const process of [one, two])
        expect((await process.post('/widgets/intent', token, tap)).status).toBe(
          200,
        );
      expect(
        await db.prisma.widgetTimelineTurn.count({
          where: { tenantId: tenant.id, role: 'user' },
        }),
      ).toBe(3);
      expect(one.output()).toContain('WidgetMintProvenance');
      expect(two.output()).toContain('WidgetMintProvenance');
    } finally {
      await one.stop();
      await two?.stop();
    }
  }, 120_000);
});
