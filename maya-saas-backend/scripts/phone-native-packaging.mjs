// Offline fixed phone-test network overlay. No deployment, trust installation,
// signing, grant, mutable tag selection or migration execution.
import assert from 'node:assert/strict';
const root = '/srv/maya-phone-staging';
export function nativeExecutionPackaging({
  canonicalReadonly,
  candidateSha,
  imageDigest,
  runId,
  installedDigests,
}) {
  assert(
    /^[a-f0-9]{40}$/.test(candidateSha) &&
      /^sha256:[a-f0-9]{64}$/.test(imageDigest),
  );
  assert(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(runId));
  const names = [
    'authorization',
    'pricing',
    'session',
    'scope',
    'modelCredential',
    'partnerCredential',
  ];
  assert.deepEqual(Object.keys(installedDigests).sort(), names.sort());
  for (const value of Object.values(installedDigests))
    assert(/^[a-f0-9]{64}$/.test(value));
  const old = canonicalReadonly;
  assert.equal(old.name, 'maya-phone-staging');
  assert.deepEqual(Object.keys(old.services).sort(), [
    'backend',
    'catalog-egress',
    'gateway',
    'postgres',
  ]);
  const b = old.services.backend;
  assert.equal(b.image, 'maya-phone-backend:' + candidateSha);
  assert.deepEqual(b.entrypoint, [
    'node',
    '--enable-source-maps',
    '/app/dist/src/main.js',
  ]);
  assert.deepEqual(b.command, []);
  assert.deepEqual(b.networks, ['private', 'catalog_private']);
  assert(
    old.networks.private.internal &&
      old.networks.catalog_private.internal &&
      !old.networks.edge.internal,
  );
  assert.deepEqual(b.volumes, ['staging_uploads:/app/uploads']);
  assert(!b.privileged && !b.network_mode && !b.ports && !b.devices);
  const next = structuredClone(old),
    app = next.services.backend,
    base = root + '/native/' + runId,
    shared = base + '/ipc:/run/maya-native-ipc';
  const pinned = 'maya-phone-backend@' + imageDigest;
  app.image = pinned;
  app.entrypoint = ['node', '/app/scripts/phone-native-entry.mjs'];
  app.command = [];
  app.networks = ['private'];
  app.env_file = [base + '/backend.env'];
  app.environment = {
    MAYA_RELEASE: candidateSha,
    MAYA_NATIVE_EXECUTION_ENABLED: 'signed-phone-test',
    YCLIENTS_BASE_URL: 'https://api.yclients.com/api/v1',
    ...Object.fromEntries(
      names.map((n) => [
        'MAYA_NATIVE_' + n.toUpperCase() + '_SHA256',
        installedDigests[n],
      ]),
    ),
  };
  app.volumes = [
    'staging_uploads:/app/uploads',
    base + '/installed:/run/maya-native:ro',
    shared,
    root + '/native-ledger:/var/lib/maya-native',
  ];
  Object.assign(app, {
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    restart: 'no',
  });
  delete next.services['catalog-egress'];
  delete next.networks.catalog_private;
  next.services['native-forwarder'] = {
    image: pinned,
    pull_policy: 'never',
    entrypoint: ['node', '/app/scripts/phone-native-forwarder.mjs'],
    command: [],
    networks: ['edge'],
    environment: {
      MAYA_NATIVE_EXECUTION_ENABLED: 'signed-phone-test',
      MAYA_NATIVE_AUTHORIZATION_SHA256: installedDigests.authorization,
    },
    volumes: [base + '/forwarder-installed:/run/maya-native:ro', shared],
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    restart: 'no',
    mem_limit: '128m',
    pids_limit: 32,
    logging: {
      driver: 'local',
      options: { 'max-size': '1m', 'max-file': '1' },
    },
  };
  return {
    contract: 'maya.phone-native-packaging/1',
    candidateSha,
    imageDigest,
    runId,
    compose: next,
    preparationOnly: true,
    readyForExecution: false,
    authorityGranted: false,
    privateFiles: { backend: names, forwarder: ['authorization'] },
    invariants: {
      backendExternalNetwork: false,
      forwarderListeningPorts: 0,
      forwarderDatabaseAccess: false,
      samePinnedImage: true,
    },
    required: [
      'root-private 0700 directories and 0600 immutable files',
      'same authorization bytes in backend and forwarder locations',
      'fresh exact-candidate certificate and current platform session',
      'separate owner execution authorization',
      'actual Linux namespace bypass/revocation rehearsal before deployment',
    ],
    effects: 0,
  };
}
export function verifyNativeExecutionPackaging(plan, input) {
  assert.deepEqual(plan, nativeExecutionPackaging(input));
}
