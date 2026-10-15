import { releaseBookingProof } from './support/release-booking-proof';
import { personalSource } from '../../scripts/widgets-http-proof/gateBS.cases';
import { journalSource } from '../../scripts/widgets-http-proof/gateNS.cases';
import type { TenantFixture } from './support/fixtures';
import type { HttpProofContext } from './support/http-proof-contract';
import { ConfigService } from '@nestjs/config';
import { singleOperatorProof } from './support/widget-single-operator-proof';
import { firstPhoneCertificate } from './support/widget-first-phone-proof';
import { releaseHash } from '../../src/entitlements/widget-release.contract';
import {
  NO_PRICE_GOODS_PROFILE,
  NO_PRICE_GOODS_DIGEST,
} from '../../src/entitlements/widget-release-profile.contract';
import { assertPriceGoodsScope } from '../../src/entitlements/widget-release-source-scope';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmService } from '../../src/crm/crm.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../src/tenancy/tenant-resolver.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
// Bootstrap module ordering matches the production AppModule before resolving this owner.
import { ActionEngineKernel } from '../../src/action-engine/action-engine.kernel';

const PARTNER = 'synthetic-approval-boundary-partner';
const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const proposal = () => ({
  goods_id: '123',
  store_id: '9',
  quantity: '2.5',
  unit_id: '11',
  unit_cost: '10.25',
  currency: 'RUB',
  price_kind: 'receipt_purchase_unit',
  received_at: '2026-10-15T09:00:00Z',
  photo_sha256: 'a'.repeat(64),
  source_line: 1,
  review_version: 1,
});
type ProviderFacts = {
  userToken: string;
  selectedStores: unknown;
  selectedTypes: unknown;
  requests: string[];
  holdServiceRead?: { entered: () => void; released: Promise<void> };
};

/** Diagnostic of the actual closed source boundary, NOT an L/L-T/U claim.
 * No model/parser/CRM service/adapter override. Only an explicit loopback HTTP
 * source is artificial. An inaccessible positive path is not counted as PASS
 * for the eight release duties, and no synthetic approval origin is inserted. */
