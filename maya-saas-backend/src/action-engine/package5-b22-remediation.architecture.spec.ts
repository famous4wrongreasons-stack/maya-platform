import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Package 5 B22 tip self-report retirement', () => {
  it('proves forged, repeated and concurrent requests have no effect', () => {
    execFileSync(
      'python3',
      ['-m', 'unittest', 'test_package5_b22_tip_retirement'],
      {
        cwd: resolve(root, 'ai администратор'),
        stdio: 'pipe',
      },
    );
  });

  it.each([
    'maya-os-site/index.html',
    'сайт и приложение/app.html',
    'сайт и приложение/app-tenant.html',
  ])(
    '%s preserves the external URL without signal or fake success',
    async (file) => {
      const app = read(file);
      expect(app).not.toMatch(/action=tip_sent|Чаевые отправлены/);
      expect(app).toContain('p5_b22_external_payment_only');
      expect(app).toContain('/tips/pay/?master_tips_source=payed_from_pos_qr');
      const start = app.indexOf('  window.__tipsSend = function');
      const end = app.indexOf('  // ?tips=', start);
      const helper = app.slice(start, end);
      expect(helper).not.toMatch(
        /fetch\(|XMLHttpRequest|sendBeacon|localStorage/,
      );
      const opened: string[] = [];
      const open = (url: string) => {
        opened.push(url);
        return true;
      };
      const window = {
        __meBookMasters: [{ id: 17, name: 'Synthetic' }],
        __meTipsCompanyId: () => '23',
        __meExt: open,
        open,
      };
      const sandbox = {
        window,
        TIPS_STAFF: [17],
        TIPS_SLUG: ['synthetic'],
        alert: jest.fn(),
        meMasterExternalId: (m: { id: number }) => m?.id,
        meMasterMatches: (m: { id: number }, id: number) => m.id === id,
        meTipsPaymentURL: (company: string, staff: number) =>
          `https://yclients.com/companies/${company}/staff/${staff}/tips/pay/?master_tips_source=payed_from_pos_qr`,
        openTipsLink: async (url: string) => open(url),
        copyTipsLink: jest.fn(),
      };
      runInNewContext(helper, sandbox);
      const invoke = (
        window as unknown as { __tipsSend: (...args: unknown[]) => unknown }
      ).__tipsSend;
      await invoke(0, 999999, 'untrusted-note', 17);
      expect(opened).toEqual([
        `https://yclients.com/companies/${helper.includes('/companies/503759/') ? '503759' : '23'}/staff/17/tips/pay/?master_tips_source=payed_from_pos_qr`,
      ]);
    },
  );

  it('proxy retirement has no upstream request or input-based value', () => {
    const script = read('tools/package5/b22_surface_alignment.py');
    const proxy = script.slice(
      script.indexOf('PROXY_CASE ='),
      script.indexOf('def align_proxy'),
    );
    expect(proxy).toContain('http_response_code(410)');
    expect(proxy).toContain("'ok' => false");
    expect(proxy).not.toMatch(/curl_|\$input|\$payload/);
  });
});
