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

describe('Package 5 B16 booking prefill identity and PII remediation', () => {
  const webhook = read('ai администратор/webhook_server.py');

  it('requires the original verified channel and canonical booking projection', () => {
    const handler = pythonFunction(webhook, 'booking_prefill_handler');
    expect(handler).toContain('p5_b16_booking_prefill_read_only');
    expect(handler).toContain('client_commands.channel_proof');
    expect(handler).toContain('client_commands.command, "booking-prefill"');
    expect(handler).toContain('result.get("linked")');
    expect(handler).toContain('result.get("client_link_required")');
    expect(handler).not.toMatch(
      /_authed_chat_id|database\.(?:get_client|get_or_create_client|has_valid_consent_by_chat_id)/,
    );
  });

  it('accepts no caller-supplied Client, phone, or raw channel identity', () => {
    const handler = pythonFunction(webhook, 'booking_prefill_handler');
    expect(handler).toContain('set(body) - {"auth_data", "session_token"}');
    expect(handler).not.toMatch(
      /body\.get\(["'](?:clientId|client_id|phone|chat_id)["']\)/,
    );
  });

  it('keeps the canonical backend reader tenant-qualified and read-only', () => {
    const service = read(
      'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
    );
    const start = service.indexOf('async bookingPrefill(');
    const end = service.indexOf('/** B17 authenticated Client', start);
    const method = service.slice(start, end);
    expect(method).toBeDefined();
    expect(method).toContain(
      'providerSubjectHash: channel.providerSubjectHash',
    );
    expect(method).toContain('revokedAt: null');
    expect(method).toContain('id_tenantId');
    expect(method).toContain('privacyConsentAt');
    expect(method).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    );
  });

  it('forwards Maya bearer proof without making the proxy an identity owner', () => {
    const proxy = read('сайт и приложение/pwa-assets/tg-auth/api-proxy.php');
    const branch = proxy.match(
      /case 'booking_prefill':[\s\S]*?(?=\n\s*case ')/,
    )?.[0];
    expect(branch).toBeDefined();
    expect(branch).toContain('HTTP_X_TELEGRAM_INITDATA');
    expect(branch).toContain('HTTP_AUTHORIZATION');
    expect(branch).not.toMatch(
      /get_client|get_or_create_client|clientId|chat_id/,
    );
  });

  it('keeps the active B13-B16 runtime protection green', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = execFileSync('python3', [guard, '--root', pwa, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b16BookingPrefillLegacyIdentityOwners: 0,
    });
  });
});
