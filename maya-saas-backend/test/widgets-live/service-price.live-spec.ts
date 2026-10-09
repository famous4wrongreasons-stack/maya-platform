import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { AiCoreModelInput } from '../../src/ai-tools/ai-core.types';
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
import type { ApprovalBody } from '../../src/widget-contract/kinds';
import type { WidgetIntent } from '../../src/widget-contract/intent';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { openWidgetNounHandle } from '../../src/widgets/emission/seal.service';
import { asHandle } from '../../src/widgets/noun-resolution/noun-handles';

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
type ApprovalEnvelope = {
  widget_id: string;
  kind: 'APPROVAL';
  body: ApprovalBody;
  intents: WidgetIntent[];
  integrity: {
    body_hash: string;
    envelope_seal: string;
    principal_proof_hash: string;
    approval_echo: unknown;
  };
};
type ChatApproval = {
  reply: string;
  action: ToolResponse;
  user_turn?: { conversationId: string };
  resolution?: { receipt?: { envelope?: ApprovalEnvelope } };
};
type WidgetOutcome = {
  outcome: string;
  receipt_outcome: string | null;
  refusal_code?: string | null;
  owner_decision: {
    decision: 'APPROVED' | 'REJECTED';
    status: string;
    outcome?: unknown;
  } | null;
};

const carrierCases: Array<{
  name: 'confirmed' | 'rejected' | 'unknown' | 'detail';
  now_iso: string;
  intent_ref: string;
  envelope: ApprovalEnvelope;
  response: unknown;
  resolve_response?: unknown;
}> = [];

function carrierEvidenceDirectory(): string | null {
  const requested = process.env.WIDGETS_EVIDENCE_DIR;
  const owned = resolve(__dirname, '../../..', 'pricing-evidence/ui-carrier');
  return requested && resolve(requested) === owned ? owned : null;
}

