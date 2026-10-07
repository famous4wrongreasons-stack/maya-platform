/** Offline verification only. Supply the previously captured official JSON file.
 * No fetch, credentials, business endpoint or fixture rewrite. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const capturePath = process.argv[2];
if (!capturePath) throw new Error('usage: node scripts/verify-goods-receipt-openapi.mjs <official-capture.json>');
const bytes = readFileSync(capturePath);
const source = JSON.parse(bytes.toString('utf8'));
const fixture = JSON.parse(readFileSync(new URL('../src/crm/fixtures/yclients-receipt-openapi-20261007.json', import.meta.url), 'utf8'));
if (createHash('sha256').update(bytes).digest('hex') !== fixture.sourceSha256) throw new Error('official_capture_hash_mismatch');
function withoutExamples(value) {
  if (Array.isArray(value)) return value.map(withoutExamples);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'example' && key !== 'examples')
    .map(([key, item]) => [key, withoutExamples(item)]));
  return value;
}
let methods = 0;
for (const [path, operations] of Object.entries(fixture.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    if (!isDeepStrictEqual(operation, withoutExamples(source.paths[path]?.[method]))) throw new Error(`method_mismatch:${method}:${path}`);
    methods++;
  }
}
for (const [name, schema] of Object.entries(fixture.schemas)) {
  if (!isDeepStrictEqual(schema, withoutExamples(source.components.schemas[name]))) throw new Error(`schema_mismatch:${name}`);
}
const permissions = source.components.schemas.user_permissions_response_data_types.properties.data.properties.storages;
if (!isDeepStrictEqual(fixture.storagePermissions, withoutExamples(permissions))) throw new Error('permissions_mismatch');
if (source.openapi !== fixture.openapi || methods !== 6 || Object.keys(fixture.schemas).length !== 6) throw new Error('selection_mismatch');
console.log(JSON.stringify({ status: 'PASS_OFFLINE_SOURCE_PRESERVATION', sourceSha256: fixture.sourceSha256, methods, schemas: 6, storagePermissions: true, networkCalls: 0 }));
