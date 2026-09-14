import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
const pwa = readFileSync(
  resolve(__dirname, '../../../сайт и приложение/app.html'),
  'utf8',
);
const code = pwa.slice(
  pwa.indexOf('function meMayaConsentPendingKey()'),
  pwa.indexOf('function AMayaConsent()'),
);
function browser(storage = new Map<string, string>()) {
  const state = { ns: 'tenant-api', userId: 'account' };
  let tail = Promise.resolve();
  const localStorage = {
    getItem: jest.fn((key: string) => storage.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      storage.delete(key);
    }),
  };
  const sandbox = {
    window: { __ME_SAAS_CTX: state, crypto: webcrypto },
    meSaasCurrentBundle: () => ({ user: { id: state.userId } }),
    localStorage,
    navigator: {
      locks: {
        request: (_key: string, work: () => unknown) => {
          const result = tail.then(work);
          tail = result.then(
            () => undefined,
            () => undefined,
          );
          return result;
        },
      },
    },
  };
  const api = runInNewContext(
    code +
      '; ({ transition: meMayaConsentTransition, pendingKey: meMayaConsentPendingKey })',
    sandbox,
  ) as {
    transition: (
      decisions: object,
      send: (v: Record<string, unknown>) => Promise<unknown>,
    ) => Promise<unknown>;
    pendingKey: () => string;
  };
  return { ...api, state, localStorage, storage };
}
const choice = { privacy: true, marketing: true };
describe('supported native/PWA durable consent transition', () => {
  it('persists before effects and restores the exact event after process restart/lost response', async () => {
    const first = browser();
    let original: Record<string, unknown> | undefined;
    await expect(
      first.transition(choice, (command) => {
        original = command;
        expect(first.storage.size).toBe(1);
        return Promise.reject(new Error('response lost'));
      }),
    ).rejects.toThrow('response lost');
    const restarted = browser(first.storage);
    await restarted.transition(choice, (command) => {
      expect(JSON.stringify(command)).toBe(JSON.stringify(original));
      return Promise.resolve({ accepted: true });
    });
    expect(first.storage.size).toBe(0);
    await restarted.transition(choice, (command) => {
      expect(command.idempotencyKey).not.toBe(original!.idempotencyKey);
      return Promise.resolve({});
    });
  });
  it('does not reinterpret an unresolved event with a changed choice', async () => {
    const b = browser(),
      send = jest.fn().mockRejectedValue(new Error('unknown'));
    await expect(b.transition(choice, send)).rejects.toThrow();
    send.mockClear();
    await expect(
      b.transition({ privacy: true, marketing: false }, send),
    ).rejects.toThrow('прежним выбором');
    expect(send).not.toHaveBeenCalled();
    expect(b.storage.size).toBe(1);
  });
  it('isolates account/tenant retry storage and never treats it as Client authority', async () => {
    const b = browser();
    await expect(
      b.transition(choice, () => Promise.reject(new Error('unknown'))),
    ).rejects.toThrow();
    const oldKey = b.pendingKey();
    b.state.userId = 'other-account';
    expect(b.pendingKey()).not.toBe(oldKey);
    await b.transition(choice, () => Promise.resolve({}));
    expect(b.storage.has(oldKey)).toBe(true);
    b.state.ns = 'other-tenant';
    expect(b.pendingKey()).not.toBe(oldKey);
  });
  it('fails before effects if durable storage is unavailable', async () => {
    const b = browser(),
      send = jest.fn();
    b.localStorage.setItem.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    await expect(b.transition(choice, send)).rejects.toThrow(
      'storage unavailable',
    );
    expect(send).not.toHaveBeenCalled();
  });
  it('concurrent submissions share the pending event and immutable decisions', async () => {
    const b = browser();
    const seen: unknown[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((done) => {
      release = done;
    });
    const send = async (command: Record<string, unknown>) => {
      seen.push(command.idempotencyKey);
      if (seen.length === 2) release();
      await barrier;
      return {};
    };
    await Promise.all([b.transition(choice, send), b.transition(choice, send)]);
    expect(new Set(seen).size).toBe(1);
    expect(b.storage.size).toBe(0);
  });
});
