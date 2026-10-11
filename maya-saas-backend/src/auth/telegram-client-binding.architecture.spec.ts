import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = join(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')
        ? [join(dir, e.name)]
        : [],
  );
const violations = (file: string, source: string) => {
  const failures: string[] = [];
  if (
    /\.bindTelegramLoginInTransaction\s*\(/.test(source) &&
    file !== 'auth/telegram-client-binding.service.ts'
  )
    failures.push('alternate initial-link coordinator');
  if (
    /TelegramClientBindingService/.test(source) &&
    ![
      'auth/auth.module.ts',
      'auth/social-auth.service.ts',
      'auth/telegram-client-binding.service.ts',
    ].includes(file)
  )
    failures.push('alternate login proof ingress');
  return failures;
};
describe('Telegram initial binding ownership', () => {
  it('has one server login ingress and keeps the existing single link writer', () => {
    expect(
      sources(root).flatMap((file) =>
        violations(relative(root, file), readFileSync(file, 'utf8')),
      ),
    ).toEqual([]);
    const coordinator = readFileSync(
      join(root, 'auth/telegram-client-binding.service.ts'),
      'utf8',
    );
    expect(coordinator).not.toMatch(
      /\.clientChannelLink\.(create|update|upsert|delete)/,
    );
    expect(coordinator).not.toMatch(/\.client\.(create|update|upsert|delete)/);
    expect(coordinator).not.toContain('phoneMatchKey');
    expect(coordinator).not.toContain('phoneHash');
    expect(coordinator).not.toMatch(
      /\.customerProfile\.(create|update|upsert)|\.clientConsentFact\.(create|update|upsert)/,
    );
  });
  it.each(['controller', 'ai-tool', 'helper'])(
    'rejects an alternate %s proof ingress',
    (file) => {
      expect(
        violations(
          `${file}.ts`,
          'inject(TelegramClientBindingService).afterLogin(body)',
        ),
      ).toHaveLength(1);
      expect(
        violations(
          `${file}.ts`,
          'links.bindTelegramLoginInTransaction(tx, body)',
        ),
      ).toHaveLength(1);
    },
  );
});
