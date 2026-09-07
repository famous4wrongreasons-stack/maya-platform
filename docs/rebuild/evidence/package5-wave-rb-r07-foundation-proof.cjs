/* Run existing B35/P405 synthetic proofs against the exact newly owned R-B DB.
 * The historical scripts retain their original safety guards in Git. Only the
 * disposable-database predicate is changed in memory. P405's historical fixture
 * also receives the three already-required immutable offer references missing
 * from that older script. Runtime imports/assertions remain unchanged. Never
 * imports a production application bootstrap.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '../../..');
const backend = path.join(repo, 'maya-saas-backend');
const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55508');
assert.equal(url.username, 'maya_rb');
assert.equal(url.pathname, '/maya_rb_r07');
const mode = process.argv[2];
assert(['b35', 'b35-resume', 'p405'].includes(mode));
const name = mode === 'p405'
  ? 'p4-05-all8-executable-proof.ts'
  : 'package5-b35-runtime-proof.ts';
const filename = path.join(backend, 'scripts', name);
const original = fs.readFileSync(filename, 'utf8');
let source = original;
if (mode === 'p405') {
  const guard = "!database.startsWith('maya_c06_p405_all8_')";
  assert.equal(source.split(guard).length, 2);
  source = source.replace(guard, "database !== 'maya_rb_r07'");
  const functions = ['purchaseInput', 'activationInput', 'renewalInput', 'renewalActivationInput'];
  for (const name of functions) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0);
    const end = source.indexOf('\nfunction ', start + 1);
    assert(end > start);
    const body = source.slice(start, end);
    const marker = '    offerCode: OFFER.offerCode,';
    assert.equal(body.split(marker).length, 2);
    const updated = body.replace(marker, [
      "    canonicalOfferId: 'p405-fixture-offer',",
      "    offerValueVersionId: 'p405-fixture-offer-version',",
      "    offerValueSnapshotHash: hash(['p405-fixture-offer-version', input.tenantId]),",
      marker,
    ].join('\n'));
    source = source.slice(0, start) + updated + source.slice(end);
  }
} else {
  for (const [before, after] of [
    ["assert.equal(url.port, '55505');", "assert.equal(url.port, '55508');"],
    ["assert.equal(url.pathname, '/maya_b35_runtime');", "assert.equal(url.pathname, '/maya_rb_r07');"],
  ]) {
    assert.equal(source.split(before).length, 2);
    source = source.replace(before, after);
  }
}
if (mode === 'b35-resume') {
  assert(process.argv[3], 'owned restart fixture path required');
  process.argv = [process.argv[0], filename, '--after-restart', process.argv[3]];
} else {
  process.argv = [process.argv[0], filename];
}
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.scripts.json');
require(path.join(backend, 'node_modules/ts-node')).register({
  transpileOnly: true,
  project: process.env.TS_NODE_PROJECT,
});
const ts = require(path.join(backend, 'node_modules/typescript'));
const output = ts.transpileModule(source, {
  fileName: filename,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
  },
}).outputText;
console.log(JSON.stringify({
  foundation: name,
  originalSourceSha256: crypto.createHash('sha256').update(original).digest('hex'),
  adaptation: mode === 'p405'
    ? 'exact owned DB; four fixture builders include required immutable offer refs; original assertions/runtime unchanged'
    : 'exact owned disposable DB only; original assertions/runtime unchanged',
  processId: process.pid,
  productionMutationsMessages: 0,
}));
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(output, filename);
