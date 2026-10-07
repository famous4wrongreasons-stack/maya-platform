import { GoodsReceiptApprovalAdapter } from './goods-receipt-approval.adapter';
import type { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EntitlementsService } from '../../entitlements/entitlements.service';
import type { RequestTx } from '../authority/principal-view';
import type { ActuatingRoutingInput } from '../routing/effect-router.ports';
import type { PrincipalView } from '../gate.types';
import type { GoodsReceiptApprovalSnapshot } from '../../ai-tools/ai-approval-widget-trigger.port';
import { TimelineStore } from '../stores/timeline.store';
import { goodsReceiptApprovalRef } from '../inventory/goods-receipt-approval.port';
import {
  goodsReceiptTerminalText,
  goodsReceiptDecisionReply,
  GOODS_RECEIPT_UNCONFIRMED,
} from '../inventory/goods-receipt-terminal.presenter';

const facts = {
  company_id: '77101',
  goods_id: '123',
  store_id: '9',
  quantity: '2.5',
  unit_label: 'флакон',
  unit_id: '11',
  unit_cost: '10.25',
  currency: 'RUB',
  line_total: '25.625',
  received_at: '2026-10-07T09:00:00Z',
  photo_sha256: 'private-photo-hash',
  client_phone: 'DO-NOT-RETAIN',
};
const principal: PrincipalView = {
  authority: {
    kind: 'USER',
    tenantId: 'tenant-a',
    userId: 'owner-a',
    membershipId: 'membership-a',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'a'.repeat(64),
  },
  role: 'tenant_owner',
  proofHash: 'a'.repeat(64),
  presentationMode: 'owner',
  verificationLevel: 'SESSION_VERIFIED',
};
const source: GoodsReceiptApprovalSnapshot = {
  id: 'approval-a',
  payloadHash: 'b'.repeat(64),
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 600000),
  summary: 'Goods',
  facts,
  origin: {
    contract: 'maya.goods-receipt-chat-approval/1',
    approvalId: 'approval-a',
    payloadHash: 'b'.repeat(64),
    userTurnId: 'original-turn',
    conversationId: 'conversation-a',
    principalProofHash: principal.proofHash,
  },
};
const ref = goodsReceiptApprovalRef(source.id, source.payloadHash);
const input = () =>
  ({
    routing: {
      tenantId: 'tenant-a',
      record: {
        widgetKind: 'APPROVAL',
        capabilitySpace: 'AE',
        capabilityKey: 'crm.goods.receipt.create.v1',
        confirmationOfKind: 'approval',
        confirmationOfRef: source.id,
        producedByIntentTokenHash: null,
        approvalOfIntentRef: null,
        approvalDecision: 'approve',
      },
    },
    actorUserId: 'owner-a',
    resolvedNouns: { values: new Map([['approval', ref]]) },
    principal,
    goodsHistoryTurn: {
      turnId: 'decision-turn',
      conversationId: 'conversation-a',
    },
  }) as unknown as ActuatingRoutingInput;
