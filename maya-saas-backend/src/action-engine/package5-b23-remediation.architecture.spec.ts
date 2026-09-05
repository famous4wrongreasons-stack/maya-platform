import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext, Script } from 'node:vm';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Package 5 B23 unsupported server history deletion', () => {
  it('proves uniform inert responses, unchanged history/evidence, and bypass ratchets', () => {
    execFileSync(
      'python3',
      ['-m', 'unittest', 'test_package5_b23_history_delete_retirement'],
      { cwd: resolve(root, 'ai администратор'), stdio: 'pipe' },
    );
  });

  it.each(['maya-os-site/index.html', 'сайт и приложение/app.html'])(
    '%s never calls server delete or optimistically hides unsupported history',
    async (file) => {
      const source = read(file);
      expect(source).not.toMatch(/action=chat_delete\b|\/api\/chat\/delete/);
      expect(source).toContain('p5_b23_server_history_delete_retired');
      expect(source).toContain(
        'const canClearChat = !!window.__ME_SAAS_CTX &&',
      );
      expect(source).toContain(
        'const canDeleteMsg = canHideLocalChatMessage(m) &&',
      );
      const start = source.indexOf('  function canHideLocalChatMessage');
      const end = source.indexOf('  function clearLongPress()', start);
      const functions = source.slice(start, end);
      expect(functions).not.toMatch(
        /fetch\(|authPayload|applyServerChatMessages/,
      );
      expect(functions).toContain('История на сервере сохранится.');
      const effects = jest.fn(() => {
        throw new Error('Unsupported request touched UI/cache/history');
      });
      const context = {
        window: {},
        setMsgs: effects,
        markMsgDeleted: effects,
        chatHistoryStorage: effects,
        meConfirmDialog: effects,
        protectLocalChat: effects,
        fetch: effects,
        authPayload: effects,
      };
      const invoke = runInNewContext(
        `${functions}\n({ deleteChatMessage, clearMayaChat })`,
        context,
      ) as {
        deleteChatMessage: (m: unknown, i: number) => Promise<unknown>;
        clearMayaChat: () => Promise<unknown>;
      };
      const results = await Promise.all(
        Array.from({ length: 10 }, async () => [
          await invoke.deleteChatMessage(
            { id: 'forged', text: 'synthetic' },
            0,
          ),
          await invoke.deleteChatMessage(null, 0),
          await invoke.clearMayaChat(),
        ]),
      );
      for (const result of results.flat()) {
        expect(result).toEqual({ ok: false, error: 'FEATURE_NOT_AVAILABLE' });
      }
      expect(effects).not.toHaveBeenCalled();
      // Each inline script must remain syntactically valid after the bundled patch.
      for (const match of source.matchAll(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      )) {
        if (
          /\bsrc\s*=|application\/(?:ld\+)?json|type=["']module/.test(match[1])
        ) {
          continue;
        }
        expect(() => new Script(match[2])).not.toThrow();
      }
    },
  );

  it('proxy outcome has no identity lookup, upstream call or disclosure', () => {
    const source = read('tools/package5/b23_surface_alignment.py');
    const start = source.indexOf('PROXY_CASE =');
    const proxy = source.slice(start, source.indexOf('def align_proxy', start));
    expect(proxy).toContain('http_response_code(410)');
    expect(proxy).toContain(
      "['ok' => false, 'error' => 'FEATURE_NOT_AVAILABLE']",
    );
    expect(proxy).not.toMatch(
      /curl_|\$input|\$payload|\$_SERVER|messages|phone/,
    );
  });
});
