// Local browser proof support, not a shipped server. Serves the actual built React tree and
// forwards /api to the owned AppModule listener using the existing relay, never a response fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createDevServer, cspSplitProblems, HEADER_CSP } from '../../maya-chat-shell/dev/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.equal(args.length, 1, 'pass only --run-dir=<owned output/playwright/service-price-live-ID>');
assert.ok(args[0].startsWith('--run-dir='), 'run directory must be explicit');
const runDir = path.resolve(args[0].slice('--run-dir='.length));
assert.equal(path.dirname(runDir), path.join(root, 'output/playwright'));
assert.match(path.basename(runDir), /^service-price-live-[a-zA-Z0-9_-]+$/);
assert.equal(fs.realpathSync(runDir), runDir, 'run directory must not redirect through a symlink');
assert.equal(fs.existsSync(path.join(runDir, 'carrier-ready.json')), false, 'use a fresh run directory');
const ready = JSON.parse(fs.readFileSync(path.join(runDir, 'ready.json'), 'utf8'));
assert.equal(ready.contract, 'maya.service-price-browser-harness/1');
const api = new URL(ready.api_origin);
assert.equal(api.protocol, 'http:');
assert.equal(api.hostname, '127.0.0.1');
assert.ok(api.port && !['5432', '55611', '56347', '56541'].includes(api.port));
assert.equal(api.pathname, '/');
assert.equal(api.search + api.hash + api.username + api.password, '');

const webRoot = path.join(root, 'maya-carrier-react/dist/web');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
assert.deepEqual(cspSplitProblems(HEADER_CSP, html), [], 'serve the unmodified built CSP');
const files = [];
function inventory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    assert.equal(entry.isSymbolicLink(), false, 'built tree may not redirect');
    if (entry.isDirectory()) inventory(file);
    else files.push({ path: path.relative(webRoot, file), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  }
}
inventory(webRoot);
const relay = createDevServer({
  root: webRoot,
  api: `${api.origin}/api`,
  upstreamPorts: [api.port],
  log: line => fs.appendFileSync(path.join(runDir, 'relay.log'), `${new Date().toISOString()} ${line}\n`),
});
const { port } = await relay.listen(56541);
fs.writeFileSync(path.join(runDir, 'carrier-ready.json'), JSON.stringify({
  contract: 'maya.service-price-browser-carrier/1',
  origin: `http://127.0.0.1:${port}`,
  api_origin: api.origin,
  mock_responses: false,
  static_root: webRoot,
  served_files: files.sort((a, b) => a.path.localeCompare(b.path)),
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Pricing browser carrier ready at http://127.0.0.1:${port}; actual API ${api.origin}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await relay.close();
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
