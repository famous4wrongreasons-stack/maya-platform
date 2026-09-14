import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(
  resolve(__dirname, '../../../сайт и приложение/app.html'),
  'utf8',
);
const commands = html.slice(
  html.indexOf('  function bcPersist('),
  html.indexOf(
    '  // Извлекает код сертификата',
    html.indexOf('  function bcPersist('),
  ),
);
function panel(storage: Map<string, string>) {
  const calls: Array<{ action: string; body: Record<string, string> }> = [];
  let response: unknown = {
    status: 200,
    body: {
      ok: true,
      campaignId: 'campaign-original',
      intentHash: 'reviewed',
      recipientCount: 2,
    },
  };
  const scope = {
    window: {
      __mayaBulkAuthReq: () => ({ bulkStorageKey: 'maya.b35.tenant.owner' }),
    },
    localStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    bcDraft: {
      current: storage.has('maya.b35.tenant.owner')
        ? (JSON.parse(storage.get('maya.b35.tenant.owner')!) as unknown)
        : null,
    },
    bcText: 'Approved template',
    crypto: { randomUUID: () => 'one-original-key' },
    setBcBusy: jest.fn(),
    setBcResult: jest.fn(),
    setBcText: jest.fn(),
    pfetch: (action: string, body: Record<string, string>) => {
      calls.push({ action, body });
      return Promise.resolve(response);
    },
  };
  const context = createContext(scope);
  runInContext(commands, context);
  return {
    scope,
    calls,
    response: (value: unknown) => {
      response = value;
    },
    execute: async (code: string) => {
      runInContext(code, context);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
describe('B35 panel durable intent', () => {
  it('repeated preview uses the original key; lost confirm response and browser restart resume the same approved graph', async () => {
    const storage = new Map<string, string>(),
      first = panel(storage);
    await first.execute('bcPreview()');
    await first.execute('bcPreview()');
    expect(first.calls.map((c) => c.body.bulkIdentity)).toEqual([
      'one-original-key',
      'one-original-key',
    ]);
    first.response({ status: 503, body: {} });
    await first.execute('bcSend()');
    expect(first.calls[2].body).toEqual({
      mode: 'confirm',
      campaignId: 'campaign-original',
      intentHash: 'reviewed',
    });
    const restarted = panel(storage);
    restarted.response({
      status: 200,
      body: { ok: true, state: 'UNRESOLVED', recipients: [] },
    });
    await restarted.execute('bcSend()');
    expect(restarted.calls).toEqual([
      {
        action: 'panel_broadcast',
        body: {
          mode: 'resume',
          campaignId: 'campaign-original',
          intentHash: 'reviewed',
        },
      },
    ]);
    await restarted.execute("bcEdit('Changed after approval')");
    expect(restarted.scope.setBcText).not.toHaveBeenCalled();
  });
  it('a failed durable save cannot send a confirmation', async () => {
    const f = panel(new Map());
    await f.execute('bcPreview()');
    f.scope.localStorage.setItem = () => {
      throw new Error('storage unavailable');
    };
    await f.execute('bcSend()');
    expect(f.calls).toHaveLength(1);
  });
});
