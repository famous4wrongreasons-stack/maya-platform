import { hasReasonRow } from '../../src/widgets/rendering/reason-text';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { YclientsGoodsReceiptUnknownError } from '../../src/crm/yclients-goods-receipt';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { GoodsPhotoParser } from '../../src/ai-tools/goods-photo.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import type { CRMAdapter } from '../../src/crm/crm-adapter.interface';
import { observedGoodsItem } from '../../src/crm/yclients-goods-read';
import {
  GOODS_RECEIPT_CAPABILITY,
  type GoodsReceiptResult,
} from '../../src/crm/goods-receipt.contract';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';

const stage = process.env.JEST_GOODS_UI_STAGE;
const receiptPath = process.env.JEST_GOODS_UI_RECEIPT!;
const output = process.env.JEST_GOODS_UI_OUTPUT!;
if (
  !['prepare', 'resume', 'restore'].includes(stage ?? '') ||
  !path.isAbsolute(receiptPath ?? '') ||
  !path.isAbsolute(output ?? '')
)
  throw new Error('Explicit owned goods proof stage required');
type Approval = {
  id: string;
  payload_hash: string;
  payload_preview: Record<string, unknown>;
  status: string;
};
type Result = {
  status: string;
  approval: Approval;
  canonical_actions?: Array<{ executionId: string; state: string }>;
  result?: Record<string, unknown>;
};
type Source = {
  sale: string;
  cost: string;
  stock: string;
  canReceive: boolean;
  loseReply: boolean;
  loseReadback?: boolean;
  writeCount: number;
  readCount: number;
  contextReads: number;
  duringContextRead?: () => Promise<void>;
  writes: Record<string, unknown>[];
};
const source = (): Source => ({
  sale: '100',
  cost: '40',
  stock: '1.250',
  canReceive: true,
  loseReply: false,
  writeCount: 0,
  readCount: 0,
  contextReads: 0,
  writes: [],
});
const parsed = (r: { body: unknown }) => r.body as Result;
const check = (
  r: { status: number; body: unknown },
  status: number,
  label: string,
) => {
  if (r.status !== status)
    throw new Error(JSON.stringify({ label, status: r.status, body: r.body }));
};
function proposal(hash: string) {
  return {
    goods_id: '123',
    store_id: '9',
    quantity: '2.5',
    unit_id: '11',
    unit_cost: '10.25',
    currency: 'RUB',
    price_kind: 'receipt_purchase_unit',
    received_at: '2026-10-07T09:00:00Z',
    photo_sha256: hash,
    source_line: 1,
    review_version: 1,
  };
}

