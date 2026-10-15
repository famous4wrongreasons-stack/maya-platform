import assert from 'node:assert/strict';
import { PHONE_APP_CANDIDATE } from './phone-ai-plan.mjs';
export const PHONE_TELEGRAM_FILES = Object.freeze([
  'phone-telegram-scope.mjs',
  'phone-telegram-runtime.mjs',
  'phone-telegram-egress.mjs',
  'phone-telegram-entry.mjs',
  'phone-telegram-bootstrap.mjs',
]);
export function phoneTelegramPlan(previous, pin) {
  assert.match(pin, /^[a-f0-9]{64}$/);
  assert.equal(previous.name, 'maya-phone-staging');
  const root = '/srv/maya-phone-staging',
    base = root + '/preparation/telegram-20261015';
  const backend = previous.services.backend;
  assert.equal(backend.image, 'maya-phone-backend:' + PHONE_APP_CANDIDATE);
  assert.equal(backend.environment.MAYA_RELEASE, PHONE_APP_CANDIDATE);
  assert.deepEqual(backend.entrypoint, [
    'node',
    '/app/scripts/phone-ai-entry.mjs',
  ]);
  assert.deepEqual(backend.networks, [
    'private',
    'catalog_private',
    'model_private',
  ]);
  for (const n of backend.networks)
    assert.equal(previous.networks[n].internal, true);
  assert.ok(
    previous.services['model-egress'] && previous.services['catalog-egress'],
  );
  assert.ok(
    !previous.services['telegram-egress'] &&
      !previous.networks.telegram_private,
  );
  assert.equal(backend.restart, 'no');
  const common = [
    root + '/private/phone-telegram-admission:/run/maya-telegram-admission:ro',
    root + '/private/phone-telegram-ledger:/var/lib/maya-telegram',
    ...PHONE_TELEGRAM_FILES.map(
      (f) => base + '/' + f + ':/app/scripts/' + f + ':ro',
    ),
  ];
  const next = structuredClone(previous);
  Object.assign(next.services.backend, {
    entrypoint: ['node', '/app/scripts/phone-telegram-entry.mjs'],
    command: [],
    environment: {
      ...backend.environment,
      MAYA_PHONE_TELEGRAM_SCOPE_SHA256: pin,
    },
    networks: [...backend.networks, 'telegram_private'],
    volumes: [...backend.volumes, ...common],
  });
  next.services['telegram-egress'] = {
    image: backend.image,
    pull_policy: 'never',
    entrypoint: ['node', '/app/scripts/phone-telegram-egress.mjs'],
    command: [],
    restart: 'no',
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    mem_limit: '96m',
    memswap_limit: '96m',
    cpus: 0.15,
    pids_limit: 32,
    networks: ['telegram_private', 'edge'],
    environment: { MAYA_PHONE_TELEGRAM_SCOPE_SHA256: pin },
    volumes: [
      ...common,
      root + '/private/phone-telegram-secret:/run/maya-telegram-secret',
    ],
    logging: {
      driver: 'local',
      options: { 'max-size': '1m', 'max-file': '2' },
    },
  };
  next.networks.telegram_private = { driver: 'bridge', internal: true };
  for (const name of Object.keys(previous.services))
    if (name !== 'backend')
      assert.deepEqual(next.services[name], previous.services[name]);
  assert.deepEqual(next.volumes, previous.volumes);
  return next;
}
