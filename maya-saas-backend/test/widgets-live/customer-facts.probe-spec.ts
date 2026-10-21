/** Full AppModule, 107 actual migrations, HTTP login/A22/C9, and current React.
 * Only model choice is scripted. No source/runtime/authority/DB provider mocks. */
import { AppModule } from '../../src/app.module';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { configureHttpApp } from '../../src/bootstrap/configure-http-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { Fixtures } from './support/fixtures';
import type { FixtureContext } from './support/bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';
import { assertNoEnvFiles } from './support/environment';
import { resetLoopbackLoginPreflight } from './support/login-rate-limit';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';

const output = process.env.JEST_D3_OUT!,
  privateFile = process.env.JEST_D3_PRIVATE!,
  phase = process.env.JEST_D3_PHASE;
if (
  !path.isAbsolute(output) ||
  !path.isAbsolute(privateFile) ||
  !['prepare', 'resume'].includes(phase!)
)
  throw new Error('Owned D3 driver required');
assertProofDatabase();
assertNoEnvFiles();
const TOOL = 'company.customer-facts.read',
  PROMPT = 'Какие сведения опубликованы для посетителей?';
const FIRST = 'В зоне ожидания есть питьевая вода.',
  SECOND = 'В зоне ожидания доступна гостевая библиотека.',
  PRIVATE = 'Перед открытием проверить внутренний журнал смены.';
type Identity = {
  tenant: { id: string; slug: string };
  user: { id: string; email: string; password: string };
  token: string;
};
type Checkpoint = {
  a: Identity;
  b: Identity;
  revoked: Identity;
  staleKey: string;
  expiredKey: string;
  chatBody: object;
  firstReply: string;
  privateText: string;
};
const observations: Record<string, unknown> = {
  contract: 'maya.customer-facts-full-app-http/1',
  phase,
  status: 'running',
  appProvidersOverridden: [],
  sourceMocks: [],
  scriptedModelSelection: true,
  admission: 'NOT_ISSUED',
};
const save = () =>
  writeFileSync(
    path.join(output, phase + '.json'),
    JSON.stringify(observations, null, 2) + '\n',
  );