const result = {
  ...facts,
  operation: 'stock_receipt',
  catalog_price_change_requested: false,
  absolute_stock_assignment_requested: false,
  receipt_id: 'receipt-1',
  action_execution_id: 'execution-1',
};
function harness(
  fault: 'none' | 'pre' | 'final-before' | 'final-after' = 'none',
) {
  const rows = new Map<string, string>();
  const calls: string[] = [];
  const runtime = {
    approve: jest.fn(() => {
      calls.push('dispatch');
      return Promise.resolve({ status: 'completed', result });
    }),
    reject: jest.fn().mockResolvedValue({ status: 'rejected' }),
    verifyGoodsReceiptWidgetExecution: jest.fn().mockResolvedValue(true),
  };
  const tx = {} as RequestTx;
  const prisma = {
    $transaction: async <T>(run: (tx: RequestTx) => Promise<T>) => run(tx),
  };
  const service = new GoodsReceiptApprovalAdapter(
    runtime as unknown as AiToolRuntimeService,
    prisma as unknown as PrismaService,
    {} as EntitlementsService,
    { resolve: () => Promise.resolve(principal) },
    { encrypt: (s) => s, decrypt: (s) => s },
  );
  jest.spyOn(service, 'read').mockResolvedValue(source);
  jest.spyOn(TimelineStore, 'readDatabaseClock').mockResolvedValue(new Date());
  jest
    .spyOn(TimelineStore, 'persistChatReply')
    .mockImplementation((_tx, saved) => {
      expect(saved.userTurn).toEqual(input().goodsHistoryTurn);
      const final = saved.reply.startsWith('Приход товара подтверждён');
      calls.push(final ? 'save-final' : 'save-unknown');
      if (fault === 'pre' || (final && fault === 'final-before'))
        throw new Error('database unavailable');
      if (!rows.has(saved.completionHash))
        rows.set(saved.completionHash, saved.reply);
      if (final && fault === 'final-after')
        throw new Error('acknowledgement lost');
      return Promise.resolve();
    });
  return { service, runtime, rows, calls };
}
afterEach(() => jest.restoreAllMocks());
describe('Goods terminal encrypted history ordering', () => {
  it('saves inert UNKNOWN before dispatch and exact verified receipt after it', async () => {
    const h = harness();
    const out = await h.service.decide(input());
    expect(h.calls).toEqual(['save-unknown', 'dispatch', 'save-final']);
    expect(out.ownerDecision).toMatchObject({
      state: 'SUCCEEDED',
      receipt_text: goodsReceiptTerminalText(facts, 'SUCCEEDED'),
    });
    expect([...h.rows.values()].at(-1)).toContain(
      'Количество: 2.5 флакон (код единицы 11).',
    );
    expect([...h.rows.values()].join()).not.toMatch(
      /private-photo-hash|DO-NOT-RETAIN/,
    );
  });
  it('does not dispatch if the first history write fails', async () => {
    const h = harness('pre');
    expect((await h.service.decide(input())).receiptOutcome).toBe('REFUSED');
    expect(h.runtime.approve).not.toHaveBeenCalled();
  });
  it('leaves one stable UNKNOWN when the effect response is lost', async () => {
    const h = harness();
    h.runtime.approve.mockRejectedValueOnce(new Error('effect reply lost'));
    expect((await h.service.decide(input())).ownerDecision).toMatchObject({
      state: 'UNKNOWN',
    });
    expect(h.rows.size).toBe(1);
    expect([...h.rows.values()][0]).toContain(GOODS_RECEIPT_UNCONFIRMED);
    expect(h.runtime.approve).toHaveBeenCalledTimes(1);
  });
  it('does not rewrite the pre-UNKNOWN when the final write fails before commit', async () => {
    const h = harness('final-before');
    await expect(h.service.decide(input())).rejects.toThrow(
      'database unavailable',
    );
    expect(h.rows.size).toBe(1);
    expect(h.calls).toEqual(['save-unknown', 'dispatch', 'save-final']);
    expect(h.runtime.approve).toHaveBeenCalledTimes(1);
  });
  it('does not append UNKNOWN after a committed final reply loses its acknowledgement', async () => {
    const h = harness('final-after');
    await expect(h.service.decide(input())).rejects.toThrow(
      'acknowledgement lost',
    );
    expect(h.rows.size).toBe(2);
    expect([...h.rows.values()].at(-1)).toBe(
      goodsReceiptTerminalText(facts, 'SUCCEEDED'),
    );
    expect(h.calls).toEqual(['save-unknown', 'dispatch', 'save-final']);
  });
  it('retains an exact rejection and never calls approve', async () => {
    const h = harness();
    const request = input();
    (request.routing.record as { approvalDecision: string }).approvalDecision =
      'reject';
    const out = await h.service.decide(request);
    expect(out.ownerDecision).toMatchObject({
      state: 'REJECTED',
      receipt_text: goodsReceiptTerminalText(facts, 'REJECTED'),
    });
    expect(h.runtime.approve).not.toHaveBeenCalled();
  });
  it('refuses a different conversation before any dispatch', async () => {
    const h = harness();
    const request = {
      ...input(),
      goodsHistoryTurn: { turnId: 'wrong', conversationId: 'foreign' },
    };
    expect((await h.service.decide(request)).receiptOutcome).toBe('REFUSED');
    expect(h.runtime.approve).not.toHaveBeenCalled();
    expect(h.rows.size).toBe(0);
  });
});
describe('Exact typed goods terminal response', () => {
  it.each(['SUCCEEDED', 'REJECTED', 'UNKNOWN'] as const)(
    'preserves canonical %s text without a generic acknowledgement',
    (state) => {
      const receipt_text = goodsReceiptTerminalText(facts, state);
      expect(
        goodsReceiptDecisionReply({
          state,
          status:
            state === 'SUCCEEDED'
              ? 'completed'
              : state === 'REJECTED'
                ? 'rejected'
                : 'UNKNOWN',
          receipt_text,
          outcome: { ...result, verified: true, source: 'yclients' },
        }),
      ).toBe(receipt_text);
    },
  );
  it.each([
    null,
    {},
    { state: 'SUCCEEDED', status: 'completed', receipt_text: 'Готово.' },
    {
      state: 'UNKNOWN',
      receipt_text: goodsReceiptTerminalText(facts, 'SUCCEEDED'),
    },
  ])('never manufactures success from %j', (value) =>
    expect(goodsReceiptDecisionReply(value)).toBe(GOODS_RECEIPT_UNCONFIRMED),
  );
  it('requires immutable exact facts before storing text', () =>
    expect(() =>
      goodsReceiptTerminalText({ ...facts, quantity: 2.5 }, 'UNKNOWN'),
    ).toThrow('facts_unavailable'));
});
