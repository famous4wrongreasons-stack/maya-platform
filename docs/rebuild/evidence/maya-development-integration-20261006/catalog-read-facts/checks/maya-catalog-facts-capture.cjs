const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require(path.join(process.cwd(), 'node_modules/ts-node/register/transpile-only'));
const { AiCoreModelService } = require(path.join(process.cwd(), 'src/ai-tools/ai-core-model.service'));
const { observedServiceCatalog } = require(path.join(process.cwd(), 'src/crm/service-catalog-read'));
const values = { AI_CORE_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'synthetic-catalog-test-key', DEEPSEEK_BASE_URL: 'https://catalog-model.example.test' };
let calls = 0, body;
global.fetch = async (url, init) => {
  assert.equal(url, 'https://catalog-model.example.test/chat/completions');
  calls++;
  body = JSON.parse(init.body);
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Доступна часть каталога.' } }], usage: {} }));
};
(async () => {
 const catalog = observedServiceCatalog(Array.from({ length: 201 }, (_, i) => ({ id: `service-${i+1}`, name: `Synthetic service ${i+1}`, price: 100, duration_minutes: 30, currency: 'RUB' })), 'internal_calendar');
 await new AiCoreModelService({ get: name => values[name] }).decide({ surface: 'native', persona: 'director', messages: [{ role: 'user', content: 'Покажи услуги' }], tools: [], toolResults: [{ name: 'catalog.services.read', result: catalog }], allowToolCall: false, requiredToolNames: [] });
 assert.equal(calls, 1);
 const result = JSON.parse(body.messages[1].content).tool_results[0].result;
 assert.equal(result.services.length, 200);
 assert.equal(result.catalog_exhaustive, false);
 assert.equal(JSON.stringify(body).includes(values.DEEPSEEK_API_KEY), false);
 fs.writeFileSync('/tmp/maya-catalog-facts-serialized-body.json', JSON.stringify(body, null, 2)+'\n');
 fs.writeFileSync('/tmp/maya-catalog-facts-serialization-observation.json', JSON.stringify({ codeHead: '8b5efd50f3505112eb1fae71e452a8a9458e1680', sourceRows: catalog.services.length, serializedRows: result.services.length, catalogExhaustive: result.catalog_exhaustive, callsIntercepted: calls, externalCalls: 0, scriptedModelReply: true, realModelAcceptance: false }, null, 2)+'\n');
 console.log('PASS: 201 source rows; 200 serialized; exhaustive false; one intercepted request; zero external calls.');
})().catch(error => { console.error(error); process.exitCode=1; });
