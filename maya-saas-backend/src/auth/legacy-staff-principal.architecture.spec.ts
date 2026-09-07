import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(__dirname, '../../..');
const python = resolve(root, 'ai администратор');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('R02 permanent canonical staff authority boundaries', () => {
  it('executes native/session/middleware ratchets and negative authorization proof', () => {
    const result = execFileSync(
      'python3',
      [
        '-m',
        'unittest',
        'test_package5_wave_ra_r02',
        'test_package5_b13_control_plane_boundaries',
      ],
      {
        cwd: python,
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      },
    );
    expect(result).toBe('');
  });

  it('keeps the canonical adapter protected and read-only under existing AC3/A16', () => {
    const source = read(
      'maya-saas-backend/src/auth/legacy-staff-principal.controller.ts',
    );
    expect(source).not.toMatch(
      /@Public|\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany|\$executeRaw)\s*\(/,
    );
    expect(source).toContain('@Roles(...STAFF_ROLES, UserRole.PLATFORM_OWNER)');
    expect(source).toContain('this.bridge.assertBridgeIntegrationBinding');
    expect(source).toContain('this.bridge.resolveTenantByIntegration');
    expect(source).toContain('tx.authSession.findUnique');
    expect(source).toContain('tx.membership.findUnique');
    expect(source).toContain('tx.crmStaffAccess.findUnique');
    expect(source).toContain('tx.authIdentity.findMany');
    const module = read('maya-saas-backend/src/auth/auth.module.ts');
    expect(module).toContain(
      'controllers: [AuthController, LegacyStaffPrincipalController]',
    );
  });

  it('carries the same canonical account through PWA panel and staff chat even inside Telegram', () => {
    const source = read('сайт и приложение/app.html');
    const panel = source.slice(
      source.indexOf('  function authReq(extra)'),
      source.indexOf('  // exposed so staff screens'),
    );
    const chat = source.slice(
      source.indexOf('function authPayload(base)'),
      source.indexOf('function meChatDelStoreKey'),
    );
    const runtime = {
      canonicalMayaTok: () => 'canonical-jwt',
      meSaasCurrentBundle: () => ({ token: 'canonical-jwt' }),
      tgInitData: () => 'raw-channel',
      tgAuth: () => ({ id: 999 }),
      webTok: () => 'legacy-session',
      window: {
        __meCurMode: 'staff',
        Telegram: { WebApp: { initData: 'raw-channel' } },
      },
    };
    const first = runInNewContext(`(${panel})({scope:'panel'})`, runtime) as {
      headers: Record<string, string>;
      body: string;
    };
    const second = runInNewContext(`(${chat})({})`, runtime) as {
      headers: Record<string, string>;
      payload: Record<string, string>;
    };
    expect(first.headers.Authorization).toBe('Bearer canonical-jwt');
    expect(JSON.parse(first.body)).toEqual({
      scope: 'panel',
      maya_token: 'canonical-jwt',
    });
    expect(second.headers.Authorization).toBe('Bearer canonical-jwt');
    expect(second.payload).toEqual({
      mode: 'staff',
      maya_token: 'canonical-jwt',
    });
  });

  it('ratchets every internal PHP target and forbids provider credential forwarding', () => {
    const overlay = resolve(
      root,
      'maya-saas-backend/deploy/platform/beget-edge/r02/canonical-staff-overlay.cjs',
    );
    const probe = String.raw`
      const {php, verifyPhpSource} = require(process.argv[1]);
      const internal = "$ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/me');";
      const external = "$ch = curl_init('https://provider.invalid/book');";
      const source = '<?php\n' + Array(36).fill(internal).join('\n') + '\n' + external;
      const patched = php(source);
      if(verifyPhpSource(patched.source)!==36) throw Error('missing targets');
      for(const broken of [patched.source.replace('$payload = maya_r02_staff_payload($payload, $input);\n',''), patched.source.replace(external, '$payload = maya_r02_staff_payload($payload, $input);\n'+external)]) {
        let rejected=false;try{verifyPhpSource(broken)}catch{rejected=true}
        if(!rejected) throw Error('ratchet bypass');
      }
      process.stdout.write(JSON.stringify({pass:true,internalTargets:36,providerTargets:0}));
    `;
    const result = execFileSync(process.execPath, ['-e', probe, overlay], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toEqual({
      pass: true,
      internalTargets: 36,
      providerTargets: 0,
    });
  });
});
