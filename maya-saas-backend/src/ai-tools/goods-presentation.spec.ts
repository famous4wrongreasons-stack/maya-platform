import { observedGoodsItem } from '../crm/yclients-goods-read';
import { ActionCapabilityRegistry } from '../action-engine/action-engine.registry';
import { c9Capability } from '../orchestration/c9.registry';
import { AE_WIDGET_COMMIT_ALLOWLIST } from '../widgets/authority/ae-commit-allowlist.runtime';
import { AE_CAPABILITY_GAP_LEDGER } from '../widgets/authority/ae-capability-gap-ledger.runtime';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { goodsReadReply } from './goods-presentation';

describe('goods source reply and finite registrations', () => {
  it('keeps prices and fractional quantities separate without inventing a stock unit', () => {
    const r = goodsReadReply(
      observedGoodsItem(
        [
          {
            good_id: '1',
            title: 'Шампунь',
            cost: '20',
            actual_cost: '10',
            unit_actual_cost: '2',
            actual_amounts: [{ storage_id: '9', amount: '1.250' }],
          },
        ],
        '1',
        '5',
        null,
      ),
    );
    expect(r.status).toBe('verified');
    expect(r.reply).toContain('Продажная цена: 20 (валюта не подтверждена)');
    expect(r.reply).toContain('Склад 9: 1.250');
    expect(r.reply).toContain('Единица этих остатков в ответе не указана');
    expect(r.reply).not.toContain('RUB');
  });
  it('does not turn stale or legacy facts into a current answer', () => {
    expect(goodsReadReply({ contract: 'maya.goods-item.read/1' }).status).toBe(
      'blocked',
    );
    expect(
      goodsReadReply(
        { contract: 'maya.goods-item.read/2', item: { name: 'Товар' } },
        true,
      ).status,
    ).toBe('blocked');
  });
  it('registers one READ and one proposal with owner rights while preserving money widget refusal', () => {
    const tools = new AiToolRegistryService();
    expect(tools.get('inventory.goods.read').allowedRoles).toEqual([
      'tenant_owner',
      'business_owner',
    ]);
    expect(c9Capability('inventory.goods.read', 'ADMIN').mode).toBe('READ');
    expect(c9Capability('inventory.goods.receipt.prepare', 'ADMIN').mode).toBe(
      'PROPOSE_ONLY',
    );
    const cap = new ActionCapabilityRegistry().get(
      'crm.goods.receipt.create.v1',
    );
    expect(cap.riskFacets).toContain('financial');
    expect(AE_WIDGET_COMMIT_ALLOWLIST[cap.capability]).toBeUndefined();
    expect(AE_CAPABILITY_GAP_LEDGER[cap.capability]).toBeDefined();
  });
});
