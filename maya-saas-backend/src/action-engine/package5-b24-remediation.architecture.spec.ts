import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { scanClientWebPushSource } from '../communication-delivery/client-web-push.architecture';
import { normalizeClientWebPushDelivery } from '../communication-delivery/communication-web-push.contract';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? files(resolve(dir, item.name))
      : [resolve(dir, item.name)],
  );
}

describe('Package 5 B24 verified Web Push ownership', () => {
  it('production writes and transport are confined to approved owners; negative mutations fail', () => {
    const src = resolve(root, 'maya-saas-backend/src');
    for (const file of files(src).filter((f) => f.endsWith('.ts'))) {
      expect(
        scanClientWebPushSource(
          relative(src, file),
          readFileSync(file, 'utf8'),
        ),
      ).toEqual([]);
    }
    expect(
      scanClientWebPushSource(
        'ai-tools/bypass.ts',
        'webPush.sendNotification(value)',
      ),
    ).not.toEqual([]);
    expect(
      scanClientWebPushSource(
        'crm/controller.ts',
        'this.prisma.clientWebPushEndpoint.create({ data })',
      ),
    ).not.toEqual([]);
    const registry = read(
      'maya-saas-backend/src/crm/client-web-push.service.ts',
    );
    expect(
      scanClientWebPushSource(
        'crm/client-web-push.service.ts',
        registry.replaceAll('this.identity(tx, proof)', 'forgedIdentity'),
      ),
    ).not.toEqual([]);
    const policy = read('maya-saas-backend/src/crm/client-web-push.policy.ts');
    expect(policy).toContain('maxActive: 5');
    expect(policy).toContain('maxFanOut: 5');
    const migration = read(
      'maya-saas-backend/prisma/migrations/20260906120000_client_web_push_endpoint_v1/migration.sql',
    );
    expect(migration).toContain('CLIENT_WEB_PUSH_LIMIT_EXCEEDED');
    expect(migration).not.toMatch(/INSERT INTO/);
  });
  it('active Python routes, retired senders and proxy ratchets reject legacy authority', () => {
    execFileSync('python3', ['-m', 'unittest', 'test_package5_b24_web_push'], {
      cwd: resolve(root, 'ai администратор'),
      stdio: 'pipe',
    });
    const source = read('tools/package5/b24_surface_alignment.py');
    expect(source).toContain("case 'push_unsubscribe':");
    expect(source).toContain("'Authorization: ' . $push_auth");
    expect(source).not.toContain("'role' =>");
  });
  it('single Client fan-out rejects sixth/duplicate endpoints and untrusted fields', () => {
    const input = {
      channel: 'web_push',
      messageType: 'appointment_reminder',
      clientId: 'client',
      endpointIds: ['one'],
      sourceEventId: 'event',
      title: 'title',
      bodyText: 'body',
      expiresAt: new Date().toISOString(),
    };
    expect(normalizeClientWebPushDelivery(input)).toEqual(input);
    for (const change of [
      { endpointIds: ['one', 'one'] },
      { endpointIds: ['1', '2', '3', '4', '5', '6'] },
      { endpoint: 'secret' },
      { channel: 'telegram' },
    ])
      expect(() =>
        normalizeClientWebPushDelivery({ ...input, ...change }),
      ).toThrow();
  });
  it.each(['сайт и приложение/app.html', 'maya-os-site/index.html'])(
    '%s displays confirmed registration, handles limit and preserves explicit unsubscribe',
    async (file) => {
      const source = read(file);
      for (const block of source.matchAll(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      ))
        if (
          !/\bsrc\s*=|application\/(?:ld\+)?json|type=["']module/.test(block[1])
        )
          expect(() => new Script(block[2])).not.toThrow();
      expect(source.match(/e\(AWebPushControls, \{ colors:/g)).toHaveLength(2);
      const start = source.indexOf('  // p5_b24_verified_web_push_v1:');
      const end = source.indexOf('  var __mePushTries', start);
      const saved = new Map<string, string>();
      let response: Record<string, unknown> = {
        ok: false,
        error: 'CLIENT_WEB_PUSH_LIMIT_EXCEEDED',
      };
      let httpOk = false;
      const fetch = jest.fn(() =>
        Promise.resolve({ ok: httpOk, json: () => Promise.resolve(response) }),
      );
      const unsubscribe = jest.fn(() => Promise.resolve(true));
      const sub = {
        toJSON: () => ({ endpoint: 'synthetic-secret' }),
        unsubscribe,
      };
      const window: Record<string, unknown> = {
        PushManager: {},
        dispatchEvent: jest.fn(),
        __meAuthReq: (data: unknown) => ({
          headers: {},
          body: JSON.stringify(data),
        }),
      };
      runInNewContext(source.slice(start, end), {
        window,
        fetch,
        localStorage: {
          getItem: (k: string) => saved.get(k),
          setItem: (k: string, v: string) => saved.set(k, v),
          removeItem: (k: string) => saved.delete(k),
        },
        Notification: { permission: 'granted' },
        navigator: {
          serviceWorker: {
            ready: Promise.resolve({
              pushManager: { getSubscription: () => Promise.resolve(sub) },
            }),
          },
        },
        __meRegisterPushWorker: () => Promise.resolve(),
        CustomEvent: class {
          constructor(
            readonly type: string,
            readonly detail: unknown,
          ) {}
        },
      });
      const subscribe = window.__meSubscribePush as (
        manual?: boolean,
      ) => Promise<Record<string, unknown>>;
      expect((await subscribe(true)).ok).toBe(false);
      expect(saved.size).toBe(0);
      httpOk = true;
      response = { ok: true, endpointId: 'opaque', status: 'ACTIVE' };
      expect((await subscribe(true)).status).toBe('ACTIVE');
      expect([...saved.values()]).toEqual(['opaque']);
      response = { ok: true, endpointId: 'opaque', status: 'INACTIVE' };
      await (window.__meUnsubscribePush as () => Promise<unknown>)();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      const before = fetch.mock.calls.length;
      expect((await subscribe()).status).toBe('INACTIVE');
      expect(fetch).toHaveBeenCalledTimes(before);
    },
  );
});
