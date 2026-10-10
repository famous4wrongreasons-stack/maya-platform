// Regression for metadata injected by macOS into the actual launcher child.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIVATE_KEYS, profileEnvironment, assertProfileEnvironment } from './local-onboarding-profile.mjs';
const options = {
  databaseUrl: `postgresql://maya_local_onboarding:${'f'.repeat(64)}@127.0.0.1:55431/maya_local_onboarding_0123456789abcdef`,
  keys: Object.fromEntries(PRIVATE_KEYS.map((key, index) => [key, (index + 1).toString(16).padStart(64, '0')])),
  apiPort: 55432, origin: 'http://127.0.0.1:55433', stateDirectory: '/private/tmp/local-onboarding-unit-only',
};
test('macOS injected encoding metadata has a finite exception, not general environment inheritance', () => {
  const env = profileEnvironment({ __CF_USER_TEXT_ENCODING: 'inherited-value-is-discarded' }, options);
  assert.equal(Object.hasOwn(env, '__CF_USER_TEXT_ENCODING'), false);
  const validate = () => assertProfileEnvironment({ ...env, __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0' });
  if (process.platform === 'darwin') assert.doesNotThrow(validate); else assert.throws(validate);
  for (const value of ['', '1:2', '1:2:3:4', '1:2:loader', '1'.repeat(65), null])
    assert.throws(() => assertProfileEnvironment({ ...env, __CF_USER_TEXT_ENCODING: value }));
  for (const key of ['OPENAI_API_KEY', 'YCLIENTS_PARTNER_TOKEN', 'HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS', '__CF_UNAPPROVED'])
    assert.throws(() => assertProfileEnvironment({ ...env, [key]: 'forbidden' }));
});
