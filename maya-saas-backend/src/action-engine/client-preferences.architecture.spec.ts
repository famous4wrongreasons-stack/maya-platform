import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import {
  CLIENT_PREFERENCE_CAPABILITIES,
  clientPreferenceCapabilities,
  notificationOverrides,
  verifiedClientChannelCapability,
} from './client-preferences.contract';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const pyFunction = (source: string, name: string) => {
  const found = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!found) throw new Error(`Missing function ${name}`);
  return found[0];
};
const pythonBypass =
  /get_or_create_client|(?:INSERT(?:\s+OR\s+REPLACE)?\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?(?:notify_prefs|visit_mood)|UPDATE\s+["']?clients\s+SET\s+default_visit_mood|(?:database\.)?(?:set_visit_mood|set_notify_prefs)\s*\(|append_record_comment|set_record_notify_by_sms|(?:requests|_yc|yc)\.(?:put|_put)\s*\(/i;
function assertInitiator(source: string) {
  if (
    pythonBypass.test(source) ||
    !source.includes('channel_proof') ||
    !source.includes('command,')
  )
    throw new Error('Preference production bypass');
}
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(dir, entry.name))
      : [resolve(dir, entry.name)],
  );
}
describe('Package 5 B5/B6 canonical production boundary', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const database = read('ai администратор/database.py');
  const executor = read(
    'maya-saas-backend/src/crm/client-preferences.service.ts',
  );
  it('allows exactly the approved Client capabilities without extending arbitrary channel authority', () => {
    for (const value of Object.values(CLIENT_PREFERENCE_CAPABILITIES))
      expect(verifiedClientChannelCapability(value)).toBe(true);
    for (const value of [
      'package5.client-preferences.admin.execute.v1',
      'package5.client-preferences.visit-mood.execute.v2',
      'crm.appointment.fields.v1',
    ])
      expect(verifiedClientChannelCapability(value)).toBe(false);
    expect(clientPreferenceCapabilities().map((row) => row.targetKind)).toEqual(
      ['client_visit_preference', 'client_notification_preferences'],
    );
  });
  it('retains verified identity and canonical command at both HTTP endpoints', () => {
    assertInitiator(pyFunction(webhook, 'set_visit_mood_handler'));
    assertInitiator(pyFunction(webhook, 'notify_prefs_handler'));
    expect(pyFunction(webhook, 'set_visit_mood_handler')).not.toMatch(
      /get_record\s*\(|_panel_auth\s*\(|get_client\s*\(|phone\s*=/,
    );
    expect(pyFunction(webhook, 'notify_prefs_handler')).not.toContain(
      '_authed_chat_id',
    );
  });
  it.each([
    'database.get_or_create_client(chat_id)',
    'conn.execute("UPDATE clients SET default_visit_mood = ?")',
    'conn.execute("INSERT OR REPLACE INTO notify_prefs VALUES (?)")',
    'conn.execute("INSERT INTO visit_mood VALUES (?)")',
    'database.set_visit_mood(record_id, mood)',
    '_yc.append_record_comment(record_id, mood)',
    '_yc._put(record_id, payload)',
    'requests.put(url, json=payload)',
  ])('fails injected hidden writer: %s', (mutation) =>
    expect(() =>
      assertInitiator(
        pyFunction(webhook, 'set_visit_mood_handler') + '\n' + mutation,
      ),
    ).toThrow(),
  );
  it('closes legacy SQL writers and makes all preference/mood readers pure projections', () => {
    for (const name of ['set_visit_mood', 'set_notify_prefs']) {
      const source = pyFunction(database, name);
      expect(source).toContain(
        'raise RuntimeError("canonical_verified_client_preference_command_required")',
      );
      expect(source).not.toMatch(/\.execute\(|INSERT|UPDATE/);
    }
    for (const name of [
      'get_notify_prefs',
      'get_notify_prefs_by_chat_id',
      'get_visit_mood',
      'get_visit_moods',
      'get_default_visit_mood',
    ]) {
      const source = pyFunction(database, name);
      expect(source).toContain('legacy_client_preferences_bridge');
      expect(source).not.toMatch(
        /\.execute\(|CREATE TABLE|INSERT|UPDATE|set_notify_prefs|get_or_create/,
      );
    }
    expect(pyFunction(webhook, '_apply_client_reminder_pref')).not.toMatch(
      /_yc|database\.|set_record_notify/,
    );
    expect(
      pyFunction(
        read('ai администратор/bot.py'),
        '_handle_visit_mood_callback',
      ),
    ).not.toMatch(pythonBypass);
  });
  it('keeps one new slot writer, atomic engine outcome and no provider dependency', () => {
    const writers = files(resolve(root, 'maya-saas-backend/src'))
      .filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))
      .filter((p) => {
        const source = readFileSync(p, 'utf8');
        return (
          /(?:defaultVisitMood|clientVisitMood|notificationPreferencesJson)\s*:/.test(
            source,
          ) &&
          /\.(?:customerProfile|appointment)\.(?:update|create|upsert)\(/.test(
            source,
          )
        );
      })
      .map((p) => relative(root, p));
    expect(writers).toEqual([
      'maya-saas-backend/src/crm/client-preferences.service.ts',
    ]);
    expect(executor).toContain('this.ingress.createExecution(request)');
    expect(executor).toContain('this.kernel.readTrustedNormalizedInput');
    expect(executor).toContain('tx.actionTargetMutation.create');
    expect(executor).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(executor).not.toMatch(
      /CrmService|\.client\.create\(|ClientConsentFact\.create|\.put\(|notifyBySms/,
    );
  });
  it('rejects unapproved JSON and never supplies a hidden reminder-hours default', () => {
    for (const value of [
      { reminder_hours: 0 },
      { reminder_hours: 49 },
      { reminder_hours: '2' },
      { privacy: true },
      { reminder: 1 },
      { quiet_from: 22 },
    ])
      expect(() => notificationOverrides(value)).toThrow();
    expect(notificationOverrides({ reminder: false })).toEqual({
      reminder: false,
    });
    expect(notificationOverrides({ reminder_hours: 48 })).toEqual({
      reminder_hours: 48,
    });
    expect(executor).not.toMatch(/reminder_hours\s*(?:\|\||\?\?|:)\s*3/);
    expect(executor).toContain('consentFromPreferences: false');
  });
});
