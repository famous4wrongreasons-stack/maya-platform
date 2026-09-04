import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import {
  clientHabitsCapability,
  CLIENT_HABITS_CAPABILITY,
} from './client-habits.contract';
import { verifiedClientChannelCapability } from './client-preferences.contract';
const root = resolve(__dirname, '../../..');
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');
function fn(source: string, name: string) {
  const found = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!found) throw new Error('Missing function ' + name);
  return found[0];
}
const legacyWrite =
  /get_or_create_client|(?:database\.)?(?:add_client_preference|update_client|verify_phone_login|_issue_session)\s*\(|(?:INSERT\s+(?:OR\s+REPLACE\s+)?INTO|UPDATE|DELETE\s+FROM)\s+["']?clients\b|\.execute\s*\(/i;
function initiator(source: string) {
  if (legacyWrite.test(source)) throw new Error('B7/B8 legacy mutation bypass');
}
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? files(resolve(dir, x.name)) : [resolve(dir, x.name)],
  );
}
describe('Final Package 5 B7/B8 canonical authority protection', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const database = read('ai администратор/database.py');
  const bridge = read('ai администратор/legacy_client_habits_bridge.py');
  const executor = read('maya-saas-backend/src/crm/client-habits.service.ts');
  it('allows only exact versioned B7 capability for a verified Client channel', () => {
    expect(verifiedClientChannelCapability(CLIENT_HABITS_CAPABILITY)).toBe(
      true,
    );
    for (const c of [
      'package5.client-habits.add.execute.v2',
      'package5.client-habits.admin.execute.v1',
    ])
      expect(verifiedClientChannelCapability(c)).toBe(false);
    expect(clientHabitsCapability().actionClass).toBe('add_client_habit');
    expect(clientHabitsCapability().allowedSourceTypes).toEqual([
      'authenticated_request',
    ]);
  });
  it('keeps exactly one canonical encrypted habit slot writer', () => {
    const writers = files(resolve(root, 'maya-saas-backend/src'))
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))
      .filter((p) => {
        const source = readFileSync(p, 'utf8');
        return (
          /encryptedClientPreferences\s*:/.test(source) &&
          /\.customerProfile\.(?:create|update|upsert)\(/.test(source)
        );
      })
      .map((p) => relative(root, p));
    expect(writers).toEqual([
      'maya-saas-backend/src/crm/client-habits.service.ts',
    ]);
    for (const marker of [
      'this.ingress.createExecution(request)',
      'this.kernel.readTrustedNormalizedInput',
      'tx.actionTargetMutation.create',
      'Prisma.TransactionIsolationLevel.Serializable',
      'this.links.assertClientEligible',
      'lockClientChannelIdentity',
      'this.encryption.opaqueReference',
      'serializeClientHabits(after)',
      'validateClientHabitsCiphertext(ciphertext)',
    ])
      expect(executor).toContain(marker);
    expect(executor).not.toMatch(
      /\.client\.(?:create|update|upsert|delete)\(|encryptedNotes\s*:|CrmService|\.put\(/,
    );
  });
  it('closes legacy habit writer and phone reader without hidden repair', () => {
    expect(fn(database, 'add_client_preference')).toContain(
      'raise RuntimeError',
    );
    expect(fn(database, 'add_client_preference')).not.toMatch(
      /\.execute\(|get_or_create_client/,
    );
    expect(fn(database, 'get_client_preferences')).toContain(
      'read_preferences',
    );
    expect(fn(database, 'get_client_preferences_by_phone')).toContain(
      'return ""',
    );
    const ai = read('ai администратор/claude_ai.py');
    expect(ai).not.toMatch(
      /database\.(?:add_client_preference|get_client_preferences_by_phone)\(/,
    );
    expect(ai).toContain('@authenticated_call');
    expect(ai).toContain('@authenticated_stream');
    expect(ai).toContain(
      'remember_preference(anonymizer.redact_pii(preference))',
    );
  });
  it('requires original request proof outside model inputs and stable retry intent', () => {
    expect(bridge).toContain('contextvars.ContextVar');
    expect(bridge).toContain('context.proof');
    expect(bridge).toContain('context.intent');
    expect(bridge).not.toMatch(
      /get_or_create_client|sqlite|\[:(?:200|500|800)\]|\.pop\(0\)/,
    );
    for (const name of ['chat_handler', 'chat_stream_handler'])
      expect(fn(webhook, name)).toContain(
        '_client_command_context=request_context(',
      );
    expect(read('ai администратор/realtime_bridge.py')).toContain(
      '_client_command_context=client_context',
    );
  });
  it('makes phone endpoint linking-only and SMS helper evidence-only', () => {
    const source = fn(webhook, 'cabinet_link_phone_handler');
    initiator(source);
    expect(source).toContain('channel_proof');
    expect(source).toContain('verify_phone_evidence');
    expect(source).toContain('"binding"');
    expect(source).toContain('"phone_saved": False');
    expect(source).not.toContain('_authed_chat_id');
    initiator(
      fn(read('ai администратор/web_auth.py'), 'verify_phone_evidence'),
    );
  });
  it.each([
    'database.get_or_create_client(chat_id)',
    'database.update_client(client_id, phone=phone)',
    'database.add_client_preference(chat_id, pref)',
    'conn.execute("UPDATE clients SET preferences=?")',
    'verify_phone_login(phone, code)',
    '_issue_session(phone=phone)',
    'conn.execute("INSERT INTO clients VALUES (?)")',
  ])('detects restored bypass %s', (mutation) => {
    expect(() =>
      initiator(fn(webhook, 'cabinet_link_phone_handler') + '\n' + mutation),
    ).toThrow();
  });
  it('preserves linking token and channel headers in strict PHP transport', () => {
    const proxy = read(
      'maya-saas-backend/deploy/vps/package5-client-consent-proxy.php',
    );
    expect(proxy).toContain(
      "'cabinet_link_phone' => ['/api/cabinet/link-phone'",
    );
    expect(proxy).toContain("'linking_token'");
    expect(proxy).toContain('array_diff(array_keys($input), $allowed)');
    expect(proxy).toContain("'HTTP_AUTHORIZATION' => 'Authorization'");
  });
});
