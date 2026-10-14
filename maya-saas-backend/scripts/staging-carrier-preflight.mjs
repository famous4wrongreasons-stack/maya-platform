// Packaging only. Does not start Docker, connect to a database or admit a release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { load, JSON_SCHEMA } = require('js-yaml');
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// This finite gateway was exercised with Caddy, including its API/static routing.
// Any configuration change needs review and a new transport proof, not a regex waiver.
export const CADDY_SHA256 = '1eaf825be97da242af3ce54ce1ebe2fc2dfeb0c63c667601967b9e18e6d2e4b9';

export function assertStagingCarrierConfiguration(composeText, caddyBytes) {
  const compose = load(composeText, { schema: JSON_SCHEMA });
  assert.deepEqual(Object.keys(compose).sort(), ['name', 'networks', 'services', 'volumes']);
  const gateway = compose.services?.gateway;
  assert.deepEqual(gateway, {
    image: 'caddy:2-alpine',
    restart: 'unless-stopped',
    environment: { STAGING_HOST: '${STAGING_HOST:?STAGING_HOST is required}' },
    depends_on: { backend: { condition: 'service_healthy' } },
    ports: ['80:80', '443:443', '443:443/udp'],
    volumes: [
      './deploy/staging/Caddyfile:/etc/caddy/Caddyfile:ro',
      '../maya-carrier-react/dist/web:/srv/maya:ro',
      './deploy/platform/beget-edge/oauth-callback.html:/srv/maya-callback/oauth-callback.html:ro',
      'staging_caddy_data:/data',
      'staging_caddy_config:/config',
    ],
    networks: ['private'],
  }, 'staging gateway must select only the canonical React payload/configuration');
  assert.equal(createHash('sha256').update(caddyBytes).digest('hex'), CADDY_SHA256,
    'staging Caddy configuration changed: review and rerun the transport proof');
}

export function preflight({ directory = backend, configurationOnly = false } = {}) {
  const composePath = path.join(directory, 'compose.staging.yml');
  const caddyPath = path.join(directory, 'deploy/staging/Caddyfile');
  for (const filename of [composePath, caddyPath, path.join(directory, 'deploy/platform/beget-edge/oauth-callback.html')])
    assert.ok(fs.lstatSync(filename).isFile() && !fs.lstatSync(filename).isSymbolicLink(), 'configuration symlink refused');
  assertStagingCarrierConfiguration(fs.readFileSync(composePath, 'utf8'), fs.readFileSync(caddyPath));
  if (!configurationOnly) {
    // Reconstruct bytes from the canonical source, don't trust a supplied manifest.
    // verify does not repair a stale or replaced output.
    const carrier = path.resolve(directory, '../maya-carrier-react');
    const result = spawnSync(process.execPath, [path.join(carrier, 'tools/release.mjs'), 'verify'],
      { cwd: carrier, stdio: 'pipe', timeout: 120000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, 'canonical React build/parity verification failed');
  }
  return { status: 'PASS', scope: configurationOnly ? 'selector-only' : 'selector-and-payload',
    owner: 'React AChat', caddySha256: CADDY_SHA256, deploymentPerformed: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--configuration-only'), 'unknown argument');
    console.log(JSON.stringify(preflight({ configurationOnly: process.argv[2] === '--configuration-only' })));
  } catch {
    console.error('STAGING CARRIER REFUSED: configuration or canonical React bytes failed verification. No deployment performed.');
    process.exitCode = 1;
  }
}