describe('Approval source boundary [HTTP/PG] [actual adapter, artificial wire facts]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let server: Server, origin: string, oldPartner: string | undefined;
  const states = new Map<string, ProviderFacts>();
  const unexpected: string[] = [];
  const tenants: string[] = [];
  let companySequence = 97000;

  beforeAll(async () => {
    oldPartner = process.env.YCLIENTS_PARTNER_TOKEN;
    process.env.YCLIENTS_PARTNER_TOKEN = PARTNER;
    server = createServer((req, res) => {
      const route = new URL(req.url ?? '/', origin).pathname;
      const match =
        /^\/api\/v1\/(?:user\/permissions\/(\d+)|storages\/(\d+)|goods\/(\d+)\/123|company\/(\d+)\/services(?:\/201)?|book_services\/(\d+)|service_categories\/(\d+))$/.exec(
          route,
        );
      const company = match?.slice(1).find(Boolean);
      const state = company ? states.get(company) : undefined;
      const method = req.method ?? 'GET';
      const authorized =
        state &&
        req.headers.authorization ===
          `Bearer ${PARTNER}, User ${state.userToken}`;
      if (!authorized || method !== 'GET') {
        unexpected.push(`${method} ${route}`);
        res.writeHead(405).end();
        return;
      }
      state.requests.push(route);
      const service = {
        id: 201,
        company_id: Number(company),
        title: 'Стрижка',
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
        staff: [],
      };
      const data: unknown = route.includes('/user/permissions/')
        ? {
            settings: {
              settings_services_access: true,
              services_edit: true,
              settings_services_edit_price_access: true,
            },
            storages: {
              storages_access: true,
              storages_transactions_access: true,
              storages_create_transactions_access: true,
              storages_create_transactions_buy_access: true,
              storages_last_days_count: -1,
              storages_create_last_days_count: -1,
              storages_ids: state.selectedStores,
              storages_transactions_types: state.selectedTypes,
            },
          }
        : route.includes('/storages/')
          ? [{ id: 9, title: 'Synthetic store' }]
          : route.includes('/goods/')
            ? [
                {
                  good_id: 123,
                  title: 'Synthetic shampoo',
                  cost: 100,
                  actual_cost: 40,
                  unit_actual_cost: 4,
                  unit_id: 11,
                  service_unit_id: 22,
                  unit_short_title: 'bottle',
                  service_unit_short_title: 'ml',
                  unit_equals: 10,
                  loyalty_abonement_type_id: 0,
                  loyalty_certificate_type_id: 0,
                  actual_amounts: [{ storage_id: 9, amount: 1.25 }],
                },
              ]
            : route.includes('/book_services/')
              ? { services: [service] }
              : route.includes('/service_categories/')
                ? [{ id: 11, title: 'Synthetic category' }]
                : route.endsWith('/201')
                  ? service
                  : [service];
      const respond = () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
      };
      const barrier = route.endsWith('/services/201')
        ? state.holdServiceRead
        : undefined;
      if (barrier) {
        delete state.holdServiceRead;
        barrier.entered();
        void barrier.released.then(respond);
      } else respond();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Owned loopback listener required');
    origin = `http://127.0.0.1:${address.port}`;
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterAll(async () => {
    // Preserve synthetic rows and FKs for inspection in the disposable DB.
    for (const id of tenants)
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    await http?.close();
    await db?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
    if (oldPartner === undefined) delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = oldPartner;
    expect(unexpected).toEqual([]);
  });

  async function setup(
    label: string,
    stores: unknown = [],
    types: unknown = [],
  ) {
    http.app.get(ConfigService).set('NODE_ENV', 'test');
    http.app.get(ConfigService).set('WIDGET_RELEASE_ENVIRONMENT', 'synthetic');
    const tenant = await fx.tenant(label, CalendarSource.EXTERNAL);
    tenants.push(tenant.id);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.owner',
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
      'crm.integration',
      'commerce.store',
      'booking',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const company = String(++companySequence);
    const state: ProviderFacts = {
      userToken: `synthetic-source-user-${company}`,
      selectedStores: stores,
      selectedTypes: types,
      requests: [] as string[],
    };
    states.set(company, state);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        baseUrl: `${origin}/api/v1`,
        encryptedApiToken: db.encryption.encrypt(state.userToken),
        settingsJson: { companyId: company, currency: 'RUB' },
      },
    });
    const bearer = await http.login(tenant.slug, user.email, user.password);
    // Read-only existing source owner; the HTTP ingress independently rereads it.
    // No fixture-created approval, turn, widget, source permission or model decision.
    const actor = await fx.actor(tenant, user);
    const revision = await http.app
      .get(TenantContextService)
      .run(randomUUID(), async () => {
        http.app.get(TenantResolverService).bindAuthenticatedUser(actor);
        return http.app.get(CrmService).goodsReadIdentity(tenant.id, user.id);
      });
    return { tenant, user, bearer, company, state, revision };
  }
  type Salon = Awaited<ReturnType<typeof setup>>;
  const post = (f: Salon, route: string, body: unknown) =>
    request(http.app.getHttpServer())
      .post(`/api${route}`)
      .set('Authorization', `Bearer ${f.bearer}`)
      .send(body as object);
  const review = (f: Salon, extra: Record<string, unknown> = {}) =>
    post(f, '/ai/goods/receipt-review', {
      requestId: randomUUID(),
      source_revision: f.revision,
      proposal: proposal(),
      ...extra,
    });
  async function noEffect(f: Salon, approvals = 0) {
    const where = { tenantId: f.tenant.id };
    expect(await db.prisma.aiApprovalRequest.count({ where })).toBe(approvals);
    expect(await db.prisma.actionExecution.count({ where })).toBe(0);
    expect(
      await db.prisma.widgetEmission.count({
        where: { ...where, kind: 'APPROVAL' },
      }),
    ).toBe(0);
    expect(
      await db.prisma.auditLog.count({
        where: {
          ...where,
          action: {
            in: [
              'ai.service_price_chat_approval_bound',
              'ai.goods_receipt_chat_approval_bound',
            ],
          },
        },
      }),
    ).toBe(0);
    expect(unexpected).toEqual([]);
  }

  it.each([
    ['documented empty arrays', [], []],
    ['numeric IDs', [9], [3]],
    ['string IDs', ['9'], ['3']],
    ['objects containing IDs', [{ id: 9 }], [{ id: 3 }]],
    ['boolean descriptions', true, true],
    ['wildcards', ['*'], ['*']],
  ])(
    'GR-SOURCE refuses %s without inferring provider scope',
    async (_name, stores, types) => {
      const f = await setup('goods scope', stores, types);
      const result = await review(f);
      expect(JSON.stringify(result.body)).toContain(
        'yclients_receipt_storages_ids_semantics_undocumented',
      );
      expect(result.status).toBe(409);
      expect(f.state.requests).toEqual([
        `/api/v1/user/permissions/${f.company}`,
        `/api/v1/storages/${f.company}`,
        `/api/v1/goods/${f.company}/123`,
      ]);
      await noEffect(f);
    },
  );

  it('GR-SOURCE concurrent reviewed proposals remain refused before approval or dispatch', async () => {
    const f = await setup('goods concurrent');
    const results = await Promise.all([review(f), review(f)]);
    for (const result of results) {
      expect(JSON.stringify(result.body)).toContain(
        'yclients_receipt_storages_ids_semantics_undocumented',
      );
      expect(result.status).toBe(409);
    }
    await noEffect(f);
  });

  it('GR-SOURCE stale and foreign source revisions refuse before provider reads', async () => {
    const f = await setup('goods source A'),
      foreign = await setup('goods source B');
    for (const revision of ['f'.repeat(64), foreign.revision]) {
      const result = await review(f, { source_revision: revision });
      expect(result.status).toBe(409);
      expect(JSON.stringify(result.body)).toContain('goods_source_changed');
    }
    expect(f.state.requests).toEqual([]);
    await noEffect(f);
  });

  it('GR-SOURCE caller permission and authority fields cannot open the real source', async () => {
    const f = await setup('goods caller scope');
    for (const extra of [
      { can_receive: true },
      { authority: 'OWNER' },
      { proposal: { ...proposal(), can_receive: true } },
    ]) {
      const result = await review(f, extra);
      expect(result.status).toBe(400);
    }
    expect(f.state.requests).toEqual([]);
    await noEffect(f);
  });

  it('PRICE-SOURCE keyless chat cannot manufacture a price approval or confirmed effect', async () => {
    const f = await setup('price without model');
    const result = await post(f, '/ai/chat', {
      surface: 'web',
      audience: 'owner',
      requestId: randomUUID(),
      messages: [
        { role: 'user', content: 'Поставь цену услуги «Стрижка» 2500 рублей' },
      ],
    });
    expect(result.status).toBe(201);
    const body = obj(result.body);
    expect(body.source).toBe('safe_fallback');
    expect(body.action).toBeNull();
    await noEffect(f);
  });

  it('PRICE-SOURCE valid direct preview is not a canonical chat widget, including replay', async () => {
    const f = await setup('price direct preview');
    const body = {
      surface: 'web',
      idempotencyKey: randomUUID(),
      arguments: { service_id: '201', price_rubles: 2500 },
    };
    const first = await post(
      f,
      '/ai/tools/catalog.service.price.update/execute',
      body,
    );
    expect(obj(first.body).status).toBe('approval_required');
    expect(first.status).toBe(201);
    expect(obj(first.body).resolution).toBeUndefined();
    const repeated = await post(
      f,
      '/ai/tools/catalog.service.price.update/execute',
      body,
    );
    expect(repeated.status).toBe(201);
    expect(obj(obj(repeated.body).approval).id).toBe(
      obj(obj(first.body).approval).id,
    );
    expect(obj(repeated.body).resolution).toBeUndefined();
    await noEffect(f, 1);
  });

  it('PRICE-SOURCE caller-authored T-2a and user-turn fields are not internal authority', async () => {
    const f = await setup('price spoofed origin');
    const result = await post(
      f,
      '/ai/tools/catalog.service.price.update/execute',
      {
        surface: 'web',
        arguments: { service_id: '201', price_rubles: 2500 },
        widgetTrigger: 'T-2a',
        userTurn: { turnId: randomUUID(), conversationId: randomUUID() },
      },
    );
    expect(result.status).toBe(400);
    expect(f.state.requests).toEqual([]);
    await noEffect(f);
  });
  // Real AR-1 HTTP writer and global session; artificial signer and database only.
  async function restricted(f: { tenant: TenantFixture }, grant = true) {
    const operator = await fx.user(f.tenant, UserRole.PLATFORM_OWNER);
    await db.prisma.user.update({
      where: { id: operator.id },
      data: { tenantId: null },
    });
    const login = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: operator.email, password: operator.password });
    expect(login.status).toBe(201);
    const p = singleOperatorProof(
      process.env.DATABASE_URL!,
      f.tenant.id,
      operator.id,
    );
    const cfg = http.app.get(ConfigService);
    for (const key of [
      'NODE_ENV',
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_CANDIDATE_SHA',
      'WIDGET_RELEASE_TRUST_JSON',
      'WIDGET_RELEASE_PRODUCTION_TRUST_JSON',
      'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON',
    ])
      cfg.set(key, p.config.get(key));
    const route = `/api/platform/widget-release/${f.tenant.id}`;
    const send = (
      action: string,
      body: unknown,
      token = String(obj(login.body).access_token),
    ) =>
      request(http.app.getHttpServer())
        .post(route + '/' + action)
        .set('Authorization', 'Bearer ' + token)
        .send(body as object);
    const status = async () =>
      obj(
        (
          await request(http.app.getHttpServer())
            .get(route + '/status')
            .set(
              'Authorization',
              'Bearer ' + String(obj(login.body).access_token),
            )
        ).body,
      );
    const command = p.command(String((await status()).version));
    command.certificate = firstPhoneCertificate(command.certificate);
    command.authorization = p.signOwner({
      ...command.authorization.payload,
      profileId: NO_PRICE_GOODS_PROFILE,
      profileDigest: NO_PRICE_GOODS_DIGEST,
      certificateDigest: releaseHash(command.certificate),
    });
    if (grant) expect((await send('grant', command)).status).toBe(201);
    const revoke = async () =>
      send('revoke', {
        authorization: p.signOwner({
          ...command.authorization.payload,
          authorizationId: randomUUID(),
          operation: 'revoke',
          expectedVersion: String((await status()).version),
          grantExpiresAt: null,
        }),
      });
    return { p, command, send, status, revoke };
  }
  const price = (f: Salon, key = randomUUID()) =>
    post(f, '/ai/tools/catalog.service.price.update/execute', {
      surface: 'web',
      idempotencyKey: key,
      arguments: { service_id: '201', price_rubles: 2500 },
    });
  const refusedScope = (r: { status: number; body: unknown }) => {
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('widget_release_source_scope');
  };

  it('FP-HTTP restricted price and goods preparation refuse before any provider read, without changing catalog reads', async () => {
    const f = await setup('first phone prepare');
    await restricted(f);
    refusedScope(await price(f));
    refusedScope(await review(f));
    expect(f.state.requests).toEqual([]);
    await noEffect(f);
    const catalog = await post(f, '/ai/tools/catalog.services.read/execute', {
      surface: 'web',
      arguments: {},
    });
    expect(catalog.status).toBe(201);
    expect(f.state.requests.length).toBeGreaterThan(0);
  });
  it('FP-OLD-APPROVAL existing pending price cannot approve/retry after restricted grant; safe rejection remains', async () => {
    const f = await setup('first phone old approval');
    const key = randomUUID();
    const prepared = await price(f, key);
    expect(prepared.status).toBe(201);
    const approval = obj(obj(prepared.body).approval);
    expect(typeof approval.id).toBe('string');
    await restricted(f);
    const reads = f.state.requests.length;
    refusedScope(await price(f, key));
    const decide = () =>
      post(f, `/ai/approvals/${String(approval.id)}/approve`, {
        payloadHash: approval.payload_hash,
      });
    for (const r of await Promise.all([decide(), decide()])) refusedScope(r);
    expect(f.state.requests).toHaveLength(reads);
    expect(
      await db.prisma.aiApprovalRequest.findUnique({
        where: { id: String(approval.id) },
      }),
    ).toMatchObject({ status: 'pending' });
    const rejected = await post(
      f,
      `/ai/approvals/${String(approval.id)}/reject`,
      { payloadHash: approval.payload_hash },
    );
    expect(rejected.status).toBe(201);
    await noEffect(f, 1);
  });
  it('FP-REVOKE allowlist removal/candidate replacement still permits revoke, but cannot reopen forbidden source', async () => {
    const f = await setup('first phone revoke');
    const r = await restricted(f);
    const cfg = http.app.get(ConfigService);
    cfg.set('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON', '[]');
    cfg.set('WIDGET_RELEASE_CANDIDATE_SHA', 'b'.repeat(40));
    expect((await r.status()).enabled).toBe(false);
    refusedScope(await price(f));
    expect((await r.revoke()).status).toBe(201);
    refusedScope(await price(f));
    refusedScope(await review(f));
    expect(f.state.requests).toEqual([]);
    await noEffect(f);
  });
  it('FP-AUTH tenant owner cannot grant; malformed or stale CAS cannot replace restricted state', async () => {
    const f = await setup('first phone auth');
    const r = await restricted(f, false);
    expect((await r.send('grant', r.command, f.bearer)).status).toBe(403);
    expect(
      (
        await r.send('grant', {
          ...r.command,
          authorization: r.command.authorization.payload,
        })
      ).status,
    ).toBe(403);
    const good = await r.send('grant', r.command);
    expect(good.status).toBe(201);
    const stale = {
      ...r.command,
      authorization: r.p.signOwner({
        ...r.command.authorization.payload,
        authorizationId: randomUUID(),
      }),
    };
    expect((await r.send('grant', stale)).status).toBe(409);
    const repeat = await r.send('grant', r.command);
    expect(repeat.status).toBe(201);
    expect(obj(repeat.body).replayed).toBe(true);
    expect(
      await db.prisma.auditLog.count({
        where: { action: 'widget.release', entityId: f.tenant.id },
      }),
    ).toBe(1);
    refusedScope(await price(f));
    await noEffect(f);
  });
  it('FP-CONCURRENT release writer waits for admitted owner and subsequent scope reads refuse', async () => {
    const f = await setup('first phone concurrency');
    const r = await restricted(f, false);
    let entered!: () => void, release!: () => void;
    const admission = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const owner = db.prisma.$transaction(
      async (tx) => {
        await assertPriceGoodsScope(
          tx,
          f.tenant.id,
          'crm.service.fixed-price.update.v1',
        );
        entered();
        await held;
      },
      { timeout: 10000 },
    );
    await admission;
    let completed = false;
    const grant = r.send('grant', r.command).then((result) => {
      completed = true;
      return result;
    });
    try {
      // Observe the lock wait on this exact tenant, rather than assuming a timing race.
      let waiting = false;
      for (let i = 0; i < 50 && !waiting; i++) {
        const rows = await db.prisma.$queryRaw<
          Array<{ n: number }>
        >`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
        waiting = rows.some((x) => x.n > 0);
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      expect(completed).toBe(false);
    } finally {
      release();
    }
    await owner;
    expect((await grant).status).toBe(201);
    await expect(
      db.prisma.$transaction((tx) =>
        assertPriceGoodsScope(
          tx,
          f.tenant.id,
          'crm.service.fixed-price.update.v1',
        ),
      ),
    ).rejects.toThrow('widget_release_source_scope');
    await noEffect(f);
  });
  it('FP-DISPATCH a new scope during the provider pre-read commits and blocks the pending effect without deadlock', async () => {
    const f = await setup('first phone dispatch race');
    const prepared = await price(f);
    expect(prepared.status).toBe(201);
    const approval = obj(obj(prepared.body).approval);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    f.state.holdServiceRead = {
      entered: enter,
      released: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    const approved = post(f, `/ai/approvals/${String(approval.id)}/approve`, {
      payloadHash: approval.payload_hash,
    }).then((r) => r);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        entered,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('synthetic provider pre-read not reached')),
            5000,
          );
        }),
      ]);
      clearTimeout(timer);
      // This must finish while the pre-read is held, before provider dispatch.
      await restricted(f);
    } finally {
      clearTimeout(timer);
      release();
    }
    const result = await approved;
    expect(obj(result.body).status).not.toBe('completed');
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id, state: 'SUCCEEDED' },
      }),
    ).toBe(0);
    expect(unexpected).toEqual([]);
  });
  async function proofContext(): Promise<HttpProofContext> {
    const base = await http.listenLoopback();
    return {
      apiBase: base,
      fixtures: fx.binView(),
      mintProvenance: () => http.mintProvenance(),
      request: async (route, init) => {
        const r = await fetch(`${base}/api${route}`, init);
        return { status: r.status, body: (await r.json()) as unknown };
      },
      // Execute existing assertions without emitting source-qualification claims.
      evidence: { enabled: false, record: () => false },
    };
  }
  const authorizeJourney = async (tenant: TenantFixture) => {
    tenants.push(tenant.id);
    await restricted({ tenant });
  };
  it('FP-BOOKING all four production HTTP widgets and COMMIT remain mandatory under new signed scope', async () => {
    const proofs = await releaseBookingProof(
      await proofContext(),
      undefined,
      authorizeJourney,
    );
    expect(proofs).toHaveLength(7);
  });
  it.each([
    ['NS', journalSource],
    ['BS', personalSource],
  ] as const)(
    'FP-SOURCE %s still traverses its actual canonical source under new signed scope',
    async (_name, proof) => {
      await proof(await proofContext(), authorizeJourney);
    },
  );
  it('FP-FINAL-DISPATCH scope replacement after AE dispatch admission still prevents the provider write', async () => {
    const f = await setup('first phone last dispatch race');
    const prepared = await price(f);
    expect(prepared.status).toBe(201);
    const approval = obj(obj(prepared.body).approval);
    const kernel = http.app.get(ActionEngineKernel);
    const original = kernel.markDispatchMayHaveCrossed.bind(kernel);
    // Scheduling barrier only: the real kernel commits its original result.
    // Replace the release through real AR-1 before allowing the owner to dispatch.
    const barrier = jest
      .spyOn(kernel, 'markDispatchMayHaveCrossed')
      .mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        await restricted(f);
        return result;
      });
    try {
      const result = await post(
        f,
        `/ai/approvals/${String(approval.id)}/approve`,
        { payloadHash: approval.payload_hash },
      );
      expect(barrier).toHaveBeenCalledTimes(1);
      expect(obj(result.body).status).toBe('failed');
      expect(obj(obj(result.body).error).code).toBe(
        'service_price_predispatch_refused',
      );
      expect(unexpected).toEqual([]);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: f.tenant.id, state: 'SUCCEEDED' },
        }),
      ).toBe(0);
    } finally {
      barrier.mockRestore();
    }
  });
});
