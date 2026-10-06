import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import {
  SERVICE_PRICE_CAPABILITY,
  SERVICE_PRICE_TOOL,
} from '../../src/crm/yclients-service-price.contract';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

const PARTNER = 'synthetic-service-price-partner-only';
const SERVICE_ID = '201';

// These are literal synthetic provider facts, never production catalog data.
function service(companyId: string) {
  return {
    id: Number(SERVICE_ID),
    company_id: Number(companyId),
    title: 'Synthetic haircut',
    booking_title: 'Synthetic booking title',
    price_min: 2000,
    price_max: 2000,
    category_id: 11,
    duration: 1800,
    active: 1,
    is_chain: false,
    is_price_managed_only_in_chain: false,
    is_multi: false,
    tax_variant: 1,
    vat_id: 2,
    is_need_limit_date: false,
    seance_search_start: 0,
    seance_search_finish: 86400,
    step: 900,
    seance_search_step: 900,
    technical_break_duration: 300,
    staff: [{ id: 71, seance_length: 1800 }],
    comment: 'Synthetic non-price field must survive',
    discount: 7,
    weight: 4,
  };
}
type Service = ReturnType<typeof service>;
type ProviderState = {
  token: string;
  row: Service;
  canEdit: boolean;
  loseReply: boolean;
  unavailableAfterWrite: boolean;
  writes: Array<Record<string, unknown>>;
  readsAfterWrite: number;
  holdPatch?: { entered: () => void; released: Promise<void> };
};
type ToolResponse = {
  status: string;
  approval: {
    id: string;
    payload_hash: string;
    payload_preview: Record<string, unknown>;
    status: string;
  };
  canonical_actions?: Array<{ state: string }>;
  error?: { code: string };
  result?: unknown;
};
const body = (response: { body: unknown }) => response.body as ToolResponse;

/**
 * Actual HTTP/auth/approval/Action Engine/PostgreSQL and YclientsCRMAdapter.
 * Only the external provider is replaced by an owned loopback HTTP fixture.
 * Every outbound fetch is fenced to that fixture; no model/provider credentials
 * or developer configuration are used. The existing harness guards the proof DB.
 */