/** Actual HTTP/auth/C9/approval/R10/AE/PG. Model/provider edges are synthetic; OCR is forbidden. */
describe('Goods UI and restart [synthetic model/provider, no OCR]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const states = new Map<string, Source>();
  let nextProposal = proposal(
    createHash('sha256').update('initial').digest('hex'),
  );
  let modelCalls = 0,
    parserCalls = 0,
    externalCalls = 0;
  const observations: Record<string, unknown> = {
    stage,
    modelSelection: 'SCRIPTED_SYNTHETIC',
    parser: 'FORBIDDEN_UNUSED_NOT_OCR_ACCEPTANCE',
    provider: 'SYNTHETIC_ADAPTER',
    certificate: 'NOT_ISSUED',
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    http.app.get(ConfigService).set('EMAIL_LOGIN_ENABLED', 'true');
    http.app.get(ConfigService).set('EMAIL_AUTH_PROVIDER', 'debug');
    jest
      .spyOn(http.app.get(GoodsPhotoParser), 'parse')
      .mockImplementation(() => {
        parserCalls++;
        throw new Error('Photo parsing is outside the UI receipt proof');
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      externalCalls++;
      throw new Error('External fetch forbidden');
    });
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((_provider, config) => {
        const company = String(
            (config.settings as { companyId: unknown }).companyId,
          ),
          s = states.get(company);
        if (!s) throw new Error('Unknown synthetic company');
        const goods = () =>
          observedGoodsItem(
            [
              {
                good_id: '123',
                title: 'Синтетический шампунь',
                cost: s.sale,
                actual_cost: s.cost,
                unit_actual_cost: '4',
                unit_id: '11',
                service_unit_id: '22',
                unit_short_title: 'флакон',
                service_unit_short_title: 'мл',
                unit_equals: '10',
                loyalty_abonement_type_id: 0,
                loyalty_certificate_type_id: 0,
                actual_amounts: [{ storage_id: '9', amount: s.stock }],
              },
            ],
            '123',
            company,
            'RUB',
          );
        return {
          readGoodsItem: (_tenant: string, id: string) => {
            expect(id).toBe('123');
            s.readCount++;
            return Promise.resolve(goods());
          },
          readGoodsReceiptContext: async (
            _tenant: string,
            id: string,
            store: string,
          ) => {
            expect(id).toBe('123');
            expect(store).toBe('9');
            s.contextReads++;
            await s.duringContextRead?.();
            return Promise.resolve({
              goods: goods(),
              store: {
                id: '9',
                name: 'Синтетический склад',
                company_id: company,
              },
              can_receive: s.canReceive,
            });
          },
          createGoodsReceipt: (
            _tenant: string,
            args: Record<string, unknown>,
            deadline: number,
          ) => {
            expect(deadline).toBeGreaterThan(Date.now());
            s.writeCount++;
            s.writes.push({ ...args });
            if (s.loseReadback)
              throw new YclientsGoodsReceiptUnknownError(
                '900',
                new Error('Synthetic lost readback'),
              );
            if (s.loseReply)
              throw new Error('Synthetic lost reply after receipt commit');
            const observed = Object.fromEntries(
              [
                'company_id',
                'goods_id',
                'store_id',
                'quantity',
                'unit_id',
                'unit_cost',
                'line_total',
                'currency',
                'received_at',
              ].map((k) => [k, args[k]]),
            ) as GoodsReceiptResult['observed'];
            return Promise.resolve({
              receipt_id: `synthetic-receipt-${s.writeCount}`,
              observed,
            });
          },
        } as unknown as CRMAdapter;
      });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        if (modelCalls > 40) throw new Error('Unbounded scripted selection');
        expect(input.toolResults).toHaveLength(0);
        return Promise.resolve({
          reply: '',
          toolCall: {
            name: 'inventory.goods.receipt.prepare',
            arguments: { ...nextProposal },
          },
          provider: 'openai',
          model: 'SCRIPTED_GOODS_PROPOSAL_NOT_MODEL_ACCEPTANCE',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });
  afterAll(async () => {
    observations.modelCalls = modelCalls;
    observations.parserCalls = parserCalls;
    observations.externalCalls = externalCalls;
    observations.sourceStates = [...states].map(([company, s]) => ({
      company,
      readCount: s.readCount,
      contextReads: s.contextReads,
      writeCount: s.writeCount,
    }));
    writeFileSync(
      path.join(output, `${stage}-observations.json`),
      JSON.stringify(observations, null, 2) + '\n',
    );
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
    expect(parserCalls).toBe(0);
    expect(externalCalls).toBe(0);
  });
  async function setup(
    label: string,
    company: string,
    role = UserRole.TENANT_OWNER,
    grant = true,
  ) {
    const tenant = await fx.tenant(label, CalendarSource.EXTERNAL),
      user = await fx.user(tenant, role);
    states.set(company, source());
    for (const feature of [
      'ai.owner',
      'ai.admin',
      'ai.consultant',
      'widgets.runtime',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    if (grant) await fx.grantFeature(tenant, 'commerce.store');
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        encryptedApiToken: db.encryption.encrypt('SYNTHETIC_GOODS_ONLY'),
        settingsJson: { companyId: company, currency: 'RUB' },
      },
    });
    return {
      tenant,
      user,
      token: await http.login(tenant.slug, user.email, user.password),
      company,
    };
  }
  const post = (token: string, route: string, body: unknown) =>
    request(http.app.getHttpServer())
      .post(route)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);
  const approve = (token: string, a: Approval, hash = a.payload_hash) =>
    post(token, `/api/ai/approvals/${a.id}/approve`, { payloadHash: hash });
  const freshHash = () =>
    createHash('sha256').update(randomUUID()).digest('hex');
  async function actionCount(tenantId: string) {
    return db.prisma.actionExecution.count({
      where: { tenantId, capability: GOODS_RECEIPT_CAPABILITY },
    });
  }

  type Envelope = {
    widget_id: string;
    kind: string;
    body: {
      approve_intent: string;
      reject_intent: string;
      detail_intent: string;
      effect_preview: Array<{
        label: { phrase_key: string };
        value: { value: unknown };
      }>;
    };
    intents: Array<{
      intent_ref: string;
      intent_token: string;
      capability?: { key: string };
    }>;
    lifecycle: { expires_at: string };
    integrity: { body_hash: string };
  };
  type Chat = {
    reply: string;
    action: { status: string; approval: Approval };
    user_turn: { conversationId: string };
    resolution: { receipt: { envelope: Envelope } };
  };
  const chat = async (
    token: string,
    p: Record<string, unknown>,
    conversationId?: string,
  ) => {
    nextProposal = p as ReturnType<typeof proposal>;
    const dto = {
      surface: 'web',
      audience: 'owner',
      requestId: randomUUID(),
      messages: [
        {
          role: 'user',
          content:
            'Подготовь приход товара 123: 2,5 флакона по закупочной цене 10,25 RUB.',
        },
      ],
      ...(conversationId ? { conversationId } : {}),
    };
    const response = await post(token, '/api/ai/chat', dto);
    check(response, 201, 'chat');
    const body = response.body as Chat;
    expect(body.action?.status).toBe('approval_required');
    if (!body.resolution?.receipt?.envelope)
      throw new Error('No goods approval widget: ' + JSON.stringify(body));
    expect(body.resolution.receipt.envelope.kind).toBe('APPROVAL');
    return {
      body,
      dto,
      envelope: body.resolution.receipt.envelope,
      approval: body.action.approval,
    };
  };
  const submit = (
    token: string,
    e: Envelope,
    ref = e.body.approve_intent,
    nonce = randomUUID(),
  ) => {
    const intent = e.intents.find((i) => i.intent_ref === ref)!;
    return http.postIntent(token, {
      contract: 'maya.widget.intent.submission/1',
      widget_id: e.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: nonce,
      profile_id: 'pwa.default',
    });
  };
  const state = (value: unknown) =>
    (value as { owner_decision?: { state?: string } }).owner_decision?.state;
  const refusals: Record<string, unknown> = {};
  const refusal = async (
    label: string,
    response: { status: number; body: unknown },
    tenantId: string,
    writes: number,
    sourceState: Source,
    auth = false,
  ) => {
    const body = response.body as {
      contract?: string;
      outcome?: string;
      code?: string | null;
      receipt_outcome?: string | null;
      owner_decision?: unknown;
      reason_text?: { phrase_key?: string };
      statusCode?: number;
      message?: string;
    };
    if (auth) {
      check(response, 401, label);
      expect(body.statusCode).toBe(401);
      expect(body.message).toBe('Active tenant membership is required');
    } else {
      check(response, 200, label);
      expect(body.contract).toBe('maya.widget.intent/1');
      const expected: Record<string, readonly [string, string | null]> = {
        superseded: ['superseded', 'handle_stale'],
        stale: ['superseded', 'handle_stale'],
        expired: ['superseded', 'handle_stale'],
        'foreign-actor': ['refuse', 'widget_principal_mismatch'],
        'foreign-tenant': ['expired', null],
        'scoped-owner': ['refuse', 'widget_principal_mismatch'],
        'permission-revoked': ['superseded', 'handle_stale'],
        'feature-revoked': ['refuse', 'insufficient_authority'],
      };
      expect(expected[label]).toBeDefined();
      expect([body.outcome, body.code]).toEqual(expected[label]);
      expect(body.receipt_outcome).toBeNull();
      const key =
        body.code ??
        (body.outcome === 'expired'
          ? 'EXPIRED'
          : body.outcome === 'superseded'
            ? 'SUPERSEDED'
            : '');
      expect(hasReasonRow(key)).toBe(true);
      expect(typeof body.reason_text?.phrase_key).toBe('string');
      expect(body.owner_decision).toBeNull();
    }
    expect(sourceState.writeCount).toBe(writes);
    expect(await actionCount(tenantId)).toBe(writes);
    refusals[label] = {
      status: response.status,
      outcome: body.outcome ?? null,
      code: body.code ?? null,
      receiptOutcome: body.receipt_outcome ?? null,
      writes,
      aeCount: writes,
    };
    observations.refusals = refusals;
  };
  const executionRows = (tenantId: string) =>
    db.prisma.actionExecution.findMany({
      where: { tenantId, capability: GOODS_RECEIPT_CAPABILITY },
      select: {
        id: true,
        sourceRef: true,
        state: true,
        executionAttemptCount: true,
      },
      orderBy: { id: 'asc' },
    });
  async function restoreTerminalHistory(pg: string) {
    const saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
      tenant: TenantFixture;
      user: UserFixture;
      company: string;
      resumePid: number;
      resumePg: string;
      resumeExecutions: Awaited<ReturnType<typeof executionRows>>;
      terminalTexts: string[];
    };
    expect(process.pid).not.toBe(saved.resumePid);
    expect(pg).not.toBe(saved.resumePg);
    states.set(saved.company, { ...source(), cost: '999', stock: '800' });
    const token = await http.login(
      saved.tenant.slug,
      saved.user.email,
      saved.user.password,
    );
    const before = await executionRows(saved.tenant.id);
    expect(before).toEqual(saved.resumeExecutions);
    const history = await request(http.app.getHttpServer())
      .get('/api/ai/conversation')
      .set('Authorization', `Bearer ${token}`);
    check(history, 200, 'terminal-history-new-process');
    const text = (history.body as { turns: Array<{ text: string }> }).turns
      .map((t) => t.text)
      .join('\n');
    for (const expected of saved.terminalTexts)
      expect(text).toContain(expected);
    expect(JSON.stringify(history.body)).not.toMatch(
      /intent_token|approval_ref|photo_sha256|data:image|encryptedArguments/,
    );
    const checkpoints: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/goods-receipt-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let stderr = '';
      let failure: Error | undefined, killTimer: NodeJS.Timeout | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      let pending = Promise.resolve();
      const timer = setTimeout(() => {
        fail(new Error('Terminal restore browser timed out'));
      }, 150_000);
      child.stderr!.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const m = raw as { type: string; name: string };
            if (m.type === 'ready')
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output: path.join(output, 'terminal-restore'),
                ownerEmail: saved.user.email,
                mode: 'terminal-restore',
                loginNotBefore: Date.now() + 61_000,
                expectedTerminalTexts: saved.terminalTexts,
              });
            if (m.type === 'checkpoint') {
              expect(m.name).toBe('terminal-process-pg-restart');
              checkpoints.push(m.name);
              child.send({ type: 'continue:' + m.name });
            }
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        void pending.then(
          () =>
            failure
              ? reject(failure)
              : code !== 0
                ? reject(new Error(stderr))
                : resolve(),
          reject,
        );
      });
    });
    expect(checkpoints).toEqual(['terminal-process-pg-restart']);
    expect(await executionRows(saved.tenant.id)).toEqual(before);
    expect(states.get(saved.company)?.writeCount).toBe(0);
    expect(states.get(saved.company)?.contextReads).toBe(0);
    expect(states.get(saved.company)?.readCount).toBe(0);
    expect(modelCalls).toBe(0);
    observations.terminalRestart = {
      process: true,
      postgres: true,
      states: ['SUCCEEDED', 'REJECTED', 'UNKNOWN'],
      sameExactFacts: true,
      canonicalExecutionsUnchanged: true,
      modelCalls: 0,
      providerReads: 0,
      providerWrites: 0,
      activeCommitCount: 0,
    };
  }
  it('proves exact goods UI, authority and persisted no-redispatch locally', async () => {
    const pg = (
      await db.prisma.$queryRaw<
        Array<{ started: string }>
      >`SELECT pg_postmaster_start_time()::text AS started`
    )[0].started;
    if (stage === 'prepare') {
      const f = await setup('goods-ui-owner', '77101'),
        s = states.get(f.company)!;
      const p = proposal(freshHash()),
        first = await chat(f.token, p);
      expect(s.writeCount).toBe(0);
      expect(await actionCount(f.tenant.id)).toBe(0);
      const rows = Object.fromEntries(
        first.envelope.body.effect_preview.map((v) => [
          v.label.phrase_key,
          v.value.value,
        ]),
      );
      expect(rows['approval.goods_receipt.line_total']).toBe('25.625');
      expect(rows['approval.goods_receipt.quantity']).toBe('2.5');
      const replay = await post(f.token, '/api/ai/chat', first.dto);
      check(replay, 201, 'replay');
      expect((replay.body as Chat).resolution.receipt.envelope.widget_id).toBe(
        first.envelope.widget_id,
      );
      const corrected = await chat(
        f.token,
        { ...p, quantity: '3.25', review_version: 2 },
        first.body.user_turn.conversationId,
      );
      const old = await submit(f.token, first.envelope);
      await refusal('superseded', old, f.tenant.id, 0, s);
      const detail = await submit(
        f.token,
        corrected.envelope,
        corrected.envelope.body.detail_intent,
      );
      check(detail, 200, 'detail');
      expect(
        (detail.body as { next_envelope: Envelope }).next_envelope.widget_id,
      ).not.toBe(corrected.envelope.widget_id);
      const result = await submit(f.token, corrected.envelope);
      check(result, 200, 'approve');
      expect(state(result.body)).toBe('SUCCEEDED');
      expect(s.writeCount).toBe(1);
      const outcome = (
        result.body as { owner_decision: { outcome: Record<string, unknown> } }
      ).owner_decision.outcome;
      expect(outcome.line_total).toBe('33.3125');
      expect(outcome.action_execution_id).not.toBe(corrected.approval.id);
      expect(
        await db.prisma.actionExecution.findFirst({
          where: {
            id: String(outcome.action_execution_id),
            tenantId: f.tenant.id,
            state: 'SUCCEEDED',
          },
        }),
      ).not.toBeNull();
      await submit(f.token, corrected.envelope);
      expect(s.writeCount).toBe(1);
      const no = await chat(f.token, proposal(freshHash()));
      const rejected = await submit(
        f.token,
        no.envelope,
        no.envelope.body.reject_intent,
      );
      expect(state(rejected.body)).toBe('REJECTED');
      expect(s.writeCount).toBe(1);
      const unknown = await chat(f.token, proposal(freshHash()));
      s.loseReply = true;
      const lost = await submit(f.token, unknown.envelope);
      expect(state(lost.body)).toBe('UNKNOWN');
      expect(s.writeCount).toBe(2);
      await submit(f.token, unknown.envelope);
      expect(s.writeCount).toBe(2);
      s.loseReply = false;
      const stale = await chat(f.token, proposal(freshHash()));
      s.cost = '41';
      await refusal(
        'stale',
        await submit(f.token, stale.envelope),
        f.tenant.id,
        2,
        s,
      );
      s.cost = '40';
      const expired = await chat(f.token, proposal(freshHash()));
      await db.prisma.aiApprovalRequest.update({
        where: { id: expired.approval.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await refusal(
        'expired',
        await submit(f.token, expired.envelope),
        f.tenant.id,
        2,
        s,
      );
      const cross = await chat(f.token, proposal(freshHash()));
      const other = await fx.user(f.tenant, UserRole.TENANT_OWNER),
        otherToken = await http.login(
          f.tenant.slug,
          other.email,
          other.password,
        );
      await refusal(
        'foreign-actor',
        await submit(otherToken, cross.envelope),
        f.tenant.id,
        2,
        s,
      );
      const foreign = await setup('goods-ui-foreign', '77102');
      await refusal(
        'foreign-tenant',
        await submit(foreign.token, cross.envelope),
        f.tenant.id,
        2,
        s,
      );
      expect(await actionCount(foreign.tenant.id)).toBe(0);
      const branch = await db.prisma.branch.create({
        data: { tenantId: f.tenant.id, name: 'Synthetic branch' },
      });
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
        },
        data: { branchId: branch.id },
      });
      await refusal(
        'scoped-owner',
        await submit(f.token, cross.envelope),
        f.tenant.id,
        2,
        s,
      );
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
        },
        data: { branchId: null },
      });
      const revoked = await chat(f.token, proposal(freshHash()));
      s.canReceive = false;
      await refusal(
        'permission-revoked',
        await submit(f.token, revoked.envelope),
        f.tenant.id,
        2,
        s,
      );
      s.canReceive = true;
      const featureRevoked = await chat(f.token, proposal(freshHash()));
      await db.prisma.tenantEntitlement.updateMany({
        where: { tenantId: f.tenant.id, featureKey: 'commerce.store' },
        data: { enabled: false },
      });
      await refusal(
        'feature-revoked',
        await submit(f.token, featureRevoked.envelope),
        f.tenant.id,
        2,
        s,
      );
      await db.prisma.tenantEntitlement.updateMany({
        where: { tenantId: f.tenant.id, featureKey: 'commerce.store' },
        data: { enabled: true },
      });
      const inactive = await chat(f.token, proposal(freshHash()));
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
        },
        data: { status: 'suspended' },
      });
      await refusal(
        'membership-suspended',
        await submit(f.token, inactive.envelope),
        f.tenant.id,
        2,
        s,
        true,
      );
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
        },
        data: { status: 'active' },
      });
      const racing = await setup('goods-ui-race', '77103'),
        rs = states.get(racing.company)!;
      const race = await chat(racing.token, proposal(freshHash()));
      const decisions = await Promise.all([
        submit(racing.token, race.envelope),
        submit(racing.token, race.envelope, race.envelope.body.reject_intent),
      ]);
      const final = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: race.approval.id },
      });
      expect(['completed', 'rejected']).toContain(final.status);
      expect(rs.writeCount).toBe(final.status === 'completed' ? 1 : 0);
      expect(
        decisions.filter((d) => state(d.body) === 'SUCCEEDED').length,
      ).toBe(rs.writeCount);
      observations.race = { status: final.status, writes: rs.writeCount };
      const typed = await setup('goods-ui-typed', '77104'),
        ts = states.get(typed.company)!;
      const typedOutcomes = [];
      for (const mode of ['success', 'reject', 'unknown'] as const) {
        const proposed = await chat(typed.token, proposal(freshHash()));
        ts.loseReply = mode === 'unknown';
        const beforeModel = modelCalls;
        const typedRequest = {
          surface: 'web',
          audience: 'owner',
          requestId: randomUUID(),
          conversationId: proposed.body.user_turn.conversationId,
          messages: [
            {
              role: 'user',
              content:
                mode === 'reject' ? 'Отклонить приход' : 'Подтвердить приход',
            },
          ],
        };
        const answer = await post(typed.token, '/api/ai/chat', typedRequest);
        check(answer, 201, 'typed-' + mode);
        expect(modelCalls).toBe(beforeModel);
        const reply = (answer.body as { reply: string }).reply;
        expect(reply).toContain(
          mode === 'success'
            ? 'Приход товара подтверждён в YCLIENTS.'
            : mode === 'reject'
              ? 'Приход отклонён.'
              : 'Результат прихода не подтверждён.',
        );
        expect(reply).toContain('Количество: 2.5 флакон (код единицы 11).');
        expect(reply).toContain('Сумма прихода: 25.625 RUB.');
        expect(reply).not.toBe('Готово.');
        const beforeRetry = await executionRows(typed.tenant.id);
        const writesBeforeRetry = ts.writeCount;
        const turnsBeforeRetry = await db.prisma.widgetTimelineTurn.count({
          where: { tenantId: typed.tenant.id },
        });
        for (const eraseIntent of [false, true]) {
          if (eraseIntent)
            await db.prisma.widgetIntentRecord.updateMany({
              where: { tenantId: typed.tenant.id, consumedAt: { not: null } },
              data: { erasedAt: new Date() },
            });
          const retry = await post(typed.token, '/api/ai/chat', typedRequest);
          check(retry, 201, 'typed-retry-' + mode);
          expect((retry.body as { reply: string }).reply).toBe(reply);
          expect(await executionRows(typed.tenant.id)).toEqual(beforeRetry);
          expect(
            await db.prisma.widgetTimelineTurn.count({
              where: { tenantId: typed.tenant.id },
            }),
          ).toBe(turnsBeforeRetry);
          expect(ts.writeCount).toBe(writesBeforeRetry);
          expect(modelCalls).toBe(beforeModel);
        }
        const history = await request(http.app.getHttpServer())
          .get('/api/ai/conversation')
          .set('Authorization', `Bearer ${typed.token}`);
        check(history, 200, 'typed-history-' + mode);
        expect(
          (
            history.body as { turns: Array<{ role: string; text: string }> }
          ).turns
            .filter((t) => t.role === 'assistant')
            .at(-1)?.text,
        ).toBe(reply);
        expect(JSON.stringify(history.body)).not.toMatch(
          /photo_sha256|intent_token|data:image/,
        );
        typedOutcomes.push({
          mode,
          sameCanonicalHistoryText: true,
          requestIdReplayAndErasedIntentReplay: true,
          replayAppendedTurns: 0,
          writes: ts.writeCount,
        });
      }
      expect(ts.writeCount).toBe(2);
      observations.typedOutcomes = typedOutcomes;
      const restartPending = await chat(f.token, {
        ...proposal(freshHash()),
        quantity: '7.5',
      });
      writeFileSync(
        receiptPath,
        JSON.stringify({
          tenant: f.tenant,
          user: f.user,
          company: f.company,
          pid: process.pid,
          pg,
          success: corrected,
          unknown,
          pending: restartPending,
          executions: await executionRows(f.tenant.id),
        }),
      );
      observations.checked = [
        'exact-decimals',
        'chat-replay',
        'corrected-version',
        'stale-old-widget',
        'detail-child',
        'canonical-AE-success',
        'duplicate',
        'rejection',
        'UNKNOWN-no-resend',
        'source-stale',
        'expiry',
        'foreign-actor',
        'foreign-tenant',
        'scoped-owner',
        'permission-revoked',
        'feature-revoked',
        'membership-suspended',
        'concurrent-approve-reject',
      ];
    } else if (stage === 'restore') {
      await restoreTerminalHistory(pg);
    } else {
      const saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
        tenant: TenantFixture;
        user: UserFixture;
        company: string;
        pid: number;
        pg: string;
        executions: Awaited<ReturnType<typeof executionRows>>;
        success: Awaited<ReturnType<typeof chat>>;
        unknown: Awaited<ReturnType<typeof chat>>;
        pending: Awaited<ReturnType<typeof chat>>;
      };
      expect(process.pid).not.toBe(saved.pid);
      expect(pg).not.toBe(saved.pg);
      states.set(saved.company, source());
      const s = states.get(saved.company)!,
        token = await http.login(
          saved.tenant.slug,
          saved.user.email,
          saved.user.password,
        );
      expect(await executionRows(saved.tenant.id)).toEqual(saved.executions);
      const oldSuccess = await submit(token, saved.success.envelope);
      const oldUnknown = await submit(token, saved.unknown.envelope);
      for (const old of [oldSuccess, oldUnknown]) {
        check(old, 200, 'old-token-replay');
        expect((old.body as { outcome: string }).outcome).toBe('expired');
      }
      expect(s.writeCount).toBe(0);
      const canonicalSuccess = await approve(token, saved.success.approval);
      check(canonicalSuccess, 201, 'canonical-replay-success');
      expect(parsed(canonicalSuccess).status).toBe('completed');
      const canonicalUnknown = await approve(token, saved.unknown.approval);
      check(canonicalUnknown, 201, 'canonical-replay-unknown');
      expect(canonicalUnknown.body).toMatchObject({
        status: 'unknown',
        error: { code: 'ai_tool_outcome_unknown' },
        replayed: true,
      });
      expect(parsed(canonicalUnknown).canonical_actions).toEqual([
        expect.objectContaining({
          executionId: saved.executions.find((e) => e.state === 'UNKNOWN')!.id,
          state: 'UNKNOWN',
        }),
      ]);
      const executions = await executionRows(saved.tenant.id);
      expect(executions).toEqual(saved.executions);
      expect(executions.map((e) => e.state).sort()).toEqual([
        'SUCCEEDED',
        'UNKNOWN',
      ]);
      expect(executions.every((e) => e.executionAttemptCount === 1)).toBe(true);
      expect(s.writeCount).toBe(0);
      observations.persistedExecutionStates = executions;
      const history = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${token}`);
      check(history, 200, 'restart-history');
      expect(modelCalls).toBe(0);
      const resumed = await submit(token, saved.pending.envelope);
      expect(state(resumed.body)).toBe('SUCCEEDED');
      expect(s.writeCount).toBe(1);
      observations.restart = {
        process: true,
        postgres: true,
        successResends: 0,
        unknownResends: 0,
        pendingWrites: 1,
      };
      // Real React + real HTTP after restart. All product paths stay in AppModule.
      const browserCheckpoints: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.resolve(
              '../maya-carrier-react/test/goods-receipt-browser-probe.mjs',
            ),
          ],
          { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
        );
        let pending = Promise.resolve(),
          failure: Error | undefined,
          stderr = '',
          killTimer: NodeJS.Timeout | undefined;
        const fail = (error: unknown) => {
          failure ??= error instanceof Error ? error : new Error(String(error));
          child.kill('SIGTERM');
          killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
        };
        const timer = setTimeout(
          () => fail(new Error('Goods browser timeout')),
          180000,
        );
        child.stderr!.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        child.on('message', (raw: unknown) => {
          pending = pending
            .then(async () => {
              const m = raw as { type: string; name: string };
              if (m.type === 'ready')
                child.send({
                  type: 'start',
                  backendOrigin: await http.listenLoopback(),
                  output,
                  ownerEmail: saved.user.email,
                });
              if (m.type === 'checkpoint') {
                if (
                  m.name === 'prepare-success' ||
                  m.name === 'prepare-reject' ||
                  m.name === 'prepare-unknown'
                ) {
                  nextProposal = proposal(freshHash());
                  s.loseReply = m.name === 'prepare-unknown';
                }
                if (m.name === 'success') expect(s.writeCount).toBe(2);
                if (m.name === 'reject') expect(s.writeCount).toBe(2);
                if (m.name === 'unknown' || m.name === 'reload')
                  expect(s.writeCount).toBe(3);
                browserCheckpoints.push(m.name);
                child.send({ type: 'continue:' + m.name });
              }
            })
            .catch(fail);
        });
        child.once('error', fail);
        child.once('close', (code) => {
          clearTimeout(timer);
          clearTimeout(killTimer);
          void pending.then(
            () =>
              failure
                ? reject(failure)
                : code !== 0
                  ? reject(new Error('Goods browser failed: ' + stderr))
                  : resolve(),
            reject,
          );
        });
      });
      observations.browserCheckpoints = browserCheckpoints;
      expect(browserCheckpoints).toContain('reload');
      const terminalHistory = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${token}`);
      check(terminalHistory, 200, 'terminal-history-before-restart');
      const terminalTexts = (
        terminalHistory.body as { turns: Array<{ role: string; text: string }> }
      ).turns
        .filter(
          (t) =>
            t.role === 'assistant' &&
            [
              'Приход товара подтверждён в YCLIENTS.\n',
              'Приход отклонён. Изменений в складе по этому предложению нет.\n',
              'Результат прихода не подтверждён. Повторная отправка остановлена; проверьте документ в YCLIENTS.\n',
            ].some((prefix) => t.text.startsWith(prefix)),
        )
        .map((t) => t.text)
        .filter((text) =>
          text.includes('Количество: 2.5 флакон (код единицы 11).'),
        );
      expect(terminalTexts).toHaveLength(3);
      writeFileSync(
        receiptPath,
        JSON.stringify({
          ...saved,
          resumePid: process.pid,
          resumePg: pg,
          resumeExecutions: await executionRows(saved.tenant.id),
          terminalTexts,
        }),
      );
    }
    expect(externalCalls).toBe(0);
  });
});
