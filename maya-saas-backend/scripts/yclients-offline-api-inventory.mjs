// Offline documentation inventory, not a dispatcher or capability registration.
// node scripts/yclients-offline-api-inventory.mjs <saved-openapi.json> <output.json>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [input, output] = process.argv.slice(2);
assert.ok(input && output, 'saved OpenAPI input and inventory output are required');
const raw = readFileSync(input);
const api = JSON.parse(raw);
assert.equal(api.openapi, '3.0.3');
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const excluded = new Set(['Интеграция с сетевой телефонией', 'Фискализация чеков', 'ККМ транзакции', 'Z-Отчет', 'Чаевые']);
const messaging = new Set(['SMS рассылка', 'Email рассылка', 'Отправка СМС через операторов']);
const core = new Set(['Услуги', 'Категория услуг', 'Сотрудники', 'График работы сотрудника', 'Должности', 'Товары', 'Категории товаров', 'Документы складских операций', 'Товарные транзакции', 'Складские операции', 'Склады', 'Клиенты', 'Сетевые клиенты', 'Записи', 'Визиты', 'Онлайн-запись', 'Аналитика', 'Финансовые транзакции', 'Лист ожидания', 'Компании', 'Лояльность', 'Карты лояльности', 'Применение лояльности в визите', 'Абонементы', 'Типы абонементов', 'Сертификаты']);
const known = {
  'GET /api/v1/goods/{company_id}/{good_id}': ['internal_read_port_local_tested', 'MAYA-YCLIENTS-GOODS-READ-CHECKPOINT-20261007.md'],
  'GET /api/v1/book_services/{company_id}': ['bounded_catalog_read_local_tested', 'MAYA-CATALOG-READ-FACTS-CHECKPOINT-20261007.md'],
  'GET /api/v1/company/{company_id}/services/{service_id}': ['existing_pricing_lane_read', 'MAYA-FINAL-COMPLETION-MAP.md#yclients-fixed-service-price--isolated-local-backend-candidate-2026-10-06-utc'],
  'PATCH /api/v1/company/{company_id}/services/{service_id}': ['existing_fixed_price_ae_lane', 'MAYA-FINAL-COMPLETION-MAP.md#yclients-pricing--repaired-local-browser-ui-2026-10-06-1807-utc'],
};
function scope(tags, method) {
  if (tags.some((t) => excluded.has(t))) return 'excluded_current_product';
  if (tags.some((t) => messaging.has(t))) return 'deferred_external_messaging';
  if (tags.includes('Расчёт зарплат')) return method === 'GET' ? 'bounded_personal_income_read_mapping' : 'excluded_full_payroll';
  if (tags.some((t) => core.has(t))) return 'approved_domain_bounded_mapping';
  return 'technical_domain_mapping_pending';
}
const operations = [];
for (const [path, item] of Object.entries(api.paths)) {
  for (const [method, spec] of Object.entries(item)) {
    if (!methods.has(method.toLowerCase())) continue;
    const verb = method.toUpperCase(), id = `${verb} ${path}`;
    const tags = [...(spec.tags || [])];
    operations.push({
      id, method: verb, path, tags, deprecated: spec.deprecated === true,
      documentation: 'present_in_captured_openapi',
      productScope: scope(tags, verb),
      implementation: known[id]?.[0] || 'not_mapped_by_this_inventory',
      evidence: known[id]?.[1] || null,
      integrationPermission: 'not_observed',
      providerAcceptance: 'not_executed',
      mutationAdmission: verb === 'GET' || verb === 'HEAD' ? 'read_still_requires_current_rights' : 'not_granted_by_documentation',
    });
  }
}
operations.sort((a, b) => a.id.localeCompare(b.id, 'en'));
assert.equal(new Set(operations.map((o) => o.id)).size, operations.length);
assert.ok(Object.keys(known).every((id) => operations.some((o) => o.id === id)), 'evidence mapping must identify a captured operation');
const count = (key) => operations.reduce((acc, o) => { acc[o[key]] = (acc[o[key]] || 0) + 1; return acc; }, {});
writeFileSync(output, JSON.stringify({
  contract: 'maya.yclients.offline-api-inventory/1',
  source: 'https://developers.yclients.com/ru/', capturedOn: '2026-10-07',
  sourceSha256: createHash('sha256').update(raw).digest('hex'), openapi: api.openapi,
  operationCount: operations.length, byMethod: count('method'), byScope: count('productScope'),
  meaning: {
    coverage: 'Every HTTP operation in the saved public OpenAPI, preserving query-template paths. Completeness is relative to this capture, not all undocumented provider capabilities.',
    scope: 'Engineering triage under docs/product/README.md. Approved domain is not approval of every operation, production effect or identity/retention change. Mapping pending is engineering work, not an owner decision.',
    implementation: 'Only named evidence links are mapped here. Unmapped does not mean absent, unsupported or failed. This inventory is not a new runtime registry.',
    permissions: 'No integration credentials or API business calls used; insufficient rights and unsupported API cannot be concluded.',
    exclusion: 'Excluded/deferred product operations remain inventoried. Legacy implemented code is not removed.',
  },
  operations,
}, null, 2) + '\n');
console.log(JSON.stringify({ operationCount: operations.length, byMethod: count('method'), byScope: count('productScope') }));
