import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const pwa = resolve(root, 'ai администратор');
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

describe('Package 5 B20 cabinet identity, PII and read-only remediation', () => {
  const webhook = read('ai администратор/webhook_server.py');

  it('routes all three cabinet endpoints through one verified projection boundary', () => {
    for (const name of [
      'cabinet_me_handler',
      'cabinet_me_via_login_handler',
      'cabinet_me_via_session_handler',
    ]) {
      const handler = pythonFunction(webhook, name);
      expect(handler).toContain('_build_full_cabinet(request');
      expect(handler).not.toMatch(
        /database\.|_authed_chat_id|resolve_session|session_tg_user|int\(chat_id\)|body\.get\(["'](?:chat_id|phone|clientId)["']\)/,
      );
    }
    const helper = pythonFunction(webhook, '_build_full_cabinet');
    expect(helper).toContain('p5_b20_verified_client_cabinet_read_only');
    expect(helper).toContain('client_commands.channel_proof');
    expect(helper).toContain('client_commands.command, "cabinet-projection"');
    expect(helper).not.toMatch(
      /database\.|_yc\.|get_or_create|set_client_history_cache|lazy_backfill|save_conversations|memory\./,
    );
  });

  it('keeps the backend projection tenant-qualified and free of writes', () => {
    const service = read(
      'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
    );
    const start = service.indexOf('async cabinetProjection(');
    const end = service.indexOf('/** B19 authenticated Client', start);
    const method = service.slice(start, end);
    expect(method).toContain(
      'providerSubjectHash: channel.providerSubjectHash',
    );
    expect(method).toContain('revokedAt: null');
    expect(method).toContain('id_tenantId');
    expect(method).toContain('mayaClientId: client.id');
    expect(method).toContain('privacyConsentAt');
    expect(method).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    );
  });

  it('prefers a canonical Maya JWT for the session route in the active PWA', () => {
    const app = read('сайт и приложение/app.html');
    const start = app.indexOf('function fetchCabinet()');
    const end = app.indexOf('/* ---- formatting helpers', start);
    const fetcher = app.slice(start, end);
    expect(fetcher).toContain('canonicalMayaTok()');
    expect(fetcher).toContain("Authorization: 'Bearer ' + mayaTok");
    expect(fetcher.indexOf('canonicalMayaTok()')).toBeLessThan(
      fetcher.indexOf('var tok = webTok()'),
    );
  });

  it('keeps the active runtime ratchet green for all B20 paths', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = JSON.parse(
      execFileSync('python3', [guard, '--root', pwa, '--json'], {
        encoding: 'utf8',
      }),
    ) as Record<string, unknown>;
    expect(result).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b20CabinetLegacyIdentityOwners: 0,
      b20CabinetReadSurfaceWriters: 0,
      b20CabinetEndpointIdentityParity: true,
      b20CabinetEndpointReadOnlyParity: true,
    });
  });
});
