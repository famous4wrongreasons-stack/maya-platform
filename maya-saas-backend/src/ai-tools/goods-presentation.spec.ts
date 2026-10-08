import { observedGoodsItem } from '../crm/yclients-goods-read';
import { ActionCapabilityRegistry } from '../action-engine/action-engine.registry';
import { c9Capability } from '../orchestration/c9.registry';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  MONEY,
} from '../widgets/authority/ae-commit-allowlist.runtime';
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
  it('registers one READ and one proposal with only the approved goods MONEY subtype', () => {
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
    expect(MONEY(cap)).toBe(true);
    expect(AE_WIDGET_COMMIT_ALLOWLIST[cap.capability]).toEqual({
      family: 'inventory_receipt_purchase_cost',
      confirmation_kind: 'APPROVAL',
      min_verification: 'SESSION_VERIFIED',
      requires_ae_approval: false,
      propose: { space: 'C9', key: 'inventory.goods.receipt.prepare' },
    });
    expect(AE_CAPABILITY_GAP_LEDGER[cap.capability]).toBeUndefined();
    expect(AE_WIDGET_COMMIT_ALLOWLIST['crm.visit.payment.v1']).toBeUndefined();
    expect(AE_CAPABILITY_GAP_LEDGER['crm.visit.payment.v1']).toBeDefined();
    expect(
      AE_WIDGET_COMMIT_ALLOWLIST['crm.goods.receipt.create.v2'],
    ).toBeUndefined();
  });
});
