import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const pwa = resolve(root, 'ai администратор');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function pythonFunction(source: string, name: string) {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!match) throw new Error(`Missing production function ${name}`);
  return match[0];
}

describe('Package 5 B15 chat history read-only remediation', () => {
  const webhook = read('ai администратор/webhook_server.py');

  it('requires the verified Client channel status before client history', () => {
    const history = pythonFunction(webhook, 'chat_history_handler');
    expect(history).toContain('p5_b15_chat_history_read_only');
    expect(history).toContain('client_commands.channel_proof');
    expect(history).toContain('client_commands.command, "status"');
    expect(history).toContain('status.get("linked")');
    expect(history).toContain('status.get("client_link_required")');
    expect(history).not.toMatch(
      /database\.(?:get_client|get_or_create_client|has_valid_consent_by_chat_id)/,
    );
  });

  it('projects history without offer, communication, or historical writeback', () => {
    const history = pythonFunction(webhook, 'chat_history_handler');
    expect(history).toContain('load_conversations');
    expect(history).toContain('_chat_history_payload');
    expect(history).not.toMatch(
      /save_conversations|_ensure_chat_history_ids|_store_assistant_message_in_chat|_ensure_client_(?:loyalty|repeat_booking)_chat_offer/,
    );
  });

  it('retires the two legacy history-read recommendation hooks', () => {
    for (const name of [
      '_ensure_client_loyalty_chat_offer',
      '_ensure_client_repeat_booking_offer',
    ]) {
      const hook = pythonFunction(webhook, name);
      expect(hook).toContain('Retired B15 hook');
      expect(hook).toContain('return False');
      expect(hook).not.toMatch(
        /database\.|memory\.|_yc\.|_store_assistant_message_in_chat/,
      );
    }
  });

  it('uses a stable response-only ID for legacy messages', () => {
    const projection = pythonFunction(webhook, '_chat_history_payload');
    expect(projection).toContain('offset + i');
    expect(projection).not.toMatch(/save_conversations|_new_chat_message_id/);
  });

  it('keeps every marked read surface under the active runtime ratchet', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = execFileSync('python3', [guard, '--root', pwa, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b15ChatHistoryReadOwners: 0,
    });
  });
});