/** Optional export of untouched synthetic HTTP payloads for the existing React carrier harness. */
function exportCarrierCase(value: (typeof carrierCases)[number]): void {
  const owned = carrierEvidenceDirectory();
  if (!owned) return;
  carrierCases.push(value);
  mkdirSync(owned, { recursive: true });
  writeFileSync(
    resolve(owned, 'service-price-carrier.json'),
    JSON.stringify(
      {
        contract: 'maya.service-price-carrier-evidence/1',
        synthetic: true,
        cases: carrierCases,
      },
      null,
      2,
    ) + '\n',
  );
}

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

  /** Scripted semantics pass the actual planner parser and CI before chat binding. */
  function priceDecision(input: AiCoreModelInput, title: string) {
    const latest =
      input.messages.filter((message) => message.role === 'user').at(-1)
        ?.content ?? '';
    const correction = /^Нет,/u.test(latest);
    const price = latest.includes('1600')
      ? 1600
      : latest.includes('1500')
        ? 1500
        : latest.includes('2700')
          ? 2700
          : 2500;
    const validated = http.app
      .get(AiCoreModelService)
      ['validatePlanningResponse'](
        JSON.stringify({
          semantic_plan: {
            parent_request: latest,
            language: 'ru',
            dialogue_act: correction ? 'correction' : 'request',
            tasks: [
              {
                id: 'price',
                intent: 'services.price_update',
                entities_json: JSON.stringify({
                  service: title,
                  requested_price: price,
                }),
                depends_on: [],
                confidence: 1,
                requires_clarification: false,
                clarification_question: null,
              },
            ],
            context: {
              carried_slots: correction ? ['service'] : [],
              replaced_slots: correction ? ['requested_price'] : [],
              unresolved_references: [],
            },
          },
          // Deliberately forged values must be replaced by the existing raw-text/catalog owner.
          tool_call: {
            name: SERVICE_PRICE_TOOL,
            arguments_json: JSON.stringify({
              service_id: '999999',
              price_rubles: 9999,
              company_id: 'untrusted-model-company',
            }),
          },
        }),
        input,
      );
    return {
      ...validated,
      reply: 'Подготовлю изменение цены.',
      provider: 'openai' as const,
      model: 'scripted-validated-service-price-semantic-proof',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  /** The widget proof starts at the actual chat ingress, never a test minter. */
  async function widgetSalon(label: string, title = 'Стрижка') {
    const f = await salon(label);
    await fx.grantFeature(f.tenant, 'widgets.runtime');
    f.state.row.title = title;
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) =>
        Promise.resolve(priceDecision(input, title)),
      );
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let conversationId: string | undefined;
    const send = async (text: string) => {
      messages.push({ role: 'user', content: text });
      const response = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${f.token}`)
        .send({
          surface: 'web',
          audience: 'owner',
          requestId: randomUUID(),
          messages,
          ...(conversationId ? { conversationId } : {}),
        });
      expect(response.status).toBe(201);
      const value = response.body as ChatApproval;
      conversationId = value.user_turn?.conversationId ?? conversationId;
      messages.push({ role: 'assistant', content: value.reply });
      return value;
    };
    const chat = async (text = 'Поставь цену услуги «Стрижка» 2500 рублей') => {
      const value = await send(text);
      const envelope = value.resolution?.receipt?.envelope;
      if (
        value.action?.status !== 'approval_required' ||
        envelope?.kind !== 'APPROVAL'
      )
        throw new Error(
          `Synthetic chat did not mint its approval: ${JSON.stringify(value)}`,
        );
      return { envelope, approval: value.action.approval };
    };
    return { ...f, chat, send };
  }
  function decisionIntent(
    envelope: ApprovalEnvelope,
    decision: 'approve' | 'reject',
  ) {
    const ref =
      decision === 'approve'
        ? envelope.body.approve_intent
        : envelope.body.reject_intent;
    const intent = envelope.intents.find(
      (candidate) => candidate.intent_ref === ref,
    );
    if (!intent?.intent_token)
      throw new Error(`Synthetic APPROVAL has no ${decision} token`);
    expect(intent).toMatchObject({
      effect: 'COMMIT',
      capability: { space: 'AE', key: SERVICE_PRICE_CAPABILITY },
      input_schema: null,
    });
    return intent;
  }
  async function observeApproval(token: string, envelope: ApprovalEnvelope) {
    const response = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    expect(response.status).toBe(200);
    // The current carrier records rendered evidence only for selectors (L25).
    // APPROVAL is resolved without inventing a new lifecycle observation.
    const rows = response.body as {
      widgets: Array<{ envelope: { widget_id: string } }>;
    };
    expect(
      rows.widgets.some((row) => row.envelope.widget_id === envelope.widget_id),
    ).toBe(true);
  }
  async function tapApproval(
    token: string,
    envelope: ApprovalEnvelope,
    decision: 'approve' | 'reject',
    nonce = randomUUID(),
  ) {
    const intent = decisionIntent(envelope, decision);
    return http.postIntent(token, {
      contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: nonce,
      profile_id: 'pwa.default',
    });
  }
  async function resolvedTerminalLines(token: string) {
    const response = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    expect(response.status).toBe(200);
    const value = response.body as {
      widgets: Array<{
        terminal_lines?: Array<{
          outcome: string;
          action_receipt_ref: string | null;
        }>;
      }>;
    };
    return value.widgets.flatMap((widget) => widget.terminal_lines ?? []);
  }

  async function carrierResolve(token: string): Promise<unknown> {
    if (!carrierEvidenceDirectory()) return undefined;
    const response = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    expect(response.status).toBe(200);
    return response.body;
  }

  it('YC-SP1-WIDGET: chat mints an exact standard APPROVAL and gateway approval yields one durable CRM receipt', async () => {
    const f = await widgetSalon('Price widget exact binding');
    const { envelope, approval } = await f.chat();
    const stored = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(envelope.body).toMatchObject({
      subject: { state: 'KNOWN', value: 'Стрижка' },
      risk_tier: { state: 'KNOWN', value: 'high_write' },
      reversible: { state: 'KNOWN', value: false },
      state: { value: 'PENDING' },
      requested_by_label: { value: 'Вы' },
      expires_at: stored.expiresAt.toISOString(),
    });
    expect(envelope.body.approval_ref).toEqual(expect.any(String));
    expect(envelope.body.approval_ref).toBe(approval.id);
    expect(envelope.integrity.approval_echo).toEqual({
      owner: 'ai_approval_request',
      hash: approval.payload_hash,
    });
    const originAudit = await db.prisma.auditLog.findMany({
      where: {
        tenantId: f.tenant.id,
        userId: f.user.id,
        action: 'ai.service_price_chat_approval_bound',
        entityType: 'AiApprovalRequest',
        entityId: approval.id,
      },
    });
    expect(originAudit).toHaveLength(1);
    const origin = originAudit[0].metadataJson as Record<string, unknown>;
    expect(origin).toMatchObject({
      contract: 'maya.service-price-chat-approval/1',
      approvalId: approval.id,
      payloadHash: approval.payload_hash,
      principalProofHash: envelope.integrity.principal_proof_hash,
    });
    const userTurnAudit = await db.prisma.auditLog.findMany({
      where: {
        tenantId: f.tenant.id,
        userId: f.user.id,
        action: 'chat.user_turn_bound',
        entityType: 'WidgetTimelineTurn',
        entityId: origin.userTurnId as string,
      },
    });
    expect(userTurnAudit).toHaveLength(1);
    expect(userTurnAudit[0].metadataJson).toMatchObject({
      contract: 'maya.user-turn-binding/1',
      turnId: origin.userTurnId,
      conversationId: origin.conversationId,
      principalProofHash: envelope.integrity.principal_proof_hash,
      intentTokenHash: null,
    });
    const preview = Object.fromEntries(
      envelope.body.effect_preview.map((item) => [
        item.label.rendered,
        item.value,
      ]),
    );
    expect(preview['Компания YCLIENTS']).toMatchObject({
      state: 'KNOWN',
      value: String(f.state.row.company_id),
    });
    expect(preview['Услуга']).toMatchObject({
      state: 'KNOWN',
      value: SERVICE_ID,
    });
    expect(preview['Текущая цена']).toMatchObject({
      state: 'KNOWN',
      value: 2000,
      unit: 'RUB',
      currency: 'RUB',
    });
    expect(preview['Новая цена']).toMatchObject({
      state: 'KNOWN',
      value: 2500,
      unit: 'RUB',
      currency: 'RUB',
    });
    expect(
      envelope.intents.filter((intent) => intent.effect === 'COMMIT'),
    ).toHaveLength(2);
    const detail = envelope.intents.find(
      (intent) => intent.intent_ref === envelope.body.detail_intent,
    );
    expect(detail?.effect).toBe('NAVIGATE');
    for (const decision of ['approve', 'reject'] as const) {
      const intent = decisionIntent(envelope, decision);
      const tokenHash = createHash('sha256')
        .update(intent.intent_token!)
        .digest('hex');
      const record = await db.prisma.widgetIntentRecord.findUniqueOrThrow({
        where: {
          intentTokenHash_tenantId: {
            intentTokenHash: tokenHash,
            tenantId: f.tenant.id,
          },
        },
      });
      expect(record).toMatchObject({
        widgetKind: 'APPROVAL',
        capabilitySpace: 'AE',
        capabilityKey: SERVICE_PRICE_CAPABILITY,
        effect: 'COMMIT',
        approvalDecision: decision,
        confirmationOfKind: 'approval',
        confirmationOfRef: approval.id,
        producedByIntentTokenHash: null,
        singleUse: true,
      });
      const nouns = record.frozenNounsJson as Record<string, unknown>;
      expect(typeof nouns.approval).toBe('string');
      const identity = openWidgetNounHandle(asHandle(nouns.approval as string));
      expect(identity).toMatchObject({
        tenantId: f.tenant.id,
        noun: 'approval',
      });
      expect(identity?.ownerRef).toContain(approval.id);
      expect(identity?.ownerRef).toContain(stored.payloadHash);
    }
    expect(
      await db.prisma.widgetIntentRecord.count({
        where: {
          tenantId: f.tenant.id,
          effect: 'REQUEST_APPROVAL',
        },
      }),
    ).toBe(0);
    expect(f.state.writes).toHaveLength(0);
    expect(await actions(f.tenant.id)).toHaveLength(0);
    await observeApproval(f.token, envelope);
    const detailNow = new Date().toISOString();
    const detailResult = await http.postIntent(f.token, {
      contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
      widget_id: envelope.widget_id,
      intent_token: detail!.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    });
    expect(detailResult.status).toBe(200);
    if (
      (detailResult.body as { receipt_outcome: string }).receipt_outcome !==
      'ACCEPTED'
    )
      throw new Error(
        `Synthetic detail refused: ${JSON.stringify(detailResult.body)}`,
      );
    expect(detailResult.body).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      next_envelope: {
        kind: 'APPROVAL',
        body: { approval_ref: approval.id },
        correlation: { parent_widget_id: envelope.widget_id },
        presentation: {
          density: 'SHEET',
          fullscreen_detail: { route_key: 'fs.catalogue' },
        },
      },
    });
    expect(
      (detailResult.body as { next_envelope: ApprovalEnvelope }).next_envelope
        .widget_id,
    ).not.toBe(envelope.widget_id);
    exportCarrierCase({
      name: 'detail',
      now_iso: detailNow,
      intent_ref: detail!.intent_ref,
      envelope,
      response: detailResult.body,
      resolve_response: await carrierResolve(f.token),
    });
    expect(f.state.writes).toHaveLength(0);
    const approveNow = new Date().toISOString();
    const accepted = await tapApproval(f.token, envelope, 'approve');
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: {
        decision: 'APPROVED',
        status: 'completed',
      },
    });
    const receipts = await actions(f.tenant.id);
    expect(receipts).toEqual([
      expect.objectContaining({
        capability: SERVICE_PRICE_CAPABILITY,
        state: 'SUCCEEDED',
      }),
    ]);
    expect(f.state.writes).toHaveLength(1);
    expect(f.state.readsAfterWrite).toBeGreaterThan(0);
    expect(f.state.row.price_min).toBe(2500);
    const audit = await db.prisma.widgetIntentReceipt.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        widgetId: envelope.widget_id,
        outcome: 'ACCEPTED',
        intentTokenHash: createHash('sha256')
          .update(decisionIntent(envelope, 'approve').intent_token!)
          .digest('hex'),
      },
    });
    expect(audit.actionReceiptRef).toBe(receipts[0].id);
    exportCarrierCase({
      name: 'confirmed',
      now_iso: approveNow,
      intent_ref: envelope.body.approve_intent!,
      envelope,
      response: accepted.body,
      resolve_response: await carrierResolve(f.token),
    });
    await http.close();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const replay = await tapApproval(f.token, envelope, 'approve');
    expect(replay.status).toBe(200);
    expect(f.state.writes).toHaveLength(1);
    expect(await actions(f.tenant.id)).toHaveLength(1);
  });

  it('YC-SP1-WIDGET: reject closes the exact pending proposal and its approve sibling without a CRM action', async () => {
    const f = await widgetSalon('Price widget reject');
    const { envelope, approval } = await f.chat();
    await observeApproval(f.token, envelope);
    const rejectNow = new Date().toISOString();
    const rejected = await tapApproval(f.token, envelope, 'reject');
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: {
        decision: 'REJECTED',
        status: 'rejected',
      },
    });
    expect(
      await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: approval.id },
      }),
    ).toMatchObject({ status: 'rejected' });
    expect(
      (await tapApproval(f.token, envelope, 'approve')).body,
    ).not.toMatchObject({ receipt_outcome: 'ACCEPTED' });
    expect(await actions(f.tenant.id)).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
    exportCarrierCase({
      name: 'rejected',
      now_iso: rejectNow,
      intent_ref: envelope.body.reject_intent!,
      envelope,
      response: rejected.body,
      resolve_response: await carrierResolve(f.token),
    });
  });

  it('YC-SP1-WIDGET: a natural price correction supersedes the old card before any effect', async () => {
    const f = await widgetSalon('Price widget correction');
    const first = await f.chat();
    await observeApproval(f.token, first.envelope);
    const changed = await f.chat('Нет, 2700 рублей');
    expect(changed.envelope.widget_id).not.toBe(first.envelope.widget_id);
    expect(
      (await tapApproval(f.token, first.envelope, 'approve')).body,
    ).not.toMatchObject({ receipt_outcome: 'ACCEPTED' });
    expect(f.state.writes).toHaveLength(0);
    expect(
      await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: first.approval.id },
      }),
    ).toMatchObject({ status: 'rejected' });
    await observeApproval(f.token, changed.envelope);
    expect(
      (await tapApproval(f.token, changed.envelope, 'approve')).body,
    ).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { status: 'completed' },
    });
    expect(f.state.writes).toHaveLength(1);
    expect(f.state.row.price_min).toBe(2700);
  });

  it('YC-SP1-SEMANTIC: original inflected title clarifies; literal preparation and correction reach one exact approval and AE receipt', async () => {
    const f = await widgetSalon(
      'Price semantic exact-title clarification',
      'Мужская стрижка',
    );
    for (const text of [
      'Подготовь изменение цены мужской стрижки на 1500 рублей.',
      'Нет, на 1600 рублей.',
    ]) {
      const response = await f.send(text);
      expect(response.action?.status).not.toBe('approval_required');
      expect(response.resolution?.receipt?.envelope?.kind).not.toBe('APPROVAL');
      expect(response.reply).toContain('название');
    }
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
    expect(await actions(f.tenant.id)).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
    // Supplemental user clarification, not a rewrite of the frozen two-turn corpus.
    const first = await f.chat(
      'Подготовь изменение цены услуги «Мужская стрижка» на 1500 рублей.',
    );
    expect(first.approval.payload_preview).toMatchObject({
      service: 'Мужская стрижка',
      current_price_rubles: 2000,
      proposed_price_rubles: 1500,
    });
    const corrected = await f.chat('Нет, на 1600 рублей.');
    expect(corrected.approval.payload_preview).toMatchObject({
      service: 'Мужская стрижка',
      current_price_rubles: 2000,
      proposed_price_rubles: 1600,
    });
    expect(corrected.approval.id).not.toBe(first.approval.id);
    expect(
      (await tapApproval(f.token, first.envelope, 'approve')).body,
    ).not.toMatchObject({ receipt_outcome: 'ACCEPTED' });
    expect(await actions(f.tenant.id)).toHaveLength(0);
    expect(f.state.writes).toHaveLength(0);
    await observeApproval(f.token, corrected.envelope);
    expect(
      (await tapApproval(f.token, corrected.envelope, 'approve')).body,
    ).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { status: 'completed' },
    });
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({
        capability: SERVICE_PRICE_CAPABILITY,
        state: 'SUCCEEDED',
      }),
    ]);
    expect(f.state.writes).toHaveLength(1);
    expect(f.state.row).toMatchObject({
      title: 'Мужская стрижка',
      price_min: 1600,
      price_max: 1600,
    });
    expect(f.state.readsAfterWrite).toBeGreaterThan(0);
    await tapApproval(f.token, corrected.envelope, 'approve');
    expect(f.state.writes).toHaveLength(1);
  });

  it.each([
    'provider_revision',
    'membership',
    'foreign',
    'payload_hash',
    'expiry',
  ] as const)(
    'YC-SP1-WIDGET: rechecks %s at the gateway and cannot confirm stale or foreign authority',
    async (change) => {
      const f = await widgetSalon(`Price widget refused ${change}`);
      const { envelope, approval } = await f.chat();
      await observeApproval(f.token, envelope);
      let token = f.token;
      if (change === 'provider_revision')
        f.state.row.price_min = f.state.row.price_max = 2100;
      if (change === 'membership')
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
          },
          data: { status: 'suspended' },
        });
      if (change === 'foreign') {
        const other = await salon('Price widget foreign tenant');
        await fx.grantFeature(other.tenant, 'widgets.runtime');
        token = other.token;
      }
      // Explicit synthetic corruption/expiry after a genuine production mint.
      if (change === 'payload_hash')
        await db.prisma.aiApprovalRequest.update({
          where: { id: approval.id },
          data: { payloadHash: 'f'.repeat(64) },
        });
      if (change === 'expiry')
        await db.prisma.aiApprovalRequest.update({
          where: { id: approval.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      const refused = await tapApproval(token, envelope, 'approve');
      const outcome = refused.body as WidgetOutcome;
      expect(
        refused.status >= 400 ||
          outcome.receipt_outcome !== 'ACCEPTED' ||
          ['failed', 'not_executed'].includes(
            outcome.owner_decision?.status ?? '',
          ),
      ).toBe(true);
      expect(f.state.writes).toHaveLength(0);
      expect(
        [...salons.values()].every((state) => state.writes.length === 0),
      ).toBe(true);
      expect(
        (await actions(f.tenant.id)).every(
          (action) =>
            action.state !== 'SUCCEEDED' && action.state !== 'UNKNOWN',
        ),
      ).toBe(true);
    },
  );

  it('YC-SP1-WIDGET: UNKNOWN is not a success receipt and a repeated tap after restart never resends PATCH', async () => {
    const f = await widgetSalon('Price widget unknown restart');
    const { envelope } = await f.chat();
    await observeApproval(f.token, envelope);
    f.state.loseReply = true;
    f.state.unavailableAfterWrite = true;
    const unknownNow = new Date().toISOString();
    const uncertain = await tapApproval(f.token, envelope, 'approve');
    expect(uncertain.status).toBe(200);
    expect(uncertain.body).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: {
        decision: 'APPROVED',
        status: 'unknown',
      },
    });
    expect(
      (uncertain.body as WidgetOutcome).owner_decision?.outcome,
    ).toBeUndefined();
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({ state: 'UNKNOWN' }),
    ]);
    expect(
      (await resolvedTerminalLines(f.token)).some(
        (line) => line.outcome === 'CONFIRMED',
      ),
    ).toBe(false);
    expect(f.state.writes).toHaveLength(1);
    exportCarrierCase({
      name: 'unknown',
      now_iso: unknownNow,
      intent_ref: envelope.body.approve_intent!,
      envelope,
      response: uncertain.body,
      resolve_response: await carrierResolve(f.token),
    });
    await http.close();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    f.state.unavailableAfterWrite = false;
    const repeated = await tapApproval(f.token, envelope, 'approve');
    expect(repeated.status).toBe(200);
    expect((repeated.body as WidgetOutcome).owner_decision?.status).not.toBe(
      'completed',
    );
    expect(f.state.writes).toHaveLength(1);
    expect(await actions(f.tenant.id)).toEqual([
      expect.objectContaining({ state: 'UNKNOWN' }),
    ]);
    expect(
      (await resolvedTerminalLines(f.token)).some(
        (line) => line.outcome === 'CONFIRMED',
      ),
    ).toBe(false);
  });

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
      .mockImplementation((input) =>
        Promise.resolve(priceDecision(input, 'Стрижка')),
      );
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