describe('Public customer facts [full AppModule HTTP PG restart React]', () => {
  let app: NestExpressApplication, db: FixtureContext, fx: Fixtures;
  let unexpected = 0,
    modelCalls = 0;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    const config = app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    db = {
      moduleRef,
      prisma: app.get(PrismaService),
      config,
      encryption: app.get(EncryptionService),
      tenantContext: app.get(TenantContextService),
      sessions: app.get(AuthSessionService),
      jwt: app.get(JwtService),
      jwtStrategy: app.get(JwtStrategy),
      close: () => app.close(),
    };
    fx = new Fixtures(db, null);
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      unexpected++;
      throw new Error('External model/provider fetch forbidden');
    });
    jest
      .spyOn(app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        const serialized = JSON.stringify(input);
        for (const text of [FIRST, SECOND, PRIVATE])
          expect(serialized).not.toContain(text);
        return Promise.resolve({
          provider: 'openai',
          model: 'SCRIPTED_D3_ONLY',
          reply: '',
          toolCall: { name: TOOL, arguments: {} },
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [{ intent: 'company.customer_facts', entities: {} }],
            },
            input.principalRole!,
            [TOOL],
          ),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    const migrations = await db.prisma.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(Number(migrations[0].n)).toBe(107);
    observations.appliedMigrations = Number(migrations[0].n);
    save();
  });
  afterAll(async () => {
    if (observations.status !== 'PASS') observations.status = 'FAIL';
    observations.modelCalls = modelCalls;
    observations.externalCalls = unexpected;
    await db?.prisma.$disconnect();
    await app?.close();
    jest.restoreAllMocks();
    save();
  });
  const payload = (r: request.Response) => r.body as Record<string, unknown>;
  const object = (v: unknown) => v as Record<string, unknown>;
  const post = (
    route: string,
    body: object,
    token: string,
    key: string = randomUUID(),
  ) =>
    request(app.getHttpServer())
      .post('/api/' + route)
      .set('Authorization', 'Bearer ' + token)
      .set('idempotency-key', key)
      .send(body);
  const get = (route: string, token: string) =>
    request(app.getHttpServer())
      .get('/api/' + route)
      .set('Authorization', 'Bearer ' + token);
  async function member(
    tenant: Identity['tenant'],
    role: UserRole,
  ): Promise<Identity> {
    const user = await fx.user(tenant, role);
    await resetLoopbackLoginPreflight(db.prisma);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        tenantSlug: tenant.slug,
        email: user.email,
        password: user.password,
      });
    expect(login.status).toBe(201);
    return { tenant, user, token: payload(login).access_token as string };
  }
  async function salon(label: string) {
    const tenant = await fx.tenant(label, CalendarSource.INTERNAL);
    for (const f of [
      'ai.owner',
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, f);
    return member(tenant, UserRole.TENANT_OWNER);
  }
  async function publish(
    owner: Identity,
    text: string,
    options: { expired?: boolean; namespace?: string; ttlMs?: number } = {},
  ) {
    const namespace = options.namespace ?? 'customer_facts';
    const current = await get(
      'governed-settings/tenant/' + namespace,
      owner.token,
    );
    expect(current.status).toBe(200);
    const now = Date.now();
    const body = {
      confirmed: true,
      namespace,
      expectedRevision: payload(current).revision as number,
      previousRevisionId: payload(current).previousRevisionId as string | null,
      content:
        namespace === 'business_rules'
          ? { rules: [{ text }] }
          : {
              audience: 'customer',
              source: 'tenant_owner_confirmed',
              effectiveAt: new Date(now - 60000).toISOString(),
              expiresAt: new Date(
                now + (options.expired ? -1000 : (options.ttlMs ?? 3600000)),
              ).toISOString(),
              facts: [{ text }],
            },
    };
    const saved = await post('governed-settings/tenant', body, owner.token);
    expect({ status: saved.status, body: saved.body as unknown }).toMatchObject(
      { status: 201 },
    );
    return body;
  }
  const read = (
    actor: Identity,
    key: string = randomUUID(),
    args: object = {},
  ) =>
    post(
      'ai/tools/' + TOOL + '/execute',
      { surface: 'web', arguments: args, idempotencyKey: key },
      actor.token,
    );
  const chatBody = () => ({
    surface: 'web',
    requestId: randomUUID(),
    messages: [{ role: 'user', content: PROMPT }],
  });
  const chat = (actor: Identity, body: object = chatBody()) =>
    post('ai/chat', body, actor.token);
  function refused(response: request.Response) {
    expect([400, 401, 403, 409, 503]).toContain(response.status);
    expect(JSON.stringify(response.body)).not.toContain(FIRST);
    expect(JSON.stringify(response.body)).not.toContain(SECOND);
    expect(JSON.stringify(response.body)).not.toContain(PRIVATE);
  }
  function blockedChat(response: request.Response) {
    expect(response.status).toBe(201);
    expect(payload(response).grounding).toMatchObject({ status: 'blocked' });
    expect(payload(response).reply).toBe(
      'Не удалось завершить проверку данных для этого запроса. Подтверждённого ответа пока нет.',
    );
    expect(payload(response).action).toBeNull();
    for (const text of [
      FIRST,
      SECOND,
      PRIVATE,
      'business_rules',
      'customer_facts',
      'encryptedContent',
      'source_revision_id',
    ])
      expect(JSON.stringify(response.body)).not.toContain(text);
    expect(object(payload(response).coordination).state).not.toBe('COMPLETED');
  }
  async function browser(actor: Identity, publisher: Identity) {
    const script = path.resolve(
      '../maya-carrier-react/test/customer-facts-browser-probe.mjs',
    );
    const child = spawn(process.execPath, [script], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let errors = '';
    child.stderr!.on('data', (b) => {
      errors += String(b);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('D3 browser deadline'));
        }, 60000);
        child.on('message', (message: unknown) => {
          void (async () => {
            const m = message as { type: string };
            if (m.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin:
                  'http://127.0.0.1:' +
                  String((app.getHttpServer().address() as AddressInfo).port),
                output,
                email: actor.user.email,
                prompt: PROMPT,
                fact: FIRST,
              });
            } else if (m.type === 'expire') {
              await publish(publisher, FIRST, { expired: true });
              child.send({ type: 'expired' });
            }
          })().catch(reject);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else
            reject(
              new Error(
                'D3 browser failed ' + code + ': ' + errors.slice(-2000),
              ),
            );
        });
      });
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  }
  it('executes its owned prepare or resumed stage', async () => {
    if (phase === 'prepare') {
      const a = await salon('D3 A'),
        b = await salon('D3 B');
      const client = await member(a.tenant, UserRole.CLIENT),
        staff = await member(a.tenant, UserRole.ADMINISTRATOR),
        revoked = await member(a.tenant, UserRole.CLIENT);
      const empty = await read(client);
      expect(empty.status).toBe(201);
      expect(payload(empty).result).toMatchObject({
        status: 'not_configured',
        facts: [],
      });
      await publish(a, PRIVATE, { namespace: 'business_rules' });
      const privateOnly = await read(client);
      expect(payload(privateOnly).result).toMatchObject({
        status: 'not_configured',
        facts: [],
      });
      expect(JSON.stringify(privateOnly.body)).not.toContain(PRIVATE);
      const body = await publish(a, FIRST);
      const deniedPublish = await post(
        'governed-settings/tenant',
        { ...body, expectedRevision: 1 },
        staff.token,
      );
      expect(deniedPublish.status).toBe(403);
      const crossPublish = await post(
        'governed-settings/tenant',
        { ...body, tenantId: b.tenant.id },
        a.token,
      );
      expect(crossPublish.status).toBe(400);
      const staleKey = randomUUID();
      const first = await read(client, staleKey);
      expect(first.status).toBe(201);
      expect(payload(first).result).toMatchObject({
        status: 'configured',
        revision: 1,
        facts: [{ text: FIRST }],
      });
      const replay = await read(client, staleKey);
      expect(replay.status).toBe(201);
      expect(payload(replay).execution_id).toBe(payload(first).execution_id);
      expect(payload(replay).result).toEqual(payload(first).result);
      const foreign = await read(b, staleKey);
      expect(foreign.status).toBe(201);
      expect(payload(foreign).result).toMatchObject({
        status: 'not_configured',
        facts: [],
      });
      refused(await read(client, randomUUID(), { tenantId: b.tenant.id }));
      const cbody = chatBody(),
        firstChat = await chat(client, cbody);
      expect(firstChat.status).toBe(201);
      expect(payload(firstChat).reply).toContain(FIRST);
      expect(payload(firstChat).action).toBeNull();
      expect(payload(firstChat).coordination).toMatchObject({
        state: 'COMPLETED',
      });
      const sameChat = await chat(client, cbody);
      expect(sameChat.status).toBe(201);
      expect(payload(sameChat).coordination).toEqual(
        payload(firstChat).coordination,
      );
      expect(JSON.stringify(payload(firstChat).reply)).not.toMatch(
        /business_rules|encryptedContent|actorMembershipId|source_revision_id/,
      );
      await publish(a, SECOND);
      const staleRead = await read(client, staleKey);
      refused(staleRead);
      const staleChat = await chat(client, cbody);
      blockedChat(staleChat);
      const fresh = await read(client);
      expect(payload(fresh).result).toMatchObject({
        revision: 2,
        facts: [{ text: SECOND }],
      });
      const clockKey = randomUUID(),
        clockChatBody = chatBody();
      const clockPublication = await publish(a, FIRST, { ttlMs: 2000 });
      const clockRead = await read(client, clockKey);
      expect(payload(clockRead).result).toMatchObject({
        status: 'configured',
        revision: 3,
        facts: [{ text: FIRST }],
      });
      const clockChat = await chat(client, clockChatBody);
      expect(payload(clockChat).reply).toContain(FIRST);
      const expiry = Date.parse(
        (clockPublication.content as { expiresAt: string }).expiresAt,
      );
      await new Promise((r) =>
        setTimeout(r, Math.max(0, expiry - Date.now() + 100)),
      );
      expect(
        payload(await get('governed-settings/tenant/customer_facts', a.token))
          .revision,
      ).toBe(3);
      refused(await read(client, clockKey));
      blockedChat(await chat(client, clockChatBody));
      expect(payload(await read(client)).result).toMatchObject({
        status: 'expired',
        revision: 3,
        facts: [],
      });
      const expiresKey = randomUUID();
      await publish(a, FIRST, { expired: true });
      const expired = await read(client, expiresKey);
      expect(expired.status).toBe(201);
      expect(payload(expired).result).toMatchObject({
        status: 'expired',
        facts: [],
      });
      await publish(a, FIRST);
      await browser(client, a);
      const revokedKey = randomUUID();
      await read(revoked, revokedKey);
      await db.prisma.membership.updateMany({
        where: { tenantId: a.tenant.id, userId: revoked.user.id },
        data: { status: 'suspended' },
      });
      expect((await read(revoked, revokedKey)).status).toBe(401);
      // No business source rows are seeded directly: every revision has a real successful A22 receipt.
      const revisions =
        await db.prisma.tenantBusinessConfigurationRevision.findMany({
          where: { tenantId: a.tenant.id },
          include: { execution: true },
        });
      expect(revisions.length).toBe(7);
      for (const row of revisions) {
        expect(row.execution).toMatchObject({
          state: 'SUCCEEDED',
          dryRun: false,
          policyDecision: 'ALLOW',
          actorUserId: a.user.id,
        });
      }
      expect(await db.prisma.appointment.count()).toBe(0);
      expect(await db.prisma.marketingDeliveryAttempt.count()).toBe(0);
      expect(await db.prisma.teamMessage.count()).toBe(0);
      expect(unexpected).toBe(0);
      const checkpoint: Checkpoint = {
        a: client,
        b,
        revoked,
        staleKey,
        expiredKey: expiresKey,
        chatBody: cbody,
        firstReply: payload(firstChat).reply as string,
        privateText: PRIVATE,
      };
      writeFileSync(privateFile, JSON.stringify(checkpoint), {
        mode: 0o600,
        flag: 'wx',
      });
      observations.controls = [
        'actual owner publish and AE receipt',
        'no-owner publish denied',
        'foreign tenant injection denied',
        'foreign source remains absent',
        'private business rules never published',
        'same-key and C9 replay deduplicated',
        'revision change rejects old same-key and C9',
        'real wall-clock expiry invalidates same revision cached read and C9 replay',
        'already-expired publication returns no facts',
        'current React verified and expired replies',
        'revoked reader identity denied',
        'no booking or delivery effects',
      ];
      observations.refusals = {
        staleRead: staleRead.status,
        staleChat: staleChat.status,
      };
      observations.revisionCount = revisions.length;
    } else {
      const c = JSON.parse(readFileSync(privateFile, 'utf8')) as Checkpoint;
      refused(await read(c.a, c.staleKey));
      blockedChat(await chat(c.a, c.chatBody));
      expect((await read(c.revoked)).status).toBe(401);
      const fresh = await read(c.a);
      expect(fresh.status).toBe(201);
      expect(payload(fresh).result).toMatchObject({
        status: 'expired',
        facts: [],
      });
      const freshChat = await chat(c.a);
      expect(freshChat.status).toBe(201);
      expect(payload(freshChat).reply).toContain('пока не подтверждены');
      expect(payload(freshChat).reply).not.toContain(FIRST);
      expect(payload(freshChat).action).toBeNull();
      const foreign = await read(c.b);
      expect(payload(foreign).result).toMatchObject({
        status: 'not_configured',
        facts: [],
      });
      expect(unexpected).toBe(0);
      observations.controls = [
        'fresh AppModule process after real PG restart',
        'old source identity still rejected',
        'old C9 identity still rejected',
        'revoked membership still denied',
        'expired facts absent from fresh read and ordinary chat',
        'foreign tenant remains empty',
      ];
      observations.expiredReplyHash = createHash('sha256')
        .update(payload(freshChat).reply as string)
        .digest('hex');
    }
    observations.status = 'PASS';
    save();
  });
});
