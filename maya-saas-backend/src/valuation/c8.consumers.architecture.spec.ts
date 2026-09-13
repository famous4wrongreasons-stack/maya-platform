import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { C8Controller } from './c8.controller';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
const root = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
describe('C8 P06 release-discoverable consumer boundaries', () => {
  it('release invokes the finite live C8 guards at every existing cutover checkpoint', () => {
    const deploy = read('maya-saas-backend/deploy/vps/deploy.sh');
    expect(deploy).toContain('chapter8-consumers/verify-live.cjs');
    expect((deploy.match(/verify_live_relays \|\| fail/g) || []).length).toBe(
      3,
    );
  });
  it('HTTP/AI reads share one existing C8 reader, never expose a model-fit/export/activation writer', () => {
    const source = read('maya-saas-backend/src/valuation/c8.controller.ts');
    expect(source).toContain('@TenantScoped()');
    expect(source).toContain('@Roles(');
    for (const method of ['list', 'snapshot', 'readiness'] as const)
      expect(
        Reflect.getMetadata(METHOD_METADATA, C8Controller.prototype[method]),
      ).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, C8Controller)).toBe('analytics');
    expect(source).not.toMatch(
      /prisma|\.create\(|sendMessage|\/export|\/fit|\/activate/i,
    );
  });
  it('no legacy threshold/probability fallback in any approved numerical entrypoint', () => {
    const source = read(
      'maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts',
    );
    expect(source).not.toMatch(
      /clientLoyaltySegment|linear_daily_run_rate|projectedKopecks|row\.noShow >= 2/,
    );
    expect(source).toContain('this.valuationRead.forAi(');
    expect(
      read('maya-saas-backend/src/ai-tools/client-registry-analysis.ts'),
    ).not.toMatch(/LOYAL_VISIT_THRESHOLD|isLoyal|lifetimeSoldAmount/);
    const core = read('maya-saas-backend/src/ai-tools/ai-core.service.ts');
    expect(core).not.toContain('deterministicClientReactivationAdvice');
    expect(core).not.toContain('пилот не больше чем');
    const files = execFileSync(
      'rg',
      ['-l', 'computePeriodMoneyMotivation', 'src'],
      { cwd: path.join(root, 'maya-saas-backend'), encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((p) => !p.endsWith('.spec.ts'));
    expect(files).toEqual(['src/ai-tools/master-money-motivation.ts']);
  });
  it('Python actual entrypoints cannot restore local scoring, stale snapshots or automated advice', () => {
    const output = execFileSync(
      'python3',
      [
        path.join(
          root,
          'maya-saas-backend/deploy/platform/chapter8-consumers/verify-python.py',
        ),
        path.join(root, 'ai администратор'),
      ],
      { encoding: 'utf8' },
    );
    expect((JSON.parse(output) as { status: string }).status).toBe('PASS');
  });
  it('PWA numerical callers use the canonical read contract, preserve C7 and render missing data explicitly', () => {
    const output = execFileSync(
      process.execPath,
      [
        path.join(
          root,
          'maya-saas-backend/deploy/platform/chapter8-consumers/verify-pwa.cjs',
        ),
        path.join(root, 'сайт и приложение/app.html'),
      ],
      { encoding: 'utf8' },
    );
    expect((JSON.parse(output) as { c8: string }).c8).toBe('PASS');
    const panel = read(
      'maya-saas-backend/deploy/platform/chapter8-consumers/panel.js',
    );
    expect(panel).not.toMatch(
      /Math\.random|\/send|\/export|model\.fit|probability\s*=/,
    );
    expect(panel).toContain('Отправка сообщений здесь не выполняется');
  });
});
