// Synthetic source-shaped fixtures only. No real parser, provider or model acceptance.
import fs from 'node:fs';
export const conversationId = 'd4325f49-5d17-44e3-9f93-7df35d468b83';
export const turnId = '2333be6e-bca6-4df0-8405-9b88e9a8da59';
export const sourceRevision = 'b'.repeat(64), photoSha256 = 'a'.repeat(64);
export const context = { requestId: 'photo_request_01', conversationId, source_revision: sourceRevision };
export const turn = { conversationId, user_turn: { turnId, conversationId }, user_text: 'Проверить выбранный товар.', reply: 'Данные товара получены.' };
export const preview = () => ({ contract: 'maya.goods-photo.preview/1', photo_sha256: photoSha256, source_revision: sourceRevision, recognition_acceptance: 'NOT_ACCEPTED', review_required: true, original_stored: false, persistent_draft: false, lines: [{ source_line: 1, name: 'Шампунь', quantity: '2.500', unit_label: 'шт', unit_price: '999.00', line_total: '2497.50', price_kind: 'sale_unit', parser_confidence: 0.4, review_required: true }] });
export const search = () => ({ ...turn, user_turn: { ...turn.user_turn }, source_revision: sourceRevision, contract: 'maya.goods-photo.search/1', result: { contract: 'maya.goods-search.read/1', source: 'external_crm', scope: 'bounded_goods_and_categories_search', as_of: '2026-10-08T10:00:00Z', company_id: '100', query: 'шампунь', limit: 20, may_have_more: true, exhaustive: false, rows: [{ kind: 'category', id: '11', title: 'Категория' }, { kind: 'item', id: '22', title: 'Шампунь' }], limitations: [] } });
export const item = () => ({ ...turn, user_turn: { ...turn.user_turn }, source_revision: sourceRevision, contract: 'maya.goods-photo.item/1', result: { contract: 'maya.goods-item.read/2', source: 'external_crm', scope: 'single_catalog_item', as_of: '2026-10-08T10:00:00Z', company_id: '100', currency: 'RUB', currency_source: 'tenant_setting', item_kind: 'physical', item: { id: '22', name: 'Шампунь', article: null, barcode: null, sale_price: '999.00', cost_price: '300.00', unit_cost_price: '123.00', sale_unit_id: '1', sale_unit_label: 'шт', write_off_unit_id: '2', write_off_unit_label: 'мл', unit_ratio: '250.00' }, stock: { status: 'observed', rows: [{ store_id: '3', quantity: '-2.5' }], unit_basis: 'not_provided', exhaustive: false }, limitations: [] } });
export const proposal = () => ({ goods_id: '22', store_id: '3', quantity: '1.250', unit_id: '1', unit_cost: '12.30', currency: 'RUB', price_kind: 'receipt_purchase_unit', received_at: '2026-10-08T10:00:00+03:00', photo_sha256: photoSha256, source_line: 1, review_version: 1 });
export const review = () => {
  const envelope = JSON.parse(fs.readFileSync(new URL('../dev/fixtures/envelopes/h7/invariant/kind-APPROVAL.json', import.meta.url), 'utf8'));
  // Actual certified envelope schema. Goods presenter correlates its assistant execution turn,
  // deliberately distinct from the parent user turn. This is a projection fixture, not a seal proof.
  envelope.source.capability = 'inventory.goods.receipt.prepare';
  envelope.correlation.turn_id = '1006c645-3a22-48fb-a6af-9fcf9e9b5466';
  return { ...turn, user_turn: { ...turn.user_turn }, contract: 'maya.goods-photo.review/1', status: 'approval_required', resolution: { matched: true, receipt: { widget_id: envelope.widget_id, envelope_seal: envelope.integrity.envelope_seal, envelope }, dismiss_widget_id: null } };
};