describe('Owner service price [HTTP] [PostgreSQL] [synthetic YCLIENTS HTTP]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let provider: Server, providerUrl: string;
  let previousPartner: string | undefined;
  const salons = new Map<string, ProviderState>();
  const tenants: string[] = [];
  const unexpectedRequests: string[] = [];
  let companySequence = 88000;
  const realFetch = globalThis.fetch;

  async function providerRequest(req: IncomingMessage): Promise<{
    code: number;
    data?: unknown;
    destroy?: boolean;
  }> {
    const path = new URL(req.url ?? '/', providerUrl).pathname;
    const match =
      /^\/api\/v1\/(?:user\/permissions\/(\d+)|company\/(\d+)\/services(?:\/(\d+))?|(?:book_services|service_categories)\/(\d+))$/.exec(
        path,
      );
    if (!match) {
      unexpectedRequests.push(`${req.method} ${path}`);
      return { code: 404 };
    }
    const state = salons.get(match[1] ?? match[2] ?? match[4]);
    if (
      !state ||
      req.headers.authorization !== `Bearer ${PARTNER}, User ${state.token}`
    ) {
      unexpectedRequests.push(`${req.method} ${path}`);
      return { code: 403 };
    }
    if (match[4] && req.method === 'GET')
      return {
        code: 200,
        data: path.includes('/book_services/')
          ? { services: [{ ...state.row }] }
          : [{ id: 11, title: 'Synthetic category' }],
      };
    if (match[1] && req.method === 'GET')
      return {
        code: 200,
        data: {
          settings: {
            settings_services_access: true,
            services_edit: state.canEdit,
            settings_services_edit_price_access: state.canEdit,
          },
        },
      };
    if (match[3] && match[3] !== SERVICE_ID) return { code: 404 };
    if (req.method === 'GET') {
      if (state.writes.length) {
        state.readsAfterWrite += 1;
        if (state.unavailableAfterWrite) return { code: 503 };
      }
      return {
        code: 200,
        data: match[3] ? { ...state.row } : [{ ...state.row }],
      };
    }
    if (req.method === 'PATCH' && match[3] === SERVICE_ID && state.canEdit) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
      const patch = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as Record<string, unknown>;
      state.writes.push(patch);
      state.row = { ...state.row, ...patch };
      if (state.holdPatch) {
        state.holdPatch.entered();
        await state.holdPatch.released;
      }
      if (state.loseReply) return { code: 0, destroy: true };
      return { code: 200, data: { ...state.row } };
    }
    unexpectedRequests.push(`${req.method} ${path}`);
    return { code: 405 };
  }

  beforeAll(async () => {
    previousPartner = process.env.YCLIENTS_PARTNER_TOKEN;
    process.env.YCLIENTS_PARTNER_TOKEN = PARTNER;
    provider = createServer((req, res) => {
      void providerRequest(req).then(
        (reply) => {
          if (reply.destroy) {
            res.destroy();
            return;
          }
          res.writeHead(reply.code, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: reply.code === 200,
              data: reply.data ?? null,
            }),
          );
        },
        () => {
          res.writeHead(500);
          res.end();
        },
      );
    });
    await new Promise<void>((resolve) =>
      provider.listen(0, '127.0.0.1', resolve),
    );
    const address = provider.address();
    if (!address || typeof address === 'string')
      throw new Error('No synthetic provider port');
    providerUrl = `http://127.0.0.1:${address.port}`;
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  beforeEach(() => {
    salons.clear();
    unexpectedRequests.length = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== providerUrl) {
        unexpectedRequests.push('outbound fetch outside synthetic provider');
        return Promise.reject(
          new Error('Service-price proof refuses external fetch'),
        );
      }
      return realFetch(input, init);
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    http.recorder.clear();
    // Keep canonical ActionExecution receipts and actor FKs for evidence.
    for (const id of tenants.splice(0))
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    expect(unexpectedRequests).toEqual([]);
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
    if (provider) {
      provider.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (previousPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = previousPartner;
  });

  async function salon(label: string, role = UserRole.TENANT_OWNER) {
    const tenant = await fx.tenant(label, CalendarSource.EXTERNAL);
    tenants.push(tenant.id);
    const user = await fx.user(tenant, role);
    for (const feature of [
      'ai.owner',
      'ai.consultant',
      'crm.integration',
      'booking',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const companyId = String(++companySequence);
    const state: ProviderState = {
      token: `synthetic-service-price-user-${companyId}`,
      row: service(companyId),
      canEdit: true,
      loseReply: false,
      unavailableAfterWrite: false,
      writes: [],
      readsAfterWrite: 0,
    };
    salons.set(companyId, state);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        baseUrl: `${providerUrl}/api/v1`,
        encryptedApiToken: db.encryption.encrypt(state.token),
        settingsJson: { companyId, currency: 'RUB' },
      },
    });
    const token = await http.login(tenant.slug, user.email, user.password);
    return { tenant, user, token, state, ...forPrincipal(token) };
  }
  function forPrincipal(token: string) {
    const prepare = (
      price = 2500,
      key = randomUUID(),
      extra: Record<string, unknown> = {},
    ) =>
      http.executeTool(
        token,
        SERVICE_PRICE_TOOL,
        {
          surface: 'web',
          idempotencyKey: key,
          arguments: { service_id: SERVICE_ID, price_rubles: price, ...extra },
        },
        randomUUID(),
      );
    const approve = (
      preview: ToolResponse,
      payloadHash = preview.approval.payload_hash,
    ) =>
      request(http.app.getHttpServer())
        .post(`/api/ai/approvals/${preview.approval.id}/approve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ payloadHash });
    return { prepare, approve };
  }
  async function pending(
    f: Awaited<ReturnType<typeof salon>>,
    price = 2500,
    key = randomUUID(),
  ) {
    const response = await f.prepare(price, key);
    expect(response.status).toBe(201);
    expect(body(response).status).toBe('approval_required');
    return body(response);
  }
  async function actions(tenantId: string) {
    return db.prisma.actionExecution.findMany({ where: { tenantId } });
  }

  it('lists the owner capability, shows source-backed diff, and sends one preserved PATCH only after exact approval', async () => {
    const f = await salon('Price exact approval');
    const listed = await request(http.app.getHttpServer())
      .get('/api/ai/tools?surface=web')
      .set('Authorization', `Bearer ${f.token}`);
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { tools: Array<{ name: string }> }).tools.map(
        (tool) => tool.name,
      ),
    ).toContain(SERVICE_PRICE_TOOL);
    const key = randomUUID(),
      preview = await pending(f, 2500, key);
    expect(preview.approval.payload_preview).toMatchObject({
      source: 'YCLIENTS',
      service: 'Synthetic haircut',
      service_id: SERVICE_ID,
      currency: 'RUB',
      current_price_rubles: 2000,
      proposed_price_rubles: 2500,
    });
    expect(f.state.writes).toHaveLength(0);
    expect(await actions(f.tenant.id)).toHaveLength(0);
    expect(body(await f.prepare(2500, key)).approval.id).toBe(
      preview.approval.id,
    );
    expect((await f.approve(preview, '0'.repeat(64))).status).toBe(409);
    expect(f.state.writes).toHaveLength(0);
    const completed = await f.approve(preview);
    expect(completed.status).toBe(201);
    expect(body(completed).status).toBe('completed');
    expect(f.state.writes).toEqual([
      {
        title: 'Synthetic haircut',
        booking_title: 'Synthetic booking title',
        price_min: 2500,
        price_max: 2500,
        category_id: 11,
        duration: 1800,
        is_multi: false,
        tax_variant: 1,
        vat_id: 2,
        is_need_limit_date: false,
        seance_search_start: 0,
        seance_search_finish: 86400,
        step: 900,
        seance_search_step: 900,
        technical_break_duration: 300,
        staff: [{ id: 71, seance_length: 1800 }],
        comment: 'Synthetic non-price field must survive',
        discount: 7,
        weight: 4,
      },
    ]);
    expect(f.state.readsAfterWrite).toBeGreaterThan(0);
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({
        capability: SERVICE_PRICE_CAPABILITY,
        state: 'SUCCEEDED',
      }),
    ]);
    expect(body(await f.approve(preview)).status).toBe('completed');
    expect(body(await f.prepare(2500, key)).status).toBe('completed');
    expect(f.state.writes).toHaveLength(1);
  });

  it('carries an owner price correction through natural chat and excludes the tool from client audience', async () => {
    const f = await salon('Price natural conversation');
    f.state.row.title = 'Стрижка';
    const model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        const latest =
          input.messages.filter((message) => message.role === 'user').at(-1)
            ?.content ?? '';
        return Promise.resolve({
          reply: 'Подготовлю изменение цены.',
          // Core itself reads and binds the current catalog before preparing a card.
          toolCall: {
            name: SERVICE_PRICE_TOOL,
            arguments: {
              service_id: SERVICE_ID,
              price_rubles: latest.includes('2700') ? 2700 : 2500,
            },
          },
          provider: 'openai',
          model: 'scripted-service-price-proof',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    type ChatResponse = {
      reply: string;
      action: ToolResponse | null;
      user_turn?: { conversationId: string };
    };
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: 'Поставь цену услуги «Стрижка» 2500 рублей' },
    ];
    const chat = (audience: 'owner' | 'client', conversationId?: string) =>
      request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${f.token}`)
        .send({
          surface: 'web',
          audience,
          requestId: randomUUID(),
          messages,
          ...(conversationId ? { conversationId } : {}),
        });
    const firstResponse = await chat('owner');
    expect(firstResponse.status).toBe(201);
    const first = firstResponse.body as ChatResponse;
    if (first.action?.status !== 'approval_required')
      throw new Error(
        `Synthetic first chat did not prepare an approval: ${JSON.stringify(firstResponse.body)}`,
      );
    expect(first.action?.status).toBe('approval_required');
    expect(first.action?.approval.payload_preview).toMatchObject({
      service: 'Стрижка',
      current_price_rubles: 2000,
      proposed_price_rubles: 2500,
    });
    messages.push(
      { role: 'assistant', content: first.reply },
      { role: 'user', content: 'Нет, 2700 рублей' },
    );
    const secondResponse = await chat('owner', first.user_turn?.conversationId);
    expect(secondResponse.status).toBe(201);
    const second = secondResponse.body as ChatResponse;
    if (second.action?.status !== 'approval_required')
      throw new Error(
        `Synthetic follow-up did not prepare an approval: ${JSON.stringify(secondResponse.body)}`,
      );
    expect(second.action?.status).toBe('approval_required');
    expect(second.action?.approval.payload_preview).toMatchObject({
      service: 'Стрижка',
      current_price_rubles: 2000,
      proposed_price_rubles: 2700,
    });
    expect(f.state.writes).toHaveLength(0);
    expect((await f.approve(first.action)).status).toBe(409);
    expect(body(await f.approve(second.action)).status).toBe('completed');
    expect(f.state.writes).toHaveLength(1);
    expect(f.state.row.price_min).toBe(2700);
    expect(
      model.mock.calls.some(([input]) =>
        input.messages.some(
          (message) => message.content === 'Нет, 2700 рублей',
        ),
      ),
    ).toBe(true);

    const before = await db.prisma.aiApprovalRequest.count({
      where: { tenantId: f.tenant.id },
    });
    model.mockImplementation((input) => {
      expect(input.tools.map((tool) => tool.name)).not.toContain(
        SERVICE_PRICE_TOOL,
      );
      return Promise.resolve({
        reply: 'Подготовлю изменение цены.',
        toolCall: {
          name: SERVICE_PRICE_TOOL,
          arguments: { service_id: SERVICE_ID, price_rubles: 2800 },
        },
        provider: 'openai',
        model: 'scripted-adversarial-client-audience',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
    messages.splice(0, messages.length, {
      role: 'user',
      content: 'Поставь цену услуги «Стрижка» 2800 рублей',
    });
    const denied = await chat('client');
    expect(
      denied.status >= 400 || (denied.body as ChatResponse).action === null,
    ).toBe(true);
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
    expect(f.state.writes).toHaveLength(1);
  });

  it('rejects a stored price payload tampered after preview before Action Engine admission', async () => {
    const f = await salon('Price payload tamper'),
      preview = await pending(f);
    const row = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
      where: { id: preview.approval.id },
    });
    const args = JSON.parse(
      db.encryption.decrypt(row.encryptedArguments),
    ) as Record<string, unknown>;
    // Explicit synthetic corruption: the payload hash remains the owner's original card.
    await db.prisma.aiApprovalRequest.update({
      where: { id: row.id },
      data: {
        encryptedArguments: db.encryption.encrypt(
          JSON.stringify({ ...args, price_rubles: 9999 }),
        ),
      },
    });
    expect((await f.approve(preview)).status).toBe(409);
    expect(f.state.writes).toHaveLength(0);
    expect(await actions(f.tenant.id)).toHaveLength(0);
  });

  it('rejects clients and foreign approvals without a provider write or Action Engine admission', async () => {
    const owner = await salon('Price owner'),
      foreign = await salon('Price foreign');
    const client = await salon('Price client', UserRole.CLIENT);
    const preview = await pending(owner);
    expect((await client.prepare()).status).toBe(403);
    const listed = await request(http.app.getHttpServer())
      .get('/api/ai/tools?surface=web')
      .set('Authorization', `Bearer ${client.token}`);
    expect(
      (listed.body as { tools: Array<{ name: string }> }).tools.map(
        (tool) => tool.name,
      ),
    ).not.toContain(SERVICE_PRICE_TOOL);
    expect((await foreign.approve(preview)).status).toBe(404);
    expect((await client.approve(preview)).status).toBe(404);
    for (const f of [owner, foreign, client]) {
      expect(f.state.writes).toHaveLength(0);
      expect(await actions(f.tenant.id)).toHaveLength(0);
    }
  });

  it('supersedes a pending proposal when the owner changes the price and refuses the old approval', async () => {
    const f = await salon('Price follow-up');
    const first = await pending(f, 2500),
      changed = await pending(f, 2700);
    expect(changed.approval.id).not.toBe(first.approval.id);
    expect(changed.approval.payload_preview).toMatchObject({
      current_price_rubles: 2000,
      proposed_price_rubles: 2700,
    });
    expect((await f.approve(first)).status).toBe(409);
    expect(f.state.writes).toHaveLength(0);
    expect(
      await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: first.approval.id },
      }),
    ).toMatchObject({ status: 'rejected' });
    expect(body(await f.approve(changed)).status).toBe('completed');
    expect(f.state.writes).toHaveLength(1);
    expect(f.state.row.price_min).toBe(2700);
  });

  it('serializes concurrent approval, persists the receipt across app restart, and never repeats PATCH', async () => {
    const f = await salon('Price concurrent restart');
    const preview = await pending(f);
    const responses = await Promise.all([
      f.approve(preview),
      f.approve(preview),
      f.approve(preview),
    ]);
    expect(
      responses.some(
        (response) =>
          response.status === 201 && body(response).status === 'completed',
      ),
    ).toBe(true);
    expect(f.state.writes).toHaveLength(1);
    expect(await actions(f.tenant.id)).toHaveLength(1);
    await http.close();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    expect(body(await f.approve(preview)).status).toBe('completed');
    expect(f.state.writes).toHaveLength(1);
  });

  it('serializes distinct owner approvals for one service and refuses the second stale proposal', async () => {
    const firstOwner = await salon('Price two owners');
    const user = await fx.user(firstOwner.tenant, UserRole.TENANT_OWNER);
    const token = await http.login(
      firstOwner.tenant.slug,
      user.email,
      user.password,
    );
    const secondOwner = { ...firstOwner, user, token, ...forPrincipal(token) };
    const first = await pending(firstOwner, 2500),
      second = await pending(secondOwner, 2700);
    expect(second.approval.id).not.toBe(first.approval.id);
    expect(second.approval.payload_preview.current_price_rubles).toBe(2000);

    let signalEntered!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    firstOwner.state.holdPatch = {
      entered: signalEntered,
      released: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    const firstRequest = firstOwner.approve(first).then((response) => response);
    let secondRequest: typeof firstRequest | undefined;
    try {
      // Bounded provider barrier: the first approval has reached real dispatch.
      await Promise.race([
        entered,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error('First synthetic PATCH was not reached')),
            5000,
          );
          timer.unref();
        }),
      ]);
      secondRequest = secondOwner.approve(second).then((response) => response);
      let approved = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const stored = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
          where: { id: second.approval.id },
        });
        if (stored.status === 'approved' || stored.status === 'executing') {
          approved = true;
          break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      expect(approved).toBe(true);
      expect(firstOwner.state.writes).toHaveLength(1);
    } finally {
      release();
    }
    const completed = await firstRequest;
    const stale = await secondRequest;
    expect(body(completed).status).toBe('completed');
    if (!stale) throw new Error('Second approved request was not observed');
    expect(body(stale)).toMatchObject({
      status: 'failed',
      error: { code: 'service_price_predispatch_refused' },
    });
    expect(firstOwner.state.writes).toHaveLength(1);
    expect(firstOwner.state.row.price_min).toBe(2500);
    const receipts = await actions(firstOwner.tenant.id);
    expect(receipts).toHaveLength(2);
    expect(
      receipts.filter((receipt) => receipt.state === 'SUCCEEDED'),
    ).toHaveLength(1);
    expect(
      receipts.filter(
        (receipt) =>
          receipt.state === 'FAILED' || receipt.state === 'NOT_EXECUTED',
      ),
    ).toHaveLength(1);
  });

  it('keeps a lost provider reply UNKNOWN after restart and read recovery, without blind retry', async () => {
    const f = await salon('Price unknown restart');
    const preview = await pending(f);
    f.state.loseReply = true;
    f.state.unavailableAfterWrite = true;
    const uncertain = await f.approve(preview);
    expect(uncertain.status).toBe(201);
    expect(body(uncertain)).toMatchObject({
      status: 'unknown',
      error: { code: 'ai_tool_outcome_unknown' },
    });
    expect(body(uncertain).result).toBeUndefined();
    expect(f.state.row.price_min).toBe(2500);
    expect(f.state.writes).toHaveLength(1);
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({ state: 'UNKNOWN' }),
    ]);
    expect(body(await f.approve(preview)).status).toBe('unknown');
    await http.close();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    f.state.unavailableAfterWrite = false;
    expect(body(await f.approve(preview)).status).toBe('unknown');
    expect(f.state.writes).toHaveLength(1);
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({ state: 'UNKNOWN' }),
    ]);
  });

  it('refuses a new proposed price while a previous outcome for the service remains UNKNOWN', async () => {
    const f = await salon('Price new intent after unknown');
    const uncertain = await pending(f, 2500);
    f.state.loseReply = true;
    expect(body(await f.approve(uncertain)).status).toBe('unknown');
    expect(f.state.writes).toHaveLength(1);
    f.state.loseReply = false;
    const revised = await pending(f, 2700);
    expect(revised.approval.payload_preview).toMatchObject({
      current_price_rubles: 2500,
      proposed_price_rubles: 2700,
    });
    const refused = await f.approve(revised);
    expect(body(refused)).toMatchObject({
      status: 'not_executed',
      error: { code: 'service_price_previous_outcome_unresolved' },
    });
    expect(f.state.writes).toHaveLength(1);
    expect(f.state.row.price_min).toBe(2500);
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({ state: 'UNKNOWN' }),
    ]);
  });

  it('does not present a terminal failed proposal as pending on same-key replay', async () => {
    const f = await salon('Price failed replay'),
      key = randomUUID();
    const proposed = await f.prepare(2500, key);
    expect(proposed.status).toBe(201);
    f.state.row.duration = 2700;
    expect(body(await f.approve(body(proposed))).status).toBe('failed');
    const retry = await f.prepare(2500, key);
    expect(retry.status).toBe(409);
    expect(body(retry).error?.code).toBe(
      'service_price_proposal_no_longer_pending',
    );
    expect(f.state.writes).toHaveLength(0);
  });

  it.each(['price', 'non-price', 'permission', 'membership'] as const)(
    'rechecks %s authority at approval and refuses a stale proposal before PATCH',
    async (change) => {
      const f = await salon(`Price stale ${change}`),
        preview = await pending(f);
      if (change === 'price')
        f.state.row.price_min = f.state.row.price_max = 2100;
      if (change === 'non-price') f.state.row.duration = 2700;
      if (change === 'permission') f.state.canEdit = false;
      if (change === 'membership')
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
          },
          data: { status: 'suspended' },
        });
      const denied = await f.approve(preview);
      expect(
        denied.status >= 400 ||
          ['failed', 'not_executed'].includes(body(denied).status),
      ).toBe(true);
      expect(f.state.writes).toHaveLength(0);
      expect(
        (await actions(f.tenant.id)).every(
          (action) =>
            action.state !== 'SUCCEEDED' && action.state !== 'UNKNOWN',
        ),
      ).toBe(true);
    },
  );
});
