import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
const root = resolve(__dirname, '../../..');
const pwa = readFileSync(resolve(root, 'сайт и приложение/app.html'), 'utf8');
const legacy = readFileSync(
  resolve(__dirname, 'fixtures/native-consent-build9-submit.js'),
  'utf8',
);
const helpers = pwa.slice(
  pwa.indexOf('function meMayaConsentPendingKey()'),
  pwa.indexOf('function AMayaConsent()'),
);
function browser(storage = new Map<string, string>()) {
  const ctx = { ns: 'tenant-one' };
  const bundle = { user: { id: 'account-one' } };
  const sandbox = {
    window: { __ME_SAAS_CTX: ctx, crypto: webcrypto },
    meSaasCurrentBundle: () => bundle,
    localStorage: {
      getItem: (k: string) => storage.get(k) || null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
    navigator: {
      locks: {
        request: (_k: string, f: () => unknown) => Promise.resolve().then(f),
      },
    },
  };
  const api = runInNewContext(
    helpers + ';({transition:meMayaConsentTransition})',
    sandbox,
  ) as {
    transition: (
      v: { privacy: boolean; marketing: boolean },
      send: (v: Record<string, unknown>) => Promise<unknown>,
    ) => Promise<unknown>;
  };
  return { ...api, storage, ctx, bundle };
}
describe('native release consent compatibility regression', () => {
  it('reproduces the exact signed build-9 transport payload missing transition identity', () => {
    const fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'invalid_client_command' }),
    });
    const noop = () => undefined;
    runInNewContext(legacy + ';submit();', {
      status: 'need_pdn',
      pdn: true,
      mkt: false,
      setErr: noop,
      setBusy: noop,
      setShow: noop,
      CONSENT_PROXY: 'https://synthetic.invalid/api-proxy.php',
      fetch,
      window: {
        __meAuthReq: (body: unknown) => ({
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://synthetic.invalid/api-proxy.php?action=consent_submit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept_pdn: true, accept_marketing: false }),
      },
    );
    const php = readFileSync(
      resolve(
        root,
        'maya-saas-backend/deploy/vps/package5-client-consent-proxy.php',
      ),
      'utf8',
    );
    expect(
      php.indexOf("is_string($input['idempotency_key'] ?? null)"),
    ).toBeLessThan(php.indexOf('curl_init('));
    expect(php).toContain(
      'http_response_code(400); echo \'{"error":"invalid_client_command"}\'',
    );
  });
  it.each([false, true])(
    'preserves separate privacy and marketing=%s choices with durable identity',
    async (marketing) => {
      const b = browser(),
        send = jest
          .fn<Promise<unknown>, [Record<string, unknown>]>()
          .mockResolvedValue({ privacy: 'accepted', marketing: 'accepted' });
      await b.transition({ privacy: true, marketing }, send);
      expect(send.mock.calls[0][0].idempotencyKey).toMatch(
        /^native-consent:[a-f0-9]{36}$/,
      );
      expect(send.mock.calls[0][0]).toEqual({
        privacy: true,
        marketing,
        idempotencyKey: send.mock.calls[0][0].idempotencyKey,
      });
    },
  );
  it('replays an interrupted second grant after revoke with its own durable identity', async () => {
    const b = browser();
    const keys: string[] = [];
    for (const decision of [true, false])
      await b.transition({ privacy: decision, marketing: decision }, (v) => {
        keys.push(String(v.idempotencyKey));
        return Promise.resolve();
      });
    let second = '';
    await expect(
      b.transition({ privacy: true, marketing: true }, (v) => {
        second = String(v.idempotencyKey);
        return Promise.reject(Error('lost response'));
      }),
    ).rejects.toThrow();
    await browser(b.storage).transition(
      { privacy: true, marketing: true },
      (v) => {
        expect(v.idempotencyKey).toBe(second);
        keys.push(String(v.idempotencyKey));
        return Promise.resolve();
      },
    );
    expect(new Set(keys).size).toBe(3);
  });
  it('still rejects a keyless updated endpoint before authentication/Client/effects', async () => {
    const channels = { authenticate: jest.fn() };
    const context = { requireTenantId: jest.fn() };
    const runtime = Object.assign(
      Object.create(ClientChannelRuntimeService.prototype) as object,
      { channels, context },
    ) as unknown as ClientChannelRuntimeService;
    await expect(
      runtime.submitConsent('synthetic-proof', {
        privacy: true,
        marketing: false,
      }),
    ).rejects.toThrow(
      'Only consent decisions and command identity are accepted',
    );
    expect(channels.authenticate).not.toHaveBeenCalled();
    expect(context.requireTenantId).not.toHaveBeenCalled();
  });
  it('uses canonical effective status instead of profile row existence to decide whether to show consent', () => {
    const a = pwa.indexOf('function AMayaConsent()'),
      b = pwa.indexOf('window.AMayaConsent', a),
      code = pwa.slice(a, b);
    expect(code).toContain('status.linked===true');
    expect(code).toContain('status.marketing_decided!==true');
    expect(code).not.toContain('profile_linked');
    expect(code).not.toContain('/customers/me/profile');
    expect(code).toContain("type:'checkbox'");
    expect(code).toContain('disabled:busy||!pdn');
    expect(code).not.toMatch(
      /disabled:.*!mkt|clientId|client_id|chat_id|phone/,
    );
  });
});
