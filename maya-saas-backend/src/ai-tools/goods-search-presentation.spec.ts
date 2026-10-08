import { goodsSearchReply } from './goods-search-presentation';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { c9Capability } from '../orchestration/c9.registry';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';

const result = () => ({
  contract: 'maya.goods-search.read/1',
  source: 'external_crm',
  scope: 'bounded_goods_and_categories_search',
  as_of: '2026-10-08T12:00:00Z',
  company_id: '5',
  query: 'шампунь',
  limit: 20,
  exhaustive: false,
  may_have_more: false,
  rows: [
    { kind: 'category', id: '41', title: 'Уход' },
    { kind: 'item', id: '123', title: 'Шампунь' },
    { kind: 'item', id: '124', title: 'Шампунь большой' },
  ],
});
describe('goods search source reply and finite READ admission', () => {
  it('shows matches and separates categories without selecting, pricing or counting the whole catalog', () => {
    const answer = goodsSearchReply({
      ...result(),
      price: '999',
      stock: '777',
      meta: { count: 888 },
    });
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('Товар №123: Шампунь');
    expect(answer.reply).toContain('Товар №124: Шампунь большой');
    expect(answer.reply).toContain('Категории:\n• Уход');
    expect(answer.reply).toContain('Товар ещё не выбран');
    expect(answer.reply).toContain('Это не полный каталог');
    expect(answer.reply).not.toMatch(/999|777|888|Товар №41/);
  });
  it.each([{ rows: [] }, { rows: [result().rows[0]] }])(
    'does not turn empty or category-only search into goods absence',
    ({ rows }) => {
      const answer = goodsSearchReply({ ...result(), rows });
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain('не подтверждает его отсутствие');
      expect(answer.reply).not.toContain('Товар №');
    },
  );
  it.each([
    { contract: 'legacy' },
    { exhaustive: true },
    { as_of: 'invalid' },
    { company_id: '5e0' },
    { query: '' },
    { query: 'x'.repeat(101) },
    { query: 'bad\nquery' },
    { may_have_more: true },
    { rows: [result().rows[1], result().rows[1]] },
    { rows: [{ kind: 'item', id: '0', title: 'bad' }] },
    { rows: [{ kind: 'other', id: '1', title: 'bad' }] },
    { rows: [{ kind: 'item', id: '1', title: ' '.repeat(5) }] },
    {
      rows: Array.from({ length: 21 }, (_, i) => ({
        kind: 'item',
        id: String(i + 1),
        title: 'item',
      })),
    },
  ])('blocks malformed or inconsistent result %j', (patch) => {
    expect(goodsSearchReply({ ...result(), ...patch }).status).toBe('blocked');
  });
  it('blocks stale receipts before returning source titles', () => {
    const answer = goodsSearchReply(result(), true);
    expect(answer.status).toBe('blocked');
    expect(answer.reply).not.toContain('Шампунь большой');
  });
  it('bounds total output while declaring the sentinel limit', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      kind: 'item',
      id: String(i + 1),
      title: 'x'.repeat(512),
    }));
    const answer = goodsSearchReply({ ...result(), rows, may_have_more: true });
    expect(answer.status).toBe('verified');
    expect(answer.reply.match(/Товар №/g)).toHaveLength(20);
    expect(answer.reply).toContain('Показаны первые 20 совпадений');
    expect(answer.reply.length).toBeLessThan(4000);
  });
  it('registers a single owner READ and semantic product slot, not an action', () => {
    const tools = new AiToolRegistryService();
    const definition = tools.get('inventory.goods.search');
    expect(definition.allowedRoles).toEqual([
      UserRole.TENANT_OWNER,
      UserRole.BUSINESS_OWNER,
    ]);
    expect(definition.riskTier).toBe('read');
    expect(definition.approvalPolicy).toBe('none');
    expect(c9Capability('inventory.goods.search', 'ADMIN').mode).toBe('READ');
    expect(
      tools.validateArguments('inventory.goods.search', {
        query: '  шампунь  ',
      }),
    ).toEqual({ query: 'шампунь' });
    expect(() =>
      tools.validateArguments('inventory.goods.search', {
        query: 'шампунь',
        company_id: '6',
      }),
    ).toThrow();
    const plan = new ConversationIntelligenceService().validatePlan(
      {
        tasks: [
          {
            intent: 'inventory.goods_search',
            entities: { product: 'шампунь' },
            confidence: 1,
          },
        ],
        parent_request: 'Найди шампунь',
      },
      UserRole.TENANT_OWNER,
      ['inventory.goods.search'],
    );
    expect(JSON.stringify(plan)).toContain('inventory.goods_search');
  });
});
