import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const pwa = readFileSync(
  resolve(__dirname, '../../../сайт и приложение/app.html'),
  'utf8',
);

const start = pwa.indexOf('window.__meTgLogin = function(){');
const end = pwa.indexOf('// ── 3. Сессия есть?', start);
const loginBridge = pwa.slice(start, end);

function executeLogin(saas: boolean, exposeCanonical = true) {
  const canonicalLogin = jest.fn();
  const legacyLogin = jest.fn();
  const stopLegacyLogin = jest.fn();
  const resetLocalLogin = jest.fn();
  const alert = jest.fn();
  const window = {
    __ME_SAAS_CTX: saas
      ? { api: 'https://mayaos.ru/api', slug: 'tenant-one', ns: 'tenant-one' }
      : null,
    __meStartSaasSocialLogin: exposeCanonical ? canonicalLogin : undefined,
  };

  runInNewContext(loginBridge, {
    window,
    __meNativeTgLogin: legacyLogin,
    __meStopAppLogin: stopLegacyLogin,
    __meResetLocalLoginState: resetLocalLogin,
    alert,
  });
  (window as typeof window & { __meTgLogin: () => void }).__meTgLogin();

  return {
    alert,
    canonicalLogin,
    legacyLogin,
    resetLocalLogin,
    stopLegacyLogin,
  };
}

describe('native owner Telegram login boundary', () => {
  it('routes a tenant-qualified MAYA login through canonical OAuth', () => {
    const result = executeLogin(true);

    expect(result.canonicalLogin).toHaveBeenCalledWith('telegram');
    expect(result.stopLegacyLogin).toHaveBeenCalledTimes(1);
    expect(result.resetLocalLogin).toHaveBeenCalledTimes(1);
    expect(result.legacyLogin).not.toHaveBeenCalled();
  });

  it('fails closed while the canonical OAuth bridge is still loading', () => {
    const result = executeLogin(true, false);

    expect(result.alert).toHaveBeenCalledTimes(1);
    expect(result.legacyLogin).not.toHaveBeenCalled();
  });

  it('keeps the compatibility handshake only outside a SaaS tenant context', () => {
    const result = executeLogin(false);

    expect(result.legacyLogin).toHaveBeenCalledTimes(1);
    expect(result.canonicalLogin).not.toHaveBeenCalled();
  });

  it('exposes the login-gate OAuth implementation to legacy shell controls', () => {
    expect(pwa).toContain('window.__meStartSaasSocialLogin = bridge;');
    expect(pwa).toContain('lgSocialLogin(provider);');
    expect(pwa).toContain("ctx.api + '/auth/oauth/' + provider + '/start'");
  });
});
