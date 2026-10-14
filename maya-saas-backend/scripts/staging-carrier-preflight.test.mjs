import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertStagingCarrierConfiguration, preflight } from './staging-carrier-preflight.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, dump } = createRequire(import.meta.url)('js-yaml');
const compose = fs.readFileSync(path.join(backend, 'compose.staging.yml'), 'utf8');
const caddy = fs.readFileSync(path.join(backend, 'deploy/staging/Caddyfile'));
test('current selector and fresh actual React/PWA/Capacitor bytes pass', () => {
  assert.equal(preflight().scope, 'selector-and-payload');
});
for (const [name, edit] of [
  ['legacy website root', c => c.services.gateway.volumes[1] = '../сайт и приложение:/srv/maya:ro'],
  ['headless shell', c => c.services.gateway.volumes[1] = '../maya-chat-shell/dist/web:/srv/maya:ro'],
  ['native endpoint bytes', c => c.services.gateway.volumes[1] = '../maya-carrier-react/dist/capacitor:/srv/maya:ro'],
  ['legacy icon overlay', c => c.services.gateway.volumes.push('../сайт и приложение/pwa-assets/for-app:/srv/maya/icons:ro')],
  ['historical callback instead of current owner', c => c.services.gateway.volumes[2] = '../сайт и приложение/oauth-callback.html:/srv/maya-callback/oauth-callback.html:ro'],
  ['missing callback', c => c.services.gateway.volumes.splice(2, 1)],
  ['environment-selected root', c => c.services.gateway.volumes[1] = '${PAYLOAD}:/srv/maya:ro'],
  ['writable payload', c => c.services.gateway.volumes[1] = '../maya-carrier-react/dist/web:/srv/maya'],
  ['alternate startup', c => c.services.gateway.command = 'file-server --root /legacy'],
  ['external compose include', c => c.include = ['other.yml']],
]) test('refuses '+name, () => {
  const changed = load(compose); edit(changed);
  assert.throws(() => assertStagingCarrierConfiguration(dump(changed), caddy));
});
for (const [name, from, to] of [
  ['old fallback', '/index.html', '/app.html'],
  ['different root', '/srv/maya', '/srv/old'],
  ['lost API owner', 'backend:3000', 'legacy:8000'],
  ['raw access logging', '# No request/access log: OAuth query values must not enter a gateway receipt.', 'log'],
]) test('refuses '+name, () => {
  assert.ok(caddy.toString().includes(from));
  assert.throws(() => assertStagingCarrierConfiguration(compose, Buffer.from(caddy.toString().replace(from, to))));
});
test('staging-up refuses the historical selector before build, Docker or database', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-staging-selector-'));
  try {
    fs.mkdirSync(path.join(scratch, 'scripts'));
    fs.mkdirSync(path.join(scratch, 'deploy/staging'), { recursive: true });
    fs.mkdirSync(path.join(scratch, 'deploy/platform/beget-edge'), { recursive: true });
    fs.mkdirSync(path.join(scratch, 'bin'));
    fs.symlinkSync(path.join(backend, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
    for (const name of ['staging-up.sh', 'staging-carrier-preflight.mjs'])
      fs.copyFileSync(path.join(backend, 'scripts', name), path.join(scratch, 'scripts', name));
    fs.writeFileSync(path.join(scratch, '.env.staging'), '# Synthetic empty file. No credential.\n');
    fs.writeFileSync(path.join(scratch, 'compose.staging.yml'), compose.replace('../maya-carrier-react/dist/web', '../сайт и приложение'));
    fs.writeFileSync(path.join(scratch, 'deploy/staging/Caddyfile'), caddy);
    fs.copyFileSync(path.join(backend, 'deploy/platform/beget-edge/oauth-callback.html'), path.join(scratch, 'deploy/platform/beget-edge/oauth-callback.html'));
    const marker = path.join(scratch, 'forbidden-command');
    for (const executable of ['docker', 'npm']) fs.writeFileSync(path.join(scratch, 'bin', executable),
      '#!/bin/sh\nprintf attempted > "'+marker+'"\nexit 99\n', { mode: 0o700 });
    const run = spawnSync('/bin/bash', [path.join(scratch, 'scripts/staging-up.sh')], {
      cwd: scratch, encoding: 'utf8', timeout: 10000,
      env: { PATH: path.join(scratch, 'bin')+':'+path.dirname(process.execPath)+':/usr/bin:/bin' },
    });
    assert.notEqual(run.status, 0); assert.match(run.stderr, /STAGING CARRIER REFUSED/);
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
test('bootstrap selects the React root; packaging admission precedes Docker', () => {
  const bootstrap = fs.readFileSync(path.join(backend, 'scripts/bootstrap-staging-env.sh'), 'utf8');
  assert.ok(bootstrap.includes('replace_env PWA_PUBLIC_APP_URL "https://${HOST}/"'));
  assert.ok(!bootstrap.includes('/app.html'));
  const up = fs.readFileSync(path.join(backend, 'scripts/staging-up.sh'), 'utf8');
  const selector = up.indexOf('node scripts/staging-carrier-preflight.mjs --configuration-only');
  const build = up.indexOf('node ../maya-carrier-react/tools/release.mjs build');
  const verify = up.indexOf('node scripts/staging-carrier-preflight.mjs\n');
  const start = up.indexOf('docker compose');
  assert.ok(selector >= 0 && selector < build && build < verify && verify < start);
});
