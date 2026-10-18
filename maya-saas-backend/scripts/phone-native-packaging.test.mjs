import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeExecutionPackaging,
  verifyNativeExecutionPackaging,
} from './phone-native-packaging.mjs';
function input() {
  const candidateSha = 'a'.repeat(40);
  return {
    candidateSha,
    imageDigest: 'sha256:' + 'b'.repeat(64),
    runId: 'synthetic-run',
    installedDigests: Object.fromEntries(
      [
        'authorization',
        'pricing',
        'session',
        'scope',
        'modelCredential',
        'partnerCredential',
      ].map((n) => [n, 'c'.repeat(64)]),
    ),
    canonicalReadonly: {
      name: 'maya-phone-staging',
      services: {
        backend: {
          image: 'maya-phone-backend:' + candidateSha,
          entrypoint: ['node', '--enable-source-maps', '/app/dist/src/main.js'],
          command: [],
          networks: ['private', 'catalog_private'],
          volumes: ['staging_uploads:/app/uploads'],
        },
        postgres: { networks: ['private'], unchanged: 'database' },
        gateway: { networks: ['private', 'edge'], unchanged: 'carrier' },
        'catalog-egress': { old: 'finite-catalogue' },
      },
      networks: {
        private: { internal: true },
        catalog_private: { internal: true },
        edge: {},
      },
      volumes: { db: null },
    },
  };
}
test('only pull-only forwarder gets external network; ordinary backend and database remain private', () => {
  const i = input(),
    p = nativeExecutionPackaging(i),
    b = p.compose.services.backend,
    f = p.compose.services['native-forwarder'];
  verifyNativeExecutionPackaging(p, i);
  assert(b.networks.every((n) => p.compose.networks[n].internal));
  assert.deepEqual(f.networks, ['edge']);
  assert.equal(f.ports, undefined);
  assert.equal(f.env_file, undefined);
  assert.equal(f.image, b.image);
  assert(b.image.includes('@sha256:'));
  assert.equal(b.restart, 'no');
  assert.deepEqual(b.command, []);
  for (const n of ['postgres', 'gateway'])
    assert.deepEqual(p.compose.services[n], i.canonicalReadonly.services[n]);
  assert.equal(p.compose.services['catalog-egress'], undefined);
  assert.equal(p.readyForExecution, false);
  assert.equal(
    f.volumes.some(
      (x) => x.includes('modelCredential') || x.includes('partnerCredential'),
    ),
    false,
  );
});
for (const [name, edit] of [
  [
    'old wrapper',
    (i) =>
      (i.canonicalReadonly.services.backend.entrypoint = [
        'node',
        '/app/scripts/phone-ai-entry.mjs',
      ]),
  ],
  [
    'backend edge',
    (i) => i.canonicalReadonly.services.backend.networks.push('edge'),
  ],
  [
    'nonprivate database network',
    (i) => (i.canonicalReadonly.networks.private.internal = false),
  ],
  ['extra relay', (i) => (i.canonicalReadonly.services['model-egress'] = {})],
  [
    'host networking',
    (i) => (i.canonicalReadonly.services.backend.network_mode = 'host'),
  ],
  [
    'privileged backend',
    (i) => (i.canonicalReadonly.services.backend.privileged = true),
  ],
  ['mutable image', (i) => (i.imageDigest = 'latest')],
  [
    'missing credential pin',
    (i) => delete i.installedDigests.partnerCredential,
  ],
  ['caller file path', (i) => (i.runId = '../escape')],
])
  test('network packaging refuses ' + name, () => {
    const i = input();
    edit(i);
    assert.throws(() => nativeExecutionPackaging(i));
  });
test('post-generation backend escape cannot pass parity validation', () => {
  const i = input(),
    p = nativeExecutionPackaging(i);
  p.compose.services.backend.networks.push('edge');
  assert.throws(() => verifyNativeExecutionPackaging(p, i));
});
