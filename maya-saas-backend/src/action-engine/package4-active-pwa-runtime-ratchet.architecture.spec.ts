import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPOSITORY_ROOT = join(__dirname, '..', '..', '..');
const PWA_ROOT = join(REPOSITORY_ROOT, 'ai администратор');
const GUARD = join(PWA_ROOT, 'package4_value_runtime_guard.py');
const REGRESSION = join(PWA_ROOT, 'test_package4_value_runtime_guard.py');

describe('Package 4 active PWA runtime protection', () => {
  it('includes the active PWA in Package 4 final protection', () => {
    const result = spawnSync('python3', [GUARD, '--root', PWA_ROOT, '--json'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      pass: boolean;
      activePwaIncludedInPackage4FinalProtection: boolean;
      package4GuardsApplyToLaterPackageChanges: boolean;
      findings: unknown[];
    };
    expect(payload).toEqual(
      expect.objectContaining({
        pass: true,
        activePwaIncludedInPackage4FinalProtection: true,
        package4GuardsApplyToLaterPackageChanges: true,
        findings: [],
      }),
    );
  });

  it('rejects synthetic loyalty, gift-certificate, and refund bypasses', () => {
    const result = spawnSync('python3', ['-m', 'unittest', REGRESSION], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Ran 5 tests');
    expect(result.stderr).toContain('OK');
  });
});
