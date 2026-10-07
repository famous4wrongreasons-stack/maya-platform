import { YclientsGoodsReceiptUnknownError } from '../../src/crm/yclients-goods-receipt';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { GoodsPhotoParser } from '../../src/ai-tools/goods-photo.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { CrmService } from '../../src/crm/crm.service';
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

const stage = process.env.JEST_GOODS_STAGE;
const receiptPath = process.env.JEST_GOODS_RECEIPT!;
const output = process.env.JEST_GOODS_OUTPUT!;
if (
  !['prepare', 'resume'].includes(stage ?? '') ||
  !path.isAbsolute(receiptPath ?? '') ||
  !path.isAbsolute(output ?? '')
)
  throw new Error('Explicit owned goods proof stage required');
const image = () =>
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
    'base64',
  );
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

/** Actual HTTP/auth/C9/approval/R10/AE/PG. Only parser/model/provider edges are synthetic. */
describe('Goods vertical and restart [synthetic parser/model/provider]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const states = new Map<string, Source>();
  let modelCalls = 0,
    parserCalls = 0,
    externalCalls = 0;
  const observations: Record<string, unknown> = {
    stage,
    modelSelection: 'SCRIPTED_SYNTHETIC',
    parser: 'SYNTHETIC_NOT_OCR_ACCEPTANCE',
    provider: 'SYNTHETIC_ADAPTER',
    certificate: 'NOT_ISSUED',
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
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
        if (modelCalls > 5) throw new Error('Unbounded scripted selection');
        expect(input.toolResults).toHaveLength(0);
        return Promise.resolve({
          reply: '',
          toolCall: {
            name: 'inventory.goods.read',
            arguments: { goods_id: '123' },
          },
          semanticPlan: new ConversationIntelligenceService().validatePlan(
            {
              dialogue_act: 'request',
              tasks: [
                {
                  intent: 'inventory.goods',
                  entities: { goods_id: '123' },
                  confidence: 0.99,
                },
              ],
            },
            UserRole.TENANT_OWNER,
            ['inventory.goods.read'],
          ),
          provider: 'openai',
          model: 'SCRIPTED_GOODS_SELECTION',
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
  const review = (token: string, p: Record<string, unknown>) =>
    post(token, '/api/ai/goods/receipt-review', p);
  const approve = (token: string, a: Approval, hash = a.payload_hash) =>
    post(token, `/api/ai/approvals/${a.id}/approve`, { payloadHash: hash });
  const reject = (token: string, a: Approval) =>
    post(token, `/api/ai/approvals/${a.id}/reject`, {
      payloadHash: a.payload_hash,
    });
  const freshHash = () =>
    createHash('sha256').update(randomUUID()).digest('hex');
  async function pending(token: string, hash = freshHash()) {
    const p = proposal(hash),
      r = await review(token, p);
    check(r, 201, 'pending');
    expect(parsed(r).status).toBe('approval_required');
    return { p, a: parsed(r).approval };
  }
  async function actionCount(tenantId: string) {
    return db.prisma.actionExecution.count({
      where: { tenantId, capability: GOODS_RECEIPT_CAPABILITY },
    });
  }
  it('runs exact authorized stage with no real model, OCR or provider', async () => {
    const pg = (
      await db.prisma.$queryRaw<
        Array<{ started: string }>
      >`SELECT pg_postmaster_start_time()::text AS started`
    )[0].started;
    if (stage === 'resume') {
      const saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
        tenant: TenantFixture;
        user: UserFixture;
        company: string;
        pid: number;
        pg: string;
        success: Approval;
        unknown: Approval;
        acknowledged: Approval;
        acknowledgedExecution: string;
        pending: Approval;
        request: Record<string, unknown>;
        runId: string;
        unknownExecution: string;
      };
      expect(process.pid).not.toBe(saved.pid);
      expect(pg).not.toBe(saved.pg);
      observations.processRestart = true;
      observations.postgresRestart = true;
      states.set(saved.company, source());
      const s = states.get(saved.company)!;
      const token = await http.login(
        saved.tenant.slug,
        saved.user.email,
        saved.user.password,
      );
      const history = await request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('Authorization', `Bearer ${token}`);
      check(history, 200, 'history');
      expect(JSON.stringify(history.body)).toContain('Синтетический шампунь');
      expect(modelCalls).toBe(0);
      expect(s.readCount).toBe(0);
      const success = await approve(token, saved.success);
      check(success, 201, 'completed restart replay');
      expect(parsed(success).status).toBe('completed');
      expect(s.writeCount).toBe(0);
      const unknown = await approve(token, saved.unknown);
      check(unknown, 201, 'unknown restart replay');
      expect(parsed(unknown).status).toBe('unknown');
      expect(s.writeCount).toBe(0);
      const acknowledged = await approve(token, saved.acknowledged);
      check(acknowledged, 201, 'acknowledged unknown restart replay');
      expect(parsed(acknowledged).status).toBe('unknown');
      const ackAttempt = await db.prisma.actionAttempt.findFirstOrThrow({
        where: {
          actionExecutionId: saved.acknowledgedExecution,
          kind: 'EXECUTION',
        },
      });
      expect(ackAttempt.safeResultJson).toMatchObject({
        providerObservation: {
          acknowledged_document_id: '900',
          receipt_verified: false,
          reconciliation: 'manual_required',
        },
      });
      expect(s.writeCount).toBe(0);
      const pendingResult = await approve(token, saved.pending);
      check(pendingResult, 201, 'pending restart confirm');
      expect(parsed(pendingResult).status).toBe('completed');
      expect(s.writeCount).toBe(1);
      const again = await approve(token, saved.pending);
      check(again, 201, 'pending final replay');
      expect(s.writeCount).toBe(1);
      const unknownRow = await db.prisma.actionExecution.findUniqueOrThrow({
        where: { id: saved.unknownExecution },
      });
      expect(unknownRow.state).toBe('UNKNOWN');
      expect(unknownRow.executionAttemptCount).toBe(1);
      observations.outcomes = {
        restored_history: true,
        completed_replayed_without_dispatch: true,
        unknown_preserved_without_dispatch: true,
        pending_executed_once: true,
        unknown_attempts: unknownRow.executionAttemptCount,
        unconfirmed_acknowledgment_persisted: true,
      };
      expect(parserCalls).toBe(0);
      expect(externalCalls).toBe(0);
      return;
    }
    const owner = await setup('Goods local owner', '5'),
      foreign = await setup('Goods foreign', '6'),
      s = states.get('5')!;
    const requestBody = {
      surface: 'web',
      audience: 'owner',
      requestId: randomUUID(),
      messages: [{ role: 'user', content: 'Покажи товар 123 из YCLIENTS' }],
    };
    const chat = await post(owner.token, '/api/ai/chat', requestBody);
    check(chat, 201, 'goods chat');
    const chatBody = chat.body as {
      reply: string;
      coordination: { run_id: string; state: string };
      tools_used: unknown[];
    };
    expect(chatBody.coordination.state).toBe('COMPLETED');
    expect(chatBody.reply).toContain('Продажная цена: 100 RUB');
    expect(chatBody.reply).toContain('Склад 9: 1.250');
    expect(chatBody.reply).toContain(
      'Единица этих остатков в ответе не указана',
    );
    expect(modelCalls).toBe(1);
    expect(s.readCount).toBe(1);
    expect(await actionCount(owner.tenant.id)).toBe(0);
    const repeated = await post(owner.token, '/api/ai/chat', requestBody);
    check(repeated, 201, 'goods read replay');
    expect((repeated.body as { reply: string }).reply).toBe(chatBody.reply);
    expect(s.readCount).toBe(1);
    s.stock = '3.125';
    const current = await post(owner.token, '/api/ai/chat', {
      ...requestBody,
      requestId: randomUUID(),
    });
    check(current, 201, 'current goods read');
    expect((current.body as { reply: string }).reply).toContain('3.125');
    expect(s.readCount).toBe(2);
    const foreignRun = await request(http.app.getHttpServer())
      .get(`/api/orchestration/runs/${chatBody.coordination.run_id}`)
      .set('Authorization', `Bearer ${foreign.token}`);
    expect([400, 403, 404]).toContain(foreignRun.status);
    const missing = await request(http.app.getHttpServer())
      .post('/api/ai/goods/photo-preview')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('photo', image(), {
        filename: 'synthetic.png',
        contentType: 'image/png',
      });
    check(missing, 503, 'default parser unavailable');
    let parserBuffer: Uint8Array | undefined;
    jest
      .spyOn(http.app.get(GoodsPhotoParser), 'parse')
      .mockImplementation((bytes) => {
        parserCalls++;
        parserBuffer = bytes;
        return Promise.resolve({
          lines: [
            {
              name: 'Предварительный шампунь',
              quantity: '2.5',
              unit_label: 'флакон',
              unit_price: '10.25',
              line_total: '25.625',
              confidence: 0.2,
              price_kind: null,
              raw_ocr: 'PRIVATE_INVOICE',
              supplier: 'PRIVATE_SUPPLIER',
            },
          ],
        });
      });
    const photo = await request(http.app.getHttpServer())
      .post('/api/ai/goods/photo-preview')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('photo', image(), {
        filename: 'synthetic.png',
        contentType: 'image/png',
      });
    check(photo, 201, 'photo preview');
    const preview = photo.body as {
      photo_sha256: string;
      lines: Array<{ parser_confidence: number; price_kind: null }>;
    };
    expect(preview.lines[0]).toMatchObject({
      parser_confidence: 0.2,
      price_kind: null,
    });
    expect(parserBuffer?.every((v) => v === 0)).toBe(true);
    expect(JSON.stringify(photo.body)).not.toContain('PRIVATE');
    expect(
      await db.prisma.aiApprovalRequest.count({
        where: { tenantId: owner.tenant.id },
      }),
    ).toBe(0);
    const p = proposal(preview.photo_sha256);
    const ambiguous = await review(owner.token, { ...p, price_kind: null });
    check(ambiguous, 409, 'ambiguous price refusal');
    const [first, concurrentReview] = await Promise.all([
      review(owner.token, p),
      review(owner.token, p),
    ]);
    check(first, 201, 'review v1');
    check(concurrentReview, 201, 'concurrent review v1');
    expect(parsed(concurrentReview).approval.id).toBe(
      parsed(first).approval.id,
    );
    const a1 = parsed(first).approval;
    expect(s.writeCount).toBe(0);
    const contextReads = s.contextReads;
    const duplicate = await review(owner.token, p);
    check(duplicate, 201, 'same photo review');
    expect(parsed(duplicate).approval.id).toBe(a1.id);
    expect(s.contextReads).toBe(contextReads);
    check(
      await review(owner.token, { ...p, unit_cost: '11' }),
      409,
      'same-version altered facts',
    );
    const revised = await review(owner.token, {
      ...p,
      unit_cost: '11',
      review_version: 2,
    });
    check(revised, 201, 'review v2');
    const a2 = parsed(revised).approval;
    expect(a2.id).not.toBe(a1.id);
    expect(a2.payload_preview).toMatchObject({
      quantity: '2.5',
      unit_cost: '11',
      line_total: '27.5',
      review_version: 2,
    });
    check(await approve(owner.token, a1), 409, 'superseded refusal');
    check(await approve(owner.token, a2, 'f'.repeat(64)), 409, 'tampered hash');
    check(await approve(foreign.token, a2), 404, 'foreign approval');
    const other = await fx.user(owner.tenant, UserRole.TENANT_OWNER),
      otherToken = await http.login(
        owner.tenant.slug,
        other.email,
        other.password,
      );
    check(await approve(otherToken, a2), 403, 'other actor');
    const concurrent = await Promise.all([
      approve(owner.token, a2),
      approve(owner.token, a2),
    ]);
    expect(
      concurrent.some(
        (r) => r.status === 201 && parsed(r).status === 'completed',
      ),
    ).toBe(true);
    expect(s.writeCount).toBe(1);
    expect(s.sale).toBe('100');
    expect(s.stock).toBe('3.125');
    expect(s.writes[0]).toMatchObject({
      quantity: '2.5',
      unit_cost: '11',
      line_total: '27.5',
      price_kind: 'receipt_purchase_unit',
    });
    check(await approve(owner.token, a2), 201, 'completed exact replay');
    expect(s.writeCount).toBe(1);
    check(
      await review(owner.token, { ...p, review_version: 3 }),
      409,
      'completed photo no second receipt',
    );
    const otherActorSamePhoto = await review(otherToken, p);
    check(otherActorSamePhoto, 201, 'other owner draft for same photo');
    const secondEffect = await approve(
      otherToken,
      parsed(otherActorSamePhoto).approval,
    );
    check(secondEffect, 201, 'tenant-wide photo effect fence');
    expect(parsed(secondEffect).status).toBe('not_executed');
    expect(s.writeCount).toBe(1);
    const raceOwner = await setup('Review confirm race owner', '9');
    const versionRaces: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 3; i++) {
      const firstVersion = await pending(raceOwner.token);
      const [newVersion, oldDecision] = await Promise.all([
        review(raceOwner.token, {
          ...firstVersion.p,
          review_version: 2,
          unit_cost: '11',
        }),
        approve(raceOwner.token, firstVersion.a),
      ]);
      const old = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
        where: { id: firstVersion.a.id },
      });
      if (newVersion.status === 201) {
        expect(old.status).toBe('rejected');
        check(oldDecision, 409, 'superseded before approval CAS');
        check(
          await reject(raceOwner.token, parsed(newVersion).approval),
          201,
          'close race replacement',
        );
      } else {
        check(newVersion, 409, 'approval before supersession');
        check(oldDecision, 201, 'old approved first');
        expect(parsed(oldDecision).status).toBe('completed');
      }
      versionRaces.push({
        review: newVersion.status,
        decision: oldDecision.status,
        old: old.status,
      });
    }
    const rejected = await pending(owner.token);
    check(await reject(owner.token, rejected.a), 201, 'reject');
    check(await approve(owner.token, rejected.a), 409, 'reject no dispatch');
    // Controlled pause only: the CRM identity owner still runs unchanged, then a
    // real HTTP rejection commits before the waiting review projects its state.
    const rejectedDuringRead = await pending(owner.token);
    const crm = http.app.get(CrmService);
    const originalIdentity = crm.goodsReadIdentity.bind(crm);
    const identityPause = jest
      .spyOn(crm, 'goodsReadIdentity')
      .mockImplementationOnce(async (tenant, user) => {
        const value = await originalIdentity(tenant, user);
        check(
          await reject(owner.token, rejectedDuringRead.a),
          201,
          'reject during review identity',
        );
        return value;
      });
    check(
      await review(owner.token, rejectedDuringRead.p),
      409,
      'ended review after identity wait',
    );
    identityPause.mockRestore();
    expect(s.writeCount).toBe(1);
    const stale = await pending(owner.token);
    s.cost = '41';
    const staleResult = await approve(owner.token, stale.a);
    check(staleResult, 201, 'stale source outcome');
    expect(parsed(staleResult).status).toBe('failed');
    expect(s.writeCount).toBe(1);
    s.cost = '40';
    const expired = await pending(owner.token);
    await db.prisma.aiApprovalRequest.update({
      where: { id: expired.a.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    check(await review(owner.token, expired.p), 409, 'expired replay');
    check(await approve(owner.token, expired.a), 409, 'expired confirm');
    const branch = await db.prisma.branch.create({
      data: { tenantId: owner.tenant.id, name: 'Synthetic scoped branch' },
    });
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { tenantId: owner.tenant.id, userId: owner.user.id },
      },
      data: { branchId: branch.id },
    });
    const reads = s.readCount;
    const denied = await http.executeTool(
      owner.token,
      'inventory.goods.read',
      {
        surface: 'web',
        arguments: { goods_id: '123' },
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
    );
    check(denied, 403, 'branch source scope refusal');
    expect(s.readCount).toBe(reads);
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { tenantId: owner.tenant.id, userId: owner.user.id },
      },
      data: { branchId: null },
    });
    const revoked = await pending(owner.token);
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { tenantId: owner.tenant.id, userId: owner.user.id },
      },
      data: { status: 'suspended' },
    });
    check(await approve(owner.token, revoked.a), 401, 'revoked actor');
    expect(s.writeCount).toBe(1);
    await db.prisma.membership.update({
      where: {
        userId_tenantId: { tenantId: owner.tenant.id, userId: owner.user.id },
      },
      data: { status: 'active' },
    });
    const sourceWaitRefusals: string[] = [];
    for (const mode of [
      'membership',
      'expiry',
      'integration',
      'feature',
    ] as const) {
      const raced = await pending(owner.token);
      let count = 0;
      s.duringContextRead = async () => {
        if (++count !== 2) return;
        if (mode === 'membership')
          await db.prisma.membership.update({
            where: {
              userId_tenantId: {
                tenantId: owner.tenant.id,
                userId: owner.user.id,
              },
            },
            data: { status: 'suspended' },
          });
        if (mode === 'expiry')
          await db.prisma.aiApprovalRequest.update({
            where: { id: raced.a.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
        if (mode === 'integration')
          await db.prisma.crmIntegration.update({
            where: { tenantId: owner.tenant.id },
            data: { status: 'disabled' },
          });
        if (mode === 'feature')
          await db.prisma.tenantEntitlement.updateMany({
            where: { tenantId: owner.tenant.id, featureKey: 'commerce.store' },
            data: { enabled: false },
          });
      };
      const refused = await approve(owner.token, raced.a);
      check(refused, 201, 'revoke while source read ' + mode);
      expect(parsed(refused).status).toBe('failed');
      expect(s.writeCount).toBe(1);
      s.duringContextRead = undefined;
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { tenantId: owner.tenant.id, userId: owner.user.id },
        },
        data: { status: 'active' },
      });
      await db.prisma.crmIntegration.update({
        where: { tenantId: owner.tenant.id },
        data: { status: 'active' },
      });
      await db.prisma.tenantEntitlement.updateMany({
        where: { tenantId: owner.tenant.id, featureKey: 'commerce.store' },
        data: { enabled: true },
      });
      sourceWaitRefusals.push(mode);
    }
    const noFeature = await setup(
      'Goods missing entitlement',
      '7',
      UserRole.TENANT_OWNER,
      false,
    );
    check(
      await http.executeTool(
        noFeature.token,
        'inventory.goods.read',
        {
          surface: 'web',
          arguments: { goods_id: '123' },
          idempotencyKey: randomUUID(),
        },
        randomUUID(),
      ),
      403,
      'missing feature',
    );
    const client = await setup('Goods client refused', '8', UserRole.CLIENT);
    check(
      await http.executeTool(
        client.token,
        'inventory.goods.read',
        {
          surface: 'web',
          arguments: { goods_id: '123' },
          idempotencyKey: randomUUID(),
        },
        randomUUID(),
      ),
      403,
      'client refused',
    );
    const unknown = await pending(owner.token);
    s.loseReply = true;
    const lost = await approve(owner.token, unknown.a);
    check(lost, 201, 'lost reply');
    expect(parsed(lost).status).toBe('unknown');
    expect(s.writeCount).toBe(2);
    s.loseReply = false;
    const unknownExecution = parsed(lost).canonical_actions?.[0].executionId;
    expect(unknownExecution).toBeDefined();
    const acknowledged = await pending(owner.token);
    s.loseReadback = true;
    const ackLost = await approve(owner.token, acknowledged.a);
    check(ackLost, 201, 'acknowledged document with unknown readback');
    expect(parsed(ackLost).status).toBe('unknown');
    expect(s.writeCount).toBe(3);
    s.loseReadback = false;
    const acknowledgedExecution =
      parsed(ackLost).canonical_actions![0].executionId;
    const ackAttempt = await db.prisma.actionAttempt.findFirstOrThrow({
      where: { actionExecutionId: acknowledgedExecution, kind: 'EXECUTION' },
    });
    expect(ackAttempt.safeResultJson).toMatchObject({
      preDispatch: { company_id: '5' },
      providerObservation: {
        acknowledged_document_id: '900',
        receipt_verified: false,
        reconciliation: 'manual_required',
      },
    });
    const restartPending = await pending(owner.token);
    const args = (
      await db.prisma.aiApprovalRequest.findMany({
        where: { tenantId: owner.tenant.id },
      })
    ).map((r) => db.encryption.decrypt(r.encryptedArguments));
    expect(args.join(' ')).not.toMatch(
      /PRIVATE_INVOICE|PRIVATE_SUPPLIER|Предварительный|raw_ocr|parser_confidence/,
    );
    expect(
      await db.prisma.teamAttachment.count({
        where: { tenantId: owner.tenant.id },
      }),
    ).toBe(0);
    expect(
      await db.prisma.teamMessage.count({
        where: { tenantId: owner.tenant.id },
      }),
    ).toBe(0);
    expect(externalCalls).toBe(0);
    observations.outcomes = {
      chat_c9: chatBody,
      read_dedupe: true,
      current_fractional_stock: true,
      photo_original_cleared: true,
      parser_low_confidence_preserved: true,
      provisional_not_persisted: true,
      review_versions: [a1.id, a2.id],
      fractional_receipt: s.writes[0],
      version_vs_approval_races: versionRaces,
      tenant_wide_photo_no_second_effect: true,
      concurrent_statuses: concurrent.map((r) => ({
        http: r.status,
        status: parsed(r).status,
      })),
      synthetic_provider_writes: s.writeCount,
      foreign_tenant_rejected: true,
      branch_scope_rejected: true,
      revocation_rejected: true,
      revocation_during_source_read: sourceWaitRefusals,
      missing_feature_rejected: true,
      client_rejected: true,
      stale_rejected: true,
      expired_rejected: true,
      rejection_no_effect: true,
      ended_review_after_identity_wait_rejected: true,
      unknown_without_retry: true,
      unconfirmed_acknowledgment_persisted: true,
      no_team_attachment: true,
    };
    writeFileSync(
      receiptPath,
      JSON.stringify({
        tenant: owner.tenant,
        user: owner.user,
        company: owner.company,
        pid: process.pid,
        pg,
        success: a2,
        unknown: unknown.a,
        acknowledged: acknowledged.a,
        acknowledgedExecution,
        pending: restartPending.a,
        request: requestBody,
        runId: chatBody.coordination.run_id,
        unknownExecution,
      }),
      { mode: 0o600 },
    );
  });
});
