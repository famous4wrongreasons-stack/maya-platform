import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { goodsHash } from '../crm/goods-receipt.contract';
import { observedGoodsItem } from '../crm/yclients-goods-read';
import { observedGoodsSearch } from '../crm/yclients-goods-search';
import { C9Orchestrator } from '../orchestration/c9.orchestrator';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiTypedWidgetTriggerPort } from './ai-typed-widget-trigger.port';
import { GoodsPhotoService } from './goods-photo.service';
import { GoodsPhotoController } from './goods-photo.controller';

const conversationId = '00000000-0000-4000-a000-000000000001';
const user = {
  tenantId: 'tenant',
  userId: 'owner',
  role: UserRole.TENANT_OWNER,
} as AuthenticatedUser;
const proposal = () => ({
  goods_id: '123',
  store_id: '9',
  quantity: '2.5',
  unit_id: '11',
  unit_cost: '10.25',
  currency: 'RUB',
  price_kind: 'receipt_purchase_unit',
  received_at: '2026-10-08T09:00:00Z',
  photo_sha256: 'a'.repeat(64),
  source_line: 1,
  review_version: 1,
});
const sourceRevision = 'b'.repeat(64);
const body = () => ({
  requestId: 'request_0001',
  conversationId,
  proposal: proposal(),
  source_revision: sourceRevision,
});
const resolution = {
  matched: true,
  receipt: {
    widget_id: 'widget',
    envelope_seal: 'seal',
    envelope: { certified: true },
  },
  dismiss_widget_id: null,
};
function setup() {
  const order: string[] = [];
  const photos = {
    sourceIdentity: jest.fn().mockResolvedValue(sourceRevision),
    preview: jest.fn(),
  };
  const turns = new Map<
    string,
    { utterance: string; conversationId: string }
  >();
  const timeline = {
    readCurrentConversation: jest
      .fn()
      .mockResolvedValue({ conversationId: null }),
    persistTypedTurn: jest.fn(
      (input: {
        requestId: string;
        utterance: string;
        conversationId?: string;
      }) => {
        order.push('turn');
        const previous = turns.get(input.requestId);
        if (
          previous &&
          (previous.utterance !== input.utterance ||
            previous.conversationId !==
              (input.conversationId ?? conversationId))
        )
          return Promise.reject(
            new ConflictException('user_turn_replay_conflict'),
          );
        turns.set(input.requestId, {
          utterance: input.utterance,
          conversationId: input.conversationId ?? conversationId,
        });
        return Promise.resolve({
          turnId: input.requestId,
          conversationId: input.conversationId ?? conversationId,
        });
      },
    ),
    persistAssistantReply: jest.fn(
      (
        input: Parameters<AiTypedWidgetTriggerPort['persistAssistantReply']>[0],
      ): Promise<void> => {
        void input;
        order.push('reply');
        return Promise.resolve();
      },
    ),
  };
  const runtime = {
    execute: jest.fn(
      (
        ...args: Parameters<AiToolRuntimeService['execute']>
      ): Promise<unknown> => {
        void args;
        order.push('runtime');
        return Promise.resolve({
          status: 'approval_required',
          approval: { id: 'PRIVATE_APPROVAL' },
          resolution,
        });
      },
    ),
    replayCompletedRead: jest.fn(),
  };
  const orchestrator = {
    conversationDigest: goodsHash,
    conversationRead: jest.fn(
      (
        _turn: unknown,
        _tool: string,
        _key: string,
        _hash: string,
        read: () => Promise<unknown>,
      ) => read(),
    ),
    finishConversationReads: jest.fn().mockResolvedValue(null),
  };
  const controller = new GoodsPhotoController(
    photos as unknown as GoodsPhotoService,
    runtime as unknown as AiToolRuntimeService,
    orchestrator as unknown as C9Orchestrator,
    { get: jest.fn().mockReturnValue(timeline) } as unknown as ModuleRef,
  );
  return { controller, photos, runtime, timeline, orchestrator, order };
}

