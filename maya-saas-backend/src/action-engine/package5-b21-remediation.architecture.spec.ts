import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function pythonFunction(source: string, name: string) {
  const match = new RegExp(`(?:^|\\n)([ \\t]*)(?:async )?def ${name}\\(`).exec(
    source,
  );
  if (!match || match.index === undefined)
    throw new Error(`Missing production function ${name}`);
  const start = match.index + (match[0].startsWith('\n') ? 1 : 0);
  const tail = source.slice(start + 1);
  const next = tail.search(/\n(?:async )?def /);
  return source.slice(start, next >= 0 ? start + 1 + next : undefined);
}

describe('Package 5 B21 realtime identity and ephemeral context ratchets', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const bridge = read('ai администратор/realtime_bridge.py');

  it('does not emit ready before the canonical authority verdict', () => {
    const handler = pythonFunction(webhook, 'realtime_handler');
    expect(handler).toContain('p5_b21_verified_realtime_authority');
    expect(handler).toContain('"realtime-authority"');
    expect(handler).toContain('authority.get("ready") is not True');
    expect(
      handler.indexOf('client_command, "realtime-authority"'),
    ).toBeLessThan(handler.indexOf('"type": "ready"'));
    expect(handler).not.toMatch(
      /session_token|resolve_session|session_tg_user|has_valid_consent_by_chat_id|chat_id|database\.|_verify_telegram_/,
    );
  });

  it('keeps voice context inside one socket and never calls legacy history', () => {
    const session = pythonFunction(bridge, 'run_session');
    expect(session).toContain('history: list[dict] = []');
    expect(session).toContain('turn_lock = asyncio.Lock()');
    expect(session).toContain('history.clear()');
    expect(session).toContain('client_link_verified');
    expect(session).toContain('crm_staff_access_verified');
    expect(session).not.toMatch(
      /chat_id|load_conversations|save_conversations|memory\.|database\.|_resolve_role|ClientRealtimeConversation/,
    );
  });

  it('routes staff voice through canonical AI Core and clients through verified proof only', () => {
    const session = pythonFunction(bridge, 'run_session');
    expect(session).toContain('staff_ai_turn');
    expect(session).toContain(
      'ClientCommandContext(client_channel_proof, intent)',
    );
    expect(session).toContain('user_id=None');
    const transport = read('ai администратор/legacy_client_command_bridge.py');
    const staff = pythonFunction(transport, 'staff_ai_turn');
    expect(staff).toContain('/api/ai/chat');
    expect(staff).toContain('"audience": "staff"');
    expect(staff).toContain('parsed.get("type") != "maya_jwt"');
  });

  it('removes legacy realtime credentials from every active PWA source', () => {
    for (const file of [
      'maya-os-site/index.html',
      'сайт и приложение/app.html',
    ]) {
      const app = read(file);
      const start = app.indexOf('function rtAuthMsg()');
      const end = app.indexOf('function rtStop()', start);
      const auth = app.slice(start, end);
      expect(auth).toContain('meSaasCurrentBundle');
      expect(auth).toContain('m.maya_token = bundle.token');
      expect(auth).toContain('m.init_data');
      expect(auth).not.toMatch(/web_session_token|session_token|maya_auth/);
    }
  });

  it('keeps the active Python runtime ratchet green', () => {
    const pwa = resolve(root, 'ai администратор');
    const result = JSON.parse(
      execFileSync(
        'python3',
        [
          resolve(pwa, 'package5_control_plane_runtime_guard.py'),
          '--root',
          pwa,
          '--json',
        ],
        { encoding: 'utf8' },
      ),
    ) as Record<string, unknown>;
    expect(result).toMatchObject({
      pass: true,
      b21RealtimeLegacyIdentityOwners: 0,
      b21RealtimeLegacyHistoryWriters: 0,
      b21RealtimePreReadyBypasses: 0,
    });
  });
});
