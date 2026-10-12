// Executable synthetic child for the actual retained launcher/IPC/pipe lifecycle.
// No DB or real HTTP provider. Refuses any non-fixture credential before use.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readPartnerPipe } from './local-credential-pipe.mjs';
import { installLocalPartnerCredential } from './local-owner-keychain.mjs';
import { readOwnerChatLaunch } from './local-owner-chat-launch.mjs';

const require = createRequire(import.meta.url);
assert.ok(process.connected);
const [file, pin] = process.argv.slice(2);
const launch = readOwnerChatLaunch(file, pin);
assert.equal(
  launch.manifest.admissionContext.credentialSource.storageApprovalRef,
  'SYNTHETIC_MEMORY_ONLY_NOT_REAL_STORAGE',
);
assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
assert.equal(process.env.DEEPSEEK_API_KEY, undefined);
let partner = await readPartnerPipe();
assert.equal(partner, 'SYNTHETIC_PARTNER_KEY_ONLY');
const { CrmAdapterFactory } = require('../dist/src/crm/crm-adapter.factory.js');
const factory = new CrmAdapterFactory();
const clear = installLocalPartnerCredential(
  factory,
  partner,
  launch.assertCurrent,
);
partner = undefined;
factory.onModuleInit();
let calls = 0;
globalThis.fetch = async (url, init) => {
  launch.assertCurrent();
  assert.equal(String(url), 'https://api.yclients.com/api/v1/companies?my=1');
  assert.equal(
    new Headers(init.headers).get('Authorization'),
    'Bearer SYNTHETIC_PARTNER_KEY_ONLY, User SYNTHETIC_USER_ONLY',
  );
  calls++;
  return new Response(JSON.stringify({ success: true, data: [] }), {
    status: 200,
  });
};
await factory
  .create('yclients', {
    provider: 'yclients',
    apiToken: 'SYNTHETIC_USER_ONLY',
    settings: {},
  })
  .discoverCompanies();
assert.equal(calls, 1);
assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
assert.equal(process.env.DEEPSEEK_API_KEY, undefined);
const keep = setInterval(() => {}, 1000);
process.once('SIGTERM', () => {
  clear();
  assert.throws(() =>
    factory.create('yclients', {
      provider: 'yclients',
      apiToken: 'SYNTHETIC_USER_ONLY',
      settings: {},
    }),
  );
  clearInterval(keep);
  process.send(
    {
      type: 'read-summary',
      contract: 'maya.local-yclients-read/1',
      calls: 0,
      refused: 0,
      routes: {},
    },
    () => process.disconnect(),
  );
});
process.send({
  type: 'ready',
  contract: 'maya.local-yclients-read/1',
  origin: `http://127.0.0.1:${process.env.PORT}`,
  providerAdmission: 'explicit_setup_reads_only',
});