describe('Goods photo authenticated explicit controller, synthetic owners only', () => {
  it('persists the real PREPARE turn immediately before runtime, completes after outcome and exposes only certified resolution', async () => {
    const h = setup(),
      result = await h.controller.review(user, body());
    expect(h.order).toEqual(['turn', 'runtime', 'reply']);
    expect(h.runtime.execute).toHaveBeenCalledWith(
      user,
      'inventory.goods.receipt.prepare',
      expect.objectContaining({ arguments: proposal(), surface: 'web' }),
      {
        goodsReviewOnly: true,
        widgetTrigger: 'T-2a',
        requestId: 'request_0001',
        userTurn: result.user_turn,
      },
    );
    expect(result).toMatchObject({
      contract: 'maya.goods-photo.review/1',
      conversationId,
      status: 'approval_required',
      resolution,
    });
    expect(result.user_text).toContain('Подготовь предложение');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_APPROVAL');
    expect(result.user_text).not.toContain('a'.repeat(64));
    expect(h.photos.sourceIdentity).toHaveBeenCalledTimes(3);
  });

  it('keeps original tuple turn for a transport retry and creates a distinct corrected version', async () => {
    const h = setup();
    const first = await h.controller.review(user, body());
    const repeat = await h.controller.review(user, {
      ...body(),
      requestId: 'transport_retry',
    });
    const next = await h.controller.review(user, {
      ...body(),
      proposal: { ...proposal(), review_version: 2, unit_cost: '11' },
    });
    expect(first.user_turn).toEqual(repeat.user_turn);
    expect(next.user_turn.turnId).not.toBe(first.user_turn.turnId);
    expect(h.runtime.execute.mock.calls[0][2].idempotencyKey).toBe(
      h.runtime.execute.mock.calls[1][2].idempotencyKey,
    );
    expect(
      h.timeline.persistAssistantReply.mock.calls[0][0].completionHash,
    ).toBe(h.timeline.persistAssistantReply.mock.calls[1][0].completionHash);
  });

  it.each(['held', 'completed'])(
    'returns %s history without a new active control or success claim',
    async (status) => {
      const h = setup();
      h.runtime.execute.mockResolvedValue({
        status,
        resolution,
        result: { PRIVATE: true },
      });
      const result = await h.controller.review(user, body());
      expect(result.status).toBe(status);
      expect(result).not.toHaveProperty('resolution');
      expect(result).not.toHaveProperty('result');
      expect(result.reply).not.toMatch(/Товар оприходован|Приход выполнен/);
    },
  );

  it('refuses unbound standalone approval replay without completing or reparenting it', async () => {
    const h = setup();
    h.runtime.execute.mockResolvedValue({
      status: 'approval_required',
      approval: { id: 'standalone' },
      replayed: true,
    });
    await expect(h.controller.review(user, body())).rejects.toThrow(
      'goods_receipt_chat_projection_unavailable',
    );
    expect(h.timeline.persistAssistantReply).not.toHaveBeenCalled();
    expect(h.runtime.execute).toHaveBeenCalledTimes(1);
  });

  it('requires the known current conversation and refuses missing/foreign principal binding before runtime', async () => {
    const h = setup();
    h.timeline.readCurrentConversation.mockResolvedValue({ conversationId });
    await expect(
      h.controller.review(user, {
        requestId: 'request_0001',
        proposal: proposal(),
        source_revision: sourceRevision,
      }),
    ).rejects.toThrow('goods_photo_conversation_required');
    h.timeline.persistTypedTurn.mockRejectedValue(
      new ForbiddenException('foreign conversation'),
    );
    await expect(h.controller.review(user, body())).rejects.toThrow(
      'foreign conversation',
    );
    expect(h.runtime.execute).not.toHaveBeenCalled();
  });

  it('stops if canonical turn creation is unavailable', async () => {
    const h = setup();
    h.timeline.persistTypedTurn.mockResolvedValue(null as never);
    await expect(h.controller.review(user, body())).rejects.toThrow(
      'goods_photo_chat_unavailable',
    );
    expect(h.runtime.execute).not.toHaveBeenCalled();
  });

  it('withholds review when authority/source is revoked after awaited outcome', async () => {
    const h = setup();
    h.photos.sourceIdentity
      .mockResolvedValueOnce('source-v1')
      .mockRejectedValue(new ForbiddenException('revoked'));
    await expect(h.controller.review(user, body())).rejects.toThrow('revoked');
    expect(h.timeline.persistAssistantReply).not.toHaveBeenCalled();
  });

  it('runs each explicit search through registered C9 with bounded projection and current source witness', async () => {
    const h = setup();
    const result = observedGoodsSearch(
      [
        {
          parent_id: 0,
          item_id: 123,
          category_id: 0,
          title: 'Товар',
          is_chain: false,
          is_item: true,
          is_category: false,
        },
      ],
      'шампунь',
      '5',
    );
    h.runtime.execute.mockResolvedValue({
      status: 'completed',
      execution_id: 'PRIVATE_EXECUTION',
      result: { ...result, PRIVATE: 'DROPPED' },
    });
    const answer = await h.controller.search(user, {
      requestId: 'search_0001',
      conversationId,
      query: ' шампунь ',
      source_revision: sourceRevision,
    });
    expect(h.orchestrator.conversationRead).toHaveBeenCalledWith(
      expect.any(Object),
      'inventory.goods.search',
      expect.any(String),
      expect.any(String),
      expect.any(Function),
      expect.any(Function),
    );
    expect(h.orchestrator.finishConversationReads).toHaveBeenCalledTimes(1);
    expect(answer.result).toEqual(result);
    expect(JSON.stringify(answer)).not.toMatch(/PRIVATE_EXECUTION|DROPPED/);
    expect(h.runtime.execute.mock.calls[0][3]).toMatchObject({
      suppressWidgetTrigger: true,
    });
    await expect(
      h.controller.search(user, {
        requestId: 'search_0001',
        conversationId,
        query: 'другой',
        source_revision: sourceRevision,
      }),
    ).rejects.toThrow('user_turn_replay_conflict');
    expect(h.runtime.execute).toHaveBeenCalledTimes(1);
  });

  it('uses the C9 replay owner callback and refuses stale data rather than emitting candidate facts', async () => {
    const h = setup();
    h.orchestrator.conversationRead.mockImplementation((...args: unknown[]) =>
      (args[5] as (id: string) => Promise<unknown>)('saved-execution'),
    );
    h.runtime.replayCompletedRead.mockResolvedValue({
      status: 'completed',
      stale: true,
      result: {},
    });
    await expect(
      h.controller.search(user, {
        requestId: 'search_0001',
        conversationId,
        query: 'товар',
        source_revision: sourceRevision,
      }),
    ).rejects.toThrow('goods_photo_source_projection_unavailable');
    expect(h.runtime.execute).not.toHaveBeenCalled();
    expect(h.runtime.replayCompletedRead).toHaveBeenCalledTimes(1);
    expect(h.timeline.persistAssistantReply).not.toHaveBeenCalled();
  });

  it('reads only explicitly selected item and preserves distinct price/unit/stock meanings', async () => {
    const h = setup();
    const result = observedGoodsItem(
      [
        {
          good_id: 123,
          title: 'Товар',
          cost: '100',
          actual_cost: '40',
          unit_actual_cost: '4',
          unit_id: 11,
          service_unit_id: 22,
          actual_amounts: [{ storage_id: 9, amount: '1.25' }],
        },
      ],
      '123',
      '5',
      'RUB',
    );
    h.runtime.execute.mockResolvedValue({ status: 'completed', result });
    const answer = await h.controller.item(user, {
      requestId: 'item_000001',
      conversationId,
      goods_id: '123',
      source_revision: sourceRevision,
    });
    expect(answer.result).toEqual(result);
    expect(h.runtime.execute.mock.calls[0][1]).toBe('inventory.goods.read');
    expect(h.runtime.execute.mock.calls[0][2].arguments).toEqual({
      goods_id: '123',
    });
    expect(answer.reply).toContain(
      'закупочную цену накладной укажите отдельно',
    );
  });

  it.each(['search', 'item', 'review'])(
    'rejects changed cross-step source before %s turn or runtime work',
    async (action) => {
      const h = setup();
      h.photos.sourceIdentity.mockImplementation(
        (_user: unknown, _tool: string, expected: string) => {
          expect(expected).toBe(sourceRevision);
          return Promise.reject(new ConflictException('goods_source_changed'));
        },
      );
      const read =
        action === 'search'
          ? h.controller.search(user, {
              requestId: 'search_0001',
              conversationId,
              query: 'шампунь',
              source_revision: sourceRevision,
            })
          : action === 'item'
            ? h.controller.item(user, {
                requestId: 'item_000001',
                conversationId,
                goods_id: '123',
                source_revision: sourceRevision,
              })
            : h.controller.review(user, body());
      await expect(read).rejects.toThrow('goods_source_changed');
      expect(h.timeline.persistTypedTurn).not.toHaveBeenCalled();
      expect(h.runtime.execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    proposal(),
    { ...body(), tenantId: 'foreign' },
    { ...body(), proposal: { ...proposal(), company_id: '5' } },
    { ...body(), conversationId: 'not-a-uuid' },
    { ...body(), requestId: 'short' },
  ])(
    'rejects old flat/arbitrary/authority-shaped transport before persistence',
    async (input) => {
      const h = setup();
      await expect(h.controller.review(user, input)).rejects.toThrow();
      expect(h.timeline.persistTypedTurn).not.toHaveBeenCalled();
      expect(h.runtime.execute).not.toHaveBeenCalled();
    },
  );
});
