/** YC-ST1: actual HTTP/auth/chat/widget/AE/PG, only YCLIENTS is owned loopback synthetic HTTP.
 * No model call, no real secrets, no customer data, no existing DB or release certification. */
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import request from 'supertest';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmService } from '../../src/crm/crm.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  STAFF_CREATE_CAPABILITY,
  STAFF_CREATE_TOOL,
} from '../../src/crm/yclients-staff-create.contract';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';

const PARTNER = 'staff-create-synthetic-partner-only';
const PROPOSAL = { name: 'Синтетический Мастер', specialization: 'Парикмахер' };
const COMMAND = `Создай сотрудника «${PROPOSAL.name}» со специализацией «${PROPOSAL.specialization}»`;
type State = {
  company: string;
  token: string;
  canCreate: boolean;
  lose: boolean;
  writes: Record<string, unknown>[];
};
type Envelope = {
  widget_id: string;
  kind: string;
  body: { approval_ref: string };
  intents: Array<{
    intent_ref: string;
    intent_token: string;
    confirmation?: { idempotency_key: string };
  }>;
};

describe('YC-ST1 canonical chat quick-create [HTTP/PG/native synthetic provider]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    server: Server,
    origin: string;
  let previousPartner: string | undefined;
  const states = new Map<string, State>(),
    unexpected: string[] = [];
  const realFetch = globalThis.fetch;
  async function provider(req: IncomingMessage) {
    const path = new URL(req.url ?? '/', origin).pathname;
    const permission = /^\/api\/v1\/user\/permissions\/(\d+)$/.exec(path);
    const quick = /^\/api\/v1\/company\/(\d+)\/staff\/quick$/.exec(path);
    const state = states.get(permission?.[1] ?? quick?.[1] ?? '');
    if (
      !state ||
      req.headers.authorization !== `Bearer ${PARTNER}, User ${state.token}`
    ) {
      unexpected.push(`${req.method} ${path}`);
      return { status: 403, data: null };
    }
    if (permission && req.method === 'GET')
      return {
        status: 200,
        data: {
          settings: {
            settings_master_access: true,
            master_create: state.canCreate,
          },
        },
      };
    if (quick && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<
        string,
        unknown
      >;
      // Deliberately NO provider idempotency or unique-name guard: every POST adds a row.
      state.writes.push(body);
      return {
        status: 201,
        lose: state.lose,
        data: {
          id: 7000 + state.writes.length,
          company_id: Number(state.company),
          name: body.name,
          specialization: body.specialization,
          position: null,
          user_id: null,
        },
      };
    }
    unexpected.push(`${req.method} ${path}`);
    return { status: 405, data: null };
  }
  beforeAll(async () => {
    previousPartner = process.env.YCLIENTS_PARTNER_TOKEN;
    process.env.YCLIENTS_PARTNER_TOKEN = PARTNER;
    server = createServer((req, res) => {
      void provider(req).then(
        (reply) => {
          if (reply.lose) {
            res.destroy();
            return;
          }
          res.writeHead(reply.status, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ success: reply.status < 300, data: reply.data }),
          );
        },
        () => {
          res.writeHead(500);
          res.end();
        },
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No owned provider listener');
    origin = `http://127.0.0.1:${address.port}`;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== origin) {
        unexpected.push('foreign outbound refused');
        throw new Error('Synthetic provider only');
      }
      return realFetch(input, init);
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        throw new Error('Staff quick-create must not use model');
      });
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
    jest.restoreAllMocks();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (previousPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = previousPartner;
  });
  afterEach(() => {
    expect(unexpected).toEqual([]);
  });
  async function salon(label: string, role: UserRole = UserRole.TENANT_OWNER) {
    const tenant = await fx.tenant(
      'staff-create ' + label,
      CalendarSource.EXTERNAL,
    );
    const user = await fx.user(tenant, role);
    for (const feature of [
      'ai.owner',
      'crm.integration',
      'widgets.runtime',
    ] as const)
      await fx.grantFeature(tenant, feature);
    const branch = await db.prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Synthetic branch', timezone: 'UTC' },
    });
    const company = String(88101 + states.size),
      state: State = {
        company,
        token: `synthetic-staff-token-${company}`,
        canCreate: true,
        lose: false,
        writes: [],
      };
    states.set(company, state);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        baseUrl: origin + '/api/v1',
        encryptedApiToken: db.encryption.encrypt(state.token),
        settingsJson: {
          companyId: company,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: Number(company),
            branchId: branch.id,
          },
        },
      },
    });
    const token = await http.login(tenant.slug, user.email, user.password);
    return { tenant, user, state, token, branch };
  }
  async function chat(f: Awaited<ReturnType<typeof salon>>) {
    const writesBefore = f.state.writes.length;
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${f.token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: COMMAND }],
      });
    expect(response.status).toBe(201);
    const value = response.body as {
      reply: string;
      resolution?: { receipt?: { envelope?: Envelope } };
    };
    const envelope = value.resolution?.receipt?.envelope;
    if (!envelope)
      throw new Error(
        `Canonical staff approval absent: ${JSON.stringify(value)}`,
      );
    expect(envelope.kind).toBe('APPROVAL');
    expect(f.state.writes).toHaveLength(writesBefore);
    await http.resolveWidgets(f.token, { thread_page: { limit: 20 } });
    return envelope;
  }
  async function tap(token: string, envelope: Envelope, ref = 'i1') {
    const intent = envelope.intents.find((i) => i.intent_ref === ref);
    if (!intent) throw new Error('Canonical intent missing');
    return http.postIntent(token, {
      contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    });
  }
  it('registered chat → exact preview → canonical approval → REQUIRED AE → one native provider receipt; replay refuses', async () => {
    const f = await salon('success'),
      envelope = await chat(f);
    const pending = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
      where: { id: envelope.body.approval_ref },
    });
    expect(pending.toolName).toBe(STAFF_CREATE_TOOL);
    expect(pending.status).toBe('pending');
    expect(pending.payloadPreviewJson).toMatchObject(PROPOSAL);
    expect(
      (
        envelope.intents[0] as unknown as {
          confirmation: { idempotency_key: string };
        }
      ).confirmation.idempotency_key,
    ).toBe(`staff-create:${pending.id}:${pending.payloadHash}:approve`);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id, capability: STAFF_CREATE_CAPABILITY },
      }),
    ).toBe(0);
    const response = await tap(f.token, envelope);
    expect(response.body).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      owner_decision: { state: 'SUCCEEDED' },
    });
    expect(f.state.writes).toEqual([
      { ...PROPOSAL, position_id: null, phone_number: null },
    ]);
    const action = await db.prisma.actionExecution.findFirstOrThrow({
      where: { tenantId: f.tenant.id, capability: STAFF_CREATE_CAPABILITY },
    });
    expect(action).toMatchObject({
      state: 'SUCCEEDED',
      approvalRequirement: 'REQUIRED',
      approvalDecision: 'APPROVED',
      sourceRef: pending.id,
      sourceType: 'authenticated_request',
    });
    await tap(f.token, envelope);
    expect(f.state.writes).toHaveLength(1);
  });
  it('standalone tool and legacy approval endpoint cannot supply the named chat origin', async () => {
    const f = await salon('no-legacy');
    const direct = await http.executeTool(
      f.token,
      STAFF_CREATE_TOOL,
      { surface: 'web', arguments: PROPOSAL, idempotencyKey: randomUUID() },
      randomUUID(),
    );
    expect(direct.status).toBe(403);
    const env = await chat(f),
      pending = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: env.body.approval_ref },
      });
    const legacy = await request(http.app.getHttpServer())
      .post(`/api/ai/approvals/${pending.id}/approve`)
      .set('Authorization', `Bearer ${f.token}`)
      .send({ payloadHash: pending.payloadHash });
    expect(legacy.status).toBe(403);
    expect(f.state.writes).toHaveLength(0);
  });
  it('cross-tenant token and rejected proposal cause no provider write', async () => {
    const a = await salon('a'),
      b = await salon('b'),
      env = await chat(a);
    const foreign = await tap(b.token, env);
    expect(foreign.body).not.toMatchObject({
      owner_decision: { state: 'SUCCEEDED' },
    });
    const rejected = await tap(a.token, env, 'i2');
    expect(rejected.body).toMatchObject({
      owner_decision: { state: 'REJECTED' },
    });
    await tap(a.token, env);
    expect(a.state.writes).toHaveLength(0);
    expect(b.state.writes).toHaveLength(0);
  });
  it('permission revoke after preview refuses; exact source remains mandatory', async () => {
    const f = await salon('permission'),
      env = await chat(f);
    f.state.canCreate = false;
    const response = await tap(f.token, env);
    expect(response.body).not.toMatchObject({
      owner_decision: { state: 'SUCCEEDED' },
    });
    expect(f.state.writes).toHaveLength(0);
  });
  it('native lost response is UNKNOWN; normal plus six concurrent retries never duplicate or announce success', async () => {
    const f = await salon('unknown'),
      env = await chat(f);
    f.state.lose = true;
    const response = await tap(f.token, env);
    expect(response.body).toMatchObject({
      owner_decision: { state: 'UNKNOWN' },
    });
    expect(f.state.writes).toHaveLength(1);
    const execution = await db.prisma.actionExecution.findFirstOrThrow({
      where: { tenantId: f.tenant.id, capability: STAFF_CREATE_CAPABILITY },
    });
    expect(execution.state).toBe('UNKNOWN');
    const attempt = await db.prisma.actionAttempt.findFirstOrThrow({
      where: { actionExecutionId: execution.id },
    });
    expect(attempt.errorClass).toBe('CrmOutcomeUnknownError');
    // Exercise the actual CRM/AE reconciliation entrypoint, not a manually
    // assigned UNKNOWN result. Provider gives no attributable readback API.
    const approval = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
      where: { id: env.body.approval_ref },
    });
    const args = JSON.parse(
      db.encryption.decrypt(approval.encryptedArguments),
    ) as Record<string, unknown>;
    await http.app
      .get(TenantContextService)
      .runAsAuthPrincipal(
        {
          tenantId: f.tenant.id,
          userId: f.user.id,
          role: UserRole.TENANT_OWNER,
        },
        async () => {
          await expect(
            http.app
              .get(CrmService)
              .applyStaffCreate(
                f.tenant.id,
                f.user.id,
                args,
                approval.idempotencyKey,
              ),
          ).rejects.toThrow();
        },
      );
    const reconciliation = await db.prisma.actionAttempt.findFirst({
      where: { actionExecutionId: execution.id, kind: 'RECONCILIATION' },
    });
    expect(reconciliation).toMatchObject({ outcomeCode: 'STILL_UNKNOWN' });

    await tap(f.token, env);
    const retries = await Promise.all(
      Array.from({ length: 6 }, () => tap(f.token, env)),
    );
    expect(
      retries.every(
        (r) =>
          (r.body as { owner_decision?: { state: string } }).owner_decision
            ?.state !== 'SUCCEEDED',
      ),
    ).toBe(true);
    const newProposal = await chat(f);
    const newDecision = await tap(f.token, newProposal);
    expect(newDecision.body).not.toMatchObject({
      owner_decision: { state: 'SUCCEEDED' },
    });
    expect(f.state.writes).toHaveLength(1);
    expect(
      (
        await db.prisma.actionExecution.findUniqueOrThrow({
          where: { id: execution.id },
        })
      ).state,
    ).toBe('UNKNOWN');
  });
  it.each([
    'expired',
    'membership',
    'source',
    'erased',
    'entitlement',
    'origin',
    'payload',
    'branch',
  ])(
    'current %s invalidation after preview cannot create staff',
    async (mode) => {
      const f = await salon(mode),
        env = await chat(f);
      const approval = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: env.body.approval_ref },
      });
      if (mode === 'expired')
        await db.prisma.aiApprovalRequest.update({
          where: { id: approval.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      if (mode === 'membership')
        await db.prisma.membership.update({
          where: {
            userId_tenantId: { tenantId: f.tenant.id, userId: f.user.id },
          },
          data: { status: 'suspended' },
        });
      if (mode === 'source')
        await db.prisma.crmIntegration.update({
          where: { tenantId: f.tenant.id },
          data: { status: 'inactive' },
        });
      if (mode === 'entitlement')
        await db.prisma.tenantEntitlement.update({
          where: {
            tenantId_featureKey: {
              tenantId: f.tenant.id,
              featureKey: 'widgets.runtime',
            },
          },
          data: { enabled: false },
        });
      if (mode === 'origin')
        await db.prisma.auditLog.deleteMany({
          where: {
            tenantId: f.tenant.id,
            action: 'ai.staff_create_chat_approval_bound',
            entityId: approval.id,
          },
        });
      if (mode === 'payload')
        await db.prisma.aiApprovalRequest.update({
          where: { id: approval.id },
          data: { payloadHash: 'f'.repeat(64) },
        });
      if (mode === 'branch')
        await db.prisma.crmIntegration.update({
          where: { tenantId: f.tenant.id },
          data: { settingsJson: { companyId: f.state.company } },
        });
      if (mode === 'erased') {
        const event = await db.prisma.auditLog.findFirstOrThrow({
          where: {
            tenantId: f.tenant.id,
            action: 'ai.staff_create_chat_approval_bound',
            entityId: approval.id,
          },
        });
        const turn = (event.metadataJson as { userTurnId: string }).userTurnId;
        await db.prisma.widgetTimelineTurn.update({
          where: { id: turn },
          data: { erasedAt: new Date() },
        });
      }
      const response = await tap(f.token, env);
      expect(response.body).not.toMatchObject({
        owner_decision: { state: 'SUCCEEDED' },
      });
      expect(f.state.writes).toHaveLength(0);
    },
  );
  it('six simultaneous canonical decisions create one employee and one action', async () => {
    const f = await salon('race'),
      env = await chat(f);
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => tap(f.token, env)),
    );
    expect(
      responses.filter(
        (r) =>
          (r.body as { owner_decision?: { state: string } }).owner_decision
            ?.state === 'SUCCEEDED',
      ),
    ).toHaveLength(1);
    expect(f.state.writes).toHaveLength(1);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id, capability: STAFF_CREATE_CAPABILITY },
      }),
    ).toBe(1);
  });
  it('non-owner command cannot create an approval or invoke the model', async () => {
    const f = await salon('non-owner', UserRole.ADMINISTRATOR);
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${f.token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: COMMAND }],
      });
    expect(response.status).toBe(201);
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: f.tenant.id, toolName: STAFF_CREATE_TOOL },
      }),
    ).toBe(0);
    expect(f.state.writes).toHaveLength(0);
  });
  it('read-only detail is separately sealed and bound to the same proposal', async () => {
    const f = await salon('detail'),
      env = await chat(f);
    const response = await tap(f.token, env, 'i3');
    expect(response.body).toMatchObject({
      receipt_outcome: 'ACCEPTED',
      next_envelope: {
        kind: 'APPROVAL',
        body: { approval_ref: env.body.approval_ref },
      },
    });
    expect(f.state.writes).toHaveLength(0);
  });
});
