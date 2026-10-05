import { EncryptionService } from '../../src/encryption/encryption.service';
import {
  decodeChatCompletion,
  isChatReply,
} from '../../src/widgets/stores/chat-reply-codec';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';

const object = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    throw new Error('expected object');
  return v as Record<string, unknown>;
};

describe('9.6 canonical USER identity [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    await fx.teardown();
    http.recorder.clear();
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });
  async function fixture() {
    const tenant = await fx.tenant(
      'Canonical user turn proof',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'ai.consultant',
      'booking',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const chat = (
      requestId: string,
      text = 'что ты умеешь',
      conversationId?: string,
    ) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          surface: 'web',
          requestId,
          messages: [{ role: 'user', content: text }],
          ...(conversationId === undefined ? {} : { conversationId }),
        });
    return { tenant, user, token, chat };
  }

  it('TURN-ORDINARY persists exactly one USER row on concurrent same-request retries and carries its conversation forward', async () => {
    const f = await fixture();
    const id = randomUUID();
    const answers = await Promise.all([f.chat(id), f.chat(id)]);
    for (const r of answers) expect(r.status).toBe(201);
    const ref = object(object(answers[0].body).user_turn);
    expect(object(answers[1].body).user_turn).toEqual(ref);
    const rows = await db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId: f.tenant.id, role: 'user' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: ref.turnId,
      conversationId: ref.conversationId,
      textContent: 'что ты умеешь',
      channel: 'pwa',
    });
    const bindings = await db.prisma.auditLog.findMany({
      where: { tenantId: f.tenant.id, action: 'chat.user_turn_bound' },
    });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].userId).toBe(f.user.id);
    expect(Object.keys(object(bindings[0].metadataJson)).sort()).toEqual([
      'contract',
      'conversationId',
      'intentTokenHash',
      'principalProofHash',
      'turnId',
    ]);
    const changed = await f.chat(id, 'другой текст');
    expect(changed.status).toBe(409);
    const second = await f.chat(
      randomUUID(),
      'что ты умеешь',
      String(ref.conversationId),
    );
    expect(second.status).toBe(201);
    expect(object(object(second.body).user_turn).conversationId).toBe(
      ref.conversationId,
    );
    expect(object(object(second.body).user_turn).turnId).not.toBe(ref.turnId);
    const foreign = await f.chat(randomUUID(), 'что ты умеешь', randomUUID());
    expect(foreign.status).toBe(409);
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: { tenantId: f.tenant.id, role: 'user' },
      }),
    ).toBe(2);
  }, 120_000);

  it('TURN-WIDGET uses the same persisted writer for production-minted typed and tapped controls; expired retry never falls through to ordinary chat', async () => {
    const f = await fixture();
    const trace = randomUUID();
    const executed = await http.executeTool(
      f.token,
      'operations.journal.read',
      { arguments: { date: '2026-09-24' }, surface: 'web' },
      trace,
    );
    expect(executed.status).toBe(201);
    const envelope = object(
      object(object(executed.body).resolution).receipt,
    ).envelope;
    const e = object(envelope);
    const record = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        widgetId: String(e.widget_id),
        effect: 'CONTROL',
      },
    });
    const id = randomUUID();
    const first = await f.chat(id, record.utteranceTemplate!);
    expect(first.status).toBe(201);
    const ref = object(object(first.body).user_turn);
    const stored = await db.prisma.widgetTimelineTurn.findUniqueOrThrow({
      where: { id: String(ref.turnId) },
    });
    expect(stored).toMatchObject({
      role: 'user',
      textContent: record.utteranceTemplate,
      principalProofHash: record.principalProofHash,
    });
    // Adversarial lifecycle change, not an additional production-source claim.
    await db.prisma.widgetIntentRecord.update({
      where: { id: record.id },
      data: { expiresAt: new Date(record.issuedAt.getTime() + 1) },
    });
    const retry = await f.chat(id, record.utteranceTemplate!);
    expect(retry.status).toBe(201);
    expect(object(retry.body).user_turn).toEqual(ref);
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: { tenantId: f.tenant.id, role: 'user' },
      }),
    ).toBe(1);
    const audit = await db.prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        action: 'chat.user_turn_bound',
        entityId: String(ref.turnId),
      },
    });
    expect(object(audit.metadataJson).intentTokenHash).toBe(
      record.intentTokenHash,
    );
    const next = await http.executeTool(
      f.token,
      'operations.journal.read',
      { arguments: { date: '2026-09-25' }, surface: 'web' },
      randomUUID(),
    );
    expect(next.status).toBe(201);
    const e2 = object(
      object(object(object(next.body).resolution).receipt).envelope,
    );
    const nativeIntent = (e2.intents as unknown[])
      .map(object)
      .find((i) => i.effect === 'CONTROL')!;
    const native = {
      widget_id: e2.widget_id,
      intent_token: nativeIntent.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
    };
    for (let i = 0; i < 2; i += 1) {
      const tap = await http.postIntent(f.token, native);
      expect(tap.status).toBe(200);
    }
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: { tenantId: f.tenant.id, role: 'user' },
      }),
    ).toBe(2);
  }, 120_000);

  it('TURN-ERASURE refuses replay of an erased row without restoring content or extending retention', async () => {
    const f = await fixture();
    const id = randomUUID();
    const first = await f.chat(id);
    expect(first.status).toBe(201);
    const ref = object(object(first.body).user_turn);
    const before = await db.prisma.widgetTimelineTurn.update({
      where: { id: String(ref.turnId) },
      data: { textContent: null, erasedAt: new Date() },
    });
    const retry = await f.chat(id);
    expect(retry.status).toBe(409);
    expect(
      await db.prisma.widgetTimelineTurn.findUnique({
        where: { id: before.id },
      }),
    ).toEqual(before);
  }, 120_000);

  it('TURN-ATOMIC rolls back the USER row when its immutable correlation cannot be committed', async () => {
    const f = await fixture();
    // Local proof database only: a transaction-local fault target cannot affect another tenant.
    // This is test fault injection, not application schema or a persisted migration.
    await db.prisma
      .$executeRawUnsafe(`CREATE FUNCTION wl_turn_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."action" = 'chat.user_turn_bound' AND NEW."tenantId" = '${f.tenant.id}' THEN
          RAISE EXCEPTION 'synthetic user turn correlation fault';
        END IF;
        RETURN NEW;
      END $$`);
    await db.prisma.$executeRawUnsafe(
      'CREATE TRIGGER wl_turn_audit_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wl_turn_audit_fault()',
    );
    const id = randomUUID();
    try {
      expect((await f.chat(id)).status).toBe(500);
      expect(
        await db.prisma.widgetTimelineTurn.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(0);
      expect(
        await db.prisma.auditLog.count({
          where: { tenantId: f.tenant.id, action: 'chat.user_turn_bound' },
        }),
      ).toBe(0);
    } finally {
      await db.prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS wl_turn_audit_fault ON "AuditLog"',
      );
      await db.prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS wl_turn_audit_fault()',
      );
    }
    const success = await f.chat(id);
    expect(success.status).toBe(201);
    const rows = await db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId: f.tenant.id },
      orderBy: { turnIndex: 'asc' },
    });
    // RT6 + accepted resume contract: one USER plus one encrypted completion, not a second USER.
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant']);
    expect(rows[0].id).toBe(object(object(success.body).user_turn).turnId);
    expect(
      decodeChatCompletion(
        http.app.get(EncryptionService),
        rows[1].textContent!,
      ),
    ).toMatchObject({ parentId: rows[0].id, text: object(success.body).reply });
    expect(rows[1].retentionUntil).toEqual(rows[0].retentionUntil);
    expect(
      await db.prisma.auditLog.count({
        where: { tenantId: f.tenant.id, action: 'chat.user_turn_bound' },
      }),
    ).toBe(1);
  }, 120_000);

  it('TURN-READ keeps an actual chat read, its widget emission and the next typed widget turn in one conversation', async () => {
    const f = await fixture();
    await fx.grantFeature(f.tenant, 'analytics.business');
    // Only the non-authoritative model suggestion is synthetic. Every policy, owner read,
    // T-2a producer, mint, gate and PostgreSQL write below is the real application path.
    const model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockResolvedValueOnce({
        reply: '',
        toolCall: {
          name: 'operations.journal.read',
          arguments: { date: '2026-09-24' },
        },
        provider: 'openai',
        model: 'synthetic-turn-correlation-proof',
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      });
    let first: Awaited<ReturnType<typeof f.chat>>;
    try {
      first = await f.chat(randomUUID(), 'Покажи записи на 2026-09-24');
    } finally {
      model.mockRestore();
    }
    expect(first.status).toBe(201);
    const ref = object(object(first.body).user_turn);
    const rows = await db.prisma.widgetTimelineTurn.findMany({
      where: {
        tenantId: f.tenant.id,
        conversationId: String(ref.conversationId),
      },
      orderBy: { turnIndex: 'asc' },
    });
    expect(rows.map((row) => row.role)).toEqual([
      'user',
      'assistant',
      'assistant',
    ]);
    expect(rows[0].id).toBe(ref.turnId);
    expect(rows[1].textContent).toBeNull(); // the widget emission is not a restored chat completion
    expect(isChatReply(rows[2].textContent!)).toBe(true);
    expect(
      decodeChatCompletion(
        http.app.get(EncryptionService),
        rows[2].textContent!,
      ),
    ).toMatchObject({ parentId: ref.turnId, text: object(first.body).reply });
    const history = await request(http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('Authorization', `Bearer ${f.token}`);
    expect(history.status).toBe(200);
    expect(object(history.body).turns).toEqual([
      expect.objectContaining({
        id: ref.turnId,
        role: 'user',
        completed: true,
      }),
      expect.objectContaining({
        id: rows[2].id,
        role: 'assistant',
        text: object(first.body).reply,
      }),
    ]);
    const emission = await db.prisma.widgetEmission.findFirstOrThrow({
      where: { tenantId: f.tenant.id, turnId: rows[1].id },
    });
    const control = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        widgetId: emission.widgetId,
        effect: 'CONTROL',
      },
    });
    const second = await f.chat(
      randomUUID(),
      control.utteranceTemplate!,
      String(ref.conversationId),
    );
    expect(second.status).toBe(201);
    const lowered = object(object(second.body).user_turn);
    expect(lowered.conversationId).toBe(ref.conversationId);
    expect(lowered.turnId).not.toBe(ref.turnId);
    const turn = await db.prisma.widgetTimelineTurn.findUniqueOrThrow({
      where: { id: String(lowered.turnId) },
    });
    expect(turn).toMatchObject({
      role: 'user',
      turnIndex: 3, // user + widget emission + persisted chat completion
      textContent: control.utteranceTemplate,
    });
    const source = http
      .mintProvenance()
      .filter((entry) => entry.widget_id === emission.widgetId);
    expect(source.length).toBeGreaterThan(0);
    expect(http.refusedMintProvenance()).toBe(0);
    expect(http.malformedMintProvenance()).toBe(0);
  }, 120_000);

  it('TURN-SCOPE refuses a foreign current actor or tenant conversation; request IDs alone never confer identity', async () => {
    const f = await fixture();
    const g = await fixture();
    const requestId = randomUUID();
    const first = await f.chat(requestId);
    expect(first.status).toBe(201);
    const ref = object(object(first.body).user_turn);
    const other = await fx.user(
      f.tenant,
      UserRole.TENANT_OWNER,
      'other-turn-actor',
    );
    const token = await http.login(f.tenant.slug, other.email, other.password);
    const attempted = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        requestId,
        conversationId: ref.conversationId,
        messages: [{ role: 'user', content: 'что ты умеешь' }],
      });
    expect(attempted.status).toBe(409);
    expect(
      (await g.chat(requestId, 'что ты умеешь', String(ref.conversationId)))
        .status,
    ).toBe(409);
    const independent = await g.chat(requestId);
    expect(independent.status).toBe(201);
    expect(object(object(independent.body).user_turn).turnId).not.toBe(
      ref.turnId,
    );
  }, 120_000);

  it('TURN-BROKEN-BINDING refuses duplicate evidence, orphan rows and expired history without recreating either half', async () => {
    const f = await fixture();
    const id = randomUUID();
    const first = await f.chat(id);
    expect(first.status).toBe(201);
    const ref = object(object(first.body).user_turn);
    const completedReplies = await db.prisma.widgetTimelineTurn.findMany({
      where: { tenantId: f.tenant.id, role: 'assistant' },
    });
    expect(completedReplies).toHaveLength(1);
    expect(
      decodeChatCompletion(
        http.app.get(EncryptionService),
        completedReplies[0].textContent!,
      ),
    ).toMatchObject({ parentId: ref.turnId, text: object(first.body).reply });
    const evidence = await db.prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        action: 'chat.user_turn_bound',
        entityId: String(ref.turnId),
      },
    });
    const duplicate = await db.prisma.auditLog.create({
      data: {
        scope: evidence.scope,
        tenantId: evidence.tenantId,
        userId: evidence.userId,
        action: evidence.action,
        entityType: evidence.entityType,
        entityId: evidence.entityId,
        metadataJson: evidence.metadataJson!,
      },
    });
    expect((await f.chat(id)).status).toBe(409);
    await db.prisma.auditLog.delete({ where: { id: duplicate.id } });
    const before = await db.prisma.widgetTimelineTurn.update({
      where: { id: String(ref.turnId) },
      data: { retentionUntil: new Date(Date.now() - 1) },
    });
    expect((await f.chat(id)).status).toBe(409);
    expect(
      await db.prisma.widgetTimelineTurn.findUnique({
        where: { id: before.id },
      }),
    ).toEqual(before);
    await db.prisma.auditLog.delete({ where: { id: evidence.id } });
    expect((await f.chat(id)).status).toBe(409);
    expect(
      await db.prisma.auditLog.count({
        where: { tenantId: f.tenant.id, action: 'chat.user_turn_bound' },
      }),
    ).toBe(0);
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: { tenantId: f.tenant.id, role: 'user' },
      }),
    ).toBe(1);
    expect(
      await db.prisma.widgetTimelineTurn.findMany({
        where: { tenantId: f.tenant.id, role: 'assistant' },
      }),
    ).toEqual(completedReplies); // no erased/expired/broken replay rewrites or appends a completion
  }, 120_000);
});
