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
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, data }));
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
    const state = {
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
});
